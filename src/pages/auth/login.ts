import type { APIRoute } from "astro";
import { getAuthUrl } from "../../lib/steam";

export const GET: APIRoute = async ({ url }) => {
  const returnUrl = new URL("/auth/callback", url.origin).toString();
  const authUrl = await getAuthUrl(returnUrl);
  return Response.redirect(authUrl, 302);
};
