import { useMemo, useState } from "react";
import { tierHint, type Tier } from "../lib/vocab";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t } from "../lib/strings";

interface Game {
  gameId: number;
  title: string;
  image: string | null;
  tier: string | null;
}

const ROWS = ["S", "A", "B", "C", "D", "F"] as const;
type Row = (typeof ROWS)[number] | "unranked";

const ROW_STYLE: Record<string, { chip: string; glow: string }> = {
  S: { chip: "bg-yellow-500 text-yellow-950", glow: "shadow-yellow-500/30" },
  A: { chip: "bg-emerald-500 text-emerald-950", glow: "shadow-emerald-500/30" },
  B: { chip: "bg-sky-500 text-sky-950", glow: "shadow-sky-500/30" },
  C: { chip: "bg-orange-500 text-orange-950", glow: "shadow-orange-500/30" },
  D: { chip: "bg-red-500 text-red-950", glow: "shadow-red-500/30" },
  F: { chip: "bg-rose-800 text-rose-100", glow: "shadow-rose-800/30" },
  unranked: { chip: "bg-gray-700 text-gray-200", glow: "shadow-gray-700/20" },
};

const UNRANKED_HINT: Record<Locale, string> = { ru: "Без тира", en: "No tier" };

function rowHint(row: Row, locale: Locale): string {
  return row === "unranked" ? UNRANKED_HINT[locale] : tierHint(row as Tier, locale);
}

/** Cover art with a fallback: it may be missing from the database or fail to load. */
function Cover({ title, image }: { title: string; image: string | null }) {
  const [broken, setBroken] = useState(false);

  if (!image || broken) {
    const initials = title
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("");

    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-gradient-to-br from-gray-700 to-gray-900 px-1">
        <span className="text-[11px] leading-none font-bold text-gray-300">{initials || "?"}</span>
        <span className="w-full truncate text-center text-[8px] leading-none text-gray-500">
          {title}
        </span>
      </span>
    );
  }

  return (
    <img
      src={image}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}

export default function TierBoard({
  games,
  onChange,
  locale = DEFAULT_LOCALE,
}: {
  games: Game[];
  locale?: Locale;
  /** A move is saved immediately; without a handler the board stays a demonstration. */
  onChange?: (gameId: number, tier: string | null) => void;
}) {
  const s = t(locale);
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
    onChange?.(dragged.game.gameId, to === "unranked" ? null : to);
    setDragged(null);
  }

  const total = ROWS.reduce((sum, row) => sum + board[row].length, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="text-2xl font-bold">{s.board.title}</h2>
        <span className="text-sm text-gray-500">{s.board.subtitle(total)}</span>
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
                  title={rowHint(row, locale)}
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
                    {over === row ? s.board.dropHere : s.board.empty}
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
                    <Cover title={game.title} image={game.image} />
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

      {!onChange && (
        <p className="mt-3 text-xs text-gray-600">
          Демонстрационный режим: перестановки не сохраняются.
        </p>
      )}
    </div>
  );
}
