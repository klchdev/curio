import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { t } from "./strings";
import { splitList } from "./store-classify";
import { ADVISOR_TIER_VALUES, type AdvisorTier, type Tier, type Verdict } from "./vocab";
import type { GeneratedRecommendations, Grounding } from "./recommendations";

/**
 * Advice without a model key.
 *
 * The whole point of the app lives behind somebody else's API key, and a person
 * who has not got one yet sees an empty screen where the product should be.
 * This is the floor under that: genres and store categories, weighted by the
 * player's own tiers, verdicts and hours. It reads no texts and understands no
 * mechanics — everything it knows about a game is the handful of words Steam
 * files it under — so it is offered as a floor rather than as a second opinion,
 * and every pick it makes says out loud which of the player's own verdicts it
 * was derived from.
 *
 * Pure and synchronous on purpose: no database, no network, no clock. The
 * result has the same shape a model run produces, so everything downstream —
 * saving, the tier badges, the dice — stays untouched.
 */

/**
 * What a run computed this way stores in place of a model name. The column
 * answers "what worked this out", and for a rules run the honest answer is not
 * a model at all — which also spares the table a second column that would
 * always agree with this one.
 */
export const RULES_MODEL = "rules";

/** What a rated game contributes to the profile. */
export interface RatedGame {
  title: string;
  tier: Tier | null;
  rating: number | null;
  verdict: Verdict | null;
  hours: number;
  genres: string | null;
  categories: string | null;
}

export interface RuleCandidate {
  steamAppId: number;
  title: string;
  genres: string | null;
  categories: string | null;
}

/**
 * A tier is a judgement, and the spread matches the one the prompt asks a model
 * for: F is worse than D by more than D is worse than C, because giving up on
 * something in disgust says more than shrugging at it.
 */
const TIER_WEIGHT: Record<Tier, number> = {
  S: 2,
  A: 1.2,
  B: 0.3,
  C: -0.6,
  D: -1.5,
  F: -2.5,
};

/**
 * Playing it through is a verdict the hands gave, and it outweighs the one the
 * words gave. `dropped` is the opposite and pulls the same lever back.
 */
const VERDICT_FACTOR: Record<Verdict, number> = {
  finished: 1.3,
  endless: 1.15,
  playing: 1,
  later: 0.9,
  dropped: 0.8,
};

/**
 * Categories worth anything as taste: how the game is played. The rest of that
 * column is plumbing — cloud saves, achievements, controller support — and
 * feeding it in would only add noise that every game in the library shares.
 */
const MODE_CATEGORIES = [
  "Single-player",
  "Multi-player",
  "Co-op",
  "PvP",
  "MMO",
  "Online Co-op",
  "LAN Co-op",
  "Shared/Split Screen",
];

/**
 * Smoothing. A genre met once carries the whole weight of one game, and without
 * a denominator that never shrinks, a single S-tier oddity would top the
 * profile and drag half the library up with it.
 */
const SMOOTHING = 2;

/** Below this many games behind it, a feature is a hint rather than a pattern. */
const SUPPORT_FOR_PATTERN = 2;
const WEAK_SUPPORT_FACTOR = 0.5;

/**
 * A feature has to pull at least this fraction of the strongest one to count
 * for anything. Relative rather than absolute, because the whole scale depends
 * on how generously this person hands out tiers — and without the cut-off, a
 * game whose only match is "Single-player" came back recommended for being a
 * game at all.
 */
const MEANINGFUL_SHARE = 0.25;

/** How many picks a rules run hands over — the same ceiling the model run has. */
const MAX_PICKS = 40;

/** Tier quotas, in the same calibration the prompt spells out for a model. */
const S_MAX = 3;
const A_MAX = 6;
const D_SHARE = 0.15;
const D_MAX = 8;

interface FeatureStat {
  /** Sum of the weights of the rated games carrying this feature. */
  raw: number;
  games: number;
  /** The loudest examples, for the explanation: the player's own verdicts. */
  examples: { title: string; tier: Tier | null; weight: number }[];
}

function featuresOf(game: { genres: string | null; categories: string | null }): string[] {
  const genres = splitList(game.genres);
  const modes = splitList(game.categories).filter((category) =>
    MODE_CATEGORIES.some((mode) => category === mode)
  );
  return [...new Set([...genres, ...modes])];
}

/**
 * What one played game says.
 *
 * The tier comes first because it is the judgement the player actually made;
 * a rating stands in when there is no tier. Hours only nudge: a long session
 * with a bad verdict is stubbornness, not enthusiasm, and it must not turn into
 * a plus.
 */
function weigh(game: RatedGame, medianHours: number): number {
  const base =
    game.tier !== null
      ? TIER_WEIGHT[game.tier]
      : game.rating !== null
        ? (game.rating - 3) * 0.7
        : 0;

  if (base === 0) return 0;

  const verdict = game.verdict ? VERDICT_FACTOR[game.verdict] : 1;
  const weighted = base * verdict;

  // Hours only ever reinforce the sign the verdict already has
  if (medianHours > 0 && weighted > 0 && game.hours >= medianHours * 2) return weighted + 0.4;
  if (medianHours > 0 && weighted < 0 && game.hours <= medianHours * 0.3) return weighted - 0.3;
  return weighted;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/**
 * The taste profile, in features.
 *
 * Each feature is scored against the player's own average rather than against
 * zero: in a library where nearly everything is tagged Action, Action carries
 * no information, and only the distance from the middle does.
 */
function buildProfile(rated: RatedGame[]): {
  stats: Map<string, FeatureStat>;
  baseline: number;
  corpus: number;
} {
  const medianHours = median(rated.map((game) => game.hours).filter((hours) => hours > 0));
  const stats = new Map<string, FeatureStat>();
  let total = 0;
  let counted = 0;

  for (const game of rated) {
    const weight = weigh(game, medianHours);
    if (weight === 0) continue;

    total += weight;
    counted += 1;

    for (const feature of featuresOf(game)) {
      const stat = stats.get(feature) ?? { raw: 0, games: 0, examples: [] };
      stat.raw += weight;
      stat.games += 1;
      stat.examples.push({ title: game.title, tier: game.tier, weight });
      stats.set(feature, stat);
    }
  }

  for (const stat of stats.values()) {
    stat.examples.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  }

  return { stats, baseline: counted > 0 ? total / (counted + SMOOTHING) : 0, corpus: counted };
}

/**
 * How much this feature pulls, relative to how the player rates things in
 * general.
 *
 * Weighted by how much the feature narrows anything down. Nearly every game in
 * a library is Single-player, so a positive score on it says only that the
 * person likes games — and left unweighted it drowned out the genres that
 * actually separate one recommendation from another: a visual novel came back
 * as "for you: Single-player, like Prey".
 */
function pull(stat: FeatureStat, baseline: number, corpus: number): number {
  const score = stat.raw / (stat.games + SMOOTHING) - baseline;
  const support = stat.games >= SUPPORT_FOR_PATTERN ? 1 : WEAK_SUPPORT_FACTOR;
  const information =
    corpus > 0 ? Math.log2(1 + corpus / stat.games) / Math.log2(1 + corpus) : 1;
  return score * support * information;
}

interface Moved {
  feature: string;
  pull: number;
  stat: FeatureStat;
}

interface Scored {
  candidate: RuleCandidate;
  score: number;
  /** The features that moved it, strongest first. */
  moved: Moved[];
}

function significanceFloor(
  stats: Map<string, FeatureStat>,
  baseline: number,
  corpus: number
): number {
  const strongest = Math.max(
    0,
    ...[...stats.values()].map((stat) => Math.abs(pull(stat, baseline, corpus)))
  );
  return strongest * MEANINGFUL_SHARE;
}

function score(
  candidates: RuleCandidate[],
  stats: Map<string, FeatureStat>,
  baseline: number,
  corpus: number
): Scored[] {
  const floor = significanceFloor(stats, baseline, corpus);

  return candidates
    .map((candidate) => {
      const moved = featuresOf(candidate)
        .map((feature) => {
          const stat = stats.get(feature);
          return stat ? { feature, pull: pull(stat, baseline, corpus), stat } : null;
        })
        .filter((item): item is Moved => item !== null && Math.abs(item.pull) >= floor)
        .sort((a, b) => Math.abs(b.pull) - Math.abs(a.pull));

      /*
       * The average, not the sum: a game filed under six genres would otherwise
       * beat a game filed under two for no reason but Steam's paperwork.
       */
      const total = moved.reduce((sum, item) => sum + item.pull, 0);
      return { candidate, score: moved.length > 0 ? total / moved.length : 0, moved };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Tiers by position rather than by absolute score.
 *
 * The number a feature adds up to means nothing on its own — it depends on how
 * generously this particular person hands out tiers. What it can honestly say
 * is which end of their own library a game sits at, so the quotas from the
 * prompt are cut off the sorted list, and a game with nothing behind it never
 * reaches S or A no matter how short the list is.
 */
function tierFor(index: number, total: number, item: Scored): AdvisorTier {
  const sCount = Math.min(S_MAX, Math.max(1, Math.round(total * 0.03)));
  const aCount = Math.min(A_MAX, Math.max(1, Math.round(total * 0.12)));

  if (index < sCount && item.score > 0) return "S";
  if (index < sCount + aCount && item.score > 0) return "A";
  // Everything in the middle splits in half: a shrug leaning good, a shrug leaning bad
  return index < total / 2 ? "B" : "C";
}

function explain(item: Scored, locale: Locale): { reason: string; grounding: Grounding } {
  const s = t(locale);
  const format = (stat: FeatureStat) =>
    stat.examples
      .slice(0, 2)
      .map((example) => s.rules.example(example.title, example.tier))
      .join(", ");

  const positive = item.moved.filter((move) => move.pull > 0);
  const negative = item.moved.filter((move) => move.pull < 0);

  const parts: string[] = [];
  if (positive[0]) parts.push(s.rules.forIt(positive[0].feature, format(positive[0].stat)));
  if (negative[0]) parts.push(s.rules.againstIt(negative[0].feature, format(negative[0].stat)));

  /*
   * Nothing matched means the store filed this game under words that appear
   * nowhere in what the player has rated. Saying so is the honest answer, and
   * `guess` is exactly what the badge in the interface already means.
   */
  if (parts.length === 0) return { reason: s.rules.nothingMatched, grounding: "guess" };
  return { reason: parts.join(" "), grounding: "from-description" };
}

/**
 * The portrait, such as it is: the features the player leans towards and away
 * from, plus the sentence that keeps this from passing itself off as a reading
 * of their words.
 */
function describe(
  stats: Map<string, FeatureStat>,
  baseline: number,
  corpus: number,
  locale: Locale
): string {
  const s = t(locale);
  const floor = significanceFloor(stats, baseline, corpus);
  const ranked = [...stats.entries()]
    .filter(([, stat]) => stat.games >= SUPPORT_FOR_PATTERN)
    .map(([feature, stat]) => ({ feature, pull: pull(stat, baseline, corpus), games: stat.games }))
    .filter((item) => Math.abs(item.pull) >= floor)
    .sort((a, b) => b.pull - a.pull);

  const liked = ranked.filter((item) => item.pull > 0).slice(0, 4);
  const disliked = ranked
    .filter((item) => item.pull < 0)
    .slice(-3)
    .reverse();

  const lines: string[] = [];
  if (liked.length > 0) {
    lines.push(`- ${s.rules.profileLikes(liked.map((item) => s.rules.withGames(item.feature, item.games)).join(", "))}`);
  }
  if (disliked.length > 0) {
    lines.push(`- ${s.rules.profileDislikes(disliked.map((item) => s.rules.withGames(item.feature, item.games)).join(", "))}`);
  }
  lines.push(`- ${s.rules.profileHow}`);
  return lines.join("\n");
}

export function recommendByRules(
  rated: RatedGame[],
  candidates: RuleCandidate[],
  locale: Locale = DEFAULT_LOCALE
): GeneratedRecommendations {
  const { stats, baseline, corpus } = buildProfile(rated);
  const ranked = score(candidates, stats, baseline, corpus);

  /*
   * The bottom of the list is taken before the list is cut, not after.
   * Truncating to the best forty first threw away the only games this thing can
   * be really sure about — the ones that match what the player has already
   * given up on — and "don't waste your time" is half of what the advice is
   * for.
   */
  const worst = ranked
    .filter((item) => item.score < 0)
    .slice(-Math.min(D_MAX, Math.max(1, Math.round(ranked.length * D_SHARE))));
  const worstIds = new Set(worst.map((item) => item.candidate.steamAppId));
  const best = ranked
    .filter((item) => !worstIds.has(item.candidate.steamAppId))
    .slice(0, MAX_PICKS - worst.length);

  const picks = [
    ...best.map((item, index) => ({ item, tier: tierFor(index, best.length, item) })),
    ...worst.map((item) => ({ item, tier: "D" as AdvisorTier })),
  ].map(({ item, tier }) => {
    const { reason, grounding } = explain(item, locale);
    return {
      steamAppId: item.candidate.steamAppId,
      tier: ADVISOR_TIER_VALUES.includes(tier) ? tier : ("B" as AdvisorTier),
      reason,
      grounding,
    };
  });

  return { profile: describe(stats, baseline, corpus, locale), picks };
}
