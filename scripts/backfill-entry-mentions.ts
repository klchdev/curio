/**
 * Проставляет упоминания игр в записях, написанных до появления разбора.
 *
 * Советы модели (kind = 'advisor') пропускаются: там названия и так размечены
 * ею самой, а дневник — про то, что человек написал сам.
 *
 *   DATABASE_URL=... GEMINI_API_KEY=... [GEMINI_API_KEY_PAID=...] \
 *     npx tsx scripts/backfill-entry-mentions.ts [--apply] [лимит] [--ids=1,2]
 *
 * Без --apply только показывает, что нашлось, и ничего не пишет.
 */
import { Client } from "pg";
import { extractMentions, placeMentions, type CatalogGame } from "../src/lib/entry-mentions";
import { GEMINI_MODEL, type GeminiKeys } from "../src/lib/gemini";
import { findStoreGame } from "../src/lib/store-search";

const apply = process.argv.includes("--apply");
const limit = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 0);

/**
 * Пауза между записями. Бесплатный ключ держит около двадцати запросов в
 * минуту, а прогон по всему дневнику — это сотни: без паузы он упирается в
 * отказы и тратит попытки впустую. Упрётся всё равно — тогда запросы уйдут
 * на платный ключ, и пауза нужна лишь чтобы это случилось не на первой сотне.
 */
const PAUSE_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Точечный прогон: `--ids=191,193` — чтобы проверять разбор на знакомом треде. */
const ids = process.argv
  .find((arg) => arg.startsWith("--ids="))
  ?.slice("--ids=".length)
  .split(",")
  .map(Number)
  .filter((id) => Number.isInteger(id));

const PENDING = `
  select e.id, e.text, r.user_id, r.game_id, g.title
    from game_entries e
    join game_records r on r.id = e.record_id
    join games g on g.id = r.game_id
    left join entry_analyses a on a.entry_id = e.id and a.status = 'done'
   where e.kind <> 'advisor'
     and ($1::int[] is null and a.id is null or e.id = any($1::int[]))
   order by e.id
`;

async function loadCatalog(client: Client, userId: number): Promise<CatalogGame[]> {
  const { rows } = await client.query(
    `select g.id,
            g.title,
            (ug.game_id is not null) as in_library,
            (gr.game_id is not null) as has_record
       from games g
       left join user_games ug on ug.game_id = g.id and ug.user_id = $1
       left join game_records gr on gr.game_id = g.id and gr.user_id = $1`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    inLibrary: row.in_library,
    hasRecord: row.has_record,
  }));
}

/**
 * Заводит карточку игры, которой нет в каталоге, и возвращает её id.
 * В user_games не пишет: каталог общий, библиотека личная.
 */
async function adoptGame(client: Client, title: string): Promise<number | null> {
  const hit = await findStoreGame(title);
  if (!hit) return null;

  const { rows } = await client.query(
    `insert into games (steam_app_id, title, header_image, created_at)
          values ($1, $2, $3, now())
     on conflict (steam_app_id) do update set title = games.title
     returning id`,
    [hit.appId, hit.title, hit.headerImage]
  );
  return rows[0]?.id ?? null;
}

/**
 * Проходит по упоминаниям без игры и пытается завести им карточку.
 * Отдельный режим, потому что чинит уже записанное: разбор текста повторять
 * незачем, названия у этих строк уже есть.
 */
async function resolveUnknown(client: Client) {
  const { rows } = await client.query(
    `select canonical_title, count(*)::int as n
       from entry_mentions where game_id is null
      group by canonical_title order by n desc`
  );
  console.log(`Названий без карточки: ${rows.length}${apply ? "" : " (сухой прогон)"}\n`);

  let adopted = 0;
  for (const row of rows) {
    const hit = await findStoreGame(row.canonical_title);
    if (!hit) {
      console.log(`  — ${row.canonical_title} (×${row.n}): в магазине точного совпадения нет`);
      continue;
    }
    console.log(`  + ${row.canonical_title} (×${row.n}) → appid ${hit.appId}`);
    if (!apply) continue;

    const gameId = await adoptGame(client, row.canonical_title);
    if (!gameId) continue;
    await client.query(
      `update entry_mentions set game_id = $1 where game_id is null and canonical_title = $2`,
      [gameId, row.canonical_title]
    );
    adopted += 1;
    await wait(400);
  }

  console.log(`\nЗаведено карточек: ${adopted} из ${rows.length}`);
}

async function main() {
  const free = process.env.GEMINI_API_KEY;
  if (!free) throw new Error("Нужен GEMINI_API_KEY");
  const keys: GeminiKeys = { free, paid: process.env.GEMINI_API_KEY_PAID || undefined };

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  if (process.argv.includes("--resolve-unknown")) {
    await resolveUnknown(client);
    await client.end();
    return;
  }

  const { rows: entries } = await client.query(PENDING, [ids?.length ? ids : null]);
  const targets = limit > 0 ? entries.slice(0, limit) : entries;
  console.log(`Записей к разбору: ${targets.length}${apply ? "" : " (сухой прогон)"}\n`);

  const catalogs = new Map<number, CatalogGame[]>();
  let withMentions = 0;
  let total = 0;
  let done = 0;

  for (const entry of targets) {
    if (done > 0) await wait(PAUSE_MS);
    done += 1;
    let catalog = catalogs.get(entry.user_id);
    if (!catalog) {
      catalog = await loadCatalog(client, entry.user_id);
      catalogs.set(entry.user_id, catalog);
    }

    const startedAt = Date.now();
    try {
      const raw = await extractMentions(entry.text, entry.title, keys);
      const placed = placeMentions(entry.text, raw, catalog, entry.game_id);

      // Названия, которых нет в каталоге, заводим карточками — но только
      // когда пишем: сухой прогон ничего в базе менять не должен
      if (apply) {
        for (const mention of placed) {
          if (mention.gameId === null) mention.gameId = await adoptGame(client, mention.canonicalTitle);
        }
      }

      // Строка на каждую запись, а не только на находки: иначе долгий ответ
      // модели и повисший прогон выглядят из терминала одинаково
      const spent = Math.round((Date.now() - startedAt) / 100) / 10;
      if (placed.length > 0) {
        withMentions += 1;
        total += placed.length;
        const shown = placed
          .map((m) => `«${m.surface}» → ${m.canonicalTitle}${m.gameId ? "" : " (нет в базе)"}`)
          .join(", ");
        console.log(`[${done}/${targets.length}] ${spent}с #${entry.id} ${entry.title}: ${shown}`);
      } else {
        console.log(`[${done}/${targets.length}] ${spent}с #${entry.id} ${entry.title}: —`);
      }

      if (!apply) continue;

      await client.query("begin");
      await client.query(
        // created_at проставляет приложение, а не база: сырому SQL надо самому
        `insert into entry_analyses (entry_id, status, model, created_at, finished_at)
              values ($1, 'done', $2, now(), now())
         on conflict (entry_id)
         do update set status = 'done', model = $2, error = null, finished_at = now()`,
        [entry.id, GEMINI_MODEL]
      );
      await client.query("delete from entry_mentions where entry_id = $1", [entry.id]);
      for (const mention of placed) {
        await client.query(
          `insert into entry_mentions (entry_id, game_id, surface, start_offset, canonical_title)
                values ($1, $2, $3, $4, $5)`,
          [entry.id, mention.gameId, mention.surface, mention.startOffset, mention.canonicalTitle]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`#${entry.id} ${entry.title}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nУпоминаний: ${total} в ${withMentions} записях из ${targets.length}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
