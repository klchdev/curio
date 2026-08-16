import Onboarding from "../Onboarding";
import { installDemoApi } from "./demo-api";
import { rerouteAppLinks } from "./demo-links";
import type { Locale } from "../../lib/i18n";

type Props = Parameters<typeof Onboarding>[0] & { locale: Locale };

/**
 * The way into the product, shown to a guest.
 *
 * This is the real onboarding screen, not a retelling of it: the same four
 * steps, the same two buttons. It is here because it is literally what a person
 * sees after signing in with an empty account — and the demo is supposed to
 * walk that path, not display its finish line.
 *
 * Its two working steps need nothing special from the demo. "Pull my library"
 * and "Import reviews" call the same routes as in production; the demo's mock
 * answers them from fixtures with a delay, so the buttons genuinely do
 * something and the counters move.
 */
export default function DemoOnboarding(props: Props) {
  if (typeof window !== "undefined") installDemoApi(props.locale);

  return (
    <div onClickCapture={rerouteAppLinks}>
      <Onboarding {...props} />
    </div>
  );
}
