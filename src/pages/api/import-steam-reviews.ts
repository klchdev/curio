import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { fetchOwnReviews } from "../../lib/steam-profile";
import { importSteamReviews } from "../../lib/queries";
import { queueEntryAnalysis } from "../../lib/entry-analysis";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** A one-off import of reviews from a Steam profile. Takes about ten seconds: few pages. */
export const POST: APIRoute = async ({ cookies, request }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));

  const user = await db
    .select({ steamId: users.steamId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) return json({ error: s.errors.userNotFound }, 404);

  try {
    const reviews = await fetchOwnReviews(user.steamId);
    // Zero reviews and a private profile look identical — Steam does not tell them apart
    if (reviews.length === 0) return json({ found: 0, imported: 0 });

    const { entryIds, ...result } = await importSteamReviews(userId, reviews);
    // Imported reviews are diary text like any other: we look for mentions in them too
    for (const entryId of entryIds) queueEntryAnalysis(entryId);
    return json({ found: reviews.length, ...result });
  } catch (err) {
    console.error("[import-steam-reviews]", err);
    return json({ error: s.errors.generic }, 502);
  }
};
