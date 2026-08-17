import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Reveal from "../Reveal";
import RichText from "../RichText";
import TierBoard from "../TierBoard";
import ImpressionSheet from "../ImpressionSheet";
import {
  formatPlaytime,
  advisorHint,
  verdictLabel,
  verdicts,
  worthLabel,
  TIER_STYLE,
  THRESHOLDS,
  type Tier,
} from "../../lib/vocab";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n";
import { t, type Dict } from "../../lib/strings";
import SkipModal from "../SkipModal";
import CurioMark from "../CurioMark";

export interface Pick {
  grounding?: "known" | "from-description" | "guess" | null;
  /** The deep dive's outcome, if one was made: it may argue with the first pass's tier. */
  deepFit?: "yes" | "maybe" | "no" | null;
  deepTier?: string | null;
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  tier: string;
  reason: string;
  hours: number;
}


export interface Slot {
  slotId: number;
  gameId: number;
  title: string;
  image: string | null;
  played: number;
}

export interface QueueItem {
  hasReview?: boolean;
  gameId: number;
  title: string;
  headerImage: string | null;
  playtimeMinutes: number;
}

export interface DiaryEntry {
  origin?: string | null;
  id: number;
  gameId: number;
  title: string;
  note: string;
  kind: string;
  playtimeMinutes: number;
  deltaMinutes: number;
  verdict: string | null;
  tier: string | null;
}

/** A game that has a review, but a lot more playtime has piled up since. */
interface UpdateItem {
  gameId: number;
  title: string;
  headerImage: string | null;
  currentPlaytime: number;
  lastRecordedPlaytime: number;
  delta: number;
  verdict: string | null;
  rating: number | null;
  tier: string | null;
}

export interface Props {
  picks: Pick[];
  slots: Slot[];
  queue: QueueItem[];
  updates: UpdateItem[];
  queueTotal: number;
  tierGames: { gameId: number; title: string; image: string | null; tier: string | null }[];
  diary: DiaryEntry[];
  demos: { gameId: number; title: string; headerImage: string | null; tier: string | null; note: string | null }[];
  stats: {
    totalGames: number;
    totalLibrary: number;
    streak: number;
    wallOfShame: string[];
    steamCount: number;
  };
  reviewCount: number;
  poolSize: number;
  freeSkips: number;
  runProfile: string | null;
  runDate: string | null;
  activeRunId: number | null;
  /** The running job's state from the server: the first frame must not lie about the stage. */
  activeRunProgress: RunProgressState | null;
  locale: Locale;
  /** The zone taken from the URL: redirects from the old pages land here. */
  initialZone: Zone;
  /** When we last reconciled with Steam, in milliseconds. */
  lastSyncAt: number | null;
}

export type Zone = "choose" | "now" | "recap";

/** "3 hours ago" in the interface language — without a declension table of our own. */
function ago(timestamp: number, locale: Locale): string {
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en" : "ru", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(Math.min(minutes, -1), "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

const ZONE_GLOW: Record<Zone, string> = {
  choose: "bg-emerald-500",
  now: "bg-emerald-500",
  recap: "bg-sky-500",
};

export default function Hub(props: Props) {
  const { picks, slots, queueTotal, reviewCount, activeRunId, locale } = props;
  const s = t(locale);

  const [zone, setZone] = useState<Zone>(props.initialZone);

  /* The URL has to survive a reload: half the actions here do one. */
  function goTo(next: Zone) {
    setZone(next);
    const url = new URL(window.location.href);
    if (next === "choose") url.searchParams.delete("zone");
    else url.searchParams.set("zone", next);
    window.history.replaceState(null, "", url);
  }
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<number | null>(activeRunId);
  const [progress, setProgress] = useState<RunProgressState | null>(props.activeRunProgress);
  /*
   * Contracts taken during this session. The page used to reload in full for the
   * sake of a single card — now the card is simply drawn in, and the person gets
   * their confirmation without losing what they were reading.
   */
  const [taken, setTaken] = useState<Slot[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  /*
   * The sync lives in the shell rather than in the "Now" zone: playtime touches
   * every screen, and people look for this button wherever they noticed the
   * discrepancy.
   */
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function sync() {
    setBusy("sync");
    try {
      const res = await fetch("/api/sync-library", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(s.errors.network);
        return;
      }
      setSyncResult(s.dock.synced(data.synced ?? 0));
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setError(s.errors.network);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const allSlots = taken.length > 0 ? [...slots, ...taken] : slots;

  /* A game once taken leaves the suggestions at once: it has been decided on. */
  const takenIds = new Set(taken.map((slot) => slot.gameId));
  const openPicks = takenIds.size > 0 ? picks.filter((p) => !takenIds.has(p.gameId)) : picks;

  function onTaken(slot: Slot) {
    setTaken((prev) => [...prev, slot]);
    setToast(slot.title);
  }

  const pick = picks[index];
  const tone = TIER_STYLE[pick?.tier as Tier] ?? TIER_STYLE.B;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (zone !== "choose" || picks.length === 0) return;
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % picks.length);
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + picks.length) % picks.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zone, picks.length]);

  /*
   * The run happens in the background. The poll picks up not just "done or not"
   * but the stage and the number of games processed — the backend already writes
   * those to the database, while the screen used to show a static bar instead.
   */
  useEffect(() => {
    if (runId === null) return;

    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/recommendation-status?runId=${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (stop) return;

        if (data.status === "done") {
          window.location.reload();
          return;
        }
        if (data.status === "error") {
          setError(data.error || s.errors.runFailed);
          setRunId(null);
          setProgress(null);
          return;
        }
        setProgress({
          stage: data.stage ?? "collecting",
          picksReady: data.picksReady ?? 0,
          startedAt: data.startedAt ? Date.parse(data.startedAt) : Date.now(),
        });
      } catch {
        // the network blinked — wait for the next poll
      }
    }

    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [runId]);

  async function post(url: string, body?: unknown): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? s.errors.generic);
        return false;
      }
      return true;
    } catch {
      setError(s.errors.network);
      return false;
    }
  }

  /*
   * Computed on the client after mount: on the server "an hour ago" would freeze
   * into the page cache and lie harder the longer the tab stays open.
   */
  const [syncFreshness, setSyncFreshness] = useState<string>("");
  useEffect(() => {
    setSyncFreshness(
      props.lastSyncAt === null ? s.dock.syncNever : s.dock.syncAgo(ago(props.lastSyncAt, locale))
    );
  }, [props.lastSyncAt, locale]);

  const backdrop = zone === "choose" ? pick?.headerImage : zone === "now" ? slots[0]?.image : null;
  const glow = zone === "choose" ? tone.bg : ZONE_GLOW[zone];

  return (
    <div className="relative pb-32">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {backdrop && (
          <img
            key={backdrop}
            src={backdrop}
            alt=""
            className="h-full w-full scale-150 object-cover opacity-25 blur-[100px] transition-opacity duration-1000"
            style={{
              maskImage: "radial-gradient(70% 55% at 50% 28%, #000 0%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(70% 55% at 50% 28%, #000 0%, transparent 78%)",
            }}
          />
        )}
        <div
          className={`absolute top-[22%] left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full ${glow} opacity-[0.13] blur-[140px] transition-colors duration-700`}
        />
      </div>

      {error && (
        <p className="mb-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <div key={zone} className="min-h-[26rem]">
        {zone === "choose" && (
          <ChooseZone
            {...props}
            picks={openPicks}
            slots={allSlots}
            onTaken={onTaken}
            onZone={goTo}
            index={index}
            setIndex={setIndex}
            busy={busy}
            setBusy={setBusy}
            post={post}
            runId={runId}
            setRunId={setRunId}
            progress={progress}
          />
        )}
        {zone === "now" && (
          <NowZone
            {...props}
            slots={allSlots}
            busy={busy}
            setBusy={setBusy}
            post={post}
            onZone={goTo}
          />
        )}
        {zone === "recap" && <RecapZone {...props} post={post} />}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-6">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-800 bg-emerald-950/90 px-4 py-2.5 text-sm shadow-lg shadow-black/40 backdrop-blur">
            <span className="text-emerald-200">{s.choose.taken(toast)}</span>
            <button
              onClick={() => {
                setToast(null);
                goTo("now");
              }}
              className="text-xs text-emerald-400 underline-offset-2 transition hover:underline"
            >
              {s.choose.takenGo}
            </button>
            <button
              onClick={() => setToast(null)}
              className="text-emerald-500/70 transition hover:text-emerald-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-800/80 bg-gray-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl gap-2 px-6 py-3">
          <DockTile
            active={zone === "choose"}
            onClick={() => goTo("choose")}
            label={s.dock.choose}
            hint={s.dock.chooseHint(openPicks.length)}
          />
          <DockTile
            active={zone === "now"}
            onClick={() => goTo("now")}
            label={s.dock.now}
            hint={s.dock.nowHint(allSlots.length, queueTotal)}
            accent={queueTotal > 0}
          />
          <DockTile
            active={zone === "recap"}
            onClick={() => goTo("recap")}
            label={s.dock.recap}
            hint={s.dock.recapHint(reviewCount)}
          />
          {/*
            An icon rather than a tile. Standing at full width beside the three
            zones it read as a fourth place to go, which it is not: it is one
            errand, needed only when the shelf itself changed. What it says out
            loud lives in the tooltip instead — including the freshness line,
            which nobody reads until they are already wondering.
          */}
          <button
            onClick={sync}
            disabled={busy !== null}
            title={`${s.dock.sync} · ${syncResult ?? syncFreshness}\n${s.dock.syncWhy}`}
            aria-label={s.dock.sync}
            className="grid aspect-square shrink-0 place-items-center self-stretch rounded-xl border border-gray-800 text-2xl transition hover:border-gray-700 hover:bg-gray-900/60 disabled:opacity-40"
          >
            <span
              className={`block leading-none ${busy === "sync" ? "animate-spin" : ""} ${syncResult ? "text-emerald-400" : "text-gray-400"}`}
            >
              ⟳
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function DockTile({
  label,
  hint,
  active,
  accent,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border px-4 py-2.5 text-left transition duration-300 ${
        active ? "border-gray-600 bg-gray-900" : "border-transparent hover:border-gray-800 hover:bg-gray-900/50"
      }`}
    >
      <span
        className={`block text-sm font-medium ${
          active ? (accent ? "text-amber-400" : "text-white") : "text-gray-400"
        }`}
      >
        {label}
      </span>
      <span className="block truncate text-xs text-gray-600">{hint}</span>
    </button>
  );
}

/* ================= CHOOSE ================= */

type ZoneProps = Props & {
  busy: string | null;
  setBusy: (value: string | null) => void;
  post: (url: string, body?: unknown) => Promise<boolean>;
};

function ChooseZone({
  picks,
  slots,
  reviewCount,
  poolSize,
  runProfile,
  runDate,
  locale,
  index,
  setIndex,
  busy,
  setBusy,
  post,
  runId,
  setRunId,
  progress,
  onTaken,
  onZone,
}: ZoneProps & {
  index: number;
  setIndex: (fn: (i: number) => number) => void;
  runId: number | null;
  setRunId: (value: number | null) => void;
  progress: RunProgressState | null;
  onTaken: (slot: Slot) => void;
  onZone: (zone: Zone) => void;
}) {
  const s = t(locale);
  const [dice, setDice] = useState<"idle" | "confirm" | "rolling">("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [dives, setDives] = useState<Record<number, DeepDive | "loading" | string>>({});
  /** A game asked about by hand: its deep dive is shown apart from the suggestions. */
  const [asked, setAsked] = useState<LibraryGame | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [sheet, setSheet] = useState<{ mode: "retro" | "entry"; item: LibraryGame } | null>(null);

  /** A game already played asks for a review, not for a commitment. */
  function actionFor(game: { playtimeMinutes: number; hasRecord: boolean }) {
    if (game.playtimeMinutes < THRESHOLDS.MIN_PLAYTIME_TO_REVIEW) return null;
    return game.hasRecord ? ("entry" as const) : ("retro" as const);
  }

  /* The dive is cached on the server per (player, game) pair — a second click is free. */
  async function deepDive(gameId: number, refresh = false) {
    setDives((prev) => ({ ...prev, [gameId]: "loading" }));
    try {
      const res = await fetch("/api/deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, refresh }),
      });
      const data = await res.json().catch(() => ({}));
      setDives((prev) => ({
        ...prev,
        [gameId]: res.ok ? (data as DeepDive) : (data.error ?? s.errors.generic),
      }));
    } catch {
      setDives((prev) => ({ ...prev, [gameId]: s.errors.network }));
    }
  }
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const slotsLeft = THRESHOLDS.MAX_ACTIVE_SLOTS - slots.length;

  /*
   * This used to be a bare fetch that never looked at the response: any error —
   * a run already busy, too few reviews, a server that fell over — left the
   * screen untouched, and the button just looked broken.
   */
  async function startRun() {
    setBusy("run");
    setRunError(null);
    try {
      const res = await fetch("/api/generate-recommendations", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.runId) {
        setRunError(data.error || s.errors.generic);
        return;
      }
      setRunId(data.runId);
    } catch {
      setRunError(s.errors.network);
    } finally {
      setBusy(null);
    }
  }

  async function spinBlind() {
    setBusy("spin");
    const ok = await post("/api/spin");
    setBusy(null);
    if (ok) window.location.reload();
  }

  const blindSpin = (
    <>
      {runError && (
        <p className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
          {runError}
        </p>
      )}
      <BlindSpin
        poolSize={poolSize}
      busy={busy === "spin"}
        onSpin={spinBlind}
        disabled={slotsLeft <= 0}
        s={s}
      />
    </>
  );

  if (runId !== null) {
    return (
      <RunProgress
        s={s}
        progress={progress}
        onRestart={() => {
          setRunId(null);
          startRun();
        }}
      />
    );
  }
  if (reviewCount < THRESHOLDS.MIN_REVIEWS_FOR_AI) {
    return (
      <GateCard reviewCount={reviewCount} s={s}>
        {blindSpin}
      </GateCard>
    );
  }
  if (picks.length === 0) {
    return (
      <EmptyCard reviewCount={reviewCount} onStart={startRun} busy={busy === "run"} s={s}>
        {blindSpin}
      </EmptyCard>
    );
  }

  const pick = picks[Math.min(index, picks.length - 1)]!;

  /*
   * The deep dive's tier wins: it sees the mechanics, not the marketing. A dive
   * made in this session wins over a stored one, or else the hero card keeps the
   * old rating until a reload and argues with itself: "S" up top and "not your
   * kind of game" below.
   */
  function tierOf(item: Pick): Tier {
    const dive = dives[item.gameId];
    const fresh = typeof dive === "object" && dive !== null ? dive.tier : null;
    return (fresh ?? item.deepTier ?? item.tier) as Tier;
  }

  const shownTier = tierOf(pick);
  const tone = TIER_STYLE[shownTier] ?? TIER_STYLE.B;

  async function take(gameId: number, fallback?: { title: string; image: string | null }) {
    setBusy(`take-${gameId}`);
    setRunError(null);
    try {
      const res = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slotId) {
        setRunError(data.error || s.errors.generic);
        return;
      }

      const source = picks.find((item) => item.gameId === gameId);
      onTaken({
        slotId: data.slotId,
        gameId,
        title: source?.title ?? fallback?.title ?? "",
        image: source?.headerImage ?? fallback?.image ?? null,
        played: 0,
      });
    } catch {
      setRunError(s.errors.network);
    } finally {
      setBusy(null);
    }
  }

  /*
   * The draw creates a contract straight away — otherwise it's just reshuffling.
   * Tier D means "don't waste your time", so it must never come up: the draw
   * decides which of the good ones, not which one at random.
   */
  const rollable = picks
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => {
      const dive = dives[item.gameId];
      const fit = typeof dive === "object" && dive !== null ? dive.fit : item.deepFit;
      return tierOf(item) !== "D" && fit !== "no";
    });

  function roll() {
    if (rollable.length === 0) return;
    setDice("rolling");
    let ticks = 0;
    let landed = rollable[0]!.i;
    timer.current = setInterval(() => {
      landed = rollable[Math.floor(Math.random() * rollable.length)]!.i;
      setIndex(() => landed);
      ticks += 1;
      if (ticks > 18 && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
        take(picks[landed]!.gameId);
      }
    }, 85);
  }

  return (
    <>
      <Reveal>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-sm tracking-[0.2em] text-gray-500 uppercase">{s.choose.eyebrow}</h1>
          <span className="text-xs text-gray-700">
            {index + 1} / {picks.length}
            {runDate && s.choose.collected(runDate)}
          </span>
          <button
            onClick={startRun}
            disabled={busy === "run"}
            className="ml-auto rounded-full border border-gray-800 px-3 py-1 text-xs text-gray-500 transition hover:border-gray-600 hover:text-white disabled:opacity-40"
          >
            {s.choose.regenerate}
          </button>
        </div>
        {runError && (
          <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">
            {runError}
          </p>
        )}
      </Reveal>

      <Reveal delay={20}>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {!askOpen && (
            <button
              onClick={() => setAskOpen(true)}
              className="rounded-full border border-gray-800 px-4 py-1.5 text-xs text-gray-500 transition hover:border-sky-700 hover:text-sky-300"
            >
              🔍 {s.deep.askAny}
            </button>
          )}

          {dice === "idle" && (
            <>
              <button
                onClick={() => setDice("confirm")}
                disabled={slotsLeft <= 0}
                title={slotsLeft <= 0 ? s.choose.slotsFull : undefined}
                className="rounded-full border border-gray-700 px-4 py-1.5 text-xs text-gray-400 transition hover:border-emerald-600 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {s.choose.diceIdle}
              </button>
              {slotsLeft <= 0 && <span className="text-xs text-gray-600">{s.choose.slotsFull}</span>}
            </>
          )}
        </div>

        {askOpen && (
          <AskAnyGame
            s={s}
            locale={locale}
            busy={dives}
            onClose={() => setAskOpen(false)}
            onPick={(game) => {
              setAsked(game);
              deepDive(game.gameId);
            }}
          />
        )}
      </Reveal>

      {asked && dives[asked.gameId] === "loading" && <DeepDiveLoading s={s} />}

      {asked && dives[asked.gameId] && dives[asked.gameId] !== "loading" && (
        <DeepDivePanel
          value={dives[asked.gameId] as DeepDive | string}
          s={s}
          onRefresh={() => deepDive(asked.gameId, true)}
          onTake={
            actionFor(asked)
              ? undefined
              : () => take(asked.gameId, { title: asked.title, image: asked.headerImage })
          }
          taking={busy === `take-${asked.gameId}`}
          slotsLeft={slotsLeft}
          onReview={
            actionFor(asked) ? () => setSheet({ mode: actionFor(asked)!, item: asked }) : undefined
          }
          reviewLabel={asked.hasRecord ? s.deep.addToReview : s.deep.writeReview}
        />
      )}

      {sheet && (
        <ImpressionSheet
          mode={sheet.mode}
          gameId={sheet.item.gameId}
          gameTitle={sheet.item.title}
          gameImage={sheet.item.headerImage}
          currentPlaytime={sheet.item.playtimeMinutes}
          currentVerdict={sheet.item.verdict}
          locale={locale}
          onClose={() => setSheet(null)}
        />
      )}

      <Reveal delay={40}>
        <div className={dice === "idle" ? "" : "mb-8"}>
          {dice === "confirm" && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-900/70 bg-amber-950/20 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-200">{s.choose.diceTitle}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                  {s.choose.diceText(rollable.length, slotsLeft)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={roll}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-400"
                >
                  {s.choose.diceGo}
                </button>
                <button
                  onClick={() => setDice("idle")}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition hover:bg-gray-800"
                >
                  {s.choose.diceCancel}
                </button>
              </div>
            </div>
          )}

          {dice === "rolling" && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <span className="animate-spin text-lg">🎰</span>
              <span className="text-sm text-gray-400">{s.choose.diceRolling}</span>
            </div>
          )}
        </div>
      </Reveal>

      <div key={pick.gameId} className="grid items-center gap-10 md:grid-cols-[minmax(0,400px)_1fr]">
        <Reveal from="scale">
          <div className="relative">
            <div className={`absolute -inset-4 rounded-3xl ${tone.bg} opacity-15 blur-2xl`} />
            {pick.headerImage && (
              <img src={pick.headerImage} alt="" className="relative w-full rounded-2xl shadow-2xl shadow-black/60" />
            )}
          </div>
        </Reveal>

        <div>
          <Reveal delay={80} from="left">
            <div className="mb-3 flex items-center gap-3">
              <span className={`text-5xl leading-none font-black ${tone.accent}`}>{shownTier}</span>
              <span className="text-sm text-gray-500">
                {advisorHint(shownTier as any, locale)}
                <br />
                {pick.hours > 0 ? s.choose.playedHours(pick.hours) : s.choose.neverLaunched}
              </span>
            </div>
          </Reveal>
          <Reveal delay={160} from="left">
            <h2 className="mb-5 text-4xl leading-tight font-bold text-balance">{pick.title}</h2>
          </Reveal>
          <Reveal delay={240} from="left">
            <p className="max-w-lg text-lg leading-relaxed text-gray-400">
              <RichText text={pick.reason} />
            </p>
            {/* A quiet note rather than a banner: worth knowing, not worth alarming over */}
            {shownTier !== pick.tier && (
              <p className="mt-3 text-xs text-sky-400/80">{s.deep.revised(pick.tier, shownTier)}</p>
            )}
            {pick.grounding && pick.grounding !== "known" && (
              <p className="mt-3 text-xs text-gray-600">
                ⚠ {pick.grounding === "guess" ? s.choose.groundingGuess : s.choose.groundingDescription}
              </p>
            )}
          </Reveal>
          <Reveal delay={340} from="up">
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => take(pick.gameId)}
                disabled={busy !== null || slotsLeft <= 0}
                title={slotsLeft <= 0 ? s.choose.slotsFull : undefined}
                className="rounded-xl bg-white px-6 py-3 font-medium text-gray-950 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === `take-${pick.gameId}` ? s.choose.taking : s.choose.take}
              </button>
              <button
                onClick={() => deepDive(pick.gameId)}
                disabled={dives[pick.gameId] === "loading"}
                className="rounded-xl border border-gray-700 px-5 py-3 text-sm text-gray-300 transition hover:border-sky-700 hover:text-sky-300 disabled:opacity-40"
              >
                {dives[pick.gameId] === "loading" ? s.deep.loading : `🔍 ${s.deep.button}`}
              </button>
              <button
                onClick={() => setIndex((i) => (i + 1) % picks.length)}
                className="text-sm text-gray-500 transition hover:text-white"
              >
                {s.choose.next}
              </button>
            </div>
            {/*
              While slots are free, this is the rule of the game. Once they're
              taken the rule is useless: what's needed is why the button is dead
              and where to go next.
            */}
            {slotsLeft <= 0 ? (
              <p className="mt-3 max-w-lg text-xs text-amber-400/90">
                {s.choose.slotsFull}{" "}
                <button
                  onClick={() => onZone("now")}
                  className="underline underline-offset-2 transition hover:text-amber-300"
                >
                  {s.choose.takenGo}
                </button>
              </p>
            ) : (
              <p className="mt-3 max-w-lg text-xs text-gray-600">{s.choose.contractNote}</p>
            )}
          </Reveal>
        </div>
      </div>

      {dives[pick.gameId] === "loading" && <DeepDiveLoading s={s} />}

      {dives[pick.gameId] && dives[pick.gameId] !== "loading" && (
        <DeepDivePanel
          value={dives[pick.gameId] as DeepDive | string}
          s={s}
          onRefresh={() => deepDive(pick.gameId, true)}
          onTake={() => take(pick.gameId)}
          taking={busy === `take-${pick.gameId}`}
          slotsLeft={slotsLeft}
        />
      )}

      <Reveal delay={460} className="mt-12">
        <div className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2 filmstrip">
          {picks.map((item, i) => (
            <button
              key={item.gameId}
              onClick={() => setIndex(() => i)}
              title={item.title}
              className={`group relative w-32 shrink-0 snap-start overflow-hidden rounded-lg transition-all duration-300 ${
                i === index ? "opacity-100" : "opacity-40 hover:opacity-80"
              }`}
            >
              {item.headerImage && (
                <img src={item.headerImage} alt="" className="header-art w-full transition duration-500 group-hover:scale-105" />
              )}
              <span
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-500 ${
                  TIER_STYLE[tierOf(item)]?.bg
                } ${i === index ? "scale-x-100" : "scale-x-0"}`}
              />
            </button>
          ))}
        </div>
      </Reveal>

      {runProfile && (
        <Reveal delay={560} className="mt-10">
          <details className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-300">
              <CurioMark className="h-4 w-4 text-gray-600" />
              {s.choose.profileSummary}
            </summary>
            <div className="mt-3 space-y-3">
              {parseProfile(runProfile).map((line, i) =>
                line.heading ? (
                  <h3 key={i} className="pt-2 text-sm font-medium text-gray-200">
                    {line.text}
                  </h3>
                ) : (
                  <p key={i} className="text-sm leading-relaxed text-gray-400">
                    <RichText text={line.text} />
                  </p>
                )
              )}
            </div>
          </details>
        </Reveal>
      )}
    </>
  );
}

/**
 * The model answers in markdown: headings with hashes, game titles with
 * asterisks. The hashes and single asterisks used to go out to the screen as-is
 * — only `**` was stripped — and a portrait would open with the line
 * "### Your gaming portrait".
 */
function parseProfile(profile: string): { text: string; heading: boolean }[] {
  return profile
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const heading = /^#{1,6}\s+/.test(line);
      return {
        heading,
        // List bullets and hashes are markup, not text
        text: line.replace(/^#{1,6}\s+/, "").replace(/^[-•]\s+/, "").replace(/^\d+[.)]\s+/, ""),
      };
    });
}

interface LibraryGame {
  gameId: number;
  title: string;
  headerImage: string | null;
  playtimeMinutes: number;
  hours: number;
  verdict: string | null;
  hasRecord: boolean;
}

/**
 * Ask for an opinion on any game in the library, not only on what the model put
 * forward as a suggestion. The dive is the same — only the way of picking differs.
 */
function AskAnyGame({
  s,
  locale,
  busy,
  onPick,
  onClose,
}: {
  s: Dict;
  locale: Locale;
  busy: Record<number, unknown>;
  onPick: (game: LibraryGame) => void;
  onClose: () => void;
}) {
  const open = true;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LibraryGame[] | null>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setItems(null);
      return;
    }
    // People type faster than the server answers — wait for a pause and drop stale replies
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library-search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!stale) setItems(data.items ?? []);
      } catch {
        if (!stale) setItems([]);
      }
    }, 250);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  return (
    <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-sm font-medium">{s.deep.askAny}</span>
        <span className="text-xs text-gray-600">{s.deep.askAnyHint}</span>
        <button
          onClick={onClose}
          className="ml-auto text-xs text-gray-600 transition hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={s.deep.askPlaceholder}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm outline-none focus:border-gray-500"
      />

      {items !== null && (
        <div className="mt-2 max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-1 py-2 text-sm text-gray-600">{s.deep.askNothing}</p>
          ) : (
            items.map((game) => (
              <button
                key={game.gameId}
                onClick={() => onPick(game)}
                disabled={busy[game.gameId] === "loading"}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition hover:bg-gray-800/60 disabled:opacity-40"
              >
                {game.headerImage && (
                  <img src={game.headerImage} alt="" className="header-art w-16 shrink-0 rounded" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{game.title}</span>
                <span className="shrink-0 text-xs text-gray-600">
                  {game.verdict ? `${verdictLabel(game.verdict as any, locale)} · ` : ""}
                  {game.hours > 0 ? s.choose.hoursShort(game.hours) : s.deep.askNeverPlayed}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface DeepDive {
  fit: "yes" | "maybe" | "no";
  tier?: string | null;
  summary: string;
  forYou: string;
  against: string;
  complaints: string[];
  reviewsUsed?: number;
}

const FIT_STYLE: Record<DeepDive["fit"], string> = {
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
function DeepDiveLoading({ s }: { s: Dict }) {
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

function DeepDivePanel({
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

function Section({ title, text, accent }: { title: string; text: string; accent?: string }) {
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

interface RunProgressState {
  stage: "collecting" | "thinking" | "saving";
  picksReady: number;
  startedAt: number;
}

/** How many games a run usually yields — the bar grows against this number. */
const EXPECTED_PICKS = 30;

/*
 * The stages take wildly different amounts of time: collecting and saving are
 * seconds, the thinking takes nearly the whole minute. So 75% of the bar is
 * given to the thinking, and inside that span it moves by the number of games
 * already processed rather than by a timer.
 */
const STAGE_RANGE = {
  collecting: [0, 0.12],
  thinking: [0.12, 0.88],
  saving: [0.88, 1],
} as const;

function RunProgress({
  s,
  progress,
  onRestart,
}: {
  s: Dict;
  progress: RunProgressState | null;
  onRestart: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const stage = progress?.stage ?? "collecting";
  const picks = progress?.picksReady ?? 0;
  const elapsed = progress ? Math.max(0, Math.round((now - progress.startedAt) / 1000)) : 0;

  const [from, to] = STAGE_RANGE[stage];
  const within = stage === "thinking" ? Math.min(1, picks / EXPECTED_PICKS) : 0;
  const percent = Math.round((from + (to - from) * within) * 100);

  // A run that has been silent past this threshold won't come back to life on its own
  const stuck = elapsed > 300;

  return (
    <Reveal>
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="mb-6 text-sm tracking-[0.2em] text-gray-500 uppercase">{s.choose.eyebrow}</p>

        <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>

        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="flex items-center gap-2 text-gray-300">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {s.choose.runStages[stage]}
          </span>
          <span className="tabular-nums text-gray-600">{s.choose.runElapsed(elapsed)}</span>
        </div>

        <p className="text-sm text-gray-500">
          {stage === "thinking" && picks > 0 ? s.choose.runPicks(picks) : s.choose.runHint}
        </p>

        {stuck && (
          <div className="mt-8 border-t border-gray-800 pt-6">
            <p className="mb-3 text-sm text-amber-300">{s.choose.runStuck}</p>
            <button
              onClick={onRestart}
              className="rounded-xl border border-gray-700 px-5 py-2.5 text-sm transition hover:border-emerald-600 hover:text-emerald-300"
            >
              {s.choose.runRetry}
            </button>
          </div>
        )}
      </div>
    </Reveal>
  );
}

function GateCard({
  reviewCount,
  s,
  children,
}: {
  reviewCount: number;
  s: Dict;
  children?: React.ReactNode;
}) {
  const need = THRESHOLDS.MIN_REVIEWS_FOR_AI;
  const left = Math.max(0, need - reviewCount);
  return (
    <Reveal>
      <div className="mx-auto max-w-xl py-10 text-center">
        <p className="mb-6 text-sm tracking-[0.2em] text-gray-500 uppercase">{s.choose.eyebrow}</p>
        <h2 className="mb-4 text-3xl leading-tight font-bold">{s.choose.gateTitle(left)}</h2>
        <p className="mb-8 leading-relaxed text-gray-400">{s.choose.gateText}</p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000"
              style={{ width: `${(reviewCount / need) * 100}%` }}
            />
          </div>
          <span className="text-sm text-gray-500">
            {reviewCount} / {need}
          </span>
        </div>
        {children}
      </div>
    </Reveal>
  );
}

/** The blind roulette: without suggestions it's the only way to take a contract. */
function BlindSpin({
  poolSize,
  busy,
  onSpin,
  disabled,
  s,
}: {
  poolSize: number;
  busy: boolean;
  onSpin: () => void;
  disabled: boolean;
  s: Dict;
}) {
  return (
    <div className="mt-10 border-t border-gray-800 pt-6">
      <p className="mb-3 text-sm text-gray-500">{s.choose.blindText(poolSize)}</p>
      <button
        onClick={onSpin}
        disabled={busy || disabled}
        className="rounded-xl border border-gray-700 px-5 py-2.5 text-sm transition hover:border-emerald-600 hover:text-emerald-300 disabled:opacity-40"
      >
        {busy ? s.choose.blindBusy : s.choose.blindCta}
      </button>
      {disabled && <p className="mt-2 text-xs text-gray-600">{s.choose.blindFull}</p>}
    </div>
  );
}

function EmptyCard({
  reviewCount,
  onStart,
  busy,
  s,
  children,
}: {
  reviewCount: number;
  onStart: () => void;
  busy: boolean;
  s: Dict;
  children?: React.ReactNode;
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-xl py-10 text-center">
        <p className="mb-6 text-sm tracking-[0.2em] text-gray-500 uppercase">{s.choose.eyebrow}</p>
        <h2 className="mb-4 text-4xl leading-tight font-bold text-balance">
          {s.choose.emptyTitle(reviewCount)}
        </h2>
        <p className="mb-8 leading-relaxed text-gray-400">{s.choose.emptyText}</p>
        <button
          onClick={onStart}
          disabled={busy}
          className="rounded-xl bg-white px-7 py-3.5 font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
        >
          {busy ? s.choose.emptyBusy : s.choose.emptyCta}
        </button>
        <p className="mt-4 text-xs text-gray-600">{s.choose.emptyHint}</p>
        {children}
      </div>
    </Reveal>
  );
}

/* ================= NOW ================= */

function NowZone({
  slots,
  queue,
  updates,
  queueTotal,
  poolSize,
  freeSkips,
  locale,
  busy,
  setBusy,
  post,
}: ZoneProps & { onZone: (zone: Zone) => void }) {
  const s = t(locale);
  const [sheet, setSheet] = useState<{ mode: "slot-first" | "retro" | "entry"; item: any } | null>(
    null
  );
  const [skipping, setSkipping] = useState<Slot | null>(null);
  const [done, setDone] = useState<number[]>([]);

  async function verdict(gameId: number, value: string, playtimeMinutes: number) {
    setBusy(`verdict-${gameId}`);
    const ok = await post("/api/impression", {
      mode: "quick",
      gameId,
      verdict: value,
      playtimeMinutes,
    });
    setBusy(null);
    if (ok) setDone((prev) => [...prev, gameId]);
  }


  /*
   * This request is the only thing that moves playtime in the database: the rest
   * of the app reads the stored value so as not to poke Steam over every little
   * thing. Without the button a contract's progress would stand still forever.
   */
  async function refresh(slotId: number) {
    setBusy(`refresh-${slotId}`);
    const ok = await post("/api/refresh-playtime", { slotId });
    setBusy(null);
    if (ok) window.location.reload();
  }

  const free = Math.max(0, THRESHOLDS.MAX_ACTIVE_SLOTS - slots.length);
  const pending = queue.filter((game) => !done.includes(game.gameId));

  return (
    <div className="space-y-12">
      <section>
        <Reveal>
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-bold">{s.now.contracts}</h2>
            <span className="text-sm text-gray-500">
              {s.now.contractsCount(slots.length, poolSize)}
            </span>
          </div>
        </Reveal>

        <div className="grid gap-3 md:grid-cols-3">
          {slots.map((slot, i) => (
            <Reveal key={slot.slotId} delay={70 * i} from="scale">
              <article className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/50">
                {slot.image && <img src={slot.image} alt="" className="header-art w-full" />}
                <div className="p-4">
                  <p className="truncate font-medium">{slot.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {s.now.playedOf(formatPlaytime(slot.played, locale))}
                  </p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000"
                      style={{
                        width: `${Math.min(100, (slot.played / THRESHOLDS.MIN_PLAYTIME_TO_REVIEW) * 100)}%`,
                      }}
                    />
                  </div>
                  <button
                    onClick={() => setSheet({ mode: "slot-first", item: slot })}
                    className="mt-3 w-full rounded-lg border border-gray-700 py-1.5 text-xs text-gray-300 transition hover:bg-gray-800"
                  >
                    {s.now.record}
                  </button>
                  <div className="mt-2 flex gap-2 text-xs">
                    <button
                      onClick={() => refresh(slot.slotId)}
                      disabled={busy !== null}
                      className="flex-1 rounded-lg px-2 py-1 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300 disabled:opacity-40"
                    >
                      {busy === `refresh-${slot.slotId}` ? s.now.refreshing : s.now.refresh}
                    </button>
                    <button
                      onClick={() => setSkipping(slot)}
                      className="rounded-lg px-2 py-1 text-gray-600 transition hover:bg-gray-800 hover:text-amber-300"
                    >
                      {s.now.skip}
                    </button>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}

          {Array.from({ length: free }, (_, i) => (
            <Reveal key={`free-${i}`} delay={70 * (slots.length + i)} from="scale">
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-800 p-4 text-center">
                <span className="text-2xl opacity-40">🎰</span>
                <p className="text-sm text-gray-500">{s.now.freeSlot}</p>
                <p className="text-xs text-gray-700">{s.now.freeSlotHint}</p>
              </div>
            </Reveal>
          ))}
        </div>

      </section>

      {updates.length > 0 && (
        <section>
          <Reveal delay={150}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">{s.now.updates}</h2>
              <span className="text-sm text-gray-500">{s.now.updatesHint}</span>
            </div>
          </Reveal>

          <div className="grid gap-2 md:grid-cols-2">
            {updates.map((game, i) => (
              <Reveal key={game.gameId} delay={170 + 40 * i} from="left">
                <article className="flex items-center gap-3 rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-2.5">
                  {game.headerImage && (
                    <img src={game.headerImage} alt="" className="header-art w-24 shrink-0 rounded" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{game.title}</p>
                    <p className="text-xs text-indigo-300/80">
                      {s.now.updateDelta(formatPlaytime(game.delta, locale))}
                    </p>
                  </div>
                  <button
                    onClick={() => setSheet({ mode: "entry", item: game })}
                    className="ml-auto shrink-0 rounded-lg border border-indigo-800 px-3 py-1.5 text-xs text-indigo-200 transition hover:bg-indigo-950/60"
                  >
                    {s.now.addEntry}
                  </button>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <Reveal delay={200}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">{s.now.queue}</h2>
              <span className="text-sm text-gray-500">{s.now.queueCount(queueTotal)}</span>
            </div>
          </Reveal>

          <div className="grid gap-2 md:grid-cols-2">
            {pending.slice(0, 8).map((game, i) => (
              <Reveal key={game.gameId} delay={220 + 40 * i}>
                <QueueCard
                  game={game}
                  s={s}
                  locale={locale}
                  busy={busy !== null}
                  onVerdict={(value) => verdict(game.gameId, value, game.playtimeMinutes)}
                  onReview={() => setSheet({ mode: "retro", item: game })}
                />
              </Reveal>
            ))}
          </div>
        </section>
      )}


      {sheet && (
        <ImpressionSheet
          mode={sheet.mode}
          gameTitle={sheet.item.title}
          gameImage={sheet.item.image ?? sheet.item.headerImage}
          slotId={sheet.mode === "slot-first" ? sheet.item.slotId : undefined}
          gameId={sheet.mode === "slot-first" ? undefined : sheet.item.gameId}
          currentPlaytime={
            sheet.item.currentPlaytime ?? sheet.item.playtimeMinutes ?? sheet.item.played
          }
          lastRecordedPlaytime={sheet.item.lastRecordedPlaytime}
          currentVerdict={sheet.item.verdict}
          currentRating={sheet.item.rating}
          currentTier={sheet.item.tier}
          locale={locale}
          onClose={() => setSheet(null)}
        />
      )}

      {skipping && (
        <SkipModal
          slotId={skipping.slotId}
          gameTitle={skipping.title}
          freeSkips={freeSkips}
          locale={locale}
          onClose={() => setSkipping(null)}
        />
      )}
    </div>
  );
}

/**
 * A row in the triage queue.
 *
 * There are five verdicts, and laying them all out as buttons is impossible:
 * four of them already squashed the card so hard that the title came out as
 * "PUB…". Hence one button, with the statuses in a list on click; as a bonus all
 * five are reachable, not just the two common ones.
 */
function QueueCard({
  game,
  s,
  locale,
  busy,
  onVerdict,
  onReview,
}: {
  game: QueueItem;
  s: Dict;
  locale: Locale;
  busy: boolean;
  onVerdict: (value: string) => void;
  onReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);

  /*
   * The menu lives in a portal, not inside the card. Reveal animates transform
   * and opacity, and each of those creates a stacking context — a z-index inside
   * it has no effect on the outside, and the menu slid under the neighbouring
   * card.
   */
  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = button.current?.getBoundingClientRect();
      if (rect) setAt({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }

    place();
    // The menu is pinned to the viewport, so on scroll it has to be moved along
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <article className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-2.5">
      {game.headerImage && (
        <img src={game.headerImage} alt="" className="header-art w-24 shrink-0 rounded" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{game.title}</p>
        <p className="truncate text-xs text-gray-600">
          {formatPlaytime(game.playtimeMinutes, locale)}
          {game.hasReview && <span className="ml-2 text-emerald-500/80">· {s.now.hasReview}</span>}
        </p>
      </div>

      <button
        ref={button}
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
      >
        {s.now.setVerdict} ▾
      </button>

      {open && at && createPortal(
        <>
          {/* A click outside closes the menu — without this it only shuts on a second press */}
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div
            style={{ top: at.top, right: at.right }}
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-gray-700 bg-gray-950 py-1 shadow-xl shadow-black/60"
          >
            {verdicts(locale).map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setOpen(false);
                  onVerdict(option.value);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-300 transition hover:bg-gray-800"
              >
                <span>{option.icon}</span>
                {option.label}
              </button>
            ))}
            <div className="my-1 border-t border-gray-800" />
            <button
              onClick={() => {
                setOpen(false);
                onReview();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-400 transition hover:bg-gray-800"
            >
              <span>📝</span>
              {s.now.review}
            </button>
          </div>
        </>,
        document.body
      )}
    </article>
  );
}

/* ================= RECAP ================= */

function RecapZone({
  stats,
  tierGames,
  diary,
  demos,
  locale,
  post,
}: Props & { post: (url: string, body?: unknown) => Promise<boolean> }) {
  const s = t(locale);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  async function importSteam() {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/import-steam-reviews", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportResult(data.error ?? s.errors.generic);
        return;
      }
      /*
       * Importing and repairing dates are two different outcomes, and "nothing
       * was found" right after a hundred entries got their dates back would read
       * as a lie.
       */
      const parts = [
        data.imported > 0 ? s.recap.imported(data.imported) : null,
        data.redated > 0 ? s.recap.redated(data.redated) : null,
      ].filter(Boolean);

      if (parts.length > 0) {
        setImportResult(parts.join(" · "));
        setTimeout(() => window.location.reload(), 1600);
      } else {
        setImportResult(s.recap.importedNone);
      }
    } catch {
      setImportResult(s.errors.network);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-12">
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          {
            value: stats.totalGames,
            label: s.recap.statReviews,
            // What was imported is not the same as what was written here
            hint: stats.steamCount > 0
              ? s.recap.statSplit(stats.totalGames - stats.steamCount, stats.steamCount)
              : null,
          },
          { value: stats.totalLibrary, label: s.recap.statLibrary },
          { value: stats.streak, label: s.recap.statStreak },
          { value: stats.wallOfShame.length, label: s.recap.statShame },
        ].map((cell, i) => (
          <Reveal key={cell.label} delay={60 * i} from="scale">
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 text-center">
              <p className="text-3xl font-bold">{cell.value}</p>
              <p className="mt-1 text-xs text-gray-500">{cell.label}</p>
              {"hint" in cell && cell.hint && (
                <p className="mt-1 text-[10px] leading-tight text-gray-600">{cell.hint}</p>
              )}
            </div>
          </Reveal>
        ))}
      </section>

      <Reveal delay={120}>
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={importSteam}
              disabled={importing}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm transition hover:border-emerald-600 hover:text-emerald-300 disabled:opacity-40"
            >
              {importing ? s.recap.importing : s.recap.importSteam}
            </button>
            <span className="text-xs text-gray-600">{s.recap.importHint}</span>
          </div>
          {importResult && <p className="mt-3 text-sm text-emerald-400">{importResult}</p>}
        </div>
      </Reveal>

      <Reveal delay={200}>
        <TierBoard
          locale={locale}
          games={tierGames}
          onChange={(gameId, tier) => post("/api/set-tier", { gameId, tier })}
        />
      </Reveal>

      {diary.length > 0 && (
        <section>
          <Reveal delay={340}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">{s.recap.diary}</h2>
              <a href="/history" className="text-sm text-gray-500 transition hover:text-white">
                {s.recap.allDiary} &rarr;
              </a>
            </div>
          </Reveal>
          <ol className="relative border-l border-gray-800 pl-6">
            {diary.map((entry, i) => (
              <Reveal key={entry.id} delay={360 + 50 * i} from="left">
                <li className="relative mb-5">
                  <span className="absolute top-2 -left-[30px] h-2.5 w-2.5 rounded-full bg-gray-600" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{entry.title}</span>
                    <span className="text-xs text-gray-600">
                      {formatPlaytime(entry.playtimeMinutes, locale)}
                    </span>
                    {entry.verdict && (
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                        {verdictLabel(entry.verdict as any, locale)}
                      </span>
                    )}
                    {entry.tier && (
                      <span className={`text-xs font-bold ${TIER_STYLE[entry.tier as Tier]?.accent}`}>
                        {entry.tier}
                      </span>
                    )}
                    {entry.origin === "steam" && (
                      <span className="rounded border border-sky-900 px-1.5 py-0.5 text-[10px] text-sky-400/80">
                        {s.pages.fromSteam}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-gray-500">
                    {entry.note}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>
      )}

      {demos.length > 0 && (
        <section>
          <Reveal delay={560}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">{s.recap.demos}</h2>
              <a href="/demos" className="text-sm text-gray-500 transition hover:text-white">
                {s.recap.allDemos} &rarr;
              </a>
            </div>
          </Reveal>
          <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2 filmstrip">
            {demos.map((demo, i) => (
              <Reveal key={demo.gameId} delay={580 + 30 * i} from="scale">
                <article className="w-52 shrink-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
                  {demo.headerImage && (
                    <img src={demo.headerImage} alt="" className="header-art w-full" />
                  )}
                  <div className="p-3">
                    <div className="mb-1 flex items-center gap-2">
                      {demo.tier && (
                        <span className={`text-sm font-bold ${TIER_STYLE[demo.tier as Tier]?.accent}`}>
                          {demo.tier}
                        </span>
                      )}
                      <p className="truncate text-sm font-medium">{demo.title}</p>
                    </div>
                    <p className="line-clamp-3 text-xs leading-relaxed text-gray-500">{demo.note}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
