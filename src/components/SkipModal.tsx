import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t } from "../lib/strings";

interface Props {
  slotId: number;
  gameTitle: string;
  freeSkips: number;
  locale?: Locale;
  onClose: () => void;
}

/**
 * The reason travels to the server as a code, not as text. The server used to
 * decide whether a skip was shameful by comparing against Russian strings —
 * translating the interface would have turned every legitimate reason into a
 * disgraceful one.
 */
export const SKIP_CODES = ["not-a-game", "wont-launch", "not-owned"] as const;
export type SkipCode = (typeof SKIP_CODES)[number] | "custom";

export default function SkipModal({
  slotId,
  gameTitle,
  freeSkips,
  locale = DEFAULT_LOCALE,
  onClose,
}: Props) {
  const s = t(locale);
  const [selected, setSelected] = useState<SkipCode | null>(null);
  const [customText, setCustomText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  const REASONS: { code: SkipCode; label: string }[] = [
    { code: "not-a-game", label: s.skip.notAGame },
    { code: "wont-launch", label: s.skip.wontLaunch },
    { code: "not-owned", label: s.skip.notOwned },
  ];

  async function send(body: Record<string, unknown>) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? s.errors.generic);
        setLoading(false);
        return;
      }
      location.reload();
    } catch {
      setError(s.errors.network);
      setLoading(false);
    }
  }

  function submit() {
    if (!selected) {
      setError(s.skip.pickReason);
      return;
    }
    if (selected === "custom" && !customText.trim()) {
      setError(s.skip.writeReason);
      return;
    }
    // The text is for the diary, the code is for deciding "shameful or not"
    const label = selected === "custom" ? customText.trim() : REASONS.find((r) => r.code === selected)!.label;
    send({ reasonCode: selected, reason: label });
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 transition-opacity duration-200 sm:items-center sm:p-6 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={close}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-gray-800 bg-gray-950 p-6 transition-all duration-200 sm:rounded-2xl ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
      >
        <header className="mb-5">
          <p className="text-xs tracking-[0.15em] text-gray-500 uppercase">{s.skip.title}</p>
          <h2 className="mt-1 text-xl font-bold">{gameTitle}</h2>
        </header>

        {freeSkips > 0 && (
          <div className="mb-5">
            <button
              onClick={() => send({ useFreeSkip: true })}
              disabled={loading}
              className="w-full rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-left transition hover:bg-emerald-950/60 disabled:opacity-40"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-emerald-300">{s.skip.freeSkip}</p>
                  <p className="text-sm text-emerald-400/70">{s.skip.freeSkipHint}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-bold text-emerald-300">
                  {s.skip.freeSkipCount(freeSkips)}
                </span>
              </div>
            </button>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-800" />
              <span className="text-xs text-gray-600">{s.skip.orReason}</span>
              <div className="h-px flex-1 bg-gray-800" />
            </div>
          </div>
        )}

        <p className="mb-2 text-sm text-gray-400">{s.skip.legitimate}</p>
        <div className="mb-4 space-y-2">
          {REASONS.map((reason) => (
            <label
              key={reason.code}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                selected === reason.code
                  ? "border-gray-500 bg-gray-900"
                  : "border-gray-800 hover:bg-gray-900/60"
              }`}
            >
              <input
                type="radio"
                name="skip-reason"
                checked={selected === reason.code}
                onChange={() => setSelected(reason.code)}
                className="accent-emerald-500"
              />
              <span>{reason.label}</span>
            </label>
          ))}

          <p className="pt-2 text-sm text-amber-400/90">{s.skip.shameHeading}</p>
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
              selected === "custom" ? "border-amber-700 bg-amber-950/30" : "border-amber-900/50 hover:bg-gray-900/60"
            }`}
          >
            <input
              type="radio"
              name="skip-reason"
              checked={selected === "custom"}
              onChange={() => setSelected("custom")}
              className="accent-amber-500"
            />
            <span>{s.skip.other}</span>
          </label>
          {selected === "custom" && (
            <textarea
              rows={2}
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder={s.skip.otherPlaceholder}
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 rounded-xl bg-amber-600 py-3 font-medium text-amber-50 transition hover:bg-amber-500 disabled:opacity-40"
          >
            {loading ? "…" : s.skip.submit}
          </button>
          <button
            onClick={close}
            className="rounded-xl border border-gray-700 px-5 py-3 text-gray-400 transition hover:bg-gray-800"
          >
            {s.sheet.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
