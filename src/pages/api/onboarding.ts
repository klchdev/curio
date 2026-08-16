import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getUserId } from "../../lib/auth";
import { db } from "../../db";
import { users } from "../../db/schema";

/**
 * The "onboarding is done" marker.
 *
 * Skipping and actually going through it set the same date on purpose: the
 * flag answers "should we send them here after signing in", not "is everything
 * filled in". Whether things are filled in is already visible from the key,
 * the library and the review count — duplicating that in a second piece of
 * state would mean two sources of truth that will drift apart.
 *
 * A date, not a boolean: it shows how many people get stuck at the door, and when.
 */
export const POST: APIRoute = async ({ cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(users.id, userId));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
