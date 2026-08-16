import type { MouseEvent } from "react";
import Hub, { type Props as HubProps } from "../hub/Hub";
import { installDemoApi } from "./demo-api";

/**
 * The app's hub, shown to a guest.
 *
 * The wrapper is deliberately thin: inside it is the very same `Hub` a signed-in
 * person sees, with all three zones and all the buttons. A demo has no business
 * being a mockup of a screen, or it will start showing an interface the product
 * no longer has. Exactly two things are patched here, the two that are broken
 * without a session: requests to the server and the hub's internal links.
 */

/**
 * The hub links to neighbouring app screens by direct URLs. Without a session
 * both links would throw the guest out onto the landing page in the middle of
 * the demo. Rewriting them inside the hub itself is not an option — it's shared
 * with the real app — so the click is intercepted here. The demos have a twin of
 * their own; there is no full diary in the demo, so "all entries" more honestly
 * leads to where a diary gets started.
 */
const REROUTE: Record<string, string> = {
  "/demos": "/try/demos",
  "/history": "/auth/login",
};

export default function DemoHub(props: HubProps) {
  /*
   * The interception is installed in the body, not in an effect: children's
   * effects run before their parents', and the impression sheet would have
   * managed to go fetch its context for real. On the server there is no `window`
   * to touch — the island is fine with the first render in the browser.
   */
  if (typeof window !== "undefined") installDemoApi(props.locale);

  function reroute(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;

    const target = REROUTE[new URL(link.href).pathname];
    if (!target) return;

    event.preventDefault();
    window.location.href = target;
  }

  return (
    <div onClickCapture={reroute}>
      <Hub {...props} />
    </div>
  );
}
