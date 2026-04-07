import { useState } from "react";

interface Props {
  slotId: number;
  onClose: () => void;
}

export default function CompleteModal({ slotId, onClose }: Props) {
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (note.length < 50) {
      setError("Заметка минимум 50 символов");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, rating, note }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      location.reload();
    } catch {
      setError("Ошибка сети");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-6 text-xl font-bold">Завершить игру</h3>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Оценка (1-10)</label>
          <input
            type="range"
            min={1}
            max={10}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="mt-1 text-center text-2xl font-bold">{rating}</div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Заметка (мин. 50 символов)</label>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm"
            placeholder="Что понравилось? Что нет? Прошёл до конца?"
          />
          <p className="mt-1 text-xs text-gray-500">{note.length}/50</p>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-lg bg-green-700 px-4 py-3 font-medium transition hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? "Сохранение..." : "Завершить игру"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-4 py-3 transition hover:bg-gray-800"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
