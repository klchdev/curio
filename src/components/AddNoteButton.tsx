import { useState } from "react";
import { createPortal } from "react-dom";
import NoteModal from "./NoteModal";

interface Props {
  slotId: number;
  gameTitle: string;
  totalPlayed: number;
  lastRecordedPlaytime: number;
  currentVerdict: string;
  currentRating: number;
}

export default function AddNoteButton({
  slotId,
  gameTitle,
  totalPlayed,
  lastRecordedPlaytime,
  currentVerdict,
  currentRating,
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
          <NoteModal
            slotId={slotId}
            gameTitle={gameTitle}
            totalPlayed={totalPlayed}
            lastRecordedPlaytime={lastRecordedPlaytime}
            currentVerdict={currentVerdict}
            currentRating={currentRating}
            onClose={() => setShowModal(false)}
          />,
          document.body
        )}
    </>
  );
}
