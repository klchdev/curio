/**
 * Помечает видом «смена вердикта» записи, которые его меняли.
 *
 * Вид записи раньше зависел только от того, первая она в треде или нет, так
 * что «прошёл» после пяти дополнений выглядел шестым дополнением. Вид
 * `verdict` в схеме был с самого начала — его просто никто не проставлял.
 *
 * Правится только явный случай: у записи есть вердикт, и он отличается от
 * вердикта предыдущей записи треда. Первые записи не трогаются.
 *
 *   DATABASE_URL=... npx tsx scripts/fix-verdict-entry-kind.ts [--apply]
 *
 * Без --apply только показывает, что бы изменилось.
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
  console.log(`Записей к правке: ${rows.length}${apply ? "" : " (сухой прогон)"}\n`);

  for (const row of rows) {
    console.log(`  #${row.id} ${row.title}: ${row.prev ?? "—"} → ${row.verdict_at}`);
  }

  if (apply && rows.length > 0) {
    await client.query(
      `update game_entries set kind = 'verdict' where id = any($1::int[])`,
      [rows.map((row) => row.id)]
    );
    console.log(`\nПоправлено: ${rows.length}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
