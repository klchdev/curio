import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import { games, deepDives } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { getAppReviews } from "../../lib/steam";
import { generateDeepDive } from "../../lib/deep-dive";
import { getReviewCorpus, getFirstPassPick, getTasteProfile } from "../../lib/queries";
import { adapterFor, LlmAuthError } from "../../lib/llm";
import { getLlmCredentials } from "../../lib/llm/credentials";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * An on-demand analysis of a single game. Synchronous: this is one model
 * request for one game, a matter of seconds — the background machinery of a
 * run would cost more here than the work itself.
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

  /*
   * We check the key only after the cache: an analysis that already exists is
   * readable without one — it has been paid for and is sitting in the database.
   */
  const creds = await getLlmCredentials(userId);
  if (!creds) return json({ error: "no_llm_key" }, 400);

  try {
    const [reviews, corpus, firstPass, profile] = await Promise.all([
      getAppReviews(game.steamAppId),
      getReviewCorpus(userId),
      getFirstPassPick(userId, gameId),
      getTasteProfile(userId),
    ]);

    const dive = await generateDeepDive(
      {
        title: game.title,
        genres: game.genres,
        releaseDate: game.releaseDate,
        description: game.description,
        reviews,
        corpus,
        profile,
        firstPass,
      },
      creds,
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
    const kind = adapterFor(creds.provider).classifyError(err).kind;
    const message = err instanceof LlmAuthError
      ? s.llm.errorAuth
      : kind === "no_credit"
        ? s.errors.modelNoCredit
        : kind === "rate_limit"
          ? s.errors.modelQuota
          : kind === "overloaded" || kind === "server"
            ? s.errors.modelBusy
            : s.errors.runFailedFallback;
    return json({ error: message }, 502);
  }
};
