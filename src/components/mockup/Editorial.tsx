import { useEffect, useState } from "react";
import Reveal from "./Reveal";

interface Pick {
  gameId: number;
  title: string;
  headerImage: string | null;
  tier: string;
  reason: string;
  hours: number;
}

interface Props {
  picks: Pick[];
  slotCount: number;
  queueCount: number;
  libraryCount: number;
}

const TIER_NOTE: Record<string, string> = {
  S: "бросай текущее",
  A: "очень вероятно зайдёт",
  B: "стоит попробовать",
  C: "под настроение",
  D: "не трать время",
};

/** Линейка, которая прочерчивается — единственная «декорация» в этом варианте. */
function Rule({ delay = 0 }: { delay?: number }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDrawn(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  return (
    <div
      className={`h-px origin-left bg-gray-700 transition-transform duration-1000 ease-out ${
        drawn ? "scale-x-100" : "scale-x-0"
      }`}
    />
  );
}

export default function Editorial({ picks, slotCount, queueCount, libraryCount }: Props) {
  const [index, setIndex] = useState(0);
  const pick = picks[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % picks.length);
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + picks.length) % picks.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picks.length]);

  if (!pick) {
    return <p className="py-32 text-center text-gray-500">Советов пока нет — собери прогон.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Выходные данные вместо панели навигации */}
      <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs tracking-[0.2em] text-gray-600 uppercase">
        <span>Слоты {slotCount}/3</span>
        <span className="text-amber-500/80">Разобрать {queueCount}</span>
        <span>Библиотека {libraryCount}</span>
        <span>Дневник</span>
        <span className="ml-auto">Совет {index + 1} из {picks.length}</span>
      </div>
      <Rule />

      <article key={pick.gameId} className="grid gap-10 py-14 md:grid-cols-[1fr_240px]">
        <div>
          <Reveal>
            <p className="mb-6 font-serif text-sm text-gray-500 italic">
              {TIER_NOTE[pick.tier]} · {pick.hours > 0 ? `наиграно ${pick.hours}ч` : "ни разу не запускал"}
            </p>
          </Reveal>

          <Reveal delay={90}>
            <h2 className="mb-8 font-serif text-6xl leading-[0.95] font-medium text-balance">
              {pick.title}
            </h2>
          </Reveal>

          <Reveal delay={200}>
            <div className="flex gap-5">
              <span className="font-serif text-7xl leading-none text-gray-700 select-none">
                {pick.tier}
              </span>
              <p className="max-w-prose font-serif text-xl leading-relaxed text-gray-300">
                {pick.reason}
              </p>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <button className="border-b border-white pb-1 text-lg transition hover:text-gray-400">
                Беру
              </button>
              <button
                onClick={() => setIndex((i) => (i + 1) % picks.length)}
                className="border-b border-transparent pb-1 text-lg text-gray-500 transition hover:border-gray-500 hover:text-white"
              >
                Дальше
              </button>
              <button className="border-b border-transparent pb-1 text-lg text-gray-500 transition hover:border-gray-500 hover:text-white">
                Карточка игры
              </button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={140} from="scale">
          {pick.headerImage && (
            <img
              src={pick.headerImage}
              alt=""
              className="w-full rounded-sm grayscale transition duration-700 hover:grayscale-0"
            />
          )}
        </Reveal>
      </article>

      <Rule delay={400} />

      {/* Содержание номера */}
      <Reveal delay={500}>
        <div className="py-8">
          <p className="mb-4 text-xs tracking-[0.2em] text-gray-600 uppercase">Ещё в подборке</p>
          <ul>
            {picks.map((item, i) => (
              <li key={item.gameId}>
                <button
                  onClick={() => setIndex(i)}
                  className={`group flex w-full items-baseline gap-4 border-b border-gray-800 py-3 text-left transition ${
                    i === index ? "text-white" : "text-gray-500 hover:text-gray-200"
                  }`}
                >
                  <span className="w-6 shrink-0 font-serif text-sm text-gray-700">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-serif text-lg">{item.title}</span>
                  <span className="ml-auto shrink-0 font-serif text-sm text-gray-600">
                    {item.tier}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </div>
  );
}
