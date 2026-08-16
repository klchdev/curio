/**
 * The server for the demo: `/api/*` responses assembled out of fixtures.
 *
 * The demo shows the real screens in full — the same `Hub`, the same impression
 * sheet, the same tier board. That is the entire point of the exercise: separate
 * markup would drift away from the product within a month and start lying in
 * exactly the place where the demo promises the truth. But the real components
 * call `/api/*`, and a guest has neither a session nor an LLM key: every such
 * request would come back 401, and instead of the product the visitor would see
 * a wall of red error strips.
 *
 * So what gets substituted is not a component but `fetch`. Not one new prop, not
 * one forked screen: we patch the single place where the demo and the app are
 * obliged to diverge — the boundary with the server, which the demo simply
 * doesn't have. It also keeps the promise of "not a single request going out":
 * any unknown `/api/*` is answered from here too, rather than hitting the
 * network.
 *
 * What to answer follows one rule. If an action is visible on screen without a
 * reload (taking a contract, dragging a game on the tier list, setting a verdict
 * in the queue), it answers "saved": the visitor sees the result, and the demo
 * is under no obligation to keep it between visits. If the only outcome would be
 * a `location.reload()` that wipes what was written and brings back the same
 * fixtures, we answer with an invitation to sign in. Lying with a reload is
 * worse than honestly saying a diary starts with an account.
 */

import {
  DEMO_ATTENTION,
  DEMO_DEEP_DIVES,
  DEMO_LIBRARY,
  DEMO_POOL,
  DEMO_RECORDS,
  DEMO_RUN,
  DEMO_TIER_LIST,
} from "../../lib/demo-fixtures";
import { t, type Dict } from "../../lib/strings";
import type { Locale } from "../../lib/i18n";

type Body = Record<string, unknown>;

/* ================= Indexes over the fixtures ================= */

/**
 * Cover images are gathered from the ready-made sets rather than built from the
 * appid by hand: a second source of truth about the image URL would drift away
 * from the fixtures silently — the picture would simply stop loading.
 */
const IMAGES = new Map<number, string>();
for (const item of DEMO_TIER_LIST) if (item.gameImage) IMAGES.set(item.gameId, item.gameImage);
for (const item of DEMO_POOL) if (item.headerImage) IMAGES.set(item.id, item.headerImage);
for (const item of DEMO_ATTENTION.items) {
  if (item.headerImage) IMAGES.set(item.gameId, item.headerImage);
}
for (const item of DEMO_RUN.items) {
  if (item.headerImage) IMAGES.set(item.gameId, item.headerImage);
}

const RECORDS = new Map(DEMO_RECORDS.map((record) => [record.gameId, record]));

/* ================= Building the responses ================= */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A refusal that reads as an invitation rather than a breakage. The text comes
 * from the same block of strings as the call to action at the bottom of the
 * page: two different explanations of why the demo doesn't save would drift
 * apart in tone.
 */
function invite(s: Dict): Response {
  return json({ error: `${s.demo.ctaTitle}. ${s.demo.ctaText}` }, 403);
}

/*
 * In production the analysis takes about ten seconds, and a dedicated waiting
 * screen with changing stages is drawn for it. An instant answer from a fixture
 * would leave no chance to see it — and that is exactly the part of the product
 * people open the demo for.
 */
const THINKING_MS = 1400;

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, THINKING_MS));
}

/** The start of the first paragraph — the quote in the impression sheet is a reminder. */
function excerpt(text: string, limit = 120): string {
  const line = text.split("\n").find((part) => part.trim().length > 0)?.trim() ?? "";
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : limit).trimEnd()}…`;
}

/** Your own past words about this game: what the sheet shows before you write. */
function entryContext(gameId: number) {
  const record = RECORDS.get(gameId);
  if (!record) return { quotes: [], drift: null };

  return {
    quotes: record.entries.slice(-2).map((entry) => ({
      playtimeMinutes: entry.playtimeTotalMinutes,
      text: excerpt(entry.text),
    })),
    // The score-vs-tone drift is computed by the entry analysis, which the demo lacks
    drift: null,
  };
}

/** Library search — the same fields the real `searchLibrary` returns. */
function searchLibrary(query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  return DEMO_LIBRARY.filter(
    (game) => !game.isSoftware && game.title.toLowerCase().includes(needle)
  )
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes)
    .slice(0, 12)
    .map((game) => ({
      gameId: game.id,
      title: game.title,
      headerImage: IMAGES.get(game.id) ?? null,
      playtimeMinutes: game.playtimeMinutes,
      verdict: RECORDS.get(game.id)?.verdict ?? null,
      hours: Math.round((game.playtimeMinutes / 60) * 10) / 10,
      hasRecord: RECORDS.has(game.id),
    }));
}

const FIT_BY_TIER: Record<string, "yes" | "maybe" | "no"> = {
  S: "yes",
  A: "yes",
  B: "maybe",
  C: "maybe",
  D: "no",
  F: "no",
};

/**
 * A deep dive into a game. You can ask about any game in the library, while the
 * fixtures contain exactly as many written dives as somebody has written — so
 * for the rest it is assembled from what is already known about the game: the
 * store description and the advisor's argument. The result is poorer than a
 * written one, but it invents nothing; the moment a fixture for the game shows
 * up, it takes over on its own.
 */
function deepDive(gameId: number) {
  const written = DEMO_DEEP_DIVES.find((dive) => dive.gameId === gameId);
  if (written) return written;

  const pick = DEMO_RUN.items.find((item) => item.gameId === gameId);
  const game = DEMO_LIBRARY.find((item) => item.id === gameId);
  const tier = pick?.deepTier ?? pick?.tier ?? null;

  return {
    fit: tier ? (FIT_BY_TIER[tier] ?? "maybe") : "maybe",
    tier,
    summary: game?.shortDescription ?? "",
    forYou: pick?.reason ?? "",
    against: "",
    complaints: [],
    // Zero hides the "N reviews read" line: nobody read any of them in the demo
    reviewsUsed: 0,
  };
}

/*
 * Contracts taken during this session. The count starts well above the slot ids
 * in the fixtures: a colliding number would make a new contract
 * indistinguishable from an old one.
 */
let lastSlotId = 9000;

async function answer(url: URL, method: string, body: Body, s: Dict): Promise<Response> {
  switch (`${method} ${url.pathname}`) {
    /* — Reads: everything is already computed in the fixtures — */

    case "GET /api/entry-context":
      return json(entryContext(Number(url.searchParams.get("gameId"))));

    case "GET /api/library-search":
      return json({ items: searchLibrary(url.searchParams.get("q") ?? "") });

    case "POST /api/deep-dive":
      await pause();
      return json(deepDive(Number(body.gameId)));

    /* — Actions the screen shows by itself, without a reload — */

    case "POST /api/contract":
      return json({ slotId: (lastSlotId += 1) });

    case "POST /api/set-tier":
      return json({ ok: true });

    // A quick verdict from the queue removes the card in place; the full
    // impression sheet would end in a reload and lose what was written
    case "POST /api/impression":
      return body.mode === "quick" ? json({ ok: true }) : invite(s);

    /* — Your own library and your own Steam reviews: a guest has neither — */

    // Not an error but a truthful answer: there is nothing to reconcile, the
    // demo library never moves. On a failure the hub would show "network
    // problem" — now that would be a lie
    case "POST /api/sync-library":
      return json({ synced: 0 });

    case "POST /api/import-steam-reviews":
      return json({ imported: 0, redated: 0 });

    /* — Everything else: saving, generating, skipping — */

    default:
      return invite(s);
  }
}

/* ================= Installation ================= */

let installed = false;

/**
 * Installs the interception once per page. It must be called before the real
 * components mount: the impression sheet goes fetching its context in its very
 * first effect.
 */
export function installDemoApi(locale: Locale): void {
  if (installed) return;
  installed = true;

  const s = t(locale);
  const network = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.origin);

    // Anything that isn't our `/api/*` — Steam images, housekeeping calls — goes as before
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return network(input, init);
    }

    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    let body: Body = {};
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as Body;
      } catch {
        // The body isn't json — so it holds none of the fields we branch on either
      }
    }

    return answer(url, method, body, s);
  };
}
