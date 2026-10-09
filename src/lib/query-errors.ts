import type { Dict } from "./strings";
import { adapterFor, LlmAuthError, type ProviderId } from "./llm";

/**
 * The data layer has no request locale, so it names the failure instead of
 * wording it — the route holds the locale and does the wording.
 *
 * The two cases that quote a number carry it along: a code alone would drop
 * the only part of the message that tells the person how far off they are.
 */
export type QueryError =
  | { code: "slotsFull" }
  | { code: "gameNotOwned" }
  | { code: "contractExists" }
  | { code: "recordNotFound" }
  | { code: "noVerdict" }
  | { code: "badRating" }
  | { code: "noContract" }
  | { code: "contractNotFound" }
  | { code: "noGame" }
  | { code: "saveFailed" }
  | { code: "noteEmpty" }
  | { code: "noteTooShort"; min: number }
  | { code: "notEnoughPlaytime"; need: number; played: number };

export type QueryErrorCode = QueryError["code"];

/** The single crossing from a code to something a person can read. */
export function errorText(s: Dict, error: QueryError): string {
  switch (error.code) {
    case "slotsFull":
      return s.errors.slotsFull;
    case "gameNotOwned":
      return s.errors.gameNotOwned;
    case "contractExists":
      return s.errors.contractExists;
    case "recordNotFound":
      return s.errors.recordNotFound;
    case "noVerdict":
      return s.errors.noVerdict;
    case "badRating":
      return s.errors.badRating;
    case "noContract":
      return s.errors.noContract;
    case "contractNotFound":
      return s.errors.contractNotFound;
    case "noGame":
      return s.errors.noGame;
    case "saveFailed":
      return s.errors.saveFailed;
    case "noteEmpty":
      return s.errors.noteEmpty;
    case "noteTooShort":
      return s.errors.noteTooShort(error.min);
    case "notEnoughPlaytime":
      return s.errors.notEnoughPlaytime(error.need, error.played);
  }
}

/**
 * A model call that failed, worded for the person. The SDK's own message
 * carries the provider's raw JSON — a wall of text on screen — so the known
 * kinds of failure get human wording and the rest falls back to a generic line.
 */
export function modelErrorText(s: Dict, err: unknown, provider: ProviderId): string {
  if (err instanceof LlmAuthError) return s.llm.errorAuth;
  const kind = adapterFor(provider).classifyError(err).kind;
  if (kind === "no_credit") return s.errors.modelNoCredit;
  if (kind === "daily_quota") return s.errors.modelQuotaDay;
  if (kind === "rate_limit") return s.errors.modelQuota;
  if (kind === "overloaded" || kind === "server") return s.errors.modelBusy;
  return s.errors.runFailedFallback;
}
