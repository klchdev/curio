import { useState, useRef, useEffect, useCallback } from "react";

interface GameCard {
  title: string;
  headerImage: string | null;
}

interface SpinResult {
  slot: { id: number };
  game: GameCard;
  decoys: GameCard[];
}

const CARD_HEIGHT = 160;
const VISIBLE_CARDS = 3;

function RouletteStrip({
  items,
  winnerIndex,
  onSettled,
}: {
  items: GameCard[];
  winnerIndex: number;
  onSettled: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    // Target: center the winner in the visible area
    const targetOffset = winnerIndex * CARD_HEIGHT - CARD_HEIGHT; // center of 3 visible

    // Start from top, animate to target
    strip.style.transition = "none";
    strip.style.transform = `translateY(0px)`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        strip.style.transition = `transform 3s cubic-bezier(0.15, 0.85, 0.25, 1)`;
        strip.style.transform = `translateY(-${targetOffset}px)`;
      });
    });

    const timer = setTimeout(() => {
      setSettled(true);
      onSettled();
    }, 3200);

    return () => clearTimeout(timer);
  }, [winnerIndex, onSettled]);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-gray-700 bg-gray-900"
      style={{ height: CARD_HEIGHT * VISIBLE_CARDS }}
    >
      {/* Gradient overlays */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-gray-900 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-gray-900 to-transparent" />

      {/* Center indicator */}
      <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: CARD_HEIGHT, height: CARD_HEIGHT }}>
        <div className={`h-full border-y-2 transition-colors duration-500 ${settled ? "border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]" : "border-gray-600"}`} />
      </div>

      {/* Strip */}
      <div ref={stripRef} className="will-change-transform">
        {items.map((item, i) => (
          <div
            key={i}
            className="relative flex items-center overflow-hidden"
            style={{ height: CARD_HEIGHT }}
          >
            <img
              src={item.headerImage || ""}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10 w-full px-6 text-center">
              <h4 className="text-lg font-bold text-white drop-shadow-lg">{item.title}</h4>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RouletteButton() {
  const [state, setState] = useState<"idle" | "spinning" | "settled">("idle");
  const [result, setResult] = useState<SpinResult | null>(null);
  const [stripItems, setStripItems] = useState<GameCard[]>([]);
  const [winnerIndex, setWinnerIndex] = useState(0);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);

  const spin = async () => {
    setState("spinning");
    setError("");

    try {
      const res = await fetch("/api/spin", { method: "POST" });
      const data: SpinResult = await res.json();

      if (!res.ok) {
        setError((data as any).error);
        setState("idle");
        return;
      }

      setResult(data);

      // Build strip: decoys shuffled, then repeat, with winner placed near the end
      const decoys = data.decoys.length > 0 ? data.decoys : [data.game];
      const items: GameCard[] = [];

      // Fill strip with ~20 cards: shuffled decoys repeating, then winner near end
      for (let i = 0; i < 18; i++) {
        items.push(decoys[i % decoys.length]);
      }
      // Insert winner at a position near the end
      const winIdx = items.length;
      items.push(data.game);
      // Add a couple after winner for visual
      items.push(decoys[0]);
      items.push(decoys[Math.min(1, decoys.length - 1)]);

      setStripItems(items);
      setWinnerIndex(winIdx);
      setVisible(true);
    } catch {
      setError("Ошибка сети");
      setState("idle");
    }
  };

  const handleSettled = useCallback(() => {
    setState("settled");
  }, []);

  const handleAccept = () => {
    location.reload();
  };

  if (state === "idle") {
    return (
      <div>
        <button
          onClick={spin}
          className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-700 text-gray-400 transition hover:border-indigo-500 hover:text-indigo-400"
        >
          <span className="mb-2 text-5xl">🎰</span>
          <span className="text-lg font-semibold">Крутить рулетку</span>
        </button>
        {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        visible ? "bg-black/85" : "bg-black/0"
      }`}
    >
      <div
        className={`w-full max-w-md px-4 transition-all duration-500 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <h3 className="mb-4 text-center text-xl font-bold text-gray-300">
          {state === "spinning" ? "Выбираем игру..." : "Выпало!"}
        </h3>

        <RouletteStrip
          items={stripItems}
          winnerIndex={winnerIndex}
          onSettled={handleSettled}
        />

        {state === "settled" && result && (
          <div className="mt-6 text-center animate-[fadeIn_0.5s_ease-out]">
            <p className="mb-4 text-gray-400">Контракт заключён. Играй!</p>
            <button
              onClick={handleAccept}
              className="rounded-lg bg-indigo-600 px-8 py-3 font-semibold transition hover:bg-indigo-500"
            >
              Принято
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
