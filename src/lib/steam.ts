import openid from "openid";
import { classifyAsSoftware } from "./store-classify";
import { STEAM_API_KEY } from "astro:env/server";

const STEAM_OPENID_URL = "https://steamcommunity.com/openid";

function getRelyingParty(returnUrl: string): openid.RelyingParty {
  return new openid.RelyingParty(
    returnUrl,
    null,
    true,
    true,
    []
  );
}

/**
 * The package hands the callback its own object with a single `message` field
 * instead of an Error — so we re-wrap it into a real one and keep stack traces
 * and `instanceof` working.
 */
function toError(err: openid.OpenIdError | null, fallback: string): Error {
  return new Error(err?.message ?? fallback);
}

export function getAuthUrl(returnUrl: string): Promise<string> {
  const rp = getRelyingParty(returnUrl);
  return new Promise((resolve, reject) => {
    rp.authenticate(STEAM_OPENID_URL, false, (err, authUrl) => {
      if (err || !authUrl) return reject(toError(err, "No auth URL"));
      resolve(authUrl);
    });
  });
}

export function verifyAssertion(
  returnUrl: string,
  requestUrl: string
): Promise<string> {
  const rp = getRelyingParty(returnUrl);
  return new Promise((resolve, reject) => {
    rp.verifyAssertion(requestUrl, (err, result) => {
      if (err || !result?.authenticated || !result.claimedIdentifier) {
        return reject(toError(err, "Authentication failed"));
      }
      const steamId = result.claimedIdentifier.replace(
        "https://steamcommunity.com/openid/id/",
        ""
      );
      resolve(steamId);
    });
  });
}

const STEAM_API_BASE = "https://api.steampowered.com";

export async function getSteamProfile(steamId: string) {
  const key = STEAM_API_KEY;
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const player = data.response.players[0];
  if (!player) throw new Error("Player not found");
  return {
    steamId: player.steamid as string,
    username: player.personaname as string,
    avatarUrl: player.avatarfull as string,
  };
}

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
  rtime_last_played?: number;
}

/**
 * Steam's answer for a thousand-game library weighs hundreds of kilobytes, and
 * it gets asked for several times in a row (close a contract, refresh playtime,
 * save a note). A short cache removes the repeat downloads at no cost to
 * freshness: playtime doesn't move within a minute anyway.
 */
const OWNED_GAMES_TTL_MS = 60_000;
const ownedGamesCache = new Map<string, { at: number; games: SteamGame[] }>();

export async function getOwnedGames(
  steamId: string,
  options?: { fresh?: boolean }
): Promise<SteamGame[]> {
  const cached = ownedGamesCache.get(steamId);
  if (!options?.fresh && cached && Date.now() - cached.at < OWNED_GAMES_TTL_MS) {
    return cached.games;
  }

  const key = STEAM_API_KEY;
  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const games: SteamGame[] = data.response.games || [];
  ownedGamesCache.set(steamId, { at: Date.now(), games });
  return games;
}

// Parse a Steam appid from a raw id or a store URL
// e.g. "https://store.steampowered.com/app/2861690/Game_Demo/" -> 2861690
export function parseAppId(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const m = trimmed.match(/\/app\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export interface StoreAppDetails {
  appid: number;
  name: string;
  headerImage: string | null;
  /** game / dlc / software / video / music / demo — what this is when it isn't a game. */
  type: string | null;
  shortDescription: string | null;
  genres: string | null;
  categories: string | null;
  releaseDate: string | null;
  /** Software, not a game: a "finished/dropped" verdict doesn't apply to it. */
  isSoftware: boolean;
}


// Fetch title + header image from the public Steam store API.
// Works for demo appids (they have their own store page).
export async function getStoreAppDetails(
  appId: number
): Promise<StoreAppDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const entry = data?.[String(appId)];
  if (!entry?.success || !entry.data) return null;
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((x: { description?: string }) => x.description).filter((x): x is string => !!x)
      : [];

  const genres = list(entry.data.genres);
  const categories = list(entry.data.categories);
  const type = (entry.data.type as string) ?? null;

  return {
    appid: appId,
    name: entry.data.name as string,
    headerImage:
      (entry.data.header_image as string) ??
      `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    type,
    // The description arrives with html entities and sometimes with tags
    shortDescription: cleanText(entry.data.short_description),
    genres: genres.join(", ") || null,
    categories: categories.join(", ") || null,
    releaseDate: (entry.data.release_date?.date as string) || null,
    isSoftware: classifyAsSoftware(type, genres, categories),
  };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Playtime straight from Steam. Only needed where the decision hangs on the
 * real number: closing a contract demands an honest 20 minutes, and a refresh
 * button is a refresh button. A diary entry does fine with the stored value
 * from user_games — otherwise every note pulled the whole library.
 */
export async function getRecentPlaytime(
  steamId: string,
  appId: number,
  options?: { fresh?: boolean }
): Promise<number> {
  const games = await getOwnedGames(steamId, options);
  const game = games.find((g) => g.appid === appId);
  return game?.playtime_forever ?? 0;
}


/* ---------- Polling for the tracker ---------- */

export interface RecentGame {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks: number;
}

/**
 * Games from the last two weeks — the same counter the library reports, but the
 * response weighs a kilobyte instead of hundreds. Polling the whole library
 * every half hour is not an option: a thousand games per pass for five rows
 * that changed.
 *
 * This leaves the tracker a blind spot: a game abandoned more than two weeks
 * ago and picked up again lands here only after it has been launched once —
 * that is, with the very first snapshot. The only thing that can slip past is
 * the session running at the moment of the poll, and the next poll catches it.
 */
export async function getRecentlyPlayedGames(steamId: string): Promise<RecentGame[]> {
  const url = `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const games = (data?.response?.games ?? []) as Partial<RecentGame>[];
  return games
    .filter((g): g is RecentGame => typeof g.appid === "number")
    .map((g) => ({
      appid: g.appid,
      name: g.name ?? `App ${g.appid}`,
      playtime_forever: g.playtime_forever ?? 0,
      playtime_2weeks: g.playtime_2weeks ?? 0,
    }));
}

export interface Presence {
  steamId: string;
  /** appid of the game running right now; null — not playing, or status hidden. */
  appId: number | null;
  gameName: string | null;
}

/** Valve won't return more in one call — so the player list goes out in batches. */
const SUMMARIES_BATCH = 100;

/**
 * Who is playing what right now.
 *
 * This is the only way to learn the real boundaries of a session: the playtime
 * counter records the fact, not the moment. The answer comes back empty for a
 * private profile or a player in invisible mode — then there will be no
 * sessions, only counter snapshots.
 *
 * A single request covers up to a hundred players, so polling often stays cheap
 * even once there are many users.
 */
export async function getPlayersPresence(steamIds: string[]): Promise<Presence[]> {
  const out: Presence[] = [];

  for (let i = 0; i < steamIds.length; i += SUMMARIES_BATCH) {
    const batch = steamIds.slice(i, i + SUMMARIES_BATCH);
    const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${batch.join(",")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Steam API error: ${res.status} ${res.statusText}`);
    const data = await res.json();

    for (const player of data?.response?.players ?? []) {
      /*
       * A shortcut to a non-Steam game reports a gameid far outside the appid
       * range — there is nowhere in the catalog to put such a "game", so we
       * treat the player as not in a game instead of inventing a card for it.
       */
      const raw = Number(player.gameid);
      const appId = Number.isSafeInteger(raw) && raw > 0 && raw < 100_000_000 ? raw : null;
      out.push({
        steamId: player.steamid as string,
        appId,
        gameName: (player.gameextrainfo as string) ?? null,
      });
    }
  }

  return out;
}

/* ---------- Player reviews ---------- */

export interface SteamReview {
  text: string;
  positive: boolean;
  votes: number;
  /** Playtime at the moment of the review — the stamp our own timeline is built on. */
  hoursAtReview: number;
}

export interface AppReviews {
  scoreLabel: string | null;
  totalPositive: number;
  totalNegative: number;
  reviews: SteamReview[];
}

/** Anything shorter is a meme or "+rep" — the analysis gets nothing from them. */
const MIN_REVIEW_LENGTH = 150;
/** Long walls get cut: the point sits in the first paragraphs, and tokens cost money. */
const MAX_REVIEW_LENGTH = 1200;

async function fetchReviewPage(
  appId: number,
  reviewType: "positive" | "negative",
  limit: number
): Promise<{ summary: any; reviews: SteamReview[] }> {
  const url =
    `https://store.steampowered.com/appreviews/${appId}?json=1` +
    `&filter=all&language=all&purchase_type=all&num_per_page=${limit}` +
    `&review_type=${reviewType}&cursor=*`;

  const res = await fetch(url);
  if (!res.ok) return { summary: null, reviews: [] };

  const data = await res.json();
  if (!data?.success || !Array.isArray(data.reviews)) return { summary: null, reviews: [] };

  const reviews: SteamReview[] = data.reviews
    .filter((r: any) => typeof r.review === "string" && r.review.trim().length >= MIN_REVIEW_LENGTH)
    .map((r: any) => ({
      text: r.review.replace(/\[\/?[a-z=\]]+\]/gi, " ").replace(/\s+/g, " ").trim().slice(0, MAX_REVIEW_LENGTH),
      positive: !!r.voted_up,
      votes: r.votes_up ?? 0,
      hoursAtReview: Math.round(((r.author?.playtime_at_review ?? 0) / 60) * 10) / 10,
    }));

  return { summary: data.query_summary, reviews };
}

/**
 * Reviews for analysing a single game. Steam doesn't sort its output by
 * helpfulness and hands back positives and negatives in proportion to the
 * rating — for a good game, a hundred reviews come with five negative ones. So
 * we fetch both sides separately and sort them ourselves: for matching someone
 * to their taste the negative ones are worth more, they carry the specifics
 * that line up with the player's known dislikes.
 */
export async function getAppReviews(
  appId: number,
  options?: { positive?: number; negative?: number }
): Promise<AppReviews | null> {
  const wantPositive = options?.positive ?? 12;
  const wantNegative = options?.negative ?? 12;

  const [pos, neg] = await Promise.all([
    fetchReviewPage(appId, "positive", 50),
    fetchReviewPage(appId, "negative", 50),
  ]);

  const summary = pos.summary ?? neg.summary;
  if (!summary && pos.reviews.length === 0 && neg.reviews.length === 0) return null;

  const byVotes = (a: SteamReview, b: SteamReview) => b.votes - a.votes;

  return {
    scoreLabel: summary?.review_score_desc ?? null,
    totalPositive: summary?.total_positive ?? 0,
    totalNegative: summary?.total_negative ?? 0,
    reviews: [
      ...pos.reviews.sort(byVotes).slice(0, wantPositive),
      ...neg.reviews.sort(byVotes).slice(0, wantNegative),
    ],
  };
}
