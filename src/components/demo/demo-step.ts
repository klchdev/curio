/**
 * How far along the demo the visitor has walked.
 *
 * The demo used to drop a guest straight into a finished account: library
 * pulled, reviews written, advice collected. Nothing was left to do, and every
 * button that did work looked optional — the product read as a shop window
 * rather than something you use. So the demo now starts empty and fills up from
 * the visitor's own clicks, in the same order a real account does.
 *
 * The position lives in the address and nowhere else. The real hub finishes a
 * run of the advisor with `location.reload()`, and the onboarding screen sends
 * you onward with a hard navigation — anything kept in React state would be
 * wiped by both. A query parameter is read by the server on the way back, so
 * the first painted frame after a reload is already the right one and progress
 * survives a refresh the visitor does out of habit.
 */

export type DemoStep = "start" | "library" | "reviews" | "advice";

export const STEP_PARAM = "step";

/** Ordered, because every question here is "has the visitor got at least this far". */
const ORDER: readonly DemoStep[] = ["start", "library", "reviews", "advice"];

export function stepFrom(params: URLSearchParams): DemoStep {
  const value = params.get(STEP_PARAM);
  const known = ORDER.find((step) => step === value);
  // "start" has no parameter of its own: an empty demo is what a bare /try means
  return known && known !== "start" ? known : "start";
}

export function reached(step: DemoStep, mark: DemoStep): boolean {
  return ORDER.indexOf(step) >= ORDER.indexOf(mark);
}

/** Writes the step into a URL, keeping everything else that is already there. */
export function withStep(url: URL, step: DemoStep): URL {
  if (step === "start") url.searchParams.delete(STEP_PARAM);
  else url.searchParams.set(STEP_PARAM, step);
  return url;
}
