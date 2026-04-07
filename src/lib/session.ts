import type { AstroGlobal } from "astro";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export interface SessionUser {
  id: number;
  steamId: string;
  username: string;
  avatarUrl: string | null;
}

export async function getSessionUser(
  astro: AstroGlobal
): Promise<SessionUser | null> {
  const userId = await astro.session?.get<number>("userId");
  if (!userId) return null;

  const user = db
    .select({
      id: users.id,
      steamId: users.steamId,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return user ?? null;
}
