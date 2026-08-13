import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { getEntryContext } from "../../lib/entry-context";

/**
 * Что показать в листе впечатления до того, как человек начал писать: его же
 * прошлые слова об этой игре и расхождение оценки с тоном последних записей.
 */
export const GET: APIRoute = async ({ cookies, url }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const gameId = Number(url.searchParams.get("gameId"));
  if (!Number.isInteger(gameId)) {
    return new Response(JSON.stringify({ error: "Не указана игра" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const context = await getEntryContext(userId, gameId);
  return new Response(JSON.stringify(context), {
    headers: { "Content-Type": "application/json" },
  });
};
