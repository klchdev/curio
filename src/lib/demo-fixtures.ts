/**
 * The demo account: all of Curio running on static data.
 *
 * The "try it without an account" mode exists because an honest sign-in costs a
 * person three steps taken blind: log in through Steam, sync the library, write
 * a dozen reviews — and only then does the app first show what the whole thing
 * was for. Showing an empty diary and offering "start keeping notes" is asking
 * someone to take it on faith.
 *
 * Hence fixtures rather than a live database with a seed. The demo must not be
 * able to reach Steam, Postgres or the model: a guest kept in the database
 * would mean migrations, sweeping up abandoned accounts and real money for
 * every recomputation of the advice — advice that would come out the same
 * anyway, since the taste is the same. Here everything is computed already and
 * never changes, so the demo runs without environment variables, doesn't fall
 * over when keys are missing, and opens instantly.
 *
 * The same data doubles as set dressing for the landing page screenshots and as
 * the seed for test accounts: three sources of truth about "what a filled-in
 * Curio looks like" would drift apart within a week, and the landing page would
 * be showing an interface the app no longer has.
 *
 * The shapes here aren't made up: everything that goes out is typed by the
 * return types of `queries.ts` — a fixture that stops fitting a component is
 * obliged to break the build, not to show an empty screen in production.
 *
 * The derived sets (the diary feed, the tier list, the attention queue, the
 * statistics) aren't written out by hand but assembled from a single source by
 * the same rules the database uses. Otherwise the demo comes apart in plain
 * sight: eleven games in the diary, fourteen in the summary, and a tag in the
 * taste profile that appears in no entry at all.
 */

import type {
  AttentionItem,
  TasteTag,
  getActiveSlots,
  getAttentionQueue,
  getDemoReviews,
  getFreeSkips,
  getGameTimeline,
  getHistory,
  getLatestRecommendations,
  getStats,
  getTierList,
  getUnplayedGames,
} from "./queries";
import type { getDiaryMentions, getDiaryTags } from "./entry-analysis";
import type { DeepDive } from "./deep-dive";
import type {
  PreTracker,
  TrackedGain,
  TrackedGame,
  TrackedSession,
  TrackerData,
} from "./playtime-stats";
import type { SessionUser } from "./session";

/* ================= Types borrowed from the queries ================= */

type ActiveSlots = Awaited<ReturnType<typeof getActiveSlots>>;
type UnplayedGames = Awaited<ReturnType<typeof getUnplayedGames>>;
type AttentionQueue = Awaited<ReturnType<typeof getAttentionQueue>>;
type TierList = Awaited<ReturnType<typeof getTierList>>;
type History = Awaited<ReturnType<typeof getHistory>>;
type HistoryItem = History[number];
type GameTimeline = Awaited<ReturnType<typeof getGameTimeline>>;
type DemoReviews = Awaited<ReturnType<typeof getDemoReviews>>;
type Stats = Awaited<ReturnType<typeof getStats>>;
type FreeSkips = Awaited<ReturnType<typeof getFreeSkips>>;
type DiaryTags = Awaited<ReturnType<typeof getDiaryTags>>;
type DiaryMentions = Awaited<ReturnType<typeof getDiaryMentions>>;
/** There is always an advice run: nothing in the demo can be "not generated yet". */
type RunWithPicks = NonNullable<Awaited<ReturnType<typeof getLatestRecommendations>>>;

/**
 * A negative id, so the demo user can't collide with a real one under any
 * circumstances: `users.id` in the database is a serial and is always > 0.
 */
export const DEMO_USER_ID = -1;

/* ================= Small bits for assembly ================= */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/*
 * Time is measured from startup, not from a date baked into the code. The demo
 * gets opened whenever, and a diary whose last entry is from the spring before
 * last reads as an abandoned account, while the heatmap for the same period
 * comes out empty.
 */
const NOW = Date.now();

/** A moment in the past: `daysAgo` days ago at the given hour of local time. */
function at(daysAgo: number, hour = 20, minute = 0): Date {
  const date = new Date(NOW - daysAgo * DAY);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function header(steamAppId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
}

/** Tag normalization — the same role `tags.normalized` plays in the database. */
function normalize(label: string): string {
  return label.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/* ================= User ================= */

export const DEMO_USER: SessionUser = {
  id: DEMO_USER_ID,
  steamId: "76561197960287930",
  username: "Кирилл",
  avatarUrl: null,
  lastLibrarySync: new Date(NOW - 3 * 60 * MINUTE),
};

/* ================= Library ================= */

/**
 * A game in the demo player's library: a snapshot of the `games` row together
 * with their personal `user_games` row. No reason to split the two — in the
 * demo the relation is one to one.
 */
export interface DemoLibraryGame {
  id: number;
  steamAppId: number;
  title: string;
  genres: string;
  shortDescription: string;
  releaseDate: string;
  playtimeMinutes: number;
  /** When it was last launched; null — never launched at all. */
  lastPlayedDaysAgo: number | null;
  isSoftware?: boolean;
  /** Excluded from the pool by hand: "won't run", "no headset". */
  excluded?: boolean;
}

/*
 * The library is built around one legible taste rather than "as many genres as
 * possible": the demo has to read like somebody's real account. Hence the
 * spread of playtime too — from untouched to a hundred and fifty hours in a
 * shooter someone has been dropping into "for half an hour" for three years.
 */
export const DEMO_LIBRARY: DemoLibraryGame[] = [
  {
    id: 1,
    steamAppId: 632470,
    title: "Disco Elysium - The Final Cut",
    genres: "RPG, Приключение",
    shortDescription: "Детектив с разрушенной психикой расследует убийство в умирающем городе.",
    releaseDate: "15 окт. 2019",
    playtimeMinutes: 2650,
    lastPlayedDaysAgo: 96,
  },
  {
    id: 2,
    steamAppId: 1086940,
    title: "Baldur's Gate 3",
    genres: "RPG, Стратегия, Приключение",
    shortDescription: "Партийная ролевая игра по правилам D&D с пошаговыми боями.",
    releaseDate: "3 авг. 2023",
    playtimeMinutes: 4380,
    lastPlayedDaysAgo: 0,
  },
  {
    id: 3,
    steamAppId: 292030,
    title: "The Witcher 3: Wild Hunt",
    genres: "RPG, Экшен, Открытый мир",
    shortDescription: "Ведьмак ищет приёмную дочь в мире, где побочные истории сильнее основной.",
    releaseDate: "18 мая 2015",
    playtimeMinutes: 3720,
    lastPlayedDaysAgo: 210,
  },
  {
    id: 4,
    steamAppId: 1091500,
    title: "Cyberpunk 2077",
    genres: "RPG, Экшен, Открытый мир",
    shortDescription: "Наёмник в Найт-Сити живёт с чужой личностью в голове.",
    releaseDate: "10 дек. 2020",
    playtimeMinutes: 2040,
    lastPlayedDaysAgo: 118,
  },
  {
    id: 5,
    steamAppId: 1245620,
    title: "ELDEN RING",
    genres: "RPG, Экшен, Открытый мир",
    shortDescription: "Открытый мир от авторов Dark Souls, собранный из подземелий и боссов.",
    releaseDate: "25 фев. 2022",
    playtimeMinutes: 1630,
    lastPlayedDaysAgo: 84,
  },
  {
    id: 6,
    steamAppId: 367520,
    title: "Hollow Knight",
    genres: "Метроидвания, Платформер",
    shortDescription: "Молчаливый рыцарь спускается в разрушенное королевство насекомых.",
    releaseDate: "24 фев. 2017",
    playtimeMinutes: 2510,
    lastPlayedDaysAgo: 15,
  },
  {
    id: 7,
    steamAppId: 1145360,
    title: "Hades",
    genres: "Рогалик, Экшен",
    shortDescription: "Сын Аида раз за разом сбегает из подземного царства.",
    releaseDate: "17 сен. 2020",
    playtimeMinutes: 2280,
    lastPlayedDaysAgo: 2,
  },
  {
    id: 8,
    steamAppId: 504230,
    title: "Celeste",
    genres: "Платформер",
    shortDescription: "Девушка поднимается на гору и разбирается с собой по дороге.",
    releaseDate: "25 янв. 2018",
    playtimeMinutes: 720,
    lastPlayedDaysAgo: 150,
  },
  {
    id: 9,
    steamAppId: 1237970,
    title: "Titanfall 2",
    genres: "Шутер, Экшен",
    shortDescription: "Шестичасовая кампания, где каждая миссия придумана заново.",
    releaseDate: "18 июн. 2020",
    playtimeMinutes: 540,
    lastPlayedDaysAgo: 190,
  },
  {
    id: 10,
    steamAppId: 524220,
    title: "NieR:Automata",
    genres: "Экшен, RPG",
    shortDescription: "Андроиды воюют с машинами и постепенно перестают понимать зачем.",
    releaseDate: "17 мар. 2017",
    playtimeMinutes: 1980,
    lastPlayedDaysAgo: 130,
  },
  {
    id: 11,
    steamAppId: 892970,
    title: "Valheim",
    genres: "Выживание, Открытый мир, Крафт",
    shortDescription: "Викинги строят базы и добывают руду в процедурном чистилище.",
    releaseDate: "2 фев. 2021",
    playtimeMinutes: 1140,
    lastPlayedDaysAgo: 45,
  },
  {
    id: 12,
    steamAppId: 1174180,
    title: "Red Dead Redemption 2",
    genres: "Экшен, Открытый мир, Приключение",
    shortDescription: "Закат банды разбойников на границе уходящего Дикого Запада.",
    releaseDate: "5 дек. 2019",
    playtimeMinutes: 840,
    lastPlayedDaysAgo: 30,
  },
  {
    id: 13,
    steamAppId: 413150,
    title: "Stardew Valley",
    genres: "Симулятор, RPG",
    shortDescription: "Наследство в виде заросшей фермы и целая деревня соседей.",
    releaseDate: "26 фев. 2016",
    playtimeMinutes: 480,
    lastPlayedDaysAgo: 55,
  },
  {
    id: 14,
    steamAppId: 646570,
    title: "Slay the Spire",
    genres: "Карточная, Рогалик",
    shortDescription: "Колода собирается по дороге наверх и разваливается на боссе.",
    releaseDate: "23 янв. 2019",
    playtimeMinutes: 1560,
    lastPlayedDaysAgo: 1,
  },
  {
    id: 15,
    steamAppId: 391540,
    title: "Undertale",
    genres: "RPG, Приключение",
    shortDescription: "RPG, в которой можно не убить никого — и она это заметит.",
    releaseDate: "15 сен. 2015",
    playtimeMinutes: 410,
    lastPlayedDaysAgo: 240,
  },

  /* Taken on right now — contracts on untouched games. */
  {
    id: 16,
    steamAppId: 1627720,
    title: "Lies of P",
    genres: "Экшен, RPG",
    shortDescription: "Souls-like по мотивам «Пиноккио» в декорациях бель эпок.",
    releaseDate: "19 сен. 2023",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 17,
    steamAppId: 460950,
    title: "Katana ZERO",
    genres: "Экшен, Платформер",
    shortDescription: "Убийца с катаной переигрывает секунду до тех пор, пока не выживет.",
    releaseDate: "18 апр. 2019",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },

  /* Played a fair amount, not a word said about it — that's the triage queue. */
  {
    id: 18,
    steamAppId: 730,
    title: "Counter-Strike 2",
    genres: "Шутер, Соревновательная",
    shortDescription: "Тактический шутер, в который заходят «на один катки».",
    releaseDate: "21 авг. 2012",
    playtimeMinutes: 9840,
    lastPlayedDaysAgo: 2,
  },
  {
    id: 19,
    steamAppId: 105600,
    title: "Terraria",
    genres: "Песочница, Приключение",
    shortDescription: "Двумерная песочница, где копают вниз до самого ада.",
    releaseDate: "16 мая 2011",
    playtimeMinutes: 3300,
    lastPlayedDaysAgo: 7,
  },
  {
    id: 20,
    steamAppId: 271590,
    title: "Grand Theft Auto V",
    genres: "Экшен, Открытый мир",
    shortDescription: "Три преступника и один очень большой город.",
    releaseDate: "14 апр. 2015",
    playtimeMinutes: 2100,
    lastPlayedDaysAgo: 320,
  },
  {
    id: 21,
    steamAppId: 582010,
    title: "Monster Hunter: World",
    genres: "Экшен, RPG, Кооператив",
    shortDescription: "Охота на огромных зверей ради их же деталей на броню.",
    releaseDate: "9 авг. 2018",
    playtimeMinutes: 1180,
    lastPlayedDaysAgo: 6,
  },
  {
    id: 22,
    steamAppId: 427520,
    title: "Factorio",
    genres: "Стратегия, Симулятор",
    shortDescription: "Завод должен расти. Завод всегда должен расти.",
    releaseDate: "14 авг. 2020",
    playtimeMinutes: 890,
    lastPlayedDaysAgo: 3,
  },
  {
    id: 23,
    steamAppId: 594650,
    title: "Hunt: Showdown 1896",
    genres: "Шутер, Выживание",
    shortDescription: "Медленный шутер, где выстрел слышно на пол-карты.",
    releaseDate: "27 авг. 2019",
    playtimeMinutes: 640,
    lastPlayedDaysAgo: 62,
  },
  {
    id: 24,
    steamAppId: 255710,
    title: "Cities: Skylines",
    genres: "Симулятор, Стратегия",
    shortDescription: "Градостроительный симулятор с честными пробками.",
    releaseDate: "10 мар. 2015",
    playtimeMinutes: 520,
    lastPlayedDaysAgo: 145,
  },
  {
    id: 25,
    steamAppId: 601150,
    title: "Devil May Cry 5",
    genres: "Экшен",
    shortDescription: "Слэшер, где за стиль начисляют буквы.",
    releaseDate: "8 мар. 2019",
    playtimeMinutes: 300,
    lastPlayedDaysAgo: 8,
  },
  {
    id: 26,
    steamAppId: 1229490,
    title: "ULTRAKILL",
    genres: "Шутер, Экшен",
    shortDescription: "Скоростной шутер про машину, которая пьёт кровь.",
    releaseDate: "3 сен. 2020",
    playtimeMinutes: 95,
    lastPlayedDaysAgo: 40,
  },

  /* Untouched — this is what the roulette pool and the advice are built from. */
  {
    id: 27,
    steamAppId: 1332010,
    title: "Stray",
    genres: "Приключение",
    shortDescription: "Кот в городе роботов ищет дорогу наверх.",
    releaseDate: "19 июл. 2022",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 28,
    steamAppId: 2379780,
    title: "Balatro",
    genres: "Карточная, Рогалик",
    shortDescription: "Покерный рогалик, в котором правила покера ломают джокерами.",
    releaseDate: "20 фев. 2024",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 29,
    steamAppId: 1057090,
    title: "Ori and the Will of the Wisps",
    genres: "Платформер, Метроидвания",
    shortDescription: "Метроидвания с рисованными фонами и очень точным прыжком.",
    releaseDate: "11 мар. 2020",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 30,
    steamAppId: 1593500,
    title: "God of War",
    genres: "Экшен, Приключение",
    shortDescription: "Кратос и его сын идут развеять прах по скандинавским мирам.",
    releaseDate: "14 янв. 2022",
    playtimeMinutes: 12,
    lastPlayedDaysAgo: 74,
  },
  {
    id: 31,
    steamAppId: 1888930,
    title: "The Last of Us Part I",
    genres: "Экшен, Приключение",
    shortDescription: "Контрабандист везёт девочку через мёртвую Америку.",
    releaseDate: "28 мар. 2023",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 32,
    steamAppId: 1687950,
    title: "Persona 5 Royal",
    genres: "RPG, Приключение",
    shortDescription: "Школьники днём, воры сердец ночью — на сотню часов.",
    releaseDate: "21 окт. 2022",
    playtimeMinutes: 8,
    lastPlayedDaysAgo: 112,
  },
  {
    id: 33,
    steamAppId: 546560,
    title: "Half-Life: Alyx",
    genres: "Шутер, VR",
    shortDescription: "Шутер во вселенной Half-Life, который работает только в VR.",
    releaseDate: "23 мар. 2020",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
    // The headset was sold the year before last — removed from the pool by hand
    excluded: true,
  },
  {
    id: 34,
    steamAppId: 431960,
    title: "Wallpaper Engine",
    genres: "Утилиты",
    shortDescription: "Живые обои на рабочий стол.",
    releaseDate: "16 нояб. 2018",
    playtimeMinutes: 4820,
    lastPlayedDaysAgo: 1,
    // More playtime than in any game — which is exactly why the software filter exists
    isSoftware: true,
  },

  /*
   * The bulk of the backlog: bought on sale, never launched.
   *
   * This part is deliberately the largest one. Advice is drawn only from
   * untouched games, so the size of this block is the ceiling on how many picks
   * a run can hold — and the dice rolls between the picks, not between the
   * library. A dozen untouched games would mean a run of a dozen cards, which
   * is a demo that runs out after a minute of clicking.
   *
   * It also has to hold games that suit the player badly. Tier D — "don't spend
   * the time" — is a working part of the advice, and without a shelf of open
   * worlds and survival crafting bought in a sale there would be nothing
   * honest to put there.
   */
  {
    id: 35,
    steamAppId: 620,
    title: "Portal 2",
    genres: "Головоломка, Приключение",
    shortDescription: "Головоломки с порталами и лучший комический дуэт в играх.",
    releaseDate: "19 апр. 2011",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 36,
    steamAppId: 400,
    title: "Portal",
    genres: "Головоломка",
    shortDescription: "Три часа, за которые жанр придумали заново.",
    releaseDate: "10 окт. 2007",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 37,
    steamAppId: 220,
    title: "Half-Life 2",
    genres: "Шутер, Приключение",
    shortDescription: "Шутер, который рассказывает историю, ни разу не отняв управление.",
    releaseDate: "16 нояб. 2004",
    playtimeMinutes: 14,
    lastPlayedDaysAgo: 300,
  },
  {
    id: 38,
    steamAppId: 304430,
    title: "INSIDE",
    genres: "Платформер, Приключение",
    shortDescription: "Четыре часа без единого слова и без единой лишней сцены.",
    releaseDate: "7 июл. 2016",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 39,
    steamAppId: 753640,
    title: "Outer Wilds",
    genres: "Приключение, Головоломка",
    shortDescription: "Двадцать две минуты до взрыва солнца и целая система, которую надо понять.",
    releaseDate: "18 июн. 2020",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 40,
    steamAppId: 653530,
    title: "Return of the Obra Dinn",
    genres: "Головоломка, Приключение",
    shortDescription: "Страховой инспектор восстанавливает судьбу шестидесяти человек по одной сцене каждого.",
    releaseDate: "18 окт. 2018",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 41,
    steamAppId: 501300,
    title: "What Remains of Edith Finch",
    genres: "Приключение",
    shortDescription: "Дом, в котором каждая комната рассказывает, как умер её хозяин.",
    releaseDate: "25 апр. 2017",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 42,
    steamAppId: 383870,
    title: "Firewatch",
    genres: "Приключение",
    shortDescription: "Смотритель леса и голос в рации на всё лето.",
    releaseDate: "9 фев. 2016",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 43,
    steamAppId: 590380,
    title: "Into the Breach",
    genres: "Стратегия, Тактика",
    shortDescription: "Тактика, где виден каждый следующий ход противника.",
    releaseDate: "27 фев. 2018",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 44,
    steamAppId: 212680,
    title: "FTL: Faster Than Light",
    genres: "Стратегия, Рогалик",
    shortDescription: "Корабль, экипаж и очень длинная дорога, которую редко проходят.",
    releaseDate: "14 сен. 2012",
    playtimeMinutes: 6,
    lastPlayedDaysAgo: 260,
  },
  {
    id: 45,
    steamAppId: 736260,
    title: "Baba Is You",
    genres: "Головоломка",
    shortDescription: "Головоломка, в которой правила лежат на поле и их можно двигать.",
    releaseDate: "13 мар. 2019",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 46,
    steamAppId: 588650,
    title: "Dead Cells",
    genres: "Рогалик, Экшен, Метроидвания",
    shortDescription: "Рогалик с очень быстрым фехтованием и без сохранений.",
    releaseDate: "7 авг. 2018",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 47,
    steamAppId: 311690,
    title: "Enter the Gungeon",
    genres: "Рогалик, Экшен",
    shortDescription: "Пулевой ад, собранный из шуток про оружие.",
    releaseDate: "5 апр. 2016",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 48,
    steamAppId: 632360,
    title: "Risk of Rain 2",
    genres: "Рогалик, Экшен",
    shortDescription: "Забег, в котором сложность растёт сама, пока ты стоишь.",
    releaseDate: "11 авг. 2020",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 49,
    steamAppId: 1794680,
    title: "Vampire Survivors",
    genres: "Рогалик, Экшен",
    shortDescription: "Пятнадцать минут, одна кнопка и экран, забитый до предела.",
    releaseDate: "20 окт. 2022",
    playtimeMinutes: 11,
    lastPlayedDaysAgo: 180,
  },
  {
    id: 50,
    steamAppId: 1817230,
    title: "Hi-Fi RUSH",
    genres: "Экшен, Ритм",
    shortDescription: "Слэшер, в котором весь мир двигается в такт саундтреку.",
    releaseDate: "25 янв. 2023",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 51,
    steamAppId: 782330,
    title: "DOOM Eternal",
    genres: "Шутер, Экшен",
    shortDescription: "Шутер, который не даёт стоять на месте ни секунды.",
    releaseDate: "20 мар. 2020",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 52,
    steamAppId: 1030300,
    title: "Hollow Knight: Silksong",
    genres: "Метроидвания, Платформер",
    shortDescription: "Продолжение, которого ждали семь лет.",
    releaseDate: "4 сен. 2025",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 53,
    steamAppId: 1145350,
    title: "Hades II",
    genres: "Рогалик, Экшен",
    shortDescription: "Та же формула забега, только ведьма и другой пантеон.",
    releaseDate: "6 мая 2024",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 54,
    steamAppId: 387290,
    title: "Ori and the Blind Forest: Definitive Edition",
    genres: "Платформер, Метроидвания",
    shortDescription: "Первая часть: рисованный лес и очень точный прыжок.",
    releaseDate: "11 мар. 2016",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 55,
    steamAppId: 268910,
    title: "Cuphead",
    genres: "Экшен, Платформер",
    shortDescription: "Рисованные боссы тридцатых годов и очень мало права на ошибку.",
    releaseDate: "29 сен. 2017",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 56,
    steamAppId: 2050650,
    title: "Resident Evil 4",
    genres: "Экшен, Хоррор",
    shortDescription: "Ремейк, где инвентарь — это отдельная головоломка.",
    releaseDate: "24 мар. 2023",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 57,
    steamAppId: 814380,
    title: "Sekiro: Shadows Die Twice",
    genres: "Экшен, Приключение",
    shortDescription: "Фехтование на парированиях, где уклоняться нельзя.",
    releaseDate: "22 мар. 2019",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 58,
    steamAppId: 374320,
    title: "DARK SOULS III",
    genres: "Экшен, RPG",
    shortDescription: "Souls без открытого мира: коридоры, срезки и костры.",
    releaseDate: "11 апр. 2016",
    playtimeMinutes: 9,
    lastPlayedDaysAgo: 220,
  },
  {
    id: 59,
    steamAppId: 1817070,
    title: "Marvel's Spider-Man Remastered",
    genres: "Экшен, Открытый мир",
    shortDescription: "Полёты на паутине по Манхэттену и очень много вышек.",
    releaseDate: "12 авг. 2022",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 60,
    steamAppId: 1113560,
    title: "NieR Replicant ver.1.22474487139...",
    genres: "Экшен, RPG",
    shortDescription: "Предыстория Automata: та же музыка, та же беготня.",
    releaseDate: "23 апр. 2021",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 61,
    steamAppId: 1172380,
    title: "STAR WARS Jedi: Fallen Order",
    genres: "Экшен, Приключение",
    shortDescription: "Souls-lite по «Звёздным войнам» с картой, в которой легко потеряться.",
    releaseDate: "15 нояб. 2019",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 62,
    steamAppId: 435150,
    title: "Divinity: Original Sin 2",
    genres: "RPG, Стратегия",
    shortDescription: "Партийная RPG, из которой выросла Baldur's Gate 3.",
    releaseDate: "14 сен. 2017",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 63,
    steamAppId: 22380,
    title: "Fallout: New Vegas",
    genres: "RPG, Экшен",
    shortDescription: "Пустошь, где почти каждый квест решается разговором.",
    releaseDate: "19 окт. 2010",
    playtimeMinutes: 13,
    lastPlayedDaysAgo: 340,
  },
  {
    id: 64,
    steamAppId: 379430,
    title: "Kingdom Come: Deliverance",
    genres: "RPG, Открытый мир",
    shortDescription: "Средневековая Богемия без магии и с очень упрямым фехтованием.",
    releaseDate: "13 фев. 2018",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 65,
    steamAppId: 262060,
    title: "Darkest Dungeon",
    genres: "Рогалик, Стратегия",
    shortDescription: "Отряд героев, которых игра методично доводит до нервного срыва.",
    releaseDate: "19 янв. 2016",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 66,
    steamAppId: 1888160,
    title: "ARMORED CORE VI FIRES OF RUBICON",
    genres: "Экшен",
    shortDescription: "Роботы, собираемые по деталям, и боссы на проверку сборки.",
    releaseDate: "25 авг. 2023",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },

  /*
   * Bought in a sale and never opened. These are exactly what tier D is for:
   * open worlds with icon maps and survival crafting — the two things the diary
   * names as the reason for quitting, over and over.
   */
  {
    id: 67,
    steamAppId: 812140,
    title: "Assassin's Creed Odyssey",
    genres: "Экшен, RPG, Открытый мир",
    shortDescription: "Древняя Греция размером с настоящую и вопросики по всей карте.",
    releaseDate: "5 окт. 2018",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 68,
    steamAppId: 552520,
    title: "Far Cry 5",
    genres: "Шутер, Открытый мир",
    shortDescription: "Монтана, секта и аванпосты, которые зачищаются по одному шаблону.",
    releaseDate: "27 мар. 2018",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 69,
    steamAppId: 990080,
    title: "Hogwarts Legacy",
    genres: "RPG, Открытый мир",
    shortDescription: "Хогвартс и очень много сундуков вокруг него.",
    releaseDate: "10 фев. 2023",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 70,
    steamAppId: 377160,
    title: "Fallout 4",
    genres: "RPG, Открытый мир, Крафт",
    shortDescription: "Пустошь, в которой надо строить поселения и защищать их по радио.",
    releaseDate: "10 нояб. 2015",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 71,
    steamAppId: 275850,
    title: "No Man's Sky",
    genres: "Выживание, Приключение, Открытый мир",
    shortDescription: "Восемнадцать квинтиллионов планет и один цикл добычи ресурсов.",
    releaseDate: "12 авг. 2016",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 72,
    steamAppId: 252490,
    title: "Rust",
    genres: "Выживание, Крафт",
    shortDescription: "Голым на побережье, и всё остальное надо добыть.",
    releaseDate: "8 фев. 2018",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 73,
    steamAppId: 108600,
    title: "Project Zomboid",
    genres: "Выживание, Крафт, RPG",
    shortDescription: "Симулятор того, как ты умрёшь во время зомби-апокалипсиса.",
    releaseDate: "8 нояб. 2013",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 74,
    steamAppId: 526870,
    title: "Satisfactory",
    genres: "Симулятор, Крафт, Выживание",
    shortDescription: "Завод на чужой планете, который надо строить руками от первого лица.",
    releaseDate: "10 сен. 2024",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 75,
    steamAppId: 1085660,
    title: "Destiny 2",
    genres: "Шутер, MMO",
    shortDescription: "Шутер, в котором цифры на снаряжении растут каждый сезон.",
    releaseDate: "1 окт. 2019",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 76,
    steamAppId: 261550,
    title: "Mount & Blade II: Bannerlord",
    genres: "RPG, Стратегия, Открытый мир",
    shortDescription: "Средневековая песочница, где надо самому придумать себе занятие.",
    releaseDate: "25 окт. 2022",
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },

  /* Played a fair bit and never written about — more fuel for the triage queue. */
  {
    id: 77,
    steamAppId: 550,
    title: "Left 4 Dead 2",
    genres: "Шутер, Кооператив",
    shortDescription: "Четверо, дробовики и очень много зомби.",
    releaseDate: "17 нояб. 2009",
    playtimeMinutes: 780,
    lastPlayedDaysAgo: 96,
  },
  {
    id: 78,
    steamAppId: 440,
    title: "Team Fortress 2",
    genres: "Шутер, Кооператив",
    shortDescription: "Девять классов и восемнадцать лет шляп.",
    releaseDate: "10 окт. 2007",
    playtimeMinutes: 1420,
    lastPlayedDaysAgo: 410,
  },
  {
    id: 79,
    steamAppId: 227300,
    title: "Euro Truck Simulator 2",
    genres: "Симулятор",
    shortDescription: "Дорога, радио и груз, который надо довезти к утру.",
    releaseDate: "18 окт. 2012",
    playtimeMinutes: 940,
    lastPlayedDaysAgo: 58,
  },
  {
    id: 80,
    steamAppId: 359550,
    title: "Tom Clancy's Rainbow Six Siege",
    genres: "Шутер, Соревновательная",
    shortDescription: "Штурм и оборона, где стены разбираются по кускам.",
    releaseDate: "1 дек. 2015",
    playtimeMinutes: 1180,
    lastPlayedDaysAgo: 150,
  },
];

const GAMES_BY_ID = new Map(DEMO_LIBRARY.map((game) => [game.id, game]));

function game(id: number): DemoLibraryGame {
  const found = GAMES_BY_ID.get(id);
  if (!found) throw new Error(`demo-fixtures: unknown game #${id}`);
  return found;
}

/* ================= Taste profile ================= */

export interface DemoTag {
  id: number;
  kind: "complaint" | "praise";
  label: string;
  normalized: string;
}

/**
 * The vocabulary of complaints and praise. It wasn't invented apart from the
 * diary: every tag below appears in at least one entry, and the order in the
 * profile is computed from how many games it covers — exactly the way
 * `getTasteProfile` does it.
 */
const TAG_LABELS = {
  openWorld: "открытый мир из галочек",
  grind: "гринд ради цифр",
  crafting: "крафт как обязаловка",
  copyPaste: "копипаст локаций",
  slowStart: "затянутое начало",
  cutscenes: "катсцены без пропуска",
  padded: "растянуто ради часов",
  writing: "живые диалоги",
  levelDesign: "ручной левел-дизайн",
  controls: "отзывчивое управление",
  soundtrack: "саундтрек в такт игре",
  respectsTime: "уважает моё время",
} as const;

type TagKey = keyof typeof TAG_LABELS;

const TAG_KINDS: Record<TagKey, "complaint" | "praise"> = {
  openWorld: "complaint",
  grind: "complaint",
  crafting: "complaint",
  copyPaste: "complaint",
  slowStart: "complaint",
  cutscenes: "complaint",
  padded: "complaint",
  writing: "praise",
  levelDesign: "praise",
  controls: "praise",
  soundtrack: "praise",
  respectsTime: "praise",
};

const TAG_KEYS = Object.keys(TAG_LABELS) as TagKey[];

export const DEMO_TAGS: DemoTag[] = TAG_KEYS.map((key, index) => ({
  id: index + 1,
  kind: TAG_KINDS[key],
  label: TAG_LABELS[key],
  normalized: normalize(TAG_LABELS[key]),
}));

const TAG_BY_KEY = new Map<TagKey, DemoTag>(
  TAG_KEYS.map((key, index) => [key, DEMO_TAGS[index]!])
);

/* ================= Diary ================= */

/** A mention of another game inside an entry: the offset comes from the text itself. */
interface DemoMention {
  surface: string;
  gameId: number;
}

export interface DemoEntry {
  id: number;
  kind: "first" | "update" | "verdict" | "advisor";
  text: string;
  playtimeTotalMinutes: number;
  daysAgo: number;
  verdictAt: string | null;
  ratingAt: number | null;
  tierAt: string | null;
  /** The advisor's question, if the entry was written in answer to it. */
  promptedBy?: string;
  tags?: TagKey[];
  mentions?: DemoMention[];
}

export interface DemoRecord {
  gameId: number;
  verdict: "finished" | "endless" | "playing" | "dropped" | "later" | null;
  tier: "S" | "A" | "B" | "C" | "D" | "F" | null;
  rating: number | null;
  origin: "roulette" | "retro" | "triage" | "demo" | "steam";
  playtimeAtLastEntry: number;
  entries: DemoEntry[];
}

/*
 * The entries were written by someone with a legible taste, and that is the
 * only requirement on the text: a demo stuffed with "great game, recommended"
 * shows neither a taste profile nor an analysis — there would be nothing in
 * them to show.
 */
export const DEMO_RECORDS: DemoRecord[] = [
  {
    /*
     * Carried over from the Steam profile, like several other old single-entry
     * records below. Someone who has been playing for years wrote part of their
     * opinions there first, and the import is what brings them here — a diary
     * where every line was typed into this app would be a demo of an account
     * that started from nothing, which is not how anyone arrives.
     */
    gameId: 1,
    verdict: "finished",
    tier: "S",
    rating: 5,
    origin: "steam",
    playtimeAtLastEntry: 2650,
    entries: [
      {
        id: 101,
        kind: "first",
        text: "Первые часа два бесился: ты просто ходишь и разговариваешь, никакой игры тут нет. Потом дошло, что разговор и есть игра, и всё встало на место. Я не пропустил ни одной реплики, а я обычно проматываю всё подряд. Прошёл на «Электрохимии», понимаю, что видел одну кривую версию сюжета из десяти возможных, и почему-то это не раздражает, а наоборот.",
        playtimeTotalMinutes: 2650,
        daysAgo: 96,
        verdictAt: "finished",
        ratingAt: 5,
        tierAt: "S",
        tags: ["writing"],
      },
    ],
  },
  {
    gameId: 2,
    verdict: "playing",
    tier: "A",
    rating: 4,
    origin: "retro",
    playtimeAtLastEntry: 4200,
    entries: [
      {
        id: 102,
        kind: "first",
        text: "Первый акт — лучшее, что я видел в жанре за много лет. Спутники живые настолько, что я сидел и выбирал, кого взять в отряд, по тому, кого хочу слушать, а не кто больше бьёт. Бои дольше, чем хотелось бы, но пока прощаю.",
        playtimeTotalMinutes: 1980,
        daysAgo: 70,
        verdictAt: "playing",
        ratingAt: 5,
        tierAt: "S",
        tags: ["writing"],
      },
      {
        id: 103,
        kind: "update",
        text: "Уже не прощаю. Третий акт — болото: половина городских квестов собрана по одному шаблону «сходи, поговори, вернись», и всё это чтобы натянуть ещё десяток часов. Диалоги по-прежнему отличные, но между ними всё больше пустого хождения. Похоже, доигрываю уже на автомате.",
        playtimeTotalMinutes: 4200,
        daysAgo: 9,
        verdictAt: "playing",
        ratingAt: 4,
        tierAt: "A",
        promptedBy: "Сорок часов назад ты писал, что прощаешь долгие бои ради спутников. Всё ещё прощаешь?",
        tags: ["padded", "writing"],
      },
    ],
  },
  {
    gameId: 3,
    verdict: "dropped",
    tier: "B",
    rating: 4,
    // Imported from the Steam profile: text and date are theirs, the verdict was set here
    origin: "steam",
    playtimeAtLastEntry: 3720,
    entries: [
      {
        id: 104,
        kind: "first",
        text: "Написано отлично, побочные истории уровня, которого больше нигде нет. Но между ними меня просят зачистить очередной лагерь бандитов и доплыть до вопросика в Скеллиге — и вот на этом я и сдулся. Часов за десять до финала просто перестал запускать. Карта победила сценарий.",
        playtimeTotalMinutes: 3720,
        daysAgo: 210,
        verdictAt: null,
        ratingAt: null,
        tierAt: null,
        tags: ["openWorld", "writing"],
      },
    ],
  },
  {
    gameId: 4,
    verdict: "dropped",
    tier: "C",
    rating: 3,
    origin: "retro",
    playtimeAtLastEntry: 2040,
    entries: [
      {
        id: 105,
        kind: "first",
        text: "Найт-Сити красивый до неприличия, но первые часов пять — сплошные звонки, обучение и разговоры о том, что скоро начнётся дело. Держусь на атмосфере и на Джеки.",
        playtimeTotalMinutes: 900,
        daysAgo: 140,
        verdictAt: "playing",
        ratingAt: 4,
        tierAt: null,
        tags: ["slowStart"],
      },
      {
        id: 106,
        kind: "verdict",
        text: "Всё, удалил. Основной сюжет отличный, но вокруг него одинаковые «преступления в процессе» на каждом втором перекрёстке и склады с одной и той же планировкой. Тридцать часов я чистил карту вместо того, чтобы играть в историю, и в какой-то момент понял, что делаю это уже без удовольствия. Как The Witcher 3: Wild Hunt, только там побочки хотя бы написаны.",
        playtimeTotalMinutes: 2040,
        daysAgo: 118,
        verdictAt: "dropped",
        ratingAt: 3,
        tierAt: "C",
        tags: ["openWorld", "copyPaste"],
        mentions: [{ surface: "The Witcher 3: Wild Hunt", gameId: 3 }],
      },
      {
        id: 107,
        kind: "advisor",
        text: "Ты бросаешь не игры, а карты. В одиннадцати записях из семнадцати причина одна: мир требует работы, а не внимания. Cyberpunk 2077 ты снёс на тридцать четвёртом часу, но основной сюжет в той же записи назвал отличным. Основная линия плюс линия Джуди — это часов двенадцать, ровно твоя длина хорошей игры. Карта при этом ничего не требует: она просто есть, и её можно не трогать.",
        playtimeTotalMinutes: 2040,
        daysAgo: 40,
        verdictAt: null,
        ratingAt: null,
        tierAt: null,
      },
    ],
  },
  {
    gameId: 5,
    verdict: "dropped",
    tier: "C",
    rating: 3,
    origin: "retro",
    playtimeAtLastEntry: 1630,
    entries: [
      {
        id: 108,
        kind: "verdict",
        text: "Боёвка божественная, первые десять часов в Лимгрейве — восторг без оговорок. А дальше начались катакомбы, которые все одинаковые, шахты, которые все одинаковые, и один и тот же босс в трёх разных местах. Открытый мир здесь работает ровно до момента, когда замечаешь, что он собран из повторов. Ушёл, не дойдя до Лейендела.",
        playtimeTotalMinutes: 1630,
        daysAgo: 84,
        verdictAt: "dropped",
        ratingAt: 3,
        tierAt: "C",
        tags: ["openWorld", "copyPaste"],
      },
    ],
  },
  {
    gameId: 6,
    verdict: "finished",
    tier: "S",
    rating: 5,
    origin: "steam",
    playtimeAtLastEntry: 2510,
    entries: [
      {
        id: 109,
        kind: "first",
        text: "Ни одной лишней комнаты за сорок часов. Я запомнил карту наизусть, чего со мной не случалось с детства. Управление такое, что в любой смерти виноват только я, — и поэтому смерти не бесят вообще. Дошёл до Радиантного и на этом честно остановился, дальше уже спорт, а не игра.",
        playtimeTotalMinutes: 2510,
        daysAgo: 175,
        verdictAt: "finished",
        ratingAt: 5,
        tierAt: "S",
        tags: ["levelDesign", "controls"],
      },
    ],
  },
  {
    gameId: 7,
    verdict: "endless",
    tier: "A",
    rating: 5,
    origin: "retro",
    playtimeAtLastEntry: 2280,
    entries: [
      {
        id: 110,
        kind: "first",
        text: "Идеальная игра на «полчаса перед сном», которые каждый раз превращаются в два. Забег занимает двадцать минут, и встать можно в любой момент без чувства, что бросил на середине. И диалоги: двести забегов, а они всё ещё не повторяются — до сих пор не понимаю, как это сделано. Музыка в последней комнате Асфоделя — отдельная причина запускать.",
        playtimeTotalMinutes: 2280,
        daysAgo: 60,
        verdictAt: "endless",
        ratingAt: 5,
        tierAt: "A",
        tags: ["controls", "soundtrack", "respectsTime"],
      },
    ],
  },
  {
    gameId: 8,
    verdict: "finished",
    tier: "A",
    rating: 5,
    origin: "steam",
    playtimeAtLastEntry: 720,
    entries: [
      {
        id: 111,
        kind: "first",
        text: "Двенадцать часов, и ни одна минута не потрачена впустую. Прыжок ощущается идеально, а смерть стоит полсекунды — поэтому четыреста смертей на одной главе не вызывают злости, только упрямство. Саундтрек вытаскивает даже те экраны, где я застревал по часу. B-стороны трогать не стал, мне хватило.",
        playtimeTotalMinutes: 720,
        daysAgo: 150,
        verdictAt: "finished",
        ratingAt: 5,
        tierAt: "A",
        tags: ["controls", "soundtrack", "respectsTime"],
      },
    ],
  },
  {
    gameId: 9,
    verdict: "finished",
    tier: "S",
    rating: 5,
    origin: "steam",
    playtimeAtLastEntry: 540,
    entries: [
      {
        id: 112,
        kind: "first",
        text: "Шесть часов кампании, и в каждой миссии своя идея, которую потом ни разу не переиспользуют. Уровень со сдвигом времени я буду помнить всегда. Вот так и надо: сказали, что хотели сказать, и отпустили.",
        playtimeTotalMinutes: 540,
        daysAgo: 190,
        verdictAt: "finished",
        ratingAt: 5,
        tierAt: "S",
        tags: ["levelDesign", "respectsTime"],
      },
    ],
  },
  {
    gameId: 10,
    verdict: "finished",
    tier: "A",
    rating: 4,
    origin: "steam",
    playtimeAtLastEntry: 1980,
    entries: [
      {
        id: 113,
        kind: "first",
        text: "Ради концовки E стоило вытерпеть маршрут B, где тебя буквально ведут по тем же локациям второй раз, только камера другая. Саундтрек — лучшее, что я слышал в играх, он вытягивает даже пустой заброшенный город. Но город правда пустой, и беготни через него слишком много.",
        playtimeTotalMinutes: 1980,
        daysAgo: 130,
        verdictAt: "finished",
        ratingAt: 4,
        tierAt: "A",
        tags: ["copyPaste", "soundtrack"],
      },
    ],
  },
  {
    gameId: 11,
    verdict: "dropped",
    tier: "D",
    rating: 2,
    origin: "retro",
    playtimeAtLastEntry: 1140,
    entries: [
      {
        id: 114,
        kind: "verdict",
        text: "Первые вечера были волшебные: плывёшь в туман и не знаешь, что там. А потом выяснилось, что игра состоит из того, чтобы стучать по деревьям и возить руду на корабле. Я не против крафта, я против крафта как обязательного налога на всё интересное. Как Terraria, только в четыре раза медленнее.",
        playtimeTotalMinutes: 1140,
        daysAgo: 45,
        verdictAt: "dropped",
        ratingAt: 2,
        tierAt: "D",
        tags: ["crafting", "grind"],
        mentions: [{ surface: "Terraria", gameId: 19 }],
      },
    ],
  },
  {
    gameId: 12,
    verdict: "dropped",
    tier: "C",
    rating: 3,
    origin: "retro",
    playtimeAtLastEntry: 840,
    entries: [
      {
        id: 115,
        kind: "verdict",
        text: "Четырнадцать часов, и по ощущениям я всё ещё в снежном прологе. Каждое действие — анимация на четыре секунды, которую нельзя пропустить: подобрать, освежевать, поговорить, ещё раз поговорить. Понимаю, что дальше великая история, но добираться до неё через это я не готов.",
        playtimeTotalMinutes: 840,
        daysAgo: 30,
        verdictAt: "dropped",
        ratingAt: 3,
        tierAt: "C",
        tags: ["slowStart", "cutscenes", "openWorld"],
      },
    ],
  },
  {
    gameId: 13,
    verdict: "dropped",
    tier: "D",
    rating: 2,
    origin: "retro",
    playtimeAtLastEntry: 480,
    entries: [
      {
        id: 116,
        kind: "verdict",
        text: "Все обещали уют, а я получил таблицу: полить, продать, успеть до конца сезона. К третьему внутриигровому месяцу поймал себя на том, что оптимизирую маршрут по ферме вместо того, чтобы отдыхать. Не моё, при всём уважении к игре.",
        playtimeTotalMinutes: 480,
        daysAgo: 55,
        verdictAt: "dropped",
        ratingAt: 2,
        tierAt: "D",
        tags: ["grind", "crafting"],
      },
    ],
  },
  {
    gameId: 14,
    verdict: "endless",
    tier: "A",
    rating: 5,
    origin: "retro",
    playtimeAtLastEntry: 1560,
    entries: [
      {
        id: 117,
        kind: "first",
        text: "Запускаю, когда не хочу ни во что вкладываться. Забег — сорок минут, проигрыш не стоит ничего, а голова при этом работает всё время. Как Hades, только без разговоров и без сюжета, который жалко бросать на середине. За двадцать шесть часов ни одного повторяющегося расклада.",
        playtimeTotalMinutes: 1560,
        daysAgo: 22,
        verdictAt: "endless",
        ratingAt: 5,
        tierAt: "A",
        tags: ["respectsTime", "controls"],
        mentions: [{ surface: "Hades", gameId: 7 }],
      },
    ],
  },
  {
    /* A quick verdict from the triage queue: no text, but the opinion is on record. */
    gameId: 15,
    verdict: "finished",
    tier: "A",
    rating: 5,
    origin: "triage",
    playtimeAtLastEntry: 410,
    entries: [],
  },
];

/* ================= Contracts and skips ================= */

interface DemoSlot {
  id: number;
  gameId: number;
  playtimeOnStart: number;
  startedDaysAgo: number;
}

const DEMO_SLOTS: DemoSlot[] = [
  { id: 501, gameId: 16, playtimeOnStart: 0, startedDaysAgo: 2 },
  { id: 502, gameId: 17, playtimeOnStart: 0, startedDaysAgo: 5 },
];

interface DemoSkip {
  slotId: number;
  gameId: number;
  reasonType: "legitimate" | "shame";
  reasonText: string;
  daysAgo: number;
}

const DEMO_SKIPS: DemoSkip[] = [
  {
    slotId: 503,
    gameId: 32,
    reasonType: "shame",
    reasonText: "Сто часов JRPG. Я знаю, что она прекрасна, и знаю, что не начну.",
    daysAgo: 112,
  },
  {
    slotId: 504,
    gameId: 30,
    reasonType: "shame",
    reasonText: "Запустил, посмотрел двенадцать минут вступления и закрыл. Стыдно.",
    daysAgo: 74,
  },
];

/* ================= Ready-made sets for the queries ================= */

export const DEMO_ACTIVE_SLOTS: ActiveSlots = DEMO_SLOTS.map((slot) => {
  const target = game(slot.gameId);
  return {
    slot: {
      id: slot.id,
      userId: DEMO_USER_ID,
      gameId: target.id,
      status: "active" as const,
      playtimeOnStart: slot.playtimeOnStart,
      startedAt: at(slot.startedDaysAgo, 19, 30),
    },
    game: {
      id: target.id,
      steamAppId: target.steamAppId,
      title: target.title,
      headerImage: header(target.steamAppId),
    },
    currentPlaytime: target.playtimeMinutes,
  };
});

/** Games held by an active contract: they drop out of the pool. */
const SLOTTED = new Set(DEMO_SLOTS.map((slot) => slot.gameId));
const RECORDED = new Map(DEMO_RECORDS.map((record) => [record.gameId, record]));

/**
 * The roulette pool — the same rules as in `getUnplayedGames`: untouched, not
 * excluded by hand, not software and not held by a contract.
 */
export const DEMO_POOL: UnplayedGames = DEMO_LIBRARY.filter(
  (item) =>
    item.playtimeMinutes <= 15 &&
    !item.excluded &&
    !item.isSoftware &&
    !SLOTTED.has(item.id)
).map((item) => ({
  id: item.id,
  steamAppId: item.steamAppId,
  title: item.title,
  headerImage: header(item.steamAppId),
}));

/**
 * The attention queue. The rules mirror `getAttentionQueue`: first the games
 * with noticeably more playtime since the last entry, then everything played
 * without a verdict.
 */
const DEMO_UPDATES: Extract<AttentionItem, { reason: "update" }>[] = DEMO_RECORDS.flatMap(
  (record) => {
    const target = game(record.gameId);
    const delta = target.playtimeMinutes - record.playtimeAtLastEntry;
    if (delta < 30) return [];

    return [
      {
        reason: "update" as const,
        source: record.origin === "roulette" ? ("slot" as const) : ("game" as const),
        slotId: null,
        gameId: target.id,
        steamAppId: target.steamAppId,
        title: target.title,
        headerImage: header(target.steamAppId),
        currentPlaytime: target.playtimeMinutes,
        lastRecordedPlaytime: record.playtimeAtLastEntry,
        delta,
        existingVerdict: record.verdict,
        existingRating: record.rating,
        existingNote: null,
        existingTier: record.tier,
      },
    ];
  }
).sort((a, b) => b.delta - a.delta);

const DEMO_TRIAGE: Extract<AttentionItem, { reason: "triage" }>[] = DEMO_LIBRARY.filter(
  (item) =>
    !item.isSoftware &&
    item.playtimeMinutes > 20 &&
    !SLOTTED.has(item.id) &&
    RECORDED.get(item.id)?.verdict == null
)
  .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes)
  .map((item) => ({
    reason: "triage" as const,
    gameId: item.id,
    steamAppId: item.steamAppId,
    title: item.title,
    headerImage: header(item.steamAppId),
    playtimeMinutes: item.playtimeMinutes,
    lastPlayedAt:
      item.lastPlayedDaysAgo === null ? null : at(item.lastPlayedDaysAgo, 21).toISOString(),
    hasReview: RECORDED.has(item.id),
  }))
  // First the ones whose text is already written: they are one click short
  .sort((a, b) => Number(b.hasReview) - Number(a.hasReview));

export const DEMO_ATTENTION: AttentionQueue = {
  items: [...DEMO_UPDATES, ...DEMO_TRIAGE],
  triageTotal: DEMO_TRIAGE.length,
};

export const DEMO_TIER_LIST: TierList = DEMO_RECORDS.map((record) => {
  const target = game(record.gameId);
  return {
    gameId: target.id,
    gameTitle: target.title,
    gameImage: header(target.steamAppId),
    steamAppId: target.steamAppId,
    tier: record.tier,
    verdict: record.verdict,
    rating: record.rating,
  };
});

/**
 * The diary feed: entries and skips in one order, newest first — what
 * `getHistory` returns.
 */
export const DEMO_HISTORY: History = (() => {
  const entries: HistoryItem[] = DEMO_RECORDS.flatMap((record) => {
    const target = game(record.gameId);
    let previousTotal = 0;

    return record.entries.map((entry): HistoryItem => {
      const delta = Math.max(0, entry.playtimeTotalMinutes - previousTotal);
      previousTotal = entry.playtimeTotalMinutes;

      return {
        type: "reviewed",
        entryId: entry.id,
        gameId: target.id,
        steamAppId: target.steamAppId,
        gameTitle: target.title,
        gameImage: header(target.steamAppId),
        kind: entry.kind,
        note: entry.text,
        promptedBy: entry.promptedBy ?? null,
        playtimeMinutes: entry.playtimeTotalMinutes,
        deltaMinutes: delta,
        verdict: entry.verdictAt,
        rating: entry.ratingAt,
        tier: entry.tierAt,
        date: at(entry.daysAgo, 22, 10),
        currentVerdict: record.verdict,
        currentRating: record.rating,
        currentTier: record.tier,
        origin: record.origin,
      };
    });
  });

  const skips: HistoryItem[] = DEMO_SKIPS.map((skip) => {
    const target = game(skip.gameId);
    return {
      type: "skipped",
      slotId: skip.slotId,
      gameId: target.id,
      gameTitle: target.title,
      gameImage: header(target.steamAppId),
      reasonType: skip.reasonType,
      reasonText: skip.reasonText,
      date: at(skip.daysAgo, 18, 45),
    };
  });

  return [...entries, ...skips].sort((a, b) => b.date.getTime() - a.date.getTime());
})();

/** The feed for a single game — what the analysis card shows. */
export function demoGameTimeline(gameId: number): GameTimeline {
  const record = RECORDED.get(gameId);
  if (!record) return [];

  let previousTotal = 0;
  return record.entries.map((entry) => {
    const delta = Math.max(0, entry.playtimeTotalMinutes - previousTotal);
    previousTotal = entry.playtimeTotalMinutes;

    return {
      id: entry.id,
      kind: entry.kind,
      text: entry.text,
      playtimeMinutes: entry.playtimeTotalMinutes,
      deltaMinutes: delta,
      verdict: entry.verdictAt,
      rating: entry.ratingAt,
      tier: entry.tierAt,
      createdAt: at(entry.daysAgo, 22, 10),
    };
  });
}

/* ================= Entry markup ================= */

export const DEMO_DIARY_TAGS: DiaryTags = DEMO_RECORDS.flatMap((record) =>
  record.entries.flatMap((entry) =>
    (entry.tags ?? []).map((key) => {
      const tag = TAG_BY_KEY.get(key)!;
      return { entryId: entry.id, tagId: tag.id, label: tag.label, kind: tag.kind };
    })
  )
);

/*
 * The offset of a mention is computed from the text rather than written out as
 * a number: a one-character shift while editing the text means a highlight
 * sliding onto the neighbouring word, and no review catches that by eye.
 */
export const DEMO_DIARY_MENTIONS: DiaryMentions = DEMO_RECORDS.flatMap((record) => {
  const source = game(record.gameId);

  return record.entries.flatMap((entry) =>
    (entry.mentions ?? []).flatMap((mention) => {
      const startOffset = entry.text.indexOf(mention.surface);
      if (startOffset < 0) {
        throw new Error(
          `demo-fixtures: упоминание «${mention.surface}» не найдено в записи #${entry.id}`
        );
      }

      const target = game(mention.gameId);
      return [
        {
          entryId: entry.id,
          surface: mention.surface,
          startOffset,
          targetGameId: target.id,
          targetTitle: target.title,
          targetSteamAppId: target.steamAppId,
          sourceGameId: source.id,
          sourceTitle: source.title,
        },
      ];
    })
  );
});

/**
 * The taste profile: coverage is counted over games, not entries — a tag named
 * five times about one game doesn't become a property of the taste.
 */
export const DEMO_TASTE_PROFILE: TasteTag[] = (() => {
  const gamesByTag = new Map<number, Set<number>>();

  for (const record of DEMO_RECORDS) {
    for (const entry of record.entries) {
      for (const key of entry.tags ?? []) {
        const tag = TAG_BY_KEY.get(key)!;
        const seen = gamesByTag.get(tag.id) ?? new Set<number>();
        seen.add(record.gameId);
        gamesByTag.set(tag.id, seen);
      }
    }
  }

  return DEMO_TAGS.filter((tag) => gamesByTag.has(tag.id))
    .map((tag) => ({
      label: tag.label,
      kind: tag.kind as string,
      games: gamesByTag.get(tag.id)!.size,
    }))
    .sort((a, b) => b.games - a.games);
})();

/* ================= Advice ================= */

/*
 * The portrait is a list of markdown points, not a paragraph.
 *
 * That is the shape the real model returns — the instruction asks it for four
 * to seven points, each backed by named games — and the shape both renderers
 * expect: `parseProfile` splits on newlines and strips the bullet, `RichText`
 * lightens `**the point**` and tints `*a title*`. A single 550-character
 * paragraph passes through both untouched and lands as a grey wall, so the
 * demo was showing less than the product actually produces.
 *
 * Every game named here exists in DEMO_LIBRARY and every claim is checkable
 * against DEMO_RECORDS. An observation about a game the visitor cannot find in
 * the library is the one kind of error that reads as a lie rather than a bug.
 */
const RUN_PROFILE = `- **Ты не бросаешь игры — ты доигрываешь до места, где они начинают повторяться.** В *Cyberpunk 2077* первая запись про атмосферу и Джеки, вторая, двадцатью часами позже, — про склады с одинаковой планировкой. В *ELDEN RING* восторг держался ровно до второй одинаковой шахты. Порог устойчивый: двадцать седьмой и тридцать четвёртый час.
- **Дело не в длине, а в том, кто придумывает следующий час.** Ты спокойно провёл семьдесят часов в *Baldur's Gate 3* и сорок два в *Hollow Knight* — обе длинные. Но там следующий час придумал автор, а в *Valheim* и *Stardew Valley* придумывать приходилось тебе, и обе закрыты до двадцатого часа.
- **Крафт и карта с иконками — для тебя одно и то же раздражение, а не два.** В записях про *Valheim*, *Cyberpunk 2077* и *Red Dead Redemption 2* претензия сформулирована одинаково: игра требует труда, который ничего не добавляет. Слово «налог» ты употребил сам.
- **Тебе важно, чтобы промах был твой.** *Hollow Knight* и *Celeste* описаны почти одними словами — «виноват только я», «смерть стоит полсекунды», — и обе пройдены до конца. Ни одной игры, где исход решают цифры, а не руки, ты не закрыл.
- **Музыку ты отмечаешь только там, где она делает работу.** *Hades*, *Celeste* и *NieR:Automata* — три записи, где саундтрек назван отдельной строкой, и во всех трёх он держит конкретный момент: последняя комната Асфоделя, экран, на котором ты застрял, пустой город. Про красивую музыку в играх, которые не зашли, ты не написал ни разу.
- **Текст — единственное, ради чего ты терпишь долгое.** *Disco Elysium* пройден, хотя первые два часа ты злился, и ты отдельно отметил, что не пропустил ни одной реплики. *Baldur's Gate 3* держит тебя семьдесят часов на спутниках. Как только текста стало меньше — в третьем акте — сразу появилось «доигрываю на автомате».`;

type RunPick = RunWithPicks["items"][number];

interface PickDive {
  /** The deep dive's verdict. The card shows it before the first click. */
  fit: "yes" | "maybe" | "no";
  /**
   * The deep dive's tier. It differs from the first pass exactly when the dive
   * revised it, and the card then says so in its own line — so the two are
   * passed separately on purpose rather than defaulted to each other.
   */
  tier: "S" | "A" | "B" | "C" | "D";
  /** Where the knowledge came from. Silence means the model knows the game. */
  grounding?: "known" | "from-description" | "guess";
}

/**
 * One advice card, filled in from the catalogue.
 *
 * Title, cover and hours are never written out by hand: they exist in the
 * library already, and a second copy would drift — a renamed game would keep
 * its old name on the advice card and nowhere else.
 */
function pick(
  gameId: number,
  tier: "S" | "A" | "B" | "C" | "D",
  reason: string,
  dive: PickDive
): RunPick {
  const target = game(gameId);
  return {
    gameId: target.id,
    steamAppId: target.steamAppId,
    title: target.title,
    headerImage: header(target.steamAppId),
    tier,
    reason,
    grounding: dive.grounding ?? "known",
    deepFit: dive.fit,
    deepTier: dive.tier,
    hours: Math.round((target.playtimeMinutes / 60) * 10) / 10,
  };
}

/*
 * A run is a set of cards, not a top five.
 *
 * The dice rolls between the picks — "the lot is drawn between N pieces of
 * advice" is what the button itself says — so the size of this list is the
 * size of the choice on offer. Five cards meant the dice cycled through the
 * same five games. The tier spread follows the instructions the real model
 * works to: one to three S, up to six A, B for the bulk, and three to eight D,
 * which the dice deliberately skips.
 */
export const DEMO_RUN: RunWithPicks = {
  id: 9001,
  model: "gemini-3.7-flash",
  profile: RUN_PROFILE,
  reviewsUsed: 17,
  candidatesUsed: 48,
  createdAt: at(4, 12, 20),
  items: [
    pick(
      28,
      "S",
      "Забег двадцать минут, проигрыш не стоит ничего, голова работает всё время — ровно то, за что ты держишь Slay the Spire, только темп жёстче. Ни карты, ни крафта, ни прокачки между забегами: злиться будет не на что.",
      { fit: "yes", tier: "S" }
    ),
    pick(
      39,
      "S",
      "Двадцать два часа, в которых нет ни одной цифры: не растёт ни уровень, ни снаряжение, весь прогресс — то, что ты понял сам. Ты поставил S Disco Elysium за «разговор и есть игра»; здесь так же, только вместо разговора устройство планетной системы.",
      { fit: "yes", tier: "S" }
    ),
    pick(
      27,
      "A",
      "Шесть часов, ни одной побочной иконки, каждая локация собрана руками. Про Titanfall 2 ты написал «сказали, что хотели, и отпустили» — здесь ровно тот же договор с игроком.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      29,
      "A",
      "Метроидвания с управлением, за которое ты хвалил Hollow Knight и Celeste, и с музыкой уровня NieR:Automata. Риск один: во второй половине появляются пара заданий на сбор — но их немного, и мимо них можно пройти.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      52,
      "A",
      "Прямое продолжение игры, которой ты поставил S и написал «ни одной лишней комнаты». Ставлю A, а не S, только из-за жалоб на сложность: та же школа, но требований к рукам больше.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      40,
      "A",
      "Детектив, который целиком состоит из внимания к деталям: ни боёв, ни прокачки, четыре часа чистой дедукции. Ты писал, что в Disco Elysium не пропустил ни одной реплики, — здесь пропустить нельзя вообще ничего, иначе не сойдётся.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      31,
      "B",
      "Линейная история без карты — это твоё. Но Red Dead Redemption 2 ты бросил из-за анимаций, которые нельзя пропустить, а здесь темп тоже медленный и катсцен много. Ставлю B честно: сюжет вытянет, если переживёшь первые два часа.",
      // The analysis raised the tier: the card says so with a "B → A" line
      { fit: "yes", tier: "A" }
    ),
    pick(
      46,
      "B",
      "Забег на полчаса с очень отзывчивым управлением — то, за что у тебя стоят пятёрки у Hades и Slay the Spire. Ниже A потому, что прогресс тут всё-таки копится между забегами, а ты про такое писал «гринд ради цифр».",
      { fit: "yes", tier: "B" }
    ),
    pick(
      50,
      "B",
      "Слэшер, где весь уровень двигается в такт музыке: ты трижды отмечал саундтрек отдельной строкой — у Hades, Celeste и NieR:Automata. Ниже A потому, что боёвка проще, чем ты обычно любишь.",
      { fit: "yes", tier: "B" }
    ),
    pick(
      62,
      "B",
      "Прямая предшественница Baldur's Gate 3, которую ты сейчас проходишь: те же бои и те же спутники, но текст суше. Ты уже писал, что третий акт BG3 — болото; здесь болото начинается раньше, во втором акте.",
      { fit: "maybe", tier: "B" }
    ),
    pick(
      30,
      "C",
      "Формально сходится всё: ручные уровни, сильные диалоги отца и сына. Но во второй половине игра открывает озеро с побочными точками и просит перекачивать снаряжение под уровень врагов — по твоим записям это ровно та развилка, на которой ты выходишь.",
      { fit: "maybe", tier: "C" }
    ),
    pick(
      67,
      "D",
      "Не трать время. Это та самая карта из галочек, на которой ты бросил Cyberpunk 2077 и ELDEN RING, только больше в несколько раз: вопросики, аванпосты и уровни снаряжения, без которых сюжет не пускает дальше.",
      { fit: "no", tier: "D" }
    ),
    pick(
      72,
      "D",
      "Не трать время. Про Valheim ты написал, что против крафта как обязательного налога на всё интересное, — здесь этот налог и есть вся игра, и платить его придётся ещё и другим игрокам.",
      { fit: "no", tier: "D" }
    ),
    pick(
      75,
      "D",
      "Не трать время. Шутер, устроенный вокруг цифр на снаряжении, которые обнуляются каждый сезон: «гринд ради цифр» — твоя формулировка из записи про Stardew Valley, и лучше про эту игру не скажешь.",
      { fit: "no", tier: "D" }
    ),
  ],
};

/**
 * The second run, for the "regenerate" button.
 *
 * Not a shuffle of the same cards: a repeat run genuinely lands on other games,
 * because the model re-reads the whole diary and the shelf of untouched games is
 * large enough to be cut a different way. What must not change is the ground —
 * every reason here still leans on the same entries and the same taste tags, or
 * the whole premise of "advice from your own words" falls apart.
 */
/*
 * The second portrait cuts the same diary along different seams — verdicts and
 * numbers rather than mechanics — and names different games in its examples.
 * A repeat run that returns the same observations in different words is the
 * one thing that would give the imitation away.
 */
const RUN_PROFILE_ALT = `- **Мнение об игре у тебя не портится постепенно — оно ломается на одной конкретной механике.** *Baldur's Gate 3* держала пятёрку тридцать три часа и просела до четвёрки к семидесятому, и причина в записи названа точно: не бои и не длина, а городские квесты по шаблону. Ты не устаёшь от игры, ты замечаешь шов.
- **Ни одна игра длиннее сорока пяти часов не дошла у тебя до «пройдено».** Все шесть законченных укладываются в сорок пять часов, и самая долгая из них — *Disco Elysium*. Дальше этой черты ты заходил дважды: *The Witcher 3: Wild Hunt* брошена за десять часов до финала, а в *Baldur's Gate 3* на семидесятом часу появилось «доигрываю на автомате».
- **Ты выбираешь по тому, можно ли из игры выйти.** *Hades* и *Slay the Spire* — твои единственные «бесконечные», и в обеих записях сказано одно и то же: забег кончается, встать можно. При этом *Terraria* и *Counter-Strike 2* наиграны больше почти всего в библиотеке, но о них не написано ни строчки — им нечем кончиться, и сказать про них нечего.
- **Ты не против сложности, ты против того, чтобы её решали часы вместо рук.** *Hollow Knight* пройден до Радиантного, в *Celeste* ты насчитал четыреста смертей на одной главе — и обе хвалишь. А *Stardew Valley* и *Valheim* брошены ровно там, где нужны не руки: «оптимизирую маршрут» и «стучать по деревьям» — твои же слова.
- **Первые два часа решают почти всё.** Записи про *Cyberpunk 2077* и *Red Dead Redemption 2* начинаются с претензии к началу, и обе игры в итоге брошены. Исключение одно: *Disco Elysium*, где ты сам написал, что два часа бесился, а потом «всё встало на место».
- **Оценка у тебя сглажена, а тир — нет.** Средняя оценка по дневнику ровно четыре, двойку ты поставил всего дважды. Зато тиры разведены до краёв: *Disco Elysium*, *Hollow Knight* и *Titanfall 2* в S, *Valheim* и *Stardew Valley* в D. Твой вкус читается по тирам, а не по звёздам.`;

export const DEMO_RUN_ALT: RunWithPicks = {
  id: 9002,
  model: "gemini-3.7-flash",
  profile: RUN_PROFILE_ALT,
  reviewsUsed: 17,
  candidatesUsed: 48,
  // Just now: this is what the "regenerate" button has produced
  createdAt: new Date(NOW - 2 * MINUTE),
  items: [
    pick(
      43,
      "S",
      "Тактика без единого элемента случайности: игра честно показывает, что сделает противник на следующем ходу. Про Hollow Knight ты написал, что в любой смерти виноват только ты, — здесь это доведено до предела, проигрыш всегда твой просчёт.",
      { fit: "yes", tier: "S" }
    ),
    pick(
      41,
      "S",
      "Два часа, и ни одной механики, которая повторяется дважды: каждая комната дома — отдельный приём, который больше не используют. Ты дословно этими словами хвалил Titanfall 2.",
      { fit: "yes", tier: "S" }
    ),
    pick(
      57,
      "A",
      "Фехтование на парированиях, где нельзя откатиться и переждать: чистая проверка рук, без прокачки, которая решает за тебя. ELDEN RING ты бросил из-за повторов в открытом мире — здесь мира нет, есть коридор и боссы.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      42,
      "A",
      "Четыре часа, весь сюжет — разговор двух людей по рации. Disco Elysium у тебя S с формулировкой «разговор и есть игра»; это то же самое, только короче в десять раз и без проверок навыков.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      53,
      "A",
      "Продолжение игры, которой ты поставил A и написал «встать можно в любой момент». Здесь тот же двадцатиминутный забег и те же неповторяющиеся диалоги между ними.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      55,
      "A",
      "Игра целиком состоит из боссов: ни коридоров между ними, ни собирательства, ни прокачки. Ты писал про Celeste, что четыреста смертей не злят, потому что смерть стоит полсекунды, — здесь ровно та же цена ошибки.",
      { fit: "yes", tier: "A" }
    ),
    pick(
      35,
      "B",
      "Восемь часов головоломок и один из лучших текстов в играх — обе твои опоры сразу. Ниже A только потому, что руки здесь почти не нужны, а ты ценишь именно точное управление.",
      { fit: "yes", tier: "B" }
    ),
    pick(
      36,
      "B",
      "Три часа, и ни одной лишней комнаты — та же формулировка, которой ты описал Hollow Knight. Начинать логично с неё, а не сразу со второй части.",
      { fit: "yes", tier: "B" }
    ),
    pick(
      63,
      "B",
      "Открытый мир, но устроенный не как карта с иконками: почти любой квест здесь можно решить разговором, и от выбора реплики зависит исход. Ставлю B из-за возраста — интерфейс и техническое состояние отпугивают.",
      // The dive raises it: the reviews say the writing outweighs the age
      { fit: "yes", tier: "A", grounding: "from-description" }
    ),
    pick(
      59,
      "B",
      "Постановка и полёты сделаны отлично, но это Ubisoft-карта: вышки, склады, случайные преступления на улице. Ты снёс Cyberpunk 2077 ровно за это, так что B здесь — аванс за то, что основная линия короткая.",
      { fit: "maybe", tier: "B" }
    ),
    pick(
      65,
      "C",
      "Отряд, который надо лечить от стресса и терять насовсем. Ты пишешь, что против игр, которые требуют времени вместо умения, — здесь этого много; но сам цикл вылазок короткий, поэтому не D.",
      { fit: "maybe", tier: "C" }
    ),
    pick(
      70,
      "D",
      "Не трать время. Стройка поселений и защита их по радио — это тот самый крафт как обязательный налог, из-за которого ты ушёл из Valheim, только вместо руды здесь мусор.",
      { fit: "no", tier: "D" }
    ),
    pick(
      73,
      "D",
      "Не трать время. Симулятор выживания, где первые часы уходят на инвентарь и еду. Твоя запись про Stardew Valley — «оптимизирую маршрут вместо того, чтобы отдыхать» — описывает и эту игру целиком.",
      { fit: "no", tier: "D" }
    ),
    pick(
      76,
      "D",
      "Не трать время. Огромная песочница, которая не говорит, чем в ней заниматься, и требует сначала натаскать себе денег и людей. Всё, что ты бросал, начиналось примерно так же.",
      { fit: "no", tier: "D", grounding: "from-description" }
    ),
  ],
};

/* ================= Deep analyses ================= */

export interface DemoDeepDive extends DeepDive {
  gameId: number;
  reviewsUsed: number;
}

/**
 * Every piece of advice has an analysis, not just a couple of showcase ones.
 *
 * The analysis button sits on every card without exception, and a visitor will
 * press it on the one that caught them, not on the one we prepared. An analysis
 * without a fixture would have to be assembled from the game's description and
 * the text of the advice — not a lie, but not what anyone presses that button
 * for either.
 */
export const DEMO_DEEP_DIVES: DemoDeepDive[] = [
  {
    gameId: 28,
    fit: "yes",
    tier: "S",
    summary:
      "Покерный рогалик, в котором ты играешь не в покер, а в поломку его правил: джокеры превращают пару двоек в выигрышную комбинацию на шесть знаков.",
    forYou:
      "Партия — двадцать-сорок минут с честной точкой выхода: та же ниша, что Slay the Spire, только короче. Между забегами нет ни прокачки, ни фарма, ни валюты, которую надо копить, — то есть нет ровно того, из-за чего ты ушёл из Valheim и Stardew Valley.",
    against:
      "Визуально это одна и та же таблица от первого забега до последнего. Ты отдельно писал про копипаст локаций — здесь локаций нет вовсе, и если тебе нужен глазу отдых, его тут не будет.",
    complaints: [
      "Поздние ставки требуют знать джокеров наизусть — до этого проигрыши выглядят случайными",
      "Интерфейс мелкий, на телевизоре читается плохо",
      "Патчи баланса ломают любимые сборки между сессиями",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 27,
    fit: "yes",
    tier: "A",
    summary:
      "Шесть часов про кота в городе роботов: одна сплошная рукотворная декорация, ни карты с иконками, ни прокачки, ни инвентаря — идёшь вперёд и смотришь по сторонам.",
    forYou:
      "Про Titanfall 2 ты написал «сказали, что хотели, и отпустили», про Celeste — «двенадцать часов, и ни одна минута не потрачена впустую». Здесь ровно тот же договор, только шесть часов. Ни одной из семи вещей, из-за которых ты бросаешь игры, тут физически нет.",
    against:
      "Игра почти ничего не требует: прыжок срабатывает сам, головоломки решаются с первого взгляда. Ты хвалил Hollow Knight за то, что в каждой смерти виноват только ты, — здесь виноватым быть негде, и если тебе нужно сопротивление материала, его не будет.",
    complaints: [
      "Прыгать можно только в размеченных местах — свободы движения нет вообще",
      "Середина проседает: два эпизода подряд сводятся к беготне по канализации",
      "Шесть часов за полную цену — самая частая претензия в отрицательных отзывах",
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 29,
    fit: "yes",
    tier: "A",
    summary:
      "Метроидвания с очень точным прыжком и оркестровым саундтреком; вторая половина добавляет побеги на время и деревню, которую предлагается достраивать.",
    forYou:
      "Управление того же класса, что ты хвалил у Hollow Knight и Celeste: промах всегда твой и потому не злит. Саундтрек написан под сцену, а не под фон, — ты отдельно отмечал это у NieR:Automata и Hades. Карта плотная, пустых переходов почти нет.",
    against:
      "Улучшения деревни просят собирать ресурсы по уже пройденным локациям — это ровно тот обязательный налог, из-за которого ты ушёл из Valheim. Задания необязательные, но игра подталкивает к ним настойчиво.",
    complaints: [
      "Побеги на время переигрываются с самого начала: одна ошибка стоит пяти минут",
      "Улучшения деревни требуют возвращаться за ресурсами в пройденные зоны",
      "Технические просадки и вылеты — заметная часть отзывов до сих пор про это",
    ],
    reviewsUsed: 40,
  },
  {
    /*
     * The only analysis that argues with the first pass, and it argues fairly:
     * the first judged by the store description, this one read the reviews and
     * found an answer to a specific worry there. The advice keeps tier B — it
     * is the analysis that moves the tier, and the card shows that on its own
     * line.
     */
    gameId: 31,
    fit: "yes",
    tier: "A",
    summary:
      "Линейный сюжетный экшен на пятнадцать часов: коридоры, укрытия и очень сильная актёрская игра. Ремейк игры 2013 года — картинка новая, структура прежняя.",
    forYou:
      "Первый проход поставил B по описанию: «медленный сюжетный экшен» читается ровно как Red Dead Redemption 2, который ты бросил на четырнадцатом часу. Отзывы это опасение не подтверждают, и поэтому оценка выросла. Мешал тебе в RDR2 не темп, а налог на каждое действие — подобрать, освежевать, поговорить, по четыре секунды анимации на всё. Здесь этого нет: лут подбирается мгновенно, карты с иконками нет, побочных занятий нет, пятнадцать часов идут по прямой. Держат их разговоры между делом — то же, за что ты поставил S Disco Elysium и хвалил первый акт Baldur's Gate 3.",
    against:
      "Медленные куски всё-таки есть, просто другие: головоломки с поддонами и лестницами повторяются от начала до конца и ни разу не усложняются. И это ремейк по полной цене при структуре 2013 года — если такое задевает, задевать будет все пятнадцать часов.",
    complaints: [
      "Головоломки с поддонами и лестницами повторяются всю игру без изменений",
      "Стелс ломается о напарников, которых противники демонстративно не замечают",
      "Порт вышел сломанным: долгая компиляция шейдеров и вылеты, часть отзывов до сих пор об этом",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 30,
    fit: "maybe",
    tier: "C",
    summary:
      "Экшен с камерой без единой склейки и с диалогами отца и сына, которые держат всю игру; во второй половине превращается в полуоткрытое озеро с побочными точками.",
    forYou:
      "Текст написан и сыгран так, как ты любишь: твои лучшие оценки стоят там, где игру держит написанное — Disco Elysium, первый акт Baldur's Gate 3. Первые десять часов здесь линейны и поставлены плотно.",
    against:
      "Ты выходишь из игр между двадцатым и тридцать пятым часом — в тот момент, когда появляется карта с точками. Здесь она появляется примерно на пятнадцатом, вместе с просьбой перекачать снаряжение под уровень врагов.",
    complaints: [
      "Одинаковые арены троллей: вместо нового босса — «ещё один» тролль",
      "Прокачка снаряжения с цифрами уровня — механика из лутер-шутеров",
      "Возврат в пройденные локации ради дверей, которые не открывались с первого раза",
    ],
    reviewsUsed: 40,
  },

  /* Remaining picks of the first run. */
  {
    gameId: 39,
    fit: "yes",
    tier: "S",
    summary:
      "Приключение про планетную систему, которая взрывается каждые двадцать две минуты; единственный прогресс — знание в твоей голове.",
    forYou:
      "Здесь нечего качать и нечего собирать: цикл короткий, выйти можно на любом витке. Твоя формула «встать можно в любой момент» из записи про Hades работает и тут, только вместо забега — своя догадка.",
    against:
      "Подсказок игра не даёт вообще. Если сессия прервалась на неделю, возвращаться придётся в собственные заметки — часть игроков на этом и уходит.",
    complaints: [
      "Без записей на бумаге легко потерять нить и ходить кругами",
      "Полёты между планетами требуют ручного управления и раздражают на десятый раз",
      "Одна обязательная сцена с погоней ломает темп всей игры",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 52,
    fit: "yes",
    tier: "A",
    summary:
      "Продолжение Hollow Knight: та же плотность карты, более быстрая героиня и заметно более высокая планка требований.",
    forYou:
      "Ты прошёл первую часть и написал «ни одной лишней комнаты». Структура здесь та же, и претензия про копипаст локаций, которую ты предъявлял ELDEN RING, к ней не относится: повторов нет.",
    against:
      "Сложность выше первой части с самого начала, и жалуются на это чаще всего. Ты доходил до Радиантного, так что руки есть, но первые часы будут злее, чем ты помнишь.",
    complaints: [
      "Ранние боссы бьют больнее, чем в первой части, а лечиться дают меньше",
      "Карта продаётся у торговца — до покупки легко ходить вслепую",
      "Быстрых перемещений мало, и обратная дорога съедает время",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 40,
    fit: "yes",
    tier: "A",
    summary:
      "Детектив на четыре часа: по замершим сценам гибели нужно опознать шестьдесят человек и восстановить, что случилось с кораблём.",
    forYou:
      "Ни боёв, ни прокачки, ни карты — только внимание к деталям, и игра проверяет его честно, по три догадки за раз. Про Disco Elysium ты писал, что не пропустил ни одной реплики; здесь пропустить нельзя ничего, иначе не сойдётся.",
    against:
      "Графика в один бит — то, на чём чаще всего спотыкаются: сцены иногда трудно разобрать глазами, и это не художественный приём, а честная проблема.",
    complaints: [
      "Одноцветная графика утомляет глаза за час-полтора",
      "Часть опознаний решается перебором, а не выводом",
      "Второй раз играть невозможно в принципе — разгадка уже известна",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 46,
    fit: "yes",
    tier: "B",
    summary:
      "Рогалик с очень быстрым фехтованием и метроидванийной картой: смерть отправляет в начало, часть открытых путей остаётся навсегда.",
    forYou:
      "Управление того же класса, что ты хвалил у Hollow Knight: промах всегда твой. Забег — тридцать-сорок минут, ровно тот формат, который ты держишь у Slay the Spire.",
    against:
      "Между забегами копятся постоянные улучшения, и первые часы ощущаются как их фарм. Ты назвал это «гриндом ради цифр» в записи про Stardew Valley — здесь этого меньше, но оно есть.",
    complaints: [
      "Ранние забеги упираются в нехватку постоянных улучшений, а не в умение",
      "Часть оружия объективно сильнее прочего, и выбор сводится к паре сборок",
      "Поздние уровни сложности требуют заучивания карт наизусть",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 50,
    fit: "yes",
    tier: "B",
    summary:
      "Слэшер, в котором весь мир — от вентиляторов до ударов — двигается в такт саундтреку; кампания на десять-двенадцать часов.",
    forYou:
      "Ты трижды отмечал музыку отдельной строкой: у Hades, Celeste и NieR:Automata. Здесь она не фон, а механика, и попадание в такт — это и есть боёвка. Никакой карты и никакого собирательства.",
    against:
      "Боёвка проще, чем у слэшеров, к которым ты привык: набор приёмов небольшой, и к середине он перестаёт расширяться. Плюс несколько эпизодов со скрытностью, которые тормозят темп.",
    complaints: [
      "Скрытные эпизоды выбиваются из ритма и раздражают почти всех",
      "Набор приёмов не растёт со второй трети игры",
      "Юмор очень громкий — либо заходит сразу, либо мешает всю игру",
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 62,
    fit: "maybe",
    tier: "B",
    summary:
      "Партийная RPG на восемьдесят часов с той же боевой системой, из которой выросла Baldur's Gate 3, и с полной свободой в решении квестов.",
    forYou:
      "Спутники и вариативность — то, за что ты держишь BG3. Здесь свободы даже больше: почти любую задачу можно решить не так, как задумано.",
    against:
      "Ты уже пишешь про третий акт BG3, что это болото. Здесь то же самое начинается раньше — на втором акте, — а текста, который тебя там удерживал, заметно меньше: диалоги суше и длиннее.",
    complaints: [
      "Второй акт растянут и завален однотипными боями",
      "Броня двух типов заставляет пересобирать отряд под механику, а не под роль",
      "Финальный акт заметно сырее остальных",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 67,
    fit: "no",
    tier: "D",
    summary:
      "Открытый мир по Древней Греции на сто с лишним часов: вопросики на карте, аванпосты и уровни снаряжения, без которых сюжет не пускает дальше.",
    forYou:
      "Честно — почти ничего. Разве что постановка отдельных сюжетных линий и вид с горы; за это игру и хвалят те, кому она подошла.",
    against:
      "Это ровно та конструкция, на которой ты вышел из Cyberpunk 2077 и ELDEN RING, и в записях ты назвал её дважды одними словами: карта победила сценарий. Здесь карта больше, а сценарий слабее обоих.",
    complaints: [
      "Уровни врагов заставляют зачищать побочное, чтобы продолжить сюжет",
      "Аванпосты и пещеры собраны по одному шаблону на всю карту",
      "Внутриигровой магазин ускорений — прямое признание того, что игра растянута",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 72,
    fit: "no",
    tier: "D",
    summary:
      "Многопользовательское выживание: старт голым на побережье, всё остальное добывается, а построенное регулярно отбирают другие игроки.",
    forYou:
      "Ничего. Единственное совпадение — ощущение первого выхода в незнакомый мир, про которое ты писал в записи про Valheim.",
    against:
      "Ты сформулировал это сам: против крафта как обязательного налога на всё интересное. Здесь налог и есть игра, и платить его надо ещё и в чужом расписании — базу сносят, пока ты на работе.",
    complaints: [
      "Потеря всего нажитого за одну ночь — не исключение, а норма",
      "Новичка отстреливают быстрее, чем он успевает построить дверь",
      "Сотни часов уходят на добычу, а не на то, ради чего добывали",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 75,
    fit: "no",
    tier: "D",
    summary:
      "Шутер-сервис: стрельба отличная, всё вокруг неё построено на цифрах снаряжения, которые обесцениваются с каждым сезоном.",
    forYou:
      "Стрельба здесь действительно одна из лучших в жанре — это признают даже те, кто ушёл. На этом совпадения заканчиваются.",
    against:
      "«Гринд ради цифр» — твоя формулировка из записи про Stardew Valley, и она описывает эту игру целиком. Добавь к этому, что часть купленного сюжета со временем убирают из игры.",
    complaints: [
      "Прогресс сгорает каждый сезон, и качаться надо заново",
      "Сюжетные кампании удаляли из игры уже после покупки",
      "Разобраться в том, что происходит, без сторонних гайдов невозможно",
    ],
    reviewsUsed: 40,
  },

  /* Picks of the second run — the regenerate button has to work the same way. */
  {
    gameId: 43,
    fit: "yes",
    tier: "S",
    summary:
      "Тактика на поле восемь на восемь, где игра заранее показывает каждый ход противника; партия — двадцать-тридцать минут.",
    forYou:
      "Случайности нет вообще: проигрыш всегда просчёт. Ты хвалил Hollow Knight и Celeste одними и теми же словами — «виноват только я», — и здесь это доведено до логического конца. Плюс формат: партия короче твоего вечера.",
    against:
      "Визуально это одна и та же сетка все двадцать часов, и сюжета в привычном смысле нет — а текст для тебя обычно и есть причина остаться.",
    complaints: [
      "Отряды приходится открывать повторными прохождениями",
      "Мелкий масштаб: разобрать, кто есть кто на поле, поначалу трудно",
      "Поздние острова сводятся к паре рабочих связок",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 41,
    fit: "yes",
    tier: "S",
    summary:
      "Два часа в доме, где каждая комната — история одного умершего родственника, рассказанная своей собственной механикой.",
    forYou:
      "Ни одна механика не повторяется дважды: эпизод отыграл своё и больше не встречается. Ты дословно этим хвалил Titanfall 2 — «в каждой миссии своя идея, которую потом ни разу не переиспользуют».",
    against:
      "Игры в привычном смысле тут нет: проиграть невозможно, сопротивления материала ноль. За два часа берут полную цену, и это вторая по частоте претензия.",
    complaints: [
      "Два часа за полную цену — самая частая претензия в отзывах",
      "Проиграть нельзя, вызова нет никакого",
      "Эпизод с рыбным цехом вызывает у части игроков тошноту от качки камеры",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 57,
    fit: "yes",
    tier: "A",
    summary:
      "Фехтование на парированиях в линейной Японии эпохи Сэнгоку: уклоняться нельзя, прокачка почти ничего не решает.",
    forYou:
      "ELDEN RING ты бросил из-за повторов в открытом мире — здесь мира нет, есть коридор с срезками и боссы. Прокачка не спасает: проходит тот, кто выучил ритм, то есть промах всегда твой.",
    against:
      "Порог входа выше всего, что ты играл: первые пять-десять часов уходят на то, чтобы перестать уклоняться по привычке. Часть игроков не переживает этого перелома.",
    complaints: [
      "Первые часы ломают привычки, наработанные в других играх серии",
      "Два-три босса выбиваются по сложности из всей игры",
      "Стелс-участки между боссами пресные и явно вторичны",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 42,
    fit: "yes",
    tier: "A",
    summary:
      "Четыре часа в лесу Вайоминга: смотритель вышки и голос в рации — весь сюжет держится на их разговоре.",
    forYou:
      "Disco Elysium у тебя S с формулировкой «разговор и есть игра». Здесь ровно та же ставка, только короче в десять раз и без проверок навыков — ни одной цифры на экране.",
    against:
      "Финал разочаровывает многих: интрига, которую игра выстраивает три часа, разрешается тише, чем обещала. Если тебе важна отдача в конце, готовься.",
    complaints: [
      "Финал считают скомканным даже те, кому игра понравилась",
      "Ходьбы много, а занятий между разговорами почти нет",
      "Карта и компас работают нарочито неудобно",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 53,
    fit: "yes",
    tier: "A",
    summary:
      "Продолжение Hades: та же структура забега, другая героиня, добавлена подготовка заклинаний перед вылазкой.",
    forYou:
      "Ты поставил первой части A и написал «встать можно в любой момент». Формат не изменился: двадцать минут на забег, диалоги между ними не повторяются.",
    against:
      "Появился сбор ресурсов для заклинаний — небольшой, но это именно тот тип занятия, который ты называешь налогом. И это ранний доступ: часть контента ещё меняется.",
    complaints: [
      "Сбор ресурсов между забегами добавляет обязательной рутины",
      "Ранний доступ: баланс и концовки ещё переписывают",
      "Вторая героиня заметно медленнее, привыкать придётся заново",
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 55,
    fit: "yes",
    tier: "A",
    summary:
      "Игра, состоящая почти целиком из боссов, нарисованных вручную в стилистике мультфильмов тридцатых годов.",
    forYou:
      "Коридоров между боями почти нет, собирательства нет, прокачки нет — только руки. Про Celeste ты написал, что четыреста смертей не злят, потому что смерть стоит полсекунды; здесь цена ошибки такая же.",
    against:
      "Сложность распределена неровно, и пара боссов останавливает надолго. Ещё это игра для геймпада — на клавиатуре жалуются заметно чаще.",
    complaints: [
      "Несколько боссов выбиваются по сложности и стопорят прохождение",
      "Уровни-стрелялки на самолёте нравятся куда меньше остальных",
      "На клавиатуре управление ощутимо хуже, чем на геймпаде",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 35,
    fit: "yes",
    tier: "B",
    summary:
      "Восемь часов головоломок с порталами и один из самых цитируемых текстов в играх; есть отдельная кооперативная кампания.",
    forYou:
      "Обе твои опоры сразу: плотный ручной уровень и текст, ради которого не хочется проматывать. Ни карты, ни побочного, ни прокачки.",
    against:
      "Руки здесь почти не нужны — вся сложность в голове. Ты ценишь точное управление и отзывчивость, а этой игре они просто не требуются.",
    complaints: [
      "Между головоломками много ходьбы по коридорам",
      "Часть решений сводится к поиску единственной белой стены",
      "Кооперативная кампания требует напарника и в одиночку недоступна",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 36,
    fit: "yes",
    tier: "B",
    summary:
      "Три часа, за которые жанр головоломок от первого лица придумали заново; предыстория второй части.",
    forYou:
      "Три часа без единой лишней комнаты — та же формулировка, которой ты описал Hollow Knight. И начинать логично с неё: вторая часть прямо продолжает эту.",
    against:
      "Игра 2007 года, и это заметно: тестовые камеры выглядят одинаково серыми, а последняя треть заметно слабее начала.",
    complaints: [
      "Все камеры выглядят одинаково — визуального разнообразия нет",
      "Финальная часть с побегом слабее основной",
      "Три часа — многие считают это скорее прологом, чем игрой",
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 63,
    fit: "yes",
    tier: "A",
    summary:
      "Ролевая игра в пустоши Мохаве: почти любой конфликт решается разговором, а исход зависит от того, кого ты поддержал.",
    forYou:
      "Первый проход поставил B, опасаясь возраста игры. Отзывы говорят обратное: люди возвращаются к ней спустя пятнадцать лет именно ради текста, и это твоя главная опора — Disco Elysium у тебя S, а первый акт Baldur's Gate 3 ты хвалил за спутников. Открытый мир здесь не карта с иконками: значков нет, есть дороги и разговоры.",
    against:
      "Техническое состояние честно плохое: вылеты в поздней игре — обычное дело, и без сторонних правок многие не доигрывают. Боёвка слабая и остаётся такой до конца.",
    complaints: [
      "Вылеты и зависания в поздней игре без сторонних исправлений",
      "Стрельба ощущается вяло даже по меркам своего времени",
      "Интерфейс и инвентарь рассчитаны на другую эпоху",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 59,
    fit: "maybe",
    tier: "B",
    summary:
      "Экшен про Человека-паука в открытом Манхэттене: отличная постановка основной линии и стандартный набор побочных занятий вокруг неё.",
    forYou:
      "Полёты на паутине — лучшее ощущение движения в жанре, а основная линия короткая и поставлена плотно. Её одну можно пройти часов за пятнадцать.",
    against:
      "Всё остальное — вышки, склады и случайные преступления на улицах, то есть ровно то, за что ты снёс Cyberpunk 2077 со словами «чистил карту вместо того, чтобы играть в историю».",
    complaints: [
      "Побочные задания повторяются почти без изменений",
      "Обязательные эпизоды за других персонажей ломают темп",
      "Открытый мир существует ради заполнения, а не ради истории",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 65,
    fit: "maybe",
    tier: "C",
    summary:
      "Мрачный рогалик про отряд наёмников, которых игра методично изматывает: стресс, болезни и смерть без возврата.",
    forYou:
      "Одна вылазка — двадцать-тридцать минут, и выйти можно между ними. Решения жёсткие и внятные, случайность видна честно.",
    against:
      "Между вылазками надо лечить, нанимать и копить — это время, а не умение. Ты писал ровно об этом про Stardew Valley: «оптимизирую маршрут вместо того, чтобы отдыхать».",
    complaints: [
      "Между вылазками много обязательной возни в городе",
      "Случайные промахи при 95% решают исход боя чаще, чем хотелось бы",
      "Поздняя игра требует нескольких равных отрядов, то есть фарма",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 70,
    fit: "no",
    tier: "D",
    summary:
      "Открытый мир в пустоши с обязательной стройкой поселений и радиовызовами, которые не заканчиваются никогда.",
    forYou:
      "Стрельба заметно лучше, чем в предыдущих частях серии, — это единственное, что хвалят почти все.",
    against:
      "Стройка и защита поселений — тот самый крафт как обязательный налог, из-за которого ты ушёл из Valheim, только вместо руды здесь мусор. Диалоги при этом сведены к четырём вариантам ответа, а текст — твоя главная причина терпеть длинное.",
    complaints: [
      "Радио бесконечно шлёт однотипные задания на защиту поселений",
      "Четыре варианта ответа в диалоге вместо реального выбора",
      "Сортировка мусора ради стройки занимает больше времени, чем сюжет",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 73,
    fit: "no",
    tier: "D",
    summary:
      "Изометрический симулятор выживания в зомби-апокалипсисе, устроенный вокруг голода, ран, настроения и очень медленной смерти.",
    forYou:
      "Ничего существенного. Первые часы дают ту же тревогу неизвестности, что ты описывал в записи про Valheim, — на этом всё.",
    against:
      "Игра целиком состоит из обслуживания персонажа: еда, вода, температура, инвентарь. Твоя фраза про Stardew Valley — «оптимизирую маршрут вместо того, чтобы отдыхать» — описывает её точнее любого отзыва.",
    complaints: [
      "Смерть окончательная, и сотня часов пропадает за одну ошибку",
      "Управление и инвентарь освоить без гайдов почти невозможно",
      "Часы уходят на быт, а не на события",
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 76,
    fit: "no",
    tier: "D",
    summary:
      "Средневековая песочница с боями на сотни солдат и полностью открытой картой, которая не ставит перед игроком никакой цели.",
    forYou:
      "Сами бои действительно уникальны: ничего похожего по масштабу в твоей библиотеке нет.",
    against:
      "Игра не говорит, чем в ней заниматься, и первые часы уходят на караваны и накопление денег. Всё, что ты бросал — Valheim, Stardew Valley, ELDEN RING, — начиналось примерно так же: сначала работа, потом, может быть, интересное.",
    complaints: [
      "Сюжетная линия обрывается и фактически не завершена",
      "Первые часы — торговля и накопление, а не бои",
      "Осады однообразны, несмотря на масштаб",
    ],
    reviewsUsed: 38,
  },
];

/* ================= Game demos ================= */

/**
 * Opinions on game demos live in a list of their own: the game isn't in the
 * library, yet the impression exists — usually a trace of the latest festival.
 */
export const DEMO_DEMOS: DemoReviews = [
  {
    gameId: 901,
    steamAppId: 1809540,
    title: "Nine Sols",
    headerImage: header(1809540),
    verdict: "later",
    tier: "A",
    rating: 5,
    createdAt: at(12, 21, 15),
    note: "Парирование ощущается почти как в Sekiro, и рисовка держит внимание сама по себе. Двадцать минут демо — и я уже хочу полную версию.",
  },
  {
    gameId: 902,
    steamAppId: 813230,
    title: "ANIMAL WELL",
    headerImage: header(813230),
    verdict: "later",
    tier: "S",
    rating: 5,
    createdAt: at(13, 20, 40),
    note: "За полчаса ни одного слова текста, и при этом понятно всё: куда идти, что нельзя трогать, где я что-то пропустил. Вот это и есть ручной левел-дизайн.",
  },
  {
    gameId: 903,
    steamAppId: 2231450,
    title: "Pizza Tower",
    headerImage: header(2231450),
    verdict: "dropped",
    tier: "B",
    rating: 3,
    createdAt: at(13, 20, 5),
    note: "Скорость приятная, управление отзывчивое, но шум и мельтешение на экране такие, что через десять минут я устал сильнее, чем за час Celeste.",
  },
];

/* ================= Statistics ================= */

export const DEMO_FREE_SKIPS: FreeSkips = {
  available: 2,
  earned: 5,
  used: 3,
  reviewedCount: 15,
};

export const DEMO_STATS: Stats = (() => {
  const totalGames = DEMO_RECORDS.length;
  const totalMinutes = DEMO_RECORDS.reduce(
    (sum, record) => sum + record.playtimeAtLastEntry,
    0
  );
  const rated = DEMO_RECORDS.filter((record) => record.rating != null);
  const byVerdict = (verdict: string) =>
    DEMO_RECORDS.filter((record) => record.verdict === verdict).length;

  return {
    totalGames,
    totalMinutes,
    avgMinutes: totalGames > 0 ? Math.round(totalMinutes / totalGames) : 0,
    // A streak of days with entries — short in the demo, and that's honest
    streak: 3,
    wallOfShame: DEMO_SKIPS.filter((skip) => skip.reasonType === "shame").map(
      (skip) => game(skip.gameId).title
    ),
    totalLibrary: DEMO_LIBRARY.length,
    poolSize: DEMO_POOL.length,
    excludedCount: DEMO_LIBRARY.filter((item) => item.excluded).length,
    activeCount: DEMO_SLOTS.length,
    skippedCount: DEMO_SKIPS.length,
    steamCount: DEMO_RECORDS.filter((record) => record.origin === "steam").length,
    finishedCount: byVerdict("finished"),
    endlessCount: byVerdict("endless"),
    droppedCount: byVerdict("dropped"),
    playingCount: byVerdict("playing"),
    laterCount: byVerdict("later"),
    avgRating:
      rated.length > 0
        ? Math.round(
            (rated.reduce((sum, record) => sum + (record.rating ?? 0), 0) / rated.length) * 10
          ) / 10
        : 0,
  };
})();

export const DEMO_REVIEW_COUNT = DEMO_RECORDS.length;

/* ================= Chronology ================= */

/**
 * A session as the tracker would have seen it: `[days ago, hour, minute,
 * wall-clock minutes, minutes from Steam's counter, game id]`.
 *
 * The schedule is an evening one with a couple of late-night runs and long
 * weekends, and not for looks: the heatmap, the night hours and the streak in
 * the statistics show exactly that difference, and on uniform noise all three
 * come out looking equally empty.
 */
const SESSION_LOG: [number, number, number, number, number, number][] = [
  [29, 21, 10, 132, 128, 2],
  [29, 23, 40, 45, 44, 18],
  [28, 20, 5, 96, 94, 2],
  [27, 22, 15, 52, 50, 14],
  [26, 19, 50, 145, 141, 2],
  [25, 21, 30, 66, 64, 18],
  [24, 20, 40, 118, 115, 2],
  [23, 23, 5, 38, 36, 14],
  [22, 14, 20, 175, 170, 21],
  [22, 21, 0, 88, 86, 2],
  [21, 15, 10, 210, 205, 2],
  [21, 22, 50, 41, 40, 14],
  [20, 20, 20, 74, 72, 7],
  [19, 21, 45, 105, 102, 2],
  [18, 0, 20, 58, 56, 18],
  [18, 20, 0, 92, 90, 2],
  [17, 22, 10, 63, 61, 7],
  [16, 19, 30, 156, 152, 2],
  [15, 13, 40, 128, 124, 6],
  [15, 21, 20, 97, 95, 2],
  [14, 23, 30, 44, 42, 14],
  [13, 20, 50, 110, 108, 2],
  [12, 21, 5, 72, 70, 18],
  [11, 19, 40, 134, 130, 2],
  [10, 22, 35, 55, 53, 7],
  [9, 20, 15, 168, 163, 2],
  [8, 1, 5, 36, 34, 14],
  [8, 20, 45, 84, 82, 25],
  [7, 21, 25, 121, 118, 2],
  [6, 14, 50, 142, 138, 21],
  [6, 22, 0, 49, 47, 18],
  [5, 20, 10, 99, 96, 2],
  [4, 21, 50, 47, 45, 14],
  [3, 19, 55, 143, 140, 2],
  [2, 0, 40, 51, 49, 18],
  [2, 22, 20, 68, 66, 7],
  [1, 20, 30, 115, 112, 2],
  [1, 23, 50, 33, 31, 14],
];

const DEMO_SESSIONS: TrackedSession[] = SESSION_LOG.map(
  ([daysAgo, hour, minute, minutes, gainMinutes, gameId]) => {
    const startedAt = at(daysAgo, hour, minute);
    return {
      gameId,
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * MINUTE),
      minutes,
      gainMinutes,
    };
  }
);

/**
 * An open session — "playing right now". It is what makes the demo worth
 * seeing live: the interface has a line about the current game, and showing it
 * empty would be a waste.
 */
const DEMO_LIVE_SESSION: TrackedSession = {
  gameId: 2,
  startedAt: new Date(NOW - 47 * MINUTE),
  endedAt: null,
  minutes: 47,
  // Steam's counter hasn't confirmed the running session yet — as really happens
  gainMinutes: 0,
};

/**
 * A gain with no session: someone played while the status poll saw nothing — a
 * private profile, invisible mode, something launched offline.
 */
const DEMO_GAINS: TrackedGain[] = [
  { gameId: 2, takenAt: at(26, 18, 5), minutes: 34 },
  { gameId: 21, takenAt: at(20, 12, 30), minutes: 62 },
  { gameId: 18, takenAt: at(13, 9, 15), minutes: 28 },
  { gameId: 19, takenAt: at(7, 16, 40), minutes: 45 },
  { gameId: 22, takenAt: at(3, 11, 20), minutes: 51 },
];

const TRACKED_GAMES: TrackedGame[] = [
  ...new Set([
    ...DEMO_SESSIONS.map((session) => session.gameId),
    DEMO_LIVE_SESSION.gameId,
    ...DEMO_GAINS.map((gain) => gain.gameId),
  ]),
].map((id) => {
  const target = game(id);
  return {
    id: target.id,
    title: target.title,
    image: header(target.steamAppId),
    steamAppId: target.steamAppId,
  };
});

export const DEMO_TRACKER: TrackerData = {
  since: at(29, 21, 10),
  sessions: [...DEMO_SESSIONS, DEMO_LIVE_SESSION],
  gains: DEMO_GAINS,
  games: TRACKED_GAMES,
  playingNow: DEMO_LIVE_SESSION,
};

/**
 * History from before the tracker — hours reconstructed from the diary. They
 * know the date but not the hour, so they live in a block of their own and
 * never reach the heatmap.
 */
export const DEMO_PRE_TRACKER: PreTracker = (() => {
  /** The month key `2026-04` — derived from the current date, like everything else. */
  function monthKey(monthsAgo: number): string {
    const date = new Date(Date.UTC(new Date(NOW).getUTCFullYear(), new Date(NOW).getUTCMonth(), 1));
    date.setUTCMonth(date.getUTCMonth() - monthsAgo);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const monthMinutes = [2400, 3100, 4120, 2650, 3400, 2100];

  return {
    totalMinutes: 17770,
    from: at(240, 12),
    to: at(31, 12),
    games: [
      { title: game(3).title, minutes: 3720 },
      { title: game(1).title, minutes: 2650 },
      { title: game(6).title, minutes: 2510 },
      { title: game(4).title, minutes: 2040 },
      { title: game(10).title, minutes: 1980 },
      { title: game(5).title, minutes: 1630 },
      { title: game(11).title, minutes: 1140 },
      { title: game(12).title, minutes: 840 },
      { title: game(8).title, minutes: 720 },
      { title: game(9).title, minutes: 540 },
    ],
    months: monthMinutes
      .map((minutes, index) => ({ key: monthKey(index + 2), minutes }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
})();

/* ================= Everything together ================= */

/**
 * A single entry point for the demo page. The named exports above stay: seeding
 * a test account takes the raw entries, while the landing page needs only the
 * ready-made sets for its components.
 */
export const DEMO = {
  userId: DEMO_USER_ID,
  user: DEMO_USER,
  library: DEMO_LIBRARY,
  records: DEMO_RECORDS,
  tags: DEMO_TAGS,
  slots: DEMO_ACTIVE_SLOTS,
  pool: DEMO_POOL,
  attention: DEMO_ATTENTION,
  tierList: DEMO_TIER_LIST,
  history: DEMO_HISTORY,
  diaryTags: DEMO_DIARY_TAGS,
  diaryMentions: DEMO_DIARY_MENTIONS,
  taste: DEMO_TASTE_PROFILE,
  recommendations: DEMO_RUN,
  /** The second run, shown after "regenerate". Same shape, other games. */
  recommendationsAlt: DEMO_RUN_ALT,
  deepDives: DEMO_DEEP_DIVES,
  demos: DEMO_DEMOS,
  stats: DEMO_STATS,
  freeSkips: DEMO_FREE_SKIPS,
  reviewCount: DEMO_REVIEW_COUNT,
  tracker: DEMO_TRACKER,
  preTracker: DEMO_PRE_TRACKER,
  sessions: DEMO_TRACKER.sessions,
} as const;
