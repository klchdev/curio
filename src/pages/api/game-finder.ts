import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import { games } from "../../db/schema";
import { eq } from "drizzle-orm";
import { getFinderLibrary } from "../../lib/queries";
import { generateShortlist, type FinderTurn } from "../../lib/game-finder";
import { getCachedDeepDive, diveAndSave, getTasteContext } from "../../lib/deep-dive-store";
import { resolveStoreGame, type StoreHit } from "../../lib/store-search";
import { getStoreAppDetails } from "../../lib/steam";
import { getLlmCredentials } from "../../lib/llm/credentials";
import { modelErrorText } from "../../lib/query-errors";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";

/** Dives run side by side, but not all at once: each is two Steam calls and a model call. */
const DIVE_CONCURRENCY = 3;
const MAX_TURNS = 20;
const MAX_TURN_LENGTH = 2000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export interface FinderItem {
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

function parseTurns(body: unknown): FinderTurn[] | null {
  const raw = (body as { turns?: unknown })?.turns;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const turns = raw
    .slice(-MAX_TURNS)
    .map((turn) => ({
      role: turn?.role === "assistant" ? ("assistant" as const) : ("user" as const),
      text: typeof turn?.text === "string" ? turn.text.trim().slice(0, MAX_TURN_LENGTH) : "",
    }))
    .filter((turn) => turn.text.length > 0);

  const last = turns[turns.length - 1];
  return last?.role === "user" ? turns : null;
}

/**
 * A store game gets a card in the shared catalog, the same way a game
 * mentioned in a diary entry does: the deep dive and its cache are keyed by
 * catalog id, and the card is what the person would see if they bought it.
 *
 * Returns null for what is not a game at all — a soundtrack or a DLC that
 * the search matched by title.
 */
async function adoptStoreGame(hit: StoreHit): Promise<number | null> {
  await db
    .insert(games)
    .values({ steamAppId: hit.appId, title: hit.title, headerImage: hit.headerImage })
    .onConflictDoNothing({ target: games.steamAppId });

  const row = await db
    .select({
      id: games.id,
      type: games.type,
      isSoftware: games.isSoftware,
      detailsFetchedAt: games.detailsFetchedAt,
    })
    .from(games)
    .where(eq(games.steamAppId, hit.appId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row) return null;

  let type = row.type;
  let isSoftware = row.isSoftware;

  // The dive reads genres and the description — a bare card would leave it guessing
  if (!row.detailsFetchedAt) {
    const details = await getStoreAppDetails(hit.appId).catch(() => null);
    await db
      .update(games)
      .set({
        detailsFetchedAt: new Date(),
        ...(details
          ? {
              type: details.type,
              shortDescription: details.shortDescription,
              genres: details.genres,
              categories: details.categories,
              releaseDate: details.releaseDate,
              isSoftware: details.isSoftware,
              headerImage: details.headerImage ?? hit.headerImage,
            }
          : {}),
      })
      .where(eq(games.id, row.id));
    type = details?.type ?? null;
    isSoftware = details?.isSoftware ?? false;
  }

  // Unknown type counts as a game: the store not answering is no reason to drop it
  if (isSoftware || (type !== null && type !== "game")) return null;
  return row.id;
}

/**
 * The finder chat. One request in, a stream of NDJSON events out: first the
 * shortlist, then each game's deep dive as it lands. A shortlist of a dozen
 * games with a dive each takes a minute or more, and a minute of a blank
 * screen reads as broken — so the list shows at once and fills in.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const locale = localeFrom(cookies, request);
  const s = t(locale);

  const turns = parseTurns(await request.json().catch(() => null));
  if (!turns) return json({ error: s.finder.emptyRequest }, 400);

  // Unlike the advisor run, there is no rules fallback here: a free-form request needs a model
  const creds = await getLlmCredentials(userId);
  if (!creds) return json({ error: "no_llm_key" }, 400);

  let cancelled = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          cancelled = true;
        }
      };

      try {
        send({ type: "stage", stage: "shortlist" });

        const [library, taste] = await Promise.all([getFinderLibrary(userId), getTasteContext(userId)]);
        const shortlist = await generateShortlist(
          turns,
          library,
          taste.corpus,
          taste.profile,
          creds,
          locale
        );

        send({ type: "stage", stage: "store" });

        const byAppId = new Map(library.map((game) => [game.steamAppId, game]));
        const items: FinderItem[] = [];
        const ownedItem = (appId: number, why: string): FinderItem => {
          const game = byAppId.get(appId)!;
          return {
            gameId: game.gameId,
            steamAppId: game.steamAppId,
            title: game.title,
            headerImage: game.headerImage,
            why,
            owned: true,
            playtimeMinutes: game.playtimeMinutes,
            hasRecord: game.hasRecord,
            verdict: game.verdict,
          };
        };

        for (const pick of shortlist.library) items.push(ownedItem(pick.steamAppId, pick.why));

        const missed: string[] = [];
        const resolved = await Promise.all(
          shortlist.store.map(async (pick) => ({ pick, hit: await resolveStoreGame(pick.title) }))
        );

        for (const { pick, hit } of resolved) {
          if (!hit) {
            missed.push(pick.title);
            continue;
          }
          if (items.some((item) => item.steamAppId === hit.appId)) continue;

          // The model offered to sell what is already on the shelf — it goes where it belongs
          if (byAppId.has(hit.appId)) {
            items.push(ownedItem(hit.appId, pick.why));
            continue;
          }

          const gameId = await adoptStoreGame(hit).catch(() => null);
          if (gameId === null) {
            missed.push(pick.title);
            continue;
          }
          const card = await db
            .select({ title: games.title, headerImage: games.headerImage })
            .from(games)
            .where(eq(games.id, gameId))
            .limit(1)
            .then((rows) => rows[0]);

          items.push({
            gameId,
            steamAppId: hit.appId,
            title: card?.title ?? hit.title,
            headerImage: card?.headerImage ?? hit.headerImage,
            why: pick.why,
            owned: false,
            playtimeMinutes: 0,
            hasRecord: false,
            verdict: null,
          });
        }

        send({ type: "shortlist", understood: shortlist.understood, items, missed });

        /*
         * A dive already in the cache goes out at once and costs nothing; the
         * rest share a small pool. A closed tab stops the pool from starting
         * new dives — the person is no longer there to read them.
         */
        const pending: FinderItem[] = [];
        for (const item of items) {
          const cached = await getCachedDeepDive(userId, item.gameId);
          if (cached) send({ type: "dive", gameId: item.gameId, dive: cached });
          else pending.push(item);
        }

        const worker = async () => {
          for (let item = pending.shift(); item && !cancelled; item = pending.shift()) {
            try {
              const dive = await diveAndSave(userId, item.gameId, creds, locale, taste);
              send({ type: "dive", gameId: item.gameId, dive });
            } catch (err) {
              console.error("[game-finder] dive", item.title, err);
              send({ type: "dive", gameId: item.gameId, error: modelErrorText(s, err, creds.provider) });
            }
          }
        };
        await Promise.all(Array.from({ length: DIVE_CONCURRENCY }, worker));

        send({ type: "done" });
      } catch (err) {
        console.error("[game-finder]", err);
        send({ type: "error", message: modelErrorText(s, err, creds.provider) });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the client going away
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      // Proxies that buffer would hold the whole minute back and defeat the stream
      "X-Accel-Buffering": "no",
    },
  });
};
