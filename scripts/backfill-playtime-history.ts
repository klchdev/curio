/**
 * Восстанавливает историю наигранного времени из дневника.
 *
 * Трекер пишет историю с того дня, как его завели, а до него в базе уже лежал
 * ответ на тот же вопрос, просто в другой форме: каждая запись дневника
 * помечена абсолютным наигранным временем и датой. Две записи об одной игре —
 * это «между третьим и двенадцатым мая наиграно 127 минут». Взятый контракт
 * даёт такую же пару: время на старте и время в первой записи.
 *
 * Чего в этих данных нет и не будет — часа. Поэтому строки помечаются
 * `source='backfill'` и несут `since_at`: статистика по времени суток их
 * обязана игнорировать, а итоги по играм и месяцам — нет.
 *
 * Идемпотентен: восстановленные строки вычисляются заново целиком, живые
 * замеры опроса не трогаются.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-playtime-history.ts [--apply]
 *
 * Без --apply только показывает, что бы записалось.
 */
import pg from "pg";

const apply = process.argv.includes("--apply");

/*
 * Даты дневника лежат в колонках без пояса, и драйвер разбирает их по поясу
 * процесса: на машине разработчика тот же ряд прочитается на несколько часов
 * иначе, чем на сервере. Приложение живёт в UTC — читаем так же, иначе
 * восстановленные интервалы уедут относительно живых замеров.
 */
pg.types.setTypeParser(1114, (value: string) => new Date(`${value}Z`));

interface Interval {
  userId: number;
  gameId: number;
  sinceAt: Date;
  takenAt: Date;
  playtimeMinutes: number;
  deltaMinutes: number;
  kind: "запись → запись" | "контракт → запись";
}

const BETWEEN_ENTRIES = `
  with ordered as (
    select r.user_id, r.game_id, e.created_at, e.playtime_total_minutes as total,
           lag(e.playtime_total_minutes) over w as prev_total,
           lag(e.created_at) over w as prev_at
    from game_entries e
    join game_records r on r.id = e.record_id
    window w as (partition by e.record_id order by e.created_at, e.id)
  )
  select user_id, game_id, prev_at as since_at, created_at as taken_at,
         total, total - prev_total as delta
  from ordered
  where prev_total is not null and total > prev_total and created_at > prev_at
`;

/*
 * Первая запись треда, а не любая: контракт задаёт время только до неё.
 * Дальше интервалы считает запрос выше, и складывать их нельзя.
 */
const FROM_SLOT = `
  with firsts as (
    select distinct on (r.id)
           r.user_id, r.game_id, r.slot_id, e.created_at, e.playtime_total_minutes as total
    from game_records r
    join game_entries e on e.record_id = r.id
    where r.slot_id is not null
    order by r.id, e.created_at, e.id
  )
  select f.user_id, f.game_id, s.started_at as since_at, f.created_at as taken_at,
         f.total, f.total - s.playtime_on_start as delta
  from firsts f
  join slots s on s.id = f.slot_id
  where f.total > s.playtime_on_start and f.created_at > s.started_at
`;

function hours(minutes: number): string {
  return `${Math.round(minutes / 6) / 10} ч`;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Нужен DATABASE_URL");

  const db = new pg.Client({ connectionString });
  await db.connect();

  const intervals: Interval[] = [];

  for (const [query, kind] of [
    [BETWEEN_ENTRIES, "запись → запись"],
    [FROM_SLOT, "контракт → запись"],
  ] as const) {
    const { rows } = await db.query(query);
    for (const row of rows) {
      intervals.push({
        userId: row.user_id,
        gameId: row.game_id,
        sinceAt: row.since_at,
        takenAt: row.taken_at,
        playtimeMinutes: row.total,
        deltaMinutes: row.delta,
        kind,
      });
    }
  }

  intervals.sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

  const total = intervals.reduce((sum, item) => sum + item.deltaMinutes, 0);
  const span = intervals.length
    ? `${day(intervals[0]!.sinceAt)} … ${day(intervals.at(-1)!.takenAt)}`
    : "—";

  console.log(`Интервалов: ${intervals.length}, всего ${hours(total)}, период ${span}`);
  for (const kind of ["запись → запись", "контракт → запись"] as const) {
    const part = intervals.filter((item) => item.kind === kind);
    const sum = part.reduce((acc, item) => acc + item.deltaMinutes, 0);
    console.log(`  ${kind}: ${part.length} шт, ${hours(sum)}`);
  }

  const existing = await db.query(`select count(*)::int as n from playtime_snapshots where source = 'backfill'`);
  console.log(`Уже восстановлено раньше: ${existing.rows[0].n}`);

  if (!apply) {
    console.log("\nСухой прогон. Запусти с --apply, чтобы записать.");
    for (const item of intervals.slice(0, 5)) {
      console.log(
        `  игра ${item.gameId}: ${day(item.sinceAt)} → ${day(item.takenAt)}, +${hours(item.deltaMinutes)}`
      );
    }
    await db.end();
    return;
  }

  await db.query("begin");
  try {
    // Пересчитываем целиком: строки производные, накапливать дубли незачем
    await db.query(`delete from playtime_snapshots where source = 'backfill'`);
    for (const item of intervals) {
      await db.query(
        `insert into playtime_snapshots
           (user_id, game_id, taken_at, since_at, playtime_minutes, delta_minutes, source)
         values ($1, $2, $3, $4, $5, $6, 'backfill')`,
        [item.userId, item.gameId, item.takenAt, item.sinceAt, item.playtimeMinutes, item.deltaMinutes]
      );
    }
    await db.query("commit");
    console.log(`\nЗаписано строк: ${intervals.length}`);
  } catch (error) {
    await db.query("rollback");
    throw error;
  }

  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
