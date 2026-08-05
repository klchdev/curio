/**
 * Пересчитывает флаг «софт» по уже сохранённым жанрам и категориям.
 *
 * Сырые данные магазина в базе, поэтому менять правило можно без повторного
 * похода в Steam — а править его придётся: первая версия классификатора
 * записала в софт пять настоящих игр.
 *
 *   DATABASE_URL=... npx tsx scripts/reclassify-software.ts
 */
import { Client } from "pg";
import { classifyAsSoftware, splitList } from "../src/lib/store-classify";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query<{
    id: number;
    title: string;
    type: string | null;
    genres: string | null;
    categories: string | null;
    is_software: boolean;
  }>(
    `select id, title, type, genres, categories, is_software
     from games where details_fetched_at is not null`
  );

  let changed = 0;
  for (const game of rows) {
    const next = classifyAsSoftware(game.type, splitList(game.genres), splitList(game.categories));
    if (next === game.is_software) continue;

    await client.query(`update games set is_software = $2 where id = $1`, [game.id, next]);
    console.log(`${next ? "→ софт" : "→ игра"}: ${game.title} [${game.type}, ${game.genres ?? "без жанров"}]`);
    changed += 1;
  }

  const { rows: totals } = await client.query(
    `select count(*) filter (where is_software) software, count(*) total from games where details_fetched_at is not null`
  );
  console.log(`\nПересчитано ${rows.length}, изменено ${changed}. Софта: ${totals[0].software} из ${totals[0].total}.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
