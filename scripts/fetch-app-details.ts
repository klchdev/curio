/**
 * Fills in game cards with data from the Steam store: type, description, genres,
 * categories and the "software or game" verdict.
 *
 * Goes one game at a time with a pause — Valve doesn't publish its limits, and
 * nobody is rushing us. The script is resumable: it only takes rows that have no
 * details yet, so it can be interrupted and started again.
 *
 *   DATABASE_URL=... npx tsx scripts/fetch-app-details.ts [limit]
 */
import { Client } from "pg";
import { classifyAsSoftware } from "../src/lib/store-classify";

const DELAY_MS = 1200;
/** Pause after a rejection: once Steam starts throttling, hurrying is pointless. */
const COOLDOWN_MS = 20_000;

function cleanText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const limit = Number(process.argv[2]) || 100000;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query<{ id: number; steam_app_id: number; title: string }>(
    `select id, steam_app_id, title from games
     where details_fetched_at is null
     order by id
     limit $1`,
    [limit]
  );

  console.log(`To fill in: ${rows.length}`);
  let ok = 0;
  let software = 0;
  let missing = 0;

  for (const [index, game] of rows.entries()) {
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${game.steam_app_id}&l=english`
      );

      if (res.status === 429 || res.status === 403) {
        console.log(`  Steam rate limit (${res.status}) — waiting ${COOLDOWN_MS / 1000} s`);
        await sleep(COOLDOWN_MS);
        continue;
      }

      const data = res.ok ? await res.json() : null;
      const entry = data?.[String(game.steam_app_id)];

      if (!entry?.success || !entry.data) {
        /*
         * There may be no page at all: the game was pulled from the store, or
         * this is a service package. We stamp the time of the attempt anyway,
         * otherwise every following run gets stuck on it.
         */
        await client.query(`update games set details_fetched_at = now() where id = $1`, [game.id]);
        missing += 1;
      } else {
        const list = (value: unknown): string[] =>
          Array.isArray(value)
            ? value
                .map((x: { description?: string }) => x.description)
                .filter((x): x is string => !!x)
            : [];

        const genres = list(entry.data.genres);
        const categories = list(entry.data.categories);
        const type = entry.data.type ?? null;
        const isSoftware = classifyAsSoftware(type, genres, categories);

        await client.query(
          `update games set
             type = $2, short_description = $3, genres = $4, categories = $5,
             release_date = $6, is_software = $7, details_fetched_at = now()
           where id = $1`,
          [
            game.id,
            type,
            cleanText(entry.data.short_description),
            genres.join(", ") || null,
            categories.join(", ") || null,
            entry.data.release_date?.date || null,
            isSoftware,
          ]
        );
        ok += 1;
        if (isSoftware) {
          software += 1;
          console.log(`  software: ${game.title} [${genres.join(", ") || "no genres"}]`);
        }
      }
    } catch (err) {
      console.log(`  error on ${game.title}: ${err instanceof Error ? err.message : err}`);
    }

    if ((index + 1) % 50 === 0) {
      console.log(`${index + 1} / ${rows.length} · filled ${ok}, software ${software}, no page ${missing}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Filled ${ok}, of which software ${software}. No store page: ${missing}.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
