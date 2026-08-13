import { GEMINI_API_KEY, GEMINI_API_KEY_PAID } from "astro:env/server";
import type { GeminiKeys } from "./gemini";

/**
 * Ключи из окружения. Отдельный модуль, потому что сам gemini.ts не должен
 * знать про astro:env: его же импортируют разовые скрипты, у которых
 * окружение своё.
 */
export const GEMINI_KEYS: GeminiKeys = {
  free: GEMINI_API_KEY,
  paid: GEMINI_API_KEY_PAID || undefined,
};
