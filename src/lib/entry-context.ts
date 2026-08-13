import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { gameEntries, gameRecords, entryAnalyses } from "../db/schema";

/**
 * Что человек должен видеть перед тем, как писать следующую запись.
 *
 * Две вещи, и обе — про его собственный текст, а не про игру. Первая: как он
 * говорил об этой игре раньше, своими словами и со штампом времени. Вторая:
 * не разошлась ли оценка с тем, как звучат последние записи.
 *
 * Черновик за человека здесь не пишется намеренно: единственная ценность
 * дневника — что текст его, и подсовывать готовые формулировки значит эту
 * ценность уничтожить. Показываем сказанное, писать он будет сам.
 */

export interface EntryQuote {
  playtimeMinutes: number;
  text: string;
}

export interface ToneDrift {
  /** Оценка, которая стоит сейчас. */
  rating: number;
  /** Что предлагаем вместо неё. */
  suggested: number;
  /** Сколько записей подряд оценка не двигалась. */
  entries: number;
}

export interface EntryContext {
  quotes: EntryQuote[];
  drift: ToneDrift | null;
}

/** Из записи берём начало абзаца: цитата — напоминание, а не перечитывание. */
function excerpt(text: string, limit = 120): string {
  const line = text.split("\n").find((part) => part.trim().length > 0)?.trim() ?? "";
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : limit).trimEnd()}…`;
}

/**
 * Тон в оценку переводится грубо и намеренно: −2 это 1 из 5, 2 это 5 из 5.
 * Точность тут не нужна — нужен вопрос «ты уверен», а не новая шкала.
 */
function toneToRating(tone: number): number {
  return Math.max(1, Math.min(5, tone + 3));
}

const MIN_ENTRIES_WITHOUT_CHANGE = 3;
/** Ниже двух ступеней расхождение — шум: люди пишут резче, чем думают. */
const MIN_GAP = 2;

export async function getEntryContext(userId: number, gameId: number): Promise<EntryContext> {
  const record = await db
    .select({ id: gameRecords.id, rating: gameRecords.rating })
    .from(gameRecords)
    .where(and(eq(gameRecords.userId, userId), eq(gameRecords.gameId, gameId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!record) return { quotes: [], drift: null };

  const entries = await db
    .select({
      text: gameEntries.text,
      kind: gameEntries.kind,
      playtimeMinutes: gameEntries.playtimeTotalMinutes,
      ratingAt: gameEntries.ratingAt,
      tone: entryAnalyses.tone,
    })
    .from(gameEntries)
    .leftJoin(entryAnalyses, eq(entryAnalyses.entryId, gameEntries.id))
    .where(eq(gameEntries.recordId, record.id))
    .orderBy(desc(gameEntries.createdAt));

  // Советы модели — не его слова, цитировать их ему обратно незачем
  const own = entries.filter((entry) => entry.kind !== "advisor");

  const quotes: EntryQuote[] = own
    .slice(0, 5)
    .reverse()
    .map((entry) => ({ playtimeMinutes: entry.playtimeMinutes, text: excerpt(entry.text) }))
    .filter((quote) => quote.text.length > 0);

  return { quotes, drift: findDrift(own, record.rating) };
}

function findDrift(
  entries: Array<{ ratingAt: number | null; tone: number | null }>,
  currentRating: number | null
): ToneDrift | null {
  if (!currentRating) return null;

  /*
   * Считаем, сколько записей подряд оценка стоит на месте. Записи идут от
   * новых к старым, поэтому первое же расхождение обрывает счёт.
   */
  let unchanged = 0;
  for (const entry of entries) {
    if (entry.ratingAt !== null && entry.ratingAt !== currentRating) break;
    unchanged += 1;
  }
  if (unchanged < MIN_ENTRIES_WITHOUT_CHANGE) return null;

  const recent = entries
    .slice(0, 3)
    .map((entry) => entry.tone)
    .filter((tone): tone is number => tone !== null);

  // Тон есть не у всех записей: разбор мог не дойти или упасть
  if (recent.length < MIN_ENTRIES_WITHOUT_CHANGE) return null;

  const average = recent.reduce((sum, tone) => sum + tone, 0) / recent.length;
  const suggested = toneToRating(Math.round(average));
  if (Math.abs(suggested - currentRating) < MIN_GAP) return null;

  return { rating: currentRating, suggested, entries: unchanged };
}
