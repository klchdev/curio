import type { APIRoute } from "astro";
import { isValidTier } from "../../lib/vocab";
import { getUserId } from "../../lib/auth";
import { setTier } from "../../lib/queries";
import { errorText } from "../../lib/query-errors";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";


export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));
  const body = await request.json();
  const { gameId, tier } = body;

  if (tier !== null && !isValidTier(tier)) {
    return new Response(JSON.stringify({ error: s.errors.badTier }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await setTier(userId, gameId, tier);

  if ("error" in result) {
    return new Response(JSON.stringify({ error: errorText(s, result.error) }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
