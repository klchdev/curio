import { createHmac, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";
import { SESSION_SECRET } from "astro:env/server";

/**
 * Авторизация в подписанной куке вместо серверного хранилища.
 *
 * Хранить нужно ровно одно число — userId. Файловые сессии Astro лежали
 * внутри контейнера и исчезали на каждом деплое; кука переживает деплои,
 * рестарты и работу на нескольких инстансах.
 */

const COOKIE_NAME = "br_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Значение куки: `userId.expiresAt.подпись` */
function serialize(userId: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function parse(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  const [rawUserId, rawExpiry, signature] = parts as [string, string, string];
  if (!safeEqual(signature, sign(`${rawUserId}.${rawExpiry}`))) return null;

  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null;

  const userId = Number(rawUserId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

/** За обратным прокси реальный протокол приходит заголовком. */
function isSecureRequest(request: Request, url: URL): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]!.trim() === "https";
  return url.protocol === "https:";
}

export function getUserId(cookies: AstroCookies): number | null {
  const raw = cookies.get(COOKIE_NAME)?.value;
  return raw ? parse(raw) : null;
}

export function setAuthCookie(
  cookies: AstroCookies,
  userId: number,
  request: Request,
  url: URL
): void {
  cookies.set(COOKIE_NAME, serialize(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request, url),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearAuthCookie(cookies: AstroCookies): void {
  cookies.delete(COOKIE_NAME, { path: "/" });
}
