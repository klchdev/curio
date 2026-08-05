import { useState, useEffect } from "react";
import { formatPlaytime, tiers, verdicts, worthLabels } from "../lib/vocab";

type TierValue = "S" | "A" | "B" | "C" | "D" | "F";
type VerdictValue = "finished" | "dropped" | "playing" | "later";





interface Props {
  gameId: number;
  gameTitle: string;
  gameImage: string | null;
  currentPlaytime: number;
  onClose: () => void;
  onSaved: () => void;
  existingVerdict?: string | null;
  existingRating?: number | null;
  existingNote?: string | null;
  existingTier?: string | null;
  playtimeAtReview?: number;
}

export default function RetroReviewModal({
  gameId,
  gameTitle,
  gameImage,
  currentPlaytime,
  onClose,
  onSaved,
  existingVerdict,
  existingRating,
  existingNote,
  existingTier,
  playtimeAtReview,
}: Props) {
  const [verdict, setVerdict] = useState<VerdictValue | null>(
    (existingVerdict as VerdictValue) ?? null
  );
  const [tier, setTier] = useState<TierValue | null>(
    (existingTier as TierValue) ?? null
  );
  const [rating, setRating] = useState(existingRating ?? 3);
  const [note, setNote] = useState(existingNote ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const delta =
    playtimeAtReview !== undefined ? currentPlaytime - playtimeAtReview : null;

  const handleSubmit = async () => {
    if (!verdict) {
      setError("Выбери вердикт");
      return;
    }
    if (note.length < 50) {
      setError(`Заметка минимум 50 символов (сейчас ${note.length})`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/retrospective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          verdict,
          tier,
          rating,
          note,
          playtimeMinutes: currentPlaytime,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setVisible(false);
      setTimeout(onSaved, 200);
    } catch {
      setError("Ошибка сети");
      setLoading(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${
        visible ? "bg-black/80" : "bg-black/0"
      }`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-gray-900 p-6 transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-3">
          {gameImage && (
            <img src={gameImage} alt="" className="h-12 w-24 rounded object-cover" />
          )}
          <div>
            <h3 className="font-bold">{gameTitle}</h3>
            <p className="text-xs text-gray-500">
              Наиграно: {formatPlaytime(currentPlaytime)}
              {delta !== null && delta > 0 && (
                <span className="ml-2 text-indigo-400">
                  (+{formatPlaytime(delta)} с отзыва)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Вердикт</label>
          <div className="flex gap-2">
            {verdicts().map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVerdict(verdict === v.value ? null : v.value)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  verdict === v.value
                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                    : "border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Тир</label>
          <div className="flex gap-2">
            {tiers().map((t) => (
              <button
                key={t.value}
                title={t.hint}
                onClick={() => setTier(tier === t.value ? null : t.value)}
                className={`flex-1 rounded-lg py-2 text-center text-lg font-black transition ${
                  tier === t.value
                    ? `${t.bg} ${t.text}`
                    : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Стоило ли времени?</label>
          <input
            type="range"
            min={1}
            max={5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="mt-1 text-center text-sm font-medium">
            {worthLabels()[rating - 1]}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Заметка</label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm focus:border-indigo-500 focus:outline-none transition"
            placeholder="Что думаешь об игре? Минимум 50 символов."
          />
          <p
            className={`mt-1 text-xs ${
              note.length >= 50 ? "text-green-500" : "text-gray-500"
            }`}
          >
            {note.length}/50
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 font-medium transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Сохранение..." : "Сохранить"}
          </button>
          <button
            onClick={handleClose}
            className="rounded-lg border border-gray-700 px-4 py-3 transition hover:bg-gray-800"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
