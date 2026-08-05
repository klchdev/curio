import { useState } from "react";
import { createPortal } from "react-dom";
import ImpressionSheet from "./ImpressionSheet";

interface Props {
  gameId: number;
  gameTitle: string;
  currentPlaytime: number;
  lastRecordedPlaytime: number;
  currentVerdict: string | null;
  currentRating: number | null;
  currentTier: string | null;
}

export default function AddGameNoteButton({
  gameId,
  gameTitle,
  currentPlaytime,
  lastRecordedPlaytime,
  currentVerdict,
  currentRating,
  currentTier,
}: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition hover:border-indigo-500 hover:text-indigo-300"
      >
        Дополнить отзыв
      </button>
      {showModal &&
        createPortal(
          <ImpressionSheet
            mode="entry"
            gameId={gameId}
            gameTitle={gameTitle}
            currentPlaytime={currentPlaytime}
            lastRecordedPlaytime={lastRecordedPlaytime}
            currentVerdict={currentVerdict}
            currentRating={currentRating}
            currentTier={currentTier}
            onClose={() => setShowModal(false)}
          />,
          document.body
        )}
    </>
  );
}
