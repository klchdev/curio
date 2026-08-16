/**
 * Gives reviews imported from Steam back the date they were actually written on.
 *
 * The first imports didn't read the date, so an entire profile landed in the
 * journal dated with the day of the import. The app fixes this on a repeated
 * import, but that also pulls the profile again for the sake of entries that are
 * already in place — whereas this script does exactly one thing and shows up in
 * the logs.
 *
 * Idempotent: an entry whose date already matches the profile is left alone.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-steam-dates.ts [--apply]
 *
 * Without --apply it only shows what would change.
 */
import { Client } from "pg";
import { fetchOwnReviews } from "../src/lib/steam-profile";

const apply = process.argv.includes("--apply");

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const db = new Client({ connectionString });
  await db.connect();

  const { rows: users } = await db.query<{ id: number; steam_id: string; username: string }>(
    "select id, steam_id, username from users where steam_id ~ '^[0-9]{17}$'"
  );

  for (const user of users) {
    const reviews = await fetchOwnReviews(user.steam_id);
    const dated = reviews.filter((review) => review.postedAt);
    console.log(`\n${user.username}: ${reviews.length} reviews on the profile, ${dated.length} with a date`);
    if (dated.length === 0) continue;

    let moved = 0;
    let alreadyRight = 0;
    let notImported = 0;

    for (const review of dated) {
      /*
       * We move the earliest entry of the thread — that one is the import from
       * Steam. Everything a person added later in the app comes after it and
       * keeps its own dates.
       */
      const { rows } = await db.query<{
        entry_id: number;
        record_id: number;
        created_at: Date;
      }>(
        `select e.id as entry_id, r.id as record_id, e.created_at
           from game_entries e
           join game_records r on r.id = e.record_id
           join games g on g.id = r.game_id
          where r.user_id = $1 and g.steam_app_id = $2 and r.origin = 'steam'
          order by e.created_at
          limit 1`,
        [user.id, review.steamAppId]
      );

      const entry = rows[0];
      if (!entry) {
        notImported += 1;
        continue;
      }

      const postedAt = review.postedAt!;
      if (formatDate(new Date(entry.created_at)) === formatDate(postedAt)) {
        alreadyRight += 1;
        continue;
      }

      console.log(
        `  app ${review.steamAppId}: ${formatDate(new Date(entry.created_at))} → ${formatDate(postedAt)}`
      );
      moved += 1;
      if (!apply) continue;

      await db.query("update game_entries set created_at = $1 where id = $2", [
        postedAt,
        entry.entry_id,
      ]);
      await db.query(
        `update game_records r
            set first_entry_at = span.first, last_entry_at = span.last
           from (
             select min(created_at) as first, max(created_at) as last
               from game_entries where record_id = $1
           ) span
          where r.id = $1`,
        [entry.record_id]
      );
    }

    console.log(
      `  ${apply ? "redated" : "would be redated"}: ${moved}, already correct: ${alreadyRight}, not imported: ${notImported}`
    );
  }

  await db.end();
  if (!apply) console.log("\nThis was a dry run. Repeat with --apply to write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
