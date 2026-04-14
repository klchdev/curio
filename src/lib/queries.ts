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

  const excludedGameIds = (
    await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.excluded, true))
  ).map((g) => g.id);

  const blockedIds = [...new Set([...usedGameIds, ...excludedGameIds])];

  const rows = await db
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
    );

  return rows.filter((row) => !blockedIds.includes(row.id));
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

const VALID_VERDICTS = ["finished", "dropped", "playing", "later"] as const;

export async function reviewSlot(
  slotId: number,
  userId: number,
  verdict: string,
  rating: number,
  note: string,
  currentPlaytime: number
) {
  const slot = await db
    .select({
      id: slots.id,
      status: slots.status,
      gameId: slots.gameId,
      playtimeOnStart: slots.playtimeOnStart,
    })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

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

  await db.update(slots)
    .set({ status: "reviewed" })
    .where(eq(slots.id, slotId));

  await db.insert(slotReviews)
    .values({
      slotId,
      verdict: verdict as (typeof VALID_VERDICTS)[number],
      rating,
      note,
      playtimeMinutes: delta,
      completedAt: new Date(),
    });

  return { ok: true };
}

export async function updateReview(
  slotId: number,
  userId: number,
  verdict: string,
  rating: number,
  currentPlaytime: number
) {
  const slot = await db
    .select({
      id: slots.id,
      status: slots.status,
      playtimeOnStart: slots.playtimeOnStart,
    })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!slot || slot.status !== "reviewed") return { error: "Invalid slot" };

  if (!VALID_VERDICTS.includes(verdict as any)) return { error: "Некорректный вердикт" };
  if (rating < 1 || rating > 5) return { error: "Оценка от 1 до 5" };

  const delta = currentPlaytime - slot.playtimeOnStart;

  await db.update(slotReviews)
    .set({
      verdict: verdict as (typeof VALID_VERDICTS)[number],
      rating,
      playtimeMinutes: delta,
      completedAt: new Date(),
    })
    .where(eq(slotReviews.slotId, slotId));

  return { ok: true };
}

export async function addNote(
  slotId: number,
  userId: number,
  text: string,
  currentPlaytime: number
) {
  const slot = await db
    .select({
      id: slots.id,
      status: slots.status,
      playtimeOnStart: slots.playtimeOnStart,
    })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!slot || slot.status !== "reviewed") return { error: "Invalid slot" };
  if (text.length < 10) return { error: "Заметка минимум 10 символов" };

  const delta = currentPlaytime - slot.playtimeOnStart;

  await db.insert(slotNotes)
    .values({
      slotId,
      text,
      playtimeMinutes: delta,
      createdAt: new Date(),
    });

  return { ok: true };
}

export async function getSlotNotes(slotId: number) {
  return db
    .select({
      id: slotNotes.id,
      text: slotNotes.text,
      playtimeMinutes: slotNotes.playtimeMinutes,
      createdAt: slotNotes.createdAt,
    })
    .from(slotNotes)
    .where(eq(slotNotes.slotId, slotId))
    .orderBy(slotNotes.createdAt);
}

export async function getStillPlaying(userId: number) {
  const reviewed = await db
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
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")));

  const results = [];
  for (const r of reviewed) {
    const totalPlayed = (r.currentPlaytime ?? 0) - r.playtimeOnStart;
    const lastReviewedAt = r.reviewPlaytime ?? 0;

    const lastNote = await db
      .select({ playtimeMinutes: slotNotes.playtimeMinutes })
      .from(slotNotes)
      .where(eq(slotNotes.slotId, r.slotId))
      .orderBy(desc(slotNotes.createdAt))
      .limit(1)
      .then((rows) => rows[0]);

    const lastRecordedPlaytime = Math.max(
      lastReviewedAt,
      lastNote?.playtimeMinutes ?? 0
    );
    const delta = totalPlayed - lastRecordedPlaytime;

    if (delta >= STILL_PLAYING_THRESHOLD) {
      results.push({
        slotId: r.slotId,
        gameTitle: r.gameTitle,
        gameImage: r.gameImage,
        totalPlayed,
        lastRecordedPlaytime,
        delta,
        verdict: r.verdict,
        rating: r.rating,
      });
    }
  }

  return results;
}

export async function getFreeSkips(userId: number) {
  const reviewedCount = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
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
        eq(slotSkips.reasonText, "Бесплатный скип")
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
    await db.update(games)
      .set({ excluded: true })
      .where(eq(games.id, slot.gameId));
  }

  return { ok: true };
}

export async function getHistory(userId: number) {
  const reviewed = await db
    .select({
      type: sql<string>`'reviewed'`.as("type"),
      slotId: slots.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      verdict: slotReviews.verdict,
      rating: slotReviews.rating,
      note: slotReviews.note,
      playtimeMinutes: slotReviews.playtimeMinutes,
      reasonType: sql<string | null>`null`.as("reason_type_alias"),
      reasonText: sql<string | null>`null`.as("reason_text_alias"),
      date: slotReviews.completedAt,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")));

  const skipped = await db
    .select({
      type: sql<string>`'skipped'`.as("type"),
      slotId: slots.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      verdict: sql<string | null>`null`.as("verdict_alias"),
      rating: sql<number | null>`null`.as("rating_alias"),
      note: sql<string | null>`null`.as("note_alias"),
      playtimeMinutes: sql<number | null>`null`.as("playtime_alias"),
      reasonType: slotSkips.reasonType,
      reasonText: slotSkips.reasonText,
      date: slotSkips.skippedAt,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotSkips, eq(slotSkips.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "skipped")));

  const entries = [...reviewed, ...skipped].sort(
    (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()
  );

  const result = [];
  for (const entry of entries) {
    if (entry.type === "reviewed") {
      const notes = await getSlotNotes(entry.slotId);
      result.push({ ...entry, notes });
    } else {
      result.push({ ...entry, notes: [] });
    }
  }
  return result;
}

export async function getTierList(userId: number) {
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
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")));
}

export async function setTier(
  slotId: number,
  userId: number,
  tier: "S" | "A" | "B" | "C" | "D" | null
) {
  const slot = await db
    .select({ id: slots.id, status: slots.status })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!slot || slot.status !== "reviewed") return { error: "Invalid slot" };

  await db.update(slotReviews)
    .set({ tier })
    .where(eq(slotReviews.slotId, slotId));

  return { ok: true };
}

export async function getUnreviewedPlayedGames(userId: number) {
  const reviewedViaSlot = (
    await db
      .select({ gameId: slots.gameId })
      .from(slots)
      .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
      .where(eq(slots.userId, userId))
  ).map((r) => r.gameId);

  const reviewedViaRetro = (
    await db
      .select({ gameId: gameReviews.gameId })
      .from(gameReviews)
      .where(eq(gameReviews.userId, userId))
  ).map((r) => r.gameId);

  const reviewedIds = [...new Set([...reviewedViaSlot, ...reviewedViaRetro])];

  const rows = await db
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
    .orderBy(desc(userGames.playtimeMinutes));

  return rows.filter((row) => !reviewedIds.includes(row.gameId));
}

export async function createRetrospectiveReview(
  userId: number,
  gameId: number,
  data: { tier?: "S" | "A" | "B" | "C" | "D" | null; rating?: number | null; note?: string | null }
) {
  const ug = await db
    .select({ gameId: userGames.gameId })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!ug) return { error: "Game not found" };

  const existing = await db
    .select({ id: gameReviews.id })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db.update(gameReviews)
      .set({
        tier: data.tier ?? null,
        rating: data.rating ?? null,
        note: data.note ?? null,
      })
      .where(eq(gameReviews.id, existing.id));
  } else {
    await db.insert(gameReviews)
      .values({
        userId,
        gameId,
        tier: data.tier ?? null,
        rating: data.rating ?? null,
        note: data.note ?? null,
        createdAt: new Date(),
      });
  }

  return { ok: true };
}

export async function getRetroReviews(userId: number) {
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
    .where(eq(gameReviews.userId, userId));
}

export async function getStats(userId: number) {
  const reviewedSlots = await db
    .select({
      playtime: slotReviews.playtimeMinutes,
      completedAt: slotReviews.completedAt,
    })
    .from(slots)
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")));

  const shameSkips = await db
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
    );

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

  const totalLibrary = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(userGames)
    .where(eq(userGames.userId, userId))
    .then((rows) => rows[0]))?.count ?? 0;

  const poolSize = (await getUnplayedGames(userId)).length;

  const excludedCount = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(games)
    .where(eq(games.excluded, true))
    .then((rows) => rows[0]))?.count ?? 0;

  const activeCount = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .where(and(eq(slots.userId, userId), eq(slots.status, "active")))
    .then((rows) => rows[0]))?.count ?? 0;

  const skippedCount = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(slots)
    .where(and(eq(slots.userId, userId), eq(slots.status, "skipped")))
    .then((rows) => rows[0]))?.count ?? 0;

  const finishedCount = reviewedSlots.length > 0
    ? (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "finished")))
        .then((rows) => rows[0]))?.count ?? 0
    : 0;

  const droppedCount = reviewedSlots.length > 0
    ? (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "dropped")))
        .then((rows) => rows[0]))?.count ?? 0
    : 0;

  const playingCount = reviewedSlots.length > 0
    ? (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "playing")))
        .then((rows) => rows[0]))?.count ?? 0
    : 0;

  const laterCount = reviewedSlots.length > 0
    ? (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slotReviews.verdict, "later")))
        .then((rows) => rows[0]))?.count ?? 0
    : 0;

  const avgRating = reviewedSlots.length > 0
    ? (await db
        .select({ avg: sql<number>`ROUND(AVG(${slotReviews.rating})::numeric, 1)` })
        .from(slotReviews)
        .innerJoin(slots, eq(slotReviews.slotId, slots.id))
        .where(eq(slots.userId, userId))
        .then((rows) => rows[0]))?.avg ?? 0
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
