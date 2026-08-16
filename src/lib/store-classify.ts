/**
 * Software or game — decided from the store page data.
 *
 * No astro:env or db imports: the module is needed by the server and by
 * one-off scripts alike.
 *
 * The first version rejected everything with `type !== "game"` and everything
 * without genres — and so filed as software GTR Evolution (listed as dlc),
 * Killing Floor Mod (mod), Cities XL and Mortal Kombat (the legacy type
 * advertising), and Total War: SHOGUN 2, whose store page simply carries no
 * genres. Hiding someone's games is worse than letting one utility into the
 * list, so software is now flagged on positive evidence only.
 */

/** Genres Steam hands out to tools. */
const SOFTWARE_GENRES = new Set([
  "Animation & Modeling",
  "Audio Production",
  "Design & Illustration",
  "Education",
  "Game Development",
  "Photo Editing",
  "Software Training",
  "Utilities",
  "Video Production",
  "Web Publishing",
]);

/** Types that are never games at all. */
const SOFTWARE_TYPES = new Set(["software", "video", "music", "audio", "movie", "series"]);

/** One of these categories is direct proof that the thing gets played. */
const PLAYER_CATEGORIES = ["Single-player", "Multi-player", "Co-op", "PvP", "MMO"];

/**
 * Plumbing, not a property of the product. The ARC Raiders Playtest page has
 * nothing on it but controller support — taking that as a sign of a filled-in
 * page is wrong, or playtests drift off into software.
 */
const NON_FEATURE_CATEGORIES = new Set([
  "Family Sharing",
  "Steam Cloud",
  "Stats",
  "Full controller support",
  "Partial Controller Support",
  "DualShock Controller Support",
  "DualSense Controller Support",
]);

export function classifyAsSoftware(
  type: string | null,
  genres: string[],
  categories: string[]
): boolean {
  if (type && SOFTWARE_TYPES.has(type)) return true;

  // This gets played — no need to guess any further
  if (categories.some((c) => PLAYER_CATEGORIES.some((p) => c.includes(p)))) return false;

  const software = genres.filter((g) => SOFTWARE_GENRES.has(g)).length;
  if (genres.length > 0 && software / genres.length >= 0.5) return true;

  /*
   * No genres at all, yet the page is filled in — that is what utility apps
   * like SteamVR look like. An empty page (only "Family Sharing") proves
   * nothing: that's an old game with no metadata.
   */
  const meaningful = categories.filter((c) => !NON_FEATURE_CATEGORIES.has(c));
  if (genres.length === 0 && meaningful.length > 0) return true;

  return false;
}

export function splitList(value: string | null): string[] {
  return value ? value.split(", ").filter(Boolean) : [];
}
