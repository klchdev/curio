import { eq, and, desc } from "drizzle-orm";
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
  entryTags,
  entryClaims,
  tags,
} from "../db/schema";
import { GEMINI_MODEL } from "./gemini";
import { placeMentions, type CatalogGame, type PlacedMention } from "./entry-mentions";
import { readEntry } from "./entry-reading";
import { normalizeTitle } from "./titles";
import { findStoreGame } from "./store-search";

/**
 * Фоновый разбор записи дневника: одно прочтение, четыре слоя.
 *
 * Упоминания игр, претензии и похвалы, ставки на будущее и тон текста —
 * всё из одного вызова модели. Разносить их по отдельным проходам значило бы
 * читать один и тот же текст четыре раза.
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

/**
 * Заводит карточку игры, которой ещё нет в каталоге.
 *
 * В `user_games` она не попадает: каталог общий, а библиотека — личная.
 * Детали (жанры, описание, тип) подтянет `scripts/fetch-app-details.ts` —
 * он ходит по строкам без деталей и для того и написан.
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

  // Карточка уже была — либо завелась параллельным разбором
  const existing = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.steamAppId, hit.appId))
    .limit(1)
    .then((rows) => rows[0]);

  return existing?.id ?? null;
}

/** Упоминания, не нашедшие игру в каталоге, получают её из магазина. */
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

/** Чем человек уже пользовался — чтобы модель брала своё, а не плодила синонимы. */
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
 * Возвращает id тега, заводя его при необходимости.
 *
 * Ключ — нормализованная форма: «Рециклинг локаций» и «рециклинг локаций»
 * должны быть одним тегом. Вид (претензия или похвала) у существующего тега
 * не меняем: одно и то же свойство человек может помянуть с обеих сторон, и
 * перекидывать его туда-сюда на каждом разборе незачем.
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
 * Теги записи. Снимается только предложенное моделью: поставленное руками —
 * решение человека, и повторный разбор не вправе его отменять.
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

/** Ставки перезаписываются целиком: разметка модели, а не человека. */
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

  await db
    .insert(entryAnalyses)
    .values({ entryId, model: GEMINI_MODEL, status: "pending" })
    .onConflictDoUpdate({
      target: entryAnalyses.entryId,
      set: { status: "pending", model: GEMINI_MODEL, error: null, finishedAt: null },
    });

  try {
    const [catalog, vocabulary] = await Promise.all([
      getCatalog(entry.userId),
      getVocabulary(entry.userId),
    ]);

    const reading = await readEntry(
      { text: entry.text, aboutTitle: entry.gameTitle, vocabulary },
      GEMINI_KEYS
    );

    const placed = await adoptUnknown(
      placeMentions(entry.text, reading.mentions, catalog, entry.gameId)
    );

    // Разбор повторяемый: старая разметка снимается целиком, иначе правка
    // промпта оставит в тексте следы предыдущего прохода
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
 * Разбор не должен задерживать сохранение и тем более ронять его: человек
 * дописал впечатление, и ответ ему нужен сразу, а упоминания подождут до
 * следующего открытия дневника.
 */
export function queueEntryAnalysis(entryId: number): void {
  analyzeEntry(entryId).catch(() => {});
}

/** Запись принадлежит этому человеку — проверка перед любой правкой извне. */
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
 * Тег, поставленный руками. Помечается как свой и переживает повторный
 * разбор: человек уже решил, что это свойство тут есть.
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
 * Снятый тег удаляется у записи, но остаётся в словаре: человек убрал его
 * отсюда, а не отказался от самого понятия.
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

/** Теги записей для дневника. */
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
