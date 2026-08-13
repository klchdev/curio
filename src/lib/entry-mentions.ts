import { Type, ThinkingLevel } from "@google/genai";
import { withGemini, GEMINI_MODEL, type GeminiKeys } from "./gemini";

/**
 * Упоминания других игр внутри записи дневника.
 *
 * Работа разделена надвое намеренно. Модель делает то, что кодом не сделать:
 * понимает, что «первый LiS», «вторая часть» и «RE4» — это игры, и называет
 * их полностью. Привязку к конкретной строке в базе делает код: у модели нет
 * каталога, и угадывать, какая именно Life is Strange из пяти имеется в виду,
 * она будет мимо. Поэтому модель отдаёт название, а сопоставление —
 * детерминированное, и промах в нём чинится правкой правил, а не промпта.
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

const SYSTEM_INSTRUCTION = `Ты читаешь одну запись из игрового дневника и находишь в ней упоминания ДРУГИХ игр.

Запись человек пишет для себя: вперемешку по-русски и по-английски, сокращениями и по памяти — «первый LiS», «вторая часть», «Ведьмак 3», «RE4», «True Colors».

surface — точный кусок текста записи, скопированный посимвольно. Регистр, опечатки и раскладку не исправляй. Не получается скопировать дословно — пропусти упоминание.

title — полное название игры так, как оно пишется в Steam, латиницей: «Life is Strange 2», «The Witcher 3: Wild Hunt», «Resident Evil 4». Номер части раскрывай по контексту: «первый LiS» в записи об игре серии Life is Strange — это «Life is Strange», «вторая часть» — «Life is Strange 2».

Не упоминание:
— игра, о которой сама запись; но другая часть той же серии — упоминание, её возвращай;
— имена персонажей, студий, издателей, актёров;
— фильмы, книги, сериалы, музыка;
— жанры и общие обороты: «игры как эта», «такие сюжетки», «инди», «роглайки».

Ничего не выдумывай. Не уверен, что это за игра, — не возвращай её вовсе. Пустой список — нормальный и частый ответ.`;

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      surface: { type: Type.STRING, description: "Дословный кусок текста записи" },
      title: { type: Type.STRING, description: "Полное название игры как в Steam" },
    },
    required: ["surface", "title"],
  },
};

export async function extractMentions(
  text: string,
  aboutTitle: string,
  keys: GeminiKeys
): Promise<RawMention[]> {
  if (text.trim().length < 20) return [];

  const raw = await withGemini(keys, async (ai) => {
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `# Запись об игре: ${aboutTitle}\n\n${text}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        /*
         * Выписать названия из текста — работа механическая: обдумывать тут
         * нечего, а размышление стоит и секунд, и токенов. На разборе всего
         * дневника это разница между парой минут и полутора часами.
         *
         * Ниже LOW не опускаемся: MINIMAL эта модель отвергает с 400.
         */
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const answer = res.text ?? "";
    if (!answer) throw new Error("Gemini вернул пустой ответ");
    return answer;
  });

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item): item is RawMention =>
        !!item &&
        typeof (item as RawMention).surface === "string" &&
        typeof (item as RawMention).title === "string"
    )
    .map((item) => ({ surface: item.surface.trim(), title: item.title.trim() }))
    .filter((item) => item.surface.length > 0 && item.title.length > 0);
}

/** Римские номера частей: в базе «Civilization VI», в записи — «Civilization 6». */
const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
};

/**
 * Приводит название к виду, в котором сравнение имеет смысл: «Life is
 * Strange™» и «life is strange» должны сойтись, а «Life is Strange 2» —
 * остаться другой игрой.
 */
export function normalizeTitle(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  return words
    .map((word, index) => (index === 0 && word === "the" ? "" : (ROMAN[word] ?? word)))
    .filter(Boolean)
    .join(" ");
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
