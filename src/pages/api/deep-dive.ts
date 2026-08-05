import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import { games, deepDives } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { getAppReviews } from "../../lib/steam";
import { generateDeepDive } from "../../lib/deep-dive";
import { getReviewCorpus } from "../../lib/queries";
import { errorCode } from "../../lib/recommendations";
import { GEMINI_API_KEY } from "astro:env/server";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Разбор одной игры по требованию. Синхронно: это один запрос к модели на
 * одну игру, секунды — фоновая машинерия прогона тут была бы дороже самой
 * работы.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));
  const { gameId, refresh } = await request.json();
  if (!Number.isInteger(gameId)) return json({ error: s.errors.noGame }, 400);

  const game = await db
    .select({
      id: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      genres: games.genres,
      description: games.shortDescription,
      releaseDate: games.releaseDate,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!game) return json({ error: s.errors.gameNotFound }, 404);

  const cached = await db
    .select()
    .from(deepDives)
    .where(and(eq(deepDives.userId, userId), eq(deepDives.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (cached && !refresh) {
    return json({
      fit: cached.fit,
      tier: cached.tier,
      summary: cached.summary,
      forYou: cached.forYou,
      against: cached.against,
      complaints: cached.complaints ? cached.complaints.split("\n") : [],
      cached: true,
    });
  }

  try {
    const [reviews, corpus] = await Promise.all([
      getAppReviews(game.steamAppId),
      getReviewCorpus(userId),
    ]);

    const dive = await generateDeepDive(
      {
        title: game.title,
        genres: game.genres,
        releaseDate: game.releaseDate,
        description: game.description,
        reviews,
        corpus,
      },
      GEMINI_API_KEY,
      localeFrom(cookies, request)
    );

    await db
      .insert(deepDives)
      .values({
        userId,
        gameId,
        fit: dive.fit,
        tier: dive.tier,
        summary: dive.summary,
        forYou: dive.forYou,
        against: dive.against,
        complaints: dive.complaints.join("\n"),
        reviewsUsed: reviews?.reviews.length ?? 0,
      })
      .onConflictDoUpdate({
        target: [deepDives.userId, deepDives.gameId],
        set: {
          fit: dive.fit,
          tier: dive.tier,
          summary: dive.summary,
          forYou: dive.forYou,
          against: dive.against,
          complaints: dive.complaints.join("\n"),
          reviewsUsed: reviews?.reviews.length ?? 0,
          createdAt: new Date(),
        },
      });

    return json({ ...dive, reviewsUsed: reviews?.reviews.length ?? 0, cached: false });
  } catch (err) {
    console.error("[deep-dive]", err);
    const code = errorCode(err);
    const message =
      code === 429
        ? s.errors.modelQuota
        : code === 500 || code === 503 || code === 504
          ? s.errors.modelBusy
          : s.errors.runFailedFallback;
    return json({ error: message }, 502);
  }
};
