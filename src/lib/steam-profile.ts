/**
 * Отзывы, которые игрок писал в самом Steam.
 *
 * Web API их не отдаёт: ни в ISteamUser, ни в IPlayerService такого метода
 * нет, а искать свой отзыв через appreviews каждой игры — тысяча запросов
 * ради полусотни находок. Остаётся страница профиля.
 *
 * Значит парсинг HTML со всеми его рисками: вёрстка поменяется — импорт
 * сломается. Поэтому парсер устроен так, чтобы ломаться тихо: не нашли
 * блок — пропустили отзыв, а не уронили импорт целиком.
 */

export interface OwnReview {
  steamAppId: number;
  /** Палец вверх или вниз — единственная оценка, которую Steam хранит. */
  positive: boolean;
  /** Наиграно на момент отзыва, минуты. */
  playtimeMinutes: number;
  text: string;
  /** Когда отзыв написан в Steam. null — если дату не удалось разобрать. */
  postedAt: Date | null;
}

const PAGE_LIMIT = 20;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/*
 * Steam пишет дату по-английски и в двух видах: «15 March, 2024», а для
 * отзывов этого года год опускает — «15 March». Год в таком случае текущий.
 * Порядок «March 15» встречается на части страниц, поэтому ловим оба.
 */
export function parsePostedDate(raw: string, now = new Date()): Date | null {
  const text = raw.toLowerCase();
  const monthIndex = MONTHS.findIndex((month) => text.includes(month));
  if (monthIndex < 0) return null;

  const day = Number(text.match(/\b(\d{1,2})\b/)?.[1]);
  if (!day) return null;

  const year = Number(text.match(/\b(\d{4})\b/)?.[1] ?? now.getUTCFullYear());
  const date = new Date(Date.UTC(year, monthIndex, day, 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Разбирает одну страницу профиля. Возвращает отзывы и признак «есть ещё». */
export function parseReviewPage(html: string): { reviews: OwnReview[]; total: number | null } {
  const blocks = html.split('class="review_box"').slice(1);
  const reviews: OwnReview[] = [];

  for (const block of blocks) {
    const appId = block.match(/steamcommunity\.com\/app\/(\d+)/)?.[1];
    const hours = block.match(/<div class="hours">\s*([\d.,]+)\s*hrs on record/)?.[1];
    const text = block.match(/<div class="content\s*">([\s\S]*?)<\/div>/)?.[1];
    if (!appId || !text) continue;

    const body = decodeEntities(text);
    if (!body) continue;

    // «Posted 28 July.» и «Posted 16 December, 2025.» — двоеточия Steam не ставит
    const posted = block.match(/class="posted"[^>]*>\s*Posted:?\s*([^<]+)/i)?.[1];

    reviews.push({
      steamAppId: Number(appId),
      positive: block.includes("icon_thumbsUp"),
      playtimeMinutes: hours ? Math.round(Number(hours.replace(",", ".")) * 60) : 0,
      text: body,
      postedAt: posted ? parsePostedDate(posted) : null,
    });
  }

  const total = html.match(/Showing\s+[\d-]+\s+of\s+(\d+)\s+entries/)?.[1];
  return { reviews, total: total ? Number(total) : null };
}

/**
 * Все отзывы профиля. Профиль может быть закрыт — тогда страница отдаётся,
 * но отзывов в ней нет, и отличить это от «человек не писал отзывов» нельзя.
 */
export async function fetchOwnReviews(steamId: string): Promise<OwnReview[]> {
  const all: OwnReview[] = [];
  let expected: number | null = null;

  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const res = await fetch(
      `https://steamcommunity.com/profiles/${steamId}/recommended/?p=${page}`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" }, redirect: "follow" }
    );
    if (!res.ok) break;

    const { reviews, total } = parseReviewPage(await res.text());
    if (total !== null) expected = total;
    if (reviews.length === 0) break;

    all.push(...reviews);
    if (expected !== null && all.length >= expected) break;

    // Профиль — обычная страница сообщества, долбить её пачкой незачем
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  // Один и тот же отзыв не должен приехать дважды при съезжающей пагинации
  const seen = new Set<number>();
  return all.filter((review) => {
    if (seen.has(review.steamAppId)) return false;
    seen.add(review.steamAppId);
    return true;
  });
}
