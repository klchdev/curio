import { GoogleGenAI, Type } from "@google/genai";
import type { CandidateGame, ReviewCorpusItem } from "./queries";
import { ADVISOR_TIER_VALUES, type AdvisorTier } from "./vocab";

export const RECOMMENDATION_MODEL = "gemini-3.6-flash";

export const MAX_PICKS = 40;

const SYSTEM_INSTRUCTION = `Ты разбираешь вкус игрока по его собственным отзывам и советуешь, что запустить из его библиотеки Steam.

Отзывы — единственный источник правды о вкусе. Не опирайся на общую репутацию игр и на то, что «принято хвалить».

Как думать:
1. Сначала найди закономерности, которые игрок сам не проговаривает. Сравнивай его же вердикты между собой: две игры одного жанра с разными тирами — это и есть ось вкуса. Обращай внимание на то, что он ДОПРОХОДИТ (verdict=finished), а не только на то, что высоко оценил.
2. Отдельно найди антипрофиль — механики и жанры, которые он последовательно отвергает, и его собственные формулировки об этом.
3. Затем раздай тиры кандидатам.

Ты выдаёшь два разных списка.

## picks — что запустить
Берутся только из списка КАНДИДАТОВ: это нетронутое или запущенное на пару минут, вкус по ним ещё не сформирован.
- Советуй ТОЛЬКО игры из списка кандидатов, строго по их steamAppId. Ничего не выдумывай.
- Тир D — «не трать время»: то, что противоречит его антипрофилю. Такие тоже включай, 3-8 штук, с объяснением.
- В reason обязательно ссылайся на его конкретные отзывы по названиям игр («Expeditions: Rome у тебя A/5 и пройдена»). Без общих слов вроде «отличная игра» и «тебе понравится».
- reason — 1-2 предложения, по делу.
- Всего ${MAX_PICKS} игр максимум, S — не больше 8.

## abandoned — разбор брошенного
Берутся только из списка БРОШЕННОГО: игрок сам пометил их как брошенные. Их НЕЛЬЗЯ добавлять в picks.
Для каждой выбери позицию:
- stance="agree" — брошено по делу. Объясни, ЧЕМ ИМЕННО игра противоречит его вкусу, опираясь на его отзывы. Не пересказывай очевидное, назови конкретную механику или свойство.
- stance="disagree" — ты считаешь, что он неправ и стоит вернуться. Спорь прямо и с аргументом: покажи, что именно он не успел увидеть за наигранное время, и почему это попадает в его вкус. Можно с иронией, но по делу.
Не подстраивайся: если есть основания спорить — спорь. Ставь disagree там, где реально видишь ошибку, а не для баланса.
Разбери 6-12 игр, text — 1-3 предложения.

profile — 4-7 пунктов маркдауна о том, какой это игрок. Только неочевидное, выведенное из сопоставления отзывов. Обращайся на «ты». Каждый пункт подкрепляй конкретными играми из его отзывов.

Пиши по-русски.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    profile: {
      type: Type.STRING,
      description: "Портрет игрока: 4-7 пунктов маркдауна, каждый со ссылкой на конкретные игры",
    },
    picks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          steamAppId: { type: Type.INTEGER, description: "steamAppId строго из списка кандидатов" },
          tier: { type: Type.STRING, enum: [...ADVISOR_TIER_VALUES] },
          reason: { type: Type.STRING, description: "1-2 предложения со ссылкой на отзывы игрока" },
        },
        required: ["steamAppId", "tier", "reason"],
        propertyOrdering: ["steamAppId", "tier", "reason"],
      },
    },
    abandoned: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          steamAppId: { type: Type.INTEGER, description: "steamAppId строго из списка брошенного" },
          stance: {
            type: Type.STRING,
            enum: ["agree", "disagree"],
            description: "agree — брошено по делу, disagree — стоит вернуться",
          },
          text: { type: Type.STRING, description: "1-3 предложения с аргументом" },
        },
        required: ["steamAppId", "stance", "text"],
        propertyOrdering: ["steamAppId", "stance", "text"],
      },
    },
  },
  required: ["profile", "picks", "abandoned"],
  propertyOrdering: ["profile", "picks", "abandoned"],
};

function formatReviews(reviews: ReviewCorpusItem[]): string {
  const lines = reviews.map((review) => {
    const meta = [
      review.tier ? `тир ${review.tier}` : null,
      review.rating ? `оценка ${review.rating}/5` : null,
      review.verdict,
      `${review.hours}ч`,
      review.isDemo ? "демка" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const note = (review.note ?? "").replace(/\s*\n+\s*/g, " | ").trim();
    return `- ${review.title} (${meta}): ${note || "без заметки"}`;
  });
  return lines.join("\n");
}

function formatCandidates(candidates: CandidateGame[]): string {
  const lines = candidates.map((game) => {
    const last = game.lastPlayedAt
      ? new Date(game.lastPlayedAt).toISOString().slice(0, 7)
      : "никогда не запускал";
    return `${game.steamAppId}\t${game.title}\t${game.hours}ч\t${last}`;
  });
  return lines.join("\n");
}

export interface GeneratedRecommendations {
  profile: string;
  picks: { steamAppId: number; tier: AdvisorTier; reason: string }[];
  abandoned: { steamAppId: number; stance: "agree" | "disagree"; text: string }[];
}

/** Сколько игр модель уже выдала — считаем по накопленному куску JSON. */
function countReadyPicks(text: string): number {
  return (text.match(/"steamAppId"/g) ?? []).length;
}

export async function generateRecommendations(
  reviews: ReviewCorpusItem[],
  candidates: CandidateGame[],
  abandonedGames: CandidateGame[],
  apiKey: string,
  onProgress?: (picksReady: number) => void
): Promise<GeneratedRecommendations> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = [
    `# Отзывы игрока (${reviews.length})`,
    formatReviews(reviews),
    "",
    `# Кандидаты — нетронутое, отсюда берутся picks (${candidates.length})`,
    "Формат: steamAppId<TAB>название<TAB>наиграно<TAB>последний запуск",
    formatCandidates(candidates),
    "",
    `# Брошенное — отсюда берётся abandoned (${abandonedGames.length})`,
    "Поиграл и забросил без отзыва. В picks не добавлять.",
    formatCandidates(abandonedGames),
    "",
    "Разбери вкус, раздай тиры кандидатам и вынеси вердикт по брошенному.",
  ].join("\n");

  const stream = await ai.models.generateContentStream({
    model: RECOMMENDATION_MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let raw = "";
  let lastReported = 0;
  for await (const chunk of stream) {
    raw += chunk.text ?? "";
    const ready = countReadyPicks(raw);
    if (onProgress && ready > lastReported) {
      lastReported = ready;
      onProgress(ready);
    }
  }

  if (!raw) throw new Error("Gemini вернул пустой ответ");

  let parsed: GeneratedRecommendations;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini вернул невалидный JSON");
  }

  const allowed = new Set(candidates.map((c) => c.steamAppId));
  const seen = new Set<number>();
  const picks = (parsed.picks ?? [])
    .filter((pick) => {
      if (!allowed.has(pick.steamAppId) || seen.has(pick.steamAppId)) return false;
      if (!ADVISOR_TIER_VALUES.includes(pick.tier)) return false;
      seen.add(pick.steamAppId);
      return true;
    })
    .slice(0, MAX_PICKS);

  if (picks.length === 0) throw new Error("Gemini не вернул ни одной валидной игры");

  const allowedAbandoned = new Set(abandonedGames.map((g) => g.steamAppId));
  const seenAbandoned = new Set<number>();
  const abandoned = (parsed.abandoned ?? []).filter((item) => {
    if (!allowedAbandoned.has(item.steamAppId) || seenAbandoned.has(item.steamAppId)) return false;
    if (item.stance !== "agree" && item.stance !== "disagree") return false;
    seenAbandoned.add(item.steamAppId);
    return true;
  });

  return { profile: parsed.profile ?? "", picks, abandoned };
}
