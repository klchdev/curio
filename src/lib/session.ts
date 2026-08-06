import type { AstroGlobal } from "astro";
import { getUserId } from "./auth";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export interface SessionUser {
  id: number;
  steamId: string;
  username: string;
  avatarUrl: string | null;
  lastLibrarySync: Date | null;
}

export async function getSessionUser(
  astro: AstroGlobal
): Promise<SessionUser | null> {
  const userId = getUserId(astro.cookies);
  if (!userId) return null;

  const user = await db
    .select({
      id: users.id,
      steamId: users.steamId,
      username: users.username,
      avatarUrl: users.avatarUrl,
      lastLibrarySync: users.lastLibrarySync,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  return user ?? null;
}
