import type { APIRoute } from "astro";
import { getUserId, setAuthCookie } from "../../lib/auth";
import { db } from "../../db";
import { deleteUserData } from "../../lib/account-data";
import { canSwitchTo, checkDevAccess, createTestAccount } from "../../lib/dev-accounts";

/**
 * Creating test accounts and switching between them.
 *
 * Every switch is logged with both identifiers. This is the only place in the
 * app where a session changes owner, and if it ever turns out to have switched
 * to the wrong one, these lines are what the investigation will run on.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, cookies, url }) => {
  const userId = getUserId(cookies);
  const access = await checkDevAccess(userId);

  /*
   * The same 404 for a disabled feature and for a user who is not the owner:
   * different responses would tell an outsider that the mechanism exists at
   * all and that it is switched on.
   */
  if (!userId || !access.allowed || !access.ownerId) {
    return new Response("Not found", { status: 404 });
  }

  const { action, label, targetId } = await request.json();

  if (action === "create") {
    const id = await createTestAccount(access.ownerId, typeof label === "string" ? label : "");
    console.info(`[dev-accounts] owner=${access.ownerId} created test account ${id}`);
    return json({ ok: true, id });
  }

  if (action === "switch") {
    if (!Number.isInteger(targetId)) return json({ error: "bad_target" }, 400);

    if (!(await canSwitchTo(userId, targetId))) {
      console.warn(`[dev-accounts] denied: user=${userId} tried to switch into ${targetId}`);
      return new Response("Not found", { status: 404 });
    }

    setAuthCookie(cookies, targetId, request, url);
    console.info(`[dev-accounts] user=${userId} switched into account ${targetId}`);
    return json({ ok: true });
  }

  if (action === "delete") {
    if (!Number.isInteger(targetId)) return json({ error: "bad_target" }, 400);

    /*
     * Your own real account cannot be deleted through this endpoint: there is
     * /api/account-delete for that, with confirmation by username. No such
     * check exists here, and a misclick must not cost the main account.
     */
    if (targetId === access.ownerId) return json({ error: "not_a_test_account" }, 400);

    if (!(await canSwitchTo(userId, targetId))) {
      console.warn(`[dev-accounts] denied: user=${userId} tried to delete ${targetId}`);
      return new Response("Not found", { status: 404 });
    }

    await db.transaction(async (tx) => {
      await deleteUserData(tx, targetId);
    });
    console.info(`[dev-accounts] owner=${access.ownerId} deleted test account ${targetId}`);

    /*
     * We just deleted the account we are sitting in — the cookie now points at
     * a row that no longer exists. Hand the session back to the owner, or the
     * person ends up logged out with no explanation.
     */
    if (targetId === userId) {
      setAuthCookie(cookies, access.ownerId, request, url);
    }

    return json({ ok: true });
  }

  return json({ error: "bad_action" }, 400);
};
