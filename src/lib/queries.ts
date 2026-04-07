import { db } from "../db";
import {
  games,
  userGames,
  slots,
  slotReviews,
  slotSkips,
} from "../db/schema";
import { eq, and, sql, ne, lte } from "drizzle-orm";

const MAX_PLAYTIME_MINUTES = 15;
const MAX_ACTIVE_SLOTS = 3;
const MIN_PLAYTIME_TO_COMPLETE = 30;

export function getActiveSlots(userId: number) {
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
        hltbMinutes: games.hltbMinutes,
      },
      currentPlaytime: userGames.playtimeMinutes,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .leftJoin(
      userGames,
      and(eq(userGames.userId, userId), eq(userGames.gameId, slots.gameId))
    )
    .where(and(eq(slots.userId, userId), eq(slots.status, "active")))
    .all();
}

export function canSpin(userId: number): boolean {
  const active = getActiveSlots(userId);
  return active.length < MAX_ACTIVE_SLOTS;
}

export function getUnplayedGames(userId: number) {
  const usedGameIds = db
    .select({ gameId: slots.gameId })
    .from(slots)
    .where(and(eq(slots.userId, userId), ne(slots.status, "skipped")))
    .all()
    .map((s) => s.gameId);

  const excludedGameIds = db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.excluded, true))
    .all()
    .map((g) => g.id);

  const blockedIds = [...new Set([...usedGameIds, ...excludedGameIds])];

  const rows = db
    .select({
      id: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      headerImage: games.headerImage,
      hltbMinutes: games.hltbMinutes,
    })
    .from(userGames)
    .innerJoin(games, eq(userGames.gameId, games.id))
    .where(
      and(
        eq(userGames.userId, userId),
        lte(userGames.playtimeMinutes, MAX_PLAYTIME_MINUTES)
      )
    )
    .all()
    .filter((row) => !blockedIds.includes(row.id));

  return rows;
}

export function spinRoulette(userId: number) {
  if (!canSpin(userId)) return null;

  const pool = getUnplayedGames(userId);
  if (pool.length === 0) return null;

  const picked = pool[Math.floor(Math.random() * pool.length)];

  const ug = db
    .select({ playtimeMinutes: userGames.playtimeMinutes })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, picked.id)))
    .get();

  const slot = db
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
    })
    .get();

  return { slot, game: picked };
}

export function completeSlot(
  slotId: number,
  userId: number,
  rating: number,
  note: string,
  currentPlaytime: number
) {
  const slot = db
    .select({
      id: slots.id,
      status: slots.status,
      gameId: slots.gameId,
      playtimeOnStart: slots.playtimeOnStart,
    })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .get();

  if (!slot || slot.status !== "active") return { error: "Invalid slot" };

  const delta = currentPlaytime - slot.playtimeOnStart;
  if (delta < MIN_PLAYTIME_TO_COMPLETE) {
    return {
      error: `Нужно наиграть минимум ${MIN_PLAYTIME_TO_COMPLETE} минут (сейчас ${delta})`,
    };
  }
  if (rating < 1 || rating > 10) return { error: "Оценка от 1 до 10" };
  if (note.length < 50) return { error: "Заметка минимум 50 символов" };

  db.update(slots)
    .set({ status: "completed" })
    .where(eq(slots.id, slotId))
    .run();

  db.insert(slotReviews)
    .values({
      slotId,
      rating,
      note,
      playtimeMinutes: delta,
      completedAt: new Date(),
    })
    .run();

  return { ok: true };
}

export function skipSlot(
  slotId: number,
  userId: number,
  reasonType: "legitimate" | "shame",
  reasonText: string
) {
  const slot = db
    .select({ id: slots.id, status: slots.status, gameId: slots.gameId })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .get();

  if (!slot || slot.status !== "active") return { error: "Invalid slot" };

  db.update(slots)
    .set({ status: "skipped" })
    .where(eq(slots.id, slotId))
    .run();

  db.insert(slotSkips)
    .values({ slotId, reasonType, reasonText, skippedAt: new Date() })
    .run();

  if (reasonType === "legitimate") {
    db.update(games)
      .set({ excluded: true })
      .where(eq(games.id, slot.gameId))
      .run();
  }

  return { ok: true };
}

export function getHistory(userId: number) {
  const completed = db
    .select({
      type: sql<string>`'completed'`.as("type"),
      slotId: slots.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      rating: slotReviews.rating,
      note: slotReviews.note,
      playtimeMinutes: slotReviews.playtimeMinutes,
      reasonType: sql<string | null>`null`,
      reasonText: sql<string | null>`null`,
      date: slotReviews.completedAt,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "completed")))
    .all();

  const skipped = db
    .select({
      type: sql<string>`'skipped'`.as("type"),
      slotId: slots.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      rating: sql<number | null>`null`,
      note: sql<string | null>`null`,
      playtimeMinutes: sql<number | null>`null`,
      reasonType: slotSkips.reasonType,
      reasonText: slotSkips.reasonText,
      date: slotSkips.skippedAt,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotSkips, eq(slotSkips.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "skipped")))
    .all();

  return [...completed, ...skipped].sort(
    (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()
  );
}

export function getStats(userId: number) {
  const completedSlots = db
    .select({
      playtime: slotReviews.playtimeMinutes,
      completedAt: slotReviews.completedAt,
    })
    .from(slots)
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "completed")))
    .all();

  const shameSkips = db
    .select({
      gameTitle: games.title,
      skippedAt: slotSkips.skippedAt,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotSkips, eq(slotSkips.slotId, slots.id))
    .where(
      and(
        eq(slots.userId, userId),
        eq(slots.status, "skipped"),
        eq(slotSkips.reasonType, "shame")
      )
    )
    .all();

  const totalGames = completedSlots.length;
  const totalMinutes = completedSlots.reduce(
    (sum, s) => sum + (s.playtime ?? 0),
    0
  );
  const avgMinutes = totalGames > 0 ? Math.round(totalMinutes / totalGames) : 0;

  let streak = 0;
  if (shameSkips.length === 0 && totalGames > 0) {
    const firstCompleted = completedSlots
      .map((s) => new Date(s.completedAt!).getTime())
      .sort((a, b) => a - b)[0];
    streak = Math.floor(
      (Date.now() - firstCompleted) / (7 * 24 * 60 * 60 * 1000)
    );
  } else if (shameSkips.length > 0) {
    const lastShame = shameSkips
      .map((s) => new Date(s.skippedAt!).getTime())
      .sort((a, b) => b - a)[0];
    streak = Math.floor(
      (Date.now() - lastShame) / (7 * 24 * 60 * 60 * 1000)
    );
  }

  return {
    totalGames,
    totalMinutes,
    avgMinutes,
    streak,
    wallOfShame: shameSkips.map((s) => s.gameTitle),
  };
}
