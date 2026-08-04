import type { APIRoute } from "astro";
import { clearAuthCookie } from "../../lib/auth";

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAuthCookie(cookies);
  return redirect("/");
};
