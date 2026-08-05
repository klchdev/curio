/**
 * Дозаполняет карточки игр данными из магазина Steam: тип, описание, жанры,
 * категории и вердикт «софт или игра».
 *
 * Идёт по одной игре с паузой — лимиты Valve не публикует, а нас никто не
 * торопит. Скрипт возобновляемый: берёт только те строки, где деталей ещё нет,
 * поэтому его можно прервать и запустить снова.
 *
 *   DATABASE_URL=... npx tsx scripts/fetch-app-details.ts [лимит]
 */
import { Client } from "pg";
import { classifyAsSoftware } from "../src/lib/store-classify";

const DELAY_MS = 1200;
/** Пауза после отказа: если Steam начал резать, спешить точно не надо. */
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

  console.log(`К заполнению: ${rows.length}`);
  let ok = 0;
  let software = 0;
  let missing = 0;

  for (const [index, game] of rows.entries()) {
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${game.steam_app_id}&l=english`
      );

      if (res.status === 429 || res.status === 403) {
        console.log(`  лимит Steam (${res.status}) — жду ${COOLDOWN_MS / 1000} с`);
        await sleep(COOLDOWN_MS);
        continue;
      }

      const data = res.ok ? await res.json() : null;
      const entry = data?.[String(game.steam_app_id)];

      if (!entry?.success || !entry.data) {
        /*
         * Страницы может не быть вовсе: игру убрали из магазина или это
         * служебный пакет. Помечаем время попытки, иначе застрянем на ней
         * при каждом следующем прогоне.
         */
        await client.query(`update games set details_fetched_at = now() where id = $1`, [game.id]);
        missing += 1;
      } else {
        const list = (value: unknown): string[] =>
          Array.isArray(value)
            ? value.map((x: { description?: string }) => x.description).filter(Boolean)
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
          console.log(`  софт: ${game.title} [${genres.join(", ") || "без жанров"}]`);
        }
      }
    } catch (err) {
      console.log(`  ошибка на ${game.title}: ${err instanceof Error ? err.message : err}`);
    }

    if ((index + 1) % 50 === 0) {
      console.log(`${index + 1} / ${rows.length} · заполнено ${ok}, софт ${software}, без страницы ${missing}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nГотово. Заполнено ${ok}, из них софта ${software}. Без страницы в магазине: ${missing}.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
