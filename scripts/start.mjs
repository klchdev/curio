/**
 * Entry point for Railway.
 *
 * Starts the ordinary Astro server and immediately wakes the tracker: without
 * that, the polling timers would only start when the first person opens the
 * site, and the whole point of the tracker is to record history while nobody is
 * looking at the site at all.
 *
 * We knock on it over http rather than importing it: the tracker's code lives
 * inside the Astro build and reads its keys through `astro:env`, which doesn't
 * exist outside that build.
 */
const PORT = process.env.PORT ?? "4321";
const SECRET = process.env.CRON_SECRET;

await import("../dist/server/entry.mjs");

if (!SECRET) {
  console.warn("[start] CRON_SECRET is not set — tracker not started");
} else {
  void wakeTracker();
}

async function wakeTracker() {
  // The server comes up asynchronously: the first attempts legitimately fail
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/cron/poll`, {
        headers: { authorization: `Bearer ${SECRET}` },
      });
      if (res.ok) {
        console.log("[start] tracker woken:", (await res.json()).scheduler);
        return;
      }
      console.error(`[start] tracker answered ${res.status}`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  console.error("[start] server never answered — tracker not started");
}
