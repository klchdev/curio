import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import {
  getReviewCorpus,
  getRecommendationCandidates,
  getReviewCorpusSize,
  createRecommendationRun,
  updateRunProgress,
  completeRecommendationRun,
  failRecommendationRun,
  hasActiveRun,
  getTasteProfile,
} from "../../lib/queries";
import { generateRecommendations } from "../../lib/recommendations";
import { adapterFor, LlmAuthError, type LlmCredentials } from "../../lib/llm";
import { getLlmCredentials } from "../../lib/llm/credentials";
import { THRESHOLDS } from "../../lib/vocab";
import { localeFrom, type Locale } from "../../lib/i18n";
import { t } from "../../lib/strings";

/** Progress is written to the database no more often than once per this many ms. */
const PROGRESS_THROTTLE_MS = 1500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Generation takes up to a minute and more, so it runs in the background: the
 * route only starts a run and returns its id immediately, and the client polls
 * for status.
 */
async function runInBackground(
  runId: number,
  userId: number,
  locale: Locale,
  creds: LlmCredentials
) {
  try {
    const [reviews, candidates, profile] = await Promise.all([
      getReviewCorpus(userId),
      getRecommendationCandidates(userId),
      getTasteProfile(userId),
    ]);

    await updateRunProgress(runId, { stage: "thinking" });

    let lastWrite = 0;
    const result = await generateRecommendations(
      reviews,
      candidates,
      profile,
      creds,
      locale,
      (picksReady) => {
        const now = Date.now();
        if (now - lastWrite < PROGRESS_THROTTLE_MS) return;
        lastWrite = now;
        updateRunProgress(runId, { picksReady }).catch(() => {});
      }
    );

    await updateRunProgress(runId, { stage: "saving" });

    const byAppId = new Map(candidates.map((g) => [g.steamAppId, g.gameId]));

    await completeRecommendationRun(runId, {
      profile: result.profile,
      reviewsUsed: reviews.length,
      candidatesUsed: candidates.length,
      items: result.picks.map((pick) => ({
        gameId: byAppId.get(pick.steamAppId)!,
        tier: pick.tier,
        reason: pick.reason,
        grounding: pick.grounding,
      })),
    });
  } catch (err) {
    console.error("[recommendations]", err);
    /*
     * The SDK's message carries the provider's raw JSON — useless to the user
     * and a wall of text on screen. Known kinds of failure are turned into
     * human wording, the rest is passed through as is: our own errors (empty
     * response, invalid JSON) are already written in words.
     */
    const s = t(locale).errors;
    const kind = adapterFor(creds.provider).classifyError(err).kind;
    const message = err instanceof LlmAuthError
      ? t(locale).llm.errorAuth
      : kind === "rate_limit"
        ? s.modelQuota
        : kind === "overloaded" || kind === "server"
          ? s.modelBusy
          : err instanceof Error && !err.message.trim().startsWith("{")
            ? err.message
            : s.runFailedFallback;
    await failRecommendationRun(runId, message).catch(() => {});
  }
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const locale = localeFrom(cookies, request);
  const s = t(locale);

  if (await hasActiveRun(userId)) {
    return json({ error: s.errors.runInProgress }, 409);
  }

  /*
   * Everyone brings their own key, and a missing one is not a failure but an
   * unfilled setting. A separate code so the interface points at settings
   * instead of showing "something went wrong".
   */
  const creds = await getLlmCredentials(userId);
  if (!creds) return json({ error: "no_llm_key" }, 400);

  const [reviewCount, candidateCount] = await Promise.all([
    getReviewCorpusSize(userId),
    getRecommendationCandidates(userId).then((c) => c.length),
  ]);

  if (reviewCount < THRESHOLDS.MIN_REVIEWS_FOR_AI) {
    return json({ error: s.errors.needReviews(THRESHOLDS.MIN_REVIEWS_FOR_AI, reviewCount) }, 400);
  }
  if (candidateCount === 0) {
    return json({ error: s.errors.noCandidates }, 400);
  }

  // The run stores the model it was actually computed with
  const runId = await createRecommendationRun(userId, creds.model);

  // Deliberately not awaited: the response goes out at once, the work keeps going.
  void runInBackground(runId, userId, locale, creds);

  return json({ ok: true, runId });
};
