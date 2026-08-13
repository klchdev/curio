import { GoogleGenAI } from "@google/genai";

/**
 * Один вход в Gemini на весь проект: модель, ключи, повторы.
 *
 * Раньше у каждого места был свой цикл ретраев с чуть разными задержками, а
 * модель стояла константой в модуле рекомендаций и растекалась оттуда по
 * импортам. Пока вызов был один, это ничего не стоило; с разбором каждой
 * записи дневника вызовов стало на два порядка больше, и политика повторов
 * должна быть общей и настраиваемой в одном месте.
 *
 * Без импортов astro:env и db: модуль нужен и серверу, и разовым скриптам.
 */

export const GEMINI_MODEL = "gemini-3.7-flash";

/**
 * Ключи по порядку использования.
 *
 * Бесплатный ключ отдаёт около двадцати запросов в короткое окно — этого
 * хватает на разовый совет и не хватает ни на что поточное. Поэтому на отказ
 * по частоте мы не ждём, а сразу переходим на платный: ожидание здесь стоит
 * дороже запроса.
 */
export interface GeminiKeys {
  free: string;
  paid?: string;
}

/** Код ошибки прячется в JSON внутри message — SDK не выносит его наружу. */
export function errorCode(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(message);
    const code = parsed?.error?.code;
    return typeof code === "number" ? code : null;
  } catch {
    const inJson = /"code":\s*(\d+)/.exec(message);
    if (inJson) return Number(inJson[1]);
    // Иногда код приходит просто текстом сообщения, без разбираемого JSON
    const loose = /\b(429|500|503|504)\b/.exec(message);
    return loose ? Number(loose[1]) : null;
  }
}

/**
 * Сколько ждать после отказа по частоте: сервер называет свой срок
 * («retryDelay: 53s»), и ждать меньше бессмысленно — попытка сгорит впустую.
 * Верхняя граница не даёт одной записи подвесить прогон на минуты.
 */
function retryAfterMs(err: unknown, fallback: number): number {
  const message = err instanceof Error ? err.message : String(err);
  const seconds = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(message)?.[1];
  const asked = seconds ? Math.ceil(Number(seconds) * 1000) : 0;
  return Math.min(Math.max(asked, fallback), 90_000);
}

/**
 * 503 «high demand» у flash-моделей — обычное дело в пиковые часы и проходит
 * само за секунды. На 400 и 403 повтор бессмысленен.
 */
function isRetriable(code: number | null): boolean {
  return code === 429 || code === 500 || code === 503 || code === 504;
}

const RETRY_DELAYS_MS = [2000, 6000, 15000];

/** Запрос, зависший без ответа и без ошибки, — тоже отказ, только молчаливый. */
const DEFAULT_TIMEOUT_MS = 120_000;

class TimeoutError extends Error {}

async function withTimeout<T>(run: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`Gemini молчит дольше ${ms} мс`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface GeminiCallOptions {
  /** Потоковый ответ идёт дольше обычного — рекомендациям нужен запас. */
  timeoutMs?: number;
}

/**
 * Выполняет работу с моделью, разбираясь с ключами и повторами.
 *
 * Тело передаётся колбэком, потому что вызовы разной формы: где-то обычный
 * ответ, где-то поток с прогрессом. Общее у них — что делать, когда не
 * получилось.
 */
export async function withGemini<T>(
  keys: GeminiKeys,
  run: (ai: GoogleGenAI) => Promise<T>,
  options: GeminiCallOptions = {}
): Promise<T> {
  const chain = [keys.free, keys.paid].filter((key): key is string => !!key);
  if (chain.length === 0) throw new Error("Не задан ни один ключ Gemini");

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let keyIndex = 0;
  let attempt = 0;

  for (;;) {
    try {
      const ai = new GoogleGenAI({ apiKey: chain[keyIndex]! });
      return await withTimeout(() => run(ai), timeoutMs);
    } catch (err) {
      const code = err instanceof TimeoutError ? 504 : errorCode(err);

      // Кончилась квота ключа — следующий ключ пробуем сразу, без паузы
      if (code === 429 && keyIndex + 1 < chain.length) {
        keyIndex += 1;
        continue;
      }

      if (!isRetriable(code) || attempt >= RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs(err, RETRY_DELAYS_MS[attempt]!)));
      attempt += 1;
    }
  }
}
