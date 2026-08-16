import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  deepDives,
  gameRecords,
  playSessions,
  playtimeSnapshots,
  recommendationRuns,
  recommendations,
  slotSkips,
  slots,
  tags,
  userGames,
  users,
} from "../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Deletes all of a user's data. The caller opens the transaction.
 *
 * The order here was worked out by hand and must not be rearranged: the schema
 * cascades cover only the journal subtree, and half of the references to the
 * user are declared without `onDelete`. It lives in a function of its own
 * because accounts get deleted from two places — the person themselves, and the
 * instance owner clearing out their test accounts — and a copy of an order like
 * this drifts from the original silently: a forgotten table doesn't fail the
 * query, it just leaves rows behind in the database.
 *
 * What the function deliberately does not do: it doesn't touch the session
 * cookie (that's the caller's concern) and doesn't clear `games` — a shared
 * catalogue, not personal data. Test accounts created by this user aren't its
 * call either: who counts as "theirs" is decided by the caller, which invokes
 * the function on each of them.
 */
export async function deleteUserData(tx: Tx, userId: number): Promise<void> {
  // The snapshots reference sessions, so they go before the sessions themselves
  await tx.delete(playtimeSnapshots).where(eq(playtimeSnapshots.userId, userId));
  await tx.delete(playSessions).where(eq(playSessions.userId, userId));

  // Recommendations reference a run without a cascade: the runs can't go first
  await tx.delete(recommendations).where(
    inArray(
      recommendations.runId,
      tx
        .select({ id: recommendationRuns.id })
        .from(recommendationRuns)
        .where(eq(recommendationRuns.userId, userId))
    )
  );
  await tx.delete(recommendationRuns).where(eq(recommendationRuns.userId, userId));

  await tx.delete(deepDives).where(eq(deepDives.userId, userId));

  /*
   * One statement takes out the whole journal subtree: entries hang off the
   * game record by cascade, and the analyses, entry tags, stakes and mentions
   * hang off the entries themselves. It also clears the game_records.slot_id
   * reference, which has no cascade and is why slots can't be deleted earlier.
   */
  await tx.delete(gameRecords).where(eq(gameRecords.userId, userId));

  // The tag dictionary lives apart from the entries and outlives their deletion
  await tx.delete(tags).where(eq(tags.userId, userId));

  await tx.delete(slotSkips).where(
    inArray(slotSkips.slotId, tx.select({ id: slots.id }).from(slots).where(eq(slots.userId, userId)))
  );
  await tx.delete(slots).where(eq(slots.userId, userId));

  await tx.delete(userGames).where(eq(userGames.userId, userId));

  /*
   * users.created_by_user_id points back at users itself and has no cascade: as
   * long as a single account it created still references the row, the final
   * DELETE runs into the foreign key and rolls the whole transaction back. We
   * null it out rather than delete: who gets taken along is the caller's
   * decision, made before it ever got here.
   */
  await tx.update(users).set({ createdByUserId: null }).where(eq(users.createdByUserId, userId));

  await tx.delete(users).where(eq(users.id, userId));
}
