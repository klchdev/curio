import type { APIRoute } from "astro";
import { eq, and, desc, ne } from "drizzle-orm";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import { games, gameEntries, gameRecords } from "../../db/schema";
import { generateQuestions } from "../../lib/entry-questions";
import { GEMINI_KEYS } from "../../lib/gemini-env";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Вопросы к закрытому отзыву. Пустой список — законный ответ: отзыв бывает и
 * полным, а выдумывать вопрос ради вопроса значит приучить его пролистывать.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({}));
  const gameId = Number(body.gameId);
  if (!Number.isInteger(gameId)) return json({ error: "Не указана игра" }, 400);

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

  if (!record) return json({ questions: [] });

  const [entries, neighbours] = await Promise.all([
    db
      .select({
        text: gameEntries.text,
        kind: gameEntries.kind,
        playtimeMinutes: gameEntries.playtimeTotalMinutes,
        rating: gameEntries.ratingAt,
        tier: gameEntries.tierAt,
      })
      .from(gameEntries)
      .where(eq(gameEntries.recordId, record.id))
      .orderBy(gameEntries.createdAt),

    // Соседи нужны, чтобы вопрос мог опереться на сравнение с его же оценками
    db
      .select({ title: games.title, tier: gameRecords.tier, rating: gameRecords.rating })
      .from(gameRecords)
      .innerJoin(games, eq(games.id, gameRecords.gameId))
      .where(and(eq(gameRecords.userId, userId), ne(gameRecords.gameId, gameId)))
      .orderBy(desc(gameRecords.lastEntryAt))
      .limit(30),
  ]);

  const own = entries.filter((entry) => entry.kind !== "advisor");
  if (own.length === 0) return json({ questions: [] });

  try {
    const questions = await generateQuestions(
      {
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
      },
      GEMINI_KEYS
    );

    return json({ questions });
  } catch (err) {
    // Вопросы — необязательная надстройка: не вышло, значит их просто нет
    console.error("[entry-questions]", err);
    return json({ questions: [] });
  }
};
