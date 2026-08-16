import { useState } from "react";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t } from "../lib/strings";
import type { ProviderId } from "../lib/llm/types";

/**
 * Entering your own LLM key.
 *
 * Provider metadata arrives through props rather than an import from `lib/llm`:
 * the adapters drag in the SDKs of all three providers, and one such import
 * would haul every one of them into the client bundle. All that's needed out
 * here is the names, the list of models and a "where to get a key" link — plain
 * data.
 *
 * The key itself never comes back from the server, not even to its owner: there
 * is only the tail of it. So an empty input field next to a saved key is not
 * lost state, it is the only state that can exist.
 */

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  keyHelpUrl: string;
  models: readonly { id: string; label: string }[];
}

interface Props {
  providers: ProviderMeta[];
  current: { provider: ProviderId | null; model: string | null; keyMask: string | null };
  locale?: Locale;
  /** In onboarding a save moves you on; in settings you stay where you are. */
  onSaved?: () => void;
}

const CUSTOM_MODEL = "__custom__";

export default function LlmKeyForm({
  providers,
  current,
  locale = DEFAULT_LOCALE,
  onSaved,
}: Props) {
  const s = t(locale);

  const [provider, setProvider] = useState<ProviderId>(current.provider ?? providers[0]!.id);
  const meta = providers.find((p) => p.id === provider) ?? providers[0]!;

  const knownModel = meta.models.some((m) => m.id === current.model);
  const [model, setModel] = useState<string>(
    current.model && knownModel ? current.model : current.model ? CUSTOM_MODEL : meta.models[0]!.id
  );
  const [customModel, setCustomModel] = useState(current.model && !knownModel ? current.model : "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mask, setMask] = useState<string | null>(current.keyMask);

  const effectiveModel = model === CUSTOM_MODEL ? customModel.trim() : model;

  function switchProvider(next: ProviderId) {
    setProvider(next);
    const nextMeta = providers.find((p) => p.id === next)!;
    setModel(nextMeta.models[0]!.id);
    setCustomModel("");
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/llm-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: effectiveModel, apiKey }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          data.error === "auth"
            ? s.llm.errorAuth
            : data.error === "bad_request"
              ? s.llm.errorModel
              : s.llm.errorGeneric
        );
        return;
      }

      setMask(data.keyMask ?? null);
      setApiKey("");
      onSaved?.();
    } catch {
      setError(s.llm.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch("/api/llm-key", { method: "DELETE" });
      setMask(null);
      setApiKey("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs text-gray-500">{s.llm.provider}</label>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => switchProvider(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                p.id === provider
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-gray-500">{s.llm.model}</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
        >
          {meta.models.map((m) => {
            const note = s.llm.modelNotes[m.id];
            return (
              <option key={m.id} value={m.id}>
                {m.label}
                {note ? ` — ${note}` : ""}
              </option>
            );
          })}
          <option value={CUSTOM_MODEL}>{s.llm.customModel}</option>
        </select>
        {model === CUSTOM_MODEL && (
          <input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder={s.llm.customModelHint}
            className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
          />
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-gray-500">{s.llm.key}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={mask ? s.llm.keySaved(mask) : s.llm.keyPlaceholder}
          autoComplete="off"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-sm text-gray-200"
        />
        <a
          href={meta.keyHelpUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1.5 inline-block text-xs text-indigo-400 hover:text-indigo-300"
        >
          {s.llm.whereToGet(meta.label)}
        </a>
      </div>

      <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/80">
        {s.llm.privacyNote}
      </p>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !apiKey.trim() || !effectiveModel}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? s.llm.checking : s.llm.save}
        </button>
        {mask && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-sm text-gray-500 transition hover:text-red-400"
          >
            {s.llm.remove}
          </button>
        )}
      </div>
    </div>
  );
}
