import type * as Ru from "../ru/shell";
import { THRESHOLDS } from "../../vocab";

/** The frame around everything: navigation, page chrome, the dock, the owner-only test accounts. */
export const nav: typeof Ru.nav = {
  diary: "Diary",
  demos: "Demos",
  profile: "Profile",
  logout: "Log out",
};

export const pages: typeof Ru.pages = {
  home: "Home",
  back: "Back",
  diary: "Diary",
  diaryCount: (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`,
  diaryGames: (n: number) => `${n} ${n === 1 ? "game" : "games"}`,
  diaryEmpty: "Empty so far. Take your first contract!",
  diaryThread: (n: number) => `${n} ${n === 1 ? "entry" : "entries"} on this game`,
  diarySince: "the whole arc of your opinion",
  mentionedIn: (n: number) =>
    `Mentioned in ${n} ${n === 1 ? "entry" : "entries"} about other games`,
  entryFirst: "first impression",
  entryUpdate: "follow-up",
  entryVerdict: "verdict change",
  entryFinal: "final word",
  askCurio: "Ask Curio",
  askCurioBusy: "Reading…",
  askCurioFailed: "Did not work, try again",
  askCurioLede: "Curio read it",
  askCurioClose: "Close",
  tagAdd: "tag",
  tagRemove: "remove tag",
  tagComplaint: "gripe",
  tagPraise: "praise",
  entryAdvisor: "AI advice",
  fromSteam: "from Steam",
  shame: "wall of shame",
  skipped: "skipped",
  addNote: "Add to the review",

  demos: "Demos",
  demosLede: "Impressions from Next Fest and other demos",
  demosEmpty: "Empty so far. Played a demo at Next Fest? Add an impression.",
  demoAdd: "+ Add a demo review",
  demoNew: "New demo",
  demoDelete: "Delete",
  demoConfirm: "Delete this demo review?",
  openInSteam: "Open in Steam ↗",

  profile: "Profile",
  backlog: "Backlog progress",
  poolDone: (percent: number) => `${percent}% of the pool done`,
  inPool: "In the roulette pool",
  activeSlots: "Active contracts",
  alreadyPlayed: "Already played (>15 min)",
  excluded: "Excluded",
  statistics: "Statistics",
  ratedGames: "Games rated",
  totalTime: "Total time",
  avgPerGame: "Average per game",
  avgRating: "Average rating",
  verdicts: "Verdicts",
  streakWeeks: "Streak (weeks without shame)",
  wallOfShame: "Wall of shame",
  cleanRecord: "Clean record! Not a single shameful skip.",
};

export const dock: typeof Ru.dock = {
  choose: "Choose",
  chooseHint: (picks: number) =>
    picks > 0 ? `${picks} ${picks === 1 ? "pick" : "picks"} · dice` : "AI picks",
  now: "Now",
  nowHint: (slots: number, queue: number) =>
    `${slots} of ${THRESHOLDS.MAX_ACTIVE_SLOTS} contracts · ${queue} to sort out`,
  recap: "Recap",
  recapHint: (reviews: number) =>
    `${reviews} ${reviews === 1 ? "review" : "reviews"} · tiers · diary`,
  sync: "Refresh from Steam",
  syncing: "Asking Steam…",
  synced: (count: number) => `Done: ${count} games`,
  syncAgo: (when: string) => `checked ${when}`,
  syncNever: "never checked",
  syncWhy: "Picks up whatever you bought since last time. Playtime arrives on its own, every half hour.",
};

export const dev: typeof Ru.dev = {
  title: "Test accounts",
  hint: "A debugging device for whoever runs this instance: empty accounts to walk through scenarios without wrecking your own diary. They stay out of every public statistic.",
  create: "Create a test account",
  labelPlaceholder: "Name",
  switchTo: "Sign in",
  back: "Back to my account",
  deleteOne: "Delete",
  empty: "None yet",
};
