import { useState } from "react";
import { createPortal } from "react-dom";
import ImpressionSheet from "./ImpressionSheet";
import {
  TIER_STYLE,
  VERDICT_STYLE,
  verdictLabel,
  worthLabel,
  type Tier,
  type Verdict,
} from "../lib/vocab";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";
import { t } from "../lib/strings";

interface DemoReview {
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  verdict: string | null;
  tier: string | null;
  rating: number | null;
  note: string | null;
  createdAt: string;
}

interface Props {
  reviews: DemoReview[];
  locale?: Locale;
}

export default function DemoList({ reviews, locale = DEFAULT_LOCALE }: Props) {
  const s = t(locale);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleDelete = async (gameId: number) => {
    if (!confirm(s.pages.demoConfirm)) return;
    setDeleting(gameId);
    try {
      const res = await fetch("/api/demo-review", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setDeleting(null);
      }
    } catch {
      setDeleting(null);
    }
  };

  return (
    <>
      <div className="mb-6 flex justify-center">
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium transition hover:bg-indigo-500"
        >
          {s.pages.demoAdd}
        </button>
      </div>

      {reviews.length === 0 ? (
        <p className="text-center text-gray-500">
          {s.pages.demosEmpty}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {reviews.map((r) => {
            const v = r.verdict
              ? {
                  icon: VERDICT_STYLE[r.verdict as Verdict].icon,
                  label: verdictLabel(r.verdict as Verdict, locale, { demo: true }),
                }
              : null;
            return (
              <div
                key={r.gameId}
                className="group relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900"
              >
                {r.headerImage && (
                  <div className="relative h-28 overflow-hidden">
                    <img
                      src={r.headerImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
                    {r.tier && (
                      <span
                        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-lg font-black ${
                          `${TIER_STYLE[r.tier as Tier].bg} ${TIER_STYLE[r.tier as Tier].text}`
                        }`}
                      >
                        {r.tier}
                      </span>
                    )}
                  </div>
                )}
                <div className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-bold leading-tight">{r.title}</h3>
                    <button
                      onClick={() => handleDelete(r.gameId)}
                      disabled={deleting === r.gameId}
                      className="shrink-0 text-xs text-gray-600 transition hover:text-red-400 disabled:opacity-50"
                    >
                      {s.pages.demoDelete}
                    </button>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2 text-xs">
                    {v && (
                      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-300">
                        {v.icon} {v.label}
                      </span>
                    )}
                    {r.rating != null && (
                      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">
                        {worthLabel(r.rating, locale)}
                      </span>
                    )}
                  </div>
                  {r.note && (
                    <p className="whitespace-pre-wrap text-sm text-gray-400">
                      {r.note}
                    </p>
                  )}
                  <a
                    href={`https://store.steampowered.com/app/${r.steamAppId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-gray-600 transition hover:text-indigo-400"
                  >
                    {s.pages.openInSteam}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal &&
        createPortal(
          <ImpressionSheet
            mode="demo"
            gameTitle={s.pages.demoNew}
            locale={locale}
            onClose={() => setShowModal(false)}
          />,
          document.body
        )}
    </>
  );
}
