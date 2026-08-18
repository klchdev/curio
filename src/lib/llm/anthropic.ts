import Anthropic from "@anthropic-ai/sdk";
import { toStrictJsonSchema } from "./schema";
import type { Effort, JsonRequest, LlmAdapter, LlmClient, LlmErrorInfo } from "./types";

/**
 * The Anthropic Claude adapter.
 *
 * Three things where this provider differs from Gemini far enough that no
 * shared code can be written for them:
 *
 * 1. Thinking is on by default on current models, and `max_tokens` caps the
 *    thinking together with the answer. A ceiling picked from the length of
 *    the expected JSON will cut the answer off mid-way — hence the deliberately
 *    generous headroom here.
 * 2. A classifier refusal arrives as a successful response with `stop_reason:
 *    "refusal"` and empty `content`. Code that reads `content[0]` without
 *    checking falls over out of nowhere.
 * 3. `temperature` and `top_p` are rejected with a 400 on the new models — the
 *    only way to steer behaviour is the prompt.
 */

const EFFORT: Record<Effort, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high",
};

/** Headroom for the thinking: it and the answer share one ceiling. */
const DEFAULT_MAX_TOKENS = 16_000;
const STREAM_MAX_TOKENS = 64_000;

function params(req: JsonRequest, model: string, maxTokens: number) {
  return {
    model,
    max_tokens: req.maxTokens ?? maxTokens,
    system: req.system,
    messages: [{ role: "user" as const, content: req.prompt }],
    output_config: {
      ...(req.effort ? { effort: EFFORT[req.effort] } : {}),
      format: {
        type: "json_schema" as const,
        schema: toStrictJsonSchema(req.schema),
      },
    },
  };
}

/** A refusal is a successful HTTP response — hence a separate check, before reading content. */
function refusalError(stopReason: string | null, details: unknown): Error | null {
  if (stopReason !== "refusal") return null;
  const category =
    details && typeof details === "object" && "category" in details
      ? String((details as { category: unknown }).category)
      : "unknown";
  return new Error(`anthropic refusal (${category})`);
}

export const anthropicAdapter: LlmAdapter = {
  id: "anthropic",
  label: "Anthropic Claude",
  keyHelpUrl: "https://console.anthropic.com/settings/keys",
  models: [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],

  create(apiKey: string, model: string): LlmClient {
    const client = new Anthropic({ apiKey });

    return {
      provider: "anthropic",
      model,

      async generateJson(req) {
        const res = await client.messages.create(params(req, model, DEFAULT_MAX_TOKENS));

        const refusal = refusalError(res.stop_reason, res.stop_details);
        if (refusal) throw refusal;

        return res.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
      },

      async streamJson(req, onDelta) {
        const stream = client.messages.stream(params(req, model, STREAM_MAX_TOKENS));

        let text = "";
        stream.on("text", (delta) => {
          text += delta;
          onDelta(delta);
        });

        const message = await stream.finalMessage();
        const refusal = refusalError(message.stop_reason, message.stop_details);
        if (refusal) throw refusal;

        return text;
      },
    };
  },

  classifyError(err): LlmErrorInfo {
    /*
     * Typed exceptions instead of text parsing: in this SDK the status sits on
     * the error object, so there is no guessing from the message.
     */
    if (err instanceof Anthropic.RateLimitError) {
      const header = err.headers?.get?.("retry-after");
      const seconds = header ? Number(header) : NaN;
      return {
        kind: "rate_limit",
        retriable: true,
        retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : null,
      };
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      return { kind: "auth", retriable: false, retryAfterMs: null };
    }
    if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
      // An empty balance arrives here as a 400 about the credit balance, not as a 429
      if (/credit balance/i.test(err.message)) {
        return { kind: "no_credit", retriable: false, retryAfterMs: null };
      }
      return { kind: "bad_request", retriable: false, retryAfterMs: null };
    }
    if (err instanceof Anthropic.InternalServerError) {
      // A 529 overloaded lands here too — both clear on their own
      return { kind: "overloaded", retriable: true, retryAfterMs: null };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { kind: "server", retriable: true, retryAfterMs: null };
    }
    if (err instanceof Error && err.message.startsWith("anthropic refusal")) {
      // Retrying is pointless: the same request will be refused the same way
      return { kind: "refusal", retriable: false, retryAfterMs: null };
    }

    return { kind: "unknown", retriable: false, retryAfterMs: null };
  },
};
