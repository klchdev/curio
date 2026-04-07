import type { APIRoute } from "astro";
import { getRecentPlaytime } from "../../lib/steam";
import { db } from "../../db";
import { users, slots, games, userGames } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const POST: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { slotId } = await request.json();

  const user = db
    .select({ steamId: users.steamId })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  const slot = db
    .select({ gameId: slots.gameId, playtimeOnStart: slots.playtimeOnStart })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .get();

  if (!user || !slot) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const game = db
    .select({ steamAppId: games.steamAppId, id: games.id })
    .from(games)
    .where(eq(games.id, slot.gameId))
    .get();

  if (!game) {
    return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
  }

  const currentPlaytime = await getRecentPlaytime(user.steamId, game.steamAppId);

  // Update user_games with fresh playtime
  db.update(userGames)
    .set({ playtimeMinutes: currentPlaytime })
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, game.id)))
    .run();

  const played = currentPlaytime - slot.playtimeOnStart;

  return new Response(JSON.stringify({ playedMinutes: played, totalPlaytime: currentPlaytime }), {
    headers: { "Content-Type": "application/json" },
  });
};
