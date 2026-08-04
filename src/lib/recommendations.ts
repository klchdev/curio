import { GoogleGenAI, Type } from "@google/genai";
import type { CandidateGame, ReviewCorpusItem } from "./queries";

export const RECOMMENDATION_MODEL = "gemini-3.6-flash";

const MAX_PICKS = 40;
const TIERS = ["S", "A", "B", "C", "D"] as const;
type Tier = (typeof TIERS)[number];

const SYSTEM_INSTRUCTION = `Ты разбираешь вкус игрока по его собственным отзывам и советуешь, что запустить из его библиотеки Steam.

Отзывы — единственный источник правды о вкусе. Не опирайся на общую репутацию игр и на то, что «принято хвалить».

Как думать:
1. Сначала найди закономерности, которые игрок сам не проговаривает. Сравнивай его же вердикты между собой: две игры одного жанра с разными тирами — это и есть ось вкуса. Обращай внимание на то, что он ДОПРОХОДИТ (verdict=finished), а не только на то, что высоко оценил.
2. Отдельно найди антипрофиль — механики и жанры, которые он последовательно отвергает, и его собственные формулировки об этом.
3. Затем раздай тиры кандидатам.

Правила для рекомендаций:
- Советуй ТОЛЬКО игры из переданного списка кандидатов, строго по их steamAppId. Ничего не выдумывай.
- Часы у кандидата — сигнал. 0 часов и без даты запуска = нетронуто, лучший материал для S/A. Несколько часов и недавняя дата = игрок уже попробовал и отложил; это ближе к C/D, даже если по жанру подходит.
- Игру, которую он попробовал и бросил недавно, не поднимай выше C: он уже проголосовал руками.
- Тир D — «не трать время»: то, что противоречит его антипрофилю. Такие тоже включай, 3-8 штук, с объяснением.
- В reason обязательно ссылайся на его конкретные отзывы по названиям игр («Expeditions: Rome у тебя A/5 и пройдена»). Без общих слов вроде «отличная игра» и «тебе понравится».
- reason — 1-2 предложения, по делу.
- Всего ${MAX_PICKS} игр максимум, S — не больше 8.

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
          tier: { type: Type.STRING, enum: [...TIERS] },
          reason: { type: Type.STRING, description: "1-2 предложения со ссылкой на отзывы игрока" },
        },
        required: ["steamAppId", "tier", "reason"],
        propertyOrdering: ["steamAppId", "tier", "reason"],
      },
    },
  },
  required: ["profile", "picks"],
  propertyOrdering: ["profile", "picks"],
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
  picks: { steamAppId: number; tier: Tier; reason: string }[];
}

export async function generateRecommendations(
  reviews: ReviewCorpusItem[],
  candidates: CandidateGame[],
  apiKey: string
): Promise<GeneratedRecommendations> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = [
    `# Отзывы игрока (${reviews.length})`,
    formatReviews(reviews),
    "",
    `# Кандидаты из библиотеки (${candidates.length})`,
    "Формат: steamAppId<TAB>название<TAB>наиграно<TAB>последний запуск",
    formatCandidates(candidates),
    "",
    "Разбери вкус и раздай тиры кандидатам.",
  ].join("\n");

  const response = await ai.models.generateContent({
    model: RECOMMENDATION_MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const raw = response.text;
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
      if (!TIERS.includes(pick.tier)) return false;
      seen.add(pick.steamAppId);
      return true;
    })
    .slice(0, MAX_PICKS);

  if (picks.length === 0) throw new Error("Gemini не вернул ни одной валидной игры");

  return { profile: parsed.profile ?? "", picks };
}
