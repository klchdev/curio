import type { JsonSchema } from "./types";

/**
 * Converting the canonical schema into a provider's dialect.
 *
 * All three schemas descend from OpenAPI, but they diverge in exactly the spots
 * where the mistake is a silent one: Gemini won't understand a lowercase type,
 * and Anthropic and OpenAI in strict mode reject an object without
 * `additionalProperties: false`. Let the divergences live in one file rather
 * than in six schemas scattered across the call sites.
 */

/** Gemini expects types in caps: for it that's the `Type` enum, not a JSON Schema string. */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type.toUpperCase() };

  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.required) out.required = schema.required;

  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)])
    );
    /*
     * Field order is set explicitly. The model generates its answer left to
     * right, and a rationale field computed after the verdict reads as fitted
     * to an answer that has already been given. Without propertyOrdering,
     * Gemini guarantees nothing about key order.
     */
    out.propertyOrdering = Object.keys(schema.properties);
  }

  return out;
}

/**
 * Strict JSON Schema for Anthropic and OpenAI.
 *
 * `additionalProperties: false` is mandatory on every object, otherwise strict
 * mode won't kick in. `allRequired` is for OpenAI, which in strict mode demands
 * that every key be listed in `required`; Anthropic makes no such demand and is
 * content with the original list.
 */
export function toStrictJsonSchema(
  schema: JsonSchema,
  options: { allRequired?: boolean } = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type };

  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.items) out.items = toStrictJsonSchema(schema.items, options);

  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        toStrictJsonSchema(value, options),
      ])
    );
    out.additionalProperties = false;
    out.required = options.allRequired
      ? Object.keys(schema.properties)
      : (schema.required ?? []);
  } else if (schema.required) {
    out.required = schema.required;
  }

  return out;
}
