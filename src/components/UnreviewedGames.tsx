import { useState } from "react";
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
}

export default function UnreviewedGames({ games: initialGames }: Props) {
  const [games, setGames] = useState(initialGames);
  const [reviewing, setReviewing] = useState<Game | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (games.length === 0) return null;

  const shown = expanded ? games : games.slice(0, 8);
  const hasMore = games.length > 8;

  return (
    <>
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ещё наиграно, но без отзыва</h2>
            <p className="text-sm text-gray-500">{games.length} {games.length === 1 ? "игра" : games.length < 5 ? "игры" : "игр"} с 1+ часом</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((game) => {
            const hours = Math.floor(game.playtimeMinutes / 60);
            return (
              <button
                key={game.gameId}
                onClick={() => setReviewing(game)}
                className="group overflow-hidden rounded-lg border border-gray-800 bg-gray-900 transition-all hover:border-gray-600 hover:scale-[1.02]"
              >
                <div className="relative aspect-[460/215]">
                  {game.headerImage ? (
                    <img
                      src={game.headerImage}
                      alt={game.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-800">
                      <span className="text-xs text-gray-400">{game.title}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="truncate text-sm font-medium text-gray-200">{game.title}</p>
                  <span className="ml-2 flex-shrink-0 text-xs text-gray-500">{hours} ч</span>
                </div>
              </button>
            );
          })}
        </div>
        {hasMore && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-3 text-sm text-gray-500 transition hover:text-gray-300"
          >
            Показать все ({games.length})
          </button>
        )}
      </section>

      {reviewing && (
        <RetroReviewModal
          gameId={reviewing.gameId}
          gameTitle={reviewing.title}
          gameImage={reviewing.headerImage}
          playtimeMinutes={reviewing.playtimeMinutes}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setGames((prev) => prev.filter((g) => g.gameId !== reviewing.gameId));
            setReviewing(null);
          }}
        />
      )}
    </>
  );
}
