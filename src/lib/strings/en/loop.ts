import type * as Ru from "../ru/loop";
import { THRESHOLDS } from "../../vocab";

/** The loop itself: choosing a game, the active contracts, skipping, writing an impression. */
export const choose: typeof Ru.choose = {
  eyebrow: "What to play next",
  collected: (date: string) => ` · generated ${date}`,
  regenerate: "Regenerate picks",

  diceIdle: "🎰 Can't decide — roll the dice",
  slotsFull: "all three contracts taken — close one first",
  diceTitle: "The dice creates a contract right away",
  diceText: (rollable: number, slotsLeft: number) =>
    `The dice rolls between ${rollable} ${rollable === 1 ? "pick" : "picks"} — tier D games are left out. You won't be able to just skim whatever comes up: ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} minutes and a first impression, otherwise you'll have to bail, and bailing without a reason goes on the wall of shame. Free contracts: ${slotsLeft}.`,
  diceGo: "Roll it",
  diceCancel: "Never mind",
  diceRolling: "Dice is rolling…",

  playedHours: (hours: number) => `${hours}h played`,
  hoursShort: (hours: number) => `${hours}h`,
  neverLaunched: "never launched",
  take: "Take the contract",
  taking: "Taking…",
  taken: (title: string) => `Contract taken: ${title}`,
  takenGo: "Open \"Now\"",
  next: "Next",
  contractNote: `A contract is a commitment: at least ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} minutes and a written first impression. You can hold ${THRESHOLDS.MAX_ACTIVE_SLOTS} at a time.`,
  profileSummary: "What Curio figured out about you",
  groundingDescription: "judging by the store description",
  groundingGuess: "don't know this game — guessing from the genre",

  runStages: {
    collecting: "Collecting reviews and candidates",
    thinking: "Reading your reviews and sorting into tiers",
    saving: "Saving the picks",
  },
  runPicks: (n: number) => `${n} ${n === 1 ? "game sorted" : "games sorted"}`,
  runElapsed: (sec: number) => `${sec}s`,
  runHint: "You can leave the page — the run keeps going",
  runStuck: "The run stopped responding. Try starting it again.",
  runRetry: "Start again",

  gateTitle: (left: number) => `${left} more ${left === 1 ? "review" : "reviews"} and I can advise`,
  gateText:
    "Picks are built from your own words, not from genres. With this few reviews there's nothing for Curio to hold on to.",

  emptyTitle: (reviews: number) =>
    `Let's read your taste from ${reviews} ${reviews === 1 ? "review" : "reviews"}`,
  emptyText:
    "Curio reads everything you've written, finds patterns you never spelled out, and sorts the unplayed part of your library into tiers — explaining why each one is for you.",
  thinNote: (reviews: number) =>
    `${reviews} ${reviews === 1 ? "review" : "reviews"} so far — enough to work with, but the breakdown will be rough: patterns only start showing closer to ${THRESHOLDS.MIN_REVIEWS_FOR_CONFIDENCE}. The more you write, the less guessing.`,
  emptyCta: "Generate picks",
  emptyBusy: "Starting…",
  emptyHint: "Takes about a minute · you can leave the page",

  blindText: (pool: number) =>
    `No picks yet — you can still choose the old way, a blind roll across all ${pool} games in the pool.`,
  blindCta: "🎰 Spin the roulette",
  blindBusy: "Spinning…",
  blindFull: "all three contracts taken",
};

export const now: typeof Ru.now = {
  contracts: "Active contracts",
  contractsCount: (slots: number, pool: number) =>
    `${slots} of ${THRESHOLDS.MAX_ACTIVE_SLOTS} · ${pool} games in the pool`,
  playedOf: (played: string) => `${played} of ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} min`,
  record: "Write an impression",
  refresh: "Refresh playtime",
  refreshing: "Asking Steam…",
  skip: "Skip",
  syncLibrary: "Sync library",
  syncing: "Syncing…",
  synced: (count: number) => `Done: ${count} games`,

  freeSlot: "Free contract",
  freeSlotHint: "take a pick or roll the dice",

  updates: "You've played more",
  updatesHint: "your opinion may have shifted — add a line",
  updateDelta: (delta: string) => `+${delta} since the last entry`,
  addEntry: "Add an entry",
  queue: "Needs an answer",
  queueCount: (total: number) => `${total} games played with no verdict`,
  hasReview: "review written — needs a verdict",
  setVerdict: "Verdict",
  finished: "Finished",
  endless: "In rotation",
  endlessHint: "A game with no ending — Dota, PUBG, sandboxes: \"finished\" makes no sense",
  dropped: "Dropped",
  review: "Review",

};

export const skip: typeof Ru.skip = {
  title: "Skip the game",
  freeSkip: "Free skip",
  freeSkipHint: "No shame — you earned it with reviews",
  freeSkipCount: (n: number) => `${n} left`,
  orReason: "or pick a reason",
  legitimate: "Fair reasons — recorded without judgement:",
  notAGame: "Not a game / a demo",
  wontLaunch: "Won't launch",
  notOwned: "No longer in the library",
  shameHeading: "Anything else — goes on the wall of shame 😔",
  other: "Another reason",
  otherPlaceholder: "Why are you giving up?",
  submit: "Skip",
  pickReason: "Pick a reason",
  writeReason: "Write a reason",
};

export const sheet: typeof Ru.sheet = {
  played: (time: string) => `Played ${time}`,
  sinceLast: (delta: string) => ` · +${delta} since last entry`,
  appId: "Appid or a link to the demo",
  verdict: "Verdict",
  verdictOptional: " (if it changed)",
  worth: "Was it worth the time",
  tier: "Tier",
  impression: "Impression",
  optional: " (optional)",
  notePlaceholder: "What hooked you, what annoys you, will you come back",
  cancel: "Cancel",
  saving: "Saving…",
  minChars: (n: number) => `The note needs at least ${n} characters`,
  pickVerdict: "Pick a verdict",
  nothingToSave: "Nothing to save",
  takeLede: "Curio read it",
  questionsLede: "A couple of questions about what the review leaves out. Answering is optional.",
  answerOpen: "Answer",
  answerSave: "To the diary",
  answerSkip: "Skip",
  questionsDone: "Done",
  quotesLede: "How you talked about this game before",
  driftHint: (rating: number, suggested: number, entries: number) =>
    `${rating} has been standing for ${entries} ${entries === 1 ? "entry" : "entries"}, and the latest ones read ${suggested < rating ? "colder" : "warmer"}. Make it ${suggested}?`,
  driftApply: (suggested: number) => `Make it ${suggested}`,
};
