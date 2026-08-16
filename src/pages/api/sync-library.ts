import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { getOwnedGames, getStoreAppDetails } from "../../lib/steam";
import { db } from "../../db";
import { users, games } from "../../db/schema";
import { eq, isNull } from "drizzle-orm";
import { recordPlaytime } from "../../lib/playtime-tracker";

/*
 * How many store cards we backfill per sync. Valve does not publish its rate
 * limits, so we take a little at a time: the library fills in over several
 * runs, and scripts/fetch-app-details.ts handles a one-off backfill.
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
   * 1. The library into the database — by the same road the tracker's polling
   * takes: the difference between the last known playtime and the current one
   * is written into history. The sync used to simply overwrite
   * `playtime_minutes`, and everything played between two runs vanished
   * without a trace.
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

  // 2. Backfill store cards for new games — that is how software is told apart
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
          // The page may not exist at all — we stamp the attempt either way,
          // otherwise we would ask about it on every single sync
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
      // Steam blinked — we will try again on the next sync
    }
  }

  await db
    .update(users)
    .set({ lastLibrarySync: new Date() })
    .where(eq(users.id, userId));

  return new Response(
    JSON.stringify({
      synced: steamGames.length,
      // How many games gained playtime since the last sync — those got measurements
      tracked: synced,
      detailsFetched: pending.length,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
