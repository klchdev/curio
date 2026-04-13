import { useState } from "react";
import NoteModal from "./NoteModal";

interface Props {
  slotId: number;
  gameTitle: string;
  gameImage: string | null;
  totalPlayed: number;
  lastRecordedPlaytime: number;
  delta: number;
  verdict: string;
  rating: number;
}

function formatPlaytime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`;
}

export default function StillPlayingCard({
  slotId,
  gameTitle,
  gameImage,
  totalPlayed,
  lastRecordedPlaytime,
  delta,
  verdict,
  rating,
}: Props) {
  const [showNote, setShowNote] = useState(false);

  return (
    <>
      <div className="group flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900 p-3 transition-all hover:border-gray-700 hover:shadow-lg hover:shadow-black/20">
        <img
          src={gameImage || ""}
          alt={gameTitle}
          className="h-16 w-28 flex-shrink-0 rounded-lg object-cover"
        />
        <div className="flex-1 min-w-0">
          <h4 className="truncate font-semibold">{gameTitle}</h4>
          <p className="text-sm text-gray-400">
            Наиграно {formatPlaytime(totalPlayed)}
          </p>
          <p className="text-xs text-indigo-400">
            +{formatPlaytime(delta)} с последнего отзыва
          </p>
        </div>
        <button
          onClick={() => setShowNote(true)}
          className="flex-shrink-0 rounded-lg bg-indigo-600/20 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-600/30"
        >
          Дополнить
        </button>
      </div>

      {showNote && (
        <NoteModal
          slotId={slotId}
          gameTitle={gameTitle}
          totalPlayed={totalPlayed}
          lastRecordedPlaytime={lastRecordedPlaytime}
          currentVerdict={verdict}
          currentRating={rating}
          onClose={() => setShowNote(false)}
        />
      )}
    </>
  );
}
