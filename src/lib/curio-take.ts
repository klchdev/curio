import { withLlm, type JsonSchema, type LlmCredentials } from "./llm";

/**
 * What Curio says once it has read the review through.
 *
 * The temptation here is to hand the player their own words back, only
 * prettier. That is empty work: they wrote them a moment ago and remember them
 * better than the model does. What is worth saying is the opposite — the part
 * one game cannot show: where this game landed among the rest, which complaint
 * keeps coming back review after review, where the rating disagrees with the
 * way they talk about the game.
 *
 * So the take has to lean on the other games in the diary and on their
 * vocabulary of complaints. Without that it is just polite noise.
 */

export interface TakeInput {
  gameTitle: string;
  entries: Array<{ hours: number; text: string }>;
  verdict: string | null;
  rating: number | null;
  tier: string | null;
  /** Entry tones in order: shows which way the mood was moving. */
  tones: number[];
  /** Their vocabulary: how often each complaint and praise has come up overall. */
  profile: Array<{ label: string; kind: string; games: number }>;
  /** Games carrying the same tags — material for comparison. */
  related: Array<{ title: string; tier: string | null; rating: number | null; labels: string[] }>;
  /** Neighbours by rating: what this game ended up standing alongside. */
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

const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    take: { type: "string", description: "Три-пять предложений от Curio" },
  },
  required: ["take"],
};

export async function generateTake(
  input: TakeInput,
  creds: LlmCredentials | null
): Promise<string> {
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

  const raw = await withLlm(creds, async (client) => {
    const answer = await client.generateJson({
      system: SYSTEM_INSTRUCTION,
      prompt,
      schema: RESPONSE_SCHEMA,
      /*
       * Matching a game against dozens of others by tags and ratings is
       * exactly the work reasoning is there for. The take is passed once per
       * game, so the extra seconds cost nothing here.
       */
      effort: "high",
    });

    if (!answer) throw new Error("The model returned an empty response");
    return answer;
  });

  const parsed = JSON.parse(raw) as { take?: unknown };
  return typeof parsed.take === "string" ? parsed.take.trim() : "";
}
