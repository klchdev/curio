/**
 * The demo's server: `/api/*` answered from fixtures.
 *
 * The demo shows the production screens whole — the same `Hub`, the same
 * impression sheet, the same tier board. That is the entire point: a separate
 * mock layout would drift away from the product within a month and start lying
 * exactly where the demo promises honesty. But production components talk to
 * `/api/*`, and a guest has neither a session nor an LLM key: every one of
 * those calls would come back 401 and the visitor would meet a wall of red
 * error strips instead of a product.
 *
 * So what gets replaced is not a component but `fetch`. No extra props, no
 * forked screens: the only place the demo is allowed to diverge is the boundary
 * with a server it does not have. This also keeps the promise that nothing
 * leaves the machine — an unknown `/api/*` is answered from here too, rather
 * than escaping to the network.
 *
 * Three kinds of answer, and the difference matters:
 *
 *   - Reads are served straight from fixtures.
 *   - Work that produces no stored result — generating advice, reading store
 *     reviews for a deep dive — is *simulated*, timings and all. Nothing is
 *     saved by it in production either, so showing the process is honest and it
 *     is the part people came to see.
 *   - Writes that the visitor would expect to persist are answered with an
 *     invitation to sign in. Claiming a diary entry was saved and then serving
 *     the same fixture back is the one lie a demo cannot afford.
 */

import {
  DEMO_ATTENTION,
  DEMO_DEEP_DIVES,
  DEMO_LIBRARY,
  DEMO_POOL,
  DEMO_RECORDS,
  DEMO_RUN,
  DEMO_STATS,
  DEMO_TIER_LIST,
} from "../../lib/demo-fixtures";
import { t, type Dict } from "../../lib/strings";
import type { Locale } from "../../lib/i18n";
import { RUN_PARAM, demoRun, nextRunVariant, runVariantFrom, type RunVariant } from "./demo-run";

type Body = Record<string, unknown>;

/* ================= Indexes over the fixtures ================= */

/*
 * Cover art is collected from the ready-made sets rather than rebuilt from an
 * appid by hand: a second source of truth for that URL would drift away from
 * the fixtures silently, and the only symptom would be images that stop
 * loading.
 */
const IMAGES = new Map<number, string>();
for (const item of DEMO_TIER_LIST) if (item.gameImage) IMAGES.set(item.gameId, item.gameImage);
for (const item of DEMO_POOL) if (item.headerImage) IMAGES.set(item.id, item.headerImage);
for (const item of DEMO_ATTENTION.items) {
  if (item.headerImage) IMAGES.set(item.gameId, item.headerImage);
}
for (const item of DEMO_RUN.items) if (item.headerImage) IMAGES.set(item.gameId, item.headerImage);

const RECORDS = new Map(DEMO_RECORDS.map((record) => [record.gameId, record]));

/* ================= Building responses ================= */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A refusal that reads as an invitation rather than a breakage. The text comes
 * from the same block of strings as the call to action at the bottom of the
 * page: two different explanations of why nothing is saved here would drift
 * apart in tone.
 */
function invite(s: Dict): Response {
  return json({ error: `${s.demo.ctaTitle}. ${s.demo.ctaText}` }, 403);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 * A deep dive takes about ten seconds in production, and a whole waiting screen
 * with shifting stages is drawn for it. An instant answer out of a fixture
 * would never let that screen appear — and it is one of the things people open
 * the demo to look at.
 */
const THINKING_MS = 1400;

/*
 * Syncing a library and importing reviews are network round trips to Steam. An
 * answer with no delay at all reads as a button that did nothing.
 */
const STEAM_WORK_MS = 1200;

/** The opening of the first paragraph — a quote here is a reminder, not a reread. */
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
    // Rating drift against the tone of recent entries is computed by the entry
    // analyser, which the demo does not run
    drift: null,
  };
}

/** Library search — the same fields `searchLibrary` returns. */
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
 * A deep dive. You can ask about any game in the library, and there are exactly
 * as many written dives as somebody wrote — so for the rest one is assembled
 * out of what is already known about the game: the store blurb and the
 * advisor's argument. Thinner than a written one, but it invents nothing, and
 * the moment a fixture for that game appears it is used instead.
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
    // Zero hides the "read N reviews" line: nobody read any of them here
    reviewsUsed: 0,
  };
}

/* ================= A run of the advisor ================= */

/**
 * How the simulated run moves through its stages, in milliseconds since the
 * start. The names and the shape are not invented: `recommendation-status`
 * reports exactly `collecting` → `thinking` → `saving`, and `picksReady` counts
 * advice already worked out, which is why it only grows during `thinking`.
 *
 * The hub polls every two seconds, so a visitor normally sees two intermediate
 * frames out of three — same as in production, where stages are also skipped
 * between polls. Total is kept near three and a half seconds: long enough to
 * read as work, short enough that nobody walks away.
 */
const RUN_STAGES = {
  collecting: 600,
  thinking: 2300,
  saving: 3500,
} as const;

interface MockRun {
  id: number;
  startedAt: number;
  /** Which advice set the reload after this run should land on. */
  target: RunVariant;
  /** How many picks the target set holds — `picksReady` grows towards it. */
  total: number;
}

let mockRun: MockRun | null = null;
let lastRunId = 9500;

function currentVariant(): RunVariant {
  return runVariantFrom(new URL(window.location.href).searchParams);
}

/**
 * Point the address at an advice set. The hub reloads the page the moment a run
 * reports `done`, and the server reads this parameter on the way back — so the
 * new advice is already in the first painted frame.
 */
function selectRun(variant: RunVariant): void {
  const url = new URL(window.location.href);
  if (variant === "base") url.searchParams.delete(RUN_PARAM);
  else url.searchParams.set(RUN_PARAM, variant);
  window.history.replaceState(null, "", url);
}

function startRun(): Response {
  const target = nextRunVariant(currentVariant());
  mockRun = {
    id: (lastRunId += 1),
    startedAt: Date.now(),
    target,
    total: demoRun(target).items.length,
  };
  return json({ runId: mockRun.id });
}

function runStatus(runId: number): Response {
  // A run nobody here started: report it finished rather than poll forever
  if (!mockRun || mockRun.id !== runId) return json({ status: "done" });

  const elapsed = Date.now() - mockRun.startedAt;
  const startedAt = new Date(mockRun.startedAt).toISOString();

  if (elapsed >= RUN_STAGES.saving) {
    selectRun(mockRun.target);
    mockRun = null;
    return json({ status: "done" });
  }

  if (elapsed < RUN_STAGES.collecting) {
    return json({ status: "pending", stage: "collecting", picksReady: 0, error: null, startedAt });
  }

  if (elapsed < RUN_STAGES.thinking) {
    const share = (elapsed - RUN_STAGES.collecting) / (RUN_STAGES.thinking - RUN_STAGES.collecting);
    return json({
      status: "pending",
      stage: "thinking",
      picksReady: Math.min(mockRun.total, Math.round(mockRun.total * share)),
      error: null,
      startedAt,
    });
  }

  return json({
    status: "pending",
    stage: "saving",
    picksReady: mockRun.total,
    error: null,
    startedAt,
  });
}

/*
 * Contracts taken during this session. The counter starts well above the slot
 * ids in the fixtures: a collision would make a fresh contract indistinguishable
 * from a prepared one.
 */
let lastSlotId = 9000;

async function answer(url: URL, method: string, body: Body, s: Dict): Promise<Response> {
  switch (`${method} ${url.pathname}`) {
    /* — Reading: everything is already computed in the fixtures — */

    case "GET /api/entry-context":
      return json(entryContext(Number(url.searchParams.get("gameId"))));

    case "GET /api/library-search":
      return json({ items: searchLibrary(url.searchParams.get("q") ?? "") });

    /* — Work that stores nothing, simulated with its real timings — */

    case "POST /api/deep-dive":
      await pause(THINKING_MS);
      return json(deepDive(Number(body.gameId)));

    case "POST /api/generate-recommendations":
      return startRun();

    case "GET /api/recommendation-status":
      return runStatus(Number(url.searchParams.get("runId")));

    /* — Talking to Steam: the numbers come from the fixtures — */

    case "POST /api/sync-library":
      await pause(STEAM_WORK_MS);
      return json({ synced: DEMO_STATS.totalLibrary });

    // Reviews carried over from a Steam profile are marked `origin: "steam"` in
    // the fixtures, so this count is the same one the diary shows badges for
    case "POST /api/import-steam-reviews":
      await pause(STEAM_WORK_MS);
      return json({ imported: DEMO_STATS.steamCount, redated: 0 });

    /* — Actions the screen reflects on its own, without a reload — */

    case "POST /api/contract":
      return json({ slotId: (lastSlotId += 1) });

    case "POST /api/set-tier":
      return json({ ok: true });

    // A quick verdict from the queue removes the card in place; the full
    // impression sheet would end in a reload and lose what was written
    case "POST /api/impression":
      return body.mode === "quick" ? json({ ok: true }) : invite(s);

    /* — Everything else: save, skip, delete — */

    default:
      return invite(s);
  }
}

/* ================= Installation ================= */

let installed = false;

/**
 * Installs the intercept once per page. It has to run before the production
 * components mount: the impression sheet goes looking for its context in its
 * very first effect.
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

    // Anything that is not our own `/api/*` — Steam cover art, service
    // requests — goes out exactly as it did
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
        // Not json, so none of the fields we branch on are in there either
      }
    }

    return answer(url, method, body, s);
  };
}
