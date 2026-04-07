import { useState } from "react";

interface Props {
  slotId: number;
  onClose: () => void;
}

const LEGITIMATE_REASONS = [
  "Это не игра / демка",
  "Не запускается",
  "Уже не в библиотеке",
];

export default function SkipModal({ slotId, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    let reason = selected;
    if (!reason) {
      setError("Выбери причину");
      return;
    }
    if (reason === "custom") {
      if (!customText.trim()) {
        setError("Напиши причину");
        return;
      }
      reason = customText;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, reason }),
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
        <h3 className="mb-6 text-xl font-bold">Пропустить игру</h3>

        <div className="mb-4 space-y-2">
          <p className="mb-3 text-sm text-gray-400">Легитимные причины (нейтрально):</p>
          {LEGITIMATE_REASONS.map((reason) => (
            <label
              key={reason}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-700 p-3 transition hover:bg-gray-800"
            >
              <input
                type="radio"
                name="skip-reason"
                value={reason}
                checked={selected === reason}
                onChange={() => setSelected(reason)}
                className="accent-indigo-500"
              />
              <span>{reason}</span>
            </label>
          ))}

          <div className="my-3 border-t border-gray-700" />
          <p className="mb-3 text-sm text-yellow-400">Другое (будет записано как &quot;Сдался&quot; 😔):</p>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-yellow-800/50 p-3 transition hover:bg-gray-800">
            <input
              type="radio"
              name="skip-reason"
              value="custom"
              checked={selected === "custom"}
              onChange={() => setSelected("custom")}
              className="accent-yellow-500"
            />
            <span>Другая причина</span>
          </label>
          {selected === "custom" && (
            <textarea
              rows={2}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm"
              placeholder="Почему сдаёшься?"
            />
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-lg bg-yellow-700 px-4 py-3 font-medium transition hover:bg-yellow-600 disabled:opacity-50"
          >
            {loading ? "..." : "Пропустить"}
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
