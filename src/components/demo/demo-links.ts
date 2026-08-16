import type { MouseEvent } from "react";

/**
 * Production components link to neighbouring app screens by hard-coded URLs.
 * Without a session every one of those throws the guest out onto the landing
 * page in the middle of the demo. Rewriting them inside the components is not
 * an option — they are shared with the real app — so the click is caught on the
 * demo's own wrapper and sent to the twin screen instead.
 *
 * Where the demo has no twin, the honest destination is the sign-in: reading a
 * full diary or writing a review by hand is exactly what an account is for.
 */
const REROUTE: Record<string, string> = {
  "/demos": "/try/demos",
  "/history": "/auth/login",
  "/settings": "/auth/login",
  // Onboarding's "write them by hand" link — writing is the one thing a guest cannot do
  "/dashboard": "/auth/login",
  "/onboarding": "/try",
};

export function rerouteAppLinks(event: MouseEvent<HTMLElement>): void {
  const link = (event.target as HTMLElement).closest("a");
  if (!link) return;

  const target = REROUTE[new URL(link.href).pathname];
  if (!target) return;

  event.preventDefault();
  window.location.href = target;
}
