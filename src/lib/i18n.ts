/**
 * Locale detection. Kept apart from the dictionary so that vocab.ts stays free
 * of Astro dependencies and works both in SSR and in client islands.
 */

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * English is the fallback, not Russian.
 *
 * Russian is the language this was written in, but it is the narrower audience:
 * the fallback is what someone gets when nothing about them is known, and for a
 * public repository that someone is far more likely to read English. Russian
 * still wins whenever there is an actual reason for it — an explicit choice in
 * the cookie, or a browser that ranks Russian above English — so nobody who
 * wants it has to ask twice.
 */
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "br_lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The highest-weighted supported language from Accept-Language, otherwise the
 * default. Ranking by weight rather than by order is what keeps this honest:
 * `en-US,en;q=0.9,ru;q=0.3` means the person reads both and prefers English.
 */
export function localeFromHeader(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return {
        tag: (tag ?? "").trim().toLowerCase(),
        weight: q ? Number(q.split("=")[1]) || 0 : 1,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}

/** An explicit user choice outranks the browser header. */
export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return localeFromHeader(acceptLanguage);
}

/**
 * Locale of a request. A separate function so that every page and every route
 * resolves it the same way instead of each inventing its own.
 */
export function localeFrom(
  cookies: { get(name: string): { value: string } | undefined },
  request: Request
): Locale {
  return resolveLocale(cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"));
}
