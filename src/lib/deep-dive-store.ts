import { db } from "../db";
import { games, deepDives } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getAppReviews } from "./steam";
import { generateDeepDive, type DeepDive } from "./deep-dive";
import { getReviewCorpus, getFirstPassPick, getTasteProfile, type ReviewCorpusItem, type TasteTag } from "./queries";
import type { LlmCredentials } from "./llm";
import type { Locale } from "./i18n";

/**
 * The deep dive with its cache: what the "dig deeper" button and the finder
 * chat share. Both used to be one route; the chat runs the same dive over a
 * handful of games at once, and a second copy of "read cache, ask Steam, ask
 * the model, store" would drift from the first within a month.
 */

export interface StoredDeepDive extends DeepDive {
  reviewsUsed: number;
  cached: boolean;
}

export async function getCachedDeepDive(
  userId: number,
  gameId: number
): Promise<StoredDeepDive | null> {
  const row = await db
    .select()
    .from(deepDives)
    .where(and(eq(deepDives.userId, userId), eq(deepDives.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row) return null;
  return {
    fit: row.fit,
    tier: (row.tier ?? "C") as DeepDive["tier"],
    summary: row.summary,
    forYou: row.forYou,
    against: row.against,
    complaints: row.complaints ? row.complaints.split("\n") : [],
    reviewsUsed: row.reviewsUsed,
    cached: true,
  };
}

/** The player's side of the dive — the same for every game, so a batch fetches it once. */
export interface TasteContext {
  corpus: ReviewCorpusItem[];
  profile: TasteTag[];
}

export async function getTasteContext(userId: number): Promise<TasteContext> {
  const [corpus, profile] = await Promise.all([getReviewCorpus(userId), getTasteProfile(userId)]);
  return { corpus, profile };
}

export async function diveAndSave(
  userId: number,
  gameId: number,
  creds: LlmCredentials,
  locale: Locale,
  taste?: TasteContext
): Promise<StoredDeepDive | null> {
  const game = await db
    .select({
      steamAppId: games.steamAppId,
      title: games.title,
      genres: games.genres,
      description: games.shortDescription,
      releaseDate: games.releaseDate,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!game) return null;

  const [reviews, context, firstPass] = await Promise.all([
    getAppReviews(game.steamAppId),
    taste ?? getTasteContext(userId),
    getFirstPassPick(userId, gameId),
  ]);

  const dive = await generateDeepDive(
    {
      title: game.title,
      genres: game.genres,
      releaseDate: game.releaseDate,
      description: game.description,
      reviews,
      corpus: context.corpus,
      profile: context.profile,
      firstPass,
    },
    creds,
    locale
  );

  const reviewsUsed = reviews?.reviews.length ?? 0;
  const values = {
    fit: dive.fit,
    tier: dive.tier,
    summary: dive.summary,
    forYou: dive.forYou,
    against: dive.against,
    complaints: dive.complaints.join("\n"),
    reviewsUsed,
  };

  await db
    .insert(deepDives)
    .values({ userId, gameId, ...values })
    .onConflictDoUpdate({
      target: [deepDives.userId, deepDives.gameId],
      set: { ...values, createdAt: new Date() },
    });

  return { ...dive, reviewsUsed, cached: false };
}
