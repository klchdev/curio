import { DEFAULT_LOCALE, type Locale } from "./i18n";

/**
 * The single source of truth for tiers, verdicts, ratings and thresholds.
 *
 * These tables used to be copy-pasted 5-8 times each, and the copies had
 * already drifted apart: "Playing" against "Awaiting release", "Back" against
 * "Back later". Colors and icons don't depend on the language, so style and
 * text are kept apart.
 *
 * No db or react imports — the module is needed on the server and in islands.
 */

/* ---------- Tiers ---------- */

export const TIER_VALUES = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = (typeof TIER_VALUES)[number];

/** The advisor has no tier F: that rates what was played, it isn't a forecast. */
export const ADVISOR_TIER_VALUES = ["S", "A", "B", "C", "D"] as const;
export type AdvisorTier = (typeof ADVISOR_TIER_VALUES)[number];

export const TIER_STYLE: Record<Tier, { bg: string; text: string; accent: string }> = {
  S: { bg: "bg-yellow-500", text: "text-yellow-950", accent: "text-yellow-400" },
  A: { bg: "bg-emerald-500", text: "text-emerald-950", accent: "text-emerald-400" },
  B: { bg: "bg-sky-500", text: "text-sky-950", accent: "text-sky-400" },
  C: { bg: "bg-orange-500", text: "text-orange-950", accent: "text-orange-400" },
  D: { bg: "bg-red-500", text: "text-red-950", accent: "text-red-400" },
  F: { bg: "bg-rose-800", text: "text-rose-100", accent: "text-rose-400" },
};

const TIER_HINT: Record<Locale, Record<Tier, string>> = {
  ru: { S: "Шедевр", A: "Крутая", B: "Хорошая", C: "Сойдёт", D: "Не зашло", F: "Провал" },
  en: { S: "Masterpiece", A: "Great", B: "Good", C: "Fine", D: "Meh", F: "Awful" },
};

/** What a tier means in a recommendation — a forecast, not a rating of play. */
const ADVISOR_HINT: Record<Locale, Record<AdvisorTier, string>> = {
  ru: {
    S: "Бросай текущее",
    A: "Очень вероятно зайдёт",
    B: "Стоит попробовать",
    C: "Под настроение",
    D: "Не трать время",
  },
  en: {
    S: "Drop everything",
    A: "Very likely a hit",
    B: "Worth a try",
    C: "Depends on mood",
    D: "Don't bother",
  },
};

export function tiers(locale: Locale = DEFAULT_LOCALE) {
  return TIER_VALUES.map((value) => ({
    value,
    label: value,
    hint: TIER_HINT[locale][value],
    ...TIER_STYLE[value],
  }));
}

export function tierHint(tier: Tier, locale: Locale = DEFAULT_LOCALE): string {
  return TIER_HINT[locale][tier];
}

export function advisorHint(tier: AdvisorTier, locale: Locale = DEFAULT_LOCALE): string {
  return ADVISOR_HINT[locale][tier];
}

export function isValidTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIER_VALUES as readonly string[]).includes(value);
}

/* ---------- Verdicts ---------- */

/*
 * `endless` — a game that never ends: Dota, PUBG, sandboxes. "Finished" doesn't
 * apply to them, and "playing" lies, because it describes a temporary state
 * rather than the fact that someone keeps coming back here for years.
 */
export const VERDICT_VALUES = ["finished", "endless", "playing", "dropped", "later"] as const;
export type Verdict = (typeof VERDICT_VALUES)[number];

export const VERDICT_STYLE: Record<Verdict, { icon: string; color: string }> = {
  finished: { icon: "✅", color: "emerald" },
  endless: { icon: "♾️", color: "violet" },
  playing: { icon: "🎮", color: "indigo" },
  dropped: { icon: "❌", color: "red" },
  later: { icon: "⏸️", color: "amber" },
};

const VERDICT_LABEL: Record<Locale, Record<Verdict, string>> = {
  ru: {
    finished: "Прошёл",
    endless: "В ротации",
    playing: "Продолжаю",
    dropped: "Бросил",
    later: "Вернусь позже",
  },
  en: {
    finished: "Finished",
    endless: "In rotation",
    playing: "Playing",
    dropped: "Dropped",
    later: "Later",
  },
};

/** For demos the same verdicts mean other things: nothing to play yet, no release. */
const DEMO_VERDICT_LABEL: Record<Locale, Record<Verdict, string>> = {
  ru: {
    finished: "Прошёл",
    endless: "В ротации",
    playing: "Жду релиз",
    dropped: "Не зашло",
    later: "Под вопросом",
  },
  en: {
    finished: "Finished",
    endless: "In rotation",
    playing: "Awaiting release",
    dropped: "Not for me",
    later: "Maybe",
  },
};

/** Order for the picker in the UI: the common outcomes first. */
const VERDICT_ORDER: Verdict[] = ["finished", "endless", "playing", "dropped", "later"];

/** A demo has no "rotation": there is nothing to play there yet, no release. */
const DEMO_VERDICT_ORDER: Verdict[] = ["finished", "playing", "dropped", "later"];

export function verdicts(locale: Locale = DEFAULT_LOCALE, options?: { demo?: boolean }) {
  const labels = options?.demo ? DEMO_VERDICT_LABEL[locale] : VERDICT_LABEL[locale];
  const order = options?.demo ? DEMO_VERDICT_ORDER : VERDICT_ORDER;
  return order.map((value) => ({
    value,
    label: labels[value],
    ...VERDICT_STYLE[value],
  }));
}

export function verdictLabel(
  verdict: Verdict,
  locale: Locale = DEFAULT_LOCALE,
  options?: { demo?: boolean }
): string {
  return (options?.demo ? DEMO_VERDICT_LABEL : VERDICT_LABEL)[locale][verdict];
}

export function isValidVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICT_VALUES as readonly string[]).includes(value);
}

/* ---------- The "was it worth the time" rating ---------- */

const WORTH_LABEL: Record<Locale, readonly string[]> = {
  ru: ["Зря потратил время", "Скорее нет", "Нормально", "Скорее да", "Рад что попробовал"],
  en: ["Waste of time", "Rather not", "Fine", "Rather yes", "Glad I tried"],
};

export const WORTH_COLORS = [
  "text-red-400",
  "text-orange-400",
  "text-gray-400",
  "text-sky-400",
  "text-emerald-400",
] as const;

export const WORTH_BG = [
  "bg-red-500",
  "bg-orange-500",
  "bg-gray-500",
  "bg-sky-500",
  "bg-emerald-500",
] as const;

export function worthLabels(locale: Locale = DEFAULT_LOCALE): readonly string[] {
  return WORTH_LABEL[locale];
}

/** rating arrives as 1..5, the arrays are zero-based — the only place that knows. */
export function worthLabel(rating: number, locale: Locale = DEFAULT_LOCALE): string {
  return WORTH_LABEL[locale][Math.min(Math.max(rating, 1), 5) - 1]!;
}

/* ---------- Time ---------- */

export function formatPlaytime(minutes: number, locale: Locale = DEFAULT_LOCALE): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const h = locale === "ru" ? "ч" : "h";
  const m = locale === "ru" ? "мин" : "min";
  return hours > 0 ? `${hours} ${h} ${mins} ${m}` : `${mins} ${m}`;
}

/* ---------- Impression sheet rules ---------- */

/**
 * One impression sheet instead of six near-identical modals. A mode defines not
 * a separate form but a set of rules — and the table lives here so that client
 * and server validate input against one source rather than two copies.
 */
export type ImpressionMode = "slot-first" | "entry" | "retro" | "quick" | "demo";

export interface SheetRule {
  /** Minimum note length, when the note is filled in at all. */
  minNote: number;
  /** Saving without a note is not allowed. */
  noteRequired: boolean;
  verdictRequired: boolean;
  showTier: boolean;
  showRating: boolean;
  /** Demos only: the game isn't in the library yet, so an appid or link is needed. */
  showAppIdInput: boolean;
  /** Demos word their verdicts differently: "Awaiting release" instead of "Playing". */
  demoLabels: boolean;
  celebrate: boolean;
  title: Record<Locale, string>;
  submit: Record<Locale, string>;
}

export const SHEET_RULES: Record<ImpressionMode, SheetRule> = {
  "slot-first": {
    minNote: 50,
    noteRequired: true,
    verdictRequired: true,
    showTier: false,
    showRating: true,
    showAppIdInput: false,
    demoLabels: false,
    celebrate: true,
    title: { ru: "Первое впечатление", en: "First impression" },
    submit: { ru: "Закрыть контракт", en: "Close contract" },
  },
  entry: {
    minNote: 10,
    noteRequired: false,
    verdictRequired: false,
    showTier: true,
    showRating: true,
    showAppIdInput: false,
    demoLabels: false,
    celebrate: false,
    title: { ru: "Дополнить впечатление", en: "Add to the timeline" },
    submit: { ru: "Записать", en: "Save" },
  },
  retro: {
    minNote: 50,
    noteRequired: true,
    verdictRequired: true,
    showTier: true,
    showRating: true,
    showAppIdInput: false,
    demoLabels: false,
    celebrate: false,
    title: { ru: "Отзыв об игре", en: "Game review" },
    submit: { ru: "Сохранить отзыв", en: "Save review" },
  },
  quick: {
    minNote: 0,
    noteRequired: false,
    verdictRequired: true,
    showTier: false,
    showRating: false,
    showAppIdInput: false,
    demoLabels: false,
    celebrate: false,
    title: { ru: "Вердикт", en: "Verdict" },
    submit: { ru: "Сохранить", en: "Save" },
  },
  demo: {
    minNote: 10,
    noteRequired: true,
    verdictRequired: false,
    showTier: true,
    showRating: true,
    showAppIdInput: true,
    demoLabels: true,
    celebrate: false,
    title: { ru: "Демка с фестиваля", en: "Festival demo" },
    submit: { ru: "Добавить демку", en: "Add demo" },
  },
};

/* ---------- Thresholds ---------- */

export const THRESHOLDS = {
  /** A game counts as untouched while its playtime stays at or below this. */
  UNPLAYED_MAX_MINUTES: 15,
  MAX_ACTIVE_SLOTS: 3,
  /** The minimum needed to close a contract with a review. */
  MIN_PLAYTIME_TO_REVIEW: 20,
  /** How much added playtime makes a game worth another diary entry. */
  STILL_PLAYING_DELTA: 30,
  /** Advice candidates: untouched games only, no taste formed about them yet. */
  CANDIDATE_MAX_MINUTES: 20,
  /** Triage: played a noticeable amount, but there is no verdict. */
  TRIAGE_MIN_MINUTES: 20,
  TRIAGE_PAGE_SIZE: 24,
  MIN_REVIEWS_FOR_AI: 10,
} as const;
