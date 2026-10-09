import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import { games } from "../../db/schema";
import { eq } from "drizzle-orm";
import { getCachedDeepDive, diveAndSave } from "../../lib/deep-dive-store";
import { getLlmCredentials } from "../../lib/llm/credentials";
import { modelErrorText } from "../../lib/query-errors";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * An on-demand analysis of a single game. Synchronous: this is one model
 * request for one game, a matter of seconds — the background machinery of a
 * run would cost more here than the work itself.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const locale = localeFrom(cookies, request);
  const s = t(locale);
  const { gameId, refresh } = await request.json();
  if (!Number.isInteger(gameId)) return json({ error: s.errors.noGame }, 400);

  const exists = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)
    .then((rows) => rows.length > 0);

  if (!exists) return json({ error: s.errors.gameNotFound }, 404);

  const cached = await getCachedDeepDive(userId, gameId);
  if (cached && !refresh) return json(cached);

  /*
   * We check the key only after the cache: an analysis that already exists is
   * readable without one — it has been paid for and is sitting in the database.
   */
  const creds = await getLlmCredentials(userId);
  if (!creds) return json({ error: "no_llm_key" }, 400);

  try {
    const dive = await diveAndSave(userId, gameId, creds, locale);
    if (!dive) return json({ error: s.errors.gameNotFound }, 404);
    return json(dive);
  } catch (err) {
    console.error("[deep-dive]", err);
    return json({ error: modelErrorText(s, err, creds.provider) }, 502);
  }
};
