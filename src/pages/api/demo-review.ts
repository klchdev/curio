import type { APIRoute } from "astro";
import { createDemoReview, deleteDemoReview } from "../../lib/queries";
import { parseAppId, getStoreAppDetails } from "../../lib/steam";

const VALID_TIERS = ["S", "A", "B", "C", "D", "F"] as const;
const VALID_VERDICTS = ["finished", "dropped", "playing", "later"] as const;
const MIN_NOTE = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { appIdOrUrl, verdict, tier, rating, note } = body;

  const appId = parseAppId(String(appIdOrUrl ?? ""));
  if (!appId) {
    return json({ error: "Укажи Steam appid или ссылку на страницу демки" }, 400);
  }

  if (verdict != null && !VALID_VERDICTS.includes(verdict)) {
    return json({ error: "Некорректный вердикт" }, 400);
  }
  if (tier != null && !VALID_TIERS.includes(tier)) {
    return json({ error: "Некорректный тир" }, 400);
  }
  if (rating != null && (rating < 1 || rating > 5)) {
    return json({ error: "Оценка от 1 до 5" }, 400);
  }
  if (!note || String(note).length < MIN_NOTE) {
    return json({ error: `Заметка минимум ${MIN_NOTE} символов` }, 400);
  }

  const details = await getStoreAppDetails(appId);
  if (!details) {
    return json({ error: "Не нашёл игру в Steam по этому appid" }, 400);
  }

  const result = await createDemoReview(userId, {
    appId,
    title: details.name,
    headerImage: details.headerImage,
    verdict: verdict ?? null,
    tier: tier ?? null,
    rating: rating ?? null,
    note: String(note),
  });

  if ("error" in result) return json(result, 400);
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request, session }) => {
  const userId = await session?.get<number>("userId");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const gameId = Number(body?.gameId);
  if (!gameId) return json({ error: "gameId required" }, 400);

  const result = await deleteDemoReview(userId, gameId);
  if ("error" in result) return json(result, 400);
  return json({ ok: true });
};
