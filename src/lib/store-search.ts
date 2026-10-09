import { normalizeTitle } from "./titles";

/**
 * Looking a game up in the store by title.
 *
 * The `games` catalog is shared and not tied to people: `user_games` says whose
 * game it is, while the card itself is simply what we know about that game. So
 * a mention of a game nobody owns is not a dead end but a reason to create a
 * card: the link then has somewhere to point, and the advisor gains a candidate.
 *
 * No astro:env or db imports: the module is needed by the server and by one-off
 * scripts alike. No Steam key is required here — the storefront answers anyone.
 */

const SEARCH_URL = "https://store.steampowered.com/api/storesearch/";

export interface StoreHit {
  appId: number;
  title: string;
  headerImage: string;
}

interface SearchItem {
  id?: number;
  name?: string;
  type?: string;
}

/**
 * Only an exact match counts.
 *
 * The storefront always returns something: for "Pathologic" the first hit is
 * "Pathologic 3", even though the person meant the original. Taking whatever
 * comes first means linking to the wrong game, and that is worse than no link
 * at all: a missing link reads as plain text, a wrong one lies quietly.
 */
export async function findStoreGame(title: string): Promise<StoreHit | null> {
  const wanted = normalizeTitle(title);
  if (wanted.length < 3) return null;

  const url = `${SEARCH_URL}?${new URLSearchParams({ term: title, cc: "us", l: "en" })}`;

  let items: SearchItem[];
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: SearchItem[] };
    items = data.items ?? [];
  } catch {
    // Search is an optional luxury: if the store doesn't answer, the mention
    // just stays without a card, and parsing the entry must not fail over it
    return null;
  }

  for (const item of items) {
    if (item.type !== "app" || typeof item.id !== "number" || !item.name) continue;
    if (normalizeTitle(item.name) !== wanted) continue;
    return {
      appId: item.id,
      title: item.name,
      headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${item.id}/header.jpg`,
    };
  }

  return null;
}

/**
 * Edition tails the store glues onto a title. A model names the game, the
 * store sells "Disco Elysium - The Final Cut" — the same thing to the person
 * buying it, so these alone don't make a different game. Sequel numbers and
 * subtitles still do: "Pathologic" must not land on "Pathologic 3".
 */
const EDITION_TAILS = [
  "final cut",
  "the final cut",
  "classic",
  "classic hd",
  "hd",
  "hd remaster",
  "hd remastered",
  "definitive edition",
  "enhanced edition",
  "complete edition",
  "game of the year edition",
  "goty edition",
  "goty",
  "remastered",
  "remaster",
  "directors cut",
  "director s cut",
  "anniversary edition",
  "deluxe edition",
  "redux",
];

function sameGame(wanted: string, found: string): boolean {
  if (found === wanted) return true;
  if (!found.startsWith(`${wanted} `)) return false;
  const tail = found.slice(wanted.length + 1);
  return EDITION_TAILS.includes(tail);
}

/**
 * Like `findStoreGame`, but for titles a model came up with rather than ones a
 * person wrote: an exact match first, an edition of the same game second.
 */
export async function resolveStoreGame(title: string): Promise<StoreHit | null> {
  const wanted = normalizeTitle(title);
  if (wanted.length < 2) return null;

  const url = `${SEARCH_URL}?${new URLSearchParams({ term: title, cc: "us", l: "en" })}`;

  let items: SearchItem[];
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: SearchItem[] };
    items = (data.items ?? []).filter(
      (item) => item.type === "app" && typeof item.id === "number" && !!item.name
    );
  } catch {
    return null;
  }

  const hit =
    items.find((item) => normalizeTitle(item.name!) === wanted) ??
    items.find((item) => sameGame(wanted, normalizeTitle(item.name!)));

  if (!hit) return null;
  return {
    appId: hit.id!,
    title: hit.name!,
    headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${hit.id}/header.jpg`,
  };
}
