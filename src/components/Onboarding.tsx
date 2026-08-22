import { useState, type ReactNode } from "react";
import LlmKeyForm, { type ProviderMeta } from "./LlmKeyForm";
import Reveal from "./Reveal";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t, type Dict } from "../lib/strings";
import { THRESHOLDS } from "../lib/vocab";
import type { ProviderId } from "../lib/llm/types";

/**
 * The way into the product: library → reviews → key → done.
 *
 * The library and something written about it are what the app is made of, so
 * they come first and they are required. The key comes last and is not: without
 * one the picks are worked out from genres, and asking for somebody else's API
 * key before showing a single pick loses the people who would have fetched one
 * afterwards.
 *
 * One island for all four steps rather than four pages: each step calls its own
 * route and shows the result right away, and people move back and forth between
 * the steps — a reload on every transition would only get in the way here.
 *
 * Whether a step is done is derived from facts on the server (the key, the size
 * of the library, the number of reviews) and not from "pressed the button": a
 * person may have done all of it by hand earlier, and making them repeat it
 * would be lying to them about their own state.
 */

interface Props {
  providers: ProviderMeta[];
  llm: { provider: ProviderId | null; model: string | null; keyMask: string | null };
  libraryCount: number;
  reviewCount: number;
  locale?: Locale;
  /** Prompts on the dashboard lead to a specific step, not "somewhere in setup". */
  initialStep?: StepId | null;
}

export type StepId = "key" | "library" | "reviews" | "ready";

export default function Onboarding({
  providers,
  llm,
  libraryCount,
  reviewCount,
  locale = DEFAULT_LOCALE,
  initialStep = null,
}: Props) {
  const s = t(locale);
  const need = THRESHOLDS.MIN_REVIEWS_TO_RUN;

  /*
   * The tail of the key only ever comes from the server: the form doesn't hand
   * it back, and after a save the parent knows nothing but the fact itself. So
   * the fact and the tail are two separate states, not one state with a made-up
   * placeholder.
   */
  const [hasKey, setHasKey] = useState(llm.keyMask !== null);
  const [library, setLibrary] = useState(libraryCount);
  const [reviews, setReviews] = useState(reviewCount);

  const [busy, setBusy] = useState<StepId | "finish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);

  const done: Record<StepId, boolean> = {
    key: hasKey,
    library: library > 0,
    reviews: reviews >= need,
    ready: false,
  };

  const order: StepId[] = ["library", "reviews", "key", "ready"];
  // Otherwise open on the first unfinished step: no point scrolling past what's done
  const [step, setStep] = useState<StepId>(
    initialStep ?? order.find((id) => id !== "ready" && !done[id]) ?? "ready"
  );

  const index = order.indexOf(step);

  async function syncLibrary() {
    setBusy("library");
    setError(null);
    try {
      const res = await fetch("/api/sync-library", { method: "POST" });
      if (!res.ok) {
        setError(s.onboarding.libraryFailed);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const synced = Number(data.synced ?? 0);
      // Zero games from Steam means a private profile, not an empty library
      if (synced === 0) setError(s.onboarding.libraryFailed);
      else setLibrary(synced);
    } catch {
      setError(s.errors.network);
    } finally {
      setBusy(null);
    }
  }

  async function importReviews() {
    setBusy("reviews");
    setError(null);
    setImportNote(null);
    try {
      const res = await fetch("/api/import-steam-reviews", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? s.errors.generic);
        return;
      }
      const imported = Number(data.imported ?? 0);
      setReviews((current) => current + imported);
      setImportNote(imported > 0 ? s.recap.imported(imported) : s.onboarding.reviewsImportNone);
    } catch {
      setError(s.errors.network);
    } finally {
      setBusy(null);
    }
  }

  /** Both "skip" and "done" stamp the same date: see api/onboarding.ts. */
  async function leave() {
    setBusy("finish");
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch {
      // It didn't get recorded — no reason to keep the person on this screen
    }
    window.location.href = "/dashboard";
  }

  const gaps = order
    .filter((id) => id !== "ready" && id !== "key" && !done[id])
    .map((id) => LABELS[id](s));

  return (
    <div>
      <Progress order={order} done={done} step={step} onGo={setStep} s={s} />

      <Reveal key={step} className="mt-8">
        {step === "key" && (
          <Card title={s.onboarding.keyTitle} text={s.onboarding.keyText}>
            {llm.keyMask && <DoneLine text={s.onboarding.keyDone(llm.keyMask)} />}
            <div className="mt-4">
              <LlmKeyForm
                providers={providers}
                current={llm}
                locale={locale}
                onSaved={() => {
                  setHasKey(true);
                  setStep("ready");
                }}
              />
            </div>
          </Card>
        )}

        {step === "library" && (
          <Card title={s.onboarding.libraryTitle} text={s.onboarding.libraryText}>
            {done.library ? (
              <DoneLine text={s.onboarding.libraryDone(library)} />
            ) : (
              <button
                type="button"
                onClick={syncLibrary}
                disabled={busy === "library"}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {busy === "library" ? s.onboarding.libraryBusy : s.onboarding.libraryCta}
              </button>
            )}
          </Card>
        )}

        {step === "reviews" && (
          <Card title={s.onboarding.reviewsTitle} text={s.onboarding.reviewsText(need)}>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-700"
                  style={{ width: `${Math.min(100, (reviews / need) * 100)}%` }}
                />
              </div>
              <span className="text-sm text-gray-500">{s.onboarding.reviewsProgress(reviews, need)}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {done.reviews ? s.onboarding.reviewsEnough : s.onboarding.reviewsLeft(need - reviews)}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                <button
                  type="button"
                  onClick={importReviews}
                  disabled={busy === "reviews"}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  {busy === "reviews" ? s.onboarding.reviewsImportBusy : s.onboarding.reviewsImport}
                </button>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  {s.onboarding.reviewsImportHint}
                </p>
                {importNote && <p className="mt-2 text-xs text-emerald-400">{importNote}</p>}
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                <a
                  href="/dashboard?zone=now"
                  className="inline-block rounded-lg border border-gray-700 px-4 py-2 text-sm transition hover:border-emerald-600 hover:text-emerald-300"
                >
                  {s.onboarding.reviewsManual}
                </a>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  {s.onboarding.reviewsManualHint}
                </p>
              </div>
            </div>
          </Card>
        )}

        {step === "ready" && (
          <Card title={s.onboarding.readyTitle} text={s.onboarding.readyText}>
            {!hasKey && (
              <div className="mb-4 rounded-xl border border-sky-900/60 bg-sky-950/20 px-4 py-3 text-sm leading-relaxed text-sky-200/80">
                {s.onboarding.readyNoKey}
              </div>
            )}
            {gaps.length > 0 && (
              <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3">
                <p className="text-sm text-amber-200/90">{s.onboarding.readyGaps}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-amber-200/70">
                  {gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-200/50">{s.onboarding.readyGapsHint}</p>
              </div>
            )}
            <button
              type="button"
              onClick={leave}
              disabled={busy === "finish"}
              className="mt-6 rounded-xl bg-white px-7 py-3.5 font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
            >
              {busy === "finish" ? s.onboarding.finishing : s.onboarding.finish}
            </button>
          </Card>
        )}
      </Reveal>

      {error && (
        <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-gray-800 pt-4 text-sm">
        <button
          type="button"
          onClick={() => setStep(order[index - 1]!)}
          disabled={index === 0}
          className="text-gray-500 transition hover:text-gray-300 disabled:invisible"
        >
          &larr; {s.onboarding.back}
        </button>

        <div className="flex items-center gap-5">
          {/* On the final step "skip" would duplicate the "open the app" button */}
          {step !== "ready" && (
            <button
              type="button"
              onClick={leave}
              disabled={busy === "finish"}
              className="text-gray-600 transition hover:text-gray-400"
            >
              {s.onboarding.skip}
            </button>
          )}
          {index < order.length - 1 && (
            <button
              type="button"
              onClick={() => setStep(order[index + 1]!)}
              className="rounded-lg border border-gray-700 px-4 py-2 transition hover:border-emerald-600 hover:text-emerald-300"
            >
              {s.onboarding.next} &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Full step titles — for the card heading and the list of leftovers on the last step. */
const LABELS: Record<StepId, (s: Dict) => string> = {
  key: (s) => s.onboarding.keyTitle,
  library: (s) => s.onboarding.libraryTitle,
  reviews: (s) => s.onboarding.reviewsTitle,
  ready: (s) => s.onboarding.readyTitle,
};

/** One word per pill: the full title is the card heading directly underneath. */
const SHORT: Record<StepId, (s: Dict) => string> = {
  key: (s) => s.onboarding.keyShort,
  library: (s) => s.onboarding.libraryShort,
  reviews: (s) => s.onboarding.reviewsShort,
  ready: (s) => s.onboarding.doneShort,
};

/*
 * The pills are the only progress indicator: they show both where you are and
 * what is already closed, so a separate "step 2 of 4" line above them said
 * strictly less than what was drawn right underneath.
 *
 * Sized by their content and allowed to wrap rather than laid out four to a row:
 * an equal-width grid is what forced the captions to be cut off in the first
 * place, and on a narrow screen four of them do not fit at any caption length.
 */
function Progress({
  order,
  done,
  step,
  onGo,
  s,
}: {
  order: StepId[];
  done: Record<StepId, boolean>;
  step: StepId;
  onGo: (id: StepId) => void;
  s: Dict;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {order.map((id) => {
        const active = id === step;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onGo(id)}
              aria-current={active ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition ${
                active
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                  : "border-gray-800 text-gray-400 hover:border-gray-700"
              }`}
            >
              {done[id] && (
                <span aria-hidden="true" className="text-emerald-400">
                  ✓
                </span>
              )}
              {SHORT[id](s)}
              {done[id] && <span className="sr-only"> — {s.onboarding.stepDone}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Card({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
      <h2 className="text-xl font-semibold text-gray-100">{title}</h2>
      <p className="mt-2 mb-5 text-sm leading-relaxed text-gray-400">{text}</p>
      {children}
    </div>
  );
}

function DoneLine({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
      ✓ {text}
    </p>
  );
}
