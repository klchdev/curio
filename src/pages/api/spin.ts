import type { APIRoute } from "astro";
import { spinRoulette, canSpin } from "../../lib/queries";

export const POST: APIRoute = async ({ session }) => {
  const userId = await session?.get<number>("userId");
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
