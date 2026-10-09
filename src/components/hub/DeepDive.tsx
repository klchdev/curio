import { useEffect, useState } from "react";
import Reveal from "../Reveal";
import RichText from "../RichText";
import CurioMark from "../CurioMark";
import type { Dict } from "../../lib/strings";

/*
 * The deep dive's view: shared by the picks and the finder chat, which show
 * the same analysis of the same game and must not drift apart.
 */

export interface DeepDive {
  fit: "yes" | "maybe" | "no";
  tier?: string | null;
  summary: string;
  forYou: string;
  against: string;
  complaints: string[];
  reviewsUsed?: number;
}

export const FIT_STYLE: Record<DeepDive["fit"], string> = {
  yes: "border-emerald-800 bg-emerald-950/20 text-emerald-300",
  maybe: "border-amber-900/70 bg-amber-950/20 text-amber-300",
  no: "border-red-900 bg-red-950/20 text-red-300",
};

/**
 * A dive takes about ten seconds, and for all that time the screen used not to
 * change at all. The stages here aren't invented: first two requests to Steam
 * for reviews, then the model, so the caption switches on time rather than at
 * random.
 */
export function DeepDiveLoading({ s }: { s: Dict }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const stage =
    elapsed < 3 ? s.deep.stageFetch : elapsed < 9 ? s.deep.stageRead : s.deep.stageConclude;

  return (
    <Reveal className="mt-8" from="up">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
          <span className="text-sm text-gray-300">{stage}</span>
          <span className="ml-auto text-xs tabular-nums text-gray-600">
            {s.choose.runElapsed(elapsed)}
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((block) => (
            <div key={block} className="space-y-2">
              <div className="h-2 w-28 animate-pulse rounded bg-gray-800" />
              <div className="h-3 animate-pulse rounded bg-gray-800/70" style={{ animationDelay: `${block * 120}ms` }} />
              <div className="h-3 w-11/12 animate-pulse rounded bg-gray-800/70" style={{ animationDelay: `${block * 120 + 60}ms` }} />
              <div className="h-3 w-8/12 animate-pulse rounded bg-gray-800/70" style={{ animationDelay: `${block * 120 + 120}ms` }} />
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export function DeepDivePanel({
  value,
  s,
  onRefresh,
  onTake,
  taking,
  slotsLeft,
  onReview,
  reviewLabel,
}: {
  value: DeepDive | string;
  s: Dict;
  onRefresh: () => void;
  /** The dive often is the decision — getting from it to a contract must not cross a screen. */
  onTake?: () => void;
  taking?: boolean;
  slotsLeft?: number;
  /** Plenty of playtime already — a contract is pointless, a review is what's needed. */
  onReview?: () => void;
  reviewLabel?: string;
}) {
  if (typeof value === "string") {
    return (
      <Reveal className="mt-8">
        <p className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {value}
        </p>
      </Reveal>
    );
  }

  const fitLabel =
    value.fit === "yes" ? s.deep.fitYes : value.fit === "no" ? s.deep.fitNo : s.deep.fitMaybe;

  return (
    <Reveal className="mt-8" from="up">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <CurioMark className="h-5 w-5 text-gray-700" />
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${FIT_STYLE[value.fit]}`}>
            {fitLabel}
          </span>
          {value.reviewsUsed ? (
            <span className="text-xs text-gray-600">{s.deep.used(value.reviewsUsed)}</span>
          ) : null}
          <button
            onClick={onRefresh}
            className="ml-auto text-xs text-gray-600 transition hover:text-gray-300"
          >
            {s.deep.refresh}
          </button>
          {onReview && (
            <button
              onClick={onReview}
              className="rounded-lg border border-gray-700 px-4 py-1.5 text-sm transition hover:border-emerald-600 hover:text-emerald-300"
            >
              {reviewLabel}
            </button>
          )}
          {onTake && (
            <button
              onClick={onTake}
              disabled={taking || slotsLeft === 0}
              title={slotsLeft === 0 ? s.choose.slotsFull : undefined}
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
            >
              {taking ? s.choose.taking : s.choose.take}
            </button>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title={s.deep.summary} text={value.summary} />
          <Section title={s.deep.forYou} text={value.forYou} accent="text-emerald-400" />
          <Section title={s.deep.against} text={value.against} accent="text-amber-400" />

          {value.complaints.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs tracking-[0.15em] text-gray-500 uppercase">
                {s.deep.complaints}
              </h3>
              <ul className="space-y-1">
                {value.complaints.map((item, i) => (
                  <li key={i} className="text-sm leading-relaxed text-gray-400">
                    — <RichText text={item} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Reveal>
  );
}

export function Section({ title, text, accent }: { title: string; text: string; accent?: string }) {
  if (!text) return null;
  return (
    <div>
      <h3 className={`mb-1.5 text-xs tracking-[0.15em] uppercase ${accent ?? "text-gray-500"}`}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-gray-300">
        <RichText text={text} />
      </p>
    </div>
  );
}
