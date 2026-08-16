/**
 * Reconstructs playtime history from the journal.
 *
 * The tracker records history from the day it was set up, but the answer to the
 * same question was already sitting in the database before that, just in another
 * shape: every journal entry is stamped with an absolute playtime and a date.
 * Two entries about one game mean "127 minutes played between May 3rd and May
 * 12th". A slot that was taken gives the same kind of pair: the playtime at the
 * start and the playtime in the first entry.
 *
 * What this data doesn't have, and never will, is the hour. That's why the rows
 * are marked `source='backfill'` and carry `since_at`: time-of-day statistics
 * are obliged to ignore them, while per-game and per-month totals are not.
 *
 * Idempotent: the reconstructed rows are recomputed from scratch in full, and
 * the live polling readings are left untouched.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-playtime-history.ts [--apply]
 *
 * Without --apply it only shows what would be written.
 */
import pg from "pg";

const apply = process.argv.includes("--apply");

/*
 * Journal dates sit in columns without a time zone, and the driver parses them
 * in the process's own zone: on a developer's machine the same row reads several
 * hours differently than on the server. The app lives in UTC — we read them the
 * same way, otherwise the reconstructed intervals drift relative to the live
 * readings.
 */
pg.types.setTypeParser(1114, (value: string) => new Date(`${value}Z`));

interface Interval {
  userId: number;
  gameId: number;
  sinceAt: Date;
  takenAt: Date;
  playtimeMinutes: number;
  deltaMinutes: number;
  kind: "entry → entry" | "slot → entry";
}

const BETWEEN_ENTRIES = `
  with ordered as (
    select r.user_id, r.game_id, e.created_at, e.playtime_total_minutes as total,
           lag(e.playtime_total_minutes) over w as prev_total,
           lag(e.created_at) over w as prev_at
    from game_entries e
    join game_records r on r.id = e.record_id
    window w as (partition by e.record_id order by e.created_at, e.id)
  )
  select user_id, game_id, prev_at as since_at, created_at as taken_at,
         total, total - prev_total as delta
  from ordered
  where prev_total is not null and total > prev_total and created_at > prev_at
`;

/*
 * The first entry of a thread, not just any entry: the slot only fixes the
 * playtime up to that one. Beyond it the intervals are counted by the query
 * above, and the two must not be added together.
 */
const FROM_SLOT = `
  with firsts as (
    select distinct on (r.id)
           r.user_id, r.game_id, r.slot_id, e.created_at, e.playtime_total_minutes as total
    from game_records r
    join game_entries e on e.record_id = r.id
    where r.slot_id is not null
    order by r.id, e.created_at, e.id
  )
  select f.user_id, f.game_id, s.started_at as since_at, f.created_at as taken_at,
         f.total, f.total - s.playtime_on_start as delta
  from firsts f
  join slots s on s.id = f.slot_id
  where f.total > s.playtime_on_start and f.created_at > s.started_at
`;

function hours(minutes: number): string {
  return `${Math.round(minutes / 6) / 10} h`;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const db = new pg.Client({ connectionString });
  await db.connect();

  const intervals: Interval[] = [];

  for (const [query, kind] of [
    [BETWEEN_ENTRIES, "entry → entry"],
    [FROM_SLOT, "slot → entry"],
  ] as const) {
    const { rows } = await db.query(query);
    for (const row of rows) {
      intervals.push({
        userId: row.user_id,
        gameId: row.game_id,
        sinceAt: row.since_at,
        takenAt: row.taken_at,
        playtimeMinutes: row.total,
        deltaMinutes: row.delta,
        kind,
      });
    }
  }

  intervals.sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

  const total = intervals.reduce((sum, item) => sum + item.deltaMinutes, 0);
  const span = intervals.length
    ? `${day(intervals[0]!.sinceAt)} … ${day(intervals.at(-1)!.takenAt)}`
    : "—";

  console.log(`Intervals: ${intervals.length}, ${hours(total)} in total, span ${span}`);
  for (const kind of ["entry → entry", "slot → entry"] as const) {
    const part = intervals.filter((item) => item.kind === kind);
    const sum = part.reduce((acc, item) => acc + item.deltaMinutes, 0);
    console.log(`  ${kind}: ${part.length} of them, ${hours(sum)}`);
  }

  const existing = await db.query(`select count(*)::int as n from playtime_snapshots where source = 'backfill'`);
  console.log(`Already reconstructed earlier: ${existing.rows[0].n}`);

  if (!apply) {
    console.log("\nDry run. Run with --apply to write.");
    for (const item of intervals.slice(0, 5)) {
      console.log(
        `  game ${item.gameId}: ${day(item.sinceAt)} → ${day(item.takenAt)}, +${hours(item.deltaMinutes)}`
      );
    }
    await db.end();
    return;
  }

  await db.query("begin");
  try {
    // Recompute the whole thing: these rows are derived, there's no point in
    // accumulating duplicates
    await db.query(`delete from playtime_snapshots where source = 'backfill'`);
    for (const item of intervals) {
      await db.query(
        `insert into playtime_snapshots
           (user_id, game_id, taken_at, since_at, playtime_minutes, delta_minutes, source)
         values ($1, $2, $3, $4, $5, $6, 'backfill')`,
        [item.userId, item.gameId, item.takenAt, item.sinceAt, item.playtimeMinutes, item.deltaMinutes]
      );
    }
    await db.query("commit");
    console.log(`\nRows written: ${intervals.length}`);
  } catch (error) {
    await db.query("rollback");
    throw error;
  }

  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
