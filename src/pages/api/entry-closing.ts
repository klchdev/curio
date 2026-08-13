import type { APIRoute } from "astro";
import { eq, and, ne, desc, sql, inArray } from "drizzle-orm";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import {
  games,
  gameEntries,
  gameRecords,
  entryAnalyses,
  entryTags,
  tags,
} from "../../db/schema";
import { generateQuestions } from "../../lib/entry-questions";
import { generateTake } from "../../lib/curio-take";
import { saveCurioTake } from "../../lib/queries";
import { GEMINI_KEYS } from "../../lib/gemini-env";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Момент закрытия игры: Curio говорит своё и спрашивает про то, чего в
 * отзыве нет.
 *
 * Две модели работают параллельно, а не одна на два дела: вердикт и вопросы
 * требуют разного — сказать и спросить. Ждём мы всё равно по дольшему из
 * двух, а промпты остаются острыми.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({}));
  const gameId = Number(body.gameId);
  if (!Number.isInteger(gameId)) return json({ error: "Не указана игра" }, 400);

  /*
   * Из дневника спрашивают только вердикт: вопросы имеют смысл сразу после
   * того, как человек дописал отзыв, а не когда он перечитывает старый тред.
   * Генерировать их «на всякий случай» — платить за то, что никто не увидит.
   */
  const takeOnly = body.only === "take";

  const record = await db
    .select({
      id: gameRecords.id,
      verdict: gameRecords.verdict,
      rating: gameRecords.rating,
      tier: gameRecords.tier,
      title: games.title,
    })
    .from(gameRecords)
    .innerJoin(games, eq(games.id, gameRecords.gameId))
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!record) return json({ take: "", questions: [] });

  const [entries, neighbours, profile] = await Promise.all([
    db
      .select({
        text: gameEntries.text,
        kind: gameEntries.kind,
        playtimeMinutes: gameEntries.playtimeTotalMinutes,
        rating: gameEntries.ratingAt,
        tier: gameEntries.tierAt,
        tone: entryAnalyses.tone,
      })
      .from(gameEntries)
      .leftJoin(entryAnalyses, eq(entryAnalyses.entryId, gameEntries.id))
      .where(eq(gameEntries.recordId, record.id))
      .orderBy(gameEntries.createdAt),

    db
      .select({ title: games.title, tier: gameRecords.tier, rating: gameRecords.rating })
      .from(gameRecords)
      .innerJoin(games, eq(games.id, gameRecords.gameId))
      .where(and(eq(gameRecords.userId, userId), ne(gameRecords.gameId, gameId)))
      .orderBy(desc(gameRecords.lastEntryAt))
      .limit(30),

    // Словарь с охватом: тег, встреченный в одной игре, — случайность,
    // встреченный в семи — свойство вкуса
    db
      .select({
        label: tags.label,
        kind: tags.kind,
        games: sql<number>`count(distinct ${gameRecords.gameId})::int`,
      })
      .from(tags)
      .innerJoin(entryTags, eq(entryTags.tagId, tags.id))
      .innerJoin(gameEntries, eq(gameEntries.id, entryTags.entryId))
      .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
      .where(eq(tags.userId, userId))
      .groupBy(tags.id, tags.label, tags.kind)
      .orderBy(desc(sql`count(distinct ${gameRecords.gameId})`))
      .limit(20),
  ]);

  const own = entries.filter((entry) => entry.kind !== "advisor");
  if (own.length === 0) return json({ take: "", questions: [] });

  // Игры, где встречались те же теги: с ними и есть смысл сравнивать
  const ownLabels = profile.map((tag) => tag.label);
  const related = ownLabels.length
    ? await db
        .select({
          title: games.title,
          tier: gameRecords.tier,
          rating: gameRecords.rating,
          labels: sql<string>`string_agg(distinct ${tags.label}, ', ')`,
        })
        .from(entryTags)
        .innerJoin(tags, eq(tags.id, entryTags.tagId))
        .innerJoin(gameEntries, eq(gameEntries.id, entryTags.entryId))
        .innerJoin(gameRecords, eq(gameRecords.id, gameEntries.recordId))
        .innerJoin(games, eq(games.id, gameRecords.gameId))
        .where(
          and(
            eq(gameRecords.userId, userId),
            ne(gameRecords.gameId, gameId),
            inArray(tags.label, ownLabels)
          )
        )
        .groupBy(games.id, games.title, gameRecords.tier, gameRecords.rating)
        .limit(12)
    : [];

  const shared = {
    gameTitle: record.title,
    verdict: record.verdict,
    rating: record.rating,
    tier: record.tier,
    entries: own.map((entry) => ({
      hours: Math.round((entry.playtimeMinutes / 60) * 10) / 10,
      text: entry.text,
      rating: entry.rating,
      tier: entry.tier,
    })),
    neighbours,
  };

  const [take, questions] = await Promise.all([
    generateTake(
      {
        ...shared,
        tones: own.map((entry) => entry.tone).filter((tone): tone is number => tone !== null),
        profile,
        related: related.map((game) => ({
          title: game.title,
          tier: game.tier,
          rating: game.rating,
          labels: (game.labels ?? "").split(", ").filter(Boolean),
        })),
      },
      GEMINI_KEYS
    ).catch((err) => {
      console.error("[entry-closing:take]", err);
      return "";
    }),

    takeOnly
      ? Promise.resolve([] as string[])
      : generateQuestions(shared, GEMINI_KEYS).catch((err) => {
          console.error("[entry-closing:questions]", err);
          return [] as string[];
        }),
  ]);

  // Вердикт остаётся в ленте: через полгода он ценнее, чем сейчас
  if (take) await saveCurioTake(userId, gameId, take);

  return json({ take, questions });
};
