import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";
import RichText from "./RichText";

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
  rating: number | null;
  note: string | null;
}

interface Props {
  picks: Pick[];
  abandoned: { gameId: number; title: string; stance: string; text: string; hours: number }[];
  slots: Slot[];
  queue: QueueItem[];
  diary: DiaryEntry[];
  demos: Demo[];
  tierCounts: Record<string, number>;
  poolSize: number;
  poolPreview: { title: string; image: string | null }[];
  stats: { totalGames: number; totalLibrary: number; streak: number; wallOfShame: string[] };
}

type Act = "advice" | "roulette" | "queue" | "diary" | "tiers" | "demos" | "profile";

/** Тир — источник цвета в режиме советов. */
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

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.round((minutes / 60) * 10) / 10} ч`;
}

export default function Stage(props: Props) {
  const { picks, abandoned, slots, queue, diary, demos, tierCounts, poolSize, poolPreview, stats } =
    props;

  const [act, setAct] = useState<Act>("advice");
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState<number[]>([]);

  const pick = picks[index];
  const tone = TIER[pick?.tier] ?? TIER.B;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (act !== "advice" || picks.length === 0) return;
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % picks.length);
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + picks.length) % picks.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, picks.length]);

  // Фоновый арт зависит от того, что сейчас на сцене
  const backdrop =
    act === "advice" ? pick?.headerImage : act === "roulette" ? slots[0]?.image : null;
  const glow =
    act === "advice" ? tone.glow : act === "roulette" ? "bg-emerald-500" : act === "queue" ? "bg-amber-500" : "bg-sky-500";

  return (
    <div className="relative">
      {/* Атмосфера на весь экран, края гасятся радиальной маской */}
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

      {/* Сцена: один режим за раз, key перезапускает каскад появления */}
      <div key={act} className="min-h-[26rem]">
        {act === "advice" && (
          <AdviceAct
            picks={picks}
            index={index}
            setIndex={setIndex}
            taken={taken}
            setTaken={setTaken}
            abandonedCount={abandoned.length}
            onOpenAbandoned={() => setAct("queue")}
          />
        )}
        {act === "roulette" && (
          <RouletteAct slots={slots} poolSize={poolSize} poolPreview={poolPreview} />
        )}
        {act === "queue" && <QueueAct queue={queue} abandoned={abandoned} />}
        {act === "diary" && <DiaryAct diary={diary} />}
        {act === "tiers" && <TiersAct tierCounts={tierCounts} />}
        {act === "demos" && <DemosAct demos={demos} />}
        {act === "profile" && <ProfileAct stats={stats} />}
      </div>

      {/* Ряд режимов: не ссылки, а живые плитки с состоянием */}
      <Reveal delay={400} className="mt-14">
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-2">
          <ModeTile active={act === "advice"} onClick={() => setAct("advice")} label="Советы">
            <span className="text-2xl font-bold">{picks.length}</span>
            <span className="text-xs text-gray-500">игр разобрано ИИ</span>
          </ModeTile>

          <ModeTile active={act === "roulette"} onClick={() => setAct("roulette")} label="Рулетка">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={`h-6 w-4 rounded-sm ${i < slots.length ? "bg-emerald-500" : "border border-dashed border-gray-700"}`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500">{poolSize} в пуле</span>
          </ModeTile>

          <ModeTile active={act === "queue"} onClick={() => setAct("queue")} label="Разобрать">
            <span className="text-2xl font-bold text-amber-400">{queue.length}</span>
            <span className="text-xs text-gray-500">без вердикта</span>
          </ModeTile>

          <ModeTile active={act === "diary"} onClick={() => setAct("diary")} label="Дневник">
            <span className="line-clamp-1 text-sm text-gray-300">{diary[0]?.title ?? "—"}</span>
            <span className="text-xs text-gray-500">последняя запись</span>
          </ModeTile>

          <ModeTile active={act === "tiers"} onClick={() => setAct("tiers")} label="Тиры">
            <div className="flex h-6 items-end gap-0.5">
              {["S", "A", "B", "C", "D", "F"].map((tier) => (
                <span
                  key={tier}
                  className={`w-2 rounded-sm ${TIER[tier]?.bar ?? "bg-rose-800"}`}
                  style={{ height: `${Math.min(100, (tierCounts[tier] ?? 0) * 4 + 8)}%` }}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {Object.values(tierCounts).reduce((a, b) => a + b, 0)} с тиром
            </span>
          </ModeTile>

          <ModeTile active={act === "demos"} onClick={() => setAct("demos")} label="Демки">
            <span className="text-2xl font-bold">{demos.length}</span>
            <span className="text-xs text-gray-500">с Next Fest</span>
          </ModeTile>

          <ModeTile active={act === "profile"} onClick={() => setAct("profile")} label="Профиль">
            <span className="text-2xl font-bold">{stats.totalGames}</span>
            <span className="text-xs text-gray-500">отзывов</span>
          </ModeTile>
        </div>
      </Reveal>
    </div>
  );
}

/* ---------- Ряд режимов ---------- */

function ModeTile({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-36 shrink-0 flex-col gap-1 rounded-xl border p-3 text-left transition duration-300 ${
        active
          ? "-translate-y-1 border-gray-600 bg-gray-900"
          : "border-gray-800/80 bg-gray-900/30 hover:-translate-y-0.5 hover:border-gray-700"
      }`}
    >
      <span className="text-xs tracking-wide text-gray-500 uppercase">{label}</span>
      {children}
    </button>
  );
}

/* ---------- Акт: советы ---------- */

function AdviceAct({
  picks,
  index,
  setIndex,
  taken,
  setTaken,
  abandonedCount,
  onOpenAbandoned,
}: {
  picks: Pick[];
  index: number;
  setIndex: (fn: (i: number) => number) => void;
  taken: number[];
  setTaken: (fn: (prev: number[]) => number[]) => void;
  abandonedCount: number;
  onOpenAbandoned: () => void;
}) {
  const pick = picks[index];
  if (!pick) return <Empty text="Советов пока нет — собери прогон." />;
  const tone = TIER[pick.tier] ?? TIER.B;

  return (
    <>
      <div key={pick.gameId} className="grid items-center gap-10 md:grid-cols-[minmax(0,400px)_1fr]">
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
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  setTaken((prev) => [...prev, pick.gameId]);
                  setIndex((i) => (i + 1) % picks.length);
                }}
                className="rounded-xl bg-white px-6 py-3 font-medium text-gray-950 transition hover:scale-[1.02]"
              >
                {taken.includes(pick.gameId) ? "Уже в слоте" : "Беру в слот"}
              </button>
              <button
                onClick={() => setIndex((i) => (i + 1) % picks.length)}
                className="rounded-xl border border-gray-700 px-5 py-3 text-gray-300 transition hover:border-gray-500 hover:text-white"
              >
                Дальше
              </button>
              {abandonedCount > 0 && (
                <button onClick={onOpenAbandoned} className="px-2 text-sm text-amber-400/80 transition hover:text-amber-300">
                  Спор о брошенном ({abandonedCount})
                </button>
              )}
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal delay={460} className="mt-12">
        <div className="mb-3 flex items-baseline justify-between text-sm">
          <span className="text-gray-500">Ещё советы</span>
          <span className="text-gray-700">{index + 1} / {picks.length} · листай стрелками</span>
        </div>
        <div className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-3">
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
                <img src={item.headerImage} alt="" className="h-18 w-full object-cover transition duration-500 group-hover:scale-105" />
              )}
              <span
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-500 ${TIER[item.tier]?.bar} ${
                  i === index ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </button>
          ))}
        </div>
      </Reveal>
    </>
  );
}

/* ---------- Акт: рулетка ---------- */

function RouletteAct({
  slots,
  poolSize,
  poolPreview,
}: {
  slots: Slot[];
  poolSize: number;
  poolPreview: { title: string; image: string | null }[];
}) {
  const [reel, setReel] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function spin() {
    if (poolPreview.length === 0 || timer.current) return;
    let ticks = 0;
    timer.current = setInterval(() => {
      setReel(Math.floor(Math.random() * poolPreview.length));
      ticks += 1;
      if (ticks > 22 && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }, 90);
  }

  const free = 3 - slots.length;

  return (
    <div>
      <Reveal>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h2 className="text-3xl font-bold">Рулетка</h2>
          <span className="text-sm text-gray-500">
            контракт на прохождение · {poolSize} игр в пуле
          </span>
        </div>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-3">
        {slots.map((slot, i) => (
          <Reveal key={slot.slotId} delay={80 * i} from="scale">
            <article className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/50">
              {slot.image && <img src={slot.image} alt="" className="h-28 w-full object-cover" />}
              <div className="p-4">
                <p className="truncate font-medium">{slot.title}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatPlaytime(slot.played)} с начала контракта
                </p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000"
                    style={{ width: `${Math.min(100, (slot.played / 20) * 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex gap-2 text-xs">
                  <button className="rounded-lg border border-gray-700 px-2.5 py-1 text-gray-300 transition hover:bg-gray-800">
                    Закрыть отзывом
                  </button>
                  <button className="rounded-lg border border-gray-800 px-2.5 py-1 text-gray-500 transition hover:bg-gray-800">
                    Пропустить
                  </button>
                </div>
              </div>
            </article>
          </Reveal>
        ))}

        {Array.from({ length: free }, (_, i) => (
          <Reveal key={`free-${i}`} delay={80 * (slots.length + i)} from="scale">
            <button
              onClick={spin}
              className="group flex h-full min-h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-700 transition hover:border-emerald-600 hover:bg-emerald-950/20"
            >
              {reel !== null && poolPreview[reel]?.image ? (
                <img
                  src={poolPreview[reel]!.image!}
                  alt=""
                  className="h-20 w-40 rounded-lg object-cover opacity-90"
                />
              ) : (
                <span className="text-4xl transition group-hover:scale-110">🎰</span>
              )}
              <span className="text-sm text-gray-400 group-hover:text-emerald-300">
                {reel !== null ? poolPreview[reel]?.title : "Крутить рулетку"}
              </span>
            </button>
          </Reveal>
        ))}
      </div>

      {free === 0 && (
        <Reveal delay={300}>
          <p className="mt-6 text-sm text-gray-500">
            Все слоты заняты. Закрой контракт отзывом или пропусти игру, чтобы крутить снова.
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* ---------- Акт: разобрать ---------- */

function QueueAct({
  queue,
  abandoned,
}: {
  queue: QueueItem[];
  abandoned: { gameId: number; title: string; stance: string; text: string; hours: number }[];
}) {
  return (
    <div>
      <Reveal>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h2 className="text-3xl font-bold">Разобрать сыгранное</h2>
          <span className="text-sm text-gray-500">{queue.length} игр без вердикта</span>
        </div>
      </Reveal>

      <div className="grid gap-3 md:grid-cols-2">
        {queue.slice(0, 6).map((game, i) => (
          <Reveal key={game.gameId} delay={60 * i}>
            <article className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
              {game.headerImage && (
                <img src={game.headerImage} alt="" className="h-14 w-28 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{game.title}</p>
                <p className="text-xs text-gray-500">{game.hours}ч наиграно</p>
              </div>
              <div className="ml-auto flex shrink-0 gap-1.5">
                <button className="rounded-lg border border-emerald-800 px-2.5 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-950/60">
                  Прошёл
                </button>
                <button className="rounded-lg border border-red-900 px-2.5 py-1.5 text-xs text-red-300 transition hover:bg-red-950/50">
                  Бросил
                </button>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      {abandoned.length > 0 && (
        <Reveal delay={400} className="mt-10">
          <h3 className="mb-3 text-sm font-semibold text-amber-300">Спор о брошенном</h3>
          <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2">
            {abandoned.map((item) => (
              <article
                key={item.gameId}
                className={`w-72 shrink-0 rounded-xl border p-4 ${
                  item.stance === "disagree"
                    ? "border-amber-900/70 bg-amber-950/20"
                    : "border-gray-800 bg-gray-900/30"
                }`}
              >
                <p className="font-medium">{item.title}</p>
                <p className="mb-2 text-xs text-gray-600">{item.hours}ч · {item.stance === "disagree" ? "стоит вернуться" : "бросил по делу"}</p>
                <p className="text-sm leading-relaxed text-gray-400">
                  <RichText text={item.text} />
                </p>
              </article>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}

/* ---------- Акт: дневник ---------- */

function DiaryAct({ diary }: { diary: DiaryEntry[] }) {
  if (diary.length === 0) return <Empty text="Дневник пока пуст." />;

  return (
    <div>
      <Reveal>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h2 className="text-3xl font-bold">Дневник впечатлений</h2>
          <span className="text-sm text-gray-500">со штампом наигранного времени</span>
        </div>
      </Reveal>

      <ol className="relative border-l border-gray-800 pl-6">
        {diary.map((entry, i) => (
          <Reveal key={entry.id} delay={70 * i} from="left">
            <li className="mb-6">
              <span className="absolute -left-[5px] mt-2 h-2.5 w-2.5 rounded-full bg-gray-600" />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{entry.title}</span>
                <span className="text-xs text-gray-600">{formatPlaytime(entry.playtimeMinutes)}</span>
                {entry.verdict && (
                  <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                    {VERDICT_LABEL[entry.verdict] ?? entry.verdict}
                  </span>
                )}
                {entry.tier && (
                  <span className={`rounded px-1.5 text-xs font-bold ${TIER[entry.tier]?.text}`}>
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
    </div>
  );
}

/* ---------- Акт: тиры ---------- */

function TiersAct({ tierCounts }: { tierCounts: Record<string, number> }) {
  const order = ["S", "A", "B", "C", "D", "F"];
  const total = Object.values(tierCounts).reduce((a, b) => a + b, 0) || 1;

  return (
    <div>
      <Reveal>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h2 className="text-3xl font-bold">Тир-лист</h2>
          <span className="text-sm text-gray-500">{total} игр расставлено</span>
        </div>
      </Reveal>

      <div className="space-y-2">
        {order.map((tier, i) => {
          const count = tierCounts[tier] ?? 0;
          return (
            <Reveal key={tier} delay={70 * i} from="left">
              <div className="flex items-center gap-4">
                <span className={`w-8 text-2xl font-black ${TIER[tier]?.text ?? "text-rose-400"}`}>
                  {tier}
                </span>
                <div className="h-8 flex-1 overflow-hidden rounded-lg bg-gray-900/60">
                  <div
                    className={`h-full rounded-lg ${TIER[tier]?.bar ?? "bg-rose-800"} opacity-70 transition-[width] duration-1000`}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-sm text-gray-500">{count}</span>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={500}>
        <p className="mt-6 text-sm text-gray-600">
          В боевой версии сюда переезжает перетаскивание карточек между тирами.
        </p>
      </Reveal>
    </div>
  );
}

/* ---------- Акт: демки ---------- */

function DemosAct({ demos }: { demos: Demo[] }) {
  if (demos.length === 0) return <Empty text="Демок пока нет." />;

  return (
    <div>
      <Reveal>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h2 className="text-3xl font-bold">Демки</h2>
          <span className="text-sm text-gray-500">короткие вердикты с фестивалей</span>
        </div>
      </Reveal>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {demos.map((demo, i) => (
          <Reveal key={demo.gameId} delay={60 * i} from="scale">
            <article className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
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
    </div>
  );
}

/* ---------- Акт: профиль ---------- */

function ProfileAct({ stats }: { stats: Props["stats"] }) {
  const cells = [
    { value: stats.totalGames, label: "отзывов написано" },
    { value: stats.totalLibrary, label: "игр в библиотеке" },
    { value: stats.streak, label: "дней подряд" },
    { value: stats.wallOfShame.length, label: "на стене стыда" },
  ];

  return (
    <div>
      <Reveal>
        <h2 className="mb-6 text-3xl font-bold">Профиль</h2>
      </Reveal>

      <div className="grid gap-3 sm:grid-cols-4">
        {cells.map((cell, i) => (
          <Reveal key={cell.label} delay={70 * i} from="scale">
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 text-center">
              <p className="text-4xl font-bold">{cell.value}</p>
              <p className="mt-1 text-xs text-gray-500">{cell.label}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {stats.wallOfShame.length > 0 && (
        <Reveal delay={340} className="mt-8">
          <h3 className="mb-2 text-sm font-semibold text-rose-400">Стена стыда</h3>
          <div className="flex flex-wrap gap-2">
            {stats.wallOfShame.map((title) => (
              <span key={title} className="rounded-lg border border-rose-900/60 bg-rose-950/20 px-3 py-1 text-sm text-rose-200/80">
                {title}
              </span>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-24 text-center text-gray-500">{text}</p>;
}
