import { db } from "../db";
import {
  games,
  userGames,
  slots,
  slotReviews,
  slotNotes,
  slotSkips,
  gameReviews,
  recommendationRuns,
  recommendations,
} from "../db/schema";
import { eq, and, or, sql, ne, lte, desc, gt, lt, inArray } from "drizzle-orm";
import { THRESHOLDS, isValidVerdict, type Verdict } from "./vocab";

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
        lte(userGames.playtimeMinutes, UNPLAYED_MAX_MINUTES),
        eq(games.isDemo, false)
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
  if (!isValidVerdict(verdict)) return { error: "Некорректный вердикт" };
  if (rating < 1 || rating > 5) return { error: "Оценка от 1 до 5" };
  if (note.length < 50) return { error: "Заметка минимум 50 символов" };

  await db.update(slots)
    .set({ status: "reviewed" })
    .where(eq(slots.id, slotId));

  await db.insert(slotReviews)
    .values({
      slotId,
      verdict: verdict as Verdict,
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

  if (!isValidVerdict(verdict)) return { error: "Некорректный вердикт" };
  if (rating < 1 || rating > 5) return { error: "Оценка от 1 до 5" };

  const delta = currentPlaytime - slot.playtimeOnStart;

  await db.update(slotReviews)
    .set({
      verdict: verdict as Verdict,
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

export async function addGameNote(
  userId: number,
  gameId: number,
  text: string,
  currentPlaytime: number
) {
  const review = await db
    .select({ id: gameReviews.id })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!review) return { error: "Review not found" };
  if (text.length < 10) return { error: "Заметка минимум 10 символов" };

  await db.insert(slotNotes).values({
    userId,
    gameId,
    text,
    playtimeMinutes: currentPlaytime,
    createdAt: new Date(),
  });

  return { ok: true };
}

export async function updateGameReview(
  userId: number,
  gameId: number,
  data: {
    verdict?: "finished" | "dropped" | "playing" | "later" | null;
    rating?: number | null;
    tier?: "S" | "A" | "B" | "C" | "D" | "F" | null;
    playtimeMinutes?: number;
  }
) {
  const existing = await db
    .select({ id: gameReviews.id })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) return { error: "Review not found" };

  const patch: Record<string, unknown> = {};
  if (data.verdict !== undefined) patch.verdict = data.verdict;
  if (data.rating !== undefined) patch.rating = data.rating;
  if (data.tier !== undefined) patch.tier = data.tier;
  if (data.playtimeMinutes !== undefined) patch.playtimeMinutes = data.playtimeMinutes;

  if (Object.keys(patch).length === 0) return { ok: true };

  await db.update(gameReviews).set(patch).where(eq(gameReviews.id, existing.id));
  return { ok: true };
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

  const [reviewRows, reviewedSlots, activeSlots, playedGames] = await Promise.all([
    db
      .select({
        gameId: games.id,
        steamAppId: games.steamAppId,
        title: games.title,
        headerImage: games.headerImage,
        currentPlaytime: userGames.playtimeMinutes,
        playtimeAtReview: gameReviews.playtimeMinutes,
        verdict: gameReviews.verdict,
        rating: gameReviews.rating,
        note: gameReviews.note,
        tier: gameReviews.tier,
      })
      .from(gameReviews)
      .innerJoin(games, eq(gameReviews.gameId, games.id))
      .leftJoin(userGames, and(eq(userGames.userId, userId), eq(userGames.gameId, games.id)))
      .where(and(eq(gameReviews.userId, userId), eq(games.isDemo, false))),

    db
      .select({
        slotId: slots.id,
        gameId: games.id,
        steamAppId: games.steamAppId,
        title: games.title,
        headerImage: games.headerImage,
        playtimeOnStart: slots.playtimeOnStart,
        currentPlaytime: userGames.playtimeMinutes,
        reviewPlaytime: slotReviews.playtimeMinutes,
        verdict: slotReviews.verdict,
        rating: slotReviews.rating,
        note: slotReviews.note,
        tier: slotReviews.tier,
      })
      .from(slots)
      .innerJoin(games, eq(slots.gameId, games.id))
      .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
      .leftJoin(userGames, and(eq(userGames.userId, userId), eq(userGames.gameId, slots.gameId)))
      .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed"))),

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
          gt(userGames.playtimeMinutes, TRIAGE_MIN_MINUTES)
        )
      )
      .orderBy(desc(userGames.playtimeMinutes)),
  ]);

  /*
   * Заметки забираем одним запросом. Раньше здесь было по запросу на каждый
   * отзыв — и всё это на каждый рендер дашборда.
   */
  const slotIds = reviewedSlots.map((r) => r.slotId);
  const notes =
    slotIds.length > 0 || true
      ? await db
          .select({
            slotId: slotNotes.slotId,
            gameId: slotNotes.gameId,
            playtimeMinutes: slotNotes.playtimeMinutes,
          })
          .from(slotNotes)
          .where(
            slotIds.length > 0
              ? or(eq(slotNotes.userId, userId), inArray(slotNotes.slotId, slotIds))
              : eq(slotNotes.userId, userId)
          )
      : [];

  const lastByGame = new Map<number, number>();
  const lastBySlot = new Map<number, number>();
  for (const note of notes) {
    if (note.gameId != null) {
      lastByGame.set(note.gameId, Math.max(lastByGame.get(note.gameId) ?? 0, note.playtimeMinutes));
    }
    if (note.slotId != null) {
      lastBySlot.set(note.slotId, Math.max(lastBySlot.get(note.slotId) ?? 0, note.playtimeMinutes));
    }
  }

  const reviewedGameIds = new Set<number>();
  const updates: AttentionItem[] = [];

  for (const row of reviewRows) {
    reviewedGameIds.add(row.gameId);
    const lastRecorded = Math.max(row.playtimeAtReview, lastByGame.get(row.gameId) ?? 0);
    const delta = (row.currentPlaytime ?? 0) - lastRecorded;
    if (delta < STILL_PLAYING_DELTA) continue;

    updates.push({
      reason: "update",
      source: "game",
      slotId: null,
      gameId: row.gameId,
      steamAppId: row.steamAppId,
      title: row.title,
      headerImage: row.headerImage,
      currentPlaytime: row.currentPlaytime ?? 0,
      lastRecordedPlaytime: lastRecorded,
      delta,
      existingVerdict: row.verdict,
      existingRating: row.rating,
      existingNote: row.note,
      existingTier: row.tier,
    });
  }

  for (const row of reviewedSlots) {
    const alreadyCounted = reviewedGameIds.has(row.gameId);
    reviewedGameIds.add(row.gameId);
    if (alreadyCounted) continue;

    // Для слотов время считается от начала контракта, а не от нуля.
    const totalPlayed = (row.currentPlaytime ?? 0) - row.playtimeOnStart;
    const lastRecorded = Math.max(row.reviewPlaytime ?? 0, lastBySlot.get(row.slotId) ?? 0);
    const delta = totalPlayed - lastRecorded;
    if (delta < STILL_PLAYING_DELTA) continue;

    updates.push({
      reason: "update",
      source: "slot",
      slotId: row.slotId,
      gameId: row.gameId,
      steamAppId: row.steamAppId,
      title: row.title,
      headerImage: row.headerImage,
      currentPlaytime: totalPlayed,
      lastRecordedPlaytime: lastRecorded,
      delta,
      existingVerdict: row.verdict,
      existingRating: row.rating,
      existingNote: row.note,
      existingTier: row.tier,
    });
  }

  const activeGameIds = new Set(activeSlots.map((r) => r.gameId));
  const triage = playedGames
    .filter((g) => !reviewedGameIds.has(g.gameId) && !activeGameIds.has(g.gameId))
    .map(
      (g): AttentionItem => ({
        reason: "triage",
        gameId: g.gameId,
        steamAppId: g.steamAppId,
        title: g.title,
        headerImage: g.headerImage,
        playtimeMinutes: g.playtimeMinutes,
        lastPlayedAt: g.lastPlayedAt instanceof Date ? g.lastPlayedAt.toISOString() : null,
      })
    );

  updates.sort((a, b) => (b.reason === "update" ? b.delta : 0) - (a.reason === "update" ? a.delta : 0));

  return {
    items: [...updates, ...triage.slice(0, triageLimit)],
    triageTotal: triage.length,
  };
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
      source: sql<string>`'slot'`.as("source"),
      slotId: slots.id,
      gameId: games.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      verdict: slotReviews.verdict,
      rating: slotReviews.rating,
      tier: slotReviews.tier,
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
      source: sql<string>`'slot'`.as("source"),
      slotId: slots.id,
      gameId: games.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      verdict: sql<string | null>`null`.as("verdict_alias"),
      rating: sql<number | null>`null`.as("rating_alias"),
      tier: sql<string | null>`null`.as("tier_alias"),
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

  const slotReviewedGameIds = new Set(
    reviewed.map((r) => r.gameId).filter((id): id is number => id != null)
  );

  const retroRows = await db
    .select({
      gameId: games.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      verdict: gameReviews.verdict,
      rating: gameReviews.rating,
      tier: gameReviews.tier,
      note: gameReviews.note,
      playtimeMinutes: gameReviews.playtimeMinutes,
      createdAt: gameReviews.createdAt,
    })
    .from(gameReviews)
    .innerJoin(games, eq(gameReviews.gameId, games.id))
    .where(and(eq(gameReviews.userId, userId), eq(games.isDemo, false)));

  const allGameNotes = await db
    .select({
      gameId: slotNotes.gameId,
      id: slotNotes.id,
      text: slotNotes.text,
      playtimeMinutes: slotNotes.playtimeMinutes,
      createdAt: slotNotes.createdAt,
    })
    .from(slotNotes)
    .where(eq(slotNotes.userId, userId))
    .orderBy(slotNotes.createdAt);

  const notesByGame = new Map<number, typeof allGameNotes>();
  for (const n of allGameNotes) {
    if (n.gameId == null) continue;
    if (!notesByGame.has(n.gameId)) notesByGame.set(n.gameId, []);
    notesByGame.get(n.gameId)!.push(n);
  }

  const retroEntries = retroRows
    .filter((r) => !slotReviewedGameIds.has(r.gameId))
    .map((r) => {
      const notes = notesByGame.get(r.gameId) ?? [];
      const [first, ...rest] = notes;
      return {
        type: "reviewed" as const,
        source: "retro" as const,
        slotId: null as number | null,
        gameId: r.gameId,
        gameTitle: r.gameTitle,
        gameImage: r.gameImage,
        verdict: r.verdict,
        rating: r.rating,
        tier: r.tier,
        note: first?.text ?? r.note,
        playtimeMinutes: first?.playtimeMinutes ?? r.playtimeMinutes,
        reasonType: null,
        reasonText: null,
        date: first?.createdAt ?? r.createdAt,
        _retroNotes: rest,
      };
    });

  const entries = [...reviewed, ...skipped, ...retroEntries].sort(
    (a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()
  );

  const result = [];
  for (const entry of entries) {
    if (entry.type === "reviewed" && entry.source === "slot") {
      const notes = await getSlotNotes((entry as any).slotId);
      result.push({ ...entry, notes });
    } else if (entry.type === "reviewed" && entry.source === "retro") {
      const { _retroNotes, ...rest } = entry as any;
      result.push({ ...rest, notes: _retroNotes });
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
  tier: "S" | "A" | "B" | "C" | "D" | "F" | null
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

export async function setRetroTier(
  gameId: number,
  userId: number,
  tier: "S" | "A" | "B" | "C" | "D" | "F" | null
) {
  const existing = await db
    .select({ id: gameReviews.id })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) return { error: "Review not found" };

  await db.update(gameReviews).set({ tier }).where(eq(gameReviews.id, existing.id));
  return { ok: true };
}

export async function createRetrospectiveReview(
  userId: number,
  gameId: number,
  data: {
    verdict?: "finished" | "dropped" | "playing" | "later" | null;
    tier?: "S" | "A" | "B" | "C" | "D" | "F" | null;
    rating?: number | null;
    note?: string | null;
    playtimeMinutes?: number;
  }
) {
  const ug = await db
    .select({ gameId: userGames.gameId })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!ug) return { error: "Game not found" };

  const existing = await db
    .select({
      id: gameReviews.id,
      note: gameReviews.note,
      playtimeMinutes: gameReviews.playtimeMinutes,
    })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    /*
     * Патч, а не полная замена. Раньше здесь стояло `data.tier ?? null`, и
     * быстрый вердикт из триажа (он передаёт только verdict) обнулял игре
     * тир, оценку и заметку. Явный null по-прежнему очищает поле —
     * различаем «не передали» и «передали пустое».
     */
    const patch: Partial<typeof gameReviews.$inferInsert> = {};
    if (data.verdict !== undefined) patch.verdict = data.verdict;
    if (data.tier !== undefined) patch.tier = data.tier;
    if (data.rating !== undefined) patch.rating = data.rating;
    if (data.note !== undefined) patch.note = data.note;
    if (data.playtimeMinutes !== undefined) patch.playtimeMinutes = data.playtimeMinutes;

    if (Object.keys(patch).length > 0) {
      await db.update(gameReviews).set(patch).where(eq(gameReviews.id, existing.id));
    }

    /*
     * Дневник строится из slot_notes, а ветка update раньше туда не писала —
     * поэтому дописанный отзыв пропадал из ленты. Пишем новую запись, только
     * если текст действительно изменился.
     */
    const note = data.note;
    if (note && note.length >= 10 && note !== existing.note) {
      await db.insert(slotNotes).values({
        userId,
        gameId,
        text: note,
        playtimeMinutes: data.playtimeMinutes ?? existing.playtimeMinutes,
        createdAt: new Date(),
      });
    }
  } else {
    await db.insert(gameReviews).values({
      userId,
      gameId,
      verdict: data.verdict ?? null,
      tier: data.tier ?? null,
      rating: data.rating ?? null,
      note: data.note ?? null,
      playtimeMinutes: data.playtimeMinutes ?? 0,
      createdAt: new Date(),
    });

    if (data.note && data.note.length >= 10) {
      await db.insert(slotNotes).values({
        userId,
        gameId,
        text: data.note,
        playtimeMinutes: data.playtimeMinutes ?? 0,
        createdAt: new Date(),
      });
    }
  }

  return { ok: true };
}

export async function getRetroReviews(userId: number) {
  const reviews = await db
    .select({
      gameId: games.id,
      gameTitle: games.title,
      gameImage: games.headerImage,
      steamAppId: games.steamAppId,
      tier: gameReviews.tier,
      rating: gameReviews.rating,
      note: gameReviews.note,
      verdict: gameReviews.verdict,
      playtimeMinutes: gameReviews.playtimeMinutes,
      createdAt: gameReviews.createdAt,
    })
    .from(gameReviews)
    .innerJoin(games, eq(gameReviews.gameId, games.id))
    .where(and(eq(gameReviews.userId, userId), eq(games.isDemo, false)));

  if (reviews.length === 0) return [];

  const allNotes = await db
    .select({
      gameId: slotNotes.gameId,
      id: slotNotes.id,
      text: slotNotes.text,
      playtimeMinutes: slotNotes.playtimeMinutes,
      createdAt: slotNotes.createdAt,
    })
    .from(slotNotes)
    .where(eq(slotNotes.userId, userId))
    .orderBy(slotNotes.createdAt);

  const notesByGame = new Map<number, { id: number; text: string; playtimeMinutes: number; createdAt: Date }[]>();
  for (const n of allNotes) {
    if (n.gameId == null) continue;
    if (!notesByGame.has(n.gameId)) notesByGame.set(n.gameId, []);
    notesByGame.get(n.gameId)!.push({
      id: n.id,
      text: n.text,
      playtimeMinutes: n.playtimeMinutes,
      createdAt: n.createdAt,
    });
  }

  return reviews.map((r) => ({
    ...r,
    notes: notesByGame.get(r.gameId) ?? [],
  }));
}

// --- Demo reviews (Next Fest etc.) ---------------------------------------
// Demos are stored as games with isDemo=true and reviewed via gameReviews,
// but kept out of the backlog roulette / diary / tier-list / stats.

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

  const existing = await db
    .select({ id: gameReviews.id })
    .from(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, game.id)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(gameReviews)
      .set({
        verdict: data.verdict ?? null,
        tier: data.tier ?? null,
        rating: data.rating ?? null,
        note: data.note,
      })
      .where(eq(gameReviews.id, existing.id));
  } else {
    await db.insert(gameReviews).values({
      userId,
      gameId: game.id,
      verdict: data.verdict ?? null,
      tier: data.tier ?? null,
      rating: data.rating ?? null,
      note: data.note,
      playtimeMinutes: 0,
      createdAt: new Date(),
    });
  }

  return { ok: true, gameId: game.id };
}

export async function getDemoReviews(userId: number) {
  return db
    .select({
      gameId: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      headerImage: games.headerImage,
      verdict: gameReviews.verdict,
      tier: gameReviews.tier,
      rating: gameReviews.rating,
      note: gameReviews.note,
      createdAt: gameReviews.createdAt,
    })
    .from(gameReviews)
    .innerJoin(games, eq(gameReviews.gameId, games.id))
    .where(and(eq(gameReviews.userId, userId), eq(games.isDemo, true)))
    .orderBy(desc(gameReviews.createdAt));
}

export async function deleteDemoReview(userId: number, gameId: number) {
  const game = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.isDemo, true)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!game) return { error: "Demo not found" };

  await db
    .delete(gameReviews)
    .where(and(eq(gameReviews.userId, userId), eq(gameReviews.gameId, gameId)));
  await db
    .delete(slotNotes)
    .where(and(eq(slotNotes.userId, userId), eq(slotNotes.gameId, gameId)));
  await db
    .delete(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)));

  return { ok: true };
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
    .innerJoin(games, eq(userGames.gameId, games.id))
    .where(and(eq(userGames.userId, userId), eq(games.isDemo, false)))
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

// --- AI-рекомендации ---

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
  const retro = await db
    .select({
      gameId: gameReviews.gameId,
      title: games.title,
      tier: gameReviews.tier,
      rating: gameReviews.rating,
      verdict: gameReviews.verdict,
      minutes: gameReviews.playtimeMinutes,
      isDemo: games.isDemo,
      note: gameReviews.note,
    })
    .from(gameReviews)
    .innerJoin(games, eq(gameReviews.gameId, games.id))
    .where(eq(gameReviews.userId, userId));

  const fromSlots = await db
    .select({
      gameId: slots.gameId,
      title: games.title,
      tier: slotReviews.tier,
      rating: slotReviews.rating,
      verdict: slotReviews.verdict,
      minutes: slotReviews.playtimeMinutes,
      isDemo: games.isDemo,
      note: slotReviews.note,
    })
    .from(slots)
    .innerJoin(games, eq(slots.gameId, games.id))
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")));

  const byGame = new Map<number, ReviewCorpusItem>();
  for (const row of [...fromSlots, ...retro]) {
    // retro идёт вторым — у него приоритет, там актуальный тир и заметка
    byGame.set(row.gameId, {
      title: row.title,
      tier: row.tier,
      rating: row.rating,
      verdict: row.verdict,
      hours: Math.round((row.minutes / 60) * 10) / 10,
      isDemo: row.isDemo,
      note: row.note,
    });
  }

  return [...byGame.values()];
}

/**
 * Только размер корпуса. Раньше ради счётчика на странице и проверки порога
 * материализовался весь корпус с заметками — трижды за один прогон.
 */
export async function getReviewCorpusSize(userId: number): Promise<number> {
  const rows = await db
    .select({ gameId: gameReviews.gameId })
    .from(gameReviews)
    .where(eq(gameReviews.userId, userId))
    .union(
      db
        .select({ gameId: slots.gameId })
        .from(slots)
        .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
        .where(and(eq(slots.userId, userId), eq(slots.status, "reviewed")))
    );

  return rows.length;
}

export interface CandidateGame {
  gameId: number;
  steamAppId: number;
  title: string;
  hours: number;
  lastPlayedAt: Date | null;
}

/** Нетронутое и едва начатое: то, что имеет смысл советовать. */
export async function getRecommendationCandidates(userId: number): Promise<CandidateGame[]> {
  const reviewedIds = await getReviewedGameIds(userId);

  const rows = await db
    .select({
      gameId: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      minutes: userGames.playtimeMinutes,
      lastPlayedAt: userGames.lastPlayedAt,
    })
    .from(userGames)
    .innerJoin(games, eq(userGames.gameId, games.id))
    .where(
      and(
        eq(userGames.userId, userId),
        eq(games.isDemo, false),
        eq(games.excluded, false),
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
      minutes: userGames.playtimeMinutes,
      lastPlayedAt: userGames.lastPlayedAt,
    })
    .from(gameReviews)
    .innerJoin(games, eq(gameReviews.gameId, games.id))
    .innerJoin(
      userGames,
      and(eq(userGames.gameId, games.id), eq(userGames.userId, userId))
    )
    .where(
      and(
        eq(gameReviews.userId, userId),
        eq(gameReviews.verdict, "dropped"),
        eq(games.isDemo, false),
        eq(games.excluded, false)
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
  }));
}

async function getReviewedGameIds(userId: number): Promise<Set<number>> {
  const viaSlot = await db
    .select({ gameId: slots.gameId })
    .from(slots)
    .innerJoin(slotReviews, eq(slotReviews.slotId, slots.id))
    .where(eq(slots.userId, userId));

  const viaRetro = await db
    .select({ gameId: gameReviews.gameId })
    .from(gameReviews)
    .where(eq(gameReviews.userId, userId));

  return new Set([...viaSlot, ...viaRetro].map((r) => r.gameId));
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
    items: { gameId: number; tier: "S" | "A" | "B" | "C" | "D"; reason: string }[];
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
      hours: userGames.playtimeMinutes,
    })
    .from(recommendations)
    .innerJoin(games, eq(recommendations.gameId, games.id))
    .leftJoin(
      userGames,
      and(eq(userGames.gameId, recommendations.gameId), eq(userGames.userId, userId))
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
