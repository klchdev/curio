/**
 * Данные для страницы «Хронология».
 *
 * Считать здесь почти нечего, и это намеренно: границы дня, часа и недели
 * зависят от часового пояса игрока, а сервер о нём не знает — на Railway он
 * живёт в UTC. Поэтому наружу отдаются события с абсолютным временем, а по
 * дням, часам и неделям их раскладывает браузер, которому пояс известен
 * точно. Сервер отвечает только за выборку и за то, чтобы одни и те же минуты
 * не попали в ответ дважды.
 */
import { and, asc, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { games, playSessions, playtimeSnapshots } from "../db/schema";

/** Сессия: когда сидел в игре и сколько за это насчитал Steam. */
export interface TrackedSession {
  gameId: number;
  startedAt: Date;
  endedAt: Date | null;
  /** Часы на стене, из опроса статуса. */
  minutes: number;
  /** Минуты по счётчику Steam. Ноль — замер ещё не пришёл. */
  gainMinutes: number;
}

/**
 * Прирост счётчика, не привязанный ни к одной сессии: играли, пока опрос
 * статуса ничего не видел. Времени начала у него нет — только момент, когда
 * прирост заметили.
 */
export interface TrackedGain {
  gameId: number;
  takenAt: Date;
  minutes: number;
}

export interface TrackedGame {
  id: number;
  title: string;
  image: string | null;
  steamAppId: number;
}

export interface TrackerData {
  /** Первый след в истории. Раньше него графики пусты не потому, что не играл. */
  since: Date | null;
  sessions: TrackedSession[];
  gains: TrackedGain[];
  games: TrackedGame[];
  /** Идёт прямо сейчас — сессия без конца. */
  playingNow: TrackedSession | null;
}

/**
 * Только то, что трекер видел сам.
 *
 * Восстановленные из дневника строки знают дату, но не час, и в графиках по
 * времени суток превращаются в ложь с уверенным видом: два часа, набежавшие
 * за девять дней, встали бы в ту минуту, когда человек дописал отзыв.
 */
const live = ne(playtimeSnapshots.source, "backfill");

export async function getTrackerData(userId: number, days = 120): Promise<TrackerData> {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [sessionRows, gainRows, firstSession, firstGain] = await Promise.all([
    db
      .select({
        gameId: playSessions.gameId,
        startedAt: playSessions.startedAt,
        endedAt: playSessions.endedAt,
        minutes: playSessions.minutes,
        gainMinutes: playSessions.playtimeGainMinutes,
      })
      .from(playSessions)
      .where(and(eq(playSessions.userId, userId), gte(playSessions.startedAt, from)))
      .orderBy(asc(playSessions.startedAt)),

    db
      .select({
        gameId: playtimeSnapshots.gameId,
        takenAt: playtimeSnapshots.takenAt,
        minutes: playtimeSnapshots.deltaMinutes,
      })
      .from(playtimeSnapshots)
      .where(
        and(
          eq(playtimeSnapshots.userId, userId),
          gte(playtimeSnapshots.takenAt, from),
          // Привязанные к сессии минуты уже посчитаны в самой сессии
          isNull(playtimeSnapshots.sessionId),
          live
        )
      )
      .orderBy(asc(playtimeSnapshots.takenAt)),

    db
      .select({ at: playSessions.startedAt })
      .from(playSessions)
      .where(eq(playSessions.userId, userId))
      .orderBy(asc(playSessions.startedAt))
      .limit(1),

    db
      .select({ at: playtimeSnapshots.takenAt })
      .from(playtimeSnapshots)
      .where(and(eq(playtimeSnapshots.userId, userId), live))
      .orderBy(asc(playtimeSnapshots.takenAt))
      .limit(1),
  ]);

  const ids = new Set<number>([
    ...sessionRows.map((row) => row.gameId),
    ...gainRows.map((row) => row.gameId),
  ]);

  const gameRows = ids.size
    ? await db
        .select({
          id: games.id,
          title: games.title,
          image: games.headerImage,
          steamAppId: games.steamAppId,
        })
        .from(games)
        .where(inArray(games.id, [...ids]))
    : [];

  const starts = [firstSession[0]?.at, firstGain[0]?.at].filter((at): at is Date => !!at);

  return {
    since: starts.length ? new Date(Math.min(...starts.map((at) => at.getTime()))) : null,
    sessions: sessionRows,
    gains: gainRows,
    games: gameRows,
    playingNow: sessionRows.find((row) => row.endedAt === null) ?? null,
  };
}

/**
 * Здоровье трекера: когда он в последний раз что-то видел.
 *
 * Отдельный вопрос от статистики: пустые графики значат либо «не играл», либо
 * «опрос стоит», и человек должен видеть, какое из двух.
 */
export async function getTrackerHeartbeat(userId: number): Promise<Date | null> {
  const [last] = await db
    .select({ at: playtimeSnapshots.takenAt })
    .from(playtimeSnapshots)
    .where(and(eq(playtimeSnapshots.userId, userId), live))
    .orderBy(desc(playtimeSnapshots.takenAt))
    .limit(1);
  return last?.at ?? null;
}

/** Месяц как `2026-04` — ключ, по которому складываются восстановленные часы. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface PreTracker {
  totalMinutes: number;
  from: Date | null;
  to: Date | null;
  games: { title: string; minutes: number }[];
  months: { key: string; minutes: number }[];
}

/**
 * История до трекера: восстановленные из дневника интервалы.
 *
 * По играм суммируется точно — тут ничего не гадается. По месяцам минуты
 * размазываются равномерно по интервалу: девятидневный отрезок иногда лежит на
 * границе месяцев, и приписать его целиком одному было бы хуже, чем поделить.
 * Мельче месяца дробить нечего — данные такой точности не содержат.
 */
export async function getPreTrackerHistory(userId: number): Promise<PreTracker> {
  const rows = await db
    .select({
      title: games.title,
      minutes: playtimeSnapshots.deltaMinutes,
      sinceAt: playtimeSnapshots.sinceAt,
      takenAt: playtimeSnapshots.takenAt,
    })
    .from(playtimeSnapshots)
    .innerJoin(games, eq(games.id, playtimeSnapshots.gameId))
    .where(
      and(eq(playtimeSnapshots.userId, userId), eq(playtimeSnapshots.source, "backfill"))
    )
    .orderBy(asc(playtimeSnapshots.takenAt));

  const byGame = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let totalMinutes = 0;

  for (const row of rows) {
    totalMinutes += row.minutes;
    byGame.set(row.title, (byGame.get(row.title) ?? 0) + row.minutes);

    const from = row.sinceAt ?? row.takenAt;
    const span = Math.max(row.takenAt.getTime() - from.getTime(), 1);

    // Идём по месяцам интервала, отдавая каждому его долю времени
    let cursor = from;
    while (cursor < row.takenAt) {
      const nextMonth = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
      );
      const edge = nextMonth < row.takenAt ? nextMonth : row.takenAt;
      const share = ((edge.getTime() - cursor.getTime()) / span) * row.minutes;
      const key = monthKey(cursor);
      byMonth.set(key, (byMonth.get(key) ?? 0) + share);
      cursor = edge;
    }
  }

  return {
    totalMinutes,
    from: rows[0]?.sinceAt ?? rows[0]?.takenAt ?? null,
    to: rows.at(-1)?.takenAt ?? null,
    games: [...byGame]
      .map(([title, minutes]) => ({ title, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    months: [...byMonth]
      .map(([key, minutes]) => ({ key, minutes: Math.round(minutes) }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}
