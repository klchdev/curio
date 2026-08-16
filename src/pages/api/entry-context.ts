import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { getEntryContext } from "../../lib/entry-context";

/**
 * What to show on the impression sheet before a person has started writing:
 * their own earlier words about this game, and the gap between the rating and
 * the tone of their latest entries.
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
