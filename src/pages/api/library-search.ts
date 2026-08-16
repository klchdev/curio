import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { searchLibrary } from "../../lib/queries";

/** Search your own library: to ask about a game that is not among the picks. */
export const GET: APIRoute = async ({ url, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ items: await searchLibrary(userId, query) }), {
    headers: { "Content-Type": "application/json" },
  });
};
