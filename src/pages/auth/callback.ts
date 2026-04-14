import type { APIRoute } from "astro";
import { verifyAssertion, getSteamProfile } from "../../lib/steam";
import { db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

function getOrigin(request: Request, url: URL): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (forwarded) return `${proto}://${forwarded}`;
  return url.origin;
}

export const GET: APIRoute = async ({ url, request, session, redirect }) => {
  const origin = getOrigin(request, url);
  const returnUrl = new URL("/auth/callback", origin).toString();

  try {
    const steamId = await verifyAssertion(returnUrl, url.toString());
    const profile = await getSteamProfile(steamId);

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.steamId, steamId))
      .limit(1)
      .then((rows) => rows[0]);

    let userId: number;

    if (!existing) {
      const [result] = await db
        .insert(users)
        .values({
          steamId: profile.steamId,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          createdAt: new Date(),
        })
        .returning({ id: users.id });
      userId = result.id;
    } else {
      await db.update(users)
        .set({
          username: profile.username,
          avatarUrl: profile.avatarUrl,
        })
        .where(eq(users.steamId, steamId));
      userId = existing.id;
    }

    console.log("Saving userId to session:", userId);
    await session?.set("userId", userId);

    return redirect("/dashboard");
  } catch (e) {
    console.error("Steam auth error:", e);
    return redirect("/?error=auth_failed");
  }
};
