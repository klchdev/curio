import type { APIRoute } from "astro";
import { LOCALE_COOKIE, isLocale } from "../../lib/i18n";

/** An explicit language choice lives a year: it outranks Accept-Language on every visit. */
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const to = url.searchParams.get("to");
  if (isLocale(to)) {
    cookies.set(LOCALE_COOKIE, to, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  // Only ever return to a path of our own — an open redirect has no place here
  const back = url.searchParams.get("back");
  return redirect(back && back.startsWith("/") && !back.startsWith("//") ? back : "/");
};
