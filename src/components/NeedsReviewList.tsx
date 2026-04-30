import { useState } from "react";
import RetroReviewModal from "./RetroReviewModal";
import NoteModal from "./NoteModal";

type UnreviewedItem = {
  kind: "unreviewed";
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
};

type GameUpdateItem = {
  kind: "game_update";
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  currentPlaytime: number;
  delta: number;
  playtimeAtReview: number;
  existingVerdict: string | null;
  existingRating: number | null;
  existingNote: string | null;
  existingTier: string | null;
};

type SlotUpdateItem = {
  kind: "slot_update";
  slotId: number;
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  totalPlayed: number;
  lastRecordedPlaytime: number;
  delta: number;
  verdict: string;
  rating: number;
};

type NeedsReviewItem = UnreviewedItem | GameUpdateItem | SlotUpdateItem;

interface Props {
  items: NeedsReviewItem[];
}

function formatPlaytime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`;
}

const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

function isRecent(lastPlayedAt: string | null): boolean {
  if (!lastPlayedAt) return false;
  return Date.now() - new Date(lastPlayedAt).getTime() < RECENT_MS;
}

export default function NeedsReviewList({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [reviewing, setReviewing] = useState<NeedsReviewItem | null>(null);
  const [oldExpanded, setOldExpanded] = useState(false);

  if (items.length === 0) return null;

  const updateItems = items.filter(
    (i) => i.kind === "game_update" || i.kind === "slot_update"
  );
  const recentUnreviewed = items.filter(
    (i) => i.kind === "unreviewed" && isRecent(i.lastPlayedAt)
  );
  const oldUnreviewed = items.filter(
    (i) => i.kind === "unreviewed" && !isRecent((i as UnreviewedItem).lastPlayedAt)
  ) as UnreviewedItem[];

  const listItems = [...updateItems, ...recentUnreviewed];
  const shownOld = oldExpanded ? oldUnreviewed : oldUnreviewed.slice(0, 8);

  const removeItem = (gameId: number) =>
    setItems((prev) => prev.filter((i) => i.gameId !== gameId));

  const modal = reviewing && (
    <>
      {reviewing.kind === "slot_update" && (
        <NoteModal
          slotId={reviewing.slotId}
          gameTitle={reviewing.title}
          totalPlayed={reviewing.totalPlayed}
          lastRecordedPlaytime={reviewing.lastRecordedPlaytime}
          currentVerdict={reviewing.verdict}
          currentRating={reviewing.rating}
          onClose={() => setReviewing(null)}
        />
      )}
      {(reviewing.kind === "unreviewed" || reviewing.kind === "game_update") && (
        <RetroReviewModal
          gameId={reviewing.gameId}
          gameTitle={reviewing.title}
          gameImage={reviewing.headerImage}
          currentPlaytime={
            reviewing.kind === "unreviewed"
              ? reviewing.playtimeMinutes
              : reviewing.currentPlaytime
          }
          playtimeAtReview={
            reviewing.kind === "game_update" ? reviewing.playtimeAtReview : undefined
          }
          existingVerdict={
            reviewing.kind === "game_update" ? reviewing.existingVerdict : undefined
          }
          existingRating={
            reviewing.kind === "game_update" ? reviewing.existingRating : undefined
          }
          existingNote={
            reviewing.kind === "game_update" ? reviewing.existingNote : undefined
          }
          existingTier={
            reviewing.kind === "game_update" ? reviewing.existingTier : undefined
          }
          onClose={() => setReviewing(null)}
          onSaved={() => {
            removeItem(reviewing.gameId);
            setReviewing(null);
          }}
        />
      )}
    </>
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
              const isUpdate = item.kind === "game_update" || item.kind === "slot_update";
              const delta = isUpdate ? item.delta : null;
              const totalMinutes =
                item.kind === "unreviewed"
                  ? item.playtimeMinutes
                  : item.kind === "game_update"
                  ? item.currentPlaytime
                  : item.totalPlayed;

              return (
                <button
                  key={`${item.kind}-${item.gameId}`}
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
