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
 * Пакет отдаёт в колбэк не Error, а свой объект с одним полем message —
 * поэтому наружу отдаём настоящий Error, чтобы стек и `instanceof` работали.
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
 * Ответ Steam на библиотеку в тысячу игр весит сотни килобайт, а запрашивают
 * её пачками подряд (закрыть контракт, обновить время, записать заметку).
 * Короткий кэш убирает повторные скачивания, не влияя на свежесть: за минуту
 * наигранное время всё равно не меняется.
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
  /** game / dlc / software / video / music / demo — чем игра не является. */
  type: string | null;
  shortDescription: string | null;
  genres: string | null;
  categories: string | null;
  releaseDate: string | null;
  /** Софт, а не игра: вердикт «прошёл/бросил» к нему неприменим. */
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
    // Описание приходит с html-сущностями и иногда с тегами
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
 * Наигранное время из Steam. Нужно только там, где решение зависит от факта:
 * закрытие контракта требует настоящих 20 минут, а кнопка обновления на то и
 * кнопка. Для записи в дневник хватает сохранённого значения из user_games —
 * иначе каждая заметка тянула всю библиотеку.
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


/* ---------- Отзывы игроков ---------- */

export interface SteamReview {
  text: string;
  positive: boolean;
  votes: number;
  /** Наиграно на момент отзыва — тот же штамп, на котором построена наша лента. */
  hoursAtReview: number;
}

export interface AppReviews {
  scoreLabel: string | null;
  totalPositive: number;
  totalNegative: number;
  reviews: SteamReview[];
}

/** Короче — мем или «+rep», толку в разборе от них нет. */
const MIN_REVIEW_LENGTH = 150;
/** Длинные простыни режем: смысл в первых абзацах, а токены не бесплатны. */
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
 * Отзывы для разбора одной игры. Steam не сортирует выдачу по полезности и
 * отдаёт плюс и минус в пропорции рейтинга — у хорошей игры на сотню отзывов
 * приходит пять отрицательных. Поэтому тянем обе стороны отдельно и
 * сортируем сами: для подбора под вкус отрицательные ценнее, в них
 * конкретика, которая ложится на известные нелюбови игрока.
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
