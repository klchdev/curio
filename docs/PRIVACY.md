# Privacy

The short version: Curio stores what the journal and the advice need, sends data
only to Steam and to the API of the model whose key you entered yourself, and
collects no analytics at all. Below, point by point, without the vague wording.

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

The data goes nowhere else. There is no external analytics, no ad pixels and no
third-party scripts on the pages.

## Cookies

There are two:

- the session cookie — a signed user identifier; without it login doesn't work;
- `br_lang` — the interface language you picked.

That's all. No tracking or analytics cookies.

## Your rights

- **Delete everything.** Your profile has an account deletion button: it wipes
  journal entries, analyses, advice, playtime history, the model key and the
  account itself. This cannot be undone.
- **Take your data with you.** In the same place — an export of everything you
  own as a single JSON file.
- **Revoke the key.** The model key can be deleted on its own, leaving the rest
  untouched; it's worth revoking it in the provider's console while you're at it.

## Contact

Questions, deletion requests, anything else: contact@klch.dev

---

> Not affiliated with Valve Corporation.
> Steam and the Steam logo are trademarks of Valve Corporation.
