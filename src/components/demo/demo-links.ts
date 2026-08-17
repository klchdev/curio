import type { MouseEvent } from "react";

/**
 * Production components link to neighbouring app screens by hard-coded URLs.
 * Without a session every one of those throws the guest out onto the landing
 * page in the middle of the demo. Rewriting them inside the components is not
 * an option — they are shared with the real app — so the click is caught on the
 * demo's own wrapper and sent to the twin screen instead.
 *
 * Only the screens with a twin are listed. A link to anything else is left
 * alone deliberately: the page behind it will ask for a session, which is the
 * truth, and quietly swallowing the click would be worse than saying so.
 */
const REROUTE: Record<string, string> = {
  "/demos": "/try/demos",
  "/history": "/try/history",
};

export function rerouteAppLinks(event: MouseEvent<HTMLElement>): void {
  const link = (event.target as HTMLElement).closest("a");
  if (!link) return;

  const target = REROUTE[new URL(link.href).pathname];
  if (!target) return;

  event.preventDefault();
  window.location.href = target;
}
