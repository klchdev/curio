import type { Dict } from "./strings";

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
    case "noteTooShort":
      return s.errors.noteTooShort(error.min);
    case "notEnoughPlaytime":
      return s.errors.notEnoughPlaytime(error.need, error.played);
  }
}
