# Privacy

The short version: Curio stores what the journal and the advice need, sends data
only to Steam and to the API of the model whose key you entered yourself, and
counts visits on its public pages only — the landing page and the demo, where
nobody is signed in. Nothing behind the login is measured by anyone. Below,
point by point, without the vague wording.

This document describes the app as it is actually built in the code. If you're
running your own copy, the data in it is on you, and this text is worth
rewriting to match.

## What is stored

**Account.** SteamID, nickname and avatar URL — they come from Steam at login.
The app never sees your Steam password: login goes through OpenID, and all Curio
gets back from Valve is a confirmed SteamID.

**Library.** The list of games in your Steam library, minutes played for each,
the date each was last launched, and the "excluded from the pool" flag. Plus the
shared store card for a game — title, description, genres, release date; that one
isn't tied to any particular person.

**Playtime.** The history of what you played: readings of the minute counter and
play sessions — when one started, when it ended, how many minutes. This is the
most sensitive part of the database: your daily routine is visible in it. It is
collected only while `CRON_SECRET` is configured and polling is on, and only from
the data your Steam profile hands out publicly.

**Journal.** Entries about games: the text, the verdict (finished, dropped,
playing…), the score, the tier, the playtime at the moment of writing. Reviews
imported from your Steam profile land here too.

**Journal analyses.** The model annotates the entries: tags for complaints and
praise, the tone of the text, mentions of other games, "bets on the future" along
the lines of "hopefully it gets more interesting later". All of it sits next to
the original text — the text itself is never rewritten.

**Advice.** Recommendations, post-mortems on dropped games, deep dives into
individual games: the model's output together with its reasoning, so the same
request isn't paid for twice.

**Model key.** The provider (Gemini, Claude or OpenAI), the model you picked and
the key itself — encrypted, AES-256-GCM, with the server's encryption key
(`ENCRYPTION_KEY`). The key is never stored in the clear and is never handed back
to the interface.

## Where the data goes

**Steam Web API (Valve).** Your SteamID goes there, to fetch the profile, the
library, playtime, the "playing now" status and your public reviews. Nothing from
the journal is ever sent to Steam.

**Your model provider's API.** When you ask for an analysis, a piece of advice or
a verdict, fragments of your journal go over to the provider — entry texts,
scores, tags — along with game titles. They go under your key, which means into
your own account with that provider, and on that provider's terms.

> **Important, about the free Gemini tier.** Google says outright that on the
> free tier the contents of requests and responses may be used to improve its
> models and may be reviewed by humans. If the journal is personal writing for
> you, take a paid tier or a different provider.

**Yandex.Metrika — on the public pages only.** The landing page (`/`) and the
demo (`/try`) load a counter, and it exists to answer one question: how many
people arrive and where from. What Yandex receives is what any web counter
receives — the address of the page, the referrer that brought you, your IP
address and user agent, the screen size, and, through the click map, where on
those two pages people click.

Every page behind the login — the diary, the chronology, the tier list, the
settings, "My data" — loads no counter and no third-party script whatsoever.
Your entries, the games in your library and the addresses of those pages never
reach Yandex. Session recording (Webvisor) is not turned on anywhere.

Yandex processes what it collects on its own terms, as an independent
controller: <https://yandex.ru/legal/confidential/>.

Apart from that, the data goes nowhere else. There are no ad pixels, and a
self-hosted copy has no counter at all unless whoever runs it sets
`YANDEX_METRIKA_ID` to a counter of their own.

## Cookies

Curio's own, on every page:

- the session cookie — a signed user identifier; without it login doesn't work;
- `br_lang` — the interface language you picked.

Yandex.Metrika's, on the public pages only, set by Yandex rather than by this
app: `_ym_uid` (an identifier for a returning browser), `_ym_d` (the date of the
first visit), `_ym_isad` and a few short-lived session ones. They are not set at
all if you switch counting off, because the counter is then never loaded.

## Your rights

- **Delete everything.** Your profile has an account deletion button: it wipes
  journal entries, analyses, advice, playtime history, the model key and the
  account itself. This cannot be undone.
- **Take your data with you.** In the same place — an export of everything you
  own as a single JSON file.
- **Revoke the key.** The model key can be deleted on its own, leaving the rest
  untouched; it's worth revoking it in the provider's console while you're at it.
- **Don't be counted.** The footer of the landing page and the settings page
  both carry a switch. It is not a request to Yandex to ignore you: the flag is
  kept in your browser and the counter script checks it before doing anything,
  so from the next page load nothing is loaded and no request leaves for
  Yandex at all. The choice lives in that one browser. Yandex's own opt-out
  works too: <https://yandex.com/support/metrica/general/opt-out.html>.

## Contact

Questions, deletion requests, anything else: contact@klch.dev

## What changed

**24 August 2026.** Until this date this page and the app said there was no
analytics of any kind. That is no longer true: a Yandex.Metrika counter now runs
on the landing page and the demo, because there was no way to tell where a wave
of new people had come from. The line was drawn at the login — nothing inside an
account is counted — and the switch described above was added at the same time.

---

> Not affiliated with Valve Corporation.
> Steam and the Steam logo are trademarks of Valve Corporation.
