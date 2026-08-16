/**
 * Fixes the kind of the earliest entry in a game's thread.
 *
 * The migration to game_entries carried the old slot_notes and game_notes over
 * as "update" entries, without checking whether there had been any entry before
 * them at all. For games where the note was the only one, the thread now opens
 * with an "update", even though there was nothing to update.
 *
 * Only the unambiguous case gets fixed: the thread has no "first impression" at
 * all, and its earliest entry is an "update". Threads where the first entry is
 * already in place, and the model's advice, are left alone.
 *
 *   DATABASE_URL=... npx tsx scripts/fix-first-entry-kind.ts [--apply]
 *
 * Without --apply it only shows what would change.
 */
import { Client } from "pg";

const apply = process.argv.includes("--apply");

const TARGETS = `
  select e.id, g.title, e.created_at::date as at
    from game_entries e
    join (
      select record_id, min(created_at) as first_at
        from game_entries group by record_id
    ) f on f.record_id = e.record_id and f.first_at = e.created_at
    join game_records r on r.id = e.record_id
    join games g on g.id = r.game_id
   where e.kind = 'update'
     and not exists (
       select 1 from game_entries x
        where x.record_id = e.record_id and x.kind = 'first'
     )
   order by e.created_at
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const db = new Client({ connectionString });
  await db.connect();

  const { rows } = await db.query<{ id: number; title: string; at: Date }>(TARGETS);
  for (const row of rows) {
    console.log(`  ${row.at.toISOString().slice(0, 10)}  ${row.title}`);
  }
  console.log(`${apply ? "fixed" : "would be fixed"}: ${rows.length}`);

  if (apply && rows.length > 0) {
    await db.query("update game_entries set kind = 'first' where id = any($1::int[])", [
      rows.map((row) => row.id),
    ]);
  }

  await db.end();
  if (!apply) console.log("This was a dry run. Repeat with --apply to write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
