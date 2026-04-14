import { db } from "../db";
import {
  games,
  userGames,
  slots,
  slotReviews,
  slotNotes,
  slotSkips,
  gameReviews,
} from "../db/schema";
import { eq, and, sql, ne, lte, desc, gt } from "drizzle-orm";

const MAX_PLAYTIME_MINUTES = 15;
const MAX_ACTIVE_SLOTS = 3;
const MIN_PLAYTIME_TO_REVIEW = 20;
const STILL_PLAYING_THRESHOLD = 30;

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

  // Pick random decoys for roulette animation
  const decoys = pool
    .filter((g) => g.id !== picked.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(15, pool.length - 1))
    .map((g) => ({ title: g.title, headerImage: g.headerImage }));

  return { slot, game: picked, decoys };
}

const VALID_VERDICTS = ["finished", "dropped", "playing", "later"] as const;

export function reviewSlot(
  slotId: number,
  userId: number,
  verdict: string,
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
  if (delta < MIN_PLAYTIME_TO_REVIEW) {
    return {
      error: `Нужно наиграть минимум ${MIN_PLAYTIME_TO_REVIEW} минут (сейчас ${delta})`,
    };
  }
  if (!VALID_VERDICTS.includes(verdict as any)) return { error: "Некорректный вердикт" };
  if (rating < 1 || rating > 5) return { error: "Оценка от 1 до 5" };
  if (note.length < 50) return { error: "Заметка минимум 50 символов" };

  db.update(slots)
    .set({ status: "reviewed" })
    .where(eq(slots.id, slotId))
    .run();

  db.insert(slotReviews)
    .values({
      slotId,
      verdict: verdict as (typeof VALID_VERDICTS)[number],
      rating,
      note,
      playtimeMinutes: delta,
      completedAt: new Date(),
    })
    .run();

  return { ok: true };
}

export function updateReview(
  slotId: number,
  userId: number,
  verdict: string,
  rating: number,
  currentPlaytime: number
) {
  const slot = db
    .select({
      id: slots.id,
      status: slots.status,
      playtimeOnStart: slots.playtimeOnStart,
    })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .get();

  if (!slot || slot.status !== "reviewed") return { error: "Invalid slot" };

  if (!VALID_VERDICTS.includes(verdict as any)) return { error: "Некорректный вердикт" };
  if (rating < 1 || rating > 5) return { error: "Оценка от 1 до 5" };

  const delta = currentPlaytime - slot.playtimeOnStart;

  db.update(slotReviews)
    .set({
      verdict: verdict as (typeof VALID_VERDICTS)[number],
      rating,
      playtimeMinutes: delta,
      completedAt: new Date(),
    })
    .where(eq(slotReviews.slotId, slotId))
    .run();

  return { ok: true };
}

export function addNote(
  slotId: number,
  userId: number,
  text: string,
  currentPlaytime: number
) {
  const slot = db
    .select({
      id: slots.id,
      status: slots.status,
      playtimeOnStart: slots.playtimeOnStart,
    })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .get();

  if (!slot || slot.status !== "reviewed") return { error: "Invalid slot" };
  if (text.length < 10) return { error: "Заметка минимум 10 символов" };

  const delta = currentPlaytime - slot.playtimeOnStart;

  db.insert(slotNotes)
    .values({
      slotId,
      text,
      playtimeMinutes: delta,
      createdAt: new Date(),
    })
    .run();

  return { ok: true };
}

export function getSlotNotes(slotId: number) {
  return db
    .select({
      id: slotNotes.id,
      text: slotNotes.text,
      playtimeMinutes: slotNotes.playtimeMinutes,
      createdAt: slotNotes.createdAt,
    })
    .from(slotNotes)
    .where(eq(slotNotes.slotId, slotId))
    .orderBy(slotNotes.createdAt)
    .all();
}

export function getStillPlaying(userId: number) {
  const reviewed = db
    .select({
      slotId: slots.id,
      gameId: slots.gameId,
      playtimeOnStart: slots.playtimeOnStart,
      gameTitle: games.title,
      gameImage: games.headerImage,
      currentPlaytime: userGames.playtimeMinutes,
      reviewPlaytime: slotReviews.playtimeMinutes,
      verdict: slotReviews.verdict,
      rating: slotReviews.rating,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .leftJoin(
      userGames,
      and(eq(userGames.userId, userId), eq(userGames.gameId, slots.gameId))
    )
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")))
    .all();

  return reviewed
    .map((r) => {
      const totalPlayed = (r.currentPlaytime ?? 0) - r.playtimeOnStart;
      const lastReviewedAt = r.reviewPlaytime ?? 0;

      // Check last note playtime too
      const lastNote = db
        .select({ playtimeMinutes: slotNotes.playtimeMinutes })
        .from(slotNotes)
        .where(eq(slotNotes.slotId, r.slotId))
        .orderBy(desc(slotNotes.createdAt))
        .limit(1)
        .get();

      const lastRecordedPlaytime = Math.max(
        lastReviewedAt,
        lastNote?.playtimeMinutes ?? 0
      );
      const delta = totalPlayed - lastRecordedPlaytime;

      return {
        slotId: r.slotId,
        gameTitle: r.gameTitle,
        gameImage: r.gameImage,
        totalPlayed,
        lastRecordedPlaytime,
        delta,
        verdict: r.verdict,
        rating: r.rating,
      };
    })
    .filter((r) => r.delta >= STILL_PLAYING_THRESHOLD);
}

export function getFreeSkips(userId: number) {
  const reviewedCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")))
    .get()?.count ?? 0;

  const freeSkipsUsed = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .innerJoin(slotSkips, eq(slotSkips.slotId, slots.id))
    .where(
      and(
        eq(slots.userId, userId),
        eq(slotSkips.reasonType, "legitimate"),
        eq(slotSkips.reasonText, "Бесплатный скип")
      )
    )
    .get()?.count ?? 0;

  const earned = Math.floor(reviewedCount / 3);
  return { available: Math.max(0, earned - freeSkipsUsed), earned, used: freeSkipsUsed, reviewedCount };
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

  if (reasonType === "legitimate" && reasonText !== "Бесплатный скип") {
    db.update(games)
      .set({ excluded: true })
      .where(eq(games.id, slot.gameId))
      .run();
  }

  return { ok: true };
}

export function getHistory(userId: number) {
  const reviewed = db
    .select({
      type: sql<string>`'reviewed'`.as("type"),
      slotId: slots.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      verdict: slotReviews.verdict,
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
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")))
    .all();

  const skipped = db
    .select({
      type: sql<string>`'skipped'`.as("type"),
      slotId: slots.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      verdict: sql<string | null>`null`,
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

  // Fetch notes for each reviewed entry
  const entries = [...reviewed, ...skipped].sort(
    (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()
  );

  return entries.map((entry) => {
    if (entry.type === "reviewed") {
      const notes = getSlotNotes(entry.slotId);
      return { ...entry, notes };
    }
    return { ...entry, notes: [] };
  });
}

export function getTierList(userId: number) {
  return db
    .select({
      slotId: slots.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      steamAppId: games.steamAppId,
      tier: slotReviews.tier,
      verdict: slotReviews.verdict,
      rating: slotReviews.rating,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")))
    .all();
}

export function setTier(
  slotId: number,
  userId: number,
  tier: "S" | "A" | "B" | "C" | "D" | null
) {
  const slot = db
    .select({ id: slots.id, status: slots.status })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .get();

  if (!slot || slot.status !== "reviewed") return { error: "Invalid slot" };

  db.update(slotReviews)
    .set({ tier })
    .where(eq(slotReviews.slotId, slotId))
    .run();

  return { ok: true };
}

export function getUnreviewedPlayedGames(userId: number) {
  // Games with playtime > 60 min that have no slot_review and no game_review
  const reviewedViaSlot = db
    .select({ gameId: slots.gameId })
    .from(slots)
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(eq(slots.userId, userId))
    .all()
    .map((r) => r.gameId);

  const reviewedViaRetro = db
    .select({ gameId: gameReviews.gameId })
    .from(gameReviews)
    .where(eq(gameReviews.userId, userId))
    .all()
    .map((r) => r.gameId);

  const reviewedIds = [...new Set([...reviewedViaSlot, ...reviewedViaRetro])];

  return db
    .select({
      gameId: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      headerImage: games.headerImage,
      playtimeMinutes: userGames.playtimeMinutes,
    })
    .from(userGames)
    .innerJoin(games, eq(userGames.gameId, games.id))
    .where(
      and(
        eq(userGames.userId, userId),
        gt(userGames.playtimeMinutes, 60)
      )
    )
    .orderBy(desc(userGames.playtimeMinutes))
    .all()
    .filter((row) => !reviewedIds.includes(row.gameId));
}

export function createRetrospectiveReview(
  userId: number,
  gameId: number,
  data: { tier?: "S" | "A" | "B" | "C" | "D" | null; rating?: number | null; note?: string | null }
) {
  // Verify game belongs to user
  const ug = db
    .select({ gameId: userGames.gameId })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .get();

  if (!ug) return { error: "Game not found" };

  // Upsert — check if review exists
  const existing = db
    .select({ id: gameReviews.id })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, gameId)))
    .get();

  if (existing) {
    db.update(gameReviews)
      .set({
        tier: data.tier ?? null,
        rating: data.rating ?? null,
        note: data.note ?? null,
      })
      .where(eq(gameReviews.id, existing.id))
      .run();
  } else {
    db.insert(gameReviews)
      .values({
        userId,
        gameId,
        tier: data.tier ?? null,
        rating: data.rating ?? null,
        note: data.note ?? null,
        createdAt: new Date(),
      })
      .run();
  }

  return { ok: true };
}

export function getRetroReviews(userId: number) {
  return db
    .select({
      gameId: games.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      steamAppId: games.steamAppId,
      tier: gameReviews.tier,
      rating: gameReviews.rating,
      note: gameReviews.note,
    })
    .from(gameReviews)
    .innerJoin(games, eq(gameReviews.gameId, games.id))
    .where(eq(gameReviews.userId, userId))
    .all();
}

export function getStats(userId: number) {
  const reviewedSlots = db
    .select({
      playtime: slotReviews.playtimeMinutes,
      completedAt: slotReviews.completedAt,
    })
    .from(slots)
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")))
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

  const totalGames = reviewedSlots.length;
  const totalMinutes = reviewedSlots.reduce(
    (sum, s) => sum + (s.playtime ?? 0),
    0
  );
  const avgMinutes = totalGames > 0 ? Math.round(totalMinutes / totalGames) : 0;

  let streak = 0;
  if (shameSkips.length === 0 && totalGames > 0) {
    const firstCompleted = reviewedSlots
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

  // Backlog progress
  const totalLibrary = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(userGames)
    .where(eq(userGames.userId, userId))
    .get()?.count ?? 0;

  const poolSize = getUnplayedGames(userId).length;

  const excludedCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(games)
    .where(eq(games.excluded, true))
    .get()?.count ?? 0;

  const activeCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .where(and(eq(slots.userId, userId), eq(slots.status, "active")))
    .get()?.count ?? 0;

  const skippedCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .where(and(eq(slots.userId, userId), eq(slots.status, "skipped")))
    .get()?.count ?? 0;

  // Verdict breakdown
  const finishedCount = reviewedSlots.length > 0
    ? db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "finished")))
        .get()?.count ?? 0
    : 0;

  const droppedCount = reviewedSlots.length > 0
    ? db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "dropped")))
        .get()?.count ?? 0
    : 0;

  const playingCount = reviewedSlots.length > 0
    ? db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "playing")))
        .get()?.count ?? 0
    : 0;

  const laterCount = reviewedSlots.length > 0
    ? db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "later")))
        .get()?.count ?? 0
    : 0;

  const avgRating = reviewedSlots.length > 0
    ? db
        .select({ avg: sql<number>`ROUND(AVG(${slotReviews.rating}), 1)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(eq(slots.userId, userId))
        .get()?.avg ?? 0
    : 0;

  return {
    totalGames,
    totalMinutes,
    avgMinutes,
    streak,
    wallOfShame: shameSkips.map((s) => s.gameTitle),
    totalLibrary,
    poolSize,
    excludedCount,
    activeCount,
    skippedCount,
    finishedCount,
    droppedCount,
    playingCount,
    laterCount,
    avgRating,
  };
}
