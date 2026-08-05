import { useEffect, useState } from "react";
import {
  SHEET_RULES,
  formatPlaytime,
  tiers,
  verdicts,
  worthLabels,
  WORTH_COLORS,
  type ImpressionMode,
  type Tier,
  type Verdict,
} from "../lib/vocab";
import Celebration from "./Celebration";

interface Props {
  mode: ImpressionMode;
  gameTitle: string;
  gameImage?: string | null;
  slotId?: number;
  gameId?: number;
  /** Абсолютное наигранное время; для слота — сколько прошло с начала контракта. */
  currentPlaytime?: number;
  lastRecordedPlaytime?: number;
  currentVerdict?: string | null;
  currentRating?: number | null;
  currentTier?: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Один лист вместо шести модалок. Режим не создаёт отдельную форму — он лишь
 * включает и выключает блоки по таблице SHEET_RULES, той же, по которой
 * проверяет сервер.
 */
export default function ImpressionSheet({
  mode,
  gameTitle,
  gameImage,
  slotId,
  gameId,
  currentPlaytime = 0,
  lastRecordedPlaytime,
  currentVerdict,
  currentRating,
  currentTier,
  onClose,
  onSaved,
}: Props) {
  const rule = SHEET_RULES[mode];

  const [note, setNote] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>((currentVerdict as Verdict) ?? null);
  const [rating, setRating] = useState(currentRating ?? 3);
  const [tier, setTier] = useState<Tier | null>((currentTier as Tier) ?? null);
  const [appIdOrUrl, setAppIdOrUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  const changed =
    verdict !== (currentVerdict ?? null) ||
    rating !== (currentRating ?? 3) ||
    tier !== (currentTier ?? null);
  const hasNote = note.trim().length >= rule.minNote;
  const canSubmit = rule.noteRequired ? hasNote : hasNote || changed;

  async function submit() {
    if (rule.noteRequired && !hasNote) {
      setError(`Заметка минимум ${rule.minNote} символов`);
      return;
    }
    if (note.length > 0 && !hasNote) {
      setError(`Заметка минимум ${rule.minNote} символов`);
      return;
    }
    if (rule.verdictRequired && !verdict) {
      setError("Выбери вердикт");
      return;
    }
    if (!canSubmit) {
      setError("Нечего сохранять");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          slotId,
          gameId,
          appIdOrUrl: rule.showAppIdInput ? appIdOrUrl : undefined,
          verdict,
          rating: rule.showRating ? rating : undefined,
          tier: rule.showTier ? tier : undefined,
          note: note.trim() || undefined,
          previous: { verdict: currentVerdict, rating: currentRating, tier: currentTier },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить");
        return;
      }

      if (rule.celebrate) {
        setCelebrating(true);
        return;
      }
      finish();
    } catch {
      setError("Сеть не отвечает");
    } finally {
      setLoading(false);
    }
  }

  function finish() {
    if (onSaved) {
      onSaved();
      return;
    }
    window.location.reload();
  }

  const delta =
    lastRecordedPlaytime != null ? Math.max(0, currentPlaytime - lastRecordedPlaytime) : null;

  return (
    <>
      {celebrating && <Celebration onDone={finish} />}

      <div
        className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 transition-opacity duration-200 sm:items-center sm:p-6 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className={`max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-gray-800 bg-gray-950 p-6 transition-all duration-200 sm:rounded-2xl ${
            visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <header className="mb-5">
            <p className="text-xs tracking-[0.15em] text-gray-500 uppercase">
              {rule.title.ru}
            </p>
            <h2 className="mt-1 text-xl font-bold">{gameTitle}</h2>
            {currentPlaytime > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                Наиграно {formatPlaytime(currentPlaytime)}
                {delta != null && delta > 0 && (
                  <span className="text-indigo-400"> · +{formatPlaytime(delta)} с прошлой записи</span>
                )}
              </p>
            )}
          </header>

          {gameImage && (
            <img src={gameImage} alt="" className="mb-5 h-28 w-full rounded-xl object-cover" />
          )}

          {rule.showAppIdInput && (
            <label className="mb-5 block">
              <span className="mb-1.5 block text-sm text-gray-400">Appid или ссылка на демку</span>
              <input
                value={appIdOrUrl}
                onChange={(event) => setAppIdOrUrl(event.target.value)}
                placeholder="2861690 или https://store.steampowered.com/app/..."
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none focus:border-gray-500"
              />
            </label>
          )}

          <div className="mb-5">
            <span className="mb-2 block text-sm text-gray-400">
              Вердикт{rule.verdictRequired ? "" : " (если изменился)"}
            </span>
            <div className="flex flex-wrap gap-2">
              {verdicts(undefined, { demo: rule.demoLabels }).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setVerdict(option.value)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    verdict === option.value
                      ? "border-gray-500 bg-gray-800 text-white"
                      : "border-gray-800 text-gray-400 hover:bg-gray-900"
                  }`}
                >
                  {option.icon} {option.label}
                </button>
              ))}
            </div>
          </div>

          {rule.showRating && (
            <div className="mb-5">
              <span className="mb-2 block text-sm text-gray-400">Стоило ли времени</span>
              <div className="flex gap-1.5">
                {worthLabels().map((label, index) => (
                  <button
                    key={label}
                    title={label}
                    onClick={() => setRating(index + 1)}
                    className={`h-9 flex-1 rounded-lg border text-xs transition ${
                      rating === index + 1
                        ? "border-gray-500 bg-gray-800"
                        : "border-gray-800 hover:bg-gray-900"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <p className={`mt-1.5 text-sm ${WORTH_COLORS[rating - 1]}`}>
                {worthLabels()[rating - 1]}
              </p>
            </div>
          )}

          {rule.showTier && (
            <div className="mb-5">
              <span className="mb-2 block text-sm text-gray-400">Тир</span>
              <div className="flex flex-wrap gap-1.5">
                {tiers().map((option) => (
                  <button
                    key={option.value}
                    title={option.hint}
                    onClick={() => setTier(tier === option.value ? null : option.value)}
                    className={`h-9 w-9 rounded-lg text-sm font-bold transition ${
                      tier === option.value
                        ? `${option.bg} ${option.text} scale-105`
                        : "border border-gray-800 text-gray-500 hover:bg-gray-900"
                    }`}
                  >
                    {option.value}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mb-5 block">
            <span className="mb-1.5 flex items-baseline justify-between text-sm text-gray-400">
              <span>Впечатление{rule.noteRequired ? "" : " (необязательно)"}</span>
              <span className={note.length >= rule.minNote ? "text-emerald-500" : "text-gray-600"}>
                {note.length} / {rule.minNote}
              </span>
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              placeholder="Что зацепило, что раздражает, вернёшься ли"
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm leading-relaxed outline-none focus:border-gray-500"
            />
          </label>

          {error && (
            <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={loading || !canSubmit}
              className="flex-1 rounded-xl bg-white py-3 font-medium text-gray-950 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Сохраняю…" : rule.submit.ru}
            </button>
            <button
              onClick={close}
              className="rounded-xl border border-gray-700 px-5 py-3 text-gray-400 transition hover:bg-gray-800"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
