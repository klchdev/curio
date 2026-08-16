/**
 * Locale detection. Kept apart from the dictionary so that vocab.ts stays free
 * of Astro dependencies and works both in SSR and in client islands.
 */

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";

export const LOCALE_COOKIE = "br_lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** First supported language from Accept-Language, otherwise the default. */
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
