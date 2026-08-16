import type { APIRoute } from "astro";
import { verifyAssertion, getSteamProfile } from "../../lib/steam";
import { setAuthCookie } from "../../lib/auth";
import { db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

function getOrigin(request: Request, url: URL): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (forwarded) return `${proto}://${forwarded}`;
  return url.origin;
}

export const GET: APIRoute = async ({ url, request, cookies, redirect }) => {
  const origin = getOrigin(request, url);
  const returnUrl = new URL("/auth/callback", origin).toString();

  /*
   * Behind a reverse proxy url.origin is the container's internal address,
   * while Steam signed the assertion for the public one. Under openid's strict
   * check the two disagree and auth fails, so we assemble the public URL here.
   */
  const publicUrl = new URL(`${url.pathname}${url.search}`, origin).toString();

  try {
    let steamId: string;
    try {
      steamId = await verifyAssertion(returnUrl, publicUrl);
    } catch (first) {
      // Stateless verification calls out to Steam's server — a single network
      // hiccup took the whole sign-in down, and it only worked on a retry.
      console.warn("Steam verify failed, retrying once:", first);
      steamId = await verifyAssertion(returnUrl, publicUrl);
    }
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

    setAuthCookie(cookies, userId, request, url);

    return redirect("/dashboard");
  } catch (e) {
    // Log both addresses: a mismatch between them is the most common cause of failure
    console.error("Steam auth error:", e, { returnUrl, publicUrl, rawUrl: url.toString() });
    return redirect("/?error=auth_failed");
  }
};
