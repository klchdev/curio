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
  getRatedGames,
} from "../../lib/queries";
import { generateRecommendations } from "../../lib/recommendations";
import { recommendByRules, RULES_MODEL } from "../../lib/taste-rules";
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
      : kind === "no_credit"
        ? s.modelNoCredit
        : kind === "daily_quota"
          ? s.modelQuotaDay
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

/**
 * The keyless path. Same inputs, same stored shape, no network: the whole run
 * is one pass over the library, so it is awaited rather than pushed into the
 * background.
 */
async function runByRules(runId: number, userId: number, locale: Locale) {
  try {
    const [rated, candidates] = await Promise.all([
      getRatedGames(userId),
      getRecommendationCandidates(userId),
    ]);

    const result = recommendByRules(rated, candidates, locale);
    const byAppId = new Map(candidates.map((game) => [game.steamAppId, game.gameId]));

    await completeRecommendationRun(runId, {
      profile: result.profile,
      reviewsUsed: rated.length,
      candidatesUsed: candidates.length,
      items: result.picks.map((pick) => ({
        gameId: byAppId.get(pick.steamAppId)!,
        tier: pick.tier,
        reason: pick.reason,
        grounding: pick.grounding,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t(locale).errors.generic;
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
   * A missing key is not a failure but an unfilled setting — and no longer a
   * dead end either: without one the picks are worked out from genres and the
   * player's own tiers instead. Worse advice than a model gives, and labelled
   * as such, but the person gets to see what this app is for before going off
   * to fetch a key for it.
   */
  const creds = await getLlmCredentials(userId);

  const [reviewCount, candidateCount] = await Promise.all([
    getReviewCorpusSize(userId),
    getRecommendationCandidates(userId).then((c) => c.length),
  ]);

  if (reviewCount < THRESHOLDS.MIN_REVIEWS_TO_RUN) {
    return json({ error: s.errors.needReviews(THRESHOLDS.MIN_REVIEWS_TO_RUN, reviewCount) }, 400);
  }
  if (candidateCount === 0) {
    return json({ error: s.errors.noCandidates }, 400);
  }

  // The run stores what it was actually computed with — a model, or the rules
  const runId = await createRecommendationRun(userId, creds ? creds.model : RULES_MODEL);

  /*
   * The rules take milliseconds, so they finish inside the request: a progress
   * screen for work that is already done would be theatre. The client still
   * gets a run id and still polls once — the same path as after a model run,
   * only it finds the run finished on the first ask.
   */
  if (!creds) {
    await runByRules(runId, userId, locale);
    return json({ ok: true, runId });
  }

  // Deliberately not awaited: the response goes out at once, the work keeps going.
  void runInBackground(runId, userId, locale, creds);

  return json({ ok: true, runId });
};
