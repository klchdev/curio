import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { CandidateGame, ReviewCorpusItem, TasteTag } from "./queries";
import { ADVISOR_TIER_VALUES, type AdvisorTier } from "./vocab";
import { withLlm, type JsonSchema, type LlmCredentials } from "./llm";

export const MAX_PICKS = 40;

export const GROUNDING_VALUES = ["known", "from-description", "guess"] as const;
export type Grounding = (typeof GROUNDING_VALUES)[number];

/** Advice over a whole library streams for up to a minute — the usual timeout won't do. */
const STREAM_TIMEOUT_MS = 300_000;

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

Про каждого кандидата ты видишь жанры, дату релиза и описание из магазина. Если игру ты знаешь — опирайся на знание. Если не знаешь (инди, свежий релиз) — опирайся на описание и честно ставь grounding. Придуманная деталь хуже честного «сужу по описанию»: игрок потратит на неё вечер.

grounding: known — игру действительно знаешь; from-description — судишь по описанию и жанрам; guess — не знаешь и описания нет.

profile — 4-7 пунктов маркдауна о том, какой это игрок. Только неочевидное, выведенное из сопоставления отзывов. Обращайся на «ты». Каждый пункт подкрепляй конкретными играми из его отзывов.

Хотя бы один пункт построй на динамике: где мнение менялось по ходу игры и что именно его развернуло. Если лент в отзывах нет — не выдумывай, пропусти.

`;

/*
 * The instruction itself stays in Russian: it is an internal prompt, and the
 * model works with it just the same either way. The user's language decides
 * only one thing — what the answer they see is written in.
 */
const OUTPUT_LANGUAGE: Record<Locale, string> = {
  ru: "Пиши по-русски.",
  en: "Write in English, even though these instructions are in Russian. The player's reviews may be in Russian — quote and paraphrase them in English.",
};

/*
 * The key order here carries meaning: the reasoning comes after the verdict,
 * and the model writes its answer left to right. There is no separate
 * `propertyOrdering` any more — the adapter derives it from the field order of
 * the schema.
 */
const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    profile: {
      type: "string",
      description: "Портрет игрока: 4-7 пунктов маркдауна, каждый со ссылкой на конкретные игры",
    },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          steamAppId: { type: "integer", description: "steamAppId строго из списка кандидатов" },
          tier: { type: "string", enum: [...ADVISOR_TIER_VALUES] },
          reason: { type: "string", description: "1-2 предложения со ссылкой на отзывы игрока" },
          grounding: {
            type: "string",
            enum: ["known", "from-description", "guess"],
            description:
              "known — игру знаю; from-description — сужу по описанию из магазина; guess — не знаю игру",
          },
        },
        required: ["steamAppId", "tier", "reason", "grounding"],
      },
    },
  },
  required: ["profile", "picks"],
};

/**
 * The tag profile — a squeeze of the same reviews, only already rolled up.
 *
 * The model can derive this on its own, but it derives it from scratch every
 * time and slightly differently every time. A ready-made summary keeps it on
 * the same words and shows the reach: a complaint drawn from seven games
 * carries a different weight than one drawn from a single game.
 */
function formatProfile(profile: TasteTag[]): string {
  if (profile.length === 0) return "Тегов пока нет — суди по текстам отзывов.";
  return profile
    .map((tag) => `- ${tag.kind === "praise" ? "хвалит" : "ругает"}: ${tag.label} (игр: ${tag.games})`)
    .join("\n");
}

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
    const labels = review.labels.length ? ` [${review.labels.join(", ")}]` : "";
    return `- ${review.title} (${meta})${labels}: ${note || "без заметки"}`;
  });
  return lines.join("\n");
}

/**
 * A candidate ships with its genres and store description. The prompt used to
 * carry the title and nothing else, so the model filled in what the game
 * actually is from memory — for indies and fresh releases that produced
 * confident-sounding fiction.
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
        // The description runs long, and all we need is what the game is about
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
}

/** How many games the model has produced — counted off the JSON accumulated so far. */
function countReadyPicks(text: string): number {
  return (text.match(/"steamAppId"/g) ?? []).length;
}

export async function generateRecommendations(
  reviews: ReviewCorpusItem[],
  candidates: CandidateGame[],
  profile: TasteTag[],
  creds: LlmCredentials | null,
  locale: Locale = DEFAULT_LOCALE,
  onProgress?: (picksReady: number) => void
): Promise<GeneratedRecommendations> {
  const prompt = [
    `# Отзывы игрока (${reviews.length})`,
    "В квадратных скобках — свойства, которые разбор вынес из его записей: + похвала, − претензия.",
    formatReviews(reviews),
    "",
    `# Профиль вкуса: что он хвалит и ругает вообще`,
    formatProfile(profile),
    "",
    `# Кандидаты — нетронутое, отсюда берутся picks (${candidates.length})`,
    "Формат: steamAppId<TAB>название<TAB>наиграно<TAB>последний запуск, следующей строкой — жанры, дата релиза и описание из магазина",
    formatCandidates(candidates),
    "",
    "Разбери вкус, раздай тиры кандидатам и вынеси вердикт по брошенному.",
  ].join("\n");

  const raw = await withLlm(
    creds,
    async (client) => {
      // The ready-picks counter lives inside the attempt: if the stream breaks,
      // progress starts over, otherwise it would creep upward on the retry.
      // We accumulate the chunks ourselves: "steamAppId" can split across them
      let text = "";
      let lastReported = 0;

      return client.streamJson(
        {
          system: `${SYSTEM_INSTRUCTION}\n\n${OUTPUT_LANGUAGE[locale]}`,
          prompt,
          schema: RESPONSE_SCHEMA,
        },
        (delta) => {
          text += delta;
          const ready = countReadyPicks(text);
          if (onProgress && ready > lastReported) {
            lastReported = ready;
            onProgress(ready);
          }
        }
      );
    },
    { timeoutMs: STREAM_TIMEOUT_MS }
  );

  if (!raw) throw new Error("The model returned an empty response");

  let parsed: GeneratedRecommendations;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The model returned invalid JSON");
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
    // Silence about the source of knowledge counts as a guess, not as knowledge
    .map((pick) => ({
      ...pick,
      grounding: GROUNDING_VALUES.includes(pick.grounding) ? pick.grounding : "guess",
    }));

  if (picks.length === 0) throw new Error("The model returned no valid games");

  return { profile: parsed.profile ?? "", picks };
}
