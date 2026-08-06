/**
 * Чинит вид самой ранней записи в ленте игры.
 *
 * Миграция на game_entries переносила старые slot_notes и game_notes видом
 * «дополнение» — без разбора, была ли до них хоть одна запись. У игр, где
 * заметка была единственной, тред теперь открывается «дополнением», хотя
 * дополнять там было нечего.
 *
 * Правится только явный случай: в ленте нет ни одного «первого впечатления»,
 * а самая ранняя запись — «дополнение». Ленты, где первая запись уже на
 * месте, и советы модели не трогаются.
 *
 *   DATABASE_URL=... npx tsx scripts/fix-first-entry-kind.ts [--apply]
 *
 * Без --apply только показывает, что бы изменилось.
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
  if (!connectionString) throw new Error("Нужен DATABASE_URL");

  const db = new Client({ connectionString });
  await db.connect();

  const { rows } = await db.query<{ id: number; title: string; at: Date }>(TARGETS);
  for (const row of rows) {
    console.log(`  ${row.at.toISOString().slice(0, 10)}  ${row.title}`);
  }
  console.log(`${apply ? "исправлено" : "будет исправлено"}: ${rows.length}`);

  if (apply && rows.length > 0) {
    await db.query("update game_entries set kind = 'first' where id = any($1::int[])", [
      rows.map((row) => row.id),
    ]);
  }

  await db.end();
  if (!apply) console.log("Это прогон вхолостую. Повтори с --apply, чтобы записать.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
