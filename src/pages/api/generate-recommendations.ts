import type { APIRoute } from "astro";
import {
  getReviewCorpus,
  getRecommendationCandidates,
  saveRecommendationRun,
} from "../../lib/queries";
import { generateRecommendations, RECOMMENDATION_MODEL } from "../../lib/recommendations";
import { GEMINI_API_KEY } from "astro:env/server";

const MIN_REVIEWS = 5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const [reviews, candidates] = await Promise.all([
    getReviewCorpus(userId),
    getRecommendationCandidates(userId),
  ]);

  if (reviews.length < MIN_REVIEWS) {
    return json(
      { error: `Нужно минимум ${MIN_REVIEWS} отзывов, сейчас ${reviews.length}` },
      400
    );
  }
  if (candidates.length === 0) {
    return json({ error: "Нет непройденных игр в библиотеке" }, 400);
  }

  try {
    const result = await generateRecommendations(reviews, candidates, GEMINI_API_KEY);

    const byAppId = new Map(candidates.map((c) => [c.steamAppId, c.gameId]));
    const items = result.picks.map((pick) => ({
      gameId: byAppId.get(pick.steamAppId)!,
      tier: pick.tier,
      reason: pick.reason,
    }));

    await saveRecommendationRun(userId, {
      model: RECOMMENDATION_MODEL,
      profile: result.profile,
      reviewsUsed: reviews.length,
      candidatesUsed: candidates.length,
      items,
    });

    return json({ ok: true, count: items.length });
  } catch (err) {
    console.error("[recommendations]", err);
    const message = err instanceof Error ? err.message : "Не удалось получить рекомендации";
    return json({ error: message }, 502);
  }
};
