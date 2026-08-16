import { withLlm, type JsonSchema, type LlmCredentials } from "./llm";

/**
 * Questions about a review that was just closed out.
 *
 * A review always leaves something unsaid, and the holes in it only show
 * against the whole feed: five entries in a row cursing recycled locations, and
 * then a B — why? Asking while the game is still fresh in mind is cheaper than
 * reconstructing it later.
 *
 * Answering every question is optional, and so is answering at all: a question
 * left hanging costs nothing, while making it compulsory would turn the diary
 * into homework.
 */

export interface QuestionInput {
  gameTitle: string;
  /** The whole feed: a question only means anything against everything already said. */
  entries: Array<{ hours: number; text: string; rating: number | null; tier: string | null }>;
  verdict: string | null;
  rating: number | null;
  tier: string | null;
  /** How the player rated other games — so a comparison has something to stand on. */
  neighbours: Array<{ title: string; tier: string | null; rating: number | null }>;
}

const SYSTEM_INSTRUCTION = `Ты прочитал дневник одного человека об одной игре, которую он только что закрыл, и задаёшь ему два-три вопроса.

Вопрос нужен там, где в отзыве дыра. Дыры бывают такие:

— Слова расходятся с оценкой. Пять записей подряд ругал одно и то же, а поставил высокий тир. Спроси, что удержало.
— Сказано «понравилось» или «не понравилось» без причины, хотя рядом в дневнике есть похожая игра с другой оценкой. Спроси, чем отличается.
— Мнение развернулось между записями, и в тексте не сказано, что именно его развернуло.
— Названа претензия, которая у него встречается и в других играх. Спроси, всегда ли она его так задевает или тут вышло особенно.
— Ставка из ранней записи не получила ответа: предполагал одно, а чем кончилось — не написано.

Правила:
— Спрашивай о том, чего в тексте НЕТ. Вопрос, ответ на который уже написан, — худшее, что можно спросить.
— Ссылайся на конкретику из его записей: часы, названия, его же слова. «Что понравилось?» — плохой вопрос, «ты пять записей ругал рециклинг локаций, но поставил B — что удержало от C?» — хороший.
— Обращайся на «ты», коротко, одним предложением. Без вежливых подводок и без похвалы.
— Не предлагай варианты ответа и не подсказывай, что он должен чувствовать.
— Не спрашивай про будущее серии, про другие игры вообще и про планы: спрашивай про эту игру и его опыт с ней.

Если дыр нет и отзыв полный — верни пустой список. Это нормальный ответ.`;

const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: { type: "string" },
      description: "Два-три вопроса, каждый одним предложением",
    },
  },
  required: ["questions"],
};

export async function generateQuestions(
  input: QuestionInput,
  creds: LlmCredentials | null
): Promise<string[]> {
  const feed = input.entries
    .map((entry) => {
      const meta = [
        `${entry.hours}ч`,
        entry.rating ? `оценка ${entry.rating}/5` : null,
        entry.tier ? `тир ${entry.tier}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `[${meta}] ${entry.text}`;
    })
    .join("\n\n");

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
    "",
    "# Лента записей, от первой к последней",
    feed,
    neighbours ? "\n# Как он оценивал другие игры\n" + neighbours : "",
    "",
    "Задай вопросы про то, чего в этих записях нет.",
  ].join("\n");

  const raw = await withLlm(creds, async (client) => {
    const answer = await client.generateJson({
      system: SYSTEM_INSTRUCTION,
      prompt,
      schema: RESPONSE_SCHEMA,
      /*
       * Reasoning earns its keep here: finding the hole in a review is not
       * copying out facts, it is holding the entries up against each other.
       * Three questions for a whole game — the extra seconds ruin nobody.
       */
      effort: "high",
    });

    if (!answer) throw new Error("The model returned an empty response");
    return answer;
  });

  const parsed = JSON.parse(raw) as { questions?: unknown };
  if (!Array.isArray(parsed.questions)) return [];

  return parsed.questions
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 10 && item.length <= 300)
    .slice(0, 3);
}
