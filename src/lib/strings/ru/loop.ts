import { plural } from "../plural";
import { THRESHOLDS } from "../../vocab";

/** The loop itself: choosing a game, the active contracts, skipping, writing an impression. */
export const choose = {
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
  /*
   * Честная оговорка вместо запрета. Раньше на таком объёме отзывов кнопки
   * просто не было — человек уходил, не увидев, что вообще получается. Теперь
   * разбор делается, но не притворяется уверенным: заниженное ожидание
   * дешевле, чем совет, поданный как знание.
   */
  thinNote: (reviews: number) =>
    `Пока ${reviews} ${plural(reviews, "отзыв", "отзыва", "отзывов")} — на разбор хватает, но он выйдет грубым: закономерности проступают ближе к ${THRESHOLDS.MIN_REVIEWS_FOR_CONFIDENCE}. Чем больше напишешь, тем меньше догадок.`,
  emptyCta: "Собрать рекомендации",
  emptyBusy: "Запускаю…",
  emptyHint: "Занимает около минуты · можно уйти со страницы",

  blindText: (pool: number) =>
    `Пока советов нет, игру можно выбрать по-старому — жребием по всему пулу из ${pool} игр.`,
  blindCta: "🎰 Крутить рулетку",
  blindBusy: "Кручу…",
  blindFull: "все три контракта заняты",
};

export const now = {
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

};

export const skip = {
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
};

export const sheet = {
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
};

/**
 * Советы без ключа. Всё, что здесь говорится, собрано из жанров магазина и
 * собственных тиров игрока — и текст не должен звучать так, будто кто-то
 * прочитал его отзывы: обещание, которого этот режим не выполняет, обесценит
 * и то, что он реально делает.
 */
export const rules = {
  badge: "Считал алгоритм, не нейросеть",
  badgeText:
    "Ключ не подключён, поэтому советы собраны по жанрам и категориям Steam, взвешенным твоими же тирами. Тексты отзывов при этом не читаются — за разбором словами нужен ключ.",
  badgeCta: "Добавить ключ",

  example: (title: string, tier: string | null) => (tier ? `${title} (${tier})` : title),
  forIt: (feature: string, examples: string) => `За: ${feature} — у тебя ${examples}.`,
  againstIt: (feature: string, examples: string) => `Против: ${feature} — ${examples}.`,
  nothingMatched:
    "Жанры этой игры не встречаются среди оценённого — сказать по ним нечего, это чистая догадка.",

  profileLikes: (list: string) => `Выше среднего у тебя стоят: ${list}.`,
  profileDislikes: (list: string) => `Ниже среднего: ${list}.`,
  withGames: (feature: string, games: number) =>
    `${feature} (${games} ${plural(games, "игра", "игры", "игр")})`,
  profileHow:
    "Это посчитано по жанрам и категориям Steam, а не по твоим словам: без ключа тексты отзывов не читаются. С ключом Кьюрио разбирает написанное и объясняет советы твоими же формулировками.",
};
