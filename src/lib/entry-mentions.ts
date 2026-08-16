import { normalizeTitle } from "./titles";

/**
 * Binding mentions to catalog rows.
 *
 * The split in two is deliberate. The model does what code cannot: it works out
 * that "the first LiS", "part two" and "RE4" all name games, and spells them out
 * in full (that part lives in entry-reading.ts). Binding a name to a specific
 * row is the code's job: the model has no catalog, and guessing which of the
 * five Life is Strange games is meant, it will miss. A bad match is fixed by
 * editing the rules, not the prompt.
 *
 * No astro:env or db imports: this module is needed by the server and by a
 * one-off script alike.
 */

/** What the model found in the text: the verbatim span and its guess at the title. */
export interface RawMention {
  surface: string;
  title: string;
}

/** A catalog row to match against. The flags break the ties. */
export interface CatalogGame {
  id: number;
  title: string;
  /** Has a diary record — this is a game the player definitely knows. */
  hasRecord: boolean;
  inLibrary: boolean;
}

export interface PlacedMention {
  gameId: number | null;
  surface: string;
  startOffset: number;
  canonicalTitle: string;
}

/**
 * Between two games with the same title, take the one the player has already
 * written about: what they have touched is surer than what they have not.
 */
function pickBest(candidates: CatalogGame[]): CatalogGame {
  return [...candidates].sort((a, b) => {
    if (a.hasRecord !== b.hasRecord) return a.hasRecord ? -1 : 1;
    if (a.inLibrary !== b.inLibrary) return a.inLibrary ? -1 : 1;
    return a.id - b.id;
  })[0]!;
}

/**
 * The catalog gives an exact match or nothing at all.
 *
 * Stretching to a prefix is tempting («Dishonored» → «Dishonored - Definitive
 * Edition»), and it holds up exactly as long as there is a single candidate.
 * «Life is Strange» is a prefix of five games at once, and any guess there
 * links to the wrong installment. Saying nothing is the honest answer.
 */
function resolveTitle(title: string, index: Map<string, CatalogGame[]>): CatalogGame | null {
  const key = normalizeTitle(title);
  if (!key) return null;

  const exact = index.get(key);
  if (exact) return pickBest(exact);

  const prefixed: CatalogGame[] = [];
  for (const [candidateKey, games] of index) {
    if (candidateKey.startsWith(`${key} `)) prefixed.push(...games);
  }
  if (prefixed.length === 0) return null;

  const unique = new Set(prefixed.map((game) => normalizeTitle(game.title)));
  if (unique.size > 1) return null;

  return pickBest(prefixed);
}

/**
 * Puts mentions where they actually sit in the text.
 *
 * The model never reports the position — the code finds it: model offsets lie
 * more often than the verbatim span does, and the span can be verified on top
 * of that. No substring match means there was no mention; inventing a spot for
 * the highlight is not an option, or it slides onto someone else's words.
 */
export function placeMentions(
  text: string,
  raw: RawMention[],
  catalog: CatalogGame[],
  ownGameId: number | null
): PlacedMention[] {
  const index = new Map<string, CatalogGame[]>();
  for (const game of catalog) {
    const key = normalizeTitle(game.title);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(game);
    else index.set(key, [game]);
  }

  const taken: Array<[number, number]> = [];
  const placed: PlacedMention[] = [];

  for (const mention of raw) {
    const match = resolveTitle(mention.title, index);
    // The entry is about this game anyway — a link to itself adds nothing
    if (match && match.id === ownGameId) continue;

    let from = 0;
    let start = -1;
    while (from <= text.length) {
      const found = text.indexOf(mention.surface, from);
      if (found === -1) break;
      const end = found + mention.surface.length;
      const overlaps = taken.some(([a, b]) => found < b && a < end);
      if (!overlaps) {
        start = found;
        break;
      }
      from = found + 1;
    }
    if (start === -1) continue;

    taken.push([start, start + mention.surface.length]);
    placed.push({
      gameId: match?.id ?? null,
      surface: mention.surface,
      startOffset: start,
      canonicalTitle: match?.title ?? mention.title,
    });
  }

  return placed.sort((a, b) => a.startOffset - b.startOffset);
}
