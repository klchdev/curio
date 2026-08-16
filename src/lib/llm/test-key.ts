import { adapterFor, clientFor, type JsonSchema, type LlmCredentials } from "./index";

/**
 * Checking a key with a real request.
 *
 * Validating the format with a pattern is pointless: providers keep changing
 * it, and a typo, a revoked key and a key with no access to the chosen model
 * all look equally correct. The only honest answer comes from the provider.
 *
 * The request is tiny on purpose: it costs the user money, and they should be
 * paying for something useful, not for our settings form. The answer ceiling,
 * on the other hand, is generous — on thinking models it covers thinking and
 * text alike, and a stingy limit would cut the answer off mid-way, which we
 * would read as a key that doesn't work.
 */

const PING_SCHEMA: JsonSchema = {
  type: "object",
  properties: { ok: { type: "string", description: "The word ok" } },
  required: ["ok"],
};

export type KeyTestResult =
  | { ok: true }
  | { ok: false; reason: "auth" | "bad_request" | "rate_limit" | "network"; message: string };

export async function testLlmKey(creds: LlmCredentials): Promise<KeyTestResult> {
  try {
    /*
     * No withLlm: retries do harm here. The person is waiting on the form, and
     * a minute of silent retries on a key that is plainly wrong is the worst
     * thing we could do.
     */
    const client = clientFor(creds);
    await client.generateJson({
      system: "Reply with exactly what is asked for.",
      prompt: 'Return the JSON {"ok":"ok"}.',
      schema: PING_SCHEMA,
      maxTokens: 4000,
    });
    return { ok: true };
  } catch (err) {
    const info = adapterFor(creds.provider).classifyError(err);
    const message = err instanceof Error ? err.message : String(err);

    if (info.kind === "auth") {
      return { ok: false, reason: "auth", message };
    }
    /*
     * A 400 on this request almost always means the model name is wrong: the
     * request itself is as simple as it gets and valid for any provider.
     */
    if (info.kind === "bad_request") {
      return { ok: false, reason: "bad_request", message };
    }
    if (info.kind === "rate_limit") {
      // The key works, the quota has simply run out — no reason not to save it
      return { ok: false, reason: "rate_limit", message };
    }
    return { ok: false, reason: "network", message };
  }
}
