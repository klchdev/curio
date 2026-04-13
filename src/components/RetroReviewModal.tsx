import { useState, useEffect } from "react";

type TierValue = "S" | "A" | "B" | "C" | "D";

const TIERS: { value: TierValue; label: string; bg: string; text: string }[] = [
  { value: "S", label: "S", bg: "bg-yellow-500", text: "text-yellow-950" },
  { value: "A", label: "A", bg: "bg-emerald-500", text: "text-emerald-950" },
  { value: "B", label: "B", bg: "bg-sky-500", text: "text-sky-950" },
  { value: "C", label: "C", bg: "bg-orange-500", text: "text-orange-950" },
  { value: "D", label: "D", bg: "bg-red-500", text: "text-red-950" },
];

const WORTH_LABELS = [
  "Зря потратил время",
  "Скорее нет",
  "Нормально",
  "Скорее да",
  "Рад что попробовал",
] as const;

interface Props {
  gameId: number;
  gameTitle: string;
  gameImage: string | null;
  playtimeMinutes: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function RetroReviewModal({ gameId, gameTitle, gameImage, playtimeMinutes, onClose, onSaved }: Props) {
  const [tier, setTier] = useState<TierValue | null>(null);
  const [rating, setRating] = useState(3);
  const [note, setNote] = useState("");
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

  const hours = Math.floor(playtimeMinutes / 60);
  const mins = playtimeMinutes % 60;
  const playtimeStr = hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`;

  const handleSubmit = async () => {
    if (!tier && !note && rating === 3) {
      setError("Выбери хотя бы тир или напиши заметку");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/retrospective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, tier, rating, note: note || null }),
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
        {/* Game header */}
        <div className="mb-5 flex items-center gap-3">
          {gameImage && (
            <img src={gameImage} alt="" className="h-12 w-24 rounded object-cover" />
          )}
          <div>
            <h3 className="font-bold">{gameTitle}</h3>
            <p className="text-xs text-gray-500">Наиграно: {playtimeStr}</p>
          </div>
        </div>

        {/* Tier */}
        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Тир</label>
          <div className="flex gap-2">
            {TIERS.map((t) => (
              <button
                key={t.value}
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

        {/* Rating */}
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
          <div className="mt-1 text-center text-sm font-medium">{WORTH_LABELS[rating - 1]}</div>
        </div>

        {/* Note */}
        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Заметка (необязательно)</label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm focus:border-indigo-500 focus:outline-none transition"
            placeholder="Что помнишь об этой игре?"
          />
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
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
