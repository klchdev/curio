/**
 * The playtime tracker.
 *
 * Steam keeps no history by day and hour, and the api has none either. But it
 * hands out two signals from which the history builds itself, as long as they
 * are sampled regularly:
 *
 *   1. `playtime_forever` — a cumulative counter of minutes. Exact down to the
 *      minute, but it updates in jumps: three hours of an evening can arrive in
 *      one lump the moment you quit the game. It yields the snapshots
 *      (playtime_snapshots).
 *   2. The "playing X right now" status from the profile. It knows nothing
 *      about minutes, but it is honest about time. It yields the sessions
 *      (play_sessions).
 *
 * Neither of them alone answers "when do you usually play, and for how long at
 * a stretch" — together they do. Hence two polls, running at different rates
 * and writing into different tables.
 */
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { games, playSessions, playtimeSnapshots, userGames, users } from "../db/schema";
import { getPlayersPresence, getRecentlyPlayedGames } from "./steam";

/** How often we ask for the status. Session boundaries are off by just as much. */
export const PRESENCE_INTERVAL_MS = 3 * 60 * 1000;

/** How often we sample the counter. More often is pointless: Steam updates slower. */
export const PLAYTIME_INTERVAL_MS = 30 * 60 * 1000;

/**
 * How long a session survives silence from the poll. Several times the
 * interval: a container restart or a Steam blip must not tear an evening in two.
 */
const SESSION_GRACE_MS = 12 * 60 * 1000;

/**
 * How late a counter gain can still be attributed to a closed session. Steam
 * credits the minutes when you quit the game, and a snapshot arrives once every
 * half hour — by which point the status poll has already closed the session.
 */
const GAIN_WINDOW_MS = 3 * 60 * 60 * 1000;

const CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

/** One observation of one game: this many minutes in it as of this moment. */
export interface PlaytimeObservation {
  appId: number;
  name: string;
  playtimeMinutes: number;
  lastPlayedAt?: Date | null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Creates cards for the observed appids and returns their ids.
 *
 * Needed by the tracker and by the sync alike: a game can first come into view
 * during a poll — bought and launched between two visits to the app. The sync
 * will pull the store details in later; all that matters here is not losing the
 * fact that it was played.
 */
async function ensureGameIds(
  tx: Tx,
  observed: { appId: number; name: string }[]
): Promise<Map<number, number>> {
  const unique = new Map(observed.map((o) => [o.appId, o.name]));
  const values = [...unique].map(([appId, name]) => ({
    steamAppId: appId,
    title: name,
    headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    createdAt: new Date(),
  }));

  for (const part of chunk(values, CHUNK)) {
    await tx
      .insert(games)
      .values(part)
      .onConflictDoUpdate({
        target: games.steamAppId,
        set: { title: sql`excluded.title` },
      });
  }

  const ids = new Map<number, number>();
  for (const part of chunk([...unique.keys()], CHUNK)) {
    const rows = await tx
      .select({ id: games.id, steamAppId: games.steamAppId })
      .from(games)
      .where(inArray(games.steamAppId, part));
    for (const row of rows) ids.set(row.steamAppId, row.id);
  }
  return ids;
}

/**
 * Records a snapshot: how many minutes sit in the games now, and how much more
 * that is than last time.
 *
 * The baseline for the comparison is `user_games.playtime_minutes`, that very
 * last known value. Which is why reading the baseline and writing the new one
 * happen in one transaction under a row lock: otherwise two polls that meet
 * within the same second (cron and timer) would record the same gain twice.
 *
 * A game seen for the first time yields no gain at all: it has no "last time",
 * and years of accumulated hours must not turn into a single evening.
 */
export async function recordPlaytime(
  userId: number,
  observations: PlaytimeObservation[],
  source: "sync" | "poll",
  at: Date = new Date()
): Promise<number> {
  if (observations.length === 0) return 0;

  return db.transaction(async (tx) => {
    const ids = await ensureGameIds(tx, observations);
    const gameIds = [...ids.values()];

    const known = new Map<number, number>();
    for (const part of chunk(gameIds, CHUNK)) {
      const rows = await tx
        .select({ gameId: userGames.gameId, playtimeMinutes: userGames.playtimeMinutes })
        .from(userGames)
        .where(and(eq(userGames.userId, userId), inArray(userGames.gameId, part)))
        .for("update");
      for (const row of rows) known.set(row.gameId, row.playtimeMinutes);
    }

    const snapshots: typeof playtimeSnapshots.$inferInsert[] = [];
    const library: typeof userGames.$inferInsert[] = [];

    for (const observation of observations) {
      const gameId = ids.get(observation.appId);
      if (!gameId) continue;

      const before = known.get(gameId);
      const delta = before === undefined ? 0 : observation.playtimeMinutes - before;

      if (delta > 0) {
        snapshots.push({
          userId,
          gameId,
          takenAt: at,
          playtimeMinutes: observation.playtimeMinutes,
          deltaMinutes: delta,
          source,
          sessionId: await sessionForGain(tx, userId, gameId, at),
        });
      }

      library.push({
        userId,
        gameId,
        playtimeMinutes: observation.playtimeMinutes,
        // The poll gives no last-played date, but a gain is exactly what it means
        lastPlayedAt: observation.lastPlayedAt ?? (delta > 0 ? at : null),
      });
    }

    if (snapshots.length > 0) {
      for (const part of chunk(snapshots, CHUNK)) {
        await tx.insert(playtimeSnapshots).values(part);
      }
    }

    for (const part of chunk(library, CHUNK)) {
      await tx
        .insert(userGames)
        .values(part)
        .onConflictDoUpdate({
          target: [userGames.userId, userGames.gameId],
          set: {
            playtimeMinutes: sql`excluded.playtime_minutes`,
            // An empty date from the poll must not erase the one known from the sync
            lastPlayedAt: sql`coalesce(excluded.last_played_at, ${userGames.lastPlayedAt})`,
          },
        });
    }

    for (const snapshot of snapshots) {
      if (snapshot.sessionId == null) continue;
      await tx
        .update(playSessions)
        .set({
          playtimeGainMinutes: sql`${playSessions.playtimeGainMinutes} + ${snapshot.deltaMinutes}`,
        })
        .where(eq(playSessions.id, snapshot.sessionId));
    }

    return snapshots.length;
  });
}

/**
 * Finds the session a counter gain belongs to.
 *
 * A session knows when the player sat in the game but not what Steam credited
 * for it; a snapshot knows the minutes but arrives late and without boundaries.
 * Linking the two is the only way to get "a session of two hours forty" instead
 * of "somewhere between 21:00 and 23:30, 160 minutes accumulated".
 *
 * An empty answer is legitimate: the game was played without us, and in the
 * statistics those minutes land on their own row rather than dissolving into
 * sessions.
 */
async function sessionForGain(
  tx: Tx,
  userId: number,
  gameId: number,
  at: Date
): Promise<number | null> {
  const since = new Date(at.getTime() - GAIN_WINDOW_MS);

  const session = await tx
    .select({ id: playSessions.id })
    .from(playSessions)
    .where(
      and(
        eq(playSessions.userId, userId),
        eq(playSessions.gameId, gameId),
        or(isNull(playSessions.endedAt), gt(playSessions.endedAt, since))
      )
    )
    .orderBy(desc(playSessions.startedAt))
    .limit(1)
    .then((rows) => rows[0]);

  return session?.id ?? null;
}

/**
 * Advances the sessions from a single status observation.
 *
 * Three cases: the player is in the same game — the session is extended; the
 * player has quit or switched games — the old one is closed retroactively, at
 * the last poll that still caught them in it; the player is in a new game — a
 * new session opens. A gap longer than `SESSION_GRACE_MS` counts as quitting
 * even for the same game: there was a break between the two visits, and gluing
 * them into one evening would be wrong.
 */
async function applyPresence(
  userId: number,
  playing: { appId: number; name: string } | null,
  at: Date
): Promise<"opened" | "extended" | "closed" | "idle"> {
  return db.transaction(async (tx) => {
    const gameId = playing
      ? (await ensureGameIds(tx, [playing])).get(playing.appId) ?? null
      : null;

    const open = await tx
      .select()
      .from(playSessions)
      .where(and(eq(playSessions.userId, userId), isNull(playSessions.endedAt)))
      .orderBy(desc(playSessions.startedAt))
      .for("update");

    let extended = false;

    for (const session of open) {
      const stale = at.getTime() - session.lastSeenAt.getTime() > SESSION_GRACE_MS;
      const same = gameId !== null && session.gameId === gameId;

      if (same && !stale && !extended) {
        await tx
          .update(playSessions)
          .set({ lastSeenAt: at, minutes: minutesBetween(session.startedAt, at) })
          .where(eq(playSessions.id, session.id));
        extended = true;
        continue;
      }

      await tx
        .update(playSessions)
        .set({
          endedAt: session.lastSeenAt,
          minutes: minutesBetween(session.startedAt, session.lastSeenAt),
        })
        .where(eq(playSessions.id, session.id));
    }

    if (extended) return "extended";

    if (gameId !== null) {
      await tx
        .insert(playSessions)
        .values({ userId, gameId, startedAt: at, lastSeenAt: at, minutes: 0 });
      return "opened";
    }

    return open.length > 0 ? "closed" : "idle";
  });
}

export interface PollResult {
  users: number;
  changed: number;
  errors: string[];
}

/**
 * Everyone worth watching.
 *
 * Test accounts get filtered out: a steamid64 is exactly seventeen digits, and
 * to "123" Valve answers 400 — so every three minutes the poll would write a
 * log error that means nothing.
 */
async function trackedUsers() {
  const all = await db.select({ id: users.id, steamId: users.steamId }).from(users);
  return all.filter((user) => /^\d{17}$/.test(user.steamId));
}

/**
 * The counter poll: how many minutes have piled up since last time.
 *
 * We fetch recently played games rather than the library — the response is
 * orders of magnitude lighter, and everything else hasn't changed anyway.
 */
export async function pollPlaytime(at: Date = new Date()): Promise<PollResult> {
  const list = await trackedUsers();
  const result: PollResult = { users: list.length, changed: 0, errors: [] };

  for (const user of list) {
    try {
      const recent = await getRecentlyPlayedGames(user.steamId);
      if (recent.length === 0) continue;

      result.changed += await recordPlaytime(
        user.id,
        recent.map((game) => ({
          appId: game.appid,
          name: game.name,
          playtimeMinutes: game.playtime_forever,
        })),
        "poll",
        at
      );
    } catch (error) {
      result.errors.push(`user ${user.id}: ${(error as Error).message}`);
    }
  }

  return result;
}

/**
 * The status poll: who is playing what right now.
 *
 * One request per hundred players, so the rate is bounded not by Valve's limits
 * but by how precisely we need the session boundaries.
 */
export async function pollPresence(at: Date = new Date()): Promise<PollResult> {
  const list = await trackedUsers();
  const result: PollResult = { users: list.length, changed: 0, errors: [] };
  if (list.length === 0) return result;

  let presence;
  try {
    presence = await getPlayersPresence(list.map((user) => user.steamId));
  } catch (error) {
    result.errors.push(`steam: ${(error as Error).message}`);
    return result;
  }

  const bySteamId = new Map(presence.map((entry) => [entry.steamId, entry]));

  for (const user of list) {
    const entry = bySteamId.get(user.steamId);
    const playing =
      entry?.appId != null
        ? { appId: entry.appId, name: entry.gameName ?? `App ${entry.appId}` }
        : null;

    try {
      const outcome = await applyPresence(user.id, playing, at);
      if (outcome !== "idle") result.changed += 1;
    } catch (error) {
      result.errors.push(`user ${user.id}: ${(error as Error).message}`);
    }
  }

  return result;
}

/**
 * Closes sessions the poll has forgotten about.
 *
 * The app may have sat switched off, leaving an open session hanging since last
 * week. It can't be treated as running: it lies both in the statistics and in
 * the attribution of gains.
 */
export async function closeStaleSessions(at: Date = new Date()): Promise<number> {
  const deadline = new Date(at.getTime() - SESSION_GRACE_MS);

  const stale = await db
    .select({ id: playSessions.id, startedAt: playSessions.startedAt, lastSeenAt: playSessions.lastSeenAt })
    .from(playSessions)
    .where(and(isNull(playSessions.endedAt), sql`${playSessions.lastSeenAt} < ${deadline}`));

  for (const session of stale) {
    await db
      .update(playSessions)
      .set({
        endedAt: session.lastSeenAt,
        minutes: minutesBetween(session.startedAt, session.lastSeenAt),
      })
      .where(eq(playSessions.id, session.id));
  }

  return stale.length;
}
