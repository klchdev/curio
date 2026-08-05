import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { getOwnedGames, getStoreAppDetails } from "../../lib/steam";
import { db } from "../../db";
import { users, games, userGames } from "../../db/schema";
import { eq, inArray, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

const CHUNK = 500;

/*
 * Сколько карточек магазина дозапрашиваем за один синк. Валве лимиты не
 * публикует, поэтому берём понемногу: библиотека дозаполнится за несколько
 * заходов, а разовый бэкофилл делает scripts/fetch-app-details.ts.
 */
const DETAILS_PER_SYNC = 20;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const POST: APIRoute = async ({ cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const user = await db
    .select({ steamId: users.steamId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) return new Response("User not found", { status: 404 });

  const steamGames = await getOwnedGames(user.steamId);
  if (steamGames.length === 0) {
    return new Response(JSON.stringify({ synced: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Bulk upsert games table
  for (const ch of chunk(steamGames, CHUNK)) {
    await db
      .insert(games)
      .values(
        ch.map((sg) => ({
          steamAppId: sg.appid,
          title: sg.name,
          headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${sg.appid}/header.jpg`,
          createdAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: games.steamAppId,
        set: {
          title: sql`excluded.title`,
          headerImage: sql`excluded.header_image`,
        },
      });
  }

  // 2. Get gameId mapping steamAppId → id
  const appIds = steamGames.map((sg) => sg.appid);
  const gameRows = await db
    .select({ id: games.id, steamAppId: games.steamAppId })
    .from(games)
    .where(inArray(games.steamAppId, appIds));

  const gameIdMap = new Map(gameRows.map((g) => [g.steamAppId, g.id]));

  // 3. Bulk upsert userGames
  const ugValues = steamGames.flatMap((sg) => {
    const gameId = gameIdMap.get(sg.appid);
    if (!gameId) return [];
    const lastPlayedAt =
      sg.rtime_last_played && sg.rtime_last_played > 0
        ? new Date(sg.rtime_last_played * 1000)
        : null;
    return [{ userId, gameId, playtimeMinutes: sg.playtime_forever, lastPlayedAt }];
  });

  for (const ch of chunk(ugValues, CHUNK)) {
    await db
      .insert(userGames)
      .values(ch)
      .onConflictDoUpdate({
        target: [userGames.userId, userGames.gameId],
        set: {
          playtimeMinutes: sql`excluded.playtime_minutes`,
          lastPlayedAt: sql`excluded.last_played_at`,
        },
      });
  }

  // 4. Дозаполняем карточки магазина у новых игр — по ним отличается софт
  const pending = await db
    .select({ id: games.id, steamAppId: games.steamAppId })
    .from(games)
    .where(isNull(games.detailsFetchedAt))
    .limit(DETAILS_PER_SYNC);

  for (const game of pending) {
    try {
      const details = await getStoreAppDetails(game.steamAppId);
      await db
        .update(games)
        .set({
          // Страницы может не быть вовсе — время попытки ставим в любом случае,
          // иначе будем спрашивать про неё при каждом синке
          detailsFetchedAt: new Date(),
          ...(details
            ? {
                type: details.type,
                shortDescription: details.shortDescription,
                genres: details.genres,
                categories: details.categories,
                releaseDate: details.releaseDate,
                isSoftware: details.isSoftware,
              }
            : {}),
        })
        .where(eq(games.id, game.id));
    } catch {
      // Steam моргнул — попробуем при следующем синке
    }
  }

  await db
    .update(users)
    .set({ lastLibrarySync: new Date() })
    .where(eq(users.id, userId));

  return new Response(JSON.stringify({ synced: ugValues.length, detailsFetched: pending.length }), {
    headers: { "Content-Type": "application/json" },
  });
};
