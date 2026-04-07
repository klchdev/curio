import type { APIRoute } from "astro";
import { skipSlot } from "../../lib/queries";

const LEGITIMATE_REASONS = [
  "Это не игра / демка",
  "Не запускается",
  "Уже не в библиотеке",
];

export const POST: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { slotId, reason } = body;

  const isLegitimate = LEGITIMATE_REASONS.includes(reason);
  const reasonType = isLegitimate ? "legitimate" : "shame";

  const result = skipSlot(slotId, userId, reasonType, reason);

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
