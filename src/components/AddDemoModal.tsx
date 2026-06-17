import { useState, useEffect } from "react";

type TierValue = "S" | "A" | "B" | "C" | "D" | "F";
type VerdictValue = "finished" | "dropped" | "playing" | "later";

const TIERS: { value: TierValue; label: string; bg: string; text: string; hint: string }[] = [
  { value: "S", label: "S", bg: "bg-yellow-500", text: "text-yellow-950", hint: "Шедевр" },
  { value: "A", label: "A", bg: "bg-emerald-500", text: "text-emerald-950", hint: "Крутая" },
  { value: "B", label: "B", bg: "bg-sky-500", text: "text-sky-950", hint: "Хорошая" },
  { value: "C", label: "C", bg: "bg-orange-500", text: "text-orange-950", hint: "Сойдёт" },
  { value: "D", label: "D", bg: "bg-red-500", text: "text-red-950", hint: "Не зашло" },
  { value: "F", label: "F", bg: "bg-rose-800", text: "text-rose-100", hint: "Провал" },
];

const VERDICTS: { value: VerdictValue; label: string; icon: string }[] = [
  { value: "finished", label: "Прошёл", icon: "✅" },
  { value: "playing", label: "Жду релиз", icon: "🎮" },
  { value: "dropped", label: "Не зашло", icon: "❌" },
  { value: "later", label: "Под вопросом", icon: "⏸️" },
];

const WORTH_LABELS = [
  "Зря потратил время",
  "Скорее нет",
  "Нормально",
  "Скорее да",
  "Рад что попробовал",
] as const;

const MIN_NOTE = 10;

interface Props {
  onClose: () => void;
}

export default function AddDemoModal({ onClose }: Props) {
  const [appIdOrUrl, setAppIdOrUrl] = useState("");
  const [verdict, setVerdict] = useState<VerdictValue | null>(null);
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

  const handleSubmit = async () => {
    if (!appIdOrUrl.trim()) {
      setError("Укажи appid или ссылку на демку");
      return;
    }
    if (note.length < MIN_NOTE) {
      setError(`Заметка минимум ${MIN_NOTE} символов (сейчас ${note.length})`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/demo-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appIdOrUrl, verdict, tier, rating, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }
      setVisible(false);
      setTimeout(() => window.location.reload(), 200);
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
        className={`max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-gray-900 p-6 transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-bold">Отзыв на демку</h3>
        <p className="mb-5 text-xs text-gray-500">
          Вставь Steam appid или ссылку на страницу демки — название и обложка
          подтянутся автоматически.
        </p>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Steam appid или ссылка</label>
          <input
            type="text"
            value={appIdOrUrl}
            onChange={(e) => setAppIdOrUrl(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm focus:border-indigo-500 focus:outline-none transition"
            placeholder="2861690 или https://store.steampowered.com/app/..."
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">
            Вердикт <span className="text-gray-600">(необязательно)</span>
          </label>
          <div className="flex gap-2">
            {VERDICTS.map((v) => (
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
          <label className="mb-2 block text-sm text-gray-400">
            Тир <span className="text-gray-600">(необязательно)</span>
          </label>
          <div className="flex gap-2">
            {TIERS.map((t) => (
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
            {WORTH_LABELS[rating - 1]}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Впечатление</label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm focus:border-indigo-500 focus:outline-none transition"
            placeholder="Что зашло, что нет, ждёшь ли релиз?"
          />
          <p
            className={`mt-1 text-xs ${
              note.length >= MIN_NOTE ? "text-green-500" : "text-gray-500"
            }`}
          >
            {note.length}/{MIN_NOTE}
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
