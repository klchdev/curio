import type { APIRoute } from "astro";
import { LOCALE_COOKIE, isLocale } from "../../lib/i18n";

/** Явный выбор языка живёт год: он важнее Accept-Language при каждом заходе. */
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const to = url.searchParams.get("to");
  if (isLocale(to)) {
    cookies.set(LOCALE_COOKIE, to, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  // Возвращаем только на свой же путь — открытый редирект тут не нужен
  const back = url.searchParams.get("back");
  return redirect(back && back.startsWith("/") && !back.startsWith("//") ? back : "/");
};
