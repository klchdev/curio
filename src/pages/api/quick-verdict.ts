import type { APIRoute } from "astro";
import { isValidVerdict } from "../../lib/vocab";
import { getUserId } from "../../lib/auth";
import { createRetrospectiveReview } from "../../lib/queries";


export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { gameId, verdict, playtimeMinutes } = await request.json();

  if (!Number.isInteger(gameId) || !isValidVerdict(verdict)) {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await createRetrospectiveReview(userId, gameId, {
    verdict,
    playtimeMinutes: Number.isInteger(playtimeMinutes) ? playtimeMinutes : undefined,
  });

  const status = "error" in result ? 400 : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};
