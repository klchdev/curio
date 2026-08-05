import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { spinRoulette, canSpin } from "../../lib/queries";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";

export const POST: APIRoute = async ({ cookies, request }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));

  if (!(await canSpin(userId))) {
    return new Response(
      JSON.stringify({ error: s.errors.slotsFull }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const result = await spinRoulette(userId);
  if (!result) {
    return new Response(
      JSON.stringify({ error: s.errors.poolEmpty }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};
