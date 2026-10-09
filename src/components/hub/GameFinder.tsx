import { useEffect, useRef, useState } from "react";
import Reveal from "../Reveal";
import RichText from "../RichText";
import CurioMark from "../CurioMark";
import { DeepDivePanel, FIT_STYLE, type DeepDive } from "./DeepDive";
import { TIER_STYLE, THRESHOLDS, verdictLabel, type Tier } from "../../lib/vocab";
import type { Locale } from "../../lib/i18n";
import { t, type Dict } from "../../lib/strings";
import type { Slot, Zone } from "./Hub";

/** What the route sends per game: see FinderItem in /api/game-finder. */
interface FinderItem {
  gameId: number;
  steamAppId: number;
  title: string;
  headerImage: string | null;
  why: string;
  owned: boolean;
  playtimeMinutes: number;
  hasRecord: boolean;
  verdict: string | null;
}

type Stage = "shortlist" | "store" | "diving" | "done";

interface Answer {
  role: "assistant";
  stage: Stage;
  understood: string;
  items: FinderItem[];
  missed: string[];
  dives: Record<number, DeepDive | string>;
  error: string | null;
}

type Turn = { role: "user"; text: string } | Answer;

/*
 * The conversation outlives a reload in this browser only. It is a scratchpad
 * for one evening's choice, not a record — the dives it produced are already
 * stored on the server and come back from the cache for free.
 */
const STORAGE_KEY = "curio.finder.v1";

function loadTurns(): Turn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as Turn[]) : [];
    // An answer cut off by the reload will never finish — say so instead of spinning forever
    return turns.map((turn) =>
      turn.role === "assistant" && turn.stage !== "done" ? { ...turn, stage: "done" } : turn
    );
  } catch {
    return [];
  }
}

function saveTurns(turns: Turn[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
  } catch {
    // Private mode or a full quota — the chat works, it just won't survive a reload
  }
}

/** What the model hears of its own past answers: what it offered and how the dives judged it. */
function summarize(answer: Answer): string {
  const games = answer.items.map((item) => {
    const dive = answer.dives[item.gameId];
    const fit = typeof dive === "object" ? `, разбор: ${dive.fit} ${dive.tier ?? ""}` : "";
    return `${item.title} (${item.owned ? "есть" : "магазин"}${fit})`;
  });
  return [answer.understood, games.length ? `Предложено: ${games.join("; ")}` : "Ничего не предложено"]
    .filter(Boolean)
    .join("\n");
}

const FIT_RANK = { yes: 0, maybe: 1, no: 2 } as const;

/** Once every dive is in, the list reads best-first; while they land it holds still. */
function ordered(answer: Answer, items: FinderItem[]): FinderItem[] {
  if (answer.stage !== "done") return items;
  const rank = (item: FinderItem) => {
    const dive = answer.dives[item.gameId];
    if (typeof dive !== "object") return 3;
    return FIT_RANK[dive.fit] * 10 + "SABCD".indexOf(dive.tier ?? "C");
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

export default function GameFinder({
  locale,
  hasLlmKey,
  slotsLeft,
  onTaken,
  onZone,
}: {
  locale: Locale;
  hasLlmKey: boolean;
  slotsLeft: number;
  onTaken: (slot: Slot) => void;
  onZone: (zone: Zone) => void;
}) {
  const s = t(locale);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [taking, setTaking] = useState<number | null>(null);
  const [takeError, setTakeError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  // Read after mount: the island renders on the server first, where there is no storage
  useEffect(() => setTurns(loadTurns()), []);
  useEffect(() => {
    if (!sending) saveTurns(turns);
  }, [turns, sending]);

  /** Every event touches the answer being written — always the last turn. */
  function patchLast(patch: (answer: Answer) => Answer) {
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), patch(last)];
    });
  }

  async function send(text: string) {
    const request = text.trim();
    if (!request || sending) return;

    const history = [...turns, { role: "user" as const, text: request }];
    const payload = history.map((turn) =>
      turn.role === "user" ? turn : { role: "assistant" as const, text: summarize(turn) }
    );

    setTurns([
      ...history,
      { role: "assistant", stage: "shortlist", understood: "", items: [], missed: [], dives: {}, error: null },
    ]);
    setInput("");
    setSending(true);
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);

    try {
      const res = await fetch("/api/game-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: payload }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        const message = data.error === "no_llm_key" ? s.finder.needKey : data.error || s.errors.generic;
        patchLast((answer) => ({ ...answer, stage: "done", error: message }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "stage") {
            patchLast((answer) => ({ ...answer, stage: event.stage }));
          } else if (event.type === "shortlist") {
            patchLast((answer) => ({
              ...answer,
              stage: event.items.length > 0 ? "diving" : "done",
              understood: event.understood,
              items: event.items,
              missed: event.missed,
            }));
          } else if (event.type === "dive") {
            patchLast((answer) => ({
              ...answer,
              dives: { ...answer.dives, [event.gameId]: event.dive ?? event.error },
            }));
          } else if (event.type === "done") {
            finished = true;
            patchLast((answer) => ({ ...answer, stage: "done" }));
          } else if (event.type === "error") {
            finished = true;
            patchLast((answer) => ({ ...answer, stage: "done", error: event.message }));
          }
        }
      }

      if (!finished) {
        patchLast((answer) => ({ ...answer, stage: "done", error: s.finder.streamBroken }));
      }
    } catch {
      patchLast((answer) => ({ ...answer, stage: "done", error: s.errors.network }));
    } finally {
      setSending(false);
    }
  }

  /* The same route as the button under a pick: a refresh overwrites the shared cache. */
  async function rereadDive(answerIndex: number, gameId: number) {
    const set = (value: DeepDive | string) =>
      setTurns((prev) =>
        prev.map((turn, i) =>
          i === answerIndex && turn.role === "assistant"
            ? { ...turn, dives: { ...turn.dives, [gameId]: value } }
            : turn
        )
      );
    try {
      const res = await fetch("/api/deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, refresh: true }),
      });
      const data = await res.json().catch(() => ({}));
      set(res.ok ? (data as DeepDive) : (data.error ?? s.errors.generic));
    } catch {
      set(s.errors.network);
    }
  }

  async function take(item: FinderItem) {
    setTaking(item.gameId);
    setTakeError(null);
    try {
      const res = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: item.gameId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slotId) {
        setTakeError(data.error || s.errors.generic);
        return;
      }
      onTaken({
        slotId: data.slotId,
        gameId: item.gameId,
        title: item.title,
        image: item.headerImage,
        played: 0,
      });
    } catch {
      setTakeError(s.errors.network);
    } finally {
      setTaking(null);
    }
  }

  if (!hasLlmKey) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <h2 className="mb-2 text-lg font-medium">{s.finder.title}</h2>
        <p className="mb-4 text-sm leading-relaxed text-gray-400">{s.finder.needKey}</p>
        <a href="/settings" className="text-sm text-sky-300 underline hover:text-sky-200">
          {s.finder.toSettings}
        </a>
      </div>
    );
  }

  return (
    <div>
      {turns.length === 0 ? (
        <Reveal>
          <h2 className="mb-2 text-2xl font-bold">{s.finder.title}</h2>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-gray-400">{s.finder.lede}</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {s.finder.examples.map((example) => (
              <button
                key={example}
                onClick={() => setInput(example)}
                className="rounded-full border border-gray-800 px-3 py-1.5 text-left text-xs text-gray-500 transition hover:border-sky-700 hover:text-sky-300"
              >
                {example}
              </button>
            ))}
          </div>
        </Reveal>
      ) : (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setTurns([])}
            disabled={sending}
            className="rounded-full border border-gray-800 px-3 py-1 text-xs text-gray-500 transition hover:border-gray-600 hover:text-white disabled:opacity-40"
          >
            {s.finder.reset}
          </button>
        </div>
      )}

      <div className="space-y-8">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-xl rounded-2xl rounded-br-sm bg-gray-800 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-gray-100">
                {turn.text}
              </p>
            </div>
          ) : (
            <AnswerView
              key={i}
              answer={turn}
              s={s}
              locale={locale}
              slotsLeft={slotsLeft}
              taking={taking}
              onTake={take}
              onReread={(gameId) => rereadDive(i, gameId)}
            />
          )
        )}
      </div>

      {takeError && (
        <p className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {takeError}{" "}
          {slotsLeft <= 0 && (
            <button onClick={() => onZone("now")} className="underline underline-offset-2">
              {s.choose.takenGo}
            </button>
          )}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="sticky bottom-4 mt-8 flex items-end gap-2 rounded-2xl border border-gray-800 bg-gray-950/95 p-2 shadow-2xl shadow-black/60 backdrop-blur"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder={turns.length === 0 ? s.finder.placeholder : s.finder.followUp}
          className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-gray-600"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
        >
          {s.finder.send}
        </button>
      </form>
      <div ref={bottom} />
    </div>
  );
}

function AnswerView({
  answer,
  s,
  locale,
  slotsLeft,
  taking,
  onTake,
  onReread,
}: {
  answer: Answer;
  s: Dict;
  locale: Locale;
  slotsLeft: number;
  taking: number | null;
  onTake: (item: FinderItem) => void;
  onReread: (gameId: number) => void;
}) {
  const owned = ordered(answer, answer.items.filter((item) => item.owned));
  const store = ordered(answer, answer.items.filter((item) => !item.owned));
  const read = answer.items.filter((item) => answer.dives[item.gameId] !== undefined).length;
  const working = answer.stage !== "done";

  const stageText =
    answer.stage === "shortlist"
      ? s.finder.stageShortlist
      : answer.stage === "store"
        ? s.finder.stageStore
        : s.finder.diving(read, answer.items.length);

  return (
    <Reveal from="up">
      <div className="flex gap-3">
        <CurioMark className="mt-0.5 h-5 w-5 shrink-0 text-gray-600" />
        <div className="min-w-0 flex-1">
          {answer.understood && (
            <p className="mb-3 text-sm leading-relaxed text-gray-300">
              <RichText text={answer.understood} />
            </p>
          )}

          {working && (
            <p className="mb-4 flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
              {stageText}
            </p>
          )}

          {answer.error && (
            <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">
              {answer.error}
            </p>
          )}

          {answer.items.length > 0 && (
            <>
              <Shelf
                title={s.finder.owned}
                empty={s.finder.noneOwned}
                items={owned}
                answer={answer}
                s={s}
                locale={locale}
                slotsLeft={slotsLeft}
                taking={taking}
                onTake={onTake}
                onReread={onReread}
              />
              <Shelf
                title={s.finder.buy}
                empty={s.finder.noneStore}
                items={store}
                answer={answer}
                s={s}
                locale={locale}
                slotsLeft={slotsLeft}
                taking={taking}
                onTake={onTake}
                onReread={onReread}
              />
            </>
          )}

          {answer.missed.length > 0 && (
            <p className="mt-3 text-xs text-gray-600">{s.finder.missed(answer.missed.join(", "))}</p>
          )}
        </div>
      </div>
    </Reveal>
  );
}

function Shelf({
  title,
  empty,
  items,
  ...rest
}: {
  title: string;
  empty: string;
  items: FinderItem[];
  answer: Answer;
  s: Dict;
  locale: Locale;
  slotsLeft: number;
  taking: number | null;
  onTake: (item: FinderItem) => void;
  onReread: (gameId: number) => void;
}) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs tracking-[0.15em] text-gray-500 uppercase">
        {title} <span className="text-gray-700">· {items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-600">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <GameRow key={item.gameId} item={item} {...rest} />
          ))}
        </div>
      )}
    </section>
  );
}

function GameRow({
  item,
  answer,
  s,
  locale,
  slotsLeft,
  taking,
  onTake,
  onReread,
}: {
  item: FinderItem;
  answer: Answer;
  s: Dict;
  locale: Locale;
  slotsLeft: number;
  taking: number | null;
  onTake: (item: FinderItem) => void;
  onReread: (gameId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const dive = answer.dives[item.gameId];
  const ready = typeof dive === "object" ? dive : null;
  const failed = typeof dive === "string" ? dive : null;
  const tone = ready?.tier ? TIER_STYLE[ready.tier as Tier] : null;
  const fitLabel = ready
    ? ready.fit === "yes"
      ? s.deep.fitYes
      : ready.fit === "no"
        ? s.deep.fitNo
        : s.deep.fitMaybe
    : null;

  // A contract is for the untouched; past that point the game wants a review, not a promise
  const takeable = item.owned && item.playtimeMinutes < THRESHOLDS.MIN_PLAYTIME_TO_REVIEW;
  const hours = Math.round((item.playtimeMinutes / 60) * 10) / 10;

  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900/40 p-3 transition ${
        ready?.fit === "no" ? "opacity-60" : ""
      }`}
    >
      <div className="flex gap-3">
        {item.headerImage && (
          <img src={item.headerImage} alt="" className="header-art hidden w-32 shrink-0 self-start rounded sm:block" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {ready?.tier && (
              <span className={`text-lg leading-none font-black ${tone?.accent ?? ""}`}>{ready.tier}</span>
            )}
            <span className="font-medium">{item.title}</span>
            {ready && fitLabel && (
              <span className={`rounded-full border px-2 py-0.5 text-xs ${FIT_STYLE[ready.fit]}`}>{fitLabel}</span>
            )}
            {!dive && (
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-sky-400" />
                {s.finder.waiting}
              </span>
            )}
            {item.owned && (
              <span className="text-xs text-gray-600">
                {item.verdict ? `${verdictLabel(item.verdict as any, locale)} · ` : ""}
                {hours > 0 ? s.choose.hoursShort(hours) : s.deep.askNeverPlayed}
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
            <RichText text={ready?.summary || item.why} />
          </p>
          {ready?.summary && (
            <p className="mt-1 text-xs leading-relaxed text-gray-600">
              <RichText text={item.why} />
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {(ready || failed) && (
              <button onClick={() => setOpen(!open)} className="text-gray-500 transition hover:text-gray-200">
                {open ? s.finder.less : s.finder.more}
              </button>
            )}
            {takeable && (
              <button
                onClick={() => onTake(item)}
                disabled={taking !== null || slotsLeft <= 0}
                title={slotsLeft <= 0 ? s.choose.slotsFull : undefined}
                className="rounded-lg bg-white px-3 py-1 font-medium text-gray-950 transition hover:scale-[1.02] disabled:opacity-40"
              >
                {taking === item.gameId ? s.choose.taking : s.choose.take}
              </button>
            )}
            {!item.owned && (
              <a
                href={`https://store.steampowered.com/app/${item.steamAppId}/`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-700 px-3 py-1 text-gray-300 transition hover:border-sky-700 hover:text-sky-300"
              >
                {s.finder.openStore} ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {open && dive !== undefined && (
        <DeepDivePanel value={dive} s={s} onRefresh={() => onReread(item.gameId)} />
      )}
    </div>
  );
}
