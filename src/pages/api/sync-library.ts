import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { getOwnedGames, getStoreAppDetails } from "../../lib/steam";
import { db } from "../../db";
import { users, games } from "../../db/schema";
import { eq, isNull } from "drizzle-orm";
import { recordPlaytime } from "../../lib/playtime-tracker";

/*
 * Сколько карточек магазина дозапрашиваем за один синк. Валве лимиты не
 * публикует, поэтому берём понемногу: библиотека дозаполнится за несколько
 * заходов, а разовый бэкофилл делает scripts/fetch-app-details.ts.
 */
const DETAILS_PER_SYNC = 20;

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

  /*
   * 1. Библиотека в базу — той же дорогой, что и опрос трекера: разница между
   * прошлым известным временем и нынешним записывается в историю. Раньше синк
   * просто затирал `playtime_minutes`, и всё, что человек наиграл между двумя
   * заходами, исчезало бесследно.
   */
  const synced = await recordPlaytime(
    userId,
    steamGames.map((sg) => ({
      appId: sg.appid,
      name: sg.name,
      playtimeMinutes: sg.playtime_forever,
      lastPlayedAt:
        sg.rtime_last_played && sg.rtime_last_played > 0
          ? new Date(sg.rtime_last_played * 1000)
          : null,
    })),
    "sync"
  );

  // 2. Дозаполняем карточки магазина у новых игр — по ним отличается софт
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

  return new Response(
    JSON.stringify({
      synced: steamGames.length,
      // Сколько игр приросло со времён прошлого синка — по ним пошли замеры
      tracked: synced,
      detailsFetched: pending.length,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
