/**
 * Recomputes the "software" flag from the genres and categories already stored.
 *
 * The raw store data is in the database, so the rule can be changed without
 * another trip to Steam — and change it we will have to: the first version of
 * the classifier filed five genuine games as software.
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
    console.log(`${next ? "→ software" : "→ game"}: ${game.title} [${game.type}, ${game.genres ?? "no genres"}]`);
    changed += 1;
  }

  const { rows: totals } = await client.query(
    `select count(*) filter (where is_software) software, count(*) total from games where details_fetched_at is not null`
  );
  console.log(`\nRecomputed ${rows.length}, changed ${changed}. Software: ${totals[0].software} of ${totals[0].total}.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
