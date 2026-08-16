import { eq, and, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  games,
  gameEntries,
  gameRecords,
  userGames,
  entryAnalyses,
  entryMentions,
  entryTags,
  entryClaims,
  tags,
} from "../db/schema";
import { getLlmCredentials } from "./llm/credentials";
import { placeMentions, type CatalogGame, type PlacedMention } from "./entry-mentions";
import { readEntry } from "./entry-reading";
import { normalizeTitle } from "./titles";
import { findStoreGame } from "./store-search";

/**
 * Background analysis of a diary entry: one reading, four layers.
 *
 * Game mentions, complaints and praise, bets on what comes next, and the tone
 * of the text — all out of a single model call. Splitting them into separate
 * passes would mean reading the same text four times over.
 */

/** The catalog to match against: every game in the base, flagged for this player. */
async function getCatalog(userId: number): Promise<CatalogGame[]> {
  const [all, library, records] = await Promise.all([
    db.select({ id: games.id, title: games.title }).from(games),
    db
      .select({ gameId: userGames.gameId })
      .from(userGames)
      .where(eq(userGames.userId, userId)),
    db
      .select({ gameId: gameRecords.gameId })
      .from(gameRecords)
      .where(eq(gameRecords.userId, userId)),
  ]);

  const owned = new Set(library.map((row) => row.gameId));
  const written = new Set(records.map((row) => row.gameId));

  return all.map((game) => ({
    id: game.id,
    title: game.title,
    inLibrary: owned.has(game.id),
    hasRecord: written.has(game.id),
  }));
}

/**
 * Creates a catalog row for a game the catalog does not have yet.
 *
 * It does not land in `user_games`: the catalog is shared, the library is
 * personal. The details (genres, description, kind) get pulled in by
 * `scripts/fetch-app-details.ts` — it walks the rows that have none, which is
 * what it was written for.
 */
async function adoptGame(title: string): Promise<number | null> {
  const hit = await findStoreGame(title);
  if (!hit) return null;

  const [created] = await db
    .insert(games)
    .values({ steamAppId: hit.appId, title: hit.title, headerImage: hit.headerImage })
    .onConflictDoNothing({ target: games.steamAppId })
    .returning({ id: games.id });

  if (created) return created.id;

  // The row already existed — or a parallel analysis just created it
  const existing = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.steamAppId, hit.appId))
    .limit(1)
    .then((rows) => rows[0]);

  return existing?.id ?? null;
}

/** Mentions that found no game in the catalog get one from the store. */
async function adoptUnknown(placed: PlacedMention[]): Promise<PlacedMention[]> {
  const seen = new Map<string, number | null>();

  for (const mention of placed) {
    if (mention.gameId !== null) continue;

    const key = mention.canonicalTitle.toLowerCase();
    if (!seen.has(key)) seen.set(key, await adoptGame(mention.canonicalTitle));

    const found = seen.get(key);
    if (found) mention.gameId = found;
  }

  return placed;
}

/** What the player already uses — so the model reuses it instead of breeding synonyms. */
async function getVocabulary(userId: number): Promise<{ complaints: string[]; praises: string[] }> {
  const rows = await db
    .select({ kind: tags.kind, label: tags.label })
    .from(tags)
    .where(eq(tags.userId, userId));

  return {
    complaints: rows.filter((row) => row.kind === "complaint").map((row) => row.label),
    praises: rows.filter((row) => row.kind === "praise").map((row) => row.label),
  };
}

/**
 * Returns the tag id, creating the tag when there isn't one.
 *
 * The key is the normalized form: "Recycled locations" and "recycled locations"
 * have to be one tag. The kind (complaint or praise) of an existing tag is left
 * alone: the player can bring the same property up from either side, and there
 * is no sense flipping it back and forth on every analysis.
 */
async function upsertTag(
  userId: number,
  kind: "complaint" | "praise",
  label: string
): Promise<number | null> {
  const normalized = normalizeTitle(label);
  if (!normalized) return null;

  const [created] = await db
    .insert(tags)
    .values({ userId, kind, label, normalized })
    .onConflictDoNothing({ target: [tags.userId, tags.normalized] })
    .returning({ id: tags.id });

  if (created) return created.id;

  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.normalized, normalized)))
    .limit(1)
    .then((rows) => rows[0]);

  return existing?.id ?? null;
}

/**
 * Tags of an entry. Only what the model proposed is cleared: a tag set by hand
 * is the player's decision, and a re-run has no right to undo it.
 */
async function saveTags(
  userId: number,
  entryId: number,
  complaints: string[],
  praises: string[]
): Promise<void> {
  await db
    .delete(entryTags)
    .where(and(eq(entryTags.entryId, entryId), eq(entryTags.source, "model")));

  const wanted: Array<{ kind: "complaint" | "praise"; label: string }> = [
    ...complaints.map((label) => ({ kind: "complaint" as const, label })),
    ...praises.map((label) => ({ kind: "praise" as const, label })),
  ];

  for (const item of wanted) {
    const tagId = await upsertTag(userId, item.kind, item.label);
    if (!tagId) continue;
    await db
      .insert(entryTags)
      .values({ entryId, tagId, source: "model" })
      .onConflictDoNothing({ target: [entryTags.entryId, entryTags.tagId] });
  }
}

/** Bets are rewritten wholesale: this is the model's markup, not the player's. */
async function saveClaims(entryId: number, claims: string[]): Promise<void> {
  await db.delete(entryClaims).where(eq(entryClaims.entryId, entryId));
  if (claims.length === 0) return;
  await db.insert(entryClaims).values(claims.map((text) => ({ entryId, text })));
}

export async function analyzeEntry(entryId: number): Promise<void> {
  const entry = await db
    .select({
      text: gameEntries.text,
      userId: gameRecords.userId,
      gameId: gameRecords.gameId,
      gameTitle: games.title,
    })
    .from(gameEntries)
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .innerJoin(games, eq(games.id, gameRecords.gameId))
    .where(eq(gameEntries.id, entryId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!entry) return;

  /*
   * No key means AI is simply switched off for this player. There is no sense
   * creating an analysis row: it would sit in pending forever and read as a
   * hung run, even though nothing ever started.
   */
  const creds = await getLlmCredentials(entry.userId);
  if (!creds) return;

  await db
    .insert(entryAnalyses)
    .values({ entryId, model: creds.model, status: "pending" })
    .onConflictDoUpdate({
      target: entryAnalyses.entryId,
      set: { status: "pending", model: creds.model, error: null, finishedAt: null },
    });

  try {
    const [catalog, vocabulary] = await Promise.all([
      getCatalog(entry.userId),
      getVocabulary(entry.userId),
    ]);

    const reading = await readEntry(
      { text: entry.text, aboutTitle: entry.gameTitle, vocabulary },
      creds
    );

    const placed = await adoptUnknown(
      placeMentions(entry.text, reading.mentions, catalog, entry.gameId)
    );

    // Analysis is repeatable: the old markup is cleared wholesale, otherwise a
    // prompt edit leaves traces of the previous pass in the text
    await db.delete(entryMentions).where(eq(entryMentions.entryId, entryId));
    if (placed.length > 0) {
      await db.insert(entryMentions).values(placed.map((mention) => ({ entryId, ...mention })));
    }

    await saveTags(entry.userId, entryId, reading.complaints, reading.praises);
    await saveClaims(entryId, reading.claims);

    await db
      .update(entryAnalyses)
      .set({ status: "done", tone: reading.tone, finishedAt: new Date() })
      .where(eq(entryAnalyses.entryId, entryId));
  } catch (err) {
    await db
      .update(entryAnalyses)
      .set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      })
      .where(eq(entryAnalyses.entryId, entryId));
  }
}

/**
 * Analysis must not hold up the save, let alone bring it down: the player has
 * just finished an impression and needs an answer right away, while the
 * mentions can wait until the diary is opened next.
 */
export function queueEntryAnalysis(entryId: number): void {
  analyzeEntry(entryId).catch(() => {});
}

/** The entry belongs to this player — checked before any edit from outside. */
async function ownsEntry(userId: number, entryId: number): Promise<boolean> {
  const row = await db
    .select({ id: gameEntries.id })
    .from(gameEntries)
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .where(and(eq(gameEntries.id, entryId), eq(gameRecords.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  return !!row;
}

/**
 * A tag set by hand. Marked as the player's own and survives a re-run of the
 * analysis: they have already decided this property is here.
 */
export async function addEntryTag(
  userId: number,
  entryId: number,
  kind: "complaint" | "praise",
  label: string
): Promise<{ id: number; label: string; kind: string } | null> {
  if (!(await ownsEntry(userId, entryId))) return null;

  const tagId = await upsertTag(userId, kind, label);
  if (!tagId) return null;

  await db
    .insert(entryTags)
    .values({ entryId, tagId, source: "user" })
    .onConflictDoUpdate({
      target: [entryTags.entryId, entryTags.tagId],
      set: { source: "user" },
    });

  return { id: tagId, label, kind };
}

/**
 * Dropping a tag removes it from the entry but keeps it in the vocabulary: the
 * player took it off this entry, they did not renounce the notion itself.
 */
export async function removeEntryTag(
  userId: number,
  entryId: number,
  tagId: number
): Promise<boolean> {
  if (!(await ownsEntry(userId, entryId))) return false;

  await db
    .delete(entryTags)
    .where(and(eq(entryTags.entryId, entryId), eq(entryTags.tagId, tagId)));

  return true;
}

/** Entry tags for the diary. */
export async function getDiaryTags(userId: number) {
  return db
    .select({
      entryId: entryTags.entryId,
      tagId: tags.id,
      label: tags.label,
      kind: tags.kind,
    })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .innerJoin(gameEntries, eq(gameEntries.id, entryTags.entryId))
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .where(eq(gameRecords.userId, userId))
    .orderBy(desc(tags.kind), tags.label);
}

/** Markup for the diary: every mention across this player's entries. */
export async function getDiaryMentions(userId: number) {
  const sourceGames = alias(games, "source_games");

  return db
    .select({
      entryId: entryMentions.entryId,
      surface: entryMentions.surface,
      startOffset: entryMentions.startOffset,
      targetGameId: entryMentions.gameId,
      targetTitle: games.title,
      targetSteamAppId: games.steamAppId,
      sourceGameId: gameRecords.gameId,
      sourceTitle: sourceGames.title,
    })
    .from(entryMentions)
    .innerJoin(gameEntries, eq(gameEntries.id, entryMentions.entryId))
    .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
    .innerJoin(sourceGames, eq(sourceGames.id, gameRecords.gameId))
    .innerJoin(games, eq(games.id, entryMentions.gameId))
    .where(eq(gameRecords.userId, userId));
}
