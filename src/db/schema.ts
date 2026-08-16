import { pgTable, text, integer, serial, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  steamId: text("steam_id").notNull().unique(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  lastLibrarySync: timestamp("last_library_sync"),

  /*
   * The LLM key belongs to each person. The service pays for no inference and
   * keeps no server-side key at all, so an empty (provider, key) pair means
   * exactly one thing: AI features are off for this person.
   *
   * The ciphertext lives whole in one column; parsing happens in secret-box.ts.
   * The model is stored apart from the provider: every provider has several,
   * and choosing between the cheap one and the smart one is up to the person
   * paying the bill.
   */
  llmProvider: text("llm_provider", { enum: ["gemini", "anthropic", "openai"] }),
  llmKeyEncrypted: text("llm_key_encrypted"),
  llmModel: text("llm_model"),

  /*
   * The moment the person finished onboarding. Not a boolean flag: the date
   * shows how many people get stuck and at which step — the first thing we'll
   * have to fix after a public launch.
   */
  onboardingCompletedAt: timestamp("onboarding_completed_at"),

  /*
   * A test account created by the instance owner to walk through scenarios.
   * Steam OpenID hands out one steam_id per person, so on these rows it is
   * synthetic (prefixed `test:`) and can never collide with a real one.
   *
   * The flag is not only about signing in: such accounts must drop out of any
   * public statistics, or those lie by exactly the size of my experiments.
   */
  isTest: boolean("is_test").notNull().default(false),
  createdByUserId: integer("created_by_user_id").references((): AnyPgColumn => users.id),

  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  steamAppId: integer("steam_app_id").notNull().unique(),
  title: text("title").notNull(),
  headerImage: text("header_image"),
  isDemo: boolean("is_demo").notNull().default(false),

  /*
   * Data from the store page. The model used to know nothing about a candidate
   * but its title and made up everything else, while Blender and Wallpaper
   * Engine kept landing in the analysis queue — there was nothing to tell
   * software apart from a game.
   *
   * `type`: game / dlc / software / video / music / demo. Still null means we
   * haven't asked about this game yet, and it counts as a game so the backfill
   * doesn't switch off half the app while it runs.
   */
  type: text("type"),
  shortDescription: text("short_description"),
  /** Comma-separated genres: there are always 1-4, a separate table is overkill here. */
  genres: text("genres"),
  categories: text("categories"),
  /** The classifier's verdict: picking genres apart in SQL is awkward. */
  isSoftware: boolean("is_software").notNull().default(false),
  /** Release date exactly as Steam hands it over — the format drifts across locales. */
  releaseDate: text("release_date"),
  detailsFetchedAt: timestamp("details_fetched_at"),

  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => [index("games_details_fetched_idx").on(t.detailsFetchedAt)]);

export const userGames = pgTable(
  "user_games",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    playtimeMinutes: integer("playtime_minutes").notNull().default(0),
    lastPlayedAt: timestamp("last_played_at"),
    /**
     * Excluding a game from the pool is one particular player's decision, not a
     * property of the game. The flag used to sit on the shared catalog: one user
     * skipped it as "not a game" and it disappeared from everyone's pool.
     */
    excluded: boolean("excluded").notNull().default(false),
  },
  (t) => [
    uniqueIndex("user_games_user_id_game_id_idx").on(t.userId, t.gameId),
    index("user_games_playtime_idx").on(t.userId, t.playtimeMinutes),
  ]
);

export const slots = pgTable("slots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id),
  status: text("status", { enum: ["active", "reviewed", "skipped"] })
    .notNull()
    .default("active"),
  playtimeOnStart: integer("playtime_on_start").notNull().default(0),
  startedAt: timestamp("started_at")
    .notNull()
    .$defaultFn(() => new Date()),
}, (t) => [index("slots_user_status_idx").on(t.userId, t.status)]);

/**
 * A single model of what a player thinks about a game.
 *
 * game_records is what the player thinks now, game_entries is how they got
 * there. It replaces three tables (slot_reviews, game_reviews, slot_notes)
 * that had three different dedup rules between them and one time column
 * carrying two incompatible meanings.
 */
export const gameRecords = pgTable(
  "game_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    verdict: text("verdict", { enum: ["finished", "endless", "playing", "dropped", "later"] }),
    tier: text("tier", { enum: ["S", "A", "B", "C", "D", "F"] }),
    rating: integer("rating"),
    /** Where the record came from — an invisible storage detail, not a filter in the UI. */
    origin: text("origin", { enum: ["roulette", "retro", "triage", "demo", "steam"] })
      .notNull()
      .default("retro"),
    slotId: integer("slot_id").references(() => slots.id),
    /** Absolute minutes as of the last entry — "played some more" is counted against it. */
    playtimeAtLastEntry: integer("playtime_at_last_entry").notNull().default(0),
    firstEntryAt: timestamp("first_entry_at").notNull(),
    lastEntryAt: timestamp("last_entry_at").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // This is the new dedup rule: one record per (user, game) pair
    uniqueIndex("game_records_user_game_idx").on(t.userId, t.gameId),
    index("game_records_user_verdict_idx").on(t.userId, t.verdict),
    index("game_records_user_tier_idx").on(t.userId, t.tier),
  ]
);

export const gameEntries = pgTable(
  "game_entries",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id")
      .notNull()
      .references(() => gameRecords.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["first", "update", "verdict", "advisor"] })
      .notNull()
      .default("update"),
    text: text("text").notNull(),
    /**
     * We keep both the absolute value and the delta. slot_notes.playtime_minutes
     * used to mean the delta since the start of the contract in one shape of row
     * and the total playtime in another — in one and the same column.
     */
    playtimeTotalMinutes: integer("playtime_total_minutes").notNull(),
    playtimeDeltaMinutes: integer("playtime_delta_minutes").notNull().default(0),
    /**
     * The question this entry is answering.
     *
     * An answer to the advisor's question is a diary entry like any other: a
     * person wrote it, and it sits in the feed in its rightful place in time.
     * But without the question beside it, it reads like a scrap of a
     * conversation whose opening line has been lost.
     */
    promptedBy: text("prompted_by"),
    /** A snapshot of the opinion at the time of the entry — it's what shows the evolution. */
    verdictAt: text("verdict_at"),
    ratingAt: integer("rating_at"),
    tierAt: text("tier_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("game_entries_record_created_idx").on(t.recordId, t.createdAt)]
);

/**
 * Background analysis of a single diary entry.
 *
 * The status sits apart from the result on purpose: there is one analysis, but
 * it will have several layers — game mentions, complaint tags, predictions
 * about the future, the tone of the text. Once the next layer shows up, reruns
 * have to key off this row rather than off the presence of rows in the results
 * table, where an empty answer ("no games mentioned") is indistinguishable from
 * never analyzed at all.
 */
export const entryAnalyses = pgTable(
  "entry_analyses",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => gameEntries.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "done", "error"] })
      .notNull()
      .default("pending"),
    model: text("model").notNull(),
    error: text("error"),
    /**
     * The temperature of the text, from −2 to 2 — not a score for the game but
     * how the entry sounds. The score a person sets by hand and often forgets
     * to move; the tone shifts on its own, and the gap between the two is
     * exactly what becomes visible.
     */
    tone: integer("tone"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [uniqueIndex("entry_analyses_entry_idx").on(t.entryId)]
);

/**
 * A vocabulary of complaints and praise — one of its own per person.
 *
 * It grows out of that person's own entries, so the normalized form is kept
 * alongside: without it "recycled locations", "repeating locations" and "too
 * few locations" turn into three different tags, and the taste profile falls
 * apart into synonyms.
 */
export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: ["complaint", "praise"] }).notNull(),
    label: text("label").notNull(),
    normalized: text("normalized").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("tags_user_normalized_idx").on(t.userId, t.normalized)]
);

export const entryTags = pgTable(
  "entry_tags",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => gameEntries.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    /** What was set by hand survives a re-analysis, what was suggested does not. */
    source: text("source", { enum: ["model", "user"] })
      .notNull()
      .default("model"),
  },
  (t) => [
    uniqueIndex("entry_tags_entry_tag_idx").on(t.entryId, t.tagId),
    index("entry_tags_tag_idx").on(t.tagId),
  ]
);

/**
 * A prediction about the future left in an entry: "hope it gets more
 * interesting", "my theory is that Max is from a parallel universe".
 *
 * Nobody is going to mark these up by hand, so the same pass digs them out. In
 * time a prediction can be held up again — and that's when it's worth something.
 */
export const entryClaims = pgTable(
  "entry_claims",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => gameEntries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** Still null — the prediction hasn't been held up against reality yet. */
    outcome: text("outcome", { enum: ["hit", "miss", "unclear"] }),
    askedAt: timestamp("asked_at"),
  },
  (t) => [index("entry_claims_entry_idx").on(t.entryId)]
);

/**
 * A game mentioned inside someone's entry.
 *
 * The entry text is never rewritten: the markup is stored next to it — the
 * verbatim fragment and its position — and the highlight is laid on at render
 * time. The original stays exactly what the person wrote.
 *
 * gameId may be empty: naming a game that is in neither the library nor the
 * database is an everyday thing ("there's a Reunion too, you know"), and such a
 * mention is valuable in its own right, as a trace of interest.
 */
export const entryMentions = pgTable(
  "entry_mentions",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => gameEntries.id, { onDelete: "cascade" }),
    gameId: integer("game_id").references(() => games.id),
    /** The verbatim fragment of text — the highlight's position is found by it. */
    surface: text("surface").notNull(),
    startOffset: integer("start_offset").notNull(),
    /** The full title according to the model: it's also what resolves the game. */
    canonicalTitle: text("canonical_title").notNull(),
  },
  (t) => [
    index("entry_mentions_entry_idx").on(t.entryId),
    index("entry_mentions_game_idx").on(t.gameId),
  ]
);

export const recommendationRuns = pgTable("recommendation_runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  model: text("model").notNull(),
  status: text("status", { enum: ["pending", "done", "error"] })
    .notNull()
    .default("pending"),
  error: text("error"),
  stage: text("stage", { enum: ["collecting", "thinking", "saving"] })
    .notNull()
    .default("collecting"),
  picksReady: integer("picks_ready").notNull().default(0),
  profile: text("profile").notNull().default(""),
  reviewsUsed: integer("reviews_used").notNull().default(0),
  candidatesUsed: integer("candidates_used").notNull().default(0),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: timestamp("finished_at"),
});

export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => recommendationRuns.id),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id),
  /*
   * `pick` is advice from the untouched pile. `abandoned` belonged to a
   * dropped feature — the model took a side on games you had given up on, and
   * you answered with a button.
   *
   * The value and the `stance` column below are kept because rows carrying
   * them already exist: they are the record of runs that really happened, and
   * dropping the column would rewrite that history rather than end the
   * feature. Nothing writes either of them any more.
   */
  kind: text("kind", { enum: ["pick", "abandoned"] })
    .notNull()
    .default("pick"),
  tier: text("tier", { enum: ["S", "A", "B", "C", "D"] }),
  /** Legacy, see `kind` above: the side the model took on a dropped game. */
  stance: text("stance", { enum: ["agree", "disagree"] }),
  rank: integer("rank").notNull().default(0),
  reason: text("reason").notNull(),
  /*
   * Where the model's knowledge of the game comes from. Without this, advice
   * about a game it knows by heart and advice about a game it knows nothing
   * about look equally confident.
   */
  grounding: text("grounding", { enum: ["known", "from-description", "guess"] }),
});

export const slotSkips = pgTable("slot_skips", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id")
    .notNull()
    .references(() => slots.id),
  reasonType: text("reason_type", { enum: ["legitimate", "shame"] }).notNull(),
  reasonText: text("reason_text").notNull(),
  skippedAt: timestamp("skipped_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A deep dive into one game: its description, other players' reviews and one
 * particular person's taste. Cached per (user, game) pair — the analysis
 * depends on both, and costs a whole model request plus two to Steam.
 */
export const deepDives = pgTable(
  "deep_dives",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    fit: text("fit", { enum: ["yes", "maybe", "no"] }).notNull(),
    /** Tier after the deep dive: the first pass judged by description, this one by mechanics. */
    tier: text("tier", { enum: ["S", "A", "B", "C", "D"] }),
    summary: text("summary").notNull(),
    forYou: text("for_you").notNull(),
    against: text("against").notNull(),
    /** Complaints line by line — not worth an array type for the sake of one column. */
    complaints: text("complaints"),
    reviewsUsed: integer("reviews_used").notNull().default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("deep_dives_user_id_game_id_idx").on(t.userId, t.gameId)]
);

/**
 * A snapshot of playtime.
 *
 * Steam hands out no history: `playtime_forever` is a single counter that only
 * grows, and in `user_games` it gets overwritten on every sync. Whatever
 * happened between two syncs cannot be recovered from that column at all. So we
 * keep the history ourselves: a row is written only once the counter has grown,
 * and `user_games` stays what it always was — the last known value, that is,
 * the baseline the next increment is measured against.
 *
 * Hence the absence of "zero" rows as well: a library of a thousand games must
 * not spawn a thousand rows on every poll. A game nobody played leaves no trace
 * at all.
 */
export const playtimeSnapshots = pgTable(
  "playtime_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    /*
     * With a time zone, unlike the other tables. `timestamp without time zone`
     * is parsed by the driver in the process's own zone: the very same row
     * reads as a different time on a server running in UTC and on a developer's
     * machine, and "what time do you play" slides by several hours. For a
     * tracker, the "when" *is* the content, so what's stored here is a moment in
     * time, not the reading of a wall clock on nobody knows whose wall.
     */
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    /** The absolute value at the snapshot — history is repaired from it if a poll died. */
    playtimeMinutes: integer("playtime_minutes").notNull(),
    /** Growth since the previous snapshot: the whole reason this table exists. */
    deltaMinutes: integer("delta_minutes").notNull(),
    /*
     * Who noticed the growth. A manual library sync sees it in large chunks (a
     * day may have passed between visits), the poll in half-hour ones. The
     * snapshot's timestamp can't tell the two apart, and the difference matters
     * a great deal for how precise the conclusions are.
     *
     * `backfill` is growth read out of the diary after the fact: between two
     * entries about a game you can see how much was played, and the dates of the
     * entries are known. Such a row can't be trusted on the "what time" question,
     * so it takes no part in the heatmap, the night hours or the streak.
     */
    source: text("source", { enum: ["sync", "poll", "backfill"] })
      .notNull()
      .default("poll"),
    /*
     * The start of the interval the growth accumulated over. Empty for a live
     * poll: there the interval is the distance to the previous row, half an hour
     * at most. For a row reconstructed from the diary it's nine days on average,
     * and without this boundary the row would claim all of it was played at the
     * moment the review was written.
     */
    sinceAt: timestamp("since_at", { withTimezone: true }),
    /*
     * The session this growth belongs to. Empty means the time was played
     * around the status poll: a private profile, invisible mode, an app that was
     * down. Without this column, such growth and the growth of an already
     * counted session are indistinguishable in the statistics, and the hours
     * get doubled.
     */
    sessionId: integer("session_id").references(() => playSessions.id),
  },
  (t) => [
    index("playtime_snapshots_user_taken_idx").on(t.userId, t.takenAt),
    index("playtime_snapshots_user_game_taken_idx").on(t.userId, t.gameId, t.takenAt),
  ]
);

/**
 * A play session — "sat in this game from 21:04 to 23:40".
 *
 * It is built not from the playtime counter but from the "what are they playing
 * right now" status: Steam updates the counter in jerks (often only when the
 * game exits), and a three-hour evening lands in it as one lump stamped with the
 * minute the player closed the game. As a source for "what time do you usually
 * play" that is worthless.
 *
 * Hence two time columns rather than one: `minutes` is wall-clock time, from the
 * status poll, `playtime_gain_minutes` is what Steam itself counted for the same
 * session. The first is more honest about the boundaries, the second about the
 * minutes, and they disagree legitimately (a pause, an alt-tab, playing offline).
 *
 * `ended_at IS NULL` means "happening right now"; the session is closed by the
 * same poll, once it sees the player has left.
 */
export const playSessions = pgTable(
  "play_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    /** With a time zone — for the same reason as on the snapshots. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** The last poll that caught the player in the game. It also becomes the session's end. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    minutes: integer("minutes").notNull().default(0),
    playtimeGainMinutes: integer("playtime_gain_minutes").notNull().default(0),
  },
  (t) => [
    index("play_sessions_user_started_idx").on(t.userId, t.startedAt),
    index("play_sessions_user_open_idx").on(t.userId, t.endedAt),
    index("play_sessions_game_idx").on(t.userId, t.gameId, t.startedAt),
  ]
);
