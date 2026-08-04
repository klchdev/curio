import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";
import RichText from "./RichText";
import TierBoard from "./TierBoard";

interface Pick {
  gameId: number;
  title: string;
  headerImage: string | null;
  tier: string;
  reason: string;
  hours: number;
}

interface Slot {
  slotId: number;
  title: string;
  image: string | null;
  played: number;
}

interface QueueItem {
  gameId: number;
  title: string;
  headerImage: string | null;
  hours: number;
}

interface DiaryEntry {
  id: string;
  title: string;
  image: string | null;
  note: string;
  playtimeMinutes: number;
  verdict: string | null;
  tier: string | null;
}

interface Demo {
  gameId: number;
  title: string;
  headerImage: string | null;
  tier: string | null;
  note: string | null;
}

interface Abandoned {
  gameId: number;
  title: string;
  stance: string;
  text: string;
  hours: number;
}

interface Props {
  picks: Pick[];
  abandoned: Abandoned[];
  slots: Slot[];
  queue: QueueItem[];
  diary: DiaryEntry[];
  demos: Demo[];
  tierCounts: Record<string, number>;
  shelf: { gameId: number; title: string; image: string | null; tier: string | null }[];
  poolSize: number;
  poolPreview: { title: string; image: string | null }[];
  reviewCount: number;
  stats: { totalGames: number; totalLibrary: number; streak: number; wallOfShame: string[] };
  /** Для макетов пустых состояний: ready — есть прогон, empty — не запускал, gate — мало отзывов */
  demoState?: "ready" | "empty" | "gate";
}

type Zone = "choose" | "now" | "recap";

/** Сколько отзывов нужно, чтобы советы опирались на вкус, а не на жанровое сходство. */
const MIN_REVIEWS = 10;

const TIER: Record<string, { glow: string; text: string; bar: string; label: string }> = {
  S: { glow: "bg-yellow-500", text: "text-yellow-400", bar: "bg-yellow-500", label: "Бросай текущее" },
  A: { glow: "bg-emerald-500", text: "text-emerald-400", bar: "bg-emerald-500", label: "Очень вероятно зайдёт" },
  B: { glow: "bg-sky-500", text: "text-sky-400", bar: "bg-sky-500", label: "Стоит попробовать" },
  C: { glow: "bg-orange-500", text: "text-orange-400", bar: "bg-orange-500", label: "Под настроение" },
  D: { glow: "bg-red-500", text: "text-red-400", bar: "bg-red-500", label: "Не трать время" },
};

const VERDICT_LABEL: Record<string, string> = {
  finished: "прошёл",
  dropped: "бросил",
  playing: "играю",
  later: "вернусь",
};

const NO_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.round((minutes / 60) * 10) / 10} ч`;
}

export default function Stage(props: Props) {
  const { picks, slots, queue, poolPreview, reviewCount, demoState = "ready" } = props;

  const [zone, setZone] = useState<Zone>("choose");
  const [index, setIndex] = useState(0);
  const [contracts, setContracts] = useState<number[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);

  const visiblePicks = picks.filter((p) => !dismissed.includes(p.gameId));
  const pick = visiblePicks[Math.min(index, visiblePicks.length - 1)];
  const tone = TIER[pick?.tier] ?? TIER.B;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (zone !== "choose" || visiblePicks.length === 0) return;
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % visiblePicks.length);
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + visiblePicks.length) % visiblePicks.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zone, visiblePicks.length]);

  const backdrop = zone === "choose" ? pick?.headerImage : zone === "now" ? slots[0]?.image : null;
  const glow = zone === "choose" ? tone.glow : zone === "now" ? "bg-emerald-500" : "bg-sky-500";

  return (
    <div className="relative pb-32">
      {/* Атмосфера на весь экран, края гасятся радиальной маской */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {backdrop && demoState === "ready" && (
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

      <div key={zone} className="min-h-[28rem]">
        {zone === "choose" && (
          <ChooseZone
            {...props}
            demoState={demoState}
            picks={visiblePicks}
            index={Math.min(index, Math.max(0, visiblePicks.length - 1))}
            setIndex={setIndex}
            contracts={contracts}
            onTakeContract={(gameId, options) => {
              setContracts((prev) => (prev.includes(gameId) ? prev : [...prev, gameId]));
              // после жребия остаёмся на выпавшей игре, после ручного выбора листаем дальше
              if (options?.advance !== false) {
                setIndex((i) => (i + 1) % Math.max(1, visiblePicks.length));
              }
            }}
            onDismiss={(gameId) => setDismissed((prev) => [...prev, gameId])}
            poolPreview={poolPreview}
            reviewCount={reviewCount}
          />
        )}
        {zone === "now" && <NowZone {...props} extraContracts={contracts.length} />}
        {zone === "recap" && <RecapZone {...props} />}
      </div>

      {/* Док: закреплён внизу, не уезжает вместе со страницей */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-800/80 bg-gray-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl gap-2 px-6 py-3">
          <DockTile
            active={zone === "choose"}
            onClick={() => setZone("choose")}
            label="Выбрать"
            hint={demoState === "ready" ? `${visiblePicks.length} советов · жребий` : "советы ИИ"}
            accent="text-white"
          />
          <DockTile
            active={zone === "now"}
            onClick={() => setZone("now")}
            label="Сейчас"
            hint={`${slots.length + contracts.length} контрактов · ${queue.length} разобрать`}
            accent={queue.length > 0 ? "text-amber-400" : "text-white"}
          />
          <DockTile
            active={zone === "recap"}
            onClick={() => setZone("recap")}
            label="Итоги"
            hint={`${reviewCount} отзывов · тиры · демки`}
            accent="text-white"
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
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border px-4 py-2.5 text-left transition duration-300 ${
        active
          ? "border-gray-600 bg-gray-900"
          : "border-transparent hover:border-gray-800 hover:bg-gray-900/50"
      }`}
    >
      <span className={`block text-sm font-medium ${active ? accent : "text-gray-400"}`}>
        {label}
      </span>
      <span className="block truncate text-xs text-gray-600">{hint}</span>
    </button>
  );
}

/* ================= ЗОНА: ВЫБРАТЬ ================= */

function ChooseZone({
  picks,
  index,
  setIndex,
  contracts,
  onTakeContract,
  onDismiss,
  poolPreview,
  reviewCount,
  demoState,
}: Props & {
  index: number;
  setIndex: (fn: (i: number) => number) => void;
  contracts: number[];
  onTakeContract: (gameId: number, options?: { advance?: boolean }) => void;
  onDismiss: (gameId: number) => void;
}) {
  const [dice, setDice] = useState<"idle" | "confirm" | "rolling" | "landed">("idle");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  if (demoState === "gate") return <GateCard reviewCount={Math.min(reviewCount, 7)} />;
  if (demoState === "empty") return <EmptyCard reviewCount={reviewCount} />;

  const pick = picks[index];
  if (!pick) return <EmptyCard reviewCount={reviewCount} />;
  const tone = TIER[pick.tier] ?? TIER.B;

  const usedContracts = slots.length + contracts.length;
  const contractsFull = usedContracts >= 3;

  /**
   * Жребий бросается между советами ИИ, а не по всей библиотеке, и сразу
   * создаёт контракт — иначе это просто перетасовка без последствий.
   */
  function rollDice() {
    if (dice === "rolling" || picks.length < 2) return;
    setDice("rolling");
    let ticks = 0;
    let landedIndex = 0;
    timer.current = setInterval(() => {
      landedIndex = Math.floor(Math.random() * picks.length);
      setIndex(() => landedIndex);
      ticks += 1;
      if (ticks > 18 && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
        onTakeContract(picks[landedIndex]!.gameId, { advance: false });
        setDice("landed");
      }
    }, 85);
  }

  return (
    <>
      <Reveal>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-sm tracking-[0.2em] text-gray-500 uppercase">Что играть дальше</h1>
          <span className="text-xs text-gray-700">
            {index + 1} / {picks.length} · листай стрелками
          </span>
          <button className="ml-auto rounded-full border border-gray-800 px-3 py-1 text-xs text-gray-500 transition hover:border-gray-600 hover:text-white">
            Пересобрать советы
          </button>
        </div>
      </Reveal>

      {/* Жребий: у него есть последствия, поэтому предупреждаем до броска */}
      <Reveal delay={40}>
        <div className="mb-8">
          {dice === "idle" && (
            <button
              onClick={() => setDice("confirm")}
              disabled={contractsFull}
              className="rounded-full border border-gray-700 px-4 py-1.5 text-xs text-gray-400 transition hover:border-emerald-600 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
              title={contractsFull ? "Все три контракта заняты" : undefined}
            >
              🎰 Не могу решить — брось жребий
            </button>
          )}

          {contractsFull && dice === "idle" && (
            <span className="ml-3 text-xs text-gray-600">
              все три контракта заняты — закрой один, чтобы бросать
            </span>
          )}

          {dice === "confirm" && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-900/70 bg-amber-950/20 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-200">
                  Жребий сразу создаст контракт
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                  Выпавшую игру нельзя будет просто пролистать: 20 минут и первое впечатление,
                  иначе придётся пропускать — а пропуск без причины идёт на стену стыда.
                  Останется {3 - usedContracts} свободных контракта.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={rollDice}
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

          {dice === "landed" && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-800/70 bg-emerald-950/25 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-emerald-200">
                  Контракт создан: {pick.title}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Жребий выбрал за тебя. 20 минут и первое впечатление — и слот освободится.
                </p>
              </div>
              <button
                onClick={() => setDice("idle")}
                className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-gray-800"
              >
                Понял
              </button>
            </div>
          )}
        </div>
      </Reveal>

      <div key={pick.gameId} className={`grid items-center gap-10 md:grid-cols-[minmax(0,400px)_1fr] ${rolling ? "opacity-80" : ""}`}>
        <Reveal from="scale">
          <div className="relative">
            <div className={`absolute -inset-4 rounded-3xl ${tone.glow} opacity-15 blur-2xl`} />
            {pick.headerImage && (
              <img src={pick.headerImage} alt="" className="relative w-full rounded-2xl shadow-2xl shadow-black/60" />
            )}
          </div>
        </Reveal>

        <div>
          <Reveal delay={80} from="left">
            <div className="mb-3 flex items-center gap-3">
              <span className={`text-5xl leading-none font-black ${tone.text}`}>{pick.tier}</span>
              <span className="text-sm text-gray-500">
                {tone.label}
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
                onClick={() => onTakeContract(pick.gameId)}
                className="rounded-xl bg-white px-6 py-3 font-medium text-gray-950 transition hover:scale-[1.02]"
              >
                {contracts.includes(pick.gameId) ? "Контракт взят" : "Взять контракт"}
              </button>
              <button
                onClick={() => onDismiss(pick.gameId)}
                className="text-sm text-gray-500 transition hover:text-white"
              >
                Не интересно
              </button>
            </div>
            <p className="mt-3 max-w-lg text-xs text-gray-600">
              Контракт — обязательство сыграть минимум 20 минут и написать первое впечатление.
              Одновременно их может быть три.
            </p>
          </Reveal>
        </div>
      </div>

      <Reveal delay={460} className="mt-12">
        <div className={`-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2 ${NO_SCROLLBAR}`}>
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
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-500 ${TIER[item.tier]?.bar} ${
                  i === index ? "scale-x-100" : "scale-x-0"
                }`}
              />
              {contracts.includes(item.gameId) && (
                <span className="absolute inset-0 bg-emerald-950/70 text-[10px] font-bold text-emerald-300">
                  <span className="absolute right-1 bottom-1">контракт</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </Reveal>
    </>
  );
}

/** Мало отзывов — советовать не на чем. Показываем прогресс, а не отказ. */
function GateCard({ reviewCount }: { reviewCount: number }) {
  const left = Math.max(0, MIN_REVIEWS - reviewCount);

  return (
    <Reveal>
      <div className="mx-auto max-w-xl py-10 text-center">
        <p className="mb-6 text-sm tracking-[0.2em] text-gray-500 uppercase">Что играть дальше</p>
        <h2 className="mb-4 text-3xl leading-tight font-bold">
          Ещё {left} {left === 1 ? "отзыв" : left < 5 ? "отзыва" : "отзывов"} — и я смогу советовать
        </h2>
        <p className="mb-8 leading-relaxed text-gray-400">
          Советы строятся на твоих словах, а не на жанрах. Пока отзывов мало, модели не за что
          зацепиться и она скатывается в «похоже по тегам».
        </p>

        <div className="mb-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000"
              style={{ width: `${(reviewCount / MIN_REVIEWS) * 100}%` }}
            />
          </div>
          <span className="text-sm text-gray-500">
            {reviewCount} / {MIN_REVIEWS}
          </span>
        </div>

        <button className="mt-6 rounded-xl bg-white px-6 py-3 font-medium text-gray-950 transition hover:scale-[1.02]">
          Написать отзыв
        </button>
        <p className="mt-3 text-xs text-gray-600">
          Быстрее всего — разобрать сыгранное: там уже ждут игры с наигранными часами.
        </p>
      </div>
    </Reveal>
  );
}

/** Отзывов хватает, но прогон ни разу не запускали. */
function EmptyCard({ reviewCount }: { reviewCount: number }) {
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

        <button className="rounded-xl bg-white px-7 py-3.5 font-medium text-gray-950 transition hover:scale-[1.02]">
          Собрать рекомендации
        </button>
        <p className="mt-4 text-xs text-gray-600">Занимает около минуты · можно уйти со страницы</p>

        <div className="mt-10 grid gap-3 text-left sm:grid-cols-3">
          {[
            ["Что советует", "только нетронутое или запущенное на пару минут"],
            ["Почему именно это", "ссылается на твои же отзывы по названиям"],
            ["С чем спорит", "разбирает брошенное и иногда доказывает, что ты неправ"],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
              <p className="mb-1 text-sm font-medium">{title}</p>
              <p className="text-xs leading-relaxed text-gray-500">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ================= ЗОНА: СЕЙЧАС ================= */

function NowZone({
  slots,
  queue,
  abandoned,
  poolSize,
  extraContracts,
}: Props & { extraContracts: number }) {
  const free = Math.max(0, 3 - slots.length - extraContracts);

  return (
    <div className="space-y-12">
      <section>
        <Reveal>
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-bold">Активные контракты</h2>
            <span className="text-sm text-gray-500">
              {slots.length + extraContracts} из 3 · {poolSize} игр в пуле
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
                  <p className="mt-1 text-xs text-gray-500">{formatPlaytime(slot.played)} с начала</p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000"
                      style={{ width: `${Math.min(100, (slot.played / 20) * 100)}%` }}
                    />
                  </div>
                  <button className="mt-3 w-full rounded-lg border border-gray-700 py-1.5 text-xs text-gray-300 transition hover:bg-gray-800">
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

      {queue.length > 0 && (
        <section>
          <Reveal delay={200}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">Требует ответа</h2>
              <span className="text-sm text-gray-500">
                {queue.length} игр сыграно, но вердикта нет
              </span>
            </div>
          </Reveal>

          <div className="grid gap-2 md:grid-cols-2">
            {queue.slice(0, 6).map((game, i) => (
              <Reveal key={game.gameId} delay={220 + 50 * i}>
                <article className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-2.5">
                  {game.headerImage && (
                    <img src={game.headerImage} alt="" className="h-12 w-24 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{game.title}</p>
                    <p className="text-xs text-gray-600">{game.hours}ч</p>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-1.5">
                    <button className="rounded-lg border border-emerald-800 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-950/60">
                      Прошёл
                    </button>
                    <button className="rounded-lg border border-red-900 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-950/50">
                      Бросил
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
              <Reveal key={item.gameId} delay={360 + 50 * i} from="left">
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

                  {/* Раньше это был просто текст — теперь с ним можно что-то сделать */}
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.stance === "disagree" ? (
                      <>
                        <button className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-400">
                          Дам второй шанс
                        </button>
                        <button className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-800">
                          Нет, я прав
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-gray-800">
                          Дописать отзыв
                        </button>
                        <button className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-500 transition hover:bg-gray-800">
                          Скрыть
                        </button>
                      </>
                    )}
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

/* ================= ЗОНА: ИТОГИ ================= */

function RecapZone({ diary, shelf, demos, stats }: Props) {

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
        <TierBoard games={shelf} />
      </Reveal>

      {diary.length > 0 && (
        <section>
          <Reveal delay={420}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">Дневник впечатлений</h2>
              <span className="text-sm text-gray-500">со штампом наигранного времени</span>
            </div>
          </Reveal>
          <ol className="relative border-l border-gray-800 pl-6">
            {diary.map((entry, i) => (
              <Reveal key={entry.id} delay={440 + 60 * i} from="left">
                <li className="relative mb-5">
                  <span className="absolute top-2 -left-[30px] h-2.5 w-2.5 rounded-full bg-gray-600" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{entry.title}</span>
                    <span className="text-xs text-gray-600">{formatPlaytime(entry.playtimeMinutes)}</span>
                    {entry.verdict && (
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                        {VERDICT_LABEL[entry.verdict] ?? entry.verdict}
                      </span>
                    )}
                    {entry.tier && (
                      <span className={`text-xs font-bold ${TIER[entry.tier]?.text}`}>{entry.tier}</span>
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
          <Reveal delay={620}>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">Демки</h2>
              <span className="text-sm text-gray-500">короткие вердикты с фестивалей</span>
            </div>
          </Reveal>
          <div className={`-mx-6 flex gap-3 overflow-x-auto px-6 pb-2 ${NO_SCROLLBAR}`}>
            {demos.map((demo, i) => (
              <Reveal key={demo.gameId} delay={640 + 40 * i} from="scale">
                <article className="w-52 shrink-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
                  {demo.headerImage && <img src={demo.headerImage} alt="" className="h-20 w-full object-cover" />}
                  <div className="p-3">
                    <div className="mb-1 flex items-center gap-2">
                      {demo.tier && (
                        <span className={`text-sm font-bold ${TIER[demo.tier]?.text}`}>{demo.tier}</span>
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
