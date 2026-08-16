import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { THRESHOLDS } from "./vocab";

/**
 * Every string in the interface. The tier and verdict vocabulary lives in
 * vocab.ts — here is only what surrounds it.
 *
 * A value may be a function: Russian requires numeral agreement («ещё 1 отзыв»
 * / «ещё 3 отзыва» / «ещё 5 отзывов»), and the inflection rule belongs next to
 * the text, not inside a component.
 *
 * EN is typed as `Dict`, so a forgotten key or a signature that has drifted is
 * a compile error rather than an empty string on screen.
 */

/** Russian numerals: 1 отзыв, 2 отзыва, 5 отзывов. */
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
  },

  pages: {
    home: "Главная",
    back: "Назад",
    diary: "Дневник",
    diaryCount: (n: number) => `${n} ${plural(n, "запись", "записи", "записей")}`,
    diaryGames: (n: number) => `${n} ${plural(n, "игра", "игры", "игр")}`,
    diaryEmpty: "Пока пусто. Возьми первый контракт!",
    diaryThread: (n: number) => `${n} ${plural(n, "запись", "записи", "записей")} по игре`,
    diarySince: "мнение с самого начала",
    mentionedIn: (n: number) =>
      `Упоминается в ${n} ${plural(n, "записи", "записях", "записях")} о других играх`,
    entryFirst: "первое впечатление",
    entryUpdate: "дополнение",
    entryVerdict: "смена вердикта",
    entryFinal: "итог",
    askCurio: "Что скажет Кьюрио",
    askCurioBusy: "Читает…",
    askCurioFailed: "Не вышло, попробуй ещё",
    askCurioLede: "Кьюрио прочитал",
    askCurioClose: "Закрыть",
    tagAdd: "тег",
    tagRemove: "убрать тег",
    tagComplaint: "ругаю",
    tagPraise: "хвалю",
    entryAdvisor: "совет ИИ",
    fromSteam: "из Steam",
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
    lede: "Приложение превращает бэклог в обязательства и в дневник впечатлений — а потом разбирает написанное и говорит, что играть дальше. Не по жанрам, а по твоим словам. Бесплатно.",
    openSource: "Открытый код · лицензия MIT · работает на твоём ключе",
    login: "Войти через Steam",
    loginHint: "Нужен только открытый профиль — библиотека подтянется сама",
    demoCta: "Попробовать без аккаунта",
    demoHint: "Готовый дневник вымышленного человека — сразу видно, что получается на выходе",

    pickEyebrow: "Так выглядит совет",
    pickNote:
      "Пример собран на вымышленном дневнике — у тебя это будут ссылки на твои же записи.",

    howTitle: "Как это работает",
    step1Title: "Свой ключ от нейросети",
    step1Text: "Gemini, Claude или GPT — ключ берётся у провайдера за минуту и вводится в настройках. Запросы уходят от твоего имени: сервис за них не платит и своего ключа не держит.",
    step2Title: "Отзывы на наигранное",
    step2Text: `Написанное на страницах игр в Steam переносится одной кнопкой, остальное дописывается руками. От ${THRESHOLDS.MIN_REVIEWS_FOR_AI} отзывов Кьюрио уже есть за что зацепиться.`,
    step3Title: "Разбор, советы и вердикты",
    step3Text: "Модель читает всё, что ты написал, формулирует твой вкус и раскладывает непройденное по тирам — ссылаясь на твои же слова, а не на жанры.",

    featuresTitle: "Что внутри",
    featureDiary: "Дневник впечатлений",
    featureDiaryText: "Записи об одной игре собираются в тред и помечены наигранным временем — видно, как менялось мнение, а не только чем всё кончилось.",
    featurePicks: "Советы, что играть",
    featurePicksText: "Непройденное разложено по тирам, к каждой игре объяснение. Не можешь выбрать сам — есть жребий.",
    featureTiers: "Тир-лист",
    featureTiersText: "Всё сыгранное расставлено по рядам от S до F, обложки перетаскиваются мышью.",
    featureDeep: "Разбор одной игры",
    featureDeepText: "Кьюрио читает отзывы игроков в Steam и сверяет их с твоим вкусом: стоит запускать или это не твоё.",
    featureChrono: "Хронология",
    featureChronoText: "Когда и сколько ты играешь на самом деле — по часам суток, дням и играм.",
    featureDemos: "Демки",
    featureDemosText: "Впечатления с Next Fest живут отдельно от библиотеки: там свои вердикты, включая «жду релиз».",

    freeTitle: "Бесплатно, открыто, на твоём ключе",
    freeText: "Подписки нет и не будет: за нейросеть платит твой ключ напрямую провайдеру, а не общий счёт сервиса. Ключ лежит зашифрованным и не показывается даже тебе. Код открыт — можно поднять свою копию и не доверять чужому серверу вовсе.",

    /*
     * Support must not read as buying anything. Beyond the tone, paying for
     * access to Steam data is not allowed by the Steam Web API terms — so the
     * wording says outright that money changes nothing, and no phrasing here
     * may start hinting at perks later.
     */
    sponsorTitle: "Некоммерческий проект",
    sponsorText:
      "Curio не берёт денег с пользователей и не будет: за нейросеть платит твой ключ напрямую провайдеру, своих расходов на неё у сервиса нет. Остаются хостинг и домен — на них и уходит поддержка, если захочется её оказать. Взамен она не даёт ничего: ни функций, ни приоритета, ни доступа. Всё работает одинаково, заплатил ты или нет.",
    sponsorCta: "Поддержать через GitHub Sponsors",

    footerDisclaimer:
      "Not affiliated with Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation.",
    footerGithub: "Исходники на GitHub",
    footerSponsor: "Поддержать проект",
  },

  onboarding: {
    title: "Настройка",
    lede: "Четыре шага, минут пять. Без первого не работает ничего умного, без остальных Кьюрио нечего читать.",
    stepDone: "готово",

    /*
     * Short captions for the step pills. Separate from the `*Title` strings on
     * purpose: the full name is already the card heading right below the pills,
     * so the pill only has to say which of the four this is — and one word fits
     * where a whole title had to be cut off.
     */
    keyShort: "Ключ",
    libraryShort: "Библиотека",
    reviewsShort: "Отзывы",
    doneShort: "Готово",

    skip: "Пропустить и осмотреться",
    back: "Назад",
    next: "Дальше",
    finish: "Открыть приложение",
    finishing: "Открываю…",
    resume: "Вернуться к настройке",

    keyTitle: "Ключ от нейросети",
    keyText:
      "Разборы, советы и вердикты делает нейросеть, и работает она на твоём ключе — своего сервис не держит. У Gemini есть бесплатный тариф: его хватит, чтобы попробовать всё.",
    keyDone: (mask: string) => `Ключ на месте (${mask})`,

    libraryTitle: "Библиотека из Steam",
    libraryText:
      "Curio забирает из Steam список игр и наигранное время. Время нужно не для галочки: им помечается каждая запись в дневнике, поэтому и видно, на каком часу мнение поменялось.",
    libraryCta: "Забрать библиотеку",
    libraryBusy: "Спрашиваю Steam…",
    libraryDone: (n: number) => `${n} ${plural(n, "игра", "игры", "игр")} в библиотеке`,
    libraryFailed:
      "Steam не отдал библиотеку. Проверь, что профиль и список игр открыты — приватный список Valve не отдаёт даже владельцу.",

    reviewsTitle: "Отзывы на наигранное",
    reviewsText: (need: number) =>
      `Кьюрио советует по твоим словам, а не по жанрам: он читает, за что ты хвалишь и на что ругаешься из игры в игру. Пока отзывов меньше ${need}, зацепиться не за что — советы просто не соберутся.`,
    reviewsProgress: (have: number, need: number) => `${have} из ${need}`,
    reviewsEnough: "Отзывов хватает — Кьюрио есть что читать",
    reviewsLeft: (left: number) =>
      `Осталось ${left} ${plural(left, "отзыв", "отзыва", "отзывов")}`,
    reviewsImport: "Забрать отзывы из Steam",
    reviewsImportBusy: "Читаю профиль…",
    reviewsImportHint:
      "Всё, что ты писал на страницах игр в Steam, станет записями дневника. Вердикт по каждой проставишь сам.",
    reviewsImportNone: "На профиле отзывов не нашлось — значит, пишем руками",
    reviewsManual: "Написать самому",
    reviewsManualHint:
      "В «Сейчас» лежат игры, где наиграно прилично, а вердикта нет: с них начинать проще всего — впечатление ещё свежее.",

    readyTitle: "Всё готово",
    readyText:
      "Дальше — зона «Выбрать»: Кьюрио прочитает дневник и разложит непройденное по тирам. Первый прогон занимает около минуты.",
    readyGaps: "Незакрытым осталось:",
    readyGapsHint: "К настройке можно вернуться в любой момент — она никуда не денется.",

    needLibraryTitle: "Библиотека пустая",
    needLibraryText:
      "Steam ещё не спрашивали или он ничего не отдал. Без списка игр советовать нечего и разбирать нечего.",
    needLibraryCta: "Забрать библиотеку",
    needReviewsTitle: (left: number) =>
      `Ещё ${left} ${plural(left, "отзыв", "отзыва", "отзывов")} — и Кьюрио заговорит`,
    needReviewsText:
      "Профиль вкуса собирается только из отзывов. Перенеси написанное в Steam или начни с того, во что уже наиграно.",
    needReviewsCta: "Разобраться с отзывами",
  },

  demo: {
    title: "Демо",
    banner: "Демо-данные: библиотека и отзывы вымышленные",
    ctaTitle: "Здесь мог быть твой дневник",
    ctaText:
      "Войди через Steam — библиотека подтянется сама, отзывы с профиля перенесутся одной кнопкой. Сервис бесплатный и работает на твоём ключе от нейросети.",
    ctaButton: "Войти через Steam",
    backToLanding: "На главную",
    /* Демо наполняется шагами, но заставлять проходить их — это тоже стена. */
    skipToEnd: "Показать готовое",
  },

  dev: {
    title: "Тестовые аккаунты",
    hint: "Отладочный механизм владельца инстанса: пустые аккаунты, чтобы проверять сценарии, не ломая свой дневник. В публичную статистику они не попадают.",
    create: "Создать тестовый аккаунт",
    labelPlaceholder: "Название",
    switchTo: "Войти",
    back: "Вернуться в свой аккаунт",
    deleteOne: "Удалить",
    empty: "Пока ни одного",
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
    sync: "Обновить из Steam",
    syncing: "Спрашиваю Steam…",
    synced: (count: number) => `Готово: ${count} игр`,
    syncAgo: (when: string) => `сверено ${when}`,
    syncNever: "ни разу не сверялось",
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
    taken: (title: string) => `Контракт взят: ${title}`,
    takenGo: "Открыть «Сейчас»",
    next: "Дальше",
    contractNote: `Контракт — обязательство сыграть минимум ${THRESHOLDS.MIN_PLAYTIME_TO_REVIEW} минут и записать первое впечатление. Одновременно их может быть ${THRESHOLDS.MAX_ACTIVE_SLOTS}.`,
    profileSummary: "Что Кьюрио понял про тебя",
    groundingDescription: "сужу по описанию из магазина",
    groundingGuess: "игру не знаю — догадка по жанру",

    runStages: {
      collecting: "Собираю отзывы и кандидатов",
      thinking: "Читаю отзывы и раскладываю по тирам",
      saving: "Сохраняю советы",
    },
    runPicks: (n: number) => `${n} ${plural(n, "игра разобрана", "игры разобрано", "игр разобрано")}`,
    runElapsed: (sec: number) => `${sec} с`,
    runHint: "Можно уйти со страницы — прогон продолжится",
    runStuck: "Прогон завис и не отвечает. Попробуй запустить заново.",
    runRetry: "Запустить заново",

    gateTitle: (left: number) =>
      `Ещё ${left} ${plural(left, "отзыв", "отзыва", "отзывов")} — и я смогу советовать`,
    gateText:
      "Советы строятся на твоих словах, а не на жанрах. Пока отзывов мало, Кьюрио не за что зацепиться.",

    emptyTitle: (reviews: number) =>
      `Разберём твой вкус по ${reviews} ${plural(reviews, "отзыву", "отзывам", "отзывам")}`,
    emptyText:
      "Кьюрио прочитает всё, что ты написал, найдёт закономерности, которые ты сам не проговаривал, и разложит непройденное по тирам — с объяснением, почему именно тебе.",
    emptyCta: "Собрать рекомендации",
    emptyBusy: "Запускаю…",
    emptyHint: "Занимает около минуты · можно уйти со страницы",

    blindText: (pool: number) =>
      `Пока советов нет, игру можно выбрать по-старому — жребием по всему пулу из ${pool} игр.`,
    blindCta: "🎰 Крутить рулетку",
    blindBusy: "Кручу…",
    blindFull: "все три контракта заняты",
  },

  deep: {
    button: "Разобрать подробно",
    askAny: "Спросить про свою игру",
    askAnyHint: "Любая игра из библиотеки — Кьюрио разберёт её по твоим отзывам",
    askPlaceholder: "Начни вводить название…",
    askNothing: "Ничего не нашлось",
    askNeverPlayed: "не запускал",
    writeReview: "Написать отзыв",
    addToReview: "Дополнить отзыв",
    loading: "Читаю отзывы игроков…",
    stageFetch: "Кьюрио собирает отзывы игроков в Steam",
    stageRead: "Кьюрио читает их вместе с твоими отзывами",
    stageConclude: "Формулирую вывод",
    hint: "Кьюрио прочитает отзывы в Steam и сверит их с твоим вкусом",
    summary: "Что это на самом деле",
    forYou: "Почему тебе",
    against: "Что может оттолкнуть",
    complaints: "На что жалуются",
    refresh: "Перечитать",
    revised: (from: string, to: string) => `разбор изменил оценку: ${from} → ${to}`,
    used: (n: number) => `по ${n} ${plural(n, "отзыву", "отзывам", "отзывам")} игроков`,
    fitYes: "Стоит запускать",
    fitMaybe: "Под настроение",
    fitNo: "Не твоя игра",
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

    updates: "Ты наиграл ещё",
    updatesHint: "мнение могло измениться — допиши строку",
    updateDelta: (delta: string) => `+${delta} с прошлой записи`,
    addEntry: "Дополнить",
    queue: "Требует ответа",
    queueCount: (total: number) => `${total} игр сыграно, но вердикта нет`,
    hasReview: "отзыв есть — нужен вердикт",
    setVerdict: "Вердикт",
    finished: "Прошёл",
    endless: "В ротации",
    endlessHint: "Игра без конца — Dota, PUBG, песочницы: «прошёл» к ним неприменимо",
    dropped: "Бросил",
    review: "Отзыв",

  },

  board: {
    title: "Тир-лист",
    subtitle: (total: number) => `${total} игр расставлено · перетаскивай обложки между рядами`,
    dropHere: "отпусти здесь",
    empty: "пусто",
  },

  recap: {
    statReviews: "отзывов",
    statSplit: (own: number, steam: number) => `${own} здесь · ${steam} из Steam`,
    statLibrary: "игр в библиотеке",
    statStreak: "дней подряд",
    statShame: "на стене стыда",
    statEndless: "в ротации",
    importSteam: "Забрать отзывы из Steam",
    importing: "Читаю профиль…",
    imported: (n: number) => `Перенесено ${n} ${plural(n, "отзыв", "отзыва", "отзывов")}`,
    importedNone: "Новых отзывов на профиле не нашлось",
    redated: (n: number) =>
      `У ${n} ${plural(n, "записи", "записей", "записей")} восстановлена дата из Steam`,
    importHint: "Отзывы с твоего профиля станут записями в дневнике — вердикт проставишь сам",
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
    takeLede: "Кьюрио прочитал",
    questionsLede: "Пара вопросов про то, чего в отзыве нет. Отвечать необязательно.",
    answerOpen: "Ответить",
    answerSave: "В дневник",
    answerSkip: "Пропустить",
    questionsDone: "Готово",
    quotesLede: "Как ты говорил об этой игре раньше",
    driftHint: (rating: number, suggested: number, entries: number) =>
      `Оценка ${rating} стоит уже ${entries} ${plural(entries, "запись", "записи", "записей")}, а последние звучат ${suggested < rating ? "холоднее" : "теплее"}. Поставить ${suggested}?`,
    driftApply: (suggested: number) => `Ставлю ${suggested}`,
  },

  chrono: {
    title: "Хронология",
    lede: "Когда и сколько ты играешь на самом деле",
    nav: "Хронология",
    empty:
      "История пишется с нуля: Steam своей не отдаёт. Поиграй немного — первые часы появятся здесь.",
    since: (date: string) => `Трекер пишет с ${date}`,
    silent: "Трекер молчит больше суток — проверь, что опрос запущен",
    // A string, not a function: the label ships to the browser as JSON, functions don't survive
    playingNow: "Сейчас в игре",

    totalHours: "Часов за период",
    sessions: "Сессий",
    average: "Средняя сессия",
    longest: "Самая долгая",
    streak: "Дней подряд",
    nights: "Ночных часов",

    heatmap: "Когда ты играешь",
    heatmapHint: "Час дня по горизонтали, день недели по вертикали — по твоему часовому поясу",
    daily: "По дням",
    top: "Во что",
    topHint: "Минуты по счётчику Steam, где он успел подтвердить, иначе по часам сессии",
    recent: "Последние сессии",
    untracked: "Без сессии",
    untrackedHint:
      "Минуты, которые Steam досчитал, когда опрос не видел игрока: закрытый профиль, невидимка или лежавшее приложение",
    before: "До трекера",
    beforeHint:
      "Восстановлено из дневника: между двумя записями об игре видно, сколько наиграно, но не в какие часы. Поэтому в тепловую карту, дни и стрик выше эти часы не входят.",
    beforePeriod: (from: string, to: string) => `${from} — ${to}`,
    beforeMonths: "По месяцам",
    beforeGames: "По играм",
    beforeTotal: (hours: string) => `${hours} восстановлено`,
    ongoing: "идёт",
    byCounter: "по счётчику Steam",
    byClock: "по часам опроса — счётчик ещё не подтвердил",
    range30: "30 дней",
    range90: "90 дней",
    rangeAll: "Всё время",
    weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  },

  account: {
    title: "Мои данные",
    exportHint:
      "Один файл со всем, что здесь есть про тебя: библиотека, дневник со всеми записями, теги, контракты, советы Кьюрио и история игровых сессий.",
    exportButton: "Выгрузить мои данные",

    dangerZone: "Опасная зона",
    deleteTitle: "Удалить аккаунт",
    deleteWarning:
      "Удаляется всё и насовсем: дневник, вердикты, теги, контракты, советы и вся история сессий. Это необратимо — резервных копий на такой случай не держим, восстановить будет нечем. Если написанное жалко, сначала выгрузи данные.",
    deleteConfirmLabel: (username: string) => `Впиши «${username}», чтобы подтвердить`,
    deleteConfirmPlaceholder: "Ник из Steam",
    deleteSubmit: "Удалить навсегда",
    deleting: "Удаляю…",
    deleteFailed: "Не удалось удалить аккаунт — попробуй ещё раз",
    confirmMismatch: "Ник не совпал — ничего не удалено",
  },

  llm: {
    title: "Ключ от нейросети",
    intro:
      "Разборы, вердикты и советы делает нейросеть, и работает она на твоём ключе. Сервис за это не платит и своего ключа не держит — поэтому он бесплатный и таким останется. Ключ хранится зашифрованным и не показывается даже тебе: видно только хвост.",
    provider: "Провайдер",
    model: "Модель",
    customModel: "Другая модель…",
    customModelHint: "Точное имя модели",
    /*
     * The one-line notes beside each model in the picker. The key is the
     * provider's own model id, so a new model whose note nobody translated is
     * caught at compile time: EN is typed as Dict.
     */
    modelNotes: {
      "gemini-3.7-flash": "быстрая, есть бесплатный тариф",
      "gemini-3.7-pro": "умнее и дороже",
      "claude-sonnet-5": "баланс цены и качества",
      "claude-opus-5": "самая сильная, дороже",
      "claude-haiku-4-5": "дешёвая, для массовых разборов",
      "gpt-4.1": "",
      "gpt-4.1-mini": "дешевле, для массовых разборов",
    } as Record<string, string>,
    key: "Ключ",
    keyPlaceholder: "Вставь ключ",
    keySaved: (mask: string) => `Ключ сохранён (${mask}) — введи новый, чтобы заменить`,
    whereToGet: (provider: string) => `Где взять ключ ${provider}`,
    privacyNote:
      "В нейросеть уходят твои записи и список игр. На бесплатном тарифе Gemini Google может использовать содержимое запросов для улучшения моделей — если это не подходит, возьми платный тариф или другого провайдера.",
    checking: "Проверяю…",
    save: "Сохранить",
    remove: "Удалить ключ",
    errorAuth: "Провайдер не принял ключ. Проверь, что скопировал целиком и что он не отозван.",
    errorModel: "Такой модели нет или у ключа нет к ней доступа. Проверь имя модели.",
    errorGeneric: "Не получилось проверить ключ. Похоже на сетевую ошибку — попробуй ещё раз.",
    missingTitle: "Нужен ключ от нейросети",
    missingText: "Эта функция работает на твоём ключе. Добавь его в настройках — это займёт минуту.",
    missingCta: "Добавить ключ",
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
    modelBusy: "Модель сейчас перегружена. Попробуй через пару минут — это временно.",
    modelQuota: "Дневной лимит запросов к модели исчерпан.",
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
    gameNotOwned: "Игра не найдена в библиотеке",
    contractExists: "Контракт на эту игру уже есть",
    recordNotFound: "Запись об игре не найдена",
    noVerdict: "Выбери вердикт",
    noContract: "Не указан контракт",
    noteTooShort: (min: number) => `Заметка минимум ${min} символов`,
    notEnoughPlaytime: (need: number, played: number) =>
      `Нужно наиграть минимум ${need} минут (сейчас ${played})`,
    noEntry: "Не указана запись",
    entryNotFound: "Запись не найдена",
    noTag: "Не указан тег",
    badTagLabel: "Тег от 2 до 60 знаков",
  },
};

export type Dict = typeof RU;

const EN: Dict = {
  nav: {
    diary: "Diary",
    demos: "Demos",
    profile: "Profile",
    logout: "Log out",
  },

  pages: {
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
  },

  landing: {
    authFailed: "Steam didn't confirm the login. Try again — if it keeps happening, tell me and I'll check the logs.",
    heroTop: "A thousand games in the library",
    heroAccent: "and nothing to launch",
    lede: "The app turns your backlog into commitments and into a diary of impressions — then reads what you wrote and tells you what to play next. Not by genre, but by your own words. It's free.",
    openSource: "Open source · MIT licence · runs on your own key",
    login: "Sign in with Steam",
    loginHint: "All it needs is a public profile — the library comes in on its own",
    demoCta: "Try it without an account",
    demoHint: "A ready-made diary of a made-up player — you can see what comes out the other end",

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
      "Curio doesn't charge its users and won't: the model is paid for by your key, straight to the provider, so the service carries no inference bill of its own. What's left is hosting and a domain — that is where support goes, if you feel like giving any. It buys nothing in return: no features, no priority, no access. Everything works the same whether you paid or not.",
    sponsorCta: "Sponsor via GitHub",

    footerDisclaimer:
      "Not affiliated with Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation.",
    footerGithub: "Source on GitHub",
    footerSponsor: "Sponsor the project",
  },

  onboarding: {
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
  },

  demo: {
    title: "Demo",
    banner: "Demo data: the library and the reviews are made up",
    ctaTitle: "This could be your diary",
    ctaText:
      "Sign in with Steam — the library comes in on its own and your profile reviews import with one button. The service is free and runs on your own AI key.",
    ctaButton: "Sign in with Steam",
    backToLanding: "Back to the homepage",
    skipToEnd: "Skip to the finished demo",
  },

  dev: {
    title: "Test accounts",
    hint: "A debugging device for whoever runs this instance: empty accounts to walk through scenarios without wrecking your own diary. They stay out of every public statistic.",
    create: "Create a test account",
    labelPlaceholder: "Name",
    switchTo: "Sign in",
    back: "Back to my account",
    deleteOne: "Delete",
    empty: "None yet",
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
    sync: "Refresh from Steam",
    syncing: "Asking Steam…",
    synced: (count: number) => `Done: ${count} games`,
    syncAgo: (when: string) => `checked ${when}`,
    syncNever: "never checked",
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
    emptyCta: "Generate picks",
    emptyBusy: "Starting…",
    emptyHint: "Takes about a minute · you can leave the page",

    blindText: (pool: number) =>
      `No picks yet — you can still choose the old way, a blind roll across all ${pool} games in the pool.`,
    blindCta: "🎰 Spin the roulette",
    blindBusy: "Spinning…",
    blindFull: "all three contracts taken",
  },

  deep: {
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

  },

  board: {
    title: "Tier list",
    subtitle: (total: number) => `${total} games placed · drag covers between rows`,
    dropHere: "drop it here",
    empty: "empty",
  },

  recap: {
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
  },

  chrono: {
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
  },

  account: {
    title: "My data",
    exportHint:
      "A single file with everything this app knows about you: your library, the diary with every entry, tags, contracts, Curio's picks and the history of your play sessions.",
    exportButton: "Export my data",

    dangerZone: "Danger zone",
    deleteTitle: "Delete account",
    deleteWarning:
      "Everything goes, for good: the diary, verdicts, tags, contracts, picks and the whole session history. There is no undo — we keep no backups for this, so there would be nothing to restore from. If you'd miss what you wrote, export it first.",
    deleteConfirmLabel: (username: string) => `Type "${username}" to confirm`,
    deleteConfirmPlaceholder: "Your Steam name",
    deleteSubmit: "Delete forever",
    deleting: "Deleting…",
    deleteFailed: "Couldn't delete the account — try again",
    confirmMismatch: "The name didn't match — nothing was deleted",
  },

  llm: {
    title: "AI key",
    intro:
      "Breakdowns, verdicts and picks are made by an AI model running on your own key. This service pays for none of it and keeps no key of its own — which is why it's free and will stay that way. Your key is stored encrypted and is never shown back to you: only the tail is.",
    provider: "Provider",
    model: "Model",
    customModel: "Other model…",
    customModelHint: "Exact model name",
    modelNotes: {
      "gemini-3.7-flash": "fast, has a free tier",
      "gemini-3.7-pro": "smarter and pricier",
      "claude-sonnet-5": "balance of cost and quality",
      "claude-opus-5": "the strongest, pricier",
      "claude-haiku-4-5": "cheap, for bulk analysis",
      "gpt-4.1": "",
      "gpt-4.1-mini": "cheaper, for bulk analysis",
    } as Record<string, string>,
    key: "Key",
    keyPlaceholder: "Paste your key",
    keySaved: (mask: string) => `Key saved (${mask}) — enter a new one to replace it`,
    whereToGet: (provider: string) => `Where to get a ${provider} key`,
    privacyNote:
      "Your entries and game list are sent to the AI provider. On Gemini's free tier Google may use request content to improve its models — if that doesn't work for you, use a paid tier or another provider.",
    checking: "Checking…",
    save: "Save",
    remove: "Remove key",
    errorAuth: "The provider rejected this key. Check you copied all of it and that it hasn't been revoked.",
    errorModel: "No such model, or your key has no access to it. Check the model name.",
    errorGeneric: "Couldn't verify the key. Looks like a network error — try again.",
    missingTitle: "An AI key is needed",
    missingText: "This runs on your own key. Add one in settings — it takes a minute.",
    missingCta: "Add a key",
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
    modelBusy: "The model is overloaded right now. Try again in a couple of minutes — it's temporary.",
    modelQuota: "The daily request quota for the model is used up.",
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
    gameNotOwned: "That game isn't in your library",
    contractExists: "You already have a contract on this game",
    recordNotFound: "Nothing recorded for this game yet",
    noVerdict: "Pick a verdict",
    noContract: "No contract specified",
    noteTooShort: (min: number) => `The note needs at least ${min} characters`,
    notEnoughPlaytime: (need: number, played: number) =>
      `Play at least ${need} minutes first — you're at ${played}`,
    noEntry: "No entry specified",
    entryNotFound: "Entry not found",
    noTag: "No tag specified",
    badTagLabel: "A tag is 2 to 60 characters",
  },
};

export function t(locale: Locale = DEFAULT_LOCALE): Dict {
  return locale === "en" ? EN : RU;
}
