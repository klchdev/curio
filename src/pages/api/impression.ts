import type { APIRoute } from "astro";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";
import { getUserId } from "../../lib/auth";
import {
  saveImpression,
  createDemoReview,
  getStoredPlaytime,
} from "../../lib/queries";
import { getRecentPlaytime, parseAppId, getStoreAppDetails } from "../../lib/steam";
import { queueEntryAnalysis } from "../../lib/entry-analysis";
import { SHEET_RULES, isValidTier, isValidVerdict, type ImpressionMode } from "../../lib/vocab";
import { db } from "../../db";
import { users, slots, games } from "../../db/schema";
import { eq, and } from "drizzle-orm";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Единственный эндпоинт записи мнения. Заменил complete, note, game-note,
 * retrospective, quick-verdict и demo-review POST — все они отличались
 * набором обязательных полей, а не сутью.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));
  const body = await request.json();
  const mode = body.mode as ImpressionMode;
  const rule = SHEET_RULES[mode];
  if (!rule) return json({ error: s.errors.unknownMode }, 400);

  const { slotId, gameId, verdict, tier, rating, note, appIdOrUrl, previous } = body;

  if (verdict != null && !isValidVerdict(verdict)) return json({ error: s.errors.badVerdict }, 400);
  if (tier != null && !isValidTier(tier)) return json({ error: s.errors.badTier }, 400);
  // Клиент шлёт 1-5, но роут — публичный вход, и полагаться на него нельзя
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return json({ error: s.errors.badRating }, 400);
  }

  // Демка — единственный режим, где игры может ещё не быть в базе
  if (mode === "demo") {
    const appId = parseAppId(String(appIdOrUrl ?? ""));
    if (!appId) return json({ error: s.errors.needAppId }, 400);
    if (!note || String(note).length < rule.minNote) {
      return json({ error: `Заметка минимум ${rule.minNote} символов` }, 400);
    }

    const details = await getStoreAppDetails(appId);
    if (!details) return json({ error: s.errors.steamNotFound }, 400);

    const result = await createDemoReview(userId, {
      appId,
      title: details.name,
      headerImage: details.headerImage,
      verdict: verdict ?? null,
      tier: tier ?? null,
      rating: rating ?? null,
      note: String(note),
    });
    return "error" in result ? json(result, 400) : json({ ok: true });
  }

  // Для остальных режимов нужно наигранное время — от него считается дельта
  let targetGameId: number | undefined = gameId;
  let currentPlaytime = 0;

  if (mode === "slot-first" || (mode === "entry" && slotId)) {
    const slot = await db
      .select({ gameId: slots.gameId })
      .from(slots)
      .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
      .limit(1)
      .then((rows) => rows[0]);
    if (!slot) return json({ error: s.errors.contractNotFound }, 404);
    targetGameId = slot.gameId;
  }

  if (!targetGameId) return json({ error: s.errors.noGame }, 400);

  const game = await db
    .select({ id: games.id, steamAppId: games.steamAppId })
    .from(games)
    .where(eq(games.id, targetGameId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!game) return json({ error: s.errors.gameNotFound }, 404);

  if (mode === "slot-first") {
    // Закрытие контракта опирается на факт: 20 минут должны быть настоящими
    const user = await db
      .select({ steamId: users.steamId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!user) return json({ error: s.errors.userNotFound }, 404);
    currentPlaytime = await getRecentPlaytime(user.steamId, game.steamAppId);
  } else {
    currentPlaytime = await getStoredPlaytime(userId, game.id);
  }

  const result = await saveImpression(userId, {
    mode,
    slotId,
    gameId: targetGameId,
    verdict: verdict ?? undefined,
    tier: tier ?? undefined,
    rating: rating ?? undefined,
    note: note ?? undefined,
    currentPlaytime,
    previous,
  });

  if ("error" in result) return json(result, 400);

  // Разбор текста идёт в фоне: ответ на сохранение он задерживать не должен
  if (result.entryId) queueEntryAnalysis(result.entryId);

  return json({ ok: true });
};
