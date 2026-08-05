import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { searchLibrary } from "../../lib/queries";

/** Поиск по своей библиотеке: чтобы спросить мнение про игру, которой нет в советах. */
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
