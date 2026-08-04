import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { addGameNote, updateGameReview } from "../../lib/queries";
import { getRecentPlaytime } from "../../lib/steam";
import { db } from "../../db";
import { users, games, userGames } from "../../db/schema";
import { eq, and } from "drizzle-orm";

const VALID_TIERS = ["S", "A", "B", "C", "D", "F"] as const;
const VALID_VERDICTS = ["finished", "dropped", "playing", "later"] as const;

export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { gameId, text, verdict, rating, tier } = body;

  if (typeof gameId !== "number") {
    return new Response(JSON.stringify({ error: "gameId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof text !== "string" || text.length < 10) {
    return new Response(JSON.stringify({ error: "Заметка минимум 10 символов" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (verdict !== undefined && verdict !== null && !VALID_VERDICTS.includes(verdict)) {
    return new Response(JSON.stringify({ error: "Invalid verdict" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
    return new Response(JSON.stringify({ error: "Оценка от 1 до 5" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (tier !== undefined && tier !== null && !VALID_TIERS.includes(tier)) {
    return new Response(JSON.stringify({ error: "Invalid tier" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = await db
    .select({ steamId: users.steamId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  const game = await db
    .select({ steamAppId: games.steamAppId, id: games.id })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user || !game) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const currentPlaytime = await getRecentPlaytime(user.steamId, game.steamAppId);

  await db
    .update(userGames)
    .set({ playtimeMinutes: currentPlaytime })
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)));

  const noteResult = await addGameNote(userId, gameId, text, currentPlaytime);
  if ("error" in noteResult) {
    return new Response(JSON.stringify(noteResult), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const patch: Parameters<typeof updateGameReview>[2] = {
    playtimeMinutes: currentPlaytime,
  };
  if (verdict !== undefined) patch.verdict = verdict;
  if (rating !== undefined) patch.rating = rating;
  if (tier !== undefined) patch.tier = tier;

  const updateResult = await updateGameReview(userId, gameId, patch);
  if ("error" in updateResult) {
    return new Response(JSON.stringify(updateResult), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
