import type * as Ru from "../ru/results";

/** What the loop leaves behind: the deep dive, the tier list, the totals, the timeline. */
export const deep: typeof Ru.deep = {
  button: "Dig deeper",
  askAny: "Ask about any game",
  askAnyHint: "Any game in your library — Curio reads it against your reviews",
  askPlaceholder: "Start typing a title…",
  askNothing: "Nothing found",
  askNeverPlayed: "never launched",
  writeReview: "Write a review",
  addToReview: "Add to the review",
  loading: "Reading player reviews…",
  stageFetch: "Curio is collecting player reviews from Steam",
  stageRead: "Curio reads them against your own reviews",
  stageConclude: "Putting the verdict together",
  hint: "Curio reads Steam reviews and checks them against your taste",
  summary: "What it actually is",
  forYou: "Why it's for you",
  against: "What may put you off",
  complaints: "What people complain about",
  refresh: "Read again",
  revised: (from: string, to: string) => `the deep dive changed the tier: ${from} → ${to}`,
  used: (n: number) => `from ${n} player ${n === 1 ? "review" : "reviews"}`,
  fitYes: "Worth launching",
  fitMaybe: "Depends on mood",
  fitNo: "Not your game",
};

export const board: typeof Ru.board = {
  title: "Tier list",
  subtitle: (total: number) => `${total} games placed · drag covers between rows`,
  dropHere: "drop it here",
  empty: "empty",
};

export const recap: typeof Ru.recap = {
  statReviews: "reviews",
  statSplit: (own: number, steam: number) => `${own} here · ${steam} from Steam`,
  statLibrary: "games in library",
  statStreak: "day streak",
  statShame: "on the wall of shame",
  statEndless: "in rotation",
  importSteam: "Import reviews from Steam",
  importing: "Reading your profile…",
  imported: (n: number) => `Imported ${n} ${n === 1 ? "review" : "reviews"}`,
  importedNone: "No new reviews found on your profile",
  redated: (n: number) => `Restored the Steam date on ${n} ${n === 1 ? "entry" : "entries"}`,
  importHint: "Reviews from your profile become diary entries — you set the verdict yourself",
  diary: "Impression diary",
  allDiary: "full diary",
  demos: "Demos",
  allDemos: "all demos",
};

export const chrono: typeof Ru.chrono = {
  title: "Chronology",
  lede: "When and how much you actually play",
  nav: "Chronology",
  empty:
    "The history starts from scratch — Steam doesn't hand its own over. Play a bit and the first hours will show up here.",
  since: (date: string) => `Tracking since ${date}`,
  silent: "The tracker has been quiet for over a day — check that polling is running",
  playingNow: "Playing now",

  totalHours: "Hours in range",
  sessions: "Sessions",
  average: "Average session",
  longest: "Longest",
  streak: "Day streak",
  nights: "Night hours",

  heatmap: "When you play",
  heatmapHint: "Hour of day across, weekday down — in your own timezone",
  daily: "By day",
  top: "What you played",
  topHint: "Minutes from the Steam counter where it confirmed them, otherwise from the session clock",
  recent: "Recent sessions",
  untracked: "Outside sessions",
  untrackedHint:
    "Minutes Steam counted while polling couldn't see the player: private profile, invisible mode, or the app was down",
  before: "Before the tracker",
  beforeHint:
    "Recovered from the diary: two entries about a game show how much was played between them, but not at what hours. So these hours stay out of the heatmap, the days and the streak above.",
  beforePeriod: (from: string, to: string) => `${from} — ${to}`,
  beforeMonths: "By month",
  beforeGames: "By game",
  beforeTotal: (hours: string) => `${hours} recovered`,
  ongoing: "ongoing",
  byCounter: "from the Steam counter",
  byClock: "from the polling clock — the counter has not confirmed yet",
  range30: "30 days",
  range90: "90 days",
  rangeAll: "All time",
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};
