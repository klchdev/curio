/**
 * Сравнение названий игр.
 *
 * Нужно и разбору записей, и поиску по магазину, а тянуть ради одной функции
 * модуль с моделью незачем. Без импортов astro:env и db: работает и на
 * сервере, и в разовых скриптах.
 */

/** Римские номера частей: в базе «Civilization VI», в записи — «Civilization 6». */
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
 * Приводит название к виду, в котором сравнение имеет смысл: «Life is
 * Strange™» и «life is strange» должны сойтись, а «Life is Strange 2» —
 * остаться другой игрой.
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
