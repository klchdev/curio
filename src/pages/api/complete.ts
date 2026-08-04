import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { reviewSlot } from "../../lib/queries";
import { getRecentPlaytime } from "../../lib/steam";
import { db } from "../../db";
import { users, slots, games } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { slotId, verdict, rating, note } = body;

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
    .select({ steamAppId: games.steamAppId })
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

  const result = await reviewSlot(slotId, userId, verdict, rating, note, currentPlaytime);

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
