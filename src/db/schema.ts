import { pgTable, text, integer, serial, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  steamId: text("steam_id").notNull().unique(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  lastLibrarySync: timestamp("last_library_sync"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  steamAppId: integer("steam_app_id").notNull().unique(),
  title: text("title").notNull(),
  headerImage: text("header_image"),
  hltbMinutes: integer("hltb_minutes"),
  excluded: boolean("excluded").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

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
  },
  (t) => [uniqueIndex("user_games_user_id_game_id_idx").on(t.userId, t.gameId)]
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
});

export const slotReviews = pgTable("slot_reviews", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id")
    .notNull()
    .references(() => slots.id),
  verdict: text("verdict", { enum: ["finished", "dropped", "playing", "later"] })
    .notNull()
    .default("finished"),
  rating: integer("rating").notNull(),
  note: text("note").notNull(),
  playtimeMinutes: integer("playtime_minutes").notNull(),
  tier: text("tier", { enum: ["S", "A", "B", "C", "D", "F"] }),
  completedAt: timestamp("completed_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const slotNotes = pgTable("slot_notes", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id").references(() => slots.id),
  userId: integer("user_id").references(() => users.id),
  gameId: integer("game_id").references(() => games.id),
  text: text("text").notNull(),
  playtimeMinutes: integer("playtime_minutes").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const gameReviews = pgTable(
  "game_reviews",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    verdict: text("verdict", { enum: ["finished", "dropped", "playing", "later"] }),
    tier: text("tier", { enum: ["S", "A", "B", "C", "D", "F"] }),
    rating: integer("rating"),
    note: text("note"),
    playtimeMinutes: integer("playtime_minutes").notNull().default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  // Весь код считает, что запись на пару (пользователь, игра) одна.
  // Без индекса две параллельные вставки создавали вторую, и читатели
  // с .limit(1) молча выбирали произвольную.
  (t) => [uniqueIndex("game_reviews_user_id_game_id_idx").on(t.userId, t.gameId)]
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
  // pick — совет из нетронутого; abandoned — разбор брошенного
  kind: text("kind", { enum: ["pick", "abandoned"] })
    .notNull()
    .default("pick"),
  tier: text("tier", { enum: ["S", "A", "B", "C", "D"] }),
  // для kind=abandoned: согласен с игроком или спорит
  stance: text("stance", { enum: ["agree", "disagree"] }),
  rank: integer("rank").notNull().default(0),
  reason: text("reason").notNull(),
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
