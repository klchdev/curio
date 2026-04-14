import type { APIRoute } from "astro";
import { createRetrospectiveReview } from "../../lib/queries";

const VALID_TIERS = ["S", "A", "B", "C", "D"] as const;

export const POST: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { gameId, tier, rating, note } = body;

  if (!gameId) {
    return new Response(JSON.stringify({ error: "gameId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (tier !== undefined && tier !== null && !VALID_TIERS.includes(tier)) {
    return new Response(JSON.stringify({ error: "Invalid tier" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
    return new Response(JSON.stringify({ error: "Rating 1-5" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await createRetrospectiveReview(userId, gameId, { tier, rating, note });

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
