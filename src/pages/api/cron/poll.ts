import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { CRON_SECRET } from "astro:env/server";
import { closeStaleSessions } from "../../../lib/playtime-tracker";
import {
  runJob,
  startTracker,
  trackerStarted,
  trackerState,
  type TrackerJob,
} from "../../../lib/tracker-scheduler";

/**
 * The tracker's entry point from outside.
 *
 * It exists for two reasons. First: the container hits it itself on startup
 * (scripts/start.mjs) — that way the timers start immediately rather than on
 * the first human visit, otherwise a day without visitors would record nothing
 * at all. Second: if the web service does fall asleep anyway, polling can be
 * hung off Railway's cron or any external pinger — the endpoint does not care
 * who called it.
 *
 * With no job it only starts the timers and reports that they are alive.
 */
export const prerender = false;

function authorized(request: Request, url: URL): boolean {
  if (!CRON_SECRET) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("key") ?? "";

  const a = Buffer.from(provided);
  const b = Buffer.from(CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

const JOBS: TrackerJob[] = ["presence", "playtime"];

const handle: APIRoute = async ({ request, url }) => {
  if (!CRON_SECRET) {
    return json({ error: "CRON_SECRET не задан — трекер выключен" }, 503);
  }
  if (!authorized(request, url)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const wasRunning = trackerStarted();
  startTracker();

  const requested = url.searchParams.get("job");
  if (!requested) {
    // With no job the endpoint reports health: how many runs there were and when
    return json({ scheduler: wasRunning ? "already running" : "started", jobs: trackerState() });
  }

  const jobs = requested === "all" ? JOBS : JOBS.filter((job) => job === requested);
  if (jobs.length === 0) {
    return json({ error: `job должен быть presence, playtime или all` }, 400);
  }

  const closed = await closeStaleSessions();
  const results: Record<string, unknown> = { closedStaleSessions: closed };
  for (const job of jobs) {
    // null means "that poll is already running" — no need for a second one on top
    results[job] = (await runJob(job)) ?? "already running";
  }

  return json(results);
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET = handle;
export const POST = handle;
