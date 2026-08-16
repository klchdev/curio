import type { APIRoute } from "astro";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";
import { getUserId } from "../../lib/auth";
import { takeContract } from "../../lib/queries";

/** Take a contract on a specific game — from an AI pick or by drawing lots among them. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { gameId } = await request.json();
  if (!Number.isInteger(gameId)) {
    return new Response(JSON.stringify({ error: t(localeFrom(cookies, request)).errors.noGame }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await takeContract(userId, gameId);
  return new Response(JSON.stringify(result), {
    status: "error" in result ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
};
