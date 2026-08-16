# Contributing

Any contribution is welcome, from a typo in the text to a whole new section.
Formalities are kept to a minimum, and there's no CLA to sign.

## Running it locally

You need Node.js 22.12+ and PostgreSQL.

```sh
npm install
cp .env.example .env   # the variables are described in the README
npm run db:push        # push the schema to an empty database
npm run dev            # http://localhost:4321
```

Before opening a pull request, run the type check:

```sh
npm run check
```

There are no tests in the project yet, so `npm run check` plus walking through
the flow you touched by hand is the entire quality control there is.

The schema is pushed straight from `src/db/schema.ts` with `npm run db:push`;
there is no migrations folder in the repository. If you change the schema,
describe in the PR what exactly changed in the tables: people run these databases
for real, and `db:push` against a live one is done by hand and with care.

## Code style

There is one rule that matters: **comments are in English, and they explain why
something is done this way, not what the line does.**

The reader can read the line of code for themselves. What they can't reconstruct
is which problem it solves, what was there before and why that didn't work, which
obvious option doesn't fit here. That's exactly what needs writing down.

The reference points are `src/db/schema.ts`, `src/lib/deep-dive.ts`,
`src/lib/curio-take.ts`. From there, as an example:

```ts
/*
 * With a time zone, unlike the other tables. The driver parses
 * `timestamp without time zone` in the process's own zone: the very same row
 * reads as a different moment on a server running in UTC and on a developer's
 * machine, and "what time you play" drifts by several hours.
 */
takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
```

And not like this:

```ts
// Declare the takenAt column with a time zone
```

The rest:

- TypeScript is strict; `any` only with an explanation right next to it;
- markup is Tailwind, we don't add separate CSS files;
- React islands are wired in selectively (`client:load` and relatives), pages
  stay server-rendered by default;
- interface strings live in `src/lib/strings.ts` and exist in two languages, ru
  and en. Hardcoded text in the markup is a bug.

## Pull requests

- One branch, one subject. A refactor bundled together with a feature is
  impossible to review.
- The PR description says what changes and why; if you're fixing a bug, show how
  to reproduce it.
- Commits in the spirit of `feat:` / `fix:` / `docs:`, with a subject line that
  describes the result in plain language.
- If you touch anything involving other people's keys, sessions or user data, say
  so in the description in so many words.

## Bugs and ideas

In issues. For a bug it helps to know: what you did, what you expected, what you
got, and which model provider is selected (if it broke somewhere in the
analyses). Server logs if you have them — but scrub keys and anything from `.env`
out of them first.

A large feature is better discussed in an issue first than sent in finished: the
project has a fairly stubborn idea of what it wants to be, and throwing away
somebody's work would be a shame.
