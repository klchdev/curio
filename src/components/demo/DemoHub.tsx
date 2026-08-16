import Hub, { type Props as HubProps } from "../hub/Hub";
import { installDemoApi } from "./demo-api";
import { rerouteAppLinks } from "./demo-links";

/**
 * The app's hub, shown to a guest.
 *
 * The wrapper is deliberately thin: inside it is the very same `Hub` a signed-in
 * person sees, with all three zones and all the buttons. A demo has no business
 * being a mockup of a screen, or it will start showing an interface the product
 * no longer has. Exactly two things are patched here, the two that are broken
 * without a session: requests to the server and the hub's internal links.
 */
export default function DemoHub(props: HubProps) {
  /*
   * The interception is installed in the body, not in an effect: children's
   * effects run before the parent's, and the impression sheet would have gone
   * looking for its context for real. There is no `window` to touch on the
   * server — the island only needs its first render in the browser.
   */
  if (typeof window !== "undefined") installDemoApi(props.locale);

  return (
    <div onClickCapture={rerouteAppLinks}>
      <Hub {...props} />
    </div>
  );
}
