import type { APIRoute } from "astro";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import {
  deepDives,
  entryAnalyses,
  entryClaims,
  entryMentions,
  entryTags,
  gameEntries,
  gameRecords,
  games,
  playSessions,
  playtimeSnapshots,
  recommendationRuns,
  recommendations,
  slotSkips,
  slots,
  tags,
  userGames,
  users,
} from "../../db/schema";

/** A "row → its parent" index: grouping in memory is cheaper than a query per row. */
function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

/**
 * An export of everything the app stores about one person.
 *
 * The mirror of account-delete: whatever gets deleted is whatever gets handed
 * over, otherwise the export silently drops part of the data and the person
 * never finds out.
 *
 * Fields are spelled out by name everywhere. An argument-less `select()` would
 * drag into the file things that have no business being there — and would
 * quietly start dragging in new columns the moment they appear in the schema.
 */
export const GET: APIRoute = async ({ cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const profile = await db
    .select({
      steamId: users.steamId,
      username: users.username,
      avatarUrl: users.avatarUrl,
      lastLibrarySync: users.lastLibrarySync,
      onboardingCompletedAt: users.onboardingCompletedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const [library, records, userTags, contracts, runs, dives, sessions, snapshots] =
    await Promise.all([
      db
        .select({
          steamAppId: games.steamAppId,
          title: games.title,
          playtimeMinutes: userGames.playtimeMinutes,
          lastPlayedAt: userGames.lastPlayedAt,
          excluded: userGames.excluded,
        })
        .from(userGames)
        .innerJoin(games, eq(games.id, userGames.gameId))
        .where(eq(userGames.userId, userId))
        .orderBy(desc(userGames.playtimeMinutes)),

      db
        .select({
          id: gameRecords.id,
          steamAppId: games.steamAppId,
          title: games.title,
          isDemo: games.isDemo,
          verdict: gameRecords.verdict,
          tier: gameRecords.tier,
          rating: gameRecords.rating,
          origin: gameRecords.origin,
          playtimeAtLastEntry: gameRecords.playtimeAtLastEntry,
          firstEntryAt: gameRecords.firstEntryAt,
          lastEntryAt: gameRecords.lastEntryAt,
        })
        .from(gameRecords)
        .innerJoin(games, eq(games.id, gameRecords.gameId))
        .where(eq(gameRecords.userId, userId))
        .orderBy(asc(gameRecords.firstEntryAt)),

      db
        .select({ kind: tags.kind, label: tags.label, createdAt: tags.createdAt })
        .from(tags)
        .where(eq(tags.userId, userId))
        .orderBy(asc(tags.label)),

      db
        .select({
          id: slots.id,
          steamAppId: games.steamAppId,
          title: games.title,
          status: slots.status,
          playtimeOnStart: slots.playtimeOnStart,
          startedAt: slots.startedAt,
        })
        .from(slots)
        .innerJoin(games, eq(games.id, slots.gameId))
        .where(eq(slots.userId, userId))
        .orderBy(asc(slots.startedAt)),

      db
        .select({
          id: recommendationRuns.id,
          model: recommendationRuns.model,
          status: recommendationRuns.status,
          profile: recommendationRuns.profile,
          reviewsUsed: recommendationRuns.reviewsUsed,
          candidatesUsed: recommendationRuns.candidatesUsed,
          createdAt: recommendationRuns.createdAt,
          finishedAt: recommendationRuns.finishedAt,
        })
        .from(recommendationRuns)
        .where(eq(recommendationRuns.userId, userId))
        .orderBy(asc(recommendationRuns.createdAt)),

      db
        .select({
          steamAppId: games.steamAppId,
          title: games.title,
          fit: deepDives.fit,
          tier: deepDives.tier,
          summary: deepDives.summary,
          forYou: deepDives.forYou,
          against: deepDives.against,
          complaints: deepDives.complaints,
          createdAt: deepDives.createdAt,
        })
        .from(deepDives)
        .innerJoin(games, eq(games.id, deepDives.gameId))
        .where(eq(deepDives.userId, userId))
        .orderBy(asc(deepDives.createdAt)),

      db
        .select({
          steamAppId: games.steamAppId,
          title: games.title,
          startedAt: playSessions.startedAt,
          endedAt: playSessions.endedAt,
          minutes: playSessions.minutes,
          playtimeGainMinutes: playSessions.playtimeGainMinutes,
        })
        .from(playSessions)
        .innerJoin(games, eq(games.id, playSessions.gameId))
        .where(eq(playSessions.userId, userId))
        .orderBy(asc(playSessions.startedAt)),

      db
        .select({
          steamAppId: games.steamAppId,
          title: games.title,
          takenAt: playtimeSnapshots.takenAt,
          sinceAt: playtimeSnapshots.sinceAt,
          playtimeMinutes: playtimeSnapshots.playtimeMinutes,
          deltaMinutes: playtimeSnapshots.deltaMinutes,
          source: playtimeSnapshots.source,
        })
        .from(playtimeSnapshots)
        .innerJoin(games, eq(games.id, playtimeSnapshots.gameId))
        .where(eq(playtimeSnapshots.userId, userId))
        .orderBy(asc(playtimeSnapshots.takenAt)),
    ]);

  const entries = await db
    .select({
      id: gameEntries.id,
      recordId: gameEntries.recordId,
      kind: gameEntries.kind,
      text: gameEntries.text,
      playtimeTotalMinutes: gameEntries.playtimeTotalMinutes,
      playtimeDeltaMinutes: gameEntries.playtimeDeltaMinutes,
      promptedBy: gameEntries.promptedBy,
      verdictAt: gameEntries.verdictAt,
      ratingAt: gameEntries.ratingAt,
      tierAt: gameEntries.tierAt,
      createdAt: gameEntries.createdAt,
    })
    .from(gameEntries)
    .where(inArray(gameEntries.recordId, records.map((record) => record.id)))
    .orderBy(asc(gameEntries.createdAt));

  const entryIds = entries.map((entry) => entry.id);

  const [entryTagRows, claims, mentions, analyses, skips] = await Promise.all([
    db
      .select({
        entryId: entryTags.entryId,
        label: tags.label,
        kind: tags.kind,
        source: entryTags.source,
      })
      .from(entryTags)
      .innerJoin(tags, eq(tags.id, entryTags.tagId))
      .where(inArray(entryTags.entryId, entryIds)),

    db
      .select({
        entryId: entryClaims.entryId,
        text: entryClaims.text,
        outcome: entryClaims.outcome,
        askedAt: entryClaims.askedAt,
      })
      .from(entryClaims)
      .where(inArray(entryClaims.entryId, entryIds)),

    db
      .select({
        entryId: entryMentions.entryId,
        surface: entryMentions.surface,
        canonicalTitle: entryMentions.canonicalTitle,
      })
      .from(entryMentions)
      .where(inArray(entryMentions.entryId, entryIds)),

    db
      .select({ entryId: entryAnalyses.entryId, tone: entryAnalyses.tone })
      .from(entryAnalyses)
      .where(inArray(entryAnalyses.entryId, entryIds)),

    db
      .select({
        slotId: slotSkips.slotId,
        reasonType: slotSkips.reasonType,
        reasonText: slotSkips.reasonText,
        skippedAt: slotSkips.skippedAt,
      })
      .from(slotSkips)
      .where(inArray(slotSkips.slotId, contracts.map((contract) => contract.id))),
  ]);

  const picks = await db
    .select({
      runId: recommendations.runId,
      steamAppId: games.steamAppId,
      title: games.title,
      kind: recommendations.kind,
      tier: recommendations.tier,
      stance: recommendations.stance,
      rank: recommendations.rank,
      reason: recommendations.reason,
      grounding: recommendations.grounding,
    })
    .from(recommendations)
    .innerJoin(games, eq(games.id, recommendations.gameId))
    .where(inArray(recommendations.runId, runs.map((run) => run.id)))
    .orderBy(asc(recommendations.rank));

  const tagsByEntry = groupBy(entryTagRows, (row) => row.entryId);
  const claimsByEntry = groupBy(claims, (row) => row.entryId);
  const mentionsByEntry = groupBy(mentions, (row) => row.entryId);
  const toneByEntry = new Map(analyses.map((row) => [row.entryId, row.tone]));
  const entriesByRecord = groupBy(entries, (entry) => entry.recordId);
  const skipBySlot = new Map(skips.map((skip) => [skip.slotId, skip]));
  const picksByRun = groupBy(picks, (pick) => pick.runId);

  /*
   * Entries are nested inside their game rather than sitting in a flat list
   * with a foreign id: a human reads this file, and "how my opinion of this
   * game changed" has to be visible without joining tables by key.
   */
  const diary = records.map(({ id, ...record }) => ({
    ...record,
    entries: (entriesByRecord.get(id) ?? []).map(({ id: entryId, recordId, ...entry }) => ({
      ...entry,
      tone: toneByEntry.get(entryId) ?? null,
      tags: (tagsByEntry.get(entryId) ?? []).map(({ entryId: _, ...tag }) => tag),
      claims: (claimsByEntry.get(entryId) ?? []).map(({ entryId: _, ...claim }) => claim),
      mentions: (mentionsByEntry.get(entryId) ?? []).map(({ entryId: _, ...mention }) => mention),
    })),
  }));

  const payload = {
    exportedAt: new Date(),
    profile,
    library,
    diary,
    tags: userTags,
    contracts: contracts.map(({ id, ...contract }) => {
      const skip = skipBySlot.get(id);
      return {
        ...contract,
        skip: skip
          ? { reasonType: skip.reasonType, reasonText: skip.reasonText, skippedAt: skip.skippedAt }
          : null,
      };
    }),
    recommendations: runs.map(({ id, ...run }) => ({
      ...run,
      picks: (picksByRun.get(id) ?? []).map(({ runId: _, ...pick }) => pick),
    })),
    deepDives: dives,
    sessions,
    playtimeSnapshots: snapshots,
  };

  const date = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="curio-export-${date}.json"`,
      // The export is entirely personal: neither a proxy nor a browser has any business caching it
      "Cache-Control": "no-store",
    },
  });
};
