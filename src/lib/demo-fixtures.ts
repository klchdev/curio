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
 *
 * Every piece of prose is stored in both languages at once and resolved in one
 * place — `demoFixtures(locale)`. The locale arrives with the request while the
 * fixtures are module constants, so the language cannot be baked into a
 * constant; and a second file holding an English copy would drift on the first
 * edit, with the visitor noticing before the author does. Keeping the pair on
 * adjacent lines is what keeps the two halves honest with each other.
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
import type { Locale } from "./i18n";

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
export type DemoRun = NonNullable<Awaited<ReturnType<typeof getLatestRecommendations>>>;

/**
 * A negative id, so the demo user can't collide with a real one under any
 * circumstances: `users.id` in the database is a serial and is always > 0.
 */
export const DEMO_USER_ID = -1;

/* ================= Bilingual prose ================= */

/** A line of the demo's prose, kept in both languages side by side. */
export interface Localized {
  ru: string;
  en: string;
}

/** Picks the half of a bilingual line the current request asked for. */
function say(value: Localized, locale: Locale): string {
  return value[locale];
}

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

/** The demo player, minus the name: that one line depends on who is reading. */
const DEMO_USERNAME: Localized = { ru: "Кирилл", en: "Kirill" };

function demoUser(locale: Locale): SessionUser {
  return {
    id: DEMO_USER_ID,
    steamId: "76561197960287930",
    username: say(DEMO_USERNAME, locale),
    avatarUrl: null,
    lastLibrarySync: new Date(NOW - 3 * 60 * MINUTE),
  };
}

/* ================= Library ================= */

/**
 * A game in the demo player's library: a snapshot of the `games` row together
 * with their personal `user_games` row. No reason to split the two — in the
 * demo the relation is one to one.
 *
 * Titles are not translated, and neither are they localizable: a game is called
 * what the store calls it, in every language.
 */
interface RawLibraryGame {
  id: number;
  steamAppId: number;
  title: string;
  genres: Localized;
  shortDescription: Localized;
  releaseDate: Localized;
  playtimeMinutes: number;
  /** When it was last launched; null — never launched at all. */
  lastPlayedDaysAgo: number | null;
  isSoftware?: boolean;
  /** Excluded from the pool by hand: "won't run", "no headset". */
  excluded?: boolean;
}

/** The same game once the request's language is known. */
export interface DemoLibraryGame extends Omit<RawLibraryGame, "genres" | "shortDescription" | "releaseDate"> {
  genres: string;
  shortDescription: string;
  releaseDate: string;
}

/*
 * The library is built around one legible taste rather than "as many genres as
 * possible": the demo has to read like somebody's real account. Hence the
 * spread of playtime too — from untouched to a hundred and fifty hours in a
 * shooter someone has been dropping into "for half an hour" for three years.
 */
const LIBRARY: RawLibraryGame[] = [
  {
    id: 1,
    steamAppId: 632470,
    title: "Disco Elysium - The Final Cut",
    genres: { ru: "RPG, Приключение", en: "RPG, Adventure" },
    shortDescription: {
      ru: "Детектив с разрушенной психикой расследует убийство в умирающем городе.",
      en: "A detective with a wrecked mind works a murder case in a dying city.",
    },
    releaseDate: { ru: "15 окт. 2019", en: "15 Oct 2019" },
    playtimeMinutes: 2650,
    lastPlayedDaysAgo: 96,
  },
  {
    id: 2,
    steamAppId: 1086940,
    title: "Baldur's Gate 3",
    genres: { ru: "RPG, Стратегия, Приключение", en: "RPG, Strategy, Adventure" },
    shortDescription: {
      ru: "Партийная ролевая игра по правилам D&D с пошаговыми боями.",
      en: "A party RPG by the D&D rules, with turn-based fights.",
    },
    releaseDate: { ru: "3 авг. 2023", en: "3 Aug 2023" },
    playtimeMinutes: 4380,
    lastPlayedDaysAgo: 0,
  },
  {
    id: 3,
    steamAppId: 292030,
    title: "The Witcher 3: Wild Hunt",
    genres: { ru: "RPG, Экшен, Открытый мир", en: "RPG, Action, Open world" },
    shortDescription: {
      ru: "Ведьмак ищет приёмную дочь в мире, где побочные истории сильнее основной.",
      en: "A witcher hunts for his adopted daughter in a world where the side stories beat the main one.",
    },
    releaseDate: { ru: "18 мая 2015", en: "18 May 2015" },
    playtimeMinutes: 3720,
    lastPlayedDaysAgo: 210,
  },
  {
    id: 4,
    steamAppId: 1091500,
    title: "Cyberpunk 2077",
    genres: { ru: "RPG, Экшен, Открытый мир", en: "RPG, Action, Open world" },
    shortDescription: {
      ru: "Наёмник в Найт-Сити живёт с чужой личностью в голове.",
      en: "A mercenary in Night City lives with somebody else's personality in his head.",
    },
    releaseDate: { ru: "10 дек. 2020", en: "10 Dec 2020" },
    playtimeMinutes: 2040,
    lastPlayedDaysAgo: 118,
  },
  {
    id: 5,
    steamAppId: 1245620,
    title: "ELDEN RING",
    genres: { ru: "RPG, Экшен, Открытый мир", en: "RPG, Action, Open world" },
    shortDescription: {
      ru: "Открытый мир от авторов Dark Souls, собранный из подземелий и боссов.",
      en: "An open world from the Dark Souls team, assembled out of dungeons and bosses.",
    },
    releaseDate: { ru: "25 фев. 2022", en: "25 Feb 2022" },
    playtimeMinutes: 1630,
    lastPlayedDaysAgo: 84,
  },
  {
    id: 6,
    steamAppId: 367520,
    title: "Hollow Knight",
    genres: { ru: "Метроидвания, Платформер", en: "Metroidvania, Platformer" },
    shortDescription: {
      ru: "Молчаливый рыцарь спускается в разрушенное королевство насекомых.",
      en: "A silent knight descends into a ruined kingdom of insects.",
    },
    releaseDate: { ru: "24 фев. 2017", en: "24 Feb 2017" },
    playtimeMinutes: 2510,
    lastPlayedDaysAgo: 15,
  },
  {
    id: 7,
    steamAppId: 1145360,
    title: "Hades",
    genres: { ru: "Рогалик, Экшен", en: "Roguelike, Action" },
    shortDescription: {
      ru: "Сын Аида раз за разом сбегает из подземного царства.",
      en: "The son of Hades breaks out of the underworld, over and over.",
    },
    releaseDate: { ru: "17 сен. 2020", en: "17 Sep 2020" },
    playtimeMinutes: 2280,
    lastPlayedDaysAgo: 2,
  },
  {
    id: 8,
    steamAppId: 504230,
    title: "Celeste",
    genres: { ru: "Платформер", en: "Platformer" },
    shortDescription: {
      ru: "Девушка поднимается на гору и разбирается с собой по дороге.",
      en: "A girl climbs a mountain and sorts herself out on the way up.",
    },
    releaseDate: { ru: "25 янв. 2018", en: "25 Jan 2018" },
    playtimeMinutes: 720,
    lastPlayedDaysAgo: 150,
  },
  {
    id: 9,
    steamAppId: 1237970,
    title: "Titanfall 2",
    genres: { ru: "Шутер, Экшен", en: "Shooter, Action" },
    shortDescription: {
      ru: "Шестичасовая кампания, где каждая миссия придумана заново.",
      en: "A six-hour campaign where every mission is invented from scratch.",
    },
    releaseDate: { ru: "18 июн. 2020", en: "18 Jun 2020" },
    playtimeMinutes: 540,
    lastPlayedDaysAgo: 190,
  },
  {
    id: 10,
    steamAppId: 524220,
    title: "NieR:Automata",
    genres: { ru: "Экшен, RPG", en: "Action, RPG" },
    shortDescription: {
      ru: "Андроиды воюют с машинами и постепенно перестают понимать зачем.",
      en: "Androids fight machines and slowly stop understanding what for.",
    },
    releaseDate: { ru: "17 мар. 2017", en: "17 Mar 2017" },
    playtimeMinutes: 1980,
    lastPlayedDaysAgo: 130,
  },
  {
    id: 11,
    steamAppId: 892970,
    title: "Valheim",
    genres: { ru: "Выживание, Открытый мир, Крафт", en: "Survival, Open world, Crafting" },
    shortDescription: {
      ru: "Викинги строят базы и добывают руду в процедурном чистилище.",
      en: "Vikings build bases and mine ore in a procedural purgatory.",
    },
    releaseDate: { ru: "2 фев. 2021", en: "2 Feb 2021" },
    playtimeMinutes: 1140,
    lastPlayedDaysAgo: 45,
  },
  {
    id: 12,
    steamAppId: 1174180,
    title: "Red Dead Redemption 2",
    genres: { ru: "Экшен, Открытый мир, Приключение", en: "Action, Open world, Adventure" },
    shortDescription: {
      ru: "Закат банды разбойников на границе уходящего Дикого Запада.",
      en: "The last days of an outlaw gang on the edge of a vanishing Wild West.",
    },
    releaseDate: { ru: "5 дек. 2019", en: "5 Dec 2019" },
    playtimeMinutes: 840,
    lastPlayedDaysAgo: 30,
  },
  {
    id: 13,
    steamAppId: 413150,
    title: "Stardew Valley",
    genres: { ru: "Симулятор, RPG", en: "Simulation, RPG" },
    shortDescription: {
      ru: "Наследство в виде заросшей фермы и целая деревня соседей.",
      en: "An overgrown farm for an inheritance and a whole village of neighbours.",
    },
    releaseDate: { ru: "26 фев. 2016", en: "26 Feb 2016" },
    playtimeMinutes: 480,
    lastPlayedDaysAgo: 55,
  },
  {
    id: 14,
    steamAppId: 646570,
    title: "Slay the Spire",
    genres: { ru: "Карточная, Рогалик", en: "Card game, Roguelike" },
    shortDescription: {
      ru: "Колода собирается по дороге наверх и разваливается на боссе.",
      en: "The deck comes together on the way up and falls apart on the boss.",
    },
    releaseDate: { ru: "23 янв. 2019", en: "23 Jan 2019" },
    playtimeMinutes: 1560,
    lastPlayedDaysAgo: 1,
  },
  {
    id: 15,
    steamAppId: 391540,
    title: "Undertale",
    genres: { ru: "RPG, Приключение", en: "RPG, Adventure" },
    shortDescription: {
      ru: "RPG, в которой можно не убить никого — и она это заметит.",
      en: "An RPG where you can kill nobody at all — and it notices.",
    },
    releaseDate: { ru: "15 сен. 2015", en: "15 Sep 2015" },
    playtimeMinutes: 410,
    lastPlayedDaysAgo: 240,
  },

  /* Taken on right now — contracts on untouched games. */
  {
    id: 16,
    steamAppId: 1627720,
    title: "Lies of P",
    genres: { ru: "Экшен, RPG", en: "Action, RPG" },
    shortDescription: {
      ru: "Souls-like по мотивам «Пиноккио» в декорациях бель эпок.",
      en: "A souls-like on the bones of Pinocchio, dressed as the belle époque.",
    },
    releaseDate: { ru: "19 сен. 2023", en: "19 Sep 2023" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 17,
    steamAppId: 460950,
    title: "Katana ZERO",
    genres: { ru: "Экшен, Платформер", en: "Action, Platformer" },
    shortDescription: {
      ru: "Убийца с катаной переигрывает секунду до тех пор, пока не выживет.",
      en: "An assassin with a katana replays the same second until he survives it.",
    },
    releaseDate: { ru: "18 апр. 2019", en: "18 Apr 2019" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },

  /* Played a fair amount, not a word said about it — that's the triage queue. */
  {
    id: 18,
    steamAppId: 730,
    title: "Counter-Strike 2",
    genres: { ru: "Шутер, Соревновательная", en: "Shooter, Competitive" },
    shortDescription: {
      ru: "Тактический шутер, в который заходят «на один катки».",
      en: "A tactical shooter people drop into “for one match”.",
    },
    releaseDate: { ru: "21 авг. 2012", en: "21 Aug 2012" },
    playtimeMinutes: 9840,
    lastPlayedDaysAgo: 2,
  },
  {
    id: 19,
    steamAppId: 105600,
    title: "Terraria",
    genres: { ru: "Песочница, Приключение", en: "Sandbox, Adventure" },
    shortDescription: {
      ru: "Двумерная песочница, где копают вниз до самого ада.",
      en: "A two-dimensional sandbox where you dig down as far as hell.",
    },
    releaseDate: { ru: "16 мая 2011", en: "16 May 2011" },
    playtimeMinutes: 3300,
    lastPlayedDaysAgo: 7,
  },
  {
    id: 20,
    steamAppId: 271590,
    title: "Grand Theft Auto V",
    genres: { ru: "Экшен, Открытый мир", en: "Action, Open world" },
    shortDescription: {
      ru: "Три преступника и один очень большой город.",
      en: "Three criminals and one very large city.",
    },
    releaseDate: { ru: "14 апр. 2015", en: "14 Apr 2015" },
    playtimeMinutes: 2100,
    lastPlayedDaysAgo: 320,
  },
  {
    id: 21,
    steamAppId: 582010,
    title: "Monster Hunter: World",
    genres: { ru: "Экшен, RPG, Кооператив", en: "Action, RPG, Co-op" },
    shortDescription: {
      ru: "Охота на огромных зверей ради их же деталей на броню.",
      en: "Hunting enormous beasts for the parts that become your armour.",
    },
    releaseDate: { ru: "9 авг. 2018", en: "9 Aug 2018" },
    playtimeMinutes: 1180,
    lastPlayedDaysAgo: 6,
  },
  {
    id: 22,
    steamAppId: 427520,
    title: "Factorio",
    genres: { ru: "Стратегия, Симулятор", en: "Strategy, Simulation" },
    shortDescription: {
      ru: "Завод должен расти. Завод всегда должен расти.",
      en: "The factory must grow. The factory must always grow.",
    },
    releaseDate: { ru: "14 авг. 2020", en: "14 Aug 2020" },
    playtimeMinutes: 890,
    lastPlayedDaysAgo: 3,
  },
  {
    id: 23,
    steamAppId: 594650,
    title: "Hunt: Showdown 1896",
    genres: { ru: "Шутер, Выживание", en: "Shooter, Survival" },
    shortDescription: {
      ru: "Медленный шутер, где выстрел слышно на пол-карты.",
      en: "A slow shooter where one shot is heard across half the map.",
    },
    releaseDate: { ru: "27 авг. 2019", en: "27 Aug 2019" },
    playtimeMinutes: 640,
    lastPlayedDaysAgo: 62,
  },
  {
    id: 24,
    steamAppId: 255710,
    title: "Cities: Skylines",
    genres: { ru: "Симулятор, Стратегия", en: "Simulation, Strategy" },
    shortDescription: {
      ru: "Градостроительный симулятор с честными пробками.",
      en: "A city builder with honest traffic jams.",
    },
    releaseDate: { ru: "10 мар. 2015", en: "10 Mar 2015" },
    playtimeMinutes: 520,
    lastPlayedDaysAgo: 145,
  },
  {
    id: 25,
    steamAppId: 601150,
    title: "Devil May Cry 5",
    genres: { ru: "Экшен", en: "Action" },
    shortDescription: {
      ru: "Слэшер, где за стиль начисляют буквы.",
      en: "A character action game that grades your style with letters.",
    },
    releaseDate: { ru: "8 мар. 2019", en: "8 Mar 2019" },
    playtimeMinutes: 300,
    lastPlayedDaysAgo: 8,
  },
  {
    id: 26,
    steamAppId: 1229490,
    title: "ULTRAKILL",
    genres: { ru: "Шутер, Экшен", en: "Shooter, Action" },
    shortDescription: {
      ru: "Скоростной шутер про машину, которая пьёт кровь.",
      en: "A high-speed shooter about a machine that drinks blood.",
    },
    releaseDate: { ru: "3 сен. 2020", en: "3 Sep 2020" },
    playtimeMinutes: 95,
    lastPlayedDaysAgo: 40,
  },

  /* Untouched — this is what the roulette pool and the advice are built from. */
  {
    id: 27,
    steamAppId: 1332010,
    title: "Stray",
    genres: { ru: "Приключение", en: "Adventure" },
    shortDescription: {
      ru: "Кот в городе роботов ищет дорогу наверх.",
      en: "A cat in a city of robots looks for the way up.",
    },
    releaseDate: { ru: "19 июл. 2022", en: "19 Jul 2022" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 28,
    steamAppId: 2379780,
    title: "Balatro",
    genres: { ru: "Карточная, Рогалик", en: "Card game, Roguelike" },
    shortDescription: {
      ru: "Покерный рогалик, в котором правила покера ломают джокерами.",
      en: "A poker roguelike where jokers break the rules of poker.",
    },
    releaseDate: { ru: "20 фев. 2024", en: "20 Feb 2024" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 29,
    steamAppId: 1057090,
    title: "Ori and the Will of the Wisps",
    genres: { ru: "Платформер, Метроидвания", en: "Platformer, Metroidvania" },
    shortDescription: {
      ru: "Метроидвания с рисованными фонами и очень точным прыжком.",
      en: "A metroidvania with painted backdrops and a very precise jump.",
    },
    releaseDate: { ru: "11 мар. 2020", en: "11 Mar 2020" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 30,
    steamAppId: 1593500,
    title: "God of War",
    genres: { ru: "Экшен, Приключение", en: "Action, Adventure" },
    shortDescription: {
      ru: "Кратос и его сын идут развеять прах по скандинавским мирам.",
      en: "Kratos and his son cross the Norse worlds to scatter some ashes.",
    },
    releaseDate: { ru: "14 янв. 2022", en: "14 Jan 2022" },
    playtimeMinutes: 12,
    lastPlayedDaysAgo: 74,
  },
  {
    id: 31,
    steamAppId: 1888930,
    title: "The Last of Us Part I",
    genres: { ru: "Экшен, Приключение", en: "Action, Adventure" },
    shortDescription: {
      ru: "Контрабандист везёт девочку через мёртвую Америку.",
      en: "A smuggler drives a girl across a dead America.",
    },
    releaseDate: { ru: "28 мар. 2023", en: "28 Mar 2023" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 32,
    steamAppId: 1687950,
    title: "Persona 5 Royal",
    genres: { ru: "RPG, Приключение", en: "RPG, Adventure" },
    shortDescription: {
      ru: "Школьники днём, воры сердец ночью — на сотню часов.",
      en: "Schoolkids by day, thieves of hearts by night — for a hundred hours.",
    },
    releaseDate: { ru: "21 окт. 2022", en: "21 Oct 2022" },
    playtimeMinutes: 8,
    lastPlayedDaysAgo: 112,
  },
  {
    id: 33,
    steamAppId: 546560,
    title: "Half-Life: Alyx",
    genres: { ru: "Шутер, VR", en: "Shooter, VR" },
    shortDescription: {
      ru: "Шутер во вселенной Half-Life, который работает только в VR.",
      en: "A shooter in the Half-Life universe that only runs in VR.",
    },
    releaseDate: { ru: "23 мар. 2020", en: "23 Mar 2020" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
    // The headset was sold the year before last — removed from the pool by hand
    excluded: true,
  },
  {
    id: 34,
    steamAppId: 431960,
    title: "Wallpaper Engine",
    genres: { ru: "Утилиты", en: "Utilities" },
    shortDescription: {
      ru: "Живые обои на рабочий стол.",
      en: "Live wallpapers for your desktop.",
    },
    releaseDate: { ru: "16 нояб. 2018", en: "16 Nov 2018" },
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
    genres: { ru: "Головоломка, Приключение", en: "Puzzle, Adventure" },
    shortDescription: {
      ru: "Головоломки с порталами и лучший комический дуэт в играх.",
      en: "Portal puzzles and the best comedy double act in games.",
    },
    releaseDate: { ru: "19 апр. 2011", en: "19 Apr 2011" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 36,
    steamAppId: 400,
    title: "Portal",
    genres: { ru: "Головоломка", en: "Puzzle" },
    shortDescription: {
      ru: "Три часа, за которые жанр придумали заново.",
      en: "Three hours that reinvented the genre.",
    },
    releaseDate: { ru: "10 окт. 2007", en: "10 Oct 2007" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 37,
    steamAppId: 220,
    title: "Half-Life 2",
    genres: { ru: "Шутер, Приключение", en: "Shooter, Adventure" },
    shortDescription: {
      ru: "Шутер, который рассказывает историю, ни разу не отняв управление.",
      en: "A shooter that tells its story without ever taking the controls away.",
    },
    releaseDate: { ru: "16 нояб. 2004", en: "16 Nov 2004" },
    playtimeMinutes: 14,
    lastPlayedDaysAgo: 300,
  },
  {
    id: 38,
    steamAppId: 304430,
    title: "INSIDE",
    genres: { ru: "Платформер, Приключение", en: "Platformer, Adventure" },
    shortDescription: {
      ru: "Четыре часа без единого слова и без единой лишней сцены.",
      en: "Four hours without a single word and without a single wasted scene.",
    },
    releaseDate: { ru: "7 июл. 2016", en: "7 Jul 2016" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 39,
    steamAppId: 753640,
    title: "Outer Wilds",
    genres: { ru: "Приключение, Головоломка", en: "Adventure, Puzzle" },
    shortDescription: {
      ru: "Двадцать две минуты до взрыва солнца и целая система, которую надо понять.",
      en: "Twenty-two minutes until the sun blows up and a whole system to work out.",
    },
    releaseDate: { ru: "18 июн. 2020", en: "18 Jun 2020" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 40,
    steamAppId: 653530,
    title: "Return of the Obra Dinn",
    genres: { ru: "Головоломка, Приключение", en: "Puzzle, Adventure" },
    shortDescription: {
      ru: "Страховой инспектор восстанавливает судьбу шестидесяти человек по одной сцене каждого.",
      en: "An insurance inspector reconstructs the fate of sixty people from one frozen scene each.",
    },
    releaseDate: { ru: "18 окт. 2018", en: "18 Oct 2018" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 41,
    steamAppId: 501300,
    title: "What Remains of Edith Finch",
    genres: { ru: "Приключение", en: "Adventure" },
    shortDescription: {
      ru: "Дом, в котором каждая комната рассказывает, как умер её хозяин.",
      en: "A house where every room tells you how its owner died.",
    },
    releaseDate: { ru: "25 апр. 2017", en: "25 Apr 2017" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 42,
    steamAppId: 383870,
    title: "Firewatch",
    genres: { ru: "Приключение", en: "Adventure" },
    shortDescription: {
      ru: "Смотритель леса и голос в рации на всё лето.",
      en: "A fire lookout and a voice on the radio for a whole summer.",
    },
    releaseDate: { ru: "9 фев. 2016", en: "9 Feb 2016" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 43,
    steamAppId: 590380,
    title: "Into the Breach",
    genres: { ru: "Стратегия, Тактика", en: "Strategy, Tactics" },
    shortDescription: {
      ru: "Тактика, где виден каждый следующий ход противника.",
      en: "Tactics where every move the enemy is about to make is on the table.",
    },
    releaseDate: { ru: "27 фев. 2018", en: "27 Feb 2018" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 44,
    steamAppId: 212680,
    title: "FTL: Faster Than Light",
    genres: { ru: "Стратегия, Рогалик", en: "Strategy, Roguelike" },
    shortDescription: {
      ru: "Корабль, экипаж и очень длинная дорога, которую редко проходят.",
      en: "A ship, a crew and a very long road that few people finish.",
    },
    releaseDate: { ru: "14 сен. 2012", en: "14 Sep 2012" },
    playtimeMinutes: 6,
    lastPlayedDaysAgo: 260,
  },
  {
    id: 45,
    steamAppId: 736260,
    title: "Baba Is You",
    genres: { ru: "Головоломка", en: "Puzzle" },
    shortDescription: {
      ru: "Головоломка, в которой правила лежат на поле и их можно двигать.",
      en: "A puzzle game where the rules lie on the board and you can push them around.",
    },
    releaseDate: { ru: "13 мар. 2019", en: "13 Mar 2019" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 46,
    steamAppId: 588650,
    title: "Dead Cells",
    genres: { ru: "Рогалик, Экшен, Метроидвания", en: "Roguelike, Action, Metroidvania" },
    shortDescription: {
      ru: "Рогалик с очень быстрым фехтованием и без сохранений.",
      en: "A roguelike with very fast swordplay and no saves.",
    },
    releaseDate: { ru: "7 авг. 2018", en: "7 Aug 2018" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 47,
    steamAppId: 311690,
    title: "Enter the Gungeon",
    genres: { ru: "Рогалик, Экшен", en: "Roguelike, Action" },
    shortDescription: {
      ru: "Пулевой ад, собранный из шуток про оружие.",
      en: "Bullet hell built out of jokes about guns.",
    },
    releaseDate: { ru: "5 апр. 2016", en: "5 Apr 2016" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 48,
    steamAppId: 632360,
    title: "Risk of Rain 2",
    genres: { ru: "Рогалик, Экшен", en: "Roguelike, Action" },
    shortDescription: {
      ru: "Забег, в котором сложность растёт сама, пока ты стоишь.",
      en: "A run where the difficulty climbs on its own while you stand still.",
    },
    releaseDate: { ru: "11 авг. 2020", en: "11 Aug 2020" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 49,
    steamAppId: 1794680,
    title: "Vampire Survivors",
    genres: { ru: "Рогалик, Экшен", en: "Roguelike, Action" },
    shortDescription: {
      ru: "Пятнадцать минут, одна кнопка и экран, забитый до предела.",
      en: "Fifteen minutes, one button and a screen packed to the edges.",
    },
    releaseDate: { ru: "20 окт. 2022", en: "20 Oct 2022" },
    playtimeMinutes: 11,
    lastPlayedDaysAgo: 180,
  },
  {
    id: 50,
    steamAppId: 1817230,
    title: "Hi-Fi RUSH",
    genres: { ru: "Экшен, Ритм", en: "Action, Rhythm" },
    shortDescription: {
      ru: "Слэшер, в котором весь мир двигается в такт саундтреку.",
      en: "A brawler where the entire world moves in time with the soundtrack.",
    },
    releaseDate: { ru: "25 янв. 2023", en: "25 Jan 2023" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 51,
    steamAppId: 782330,
    title: "DOOM Eternal",
    genres: { ru: "Шутер, Экшен", en: "Shooter, Action" },
    shortDescription: {
      ru: "Шутер, который не даёт стоять на месте ни секунды.",
      en: "A shooter that won't let you stand still for a second.",
    },
    releaseDate: { ru: "20 мар. 2020", en: "20 Mar 2020" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 52,
    steamAppId: 1030300,
    title: "Hollow Knight: Silksong",
    genres: { ru: "Метроидвания, Платформер", en: "Metroidvania, Platformer" },
    shortDescription: {
      ru: "Продолжение, которого ждали семь лет.",
      en: "The sequel people waited seven years for.",
    },
    releaseDate: { ru: "4 сен. 2025", en: "4 Sep 2025" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 53,
    steamAppId: 1145350,
    title: "Hades II",
    genres: { ru: "Рогалик, Экшен", en: "Roguelike, Action" },
    shortDescription: {
      ru: "Та же формула забега, только ведьма и другой пантеон.",
      en: "The same run, only with a witch and a different pantheon.",
    },
    releaseDate: { ru: "6 мая 2024", en: "6 May 2024" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 54,
    steamAppId: 387290,
    title: "Ori and the Blind Forest: Definitive Edition",
    genres: { ru: "Платформер, Метроидвания", en: "Platformer, Metroidvania" },
    shortDescription: {
      ru: "Первая часть: рисованный лес и очень точный прыжок.",
      en: "The first one: a painted forest and a very precise jump.",
    },
    releaseDate: { ru: "11 мар. 2016", en: "11 Mar 2016" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 55,
    steamAppId: 268910,
    title: "Cuphead",
    genres: { ru: "Экшен, Платформер", en: "Action, Platformer" },
    shortDescription: {
      ru: "Рисованные боссы тридцатых годов и очень мало права на ошибку.",
      en: "Hand-drawn thirties bosses and very little room for error.",
    },
    releaseDate: { ru: "29 сен. 2017", en: "29 Sep 2017" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 56,
    steamAppId: 2050650,
    title: "Resident Evil 4",
    genres: { ru: "Экшен, Хоррор", en: "Action, Horror" },
    shortDescription: {
      ru: "Ремейк, где инвентарь — это отдельная головоломка.",
      en: "A remake where the inventory is a puzzle of its own.",
    },
    releaseDate: { ru: "24 мар. 2023", en: "24 Mar 2023" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 57,
    steamAppId: 814380,
    title: "Sekiro: Shadows Die Twice",
    genres: { ru: "Экшен, Приключение", en: "Action, Adventure" },
    shortDescription: {
      ru: "Фехтование на парированиях, где уклоняться нельзя.",
      en: "Swordplay built on parries, where dodging is not an option.",
    },
    releaseDate: { ru: "22 мар. 2019", en: "22 Mar 2019" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 58,
    steamAppId: 374320,
    title: "DARK SOULS III",
    genres: { ru: "Экшен, RPG", en: "Action, RPG" },
    shortDescription: {
      ru: "Souls без открытого мира: коридоры, срезки и костры.",
      en: "Souls without the open world: corridors, shortcuts and bonfires.",
    },
    releaseDate: { ru: "11 апр. 2016", en: "11 Apr 2016" },
    playtimeMinutes: 9,
    lastPlayedDaysAgo: 220,
  },
  {
    id: 59,
    steamAppId: 1817070,
    title: "Marvel's Spider-Man Remastered",
    genres: { ru: "Экшен, Открытый мир", en: "Action, Open world" },
    shortDescription: {
      ru: "Полёты на паутине по Манхэттену и очень много вышек.",
      en: "Web-swinging across Manhattan and a great many towers.",
    },
    releaseDate: { ru: "12 авг. 2022", en: "12 Aug 2022" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 60,
    steamAppId: 1113560,
    title: "NieR Replicant ver.1.22474487139...",
    genres: { ru: "Экшен, RPG", en: "Action, RPG" },
    shortDescription: {
      ru: "Предыстория Automata: та же музыка, та же беготня.",
      en: "The prequel to Automata: the same music, the same running about.",
    },
    releaseDate: { ru: "23 апр. 2021", en: "23 Apr 2021" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 61,
    steamAppId: 1172380,
    title: "STAR WARS Jedi: Fallen Order",
    genres: { ru: "Экшен, Приключение", en: "Action, Adventure" },
    shortDescription: {
      ru: "Souls-lite по «Звёздным войнам» с картой, в которой легко потеряться.",
      en: "A souls-lite in the Star Wars universe, with a map that is easy to get lost in.",
    },
    releaseDate: { ru: "15 нояб. 2019", en: "15 Nov 2019" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 62,
    steamAppId: 435150,
    title: "Divinity: Original Sin 2",
    genres: { ru: "RPG, Стратегия", en: "RPG, Strategy" },
    shortDescription: {
      ru: "Партийная RPG, из которой выросла Baldur's Gate 3.",
      en: "The party RPG that Baldur's Gate 3 grew out of.",
    },
    releaseDate: { ru: "14 сен. 2017", en: "14 Sep 2017" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 63,
    steamAppId: 22380,
    title: "Fallout: New Vegas",
    genres: { ru: "RPG, Экшен", en: "RPG, Action" },
    shortDescription: {
      ru: "Пустошь, где почти каждый квест решается разговором.",
      en: "A wasteland where almost every quest can be settled by talking.",
    },
    releaseDate: { ru: "19 окт. 2010", en: "19 Oct 2010" },
    playtimeMinutes: 13,
    lastPlayedDaysAgo: 340,
  },
  {
    id: 64,
    steamAppId: 379430,
    title: "Kingdom Come: Deliverance",
    genres: { ru: "RPG, Открытый мир", en: "RPG, Open world" },
    shortDescription: {
      ru: "Средневековая Богемия без магии и с очень упрямым фехтованием.",
      en: "Medieval Bohemia with no magic and very stubborn swordplay.",
    },
    releaseDate: { ru: "13 фев. 2018", en: "13 Feb 2018" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 65,
    steamAppId: 262060,
    title: "Darkest Dungeon",
    genres: { ru: "Рогалик, Стратегия", en: "Roguelike, Strategy" },
    shortDescription: {
      ru: "Отряд героев, которых игра методично доводит до нервного срыва.",
      en: "A party of heroes the game methodically drives to a breakdown.",
    },
    releaseDate: { ru: "19 янв. 2016", en: "19 Jan 2016" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 66,
    steamAppId: 1888160,
    title: "ARMORED CORE VI FIRES OF RUBICON",
    genres: { ru: "Экшен", en: "Action" },
    shortDescription: {
      ru: "Роботы, собираемые по деталям, и боссы на проверку сборки.",
      en: "Robots assembled part by part, and bosses that test the build.",
    },
    releaseDate: { ru: "25 авг. 2023", en: "25 Aug 2023" },
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
    genres: { ru: "Экшен, RPG, Открытый мир", en: "Action, RPG, Open world" },
    shortDescription: {
      ru: "Древняя Греция размером с настоящую и вопросики по всей карте.",
      en: "Ancient Greece at something like real scale, with question marks all over the map.",
    },
    releaseDate: { ru: "5 окт. 2018", en: "5 Oct 2018" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 68,
    steamAppId: 552520,
    title: "Far Cry 5",
    genres: { ru: "Шутер, Открытый мир", en: "Shooter, Open world" },
    shortDescription: {
      ru: "Монтана, секта и аванпосты, которые зачищаются по одному шаблону.",
      en: "Montana, a cult, and outposts that all clear the same way.",
    },
    releaseDate: { ru: "27 мар. 2018", en: "27 Mar 2018" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 69,
    steamAppId: 990080,
    title: "Hogwarts Legacy",
    genres: { ru: "RPG, Открытый мир", en: "RPG, Open world" },
    shortDescription: {
      ru: "Хогвартс и очень много сундуков вокруг него.",
      en: "Hogwarts and a very great many chests around it.",
    },
    releaseDate: { ru: "10 фев. 2023", en: "10 Feb 2023" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 70,
    steamAppId: 377160,
    title: "Fallout 4",
    genres: { ru: "RPG, Открытый мир, Крафт", en: "RPG, Open world, Crafting" },
    shortDescription: {
      ru: "Пустошь, в которой надо строить поселения и защищать их по радио.",
      en: "A wasteland where you build settlements and defend them on radio call.",
    },
    releaseDate: { ru: "10 нояб. 2015", en: "10 Nov 2015" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 71,
    steamAppId: 275850,
    title: "No Man's Sky",
    genres: { ru: "Выживание, Приключение, Открытый мир", en: "Survival, Adventure, Open world" },
    shortDescription: {
      ru: "Восемнадцать квинтиллионов планет и один цикл добычи ресурсов.",
      en: "Eighteen quintillion planets and one resource-gathering loop.",
    },
    releaseDate: { ru: "12 авг. 2016", en: "12 Aug 2016" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 72,
    steamAppId: 252490,
    title: "Rust",
    genres: { ru: "Выживание, Крафт", en: "Survival, Crafting" },
    shortDescription: {
      ru: "Голым на побережье, и всё остальное надо добыть.",
      en: "Naked on a shoreline, and everything else has to be scavenged.",
    },
    releaseDate: { ru: "8 фев. 2018", en: "8 Feb 2018" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 73,
    steamAppId: 108600,
    title: "Project Zomboid",
    genres: { ru: "Выживание, Крафт, RPG", en: "Survival, Crafting, RPG" },
    shortDescription: {
      ru: "Симулятор того, как ты умрёшь во время зомби-апокалипсиса.",
      en: "A simulator of how you are going to die in the zombie apocalypse.",
    },
    releaseDate: { ru: "8 нояб. 2013", en: "8 Nov 2013" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 74,
    steamAppId: 526870,
    title: "Satisfactory",
    genres: { ru: "Симулятор, Крафт, Выживание", en: "Simulation, Crafting, Survival" },
    shortDescription: {
      ru: "Завод на чужой планете, который надо строить руками от первого лица.",
      en: "A factory on somebody else's planet, built by hand in first person.",
    },
    releaseDate: { ru: "10 сен. 2024", en: "10 Sep 2024" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 75,
    steamAppId: 1085660,
    title: "Destiny 2",
    genres: { ru: "Шутер, MMO", en: "Shooter, MMO" },
    shortDescription: {
      ru: "Шутер, в котором цифры на снаряжении растут каждый сезон.",
      en: "A shooter where the numbers on your gear go up every season.",
    },
    releaseDate: { ru: "1 окт. 2019", en: "1 Oct 2019" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },
  {
    id: 76,
    steamAppId: 261550,
    title: "Mount & Blade II: Bannerlord",
    genres: { ru: "RPG, Стратегия, Открытый мир", en: "RPG, Strategy, Open world" },
    shortDescription: {
      ru: "Средневековая песочница, где надо самому придумать себе занятие.",
      en: "A medieval sandbox where finding something to do is your own job.",
    },
    releaseDate: { ru: "25 окт. 2022", en: "25 Oct 2022" },
    playtimeMinutes: 0,
    lastPlayedDaysAgo: null,
  },

  /* Played a fair bit and never written about — more fuel for the triage queue. */
  {
    id: 77,
    steamAppId: 550,
    title: "Left 4 Dead 2",
    genres: { ru: "Шутер, Кооператив", en: "Shooter, Co-op" },
    shortDescription: {
      ru: "Четверо, дробовики и очень много зомби.",
      en: "Four people, shotguns and a very great many zombies.",
    },
    releaseDate: { ru: "17 нояб. 2009", en: "17 Nov 2009" },
    playtimeMinutes: 780,
    lastPlayedDaysAgo: 96,
  },
  {
    id: 78,
    steamAppId: 440,
    title: "Team Fortress 2",
    genres: { ru: "Шутер, Кооператив", en: "Shooter, Co-op" },
    shortDescription: {
      ru: "Девять классов и восемнадцать лет шляп.",
      en: "Nine classes and eighteen years of hats.",
    },
    releaseDate: { ru: "10 окт. 2007", en: "10 Oct 2007" },
    playtimeMinutes: 1420,
    lastPlayedDaysAgo: 410,
  },
  {
    id: 79,
    steamAppId: 227300,
    title: "Euro Truck Simulator 2",
    genres: { ru: "Симулятор", en: "Simulation" },
    shortDescription: {
      ru: "Дорога, радио и груз, который надо довезти к утру.",
      en: "The road, the radio and a load that has to be there by morning.",
    },
    releaseDate: { ru: "18 окт. 2012", en: "18 Oct 2012" },
    playtimeMinutes: 940,
    lastPlayedDaysAgo: 58,
  },
  {
    id: 80,
    steamAppId: 359550,
    title: "Tom Clancy's Rainbow Six Siege",
    genres: { ru: "Шутер, Соревновательная", en: "Shooter, Competitive" },
    shortDescription: {
      ru: "Штурм и оборона, где стены разбираются по кускам.",
      en: "Attack and defence, with walls that come apart piece by piece.",
    },
    releaseDate: { ru: "1 дек. 2015", en: "1 Dec 2015" },
    playtimeMinutes: 1180,
    lastPlayedDaysAgo: 150,
  },
];

const GAMES_BY_ID = new Map(LIBRARY.map((item) => [item.id, item]));

function game(id: number): RawLibraryGame {
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
 *
 * The advice quotes these labels back at the player word for word, so a label
 * edited here has to be chased through the reasons and the deep dives.
 */
const TAG_LABELS = {
  openWorld: { ru: "открытый мир из галочек", en: "an open world of checkboxes" },
  grind: { ru: "гринд ради цифр", en: "grinding for numbers" },
  crafting: { ru: "крафт как обязаловка", en: "crafting as a chore" },
  copyPaste: { ru: "копипаст локаций", en: "copy-pasted locations" },
  slowStart: { ru: "затянутое начало", en: "a slow start" },
  cutscenes: { ru: "катсцены без пропуска", en: "unskippable cutscenes" },
  padded: { ru: "растянуто ради часов", en: "padded out for hours" },
  writing: { ru: "живые диалоги", en: "dialogue that's alive" },
  levelDesign: { ru: "ручной левел-дизайн", en: "hand-made level design" },
  controls: { ru: "отзывчивое управление", en: "responsive controls" },
  soundtrack: { ru: "саундтрек в такт игре", en: "a soundtrack in step with the game" },
  respectsTime: { ru: "уважает моё время", en: "respects my time" },
} satisfies Record<string, Localized>;

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

function demoTags(locale: Locale): DemoTag[] {
  return TAG_KEYS.map((key, index) => {
    const label = say(TAG_LABELS[key], locale);
    return { id: index + 1, kind: TAG_KINDS[key], label, normalized: normalize(label) };
  });
}

/** The tag id is the position in the vocabulary and does not depend on language. */
const TAG_ID = new Map<TagKey, number>(TAG_KEYS.map((key, index) => [key, index + 1]));

/* ================= Diary ================= */

/**
 * A mention of another game inside an entry: the offset comes from the text
 * itself. The surface is a title, so it reads the same in both languages — only
 * the offset moves.
 */
interface DemoMention {
  surface: string;
  gameId: number;
}

interface RawEntry {
  id: number;
  kind: "first" | "update" | "verdict" | "advisor";
  text: Localized;
  playtimeTotalMinutes: number;
  daysAgo: number;
  verdictAt: string | null;
  ratingAt: number | null;
  tierAt: string | null;
  /** The advisor's question, if the entry was written in answer to it. */
  promptedBy?: Localized;
  tags?: TagKey[];
  mentions?: DemoMention[];
}

export interface DemoEntry extends Omit<RawEntry, "text" | "promptedBy"> {
  text: string;
  promptedBy?: string;
}

interface RawRecord {
  gameId: number;
  verdict: "finished" | "endless" | "playing" | "dropped" | "later" | null;
  tier: "S" | "A" | "B" | "C" | "D" | "F" | null;
  rating: number | null;
  origin: "roulette" | "retro" | "triage" | "demo" | "steam";
  playtimeAtLastEntry: number;
  entries: RawEntry[];
}

export interface DemoRecord extends Omit<RawRecord, "entries"> {
  entries: DemoEntry[];
}

/*
 * The entries were written by someone with a legible taste, and that is the
 * only requirement on the text: a demo stuffed with "great game, recommended"
 * shows neither a taste profile nor an analysis — there would be nothing in
 * them to show.
 *
 * The advice quotes these entries directly, and the quotes have to survive
 * translation: an English reason citing an English entry must repeat it word
 * for word, or the demo shows a model misquoting itself.
 */
const RECORDS: RawRecord[] = [
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
        text: {
          ru: "Первые часа два бесился: ты просто ходишь и разговариваешь, никакой игры тут нет. Потом дошло, что разговор и есть игра, и всё встало на место. Я не пропустил ни одной реплики, а я обычно проматываю всё подряд. Прошёл на «Электрохимии», понимаю, что видел одну кривую версию сюжета из десяти возможных, и почему-то это не раздражает, а наоборот.",
          en: "The first two hours I was furious: you just walk around and talk, there's no game here. Then it clicked that the conversation is the game, and everything fell into place. I didn't skip a single line, and I normally skim everything. Finished it on Electrochemistry, and I know I saw one crooked version of the story out of ten possible ones, and somehow that doesn't annoy me — quite the opposite.",
        },
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
        text: {
          ru: "Первый акт — лучшее, что я видел в жанре за много лет. Спутники живые настолько, что я сидел и выбирал, кого взять в отряд, по тому, кого хочу слушать, а не кто больше бьёт. Бои дольше, чем хотелось бы, но пока прощаю.",
          en: "Act one is the best thing I've seen in the genre in years. The companions are so alive that I sat there picking the party by who I wanted to listen to, not by who hits hardest. The fights run longer than I'd like, but I'm forgiving that for now.",
        },
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
        text: {
          ru: "Уже не прощаю. Третий акт — болото: половина городских квестов собрана по одному шаблону «сходи, поговори, вернись», и всё это чтобы натянуть ещё десяток часов. Диалоги по-прежнему отличные, но между ними всё больше пустого хождения. Похоже, доигрываю уже на автомате.",
          en: "Not forgiving it any more. Act three is a swamp: half the city quests are built to one template — go there, talk, come back — and all of it to stretch out another ten hours. The dialogue is still excellent, but there's more and more empty walking between the lines. Looks like I'm finishing it on autopilot.",
        },
        playtimeTotalMinutes: 4200,
        daysAgo: 9,
        verdictAt: "playing",
        ratingAt: 4,
        tierAt: "A",
        promptedBy: {
          ru: "Сорок часов назад ты писал, что прощаешь долгие бои ради спутников. Всё ещё прощаешь?",
          en: "Forty hours ago you wrote that you forgive the long fights for the sake of the companions. Still forgiving?",
        },
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
        text: {
          ru: "Написано отлично, побочные истории уровня, которого больше нигде нет. Но между ними меня просят зачистить очередной лагерь бандитов и доплыть до вопросика в Скеллиге — и вот на этом я и сдулся. Часов за десять до финала просто перестал запускать. Карта победила сценарий.",
          en: "The writing is superb, side stories of a level that exists nowhere else. But between them I'm asked to clear one more bandit camp and swim out to a question mark in Skellige — and that is where I ran out. About ten hours short of the ending I simply stopped launching it. The map beat the script.",
        },
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
        text: {
          ru: "Найт-Сити красивый до неприличия, но первые часов пять — сплошные звонки, обучение и разговоры о том, что скоро начнётся дело. Держусь на атмосфере и на Джеки.",
          en: "Night City is indecently beautiful, but the first five hours are nothing but phone calls, tutorials and conversations about the job that is going to start any minute now. What is keeping me here is the atmosphere and Jackie.",
        },
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
        text: {
          ru: "Всё, удалил. Основной сюжет отличный, но вокруг него одинаковые «преступления в процессе» на каждом втором перекрёстке и склады с одной и той же планировкой. Тридцать часов я чистил карту вместо того, чтобы играть в историю, и в какой-то момент понял, что делаю это уже без удовольствия. Как The Witcher 3: Wild Hunt, только там побочки хотя бы написаны.",
          en: "That's it, deleted. The main story is excellent, but around it sit identical “crimes in progress” at every other intersection and warehouses with one and the same floor plan. For thirty hours I cleared the map instead of playing the story, and at some point I noticed I was doing it with no pleasure left at all. Like The Witcher 3: Wild Hunt, except there the side quests are at least written.",
        },
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
        text: {
          ru: "Ты бросаешь не игры, а карты. В одиннадцати записях из семнадцати причина одна: мир требует работы, а не внимания. Cyberpunk 2077 ты снёс на тридцать четвёртом часу, но основной сюжет в той же записи назвал отличным. Основная линия плюс линия Джуди — это часов двенадцать, ровно твоя длина хорошей игры. Карта при этом ничего не требует: она просто есть, и её можно не трогать.",
          en: "You don't drop games, you drop maps. Eleven entries out of seventeen give the same reason: the world asks for labour, not attention. You deleted Cyberpunk 2077 at hour thirty-four, and in the same entry you called the main story excellent. The main line plus Judy's line is about twelve hours — exactly your length for a good game. And the map asks for nothing: it is simply there, and you are allowed to leave it alone.",
        },
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
        text: {
          ru: "Боёвка божественная, первые десять часов в Лимгрейве — восторг без оговорок. А дальше начались катакомбы, которые все одинаковые, шахты, которые все одинаковые, и один и тот же босс в трёх разных местах. Открытый мир здесь работает ровно до момента, когда замечаешь, что он собран из повторов. Ушёл, не дойдя до Лейендела.",
          en: "The combat is divine, and the first ten hours in Limgrave were delight with no reservations. Then came catacombs that are all the same, mines that are all the same, and one and the same boss in three different places. The open world here works right up to the moment you notice it is assembled out of repeats. I left without ever reaching Leyndell.",
        },
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
        text: {
          ru: "Ни одной лишней комнаты за сорок часов. Я запомнил карту наизусть, чего со мной не случалось с детства. Управление такое, что в любой смерти виноват только я, — и поэтому смерти не бесят вообще. Дошёл до Радиантного и на этом честно остановился, дальше уже спорт, а не игра.",
          en: "Not one wasted room in forty hours. I learned the map by heart, which hasn't happened to me since childhood. The controls are such that only I am ever to blame for a death — which is why dying doesn't annoy me at all. I got as far as Radiant and stopped there honestly; past that it's sport, not a game.",
        },
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
        text: {
          ru: "Идеальная игра на «полчаса перед сном», которые каждый раз превращаются в два. Забег занимает двадцать минут, и встать можно в любой момент без чувства, что бросил на середине. И диалоги: двести забегов, а они всё ещё не повторяются — до сих пор не понимаю, как это сделано. Музыка в последней комнате Асфоделя — отдельная причина запускать.",
          en: "The perfect game for “half an hour before bed” that turns into two hours every single time. A run takes twenty minutes, and you can stand up at any point without feeling you quit halfway. And the dialogue: two hundred runs and it still doesn't repeat — I still don't understand how that was done. The music in the last room of Asphodel is a reason to launch it all on its own.",
        },
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
        text: {
          ru: "Двенадцать часов, и ни одна минута не потрачена впустую. Прыжок ощущается идеально, а смерть стоит полсекунды — поэтому четыреста смертей на одной главе не вызывают злости, только упрямство. Саундтрек вытаскивает даже те экраны, где я застревал по часу. B-стороны трогать не стал, мне хватило.",
          en: "Twelve hours, and not one minute wasted. The jump feels perfect and a death costs half a second — which is why four hundred deaths in one chapter produce no anger, only stubbornness. The soundtrack carries even the screens where I was stuck for an hour. I left the B-sides alone; I'd had enough.",
        },
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
        text: {
          ru: "Шесть часов кампании, и в каждой миссии своя идея, которую потом ни разу не переиспользуют. Уровень со сдвигом времени я буду помнить всегда. Вот так и надо: сказали, что хотели сказать, и отпустили.",
          en: "Six hours of campaign, and every mission has an idea of its own that never gets reused. The level with the time shift I will remember forever. That's how it should be done: said what they had to say, then let you go.",
        },
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
        text: {
          ru: "Ради концовки E стоило вытерпеть маршрут B, где тебя буквально ведут по тем же локациям второй раз, только камера другая. Саундтрек — лучшее, что я слышал в играх, он вытягивает даже пустой заброшенный город. Но город правда пустой, и беготни через него слишком много.",
          en: "Ending E was worth sitting through route B, where you are literally walked through the same locations a second time with nothing changed but the camera. The soundtrack is the best I have heard in games; it carries even the empty abandoned city. But the city really is empty, and there is far too much running across it.",
        },
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
        text: {
          ru: "Первые вечера были волшебные: плывёшь в туман и не знаешь, что там. А потом выяснилось, что игра состоит из того, чтобы стучать по деревьям и возить руду на корабле. Я не против крафта, я против крафта как обязательного налога на всё интересное. Как Terraria, только в четыре раза медленнее.",
          en: "The first few evenings were magic: you sail into the fog and don't know what's out there. Then it turned out the game consists of banging on trees and hauling ore about by boat. I'm not against crafting, I'm against crafting as a compulsory tax on everything interesting. Like Terraria, only four times slower.",
        },
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
        text: {
          ru: "Четырнадцать часов, и по ощущениям я всё ещё в снежном прологе. Каждое действие — анимация на четыре секунды, которую нельзя пропустить: подобрать, освежевать, поговорить, ещё раз поговорить. Понимаю, что дальше великая история, но добираться до неё через это я не готов.",
          en: "Fourteen hours in and it still feels like the snowy prologue. Every action is a four-second animation you can't skip: pick up, skin, talk, talk again. I understand there is a great story further on, but I'm not willing to reach it through this.",
        },
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
        text: {
          ru: "Все обещали уют, а я получил таблицу: полить, продать, успеть до конца сезона. К третьему внутриигровому месяцу поймал себя на том, что оптимизирую маршрут по ферме вместо того, чтобы отдыхать. Не моё, при всём уважении к игре.",
          en: "Everyone promised cosy and I got a spreadsheet: water, sell, make it before the season ends. By the third in-game month I caught myself optimising my route instead of relaxing. Not for me, with all due respect to the game.",
        },
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
        text: {
          ru: "Запускаю, когда не хочу ни во что вкладываться. Забег — сорок минут, проигрыш не стоит ничего, а голова при этом работает всё время. Как Hades, только без разговоров и без сюжета, который жалко бросать на середине. За двадцать шесть часов ни одного повторяющегося расклада.",
          en: "I launch it when I don't want to invest in anything. A run is forty minutes, losing costs nothing, and your head is working the whole time. Like Hades, only without the conversations and without a story you'd feel bad leaving halfway. Twenty-six hours in and not one repeated hand.",
        },
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
  reasonText: Localized;
  daysAgo: number;
}

const DEMO_SKIPS: DemoSkip[] = [
  {
    slotId: 503,
    gameId: 32,
    reasonType: "shame",
    reasonText: {
      ru: "Сто часов JRPG. Я знаю, что она прекрасна, и знаю, что не начну.",
      en: "A hundred hours of JRPG. I know it's wonderful and I know I'm never going to start it.",
    },
    daysAgo: 112,
  },
  {
    slotId: 504,
    gameId: 30,
    reasonType: "shame",
    reasonText: {
      ru: "Запустил, посмотрел двенадцать минут вступления и закрыл. Стыдно.",
      en: "Launched it, watched twelve minutes of the opening and closed it. Not proud.",
    },
    daysAgo: 74,
  },
];

/* ================= Ready-made sets for the queries ================= */

/*
 * Everything below this line is derived. Sets that carry no prose — covers,
 * titles, playtimes, counters — are built once at module load, because they
 * would come out identical in either language and rebuilding them per request
 * would only invite the two copies to disagree. What does carry prose is built
 * by a function of the locale instead, and `demoFixtures` glues the two halves
 * together.
 */

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
const RECORDED = new Map(RECORDS.map((record) => [record.gameId, record]));

/**
 * The roulette pool — the same rules as in `getUnplayedGames`: untouched, not
 * excluded by hand, not software and not held by a contract.
 */
const DEMO_POOL: UnplayedGames = LIBRARY.filter(
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
const DEMO_UPDATES: Extract<AttentionItem, { reason: "update" }>[] = RECORDS.flatMap(
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

const DEMO_TRIAGE: Extract<AttentionItem, { reason: "triage" }>[] = LIBRARY.filter(
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

const DEMO_ATTENTION: AttentionQueue = {
  items: [...DEMO_UPDATES, ...DEMO_TRIAGE],
  triageTotal: DEMO_TRIAGE.length,
};

const DEMO_TIER_LIST: TierList = RECORDS.map((record) => {
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

/** The library once the request's language is known. */
function demoLibrary(locale: Locale): DemoLibraryGame[] {
  return LIBRARY.map((item) => ({
    ...item,
    genres: say(item.genres, locale),
    shortDescription: say(item.shortDescription, locale),
    releaseDate: say(item.releaseDate, locale),
  }));
}

function demoRecords(locale: Locale): DemoRecord[] {
  return RECORDS.map((record) => ({
    ...record,
    entries: record.entries.map((entry) => ({
      ...entry,
      text: say(entry.text, locale),
      promptedBy: entry.promptedBy ? say(entry.promptedBy, locale) : undefined,
    })),
  }));
}

/**
 * The diary feed: entries and skips in one order, newest first — what
 * `getHistory` returns.
 */
function demoHistory(locale: Locale): History {
  const entries: HistoryItem[] = RECORDS.flatMap((record) => {
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
        note: say(entry.text, locale),
        promptedBy: entry.promptedBy ? say(entry.promptedBy, locale) : null,
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
      reasonText: say(skip.reasonText, locale),
      date: at(skip.daysAgo, 18, 45),
    };
  });

  return [...entries, ...skips].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** The feed for a single game — what the analysis card shows. */
export function demoGameTimeline(gameId: number, locale: Locale): GameTimeline {
  const record = RECORDED.get(gameId);
  if (!record) return [];

  let previousTotal = 0;
  return record.entries.map((entry) => {
    const delta = Math.max(0, entry.playtimeTotalMinutes - previousTotal);
    previousTotal = entry.playtimeTotalMinutes;

    return {
      id: entry.id,
      kind: entry.kind,
      text: say(entry.text, locale),
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

function demoDiaryTags(locale: Locale): DiaryTags {
  const labels = new Map(demoTags(locale).map((tag) => [tag.id, tag]));

  return RECORDS.flatMap((record) =>
    record.entries.flatMap((entry) =>
      (entry.tags ?? []).map((key) => {
        const tag = labels.get(TAG_ID.get(key)!)!;
        return { entryId: entry.id, tagId: tag.id, label: tag.label, kind: tag.kind };
      })
    )
  );
}

/*
 * The offset of a mention is computed from the text rather than written out as
 * a number: a one-character shift while editing the text means a highlight
 * sliding onto the neighbouring word, and no review catches that by eye. With
 * two languages in the file the offsets differ outright, which is the second
 * reason nobody should be writing them down.
 */
function demoDiaryMentions(locale: Locale): DiaryMentions {
  return RECORDS.flatMap((record) => {
    const source = game(record.gameId);

    return record.entries.flatMap((entry) =>
      (entry.mentions ?? []).flatMap((mention) => {
        const text = say(entry.text, locale);
        const startOffset = text.indexOf(mention.surface);
        if (startOffset < 0) {
          throw new Error(
            `demo-fixtures: mention "${mention.surface}" is missing from the ${locale} text of entry #${entry.id}`
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
}

/**
 * The taste profile: coverage is counted over games, not entries — a tag named
 * five times about one game doesn't become a property of the taste.
 */
function demoTasteProfile(locale: Locale): TasteTag[] {
  const gamesByTag = new Map<number, Set<number>>();

  for (const record of RECORDS) {
    for (const entry of record.entries) {
      for (const key of entry.tags ?? []) {
        const id = TAG_ID.get(key)!;
        const seen = gamesByTag.get(id) ?? new Set<number>();
        seen.add(record.gameId);
        gamesByTag.set(id, seen);
      }
    }
  }

  return demoTags(locale)
    .filter((tag) => gamesByTag.has(tag.id))
    .map((tag) => ({
      label: tag.label,
      kind: tag.kind as string,
      games: gamesByTag.get(tag.id)!.size,
    }))
    .sort((a, b) => b.games - a.games);
}

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
 * Every game named here exists in the library and every claim is checkable
 * against the diary. An observation about a game the visitor cannot find in
 * the library is the one kind of error that reads as a lie rather than a bug.
 */
const RUN_PROFILE: Localized = {
  ru: `- **Ты не бросаешь игры — ты доигрываешь до места, где они начинают повторяться.** В *Cyberpunk 2077* первая запись про атмосферу и Джеки, вторая, двадцатью часами позже, — про склады с одинаковой планировкой. В *ELDEN RING* восторг держался ровно до второй одинаковой шахты. Порог устойчивый: двадцать седьмой и тридцать четвёртый час.
- **Дело не в длине, а в том, кто придумывает следующий час.** Ты спокойно провёл семьдесят часов в *Baldur's Gate 3* и сорок два в *Hollow Knight* — обе длинные. Но там следующий час придумал автор, а в *Valheim* и *Stardew Valley* придумывать приходилось тебе, и обе закрыты до двадцатого часа.
- **Крафт и карта с иконками — для тебя одно и то же раздражение, а не два.** В записях про *Valheim*, *Cyberpunk 2077* и *Red Dead Redemption 2* претензия сформулирована одинаково: игра требует труда, который ничего не добавляет. Слово «налог» ты употребил сам.
- **Тебе важно, чтобы промах был твой.** *Hollow Knight* и *Celeste* описаны почти одними словами — «виноват только я», «смерть стоит полсекунды», — и обе пройдены до конца. Ни одной игры, где исход решают цифры, а не руки, ты не закрыл.
- **Музыку ты отмечаешь только там, где она делает работу.** *Hades*, *Celeste* и *NieR:Automata* — три записи, где саундтрек назван отдельной строкой, и во всех трёх он держит конкретный момент: последняя комната Асфоделя, экран, на котором ты застрял, пустой город. Про красивую музыку в играх, которые не зашли, ты не написал ни разу.
- **Текст — единственное, ради чего ты терпишь долгое.** *Disco Elysium* пройден, хотя первые два часа ты злился, и ты отдельно отметил, что не пропустил ни одной реплики. *Baldur's Gate 3* держит тебя семьдесят часов на спутниках. Как только текста стало меньше — в третьем акте — сразу появилось «доигрываю на автомате».`,
  en: `- **You don't drop games — you play them up to the point where they start repeating.** In *Cyberpunk 2077* the first entry is about the atmosphere and Jackie; the second, twenty hours later, is about warehouses with the same floor plan. In *ELDEN RING* the delight held right up to the second identical mine. The threshold is steady: hour twenty-seven and hour thirty-four.
- **It isn't about length, it's about who invents the next hour.** You spent seventy hours in *Baldur's Gate 3* and forty-two in *Hollow Knight* without complaining — both are long. But there the next hour was invented by the author, while in *Valheim* and *Stardew Valley* the inventing was left to you, and both were closed before hour twenty.
- **Crafting and a map full of icons are one irritation for you, not two.** In the entries on *Valheim*, *Cyberpunk 2077* and *Red Dead Redemption 2* the complaint is worded identically: the game demands labour that adds nothing. The word “tax” is yours.
- **What matters to you is that the mistake was yours.** *Hollow Knight* and *Celeste* are described in almost the same words — “only I am ever to blame”, “a death costs half a second” — and both were played to the end. You have never finished a single game where the outcome is settled by numbers rather than hands.
- **You only mention music where it is doing work.** *Hades*, *Celeste* and *NieR:Automata* — three entries where the soundtrack gets a line of its own, and in all three it is holding up a specific moment: the last room of Asphodel, the screen you were stuck on, the empty city. About beautiful music in games that didn't land you have written nothing, not once.
- **Writing is the only thing you will sit through length for.** *Disco Elysium* is finished even though the first two hours made you angry, and you noted separately that you didn't skip a single line. *Baldur's Gate 3* holds you for seventy hours on its companions. The moment there was less text — in act three — up came “finishing it on autopilot”.`,
};

type RunPick = DemoRun["items"][number];

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

interface RawPick {
  gameId: number;
  tier: "S" | "A" | "B" | "C" | "D";
  reason: Localized;
  dive: PickDive;
}

interface RawRun {
  id: number;
  model: string;
  profile: Localized;
  reviewsUsed: number;
  candidatesUsed: number;
  createdAt: Date;
  items: RawPick[];
}

/**
 * One advice card, filled in from the catalogue.
 *
 * Title, cover and hours are never written out by hand: they exist in the
 * library already, and a second copy would drift — a renamed game would keep
 * its old name on the advice card and nowhere else.
 */
function pick(raw: RawPick, locale: Locale): RunPick {
  const target = game(raw.gameId);
  return {
    gameId: target.id,
    steamAppId: target.steamAppId,
    title: target.title,
    headerImage: header(target.steamAppId),
    tier: raw.tier,
    reason: say(raw.reason, locale),
    grounding: raw.dive.grounding ?? "known",
    deepFit: raw.dive.fit,
    deepTier: raw.dive.tier,
    hours: Math.round((target.playtimeMinutes / 60) * 10) / 10,
  };
}

function run(raw: RawRun, locale: Locale): DemoRun {
  return {
    id: raw.id,
    model: raw.model,
    profile: say(raw.profile, locale),
    reviewsUsed: raw.reviewsUsed,
    candidatesUsed: raw.candidatesUsed,
    createdAt: raw.createdAt,
    items: raw.items.map((item) => pick(item, locale)),
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
const RUN: RawRun = {
  id: 9001,
  model: "gemini-3.7-flash",
  profile: RUN_PROFILE,
  reviewsUsed: 17,
  candidatesUsed: 48,
  createdAt: at(4, 12, 20),
  items: [
    {
      gameId: 28,
      tier: "S",
      reason: {
        ru: "Забег двадцать минут, проигрыш не стоит ничего, голова работает всё время — ровно то, за что ты держишь Slay the Spire, только темп жёстче. Ни карты, ни крафта, ни прокачки между забегами: злиться будет не на что.",
        en: "A run is twenty minutes, losing costs nothing and your head works the whole time — exactly what you keep Slay the Spire for, only at a harder tempo. No map, no crafting, no progression between runs: there will be nothing to get angry at.",
      },
      dive: { fit: "yes", tier: "S" },
    },
    {
      gameId: 39,
      tier: "S",
      reason: {
        ru: "Двадцать два часа, в которых нет ни одной цифры: не растёт ни уровень, ни снаряжение, весь прогресс — то, что ты понял сам. Ты поставил S Disco Elysium за «разговор и есть игра»; здесь так же, только вместо разговора устройство планетной системы.",
        en: "Twenty-two hours without a single number in them: no level goes up, no gear goes up, and all the progress is what you worked out yourself. You gave Disco Elysium an S for “the conversation is the game”; it is the same here, only instead of a conversation it is the workings of a solar system.",
      },
      dive: { fit: "yes", tier: "S" },
    },
    {
      gameId: 27,
      tier: "A",
      reason: {
        ru: "Шесть часов, ни одной побочной иконки, каждая локация собрана руками. Про Titanfall 2 ты написал «сказали, что хотели, и отпустили» — здесь ровно тот же договор с игроком.",
        en: "Six hours, not one side-quest icon, every location built by hand. About Titanfall 2 you wrote “said what they had to say, then let you go” — this is exactly the same deal with the player.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 29,
      tier: "A",
      reason: {
        ru: "Метроидвания с управлением, за которое ты хвалил Hollow Knight и Celeste, и с музыкой уровня NieR:Automata. Риск один: во второй половине появляются пара заданий на сбор — но их немного, и мимо них можно пройти.",
        en: "A metroidvania with the controls you praised in Hollow Knight and Celeste, and music on the level of NieR:Automata. One risk: the second half adds a couple of fetch quests — but there aren't many, and you can walk right past them.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 52,
      tier: "A",
      reason: {
        ru: "Прямое продолжение игры, которой ты поставил S и написал «ни одной лишней комнаты». Ставлю A, а не S, только из-за жалоб на сложность: та же школа, но требований к рукам больше.",
        en: "A direct sequel to the game you gave an S and wrote “not one wasted room” about. I'm putting it at A rather than S only because of the complaints about difficulty: the same school, but it asks more of your hands.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 40,
      tier: "A",
      reason: {
        ru: "Детектив, который целиком состоит из внимания к деталям: ни боёв, ни прокачки, четыре часа чистой дедукции. Ты писал, что в Disco Elysium не пропустил ни одной реплики, — здесь пропустить нельзя вообще ничего, иначе не сойдётся.",
        en: "A detective story made entirely of attention to detail: no fights, no progression, four hours of pure deduction. You wrote that in Disco Elysium you didn't skip a single line — here you can't skip anything at all, or it won't add up.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 31,
      tier: "B",
      reason: {
        ru: "Линейная история без карты — это твоё. Но Red Dead Redemption 2 ты бросил из-за анимаций, которые нельзя пропустить, а здесь темп тоже медленный и катсцен много. Ставлю B честно: сюжет вытянет, если переживёшь первые два часа.",
        en: "A linear story with no map — that's yours. But you dropped Red Dead Redemption 2 over animations you can't skip, and the pace here is slow too, with plenty of cutscenes. I'm putting it at B honestly: the story will carry it, if you survive the first two hours.",
      },
      // The analysis raised the tier: the card says so with a "B → A" line
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 46,
      tier: "B",
      reason: {
        ru: "Забег на полчаса с очень отзывчивым управлением — то, за что у тебя стоят пятёрки у Hades и Slay the Spire. Ниже A потому, что прогресс тут всё-таки копится между забегами, а ты про такое писал «гринд ради цифр».",
        en: "A half-hour run with very responsive controls — the thing Hades and Slay the Spire have their fives for. Below A because progress here does pile up between runs, and that is what you called “grinding for numbers”.",
      },
      dive: { fit: "yes", tier: "B" },
    },
    {
      gameId: 50,
      tier: "B",
      reason: {
        ru: "Слэшер, где весь уровень двигается в такт музыке: ты трижды отмечал саундтрек отдельной строкой — у Hades, Celeste и NieR:Automata. Ниже A потому, что боёвка проще, чем ты обычно любишь.",
        en: "A brawler where the whole level moves in time with the music: you gave the soundtrack a line of its own three times — for Hades, Celeste and NieR:Automata. Below A because the combat is simpler than you usually like.",
      },
      dive: { fit: "yes", tier: "B" },
    },
    {
      gameId: 62,
      tier: "B",
      reason: {
        ru: "Прямая предшественница Baldur's Gate 3, которую ты сейчас проходишь: те же бои и те же спутники, но текст суше. Ты уже писал, что третий акт BG3 — болото; здесь болото начинается раньше, во втором акте.",
        en: "The direct predecessor of Baldur's Gate 3, which you're in the middle of: the same fights and the same companions, but drier writing. You have already written that act three of BG3 is a swamp; here the swamp starts earlier, in act two.",
      },
      dive: { fit: "maybe", tier: "B" },
    },
    {
      gameId: 30,
      tier: "C",
      reason: {
        ru: "Формально сходится всё: ручные уровни, сильные диалоги отца и сына. Но во второй половине игра открывает озеро с побочными точками и просит перекачивать снаряжение под уровень врагов — по твоим записям это ровно та развилка, на которой ты выходишь.",
        en: "On paper it all lines up: hand-made levels, strong writing between father and son. But in the second half the game opens up a lake full of side markers and asks you to level gear to match the enemies — by your own entries, that is exactly the fork where you walk out.",
      },
      dive: { fit: "maybe", tier: "C" },
    },
    {
      gameId: 67,
      tier: "D",
      reason: {
        ru: "Не трать время. Это та самая карта из галочек, на которой ты бросил Cyberpunk 2077 и ELDEN RING, только больше в несколько раз: вопросики, аванпосты и уровни снаряжения, без которых сюжет не пускает дальше.",
        en: "Don't bother. This is that same map of checkboxes you dropped Cyberpunk 2077 and ELDEN RING over, only several times bigger: question marks, outposts and gear levels without which the story won't let you through.",
      },
      dive: { fit: "no", tier: "D" },
    },
    {
      gameId: 72,
      tier: "D",
      reason: {
        ru: "Не трать время. Про Valheim ты написал, что против крафта как обязательного налога на всё интересное, — здесь этот налог и есть вся игра, и платить его придётся ещё и другим игрокам.",
        en: "Don't bother. About Valheim you wrote that you are against crafting as a compulsory tax on everything interesting — here that tax is the whole game, and you will be paying it to other players as well.",
      },
      dive: { fit: "no", tier: "D" },
    },
    {
      gameId: 75,
      tier: "D",
      reason: {
        ru: "Не трать время. Шутер, устроенный вокруг цифр на снаряжении, которые обнуляются каждый сезон: «гринд ради цифр» — твоя формулировка из записи про Stardew Valley, и лучше про эту игру не скажешь.",
        en: "Don't bother. A shooter built around numbers on gear that reset every season: “grinding for numbers” is your own phrase from the Stardew Valley entry, and nothing says it better.",
      },
      dive: { fit: "no", tier: "D" },
    },
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
const RUN_PROFILE_ALT: Localized = {
  ru: `- **Мнение об игре у тебя не портится постепенно — оно ломается на одной конкретной механике.** *Baldur's Gate 3* держала пятёрку тридцать три часа и просела до четвёрки к семидесятому, и причина в записи названа точно: не бои и не длина, а городские квесты по шаблону. Ты не устаёшь от игры, ты замечаешь шов.
- **Ни одна игра длиннее сорока пяти часов не дошла у тебя до «пройдено».** Все шесть законченных укладываются в сорок пять часов, и самая долгая из них — *Disco Elysium*. Дальше этой черты ты заходил дважды: *The Witcher 3: Wild Hunt* брошена за десять часов до финала, а в *Baldur's Gate 3* на семидесятом часу появилось «доигрываю на автомате».
- **Ты выбираешь по тому, можно ли из игры выйти.** *Hades* и *Slay the Spire* — твои единственные «бесконечные», и в обеих записях сказано одно и то же: забег кончается, встать можно. При этом *Terraria* и *Counter-Strike 2* наиграны больше почти всего в библиотеке, но о них не написано ни строчки — им нечем кончиться, и сказать про них нечего.
- **Ты не против сложности, ты против того, чтобы её решали часы вместо рук.** *Hollow Knight* пройден до Радиантного, в *Celeste* ты насчитал четыреста смертей на одной главе — и обе хвалишь. А *Stardew Valley* и *Valheim* брошены ровно там, где нужны не руки: «оптимизирую маршрут» и «стучать по деревьям» — твои же слова.
- **Первые два часа решают почти всё.** Записи про *Cyberpunk 2077* и *Red Dead Redemption 2* начинаются с претензии к началу, и обе игры в итоге брошены. Исключение одно: *Disco Elysium*, где ты сам написал, что два часа бесился, а потом «всё встало на место».
- **Оценка у тебя сглажена, а тир — нет.** Средняя оценка по дневнику ровно четыре, двойку ты поставил всего дважды. Зато тиры разведены до краёв: *Disco Elysium*, *Hollow Knight* и *Titanfall 2* в S, *Valheim* и *Stardew Valley* в D. Твой вкус читается по тирам, а не по звёздам.`,
  en: `- **Your opinion of a game doesn't decay gradually — it breaks on one specific mechanic.** *Baldur's Gate 3* held a five for thirty-three hours and sagged to a four by hour seventy, and the entry names the reason exactly: not the fights and not the length, but city quests built to a template. You don't get tired of a game, you notice the seam.
- **No game longer than forty-five hours has ever reached “finished” with you.** All six of the finished ones fit inside forty-five hours, and the longest of them is *Disco Elysium*. Past that line you have gone twice: *The Witcher 3: Wild Hunt* was abandoned ten hours short of the ending, and in *Baldur's Gate 3* hour seventy brought “finishing it on autopilot”.
- **You choose by whether you can get out of a game.** *Hades* and *Slay the Spire* are your only “endless” ones, and both entries say the same thing: the run ends, you can stand up. Meanwhile *Terraria* and *Counter-Strike 2* have more hours on them than almost anything in the library, and not a line is written about either — they have nothing to end with, so there is nothing to say.
- **You are not against difficulty, you are against hours solving it instead of hands.** *Hollow Knight* was played through to Radiant, in *Celeste* you counted four hundred deaths in one chapter — and you praise both. *Stardew Valley* and *Valheim* were dropped exactly where it isn't the hands that are needed: “optimising my route” and “banging on trees” are your own words.
- **The first two hours decide nearly everything.** The entries on *Cyberpunk 2077* and *Red Dead Redemption 2* both open with a complaint about the opening, and both games ended up dropped. There is one exception: *Disco Elysium*, where you wrote yourself that two hours made you furious and then “everything fell into place”.
- **Your ratings are flattened, your tiers are not.** The diary's average rating is exactly four, and you have given a two only twice. The tiers, though, are spread to the edges: *Disco Elysium*, *Hollow Knight* and *Titanfall 2* in S, *Valheim* and *Stardew Valley* in D. Your taste reads off the tiers, not off the stars.`,
};

const RUN_ALT: RawRun = {
  id: 9002,
  model: "gemini-3.7-flash",
  profile: RUN_PROFILE_ALT,
  reviewsUsed: 17,
  candidatesUsed: 48,
  // Just now: this is what the "regenerate" button has produced
  createdAt: new Date(NOW - 2 * MINUTE),
  items: [
    {
      gameId: 43,
      tier: "S",
      reason: {
        ru: "Тактика без единого элемента случайности: игра честно показывает, что сделает противник на следующем ходу. Про Hollow Knight ты написал, что в любой смерти виноват только ты, — здесь это доведено до предела, проигрыш всегда твой просчёт.",
        en: "Tactics with no element of chance at all: the game shows you honestly what the enemy will do on its next move. About Hollow Knight you wrote that only you are ever to blame for a death — here that is taken to its limit, a loss is always your own miscalculation.",
      },
      dive: { fit: "yes", tier: "S" },
    },
    {
      gameId: 41,
      tier: "S",
      reason: {
        ru: "Два часа, и ни одной механики, которая повторяется дважды: каждая комната дома — отдельный приём, который больше не используют. Ты дословно этими словами хвалил Titanfall 2.",
        en: "Two hours, and not one mechanic that repeats twice: every room of the house is a device of its own that is never used again. You praised Titanfall 2 in these exact words.",
      },
      dive: { fit: "yes", tier: "S" },
    },
    {
      gameId: 57,
      tier: "A",
      reason: {
        ru: "Фехтование на парированиях, где нельзя откатиться и переждать: чистая проверка рук, без прокачки, которая решает за тебя. ELDEN RING ты бросил из-за повторов в открытом мире — здесь мира нет, есть коридор и боссы.",
        en: "Swordplay built on parries, where you can't roll away and wait it out: a pure test of hands, with no progression deciding things for you. You dropped ELDEN RING over the repeats in its open world — here there is no world, there is a corridor and bosses.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 42,
      tier: "A",
      reason: {
        ru: "Четыре часа, весь сюжет — разговор двух людей по рации. Disco Elysium у тебя S с формулировкой «разговор и есть игра»; это то же самое, только короче в десять раз и без проверок навыков.",
        en: "Four hours, and the whole story is two people talking on a radio. Disco Elysium is an S for you with the words “the conversation is the game”; this is the same thing, only ten times shorter and with no skill checks.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 53,
      tier: "A",
      reason: {
        ru: "Продолжение игры, которой ты поставил A и написал «встать можно в любой момент». Здесь тот же двадцатиминутный забег и те же неповторяющиеся диалоги между ними.",
        en: "A sequel to the game you gave an A and wrote “you can stand up at any point” about. The same twenty-minute run, and the same non-repeating dialogue between them.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 55,
      tier: "A",
      reason: {
        ru: "Игра целиком состоит из боссов: ни коридоров между ними, ни собирательства, ни прокачки. Ты писал про Celeste, что четыреста смертей не злят, потому что смерть стоит полсекунды, — здесь ровно та же цена ошибки.",
        en: "The game consists entirely of bosses: no corridors between them, no collecting, no progression. About Celeste you wrote that four hundred deaths produce no anger because a death costs half a second — the price of a mistake here is exactly the same.",
      },
      dive: { fit: "yes", tier: "A" },
    },
    {
      gameId: 35,
      tier: "B",
      reason: {
        ru: "Восемь часов головоломок и один из лучших текстов в играх — обе твои опоры сразу. Ниже A только потому, что руки здесь почти не нужны, а ты ценишь именно точное управление.",
        en: "Eight hours of puzzles and one of the best scripts in games — both of your anchors at once. Below A only because your hands are barely needed here, and precise controls are exactly what you value.",
      },
      dive: { fit: "yes", tier: "B" },
    },
    {
      gameId: 36,
      tier: "B",
      reason: {
        ru: "Три часа, и ни одной лишней комнаты — та же формулировка, которой ты описал Hollow Knight. Начинать логично с неё, а не сразу со второй части.",
        en: "Three hours, and not one wasted room — the same phrase you described Hollow Knight with. It makes sense to start here rather than jumping straight to the sequel.",
      },
      dive: { fit: "yes", tier: "B" },
    },
    {
      gameId: 63,
      tier: "B",
      reason: {
        ru: "Открытый мир, но устроенный не как карта с иконками: почти любой квест здесь можно решить разговором, и от выбора реплики зависит исход. Ставлю B из-за возраста — интерфейс и техническое состояние отпугивают.",
        en: "An open world, but not built as a map of icons: almost any quest here can be settled by talking, and the line you pick decides the outcome. I'm putting it at B because of its age — the interface and the technical state put people off.",
      },
      // The dive raises it: the reviews say the writing outweighs the age
      dive: { fit: "yes", tier: "A", grounding: "from-description" },
    },
    {
      gameId: 59,
      tier: "B",
      reason: {
        ru: "Постановка и полёты сделаны отлично, но это Ubisoft-карта: вышки, склады, случайные преступления на улице. Ты снёс Cyberpunk 2077 ровно за это, так что B здесь — аванс за то, что основная линия короткая.",
        en: "The staging and the swinging are excellent, but this is a Ubisoft map: towers, warehouses, random street crime. You deleted Cyberpunk 2077 over exactly this, so the B here is credit extended for the main line being short.",
      },
      dive: { fit: "maybe", tier: "B" },
    },
    {
      gameId: 65,
      tier: "C",
      reason: {
        ru: "Отряд, который надо лечить от стресса и терять насовсем. Ты пишешь, что против игр, которые требуют времени вместо умения, — здесь этого много; но сам цикл вылазок короткий, поэтому не D.",
        en: "A party you have to treat for stress and lose for good. You write that you are against games asking for time instead of skill — there is plenty of that here; but the expedition loop itself is short, so not a D.",
      },
      dive: { fit: "maybe", tier: "C" },
    },
    {
      gameId: 70,
      tier: "D",
      reason: {
        ru: "Не трать время. Стройка поселений и защита их по радио — это тот самый крафт как обязательный налог, из-за которого ты ушёл из Valheim, только вместо руды здесь мусор.",
        en: "Don't bother. Building settlements and defending them on radio call is that same crafting as a compulsory tax you walked out of Valheim over, only here it is junk instead of ore.",
      },
      dive: { fit: "no", tier: "D" },
    },
    {
      gameId: 73,
      tier: "D",
      reason: {
        ru: "Не трать время. Симулятор выживания, где первые часы уходят на инвентарь и еду. Твоя запись про Stardew Valley — «оптимизирую маршрут вместо того, чтобы отдыхать» — описывает и эту игру целиком.",
        en: "Don't bother. A survival simulator where the first hours go on inventory and food. Your Stardew Valley entry — “optimising my route instead of relaxing” — describes this game just as completely.",
      },
      dive: { fit: "no", tier: "D" },
    },
    {
      gameId: 76,
      tier: "D",
      reason: {
        ru: "Не трать время. Огромная песочница, которая не говорит, чем в ней заниматься, и требует сначала натаскать себе денег и людей. Всё, что ты бросал, начиналось примерно так же.",
        en: "Don't bother. An enormous sandbox that won't tell you what to do in it and wants you to drag together money and men first. Everything you have dropped started roughly the same way.",
      },
      dive: { fit: "no", tier: "D", grounding: "from-description" },
    },
  ],
};

/* ================= Deep analyses ================= */

export interface DemoDeepDive extends DeepDive {
  gameId: number;
  reviewsUsed: number;
}

interface RawDeepDive extends Omit<DemoDeepDive, "summary" | "forYou" | "against" | "complaints"> {
  summary: Localized;
  forYou: Localized;
  against: Localized;
  complaints: Localized[];
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
const DEEP_DIVES: RawDeepDive[] = [
  {
    gameId: 28,
    fit: "yes",
    tier: "S",
    summary: {
      ru: "Покерный рогалик, в котором ты играешь не в покер, а в поломку его правил: джокеры превращают пару двоек в выигрышную комбинацию на шесть знаков.",
      en: "A poker roguelike where you don't play poker, you play at breaking its rules: jokers turn a pair of twos into a six-figure winning hand.",
    },
    forYou: {
      ru: "Партия — двадцать-сорок минут с честной точкой выхода: та же ниша, что Slay the Spire, только короче. Между забегами нет ни прокачки, ни фарма, ни валюты, которую надо копить, — то есть нет ровно того, из-за чего ты ушёл из Valheim и Stardew Valley.",
      en: "A game is twenty to forty minutes with an honest exit point: the same niche as Slay the Spire, only shorter. Between runs there is no progression, no farming and no currency to save up — that is, none of what made you walk out of Valheim and Stardew Valley.",
    },
    against: {
      ru: "Визуально это одна и та же таблица от первого забега до последнего. Ты отдельно писал про копипаст локаций — здесь локаций нет вовсе, и если тебе нужен глазу отдых, его тут не будет.",
      en: "Visually it is one and the same table from the first run to the last. You wrote separately about copy-pasted locations — here there are no locations at all, and if your eyes want a rest they won't get one.",
    },
    complaints: [
      {
        ru: "Поздние ставки требуют знать джокеров наизусть — до этого проигрыши выглядят случайными",
        en: "The late stakes want the jokers memorised — before that, losses look like chance",
      },
      {
        ru: "Интерфейс мелкий, на телевизоре читается плохо",
        en: "The interface is small and reads badly on a TV",
      },
      {
        ru: "Патчи баланса ломают любимые сборки между сессиями",
        en: "Balance patches break favourite builds between sessions",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 27,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Шесть часов про кота в городе роботов: одна сплошная рукотворная декорация, ни карты с иконками, ни прокачки, ни инвентаря — идёшь вперёд и смотришь по сторонам.",
      en: "Six hours about a cat in a city of robots: one continuous hand-built set, no icon map, no progression, no inventory — you walk forward and look around.",
    },
    forYou: {
      ru: "Про Titanfall 2 ты написал «сказали, что хотели, и отпустили», про Celeste — «двенадцать часов, и ни одна минута не потрачена впустую». Здесь ровно тот же договор, только шесть часов. Ни одной из семи вещей, из-за которых ты бросаешь игры, тут физически нет.",
      en: "About Titanfall 2 you wrote “said what they had to say, then let you go”, and about Celeste “Twelve hours, and not one minute wasted”. This is exactly the same deal, only six hours long. Not one of the seven things that make you drop a game physically exists here.",
    },
    against: {
      ru: "Игра почти ничего не требует: прыжок срабатывает сам, головоломки решаются с первого взгляда. Ты хвалил Hollow Knight за то, что в каждой смерти виноват только ты, — здесь виноватым быть негде, и если тебе нужно сопротивление материала, его не будет.",
      en: "The game asks almost nothing of you: the jump fires by itself, the puzzles solve at a glance. You praised Hollow Knight for only you ever being to blame for a death — here there is nowhere to be at fault, and if you need the material to push back, it won't.",
    },
    complaints: [
      {
        ru: "Прыгать можно только в размеченных местах — свободы движения нет вообще",
        en: "You can only jump where the game has marked it — there is no freedom of movement at all",
      },
      {
        ru: "Середина проседает: два эпизода подряд сводятся к беготне по канализации",
        en: "The middle sags: two episodes in a row come down to running about in the sewers",
      },
      {
        ru: "Шесть часов за полную цену — самая частая претензия в отрицательных отзывах",
        en: "Six hours at full price — the most common line in the negative reviews",
      },
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 29,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Метроидвания с очень точным прыжком и оркестровым саундтреком; вторая половина добавляет побеги на время и деревню, которую предлагается достраивать.",
      en: "A metroidvania with a very precise jump and an orchestral soundtrack; the second half adds timed escapes and a village you are invited to keep building.",
    },
    forYou: {
      ru: "Управление того же класса, что ты хвалил у Hollow Knight и Celeste: промах всегда твой и потому не злит. Саундтрек написан под сцену, а не под фон, — ты отдельно отмечал это у NieR:Automata и Hades. Карта плотная, пустых переходов почти нет.",
      en: "Controls of the same class you praised in Hollow Knight and Celeste: the miss is always yours, which is why it doesn't make you angry. The soundtrack is written for the scene rather than for the background — you noted that separately for NieR:Automata and Hades. The map is dense, with almost no empty walking.",
    },
    against: {
      ru: "Улучшения деревни просят собирать ресурсы по уже пройденным локациям — это ровно тот обязательный налог, из-за которого ты ушёл из Valheim. Задания необязательные, но игра подталкивает к ним настойчиво.",
      en: "The village upgrades ask you to gather resources across locations you have already cleared — exactly the compulsory tax you walked out of Valheim over. The quests are optional, but the game nudges you towards them insistently.",
    },
    complaints: [
      {
        ru: "Побеги на время переигрываются с самого начала: одна ошибка стоит пяти минут",
        en: "The timed escapes restart from the very beginning: one mistake costs five minutes",
      },
      {
        ru: "Улучшения деревни требуют возвращаться за ресурсами в пройденные зоны",
        en: "Village upgrades mean going back to cleared zones for resources",
      },
      {
        ru: "Технические просадки и вылеты — заметная часть отзывов до сих пор про это",
        en: "Frame drops and crashes — a noticeable share of the reviews is still about this",
      },
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
    summary: {
      ru: "Линейный сюжетный экшен на пятнадцать часов: коридоры, укрытия и очень сильная актёрская игра. Ремейк игры 2013 года — картинка новая, структура прежняя.",
      en: "A linear story-driven action game of fifteen hours: corridors, cover and very strong acting. A remake of a 2013 game — new picture, old structure.",
    },
    forYou: {
      ru: "Первый проход поставил B по описанию: «медленный сюжетный экшен» читается ровно как Red Dead Redemption 2, который ты бросил на четырнадцатом часу. Отзывы это опасение не подтверждают, и поэтому оценка выросла. Мешал тебе в RDR2 не темп, а налог на каждое действие — подобрать, освежевать, поговорить, по четыре секунды анимации на всё. Здесь этого нет: лут подбирается мгновенно, карты с иконками нет, побочных занятий нет, пятнадцать часов идут по прямой. Держат их разговоры между делом — то же, за что ты поставил S Disco Elysium и хвалил первый акт Baldur's Gate 3.",
      en: "The first pass gave it a B from the description: “a slow story-driven action game” reads exactly like Red Dead Redemption 2, which you dropped at hour fourteen. The reviews don't bear that worry out, which is why the grade went up. What got in your way in RDR2 wasn't the pace but the tax on every action — pick up, skin, talk, four seconds of animation on all of it. None of that is here: loot is picked up instantly, there is no icon map, there are no side activities, and the fifteen hours run in a straight line. What holds them is the talk along the way — the same thing you gave Disco Elysium an S for and praised act one of Baldur's Gate 3 for.",
    },
    against: {
      ru: "Медленные куски всё-таки есть, просто другие: головоломки с поддонами и лестницами повторяются от начала до конца и ни разу не усложняются. И это ремейк по полной цене при структуре 2013 года — если такое задевает, задевать будет все пятнадцать часов.",
      en: "There are slow stretches after all, just different ones: the pallet-and-ladder puzzles repeat from start to finish and never once get harder. And it is a full-price remake on a 2013 structure — if that bothers you, it will bother you for all fifteen hours.",
    },
    complaints: [
      {
        ru: "Головоломки с поддонами и лестницами повторяются всю игру без изменений",
        en: "The pallet-and-ladder puzzles repeat all game without changing",
      },
      {
        ru: "Стелс ломается о напарников, которых противники демонстративно не замечают",
        en: "Stealth breaks on companions the enemies demonstratively fail to notice",
      },
      {
        ru: "Порт вышел сломанным: долгая компиляция шейдеров и вылеты, часть отзывов до сих пор об этом",
        en: "The port shipped broken: long shader compilation and crashes, and some reviews are still about that",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 30,
    fit: "maybe",
    tier: "C",
    summary: {
      ru: "Экшен с камерой без единой склейки и с диалогами отца и сына, которые держат всю игру; во второй половине превращается в полуоткрытое озеро с побочными точками.",
      en: "An action game with a camera that never cuts and father-and-son dialogue that carries the whole thing; in the second half it turns into a half-open lake dotted with side markers.",
    },
    forYou: {
      ru: "Текст написан и сыгран так, как ты любишь: твои лучшие оценки стоят там, где игру держит написанное — Disco Elysium, первый акт Baldur's Gate 3. Первые десять часов здесь линейны и поставлены плотно.",
      en: "The writing is written and acted the way you like it: your best marks go where a game is held up by what is written — Disco Elysium, act one of Baldur's Gate 3. The first ten hours here are linear and tightly staged.",
    },
    against: {
      ru: "Ты выходишь из игр между двадцатым и тридцать пятым часом — в тот момент, когда появляется карта с точками. Здесь она появляется примерно на пятнадцатом, вместе с просьбой перекачать снаряжение под уровень врагов.",
      en: "You walk out of games between hour twenty and hour thirty-five — at the moment a map with markers appears. Here it appears around hour fifteen, together with a request to level your gear up to match the enemies.",
    },
    complaints: [
      {
        ru: "Одинаковые арены троллей: вместо нового босса — «ещё один» тролль",
        en: "Identical troll arenas: instead of a new boss, “one more” troll",
      },
      {
        ru: "Прокачка снаряжения с цифрами уровня — механика из лутер-шутеров",
        en: "Gear levelling with level numbers — a mechanic out of looter shooters",
      },
      {
        ru: "Возврат в пройденные локации ради дверей, которые не открывались с первого раза",
        en: "Going back to cleared locations for doors that wouldn't open the first time",
      },
    ],
    reviewsUsed: 40,
  },

  /* Remaining picks of the first run. */
  {
    gameId: 39,
    fit: "yes",
    tier: "S",
    summary: {
      ru: "Приключение про планетную систему, которая взрывается каждые двадцать две минуты; единственный прогресс — знание в твоей голове.",
      en: "An adventure about a solar system that blows up every twenty-two minutes; the only progress is the knowledge in your head.",
    },
    forYou: {
      ru: "Здесь нечего качать и нечего собирать: цикл короткий, выйти можно на любом витке. Твоя формула «встать можно в любой момент» из записи про Hades работает и тут, только вместо забега — своя догадка.",
      en: "There is nothing to level and nothing to collect: the loop is short and you can leave on any lap. Your formula “you can stand up at any point” from the Hades entry works here too, only instead of a run it is a hunch of your own.",
    },
    against: {
      ru: "Подсказок игра не даёт вообще. Если сессия прервалась на неделю, возвращаться придётся в собственные заметки — часть игроков на этом и уходит.",
      en: "The game gives no hints whatsoever. If a session breaks off for a week, what you come back to is your own notes — and that is where some players leave.",
    },
    complaints: [
      {
        ru: "Без записей на бумаге легко потерять нить и ходить кругами",
        en: "Without notes on paper it is easy to lose the thread and go in circles",
      },
      {
        ru: "Полёты между планетами требуют ручного управления и раздражают на десятый раз",
        en: "Flying between planets is all manual and grates by the tenth time",
      },
      {
        ru: "Одна обязательная сцена с погоней ломает темп всей игры",
        en: "One compulsory chase scene breaks the pace of the whole game",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 52,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Продолжение Hollow Knight: та же плотность карты, более быстрая героиня и заметно более высокая планка требований.",
      en: "The sequel to Hollow Knight: the same density of map, a faster protagonist and a noticeably higher bar.",
    },
    forYou: {
      ru: "Ты прошёл первую часть и написал «ни одной лишней комнаты». Структура здесь та же, и претензия про копипаст локаций, которую ты предъявлял ELDEN RING, к ней не относится: повторов нет.",
      en: "You finished the first one and wrote “not one wasted room”. The structure here is the same, and the complaint about copy-pasted locations you levelled at ELDEN RING doesn't apply: there are no repeats.",
    },
    against: {
      ru: "Сложность выше первой части с самого начала, и жалуются на это чаще всего. Ты доходил до Радиантного, так что руки есть, но первые часы будут злее, чем ты помнишь.",
      en: "It is harder than the first one from the very start, and that is what people complain about most. You got as far as Radiant, so the hands are there, but the first hours will be nastier than you remember.",
    },
    complaints: [
      {
        ru: "Ранние боссы бьют больнее, чем в первой части, а лечиться дают меньше",
        en: "The early bosses hit harder than in the first game and let you heal less",
      },
      {
        ru: "Карта продаётся у торговца — до покупки легко ходить вслепую",
        en: "The map is sold by a trader — until you buy it you are walking blind",
      },
      {
        ru: "Быстрых перемещений мало, и обратная дорога съедает время",
        en: "There is little fast travel, and the walk back eats time",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 40,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Детектив на четыре часа: по замершим сценам гибели нужно опознать шестьдесят человек и восстановить, что случилось с кораблём.",
      en: "A four-hour detective story: from frozen scenes of death you have to identify sixty people and reconstruct what happened to the ship.",
    },
    forYou: {
      ru: "Ни боёв, ни прокачки, ни карты — только внимание к деталям, и игра проверяет его честно, по три догадки за раз. Про Disco Elysium ты писал, что не пропустил ни одной реплики; здесь пропустить нельзя ничего, иначе не сойдётся.",
      en: "No fights, no progression, no map — only attention to detail, and the game tests it honestly, three guesses at a time. About Disco Elysium you wrote that you didn't skip a single line; here you can't skip anything at all, or it won't add up.",
    },
    against: {
      ru: "Графика в один бит — то, на чём чаще всего спотыкаются: сцены иногда трудно разобрать глазами, и это не художественный приём, а честная проблема.",
      en: "The one-bit graphics are what people trip over most: the scenes are sometimes hard to make out, and that is not an artistic device but an honest problem.",
    },
    complaints: [
      {
        ru: "Одноцветная графика утомляет глаза за час-полтора",
        en: "The single-colour graphics tire the eyes within an hour or so",
      },
      {
        ru: "Часть опознаний решается перебором, а не выводом",
        en: "Some identifications come down to brute force rather than deduction",
      },
      {
        ru: "Второй раз играть невозможно в принципе — разгадка уже известна",
        en: "A second playthrough is impossible in principle — you already know the answer",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 46,
    fit: "yes",
    tier: "B",
    summary: {
      ru: "Рогалик с очень быстрым фехтованием и метроидванийной картой: смерть отправляет в начало, часть открытых путей остаётся навсегда.",
      en: "A roguelike with very fast swordplay and a metroidvania map: death sends you back to the start, and some of the paths you opened stay open for good.",
    },
    forYou: {
      ru: "Управление того же класса, что ты хвалил у Hollow Knight: промах всегда твой. Забег — тридцать-сорок минут, ровно тот формат, который ты держишь у Slay the Spire.",
      en: "Controls of the same class you praised in Hollow Knight: the miss is always yours. A run is thirty to forty minutes, exactly the format you keep Slay the Spire for.",
    },
    against: {
      ru: "Между забегами копятся постоянные улучшения, и первые часы ощущаются как их фарм. Ты назвал это «гриндом ради цифр» в записи про Stardew Valley — здесь этого меньше, но оно есть.",
      en: "Permanent upgrades pile up between runs, and the first hours feel like farming them. You called this “grinding for numbers” in the Stardew Valley entry — there is less of it here, but it is there.",
    },
    complaints: [
      {
        ru: "Ранние забеги упираются в нехватку постоянных улучшений, а не в умение",
        en: "Early runs stall on missing permanent upgrades rather than on skill",
      },
      {
        ru: "Часть оружия объективно сильнее прочего, и выбор сводится к паре сборок",
        en: "Some weapons are plainly stronger than the rest, and the choice narrows to a couple of builds",
      },
      {
        ru: "Поздние уровни сложности требуют заучивания карт наизусть",
        en: "The late difficulty levels want the maps learned by heart",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 50,
    fit: "yes",
    tier: "B",
    summary: {
      ru: "Слэшер, в котором весь мир — от вентиляторов до ударов — двигается в такт саундтреку; кампания на десять-двенадцать часов.",
      en: "A brawler where the whole world — from the fans to the punches — moves in time with the soundtrack; a ten-to-twelve-hour campaign.",
    },
    forYou: {
      ru: "Ты трижды отмечал музыку отдельной строкой: у Hades, Celeste и NieR:Automata. Здесь она не фон, а механика, и попадание в такт — это и есть боёвка. Никакой карты и никакого собирательства.",
      en: "You gave the music a line of its own three times: for Hades, Celeste and NieR:Automata. Here it is not background but mechanics — hitting the beat is the combat. No map and no collecting.",
    },
    against: {
      ru: "Боёвка проще, чем у слэшеров, к которым ты привык: набор приёмов небольшой, и к середине он перестаёт расширяться. Плюс несколько эпизодов со скрытностью, которые тормозят темп.",
      en: "The combat is simpler than in the brawlers you are used to: the move set is small and stops growing by the halfway point. Plus a few stealth episodes that slow the pace down.",
    },
    complaints: [
      {
        ru: "Скрытные эпизоды выбиваются из ритма и раздражают почти всех",
        en: "The stealth episodes break the rhythm and irritate almost everyone",
      },
      {
        ru: "Набор приёмов не растёт со второй трети игры",
        en: "The move set stops growing from the second third onwards",
      },
      {
        ru: "Юмор очень громкий — либо заходит сразу, либо мешает всю игру",
        en: "The humour is very loud — it either lands at once or gets in the way all game",
      },
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 62,
    fit: "maybe",
    tier: "B",
    summary: {
      ru: "Партийная RPG на восемьдесят часов с той же боевой системой, из которой выросла Baldur's Gate 3, и с полной свободой в решении квестов.",
      en: "An eighty-hour party RPG with the combat system Baldur's Gate 3 grew out of, and complete freedom in how quests get solved.",
    },
    forYou: {
      ru: "Спутники и вариативность — то, за что ты держишь BG3. Здесь свободы даже больше: почти любую задачу можно решить не так, как задумано.",
      en: "Companions and branching are what you keep BG3 for. There is even more freedom here: almost any task can be solved in a way nobody intended.",
    },
    against: {
      ru: "Ты уже пишешь про третий акт BG3, что это болото. Здесь то же самое начинается раньше — на втором акте, — а текста, который тебя там удерживал, заметно меньше: диалоги суше и длиннее.",
      en: "You already write that act three of BG3 is a swamp. The same thing starts earlier here — in act two — and there is noticeably less of the writing that kept you there: the dialogue is drier and longer.",
    },
    complaints: [
      {
        ru: "Второй акт растянут и завален однотипными боями",
        en: "Act two is stretched out and buried in samey fights",
      },
      {
        ru: "Броня двух типов заставляет пересобирать отряд под механику, а не под роль",
        en: "The two armour types force you to rebuild the party around a mechanic rather than a role",
      },
      {
        ru: "Финальный акт заметно сырее остальных",
        en: "The final act is noticeably rougher than the rest",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 67,
    fit: "no",
    tier: "D",
    summary: {
      ru: "Открытый мир по Древней Греции на сто с лишним часов: вопросики на карте, аванпосты и уровни снаряжения, без которых сюжет не пускает дальше.",
      en: "An open world across Ancient Greece for a hundred hours and more: question marks on the map, outposts and gear levels without which the story won't let you through.",
    },
    forYou: {
      ru: "Честно — почти ничего. Разве что постановка отдельных сюжетных линий и вид с горы; за это игру и хвалят те, кому она подошла.",
      en: "Honestly — almost nothing. At most the staging of a few story lines and the view from a mountain; that is what the people it suited praise it for.",
    },
    against: {
      ru: "Это ровно та конструкция, на которой ты вышел из Cyberpunk 2077 и ELDEN RING, и в записях ты назвал её дважды одними словами: карта победила сценарий. Здесь карта больше, а сценарий слабее обоих.",
      en: "This is exactly the construction you walked out of Cyberpunk 2077 and ELDEN RING over, and in your entries you named it twice in the same words: the map beat the script. Here the map is bigger and the script is weaker than either.",
    },
    complaints: [
      {
        ru: "Уровни врагов заставляют зачищать побочное, чтобы продолжить сюжет",
        en: "Enemy levels force you to clear side content in order to continue the story",
      },
      {
        ru: "Аванпосты и пещеры собраны по одному шаблону на всю карту",
        en: "Outposts and caves are built to one template across the whole map",
      },
      {
        ru: "Внутриигровой магазин ускорений — прямое признание того, что игра растянута",
        en: "The in-game shop selling speed-ups is a direct admission that the game is padded",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 72,
    fit: "no",
    tier: "D",
    summary: {
      ru: "Многопользовательское выживание: старт голым на побережье, всё остальное добывается, а построенное регулярно отбирают другие игроки.",
      en: "Multiplayer survival: you start naked on a shoreline, everything else has to be scavenged, and what you build gets taken off you by other players on a regular basis.",
    },
    forYou: {
      ru: "Ничего. Единственное совпадение — ощущение первого выхода в незнакомый мир, про которое ты писал в записи про Valheim.",
      en: "Nothing. The only overlap is that feeling of stepping out into an unknown world for the first time, which you wrote about in the Valheim entry.",
    },
    against: {
      ru: "Ты сформулировал это сам: против крафта как обязательного налога на всё интересное. Здесь налог и есть игра, и платить его надо ещё и в чужом расписании — базу сносят, пока ты на работе.",
      en: "You put it yourself: against crafting as a compulsory tax on everything interesting. Here the tax is the game, and you pay it on somebody else's schedule as well — the base gets torn down while you are at work.",
    },
    complaints: [
      {
        ru: "Потеря всего нажитого за одну ночь — не исключение, а норма",
        en: "Losing everything you own in a single night is not the exception, it is the norm",
      },
      {
        ru: "Новичка отстреливают быстрее, чем он успевает построить дверь",
        en: "A newcomer gets shot before he can build a door",
      },
      {
        ru: "Сотни часов уходят на добычу, а не на то, ради чего добывали",
        en: "Hundreds of hours go on gathering, not on what the gathering was for",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 75,
    fit: "no",
    tier: "D",
    summary: {
      ru: "Шутер-сервис: стрельба отличная, всё вокруг неё построено на цифрах снаряжения, которые обесцениваются с каждым сезоном.",
      en: "A live-service shooter: the gunplay is excellent, and everything around it is built on gear numbers that lose their value with every season.",
    },
    forYou: {
      ru: "Стрельба здесь действительно одна из лучших в жанре — это признают даже те, кто ушёл. На этом совпадения заканчиваются.",
      en: "The shooting here really is among the best in the genre — even the people who left admit it. That is where the overlap ends.",
    },
    against: {
      ru: "«Гринд ради цифр» — твоя формулировка из записи про Stardew Valley, и она описывает эту игру целиком. Добавь к этому, что часть купленного сюжета со временем убирают из игры.",
      en: "“Grinding for numbers” is your own phrase from the Stardew Valley entry, and it describes this game completely. Add to that the fact that some of the story people paid for gets removed from the game over time.",
    },
    complaints: [
      {
        ru: "Прогресс сгорает каждый сезон, и качаться надо заново",
        en: "Progress burns down every season and you level up again from scratch",
      },
      {
        ru: "Сюжетные кампании удаляли из игры уже после покупки",
        en: "Story campaigns have been deleted from the game after people bought them",
      },
      {
        ru: "Разобраться в том, что происходит, без сторонних гайдов невозможно",
        en: "Working out what is going on is impossible without third-party guides",
      },
    ],
    reviewsUsed: 40,
  },

  /* Picks of the second run — the regenerate button has to work the same way. */
  {
    gameId: 43,
    fit: "yes",
    tier: "S",
    summary: {
      ru: "Тактика на поле восемь на восемь, где игра заранее показывает каждый ход противника; партия — двадцать-тридцать минут.",
      en: "Tactics on an eight-by-eight board where the game shows you every enemy move in advance; a game runs twenty to thirty minutes.",
    },
    forYou: {
      ru: "Случайности нет вообще: проигрыш всегда просчёт. Ты хвалил Hollow Knight и Celeste одними и теми же словами — «виноват только я», — и здесь это доведено до логического конца. Плюс формат: партия короче твоего вечера.",
      en: "There is no chance at all: a loss is always a miscalculation. You praised Hollow Knight and Celeste in the same words — “only I am ever to blame” — and here that is taken to its logical end. Plus the format: a game is shorter than your evening.",
    },
    against: {
      ru: "Визуально это одна и та же сетка все двадцать часов, и сюжета в привычном смысле нет — а текст для тебя обычно и есть причина остаться.",
      en: "Visually it is one and the same grid for all twenty hours, and there is no story in the usual sense — and writing is normally your reason to stay.",
    },
    complaints: [
      {
        ru: "Отряды приходится открывать повторными прохождениями",
        en: "Squads have to be unlocked by replaying",
      },
      {
        ru: "Мелкий масштаб: разобрать, кто есть кто на поле, поначалу трудно",
        en: "Everything is small: telling who is who on the board is hard at first",
      },
      {
        ru: "Поздние острова сводятся к паре рабочих связок",
        en: "The late islands come down to a couple of combinations that work",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 41,
    fit: "yes",
    tier: "S",
    summary: {
      ru: "Два часа в доме, где каждая комната — история одного умершего родственника, рассказанная своей собственной механикой.",
      en: "Two hours in a house where every room is the story of one dead relative, told through a mechanic of its own.",
    },
    forYou: {
      ru: "Ни одна механика не повторяется дважды: эпизод отыграл своё и больше не встречается. Ты дословно этим хвалил Titanfall 2 — «в каждой миссии своя идея, которую потом ни разу не переиспользуют».",
      en: "Not one mechanic repeats twice: an episode plays its part and never comes back. You praised Titanfall 2 in exactly these words — “every mission has an idea of its own that never gets reused”.",
    },
    against: {
      ru: "Игры в привычном смысле тут нет: проиграть невозможно, сопротивления материала ноль. За два часа берут полную цену, и это вторая по частоте претензия.",
      en: "There is no game here in the usual sense: you cannot lose, and the material pushes back not at all. Two hours at full price, and that is the second most common complaint.",
    },
    complaints: [
      {
        ru: "Два часа за полную цену — самая частая претензия в отзывах",
        en: "Two hours at full price — the most common complaint in the reviews",
      },
      {
        ru: "Проиграть нельзя, вызова нет никакого",
        en: "You cannot lose; there is no challenge whatsoever",
      },
      {
        ru: "Эпизод с рыбным цехом вызывает у части игроков тошноту от качки камеры",
        en: "The cannery episode makes some players motion sick from the camera sway",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 57,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Фехтование на парированиях в линейной Японии эпохи Сэнгоку: уклоняться нельзя, прокачка почти ничего не решает.",
      en: "Parry-based swordplay in a linear Sengoku-era Japan: dodging is out, and levelling decides almost nothing.",
    },
    forYou: {
      ru: "ELDEN RING ты бросил из-за повторов в открытом мире — здесь мира нет, есть коридор с срезками и боссы. Прокачка не спасает: проходит тот, кто выучил ритм, то есть промах всегда твой.",
      en: "You dropped ELDEN RING over the repeats in its open world — here there is no world, there is a corridor with shortcuts and bosses. Levelling won't save you: the one who gets through is the one who learned the rhythm, which means the miss is always yours.",
    },
    against: {
      ru: "Порог входа выше всего, что ты играл: первые пять-десять часов уходят на то, чтобы перестать уклоняться по привычке. Часть игроков не переживает этого перелома.",
      en: "The barrier to entry is higher than anything you have played: the first five to ten hours go on unlearning the habit of dodging. Some players never survive that break.",
    },
    complaints: [
      {
        ru: "Первые часы ломают привычки, наработанные в других играх серии",
        en: "The first hours break habits built up in the studio's other games",
      },
      {
        ru: "Два-три босса выбиваются по сложности из всей игры",
        en: "Two or three bosses stand right out from the rest of the game in difficulty",
      },
      {
        ru: "Стелс-участки между боссами пресные и явно вторичны",
        en: "The stealth sections between bosses are bland and clearly secondary",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 42,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Четыре часа в лесу Вайоминга: смотритель вышки и голос в рации — весь сюжет держится на их разговоре.",
      en: "Four hours in the forests of Wyoming: a lookout in a tower and a voice on the radio — the whole story rests on their conversation.",
    },
    forYou: {
      ru: "Disco Elysium у тебя S с формулировкой «разговор и есть игра». Здесь ровно та же ставка, только короче в десять раз и без проверок навыков — ни одной цифры на экране.",
      en: "Disco Elysium is an S for you with the words “the conversation is the game”. The bet here is exactly the same, only ten times shorter and with no skill checks — not a single number on screen.",
    },
    against: {
      ru: "Финал разочаровывает многих: интрига, которую игра выстраивает три часа, разрешается тише, чем обещала. Если тебе важна отдача в конце, готовься.",
      en: "The ending disappoints a lot of people: the mystery the game builds for three hours resolves more quietly than it promised. If a payoff at the end matters to you, brace yourself.",
    },
    complaints: [
      {
        ru: "Финал считают скомканным даже те, кому игра понравилась",
        en: "Even people who liked it call the ending rushed",
      },
      {
        ru: "Ходьбы много, а занятий между разговорами почти нет",
        en: "There is a lot of walking and almost nothing to do between conversations",
      },
      {
        ru: "Карта и компас работают нарочито неудобно",
        en: "The map and compass are deliberately awkward to use",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 53,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Продолжение Hades: та же структура забега, другая героиня, добавлена подготовка заклинаний перед вылазкой.",
      en: "The sequel to Hades: the same run structure, a different protagonist, and spell preparation added before you set out.",
    },
    forYou: {
      ru: "Ты поставил первой части A и написал «встать можно в любой момент». Формат не изменился: двадцать минут на забег, диалоги между ними не повторяются.",
      en: "You gave the first one an A and wrote “you can stand up at any point”. The format hasn't changed: twenty minutes to a run, and the dialogue between them doesn't repeat.",
    },
    against: {
      ru: "Появился сбор ресурсов для заклинаний — небольшой, но это именно тот тип занятия, который ты называешь налогом. И это ранний доступ: часть контента ещё меняется.",
      en: "Resource gathering for the spells has appeared — a small amount of it, but it is precisely the kind of chore you call a tax. And it is early access: part of the content is still changing.",
    },
    complaints: [
      {
        ru: "Сбор ресурсов между забегами добавляет обязательной рутины",
        en: "Gathering resources between runs adds compulsory routine",
      },
      {
        ru: "Ранний доступ: баланс и концовки ещё переписывают",
        en: "Early access: the balance and the endings are still being rewritten",
      },
      {
        ru: "Вторая героиня заметно медленнее, привыкать придётся заново",
        en: "The new protagonist is noticeably slower; you have to get used to her from scratch",
      },
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 55,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Игра, состоящая почти целиком из боссов, нарисованных вручную в стилистике мультфильмов тридцатых годов.",
      en: "A game made almost entirely of bosses, drawn by hand in the style of thirties cartoons.",
    },
    forYou: {
      ru: "Коридоров между боями почти нет, собирательства нет, прокачки нет — только руки. Про Celeste ты написал, что четыреста смертей не злят, потому что смерть стоит полсекунды; здесь цена ошибки такая же.",
      en: "There are almost no corridors between fights, no collecting, no progression — only hands. About Celeste you wrote that four hundred deaths produce no anger because a death costs half a second; the price of a mistake here is the same.",
    },
    against: {
      ru: "Сложность распределена неровно, и пара боссов останавливает надолго. Ещё это игра для геймпада — на клавиатуре жалуются заметно чаще.",
      en: "The difficulty is spread unevenly, and a couple of bosses will stop you for a long while. It is also a game for a gamepad — complaints from keyboard players are noticeably more frequent.",
    },
    complaints: [
      {
        ru: "Несколько боссов выбиваются по сложности и стопорят прохождение",
        en: "A few bosses stand out in difficulty and stall the playthrough",
      },
      {
        ru: "Уровни-стрелялки на самолёте нравятся куда меньше остальных",
        en: "The aeroplane shooting levels are liked far less than the rest",
      },
      {
        ru: "На клавиатуре управление ощутимо хуже, чем на геймпаде",
        en: "On a keyboard the controls are palpably worse than on a pad",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 35,
    fit: "yes",
    tier: "B",
    summary: {
      ru: "Восемь часов головоломок с порталами и один из самых цитируемых текстов в играх; есть отдельная кооперативная кампания.",
      en: "Eight hours of portal puzzles and one of the most quoted scripts in games; there is a separate co-op campaign as well.",
    },
    forYou: {
      ru: "Обе твои опоры сразу: плотный ручной уровень и текст, ради которого не хочется проматывать. Ни карты, ни побочного, ни прокачки.",
      en: "Both of your anchors at once: dense hand-made levels and writing you don't want to skip through. No map, no side content, no progression.",
    },
    against: {
      ru: "Руки здесь почти не нужны — вся сложность в голове. Ты ценишь точное управление и отзывчивость, а этой игре они просто не требуются.",
      en: "Your hands are barely needed — all the difficulty is in your head. You value precise, responsive controls, and this game simply doesn't require them.",
    },
    complaints: [
      {
        ru: "Между головоломками много ходьбы по коридорам",
        en: "There is a lot of walking down corridors between puzzles",
      },
      {
        ru: "Часть решений сводится к поиску единственной белой стены",
        en: "Some solutions come down to finding the one white wall",
      },
      {
        ru: "Кооперативная кампания требует напарника и в одиночку недоступна",
        en: "The co-op campaign needs a partner and is closed to you alone",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 36,
    fit: "yes",
    tier: "B",
    summary: {
      ru: "Три часа, за которые жанр головоломок от первого лица придумали заново; предыстория второй части.",
      en: "Three hours that reinvented the first-person puzzle game; the prequel to the second one.",
    },
    forYou: {
      ru: "Три часа без единой лишней комнаты — та же формулировка, которой ты описал Hollow Knight. И начинать логично с неё: вторая часть прямо продолжает эту.",
      en: "Three hours with not one wasted room — the same phrase you described Hollow Knight with. And it makes sense to start here: the second game follows on directly.",
    },
    against: {
      ru: "Игра 2007 года, и это заметно: тестовые камеры выглядят одинаково серыми, а последняя треть заметно слабее начала.",
      en: "It is a 2007 game and it shows: the test chambers all look the same shade of grey, and the last third is noticeably weaker than the opening.",
    },
    complaints: [
      {
        ru: "Все камеры выглядят одинаково — визуального разнообразия нет",
        en: "All the chambers look alike — there is no visual variety",
      },
      {
        ru: "Финальная часть с побегом слабее основной",
        en: "The final escape section is weaker than the main body",
      },
      {
        ru: "Три часа — многие считают это скорее прологом, чем игрой",
        en: "Three hours — plenty of people call it a prologue rather than a game",
      },
    ],
    reviewsUsed: 38,
  },
  {
    gameId: 63,
    fit: "yes",
    tier: "A",
    summary: {
      ru: "Ролевая игра в пустоши Мохаве: почти любой конфликт решается разговором, а исход зависит от того, кого ты поддержал.",
      en: "A role-playing game in the Mojave wasteland: almost any conflict can be settled by talking, and the outcome depends on who you backed.",
    },
    forYou: {
      ru: "Первый проход поставил B, опасаясь возраста игры. Отзывы говорят обратное: люди возвращаются к ней спустя пятнадцать лет именно ради текста, и это твоя главная опора — Disco Elysium у тебя S, а первый акт Baldur's Gate 3 ты хвалил за спутников. Открытый мир здесь не карта с иконками: значков нет, есть дороги и разговоры.",
      en: "The first pass gave it a B, worried about the game's age. The reviews say the opposite: people come back to it fifteen years on precisely for the writing, and writing is your main anchor — Disco Elysium is an S for you, and you praised act one of Baldur's Gate 3 for its companions. The open world here is not a map of icons: there are no markers, there are roads and conversations.",
    },
    against: {
      ru: "Техническое состояние честно плохое: вылеты в поздней игре — обычное дело, и без сторонних правок многие не доигрывают. Боёвка слабая и остаётся такой до конца.",
      en: "The technical state is honestly bad: crashes late in the game are routine, and without third-party fixes plenty of people never finish. The combat is weak and stays that way to the end.",
    },
    complaints: [
      {
        ru: "Вылеты и зависания в поздней игре без сторонних исправлений",
        en: "Crashes and freezes late in the game without third-party fixes",
      },
      {
        ru: "Стрельба ощущается вяло даже по меркам своего времени",
        en: "The gunplay feels limp even by the standards of its time",
      },
      {
        ru: "Интерфейс и инвентарь рассчитаны на другую эпоху",
        en: "The interface and the inventory were designed for a different era",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 59,
    fit: "maybe",
    tier: "B",
    summary: {
      ru: "Экшен про Человека-паука в открытом Манхэттене: отличная постановка основной линии и стандартный набор побочных занятий вокруг неё.",
      en: "A Spider-Man action game in an open Manhattan: excellent staging on the main line and the standard set of side activities around it.",
    },
    forYou: {
      ru: "Полёты на паутине — лучшее ощущение движения в жанре, а основная линия короткая и поставлена плотно. Её одну можно пройти часов за пятнадцать.",
      en: "Web-swinging is the best sense of movement in the genre, and the main line is short and tightly staged. On its own it takes about fifteen hours.",
    },
    against: {
      ru: "Всё остальное — вышки, склады и случайные преступления на улицах, то есть ровно то, за что ты снёс Cyberpunk 2077 со словами «чистил карту вместо того, чтобы играть в историю».",
      en: "Everything else is towers, warehouses and random street crime — that is, exactly what you deleted Cyberpunk 2077 over, in your own words: “cleared the map instead of playing the story”.",
    },
    complaints: [
      {
        ru: "Побочные задания повторяются почти без изменений",
        en: "The side missions repeat with almost no variation",
      },
      {
        ru: "Обязательные эпизоды за других персонажей ломают темп",
        en: "Compulsory episodes as other characters break the pace",
      },
      {
        ru: "Открытый мир существует ради заполнения, а не ради истории",
        en: "The open world exists to be filled in, not to serve the story",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 65,
    fit: "maybe",
    tier: "C",
    summary: {
      ru: "Мрачный рогалик про отряд наёмников, которых игра методично изматывает: стресс, болезни и смерть без возврата.",
      en: "A grim roguelike about a party of mercenaries the game methodically wears down: stress, disease and death with no way back.",
    },
    forYou: {
      ru: "Одна вылазка — двадцать-тридцать минут, и выйти можно между ними. Решения жёсткие и внятные, случайность видна честно.",
      en: "One expedition is twenty to thirty minutes, and you can leave between them. The decisions are hard and legible, and the randomness is shown honestly.",
    },
    against: {
      ru: "Между вылазками надо лечить, нанимать и копить — это время, а не умение. Ты писал ровно об этом про Stardew Valley: «оптимизирую маршрут вместо того, чтобы отдыхать».",
      en: "Between expeditions you have to heal, hire and save up — that is time, not skill. You wrote about exactly this in the Stardew Valley entry: “optimising my route instead of relaxing”.",
    },
    complaints: [
      {
        ru: "Между вылазками много обязательной возни в городе",
        en: "There is a lot of compulsory fussing about in town between expeditions",
      },
      {
        ru: "Случайные промахи при 95% решают исход боя чаще, чем хотелось бы",
        en: "Random misses at 95% decide fights more often than anyone would like",
      },
      {
        ru: "Поздняя игра требует нескольких равных отрядов, то есть фарма",
        en: "The late game wants several parties of equal strength, which means farming",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 70,
    fit: "no",
    tier: "D",
    summary: {
      ru: "Открытый мир в пустоши с обязательной стройкой поселений и радиовызовами, которые не заканчиваются никогда.",
      en: "An open world in the wasteland with compulsory settlement building and radio calls that never stop coming.",
    },
    forYou: {
      ru: "Стрельба заметно лучше, чем в предыдущих частях серии, — это единственное, что хвалят почти все.",
      en: "The shooting is noticeably better than in the earlier games of the series — that is the one thing nearly everyone praises.",
    },
    against: {
      ru: "Стройка и защита поселений — тот самый крафт как обязательный налог, из-за которого ты ушёл из Valheim, только вместо руды здесь мусор. Диалоги при этом сведены к четырём вариантам ответа, а текст — твоя главная причина терпеть длинное.",
      en: "Building and defending settlements is that same crafting as a compulsory tax you walked out of Valheim over, only here it is junk instead of ore. And the dialogue is cut down to four answer options, while writing is your main reason for sitting through anything long.",
    },
    complaints: [
      {
        ru: "Радио бесконечно шлёт однотипные задания на защиту поселений",
        en: "The radio sends an endless stream of identical settlement-defence jobs",
      },
      {
        ru: "Четыре варианта ответа в диалоге вместо реального выбора",
        en: "Four answer options in a dialogue instead of a real choice",
      },
      {
        ru: "Сортировка мусора ради стройки занимает больше времени, чем сюжет",
        en: "Sorting junk for the building takes more time than the story does",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 73,
    fit: "no",
    tier: "D",
    summary: {
      ru: "Изометрический симулятор выживания в зомби-апокалипсисе, устроенный вокруг голода, ран, настроения и очень медленной смерти.",
      en: "An isometric survival simulator in the zombie apocalypse, built around hunger, wounds, mood and a very slow death.",
    },
    forYou: {
      ru: "Ничего существенного. Первые часы дают ту же тревогу неизвестности, что ты описывал в записи про Valheim, — на этом всё.",
      en: "Nothing substantial. The first hours give the same unease of not knowing that you described in the Valheim entry — and that is all.",
    },
    against: {
      ru: "Игра целиком состоит из обслуживания персонажа: еда, вода, температура, инвентарь. Твоя фраза про Stardew Valley — «оптимизирую маршрут вместо того, чтобы отдыхать» — описывает её точнее любого отзыва.",
      en: "The game consists entirely of maintaining your character: food, water, temperature, inventory. Your line from the Stardew Valley entry — “optimising my route instead of relaxing” — describes it better than any review.",
    },
    complaints: [
      {
        ru: "Смерть окончательная, и сотня часов пропадает за одну ошибку",
        en: "Death is final, and a hundred hours are gone on a single mistake",
      },
      {
        ru: "Управление и инвентарь освоить без гайдов почти невозможно",
        en: "The controls and the inventory are next to impossible to learn without guides",
      },
      {
        ru: "Часы уходят на быт, а не на события",
        en: "Hours go on housekeeping rather than on events",
      },
    ],
    reviewsUsed: 40,
  },
  {
    gameId: 76,
    fit: "no",
    tier: "D",
    summary: {
      ru: "Средневековая песочница с боями на сотни солдат и полностью открытой картой, которая не ставит перед игроком никакой цели.",
      en: "A medieval sandbox with battles of hundreds of soldiers and a fully open map that sets the player no goal at all.",
    },
    forYou: {
      ru: "Сами бои действительно уникальны: ничего похожего по масштабу в твоей библиотеке нет.",
      en: "The battles themselves really are unique: there is nothing of that scale anywhere in your library.",
    },
    against: {
      ru: "Игра не говорит, чем в ней заниматься, и первые часы уходят на караваны и накопление денег. Всё, что ты бросал — Valheim, Stardew Valley, ELDEN RING, — начиналось примерно так же: сначала работа, потом, может быть, интересное.",
      en: "The game won't tell you what to do in it, and the first hours go on caravans and building up money. Everything you have dropped — Valheim, Stardew Valley, ELDEN RING — started roughly the same way: work first, then maybe something interesting.",
    },
    complaints: [
      {
        ru: "Сюжетная линия обрывается и фактически не завершена",
        en: "The story line breaks off and is effectively unfinished",
      },
      {
        ru: "Первые часы — торговля и накопление, а не бои",
        en: "The first hours are trading and saving up, not battles",
      },
      {
        ru: "Осады однообразны, несмотря на масштаб",
        en: "Sieges are monotonous despite the scale",
      },
    ],
    reviewsUsed: 38,
  },
];

function demoDeepDives(locale: Locale): DemoDeepDive[] {
  return DEEP_DIVES.map((dive) => ({
    gameId: dive.gameId,
    fit: dive.fit,
    tier: dive.tier,
    summary: say(dive.summary, locale),
    forYou: say(dive.forYou, locale),
    against: say(dive.against, locale),
    complaints: dive.complaints.map((line) => say(line, locale)),
    reviewsUsed: dive.reviewsUsed,
  }));
}

/* ================= Game demos ================= */

interface RawDemoReview {
  gameId: number;
  steamAppId: number;
  title: string;
  verdict: "later" | "dropped";
  tier: "S" | "A" | "B";
  rating: number;
  createdAt: Date;
  note: Localized;
}

/**
 * Opinions on game demos live in a list of their own: the game isn't in the
 * library, yet the impression exists — usually a trace of the latest festival.
 */
const DEMOS: RawDemoReview[] = [
  {
    gameId: 901,
    steamAppId: 1809540,
    title: "Nine Sols",
    verdict: "later",
    tier: "A",
    rating: 5,
    createdAt: at(12, 21, 15),
    note: {
      ru: "Парирование ощущается почти как в Sekiro, и рисовка держит внимание сама по себе. Двадцать минут демо — и я уже хочу полную версию.",
      en: "The parrying feels almost like Sekiro, and the art holds your attention all by itself. Twenty minutes of demo and I already want the full thing.",
    },
  },
  {
    gameId: 902,
    steamAppId: 813230,
    title: "ANIMAL WELL",
    verdict: "later",
    tier: "S",
    rating: 5,
    createdAt: at(13, 20, 40),
    note: {
      ru: "За полчаса ни одного слова текста, и при этом понятно всё: куда идти, что нельзя трогать, где я что-то пропустил. Вот это и есть ручной левел-дизайн.",
      en: "Half an hour and not one word of text, and still everything is clear: where to go, what not to touch, where I missed something. This is what hand-made level design means.",
    },
  },
  {
    gameId: 903,
    steamAppId: 2231450,
    title: "Pizza Tower",
    verdict: "dropped",
    tier: "B",
    rating: 3,
    createdAt: at(13, 20, 5),
    note: {
      ru: "Скорость приятная, управление отзывчивое, но шум и мельтешение на экране такие, что через десять минут я устал сильнее, чем за час Celeste.",
      en: "The speed is pleasant and the controls are responsive, but the noise and the flicker on screen are such that ten minutes left me more tired than an hour of Celeste.",
    },
  },
];

function demoDemos(locale: Locale): DemoReviews {
  return DEMOS.map((review) => ({
    gameId: review.gameId,
    steamAppId: review.steamAppId,
    title: review.title,
    headerImage: header(review.steamAppId),
    verdict: review.verdict,
    tier: review.tier,
    rating: review.rating,
    createdAt: review.createdAt,
    note: say(review.note, locale),
  }));
}

/* ================= Statistics ================= */

const DEMO_FREE_SKIPS: FreeSkips = {
  available: 2,
  earned: 5,
  used: 3,
  reviewedCount: 15,
};

const DEMO_STATS: Stats = (() => {
  const totalGames = RECORDS.length;
  const totalMinutes = RECORDS.reduce(
    (sum, record) => sum + record.playtimeAtLastEntry,
    0
  );
  const rated = RECORDS.filter((record) => record.rating != null);
  const byVerdict = (verdict: string) =>
    RECORDS.filter((record) => record.verdict === verdict).length;

  return {
    totalGames,
    totalMinutes,
    avgMinutes: totalGames > 0 ? Math.round(totalMinutes / totalGames) : 0,
    // A streak of days with entries — short in the demo, and that's honest
    streak: 3,
    wallOfShame: DEMO_SKIPS.filter((skip) => skip.reasonType === "shame").map(
      (skip) => game(skip.gameId).title
    ),
    totalLibrary: LIBRARY.length,
    poolSize: DEMO_POOL.length,
    excludedCount: LIBRARY.filter((item) => item.excluded).length,
    activeCount: DEMO_SLOTS.length,
    skippedCount: DEMO_SKIPS.length,
    steamCount: RECORDS.filter((record) => record.origin === "steam").length,
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

const DEMO_REVIEW_COUNT = RECORDS.length;

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

const DEMO_TRACKER: TrackerData = {
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
const DEMO_PRE_TRACKER: PreTracker = (() => {
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
 * A single entry point for the demo pages.
 *
 * Everything the demo shows comes out of here in one language, chosen once per
 * request. Consumers get plain strings and never learn that a second language
 * exists — which is the point: a page that has to remember to unwrap a pair of
 * translations is a page that will forget in exactly one place.
 */
function build(locale: Locale) {
  return {
    userId: DEMO_USER_ID,
    user: demoUser(locale),
    library: demoLibrary(locale),
    records: demoRecords(locale),
    tags: demoTags(locale),
    slots: DEMO_ACTIVE_SLOTS,
    pool: DEMO_POOL,
    attention: DEMO_ATTENTION,
    tierList: DEMO_TIER_LIST,
    history: demoHistory(locale),
    diaryTags: demoDiaryTags(locale),
    diaryMentions: demoDiaryMentions(locale),
    taste: demoTasteProfile(locale),
    recommendations: run(RUN, locale),
    /** The second run, shown after "regenerate". Same shape, other games. */
    recommendationsAlt: run(RUN_ALT, locale),
    deepDives: demoDeepDives(locale),
    demos: demoDemos(locale),
    stats: DEMO_STATS,
    freeSkips: DEMO_FREE_SKIPS,
    reviewCount: DEMO_REVIEW_COUNT,
    tracker: DEMO_TRACKER,
    preTracker: DEMO_PRE_TRACKER,
    sessions: DEMO_TRACKER.sessions,
  } as const;
}

export type DemoFixtures = ReturnType<typeof build>;

/*
 * Built once per language and kept. The fixtures never change, and the demo is
 * a public page: rebuilding four hundred strings on every request would be work
 * done to produce the same object again.
 */
const BUILT = new Map<Locale, DemoFixtures>();

export function demoFixtures(locale: Locale): DemoFixtures {
  const cached = BUILT.get(locale);
  if (cached) return cached;

  const fresh = build(locale);
  BUILT.set(locale, fresh);
  return fresh;
}
