import { db } from "../db";
import {
  games,
  userGames,
  slots,
  slotSkips,
  gameRecords,
  gameEntries,
  recommendationRuns,
  recommendations,
  deepDives,
} from "../db/schema";
import { eq, and, or, sql, ne, lte, desc, gt, lt, inArray } from "drizzle-orm";
import {
  THRESHOLDS,
  isValidVerdict,
  SHEET_RULES,
  type Verdict,
  type Tier,
  type ImpressionMode,
} from "./vocab";

const {
  UNPLAYED_MAX_MINUTES,
  MAX_ACTIVE_SLOTS,
  MIN_PLAYTIME_TO_REVIEW,
  STILL_PLAYING_DELTA,
  CANDIDATE_MAX_MINUTES,
  TRIAGE_MIN_MINUTES,
  TRIAGE_PAGE_SIZE,
} = THRESHOLDS;

export async function getActiveSlots(userId: number) {
  return db
    .select({
      slot: {
        id: slots.id,
        userId: slots.userId,
        gameId: slots.gameId,
        status: slots.status,
        playtimeOnStart: slots.playtimeOnStart,
        startedAt: slots.startedAt,
      },
      game: {
        id: games.id,
        steamAppId: games.steamAppId,
        title: games.title,
        headerImage: games.headerImage,
      },
      currentPlaytime: userGames.playtimeMinutes,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .leftJoin(
      userGames,
      and(eq(userGames.userId, userId), eq(userGames.gameId, slots.gameId))
    )
    .where(and(eq(slots.userId, userId), eq(slots.status, "active")));
}

export async function canSpin(userId: number): Promise<boolean> {
  const active = await getActiveSlots(userId);
  return active.length < MAX_ACTIVE_SLOTS;
}

export async function getUnplayedGames(userId: number) {
  const usedGameIds = (
    await db
      .select({ gameId: slots.gameId })
      .from(slots)
      .where(and(eq(slots.userId, userId), ne(slots.status, "skipped")))
  ).map((s) => s.gameId);

  const blockedIds = new Set(usedGameIds);

  const rows = await db
    .select({
      id: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      headerImage: games.headerImage,
    })
    .from(userGames)
    .innerJoin(games, eq(userGames.gameId, games.id))
    .where(
      and(
        eq(userGames.userId, userId),
        lte(userGames.playtimeMinutes, UNPLAYED_MAX_MINUTES),
        eq(userGames.excluded, false),
        eq(games.isDemo, false),
        eq(games.isSoftware, false)
      )
    );

  return rows.filter((row) => !blockedIds.has(row.id));
}

/**
 * Контракт на конкретную игру. Рулетка выбирает вслепую, советчик — по
 * вкусу, но обязательство одно и то же: 20 минут и первое впечатление.
 */
export async function takeContract(userId: number, gameId: number) {
  if (!(await canSpin(userId))) {
    return { error: "Все три контракта заняты" };
  }

  const owned = await db
    .select({ playtimeMinutes: userGames.playtimeMinutes })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!owned) return { error: "Игра не найдена в библиотеке" };

  const active = await db
    .select({ id: slots.id })
    .from(slots)
    .where(
      and(eq(slots.userId, userId), eq(slots.gameId, gameId), eq(slots.status, "active"))
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (active) return { error: "Контракт на эту игру уже есть" };

  const [slot] = await db
    .insert(slots)
    .values({
      userId,
      gameId,
      playtimeOnStart: owned.playtimeMinutes,
      startedAt: new Date(),
    })
    .returning({ id: slots.id });

  return { ok: true as const, slotId: slot!.id };
}

export async function spinRoulette(userId: number) {
  if (!(await canSpin(userId))) return null;

  const pool = await getUnplayedGames(userId);
  if (pool.length === 0) return null;

  const picked = pool[Math.floor(Math.random() * pool.length)];

  const ug = await db
    .select({ playtimeMinutes: userGames.playtimeMinutes })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, picked.id)))
    .limit(1)
    .then((rows) => rows[0]);

  const [slot] = await db
    .insert(slots)
    .values({
      userId,
      gameId: picked.id,
      playtimeOnStart: ug?.playtimeMinutes ?? 0,
      startedAt: new Date(),
    })
    .returning({
      id: slots.id,
      userId: slots.userId,
      gameId: slots.gameId,
      status: slots.status,
      playtimeOnStart: slots.playtimeOnStart,
      startedAt: slots.startedAt,
    });

  const decoys = pool
    .filter((g) => g.id !== picked.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(15, pool.length - 1))
    .map((g) => ({ title: g.title, headerImage: g.headerImage }));

  return { slot, game: picked, decoys };
}

/**
 * Сохранённое наигранное время. Записи в дневник им и обходятся: тянуть ради
 * одного числа всю библиотеку из Steam незачем, а актуализируют её синк,
 * кнопка обновления и закрытие контракта.
 */
export async function getStoredPlaytime(userId: number, gameId: number): Promise<number> {
  const row = await db
    .select({ playtimeMinutes: userGames.playtimeMinutes })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  return row?.playtimeMinutes ?? 0;
}

/**
 * Единая очередь «требует внимания» вместо четырёх списков с четырьмя
 * порогами. Раньше игра с 70 минутами и без вердикта попадала и в список
 * дашборда, и в триаж на странице советов — это не два состояния, а одно.
 *
 * triage — сыграно ощутимо, но вердикта нет вообще
 * update — отзыв есть, но с тех пор наиграно заметно больше
 */
export type AttentionItem =
  | {
      reason: "triage";
      gameId: number;
      steamAppId: number;
      title: string;
      headerImage: string | null;
      playtimeMinutes: number;
      lastPlayedAt: string | null;
      /** Текст уже есть (например, перенесён из Steam) — не хватает вердикта. */
      hasReview: boolean;
    }
  | {
      reason: "update";
      /** Откуда отзыв: он определяет, какой формой его дополнять. */
      source: "game" | "slot";
      slotId: number | null;
      gameId: number;
      steamAppId: number;
      title: string;
      headerImage: string | null;
      currentPlaytime: number;
      lastRecordedPlaytime: number;
      delta: number;
      existingVerdict: string | null;
      existingRating: number | null;
      existingNote: string | null;
      existingTier: string | null;
    };

export async function getAttentionQueue(
  userId: number,
  options?: { triageLimit?: number }
): Promise<{ items: AttentionItem[]; triageTotal: number }> {
  const triageLimit = options?.triageLimit ?? TRIAGE_PAGE_SIZE;

  const [records, activeSlots, playedGames] = await Promise.all([
    db
      .select({
        gameId: gameRecords.gameId,
        steamAppId: games.steamAppId,
        title: games.title,
        headerImage: games.headerImage,
        slotId: gameRecords.slotId,
        origin: gameRecords.origin,
        verdict: gameRecords.verdict,
        rating: gameRecords.rating,
        tier: gameRecords.tier,
        lastRecorded: gameRecords.playtimeAtLastEntry,
        currentPlaytime: userGames.playtimeMinutes,
      })
      .from(gameRecords)
      .innerJoin(games, eq(games.id, gameRecords.gameId))
      .leftJoin(
        userGames,
        and(eq(userGames.userId, userId), eq(userGames.gameId, gameRecords.gameId))
      )
      .where(and(eq(gameRecords.userId, userId), eq(games.isDemo, false))),

    db
      .select({ gameId: slots.gameId })
      .from(slots)
      .where(and(eq(slots.userId, userId), eq(slots.status, "active"))),

    db
      .select({
        gameId: games.id,
        steamAppId: games.steamAppId,
        title: games.title,
        headerImage: games.headerImage,
        playtimeMinutes: userGames.playtimeMinutes,
        lastPlayedAt: userGames.lastPlayedAt,
      })
      .from(userGames)
      .innerJoin(games, eq(userGames.gameId, games.id))
      .where(
        and(
          eq(userGames.userId, userId),
          eq(games.isDemo, false),
          // Blender и Wallpaper Engine наиграны сотнями часов, но «прошёл» им не подходит
          eq(games.isSoftware, false),
          gt(userGames.playtimeMinutes, TRIAGE_MIN_MINUTES)
        )
      )
      .orderBy(desc(userGames.playtimeMinutes)),
  ]);

  /*
   * В разбор попадает и то, по чему запись уже есть, но вердикта нет:
   * так приходят отзывы, перенесённые из Steam. Иначе они исчезали бы из
   * очереди, не получив ни «прошёл», ни «бросил».
   */
  const reviewedGameIds = new Set(
    records.filter((r) => r.verdict !== null).map((r) => r.gameId)
  );

  type UpdateItem = Extract<AttentionItem, { reason: "update" }>;

  const updates: UpdateItem[] = records
    .map((row): UpdateItem | null => {
      const current = row.currentPlaytime ?? 0;
      const delta = current - row.lastRecorded;
      if (delta < STILL_PLAYING_DELTA) return null;

      return {
        reason: "update" as const,
        source: row.origin === "roulette" ? ("slot" as const) : ("game" as const),
        slotId: row.slotId,
        gameId: row.gameId,
        steamAppId: row.steamAppId,
        title: row.title,
        headerImage: row.headerImage,
        currentPlaytime: current,
        lastRecordedPlaytime: row.lastRecorded,
        delta,
        existingVerdict: row.verdict,
        existingRating: row.rating,
        existingNote: null,
        existingTier: row.tier,
      };
    })
    .filter((item): item is UpdateItem => item !== null)
    .sort((a, b) => b.delta - a.delta);

  const activeGameIds = new Set(activeSlots.map((r) => r.gameId));
  const withText = new Set(records.map((r) => r.gameId));

  type TriageItem = Extract<AttentionItem, { reason: "triage" }>;

  const triage = playedGames
    .filter((g) => !reviewedGameIds.has(g.gameId) && !activeGameIds.has(g.gameId))
    .map(
      (g): TriageItem => ({
        reason: "triage",
        gameId: g.gameId,
        steamAppId: g.steamAppId,
        title: g.title,
        headerImage: g.headerImage,
        playtimeMinutes: g.playtimeMinutes,
        lastPlayedAt: g.lastPlayedAt instanceof Date ? g.lastPlayedAt.toISOString() : null,
        hasReview: withText.has(g.gameId),
      })
    )
    /*
     * Сначала те, где текст уже написан: им не хватает одного клика, а среди
     * четырёх сотен нетронутых игр они иначе просто утонут.
     */
    .sort((a, b) => Number(b.hasReview) - Number(a.hasReview));

  return {
    items: [...updates, ...triage.slice(0, triageLimit)],
    triageTotal: triage.length,
  };
}

/**
 * Метка бесплатного скипа в slot_skips. Это данные, а не текст интерфейса:
 * по ней считаются потраченные скипы, поэтому она не переводится.
 */
export const FREE_SKIP_MARKER = "Бесплатный скип";

export async function getFreeSkips(userId: number) {
  const reviewedCount = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")))
    .then((rows) => rows[0]))?.count ?? 0;

  const freeSkipsUsed = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .innerJoin(slotSkips, eq(slotSkips.slotId, slots.id))
    .where(
      and(
        eq(slots.userId, userId),
        eq(slotSkips.reasonType, "legitimate"),
        eq(slotSkips.reasonText, FREE_SKIP_MARKER)
      )
    )
    .then((rows) => rows[0]))?.count ?? 0;

  const earned = Math.floor(reviewedCount / 3);
  return { available: Math.max(0, earned - freeSkipsUsed), earned, used: freeSkipsUsed, reviewedCount };
}

export async function skipSlot(
  slotId: number,
  userId: number,
  reasonType: "legitimate" | "shame",
  reasonText: string
) {
  const slot = await db
    .select({ id: slots.id, status: slots.status, gameId: slots.gameId })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!slot || slot.status !== "active") return { error: "Invalid slot" };

  await db.update(slots)
    .set({ status: "skipped" })
    .where(eq(slots.id, slotId));

  await db.insert(slotSkips)
    .values({ slotId, reasonType, reasonText, skippedAt: new Date() });

  if (reasonType === "legitimate" && reasonText !== "Бесплатный скип") {
    await db
      .update(userGames)
      .set({ excluded: true })
      .where(and(eq(userGames.userId, userId), eq(userGames.gameId, slot.gameId)));
  }

  return { ok: true };
}

/**
 * Дневник: лента записей об играх плюс пропуски контрактов. Раньше здесь
 * склеивались три источника с разными формами строк и ручной дедупликацией.
 */
export async function getHistory(userId: number) {
  const [entries, skips] = await Promise.all([
    db
      .select({
        entryId: gameEntries.id,
        gameId: gameRecords.gameId,
        steamAppId: games.steamAppId,
        gameTitle: games.title,
        gameImage: games.headerImage,
        kind: gameEntries.kind,
        note: gameEntries.text,
        playtimeMinutes: gameEntries.playtimeTotalMinutes,
        deltaMinutes: gameEntries.playtimeDeltaMinutes,
        verdict: gameEntries.verdictAt,
        rating: gameEntries.ratingAt,
        tier: gameEntries.tierAt,
        date: gameEntries.createdAt,
        currentVerdict: gameRecords.verdict,
        currentRating: gameRecords.rating,
        currentTier: gameRecords.tier,
        /** Откуда текст: перенесённый из Steam честнее пометить. */
        origin: gameRecords.origin,
      })
      .from(gameEntries)
      .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
      .innerJoin(games, eq(games.id, gameRecords.gameId))
      .where(and(eq(gameRecords.userId, userId), eq(games.isDemo, false)))
      .orderBy(desc(gameEntries.createdAt)),

    db
      .select({
        slotId: slots.id,
        gameId: games.id,
        gameTitle: games.title,
        gameImage: games.headerImage,
        reasonType: slotSkips.reasonType,
        reasonText: slotSkips.reasonText,
        date: slotSkips.skippedAt,
      })
      .from(slotSkips)
      .innerJoin(slots, eq(slots.id, slotSkips.slotId))
      .innerJoin(games, eq(games.id, slots.gameId))
      .where(eq(slots.userId, userId)),
  ]);

  const timeline = [
    ...entries.map((entry) => ({ type: "reviewed" as const, ...entry })),
    ...skips.map((skip) => ({ type: "skipped" as const, ...skip })),
  ];

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return timeline;
}

export async function getTierList(userId: number) {
  return db
    .select({
      gameId: gameRecords.gameId,
      gameTitle: games.title,
      gameImage: games.headerImage,
      steamAppId: games.steamAppId,
      tier: gameRecords.tier,
      verdict: gameRecords.verdict,
      rating: gameRecords.rating,
    })
    .from(gameRecords)
    .innerJoin(games, eq(games.id, gameRecords.gameId))
    .where(and(eq(gameRecords.userId, userId), eq(games.isDemo, false)));
}

/** Тир живёт в одной таблице, поэтому путь тоже один. */
export async function setTier(
  userId: number,
  gameId: number,
  tier: Tier | null
): Promise<SaveResult> {
  const existing = await db
    .select({ id: gameRecords.id })
    .from(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) return { error: "Запись об игре не найдена" };

  await db.update(gameRecords).set({ tier }).where(eq(gameRecords.id, existing.id));
  return { ok: true };
}

export async function createDemoReview(
  userId: number,
  data: {
    appId: number;
    title: string;
    headerImage: string | null;
    verdict?: "finished" | "dropped" | "playing" | "later" | null;
    tier?: "S" | "A" | "B" | "C" | "D" | "F" | null;
    rating?: number | null;
    note: string;
  }
) {
  // upsert game row flagged as demo
  await db
    .insert(games)
    .values({
      steamAppId: data.appId,
      title: data.title,
      headerImage: data.headerImage,
      isDemo: true,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: games.steamAppId,
      set: {
        title: sql`excluded.title`,
        headerImage: sql`excluded.header_image`,
        isDemo: true,
      },
    });

  const game = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.steamAppId, data.appId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!game) return { error: "Failed to create game" };

  // link to user (playtime not tracked for demos)
  await db
    .insert(userGames)
    .values({ userId, gameId: game.id, playtimeMinutes: 0 })
    .onConflictDoNothing({
      target: [userGames.userId, userGames.gameId],
    });

  const recordId = await upsertRecord(userId, game.id, {
    verdict: data.verdict,
    tier: data.tier,
    rating: data.rating,
    origin: "demo",
    playtimeMinutes: 0,
  });

  if (data.note && data.note.trim().length > 0) {
    await addEntry(recordId, {
      kind: "first",
      text: data.note.trim(),
      playtimeMinutes: 0,
      verdict: data.verdict,
      rating: data.rating,
      tier: data.tier,
    });
  }

  return { ok: true };
}

/**
 * Статистика по единой модели. Раньше считались только слотовые отзывы,
 * поэтому профиль показывал 14 игр вместо 139 и «наиграно» означало не
 * общее время, а время после спинов.
 */
export async function getDemoReviews(userId: number) {
  return db
    .select({
      gameId: gameRecords.gameId,
      steamAppId: games.steamAppId,
      title: games.title,
      headerImage: games.headerImage,
      verdict: gameRecords.verdict,
      tier: gameRecords.tier,
      rating: gameRecords.rating,
      createdAt: gameRecords.createdAt,
      note: gameEntries.text,
    })
    .from(gameRecords)
    .innerJoin(games, eq(games.id, gameRecords.gameId))
    .leftJoin(gameEntries, eq(gameEntries.recordId, gameRecords.id))
    .where(and(eq(gameRecords.userId, userId), eq(games.isDemo, true)))
    .orderBy(desc(gameRecords.createdAt));
}

/** Запись уносит свою ленту каскадом, отдельная чистка заметок не нужна. */
export async function deleteDemoReview(userId: number, gameId: number) {
  await db
    .delete(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)));

  await db
    .delete(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)));

  return { ok: true };
}

export async function getStats(userId: number) {
  const [records, shameSkips, libraryRow, activeRow, skippedRow, excludedRow] = await Promise.all([
    db
      .select({
        verdict: gameRecords.verdict,
        rating: gameRecords.rating,
        playtime: gameRecords.playtimeAtLastEntry,
        createdAt: gameRecords.createdAt,
      })
      .from(gameRecords)
      .innerJoin(games, eq(games.id, gameRecords.gameId))
      .where(and(eq(gameRecords.userId, userId), eq(games.isDemo, false))),

    db
      .select({ gameTitle: games.title, skippedAt: slotSkips.skippedAt })
      .from(slotSkips)
      .innerJoin(slots, eq(slots.id, slotSkips.slotId))
      .innerJoin(games, eq(games.id, slots.gameId))
      .where(and(eq(slots.userId, userId), eq(slotSkips.reasonType, "shame"))),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userGames)
      .where(eq(userGames.userId, userId)),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(slots)
      .where(and(eq(slots.userId, userId), eq(slots.status, "active"))),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(slots)
      .where(and(eq(slots.userId, userId), eq(slots.status, "skipped"))),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userGames)
      .where(and(eq(userGames.userId, userId), eq(userGames.excluded, true))),
  ]);

  const totalGames = records.length;
  const totalMinutes = records.reduce((sum, r) => sum + r.playtime, 0);
  const avgMinutes = totalGames > 0 ? Math.round(totalMinutes / totalGames) : 0;

  const rated = records.filter((r) => r.rating != null);
  const avgRating =
    rated.length > 0
      ? Math.round((rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length) * 10) / 10
      : 0;

  const byVerdict = (verdict: string) => records.filter((r) => r.verdict === verdict).length;

  // Серия: сколько дней подряд появляются новые записи, без провалов
  const days = [...new Set(records.map((r) => new Date(r.createdAt).toDateString()))]
    .map((d) => new Date(d).getTime())
    .sort((a, b) => b - a);

  let streak = 0;
  const DAY = 24 * 60 * 60 * 1000;
  for (let i = 0; i < days.length; i += 1) {
    if (i === 0 || days[i - 1]! - days[i]! <= DAY * 1.5) streak += 1;
    else break;
  }

  return {
    totalGames,
    totalMinutes,
    avgMinutes,
    streak,
    wallOfShame: shameSkips.map((s) => s.gameTitle),
    totalLibrary: libraryRow[0]?.n ?? 0,
    poolSize: (await getUnplayedGames(userId)).length,
    excludedCount: excludedRow[0]?.n ?? 0,
    activeCount: activeRow[0]?.n ?? 0,
    skippedCount: skippedRow[0]?.n ?? 0,
    finishedCount: byVerdict("finished"),
    droppedCount: byVerdict("dropped"),
    playingCount: byVerdict("playing"),
    laterCount: byVerdict("later"),
    avgRating,
  };
}

const CANDIDATE_LIMIT = 700;
const ABANDONED_LIMIT = 60;

export interface ReviewCorpusItem {
  title: string;
  tier: string | null;
  rating: number | null;
  verdict: string | null;
  hours: number;
  isDemo: boolean;
  note: string | null;
}

export async function getReviewCorpus(userId: number): Promise<ReviewCorpusItem[]> {
  const records = await db
    .select({
      recordId: gameRecords.id,
      title: games.title,
      tier: gameRecords.tier,
      rating: gameRecords.rating,
      verdict: gameRecords.verdict,
      minutes: gameRecords.playtimeAtLastEntry,
      isDemo: games.isDemo,
    })
    .from(gameRecords)
    .innerJoin(games, eq(games.id, gameRecords.gameId))
    .where(eq(gameRecords.userId, userId));

  const entries = await db
    .select({
      recordId: gameEntries.recordId,
      text: gameEntries.text,
      playtimeMinutes: gameEntries.playtimeTotalMinutes,
      createdAt: gameEntries.createdAt,
    })
    .from(gameEntries)
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .where(eq(gameRecords.userId, userId))
    .orderBy(gameEntries.createdAt);

  const byRecord = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!byRecord.has(entry.recordId)) byRecord.set(entry.recordId, []);
    byRecord.get(entry.recordId)!.push(entry);
  }

  return records.map((record) => {
    const timeline = byRecord.get(record.recordId) ?? [];
    /*
     * Модель видит всю ленту, а не одну первую заметку — ради этого и
     * затевалось объединение. Штамп наигранного показывает, на каком часу
     * мнение менялось.
     */
    const note = timeline
      .map((entry, index) => {
        const hours = Math.round((entry.playtimeMinutes / 60) * 10) / 10;
        return timeline.length > 1 ? `[${hours}ч] ${entry.text}` : entry.text;
      })
      .join("\n\n");

    return {
      title: record.title,
      tier: record.tier,
      rating: record.rating,
      verdict: record.verdict,
      hours: Math.round((record.minutes / 60) * 10) / 10,
      isDemo: record.isDemo,
      note: note || null,
    };
  });
}

export async function getReviewCorpusSize(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gameRecords)
    .where(eq(gameRecords.userId, userId));

  return row?.n ?? 0;
}

export interface CandidateGame {
  gameId: number;
  steamAppId: number;
  title: string;
  hours: number;
  lastPlayedAt: Date | null;
  /*
   * Жанры и описание из магазина. Без них модель знала о кандидате только
   * название и всё остальное восстанавливала по памяти — для инди и для
   * всего, что вышло после её обучения, это выдумка.
   */
  genres: string | null;
  description: string | null;
  releaseDate: string | null;
}

/** Нетронутое и едва начатое: то, что имеет смысл советовать. */
export async function getRecommendationCandidates(userId: number): Promise<CandidateGame[]> {
  const reviewedIds = await getReviewedGameIds(userId);

  const rows = await db
    .select({
      gameId: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      genres: games.genres,
      description: games.shortDescription,
      releaseDate: games.releaseDate,
      minutes: userGames.playtimeMinutes,
      lastPlayedAt: userGames.lastPlayedAt,
    })
    .from(userGames)
    .innerJoin(games, eq(userGames.gameId, games.id))
    .where(
      and(
        eq(userGames.userId, userId),
        eq(games.isDemo, false),
        eq(games.isSoftware, false),
        eq(userGames.excluded, false),
        lt(userGames.playtimeMinutes, CANDIDATE_MAX_MINUTES)
      )
    )
    .orderBy(desc(userGames.playtimeMinutes))
    .limit(CANDIDATE_LIMIT);

  return rows
    .filter((row) => !reviewedIds.has(row.gameId))
    .map((row) => ({
      gameId: row.gameId,
      steamAppId: row.steamAppId,
      title: row.title,
      hours: Math.round((row.minutes / 60) * 10) / 10,
      lastPlayedAt: row.lastPlayedAt,
      genres: row.genres,
      description: row.description,
      releaseDate: row.releaseDate,
    }));
}

/**
 * Брошенное — только по ЯВНОМУ вердикту игрока. Раньше сюда попадало всё
 * сыгранное без отзыва, из-за чего пройденные игры разбирались как брошенные.
 */
export async function getAbandonedGames(userId: number): Promise<CandidateGame[]> {
  const rows = await db
    .select({
      gameId: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      genres: games.genres,
      description: games.shortDescription,
      releaseDate: games.releaseDate,
      minutes: userGames.playtimeMinutes,
      lastPlayedAt: userGames.lastPlayedAt,
    })
    .from(gameRecords)
    .innerJoin(games, eq(gameRecords.gameId, games.id))
    .innerJoin(
      userGames,
      and(eq(userGames.gameId, games.id), eq(userGames.userId, userId))
    )
    .where(
      and(
        eq(gameRecords.userId, userId),
        eq(gameRecords.verdict, "dropped"),
        eq(games.isDemo, false),
        eq(games.isSoftware, false),
        eq(userGames.excluded, false),
        /*
         * Спор, на который уже ответили, не поднимается снова — иначе модель
         * спорит об одном и том же каждый прогон. Но если с тех пор игру
         * запускали, разговор снова осмыслен: аргумент проверяли делом.
         */
        sql`not exists (
          select 1 from ${gameEntries}
          where ${gameEntries.recordId} = ${gameRecords.id}
            and ${gameEntries.kind} = 'advisor'
            and ${gameEntries.playtimeTotalMinutes} >= ${userGames.playtimeMinutes}
        )`
      )
    )
    .orderBy(desc(userGames.playtimeMinutes))
    .limit(ABANDONED_LIMIT);

  return rows.map((row) => ({
    gameId: row.gameId,
    steamAppId: row.steamAppId,
    title: row.title,
    hours: Math.round((row.minutes / 60) * 10) / 10,
    lastPlayedAt: row.lastPlayedAt,
    genres: row.genres,
    description: row.description,
    releaseDate: row.releaseDate,
  }));
}

async function getReviewedGameIds(userId: number): Promise<Set<number>> {
  const rows = await db
    .select({ gameId: gameRecords.gameId })
    .from(gameRecords)
    .where(eq(gameRecords.userId, userId));

  return new Set(rows.map((r) => r.gameId));
}

/** Прогон, зависший дольше этого, считаем сорванным (процесс мог перезапуститься). */
export const RUN_STALE_MS = 5 * 60 * 1000;

export type RunStage = "collecting" | "thinking" | "saving";

export async function createRecommendationRun(userId: number, model: string) {
  const run = await db
    .insert(recommendationRuns)
    .values({ userId, model, status: "pending", stage: "collecting" })
    .returning({ id: recommendationRuns.id })
    .then((rows) => rows[0]);

  return run.id;
}

export async function updateRunProgress(
  runId: number,
  data: { stage?: RunStage; picksReady?: number }
) {
  await db.update(recommendationRuns).set(data).where(eq(recommendationRuns.id, runId));
}

export async function completeRecommendationRun(
  runId: number,
  data: {
    profile: string;
    reviewsUsed: number;
    candidatesUsed: number;
    items: {
      gameId: number;
      tier: "S" | "A" | "B" | "C" | "D";
      reason: string;
      grounding: "known" | "from-description" | "guess";
    }[];
    abandoned: { gameId: number; stance: "agree" | "disagree"; text: string }[];
  }
) {
  const rows = [
    ...data.items.map((item, index) => ({
      runId,
      gameId: item.gameId,
      kind: "pick" as const,
      tier: item.tier,
      stance: null,
      rank: index,
      reason: item.reason,
      grounding: item.grounding,
    })),
    ...data.abandoned.map((item, index) => ({
      runId,
      gameId: item.gameId,
      kind: "abandoned" as const,
      tier: null,
      stance: item.stance,
      rank: index,
      reason: item.text,
    })),
  ];

  if (rows.length > 0) {
    await db.insert(recommendations).values(rows);
  }

  await db
    .update(recommendationRuns)
    .set({
      status: "done",
      stage: "saving",
      picksReady: data.items.length,
      profile: data.profile,
      reviewsUsed: data.reviewsUsed,
      candidatesUsed: data.candidatesUsed,
      finishedAt: new Date(),
    })
    .where(eq(recommendationRuns.id, runId));
}

export async function failRecommendationRun(runId: number, message: string) {
  await db
    .update(recommendationRuns)
    .set({ status: "error", error: message.slice(0, 500), finishedAt: new Date() })
    .where(eq(recommendationRuns.id, runId));
}

/** true, если у пользователя уже крутится незавершённый прогон. */
export async function hasActiveRun(userId: number): Promise<boolean> {
  const run = await db
    .select({ createdAt: recommendationRuns.createdAt })
    .from(recommendationRuns)
    .where(
      and(eq(recommendationRuns.userId, userId), eq(recommendationRuns.status, "pending"))
    )
    .orderBy(desc(recommendationRuns.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!run) return false;
  return Date.now() - new Date(run.createdAt).getTime() < RUN_STALE_MS;
}

export async function getRunStatus(userId: number, runId: number) {
  const run = await db
    .select({
      id: recommendationRuns.id,
      status: recommendationRuns.status,
      stage: recommendationRuns.stage,
      picksReady: recommendationRuns.picksReady,
      error: recommendationRuns.error,
      createdAt: recommendationRuns.createdAt,
    })
    .from(recommendationRuns)
    .where(and(eq(recommendationRuns.id, runId), eq(recommendationRuns.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!run) return null;

  const stale =
    run.status === "pending" && Date.now() - new Date(run.createdAt).getTime() > RUN_STALE_MS;

  return {
    ...run,
    status: stale ? ("error" as const) : run.status,
    error: stale ? "Генерация прервалась — попробуй ещё раз" : run.error,
  };
}

export async function getLatestRecommendations(userId: number) {
  const run = await db
    .select()
    .from(recommendationRuns)
    .where(and(eq(recommendationRuns.userId, userId), eq(recommendationRuns.status, "done")))
    .orderBy(desc(recommendationRuns.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!run) return null;

  const items = await db
    .select({
      gameId: recommendations.gameId,
      steamAppId: games.steamAppId,
      title: games.title,
      headerImage: games.headerImage,
      kind: recommendations.kind,
      tier: recommendations.tier,
      stance: recommendations.stance,
      reason: recommendations.reason,
      grounding: recommendations.grounding,
      hours: userGames.playtimeMinutes,
      /*
       * Разбор, если он уже делался. Без него тир на карточке и вердикт
       * разбора расходились бы до первого клика: первый проход судит по
       * описанию, разбор — по механике из отзывов.
       */
      deepFit: deepDives.fit,
      deepTier: deepDives.tier,
    })
    .from(recommendations)
    .innerJoin(games, eq(recommendations.gameId, games.id))
    .leftJoin(
      userGames,
      and(eq(userGames.gameId, recommendations.gameId), eq(userGames.userId, userId))
    )
    .leftJoin(
      deepDives,
      and(eq(deepDives.gameId, recommendations.gameId), eq(deepDives.userId, userId))
    )
    .where(eq(recommendations.runId, run.id))
    .orderBy(recommendations.rank);

  return {
    id: run.id,
    model: run.model,
    profile: run.profile,
    reviewsUsed: run.reviewsUsed,
    candidatesUsed: run.candidatesUsed,
    createdAt: run.createdAt,
    items: items
      .filter((item) => item.kind === "pick" && item.tier)
      .map((item) => ({
        gameId: item.gameId,
        steamAppId: item.steamAppId,
        title: item.title,
        headerImage: item.headerImage,
        tier: item.tier!,
        reason: item.reason,
        grounding: item.grounding,
        deepFit: item.deepFit,
        deepTier: item.deepTier,
        hours: Math.round(((item.hours ?? 0) / 60) * 10) / 10,
      })),
    abandoned: items
      .filter((item) => item.kind === "abandoned" && item.stance)
      .map((item) => ({
        gameId: item.gameId,
        steamAppId: item.steamAppId,
        title: item.title,
        headerImage: item.headerImage,
        stance: item.stance!,
        text: item.reason,
        hours: Math.round(((item.hours ?? 0) / 60) * 10) / 10,
      })),
  };
}

/** Незавершённый прогон — чтобы страница подхватила прогресс после перезагрузки. */
export async function getActiveRun(userId: number) {
  const run = await db
    .select({
      id: recommendationRuns.id,
      stage: recommendationRuns.stage,
      picksReady: recommendationRuns.picksReady,
      createdAt: recommendationRuns.createdAt,
    })
    .from(recommendationRuns)
    .where(
      and(eq(recommendationRuns.userId, userId), eq(recommendationRuns.status, "pending"))
    )
    .orderBy(desc(recommendationRuns.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!run) return null;
  if (Date.now() - new Date(run.createdAt).getTime() > RUN_STALE_MS) return null;

  return run;
}


/* ================= Единая запись впечатления ================= */

export interface ImpressionInput {
  mode: ImpressionMode;
  slotId?: number;
  gameId?: number;
  verdict?: Verdict | null;
  tier?: Tier | null;
  rating?: number | null;
  note?: string | null;
  /** Абсолютное наигранное время: слот считает дельту от начала контракта. */
  currentPlaytime: number;
  /** Что было в записи до правки — чтобы отличить «не трогали» от «сбросили». */
  previous?: {
    verdict?: string | null;
    rating?: number | null;
    tier?: string | null;
  };
}

/**
 * Единственная точка записи мнения об игре.
 *
 * Раньше это делали шесть модалок через шесть эндпоинтов с разными
 * правилами. Сейчас функция раскладывает вход по существующим операциям;
 * на Шаге 2, когда slot_reviews / game_reviews / slot_notes сольются в одну
 * модель, поменяется только её тело — вызывающий код останется прежним.
 */
type SaveResult = { ok: true } | { error: string };

/**
 * Единственная точка записи мнения об игре — теперь прямо в единую модель.
 *
 * Шесть модалок писали в три таблицы по разным правилам. Здесь один путь:
 * запись обновляется, лента дополняется, а разница между контрактом и
 * ретроспективой сводится к полю origin.
 */
export async function saveImpression(
  userId: number,
  input: ImpressionInput
): Promise<SaveResult> {
  const rule = SHEET_RULES[input.mode];
  const note = input.note?.trim() ?? "";

  if (rule.noteRequired && note.length < rule.minNote) {
    return { error: `Заметка минимум ${rule.minNote} символов` };
  }
  if (note.length > 0 && note.length < rule.minNote) {
    return { error: `Заметка минимум ${rule.minNote} символов` };
  }
  if (rule.verdictRequired && !isValidVerdict(input.verdict)) {
    return { error: "Выбери вердикт" };
  }
  if (input.rating != null && (input.rating < 1 || input.rating > 5)) {
    return { error: "Оценка от 1 до 5" };
  }

  // Закрытие контракта: время считается от старта, и оно должно быть настоящим
  if (input.mode === "slot-first") {
    if (!input.slotId) return { error: "Не указан контракт" };

    const slot = await db
      .select({
        id: slots.id,
        gameId: slots.gameId,
        status: slots.status,
        playtimeOnStart: slots.playtimeOnStart,
      })
      .from(slots)
      .where(and(eq(slots.id, input.slotId), eq(slots.userId, userId)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!slot || slot.status !== "active") return { error: "Контракт не найден" };

    const played = input.currentPlaytime - slot.playtimeOnStart;
    if (played < MIN_PLAYTIME_TO_REVIEW) {
      return {
        error: `Нужно наиграть минимум ${MIN_PLAYTIME_TO_REVIEW} минут (сейчас ${played})`,
      };
    }

    await db.update(slots).set({ status: "reviewed" }).where(eq(slots.id, slot.id));

    const recordId = await upsertRecord(userId, slot.gameId, {
      verdict: input.verdict ?? "finished",
      rating: input.rating ?? 3,
      origin: "roulette",
      slotId: slot.id,
      playtimeMinutes: input.currentPlaytime,
    });

    await addEntry(recordId, {
      kind: "first",
      text: note,
      playtimeMinutes: input.currentPlaytime,
      verdict: input.verdict ?? "finished",
      rating: input.rating ?? 3,
    });

    return { ok: true };
  }

  const gameId = input.gameId;
  if (!gameId) return { error: "Не указана игра" };

  const owned = await db
    .select({ gameId: userGames.gameId })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!owned) return { error: "Игра не найдена в библиотеке" };

  const recordId = await upsertRecord(userId, gameId, {
    verdict: input.verdict,
    // Быстрый вердикт не трогает остальные поля
    tier: input.mode === "quick" ? undefined : input.tier,
    rating: input.mode === "quick" ? undefined : input.rating,
    origin: input.mode === "quick" ? "triage" : "retro",
    playtimeMinutes: input.currentPlaytime,
  });

  if (note.length >= rule.minNote && note.length > 0) {
    const existing = await db
      .select({ id: gameEntries.id })
      .from(gameEntries)
      .where(eq(gameEntries.recordId, recordId))
      .limit(1)
      .then((rows) => rows[0]);

    await addEntry(recordId, {
      kind: existing ? "update" : "first",
      text: note,
      playtimeMinutes: input.currentPlaytime,
      verdict: input.verdict,
      rating: input.rating,
      tier: input.tier,
    });
  }

  return { ok: true };
}

/* ================= Ядро единой модели ================= */

interface RecordPatch {
  verdict?: Verdict | null;
  tier?: Tier | null;
  rating?: number | null;
  /** steam — отзыв перенесён с профиля, а не написан здесь. */
  origin?: "roulette" | "retro" | "triage" | "demo" | "steam";
  slotId?: number | null;
  playtimeMinutes: number;
}

/**
 * Создаёт или обновляет запись об игре. Переданные поля перезаписывают
 * старые, непереданные остаются как были — то же различие «не трогали» /
 * «сбросили», что и в форме впечатления.
 */
async function upsertRecord(
  userId: number,
  gameId: number,
  patch: RecordPatch
): Promise<number> {
  const now = new Date();

  const existing = await db
    .select({ id: gameRecords.id })
    .from(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    const update: Record<string, unknown> = {
      lastEntryAt: now,
      playtimeAtLastEntry: sql`greatest(${gameRecords.playtimeAtLastEntry}, ${patch.playtimeMinutes})`,
    };
    if (patch.verdict !== undefined) update.verdict = patch.verdict;
    if (patch.tier !== undefined) update.tier = patch.tier;
    if (patch.rating !== undefined) update.rating = patch.rating;
    if (patch.slotId !== undefined) update.slotId = patch.slotId;

    await db.update(gameRecords).set(update).where(eq(gameRecords.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(gameRecords)
    .values({
      userId,
      gameId,
      verdict: patch.verdict ?? null,
      tier: patch.tier ?? null,
      rating: patch.rating ?? null,
      origin: patch.origin ?? "retro",
      slotId: patch.slotId ?? null,
      playtimeAtLastEntry: patch.playtimeMinutes,
      firstEntryAt: now,
      lastEntryAt: now,
      createdAt: now,
    })
    .returning({ id: gameRecords.id });

  return created!.id;
}

/** Добавляет запись в ленту со снимком мнения на этот момент. */
async function addEntry(
  recordId: number,
  data: {
    kind: "first" | "update" | "verdict" | "advisor";
    text: string;
    playtimeMinutes: number;
    verdict?: string | null;
    rating?: number | null;
    tier?: string | null;
  }
): Promise<void> {
  const previous = await db
    .select({ total: gameEntries.playtimeTotalMinutes })
    .from(gameEntries)
    .where(eq(gameEntries.recordId, recordId))
    .orderBy(desc(gameEntries.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  await db.insert(gameEntries).values({
    recordId,
    kind: data.kind,
    text: data.text,
    playtimeTotalMinutes: data.playtimeMinutes,
    playtimeDeltaMinutes: Math.max(0, data.playtimeMinutes - (previous?.total ?? 0)),
    verdictAt: data.verdict ?? null,
    ratingAt: data.rating ?? null,
    tierAt: data.tier ?? null,
    createdAt: new Date(),
  });
}

/**
 * Переносит отзывы, написанные в Steam, в корпус приложения.
 *
 * Вердикт не выставляется: палец вверх в Steam не значит «прошёл», а вниз —
 * «бросил», и придумывать за игрока нельзя. Запись без вердикта остаётся в
 * очереди разбора, и человек проставит его сам — зато текст и штамп времени
 * уже на месте.
 *
 * Игры, по которым в приложении уже есть запись, не трогаем: написанное
 * здесь свежее и подробнее.
 */
export async function importSteamReviews(
  userId: number,
  reviews: { steamAppId: number; positive: boolean; playtimeMinutes: number; text: string }[]
): Promise<{ imported: number; skippedExisting: number; notOwned: number }> {
  if (reviews.length === 0) return { imported: 0, skippedExisting: 0, notOwned: 0 };

  const appIds = reviews.map((r) => r.steamAppId);
  const owned = await db
    .select({ gameId: games.id, steamAppId: games.steamAppId, recordId: gameRecords.id })
    .from(games)
    .innerJoin(
      userGames,
      and(eq(userGames.gameId, games.id), eq(userGames.userId, userId))
    )
    .leftJoin(
      gameRecords,
      and(eq(gameRecords.gameId, games.id), eq(gameRecords.userId, userId))
    )
    .where(inArray(games.steamAppId, appIds));

  const byAppId = new Map(owned.map((row) => [row.steamAppId, row]));

  let imported = 0;
  let skippedExisting = 0;
  let notOwned = 0;

  for (const review of reviews) {
    const target = byAppId.get(review.steamAppId);
    if (!target) {
      notOwned += 1;
      continue;
    }
    if (target.recordId !== null) {
      skippedExisting += 1;
      continue;
    }

    const recordId = await upsertRecord(userId, target.gameId, {
      origin: "steam",
      playtimeMinutes: review.playtimeMinutes,
    });
    await addEntry(recordId, {
      kind: "first",
      text: review.text,
      playtimeMinutes: review.playtimeMinutes,
    });
    imported += 1;
  }

  return { imported, skippedExisting, notOwned };
}

/**
 * Ответ на аргумент советчика. Сам аргумент ложится в ленту игры: потом
 * видно, что модель звала вернуться, что ты решил и чем это кончилось.
 */
export async function recordAdvisorResponse(
  userId: number,
  gameId: number,
  data: { argument: string; accepted: boolean }
): Promise<SaveResult> {
  const record = await db
    .select({ id: gameRecords.id, playtime: gameRecords.playtimeAtLastEntry })
    .from(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!record) return { error: "Запись об игре не найдена" };

  const decision = data.accepted
    ? "Согласился дать второй шанс."
    : "Не согласился: вердикт остаётся.";

  await addEntry(record.id, {
    kind: "advisor",
    text: `${data.argument.trim()}\n\n— ${decision}`,
    playtimeMinutes: record.playtime,
  });

  return { ok: true };
}

/** Лента впечатлений об одной игре. */
export async function getGameTimeline(userId: number, gameId: number) {
  return db
    .select({
      id: gameEntries.id,
      kind: gameEntries.kind,
      text: gameEntries.text,
      playtimeMinutes: gameEntries.playtimeTotalMinutes,
      deltaMinutes: gameEntries.playtimeDeltaMinutes,
      verdict: gameEntries.verdictAt,
      rating: gameEntries.ratingAt,
      tier: gameEntries.tierAt,
      createdAt: gameEntries.createdAt,
    })
    .from(gameEntries)
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .orderBy(gameEntries.createdAt);
}
