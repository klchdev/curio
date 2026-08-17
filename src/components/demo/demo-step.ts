/**
 * How far along the demo the visitor has walked.
 *
 * There is exactly one thing to do here, and it is the thing worth watching:
 * press "generate" and see the advisor read a stranger's diary and answer. The
 * demo used to open on the onboarding screens as well — pull the library,
 * import the reviews — but those are chores a guest does not have. The library
 * is made up and the reviews are already written; pressing a button to make
 * fixtures appear is busywork dressed as a product tour.
 *
 * So: before the advice, and after it.
 *
 * The position lives in the address and nowhere else. The real hub finishes a
 * run of the advisor with `location.reload()`, and anything kept in React state
 * would be wiped by it. A query parameter is read by the server on the way
 * back, so the first painted frame after a reload is already the right one and
 * progress survives a refresh the visitor does out of habit.
 */

export type DemoStep = "start" | "advice";

export const STEP_PARAM = "step";

export function stepFrom(params: URLSearchParams): DemoStep {
  // "start" has no parameter of its own: a bare /try is the demo before advice
  return params.get(STEP_PARAM) === "advice" ? "advice" : "start";
}

/** Writes the step into a URL, keeping everything else that is already there. */
export function withStep(url: URL, step: DemoStep): URL {
  if (step === "start") url.searchParams.delete(STEP_PARAM);
  else url.searchParams.set(STEP_PARAM, step);
  return url;
}
