/**
 * Marks entries that changed the verdict with the "verdict change" kind.
 *
 * An entry's kind used to depend only on whether it was first in the thread, so
 * a "finished" after five updates looked like a sixth update. The `verdict` kind
 * had been in the schema from the start — nobody was just ever setting it.
 *
 * Only the unambiguous case gets fixed: the entry has a verdict, and it differs
 * from the verdict of the previous entry in the thread. First entries are left
 * alone.
 *
 *   DATABASE_URL=... npx tsx scripts/fix-verdict-entry-kind.ts [--apply]
 *
 * Without --apply it only shows what would change.
 */
import { Client } from "pg";

const apply = process.argv.includes("--apply");

const TARGETS = `
  with ordered as (
    select e.id,
           e.kind,
           e.verdict_at,
           lag(e.verdict_at) over (partition by e.record_id order by e.created_at, e.id) as prev,
           row_number() over (partition by e.record_id order by e.created_at, e.id) as pos,
           g.title
      from game_entries e
      join game_records r on r.id = e.record_id
      join games g on g.id = r.game_id
  )
  select id, title, verdict_at, prev
    from ordered
   where kind = 'update'
     and pos > 1
     and verdict_at is not null
     and verdict_at is distinct from prev
   order by id
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(TARGETS);
  console.log(`Entries to fix: ${rows.length}${apply ? "" : " (dry run)"}\n`);

  for (const row of rows) {
    console.log(`  #${row.id} ${row.title}: ${row.prev ?? "—"} → ${row.verdict_at}`);
  }

  if (apply && rows.length > 0) {
    await client.query(
      `update game_entries set kind = 'verdict' where id = any($1::int[])`,
      [rows.map((row) => row.id)]
    );
    console.log(`\nFixed: ${rows.length}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
