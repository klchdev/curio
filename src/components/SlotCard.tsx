import { useState } from "react";
import CompleteModal from "./CompleteModal";
import SkipModal from "./SkipModal";

interface Props {
  slotId: number;
  title: string;
  headerImage: string | null;
  hltbMinutes: number | null;
  startedAt: string;
  playedMinutes: number;
}

export default function SlotCard({
  slotId,
  title,
  headerImage,
  hltbMinutes,
  startedAt,
  playedMinutes: initialPlayed,
}: Props) {
  const [showComplete, setShowComplete] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [playedMinutes, setPlayedMinutes] = useState(initialPlayed);
  const [refreshing, setRefreshing] = useState(false);
  const canComplete = playedMinutes >= 30;

  const refreshPlaytime = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/refresh-playtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlayedMinutes(data.playedMinutes);
      }
    } catch { /* ignore */ }
    setRefreshing(false);
  };

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <img
          src={headerImage || ""}
          alt={title}
          className="h-36 w-full object-cover"
        />
        <div className="flex flex-1 flex-col p-4">
          <h3 className="mb-2 font-semibold">{title}</h3>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className={canComplete ? "text-green-400" : "text-yellow-400"}>
              Наиграно: {playedMinutes} мин
            </span>
            <button
              onClick={refreshPlaytime}
              disabled={refreshing}
              className="text-gray-500 transition hover:text-gray-300 disabled:animate-spin"
              title="Обновить playtime"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
            {hltbMinutes && (
              <span className="text-gray-500">
                / HLTB ~{Math.round(hltbMinutes / 60)}ч
              </span>
            )}
          </div>
          {!canComplete && (
            <div className="mb-2">
              <div className="h-1.5 w-full rounded-full bg-gray-700">
                <div
                  className="h-1.5 rounded-full bg-yellow-500 transition-all"
                  style={{ width: `${Math.min(100, Math.round((playedMinutes / 30) * 100))}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Минимум 30 мин для закрытия</p>
            </div>
          )}
          <p className="mb-3 text-xs text-gray-500">
            Начато: {new Date(startedAt).toLocaleDateString("ru")}
          </p>
          <div className="mt-auto flex gap-2">
            {canComplete ? (
              <button
                onClick={() => setShowComplete(true)}
                className="flex-1 rounded-lg bg-green-700 px-3 py-2 text-sm font-medium transition hover:bg-green-600"
              >
                Завершить
              </button>
            ) : (
              <>
                <button
                  disabled
                  className="flex-1 rounded-lg bg-green-900/50 px-3 py-2 text-sm font-medium text-green-800 cursor-not-allowed"
                >
                  Завершить
                </button>
                <button
                  onClick={() => setShowSkip(true)}
                  className="rounded-lg bg-gray-700 px-3 py-2 text-sm transition hover:bg-gray-600"
                  title="Пропустить"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showComplete && (
        <CompleteModal slotId={slotId} onClose={() => setShowComplete(false)} />
      )}
      {showSkip && (
        <SkipModal slotId={slotId} onClose={() => setShowSkip(false)} />
      )}
    </>
  );
}
