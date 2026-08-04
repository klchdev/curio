import { useState } from "react";

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

interface Run {
  id: number;
  model: string;
  profile: string;
  reviewsUsed: number;
  candidatesUsed: number;
  createdAt: string;
  items: Item[];
}

interface Props {
  run: Run | null;
  canGenerate: boolean;
  reviewCount: number;
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

export default function Recommendations({ run, canGenerate, reviewCount }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-recommendations", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось получить рекомендации");
        return;
      }
      window.location.reload();
    } catch {
      setError("Сеть не отвечает");
    } finally {
      setLoading(false);
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
          disabled={loading || !canGenerate}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Думает…" : run ? "Пересобрать" : "Собрать рекомендации"}
        </button>
      </div>

      {loading && (
        <p className="mb-6 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-400">
          Читает твои отзывы и раскладывает библиотеку по тирам. Это занимает до минуты.
        </p>
      )}

      {error && (
        <p className="mb-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!run && !loading && (
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
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
