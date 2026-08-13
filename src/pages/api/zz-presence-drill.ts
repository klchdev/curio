// ВРЕМЕННЫЙ прогон сценария сессий. Удалить после проверки.
import type { APIRoute } from "astro";
import { applyPresence, closeStaleSessions, recordPlaytime } from "../../lib/playtime-tracker";
import { db } from "../../db";
import { games, playSessions, playtimeSnapshots, userGames } from "../../db/schema";
import { and, eq, gte } from "drizzle-orm";

export const GET: APIRoute = async ({ url }) => {
  const userId = Number(url.searchParams.get("user"));
  const a = Number(url.searchParams.get("a"));
  const b = Number(url.searchParams.get("b"));
  const base = new Date();
  const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000);

  const steps: unknown[] = [];
  const step = async (label: string, playing: { appId: number; name: string } | null, m: number) => {
    const outcome = await applyPresence(userId, playing, at(m));
    const open = await db
      .select()
      .from(playSessions)
      .where(and(eq(playSessions.userId, userId), gte(playSessions.startedAt, base)));
    steps.push({
      label,
      outcome,
      sessions: open.map((s) => ({
        game: s.gameId,
        minutes: s.minutes,
        open: s.endedAt === null,
        started: s.startedAt.toISOString().slice(11, 19),
        ended: s.endedAt?.toISOString().slice(11, 19) ?? null,
      })),
    });
  };

  await step("запуск игры A", { appId: a, name: "A" }, 0);
  await step("+3 мин, та же игра", { appId: a, name: "A" }, 3);
  await step("+6 мин, та же игра", { appId: a, name: "A" }, 6);
  await step("+40 мин, разрыв больше терпимого", { appId: a, name: "A" }, 40);
  await step("+43 мин, сменил игру на B", { appId: b, name: "B" }, 43);
  await step("+46 мин, вышел", null, 46);

  // Прирост счётчика должен приклеиться к только что закрытой сессии
  const gainProbe: Record<string, unknown> = {};
  await applyPresence(userId, { appId: a, name: "A" }, at(100));
  const [row] = await db
    .select({ playtime: userGames.playtimeMinutes, gameId: userGames.gameId })
    .from(userGames)
    .innerJoin(games, eq(games.id, userGames.gameId))
    .where(and(eq(userGames.userId, userId), eq(games.steamAppId, a)));
  await recordPlaytime(
    userId,
    [{ appId: a, name: "A", playtimeMinutes: (row?.playtime ?? 0) + 37 }],
    "poll",
    at(105)
  );
  const snap = await db
    .select()
    .from(playtimeSnapshots)
    .where(and(eq(playtimeSnapshots.userId, userId), gte(playtimeSnapshots.takenAt, base)));
  const sessionsAfter = await db
    .select()
    .from(playSessions)
    .where(and(eq(playSessions.userId, userId), gte(playSessions.startedAt, base)));
  gainProbe.snapshot = snap.map((s) => ({ delta: s.deltaMinutes, session: s.sessionId, source: s.source }));
  gainProbe.sessionGain = sessionsAfter.map((s) => ({ id: s.id, gain: s.playtimeGainMinutes }));
  if (row) {
    await db
      .update(userGames)
      .set({ playtimeMinutes: row.playtime })
      .where(and(eq(userGames.userId, userId), eq(userGames.gameId, row.gameId)));
  }
  await db.delete(playtimeSnapshots).where(and(eq(playtimeSnapshots.userId, userId), gte(playtimeSnapshots.takenAt, base)));
  steps.push({ label: "прирост 37 мин после сессии", outcome: gainProbe });

  const stale = await closeStaleSessions(at(200));
  const left = await db
    .select()
    .from(playSessions)
    .where(and(eq(playSessions.userId, userId), gte(playSessions.startedAt, base)));

  if (url.searchParams.get("cleanup") === "1") {
    await db.delete(playSessions).where(and(eq(playSessions.userId, userId), gte(playSessions.startedAt, base)));
  }

  return new Response(JSON.stringify({ steps, staleClosed: stale, total: left.length }, null, 1), {
    headers: { "Content-Type": "application/json" },
  });
};
