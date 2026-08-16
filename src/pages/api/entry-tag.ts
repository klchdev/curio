import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { addEntryTag, removeEntryTag } from "../../lib/entry-analysis";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Editing an entry's tags.
 *
 * Removing and adding share one endpoint: from the person's point of view it
 * is the same gesture across the same strip of chips, and splitting it into
 * two routes would mean describing the interface in terms of storage layout.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({}));
  const entryId = Number(body.entryId);
  if (!Number.isInteger(entryId)) return json({ error: "Не указана запись" }, 400);

  if (body.action === "remove") {
    const tagId = Number(body.tagId);
    if (!Number.isInteger(tagId)) return json({ error: "Не указан тег" }, 400);
    const ok = await removeEntryTag(userId, entryId, tagId);
    return ok ? json({ ok: true }) : json({ error: "Запись не найдена" }, 404);
  }

  const label = String(body.label ?? "").trim();
  const kind = body.kind === "praise" ? "praise" : "complaint";
  if (label.length < 2 || label.length > 60) return json({ error: "Тег от 2 до 60 знаков" }, 400);

  const tag = await addEntryTag(userId, entryId, kind, label);
  return tag ? json({ ok: true, tag }) : json({ error: "Запись не найдена" }, 404);
};
