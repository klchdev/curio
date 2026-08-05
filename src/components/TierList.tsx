import { useState } from "react";
import { tiers, type Tier } from "../lib/vocab";

/** Рекомендуемая доля тира в процентах — подсказка «не раздувай S». */
const RECOMMENDED_SHARE: Record<Tier, [number, number]> = {
  S: [5, 10],
  A: [15, 25],
  B: [25, 35],
  C: [15, 25],
  D: [10, 20],
  F: [5, 10],
};

/** Словарь даёт нейтральные имена, экрану нужны свои роли. */
const TIER_VIEW = tiers().map((t) => ({
  ...t,
  labelBg: t.bg,
  labelText: t.text,
  barBg: t.bg,
  rec: RECOMMENDED_SHARE[t.value],
}));

type TierValue = "S" | "A" | "B" | "C" | "D" | "F";
type Source = "roulette" | "retro";
type Filter = "all" | "roulette" | "retro";

interface Game {
  slotId: number;
  gameTitle: string;
  gameImage: string | null;
  steamAppId: number;
  tier: TierValue | null;
  verdict: string | null;
  rating: number;
  source: Source;
  gameId?: number;
}

interface Props {
  games: Game[];
}


const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "roulette", label: "Рулетка" },
  { value: "retro", label: "Ретроспектива" },
];

export default function TierList({ games: initialGames }: Props) {
  const [games, setGames] = useState(initialGames);
  const [draggedSlotId, setDraggedSlotId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<TierValue | "unranked" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = filter === "all" ? games : games.filter((g) => g.source === filter);

  const hasRoulette = games.some((g) => g.source === "roulette");
  const hasRetro = games.some((g) => g.source === "retro");
  const showFilters = hasRoulette && hasRetro;

  async function handleSetTier(slotId: number, tier: TierValue | null) {
    const game = games.find((g) => g.slotId === slotId);
    if (!game) return;

    // Optimistic update
    setGames((prev) => prev.map((g) => (g.slotId === slotId ? { ...g, tier } : g)));

    const url = game.source === "retro" ? "/api/set-retro-tier" : "/api/set-tier";
    const body = game.source === "retro"
      ? { gameId: game.gameId, tier }
      : { slotId, tier };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setGames(initialGames);
    }
  }

  function onDragStart(e: React.DragEvent, slotId: number) {
    setDraggedSlotId(slotId);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 60, 36);
    }
  }

  function onDragEnd() {
    setDraggedSlotId(null);
    setDropTarget(null);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(tier: TierValue | null) {
    if (draggedSlotId !== null) {
      handleSetTier(draggedSlotId, tier);
    }
    setDraggedSlotId(null);
    setDropTarget(null);
  }

  const unranked = filtered.filter((g) => !g.tier);
  const ranked = filtered.filter((g) => g.tier);
  const rankedTotal = ranked.length;

  const distribution = TIER_VIEW.map((t) => {
    const count = filtered.filter((g) => g.tier === t.value).length;
    const pct = rankedTotal > 0 ? Math.round((count / rankedTotal) * 100) : 0;
    const over = pct > t.rec[1];
    return { ...t, count, pct, over };
  });

  return (
    <div>
      {showFilters && (
        <div className="mb-4 flex gap-1 rounded-lg bg-gray-900 p-1 w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filter === f.value
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {rankedTotal > 0 && (
        <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>Распределение по тирам</span>
            <span>{rankedTotal} оценено</span>
          </div>

          <div className="mb-1">
            <div className="flex h-5 w-full overflow-hidden rounded">
              {distribution.map((t) => (
                t.pct > 0 && (
                  <div
                    key={t.value}
                    className={`flex items-center justify-center text-[9px] font-bold transition-all ${t.barBg} ${t.labelText}`}
                    style={{ width: `${t.pct}%` }}
                    title={`${t.label}: ${t.pct}%`}
                  >
                    {t.pct >= 7 ? `${t.label} ${t.pct}%` : t.pct >= 4 ? t.label : ""}
                  </div>
                )
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="flex h-2 w-full overflow-hidden rounded opacity-25">
              {distribution.map((t) => (
                <div
                  key={t.value}
                  className={t.barBg}
                  style={{ width: `${(t.rec[0] + t.rec[1]) / 2}%` }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {distribution.map((t) => (
              t.count > 0 && (
                <div key={t.value} className="flex items-center gap-1.5 text-xs">
                  <div className={`h-2.5 w-2.5 rounded-sm ${t.barBg}`} />
                  <span className={t.over ? "font-medium text-red-400" : "text-gray-400"}>
                    {t.label} {t.pct}%{t.over ? " ↑" : ""}
                  </span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {TIER_VIEW.map((tier) => {
          const tierGames = filtered.filter((g) => g.tier === tier.value);
          const isOver = dropTarget === tier.value;

          return (
            <div
              key={tier.value}
              className={`flex min-h-[88px] rounded-lg border transition-colors ${
                isOver
                  ? "border-white/30 bg-gray-800"
                  : "border-gray-800 bg-gray-900"
              }`}
              onDragOver={(e) => {
                onDragOver(e);
                setDropTarget(tier.value);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(tier.value);
              }}
            >
              <div className={`flex w-16 flex-shrink-0 flex-col items-center justify-center rounded-l-lg ${tier.labelBg}`}>
                <span className={`text-3xl font-black leading-none ${tier.labelText}`}>{tier.label}</span>
                <span className={`mt-0.5 text-center text-[9px] font-medium leading-tight opacity-70 ${tier.labelText}`}>{tier.hint}</span>
              </div>
              <div className="flex flex-1 flex-wrap items-start gap-1.5 p-2">
                {tierGames.length === 0 && !isOver && (
                  <span className="self-center px-2 text-sm text-gray-700">—</span>
                )}
                {tierGames.map((game) => (
                  <GameCard
                    key={game.slotId}
                    game={game}
                    isDragging={draggedSlotId === game.slotId}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {unranked.length > 0 && (
          <div
            className={`mt-6 rounded-lg border p-4 transition-colors ${
              dropTarget === "unranked"
                ? "border-white/30 bg-gray-800"
                : "border-gray-800 bg-gray-900"
            }`}
            onDragOver={(e) => {
              onDragOver(e);
              setDropTarget("unranked");
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(null);
            }}
          >
            <h3 className="mb-3 text-sm font-medium text-gray-400">
              Не распределены <span className="text-gray-600">({unranked.length})</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {unranked.map((game) => (
                <GameCard
                  key={game.slotId}
                  game={game}
                  isDragging={draggedSlotId === game.slotId}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GameCard({
  game,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  game: Game;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, slotId: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, game.slotId)}
      onDragEnd={onDragEnd}
      title={game.gameTitle}
      className={`relative aspect-[460/215] w-[138px] cursor-grab overflow-hidden rounded border transition-all active:cursor-grabbing ${
        isDragging ? "opacity-30 scale-95" : "border-gray-700/50 hover:border-gray-500 hover:scale-105"
      }`}
    >
      {game.gameImage ? (
        <img
          src={game.gameImage}
          alt={game.gameTitle}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-800 p-1">
          <span className="text-center text-[10px] text-gray-400">{game.gameTitle}</span>
        </div>
      )}
      {game.source === "retro" && (
        <div className="absolute top-1 right-1 rounded bg-indigo-500/80 px-1 py-0.5 text-[8px] font-medium text-white">
          R
        </div>
      )}
    </div>
  );
}
