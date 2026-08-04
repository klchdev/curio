import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { skipSlot, getFreeSkips } from "../../lib/queries";

const LEGITIMATE_REASONS = [
  "Это не игра / демка",
  "Не запускается",
  "Уже не в библиотеке",
];

export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { slotId, reason, useFreeSkip } = body;

  if (useFreeSkip) {
    const { available } = await getFreeSkips(userId);
    if (available <= 0) {
      return new Response(JSON.stringify({ error: "Нет бесплатных скипов" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const result = await skipSlot(slotId, userId, "legitimate", "Бесплатный скип");
    if ("error" in result) {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ ok: true, type: "legitimate" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!reason) {
    return new Response(JSON.stringify({ error: "Выбери причину" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isLegitimate = LEGITIMATE_REASONS.includes(reason);
  const reasonType = isLegitimate ? "legitimate" : "shame";

  const result = await skipSlot(slotId, userId, reasonType, reason);

  if ("error" in result) {
    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, type: reasonType }),
    { headers: { "Content-Type": "application/json" } }
  );
};
