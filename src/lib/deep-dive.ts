import { Type } from "@google/genai";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { ReviewCorpusItem } from "./queries";
import type { AppReviews } from "./steam";
import { withGemini, GEMINI_MODEL, type GeminiKeys } from "./gemini";
import { ADVISOR_TIER_VALUES, type AdvisorTier } from "./vocab";

/**
 * Разбор одной игры: описание из магазина плюс отзывы других игроков,
 * пропущенные через вкус конкретного человека.
 *
 * Опасность режима — в том, что чужие отзывы могут подменить собой вкус
 * игрока: модель начнёт пересказывать общее мнение, ровно то, от чего этот
 * продукт уходит. Поэтому в инструкции чужие отзывы названы фактами об игре,
 * а право выносить вердикт оставлено только за отзывами самого игрока.
 */
const SYSTEM_INSTRUCTION = `Ты разбираешь одну конкретную игру для одного конкретного игрока.

У тебя три источника, и они не равны по весу:

1. ОТЗЫВЫ ИГРОКА — единственный источник правды о его вкусе. Только по ним решается, зайдёт игра или нет.
2. ОПИСАНИЕ ИЗ МАГАЗИНА — что это за игра формально.
3. ОТЗЫВЫ ДРУГИХ ИГРОКОВ — факты о том, как игра устроена и что в ней раздражает. Это показания свидетелей, а не вердикт.

Как обращаться с чужими отзывами. Из них бери конкретику: «первые три часа медленные», «оптимизация плохая», «сюжет обрывается», «боёвка однообразная к середине». Не бери оценку: то, что игру хвалят тысячи людей, само по себе ничего не говорит об этом игроке. Хвалебный хор при несовпадении с его вкусом — аргумент против, а не за.

В отрицательных отзывах обычно больше конкретики, и её удобно сверять с тем, что игрока раздражало раньше. Но это про удобство сверки, а не про вес: похвала, попадающая в его вкус, — такой же аргумент, только со знаком плюс.

ВАЖНО ПРО ВЫБОРКУ. Тебе показывают примерно поровну похвал и претензий, но в магазине их соотношение другое — оно указано числами перед отзывами. Выборка перекошена намеренно, чтобы претензии вообще попали к тебе на глаза. Не принимай её за распределение мнений: если игру хвалят 96% людей, десяток отобранных жалоб не делает её спорной.

Как читать отзывы игрока. У части игр отзыв — лента записей со штампом наигранного времени: «[3ч] ... [11ч] ...». Смотри, КАК менялось мнение с часами.

summary — что это за игра на самом деле, 1-2 предложения. Не пересказ рекламного описания: скажи, чем игра оказывается в руках. Иногда это хуже обещанного (на деле гринд), иногда лучше (простенькая с виду вещь оказывается плотной историей) — пиши то, что видишь.

forYou — почему зайдёт именно ему. Ссылайся на его отзывы по названиям игр. Если не за что зацепиться — так и напиши, не выдумывай.

against — что оттолкнёт именно его. Связывай жалобы из чужих отзывов с его известными нелюбовями.

forYou и against одинаково важны, и ни одна из них не обязана быть длинной. Если игра ему явно подходит и оттолкнуть особо нечему — так и напиши одной строкой. Выискивать претензии ради заполнения поля не надо: раздел, набитый мелочами, которые ему безразличны, вреднее пустого.

complaints — на что жалуются вообще, 2-4 пункта фактами, без оценок.

fit — итог: yes (стоит запускать), maybe (под настроение или с оговорками), no (не его игра).

tier — оценка S/A/B/C/D после разбора. Первый проход выставлял тир по жанру и рекламному описанию; считай его обоснованной догадкой, а не ошибкой по умолчанию.

Правило простое: **менять тир только при конкретной новой улике**. Вскрылась механика, которая игроку поперёк (жёсткие лимиты времени, гринд, беготня) — понижай. Игра оказалась глубже или ближе к его вкусу, чем следовало из описания, — повышай. Не нашлось ни того ни другого — оставь как есть; совпадение с первым проходом это нормальный и частый исход.

Претензии есть у любой игры. Сами по себе они не повод понижать: понижение оправдано, только если претензия попадает именно в этого игрока. Шероховатости, которые ему безразличны, на тир не влияют.

**Шаг не больше одной ступени** (S→A, B→C и так далее). Первый проход не идиот: он читал те же жанры и то же описание, и на три ступени ошибиться не мог. Прыжок через ступень допустим только при радикальном расхождении — игра оказалась другого жанра, сломана, или длится пару часов вместо обещанных десятков. В этом случае причина должна быть прямо названа в against.

Ты оцениваешь совпадение с его вкусом, а не качество игры. Хорошо сделанная игра не для него — это C. Шероховатая, но ровно про него — это A.

fit и tier не должны противоречить друг другу: «yes» не сочетается с тиром C или ниже, «no» — с тиром S или A.

Названия игр помечай одной звёздочкой: *Metro Exodus*. Двойных квадратных скобок и заголовков не используй.

Обращайся на «ты». Не подстраивайся: если игра ему не подходит, скажи прямо.`;

const OUTPUT_LANGUAGE: Record<Locale, string> = {
  ru: "Пиши по-русски.",
  en: "Write in English, even though these instructions are in Russian. The reviews may be in Russian — paraphrase them in English.",
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fit: { type: Type.STRING, enum: ["yes", "maybe", "no"] },
    tier: {
      type: Type.STRING,
      enum: ["S", "A", "B", "C", "D"],
      description: "Пересмотренный тир после чтения отзывов",
    },
    summary: { type: Type.STRING, description: "Что это за игра на самом деле, 1-2 предложения" },
    forYou: { type: Type.STRING, description: "Почему зайдёт именно этому игроку, со ссылками на его отзывы" },
    against: { type: Type.STRING, description: "Что оттолкнёт именно его" },
    complaints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-4 факта о том, на что жалуются игроки",
    },
  },
  required: ["fit", "tier", "summary", "forYou", "against", "complaints"],
};

export interface DeepDive {
  fit: "yes" | "maybe" | "no";
  /** Тир после чтения отзывов — может разойтись с первым проходом. */
  tier: AdvisorTier;
  summary: string;
  forYou: string;
  against: string;
  complaints: string[];
}

export interface DeepDiveInput {
  title: string;
  genres: string | null;
  releaseDate: string | null;
  description: string | null;
  reviews: AppReviews | null;
  corpus: ReviewCorpusItem[];
  /** Что поставил первый проход и почему — точка отсчёта для пересмотра. */
  firstPass: { tier: string; reason: string } | null;
}

function formatCorpus(corpus: ReviewCorpusItem[]): string {
  return corpus
    .map((item) => {
      const meta = [
        item.verdict,
        item.tier ? `тир ${item.tier}` : null,
        item.rating ? `оценка ${item.rating}/5` : null,
        `${item.hours}ч`,
      ]
        .filter(Boolean)
        .join(", ");
      return `- ${item.title} (${meta}): ${item.note || "без заметки"}`;
    })
    .join("\n");
}

function formatOthers(reviews: AppReviews | null): string {
  if (!reviews || reviews.reviews.length === 0) {
    return "Отзывов в магазине нет — опирайся только на описание.";
  }

  const total = reviews.totalPositive + reviews.totalNegative;
  const share = total > 0 ? Math.round((reviews.totalPositive / total) * 100) : null;
  const shown = reviews.reviews.filter((r) => !r.positive).length;

  const head = [
    `Оценка магазина: ${reviews.scoreLabel ?? "нет"}`,
    share !== null ? `${share}% положительных из ${total} отзывов` : null,
    `в выборке ниже ${reviews.reviews.length - shown} похвал и ${shown} претензий — это не пропорция, а намеренный перекос`,
  ]
    .filter(Boolean)
    .join(" · ");
  const body = reviews.reviews
    .map((r) => `[${r.positive ? "+" : "−"}, ${r.hoursAtReview}ч, ${r.votes} голосов] ${r.text}`)
    .join("\n");

  return `${head}\n\n${body}`;
}

export async function generateDeepDive(
  input: DeepDiveInput,
  keys: GeminiKeys,
  locale: Locale = DEFAULT_LOCALE
): Promise<DeepDive> {
  const prompt = [
    `# Игра: ${input.title}`,
    [input.genres, input.releaseDate].filter(Boolean).join(" · "),
    input.description ?? "Описания в магазине нет.",
    "",
    `# Отзывы игрока (${input.corpus.length}) — единственный источник правды о вкусе`,
    formatCorpus(input.corpus),
    "",
    "# Отзывы других игроков — факты об игре, не вердикт",
    formatOthers(input.reviews),
    "",
    input.firstPass
      ? `# Оценка первого прохода: тир ${input.firstPass.tier}\n${input.firstPass.reason}\nЭто твоя точка отсчёта. Ниже ${input.firstPass.tier} на одну ступень или выше на одну — обычное дело; больше — только при радикальном расхождении, названном в against.`
      : "# Первого прохода по этой игре не было — ставь тир с нуля.",
    "",
    "Разбери, стоит ли этому игроку запускать эту игру.",
  ].join("\n");

  const raw = await withGemini(keys, async (ai) => {
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: `${SYSTEM_INSTRUCTION}\n\n${OUTPUT_LANGUAGE[locale]}`,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const text = res.text ?? "";
    if (!text) throw new Error("Gemini вернул пустой ответ");
    return text;
  });

  const parsed = JSON.parse(raw) as DeepDive;
  return {
    fit: parsed.fit === "yes" || parsed.fit === "no" ? parsed.fit : "maybe",
    tier: ADVISOR_TIER_VALUES.includes(parsed.tier) ? parsed.tier : "C",
    summary: parsed.summary ?? "",
    forYou: parsed.forYou ?? "",
    against: parsed.against ?? "",
    complaints: Array.isArray(parsed.complaints) ? parsed.complaints.slice(0, 6) : [],
  };
}
