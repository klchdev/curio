import type { APIRoute } from "astro";

/*
 * Остался только DELETE: демки создаются через общий /api/impression в режиме
 * demo, и второй путь записи существовал вхолостую.
 */
import { getUserId } from "../../lib/auth";
import { deleteDemoReview } from "../../lib/queries";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const gameId = Number(body?.gameId);
  if (!gameId) return json({ error: "gameId required" }, 400);

  const result = await deleteDemoReview(userId, gameId);
  if ("error" in result) return json(result, 400);
  return json({ ok: true });
};
