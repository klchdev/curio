/**
 * Определение языка. Держим отдельно от словаря, чтобы vocab.ts оставался
 * без зависимостей от Astro и годился и для SSR, и для клиентских островов.
 */

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";

export const LOCALE_COOKIE = "br_lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Первый поддерживаемый язык из Accept-Language, иначе значение по умолчанию. */
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

/** Явный выбор пользователя важнее заголовка браузера. */
export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return localeFromHeader(acceptLanguage);
}
