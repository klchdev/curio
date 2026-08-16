/**
 * Comparing game titles.
 *
 * Both entry parsing and store search need this, and dragging in the module
 * with the model for one function makes no sense. No astro:env or db imports:
 * works on the server and in one-off scripts alike.
 */

/** Roman sequel numbers: the catalog says "Civilization VI", an entry "Civilization 6". */
const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
};

/**
 * Reduces a title to a form where comparison means something: "Life is
 * Strange™" and "life is strange" must match, while "Life is Strange 2" has to
 * stay a different game.
 */
export function normalizeTitle(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  return words
    .map((word, index) => (index === 0 && word === "the" ? "" : (ROMAN[word] ?? word)))
    .filter(Boolean)
    .join(" ");
}
