import { useState, useEffect, useRef, useCallback } from "react";
import { verdicts, worthLabels, type Verdict } from "../lib/vocab";



interface Props {
  slotId: number;
  gameTitle: string;
  onClose: () => void;
  onFreed?: () => void;
}

function Confetti({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#6366f1", "#22c55e", "#eab308", "#ef4444", "#3b82f6", "#f97316"];
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
    }[] = [];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 2 - 100,
        vx: (Math.random() - 0.5) * 16,
        vy: Math.random() * -14 - 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        opacity: 1,
      });
    }

    let frame = 0;
    const maxFrames = 120;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.vx *= 0.99;
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(0, 1 - frame / maxFrames);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      if (frame < maxFrames) {
        requestAnimationFrame(animate);
      } else {
        onDone();
      }
    };

    requestAnimationFrame(animate);
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[60]"
    />
  );
}

type Phase = "form" | "celebrating" | "freeing";

export default function CompleteModal({ slotId, gameTitle, onClose, onFreed }: Props) {
  const [verdict, setVerdict] = useState<Verdict>("finished");
  const [rating, setRating] = useState(3);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const handleConfettiDone = useCallback(() => {
    // Start freeing phase — fade out backdrop, trigger slot animation
    setPhase("freeing");
    onFreed?.();
    setTimeout(() => location.reload(), 800);
  }, [onFreed]);

  const handleSubmit = async () => {
    if (note.length < 50) {
      setError("Заметка минимум 50 символов");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, verdict, rating, note }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setPhase("celebrating");
    } catch {
      setError("Ошибка сети");
      setLoading(false);
    }
  };

  const verdictLabel = verdicts().find((v) => v.value === verdict);

  return (
    <>
      {phase === "celebrating" && <Confetti onDone={handleConfettiDone} />}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
          phase === "freeing"
            ? "bg-black/0"
            : visible
              ? "bg-black/80"
              : "bg-black/0"
        }`}
      >
        {/* Form */}
        <div
          className={`w-full max-w-md rounded-2xl bg-gray-900 p-8 transition-all duration-500 ${
            !visible
              ? "scale-95 opacity-0 translate-y-4"
              : phase === "form"
                ? "scale-100 opacity-100 translate-y-0"
                : "scale-95 opacity-0 translate-y-4 pointer-events-none absolute"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 text-center">
            <span className="text-4xl">🎮</span>
          </div>
          <h3 className="mb-1 text-center text-xl font-bold">Первое впечатление</h3>
          <p className="mb-6 text-center text-sm text-gray-400">{gameTitle}</p>

          <div className="mb-4">
            <label className="mb-2 block text-sm text-gray-400">Вердикт</label>
            <div className="flex gap-2">
              {verdicts().map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVerdict(v.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    verdict === v.value
                      ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm text-gray-400">Стоило ли времени?</label>
            <input
              type="range"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="mt-1 text-center text-lg font-bold">{worthLabels()[rating - 1]}</div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm text-gray-400">Заметка (мин. 50 символов)</label>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm focus:border-indigo-500 focus:outline-none transition"
              placeholder="Что понравилось? Что нет? Первые ощущения от геймплея?"
            />
            <p className={`mt-1 text-xs ${note.length >= 50 ? "text-green-500" : "text-gray-500"}`}>
              {note.length}/50
            </p>
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 font-medium transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Сохранение...
                </span>
              ) : (
                "Оставить впечатление"
              )}
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg border border-gray-700 px-4 py-3 transition hover:bg-gray-800"
            >
              Отмена
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Слот освободится, но вы сможете дополнять отзыв позже
          </p>
        </div>

        {/* Celebration screen */}
        <div
          className={`w-full max-w-sm text-center transition-all duration-700 ${
            phase === "celebrating"
              ? "scale-100 opacity-100 translate-y-0"
              : phase === "freeing"
                ? "scale-110 opacity-0 -translate-y-12"
                : "scale-50 opacity-0 translate-y-8 pointer-events-none absolute"
          }`}
        >
          <div className="mb-4 text-7xl animate-bounce">
            {verdictLabel?.icon}
          </div>
          <h3 className="mb-2 text-2xl font-bold text-white">
            Слот свободен!
          </h3>
          <p className="mb-1 text-lg text-gray-300">{gameTitle}</p>
          <p className="text-sm text-gray-500">
            {verdictLabel?.icon} {verdictLabel?.label} · {worthLabels()[rating - 1]}
          </p>
        </div>
      </div>
    </>
  );
}
