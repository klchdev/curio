import openid from "openid";
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
  type: string | null;
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
  return {
    appid: appId,
    name: entry.data.name as string,
    headerImage:
      (entry.data.header_image as string) ??
      `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    type: (entry.data.type as string) ?? null,
  };
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
