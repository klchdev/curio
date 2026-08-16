import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { adapterFor, isProviderId } from "../../lib/llm";
import { testLlmKey } from "../../lib/llm/test-key";
import { clearLlmKey, getLlmSettings, saveLlmKey, saveLlmModel } from "../../lib/llm/credentials";

/**
 * The user's own model key.
 *
 * The key only travels inward: it is never returned outward, not even to its
 * owner — not in the response to saving it, not when reading the settings.
 * Only the tail is ever shown, and the server is what assembles it. Anything
 * that could leak into a browser log or a crash report must not leak.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { provider, model, apiKey } = await request.json();

  if (!isProviderId(provider)) return json({ error: "bad_provider" }, 400);
  if (typeof apiKey !== "string" || apiKey.trim().length < 8) {
    return json({ error: "bad_key" }, 400);
  }

  const adapter = adapterFor(provider);
  const chosenModel = typeof model === "string" && model.trim() ? model.trim() : adapter.models[0]!.id;
  const key = apiKey.trim();

  const result = await testLlmKey({ provider, apiKey: key, model: chosenModel });

  /*
   * An exhausted quota is no reason to refuse to save: the key is real and
   * will work tomorrow. We refuse only where the key or the model is plainly
   * wrong, otherwise the person ends up fixing what is not broken.
   */
  if (!result.ok && (result.reason === "auth" || result.reason === "bad_request")) {
    return json({ error: result.reason }, 400);
  }

  await saveLlmKey(userId, provider, chosenModel, key);
  const settings = await getLlmSettings(userId);

  return json({
    ok: true,
    ...settings,
    warning: result.ok ? null : result.reason,
  });
};

/** The model changes more often than the key — separately, without retyping the key. */
export const PATCH: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { model } = await request.json();
  if (typeof model !== "string" || !model.trim()) return json({ error: "bad_model" }, 400);

  await saveLlmModel(userId, model.trim());
  return json({ ok: true, ...(await getLlmSettings(userId)) });
};

export const DELETE: APIRoute = async ({ cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  await clearLlmKey(userId);
  return json({ ok: true });
};
