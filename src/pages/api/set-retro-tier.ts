import type { APIRoute } from "astro";
import { isValidTier } from "../../lib/vocab";
import { getUserId } from "../../lib/auth";
import { setRetroTier } from "../../lib/queries";


export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { gameId, tier } = await request.json();

  if (!gameId) {
    return new Response(JSON.stringify({ error: "gameId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (tier !== null && !isValidTier(tier)) {
    return new Response(JSON.stringify({ error: "Invalid tier" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await setRetroTier(gameId, userId, tier);

  if ("error" in result) {
    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
