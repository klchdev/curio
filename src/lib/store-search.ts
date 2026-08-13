import { normalizeTitle } from "./titles";

/**
 * Поиск игры в магазине по названию.
 *
 * Каталог `games` общий и не привязан к людям: `user_games` говорит, чья
 * игра, а сама карточка — просто то, что мы про эту игру знаем. Поэтому
 * упоминание игры, которой нет ни у кого, — не тупик, а повод завести
 * карточку: тогда у ссылки появляется цель, а у советчика — кандидат.
 *
 * Без импортов astro:env и db: модуль нужен и серверу, и разовым скриптам.
 * Ключ Steam здесь не требуется, витрина отвечает всем.
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
 * Совпадение считается только точное.
 *
 * Витрина всегда возвращает что-нибудь: на «Pathologic» первым идёт
 * «Pathologic 3», хотя человек имел в виду оригинал. Взять первое попавшееся
 * — значит проставить ссылку не на ту игру, а это хуже отсутствия ссылки:
 * непроставленная видна как обычный текст, а неверная врёт молча.
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
    // Поиск — необязательная роскошь: не ответил магазин, упоминание просто
    // останется без карточки, и разбор записи из-за этого падать не должен
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
