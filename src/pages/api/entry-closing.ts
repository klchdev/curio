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
import { getLlmCredentials } from "../../lib/llm/credentials";
import { adapterFor, LlmAuthError } from "../../lib/llm";
import { localeFrom } from "../../lib/i18n";
import { t } from "../../lib/strings";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * The moment a game closes: Curio has its say and asks about what the review
 * leaves out.
 *
 * Two model calls run in parallel rather than one doing both jobs: a verdict
 * and questions ask for different things — to speak and to probe. We wait on
 * the longer of the two either way, and both prompts stay sharp.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const s = t(localeFrom(cookies, request));

  const body = await request.json().catch(() => ({}));
  const gameId = Number(body.gameId);
  if (!Number.isInteger(gameId)) return json({ error: s.errors.noGame }, 400);

  /*
   * Everyone brings their own key, and a missing one is not a failure but an
   * unfilled setting. A separate code so the interface points at settings
   * instead of showing "something went wrong".
   */
  const creds = await getLlmCredentials(userId);
  if (!creds) return json({ error: "no_llm_key" }, 400);

  /*
   * The diary asks for the verdict only: questions make sense right after
   * someone has finished writing a review, not when they are re-reading an old
   * thread. Generating them "just in case" means paying for what nobody sees.
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

    // A vocabulary with reach: a tag seen in one game is an accident,
    // one seen in seven is a property of taste
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

  // Games where the same tags showed up: those are the ones worth comparing against
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

  /*
   * Silence is the worst answer: an empty verdict and a hit rate limit look
   * identical from the interface, and the person is left guessing whether it
   * broke or it simply had nothing to say.
   */
  let failure: string | null = null;

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
      creds
    ).catch((err) => {
      console.error("[entry-closing:take]", err);
      const kind = adapterFor(creds.provider).classifyError(err).kind;
      failure = err instanceof LlmAuthError
        ? s.llm.errorAuth
        : kind === "rate_limit"
          ? s.errors.modelQuota
          : kind === "overloaded" || kind === "server"
            ? s.errors.modelBusy
            : s.errors.generic;
      return "";
    }),

    takeOnly
      ? Promise.resolve([] as string[])
      : generateQuestions(shared, creds).catch((err) => {
          console.error("[entry-closing:questions]", err);
          return [] as string[];
        }),
  ]);

  // The verdict stays in the feed: in six months it is worth more than it is now
  if (take) await saveCurioTake(userId, gameId, take);

  return json({ take, questions, error: failure });
};
