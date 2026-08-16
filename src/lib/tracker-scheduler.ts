/**
 * Poll scheduling inside the web process itself.
 *
 * On Railway a separate cron service would spin a container up for a second and
 * a half per job and run into the five-minute minimum schedule, while session
 * boundaries need to be finer than that. Inside an already running process it
 * comes down to two timers, and the tracker's code stays the same as the app's:
 * same schema, same connection pool, same environment variables (`astro:env`
 * doesn't exist outside an Astro build, and a service split off on its own
 * would have to bolt together an entry point of its own).
 *
 * The price is that the service must not sleep: with App Sleeping on, the
 * timers stop along with the container. So the polls are duplicated by the http
 * endpoint /api/cron/poll: it doesn't care who pulled it — a timer, Railway's
 * cron or curl.
 *
 * A single replica is assumed. If there are several, each starts its own poll;
 * nothing gets counted twice (the gain is computed under a row lock in the same
 * transaction that writes the new value), but Valve gets twice the requests.
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

/** A poll outlasting its own interval — we don't start a second one on top. */
const inFlight = new Set<TrackerJob>();

function report(job: TrackerJob, result: PollResult): void {
  for (const error of result.errors) console.error(`[tracker:${job}] ${error}`);
  if (result.changed > 0) {
    console.log(`[tracker:${job}] ${result.changed} changes across ${result.users} players`);
  }
}

interface JobState {
  runs: number;
  lastRunAt: string | null;
  /** The last time a poll saw something, rather than just idling through a run. */
  lastChangeAt: string | null;
  lastError: string | null;
}

/**
 * Traces of the polls doing their work.
 *
 * When nothing is happening the poll stays quiet — someone may play once a
 * week, and a log full of "nothing changed" is useless. But then a stopped timer
 * looks exactly like a quiet one, and the breakage would only surface as empty
 * charts a month later. A run counter answers that question right away.
 */
const state: Record<TrackerJob, JobState> = {
  presence: { runs: 0, lastRunAt: null, lastChangeAt: null, lastError: null },
  playtime: { runs: 0, lastRunAt: null, lastChangeAt: null, lastError: null },
};

export function trackerState(): Record<TrackerJob, JobState> {
  return state;
}

export async function runJob(job: TrackerJob): Promise<PollResult | null> {
  if (inFlight.has(job)) return null;
  inFlight.add(job);
  const at = new Date();
  try {
    const result = job === "presence" ? await pollPresence(at) : await pollPlaytime(at);
    state[job].runs += 1;
    state[job].lastRunAt = at.toISOString();
    state[job].lastError = result.errors[0] ?? null;
    if (result.changed > 0) state[job].lastChangeAt = at.toISOString();
    report(job, result);
    return result;
  } catch (error) {
    state[job].runs += 1;
    state[job].lastRunAt = at.toISOString();
    state[job].lastError = (error as Error).message;
    console.error(`[tracker:${job}] failed:`, (error as Error).message);
    return null;
  } finally {
    inFlight.delete(job);
  }
}

/**
 * Starts the timers. Idempotent: it gets called both on container startup and
 * on every hit to the cron endpoint — which of the two fires first depends on
 * how the app was brought up.
 */
export function startTracker(): boolean {
  if (started) return false;
  started = true;

  setInterval(() => void runJob("presence"), PRESENCE_INTERVAL_MS);
  setInterval(() => void runJob("playtime"), PLAYTIME_INTERVAL_MS);

  /*
   * Hanging sessions come first: the container may have gone off into a deploy
   * in the middle of the evening, and an open session should be closed at the
   * last poll rather than dragging on until the game is launched again.
   */
  void closeStaleSessions()
    .then((closed) => {
      if (closed > 0) console.log(`[tracker] stale sessions closed: ${closed}`);
    })
    .catch((error) => console.error("[tracker] sessions:", (error as Error).message));

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
