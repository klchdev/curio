import type * as Ru from "../ru/intro";
import { THRESHOLDS } from "../../vocab";

/** First contact: the landing page, onboarding and the demo walkthrough. */
export const landing: typeof Ru.landing = {
  authFailed: "Steam didn't confirm the login. Try again — if it keeps happening, tell me and I'll check the logs.",
  heroTop: "A thousand games in the library",
  heroAccent: "and nothing to launch",
  lede: "You write down what a game left you with — Curio reads it and works out your taste from it: what you praise, what makes you quit, what you drop an hour in. Then it sorts the unplayed into tiers and says why each one is for you. Not by genre, not by other people's scores. Free.",
  openSource: "Open source · MIT licence · runs on your own key",
  login: "Sign in with Steam",
  loginHint: "All it needs is a public profile — the library comes in on its own",
  demoCta: "Try it without an account",
  demoHint: "A made-up player's diary — press \"generate\" and watch what Curio pulls out of it",

  pickEyebrow: "What a pick looks like",
  pickNote: "Built from a made-up diary — yours would quote your own entries instead.",

  howTitle: "How it works",
  step1Title: "Your own AI key",
  step1Text: "Gemini, Claude or GPT — a key takes a minute to get from the provider and goes into settings. Requests go out in your name: this service pays for none of them and keeps no key of its own.",
  step2Title: "Reviews of what you've played",
  step2Text: `Whatever you wrote on Steam game pages comes over with one button, the rest you write by hand. From ${THRESHOLDS.MIN_REVIEWS_FOR_AI} reviews on, Curio has something to hold on to.`,
  step3Title: "A read on your taste, picks and verdicts",
  step3Text: "The model reads everything you've written, puts your taste into words and sorts the unplayed part of your library into tiers — citing your own words, not genres.",

  featuresTitle: "What's inside",
  featureDiary: "Impression diary",
  featureDiaryText: "Entries about one game gather into a thread, each stamped with playtime — you see how your opinion moved, not just how it ended.",
  featurePicks: "Picks on what to play",
  featurePicksText: "The unplayed part sorted into tiers, with a reason for every game. Can't decide yourself — roll the dice.",
  featureTiers: "Tier list",
  featureTiersText: "Everything you've played laid out in rows from S to F, covers dragged with the mouse.",
  featureDeep: "A deep dive on one game",
  featureDeepText: "Curio reads player reviews on Steam and checks them against your taste: worth launching, or not your thing.",
  featureChrono: "Chronology",
  featureChronoText: "When and how much you actually play — by hour of day, by day, by game.",
  featureDemos: "Demos",
  featureDemosText: "Next Fest impressions live apart from the library, with verdicts of their own, \"awaiting release\" among them.",

  freeTitle: "Free, open, running on your key",
  freeText: "There is no subscription and never will be: the AI is paid for by your key, straight to the provider, not from a shared bill. The key is stored encrypted and never shown back, even to you. The code is open — you can run your own copy and trust nobody else's server at all.",

  sponsorTitle: "A non-commercial project",
  sponsorText:
    "The service carries no inference bill of its own, but hosting and a domain remain — that is where support goes, if you feel like giving any. It buys nothing in return: no features, no priority, no access. Everything works the same whether you paid or not.",
  sponsorCta: "Sponsor via GitHub",
  sponsorCtaBoosty: "Sponsor via Boosty",

  footerDisclaimer:
    "Not affiliated with Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation.",
  footerGithub: "Source on GitHub",
  footerSponsor: "Sponsor the project",
};

export const onboarding: typeof Ru.onboarding = {
  title: "Setup",
  lede: "Four steps, about five minutes. Without the first one nothing smart works; without the rest Curio has nothing to read.",
  stepDone: "done",

  keyShort: "Key",
  libraryShort: "Library",
  reviewsShort: "Reviews",
  doneShort: "Done",

  skip: "Skip and look around",
  back: "Back",
  next: "Next",
  finish: "Open the app",
  finishing: "Opening…",
  resume: "Back to setup",

  keyTitle: "AI key",
  keyText:
    "Breakdowns, picks and verdicts are made by an AI model running on your key — this service keeps none of its own. Gemini has a free tier: enough to try everything.",
  keyDone: (mask: string) => `Key is in place (${mask})`,

  libraryTitle: "Library from Steam",
  libraryText:
    "Curio pulls your game list and playtime from Steam. The playtime isn't decoration: every diary entry is stamped with it, which is how you see at what hour your opinion turned.",
  libraryCta: "Pull the library",
  libraryBusy: "Asking Steam…",
  libraryDone: (n: number) => `${n} ${n === 1 ? "game" : "games"} in the library`,
  libraryFailed:
    "Steam didn't hand the library over. Check that your profile and game list are public — Valve won't share a private list even with its owner.",

  reviewsTitle: "Reviews of what you've played",
  reviewsText: (need: number) =>
    `Curio advises from your words, not from genres: it reads what you praise and what you gripe about, game after game. With fewer than ${need} reviews there's nothing to hold on to — the picks simply won't come together.`,
  reviewsProgress: (have: number, need: number) => `${have} of ${need}`,
  reviewsEnough: "That's enough reviews — Curio has something to read",
  reviewsLeft: (left: number) => `${left} ${left === 1 ? "review" : "reviews"} to go`,
  reviewsImport: "Import reviews from Steam",
  reviewsImportBusy: "Reading your profile…",
  reviewsImportHint:
    "Everything you wrote on Steam game pages becomes a diary entry. You set the verdict on each one yourself.",
  reviewsImportNone: "No reviews on your profile — so we write them by hand",
  reviewsManual: "Write one yourself",
  reviewsManualHint:
    "\"Now\" holds the games you've put real hours into with no verdict yet: easiest place to start, the impression is still fresh.",

  readyTitle: "All set",
  readyText:
    "Next stop is the \"Choose\" zone: Curio reads the diary and sorts the unplayed part into tiers. The first run takes about a minute.",
  readyGaps: "Still open:",
  readyGapsHint: "You can come back to setup any time — it isn't going anywhere.",

  needLibraryTitle: "The library is empty",
  needLibraryText:
    "Steam hasn't been asked yet, or it returned nothing. With no game list there's nothing to advise on and nothing to dig into.",
  needLibraryCta: "Pull the library",
  needReviewsTitle: (left: number) =>
    `${left} more ${left === 1 ? "review" : "reviews"} and Curio starts talking`,
  needReviewsText:
    "The taste profile is built out of reviews and nothing else. Bring over what you wrote on Steam, or start with the games you've already sunk hours into.",
  needReviewsCta: "Sort out the reviews",
};

export const demo: typeof Ru.demo = {
  title: "Demo",
  banner: "Demo data: the library and the reviews are made up",
  ctaTitle: "This could be your diary",
  ctaText:
    "Sign in with Steam — the library comes in on its own and your profile reviews import with one button. The service is free and runs on your own AI key.",
  ctaButton: "Sign in with Steam",
  backToLanding: "Back to the homepage",
  skipToEnd: "Skip to the finished demo",
  readyKey: "AI key connected",
  readyKeyHint:
    "In the real app the key is yours: Curio runs on it and takes nothing on top.",
  readyLibrary: (n: number) => `${n} ${n === 1 ? "game" : "games"} in the library`,
  readyReviews: (n: number) => `${n} ${n === 1 ? "review" : "reviews"}`,
};
