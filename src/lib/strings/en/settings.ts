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

  keyStepsTitle: "How to get a key — one minute",
  keySteps: {
    gemini: [
      "Open Google AI Studio through the link below and sign in with your Google account.",
      "Press “Create API key”.",
      "Keep the project it offers — there is no need to create your own.",
      "Copy the whole string: it starts with AIza and is not shown again.",
      "Paste it into the field above and save — the key is checked against a live request right away.",
    ],
    anthropic: [
      "Create an account in the Anthropic Console through the link below.",
      "Top up your balance under Billing: Claude has no free tier, and a key with no money behind it answers with an error.",
      "Settings → API keys → Create Key.",
      "Copy the whole string: it starts with sk-ant- and is shown once.",
      "Paste it into the field above and save — the key is checked against a live request right away.",
    ],
    openai: [
      "Create an account at platform.openai.com through the link below.",
      "Top up your balance under Billing: with an empty balance the key answers with a quota error.",
      "API keys → Create new secret key.",
      "Copy the whole string: it starts with sk- and is shown once.",
      "Paste it into the field above and save — the key is checked against a live request right away.",
    ],
  } as Record<string, string[]>,
  keyCost: {
    gemini: "Has a free tier — no card needed",
    anthropic: "Paid only, needs a card",
    openai: "Paid only, needs a card",
  } as Record<string, string>,
  privacyNote:
    "Your entries and game list are sent to the AI provider. On Gemini's free tier Google may use request content to improve its models — if that doesn't work for you, use a paid tier or another provider.",
  checking: "Checking…",
  save: "Save",
  remove: "Remove key",
  errorAuth: "The provider rejected this key. Check you copied all of it and that it hasn't been revoked.",
  errorModel: "No such model, or your key has no access to it. Check the model name.",
  errorGeneric: "Couldn't verify the key. Looks like a network error — try again.",
  trustTitle: "What the server actually sees",
  trustPoints: [
    "Your key is encrypted (AES-256-GCM) with an encryption key held in the server's environment, not in the database. A stolen database on its own is not enough to get the keys out. The key itself is never handed back — not to the interface, not through the API: only its tail is shown.",
    "It is decrypted on the server at the moment of a request and goes straight to the provider — Google, Anthropic or OpenAI. There is nothing in between, and the bill is yours.",
    "What travels in the request is what the analysis is made of: the text of your entries, game titles, playtime and store descriptions from Steam. The service has no Steam password of yours — sign-in goes through Steam itself, and only a profile id leaves this server.",
    "What is stored is the model's answer — picks, verdicts, breakdowns: that is what your account consists of. The requests themselves are not kept, and the key is never written to the logs.",
    "What the provider does with the content of a request is decided by their tier, not by this service. On Gemini's free tier the content may be used to improve models — the paid tiers of all three generally do not.",
    "Whoever runs this server has access to its database and its environment — which means they can technically decrypt the keys. No encryption anywhere protects against that; what does is that the code is open and you can run your own instance.",
    "The pages inside the account carry no analytics and no third-party scripts: the visit counter (Yandex.Metrika) runs only on the landing page and the demo — where nobody has signed in yet. You can switch it off for your own browser below. The key is removed with the button below, the whole account on the “My data” page.",
  ],
  missingTitle: "An AI key is needed",
  missingText: "This runs on your own key. Add one in settings — it takes a minute.",
  missingCta: "Add a key",
};

export const analytics = {
  title: "Counting visits",
  text: "The pages that open without signing in — the landing page and the demo — carry a Yandex.Metrika counter. It answers exactly one question: how many people arrived and where from. Inside the account there is none: the diary, the chronology, the settings and “My data” load no third-party script at all.",
  statusOn: "Visits from this browser are counted",
  statusOff: "Visits from this browser are not counted",
  turnOff: "Don't count me",
  turnOn: "Count me",
  note: "The choice is kept in this browser and does not carry over to another device. Switching it off takes effect on the next page load: the counter simply isn't loaded, so Yandex doesn't even get a request.",
};
