import { useState } from "react";
import { formatPlaytime } from "../lib/vocab";
import RetroReviewModal from "./RetroReviewModal";

interface Game {
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  playtimeMinutes: number;
}

interface Props {
  games: Game[];
  total: number;
}

type Verdict = "finished" | "dropped" | "playing";

const BUTTONS: { value: Verdict; label: string; className: string }[] = [
  {
    value: "finished",
    label: "Прошёл",
    className: "border-emerald-800 text-emerald-300 hover:bg-emerald-950/60",
  },
  {
    value: "dropped",
    label: "Бросил",
    className: "border-red-900 text-red-300 hover:bg-red-950/50",
  },
  {
    value: "playing",
    label: "Играю",
    className: "border-sky-900 text-sky-300 hover:bg-sky-950/50",
  },
];

export default function TriageList({ games: initial, total }: Props) {
  const [games, setGames] = useState(initial);
  const [pending, setPending] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<Game | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function mark(game: Game, verdict: Verdict) {
    setPending(game.gameId);
    setError(null);

    try {
      const res = await fetch("/api/quick-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.gameId,
          verdict,
          playtimeMinutes: game.playtimeMinutes,
        }),
      });

      if (!res.ok) {
        setError("Не сохранилось, попробуй ещё раз");
        return;
      }

      setGames((prev) => prev.filter((g) => g.gameId !== game.gameId));
      setDone((n) => n + 1);
    } catch {
      setError("Сеть не отвечает");
    } finally {
      setPending(null);
    }
  }

  const left = total - done;

  if (games.length === 0) {
    return (
      <section className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h2 className="text-lg font-semibold">Разбор закончен</h2>
        <p className="mt-1 text-sm text-gray-400">
          {left > 0
            ? `Осталось ещё ${left} — обнови страницу, чтобы подгрузить следующие.`
            : "Все сыгранные игры размечены. Можно собирать рекомендации."}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-xl border border-amber-900/60 bg-amber-950/10 p-5">
      <h2 className="text-lg font-semibold">Сначала разбери сыгранное</h2>
      <p className="mt-1 mb-4 text-sm text-gray-400">
        В эти игры ты играл, но вердикта нет — и понять, прошёл ты их или бросил, неоткуда.
        Пока не разметишь, они не попадут ни в советы, ни в разбор. Осталось {left}.
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {games.map((game) => (
          <li
            key={game.gameId}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
          >
            {game.headerImage && (
              <img
                src={game.headerImage}
                alt=""
                className="h-10 w-24 shrink-0 rounded object-cover"
              />
            )}
            <a
              href={`https://store.steampowered.com/app/${game.steamAppId}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 font-medium transition hover:text-emerald-400"
            >
              {game.title}
            </a>
            <span className="text-xs text-gray-500">{formatPlaytime(game.playtimeMinutes)}</span>

            <div className="ml-auto flex gap-2">
              {BUTTONS.map((button) => (
                <button
                  key={button.value}
                  onClick={() => mark(game, button.value)}
                  disabled={pending === game.gameId}
                  className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-40 ${button.className}`}
                >
                  {button.label}
                </button>
              ))}
              <button
                onClick={() => setReviewing(game)}
                disabled={pending === game.gameId}
                className="whitespace-nowrap rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
              >
                Отзыв
              </button>
            </div>
          </li>
        ))}
      </ul>

      {reviewing && (
        <RetroReviewModal
          gameId={reviewing.gameId}
          gameTitle={reviewing.title}
          gameImage={reviewing.headerImage}
          currentPlaytime={reviewing.playtimeMinutes}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setGames((prev) => prev.filter((g) => g.gameId !== reviewing.gameId));
            setDone((n) => n + 1);
            setReviewing(null);
          }}
        />
      )}
    </section>
  );
}
