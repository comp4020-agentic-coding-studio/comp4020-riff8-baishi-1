# This repo is a pod riff: pods write the prompt, the agent does the work

This repo is a copy of [`comp4020-final-baishi`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi) at
`236607f4` --- baishi's crit agent's final project as it stood at
`08-its-alive`. Their repo is untouched and off limits. From here to the end of
semester, each crit a pod picks this repo up from wherever the last run left
it.

**Pods: the only file you change is `prompt.md`, at the repo root.** Read the
live app, the code and the history, then write the prompt that would take
this app to a strong, interesting answer to the next brief (the crit runsheet
links it). The prompt can point at any file here. After the session,
baishi's crit agent runs `prompt.md` once, unattended, start to finish, and
nobody is there to answer its questions --- so say what you want, what good
looks like and what to leave alone. Push it before you leave.

**Crit agent: when `prompt.md` exists, it is your brief.** Run it to
completion in one go, keep `main` deployable, and delete `prompt.md` in your
last commit. Leave this block of `CLAUDE.md` as it is.

**Nothing here is marked.** No cutoff, no reflection, no `PROCESS.md` entry.
The next crit opens by looking at where each pod repo ended up, beside the
prompt that got it there (the `prompt-crit<N>` tag).

**The agent's own spec tests are `spec/scroll.test.ts`.** They encode the brief it was
working to, and they gate the deploy. A prompt aimed at a different brief can
have them changed or deleted; keep `spec/invariants.test.ts` green, since that
one is true of any good site.

Everything below this line was written for the agent's graded submission. Its
marks, cutoff and weekly skills don't govern this repo: read it for how the
agent was directed, not for what anyone owes.

---

# Your harness

The rules below are derived from `README.md`'s argument, not separate from
it: if a rule here doesn't trace back to a sentence there, it doesn't belong
in either.

## What the app must never do

- **Never delete or edit a saved mark.** `src/lib/db.ts` has no update or
  delete statement, and none should be added — not even for moderation. If
  a mark ever needs removing, that's a decision to argue for in
  `README.md` first, with a real mechanism (who can, and why), not a quiet
  admin route. Overpainting is erasing too: a new mark's path, halo
  included, stays inside its own column of its own layer (`zoneBounds` in
  `src/lib/layout.ts`).
- **Never require an account to draw or to view.** The only identity is an
  anonymous per-tab token that says who holds a claim — never a login, and
  never broadcast.
- **Never trust the client for anything `spec/` can check.** Path shape,
  stroke width, instrument, column containment and claims are all checked
  in the data layer (`src/pages/api/strokes.ts`). The client sends
  `{ d, width, instrument }`; the server derives the layer from the
  instrument (`layerOf`) and the column from the path, and ignores anything
  else the body says about either.
- **Never change the stored geometry for the sake of the look.** The
  crumpled paper is a rendering effect behind the ink; marks are drawn and
  checked in flat coordinates.

## What every page holds to

- `/` renders the grid and every saved mark (the old scroll's rows as the
  prologue) and answers 200 with JavaScript disabled. Only drawing, the
  live stream and playback need a script, and the trumpet and paper are
  `aria-hidden` static art. A pointer is never the only way in: each open
  column is a real focusable control, and Enter/Space leaves a dot.
- `/readme/` always serves the current `README.md` in full, headings
  intact — `spec/invariants.test.ts` checks this; don't special-case it
  away.

## What a change must not break

- One SQLite table, one file, one volume. Schema changes are additive and
  check `PRAGMA table_info` first: the Fly volume holds rows from every
  earlier schema. Claims and live-stream subscribers live in server memory
  on purpose; if a change needs a second service (a queue, a cache, a
  second database), raise it in `PROCESS.md` first, with the trade-off
  named.
- `pnpm check` and `pnpm check:evidence` pass before every commit. A red
  run never gets committed over.
- Every commit that changes behaviour has a test in `spec/` that would have
  failed without it, where the behaviour is the kind a test can hold. HTTP
  behaviour (persistence, validation, claims, the stream) and the pure
  shape classifier can; how an instrument sounds, playhead timing and
  pointer handling can't, and get a real-browser check instead.

## Settled, and left open on purpose

In, as of crit 9: marks arrive live over server-sent events from the
existing server; who gets the open column is decided by claim on
pointer-down (`docs/decisions/0001-who-gets-the-column.md`), with claims
held in memory and expiring after `CLAIM_TTL_MS`.

Still out, and not bugs to fix: a synced or shared playhead, enforcing "one
mark per visitor", accounts, and anything needing a second service. Each is
a decision someone should make and record in `README.md` before it's
built; a half-built version of one is worse than none.
