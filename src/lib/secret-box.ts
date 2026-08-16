import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption of user secrets — right now those are the model API keys.
 *
 * A user's key can't be kept in the clear: a database dump must not amount to
 * handing out other people's API keys. Nor can it be derived from the user's
 * password — we have no password (sign-in goes through Steam), and the key has
 * to be decrypted in the background, with nobody involved: journal entry
 * analysis and playtime polling run on a schedule. So the encryption key sits
 * in the environment, apart from the database, and compromising the database
 * alone gets you nowhere.
 *
 * GCM rather than CBC: it verifies integrity. Tampered ciphertext must fail
 * with an error instead of decrypting into garbage that we then send off to
 * someone else's API.
 *
 * No astro:env import — the module is needed by the server and by one-off
 * scripts, whose environment is their own. The key comes in as an argument.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Parses the key from the environment and checks its length right away.
 *
 * The check happens at startup, not on the first encryption: otherwise a
 * truncated ENCRYPTION_KEY surfaces a week later on a live user rather than at
 * deploy time.
 */
export function parseEncryptionKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_BYTES} bytes in base64, got ${key.length}. ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  return key;
}

/**
 * Everything in a single `iv.tag.ciphertext` string instead of three columns.
 *
 * There is nothing at the schema level to tie three columns together, and a
 * mismatch (ciphertext updated, iv forgotten) is indistinguishable from data
 * corruption. A single string is either wholly valid or wholly not.
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

/** Returns null on any garbage: a corrupted string is no reason to take the page down. */
export function decryptSecret(payload: string, key: Buffer): string | null {
  const parts = payload.split(".");
  if (parts.length !== 3) return null;

  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv(ALGORITHM, key, iv!);
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The tail of the key for the UI: show which key is saved without showing the key.
 *
 * Provider keys all begin the same way and are recognised by that prefix, so it
 * is the tail that actually tells them apart.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "…";
  return `${plaintext.slice(0, 4)}…${plaintext.slice(-4)}`;
}
