# Curio

**A journal of what you've played that turns into advice on what to play next.**

Curio connects to your Steam library and asks you to write not one review after
you finish a game, but several along the way — whenever your opinion moves. Write
after the first evening, or forty hours in, or the moment a game loses you; there
are no checkpoints to hit. Every entry is automatically stamped with your real
playtime from Steam, so you can see how your opinion changed, not just how it
ended up.

Those entries add up to a taste profile — what irritates you game after game,
what hooks you, where your score disagrees with the way you actually talk about
a game. The advice is built on that profile: your unplayed games get sorted into
tiers with links back to your own words, and any single game can be put through
a deep dive over its Steam reviews.

<!-- TODO: screenshots from demo mode -->

## How it works

1. **You bring your own model key.** Curio doesn't pay for inference — the key
   is yours, and requests go straight to the provider you picked.
2. **You fill the journal.** Import the reviews from your Steam profile with one
   button, write about what you've played by hand, or spin the roulette — it
   picks a random game from the backlog and opens a slot for it.
3. **You get the write-ups.** A taste profile, a tier list of what's unplayed,
   verdicts on individual games, and a chronicle of what you actually played and
   when.

A review in Curio is a thread, not a snapshot:

```
First impression · 45 min
  "The combat is interesting, the art is nice..."

Update · 4 h 20 min
  "The story is starting to sag, but the side quests save it..."

Verdict · 12 h · Finished · 4/5
  "Glad I stuck with it, the ending is strong..."
```

## Stack

Astro 6 (SSR, node adapter) · React 19 · Tailwind CSS 4 · PostgreSQL with
Drizzle ORM · Steam Web API · Steam OpenID login.

## Running locally

You need Node.js 22.12 or newer and a live PostgreSQL database.

```sh
npm install
cp .env.example .env   # fill in the variables from the table below
npm run db:push        # push the schema to the database
npm run dev
```

The app comes up on `http://localhost:4321`. Login goes through Steam OpenID, so
`STEAM_API_KEY` is needed from the very first minute — without it there's no way
to sign in.

### Environment variables

| Variable | Req. | What it is |
|---|---|---|
| `STEAM_API_KEY` | yes | Steam Web API key, get one at https://steamcommunity.com/dev/apikey |
| `SESSION_SECRET` | yes | random string, at least 32 characters; the session cookie is signed with it |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | yes | 32 bytes in base64 (`openssl rand -base64 32`) — encrypts users' model keys |
| `CRON_SECRET` | no | password for `/api/cron/poll`; without it the playtime tracker doesn't run |
| `DEV_ACCOUNTS_ENABLED` | no | enables test accounts, off by default |
| `DEV_STEAM_IDS` | no | comma-separated SteamIDs allowed to use test accounts |

`ENCRYPTION_KEY` must not be changed: stored user keys are encrypted with that
exact key, and after a swap everyone has to enter theirs again.

## Model key (BYOK)

The write-ups, the advice and the verdicts come from a language model, and
everyone pays for their own. Curio keeps no shared key: you enter yours in the
settings, it gets encrypted (AES-256-GCM), and that encrypted form is the only
one the database ever holds.

Three providers are supported:

- **Google Gemini** — https://aistudio.google.com/apikey
- **Anthropic Claude** — https://console.anthropic.com/settings/keys
- **OpenAI** — https://platform.openai.com/api-keys

Gemini has a free tier, and it's enough to try everything except running a large
journal through analysis in one go. Do keep in mind that on the free tier Google
reserves the right to use the contents of your requests to improve its models;
the details are in [PRIVACY.md](PRIVACY.md).

## Playtime tracker

Steam doesn't hand out history by day and hour: `playtime_forever` is a single
cumulative counter, and nothing that happened between two syncs can be recovered
from it. Curio builds that history itself, off two signals:

| Signal | Source | How often | What it gives |
|---|---|---|---|
| Minute counter | `GetRecentlyPlayedGames` | 30 min | `playtime_snapshots` — how much was played, down to the minute |
| "Playing right now" | `GetPlayerSummaries` | 3 min | `play_sessions` — exactly when, down to the clock |

On their own they're useless: the counter updates in jumps (often only when you
quit the game), and the status knows nothing about minutes. Together they add up
to "Tuesday, 21:04 to 23:40, two hours forty". The `/chrono` page turns that into
an hourly heatmap, days, top games and recent sessions.

Both polls run on timers inside the web process and are woken when the container
starts (`scripts/start.mjs` pings `/api/cron/poll`). What production needs:

- the `CRON_SECRET` variable — without it the tracker doesn't start;
- **don't let the service sleep**: a sleeping process polls nothing;
- a single replica. Several won't double-count (the increment is computed under
  a row lock, in the same transaction that writes the new value), but the number
  of requests to Valve grows with every one of them.

The same endpoint can be called from outside if you'd rather not keep the
process alive:

```sh
curl -H "authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/poll?job=all"
```

What the tracker can't do: see a player with a private profile or in invisible
mode — for them only the counter readings survive, with no session boundaries.

### History from before the tracker

Some of the past can still be recovered — from the journal. Every entry is
stamped with an absolute playtime and a date, so two entries about the same game
give you an interval: "127 minutes played between May 3rd and May 12th".

```sh
DATABASE_URL=... npx tsx scripts/backfill-playtime-history.ts          # dry run
DATABASE_URL=... npx tsx scripts/backfill-playtime-history.ts --apply
```

Those rows are marked `source='backfill'` and stay out of the heatmap: the hour
in them is unknown, the average interval is nine days, and spreading it across
the day would mean inventing it.

## Privacy

What is stored, where it goes and how to delete all of it — in
[PRIVACY.md](PRIVACY.md).

## Contributing

Bugs and ideas go to issues, patches to pull requests. Details in
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

## Support

If Curio turned out to be useful: https://buymeacoffee.com/CHANGEME

<!-- TODO: replace CHANGEME with the real Buy Me a Coffee address -->

---

> **Not affiliated with Valve Corporation.**
> Steam and the Steam logo are trademarks of Valve Corporation.
