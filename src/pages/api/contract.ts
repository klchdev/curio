import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { takeContract } from "../../lib/queries";

/** Взять контракт на конкретную игру — из совета ИИ или по жребию между ними. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { gameId } = await request.json();
  if (!Number.isInteger(gameId)) {
    return new Response(JSON.stringify({ error: "Не указана игра" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await takeContract(userId, gameId);
  return new Response(JSON.stringify(result), {
    status: "error" in result ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
};
