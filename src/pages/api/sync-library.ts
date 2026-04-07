import type { APIRoute } from "astro";
import { getOwnedGames } from "../../lib/steam";
import { db } from "../../db";
import { users, games, userGames } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const POST: APIRoute = async ({ session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const user = db
    .select({ steamId: users.steamId })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return new Response("User not found", { status: 404 });

  const steamGames = await getOwnedGames(user.steamId);

  let synced = 0;
  for (const sg of steamGames) {
    const existing = db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.steamAppId, sg.appid))
      .get();

    let gameId: number;
    if (existing) {
      gameId = existing.id;
    } else {
      const result = db
        .insert(games)
        .values({
          steamAppId: sg.appid,
          title: sg.name,
          headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${sg.appid}/header.jpg`,
          createdAt: new Date(),
        })
        .returning({ id: games.id })
        .get();
      gameId = result.id;
    }

    const existingUg = db
      .select({ id: userGames.id })
      .from(userGames)
      .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
      .get();

    if (existingUg) {
      db.update(userGames)
        .set({ playtimeMinutes: sg.playtime_forever })
        .where(eq(userGames.id, existingUg.id))
        .run();
    } else {
      db.insert(userGames)
        .values({
          userId,
          gameId,
          playtimeMinutes: sg.playtime_forever,
        })
        .run();
    }
    synced++;
  }

  db.update(users)
    .set({ lastLibrarySync: new Date() })
    .where(eq(users.id, userId))
    .run();

  return new Response(JSON.stringify({ synced }), {
    headers: { "Content-Type": "application/json" },
  });
};
