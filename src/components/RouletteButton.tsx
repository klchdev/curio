import { useState } from "react";

interface SpinResult {
  slot: { id: number };
  game: {
    title: string;
    headerImage: string | null;
  };
}

export default function RouletteButton() {
  const [state, setState] = useState<"idle" | "spinning" | "result">("idle");
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState("");

  const spin = async () => {
    setState("spinning");
    setError("");

    try {
      const res = await fetch("/api/spin", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setState("idle");
        return;
      }

      // Delay for animation feel
      setTimeout(() => {
        setResult(data);
        setState("result");
      }, 2000);
    } catch {
      setError("Ошибка сети");
      setState("idle");
    }
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

  if (state === "spinning") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8 text-center">
          <div className="mx-auto h-48 w-48 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="mt-6 text-lg text-gray-300">Выбираем игру...</p>
        </div>
      </div>
    );
  }

  // result
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8 text-center">
        <img
          src={result!.game.headerImage || ""}
          alt={result!.game.title}
          className="mx-auto mb-4 h-36 w-full rounded-lg object-cover"
        />
        <h3 className="mb-4 text-2xl font-bold">{result!.game.title}</h3>
        <p className="mb-6 text-gray-400">Контракт заключён. Играй!</p>
        <button
          onClick={() => location.reload()}
          className="rounded-lg bg-indigo-600 px-8 py-3 font-semibold transition hover:bg-indigo-500"
        >
          Принято
        </button>
      </div>
    </div>
  );
}
