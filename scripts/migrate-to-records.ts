import pg from "pg";

/**
 * Перенос трёх таблиц мнения в единую модель.
 *
 * Скрипт только ДОБАВЛЯЕТ: пишет в game_records и game_entries, старые
 * таблицы не трогает. Поэтому его можно гонять на боевой базе — при неудаче
 * новые таблицы сносятся и прогон повторяется. Все вставки идемпотентны:
 * второй прогон не должен двигать счётчики.
 *
 * Запуск:  npx tsx scripts/migrate-to-records.ts [--dry]
 */

const DRY = process.argv.includes("--dry");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

async function count(sql: string): Promise<number> {
  const [row] = await q<{ n: string }>(sql);
  return Number(row?.n ?? 0);
}

async function main() {
  console.log(DRY ? "РЕЖИМ ПРОВЕРКИ: ничего не пишем\n" : "ПЕРЕНОС ДАННЫХ\n");

  // ---------- До ----------
  const before = {
    slotReviews: await count("select count(*) n from slot_reviews"),
    gameReviews: await count("select count(*) n from game_reviews"),
    slotNotes: await count("select count(*) n from slot_notes"),
    distinct: await count(`
      select count(*) n from (
        select user_id, game_id from game_reviews
        union
        select s.user_id, s.game_id from slots s
          join slot_reviews sr on sr.slot_id = s.id where s.status = 'reviewed'
      ) t`),
    records: await count("select count(*) n from game_records"),
    entries: await count("select count(*) n from game_entries"),
  };
  console.table(before);

  const dupes = await count(`
    select count(*) n from (
      select user_id, game_id from game_reviews group by 1,2 having count(*) > 1
    ) t`);
  if (dupes > 0) throw new Error(`Дубли в game_reviews: ${dupes}. Сначала разобрать их.`);

  if (DRY) {
    // Сколько игр имеют отзыв обоих типов — на них проверяется правило слияния
    const both = await q(`
      select g.title
      from game_reviews gr
      join games g on g.id = gr.game_id
      where exists (
        select 1 from slots s join slot_reviews sr on sr.slot_id = s.id
        where s.user_id = gr.user_id and s.game_id = gr.game_id and s.status = 'reviewed'
      )`);
    console.log(`\nИгр с отзывами обоих типов: ${both.length}`);
    both.forEach((r: any) => console.log("  ·", r.title));
    await pool.end();
    return;
  }

  // ---------- A. Записи из слотовых отзывов ----------
  // Дельта контракта превращается в абсолютное время: старт + наигранное
  await q(`
    insert into game_records (
      user_id, game_id, verdict, tier, rating, origin, slot_id,
      playtime_at_last_entry, first_entry_at, last_entry_at, created_at
    )
    select distinct on (s.user_id, s.game_id)
      s.user_id, s.game_id, sr.verdict, sr.tier, sr.rating, 'roulette', s.id,
      s.playtime_on_start + sr.playtime_minutes,
      sr.completed_at, sr.completed_at, sr.completed_at
    from slot_reviews sr
    join slots s on s.id = sr.slot_id
    where s.status = 'reviewed'
    order by s.user_id, s.game_id, sr.completed_at desc
    on conflict (user_id, game_id) do nothing`);

  // ---------- B. Слияние ретро-отзывов поверх ----------
  // COALESCE: пустое поле никогда не затирает заполненное
  await q(`
    insert into game_records (
      user_id, game_id, verdict, tier, rating, origin,
      playtime_at_last_entry, first_entry_at, last_entry_at, created_at
    )
    select
      gr.user_id, gr.game_id, gr.verdict, gr.tier, gr.rating,
      case when g.is_demo then 'demo'
           when gr.note is null then 'triage'
           else 'retro' end,
      gr.playtime_minutes, gr.created_at, gr.created_at, gr.created_at
    from game_reviews gr
    join games g on g.id = gr.game_id
    on conflict (user_id, game_id) do update set
      verdict = coalesce(excluded.verdict, game_records.verdict),
      tier    = coalesce(excluded.tier,    game_records.tier),
      rating  = coalesce(excluded.rating,  game_records.rating),
      playtime_at_last_entry = greatest(
        game_records.playtime_at_last_entry, excluded.playtime_at_last_entry
      ),
      first_entry_at = least(game_records.first_entry_at, excluded.first_entry_at),
      last_entry_at  = greatest(game_records.last_entry_at, excluded.last_entry_at)`);

  // ---------- C. Таймлайн: первое впечатление из слотового отзыва ----------
  await q(`
    insert into game_entries (
      record_id, kind, text, playtime_total_minutes,
      verdict_at, rating_at, tier_at, created_at
    )
    select r.id, 'first', sr.note,
           s.playtime_on_start + sr.playtime_minutes,
           sr.verdict, sr.rating, sr.tier, sr.completed_at
    from slot_reviews sr
    join slots s on s.id = sr.slot_id
    join game_records r on r.user_id = s.user_id and r.game_id = s.game_id
    where s.status = 'reviewed' and length(trim(sr.note)) > 0
      and not exists (
        select 1 from game_entries e
        where e.record_id = r.id and e.text = sr.note
      )`);

  // ---------- D. Заметки, привязанные к контракту (дельта -> абсолют) ----------
  await q(`
    insert into game_entries (record_id, kind, text, playtime_total_minutes, created_at)
    select r.id, 'update', n.text, s.playtime_on_start + n.playtime_minutes, n.created_at
    from slot_notes n
    join slots s on s.id = n.slot_id
    join game_records r on r.user_id = s.user_id and r.game_id = s.game_id
    where n.slot_id is not null
      and not exists (
        select 1 from game_entries e
        where e.record_id = r.id and e.text = n.text
      )`);

  // ---------- E. Заметки, привязанные к игре (уже абсолют) ----------
  await q(`
    insert into game_entries (record_id, kind, text, playtime_total_minutes, created_at)
    select r.id, 'update', n.text, n.playtime_minutes, n.created_at
    from slot_notes n
    join game_records r on r.user_id = n.user_id and r.game_id = n.game_id
    where n.slot_id is null and n.user_id is not null and n.game_id is not null
      and not exists (
        select 1 from game_entries e
        where e.record_id = r.id and e.text = n.text
      )`);

  /*
   * F. Заметка из game_reviews.note.
   * Ловушка: scripts/backfill-game-notes.ts уже скопировал эти тексты в
   * slot_notes, а createRetrospectiveReview пишет их в оба места. Без
   * проверки NOT EXISTS каждая ретро-заметка задвоилась бы в ленте.
   */
  await q(`
    insert into game_entries (
      record_id, kind, text, playtime_total_minutes,
      verdict_at, rating_at, tier_at, created_at
    )
    select r.id, 'first', gr.note, gr.playtime_minutes,
           gr.verdict, gr.rating, gr.tier, gr.created_at
    from game_reviews gr
    join game_records r on r.user_id = gr.user_id and r.game_id = gr.game_id
    where gr.note is not null and length(trim(gr.note)) > 0
      and not exists (
        select 1 from game_entries e
        where e.record_id = r.id and e.text = gr.note
      )`);

  // ---------- G. Дельты между соседними записями ----------
  await q(`
    with ordered as (
      select id,
             playtime_total_minutes - coalesce(
               lag(playtime_total_minutes) over (
                 partition by record_id order by created_at, id
               ), 0
             ) as delta
      from game_entries
    )
    update game_entries e
    set playtime_delta_minutes = greatest(0, o.delta)
    from ordered o
    where o.id = e.id`);

  // ---------- H. Отметка последней записи ----------
  await q(`
    update game_records r
    set playtime_at_last_entry = greatest(r.playtime_at_last_entry, m.max_total),
        last_entry_at = greatest(r.last_entry_at, m.max_at),
        first_entry_at = least(r.first_entry_at, m.min_at)
    from (
      select record_id,
             max(playtime_total_minutes) max_total,
             max(created_at) max_at,
             min(created_at) min_at
      from game_entries group by record_id
    ) m
    where m.record_id = r.id`);

  // ---------- После ----------
  const after = {
    records: await count("select count(*) n from game_records"),
    entries: await count("select count(*) n from game_entries"),
    withTier: await count("select count(*) n from game_records where tier is not null"),
    withVerdict: await count("select count(*) n from game_records where verdict is not null"),
  };
  console.log();
  console.table(after);

  console.log("\nСверка:");
  console.log(`  записей ожидалось ${before.distinct}, получилось ${after.records}`,
    after.records === before.distinct ? "✓" : "✗ РАСХОЖДЕНИЕ");

  const sourceTexts = await count(`
    select count(*) n from (
      select note text from slot_reviews where length(trim(note)) > 0
      union
      select text from slot_notes
      union
      select note from game_reviews where note is not null and length(trim(note)) > 0
    ) t`);
  console.log(`  различных текстов в источниках ${sourceTexts}, записей в ленте ${after.entries}`);

  await pool.end();
}

main().catch((err) => {
  console.error("ОШИБКА:", err);
  process.exit(1);
});
