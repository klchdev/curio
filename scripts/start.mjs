/**
 * Точка входа для Railway.
 *
 * Поднимает обычный сервер Astro и сразу же будит трекер: без этого таймеры
 * опроса завелись бы только при первом заходе человека на сайт, а смысл
 * трекера ровно в том, чтобы писать историю, пока на сайт никто не смотрит.
 *
 * Стучимся через http, а не импортом: код трекера живёт в сборке Astro и
 * читает ключи через `astro:env`, которого снаружи сборки нет.
 */
const PORT = process.env.PORT ?? "4321";
const SECRET = process.env.CRON_SECRET;

await import("../dist/server/entry.mjs");

if (!SECRET) {
  console.warn("[start] CRON_SECRET не задан — трекер не запущен");
} else {
  void wakeTracker();
}

async function wakeTracker() {
  // Сервер поднимается асинхронно: первые попытки законно упираются в отказ
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/cron/poll`, {
        headers: { authorization: `Bearer ${SECRET}` },
      });
      if (res.ok) {
        console.log("[start] трекер разбужен:", (await res.json()).scheduler);
        return;
      }
      console.error(`[start] трекер ответил ${res.status}`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  console.error("[start] сервер не ответил — трекер не запущен");
}
