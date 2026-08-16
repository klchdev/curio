import { and, eq } from "drizzle-orm";
import { DEV_ACCOUNTS_ENABLED, DEV_STEAM_IDS } from "astro:env/server";
import { db } from "../db";
import { users } from "../db/schema";

/**
 * Test accounts belonging to the instance owner.
 *
 * Steam OpenID gives one steam_id per person, so there is no way to work
 * through the "empty account", "account without a key", "account with three
 * entries" scenarios under your real profile — there is only one of it, and it
 * is already full.
 *
 * This is essentially signing in as an arbitrary user, that is, precisely the
 * mechanism that turns into takeover of any account once the access check
 * leaks. Hence every restriction below, and not one of them is cosmetic:
 *
 * — access is granted by an environment value, not by a role in the database:
 *   a role can be escalated through any other hole in the app, an environment
 *   variable cannot;
 * — the steam_id of test rows is synthetic and cannot collide with a real one;
 * — you can only switch into a test account of your own, and that is checked
 *   against the owner in the database, not against what the client sent.
 */

/** The prefix makes the synthetic id unmistakably unlike a real steam_id. */
const TEST_PREFIX = "test:";

function allowlist(): string[] {
  return DEV_STEAM_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isTestSteamId(steamId: string): boolean {
  return steamId.startsWith(TEST_PREFIX);
}

/**
 * The real account the session belongs to.
 *
 * While sitting in a test account, rights have to be checked against the owner:
 * the test row's own steam_id is synthetic and is not — and cannot be — in the
 * allowlist, otherwise there would be no way back out of the test account.
 */
async function ownerOf(userId: number): Promise<{ id: number; steamId: string } | null> {
  const row = await db
    .select({ id: users.id, steamId: users.steamId, isTest: users.isTest, owner: users.createdByUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row) return null;
  if (!row.isTest) return { id: row.id, steamId: row.steamId };
  if (!row.owner) return null;

  const parent = await db
    .select({ id: users.id, steamId: users.steamId })
    .from(users)
    .where(eq(users.id, row.owner))
    .limit(1)
    .then((rows) => rows[0]);

  return parent ?? null;
}

export interface DevAccess {
  allowed: boolean;
  ownerId: number | null;
}

export async function checkDevAccess(userId: number | null): Promise<DevAccess> {
  if (!DEV_ACCOUNTS_ENABLED || !userId) return { allowed: false, ownerId: null };

  const owner = await ownerOf(userId);
  if (!owner) return { allowed: false, ownerId: null };

  return {
    allowed: allowlist().includes(owner.steamId),
    ownerId: owner.id,
  };
}

export async function listTestAccounts(ownerId: number) {
  return db
    .select({ id: users.id, username: users.username, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.createdByUserId, ownerId), eq(users.isTest, true)));
}

export async function createTestAccount(ownerId: number, label: string): Promise<number> {
  const name = label.trim() || "Test account";

  /*
   * A timestamp tail rather than a sequence number: once an account is deleted
   * its number frees up and the next one takes over the same steam_id, and with
   * it someone else's history, if references to it linger anywhere.
   */
  const steamId = `${TEST_PREFIX}${ownerId}:${Date.now()}`;

  const row = await db
    .insert(users)
    .values({ steamId, username: name, isTest: true, createdByUserId: ownerId })
    .returning({ id: users.id })
    .then((rows) => rows[0]!);

  return row.id;
}

/**
 * Whether this session may switch into account `targetId`.
 *
 * Exactly two switches are allowed: back into your own real account, and into a
 * test account of your own. Ownership is taken from the database — what the
 * client sent counts for nothing here.
 */
export async function canSwitchTo(userId: number, targetId: number): Promise<boolean> {
  const access = await checkDevAccess(userId);
  if (!access.allowed || !access.ownerId) return false;

  if (targetId === access.ownerId) return true;

  const target = await db
    .select({ isTest: users.isTest, owner: users.createdByUserId })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1)
    .then((rows) => rows[0]);

  return !!target?.isTest && target.owner === access.ownerId;
}
