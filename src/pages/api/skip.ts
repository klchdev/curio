import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { skipSlot, getFreeSkips, FREE_SKIP_MARKER } from "../../lib/queries";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";
import { SKIP_CODES } from "../../components/SkipModal";

export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));
  const { slotId, reason, reasonCode, useFreeSkip } = await request.json();

  const fail = (error: string) =>
    new Response(JSON.stringify({ error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  if (useFreeSkip) {
    const { available } = await getFreeSkips(userId);
    if (available <= 0) return fail(s.errors.noFreeSkips);

    const result = await skipSlot(slotId, userId, "legitimate", FREE_SKIP_MARKER);
    if ("error" in result && result.error) return fail(result.error);
    return new Response(JSON.stringify({ ok: true, type: "legitimate" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!reason || typeof reason !== "string") return fail(s.skip.pickReason);

  /*
   * Тип скипа решает код, а не текст: текст теперь приходит на языке
   * пользователя, и сравнивать его со списком русских строк нельзя.
   */
  const isLegitimate = (SKIP_CODES as readonly string[]).includes(reasonCode);
  const result = await skipSlot(slotId, userId, isLegitimate ? "legitimate" : "shame", reason);
  if ("error" in result && result.error) return fail(result.error);

  return new Response(JSON.stringify({ ok: true, type: isLegitimate ? "legitimate" : "shame" }), {
    headers: { "Content-Type": "application/json" },
  });
};
