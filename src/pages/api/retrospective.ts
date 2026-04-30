import type { APIRoute } from "astro";
import { createRetrospectiveReview } from "../../lib/queries";

const VALID_TIERS = ["S", "A", "B", "C", "D", "F"] as const;
const VALID_VERDICTS = ["finished", "dropped", "playing", "later"] as const;

export const POST: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { gameId, verdict, tier, rating, note, playtimeMinutes } = body;

  if (!gameId) {
    return new Response(JSON.stringify({ error: "gameId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!verdict || !VALID_VERDICTS.includes(verdict)) {
    return new Response(JSON.stringify({ error: "Выбери вердикт" }), {
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
    return new Response(JSON.stringify({ error: "Оценка от 1 до 5" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!note || note.length < 50) {
    return new Response(
      JSON.stringify({ error: "Заметка минимум 50 символов" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const result = await createRetrospectiveReview(userId, gameId, {
    verdict,
    tier,
    rating,
    note,
    playtimeMinutes: typeof playtimeMinutes === "number" ? playtimeMinutes : undefined,
  });

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
