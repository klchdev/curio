import { geminiAdapter } from "./gemini";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";
import { claudeCodeAdapter, codexAdapter } from "./cli";
import type { LlmAdapter, LlmClient, ProviderId } from "./types";

export * from "./types";
export { geminiAdapter, anthropicAdapter, openaiAdapter, claudeCodeAdapter, codexAdapter };

/**
 * One entry into the model for the whole project: provider, model, retries,
 * timeout.
 *
 * What to do when a call fails is the same across all three providers — the
 * only difference is the question "is this retriable", and the adapter answers
 * it. So the loop is shared and lives here, and the error parsing lives there.
 *
 * The key chain is gone: the project holds no server keys, every person has
 * exactly one of their own. On an exhausted free-key quota we used to switch
 * to the paid one silently — now an exhausted quota is a fact the user has to
 * see, not a surprise someone else paid for.
 *
 * No astro:env or db imports: the module is needed by the server and by one-off
 * scripts alike.
 */

const ADAPTERS: Record<ProviderId, LlmAdapter> = {
  gemini: geminiAdapter,
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
};

export const ADAPTER_LIST: readonly LlmAdapter[] = [
  geminiAdapter,
  anthropicAdapter,
  openaiAdapter,
  claudeCodeAdapter,
  codexAdapter,
];

export function adapterFor(provider: ProviderId): LlmAdapter {
  return ADAPTERS[provider];
}

export interface LlmCredentials {
  provider: ProviderId;
  apiKey: string;
  model: string;
}

/** No key is not a failure but an expected state: the person hasn't entered one yet. */
export class MissingLlmKeyError extends Error {
  constructor() {
    super("No model key configured");
    this.name = "MissingLlmKeyError";
  }
}

/**
 * There is a key, but the provider didn't accept it.
 *
 * A separate type because the reaction differs: retrying is out, and what the
 * person needs to see is not "something broke" but "check the key in settings".
 */
export class LlmAuthError extends Error {
  constructor(public readonly provider: ProviderId) {
    super("The provider rejected the key");
    this.name = "LlmAuthError";
  }
}

const RETRY_DELAYS_MS = [2000, 6000, 15000];

/** A request hanging with no answer and no error is a failure too, just a silent one. */
const DEFAULT_TIMEOUT_MS = 120_000;

class TimeoutError extends Error {}

async function withTimeout<T>(run: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`Model silent for over ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface LlmCallOptions {
  /** A streamed answer takes longer than usual — recommendations need the headroom. */
  timeoutMs?: number;
}

export function clientFor(creds: LlmCredentials): LlmClient {
  const adapter = adapterFor(creds.provider);
  const model = creds.model || adapter.models[0]!.id;
  return adapter.create(creds.apiKey, model);
}

/**
 * Runs a piece of work against the model, dealing with the retries.
 *
 * The body comes in as a callback because the calls have different shapes: a
 * plain response in one place, a stream with progress in another. What they
 * share is what to do when it fails.
 */
export async function withLlm<T>(
  creds: LlmCredentials | null,
  run: (client: LlmClient) => Promise<T>,
  options: LlmCallOptions = {}
): Promise<T> {
  if (!creds?.apiKey) throw new MissingLlmKeyError();

  const adapter = adapterFor(creds.provider);
  const client = clientFor(creds);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let attempt = 0;

  for (;;) {
    try {
      return await withTimeout(() => run(client), timeoutMs);
    } catch (err) {
      const info =
        err instanceof TimeoutError
          ? ({ kind: "timeout", retriable: true, retryAfterMs: null } as const)
          : adapter.classifyError(err);

      // Someone else's key won't start working on a retry — that's a talk with the user
      if (info.kind === "auth") throw new LlmAuthError(creds.provider);

      if (!info.retriable || attempt >= RETRY_DELAYS_MS.length) throw err;

      /*
       * If the server named its own delay, waiting less is pointless: the
       * attempt would burn for nothing. The upper bound keeps a single request
       * from hanging the whole run for minutes.
       */
      const fallback = RETRY_DELAYS_MS[attempt]!;
      const delay = Math.min(Math.max(info.retryAfterMs ?? fallback, fallback), 90_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}
