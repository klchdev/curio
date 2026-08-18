import { plural } from "../plural";
import { THRESHOLDS } from "../../vocab";

/** The frame around everything: navigation, page chrome, the dock, the owner-only test accounts. */
export const nav = {
  diary: "Дневник",
  demos: "Демки",
  profile: "Профиль",
  logout: "Выйти",
};

export const pages = {
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
};

export const dock = {
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
  /*
   * Что кнопка делает на самом деле. Наигранное подтягивается фоном каждые
   * полчаса, поэтому обещать «обновить время» — значит звать нажимать ради
   * уже сделанного. Свериться вручную стоит ровно тогда, когда изменился
   * состав библиотеки: Steam спрашивают «во что ты играл», а не «что купил».
   */
  syncWhy: "Забирает купленное с прошлого раза. Наигранное время приезжает само, каждые полчаса.",
};

export const dev = {
  title: "Тестовые аккаунты",
  hint: "Отладочный механизм владельца инстанса: пустые аккаунты, чтобы проверять сценарии, не ломая свой дневник. В публичную статистику они не попадают.",
  create: "Создать тестовый аккаунт",
  labelPlaceholder: "Название",
  switchTo: "Войти",
  back: "Вернуться в свой аккаунт",
  deleteOne: "Удалить",
  empty: "Пока ни одного",
};
