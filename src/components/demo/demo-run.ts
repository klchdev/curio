/**
 * Which advice set the demo is currently showing.
 *
 * Regenerating advice has to end with a *different* result, otherwise the whole
 * simulation gives itself away: a progress bar that runs for four seconds and
 * lands on the very same games reads as a decoration, not as work. So the demo
 * carries two prepared runs and alternates between them.
 *
 * The choice lives in the address rather than in memory because the real hub
 * finishes a run with `location.reload()`. State kept in the island would not
 * survive that; a query parameter is read by the server on the way back, so the
 * first painted frame already shows the new advice and nothing flickers.
 */

import { demoFixtures, type DemoRun } from "../../lib/demo-fixtures";
import type { Locale } from "../../lib/i18n";

export type RunVariant = "base" | "alt";

export const RUN_PARAM = "run";

export function demoRun(variant: RunVariant, locale: Locale): DemoRun {
  const demo = demoFixtures(locale);
  return variant === "alt" ? demo.recommendationsAlt : demo.recommendations;
}

export function runVariantFrom(params: URLSearchParams): RunVariant {
  return params.get(RUN_PARAM) === "alt" ? "alt" : "base";
}

/** Where the next regeneration lands: the two sets take turns. */
export function nextRunVariant(current: RunVariant): RunVariant {
  return current === "alt" ? "base" : "alt";
}
