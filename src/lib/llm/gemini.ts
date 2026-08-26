import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { toGeminiSchema } from "./schema";
import type { Effort, JsonRequest, LlmAdapter, LlmClient, LlmErrorInfo } from "./types";

/**
 * The Google Gemini adapter.
 *
 * Error parsing here is the nastiest of the three: the SDK doesn't surface the
 * code, it sits in JSON inside the message text — and sometimes as a bare number
 * in that text. While there was one provider this logic lived in the shared
 * module and looked shared; there is nothing shared about it.
 */

const THINKING: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** The error code hides in JSON inside the message — the SDK doesn't surface it. */
function errorCode(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(message);
    const code = parsed?.error?.code;
    return typeof code === "number" ? code : null;
  } catch {
    const inJson = /"code":\s*(\d+)/.exec(message);
    if (inJson) return Number(inJson[1]);
    // Sometimes the code arrives as plain message text, with no parseable JSON
    const loose = /\b(429|500|503|504)\b/.exec(message);
    return loose ? Number(loose[1]) : null;
  }
}

function config(req: JsonRequest) {
  return {
    systemInstruction: req.system,
    responseMimeType: "application/json",
    responseSchema: toGeminiSchema(req.schema),
    ...(req.effort ? { thinkingConfig: { thinkingLevel: THINKING[req.effort] } } : {}),
    ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
  };
}

export const geminiAdapter: LlmAdapter = {
  id: "gemini",
  label: "Google Gemini",
  keyHelpUrl: "https://aistudio.google.com/apikey",
  models: [
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { id: "gemini-pro-latest", label: "Gemini Pro" },
  ],

  create(apiKey: string, model: string): LlmClient {
    const ai = new GoogleGenAI({ apiKey });

    return {
      provider: "gemini",
      model,

      async generateJson(req) {
        const res = await ai.models.generateContent({
          model,
          contents: req.prompt,
          config: config(req),
        });
        return res.text ?? "";
      },

      async streamJson(req, onDelta) {
        const stream = await ai.models.generateContentStream({
          model,
          contents: req.prompt,
          config: config(req),
        });

        let text = "";
        for await (const chunk of stream) {
          const delta = chunk.text ?? "";
          if (!delta) continue;
          text += delta;
          onDelta(delta);
        }
        return text;
      },
    };
  },

  classifyError(err): LlmErrorInfo {
    const code = errorCode(err);
    const message = err instanceof Error ? err.message : String(err);

    /*
     * The server names its own delay ("retryDelay: 53s"), and waiting less than
     * that is pointless — the attempt would just burn for nothing.
     */
    const seconds = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(message)?.[1];
    const retryAfterMs = seconds ? Math.ceil(Number(seconds) * 1000) : null;

    if (code === 429) {
      /*
       * One 429 covers three different situations, and Google tells them apart
       * only inside `QuotaFailure.violations[].quotaId` — a string like
       * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`.
       *
       * A per-minute limit is worth the wait; a per-day one won't come back
       * within a run, so retrying it only costs the person half a minute before
       * the same answer.
       */
      const quotaIds = [...message.matchAll(/"quotaId":\s*"([^"]+)"/g)].map((m) => m[1]!);

      if (quotaIds.some((id) => /PerDay/i.test(id))) {
        return { kind: "daily_quota", retriable: false, retryAfterMs: null };
      }
      return { kind: "rate_limit", retriable: true, retryAfterMs };
    }
    // A 503 "high demand" on flash models is routine at peak and clears on its own
    if (code === 503) return { kind: "overloaded", retriable: true, retryAfterMs };
    if (code === 500 || code === 504) return { kind: "server", retriable: true, retryAfterMs };
    if (code === 401 || code === 403) return { kind: "auth", retriable: false, retryAfterMs: null };
    if (code === 400) {
      // Google reports a project with billing switched off as a failed precondition
      if (/FAILED_PRECONDITION|billing/i.test(message)) {
        return { kind: "no_credit", retriable: false, retryAfterMs: null };
      }
      return { kind: "bad_request", retriable: false, retryAfterMs: null };
    }

    return { kind: "unknown", retriable: false, retryAfterMs: null };
  },
};
