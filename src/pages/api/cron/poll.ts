import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { CRON_SECRET } from "astro:env/server";
import { closeStaleSessions } from "../../../lib/playtime-tracker";
import { runJob, startTracker, trackerStarted, type TrackerJob } from "../../../lib/tracker-scheduler";

/**
 * Внешний вход в трекер.
 *
 * Нужен по двум причинам. Первая: контейнер при старте дёргает её сам
 * (scripts/start.mjs) — так таймеры заводятся не при первом заходе человека на
 * сайт, а сразу, иначе за сутки без посетителей не записалось бы ничего.
 * Вторая: если веб-служба всё-таки засыпает, опрос можно повесить на крон
 * Railway или любой внешний пинговалку — ручке безразлично, кто её позвал.
 *
 * Без job только заводит таймеры и отвечает, что они живы.
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
    return json({ scheduler: wasRunning ? "already running" : "started" });
  }

  const jobs = requested === "all" ? JOBS : JOBS.filter((job) => job === requested);
  if (jobs.length === 0) {
    return json({ error: `job должен быть presence, playtime или all` }, 400);
  }

  const closed = await closeStaleSessions();
  const results: Record<string, unknown> = { closedStaleSessions: closed };
  for (const job of jobs) {
    // null значит «такой опрос уже идёт» — второй поверх него не нужен
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
