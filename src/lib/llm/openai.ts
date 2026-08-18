import OpenAI from "openai";
import { toStrictJsonSchema } from "./schema";
import type { JsonRequest, LlmAdapter, LlmClient, LlmErrorInfo } from "./types";

/**
 * The OpenAI adapter.
 *
 * The thinking level is deliberately not passed through here. Only reasoning
 * models understand `reasoning_effort`; on ordinary ones that same parameter is
 * a bad request. Telling the kind of model from its name means breaking on
 * every new one: the model name is typed in by hand and may be anything. The
 * quality the thinking level buys is worth less than a failure out of nowhere.
 *
 * Strict mode requires every key of the schema to be listed in `required` —
 * that is where it differs from Anthropic, for which the original list is enough.
 */

const DEFAULT_MAX_TOKENS = 16_000;

function body(req: JsonRequest, model: string) {
  return {
    model,
    max_completion_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [
      { role: "system" as const, content: req.system },
      { role: "user" as const, content: req.prompt },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "response",
        strict: true,
        schema: toStrictJsonSchema(req.schema, { allRequired: true }),
      },
    },
  };
}

export const openaiAdapter: LlmAdapter = {
  id: "openai",
  label: "OpenAI",
  keyHelpUrl: "https://platform.openai.com/api-keys",
  models: [
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],

  create(apiKey: string, model: string): LlmClient {
    const client = new OpenAI({ apiKey });

    return {
      provider: "openai",
      model,

      async generateJson(req) {
        const res = await client.chat.completions.create(body(req, model));
        return res.choices[0]?.message?.content ?? "";
      },

      async streamJson(req, onDelta) {
        const stream = await client.chat.completions.create({ ...body(req, model), stream: true });

        let text = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) continue;
          text += delta;
          onDelta(delta);
        }
        return text;
      },
    };
  },

  classifyError(err): LlmErrorInfo {
    if (err instanceof OpenAI.RateLimitError) {
      /*
       * OpenAI answers an empty balance with the same 429 as a real rate limit,
       * and the SDK gives both the same class — the difference is only in the
       * body's `code`. Without this branch a person whose trial credits ran out
       * waits through three retries and is then told about a daily quota that
       * has nothing to do with it.
       */
      if (err.code === "insufficient_quota") {
        return { kind: "no_credit", retriable: false, retryAfterMs: null };
      }

      const header = err.headers?.get?.("retry-after");
      const seconds = header ? Number(header) : NaN;
      return {
        kind: "rate_limit",
        retriable: true,
        retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : null,
      };
    }
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      return { kind: "auth", retriable: false, retryAfterMs: null };
    }
    if (err instanceof OpenAI.BadRequestError || err instanceof OpenAI.NotFoundError) {
      return { kind: "bad_request", retriable: false, retryAfterMs: null };
    }
    if (err instanceof OpenAI.InternalServerError || err instanceof OpenAI.APIConnectionError) {
      return { kind: "server", retriable: true, retryAfterMs: null };
    }

    return { kind: "unknown", retriable: false, retryAfterMs: null };
  },
};
