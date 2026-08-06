/**
 * Возвращает перенесённым из Steam отзывам дату, под которой они написаны.
 *
 * Первые импорты дату не читали, и весь профиль лёг в дневник одним днём
 * переноса. Приложение чинит это при повторном импорте, но там же заново
 * тянется профиль ради тех записей, которые уже на месте — а скрипт делает
 * ровно одну вещь и виден в логах.
 *
 * Идемпотентен: запись, у которой дата уже совпадает с профилем, не трогается.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-steam-dates.ts [--apply]
 *
 * Без --apply только показывает, что бы изменилось.
 */
import { Client } from "pg";
import { fetchOwnReviews } from "../src/lib/steam-profile";

const apply = process.argv.includes("--apply");

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Нужен DATABASE_URL");

  const db = new Client({ connectionString });
  await db.connect();

  const { rows: users } = await db.query<{ id: number; steam_id: string; username: string }>(
    "select id, steam_id, username from users where steam_id ~ '^[0-9]{17}$'"
  );

  for (const user of users) {
    const reviews = await fetchOwnReviews(user.steam_id);
    const dated = reviews.filter((review) => review.postedAt);
    console.log(`\n${user.username}: отзывов на профиле ${reviews.length}, с датой ${dated.length}`);
    if (dated.length === 0) continue;

    let moved = 0;
    let alreadyRight = 0;
    let notImported = 0;

    for (const review of dated) {
      /*
       * Двигаем самую раннюю запись ленты — это и есть перенос из Steam.
       * Всё, что человек дописал в приложении, лежит после и остаётся на
       * своих датах.
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
      `  ${apply ? "передатировано" : "будет передатировано"}: ${moved}, уже верных: ${alreadyRight}, не импортировано: ${notImported}`
    );
  }

  await db.end();
  if (!apply) console.log("\nЭто прогон вхолостую. Повтори с --apply, чтобы записать.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
