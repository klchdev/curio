/**
 * Data for the "Chronology" page.
 *
 * Almost nothing is computed here, and that is deliberate: the boundaries of a
 * day, an hour and a week depend on the player's time zone, and the server has
 * no idea what it is — on Railway it lives in UTC. So what goes out are events
 * with absolute timestamps, and the browser, which knows the zone for certain,
 * lays them out by day, hour and week. The server answers only for the query
 * and for keeping the same minutes out of the response twice.
 */
import { and, asc, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { games, playSessions, playtimeSnapshots } from "../db/schema";

/** A session: when the player sat in the game and what Steam counted for it. */
export interface TrackedSession {
  gameId: number;
  startedAt: Date;
  endedAt: Date | null;
  /** Wall-clock time, from the status poll. */
  minutes: number;
  /** Minutes from Steam's counter. Zero — the snapshot hasn't arrived yet. */
  gainMinutes: number;
}

/**
 * A counter gain tied to no session: someone played while the status poll saw
 * nothing. It has no start time — only the moment the gain was noticed.
 */
export interface TrackedGain {
  gameId: number;
  takenAt: Date;
  minutes: number;
}

export interface TrackedGame {
  id: number;
  title: string;
  image: string | null;
  steamAppId: number;
}

export interface TrackerData {
  /** First trace in the history. Before it, empty charts don't mean nobody played. */
  since: Date | null;
  sessions: TrackedSession[];
  gains: TrackedGain[];
  games: TrackedGame[];
  /** Running right now — a session with no end. */
  playingNow: TrackedSession | null;
}

/**
 * Only what the tracker saw for itself.
 *
 * Rows reconstructed from the diary know the date but not the hour, and in
 * time-of-day charts they turn into confident-looking lies: two hours picked up
 * over nine days would land on the minute the person finished the review.
 */
const live = ne(playtimeSnapshots.source, "backfill");

export async function getTrackerData(userId: number, days = 120): Promise<TrackerData> {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [sessionRows, gainRows, firstSession, firstGain] = await Promise.all([
    db
      .select({
        gameId: playSessions.gameId,
        startedAt: playSessions.startedAt,
        endedAt: playSessions.endedAt,
        minutes: playSessions.minutes,
        gainMinutes: playSessions.playtimeGainMinutes,
      })
      .from(playSessions)
      .where(and(eq(playSessions.userId, userId), gte(playSessions.startedAt, from)))
      .orderBy(asc(playSessions.startedAt)),

    db
      .select({
        gameId: playtimeSnapshots.gameId,
        takenAt: playtimeSnapshots.takenAt,
        minutes: playtimeSnapshots.deltaMinutes,
      })
      .from(playtimeSnapshots)
      .where(
        and(
          eq(playtimeSnapshots.userId, userId),
          gte(playtimeSnapshots.takenAt, from),
          // Minutes tied to a session are already counted inside that session
          isNull(playtimeSnapshots.sessionId),
          live
        )
      )
      .orderBy(asc(playtimeSnapshots.takenAt)),

    db
      .select({ at: playSessions.startedAt })
      .from(playSessions)
      .where(eq(playSessions.userId, userId))
      .orderBy(asc(playSessions.startedAt))
      .limit(1),

    db
      .select({ at: playtimeSnapshots.takenAt })
      .from(playtimeSnapshots)
      .where(and(eq(playtimeSnapshots.userId, userId), live))
      .orderBy(asc(playtimeSnapshots.takenAt))
      .limit(1),
  ]);

  const ids = new Set<number>([
    ...sessionRows.map((row) => row.gameId),
    ...gainRows.map((row) => row.gameId),
  ]);

  const gameRows = ids.size
    ? await db
        .select({
          id: games.id,
          title: games.title,
          image: games.headerImage,
          steamAppId: games.steamAppId,
        })
        .from(games)
        .where(inArray(games.id, [...ids]))
    : [];

  const starts = [firstSession[0]?.at, firstGain[0]?.at].filter((at): at is Date => !!at);

  return {
    since: starts.length ? new Date(Math.min(...starts.map((at) => at.getTime()))) : null,
    sessions: sessionRows,
    gains: gainRows,
    games: gameRows,
    playingNow: sessionRows.find((row) => row.endedAt === null) ?? null,
  };
}

/**
 * Tracker health: when it last saw anything.
 *
 * A separate question from the statistics: empty charts mean either "didn't
 * play" or "polling is down", and the person has to see which of the two.
 */
export async function getTrackerHeartbeat(userId: number): Promise<Date | null> {
  const [last] = await db
    .select({ at: playtimeSnapshots.takenAt })
    .from(playtimeSnapshots)
    .where(and(eq(playtimeSnapshots.userId, userId), live))
    .orderBy(desc(playtimeSnapshots.takenAt))
    .limit(1);
  return last?.at ?? null;
}

/** A month as `2026-04` — the key the reconstructed hours are summed under. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface PreTracker {
  totalMinutes: number;
  from: Date | null;
  to: Date | null;
  games: { title: string; minutes: number }[];
  months: { key: string; minutes: number }[];
}

/**
 * History from before the tracker: intervals reconstructed from the diary.
 *
 * Per game the sum is exact — nothing is guessed there. Per month the minutes
 * are smeared evenly across the interval: a nine-day stretch sometimes straddles
 * a month boundary, and charging it wholly to one month would be worse than
 * splitting it. Finer than a month there is nothing to split — the data doesn't
 * hold that precision.
 */
export async function getPreTrackerHistory(userId: number): Promise<PreTracker> {
  const rows = await db
    .select({
      title: games.title,
      minutes: playtimeSnapshots.deltaMinutes,
      sinceAt: playtimeSnapshots.sinceAt,
      takenAt: playtimeSnapshots.takenAt,
    })
    .from(playtimeSnapshots)
    .innerJoin(games, eq(games.id, playtimeSnapshots.gameId))
    .where(
      and(eq(playtimeSnapshots.userId, userId), eq(playtimeSnapshots.source, "backfill"))
    )
    .orderBy(asc(playtimeSnapshots.takenAt));

  const byGame = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let totalMinutes = 0;

  for (const row of rows) {
    totalMinutes += row.minutes;
    byGame.set(row.title, (byGame.get(row.title) ?? 0) + row.minutes);

    const from = row.sinceAt ?? row.takenAt;
    const span = Math.max(row.takenAt.getTime() - from.getTime(), 1);

    // Walk the months of the interval, giving each one its share of the time
    let cursor = from;
    while (cursor < row.takenAt) {
      const nextMonth = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
      );
      const edge = nextMonth < row.takenAt ? nextMonth : row.takenAt;
      const share = ((edge.getTime() - cursor.getTime()) / span) * row.minutes;
      const key = monthKey(cursor);
      byMonth.set(key, (byMonth.get(key) ?? 0) + share);
      cursor = edge;
    }
  }

  return {
    totalMinutes,
    from: rows[0]?.sinceAt ?? rows[0]?.takenAt ?? null,
    to: rows.at(-1)?.takenAt ?? null,
    games: [...byGame]
      .map(([title, minutes]) => ({ title, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    months: [...byMonth]
      .map(([key, minutes]) => ({ key, minutes: Math.round(minutes) }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}
