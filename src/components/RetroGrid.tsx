import { useState } from "react";

type TierValue = "S" | "A" | "B" | "C" | "D";

interface Review {
  gameId: number;
  gameTitle: string;
  gameImage: string | null;
  steamAppId: number;
  tier: TierValue | null;
  rating: number | null;
  note: string | null;
}

interface Props {
  reviews: Review[];
}

const TIER_COLORS: Record<TierValue, { bg: string; text: string }> = {
  S: { bg: "bg-yellow-500", text: "text-yellow-950" },
  A: { bg: "bg-emerald-500", text: "text-emerald-950" },
  B: { bg: "bg-sky-500", text: "text-sky-950" },
  C: { bg: "bg-orange-500", text: "text-orange-950" },
  D: { bg: "bg-red-500", text: "text-red-950" },
};

const WORTH_LABELS = [
  "Зря потратил время",
  "Скорее нет",
  "Нормально",
  "Скорее да",
  "Рад что попробовал",
];

export default function RetroGrid({ reviews }: Props) {
  const [selected, setSelected] = useState<Review | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {reviews.map((r) => {
          const tc = r.tier ? TIER_COLORS[r.tier] : null;
          return (
            <button
              key={r.gameId}
              onClick={() => setSelected(r)}
              title={r.gameTitle}
              className="group relative aspect-[460/215] overflow-hidden rounded border border-gray-700/50 transition-all hover:border-gray-500 hover:scale-105"
            >
              {r.gameImage ? (
                <img src={r.gameImage} alt={r.gameTitle} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-800 p-1">
                  <span className="text-center text-[10px] text-gray-400">{r.gameTitle}</span>
                </div>
              )}
              {r.tier && (
                <div className={`absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-black ${tc!.bg} ${tc!.text}`}>
                  {r.tier}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 transition-all"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {selected.gameImage && (
              <div className="relative aspect-[460/215]">
                <img src={selected.gameImage} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
              </div>
            )}
            <div className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <h3 className="text-xl font-bold">{selected.gameTitle}</h3>
                {selected.tier && (() => {
                  const tc = TIER_COLORS[selected.tier];
                  return (
                    <span className={`rounded px-2 py-0.5 text-sm font-black ${tc.bg} ${tc.text}`}>
                      {selected.tier}
                    </span>
                  );
                })()}
              </div>
              {selected.rating && (
                <p className="mb-3 text-sm text-gray-400">{WORTH_LABELS[selected.rating - 1]}</p>
              )}
              {selected.note ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">{selected.note}</p>
              ) : (
                <p className="text-sm text-gray-600">Без заметки</p>
              )}
              <button
                onClick={() => setSelected(null)}
                className="mt-5 w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-400 transition hover:bg-gray-800"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
