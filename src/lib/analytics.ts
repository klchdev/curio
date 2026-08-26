/**
 * Where the counter is allowed to run.
 *
 * Curio spent its whole life promising that no third party watches anything
 * here, and that promise is worth more than a full funnel. So the counter gets
 * exactly the pages a stranger can open — the landing and the demo — where the
 * only question worth asking is "where did these people come from". Everything
 * behind the login is left alone: the diary, the chronology, the settings and
 * the profile carry a person's own reading, and their URLs and clicks are not
 * something to hand to anybody else.
 *
 * The list lives here rather than as a prop on every page, because a prop is
 * something you forget to pass on the one new page that then quietly reports
 * a private URL.
 */
const PUBLIC_PATHS = ["/"];
const PUBLIC_PREFIXES = ["/try"];

export function isPublicPage(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The opt-out lives in the browser, not in the database: a guest has no row to
 * store it in, and the choice is about this browser anyway. The counter script
 * reads the key before it loads anything, so switching it off keeps the request
 * to Yandex from happening at all rather than asking them nicely to ignore it.
 */
export const ANALYTICS_OPT_OUT_KEY = "curio:analytics-off";
