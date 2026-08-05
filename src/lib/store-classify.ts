/**
 * Софт или игра — по данным карточки магазина.
 *
 * Без импортов astro:env и db: модуль нужен и серверу, и разовым скриптам.
 *
 * Первая версия отсекала всё, у чего `type !== "game"`, и всё без жанров —
 * и записала в софт GTR Evolution (числится dlc), Killing Floor Mod (mod),
 * Cities XL и Mortal Kombat (legacy-тип advertising) и Total War: SHOGUN 2,
 * у которой в карточке просто нет жанров. Прятать чужие игры хуже, чем
 * пропустить в список одну утилиту, поэтому теперь софт помечается только
 * по положительным уликам.
 */

/** Жанры, которые Steam даёт инструментам. */
const SOFTWARE_GENRES = new Set([
  "Animation & Modeling",
  "Audio Production",
  "Design & Illustration",
  "Education",
  "Game Development",
  "Photo Editing",
  "Software Training",
  "Utilities",
  "Video Production",
  "Web Publishing",
]);

/** Типы, которые играми не бывают вовсе. */
const SOFTWARE_TYPES = new Set(["software", "video", "music", "audio", "movie", "series"]);

/** Наличие такой категории — прямое доказательство, что в это играют. */
const PLAYER_CATEGORIES = ["Single-player", "Multi-player", "Co-op", "PvP", "MMO"];

/**
 * Способ распространения, а не свойство продукта: у делистнутых игр это
 * бывает единственная категория, и принимать её за признак нельзя.
 */
const NON_FEATURE_CATEGORIES = new Set(["Family Sharing"]);

export function classifyAsSoftware(
  type: string | null,
  genres: string[],
  categories: string[]
): boolean {
  if (type && SOFTWARE_TYPES.has(type)) return true;

  // В это играют — дальше можно не гадать
  if (categories.some((c) => PLAYER_CATEGORIES.some((p) => c.includes(p)))) return false;

  const software = genres.filter((g) => SOFTWARE_GENRES.has(g)).length;
  if (genres.length > 0 && software / genres.length >= 0.5) return true;

  /*
   * Ни одного жанра, но карточка заполнена — так выглядят служебные
   * приложения вроде SteamVR. Пустая карточка (только «Family Sharing»)
   * ничего не доказывает: это старая игра без метаданных.
   */
  const meaningful = categories.filter((c) => !NON_FEATURE_CATEGORIES.has(c));
  if (genres.length === 0 && meaningful.length > 0) return true;

  return false;
}

export function splitList(value: string | null): string[] {
  return value ? value.split(", ").filter(Boolean) : [];
}
