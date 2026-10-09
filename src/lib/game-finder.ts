import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { FinderLibraryGame, ReviewCorpusItem, TasteTag } from "./queries";
import { withLlm, type JsonSchema, type LlmCredentials } from "./llm";

/**
 * The finder chat's first pass: a request in the player's own words turned
 * into a shortlist — some from the library, some from the store.
 *
 * It is only a shortlist. The verdict on each game belongs to the deep dive
 * that runs after it, the same one the "dig deeper" button makes, because
 * here the model judges by memory and genre while the dive reads the store
 * page and other players' reviews. So this pass is told to cast a reasonably
 * wide net rather than to be right.
 */

export const MAX_LIBRARY_PICKS = 6;
export const MAX_STORE_PICKS = 6;

/** The library goes in whole and the prompt is big — the usual two minutes may not do. */
const TIMEOUT_MS = 240_000;

const SYSTEM_INSTRUCTION = `Ты помогаешь игроку подобрать, во что играть, по его запросу.

Запрос — главное. Игрок описывает своими словами, чего хочет: настроение, механики, длину, «что-то как X, но без Y». Твоя задача — понять запрос и прикинуть игры, которые под него подходят.

Вкус игрока — второй фильтр. Его отзывы — единственный источник правды о том, что ему заходит и что он бросает. Если запрос ссылается на игры, в которые он играл («как Disco Elysium»), найди их в его отзывах и разберись, ЧТО именно ему там понравилось или не понравилось, — похожесть ищи по этому, а не по жанровому ярлыку.

Ты выдаёшь два списка.

## library — из его библиотеки
- Только игры из списка БИБЛИОТЕКА, строго по их steamAppId. Ничего не выдумывай.
- По умолчанию предлагай несыгранное и едва начатое. Сыгранное и брошенное — только если запрос сам об этом («что из брошенного стоит вернуться»). Пройденное и оценённое не предлагай, если об этом не просят.
- До ${MAX_LIBRARY_PICKS} игр. Если подходящего нет — честно оставь список коротким или пустым, не добирай мусором.

## store — из магазина Steam, чего у него нет
- Только игры, которые реально существуют и продаются в Steam. Название пиши так, как оно записано в Steam, на английском, без издания, если не важно какое.
- Не предлагай то, что уже есть в его библиотеке.
- До ${MAX_STORE_PICKS} игр. Предпочитай игры, которые ты действительно знаешь: по каждой потом будет разбор страницы магазина и отзывов, и выдуманная игра просто не найдётся.

why — 1-2 предложения: почему игра отвечает на запрос, со ссылкой на его отзывы по названиям, где это уместно. Без общих слов вроде «отличная игра».

understood — 1-2 предложения: как ты понял запрос. Если запрос размытый — назови, как ты его сузил.

Если это продолжение разговора, учитывай предыдущие сообщения: уточнение вроде «а без рогаликов» или «что-нибудь покороче» меняет прошлый запрос, а не заменяет его. Игры, которые ты уже предлагал, не повторяй, если об этом не просят.

Названия игр в тексте помечай одной звёздочкой: *Metro Exodus*. Обращайся на «ты».`;

const OUTPUT_LANGUAGE: Record<Locale, string> = {
  ru: "Пиши по-русски.",
  en: "Write in English, even though these instructions are in Russian. The player's reviews may be in Russian — paraphrase them in English.",
};

const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    understood: { type: "string", description: "Как понят запрос, 1-2 предложения" },
    library: {
      type: "array",
      items: {
        type: "object",
        properties: {
          steamAppId: { type: "integer", description: "steamAppId строго из списка библиотеки" },
          why: { type: "string", description: "Почему отвечает на запрос, 1-2 предложения" },
        },
        required: ["steamAppId", "why"],
      },
    },
    store: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Название игры, как в Steam, по-английски" },
          why: { type: "string", description: "Почему отвечает на запрос, 1-2 предложения" },
        },
        required: ["title", "why"],
      },
    },
  },
  required: ["understood", "library", "store"],
};

export interface FinderTurn {
  role: "user" | "assistant";
  text: string;
}

export interface FinderShortlist {
  understood: string;
  library: { steamAppId: number; why: string }[];
  store: { title: string; why: string }[];
}

function formatReviews(reviews: ReviewCorpusItem[]): string {
  if (reviews.length === 0) return "Отзывов пока нет — опирайся на запрос и на то, во что он играл.";
  return reviews
    .map((review) => {
      const meta = [
        review.tier ? `тир ${review.tier}` : null,
        review.rating ? `оценка ${review.rating}/5` : null,
        review.verdict,
        `${review.hours}ч`,
      ]
        .filter(Boolean)
        .join(", ");
      const note = (review.note ?? "").replace(/\s*\n+\s*/g, " | ").trim();
      const labels = review.labels.length ? ` [${review.labels.join(", ")}]` : "";
      return `- ${review.title} (${meta})${labels}: ${note || "без заметки"}`;
    })
    .join("\n");
}

function formatProfile(profile: TasteTag[]): string {
  if (profile.length === 0) return "Тегов пока нет.";
  return profile
    .map((tag) => `- ${tag.kind === "praise" ? "хвалит" : "ругает"}: ${tag.label} (игр: ${tag.games})`)
    .join("\n");
}

/**
 * One line per game, genres trimmed to three: a library of a thousand games
 * has to fit, and what the game is called plus how much it was played is what
 * the shortlist is built from.
 */
function formatLibrary(library: FinderLibraryGame[]): string {
  return library
    .map((game) => {
      const hours = Math.round((game.playtimeMinutes / 60) * 10) / 10;
      const record = [game.verdict, game.tier ? `тир ${game.tier}` : null].filter(Boolean).join(" ");
      const genres = game.genres ? game.genres.split(", ").slice(0, 3).join(", ") : "";
      return [game.steamAppId, game.title, `${hours}ч`, record || "-", genres].join("\t");
    })
    .join("\n");
}

function formatHistory(turns: FinderTurn[]): string {
  return turns
    .map((turn) => `${turn.role === "user" ? "Игрок" : "Ты"}: ${turn.text}`)
    .join("\n\n");
}

export async function generateShortlist(
  turns: FinderTurn[],
  library: FinderLibraryGame[],
  reviews: ReviewCorpusItem[],
  profile: TasteTag[],
  creds: LlmCredentials | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<FinderShortlist> {
  const history = turns.slice(0, -1);
  const request = turns[turns.length - 1]!.text;

  const prompt = [
    `# Отзывы игрока (${reviews.length})`,
    "В квадратных скобках — свойства, которые разбор вынес из его записей: + похвала, − претензия.",
    formatReviews(reviews),
    "",
    "# Профиль вкуса: что он хвалит и ругает вообще",
    formatProfile(profile),
    "",
    `# БИБЛИОТЕКА (${library.length})`,
    "Формат: steamAppId<TAB>название<TAB>наиграно<TAB>вердикт и тир, если есть отзыв<TAB>жанры",
    formatLibrary(library),
    "",
    ...(history.length > 0 ? ["# Разговор до этого", formatHistory(history), ""] : []),
    "# Запрос",
    request,
  ].join("\n");

  const raw = await withLlm(
    creds,
    async (client) => {
      const text = await client.generateJson({
        system: `${SYSTEM_INSTRUCTION}\n\n${OUTPUT_LANGUAGE[locale]}`,
        prompt,
        schema: RESPONSE_SCHEMA,
      });
      if (!text) throw new Error("The model returned an empty response");
      return text;
    },
    { timeoutMs: TIMEOUT_MS }
  );

  let parsed: FinderShortlist;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The model returned invalid JSON");
  }

  const owned = new Set(library.map((game) => game.steamAppId));
  const seen = new Set<number>();
  const fromLibrary = (parsed.library ?? [])
    .filter((pick) => {
      if (!owned.has(pick.steamAppId) || seen.has(pick.steamAppId)) return false;
      seen.add(pick.steamAppId);
      return true;
    })
    .slice(0, MAX_LIBRARY_PICKS);

  const titles = new Set<string>();
  const fromStore = (parsed.store ?? [])
    .filter((pick) => {
      const key = (pick.title ?? "").trim().toLowerCase();
      if (!key || titles.has(key)) return false;
      titles.add(key);
      return true;
    })
    .slice(0, MAX_STORE_PICKS);

  return { understood: parsed.understood ?? "", library: fromLibrary, store: fromStore };
}
