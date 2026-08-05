import { pgTable, text, integer, serial, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

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
  isDemo: boolean("is_demo").notNull().default(false),

  /*
   * Данные из карточки магазина. Раньше о кандидате модель знала только
   * название и выдумывала всё остальное, а в очередь разбора попадали Blender
   * и Wallpaper Engine — отличить софт от игры было нечем.
   *
   * `type`: game / dlc / software / video / music / demo. Пока null — про игру
   * ещё не спрашивали, и она считается игрой, чтобы бэкофилл не выключил
   * половину приложения на время работы.
   */
  type: text("type"),
  shortDescription: text("short_description"),
  /** Жанры через запятую: их всегда 1-4, отдельная таблица тут излишество. */
  genres: text("genres"),
  categories: text("categories"),
  /** Вердикт классификатора: в SQL жанры разбирать неудобно. */
  isSoftware: boolean("is_software").notNull().default(false),
  /** Дата релиза как её отдаёт Steam — формат гуляет по локалям. */
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
     * Исключение из пула — решение конкретного игрока, а не свойство игры.
     * Раньше флаг стоял на общем каталоге: скипнул «это не игра» один
     * пользователь, а из пула она пропадала у всех.
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
 * Единая модель мнения об игре.
 *
 * game_records — что игрок думает сейчас, game_entries — как он к этому
 * пришёл. Заменяет три таблицы (slot_reviews, game_reviews, slot_notes),
 * у которых было три разных правила дедупликации и одна колонка времени
 * с двумя несовместимыми смыслами.
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
    verdict: text("verdict", { enum: ["finished", "dropped", "playing", "later"] }),
    tier: text("tier", { enum: ["S", "A", "B", "C", "D", "F"] }),
    rating: integer("rating"),
    /** Откуда пришла запись — невидимая деталь хранения, не фильтр в интерфейсе. */
    origin: text("origin", { enum: ["roulette", "retro", "triage", "demo"] })
      .notNull()
      .default("retro"),
    slotId: integer("slot_id").references(() => slots.id),
    /** Абсолютные минуты на момент последней записи — по ним считается «наиграл ещё». */
    playtimeAtLastEntry: integer("playtime_at_last_entry").notNull().default(0),
    firstEntryAt: timestamp("first_entry_at").notNull(),
    lastEntryAt: timestamp("last_entry_at").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // Это и есть новое правило дедупликации: одна запись на пару
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
     * Храним и абсолют, и дельту. Раньше slot_notes.playtime_minutes значил
     * дельту от начала контракта в одной форме строки и общее время в другой —
     * в одной и той же колонке.
     */
    playtimeTotalMinutes: integer("playtime_total_minutes").notNull(),
    playtimeDeltaMinutes: integer("playtime_delta_minutes").notNull().default(0),
    /** Снимок мнения на момент записи — из него видно эволюцию. */
    verdictAt: text("verdict_at"),
    ratingAt: integer("rating_at"),
    tierAt: text("tier_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("game_entries_record_created_idx").on(t.recordId, t.createdAt)]
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
  /*
   * Откуда у модели знание об игре. Без этого совет по игре, которую она
   * знает наизусть, и совет по игре, о которой не знает ничего, выглядят
   * одинаково уверенно.
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
 * Глубокий разбор одной игры: описание, отзывы других игроков и вкус
 * конкретного человека. Кэшируется по паре (пользователь, игра) — разбор
 * зависит от обоих, а стоит целого запроса к модели и двух к Steam.
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
    /** Тир после разбора: первый проход судил по описанию, этот — по механике. */
    tier: text("tier", { enum: ["S", "A", "B", "C", "D"] }),
    summary: text("summary").notNull(),
    forYou: text("for_you").notNull(),
    against: text("against").notNull(),
    /** Жалобы построчно — массив ради одной колонки заводить не стоит. */
    complaints: text("complaints"),
    reviewsUsed: integer("reviews_used").notNull().default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("deep_dives_user_id_game_id_idx").on(t.userId, t.gameId)]
);
