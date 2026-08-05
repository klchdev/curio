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

export interface Pick {
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
  runProfile: string | null;
  runDate: string | null;
  activeRunId: number | null;
}

type Zone = "choose" | "now" | "recap";

const ZONE_GLOW: Record<Zone, string> = {
  choose: "bg-emerald-500",
  now: "bg-emerald-500",
  recap: "bg-sky-500",
};

export default function Hub(props: Props) {
  const { picks, slots, queue, queueTotal, reviewCount, activeRunId } = props;

  const [zone, setZone] = useState<Zone>("choose");
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<number | null>(activeRunId);

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

  // Прогон идёт в фоне — опрашиваем и перезагружаем страницу по готовности
  useEffect(() => {
    if (runId === null) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/recommendation-status?runId=${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "done") window.location.reload();
        if (data.status === "error") {
          setError(data.error ?? "Генерация не удалась");
          setRunId(null);
        }
      } catch {
        // сеть моргнула — ждём следующего опроса
      }
    }, 2500);
    return () => clearInterval(timer);
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
        setError(data.error ?? "Не получилось");
        return false;
      }
      return true;
    } catch {
      setError("Сеть не отвечает");
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
          />
        )}
        {zone === "now" && (
          <NowZone {...props} busy={busy} setBusy={setBusy} post={post} onZone={setZone} />
        )}
        {zone === "recap" && <RecapZone {...props} post={post} />}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-800/80 bg-gray-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl gap-2 px-6 py-3">
          <DockTile
            active={zone === "choose"}
            onClick={() => setZone("choose")}
            label="Выбрать"
            hint={picks.length > 0 ? `${picks.length} советов · жребий` : "советы ИИ"}
          />
          <DockTile
            active={zone === "now"}
            onClick={() => setZone("now")}
            label="Сейчас"
            hint={`${slots.length} из 3 контрактов · ${queueTotal} разобрать`}
            accent={queueTotal > 0}
          />
          <DockTile
            active={zone === "recap"}
            onClick={() => setZone("recap")}
            label="Итоги"
            hint={`${reviewCount} отзывов · тиры · дневник`}
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
  runProfile,
  runDate,
  index,
  setIndex,
  busy,
  setBusy,
  post,
  runId,
  setRunId,
}: ZoneProps & {
  index: number;
  setIndex: (fn: (i: number) => number) => void;
  runId: number | null;
  setRunId: (value: number | null) => void;
}) {
  const [dice, setDice] = useState<"idle" | "confirm" | "rolling">("idle");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const slotsLeft = THRESHOLDS.MAX_ACTIVE_SLOTS - slots.length;

  async function startRun() {
    setBusy("run");
    try {
      const res = await fetch("/api/generate-recommendations", { method: "POST" });
      const data = await res.json();
      if (res.ok) setRunId(data.runId);
    } finally {
      setBusy(null);
    }
  }

  if (runId !== null) return <RunProgress />;
  if (reviewCount < THRESHOLDS.MIN_REVIEWS_FOR_AI) return <GateCard reviewCount={reviewCount} />;
  if (picks.length === 0) {
    return <EmptyCard reviewCount={reviewCount} onStart={startRun} busy={busy === "run"} />;
  }

  const pick = picks[index]!;
  const tone = TIER_STYLE[pick.tier as Tier] ?? TIER_STYLE.B;

  async function take(gameId: number) {
    setBusy(`take-${gameId}`);
    const ok = await post("/api/contract", { gameId });
    setBusy(null);
    if (ok) window.location.reload();
  }

  /** Жребий сразу создаёт контракт — иначе это просто перетасовка. */
  function roll() {
    setDice("rolling");
    let ticks = 0;
    let landed = 0;
    timer.current = setInterval(() => {
      landed = Math.floor(Math.random() * picks.length);
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
          <h1 className="text-sm tracking-[0.2em] text-gray-500 uppercase">Что играть дальше</h1>
          <span className="text-xs text-gray-700">
            {index + 1} / {picks.length}
            {runDate && ` · собрано ${runDate}`}
          </span>
          <button
            onClick={startRun}
            disabled={busy === "run"}
            className="ml-auto rounded-full border border-gray-800 px-3 py-1 text-xs text-gray-500 transition hover:border-gray-600 hover:text-white disabled:opacity-40"
          >
            Пересобрать советы
          </button>
        </div>
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
                🎰 Не могу решить — брось жребий
              </button>
              {slotsLeft <= 0 && (
                <span className="ml-3 text-xs text-gray-600">
                  все три контракта заняты — закрой один
                </span>
              )}
            </>
          )}

          {dice === "confirm" && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-900/70 bg-amber-950/20 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-200">Жребий сразу создаст контракт</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                  Выпавшую игру нельзя будет просто пролистать: {THRESHOLDS.MIN_PLAYTIME_TO_REVIEW}{" "}
                  минут и первое впечатление, иначе придётся пропускать — а пропуск без причины
                  идёт на стену стыда. Свободных контрактов: {slotsLeft}.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={roll}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-400"
                >
                  Бросаю
                </button>
                <button
                  onClick={() => setDice("idle")}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition hover:bg-gray-800"
                >
                  Передумал
                </button>
              </div>
            </div>
          )}

          {dice === "rolling" && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <span className="animate-spin text-lg">🎰</span>
              <span className="text-sm text-gray-400">Жребий брошен, выбираю…</span>
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
              <span className={`text-5xl leading-none font-black ${tone.accent}`}>{pick.tier}</span>
              <span className="text-sm text-gray-500">
                {advisorHint(pick.tier as any)}
                <br />
                {pick.hours > 0 ? `наиграно ${pick.hours}ч` : "ни разу не запускал"}
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
          </Reveal>
          <Reveal delay={340} from="up">
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => take(pick.gameId)}
                disabled={busy !== null || slotsLeft <= 0}
                className="rounded-xl bg-white px-6 py-3 font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
              >
                {busy === `take-${pick.gameId}` ? "Беру…" : "Взять контракт"}
              </button>
              <button
                onClick={() => setIndex((i) => (i + 1) % picks.length)}
                className="text-sm text-gray-500 transition hover:text-white"
              >
                Дальше
              </button>
            </div>
            <p className="mt-3 max-w-lg text-xs text-gray-600">
              Контракт — обязательство сыграть минимум {THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} минут и
              записать первое впечатление. Одновременно их может быть {THRESHOLDS.MAX_ACTIVE_SLOTS}.
            </p>
          </Reveal>
        </div>
      </div>

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
                  TIER_STYLE[item.tier as Tier]?.bg
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
              Что видно по твоим отзывам
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

function RunProgress() {
  return (
    <Reveal>
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-800">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-600/70" />
        </div>
        <p className="text-sm text-gray-400">
          Читаю твои отзывы и раскладываю библиотеку по тирам. Занимает около минуты — можно уйти
          со страницы.
        </p>
      </div>
    </Reveal>
  );
}

function GateCard({ reviewCount }: { reviewCount: number }) {
  const need = THRESHOLDS.MIN_REVIEWS_FOR_AI;
  const left = Math.max(0, need - reviewCount);
  return (
    <Reveal>
      <div className="mx-auto max-w-xl py-10 text-center">
        <p className="mb-6 text-sm tracking-[0.2em] text-gray-500 uppercase">Что играть дальше</p>
        <h2 className="mb-4 text-3xl leading-tight font-bold">
          Ещё {left} {left === 1 ? "отзыв" : left < 5 ? "отзыва" : "отзывов"} — и я смогу советовать
        </h2>
        <p className="mb-8 leading-relaxed text-gray-400">
          Советы строятся на твоих словах, а не на жанрах. Пока отзывов мало, модели не за что
          зацепиться.
        </p>
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
      </div>
    </Reveal>
  );
}

function EmptyCard({
  reviewCount,
  onStart,
  busy,
}: {
  reviewCount: number;
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-xl py-10 text-center">
        <p className="mb-6 text-sm tracking-[0.2em] text-gray-500 uppercase">Что играть дальше</p>
        <h2 className="mb-4 text-4xl leading-tight font-bold text-balance">
          Разберём твой вкус по {reviewCount} отзывам
        </h2>
        <p className="mb-8 leading-relaxed text-gray-400">
          Модель прочитает всё, что ты написал, найдёт закономерности, которые ты сам не
          проговаривал, и разложит непройденное по тирам — с объяснением, почему именно тебе.
        </p>
        <button
          onClick={onStart}
          disabled={busy}
          className="rounded-xl bg-white px-7 py-3.5 font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
        >
          {busy ? "Запускаю…" : "Собрать рекомендации"}
        </button>
        <p className="mt-4 text-xs text-gray-600">Занимает около минуты · можно уйти со страницы</p>
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
  busy,
  setBusy,
  post,
}: ZoneProps & { onZone: (zone: Zone) => void }) {
  const [sheet, setSheet] = useState<{ mode: "slot-first" | "retro"; item: any } | null>(null);
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

  async function secondChance(gameId: number) {
    setBusy(`chance-${gameId}`);
    const ok = await post("/api/contract", { gameId });
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
            <h2 className="text-2xl font-bold">Активные контракты</h2>
            <span className="text-sm text-gray-500">
              {slots.length} из {THRESHOLDS.MAX_ACTIVE_SLOTS} · {poolSize} игр в пуле
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
                    {formatPlaytime(slot.played)} из {THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} мин
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
                    Записать впечатление
                  </button>
                </div>
              </article>
            </Reveal>
          ))}

          {Array.from({ length: free }, (_, i) => (
            <Reveal key={`free-${i}`} delay={70 * (slots.length + i)} from="scale">
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-800 p-4 text-center">
                <span className="text-2xl opacity-40">🎰</span>
                <p className="text-sm text-gray-500">Свободный контракт</p>
                <p className="text-xs text-gray-700">возьми из советов или брось жребий</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {pending.length > 0 && (
        <section>
          <Reveal delay={200}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">Требует ответа</h2>
              <span className="text-sm text-gray-500">
                {queueTotal} игр сыграно, но вердикта нет
              </span>
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
                    <p className="text-xs text-gray-600">{formatPlaytime(game.playtimeMinutes)}</p>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-1.5">
                    <button
                      onClick={() => verdict(game.gameId, "finished", game.playtimeMinutes)}
                      disabled={busy !== null}
                      className="rounded-lg border border-emerald-800 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-950/60 disabled:opacity-40"
                    >
                      Прошёл
                    </button>
                    <button
                      onClick={() => verdict(game.gameId, "dropped", game.playtimeMinutes)}
                      disabled={busy !== null}
                      className="rounded-lg border border-red-900 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-950/50 disabled:opacity-40"
                    >
                      Бросил
                    </button>
                    <button
                      onClick={() => setSheet({ mode: "retro", item: game })}
                      className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-400 transition hover:bg-gray-800"
                    >
                      Отзыв
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
              <h2 className="text-2xl font-bold text-amber-300">Спор о брошенном</h2>
              <span className="text-sm text-gray-500">модель не всегда с тобой согласна</span>
            </div>
          </Reveal>

          <div className="space-y-2">
            {abandoned.map((item, i) => (
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
                      <span className="text-xs text-gray-600">{item.hours}ч</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-gray-400">
                      <RichText text={item.text} />
                    </p>
                  </div>
                  {item.stance === "disagree" && (
                    <button
                      onClick={() => secondChance(item.gameId)}
                      disabled={busy !== null}
                      className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-400 disabled:opacity-40"
                    >
                      Дам второй шанс
                    </button>
                  )}
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
          onClose={() => setSheet(null)}
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
  post,
}: Props & { post: (url: string, body?: unknown) => Promise<boolean> }) {
  return (
    <div className="space-y-12">
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { value: stats.totalGames, label: "отзывов" },
          { value: stats.totalLibrary, label: "игр в библиотеке" },
          { value: stats.streak, label: "дней подряд" },
          { value: stats.wallOfShame.length, label: "на стене стыда" },
        ].map((cell, i) => (
          <Reveal key={cell.label} delay={60 * i} from="scale">
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 text-center">
              <p className="text-3xl font-bold">{cell.value}</p>
              <p className="mt-1 text-xs text-gray-500">{cell.label}</p>
            </div>
          </Reveal>
        ))}
      </section>

      <Reveal delay={200}>
        <TierBoard
          games={tierGames}
          onChange={(gameId, tier) => post("/api/set-tier", { gameId, tier })}
        />
      </Reveal>

      {diary.length > 0 && (
        <section>
          <Reveal delay={340}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">Дневник впечатлений</h2>
              <a href="/history" className="text-sm text-gray-500 transition hover:text-white">
                весь дневник &rarr;
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
                      {formatPlaytime(entry.playtimeMinutes)}
                    </span>
                    {entry.verdict && (
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                        {verdictLabel(entry.verdict as any)}
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
              <h2 className="text-2xl font-bold">Демки</h2>
              <a href="/demos" className="text-sm text-gray-500 transition hover:text-white">
                все демки &rarr;
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
