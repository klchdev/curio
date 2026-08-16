import { withLlm, type JsonSchema, type LlmCredentials } from "./llm";
import type { RawMention } from "./entry-mentions";

/**
 * One reading of a diary entry.
 *
 * There are four layers — game mentions, complaints and praise, bets on what
 * comes next, and the tone of the text — but only one text, and no reason to
 * read it with four model calls: four times the cost and four times the wait
 * for the same two thousand characters.
 *
 * No astro:env or db imports: this module is needed by the server and by a
 * one-off script alike.
 */

export interface RawReading {
  mentions: RawMention[];
  complaints: string[];
  praises: string[];
  claims: string[];
  /** −2…2: how the entry sounds, not how good the game is. */
  tone: number;
}

const EMPTY: RawReading = { mentions: [], complaints: [], praises: [], claims: [], tone: 0 };

const SYSTEM_INSTRUCTION = `Ты читаешь одну запись из игрового дневника и раскладываешь её на четыре слоя.

Запись человек пишет для себя: вперемешку по-русски и по-английски, сокращениями и по памяти — «первый LiS», «вторая часть», «Ведьмак 3», «RE4», «True Colors». Ничего не выдумывай: пустой слой — нормальный и частый ответ.

## mentions — упоминания ДРУГИХ игр

surface — точный кусок текста записи, скопированный посимвольно. Регистр, опечатки и раскладку не исправляй. Не получается скопировать дословно — пропусти упоминание.

title — полное название игры так, как оно пишется в Steam, латиницей: «Life is Strange 2», «The Witcher 3: Wild Hunt». Номер части раскрывай по контексту: «первый LiS» в записи об игре серии Life is Strange — это «Life is Strange», «вторая часть» — «Life is Strange 2».

Не упоминание: игра, о которой сама запись (но другая часть той же серии — упоминание); имена персонажей, студий, издателей, актёров; фильмы, книги, сериалы, музыка; жанры и общие обороты вроде «игры как эта» или «инди».

## complaints и praises — за что ругает и за что хвалит

Короткая формулировка КОНКРЕТНОГО свойства, 1-3 слова: «рециклинг локаций», «мотивация героя», «рваный темп», «муторная прогрессия», «мало контента».

Проверка на годность одна: тег должен отличать эту игру от других. Подошёл бы к половине игр вообще — он бесполезен.

Голые категории тегами не являются: «геймплей», «сюжет», «графика», «атмосфера», «персонажи», «музыка», «оптимизация». В отзыве об игре они значат «игра — это игра», и тегом такое слово становится только с уточнением: «нелинейный сюжет», «выцветшая графика», «мёртвая атмосфера».

Жанр и механика сами по себе не претензия и не похвала. «Строительство» — это то, из чего игра состоит; претензия — «муторное строительство».

Тег ставится, только если человек на этом свойстве ЗАДЕРЖАЛСЯ: объяснил, привёл пример, вернулся к нему второй раз. Брошенное мимоходом «графика норм» — не тег.

Сторона важна: тег попадает в complaints или praises по тому, КАК он об этом сказал, а не по тому, хорошее это свойство вообще или плохое.

Тебе дают список тегов, которыми этот человек уже пользовался. СНАЧАЛА ищи подходящий там и бери его дословно. Новый заводи, только если ни один не подходит по смыслу: три названия для одной и той же претензии хуже, чем одно неточное.

Пустые списки — обычный ответ, особенно у коротких записей. Больше двух-трёх тегов на слой не бывает.

## claims — ставки на будущее

Место, где человек предполагает, чего ждёт или на что надеется: «надеюсь, дальше станет интереснее», «моя теория, что Макс из параллельной вселенной», «боюсь, что сдуется к финалу».

Пиши ставку одной фразой от его лица, своими словами, коротко. Утверждения о настоящем («игра красивая») ставками не являются — только то, что время может подтвердить или опровергнуть.

## tone — температура текста

Целое от −2 до 2: −2 злость и разочарование, −1 скорее недоволен, 0 ровно или смешанно, 1 скорее доволен, 2 восторг.

Оценивай КАК ЗВУЧИТ ЗАПИСЬ, а не насколько игра хороша и какую оценку человек ей поставил. Текст, где половина абзацев про то, как всё халтурно, — это −2, даже если в конце сказано «в целом времени не жалею».`;

const RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    mentions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          surface: { type: "string", description: "Дословный кусок текста записи" },
          title: { type: "string", description: "Полное название игры как в Steam" },
        },
        required: ["surface", "title"],
      },
    },
    complaints: { type: "array", items: { type: "string" } },
    praises: { type: "array", items: { type: "string" } },
    claims: { type: "array", items: { type: "string" } },
    tone: { type: "integer", description: "Тон текста от -2 до 2" },
  },
  required: ["mentions", "complaints", "praises", "claims", "tone"],
};

function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && item.length <= 60)
    .slice(0, limit);
}

export interface ReadingInput {
  text: string;
  aboutTitle: string;
  /** Tags the player already uses — so the model doesn't breed synonyms. */
  vocabulary: { complaints: string[]; praises: string[] };
}

export async function readEntry(
  input: ReadingInput,
  creds: LlmCredentials | null
): Promise<RawReading> {
  if (input.text.trim().length < 20) return EMPTY;

  const known = [
    input.vocabulary.complaints.length > 0
      ? `Его прежние претензии: ${input.vocabulary.complaints.join(", ")}`
      : "Прежних претензий ещё нет — заводи с нуля.",
    input.vocabulary.praises.length > 0
      ? `Его прежние похвалы: ${input.vocabulary.praises.join(", ")}`
      : "Прежних похвал ещё нет — заводи с нуля.",
  ].join("\n");

  const raw = await withLlm(creds, async (client) => {
    const answer = await client.generateJson({
      system: SYSTEM_INSTRUCTION,
      prompt: `# Словарь этого человека\n${known}\n\n# Запись об игре: ${input.aboutTitle}\n\n${input.text}`,
      schema: RESPONSE_SCHEMA,
      /*
       * Reading an entry is mechanical: copy out the titles, name the
       * properties, rate the tone. Reasoning here burns seconds and tokens for
       * nothing — across a whole diary that is the difference between minutes
       * and hours.
       */
      effort: "low",
    });

    if (!answer) throw new Error("The model returned an empty response");
    return answer;
  });

  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const mentions = Array.isArray(parsed.mentions)
    ? parsed.mentions
        .filter(
          (item): item is RawMention =>
            !!item &&
            typeof (item as RawMention).surface === "string" &&
            typeof (item as RawMention).title === "string"
        )
        .map((item) => ({ surface: item.surface.trim(), title: item.title.trim() }))
        .filter((item) => item.surface.length > 0 && item.title.length > 0)
    : [];

  const tone = typeof parsed.tone === "number" ? Math.round(parsed.tone) : 0;

  return {
    mentions,
    complaints: strings(parsed.complaints, 4),
    praises: strings(parsed.praises, 4),
    claims: strings(parsed.claims, 3),
    tone: Math.max(-2, Math.min(2, tone)),
  };
}
