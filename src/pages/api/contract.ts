import type { APIRoute } from "astro";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";
import { getUserId } from "../../lib/auth";
import { takeContract } from "../../lib/queries";
import { errorText } from "../../lib/query-errors";

/** Take a contract on a specific game — from an AI pick or by drawing lots among them. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));
  const { gameId } = await request.json();
  if (!Number.isInteger(gameId)) {
    return new Response(JSON.stringify({ error: s.errors.noGame }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await takeContract(userId, gameId);
  const body = "error" in result ? { error: errorText(s, result.error) } : result;
  return new Response(JSON.stringify(body), {
    status: "error" in result ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
};
