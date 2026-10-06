# The Endless Music Box

The Scroll stops being continuous ink and becomes a shared sequencer-style
grid. Two stacked grids/layers share the same columns: a column is one
time/beat step, and it's the same beat in both layers, so marks sitting in
the same column across both layers play together. Each layer still grows
the way the single strip does today — its own blank column open at its own
right edge, one mark landing there at a time, none of them ever erased.
Reuse that existing per-layer zone mechanic directly: a visit's blank zone
*is* a column of its own layer; the layer advances column by column instead
of pixel by pixel, same `zoneStart`/`zoneBounds` idea, now one column wide.

Before drawing, a visitor picks **one instrument** — colour still chooses
the sound:

- Melodic, drawn into the **top grid**, pitch quantized into visible rows
  within the column: Piano, Strings, Flute, Bass, Synth
- Percussive/sample, drawn into the **bottom grid**, where the column is
  mainly timing: Drum Kit, Electronic Beat, DJ Sample / Vocal Chop

**The shape drawn, not just the instrument and position, decides how the
sound behaves.** All of this reads off the path (`d`) and `width` already
being saved — it needs real shape analysis at playback time, not a new
column:

- long horizontal stroke → sustained note
- short stroke/dot → short, staccato note
- rising line → pitch rises over the note
- falling line → pitch falls
- zigzag → fast pitch movement / trill
- loop or repeated shape → a repeating/looping sound
- thicker/stronger strokes can affect intensity where that's practical to
  derive from `width`/speed — a nice-to-have, not a hard requirement

For the percussive layer, the column still mainly carries timing, but
shape sets the pattern inside that beat: a long stroke becomes a longer
sequence of hits across the column's duration; a short mark becomes a
single hit. The mark still stays inside its own column — shape changes the
pattern *within* that one beat, it doesn't let a mark spill into the next
column.

A visible, keyboard-reachable playhead moves **column by column** (a
discrete step, not a continuous pixel sweep) across the whole grid, and on
each column plays every mark that column touches, across both layers at
once. Same standing decision as before: user-triggered by a real button,
never autoplaying, local to whoever pressed play, not synced across
visitors — that's still a bigger decision for later, named below.

The page still polls periodically for marks other visitors have saved, so
the grid visibly grows without a manual reload — plain polling against the
existing data, nothing new added to make that happen.

## What carries over unchanged

- No login, ever, to draw or to view.
- Nothing in `src/lib/db.ts` updates or deletes a row. A saved mark —
  shape, instrument and layer included — is permanent.
- The server validates everything `spec/` can check: `instrument` must be
  one of the eight fixed values above; path shape, width range, and
  per-column zone containment all still apply, the same way they do today
  in `src/pages/api/strokes.ts`.
- **The client never sends which layer a mark belongs to.** It sends
  `{ d, width, instrument }`. The server holds the fixed
  instrument→layer map and derives the layer itself before computing
  `zoneBounds` or inserting, so there's no `layer` field a client could
  send that disagrees with its own `instrument`.
- Containment still holds per column: a mark's path, halo included, stays
  inside its own column's own zone within its own layer — `zoneBounds` in
  `src/lib/layout.ts` is where that lives today and needs a layer
  dimension, not a rewrite of the idea.
- `/` still answers 200 with JavaScript disabled and still renders the grid
  and every existing mark. Only drawing, the live poll, and playback need a
  script.
- Each layer's open column stays a real focusable control: Enter/Space
  still leaves a dot — a short, staccato mark by the shape rules above, at
  its layer's default row.
- One SQLite table, one file, one volume, no second service. Audio is
  synthesized client-side (Web Audio API); shape analysis runs client-side
  too, off the already-stored `d`/`width` — it doesn't need a new table or
  a new column to exist.

## Things to actually check, not assume

- The Fly volume already has rows from the older schema. `ALTER TABLE` onto
  a table that already exists on disk needs a real migration path (check
  `PRAGMA table_info` before adding a column, or equivalent) —
  `CREATE TABLE IF NOT EXISTS` alone won't add a column to a table that
  already exists without it. Get this right or the deployed app breaks on
  its own data.
- Update `README.md`'s argument to describe this as what the app now is — a
  sequencer grid, shape-driven sound, the enforced/judged split, what's
  deliberately not built (a synced playhead and per-visitor identity among
  them) — not left describing the old continuous-scroll version.
  `spec/invariants.test.ts` checks every heading renders at `/readme/`, in
  order; keep that green.
- Update the "Your harness" rules in `CLAUDE.md` wherever this brief adds
  or changes an invariant the old wording didn't cover (the per-column
  zone containment, the server deriving layer rather than trusting it).
  Leave the opening block above "## What the app must never do" exactly as
  it is — that's the riff process itself, not this brief.
- `CLAUDE.md`'s "Left open on purpose" section currently says real-time
  sync is next crit's scope, full stop. This brief pulls one narrow piece
  of that forward on purpose — polling for marks other visitors saved.
  That sentence has to be edited to say so explicitly: name what's now in
  (plain polling against existing data) and what's still out (push-based
  updates, a synced playhead, anything needing a second service), with the
  reasoning recorded, not left to quietly contradict a rule still sitting
  in the file.
- Say in `PROCESS.md` why this pivot happened and what it cost, the way the
  existing entries do — grid over continuous scroll, shape read off the
  stored path rather than a new column, synthesis over sample libraries,
  why the playhead and live polling landed where they did.
- `spec/scroll.test.ts` encoded the previous brief; replace what no longer
  applies and add what this one needs: a valid instrument persists and
  round-trips per layer; an unknown instrument value is rejected; a mark
  that reaches outside its own column's zone (halo included) is still
  refused; no delete path still exists.
- Not everything here is the kind of behaviour a test can hold, and
  `CLAUDE.md` already says so. `spec/` runs over HTTP against jsdom; it
  can't drive the Web Audio API, classify a shape as a trill, or watch a
  playhead step. Whether each instrument actually sounds right, whether a
  rising line actually rises, and whether the playhead's timing feels
  right, is a real-browser check, deliberately without a spec test — the
  same call `PROCESS.md` made for the pointer-identity bug. Don't force an
  automated test where one can't hold the claim; do the real-browser
  verification and say so, the way that entry does.

## Left open on purpose

Per-visitor identity, enforcing "one mark per visitor," and a synced or
shared playhead are not gaps in this brief — they're the next crit's
decision to make, same as the current `README.md` already says for
identity. Don't build toward any of them early; a half-built version of a
decision someone else is supposed to make and write down is worse than not
touching it.

## Process

`pnpm check` and `pnpm check:evidence` pass before every commit. Every
commit that changes behaviour carries a `spec/` test that would have failed
without it. Keep `main` deployable throughout, not just at the end. Delete
this file in your last commit.
