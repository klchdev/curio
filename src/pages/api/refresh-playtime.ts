import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { getRecentPlaytime } from "../../lib/steam";
import { db } from "../../db";
import { users, slots, games } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { recordPlaytime } from "../../lib/playtime-tracker";

export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { slotId } = await request.json();

  const user = await db
    .select({ steamId: users.steamId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  const slot = await db
    .select({ gameId: slots.gameId, playtimeOnStart: slots.playtimeOnStart })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user || !slot) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const game = await db
    .select({ steamAppId: games.steamAppId, id: games.id, title: games.title })
    .from(games)
    .where(eq(games.id, slot.gameId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!game) {
    return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
  }

  const currentPlaytime = await getRecentPlaytime(user.steamId, game.steamAppId, { fresh: true });

  /*
   * Through the tracker rather than a direct update: the button gets pressed
   * exactly when someone has just quit the game — that is the most accurate
   * measurement of the evening, and losing it from the history would be a shame.
   */
  await recordPlaytime(
    userId,
    [{ appId: game.steamAppId, name: game.title, playtimeMinutes: currentPlaytime }],
    "poll"
  );

  const played = currentPlaytime - slot.playtimeOnStart;

  return new Response(JSON.stringify({ playedMinutes: played, totalPlaytime: currentPlaytime }), {
    headers: { "Content-Type": "application/json" },
  });
};
