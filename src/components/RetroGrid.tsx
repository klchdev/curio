import { useState } from "react";

type TierValue = "S" | "A" | "B" | "C" | "D" | "F";

interface ReviewNote {
  id: number;
  text: string;
  playtimeMinutes: number;
  createdAt: string | Date;
}

interface Review {
  gameId: number;
  gameTitle: string;
  gameImage: string | null;
  steamAppId: number;
  tier: TierValue | null;
  rating: number | null;
  note: string | null;
  notes?: ReviewNote[];
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
  F: { bg: "bg-rose-800", text: "text-rose-100" },
};

const WORTH_LABELS = [
  "Зря потратил время",
  "Скорее нет",
  "Нормально",
  "Скорее да",
  "Рад что попробовал",
];

function formatPlaytime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`;
}

function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

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
              {r.notes && r.notes.length > 1 && (
                <div className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-200">
                  {r.notes.length} зап.
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 transition-all overflow-y-auto py-8"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-gray-900 shadow-2xl my-auto"
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

              {selected.notes && selected.notes.length > 0 ? (
                <div className="space-y-3">
                  {selected.notes.map((n, i) => (
                    <div key={n.id} className="rounded-lg border border-gray-800 bg-gray-800/40 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                        <span>{i === 0 ? "Первый отзыв" : `Запись ${i + 1}`}</span>
                        <span>{formatDate(n.createdAt)} · {formatPlaytime(n.playtimeMinutes)}</span>
                      </div>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-gray-200">{n.text}</p>
                    </div>
                  ))}
                </div>
              ) : selected.note ? (
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
