/**
 * Fills in game mentions for entries written before the analysis existed.
 *
 * The model's own advice (kind = 'advisor') is skipped: the titles there are
 * already marked up by the model itself, and the journal is about what a person
 * wrote themselves.
 *
 *   DATABASE_URL=... LLM_PROVIDER=gemini LLM_API_KEY=... [LLM_MODEL=...] \
 *     npx tsx scripts/backfill-entry-mentions.ts [--apply] [limit] [--ids=1,2]
 *
 * Without --apply it only shows what was found and writes nothing.
 *
 * The key is taken from the environment rather than the database: the run is
 * started by hand, and `llm/credentials.ts` is no use here — it pulls in
 * astro:env.
 */
import { Client } from "pg";
import { placeMentions, type CatalogGame } from "../src/lib/entry-mentions";
import { readEntry } from "../src/lib/entry-reading";
import { adapterFor, isProviderId, type LlmCredentials } from "../src/lib/llm";
import { findStoreGame } from "../src/lib/store-search";
import { normalizeTitle } from "../src/lib/titles";

const apply = process.argv.includes("--apply");
const limit = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 0);

/**
 * Pause between entries. Free tiers hold about twenty requests a minute, and a
 * run over an entire journal is hundreds of them: without the pause it runs into
 * rejections and burns attempts for nothing. There is no spare key any more, so
 * running into the limit now simply means waiting out the retries.
 */
const PAUSE_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A targeted run: `--ids=191,193`, to test the analysis on a familiar thread. */
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
 * Creates a card for a game that isn't in the catalog and returns its id.
 * Writes nothing to user_games: the catalog is shared, the library is personal.
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
 * Walks the mentions that have no game attached and tries to create a card for
 * them. A separate mode, because it repairs what is already written: there's no
 * point in analysing the text again, these rows already have their titles.
 */
async function resolveUnknown(client: Client) {
  const { rows } = await client.query(
    `select canonical_title, count(*)::int as n
       from entry_mentions where game_id is null
      group by canonical_title order by n desc`
  );
  console.log(`Titles without a card: ${rows.length}${apply ? "" : " (dry run)"}\n`);

  let adopted = 0;
  for (const row of rows) {
    const hit = await findStoreGame(row.canonical_title);
    if (!hit) {
      console.log(`  — ${row.canonical_title} (×${row.n}): no exact match in the store`);
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

  console.log(`\nCards created: ${adopted} of ${rows.length}`);
}

/** A person's tag vocabulary — the model must reuse it, not breed synonyms. */
async function vocabularyOf(client: Client, userId: number) {
  const { rows } = await client.query(`select kind, label from tags where user_id = $1`, [userId]);
  return {
    complaints: rows.filter((r) => r.kind === "complaint").map((r) => r.label),
    praises: rows.filter((r) => r.kind === "praise").map((r) => r.label),
  };
}

/** Creates the tag if needed and returns its id. */
async function upsertTag(
  client: Client,
  userId: number,
  kind: "complaint" | "praise",
  label: string
): Promise<number | null> {
  const normalized = normalizeTitle(label);
  if (!normalized) return null;

  const { rows } = await client.query(
    `insert into tags (user_id, kind, label, normalized, created_at)
          values ($1, $2, $3, $4, now())
     on conflict (user_id, normalized) do update set label = tags.label
     returning id`,
    [userId, kind, label, normalized]
  );
  return rows[0]?.id ?? null;
}

async function main() {
  const provider = process.env.LLM_PROVIDER;
  if (!isProviderId(provider)) throw new Error("LLM_PROVIDER is required: gemini, anthropic or openai");

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is required");

  const creds: LlmCredentials = {
    provider,
    apiKey,
    model: process.env.LLM_MODEL || adapterFor(provider).models[0]!.id,
  };

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  if (process.argv.includes("--resolve-unknown")) {
    await resolveUnknown(client);
    await client.end();
    return;
  }

  const { rows: entries } = await client.query(PENDING, [ids?.length ? ids : null]);
  const targets = limit > 0 ? entries.slice(0, limit) : entries;
  console.log(`Entries to analyse: ${targets.length}${apply ? "" : " (dry run)"}\n`);

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
      const reading = await readEntry(
        { text: entry.text, aboutTitle: entry.title, vocabulary: await vocabularyOf(client, entry.user_id) },
        creds
      );
      const placed = placeMentions(entry.text, reading.mentions, catalog, entry.game_id);

      // Titles missing from the catalog get a card of their own — but only when
      // we're writing: a dry run must change nothing in the database
      if (apply) {
        for (const mention of placed) {
          if (mention.gameId === null) mention.gameId = await adoptGame(client, mention.canonicalTitle);
        }
      }

      // A line per entry, not only per hit: otherwise a slow answer from the
      // model and a hung run look exactly the same from the terminal
      const spent = Math.round((Date.now() - startedAt) / 100) / 10;
      if (placed.length > 0) {
        withMentions += 1;
        total += placed.length;
      }
      const shown = placed
        .map((m) => `"${m.surface}" → ${m.canonicalTitle}${m.gameId ? "" : " (not in the database)"}`)
        .join(", ");
      console.log(`[${done}/${targets.length}] ${spent}s #${entry.id} ${entry.title} · tone ${reading.tone}`);
      if (shown) console.log(`      games: ${shown}`);
      if (reading.complaints.length) console.log(`      complains about: ${reading.complaints.join(", ")}`);
      if (reading.praises.length) console.log(`      praises: ${reading.praises.join(", ")}`);
      for (const claim of reading.claims) console.log(`      bet: ${claim}`);

      if (!apply) continue;

      await client.query("begin");
      await client.query(
        // created_at is set by the app, not the database: raw SQL has to do it
        // itself
        `insert into entry_analyses (entry_id, status, model, created_at, finished_at)
              values ($1, 'done', $2, now(), now())
         on conflict (entry_id)
         do update set status = 'done', model = $2, error = null, finished_at = now()`,
        [entry.id, creds.model]
      );
      await client.query("delete from entry_mentions where entry_id = $1", [entry.id]);
      for (const mention of placed) {
        await client.query(
          `insert into entry_mentions (entry_id, game_id, surface, start_offset, canonical_title)
                values ($1, $2, $3, $4, $5)`,
          [entry.id, mention.gameId, mention.surface, mention.startOffset, mention.canonicalTitle]
        );
      }
      await client.query(`update entry_analyses set tone = $2 where entry_id = $1`, [
        entry.id,
        reading.tone,
      ]);

      // Clear only what the model suggested: what was set by hand is none of
      // its business
      await client.query(
        `delete from entry_tags where entry_id = $1 and source = 'model'`,
        [entry.id]
      );
      for (const [kind, labels] of [
        ["complaint", reading.complaints],
        ["praise", reading.praises],
      ] as const) {
        for (const label of labels) {
          const tagId = await upsertTag(client, entry.user_id, kind, label);
          if (!tagId) continue;
          await client.query(
            `insert into entry_tags (entry_id, tag_id, source) values ($1, $2, 'model')
             on conflict (entry_id, tag_id) do nothing`,
            [entry.id, tagId]
          );
        }
      }

      await client.query("delete from entry_claims where entry_id = $1", [entry.id]);
      for (const claim of reading.claims) {
        await client.query(`insert into entry_claims (entry_id, text) values ($1, $2)`, [
          entry.id,
          claim,
        ]);
      }

      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`#${entry.id} ${entry.title}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nMentions: ${total} across ${withMentions} entries of ${targets.length}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
