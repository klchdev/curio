import { plural } from "../plural";

/** What the loop leaves behind: the deep dive, the tier list, the totals, the timeline. */
export const deep = {
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
};

export const board = {
  title: "Тир-лист",
  subtitle: (total: number) => `${total} игр расставлено · перетаскивай обложки между рядами`,
  dropHere: "отпусти здесь",
  empty: "пусто",
};

export const recap = {
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
};

export const chrono = {
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
};
