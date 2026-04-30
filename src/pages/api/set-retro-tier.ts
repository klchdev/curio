import type { APIRoute } from "astro";
import { setRetroTier } from "../../lib/queries";

const VALID_TIERS = ["S", "A", "B", "C", "D", "F"] as const;

export const POST: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { gameId, tier } = await request.json();

  if (!gameId) {
    return new Response(JSON.stringify({ error: "gameId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (tier !== null && !VALID_TIERS.includes(tier)) {
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
