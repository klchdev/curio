import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import {
  getReviewCorpus,
  getRecommendationCandidates,
  getAbandonedGames,
  createRecommendationRun,
  updateRunProgress,
  completeRecommendationRun,
  failRecommendationRun,
  hasActiveRun,
} from "../../lib/queries";
import { generateRecommendations, RECOMMENDATION_MODEL } from "../../lib/recommendations";
import { GEMINI_API_KEY } from "astro:env/server";
import { THRESHOLDS } from "../../lib/vocab";

/** Прогресс в БД пишем не чаще, чем раз в столько мс. */
const PROGRESS_THROTTLE_MS = 1500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Генерация идёт до минуты и дольше, поэтому крутится в фоне: роут только
 * заводит прогон и сразу отдаёт его id, клиент опрашивает статус.
 */
async function runInBackground(runId: number, userId: number) {
  try {
    const [reviews, candidates, abandonedGames] = await Promise.all([
      getReviewCorpus(userId),
      getRecommendationCandidates(userId),
      getAbandonedGames(userId),
    ]);

    await updateRunProgress(runId, { stage: "thinking" });

    let lastWrite = 0;
    const result = await generateRecommendations(
      reviews,
      candidates,
      abandonedGames,
      GEMINI_API_KEY,
      (picksReady) => {
        const now = Date.now();
        if (now - lastWrite < PROGRESS_THROTTLE_MS) return;
        lastWrite = now;
        updateRunProgress(runId, { picksReady }).catch(() => {});
      }
    );

    await updateRunProgress(runId, { stage: "saving" });

    const byAppId = new Map(
      [...candidates, ...abandonedGames].map((g) => [g.steamAppId, g.gameId])
    );

    await completeRecommendationRun(runId, {
      profile: result.profile,
      reviewsUsed: reviews.length,
      candidatesUsed: candidates.length,
      items: result.picks.map((pick) => ({
        gameId: byAppId.get(pick.steamAppId)!,
        tier: pick.tier,
        reason: pick.reason,
      })),
      abandoned: result.abandoned.map((item) => ({
        gameId: byAppId.get(item.steamAppId)!,
        stance: item.stance,
        text: item.text,
      })),
    });
  } catch (err) {
    console.error("[recommendations]", err);
    const message = err instanceof Error ? err.message : "Не удалось получить рекомендации";
    await failRecommendationRun(runId, message).catch(() => {});
  }
}

export const POST: APIRoute = async ({ cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  if (await hasActiveRun(userId)) {
    return json({ error: "Генерация уже идёт" }, 409);
  }

  const [reviewCount, candidateCount] = await Promise.all([
    getReviewCorpus(userId).then((r) => r.length),
    getRecommendationCandidates(userId).then((c) => c.length),
  ]);

  if (reviewCount < THRESHOLDS.MIN_REVIEWS_FOR_AI) {
    return json({ error: `Нужно минимум ${THRESHOLDS.MIN_REVIEWS_FOR_AI} отзывов, сейчас ${reviewCount}` }, 400);
  }
  if (candidateCount === 0) {
    return json({ error: "Нет непройденных игр в библиотеке" }, 400);
  }

  const runId = await createRecommendationRun(userId, RECOMMENDATION_MODEL);

  // Намеренно не ждём: ответ уходит сразу, работа продолжается в процессе.
  void runInBackground(runId, userId);

  return json({ ok: true, runId });
};
