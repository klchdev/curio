import { useEffect, useState } from "react";

interface Card {
  gameId: number;
  title: string;
  headerImage: string | null;
  tier: string;
  reason: string;
  hours: number;
}

interface Props {
  cards: Card[];
  queueCount: number;
  slotCount: number;
}

const TIER_TINT: Record<string, string> = {
  S: "from-yellow-500/25",
  A: "from-emerald-500/25",
  B: "from-sky-500/25",
  C: "from-orange-500/25",
  D: "from-red-500/25",
};

const TIER_CHIP: Record<string, string> = {
  S: "bg-yellow-500 text-yellow-950",
  A: "bg-emerald-500 text-emerald-950",
  B: "bg-sky-500 text-sky-950",
  C: "bg-orange-500 text-orange-950",
  D: "bg-red-500 text-red-950",
};

export default function Deck({ cards, queueCount, slotCount }: Props) {
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState<number[]>([]);

  const card = cards[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, cards.length - 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  if (!card) {
    return <p className="py-24 text-center text-gray-500">Советов пока нет — собери прогон.</p>;
  }

  const isTaken = taken.includes(card.gameId);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative overflow-hidden rounded-3xl border border-gray-800 bg-gray-900">
        {card.headerImage && (
          <img src={card.headerImage} alt="" className="h-64 w-full object-cover opacity-70" />
        )}
        <div
          className={`absolute inset-0 bg-gradient-to-t ${TIER_TINT[card.tier] ?? "from-gray-500/20"} via-gray-950/85 to-gray-950/40`}
        />

        <div className="relative -mt-28 px-8 pb-8">
          <div className="mb-3 flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold ${TIER_CHIP[card.tier]}`}
            >
              {card.tier}
            </span>
            <span className="text-sm text-gray-400">
              {card.hours > 0 ? `наиграно ${card.hours}ч` : "ни разу не запускал"}
            </span>
          </div>

          <h2 className="mb-4 text-3xl leading-tight font-bold">{card.title}</h2>
          <p className="max-w-xl text-base leading-relaxed text-gray-300">{card.reason}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIndex((i) => Math.min(i + 1, cards.length - 1))}
              className="rounded-xl border border-gray-700 px-5 py-2.5 text-sm transition hover:bg-gray-800"
            >
              ← Мимо
            </button>
            <button
              onClick={() => {
                setTaken((prev) => [...prev, card.gameId]);
                setIndex((i) => Math.min(i + 1, cards.length - 1));
              }}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium transition hover:bg-emerald-500"
            >
              {isTaken ? "Уже в слоте" : "Беру в слот →"}
            </button>
            <button className="text-sm text-gray-500 transition hover:text-white">
              Карточка игры
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
        {cards.map((item, i) => (
          <button
            key={item.gameId}
            onClick={() => setIndex(i)}
            title={item.title}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-6 bg-emerald-500" : taken.includes(item.gameId) ? "w-2 bg-emerald-800" : "w-2 bg-gray-700"
            }`}
          />
        ))}
      </div>

      <p className="mt-3 text-center text-sm text-gray-600">
        {index + 1} из {cards.length} · листай стрелками
        {taken.length > 0 && ` · взято ${taken.length}`}
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-3 text-sm text-gray-500">
        <span className="rounded-lg border border-gray-800 px-3 py-1.5">Слоты {slotCount}/3</span>
        <span className="rounded-lg border border-gray-800 px-3 py-1.5">Разобрать {queueCount}</span>
        <span className="rounded-lg border border-gray-800 px-3 py-1.5">Библиотека</span>
        <span className="rounded-lg border border-gray-800 px-3 py-1.5">Дневник</span>
      </div>
    </div>
  );
}
