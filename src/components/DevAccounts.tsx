import { useState } from "react";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t } from "../lib/strings";

/**
 * The instance owner's test accounts.
 *
 * The block is visible only to someone actually allowed to see it — the server
 * decides, and the page simply doesn't render it for anyone else. There are no
 * permission checks here and there must not be any: a client-side check guards
 * nothing while creating the illusion that it does.
 */

interface Account {
  id: number;
  username: string;
}

interface Props {
  accounts: Account[];
  ownerId: number;
  currentId: number;
  locale?: Locale;
}

export default function DevAccounts({ accounts, ownerId, currentId, locale = DEFAULT_LOCALE }: Props) {
  const s = t(locale);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/dev-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Switching accounts changes everything on the page — reloading is easier
      // than rebuilding the state by hand
      if (res.ok) location.reload();
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-sm leading-relaxed text-gray-500">{s.dev.hint}</p>

      {currentId !== ownerId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => call({ action: "switch", targetId: ownerId })}
          className="mt-4 w-full rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-200 transition hover:border-amber-600 disabled:opacity-40"
        >
          {s.dev.back}
        </button>
      )}

      <ul className="mt-4 space-y-2">
        {accounts.length === 0 && <li className="text-sm text-gray-600">{s.dev.empty}</li>}
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between rounded-lg border border-gray-800 px-3 py-2"
          >
            <span className={`text-sm ${account.id === currentId ? "text-emerald-300" : "text-gray-300"}`}>
              {account.username}
            </span>
            <span className="flex items-center gap-3">
              {account.id !== currentId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => call({ action: "switch", targetId: account.id })}
                  className="text-xs text-indigo-400 transition hover:text-indigo-300 disabled:opacity-40"
                >
                  {s.dev.switchTo}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => call({ action: "delete", targetId: account.id })}
                className="text-xs text-gray-600 transition hover:text-red-400 disabled:opacity-40"
              >
                {s.dev.deleteOne}
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={s.dev.labelPlaceholder}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => call({ action: "create", label })}
          className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-600 disabled:opacity-40"
        >
          {s.dev.create}
        </button>
      </div>
    </div>
  );
}
