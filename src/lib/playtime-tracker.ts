/**
 * Трекер наигранного времени.
 *
 * Steam не хранит историю по дням и часам, и в апи её нет. Но он отдаёт два
 * сигнала, из которых история строится сама, если снимать их регулярно:
 *
 *   1. `playtime_forever` — накопительный счётчик минут. Точен по минутам,
 *      но обновляется рывками: три часа вечера могут прилететь одним куском
 *      в момент выхода из игры. Из него получаются замеры (playtime_snapshots).
 *   2. Статус «играет в X прямо сейчас» из профиля. Ничего не знает о
 *      минутах, зато честен по времени. Из него получаются сессии
 *      (play_sessions).
 *
 * Ни один из них по отдельности не отвечает на вопрос «во сколько ты обычно
 * играешь и сколько за раз» — вместе отвечают. Поэтому опросов два, с разной
 * частотой, и данные они пишут в разные таблицы.
 */
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { games, playSessions, playtimeSnapshots, userGames, users } from "../db/schema";
import { getPlayersPresence, getRecentlyPlayedGames } from "./steam";

/** Как часто спрашиваем статус. Настолько же неточны границы сессий. */
export const PRESENCE_INTERVAL_MS = 3 * 60 * 1000;

/** Как часто снимаем счётчик. Чаще смысла нет: Steam сам обновляет реже. */
export const PLAYTIME_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Сколько сессия переживает молчание опроса. Больше интервала в разы:
 * перезапуск контейнера или моргнувший Steam не должны рвать вечер надвое.
 */
const SESSION_GRACE_MS = 12 * 60 * 1000;

/**
 * Насколько поздно прирост счётчика ещё можно приписать закрытой сессии.
 * Steam засчитывает минуты при выходе из игры, а замер приходит раз в
 * полчаса — к этому моменту сессия уже закрыта опросом статуса.
 */
const GAIN_WINDOW_MS = 3 * 60 * 60 * 1000;

const CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

/** Наблюдение за одной игрой: столько минут в ней на такой-то момент. */
export interface PlaytimeObservation {
  appId: number;
  name: string;
  playtimeMinutes: number;
  lastPlayedAt?: Date | null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Заводит карточки под наблюдаемые appid и возвращает их id.
 *
 * Нужна и трекеру, и синку: игра может впервые попасться на глаза во время
 * опроса — купил и запустил между заходами в приложение. Подробности из
 * магазина дотянет синк, здесь важно только не потерять факт игры.
 */
async function ensureGameIds(
  tx: Tx,
  observed: { appId: number; name: string }[]
): Promise<Map<number, number>> {
  const unique = new Map(observed.map((o) => [o.appId, o.name]));
  const values = [...unique].map(([appId, name]) => ({
    steamAppId: appId,
    title: name,
    headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    createdAt: new Date(),
  }));

  for (const part of chunk(values, CHUNK)) {
    await tx
      .insert(games)
      .values(part)
      .onConflictDoUpdate({
        target: games.steamAppId,
        set: { title: sql`excluded.title` },
      });
  }

  const ids = new Map<number, number>();
  for (const part of chunk([...unique.keys()], CHUNK)) {
    const rows = await tx
      .select({ id: games.id, steamAppId: games.steamAppId })
      .from(games)
      .where(inArray(games.steamAppId, part));
    for (const row of rows) ids.set(row.steamAppId, row.id);
  }
  return ids;
}

/**
 * Записывает замер: сколько минут в играх сейчас и на сколько это больше,
 * чем было в прошлый раз.
 *
 * База для сравнения — `user_games.playtime_minutes`, то самое последнее
 * известное значение. Поэтому и чтение базы, и запись новой идут в одной
 * транзакции со строчной блокировкой: иначе два опроса, сошедшихся в одну
 * секунду (крон и таймер), запишут один и тот же прирост дважды.
 *
 * Игра, увиденная впервые, прироста не даёт вовсе: у неё нет «прошлого раза»,
 * и всё накопленное за годы не должно превратиться в один вечер.
 */
export async function recordPlaytime(
  userId: number,
  observations: PlaytimeObservation[],
  source: "sync" | "poll",
  at: Date = new Date()
): Promise<number> {
  if (observations.length === 0) return 0;

  return db.transaction(async (tx) => {
    const ids = await ensureGameIds(tx, observations);
    const gameIds = [...ids.values()];

    const known = new Map<number, number>();
    for (const part of chunk(gameIds, CHUNK)) {
      const rows = await tx
        .select({ gameId: userGames.gameId, playtimeMinutes: userGames.playtimeMinutes })
        .from(userGames)
        .where(and(eq(userGames.userId, userId), inArray(userGames.gameId, part)))
        .for("update");
      for (const row of rows) known.set(row.gameId, row.playtimeMinutes);
    }

    const snapshots: typeof playtimeSnapshots.$inferInsert[] = [];
    const library: typeof userGames.$inferInsert[] = [];

    for (const observation of observations) {
      const gameId = ids.get(observation.appId);
      if (!gameId) continue;

      const before = known.get(gameId);
      const delta = before === undefined ? 0 : observation.playtimeMinutes - before;

      if (delta > 0) {
        snapshots.push({
          userId,
          gameId,
          takenAt: at,
          playtimeMinutes: observation.playtimeMinutes,
          deltaMinutes: delta,
          source,
          sessionId: await sessionForGain(tx, userId, gameId, at),
        });
      }

      library.push({
        userId,
        gameId,
        playtimeMinutes: observation.playtimeMinutes,
        // Опрос не отдаёт дату последнего запуска, но прирост её и означает
        lastPlayedAt: observation.lastPlayedAt ?? (delta > 0 ? at : null),
      });
    }

    if (snapshots.length > 0) {
      for (const part of chunk(snapshots, CHUNK)) {
        await tx.insert(playtimeSnapshots).values(part);
      }
    }

    for (const part of chunk(library, CHUNK)) {
      await tx
        .insert(userGames)
        .values(part)
        .onConflictDoUpdate({
          target: [userGames.userId, userGames.gameId],
          set: {
            playtimeMinutes: sql`excluded.playtime_minutes`,
            // Пустая дата из опроса не должна стирать известную из синка
            lastPlayedAt: sql`coalesce(excluded.last_played_at, ${userGames.lastPlayedAt})`,
          },
        });
    }

    for (const snapshot of snapshots) {
      if (snapshot.sessionId == null) continue;
      await tx
        .update(playSessions)
        .set({
          playtimeGainMinutes: sql`${playSessions.playtimeGainMinutes} + ${snapshot.deltaMinutes}`,
        })
        .where(eq(playSessions.id, snapshot.sessionId));
    }

    return snapshots.length;
  });
}

/**
 * Ищет сессию, которой принадлежит прирост счётчика.
 *
 * Сессия знает, когда игрок сидел в игре, но не знает, сколько Steam за это
 * начислил; замер знает минуты, но приходит с опозданием и без границ. Связь
 * между ними — единственный способ получить «сессия на два часа сорок» вместо
 * «где-то между 21:00 и 23:30 набежало 160 минут».
 *
 * Пустой ответ — законный: в игру играли без нас, и в статистике эти минуты
 * лягут отдельной строкой, а не растворятся в сессиях.
 */
async function sessionForGain(
  tx: Tx,
  userId: number,
  gameId: number,
  at: Date
): Promise<number | null> {
  const since = new Date(at.getTime() - GAIN_WINDOW_MS);

  const session = await tx
    .select({ id: playSessions.id })
    .from(playSessions)
    .where(
      and(
        eq(playSessions.userId, userId),
        eq(playSessions.gameId, gameId),
        or(isNull(playSessions.endedAt), gt(playSessions.endedAt, since))
      )
    )
    .orderBy(desc(playSessions.startedAt))
    .limit(1)
    .then((rows) => rows[0]);

  return session?.id ?? null;
}

/**
 * Двигает сессии по одному наблюдению статуса.
 *
 * Три случая: игрок в той же игре — сессия продлевается; игрок вышел или
 * сменил игру — старая закрывается задним числом, последним опросом, который
 * его в ней застал; игрок в новой игре — открывается новая. Разрыв больше
 * `SESSION_GRACE_MS` считается выходом, даже если игра та же: между двумя
 * заходами в одну игру был перерыв, и склеивать их в один вечер неправильно.
 */
export async function applyPresence(
  userId: number,
  playing: { appId: number; name: string } | null,
  at: Date
): Promise<"opened" | "extended" | "closed" | "idle"> {
  return db.transaction(async (tx) => {
    const gameId = playing
      ? (await ensureGameIds(tx, [playing])).get(playing.appId) ?? null
      : null;

    const open = await tx
      .select()
      .from(playSessions)
      .where(and(eq(playSessions.userId, userId), isNull(playSessions.endedAt)))
      .orderBy(desc(playSessions.startedAt))
      .for("update");

    let extended = false;

    for (const session of open) {
      const stale = at.getTime() - session.lastSeenAt.getTime() > SESSION_GRACE_MS;
      const same = gameId !== null && session.gameId === gameId;

      if (same && !stale && !extended) {
        await tx
          .update(playSessions)
          .set({ lastSeenAt: at, minutes: minutesBetween(session.startedAt, at) })
          .where(eq(playSessions.id, session.id));
        extended = true;
        continue;
      }

      await tx
        .update(playSessions)
        .set({
          endedAt: session.lastSeenAt,
          minutes: minutesBetween(session.startedAt, session.lastSeenAt),
        })
        .where(eq(playSessions.id, session.id));
    }

    if (extended) return "extended";

    if (gameId !== null) {
      await tx
        .insert(playSessions)
        .values({ userId, gameId, startedAt: at, lastSeenAt: at, minutes: 0 });
      return "opened";
    }

    return open.length > 0 ? "closed" : "idle";
  });
}

export interface PollResult {
  users: number;
  changed: number;
  errors: string[];
}

/**
 * Все, за кем есть смысл следить.
 *
 * Отсеиваем тестовые учётки: steamid64 — это ровно семнадцать цифр, а на
 * «123» Valve отвечает 400, и опрос каждые три минуты пишет в лог ошибку,
 * которая ничего не значит.
 */
async function trackedUsers() {
  const all = await db.select({ id: users.id, steamId: users.steamId }).from(users);
  return all.filter((user) => /^\d{17}$/.test(user.steamId));
}

/**
 * Опрос счётчика: сколько минут набежало с прошлого раза.
 *
 * Тянем не библиотеку, а недавно игранное — ответ на порядки легче, а всё
 * остальное всё равно не меняется.
 */
export async function pollPlaytime(at: Date = new Date()): Promise<PollResult> {
  const list = await trackedUsers();
  const result: PollResult = { users: list.length, changed: 0, errors: [] };

  for (const user of list) {
    try {
      const recent = await getRecentlyPlayedGames(user.steamId);
      if (recent.length === 0) continue;

      result.changed += await recordPlaytime(
        user.id,
        recent.map((game) => ({
          appId: game.appid,
          name: game.name,
          playtimeMinutes: game.playtime_forever,
        })),
        "poll",
        at
      );
    } catch (error) {
      result.errors.push(`user ${user.id}: ${(error as Error).message}`);
    }
  }

  return result;
}

/**
 * Опрос статуса: кто во что играет прямо сейчас.
 *
 * Один запрос на сотню игроков, поэтому частота упирается не в лимиты Valve,
 * а в то, с какой точностью нужны границы сессий.
 */
export async function pollPresence(at: Date = new Date()): Promise<PollResult> {
  const list = await trackedUsers();
  const result: PollResult = { users: list.length, changed: 0, errors: [] };
  if (list.length === 0) return result;

  let presence;
  try {
    presence = await getPlayersPresence(list.map((user) => user.steamId));
  } catch (error) {
    result.errors.push(`steam: ${(error as Error).message}`);
    return result;
  }

  const bySteamId = new Map(presence.map((entry) => [entry.steamId, entry]));

  for (const user of list) {
    const entry = bySteamId.get(user.steamId);
    const playing =
      entry?.appId != null
        ? { appId: entry.appId, name: entry.gameName ?? `App ${entry.appId}` }
        : null;

    try {
      const outcome = await applyPresence(user.id, playing, at);
      if (outcome !== "idle") result.changed += 1;
    } catch (error) {
      result.errors.push(`user ${user.id}: ${(error as Error).message}`);
    }
  }

  return result;
}

/**
 * Закрывает сессии, о которых опрос забыл.
 *
 * Приложение могло простоять выключенным, и открытая сессия так и висит с
 * прошлой недели. Считать её идущей нельзя: она врёт и в статистике, и в
 * привязке приростов.
 */
export async function closeStaleSessions(at: Date = new Date()): Promise<number> {
  const deadline = new Date(at.getTime() - SESSION_GRACE_MS);

  const stale = await db
    .select({ id: playSessions.id, startedAt: playSessions.startedAt, lastSeenAt: playSessions.lastSeenAt })
    .from(playSessions)
    .where(and(isNull(playSessions.endedAt), sql`${playSessions.lastSeenAt} < ${deadline}`));

  for (const session of stale) {
    await db
      .update(playSessions)
      .set({
        endedAt: session.lastSeenAt,
        minutes: minutesBetween(session.startedAt, session.lastSeenAt),
      })
      .where(eq(playSessions.id, session.id));
  }

  return stale.length;
}
