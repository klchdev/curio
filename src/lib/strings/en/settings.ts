import type * as Ru from "../ru/settings";

/** The person’s own settings: their data and their model key. */
export const account: typeof Ru.account = {
  title: "My data",
  exportHint:
    "A single file with everything this app knows about you: your library, the diary with every entry, tags, contracts, Curio's picks and the history of your play sessions.",
  exportButton: "Export my data",

  dangerZone: "Danger zone",
  deleteTitle: "Delete account",
  deleteWarning:
    "Everything goes, for good: the diary, verdicts, tags, contracts, picks and the whole session history. There is no undo — we keep no backups for this, so there would be nothing to restore from. If you'd miss what you wrote, export it first.",
  deleteConfirmLabel: (username: string) => `Type "${username}" to confirm`,
  deleteConfirmPlaceholder: "Your Steam name",
  deleteSubmit: "Delete forever",
  deleting: "Deleting…",
  deleteFailed: "Couldn't delete the account — try again",
  confirmMismatch: "The name didn't match — nothing was deleted",
};

export const llm: typeof Ru.llm = {
  title: "AI key",
  intro:
    "Breakdowns, verdicts and picks are made by an AI model running on your own key. This service pays for none of it and keeps no key of its own — which is why it's free and will stay that way. Your key is stored encrypted and is never shown back to you: only the tail is.",
  provider: "Provider",
  model: "Model",
  customModel: "Other model…",
  customModelHint: "Exact model name",
  modelNotes: {
    "gemini-3.7-flash": "fast, has a free tier",
    "gemini-3.7-pro": "smarter and pricier",
    "claude-sonnet-5": "balance of cost and quality",
    "claude-opus-5": "the strongest, pricier",
    "claude-haiku-4-5": "cheap, for bulk analysis",
    "gpt-4.1": "",
    "gpt-4.1-mini": "cheaper, for bulk analysis",
  } as Record<string, string>,
  key: "Key",
  keyPlaceholder: "Paste your key",
  keySaved: (mask: string) => `Key saved (${mask}) — enter a new one to replace it`,
  whereToGet: (provider: string) => `Where to get a ${provider} key`,
  privacyNote:
    "Your entries and game list are sent to the AI provider. On Gemini's free tier Google may use request content to improve its models — if that doesn't work for you, use a paid tier or another provider.",
  checking: "Checking…",
  save: "Save",
  remove: "Remove key",
  errorAuth: "The provider rejected this key. Check you copied all of it and that it hasn't been revoked.",
  errorModel: "No such model, or your key has no access to it. Check the model name.",
  errorGeneric: "Couldn't verify the key. Looks like a network error — try again.",
  missingTitle: "An AI key is needed",
  missingText: "This runs on your own key. Add one in settings — it takes a minute.",
  missingCta: "Add a key",
};
