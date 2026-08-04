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
   * За обратным прокси url.origin — внутренний адрес контейнера, а Steam
   * подписал утверждение для публичного. При strict-проверке openid это
   * расходится и авторизация падает, поэтому склеиваем публичный URL сами.
   */
  const publicUrl = new URL(`${url.pathname}${url.search}`, origin).toString();

  try {
    let steamId: string;
    try {
      steamId = await verifyAssertion(returnUrl, publicUrl);
    } catch (first) {
      // Проверка stateless-режима ходит на сервер Steam — одна сетевая осечка
      // роняла весь вход, и он проходил только со второй попытки.
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
    // Логируем оба адреса: расхождение между ними — самая частая причина отказа
    console.error("Steam auth error:", e, { returnUrl, publicUrl, rawUrl: url.toString() });
    return redirect("/?error=auth_failed");
  }
};
