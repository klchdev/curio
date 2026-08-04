import type { APIRoute } from "astro";
import { getRunStatus } from "../../lib/queries";

export const GET: APIRoute = async ({ session, url }) => {
  const userId = await session?.get<number>("userId");
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
