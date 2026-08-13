import { normalizeTitle } from "./titles";

/**
 * Привязка упоминаний к строкам каталога.
 *
 * Работа разделена надвое намеренно. Модель делает то, что кодом не сделать:
 * понимает, что «первый LiS», «вторая часть» и «RE4» — это игры, и называет
 * их полностью (этим занят entry-reading.ts). Привязку к конкретной строке в
 * базе делает код: у модели нет каталога, и угадывать, какая именно Life is
 * Strange из пяти имеется в виду, она будет мимо. Промах в сопоставлении
 * чинится правкой правил, а не промпта.
 *
 * Без импортов astro:env и db: модуль нужен и серверу, и разовому скрипту.
 */

/** Что модель нашла в тексте: дословный кусок и её догадка о названии. */
export interface RawMention {
  surface: string;
  title: string;
}

/** Строка каталога для сопоставления. Флаги решают неоднозначность. */
export interface CatalogGame {
  id: number;
  title: string;
  /** Есть запись в дневнике — про эту игру человек точно знает. */
  hasRecord: boolean;
  inLibrary: boolean;
}

export interface PlacedMention {
  gameId: number | null;
  surface: string;
  startOffset: number;
  canonicalTitle: string;
}

/**
 * Из двух игр с одинаковым названием выбирается та, о которой человек уже
 * писал: своё для него определённее чужого.
 */
function pickBest(candidates: CatalogGame[]): CatalogGame {
  return [...candidates].sort((a, b) => {
    if (a.hasRecord !== b.hasRecord) return a.hasRecord ? -1 : 1;
    if (a.inLibrary !== b.inLibrary) return a.inLibrary ? -1 : 1;
    return a.id - b.id;
  })[0]!;
}

/**
 * Каталог даёт точное совпадение либо ничего.
 *
 * Есть соблазн дотягивать по префиксу («Dishonored» → «Dishonored -
 * Definitive Edition»), и он оправдан ровно до тех пор, пока кандидат один.
 * «Life is Strange» — префикс пяти игр сразу, и любая догадка тут будет
 * ссылкой не на ту часть. Молчание в таком месте честнее.
 */
function resolveTitle(title: string, index: Map<string, CatalogGame[]>): CatalogGame | null {
  const key = normalizeTitle(title);
  if (!key) return null;

  const exact = index.get(key);
  if (exact) return pickBest(exact);

  const prefixed: CatalogGame[] = [];
  for (const [candidateKey, games] of index) {
    if (candidateKey.startsWith(`${key} `)) prefixed.push(...games);
  }
  if (prefixed.length === 0) return null;

  const unique = new Set(prefixed.map((game) => normalizeTitle(game.title)));
  if (unique.size > 1) return null;

  return pickBest(prefixed);
}

/**
 * Ставит упоминания на их места в тексте.
 *
 * Позицию модель не сообщает — её ищет код: смещения модели врут чаще, чем
 * дословный кусок, а кусок ещё и проверяем. Не нашли подстроку — упоминания
 * не было; выдумывать место подсветки нельзя, иначе она уедет по чужому
 * тексту.
 */
export function placeMentions(
  text: string,
  raw: RawMention[],
  catalog: CatalogGame[],
  ownGameId: number | null
): PlacedMention[] {
  const index = new Map<string, CatalogGame[]>();
  for (const game of catalog) {
    const key = normalizeTitle(game.title);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(game);
    else index.set(key, [game]);
  }

  const taken: Array<[number, number]> = [];
  const placed: PlacedMention[] = [];

  for (const mention of raw) {
    const match = resolveTitle(mention.title, index);
    // Запись и так об этой игре — ссылка сама на себя ничего не добавляет
    if (match && match.id === ownGameId) continue;

    let from = 0;
    let start = -1;
    while (from <= text.length) {
      const found = text.indexOf(mention.surface, from);
      if (found === -1) break;
      const end = found + mention.surface.length;
      const overlaps = taken.some(([a, b]) => found < b && a < end);
      if (!overlaps) {
        start = found;
        break;
      }
      from = found + 1;
    }
    if (start === -1) continue;

    taken.push([start, start + mention.surface.length]);
    placed.push({
      gameId: match?.id ?? null,
      surface: mention.surface,
      startOffset: start,
      canonicalTitle: match?.title ?? mention.title,
    });
  }

  return placed.sort((a, b) => a.startOffset - b.startOffset);
}
