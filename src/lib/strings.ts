import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { THRESHOLDS } from "./vocab";

/**
 * Все тексты интерфейса. Словарь тиров и вердиктов живёт в vocab.ts — здесь
 * только то, что вокруг них.
 *
 * Значение может быть функцией: русский требует согласования числительных
 * («ещё 1 отзыв» / «ещё 3 отзыва» / «ещё 5 отзывов»), и правило склонения
 * должно лежать рядом с текстом, а не в компоненте.
 *
 * EN описан как `Dict`, поэтому забытый ключ или разошедшаяся сигнатура —
 * ошибка компиляции, а не пустая строка на экране.
 */

/** Русские числительные: 1 отзыв, 2 отзыва, 5 отзывов. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const RU = {
  nav: {
    diary: "Дневник",
    demos: "Демки",
    profile: "Профиль",
    logout: "Выйти",
    language: "Язык",
  },

  pages: {
    home: "Главная",
    back: "Назад",
    diary: "Дневник",
    diaryCount: (n: number) => `${n} ${plural(n, "запись", "записи", "записей")}`,
    diaryEmpty: "Пока пусто. Возьми первый контракт!",
    entryFirst: "первое впечатление",
    entryUpdate: "дополнение",
    entryVerdict: "смена вердикта",
    entryAdvisor: "совет ИИ",
    shame: "стена стыда",
    skipped: "пропуск",
    addNote: "Дополнить отзыв",

    demos: "Демки",
    demosLede: "Впечатления с Next Fest и других демок",
    demosEmpty: "Пока пусто. Поиграл в демку на Next Fest — добавь впечатление.",
    demoAdd: "+ Добавить отзыв на демку",
    demoNew: "Новая демка",
    demoDelete: "Удалить",
    demoConfirm: "Удалить отзыв на демку?",
    openInSteam: "Открыть в Steam ↗",

    profile: "Профиль",
    backlog: "Прогресс бэклога",
    poolDone: (percent: number) => `${percent}% пула пройдено`,
    inPool: "В пуле рулетки",
    activeSlots: "Активные слоты",
    alreadyPlayed: "Уже играл (>15 мин)",
    excluded: "Исключено",
    statistics: "Статистика",
    ratedGames: "Оценено игр",
    totalTime: "Суммарное время",
    avgPerGame: "Среднее на игру",
    avgRating: "Средняя оценка",
    verdicts: "Вердикты",
    streakWeeks: "Стрик (недель без стыда)",
    wallOfShame: "Стена стыда",
    cleanRecord: "Чистая совесть! Ни одного позорного скипа.",
  },

  landing: {
    authFailed: "Steam не подтвердил вход. Попробуй ещё раз — если повторится, напиши, посмотрю логи.",
    heroTop: "Библиотека на тысячу игр",
    heroAccent: "и нечего запустить",
    lede: "Приложение превращает бэклог в обязательства и в дневник впечатлений — а потом разбирает написанное и говорит, что играть дальше. Не по жанрам, а по твоим словам.",
    login: "Войти через Steam",
    loginHint: "Нужен только открытый профиль — библиотека подтянется сама",
    step1Title: "Контракт вместо намерения",
    step1Text: `Берёшь игру — из совета или по жребию — и обязуешься сыграть минимум ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} минут и записать первое впечатление. Одновременно контрактов ${THRESHOLDS.MAX_ACTIVE_SLOTS}. Сдаться можно, но это останется в дневнике.`,
    step2Title: "Впечатление слоями, а не снимком",
    step2Text: "Отзыв — не одна оценка на всю игру. Каждая запись помечена наигранным временем, и видно, как мнение менялось: что вытащило игру к десятому часу или что её убило.",
    step3Title: "Советы по твоим словам",
    step3Text: "Модель читает всё, что ты написал, и раскладывает непройденное по тирам — ссылаясь на твои же отзывы по названиям. Иногда спорит с твоими вердиктами и доказывает, что игру бросили зря.",
  },

  dock: {
    choose: "Выбрать",
    chooseHint: (picks: number) =>
      picks > 0 ? `${picks} ${plural(picks, "совет", "совета", "советов")} · жребий` : "советы ИИ",
    now: "Сейчас",
    nowHint: (slots: number, queue: number) =>
      `${slots} из ${THRESHOLDS.MAX_ACTIVE_SLOTS} контрактов · ${queue} разобрать`,
    recap: "Итоги",
    recapHint: (reviews: number) =>
      `${reviews} ${plural(reviews, "отзыв", "отзыва", "отзывов")} · тиры · дневник`,
  },

  choose: {
    eyebrow: "Что играть дальше",
    collected: (date: string) => ` · собрано ${date}`,
    regenerate: "Пересобрать советы",

    diceIdle: "🎰 Не могу решить — брось жребий",
    slotsFull: "все три контракта заняты — закрой один",
    diceTitle: "Жребий сразу создаст контракт",
    diceText: (rollable: number, slotsLeft: number) =>
      `Жребий бросается между ${rollable} ${plural(rollable, "советом", "советами", "советами")} — игры из тира D в него не попадают. Выпавшую нельзя будет просто пролистать: ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} минут и первое впечатление, иначе придётся пропускать, а пропуск без причины идёт на стену стыда. Свободных контрактов: ${slotsLeft}.`,
    diceGo: "Бросаю",
    diceCancel: "Передумал",
    diceRolling: "Жребий брошен, выбираю…",

    playedHours: (hours: number) => `наиграно ${hours}ч`,
    hoursShort: (hours: number) => `${hours}ч`,
    neverLaunched: "ни разу не запускал",
    take: "Взять контракт",
    taking: "Беру…",
    next: "Дальше",
    contractNote: `Контракт — обязательство сыграть минимум ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} минут и записать первое впечатление. Одновременно их может быть ${THRESHOLDS.MAX_ACTIVE_SLOTS}.`,
    profileSummary: "Что видно по твоим отзывам",

    running:
      "Читаю твои отзывы и раскладываю библиотеку по тирам. Занимает около минуты — можно уйти со страницы.",

    gateTitle: (left: number) =>
      `Ещё ${left} ${plural(left, "отзыв", "отзыва", "отзывов")} — и я смогу советовать`,
    gateText:
      "Советы строятся на твоих словах, а не на жанрах. Пока отзывов мало, модели не за что зацепиться.",

    emptyTitle: (reviews: number) =>
      `Разберём твой вкус по ${reviews} ${plural(reviews, "отзыву", "отзывам", "отзывам")}`,
    emptyText:
      "Модель прочитает всё, что ты написал, найдёт закономерности, которые ты сам не проговаривал, и разложит непройденное по тирам — с объяснением, почему именно тебе.",
    emptyCta: "Собрать рекомендации",
    emptyBusy: "Запускаю…",
    emptyHint: "Занимает около минуты · можно уйти со страницы",

    blindText: (pool: number) =>
      `Пока советов нет, игру можно выбрать по-старому — жребием по всему пулу из ${pool} игр.`,
    blindCta: "🎰 Крутить рулетку",
    blindBusy: "Кручу…",
    blindFull: "все три контракта заняты",
  },

  now: {
    contracts: "Активные контракты",
    contractsCount: (slots: number, pool: number) =>
      `${slots} из ${THRESHOLDS.MAX_ACTIVE_SLOTS} · ${pool} игр в пуле`,
    playedOf: (played: string) => `${played} из ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} мин`,
    record: "Записать впечатление",
    refresh: "Обновить время",
    refreshing: "Спрашиваю Steam…",
    skip: "Пропустить",
    syncLibrary: "Синхронизировать библиотеку",
    syncing: "Синхронизирую…",
    synced: (count: number) => `Готово: ${count} игр`,

    freeSlot: "Свободный контракт",
    freeSlotHint: "возьми из советов или брось жребий",

    queue: "Требует ответа",
    queueCount: (total: number) => `${total} игр сыграно, но вердикта нет`,
    finished: "Прошёл",
    dropped: "Бросил",
    review: "Отзыв",

    dispute: "Спор о брошенном",
    disputeHint: "модель не всегда с тобой согласна",
    secondChance: "Дам второй шанс",
    imRight: "Нет, я прав",
    toDiary: "Записать в дневник",
  },

  board: {
    title: "Тир-лист",
    subtitle: (total: number) => `${total} игр расставлено · перетаскивай обложки между рядами`,
    dropHere: "отпусти здесь",
    empty: "пусто",
  },

  recap: {
    statReviews: "отзывов",
    statLibrary: "игр в библиотеке",
    statStreak: "дней подряд",
    statShame: "на стене стыда",
    diary: "Дневник впечатлений",
    allDiary: "весь дневник",
    demos: "Демки",
    allDemos: "все демки",
  },

  skip: {
    title: "Пропустить игру",
    freeSkip: "Бесплатный скип",
    freeSkipHint: "Без позора — заслужил отзывами",
    freeSkipCount: (n: number) => `${n} шт`,
    orReason: "или выбери причину",
    legitimate: "Уважительные причины — записываются нейтрально:",
    notAGame: "Это не игра / демка",
    wontLaunch: "Не запускается",
    notOwned: "Уже не в библиотеке",
    shameHeading: "Другое — попадёт на стену стыда 😔",
    other: "Другая причина",
    otherPlaceholder: "Почему сдаёшься?",
    submit: "Пропустить",
    pickReason: "Выбери причину",
    writeReason: "Напиши причину",
  },

  sheet: {
    played: (time: string) => `Наиграно ${time}`,
    sinceLast: (delta: string) => ` · +${delta} с прошлой записи`,
    appId: "Appid или ссылка на демку",
    verdict: "Вердикт",
    verdictOptional: " (если изменился)",
    worth: "Стоило ли времени",
    tier: "Тир",
    impression: "Впечатление",
    optional: " (необязательно)",
    notePlaceholder: "Что зацепило, что раздражает, вернёшься ли",
    cancel: "Отмена",
    saving: "Сохраняю…",
    minChars: (n: number) => `Заметка минимум ${n} символов`,
    pickVerdict: "Выбери вердикт",
    nothingToSave: "Нечего сохранять",
  },

  errors: {
    generic: "Не получилось",
    network: "Сеть не отвечает",
    saveFailed: "Не удалось сохранить",
    runFailed: "Генерация не удалась",
    slotsFull: "Все слоты заняты. Закрой или пропусти игру.",
    poolEmpty: "Нет доступных игр. Синхронизируй библиотеку.",
    noFreeSkips: "Бесплатных скипов не осталось",
    runInProgress: "Генерация уже идёт",
    needReviews: (need: number, have: number) => `Нужно минимум ${need} отзывов, сейчас ${have}`,
    noCandidates: "Нет непройденных игр в библиотеке",
    runFailedFallback: "Не удалось получить рекомендации",
    badRequest: "Некорректный запрос",
    noGame: "Не указана игра",
    gameNotFound: "Игра не найдена",
    contractNotFound: "Контракт не найден",
    userNotFound: "Пользователь не найден",
    unknownMode: "Неизвестный режим",
    badVerdict: "Некорректный вердикт",
    badTier: "Некорректный тир",
    badRating: "Оценка от 1 до 5",
    needAppId: "Укажи Steam appid или ссылку на страницу демки",
    steamNotFound: "Не нашёл игру в Steam по этому appid",
  },
};

export type Dict = typeof RU;

const EN: Dict = {
  nav: {
    diary: "Diary",
    demos: "Demos",
    profile: "Profile",
    logout: "Log out",
    language: "Language",
  },

  pages: {
    home: "Home",
    back: "Back",
    diary: "Diary",
    diaryCount: (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`,
    diaryEmpty: "Empty so far. Take your first contract!",
    entryFirst: "first impression",
    entryUpdate: "follow-up",
    entryVerdict: "verdict change",
    entryAdvisor: "AI advice",
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
  },

  landing: {
    authFailed: "Steam didn't confirm the login. Try again — if it keeps happening, tell me and I'll check the logs.",
    heroTop: "A thousand games in the library",
    heroAccent: "and nothing to launch",
    lede: "The app turns your backlog into commitments and into a diary of impressions — then reads what you wrote and tells you what to play next. Not by genre, but by your own words.",
    login: "Sign in with Steam",
    loginHint: "All it needs is a public profile — the library comes in on its own",
    step1Title: "A contract instead of an intention",
    step1Text: `You take a game — from a pick or from the dice — and commit to at least ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} minutes and a written first impression. ${THRESHOLDS.MAX_ACTIVE_SLOTS} contracts at a time. You can give up, but the diary will remember.`,
    step2Title: "Impressions in layers, not a snapshot",
    step2Text: "A review isn't one verdict for the whole game. Every entry is stamped with playtime, so you can see how your opinion moved: what saved the game by hour ten, or what killed it.",
    step3Title: "Advice built from your own words",
    step3Text: "The model reads everything you've written and sorts the unplayed part of your library into tiers — citing your own reviews by name. Sometimes it argues with your verdicts and makes the case that you dropped a game too early.",
  },

  dock: {
    choose: "Choose",
    chooseHint: (picks: number) =>
      picks > 0 ? `${picks} ${picks === 1 ? "pick" : "picks"} · dice` : "AI picks",
    now: "Now",
    nowHint: (slots: number, queue: number) =>
      `${slots} of ${THRESHOLDS.MAX_ACTIVE_SLOTS} contracts · ${queue} to sort out`,
    recap: "Recap",
    recapHint: (reviews: number) =>
      `${reviews} ${reviews === 1 ? "review" : "reviews"} · tiers · diary`,
  },

  choose: {
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
    next: "Next",
    contractNote: `A contract is a commitment: at least ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} minutes and a written first impression. You can hold ${THRESHOLDS.MAX_ACTIVE_SLOTS} at a time.`,
    profileSummary: "What your reviews say about you",

    running:
      "Reading your reviews and sorting the library into tiers. Takes about a minute — feel free to leave the page.",

    gateTitle: (left: number) => `${left} more ${left === 1 ? "review" : "reviews"} and I can advise`,
    gateText:
      "Picks are built from your own words, not from genres. With this few reviews there's nothing for the model to hold on to.",

    emptyTitle: (reviews: number) =>
      `Let's read your taste from ${reviews} ${reviews === 1 ? "review" : "reviews"}`,
    emptyText:
      "The model reads everything you've written, finds patterns you never spelled out, and sorts the unplayed part of your library into tiers — explaining why each one is for you.",
    emptyCta: "Generate picks",
    emptyBusy: "Starting…",
    emptyHint: "Takes about a minute · you can leave the page",

    blindText: (pool: number) =>
      `No picks yet — you can still choose the old way, a blind roll across all ${pool} games in the pool.`,
    blindCta: "🎰 Spin the roulette",
    blindBusy: "Spinning…",
    blindFull: "all three contracts taken",
  },

  now: {
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

    queue: "Needs an answer",
    queueCount: (total: number) => `${total} games played with no verdict`,
    finished: "Finished",
    dropped: "Dropped",
    review: "Review",

    dispute: "Argument about the dropped",
    disputeHint: "the model doesn't always agree with you",
    secondChance: "I'll give it another shot",
    imRight: "No, I was right",
    toDiary: "Save to diary",
  },

  board: {
    title: "Tier list",
    subtitle: (total: number) => `${total} games placed · drag covers between rows`,
    dropHere: "drop it here",
    empty: "empty",
  },

  recap: {
    statReviews: "reviews",
    statLibrary: "games in library",
    statStreak: "day streak",
    statShame: "on the wall of shame",
    diary: "Impression diary",
    allDiary: "full diary",
    demos: "Demos",
    allDemos: "all demos",
  },

  skip: {
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
  },

  sheet: {
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
  },

  errors: {
    generic: "Didn't work",
    network: "Network is not responding",
    saveFailed: "Couldn't save",
    runFailed: "Generation failed",
    slotsFull: "All contracts are taken. Close or skip a game first.",
    poolEmpty: "No games available. Sync your library.",
    noFreeSkips: "No free skips left",
    runInProgress: "A run is already in progress",
    needReviews: (need: number, have: number) => `Needs at least ${need} reviews, you have ${have}`,
    noCandidates: "No unplayed games left in the library",
    runFailedFallback: "Couldn't get the recommendations",
    badRequest: "Malformed request",
    noGame: "No game specified",
    gameNotFound: "Game not found",
    contractNotFound: "Contract not found",
    userNotFound: "User not found",
    unknownMode: "Unknown mode",
    badVerdict: "Invalid verdict",
    badTier: "Invalid tier",
    badRating: "Rating must be 1 to 5",
    needAppId: "Enter a Steam appid or a link to the demo page",
    steamNotFound: "No game in Steam with that appid",
  },
};

export function t(locale: Locale = DEFAULT_LOCALE): Dict {
  return locale === "en" ? EN : RU;
}
