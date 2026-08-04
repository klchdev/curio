import { useMemo, useState } from "react";

interface Game {
  gameId: number;
  title: string;
  image: string | null;
  tier: string | null;
}

const ROWS = ["S", "A", "B", "C", "D", "F"] as const;
type Row = (typeof ROWS)[number] | "unranked";

const ROW_STYLE: Record<string, { chip: string; glow: string; hint: string }> = {
  S: { chip: "bg-yellow-500 text-yellow-950", glow: "shadow-yellow-500/30", hint: "Шедевр" },
  A: { chip: "bg-emerald-500 text-emerald-950", glow: "shadow-emerald-500/30", hint: "Крутая" },
  B: { chip: "bg-sky-500 text-sky-950", glow: "shadow-sky-500/30", hint: "Хорошая" },
  C: { chip: "bg-orange-500 text-orange-950", glow: "shadow-orange-500/30", hint: "Сойдёт" },
  D: { chip: "bg-red-500 text-red-950", glow: "shadow-red-500/30", hint: "Не зашло" },
  F: { chip: "bg-rose-800 text-rose-100", glow: "shadow-rose-800/30", hint: "Провал" },
  unranked: { chip: "bg-gray-700 text-gray-200", glow: "shadow-gray-700/20", hint: "Без тира" },
};

export default function TierBoard({ games }: { games: Game[] }) {
  const initial = useMemo(() => {
    const board: Record<Row, Game[]> = {
      S: [], A: [], B: [], C: [], D: [], F: [], unranked: [],
    };
    const seen = new Set<number>();
    for (const game of games) {
      if (seen.has(game.gameId)) continue;
      seen.add(game.gameId);
      const row = (game.tier && ROWS.includes(game.tier as any) ? game.tier : "unranked") as Row;
      board[row].push(game);
    }
    return board;
  }, [games]);

  const [board, setBoard] = useState(initial);
  const [dragged, setDragged] = useState<{ game: Game; from: Row } | null>(null);
  const [over, setOver] = useState<Row | null>(null);
  const [landed, setLanded] = useState<number | null>(null);

  function drop(to: Row) {
    setOver(null);
    if (!dragged || dragged.from === to) return setDragged(null);

    setBoard((prev) => ({
      ...prev,
      [dragged.from]: prev[dragged.from].filter((g) => g.gameId !== dragged.game.gameId),
      [to]: [{ ...dragged.game, tier: to === "unranked" ? null : to }, ...prev[to]],
    }));

    setLanded(dragged.game.gameId);
    setTimeout(() => setLanded(null), 700);
    setDragged(null);
  }

  const total = ROWS.reduce((sum, row) => sum + board[row].length, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="text-2xl font-bold">Тир-лист</h2>
        <span className="text-sm text-gray-500">
          {total} игр расставлено · перетаскивай обложки между рядами
        </span>
      </div>

      <div className="space-y-2">
        {([...ROWS, "unranked"] as Row[]).map((row) => {
          const style = ROW_STYLE[row];
          const items = board[row];
          if (row === "unranked" && items.length === 0) return null;

          return (
            <div
              key={row}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(row);
              }}
              onDragLeave={() => setOver((current) => (current === row ? null : current))}
              onDrop={() => drop(row)}
              className={`flex gap-3 rounded-xl border p-2 transition-all duration-300 ${
                over === row
                  ? "border-gray-500 bg-gray-800/40"
                  : "border-gray-800/70 bg-gray-900/20"
              }`}
            >
              <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-1">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg font-black transition-transform duration-300 ${style.chip} ${
                    over === row ? "scale-110" : ""
                  }`}
                >
                  {row === "unranked" ? "—" : row}
                </span>
                <span className="text-[10px] text-gray-600">{items.length}</span>
              </div>

              <div className="flex min-h-14 flex-1 flex-wrap content-start gap-1.5">
                {items.length === 0 && (
                  <span className="self-center text-xs text-gray-700">
                    {over === row ? "отпусти здесь" : "пусто"}
                  </span>
                )}

                {items.map((game) => (
                  <div
                    key={game.gameId}
                    draggable
                    onDragStart={() => setDragged({ game, from: row })}
                    onDragEnd={() => {
                      setDragged(null);
                      setOver(null);
                    }}
                    title={game.title}
                    className={`group relative h-11 w-24 cursor-grab overflow-hidden rounded-md ring-offset-2 ring-offset-gray-950 transition-all duration-300 active:cursor-grabbing ${
                      dragged?.game.gameId === game.gameId ? "scale-90 opacity-30" : "hover:-translate-y-1 hover:scale-105"
                    } ${landed === game.gameId ? `shadow-lg ring-2 ring-white/70 ${style.glow}` : ""}`}
                  >
                    {game.image ? (
                      <img src={game.image} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span className="flex h-full items-center justify-center bg-gray-800 px-1 text-[9px] text-gray-400">
                        {game.title}
                      </span>
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gray-950/85 px-1 py-0.5 text-[9px] opacity-0 transition group-hover:opacity-100">
                      {game.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-gray-600">
        В макете перестановки не сохраняются — в боевой версии тир пишется сразу.
      </p>
    </div>
  );
}
