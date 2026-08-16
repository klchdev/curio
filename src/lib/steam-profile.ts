/**
 * Reviews the player wrote inside Steam itself.
 *
 * The Web API doesn't hand them over: neither ISteamUser nor IPlayerService
 * has such a method, and hunting for your own review through every game's
 * appreviews means a thousand requests for fifty hits. That leaves the
 * profile page.
 *
 * Which means parsing HTML, with every risk that carries: the markup changes
 * and the import breaks. So the parser is built to fail quietly — a block we
 * can't find is one review skipped, not the whole import brought down.
 */

export interface OwnReview {
  steamAppId: number;
  /** Thumbs up or down — the only rating Steam keeps. */
  positive: boolean;
  /** Playtime at the moment of the review, in minutes. */
  playtimeMinutes: number;
  text: string;
  /** When the review was posted on Steam. null if the date couldn't be parsed. */
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
 * Steam writes the date in English and in two shapes: "15 March, 2024", and for
 * reviews from this year it drops the year — "15 March", meaning the current
 * one. The "March 15" order shows up on some pages, so we catch both.
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

/** Parses one profile page. Returns the reviews and the "there is more" marker. */
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

    // "Posted 28 July." and "Posted 16 December, 2025." — Steam puts no colon there
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
 * Every review on a profile. The profile may be private — then the page is
 * still served but holds no reviews, and there is no telling that apart from
 * "this person never wrote any".
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

    // The profile is an ordinary community page; no reason to hammer it in bursts
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  // The same review must not arrive twice when pagination shifts under us
  const seen = new Set<number>();
  return all.filter((review) => {
    if (seen.has(review.steamAppId)) return false;
    seen.add(review.steamAppId);
    return true;
  });
}
