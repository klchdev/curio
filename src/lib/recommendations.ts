import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { CandidateGame, ReviewCorpusItem } from "./queries";
import { ADVISOR_TIER_VALUES, type AdvisorTier } from "./vocab";

export const RECOMMENDATION_MODEL = "gemini-3.6-flash";

export const MAX_PICKS = 40;

export const GROUNDING_VALUES = ["known", "from-description", "guess"] as const;
export type Grounding = (typeof GROUNDING_VALUES)[number];

const RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 6000, 15000];

/** Код ошибки прячется в JSON внутри message — SDK не выносит его наружу. */
export function errorCode(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(message);
    const code = parsed?.error?.code;
    return typeof code === "number" ? code : null;
  } catch {
    const match = message.match(/\b(429|500|503|504)\b/);
    return match ? Number(match[1]) : null;
  }
}

const SYSTEM_INSTRUCTION = `Ты разбираешь вкус игрока по его собственным отзывам и советуешь, что запустить из его библиотеки Steam.

Отзывы — единственный источник правды о вкусе. Не опирайся на общую репутацию игр и на то, что «принято хвалить».

Как читать отзывы. У части игр отзыв — не один текст, а лента записей со штампом наигранного времени: «[3ч] ... [11ч] ...». Это его мнение в динамике, и оно ценнее любого снимка.

Как думать:
1. Сначала найди закономерности, которые игрок сам не проговаривает. Сравнивай его же вердикты между собой: две игры одного жанра с разными тирами — это и есть ось вкуса. Обращай внимание на то, что он ДОПРОХОДИТ (verdict=finished), а не только на то, что высоко оценил.
2. Там, где есть лента, смотри, КАК менялось мнение с часами. Восторг на первом часу, угасший к десятому, и медленный разогрев — это два противоположных сигнала, хотя итоговый тир может совпадать. Что именно вытащило игру или убило её к середине — самое полезное, что у тебя есть.
3. Отдельно найди антипрофиль — механики и жанры, которые он последовательно отвергает, и его собственные формулировки об этом.
4. Затем раздай тиры кандидатам.

Ты выдаёшь два разных списка.

## picks — что запустить
Берутся только из списка КАНДИДАТОВ: это нетронутое или запущенное на пару минут, вкус по ним ещё не сформирован.
- Советуй ТОЛЬКО игры из списка кандидатов, строго по их steamAppId. Ничего не выдумывай.
- Тир D — «не трать время»: то, что противоречит его антипрофилю. Такие тоже включай, 3-8 штук, с объяснением.
- В reason обязательно ссылайся на его конкретные отзывы по названиям игр («Expeditions: Rome у тебя A/5 и пройдена»). Без общих слов вроде «отличная игра» и «тебе понравится».
- reason — 1-2 предложения, по делу.
- Всего ${MAX_PICKS} игр максимум.

КАЛИБРОВКА ТИРОВ. Ты судишь об играх по жанру и рекламному описанию из магазина — это догадка, а не знание того, как игра устроена в руках. Поэтому тир должен быть осторожным:
- S — «бросай текущее и запускай». Такого в списке 1-3 игры, не больше. Ставится, только когда совпадение с его вкусом видно по нескольким его же отзывам сразу.
- A — очень вероятно зайдёт. До 6 игр.
- B — рабочая лошадка списка, сюда попадает большинство. При сомнении ставь B, а не A.
- C — под настроение.
- D — «не трать время», 3-8 штук, с объяснением.

Завышенный тир дороже заниженного: по нему человек бросит то, что уже играет.

## abandoned — разбор брошенного
Берутся только из списка БРОШЕННОГО: игрок сам пометил их как брошенные. Их НЕЛЬЗЯ добавлять в picks.
Для каждой выбери позицию:
- stance="agree" — брошено по делу. Объясни, ЧЕМ ИМЕННО игра противоречит его вкусу, опираясь на его отзывы. Не пересказывай очевидное, назови конкретную механику или свойство.
- stance="disagree" — ты считаешь, что он неправ и стоит вернуться. Спорь прямо и с аргументом: покажи, что именно он не успел увидеть за наигранное время, и почему это попадает в его вкус. Можно с иронией, но по делу.
Не подстраивайся: если есть основания спорить — спорь. Ставь disagree там, где реально видишь ошибку, а не для баланса.
Разбери 6-12 игр, text — 1-3 предложения.

Про каждого кандидата ты видишь жанры, дату релиза и описание из магазина. Если игру ты знаешь — опирайся на знание. Если не знаешь (инди, свежий релиз) — опирайся на описание и честно ставь grounding. Придуманная деталь хуже честного «сужу по описанию»: игрок потратит на неё вечер.

grounding: known — игру действительно знаешь; from-description — судишь по описанию и жанрам; guess — не знаешь и описания нет.

profile — 4-7 пунктов маркдауна о том, какой это игрок. Только неочевидное, выведенное из сопоставления отзывов. Обращайся на «ты». Каждый пункт подкрепляй конкретными играми из его отзывов.

Хотя бы один пункт построй на динамике: где мнение менялось по ходу игры и что именно его развернуло. Если лент в отзывах нет — не выдумывай, пропусти.

`;

/*
 * Сама инструкция остаётся русской: это внутренний промпт, модель работает
 * с ним одинаково. От языка пользователя зависит только то, на чём написан
 * ответ, который он увидит.
 */
const OUTPUT_LANGUAGE: Record<Locale, string> = {
  ru: "Пиши по-русски.",
  en: "Write in English, even though these instructions are in Russian. The player's reviews may be in Russian — quote and paraphrase them in English.",
};

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
          grounding: {
            type: Type.STRING,
            enum: ["known", "from-description", "guess"],
            description:
              "known — игру знаю; from-description — сужу по описанию из магазина; guess — не знаю игру",
          },
        },
        required: ["steamAppId", "tier", "reason", "grounding"],
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

/**
 * Кандидат уезжает с жанрами и описанием из магазина. Раньше в промпте было
 * только название, и всё содержание игры модель добирала из памяти — по инди
 * и по свежим релизам это давало уверенно звучащую выдумку.
 */
function formatCandidates(candidates: CandidateGame[]): string {
  return candidates
    .map((game) => {
      const last = game.lastPlayedAt
        ? new Date(game.lastPlayedAt).toISOString().slice(0, 7)
        : "никогда не запускал";

      const facts = [
        game.genres,
        game.releaseDate,
        // Описание длинное, а нужен только предмет разговора
        game.description ? game.description.slice(0, 220) : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `${game.steamAppId}\t${game.title}\t${game.hours}ч\t${last}${facts ? `\n\t${facts}` : "\t[описания нет]"}`;
    })
    .join("\n");
}

export interface GeneratedRecommendations {
  profile: string;
  picks: {
    steamAppId: number;
    tier: AdvisorTier;
    reason: string;
    grounding: Grounding;
  }[];
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
  locale: Locale = DEFAULT_LOCALE,
  onProgress?: (picksReady: number) => void
): Promise<GeneratedRecommendations> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = [
    `# Отзывы игрока (${reviews.length})`,
    formatReviews(reviews),
    "",
    `# Кандидаты — нетронутое, отсюда берутся picks (${candidates.length})`,
    "Формат: steamAppId<TAB>название<TAB>наиграно<TAB>последний запуск, следующей строкой — жанры, дата релиза и описание из магазина",
    formatCandidates(candidates),
    "",
    `# Брошенное — отсюда берётся abandoned (${abandonedGames.length})`,
    "Поиграл и забросил без отзыва. В picks не добавлять.",
    formatCandidates(abandonedGames),
    "",
    "Разбери вкус, раздай тиры кандидатам и вынеси вердикт по брошенному.",
  ].join("\n");

  /*
   * 503 «high demand» у flash-моделей — обычное дело в пиковые часы и проходит
   * само за секунды. Раньше такой ответ убивал весь прогон, хотя достаточно
   * подождать. Ретраим только временные коды: на 400 и 403 повтор бессмысленен.
   */
  let raw = "";
  let lastReported = 0;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const stream = await ai.models.generateContentStream({
        model: RECOMMENDATION_MODEL,
        contents: prompt,
        config: {
          systemInstruction: `${SYSTEM_INSTRUCTION}\n\n${OUTPUT_LANGUAGE[locale]}`,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      raw = "";
      lastReported = 0;
      for await (const chunk of stream) {
        raw += chunk.text ?? "";
        const ready = countReadyPicks(raw);
        if (onProgress && ready > lastReported) {
          lastReported = ready;
          onProgress(ready);
        }
      }
      break;
    } catch (err) {
      const code = errorCode(err);
      const retriable = code === 429 || code === 500 || code === 503 || code === 504;
      if (!retriable || attempt >= RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
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
    .slice(0, MAX_PICKS)
    // Молчание про источник знания приравниваем к догадке, а не к знанию
    .map((pick) => ({
      ...pick,
      grounding: GROUNDING_VALUES.includes(pick.grounding) ? pick.grounding : "guess",
    }));

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
