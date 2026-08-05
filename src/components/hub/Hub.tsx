import { useEffect, useRef, useState } from "react";
import Reveal from "../Reveal";
import RichText from "../RichText";
import TierBoard from "../TierBoard";
import ImpressionSheet from "../ImpressionSheet";
import {
  formatPlaytime,
  advisorHint,
  verdictLabel,
  worthLabel,
  TIER_STYLE,
  THRESHOLDS,
  type Tier,
} from "../../lib/vocab";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n";
import { t, type Dict } from "../../lib/strings";
import SkipModal from "../SkipModal";

export interface Pick {
  grounding?: "known" | "from-description" | "guess" | null;
  /** Итог разбора, если он делался: он может спорить с тиром первого прохода. */
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

export interface Abandoned {
  gameId: number;
  title: string;
  headerImage: string | null;
  stance: string;
  text: string;
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

export interface Props {
  picks: Pick[];
  abandoned: Abandoned[];
  slots: Slot[];
  queue: QueueItem[];
  queueTotal: number;
  tierGames: { gameId: number; title: string; image: string | null; tier: string | null }[];
  diary: DiaryEntry[];
  demos: { gameId: number; title: string; headerImage: string | null; tier: string | null; note: string | null }[];
  stats: { totalGames: number; totalLibrary: number; streak: number; wallOfShame: string[] };
  reviewCount: number;
  poolSize: number;
  freeSkips: number;
  runProfile: string | null;
  runDate: string | null;
  activeRunId: number | null;
  /** Состояние идущего прогона с сервера: первый кадр не должен врать про стадию. */
  activeRunProgress: RunProgressState | null;
  locale: Locale;
  /** Зона из адреса: сюда приходят редиректы со старых страниц. */
  initialZone: Zone;
}

export type Zone = "choose" | "now" | "recap";

const ZONE_GLOW: Record<Zone, string> = {
  choose: "bg-emerald-500",
  now: "bg-emerald-500",
  recap: "bg-sky-500",
};

export default function Hub(props: Props) {
  const { picks, slots, queueTotal, reviewCount, activeRunId, locale } = props;
  const s = t(locale);

  const [zone, setZone] = useState<Zone>(props.initialZone);

  /* Адрес должен переживать перезагрузку: половина действий делает reload. */
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
   * Прогон идёт в фоне. Опрос забирает не только «готово или нет», но и
   * стадию с числом разобранных игр — их бэкенд уже пишет в базу, а экран
   * раньше показывал вместо этого статичную полоску.
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
        // сеть моргнула — ждём следующего опроса
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
          <NowZone {...props} busy={busy} setBusy={setBusy} post={post} onZone={goTo} />
        )}
        {zone === "recap" && <RecapZone {...props} post={post} />}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-800/80 bg-gray-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl gap-2 px-6 py-3">
          <DockTile
            active={zone === "choose"}
            onClick={() => goTo("choose")}
            label={s.dock.choose}
            hint={s.dock.chooseHint(picks.length)}
          />
          <DockTile
            active={zone === "now"}
            onClick={() => goTo("now")}
            label={s.dock.now}
            hint={s.dock.nowHint(slots.length, queueTotal)}
            accent={queueTotal > 0}
          />
          <DockTile
            active={zone === "recap"}
            onClick={() => goTo("recap")}
            label={s.dock.recap}
            hint={s.dock.recapHint(reviewCount)}
          />
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

/* ================= ВЫБРАТЬ ================= */

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
}: ZoneProps & {
  index: number;
  setIndex: (fn: (i: number) => number) => void;
  runId: number | null;
  setRunId: (value: number | null) => void;
  progress: RunProgressState | null;
}) {
  const s = t(locale);
  const [dice, setDice] = useState<"idle" | "confirm" | "rolling">("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [dives, setDives] = useState<Record<number, DeepDive | "loading" | string>>({});

  /* Разбор кэшируется на сервере по паре (игрок, игра) — второй клик бесплатен. */
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
   * Раньше здесь был голый fetch без разбора ответа: любая ошибка — занятый
   * прогон, нехватка отзывов, упавший сервер — оставляла экран нетронутым,
   * и кнопка выглядела сломанной.
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

  const pick = picks[index]!;
  // Разбор видит механику, а не рекламу, поэтому его тир важнее
  const shownTier = (pick.deepTier ?? pick.tier) as Tier;
  const tone = TIER_STYLE[shownTier] ?? TIER_STYLE.B;

  async function take(gameId: number) {
    setBusy(`take-${gameId}`);
    const ok = await post("/api/contract", { gameId });
    setBusy(null);
    if (ok) window.location.reload();
  }

  /*
   * Жребий сразу создаёт контракт — иначе это просто перетасовка. Тир D
   * значит «не трать время», поэтому выпадать он не должен: жребий решает,
   * какую из хороших, а не какую-нибудь.
   */
  const rollable = picks
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => (item.deepTier ?? item.tier) !== "D" && item.deepFit !== "no");

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

      <Reveal delay={40}>
        <div className="mb-8">
          {dice === "idle" && (
            <>
              <button
                onClick={() => setDice("confirm")}
                disabled={slotsLeft <= 0}
                className="rounded-full border border-gray-700 px-4 py-1.5 text-xs text-gray-400 transition hover:border-emerald-600 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {s.choose.diceIdle}
              </button>
              {slotsLeft <= 0 && (
                <span className="ml-3 text-xs text-gray-600">{s.choose.slotsFull}</span>
              )}
            </>
          )}

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
            {/* Тихая пометка, а не баннер: важно знать, но не пугать */}
            {pick.deepTier && pick.deepTier !== pick.tier && (
              <p className="mt-3 text-xs text-sky-400/80">
                {s.deep.revised(pick.tier, pick.deepTier)}
              </p>
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
                className="rounded-xl bg-white px-6 py-3 font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
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
            <p className="mt-3 max-w-lg text-xs text-gray-600">{s.choose.contractNote}</p>
          </Reveal>
        </div>
      </div>

      {dives[pick.gameId] && dives[pick.gameId] !== "loading" && (
        <DeepDivePanel
          value={dives[pick.gameId] as DeepDive | string}
          s={s}
          onRefresh={() => deepDive(pick.gameId, true)}
        />
      )}

      <Reveal delay={460} className="mt-12">
        <div className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                <img src={item.headerImage} alt="" className="h-16 w-full object-cover transition duration-500 group-hover:scale-105" />
              )}
              <span
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-500 ${
                  TIER_STYLE[(item.deepTier ?? item.tier) as Tier]?.bg
                } ${i === index ? "scale-x-100" : "scale-x-0"}`}
              />
            </button>
          ))}
        </div>
      </Reveal>

      {runProfile && (
        <Reveal delay={560} className="mt-10">
          <details className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
            <summary className="cursor-pointer text-sm font-medium text-gray-300">
              {s.choose.profileSummary}
            </summary>
            <div className="mt-3 space-y-2">
              {runProfile
                .split("\n")
                .map((line) => line.trim().replace(/^[-*•\d.]+\s*/, "").replace(/\*\*/g, ""))
                .filter(Boolean)
                .map((line, i) => (
                  <p key={i} className="text-sm leading-relaxed text-gray-400">
                    {line}
                  </p>
                ))}
            </div>
          </details>
        </Reveal>
      )}
    </>
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

function DeepDivePanel({
  value,
  s,
  onRefresh,
}: {
  value: DeepDive | string;
  s: Dict;
  onRefresh: () => void;
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
                    — {item}
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
      <p className="text-sm leading-relaxed text-gray-300">{text}</p>
    </div>
  );
}

interface RunProgressState {
  stage: "collecting" | "thinking" | "saving";
  picksReady: number;
  startedAt: number;
}

/** Сколько игр обычно выдаёт прогон — по этому числу растёт полоса на разборе. */
const EXPECTED_PICKS = 30;

/*
 * Стадии занимают очень разное время: сбор и сохранение — секунды, разбор —
 * почти всю минуту. Поэтому на разбор отдано 75% полосы, и внутри неё она
 * движется по числу уже разобранных игр, а не по таймеру.
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

  // Прогон, который молчит дольше стального порога, уже не оживёт сам
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

/** Рулетка вслепую: без советов это единственный способ взять контракт. */
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

/* ================= СЕЙЧАС ================= */

function NowZone({
  slots,
  queue,
  queueTotal,
  abandoned,
  poolSize,
  freeSkips,
  locale,
  busy,
  setBusy,
  post,
}: ZoneProps & { onZone: (zone: Zone) => void }) {
  const s = t(locale);
  const [sheet, setSheet] = useState<{ mode: "slot-first" | "retro"; item: any } | null>(null);
  const [skipping, setSkipping] = useState<Slot | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [answered, setAnswered] = useState<number[]>([]);

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

  /* Оба ответа кладут аргумент модели в ленту игры — потом видно, чем кончилось. */
  async function answerAdvisor(item: Abandoned, accepted: boolean) {
    setBusy(`advisor-${item.gameId}`);
    await post("/api/advisor-response", {
      gameId: item.gameId,
      argument: item.text,
      accepted,
    });
    const ok = accepted ? await post("/api/contract", { gameId: item.gameId }) : true;
    setBusy(null);
    if (ok) {
      if (accepted) window.location.reload();
      else setAnswered((prev) => [...prev, item.gameId]);
    }
  }

  /*
   * Наигранное время в базе двигает только этот запрос: остальное приложение
   * читает сохранённое значение, чтобы не дёргать Steam на каждый чих. Без
   * кнопки прогресс контракта стоял бы на месте вечно.
   */
  async function refresh(slotId: number) {
    setBusy(`refresh-${slotId}`);
    const ok = await post("/api/refresh-playtime", { slotId });
    setBusy(null);
    if (ok) window.location.reload();
  }

  async function sync() {
    setBusy("sync");
    const ok = await post("/api/sync-library");
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
                {slot.image && <img src={slot.image} alt="" className="h-24 w-full object-cover" />}
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

        <button
          onClick={sync}
          disabled={busy !== null}
          className="mt-4 text-xs text-gray-600 transition hover:text-gray-300 disabled:opacity-40"
        >
          {busy === "sync" ? s.now.syncing : s.now.syncLibrary}
        </button>
      </section>

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
                <article className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-2.5">
                  {game.headerImage && (
                    <img src={game.headerImage} alt="" className="h-12 w-24 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{game.title}</p>
                    <p className="text-xs text-gray-600">
                      {formatPlaytime(game.playtimeMinutes, locale)}
                      {game.hasReview && (
                        <span className="ml-2 text-emerald-500/80">· {s.now.hasReview}</span>
                      )}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-1.5">
                    <button
                      onClick={() => verdict(game.gameId, "finished", game.playtimeMinutes)}
                      disabled={busy !== null}
                      className="rounded-lg border border-emerald-800 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-950/60 disabled:opacity-40"
                    >
                      {s.now.finished}
                    </button>
                    <button
                      onClick={() => verdict(game.gameId, "dropped", game.playtimeMinutes)}
                      disabled={busy !== null}
                      className="rounded-lg border border-red-900 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-950/50 disabled:opacity-40"
                    >
                      {s.now.dropped}
                    </button>
                    <button
                      onClick={() => setSheet({ mode: "retro", item: game })}
                      className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-400 transition hover:bg-gray-800"
                    >
                      {s.now.review}
                    </button>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {abandoned.length > 0 && (
        <section>
          <Reveal delay={340}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold text-amber-300">{s.now.dispute}</h2>
              <span className="text-sm text-gray-500">{s.now.disputeHint}</span>
            </div>
          </Reveal>

          <div className="space-y-2">
            {abandoned.filter((item) => !answered.includes(item.gameId)).map((item, i) => (
              <Reveal key={item.gameId} delay={360 + 40 * i} from="left">
                <article
                  className={`flex flex-wrap items-start gap-4 rounded-xl border p-4 ${
                    item.stance === "disagree"
                      ? "border-amber-900/70 bg-amber-950/20"
                      : "border-gray-800 bg-gray-900/30"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="font-medium">{item.title}</p>
                      <span className="text-xs text-gray-600">{s.choose.hoursShort(item.hours)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-gray-400">
                      <RichText text={item.text} />
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.stance === "disagree" ? (
                      <>
                        <button
                          onClick={() => answerAdvisor(item, true)}
                          disabled={busy !== null}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-400 disabled:opacity-40"
                        >
                          {s.now.secondChance}
                        </button>
                        <button
                          onClick={() => answerAdvisor(item, false)}
                          disabled={busy !== null}
                          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-800 disabled:opacity-40"
                        >
                          {s.now.imRight}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => answerAdvisor(item, false)}
                        disabled={busy !== null}
                        className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-500 transition hover:bg-gray-800 disabled:opacity-40"
                      >
                        {s.now.toDiary}
                      </button>
                    )}
                  </div>
                </article>
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
          gameId={sheet.mode === "retro" ? sheet.item.gameId : undefined}
          currentPlaytime={sheet.item.playtimeMinutes ?? sheet.item.played}
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

/* ================= ИТОГИ ================= */

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
      if (data.imported > 0) {
        setImportResult(s.recap.imported(data.imported));
        setTimeout(() => window.location.reload(), 1200);
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
          { value: stats.totalGames, label: s.recap.statReviews },
          { value: stats.totalLibrary, label: s.recap.statLibrary },
          { value: stats.streak, label: s.recap.statStreak },
          { value: stats.wallOfShame.length, label: s.recap.statShame },
        ].map((cell, i) => (
          <Reveal key={cell.label} delay={60 * i} from="scale">
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 text-center">
              <p className="text-3xl font-bold">{cell.value}</p>
              <p className="mt-1 text-xs text-gray-500">{cell.label}</p>
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
          <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {demos.map((demo, i) => (
              <Reveal key={demo.gameId} delay={580 + 30 * i} from="scale">
                <article className="w-52 shrink-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
                  {demo.headerImage && (
                    <img src={demo.headerImage} alt="" className="h-20 w-full object-cover" />
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
