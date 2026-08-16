import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { gameEntries, gameRecords, entryAnalyses } from "../db/schema";

/**
 * What the player should see before writing the next entry.
 *
 * Two things, and both are about their own text rather than about the game.
 * First: how they talked about this game before, in their own words and with a
 * playtime stamp. Second: whether the rating has drifted away from how the
 * latest entries sound.
 *
 * Nothing here drafts the entry for them, and that is deliberate: the only
 * value of the diary is that the words are theirs, and slipping them ready-made
 * phrasings destroys exactly that. We show what was said; the writing is on
 * them.
 */

export interface EntryQuote {
  playtimeMinutes: number;
  text: string;
}

export interface ToneDrift {
  /** The rating currently set. */
  rating: number;
  /** What we suggest in its place. */
  suggested: number;
  /** How many entries in a row the rating has not moved. */
  entries: number;
}

export interface EntryContext {
  quotes: EntryQuote[];
  drift: ToneDrift | null;
}

/** We take the opening paragraph: a quote is a reminder, not a re-read. */
function excerpt(text: string, limit = 120): string {
  const line = text.split("\n").find((part) => part.trim().length > 0)?.trim() ?? "";
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : limit).trimEnd()}…`;
}

/**
 * Tone maps to a rating crudely, and on purpose: −2 is 1 out of 5, 2 is 5 out
 * of 5. Precision is not the point here — the point is the question "are you
 * sure?", not a second scale.
 */
function toneToRating(tone: number): number {
  return Math.max(1, Math.min(5, tone + 3));
}

const MIN_ENTRIES_WITHOUT_CHANGE = 3;
/** A gap under two steps is noise: people write more sharply than they think. */
const MIN_GAP = 2;

export async function getEntryContext(userId: number, gameId: number): Promise<EntryContext> {
  const record = await db
    .select({ id: gameRecords.id, rating: gameRecords.rating })
    .from(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!record) return { quotes: [], drift: null };

  const entries = await db
    .select({
      text: gameEntries.text,
      kind: gameEntries.kind,
      playtimeMinutes: gameEntries.playtimeTotalMinutes,
      ratingAt: gameEntries.ratingAt,
      tone: entryAnalyses.tone,
    })
    .from(gameEntries)
    .leftJoin(entryAnalyses, eq(entryAnalyses.entryId, gameEntries.id))
    .where(eq(gameEntries.recordId, record.id))
    .orderBy(desc(gameEntries.createdAt));

  // The model's advice is not their words — no point quoting it back at them
  const own = entries.filter((entry) => entry.kind !== "advisor");

  const quotes: EntryQuote[] = own
    .slice(0, 5)
    .reverse()
    .map((entry) => ({ playtimeMinutes: entry.playtimeMinutes, text: excerpt(entry.text) }))
    .filter((quote) => quote.text.length > 0);

  return { quotes, drift: findDrift(own, record.rating) };
}

function findDrift(
  entries: Array<{ ratingAt: number | null; tone: number | null }>,
  currentRating: number | null
): ToneDrift | null {
  if (!currentRating) return null;

  /*
   * Count how many entries in a row the rating has stayed put. Entries run
   * newest to oldest, so the very first mismatch ends the count.
   */
  let unchanged = 0;
  for (const entry of entries) {
    if (entry.ratingAt !== null && entry.ratingAt !== currentRating) break;
    unchanged += 1;
  }
  if (unchanged < MIN_ENTRIES_WITHOUT_CHANGE) return null;

  const recent = entries
    .slice(0, 3)
    .map((entry) => entry.tone)
    .filter((tone): tone is number => tone !== null);

  // Not every entry has a tone: the analysis may not have run, or may have failed
  if (recent.length < MIN_ENTRIES_WITHOUT_CHANGE) return null;

  const average = recent.reduce((sum, tone) => sum + tone, 0) / recent.length;
  const suggested = toneToRating(Math.round(average));
  if (Math.abs(suggested - currentRating) < MIN_GAP) return null;

  return { rating: currentRating, suggested, entries: unchanged };
}
