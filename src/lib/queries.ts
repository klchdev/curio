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
  tags,
  entryTags,
} from "../db/schema";
import { eq, and, or, sql, ne, lte, desc, asc, gt, lt, inArray } from "drizzle-orm";
import {
  THRESHOLDS,
  isValidVerdict,
  SHEET_RULES,
  type Verdict,
  type Tier,
  type ImpressionMode,
} from "./vocab";
import type { QueryError } from "./query-errors";
import type { RatedGame } from "./taste-rules";

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
 * A contract on one specific game. The roulette picks blind and the advisor
 * picks by taste, but the commitment is the same either way: 20 minutes and a
 * first impression.
 */
export async function takeContract(
  userId: number,
  gameId: number
): Promise<{ ok: true; slotId: number } | { error: QueryError }> {
  if (!(await canSpin(userId))) {
    return { error: { code: "slotsFull" } };
  }

  const owned = await db
    .select({ playtimeMinutes: userGames.playtimeMinutes })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!owned) return { error: { code: "gameNotOwned" } };

  const active = await db
    .select({ id: slots.id })
    .from(slots)
    .where(
      and(eq(slots.userId, userId), eq(slots.gameId, gameId), eq(slots.status, "active"))
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (active) return { error: { code: "contractExists" } };

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
 * The stored playtime. Diary entries make do with it: pulling the whole library
 * from Steam for the sake of one number makes no sense, and the sync, the
 * refresh button and closing a contract keep it current anyway.
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
 * One "needs attention" queue instead of four lists with four thresholds. A
 * game with 70 minutes and no verdict used to land both in the dashboard list
 * and in triage on the advice page — that is one state, not two.
 *
 * triage — played a noticeable amount, but no verdict at all
 * update — there is a review, but a lot more playtime has piled up since
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
      /** The text is already there (imported from Steam, say) — the verdict is missing. */
      hasReview: boolean;
    }
  | {
      reason: "update";
      /** Where the review came from: it decides which form extends it. */
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
          // Blender and Wallpaper Engine rack up hundreds of hours, but "finished" makes no sense
          eq(games.isSoftware, false),
          gt(userGames.playtimeMinutes, TRIAGE_MIN_MINUTES)
        )
      )
      .orderBy(desc(userGames.playtimeMinutes)),
  ]);

  /*
   * Triage also takes games that already have a record but no verdict: that is
   * how reviews imported from Steam arrive. Otherwise they would vanish from
   * the queue without ever getting a "finished" or a "dropped".
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
     * The ones that already have text go first: they are a single click short,
     * and among four hundred untouched games they would otherwise just sink.
     */
    .sort((a, b) => Number(b.hasReview) - Number(a.hasReview));

  return {
    items: [...updates, ...triage.slice(0, triageLimit)],
    triageTotal: triage.length,
  };
}

/**
 * The free-skip marker in slot_skips. This is data, not interface text: spent
 * skips are counted by it, which is why it is never translated.
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

  if (!slot || slot.status !== "active") return { error: { code: "contractNotFound" as const } };

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
 * The diary: the feed of game entries plus skipped contracts. This used to glue
 * together three sources with three different row shapes and deduplication by
 * hand.
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
        promptedBy: gameEntries.promptedBy,
        playtimeMinutes: gameEntries.playtimeTotalMinutes,
        deltaMinutes: gameEntries.playtimeDeltaMinutes,
        verdict: gameEntries.verdictAt,
        rating: gameEntries.ratingAt,
        tier: gameEntries.tierAt,
        date: gameEntries.createdAt,
        currentVerdict: gameRecords.verdict,
        currentRating: gameRecords.rating,
        currentTier: gameRecords.tier,
        /** Where the text came from: an import from Steam is more honest when marked. */
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

/** The tier lives in a single table, so there is a single path to it. */
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

  if (!existing) return { error: { code: "recordNotFound" } };

  await db.update(gameRecords).set({ tier }).where(eq(gameRecords.id, existing.id));
  return { ok: true };
}

export async function createDemoReview(
  userId: number,
  data: {
    appId: number;
    title: string;
    headerImage: string | null;
    verdict?: "finished" | "endless" | "playing" | "dropped" | "later" | null;
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
  if (!game) return { error: { code: "saveFailed" as const } };

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

  let entryId: number | undefined;
  if (data.note && data.note.trim().length > 0) {
    entryId = await addEntry(recordId, {
      kind: "first",
      text: data.note.trim(),
      playtimeMinutes: 0,
      verdict: data.verdict,
      rating: data.rating,
      tier: data.tier,
    });
  }

  return { ok: true, entryId };
}

/**
 * Stats over the unified model. Only slot reviews used to be counted, so the
 * profile showed 14 games instead of 139 and "playtime" meant not the total
 * time but the time logged after the spins.
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

/** The record takes its feed down by cascade, so notes need no separate cleanup. */
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
        origin: gameRecords.origin,
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

  // Streak: how many days in a row new entries show up, with no gaps
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
    // How many opinions were imported from Steam and how many were written here
    steamCount: records.filter((r) => r.origin === "steam").length,
    finishedCount: byVerdict("finished"),
    endlessCount: byVerdict("endless"),
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
  /** What the analysis drew from this game's entries: "stifling grind", "living cast". */
  labels: string[];
}

/** A property the player praises or curses games for, with its reach in games. */
export interface TasteTag {
  label: string;
  kind: string;
  games: number;
}

/**
 * The taste profile, in tags.
 *
 * A tag met in one game is an accident; met in seven, it is a property of
 * taste. That is why reach is counted in games rather than entries: five
 * entries about one game do not make a complaint systematic.
 */
export async function getTasteProfile(userId: number, limit = 25): Promise<TasteTag[]> {
  return db
    .select({
      label: tags.label,
      kind: tags.kind,
      games: sql<number>`count(distinct ${gameRecords.gameId})::int`,
    })
    .from(tags)
    .innerJoin(entryTags, eq(entryTags.tagId, tags.id))
    .innerJoin(gameEntries, eq(gameEntries.id, entryTags.entryId))
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id, tags.label, tags.kind)
    .orderBy(desc(sql`count(distinct ${gameRecords.gameId})`))
    .limit(limit);
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

  /*
   * Entries of the "advisor" kind stay out of the corpus. Those are Curio's
   * words, not the player's: ever since its takes are saved into the feed, a
   * model reading the corpus would take its own judgements for the player's
   * taste and dig itself deeper into them with every run.
   */
  const entries = await db
    .select({
      recordId: gameEntries.recordId,
      text: gameEntries.text,
      playtimeMinutes: gameEntries.playtimeTotalMinutes,
      createdAt: gameEntries.createdAt,
    })
    .from(gameEntries)
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .where(and(eq(gameRecords.userId, userId), ne(gameEntries.kind, "advisor")))
    .orderBy(gameEntries.createdAt);

  const labelRows = await db
    .select({ recordId: gameEntries.recordId, label: tags.label, kind: tags.kind })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .innerJoin(gameEntries, eq(gameEntries.id, entryTags.entryId))
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .where(eq(gameRecords.userId, userId));

  const labelsByRecord = new Map<number, Set<string>>();
  for (const row of labelRows) {
    const mark = `${row.kind === "praise" ? "+" : "−"}${row.label}`;
    const set = labelsByRecord.get(row.recordId);
    if (set) set.add(mark);
    else labelsByRecord.set(row.recordId, new Set([mark]));
  }

  const byRecord = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!byRecord.has(entry.recordId)) byRecord.set(entry.recordId, []);
    byRecord.get(entry.recordId)!.push(entry);
  }

  return records.map((record) => {
    const timeline = byRecord.get(record.recordId) ?? [];
    /*
     * The model sees the whole feed, not just the first note — that is what the
     * unification was started for. The playtime stamp shows at which hour the
     * opinion shifted.
     */
    const note = timeline
      .map((entry) => {
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
      labels: [...(labelsByRecord.get(record.recordId) ?? [])],
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
   * Genres and description from the store. Without them the model knew nothing
   * about a candidate but its title and reconstructed the rest from memory —
   * for indies, and for anything released after its training, that is fiction.
   */
  genres: string | null;
  /** How the game is played: single-player, co-op, PvP. Only the rules engine reads it. */
  categories: string | null;
  description: string | null;
  releaseDate: string | null;
}

/**
 * Searching your own library by part of a title.
 *
 * Software is not hidden: asking for an opinion on Blender is odd, but that is
 * the player's call and none of our business — filtering belongs where the app
 * decides on its own.
 */
export async function searchLibrary(userId: number, query: string) {
  const rows = await db
    .select({
      gameId: games.id,
      title: games.title,
      headerImage: games.headerImage,
      playtimeMinutes: userGames.playtimeMinutes,
      verdict: gameRecords.verdict,
      recordId: gameRecords.id,
    })
    .from(userGames)
    .innerJoin(games, eq(games.id, userGames.gameId))
    .leftJoin(
      gameRecords,
      and(eq(gameRecords.gameId, games.id), eq(gameRecords.userId, userId))
    )
    .where(
      and(
        eq(userGames.userId, userId),
        eq(games.isDemo, false),
        sql`${games.title} ilike ${"%" + query + "%"}`
      )
    )
    // What was played comes first: the question is most likely about something known
    .orderBy(desc(userGames.playtimeMinutes))
    .limit(12);

  return rows.map(({ recordId, ...row }) => ({
    ...row,
    hours: Math.round((row.playtimeMinutes / 60) * 10) / 10,
    hasRecord: recordId !== null,
  }));
}

/**
 * What the latest run said about this game. Without it the deep dive judged
 * from scratch, even though its instruction told it to treat the first pass as
 * the baseline.
 */
export async function getFirstPassPick(
  userId: number,
  gameId: number
): Promise<{ tier: string; reason: string } | null> {
  const row = await db
    .select({ tier: recommendations.tier, reason: recommendations.reason })
    .from(recommendations)
    .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendations.runId))
    .where(
      and(
        eq(recommendationRuns.userId, userId),
        eq(recommendations.gameId, gameId),
        eq(recommendations.kind, "pick")
      )
    )
    .orderBy(desc(recommendationRuns.id))
    .limit(1)
    .then((rows) => rows[0]);

  return row?.tier ? { tier: row.tier, reason: row.reason } : null;
}

/**
 * The rated half of the library, with what the store files each game under.
 *
 * The review corpus carries the words and the verdicts but nothing about the
 * games themselves — a model does not need it, it knows what Prey is. The rules
 * engine knows nothing at all, so its whole picture of taste is built here:
 * verdicts on one side, genres on the other.
 */
export async function getRatedGames(userId: number): Promise<RatedGame[]> {
  const rows = await db
    .select({
      title: games.title,
      tier: gameRecords.tier,
      rating: gameRecords.rating,
      verdict: gameRecords.verdict,
      minutes: gameRecords.playtimeAtLastEntry,
      genres: games.genres,
      categories: games.categories,
    })
    .from(gameRecords)
    .innerJoin(games, eq(games.id, gameRecords.gameId))
    .where(and(eq(gameRecords.userId, userId), eq(games.isDemo, false)));

  return rows.map((row) => ({
    title: row.title,
    tier: row.tier,
    rating: row.rating,
    verdict: row.verdict,
    hours: Math.round((row.minutes / 60) * 10) / 10,
    genres: row.genres,
    categories: row.categories,
  }));
}

/** Untouched and barely started: the games worth recommending at all. */
export async function getRecommendationCandidates(userId: number): Promise<CandidateGame[]> {
  const reviewedIds = await getReviewedGameIds(userId);

  // A game under an active contract is already chosen — no point recommending it
  const underContract = new Set(
    (
      await db
        .select({ gameId: slots.gameId })
        .from(slots)
        .where(and(eq(slots.userId, userId), eq(slots.status, "active")))
    ).map((row) => row.gameId)
  );

  const rows = await db
    .select({
      gameId: games.id,
      steamAppId: games.steamAppId,
      title: games.title,
      genres: games.genres,
      categories: games.categories,
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
    .filter((row) => !reviewedIds.has(row.gameId) && !underContract.has(row.gameId))
    .map((row) => ({
      gameId: row.gameId,
      steamAppId: row.steamAppId,
      title: row.title,
      hours: Math.round((row.minutes / 60) * 10) / 10,
      lastPlayedAt: row.lastPlayedAt,
      genres: row.genres,
      categories: row.categories,
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

/** A run stuck longer than this counts as broken (the process may have restarted). */
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
  }
) {
  const rows = data.items.map((item, index) => ({
    runId,
    gameId: item.gameId,
    kind: "pick" as const,
    tier: item.tier,
    stance: null,
    rank: index,
    reason: item.reason,
    grounding: item.grounding,
  }));

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

/** true if the user already has an unfinished run going. */
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

  /*
   * Games whose contract is already taken or closed with a review. Advice on
   * them is pointless: the decision is made, yet the card kept inviting you to
   * "take a contract" on something already in progress. Skipped ones do not
   * count — those can be come back to.
   */
  const decided = new Set(
    (
      await db
        .select({ gameId: slots.gameId })
        .from(slots)
        .where(
          and(
            eq(slots.userId, userId),
            or(eq(slots.status, "active"), eq(slots.status, "reviewed"))
          )
        )
    ).map((row) => row.gameId)
  );

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
       * The deep dive, if one was ever run. Without it the tier on the card and
       * the deep dive's verdict would disagree until the first click: the first
       * pass judges by the description, the deep dive by the mechanics pulled
       * out of reviews.
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
      .filter((item) => item.kind === "pick" && item.tier && !decided.has(item.gameId))
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
  };
}

/** An unfinished run — so the page picks the progress back up after a reload. */
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


/* ================= The unified impression entry ================= */

export interface ImpressionInput {
  mode: ImpressionMode;
  slotId?: number;
  gameId?: number;
  verdict?: Verdict | null;
  tier?: Tier | null;
  rating?: number | null;
  note?: string | null;
  /** The advisor's question, if the entry is written in answer to one. */
  promptedBy?: string | null;
  /** Absolute playtime: the slot works out the delta from the contract's start. */
  currentPlaytime: number;
  /** What the record held before the edit — to tell "left alone" from "cleared". */
  previous?: {
    verdict?: string | null;
    rating?: number | null;
    tier?: string | null;
  };
}

/**
 * The one place where an opinion about a game gets written.
 *
 * Six modals used to do this through six endpoints with six sets of rules. The
 * function now spreads its input across the existing operations; at Step 2,
 * when slot_reviews / game_reviews / slot_notes merge into a single model, only
 * its body changes — the calling code stays as it is.
 */
type SaveResult = { ok: true; entryId?: number } | { error: QueryError };

/**
 * The one place where an opinion about a game gets written — now straight into
 * the unified model.
 *
 * Six modals wrote into three tables under different rules. Here there is a
 * single path: the record is updated, the feed is extended, and the difference
 * between a contract and a retrospective comes down to the origin field.
 */
export async function saveImpression(
  userId: number,
  input: ImpressionInput
): Promise<SaveResult> {
  const rule = SHEET_RULES[input.mode];
  const note = input.note?.trim() ?? "";

  if (rule.noteRequired && note.length === 0) {
    return { error: { code: "noteEmpty" } };
  }
  if (note.length > 0 && note.length < rule.minNote) {
    return { error: { code: "noteTooShort", min: rule.minNote } };
  }
  if (rule.verdictRequired && !isValidVerdict(input.verdict)) {
    return { error: { code: "noVerdict" } };
  }
  if (input.rating != null && (input.rating < 1 || input.rating > 5)) {
    return { error: { code: "badRating" } };
  }

  // Closing a contract: the time counts from the start, and it has to be real
  if (input.mode === "slot-first") {
    if (!input.slotId) return { error: { code: "noContract" } };

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

    if (!slot || slot.status !== "active") return { error: { code: "contractNotFound" } };

    const played = input.currentPlaytime - slot.playtimeOnStart;
    if (played < MIN_PLAYTIME_TO_REVIEW) {
      return {
        error: { code: "notEnoughPlaytime", need: MIN_PLAYTIME_TO_REVIEW, played },
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

    const entryId = await addEntry(recordId, {
      kind: "first",
      text: note,
      playtimeMinutes: input.currentPlaytime,
      verdict: input.verdict ?? "finished",
      rating: input.rating ?? 3,
    });

    return { ok: true, entryId };
  }

  const gameId = input.gameId;
  if (!gameId) return { error: { code: "noGame" } };

  const owned = await db
    .select({ gameId: userGames.gameId })
    .from(userGames)
    .where(and(eq(userGames.userId, userId), eq(userGames.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!owned) return { error: { code: "gameNotOwned" } };

  const recordId = await upsertRecord(userId, gameId, {
    verdict: input.verdict,
    // A quick verdict leaves the other fields alone
    tier: input.mode === "quick" ? undefined : input.tier,
    rating: input.mode === "quick" ? undefined : input.rating,
    origin: input.mode === "quick" ? "triage" : "retro",
    playtimeMinutes: input.currentPlaytime,
  });

  if (note.length >= rule.minNote && note.length > 0) {
    const existing = await db
      .select({ id: gameEntries.id, text: gameEntries.text })
      .from(gameEntries)
      .where(eq(gameEntries.recordId, recordId))
      .orderBy(desc(gameEntries.createdAt))
      .limit(1)
      .then((rows) => rows[0]);

    /*
     * The same words twice in a row are a double submit, not a second thought.
     * The sheet used to keep the note in its box after saving, so answering the
     * closing questions and pressing save again wrote the opening entry anew.
     * The box is cleared now; this stays as the guard that does not depend on
     * which client is asking.
     */
    if (existing?.text === note) {
      return { ok: true };
    }

    /*
     * An entry that changes the verdict is not an update: it is the turning
     * point of the thread. The kind used to depend only on whether the entry
     * was the first one, so a "finished" after five updates looked like a sixth
     * update.
     */
    const verdictChanged =
      !!input.verdict && input.verdict !== (input.previous?.verdict ?? null);

    const entryId = await addEntry(recordId, {
      kind: !existing ? "first" : verdictChanged ? "verdict" : "update",
      text: note,
      playtimeMinutes: input.currentPlaytime,
      verdict: input.verdict,
      rating: input.rating,
      tier: input.tier,
      promptedBy: input.promptedBy,
    });

    return { ok: true, entryId };
  }

  return { ok: true };
}

/* ================= Core of the unified model ================= */

interface RecordPatch {
  verdict?: Verdict | null;
  tier?: Tier | null;
  rating?: number | null;
  /** steam — the review was imported from the profile, not written here. */
  origin?: "roulette" | "retro" | "triage" | "demo" | "steam";
  slotId?: number | null;
  playtimeMinutes: number;
  /** The entry's date when it is not "now": a Steam import is backdated. */
  at?: Date;
}

/**
 * Creates or updates the record for a game. Fields that are passed overwrite
 * the old ones, fields that are not stay as they were — the same "left alone" /
 * "cleared" distinction as in the impression form.
 */
async function upsertRecord(
  userId: number,
  gameId: number,
  patch: RecordPatch
): Promise<number> {
  const now = patch.at ?? new Date();

  const existing = await db
    .select({ id: gameRecords.id })
    .from(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    const update: Record<string, unknown> = {
      // A backdated entry must not wind the "latest" one backwards
      lastEntryAt: sql`greatest(${gameRecords.lastEntryAt}, ${now})`,
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

/** Appends an entry to the feed with a snapshot of the opinion at that moment. */
async function addEntry(
  recordId: number,
  data: {
    kind: "first" | "update" | "verdict" | "advisor";
    text: string;
    playtimeMinutes: number;
    verdict?: string | null;
    rating?: number | null;
    tier?: string | null;
    promptedBy?: string | null;
    /** When the entry actually appeared: for Steam imports that is not "now". */
    at?: Date;
  }
): Promise<number> {
  const previous = await db
    .select({ total: gameEntries.playtimeTotalMinutes })
    .from(gameEntries)
    .where(eq(gameEntries.recordId, recordId))
    .orderBy(desc(gameEntries.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  const [created] = await db
    .insert(gameEntries)
    .values({
      recordId,
      kind: data.kind,
      text: data.text,
      promptedBy: data.promptedBy ?? null,
      playtimeTotalMinutes: data.playtimeMinutes,
      playtimeDeltaMinutes: Math.max(0, data.playtimeMinutes - (previous?.total ?? 0)),
      verdictAt: data.verdict ?? null,
      ratingAt: data.rating ?? null,
      tierAt: data.tier ?? null,
      createdAt: data.at ?? new Date(),
    })
    .returning({ id: gameEntries.id });

  return created!.id;
}

/**
 * Imports reviews written on Steam into the app's corpus.
 *
 * No verdict is set: a thumbs up on Steam does not mean "finished" and a thumbs
 * down does not mean "dropped", and inventing one for the player is off limits.
 * A record without a verdict stays in the triage queue for them to fill in —
 * but the text and the playtime stamp are already in place.
 *
 * Games that already have a record in the app are left alone: what was written
 * here is fresher and more detailed.
 */
/**
 * Stamps an imported review with the date it was written under on Steam.
 * We move the earliest entry of the feed — that one is the import; anything the
 * player added in the app comes after and keeps its own date.
 */
async function redateSteamImport(recordId: number, postedAt: Date): Promise<boolean> {
  const first = await db
    .select({ id: gameEntries.id, createdAt: gameEntries.createdAt })
    .from(gameEntries)
    .where(eq(gameEntries.recordId, recordId))
    .orderBy(asc(gameEntries.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!first) return false;
  // A repeat import must not "fix" what is already fixed
  if (new Date(first.createdAt).toDateString() === postedAt.toDateString()) return false;

  await db
    .update(gameEntries)
    .set({ createdAt: postedAt })
    .where(eq(gameEntries.id, first.id));

  const span = await db
    .select({
      first: sql<Date>`min(${gameEntries.createdAt})`,
      last: sql<Date>`max(${gameEntries.createdAt})`,
    })
    .from(gameEntries)
    .where(eq(gameEntries.recordId, recordId))
    .then((rows) => rows[0]);

  if (span?.first) {
    await db
      .update(gameRecords)
      .set({ firstEntryAt: new Date(span.first), lastEntryAt: new Date(span.last) })
      .where(eq(gameRecords.id, recordId));
  }

  return true;
}

export async function importSteamReviews(
  userId: number,
  reviews: {
    steamAppId: number;
    positive: boolean;
    playtimeMinutes: number;
    text: string;
    postedAt?: Date | null;
  }[]
): Promise<{
  imported: number;
  skippedExisting: number;
  notOwned: number;
  redated: number;
  entryIds: number[];
}> {
  if (reviews.length === 0)
    return { imported: 0, skippedExisting: 0, notOwned: 0, redated: 0, entryIds: [] };

  const appIds = reviews.map((r) => r.steamAppId);
  const owned = await db
    .select({
      gameId: games.id,
      steamAppId: games.steamAppId,
      recordId: gameRecords.id,
      origin: gameRecords.origin,
    })
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
  /** What we created — so the caller can send it off for analysis. */
  const entryIds: number[] = [];
  let skippedExisting = 0;
  let notOwned = 0;
  let redated = 0;

  for (const review of reviews) {
    const target = byAppId.get(review.steamAppId);
    if (!target) {
      notOwned += 1;
      continue;
    }
    if (target.recordId !== null) {
      /*
       * The first imports stamped entries with the date of the import itself,
       * so a whole Steam profile landed in the diary under a single today.
       * Running it again fixes that in place: the player's own text is left
       * alone, only what came from Steam gets its date moved.
       */
      if (target.origin === "steam" && review.postedAt) {
        redated += (await redateSteamImport(target.recordId, review.postedAt)) ? 1 : 0;
      } else {
        skippedExisting += 1;
      }
      continue;
    }

    const recordId = await upsertRecord(userId, target.gameId, {
      origin: "steam",
      playtimeMinutes: review.playtimeMinutes,
      at: review.postedAt ?? undefined,
    });
    entryIds.push(
      await addEntry(recordId, {
        kind: "first",
        text: review.text,
        playtimeMinutes: review.playtimeMinutes,
        at: review.postedAt ?? undefined,
      })
    );
    imported += 1;
  }

  return { imported, skippedExisting, notOwned, redated, entryIds };
}

/**
 * Curio's take on a closed game, written as an entry in that game's feed.
 *
 * These are its words, hence the "advisor" kind: the entry is not sent for
 * analysis, never comes back to the player as a quote, and does not count
 * towards their own corpus of opinions.
 */
export async function saveCurioTake(
  userId: number,
  gameId: number,
  text: string
): Promise<void> {
  const record = await db
    .select({ id: gameRecords.id, playtime: gameRecords.playtimeAtLastEntry })
    .from(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!record) return;

  await addEntry(record.id, {
    kind: "advisor",
    text,
    playtimeMinutes: record.playtime,
  });
}


/** The feed of impressions for a single game. */
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
