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

export function getAuthUrl(returnUrl: string): Promise<string> {
  const rp = getRelyingParty(returnUrl);
  return new Promise((resolve, reject) => {
    rp.authenticate(STEAM_OPENID_URL, false, (err: Error | null, authUrl: string | null) => {
      if (err || !authUrl) return reject(err || new Error("No auth URL"));
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
    rp.verifyAssertion(requestUrl, (err: Error | null, result: openid.VerifyAssertionResult | null) => {
      if (err || !result?.authenticated) {
        return reject(err || new Error("Authentication failed"));
      }
      const claimedId = result.claimedIdentifier!;
      const steamId = claimedId.replace(
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

export async function getOwnedGames(steamId: string): Promise<SteamGame[]> {
  const key = STEAM_API_KEY;
  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.response.games || [];
}

export async function getRecentPlaytime(
  steamId: string,
  appId: number
): Promise<number> {
  const games = await getOwnedGames(steamId);
  const game = games.find((g) => g.appid === appId);
  return game?.playtime_forever ?? 0;
}
