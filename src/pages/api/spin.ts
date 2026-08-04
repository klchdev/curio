import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { spinRoulette, canSpin } from "../../lib/queries";

export const POST: APIRoute = async ({ cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  if (!(await canSpin(userId))) {
    return new Response(
      JSON.stringify({ error: "Все слоты заняты. Закрой или пропусти игру." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const result = await spinRoulette(userId);
  if (!result) {
    return new Response(
      JSON.stringify({ error: "Нет доступных игр. Синхронизируй библиотеку." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};
