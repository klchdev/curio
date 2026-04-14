import type { APIRoute } from "astro";
import { updateReview } from "../../lib/queries";
import { getRecentPlaytime } from "../../lib/steam";
import { db } from "../../db";
import { users, slots, games, userGames } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const POST: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { slotId, verdict, rating } = body;

  const user = await db
    .select({ steamId: users.steamId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  const slot = await db
    .select({ gameId: slots.gameId })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user || !slot) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const game = await db
    .select({ steamAppId: games.steamAppId, id: games.id })
    .from(games)
    .where(eq(games.id, slot.gameId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!game) {
    return new Response(JSON.stringify({ error: "Game not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const currentPlaytime = await getRecentPlaytime(
    user.steamId,
    game.steamAppId
  );

  await db.update(userGames)
    .set({ playtimeMinutes: currentPlaytime })
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, game.id)));

  const result = await updateReview(slotId, userId, verdict, rating, currentPlaytime);

  if ("error" in result) {
    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
