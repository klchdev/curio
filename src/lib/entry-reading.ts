import { Type, ThinkingLevel } from "@google/genai";
import { withGemini, GEMINI_MODEL, type GeminiKeys } from "./gemini";
import type { RawMention } from "./entry-mentions";

/**
 * Одно прочтение записи дневника.
 *
 * Слоёв четыре — упоминания игр, претензии и похвалы, ставки на будущее и тон
 * текста, — но текст один, и читать его четырьмя вызовами модели незачем: это
 * вчетверо дороже и вчетверо дольше ради одних и тех же двух тысяч знаков.
 *
 * Без импортов astro:env и db: модуль нужен и серверу, и разовому скрипту.
 */

export interface RawReading {
  mentions: RawMention[];
  complaints: string[];
  praises: string[];
  claims: string[];
  /** −2…2: как звучит запись, а не какая игра. */
  tone: number;
}

const EMPTY: RawReading = { mentions: [], complaints: [], praises: [], claims: [], tone: 0 };

const SYSTEM_INSTRUCTION = `Ты читаешь одну запись из игрового дневника и раскладываешь её на четыре слоя.

Запись человек пишет для себя: вперемешку по-русски и по-английски, сокращениями и по памяти — «первый LiS», «вторая часть», «Ведьмак 3», «RE4», «True Colors». Ничего не выдумывай: пустой слой — нормальный и частый ответ.

## mentions — упоминания ДРУГИХ игр

surface — точный кусок текста записи, скопированный посимвольно. Регистр, опечатки и раскладку не исправляй. Не получается скопировать дословно — пропусти упоминание.

title — полное название игры так, как оно пишется в Steam, латиницей: «Life is Strange 2», «The Witcher 3: Wild Hunt». Номер части раскрывай по контексту: «первый LiS» в записи об игре серии Life is Strange — это «Life is Strange», «вторая часть» — «Life is Strange 2».

Не упоминание: игра, о которой сама запись (но другая часть той же серии — упоминание); имена персонажей, студий, издателей, актёров; фильмы, книги, сериалы, музыка; жанры и общие обороты вроде «игры как эта» или «инди».

## complaints и praises — за что ругает и за что хвалит

Короткая формулировка свойства игры, 1-3 слова, в единственном числе и без оценки внутри: «рециклинг локаций», «мотивация героя», «атмосфера», «анимации», «гринд», «мало контента».

Это свойства игры, а не пересказ сюжета и не настроение. «Сафи оказалась доппельгангером» — не тег. «Слабая мотивация злодея» — тег.

Тебе дают список тегов, которыми этот человек уже пользовался. СНАЧАЛА ищи подходящий там и бери его дословно. Новый заводи, только если ни один не подходит по смыслу: три названия для одной и той же претензии хуже, чем одно неточное.

Больше трёх-четырёх тегов на слой не бывает. Ровно то, на чём человек задержался.

## claims — ставки на будущее

Место, где человек предполагает, чего ждёт или на что надеется: «надеюсь, дальше станет интереснее», «моя теория, что Макс из параллельной вселенной», «боюсь, что сдуется к финалу».

Пиши ставку одной фразой от его лица, своими словами, коротко. Утверждения о настоящем («игра красивая») ставками не являются — только то, что время может подтвердить или опровергнуть.

## tone — температура текста

Целое от −2 до 2: −2 злость и разочарование, −1 скорее недоволен, 0 ровно или смешанно, 1 скорее доволен, 2 восторг.

Оценивай КАК ЗВУЧИТ ЗАПИСЬ, а не насколько игра хороша и какую оценку человек ей поставил. Текст, где половина абзацев про то, как всё халтурно, — это −2, даже если в конце сказано «в целом времени не жалею».`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mentions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          surface: { type: Type.STRING, description: "Дословный кусок текста записи" },
          title: { type: Type.STRING, description: "Полное название игры как в Steam" },
        },
        required: ["surface", "title"],
      },
    },
    complaints: { type: Type.ARRAY, items: { type: Type.STRING } },
    praises: { type: Type.ARRAY, items: { type: Type.STRING } },
    claims: { type: Type.ARRAY, items: { type: Type.STRING } },
    tone: { type: Type.INTEGER, description: "Тон текста от -2 до 2" },
  },
  required: ["mentions", "complaints", "praises", "claims", "tone"],
};

function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && item.length <= 60)
    .slice(0, limit);
}

export interface ReadingInput {
  text: string;
  aboutTitle: string;
  /** Теги, которыми человек уже пользовался — чтобы не плодить синонимы. */
  vocabulary: { complaints: string[]; praises: string[] };
}

export async function readEntry(input: ReadingInput, keys: GeminiKeys): Promise<RawReading> {
  if (input.text.trim().length < 20) return EMPTY;

  const known = [
    input.vocabulary.complaints.length > 0
      ? `Его прежние претензии: ${input.vocabulary.complaints.join(", ")}`
      : "Прежних претензий ещё нет — заводи с нуля.",
    input.vocabulary.praises.length > 0
      ? `Его прежние похвалы: ${input.vocabulary.praises.join(", ")}`
      : "Прежних похвал ещё нет — заводи с нуля.",
  ].join("\n");

  const raw = await withGemini(keys, async (ai) => {
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `# Словарь этого человека\n${known}\n\n# Запись об игре: ${input.aboutTitle}\n\n${input.text}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        /*
         * Разбор записи механический: выписать названия, назвать свойства,
         * оценить тон. Размышление тут стоит секунд и токенов на пустом
         * месте — на всём дневнике это разница между минутами и часами.
         * Ниже LOW не опускаемся: MINIMAL эта модель отвергает с 400.
         */
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const answer = res.text ?? "";
    if (!answer) throw new Error("Gemini вернул пустой ответ");
    return answer;
  });

  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const mentions = Array.isArray(parsed.mentions)
    ? parsed.mentions
        .filter(
          (item): item is RawMention =>
            !!item &&
            typeof (item as RawMention).surface === "string" &&
            typeof (item as RawMention).title === "string"
        )
        .map((item) => ({ surface: item.surface.trim(), title: item.title.trim() }))
        .filter((item) => item.surface.length > 0 && item.title.length > 0)
    : [];

  const tone = typeof parsed.tone === "number" ? Math.round(parsed.tone) : 0;

  return {
    mentions,
    complaints: strings(parsed.complaints, 4),
    praises: strings(parsed.praises, 4),
    claims: strings(parsed.claims, 3),
    tone: Math.max(-2, Math.min(2, tone)),
  };
}
