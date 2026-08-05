import { useState } from "react";
import { createPortal } from "react-dom";
import ImpressionSheet from "./ImpressionSheet";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t } from "../lib/strings";

interface Props {
  gameId: number;
  gameTitle: string;
  currentPlaytime: number;
  lastRecordedPlaytime: number;
  currentVerdict: string | null;
  currentRating: number | null;
  currentTier: string | null;
  locale?: Locale;
}

export default function AddGameNoteButton({
  gameId,
  gameTitle,
  currentPlaytime,
  lastRecordedPlaytime,
  currentVerdict,
  currentRating,
  currentTier,
  locale = DEFAULT_LOCALE,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const s = t(locale);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition hover:border-indigo-500 hover:text-indigo-300"
      >
        {s.pages.addNote}
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
            locale={locale}
            onClose={() => setShowModal(false)}
          />,
          document.body
        )}
    </>
  );
}
