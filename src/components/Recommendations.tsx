import { useEffect, useRef, useState } from "react";
import ImpressionSheet from "./ImpressionSheet";

type TierValue = "S" | "A" | "B" | "C" | "D";

interface Item {
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  tier: TierValue;
  reason: string;
  hours: number;
}

interface AbandonedItem {
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  stance: "agree" | "disagree";
  text: string;
  hours: number;
}

interface Run {
  id: number;
  model: string;
  profile: string;
  reviewsUsed: number;
  candidatesUsed: number;
  createdAt: string;
  items: Item[];
  abandoned: AbandonedItem[];
}

interface ActiveRun {
  id: number;
  stage: Stage;
  picksReady: number;
  createdAt: string;
}

interface Props {
  run: Run | null;
  activeRun: ActiveRun | null;
  canGenerate: boolean;
  reviewCount: number;
}

type Stage = "collecting" | "thinking" | "saving";

const MAX_PICKS = 40;
const POLL_INTERVAL_MS = 2000;

const STAGE_LABEL: Record<Stage, string> = {
  collecting: "Собираю твои отзывы и библиотеку",
  thinking: "Разбираю вкус и раскладываю игры по тирам",
  saving: "Сохраняю результат",
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  return `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
}

function Progress({ stage, picksReady, startedAt }: { stage: Stage; picksReady: number; startedAt: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000))
  );

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const ratio = stage === "saving" ? 1 : Math.min(picksReady / MAX_PICKS, 0.98);
  const determinate = picksReady > 0 || stage === "saving";

  return (
    <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{STAGE_LABEL[stage]}</span>
        <span className="text-sm text-gray-500">{formatElapsed(elapsed)}</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        {determinate ? (
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-600/70" />
        )}
      </div>

      <p className="mt-3 text-sm text-gray-400">
        {picksReady > 0
          ? `Разобрано игр: ${picksReady}`
          : "Модель читает отзывы целиком — первые игры появятся через полминуты."}
      </p>
    </div>
  );
}

const TIERS: { value: TierValue; labelBg: string; labelText: string; hint: string }[] = [
  { value: "S", labelBg: "bg-yellow-500", labelText: "text-yellow-950", hint: "Бросай текущее" },
  { value: "A", labelBg: "bg-emerald-500", labelText: "text-emerald-950", hint: "Очень вероятно зайдёт" },
  { value: "B", labelBg: "bg-sky-500", labelText: "text-sky-950", hint: "Стоит попробовать" },
  { value: "C", labelBg: "bg-orange-500", labelText: "text-orange-950", hint: "Только под настроение" },
  { value: "D", labelBg: "bg-red-500", labelText: "text-red-950", hint: "Не трать время" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Профиль приходит маркдауном-списком — рендерим построчно, без библиотеки. */
function ProfileText({ text }: { text: string }) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const bullet = line.replace(/^[-*•]\s*/, "");
        const parts = bullet.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={index} className="text-sm leading-relaxed text-gray-300">
            {bullet !== line && <span className="mr-2 text-gray-600">—</span>}
            {parts.map((part, i) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={i} className="font-semibold text-white">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function Recommendations({
  run,
  activeRun,
  canGenerate,
  reviewCount,
}: Props) {
  const [active, setActive] = useState<ActiveRun | null>(activeRun);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<
    { gameId: number; title: string; headerImage: string | null; hours: number } | null
  >(null);
  const activeId = active?.id ?? null;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeId === null) return;

    async function poll() {
      try {
        const res = await fetch(`/api/recommendation-status?runId=${activeId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "done") {
          window.location.reload();
          return;
        }
        if (data.status === "error") {
          setError(data.error ?? "Генерация не удалась");
          setActive(null);
          return;
        }
        setActive((prev) =>
          prev ? { ...prev, stage: data.stage, picksReady: data.picksReady } : prev
        );
      } catch {
        // сеть моргнула — просто ждём следующего опроса
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeId]);

  const busy = starting || active !== null;

  async function handleGenerate() {
    setError(null);
    setStarting(true);

    try {
      const res = await fetch("/api/generate-recommendations", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось запустить генерацию");
        return;
      }
      setActive({
        id: data.runId,
        stage: "collecting",
        picksReady: 0,
        createdAt: new Date().toISOString(),
      });
    } catch {
      setError("Сеть не отвечает");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-gray-400">
          {run ? (
            <>
              Собрано {formatDate(run.createdAt)} по {run.reviewsUsed} отзывам из{" "}
              {run.candidatesUsed} непройденных игр
            </>
          ) : (
            <>Отзывов накоплено: {reviewCount}</>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={busy || !canGenerate}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Идёт разбор…" : run ? "Пересобрать" : "Собрать рекомендации"}
        </button>
      </div>

      {active && (
        <Progress
          stage={active.stage}
          picksReady={active.picksReady}
          startedAt={active.createdAt}
        />
      )}

      {error && (
        <p className="mb-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!run && !busy && (
        <p className="text-gray-500">
          {canGenerate
            ? "Рекомендаций ещё нет. Нажми кнопку — разберём твой вкус по отзывам."
            : `Нужно минимум 5 отзывов, чтобы было что разбирать. Сейчас ${reviewCount}.`}
        </p>
      )}

      {run && (
        <>
          {run.profile && (
            <section className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5">
              <h2 className="mb-3 text-lg font-semibold">Что видно по твоим отзывам</h2>
              <ProfileText text={run.profile} />
            </section>
          )}

          <div className="space-y-3">
            {TIERS.map((tier) => {
              const items = run.items.filter((item) => item.tier === tier.value);
              if (items.length === 0) return null;

              return (
                <section
                  key={tier.value}
                  className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/30"
                >
                  <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold ${tier.labelBg} ${tier.labelText}`}
                    >
                      {tier.value}
                    </span>
                    <span className="text-sm text-gray-400">{tier.hint}</span>
                    <span className="ml-auto text-sm text-gray-600">{items.length}</span>
                  </div>

                  <ul className="divide-y divide-gray-800/60">
                    {items.map((item) => (
                      <li key={item.gameId} className="flex gap-4 p-4">
                        {item.headerImage && (
                          <img
                            src={item.headerImage}
                            alt=""
                            className="h-14 w-32 shrink-0 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-3">
                            <a
                              href={`https://store.steampowered.com/app/${item.steamAppId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium transition hover:text-emerald-400"
                            >
                              {item.title}
                            </a>
                            <span className="text-xs text-gray-500">
                              {item.hours > 0 ? `наиграно ${item.hours}ч` : "не запускал"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-gray-400">
                            {item.reason}
                          </p>
                        </div>
                        <button
                          onClick={() => setReviewing(item)}
                          className="ml-auto shrink-0 self-start rounded-lg border border-gray-700 px-3 py-1.5 text-sm whitespace-nowrap transition hover:bg-gray-800"
                        >
                          Написать отзыв
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          {run.abandoned.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-1 text-lg font-semibold">Разбор брошенного</h2>
              <p className="mb-4 text-sm text-gray-500">
                Игры, которые ты поиграл и забросил без отзыва. Где-то модель согласна, где-то
                спорит.
              </p>

              <ul className="space-y-3">
                {run.abandoned.map((item) => {
                  const arguing = item.stance === "disagree";
                  return (
                    <li
                      key={item.gameId}
                      className={`flex gap-4 rounded-xl border p-4 ${
                        arguing
                          ? "border-amber-900/70 bg-amber-950/20"
                          : "border-gray-800 bg-gray-900/30"
                      }`}
                    >
                      {item.headerImage && (
                        <img
                          src={item.headerImage}
                          alt=""
                          className="h-14 w-32 shrink-0 rounded object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3">
                          <a
                            href={`https://store.steampowered.com/app/${item.steamAppId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium transition hover:text-emerald-400"
                          >
                            {item.title}
                          </a>
                          <span className="text-xs text-gray-500">{item.hours}ч и заброшено</span>
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              arguing
                                ? "bg-amber-900/60 text-amber-200"
                                : "bg-gray-800 text-gray-400"
                            }`}
                          >
                            {arguing ? "Дай второй шанс" : "Бросил по делу"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-gray-400">{item.text}</p>
                      </div>
                      <button
                        onClick={() => setReviewing(item)}
                        className="ml-auto shrink-0 self-start rounded-lg border border-gray-700 px-3 py-1.5 text-sm whitespace-nowrap transition hover:bg-gray-800"
                      >
                        Написать отзыв
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {reviewing && (
        <ImpressionSheet
          mode="retro"
          gameId={reviewing.gameId}
          gameTitle={reviewing.title}
          gameImage={reviewing.headerImage}
          currentPlaytime={Math.round(reviewing.hours * 60)}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setReviewing(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
