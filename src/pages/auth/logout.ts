import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ session, redirect }) => {
  session?.destroy();
  return redirect("/");
};
