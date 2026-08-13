/**
 * Расписание опросов внутри самого веб-процесса.
 *
 * На Railway отдельная крон-служба поднимала бы контейнер под задачу на
 * полторы секунды и упиралась бы в пятиминутный минимум расписания, а границы
 * сессий нужны точнее. Внутри уже работающего процесса это два таймера, и код
 * трекера остаётся тем же, что у приложения: та же схема, тот же пул
 * подключений, те же переменные окружения (`astro:env` вне сборки Astro не
 * существует, и вынесенной службе пришлось бы городить свою точку входа).
 *
 * Расплата — служба должна не спать: с включённым App Sleeping таймеры встают
 * вместе с контейнером. Поэтому опросы дублируются http-ручкой /api/cron/poll:
 * ей всё равно, кто дёрнул — таймер, крон Railway или курл.
 *
 * Считается, что реплика одна. Если их станет несколько, каждая начнёт свой
 * опрос; двойного учёта не будет (прирост считается под блокировкой строки в
 * той же транзакции, где записывается новое значение), но запросов к Valve
 * станет вдвое больше.
 */
import {
  PLAYTIME_INTERVAL_MS,
  PRESENCE_INTERVAL_MS,
  closeStaleSessions,
  pollPlaytime,
  pollPresence,
  type PollResult,
} from "./playtime-tracker";

export type TrackerJob = "presence" | "playtime";

let started = false;

/** Опрос идёт дольше своего интервала — второй поверх него не запускаем. */
const inFlight = new Set<TrackerJob>();

function report(job: TrackerJob, result: PollResult): void {
  for (const error of result.errors) console.error(`[tracker:${job}] ${error}`);
  if (result.changed > 0) {
    console.log(`[tracker:${job}] ${result.changed} изменений у ${result.users} игроков`);
  }
}

export async function runJob(job: TrackerJob): Promise<PollResult | null> {
  if (inFlight.has(job)) return null;
  inFlight.add(job);
  try {
    const at = new Date();
    const result = job === "presence" ? await pollPresence(at) : await pollPlaytime(at);
    report(job, result);
    return result;
  } catch (error) {
    console.error(`[tracker:${job}] упал:`, (error as Error).message);
    return null;
  } finally {
    inFlight.delete(job);
  }
}

/**
 * Заводит таймеры. Идемпотентна: её зовут и при старте контейнера, и на каждый
 * заход в крон-ручку — какой из способов сработает первым, зависит от того,
 * как приложение подняли.
 */
export function startTracker(): boolean {
  if (started) return false;
  started = true;

  setInterval(() => void runJob("presence"), PRESENCE_INTERVAL_MS);
  setInterval(() => void runJob("playtime"), PLAYTIME_INTERVAL_MS);

  /*
   * Первым делом — подвешенные сессии: контейнер мог уехать в деплой прямо
   * посреди вечера, и открытая сессия должна закрыться прошлым опросом, а не
   * тянуться до следующего запуска игры.
   */
  void closeStaleSessions()
    .then((closed) => {
      if (closed > 0) console.log(`[tracker] закрыто подвисших сессий: ${closed}`);
    })
    .catch((error) => console.error("[tracker] сессии:", (error as Error).message));

  void runJob("presence");
  void runJob("playtime");

  console.log(
    `[tracker] опрос запущен: статус раз в ${PRESENCE_INTERVAL_MS / 60_000} мин, ` +
      `счётчик раз в ${PLAYTIME_INTERVAL_MS / 60_000} мин`
  );
  return true;
}

export function trackerStarted(): boolean {
  return started;
}
