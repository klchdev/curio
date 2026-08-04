import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { setTier } from "../../lib/queries";

const VALID_TIERS = ["S", "A", "B", "C", "D", "F"] as const;

export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { slotId, tier } = body;

  if (tier !== null && !VALID_TIERS.includes(tier)) {
    return new Response(JSON.stringify({ error: "Invalid tier" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await setTier(slotId, userId, tier);

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
