import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  steamId: text("steam_id").notNull().unique(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  lastLibrarySync: integer("last_library_sync", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  steamAppId: integer("steam_app_id").notNull().unique(),
  title: text("title").notNull(),
  headerImage: text("header_image"),
  hltbMinutes: integer("hltb_minutes"),
  excluded: integer("excluded", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userGames = sqliteTable("user_games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id),
  playtimeMinutes: integer("playtime_minutes").notNull().default(0),
});

export const slots = sqliteTable("slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const slotReviews = sqliteTable("slot_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slotId: integer("slot_id")
    .notNull()
    .references(() => slots.id),
  verdict: text("verdict", { enum: ["finished", "dropped", "playing", "later"] })
    .notNull()
    .default("finished"),
  rating: integer("rating").notNull(),
  note: text("note").notNull(),
  playtimeMinutes: integer("playtime_minutes").notNull(),
  tier: text("tier", { enum: ["S", "A", "B", "C", "D"] }),
  completedAt: integer("completed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const slotNotes = sqliteTable("slot_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slotId: integer("slot_id")
    .notNull()
    .references(() => slots.id),
  text: text("text").notNull(),
  playtimeMinutes: integer("playtime_minutes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const gameReviews = sqliteTable("game_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id),
  tier: text("tier", { enum: ["S", "A", "B", "C", "D"] }),
  rating: integer("rating"),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const slotSkips = sqliteTable("slot_skips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slotId: integer("slot_id")
    .notNull()
    .references(() => slots.id),
  reasonType: text("reason_type", { enum: ["legitimate", "shame"] }).notNull(),
  reasonText: text("reason_text").notNull(),
  skippedAt: integer("skipped_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
