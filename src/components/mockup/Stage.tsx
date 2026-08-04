import { useEffect, useState } from "react";
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

interface Props {
  picks: Pick[];
  slotCount: number;
  queueCount: number;
  libraryCount: number;
}

/** Тир — единственный источник цвета на экране. Всё остальное нейтральное. */
const TIER: Record<string, { glow: string; text: string; bar: string; label: string }> = {
  S: { glow: "bg-yellow-500", text: "text-yellow-400", bar: "bg-yellow-500", label: "Бросай текущее" },
  A: { glow: "bg-emerald-500", text: "text-emerald-400", bar: "bg-emerald-500", label: "Очень вероятно зайдёт" },
  B: { glow: "bg-sky-500", text: "text-sky-400", bar: "bg-sky-500", label: "Стоит попробовать" },
  C: { glow: "bg-orange-500", text: "text-orange-400", bar: "bg-orange-500", label: "Под настроение" },
  D: { glow: "bg-red-500", text: "text-red-400", bar: "bg-red-500", label: "Не трать время" },
};

export default function Stage({ picks, slotCount, queueCount, libraryCount }: Props) {
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState<number[]>([]);

  const pick = picks[index];
  const tone = TIER[pick?.tier] ?? TIER.B;

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
    <div className="relative">
      {/*
        Атмосфера: тот же арт, размытый до свечения. Держим fixed на весь
        экран, иначе контейнер страницы обрезает его в прямоугольник с
        видимыми краями. Радиальная маска гасит края до фона.
      */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {pick.headerImage && (
          <img
            key={`bg-${pick.gameId}`}
            src={pick.headerImage}
            alt=""
            className="h-full w-full scale-150 object-cover opacity-25 blur-[100px] transition-opacity duration-1000"
            style={{
              maskImage: "radial-gradient(70% 55% at 50% 28%, #000 0%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(70% 55% at 50% 28%, #000 0%, transparent 78%)",
            }}
          />
        )}
        <div
          className={`absolute top-[22%] left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full ${tone.glow} opacity-[0.13] blur-[140px] transition-colors duration-700`}
        />
      </div>

      {/* Периферия: одна тонкая строка вместо четырёх секций */}
      <div className="relative mb-14 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
        <span className="flex items-center gap-1.5">
          Слоты
          {Array.from({ length: 3 }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i < slotCount ? "bg-emerald-500" : "bg-gray-700"}`}
            />
          ))}
        </span>
        <button className="transition hover:text-white">
          Разобрать <span className="text-amber-400">{queueCount}</span>
        </button>
        <button className="transition hover:text-white">Библиотека {libraryCount}</button>
        <button className="transition hover:text-white">Дневник</button>
        <button className="ml-auto transition hover:text-white">Пересобрать</button>
      </div>

      {/* Герой */}
      <div key={pick.gameId} className="relative grid items-center gap-10 md:grid-cols-[minmax(0,420px)_1fr]">
        <Reveal from="scale">
          <div className="relative">
            <div className={`absolute -inset-4 rounded-3xl ${tone.glow} opacity-15 blur-2xl`} />
            {pick.headerImage && (
              <img
                src={pick.headerImage}
                alt=""
                className="relative w-full rounded-2xl shadow-2xl shadow-black/60"
              />
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
                className="rounded-xl bg-white px-6 py-3 font-medium text-gray-950 transition hover:scale-[1.02] hover:bg-gray-100"
              >
                {taken.includes(pick.gameId) ? "Уже в слоте" : "Беру"}
              </button>
              <button
                onClick={() => setIndex((i) => (i + 1) % picks.length)}
                className="rounded-xl border border-gray-700 px-5 py-3 text-gray-300 transition hover:border-gray-500 hover:text-white"
              >
                Дальше
              </button>
              <button className="px-2 text-sm text-gray-500 transition hover:text-white">
                Карточка игры
              </button>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Плёнка: остальные советы сжаты до обложек */}
      <Reveal delay={460} className="relative mt-16">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm text-gray-500">Ещё советы</span>
          <span className="text-sm text-gray-700">
            {index + 1} / {picks.length} · листай стрелками
          </span>
        </div>
        <div className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-3">
          {picks.map((item, i) => {
            const itemTone = TIER[item.tier] ?? TIER.B;
            return (
              <button
                key={item.gameId}
                onClick={() => setIndex(i)}
                title={item.title}
                className={`group relative w-36 shrink-0 snap-start overflow-hidden rounded-lg transition-all duration-300 ${
                  i === index ? "opacity-100" : "opacity-45 hover:opacity-80"
                }`}
              >
                {item.headerImage && (
                  <img
                    src={item.headerImage}
                    alt=""
                    className="h-20 w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                )}
                <span
                  className={`absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-500 ${itemTone.bar} ${
                    i === index ? "scale-x-100" : "scale-x-0"
                  }`}
                />
                {taken.includes(item.gameId) && (
                  <span className="absolute top-1 right-1 rounded bg-emerald-500 px-1 text-[10px] font-bold text-emerald-950">
                    в слоте
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}
