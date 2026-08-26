/**
 * A shared language for the three model providers.
 *
 * The single entry point into the model used to hand out a Gemini client, and
 * the SDK leaked into all six call sites: each of them knew about `Type.OBJECT`,
 * `thinkingConfig` and the shape of Google's errors. While there was one
 * provider that cost nothing; once user-supplied keys made it three, it is not
 * only the retry policy that has to be shared, but the shape of the request.
 *
 * Types only here — no SDK imports, so the module suits both the server and
 * one-off scripts.
 */

export const PROVIDERS = ["gemini", "anthropic", "openai", "claude-code", "codex"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

/**
 * The canonical response schema — plain JSON Schema with lowercase types.
 *
 * Schemas are written once in this form, and the adapter converts them to a
 * particular provider's format: Gemini expects types in caps, Anthropic and
 * OpenAI require `additionalProperties: false`. Keeping three dialects of the
 * same schema in the code is a sure way to forget to fix one of them.
 */
export interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
}

/**
 * How much to think. Three levels instead of the per-provider scales: in Gemini
 * it is `thinkingLevel`, in Anthropic it is `effort` inside `output_config`, in
 * OpenAI a parameter of its own. Naming them alike matters more than carrying
 * over every shade.
 */
export type Effort = "low" | "medium" | "high";

export interface JsonRequest {
  system: string;
  prompt: string;
  schema: JsonSchema;
  effort?: Effort;
  /** Ceiling on the answer. On thinking models it covers thinking and text alike. */
  maxTokens?: number;
}

/**
 * What to do with an error, in a language that is the same for every provider.
 *
 * The retry loop is shared and lives in index.ts; exactly one provider-specific
 * question is left in it — "is this retriable" — and the adapter answers it.
 * Gemini hides the error code in JSON inside the message text, Anthropic and
 * OpenAI have typed exceptions — that cannot be picked apart in shared code.
 */
export interface LlmErrorInfo {
  /*
   * `no_credit` is deliberately apart from `rate_limit`: both arrive as the same
   * HTTP status from some providers, but a rate limit clears by itself and an
   * empty balance never does. Retrying the second one only burns half a minute
   * before showing a message that sends the person off to wait for a reset that
   * will never come.
   *
   * `daily_quota` sits between the two: it does reset, but not inside a run,
   * so it is worth naming apart from a per-minute limit the person can wait out.
   */
  kind:
    | "rate_limit"
    | "daily_quota"
    | "no_credit"
    | "overloaded"
    | "server"
    | "timeout"
    | "auth"
    | "bad_request"
    | "refusal"
    | "unknown";
  retriable: boolean;
  /** How long to wait, when the server named a delay itself. */
  retryAfterMs: number | null;
}

export interface LlmClient {
  readonly provider: ProviderId;
  readonly model: string;
  /** Returns raw JSON text: parsing and validation stay at the call site. */
  generateJson(req: JsonRequest): Promise<string>;
  /** `onDelta` gets a chunk of text, not the accumulated string — as the SDK yields it. */
  streamJson(req: JsonRequest, onDelta: (delta: string) => void): Promise<string>;
}

/**
 * A model as offered in the picker.
 *
 * No prose here on purpose: the one-line note next to a model is interface
 * text, and interface text lives in strings.ts under `llm.modelNotes`, keyed by
 * this id. A second place to localise from would be a second source of truth,
 * and the one in strings.ts is the one the `Dict` type checks.
 */
export interface ModelChoice {
  id: string;
  label: string;
}

export interface LlmAdapter {
  readonly id: ProviderId;
  readonly label: string;
  /** The first model in the list is the one offered by default. */
  readonly models: readonly ModelChoice[];
  readonly keyHelpUrl: string;
  /** false — the provider runs on an installed CLI, there is no key to enter. */
  readonly needsKey?: boolean;
  create(apiKey: string, model: string): LlmClient;
  classifyError(err: unknown): LlmErrorInfo;
}
