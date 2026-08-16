import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { clearAuthCookie, getUserId } from "../../lib/auth";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";
import { deleteUserData } from "../../lib/account-data";
import { db } from "../../db";
import { users } from "../../db/schema";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Deleting an account along with every trace of it.
 *
 * The cascade itself lives in account-data.ts — test-account cleanup calls the
 * very same one. What stays here is the decision: who is deleting, what they
 * confirm, and whose other rows go with them.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));

  const user = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) return json({ error: s.errors.userNotFound }, 404);

  /*
   * The username is typed by hand and checked against the database, not
   * against whatever the client sent. That is both a guard against a slip of
   * the mouse and a second line of defence on top of the cookie: someone
   * else's page can plant a request, but it cannot know what to put in it.
   */
  const body = await request.json().catch(() => null);
  if (!body || body.confirm !== user.username) {
    return json({ error: s.account.confirmMismatch }, 400);
  }

  /*
   * Test accounts this person created go with them. Those are their own
   * diaries under a synthetic steam_id: with the owner gone there is nobody
   * left who could log into them, and keeping them would mean data outliving
   * the account deletion it belonged to. The flag is checked explicitly — no
   * error in the data should ever let a real account get caught in this sweep.
   */
  const owned = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.createdByUserId, userId), eq(users.isTest, true)))
    .then((rows) => rows.map((row) => row.id));

  await db.transaction(async (tx) => {
    // Before the owner: otherwise their reference would block deleting the owner's row
    for (const id of owned) await deleteUserData(tx, id);
    await deleteUserData(tx, userId);
  });

  // The cookie would outlive the deletion and walk a ghost around the pages until it expired
  clearAuthCookie(cookies);

  return json({ ok: true });
};
