import { createHmac, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";
import { SESSION_SECRET } from "astro:env/server";

/**
 * Auth lives in a signed cookie instead of server-side storage.
 *
 * There is exactly one number to keep — the userId. Astro's file-backed
 * sessions sat inside the container and vanished on every deploy; a cookie
 * survives deploys, restarts and running on several instances.
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

/** Cookie value: `userId.expiresAt.signature` */
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

/** Behind a reverse proxy the real protocol arrives in a header. */
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
