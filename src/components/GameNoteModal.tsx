import { useState, useEffect } from "react";

const WORTH_LABELS = [
  "Зря потратил время",
  "Скорее нет",
  "Нормально",
  "Скорее да",
  "Рад что попробовал",
] as const;

const VERDICTS = [
  { value: "finished", label: "Прошёл", icon: "✅" },
  { value: "playing", label: "Продолжаю", icon: "🎮" },
  { value: "dropped", label: "Бросил", icon: "❌" },
  { value: "later", label: "Вернусь позже", icon: "⏸️" },
] as const;

type Verdict = (typeof VERDICTS)[number]["value"];
type Tier = "S" | "A" | "B" | "C" | "D" | "F";

const TIERS: { value: Tier; bg: string; text: string; hint: string }[] = [
  { value: "S", bg: "bg-yellow-500", text: "text-yellow-950", hint: "Шедевр" },
  { value: "A", bg: "bg-emerald-500", text: "text-emerald-950", hint: "Крутая" },
  { value: "B", bg: "bg-sky-500", text: "text-sky-950", hint: "Хорошая" },
  { value: "C", bg: "bg-orange-500", text: "text-orange-950", hint: "Сойдёт" },
  { value: "D", bg: "bg-red-500", text: "text-red-950", hint: "Не зашло" },
  { value: "F", bg: "bg-rose-800", text: "text-rose-100", hint: "Провал" },
];

interface Props {
  gameId: number;
  gameTitle: string;
  currentPlaytime: number;
  lastRecordedPlaytime: number;
  currentVerdict: string | null;
  currentRating: number | null;
  currentTier: string | null;
  onClose: () => void;
}

function formatPlaytime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`;
}

export default function GameNoteModal({
  gameId,
  gameTitle,
  currentPlaytime,
  lastRecordedPlaytime,
  currentVerdict,
  currentRating,
  currentTier,
  onClose,
}: Props) {
  const [note, setNote] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(
    (currentVerdict as Verdict) ?? null
  );
  const [rating, setRating] = useState(currentRating ?? 3);
  const [tier, setTier] = useState<Tier | null>((currentTier as Tier) ?? null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const verdictChanged = verdict !== currentVerdict;
  const ratingChanged = rating !== currentRating;
  const tierChanged = tier !== currentTier;
  const hasChanges = note.length >= 10 || verdictChanged || ratingChanged || tierChanged;

  const handleSubmit = async () => {
    if (note.length < 10) {
      setError("Заметка минимум 10 символов");
      return;
    }
    if (!hasChanges) {
      setError("Нечего сохранять");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = { gameId, text: note };
      if (verdictChanged) body.verdict = verdict;
      if (ratingChanged) body.rating = rating;
      if (tierChanged) body.tier = tier;

      const res = await fetch("/api/game-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
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

  const delta = currentPlaytime - lastRecordedPlaytime;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${
        visible ? "bg-black/80" : "bg-black/0"
      }`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-gray-900 p-8 transition-all duration-300 ${
          visible
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-95 opacity-0 translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-center">
          <span className="text-4xl">📝</span>
        </div>
        <h3 className="mb-1 text-center text-xl font-bold">Дополнить отзыв</h3>
        <p className="mb-2 text-center text-sm text-gray-400">{gameTitle}</p>
        <p className="mb-6 text-center text-xs text-gray-500">
          Наиграно {formatPlaytime(currentPlaytime)} — с последнего отзыва +{formatPlaytime(delta)}
        </p>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-gray-400">Продолжение отзыва</label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm focus:border-indigo-500 focus:outline-none transition"
            placeholder="Как изменились впечатления? Что нового открылось?"
          />
          {note.length > 0 && (
            <p className={`mt-1 text-xs ${note.length >= 10 ? "text-green-500" : "text-gray-500"}`}>
              {note.length}/10
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowUpdate(!showUpdate)}
          className="mb-4 flex w-full items-center justify-between rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-400 transition hover:border-gray-500"
        >
          <span>Обновить вердикт, оценку и тир</span>
          <svg
            className={`h-4 w-4 transition-transform ${showUpdate ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showUpdate && (
          <div className="mb-4 space-y-4 rounded-lg border border-gray-800 bg-gray-800/50 p-4">
            <div>
              <label className="mb-2 block text-sm text-gray-400">Вердикт</label>
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

            <div>
              <label className="mb-2 block text-sm text-gray-400">Тир</label>
              <div className="flex gap-2">
                {TIERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    title={t.hint}
                    onClick={() => setTier(tier === t.value ? null : t.value)}
                    className={`flex-1 rounded-lg py-2 text-center text-lg font-black transition ${
                      tier === t.value
                        ? `${t.bg} ${t.text}`
                        : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                    }`}
                  >
                    {t.value}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-400">Стоило ли времени?</label>
              <input
                type="range"
                min={1}
                max={5}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="mt-1 text-center text-lg font-bold">{WORTH_LABELS[rating - 1]}</div>
            </div>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading || !hasChanges}
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
