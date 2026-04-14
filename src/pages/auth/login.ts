import type { APIRoute } from "astro";
import { getAuthUrl } from "../../lib/steam";

function getOrigin(request: Request, url: URL): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (forwarded) return `${proto}://${forwarded}`;
  return url.origin;
}

export const GET: APIRoute = async ({ url, request }) => {
  const origin = getOrigin(request, url);
  const returnUrl = new URL("/auth/callback", origin).toString();
  const authUrl = await getAuthUrl(returnUrl);
  return Response.redirect(authUrl, 302);
};
