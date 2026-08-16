import { eq } from "drizzle-orm";
import { ENCRYPTION_KEY } from "astro:env/server";
import { db } from "../../db";
import { users } from "../../db/schema";
import { decryptSecret, encryptSecret, maskSecret, parseEncryptionKey } from "../secret-box";
import { adapterFor, isProviderId, type LlmCredentials, type ProviderId } from "./index";

/**
 * The user's key: fetch it, save it, show its tail.
 *
 * Kept apart from llm/index.ts because that module must know nothing about
 * astro:env or the database — one-off scripts with an environment of their own
 * import it.
 *
 * The encryption key is parsed when the module loads, not on first use: a
 * truncated ENCRYPTION_KEY should bring the deploy down, not surface a week
 * later on a live user.
 */
const KEY = parseEncryptionKey(ENCRYPTION_KEY);

export interface LlmSettings {
  provider: ProviderId | null;
  model: string | null;
  /** The tail of the key, for the UI. Empty means there is no key. */
  keyMask: string | null;
}

export async function getLlmSettings(userId: number): Promise<LlmSettings> {
  const row = await db
    .select({
      provider: users.llmProvider,
      model: users.llmModel,
      encrypted: users.llmKeyEncrypted,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row?.provider || !row.encrypted) {
    return { provider: row?.provider ?? null, model: row?.model ?? null, keyMask: null };
  }

  const plaintext = decryptSecret(row.encrypted, KEY);

  return {
    provider: row.provider,
    model: row.model,
    keyMask: plaintext ? maskSecret(plaintext) : null,
  };
}

/**
 * Full credentials for a request to the model.
 *
 * null means "the AI features are switched off for this person" — an ordinary
 * state, not a failure, and the caller is obliged to show it rather than crash.
 */
export async function getLlmCredentials(userId: number): Promise<LlmCredentials | null> {
  const row = await db
    .select({
      provider: users.llmProvider,
      model: users.llmModel,
      encrypted: users.llmKeyEncrypted,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row?.provider || !row.encrypted) return null;

  const apiKey = decryptSecret(row.encrypted, KEY);
  if (!apiKey) return null;

  const model = row.model || adapterFor(row.provider).models[0]!.id;
  return { provider: row.provider, apiKey, model };
}

export async function saveLlmKey(
  userId: number,
  provider: string,
  model: string,
  apiKey: string
): Promise<void> {
  if (!isProviderId(provider)) throw new Error(`Unknown provider: ${provider}`);

  await db
    .update(users)
    .set({
      llmProvider: provider,
      llmModel: model || adapterFor(provider).models[0]!.id,
      llmKeyEncrypted: encryptSecret(apiKey, KEY),
    })
    .where(eq(users.id, userId));
}

/** The model changes more often than the key — its own action, no re-entering the key. */
export async function saveLlmModel(userId: number, model: string): Promise<void> {
  await db.update(users).set({ llmModel: model }).where(eq(users.id, userId));
}

export async function clearLlmKey(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ llmProvider: null, llmModel: null, llmKeyEncrypted: null })
    .where(eq(users.id, userId));
}
