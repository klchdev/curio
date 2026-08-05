import { useState } from "react";
import { formatPlaytime } from "../lib/vocab";
import ImpressionSheet from "./ImpressionSheet";

type TriageItem = {
  reason: "triage";
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
};

type UpdateItem = {
  reason: "update";
  source: "game" | "slot";
  slotId: number | null;
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  currentPlaytime: number;
  lastRecordedPlaytime: number;
  delta: number;
  existingVerdict: string | null;
  existingRating: number | null;
  existingNote: string | null;
  existingTier: string | null;
};

type AttentionItem = TriageItem | UpdateItem;

interface Props {
  items: AttentionItem[];
  /** Сколько всего игр без вердикта — в список приходит только первая страница. */
  triageTotal: number;
}


const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

function isRecent(lastPlayedAt: string | null): boolean {
  if (!lastPlayedAt) return false;
  return Date.now() - new Date(lastPlayedAt).getTime() < RECENT_MS;
}

export default function NeedsReviewList({ items: initialItems, triageTotal }: Props) {
  const [items, setItems] = useState(initialItems);
  const [reviewing, setReviewing] = useState<AttentionItem | null>(null);
  const [oldExpanded, setOldExpanded] = useState(false);

  if (items.length === 0) return null;

  const updateItems = items.filter((i): i is UpdateItem => i.reason === "update");
  const triageItems = items.filter((i): i is TriageItem => i.reason === "triage");
  const recentUnreviewed = triageItems.filter((i) => isRecent(i.lastPlayedAt));
  const oldUnreviewed = triageItems.filter((i) => !isRecent(i.lastPlayedAt));

  const listItems = [...updateItems, ...recentUnreviewed];
  const shownOld = oldExpanded ? oldUnreviewed : oldUnreviewed.slice(0, 8);

  const removeItem = (gameId: number) =>
    setItems((prev) => prev.filter((i) => i.gameId !== gameId));

  const modal = reviewing && (
    <ImpressionSheet
      mode={reviewing.reason === "triage" ? "retro" : "entry"}
      gameTitle={reviewing.title}
      gameImage={reviewing.headerImage}
      gameId={reviewing.reason === "update" && reviewing.source === "slot" ? undefined : reviewing.gameId}
      slotId={reviewing.reason === "update" && reviewing.source === "slot" ? reviewing.slotId! : undefined}
      currentPlaytime={reviewing.reason === "triage" ? reviewing.playtimeMinutes : reviewing.currentPlaytime}
      lastRecordedPlaytime={reviewing.reason === "update" ? reviewing.lastRecordedPlaytime : undefined}
      currentVerdict={reviewing.reason === "update" ? reviewing.existingVerdict : null}
      currentRating={reviewing.reason === "update" ? reviewing.existingRating : null}
      currentTier={reviewing.reason === "update" ? reviewing.existingTier : null}
      onClose={() => setReviewing(null)}
      onSaved={() => {
        removeItem(reviewing.gameId);
        setReviewing(null);
      }}
    />
  );

  return (
    <>
      {listItems.length > 0 && (
        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Недавние без отзыва</h2>
            <p className="text-sm text-gray-500">{listItems.length} {listItems.length === 1 ? "игра" : listItems.length < 5 ? "игры" : "игр"} за последний месяц</p>
          </div>
          <div className="space-y-2">
            {listItems.map((item) => {
              const isUpdate = item.reason === "update";
              const delta = isUpdate ? item.delta : null;
              const totalMinutes = isUpdate ? item.currentPlaytime : item.playtimeMinutes;

              return (
                <button
                  key={`${item.reason}-${item.gameId}`}
                  onClick={() => setReviewing(item)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-gray-800 bg-gray-900 p-3 text-left transition-all hover:border-gray-600 hover:shadow-lg hover:shadow-black/20"
                >
                  {item.headerImage ? (
                    <img
                      src={item.headerImage}
                      alt={item.title}
                      loading="lazy"
                      className="h-14 w-24 flex-shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-gray-800">
                      <span className="text-xs text-gray-500">{item.title}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-semibold text-gray-100">{item.title}</p>
                    <p className="text-xs text-gray-500">Наиграно {formatPlaytime(totalMinutes)}</p>
                    {isUpdate && delta !== null && (
                      <p className="text-xs text-indigo-400">+{formatPlaytime(delta)} с отзыва</p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    isUpdate ? "bg-indigo-600/20 text-indigo-300" : "bg-gray-800 text-gray-400"
                  }`}>
                    {isUpdate ? "Дополнить" : "Обозреть"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {oldUnreviewed.length > 0 && (
        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Ещё наиграно, но без отзыва</h2>
            <p className="text-sm text-gray-500">{oldUnreviewed.length} {oldUnreviewed.length === 1 ? "игра" : oldUnreviewed.length < 5 ? "игры" : "игр"} с 1+ часом</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {shownOld.map((item) => {
              const hours = Math.floor(item.playtimeMinutes / 60);
              return (
                <button
                  key={`unreviewed-${item.gameId}`}
                  onClick={() => setReviewing(item)}
                  className="group overflow-hidden rounded-lg border border-gray-800 bg-gray-900 transition-all hover:border-gray-600 hover:scale-[1.02]"
                >
                  <div className="relative aspect-[460/215]">
                    {item.headerImage ? (
                      <img
                        src={item.headerImage}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-800">
                        <span className="text-xs text-gray-400">{item.title}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="truncate text-sm font-medium text-gray-200">{item.title}</p>
                    <span className="ml-2 flex-shrink-0 text-xs text-gray-500">{hours} ч</span>
                  </div>
                </button>
              );
            })}
          </div>
          {oldUnreviewed.length > 8 && !oldExpanded && (
            <button
              onClick={() => setOldExpanded(true)}
              className="mt-3 text-sm text-gray-500 transition hover:text-gray-300"
            >
              Показать все ({oldUnreviewed.length})
            </button>
          )}
        </section>
      )}

      {modal}
    </>
  );
}
