import type { AstroGlobal } from "astro";
import { getSessionUser } from "../../lib/session";
import {
  getLatestRecommendations,
  getActiveSlots,
  getUntriagedGames,
  getTierList,
  getRetroReviews,
  getStats,
} from "../../lib/queries";

/**
 * Общий загрузчик для макетов главного экрана. Только чтение — макеты ничего
 * не пишут. Все четыре варианта показывают одни и те же данные, чтобы
 * сравнивать раскладку, а не содержимое.
 */
export async function loadMockData(astro: AstroGlobal) {
  const user = await getSessionUser(astro);
  if (!user) return null;

  const [run, slots, queue, tierSlots, tierRetro, stats] = await Promise.all([
    getLatestRecommendations(user.id),
    getActiveSlots(user.id),
    getUntriagedGames(user.id),
    getTierList(user.id),
    getRetroReviews(user.id),
    getStats(user.id),
  ]);

  const picks = run?.items ?? [];
  const byTier = (tier: string) => picks.filter((p) => p.tier === tier);

  // Библиотека для «Полки»: всё, у чего есть тир, плюс серые плитки без вердикта.
  const shelf = [
    ...tierSlots.map((g) => ({
      gameId: g.slotId,
      title: g.gameTitle,
      image: g.gameImage,
      tier: g.tier,
    })),
    ...tierRetro.map((g) => ({
      gameId: g.gameId,
      title: g.gameTitle,
      image: g.gameImage,
      tier: g.tier,
    })),
  ];

  return {
    user,
    run,
    picks,
    byTier,
    abandoned: run?.abandoned ?? [],
    slots: slots.map(({ slot, game, currentPlaytime }) => ({
      slotId: slot.id,
      title: game.title,
      image: game.headerImage,
      played: (currentPlaytime ?? 0) - slot.playtimeOnStart,
    })),
    queue,
    shelf,
    stats,
  };
}

export type MockData = NonNullable<Awaited<ReturnType<typeof loadMockData>>>;

export const TIER_STYLE: Record<string, { chip: string; ring: string; hint: string }> = {
  S: { chip: "bg-yellow-500 text-yellow-950", ring: "ring-yellow-500/60", hint: "Бросай текущее" },
  A: { chip: "bg-emerald-500 text-emerald-950", ring: "ring-emerald-500/60", hint: "Очень вероятно зайдёт" },
  B: { chip: "bg-sky-500 text-sky-950", ring: "ring-sky-500/60", hint: "Стоит попробовать" },
  C: { chip: "bg-orange-500 text-orange-950", ring: "ring-orange-500/60", hint: "Под настроение" },
  D: { chip: "bg-red-500 text-red-950", ring: "ring-red-500/60", hint: "Не трать время" },
  F: { chip: "bg-rose-800 text-rose-100", ring: "ring-rose-800/60", hint: "Провал" },
};

export const VARIANTS = [
  { slug: "stage", name: "Сцена", hint: "герой на весь экран, тир задаёт цвет, периферия одной строкой" },
  { slug: "editorial", name: "Журнал", hint: "типографика вместо украшений, арт вторичен" },
];
