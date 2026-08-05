import { DEFAULT_LOCALE, type Locale } from "./i18n";

/**
 * Единственный источник правды по тирам, вердиктам, оценкам и порогам.
 *
 * Раньше эти таблицы были скопированы по 5-8 раз каждая, и копии успели
 * разойтись: «Продолжаю» против «Жду релиз», «Вернусь» против «Вернусь позже».
 * Цвета и иконки от языка не зависят, поэтому стиль и текст разделены.
 *
 * Без импортов db и react — модуль нужен и на сервере, и в островах.
 */

/* ---------- Тиры ---------- */

export const TIER_VALUES = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = (typeof TIER_VALUES)[number];

/** Советчик не оперирует тиром F: это оценка сыгранного, а не прогноз. */
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

/** Что тир значит в рекомендации — это прогноз, а не оценка сыгранного. */
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

/* ---------- Вердикты ---------- */

/*
 * `endless` — игра, которая не кончается: Dota, PUBG, песочницы. «Прошёл» к
 * ним неприменим, а «продолжаю» врёт, потому что описывает временное
 * состояние, а не то, что человек возвращается сюда годами.
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

/** У демок те же вердикты значат другое: играть ещё нечего, релиза нет. */
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

/** Порядок для выбора в интерфейсе: сначала частые исходы. */
const VERDICT_ORDER: Verdict[] = ["finished", "endless", "playing", "dropped", "later"];

/** У демки нет «ротации»: играть там пока нечего, релиза нет. */
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

/* ---------- Оценка «стоило ли времени» ---------- */

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

/** rating приходит 1..5, а массивы нулевые — единственное место, где это знают. */
export function worthLabel(rating: number, locale: Locale = DEFAULT_LOCALE): string {
  return WORTH_LABEL[locale][Math.min(Math.max(rating, 1), 5) - 1]!;
}

/* ---------- Время ---------- */

export function formatPlaytime(minutes: number, locale: Locale = DEFAULT_LOCALE): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const h = locale === "ru" ? "ч" : "h";
  const m = locale === "ru" ? "мин" : "min";
  return hours > 0 ? `${hours} ${h} ${mins} ${m}` : `${mins} ${m}`;
}

/* ---------- Правила формы впечатления ---------- */

/**
 * Один лист впечатления вместо шести почти одинаковых модалок. Режим задаёт
 * не отдельную форму, а набор правил — и таблица лежит здесь, чтобы клиент и
 * сервер проверяли ввод по одному и тому же источнику, а не по двум копиям.
 */
export type ImpressionMode = "slot-first" | "entry" | "retro" | "quick" | "demo";

export interface SheetRule {
  /** Минимальная длина заметки, когда она вообще заполняется. */
  minNote: number;
  /** Без заметки сохранять нельзя. */
  noteRequired: boolean;
  verdictRequired: boolean;
  showTier: boolean;
  showRating: boolean;
  /** Только для демок: игры ещё нет в библиотеке, нужен appid или ссылка. */
  showAppIdInput: boolean;
  /** У демок свои значения вердиктов: «Жду релиз» вместо «Продолжаю». */
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

/* ---------- Пороги ---------- */

export const THRESHOLDS = {
  /** Считаем игру нетронутой, пока наиграно не больше этого. */
  UNPLAYED_MAX_MINUTES: 15,
  MAX_ACTIVE_SLOTS: 3,
  /** Минимум, чтобы закрыть контракт отзывом. */
  MIN_PLAYTIME_TO_REVIEW: 20,
  /** С какой добавки считаем, что игру стоит дополнить в дневнике. */
  STILL_PLAYING_DELTA: 30,
  /** Кандидаты в советы: только нетронутое, вкус ещё не сформирован. */
  CANDIDATE_MAX_MINUTES: 20,
  /** Разбор: сыграно ощутимо, но вердикта нет. */
  TRIAGE_MIN_MINUTES: 20,
  TRIAGE_PAGE_SIZE: 24,
  MIN_REVIEWS_FOR_AI: 10,
} as const;
