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
    verdict: text("verdict", { enum: ["finished", "endless", "playing", "dropped", "later"] }),
    tier: text("tier", { enum: ["S", "A", "B", "C", "D", "F"] }),
    rating: integer("rating"),
    /** Откуда пришла запись — невидимая деталь хранения, не фильтр в интерфейсе. */
    origin: text("origin", { enum: ["roulette", "retro", "triage", "demo", "steam"] })
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
    /**
     * Вопрос, на который эта запись отвечает.
     *
     * Ответ на вопрос советчика — такая же запись дневника, как любая другая:
     * её писал человек, и в ленте она стоит на своём месте по времени. Но без
     * вопроса рядом она читается обрывком разговора, у которого потеряна
     * первая реплика.
     */
    promptedBy: text("prompted_by"),
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

/**
 * Фоновый разбор одной записи дневника.
 *
 * Статус лежит отдельно от результата намеренно: разбор один, а слоёв у него
 * будет несколько — упоминания игр, теги претензий, ставки на будущее, тон
 * текста. Появится следующий слой — перезапускать надо будет по этой строке,
 * а не по наличию строк в таблице результатов, где пустой ответ («игр не
 * упомянуто») неотличим от неразобранного.
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
     * Температура текста от −2 до 2 — не оценка игры, а то, как звучит
     * запись. Оценку человек ставит руками и часто забывает подвинуть;
     * тон меняется сам собой, и расхождение между ними как раз и видно.
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
 * Словарь претензий и похвал — свой у каждого человека.
 *
 * Растёт из его же записей, поэтому нормализованная форма хранится рядом:
 * без неё «рециклинг локаций», «повторяющиеся локации» и «мало локаций»
 * станут тремя разными тегами, и профиль вкуса рассыплется на синонимы.
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
    /** Поставленное руками переживает повторный разбор, предложенное — нет. */
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
 * Ставка на будущее, оставленная в записи: «надеюсь, станет интереснее»,
 * «моя теория, что Макс из параллельной вселенной».
 *
 * Размечать их руками никто не станет, поэтому их достаёт тот же проход. Со
 * временем ставку можно предъявить обратно — и вот тогда она чего-то стоит.
 */
export const entryClaims = pgTable(
  "entry_claims",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => gameEntries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** Пока null — ставку ещё не предъявляли. */
    outcome: text("outcome", { enum: ["hit", "miss", "unclear"] }),
    askedAt: timestamp("asked_at"),
  },
  (t) => [index("entry_claims_entry_idx").on(t.entryId)]
);

/**
 * Игра, упомянутая в чужой записи.
 *
 * Текст записи не переписывается никогда: разметка хранится рядом с ним —
 * дословный кусок и его позиция, — а подсветка накладывается при отрисовке.
 * Оригинал остаётся ровно тем, что человек написал.
 *
 * gameId может быть пустым: назвать игру, которой нет ни в библиотеке, ни в
 * базе, — обычное дело («там ведь ещё Reunion есть»), и такое упоминание
 * ценно само по себе, как след интереса.
 */
export const entryMentions = pgTable(
  "entry_mentions",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => gameEntries.id, { onDelete: "cascade" }),
    gameId: integer("game_id").references(() => games.id),
    /** Дословный кусок текста — по нему ищется место подсветки. */
    surface: text("surface").notNull(),
    startOffset: integer("start_offset").notNull(),
    /** Полное название по версии модели: им же игра и разрешается. */
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

/**
 * Замер наигранного времени.
 *
 * Steam не отдаёт историю: `playtime_forever` — один счётчик, который растёт,
 * и в `user_games` он перезаписывается при каждом синке. Всё, что было между
 * двумя синками, из этой колонки не восстановить никак. Поэтому историю мы
 * заводим сами: строка пишется только когда счётчик вырос, а `user_games`
 * остаётся тем, чем и был — последним известным значением, то есть базой,
 * относительно которой считается следующий прирост.
 *
 * Отсюда же и отсутствие «нулевых» строк: библиотека в тысячу игр не должна
 * порождать тысячу строк на каждый опрос. Игра, в которую не играли, не
 * оставляет следа вовсе.
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
     * С поясом, в отличие от остальных таблиц. `timestamp without time zone`
     * драйвер разбирает по поясу процесса: один и тот же ряд читается как
     * разное время сервером в UTC и машиной разработчика, и «во сколько ты
     * играешь» уезжает на несколько часов. Для трекера «когда» — это и есть
     * содержание, поэтому здесь хранится момент, а не показания настенных
     * часов неизвестно чьей стены.
     */
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    /** Абсолют на момент замера — по нему чинится история, если опрос упал. */
    playtimeMinutes: integer("playtime_minutes").notNull(),
    /** Прирост с прошлого замера: то, ради чего таблица и заведена. */
    deltaMinutes: integer("delta_minutes").notNull(),
    /*
     * Кто заметил прирост. Ручной синк библиотеки видит его крупными кусками
     * (между заходами могли пройти сутки), опрос — получасовыми. По времени
     * замера это не отличить, а для точности выводов разница существенная.
     */
    source: text("source", { enum: ["sync", "poll"] })
      .notNull()
      .default("poll"),
    /*
     * Сессия, которой этот прирост принадлежит. Пустая — время наиграно в
     * обход опроса статуса: закрытый профиль, режим невидимки, лежавшее
     * приложение. Без этой колонки такой прирост и прирост уже посчитанной
     * сессии в статистике неразличимы, и часы удваиваются.
     */
    sessionId: integer("session_id").references(() => playSessions.id),
  },
  (t) => [
    index("playtime_snapshots_user_taken_idx").on(t.userId, t.takenAt),
    index("playtime_snapshots_user_game_taken_idx").on(t.userId, t.gameId, t.takenAt),
  ]
);

/**
 * Игровая сессия — «сидел в этой игре с 21:04 до 23:40».
 *
 * Строится не из счётчика времени, а из статуса «во что играет сейчас»:
 * счётчик Steam обновляет рывками (часто только при выходе из игры), и
 * трёхчасовой вечер прилетает в него одним куском под ту минуту, когда игрок
 * закрыл игру. Для «во сколько ты обычно играешь» это негодный источник.
 *
 * Поэтому две колонки времени, а не одна: `minutes` — часы на стене, из
 * опроса статуса, `playtime_gain_minutes` — что за ту же сессию насчитал сам
 * Steam. Первое честнее по границам, второе — по минутам, и расходятся они
 * законно (пауза, альт-таб, игра в оффлайне).
 *
 * `ended_at IS NULL` значит «идёт прямо сейчас»; закрывает сессию тот же
 * опрос, когда видит, что игрок вышел.
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
    /** С поясом — по той же причине, что и у замеров. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** Последний опрос, заставший игрока в игре. Он же станет концом сессии. */
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
