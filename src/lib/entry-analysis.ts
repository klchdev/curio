import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { GEMINI_KEYS } from "./gemini-env";
import { db } from "../db";
import {
  games,
  gameEntries,
  gameRecords,
  userGames,
  entryAnalyses,
  entryMentions,
} from "../db/schema";
import { GEMINI_MODEL } from "./gemini";
import { extractMentions, placeMentions, type CatalogGame } from "./entry-mentions";

/**
 * Фоновый разбор записи дневника.
 *
 * Пока слой один — упоминания других игр. Дальше сюда же лягут теги
 * претензий, ставки на будущее и тон текста: это один проход по одному
 * тексту, и разносить его на четыре вызова модели незачем.
 */

/** Каталог для сопоставления: все игры базы с пометками про этого человека. */
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

  await db
    .insert(entryAnalyses)
    .values({ entryId, model: GEMINI_MODEL, status: "pending" })
    .onConflictDoUpdate({
      target: entryAnalyses.entryId,
      set: { status: "pending", model: GEMINI_MODEL, error: null, finishedAt: null },
    });

  try {
    const catalog = await getCatalog(entry.userId);
    const raw = await extractMentions(entry.text, entry.gameTitle, GEMINI_KEYS);
    const placed = placeMentions(entry.text, raw, catalog, entry.gameId);

    // Разбор повторяемый: старая разметка снимается целиком, иначе правка
    // промпта оставит в тексте следы предыдущего прохода
    await db.delete(entryMentions).where(eq(entryMentions.entryId, entryId));
    if (placed.length > 0) {
      await db.insert(entryMentions).values(placed.map((mention) => ({ entryId, ...mention })));
    }

    await db
      .update(entryAnalyses)
      .set({ status: "done", finishedAt: new Date() })
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
 * Разбор не должен задерживать сохранение и тем более ронять его: человек
 * дописал впечатление, и ответ ему нужен сразу, а упоминания подождут до
 * следующего открытия дневника.
 */
export function queueEntryAnalysis(entryId: number): void {
  analyzeEntry(entryId).catch(() => {});
}

/** Разметка для дневника: все упоминания в записях этого человека. */
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
