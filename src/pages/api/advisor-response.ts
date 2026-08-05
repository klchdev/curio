import type { APIRoute } from "astro";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";
import { getUserId } from "../../lib/auth";
import { recordAdvisorResponse } from "../../lib/queries";

/** Реакция на спор советчика: аргумент сохраняется в ленту игры. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { gameId, argument, accepted } = await request.json();

  if (!Number.isInteger(gameId) || typeof argument !== "string" || !argument.trim()) {
    return new Response(JSON.stringify({ error: t(localeFrom(cookies, request)).errors.badRequest }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await recordAdvisorResponse(userId, gameId, {
    argument,
    accepted: Boolean(accepted),
  });

  return new Response(JSON.stringify(result), {
    status: "error" in result ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
};
