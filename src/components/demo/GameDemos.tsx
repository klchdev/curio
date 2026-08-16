import DemoList from "../DemoList";
import { installDemoApi } from "./demo-api";
import type { Locale } from "../../lib/i18n";

type Props = Parameters<typeof DemoList>[0] & { locale: Locale };

/**
 * The list of impressions about demo versions — the same one as in the app.
 *
 * There is no markup of its own here at all: the wrapper exists purely to
 * install the request interception before the list mounts. The "add" button
 * opens the real impression sheet, and that will ask you to sign in — like any
 * save inside the demo.
 */
export default function GameDemos(props: Props) {
  if (typeof window !== "undefined") installDemoApi(props.locale);

  return <DemoList {...props} />;
}
