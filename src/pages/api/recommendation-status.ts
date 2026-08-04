import type { APIRoute } from "astro";
import { getUserId } from "../../lib/auth";
import { getRunStatus } from "../../lib/queries";

export const GET: APIRoute = async ({ cookies, url }) => {
  const userId = getUserId(cookies);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const runId = Number(url.searchParams.get("runId"));
  if (!Number.isInteger(runId)) {
    return new Response(JSON.stringify({ error: "Bad runId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const run = await getRunStatus(userId, runId);
  if (!run) return new Response("Not found", { status: 404 });

  return new Response(
    JSON.stringify({
      status: run.status,
      stage: run.stage,
      picksReady: run.picksReady,
      error: run.error,
      startedAt:
        run.createdAt instanceof Date ? run.createdAt.toISOString() : String(run.createdAt),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
