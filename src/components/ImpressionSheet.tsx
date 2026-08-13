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
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t } from "../lib/strings";
import Celebration from "./Celebration";
import CurioMark from "./CurioMark";
import RichText from "./RichText";

/** Вердикты, после которых отзыв считается закрытым. */
const CLOSING_VERDICTS = new Set(["finished", "dropped", "endless"]);

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
  locale?: Locale;
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
  locale = DEFAULT_LOCALE,
  onClose,
  onSaved,
}: Props) {
  const rule = SHEET_RULES[mode];
  const s = t(locale);

  const [note, setNote] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>((currentVerdict as Verdict) ?? null);
  const [rating, setRating] = useState(currentRating ?? 3);
  const [tier, setTier] = useState<Tier | null>((currentTier as Tier) ?? null);
  const [appIdOrUrl, setAppIdOrUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState("");

  /*
   * Свои же прошлые слова об этой игре и расхождение оценки с тоном последних
   * записей. И то и другое — про уже написанное, поэтому подтягивается один
   * раз при открытии и ничего не блокирует: не ответил сервер — лист работает
   * как раньше.
   */
  const [quotes, setQuotes] = useState<Array<{ playtimeMinutes: number; text: string }>>([]);
  const [drift, setDrift] = useState<{ rating: number; suggested: number; entries: number } | null>(
    null
  );
  const [questions, setQuestions] = useState<string[]>([]);
  const [take, setTake] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (!gameId || mode === "demo" || mode === "slot-first") return;

    let alive = true;
    fetch(`/api/entry-context?gameId=${gameId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setQuotes(data.quotes ?? []);
        setDrift(data.drift ?? null);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [gameId, mode]);

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
      setError(s.sheet.minChars(rule.minNote));
      return;
    }
    if (note.length > 0 && !hasNote) {
      setError(s.sheet.minChars(rule.minNote));
      return;
    }
    if (rule.verdictRequired && !verdict) {
      setError(s.sheet.pickVerdict);
      return;
    }
    if (!canSubmit) {
      setError(s.sheet.nothingToSave);
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
        setError(data.error ?? s.errors.saveFailed);
        return;
      }

      /*
       * Закрыли игру — самое время спросить про то, чего в отзыве нет: она
       * ещё в голове. Вопросы приходят из фона, и если их нет или модель не
       * ответила, лист просто закрывается, как раньше.
       */
      if (gameId && verdict && CLOSING_VERDICTS.has(verdict)) {
        const closing = await fetch("/api/entry-closing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null);

        if (closing?.take || closing?.questions?.length) {
          setTake(closing.take ?? "");
          setQuestions(closing.questions ?? []);
          setLoading(false);
          return;
        }
      }

      if (rule.celebrate) {
        setCelebrating(true);
        return;
      }
      finish();
    } catch {
      setError(s.errors.network);
    } finally {
      setLoading(false);
    }
  }

  /** Ответ на вопрос — обычная запись дневника, только с вопросом рядом. */
  async function submitAnswer(question: string) {
    const text = answer.trim();
    if (text.length < rule.minNote) return;

    setLoading(true);
    try {
      await fetch("/api/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "entry", gameId, note: text, promptedBy: question }),
      });
      setQuestions((rest) => rest.filter((item) => item !== question));
      setAnswering(null);
      setAnswer("");
    } catch {
      setError(s.errors.network);
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
              {rule.title[locale]}
            </p>
            <h2 className="mt-1 text-xl font-bold">{gameTitle}</h2>
            {currentPlaytime > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                {s.sheet.played(formatPlaytime(currentPlaytime, locale))}
                {delta != null && delta > 0 && (
                  <span className="text-indigo-400">
                    {s.sheet.sinceLast(formatPlaytime(delta, locale))}
                  </span>
                )}
              </p>
            )}
          </header>

          {gameImage && (
            <img src={gameImage} alt="" className="header-art mb-5 w-full rounded-xl" />
          )}

          {take || questions.length > 0 ? (
            <div className="space-y-3">
              {take && (
                <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs text-indigo-300/70">
                    <CurioMark className="h-3.5 w-3.5" />
                    {s.sheet.takeLede}
                  </p>
                  <p className="text-sm leading-relaxed text-gray-200">
                    <RichText text={take} />
                  </p>
                </div>
              )}

              {questions.length > 0 && (
                <p className="pt-1 text-sm text-gray-400">{s.sheet.questionsLede}</p>
              )}

              {questions.map((question) => (
                <div key={question} className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                  <p className="text-sm leading-relaxed text-gray-200">{question}</p>

                  {answering === question ? (
                    <div className="mt-2">
                      <textarea
                        autoFocus
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => submitAnswer(question)}
                          disabled={loading || answer.trim().length < rule.minNote}
                          className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black transition disabled:opacity-40"
                        >
                          {s.sheet.answerSave}
                        </button>
                        <button
                          onClick={() => {
                            setAnswering(null);
                            setAnswer("");
                          }}
                          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:text-gray-300"
                        >
                          {s.sheet.answerSkip}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAnswering(question)}
                      className="mt-2 text-xs text-gray-500 transition hover:text-gray-300"
                    >
                      {s.sheet.answerOpen}
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={() => (rule.celebrate ? setCelebrating(true) : finish())}
                className="w-full rounded-lg border border-gray-800 py-2 text-sm text-gray-400 transition hover:bg-gray-900"
              >
                {s.sheet.questionsDone}
              </button>
            </div>
          ) : (
          <>

          {rule.showAppIdInput && (
            <label className="mb-5 block">
              <span className="mb-1.5 block text-sm text-gray-400">{s.sheet.appId}</span>
              <input
                value={appIdOrUrl}
                onChange={(event) => setAppIdOrUrl(event.target.value)}
                placeholder="2861690 или https://store.steampowered.com/app/..."
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none focus:border-gray-500"
              />
            </label>
          )}

          {quotes.length > 1 && (
            /*
             * Не черновик, а свои же слова со штампом времени: финал перестаёт
             * писаться по памяти и дублировать сказанное в середине. Готовых
             * формулировок тут нет намеренно — текст должен остаться его.
             */
            <div className="mb-5 rounded-xl border border-gray-800/70 bg-gray-900/30 p-3">
              <p className="mb-2 text-xs text-gray-500">{s.sheet.quotesLede}</p>
              <ol className="space-y-1.5">
                {quotes.map((quote, index) => (
                  <li key={index} className="text-xs leading-relaxed text-gray-400">
                    <span className="text-gray-600">
                      [{formatPlaytime(quote.playtimeMinutes, locale)}]
                    </span>{" "}
                    {quote.text}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="mb-5">
            <span className="mb-2 block text-sm text-gray-400">
              {s.sheet.verdict}
              {rule.verdictRequired ? "" : s.sheet.verdictOptional}
            </span>
            <div className="flex flex-wrap gap-2">
              {verdicts(locale, { demo: rule.demoLabels }).map((option) => (
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
              <span className="mb-2 block text-sm text-gray-400">{s.sheet.worth}</span>
              <div className="flex gap-1.5">
                {worthLabels(locale).map((label, index) => (
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
                {worthLabels(locale)[rating - 1]}
              </p>

              {drift && rating === drift.rating && (
                /*
                 * Не баннер и не модалка: строка под самой оценкой, в момент,
                 * когда человек и так решает, что ставить. Один тап — и она
                 * исчезает вместе с вопросом.
                 */
                <p className="mt-2 text-xs leading-relaxed text-amber-300/70">
                  {s.sheet.driftHint(drift.rating, drift.suggested, drift.entries)}{" "}
                  <button
                    onClick={() => setRating(drift.suggested)}
                    className="text-amber-200 underline underline-offset-2 transition hover:text-amber-100"
                  >
                    {s.sheet.driftApply(drift.suggested)}
                  </button>
                </p>
              )}
            </div>
          )}

          {rule.showTier && (
            <div className="mb-5">
              <span className="mb-2 block text-sm text-gray-400">{s.sheet.tier}</span>
              <div className="flex flex-wrap gap-1.5">
                {tiers(locale).map((option) => (
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
              <span>
                {s.sheet.impression}
                {rule.noteRequired ? "" : s.sheet.optional}
              </span>
              <span className={note.length >= rule.minNote ? "text-emerald-500" : "text-gray-600"}>
                {note.length} / {rule.minNote}
              </span>
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              placeholder={s.sheet.notePlaceholder}
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
              {loading ? s.sheet.saving : rule.submit[locale]}
            </button>
            <button
              onClick={close}
              className="rounded-xl border border-gray-700 px-5 py-3 text-gray-400 transition hover:bg-gray-800"
            >
              {s.sheet.cancel}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </>
  );
}
