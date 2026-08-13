import { Type, ThinkingLevel } from "@google/genai";
import { withGemini, GEMINI_MODEL, type GeminiKeys } from "./gemini";

/**
 * Что скажет Curio, дочитав отзыв до конца.
 *
 * Соблазн здесь — пересказать человеку его же слова покрасивее. Это пустая
 * работа: он их только что написал и помнит лучше модели. Ценно ровно
 * обратное — то, чего из одной игры не видно: куда эта игра встала среди
 * остальных, какая претензия у него повторяется из отзыва в отзыв, где
 * оценка расходится с тем, как он про игру говорит.
 *
 * Поэтому вердикт обязан опираться на другие игры дневника и на его словарь
 * претензий. Разговор без этого — просто вежливый шум.
 */

export interface TakeInput {
  gameTitle: string;
  entries: Array<{ hours: number; text: string }>;
  verdict: string | null;
  rating: number | null;
  tier: string | null;
  /** Тон записей по порядку: видно, куда двигалось настроение. */
  tones: number[];
  /** Его словарь: сколько раз каждая претензия и похвала встречалась вообще. */
  profile: Array<{ label: string; kind: string; games: number }>;
  /** Игры, где встречались те же теги, — материал для сравнения. */
  related: Array<{ title: string; tier: string | null; rating: number | null; labels: string[] }>;
  /** Соседи по оценке: с чем эта игра встала в один ряд. */
  neighbours: Array<{ title: string; tier: string | null; rating: number | null }>;
}

const SYSTEM_INSTRUCTION = `Ты — Curio. Человек только что закрыл игру и дописал отзыв. Ты прочитал всё, что он про неё написал, и знаешь его дневник целиком. Скажи, что видишь.

Твоя ценность — не в пересказе. Он написал этот текст десять секунд назад и помнит его лучше тебя. Пересказ его же слов, похвала за «интересные наблюдения» и «спасибо, что поделился» — мусор, за который тебя выключат.

Говори о том, что видно только со стороны:

— Куда эта игра встала среди его игр. Называй конкретные игры из его дневника по названиям и их оценки. «Ты поставил ей B — столько же, сколько *True Colors*, о которой писал, что не запомнилась» лучше, чем «игра вышла средней».
— Какая претензия у него повторяется. Если она встречается в нескольких играх — скажи, в скольких и в каких. Это его вкус, и он сам его не проговаривал.
— Где его слова расходятся с его же оценкой. Если пять записей подряд про халтуру, а тир B — назови это прямо и спроси себя вслух, не жалеет ли он игру за что-то другое.
— Как менялось настроение по ходу. Если начал тепло, а закончил зло — это сюжет отзыва, и его стоит назвать.

Правила:
— Обращайся на «ты». Три-пять предложений, без заголовков и списков.
— Названия игр помечай одной звёздочкой: *True Colors*.
— Минимум одна конкретная другая игра из его дневника. Без этого вердикт не имеет смысла.
— Не подлизывайся и не смягчай. Если считаешь, что он завысил оценку, — скажи это.
— Не советуй, что играть дальше: это не твоя задача здесь.
— Не выдумывай ни игр, ни его слов. Всё, что называешь, должно быть в данных.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    take: { type: Type.STRING, description: "Три-пять предложений от Curio" },
  },
  required: ["take"],
};

export async function generateTake(input: TakeInput, keys: GeminiKeys): Promise<string> {
  const feed = input.entries.map((entry) => `[${entry.hours}ч] ${entry.text}`).join("\n\n");

  const profile = input.profile
    .map((tag) => `- ${tag.label} (${tag.kind === "praise" ? "хвалит" : "ругает"}, игр: ${tag.games})`)
    .join("\n");

  const related = input.related
    .map((game) => {
      const meta = [game.tier ? `тир ${game.tier}` : null, game.rating ? `${game.rating}/5` : null]
        .filter(Boolean)
        .join(", ");
      return `- ${game.title}${meta ? ` (${meta})` : ""}: ${game.labels.join(", ")}`;
    })
    .join("\n");

  const neighbours = input.neighbours
    .map((game) => {
      const meta = [game.tier ? `тир ${game.tier}` : null, game.rating ? `${game.rating}/5` : null]
        .filter(Boolean)
        .join(", ");
      return `- ${game.title}${meta ? ` (${meta})` : ""}`;
    })
    .join("\n");

  const verdict = [
    input.verdict ? `вердикт ${input.verdict}` : null,
    input.rating ? `оценка ${input.rating}/5` : null,
    input.tier ? `тир ${input.tier}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = [
    `# Игра: ${input.gameTitle}`,
    `Итог: ${verdict || "не выставлен"}`,
    input.tones.length > 1 ? `Тон записей по порядку: ${input.tones.join(" → ")} (от -2 до 2)` : "",
    "",
    "# Что он написал об этой игре",
    feed,
    profile ? `\n# Его словарь: что он вообще ругает и хвалит\n${profile}` : "",
    related ? `\n# Игры с теми же тегами\n${related}` : "",
    neighbours ? `\n# Игры рядом по оценке\n${neighbours}` : "",
    "",
    "Скажи, что видишь.",
  ].join("\n");

  const raw = await withGemini(keys, async (ai) => {
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        /*
         * Сопоставить игру с десятками других по тегам и оценкам — работа,
         * ради которой размышление и нужно. Вердикт выносится раз на игру,
         * лишние секунды тут ничего не стоят.
         */
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });

    const answer = res.text ?? "";
    if (!answer) throw new Error("Gemini вернул пустой ответ");
    return answer;
  });

  const parsed = JSON.parse(raw) as { take?: unknown };
  return typeof parsed.take === "string" ? parsed.take.trim() : "";
}
