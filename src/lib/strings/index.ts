import { DEFAULT_LOCALE, type Locale } from "../i18n";
import * as ruShell from "./ru/shell";
import * as ruIntro from "./ru/intro";
import * as ruLoop from "./ru/loop";
import * as ruResults from "./ru/results";
import * as ruSettings from "./ru/settings";
import * as ruErrors from "./ru/errors";
import * as enShell from "./en/shell";
import * as enIntro from "./en/intro";
import * as enLoop from "./en/loop";
import * as enResults from "./en/results";
import * as enSettings from "./en/settings";
import * as enErrors from "./en/errors";

/**
 * Every string in the interface. The tier and verdict vocabulary lives in
 * vocab.ts — here is only what surrounds it.
 *
 * One file of a thousand lines turned every wording fix into a scroll, so the
 * sections are split by what they serve — the frame, the first contact, the
 * loop, its results, the settings, the failures — and each of those splits
 * again by language. The shape the rest of the app sees is unchanged: `t()`
 * still hands out one flat object.
 *
 * A value may be a function: Russian requires numeral agreement («ещё 1 отзыв»
 * / «ещё 3 отзыва» / «ещё 5 отзывов»), and the inflection rule belongs next to
 * the text, not inside a component.
 *
 * Every English section is typed against its Russian counterpart, so a
 * forgotten key or a signature that has drifted is a compile error in the file
 * being edited rather than an empty string on screen.
 */
const RU = {
  ...ruShell,
  ...ruIntro,
  ...ruLoop,
  ...ruResults,
  ...ruSettings,
  ...ruErrors,
};

const EN: Dict = {
  ...enShell,
  ...enIntro,
  ...enLoop,
  ...enResults,
  ...enSettings,
  ...enErrors,
};

export type Dict = typeof RU;

export function t(locale: Locale = DEFAULT_LOCALE): Dict {
  return locale === "en" ? EN : RU;
}
