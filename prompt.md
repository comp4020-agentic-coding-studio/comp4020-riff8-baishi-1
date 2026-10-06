# The Endless Music Box, live for a room full of people

This prompt aims at the [crit 9 brief, "All at once"](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/). It has three pieces from pod members, and the agent must deliver all of them: **(1)** the scroll becomes a shared sequencer grid, below, **(2)** that grid becomes real-time, with one recorded multi-user decision, in "Make it live", and **(3)** the page gets a new look — crumpled paper with a big trumpet blasting the sound out — in "The look", after that. Later sections win where pieces disagree, and each says so explicitly where it overrides an earlier one: "Make it live" overrides parts of "Part 1: the grid", and "The look" overrides "Make it live"'s instruction to keep the existing visual language. At the next crit, five or six people will open <https://comp4020-riff8-baishi-1.fly.dev/> at once and draw, so the live half is what gets tested hardest, but all three ship.

## Part 1: the grid

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

Other visitors' marks arrive live, as described in "Make it live" below. This
replaces the polling this half originally proposed.

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
  and every existing mark. Only drawing, the live stream, and playback need a
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
  sync and multi-user identity are next crit's scope. This is that crit.
  Edit the section to say what is now in (server-sent events from the
  existing server, in-memory claims on a column, an anonymous per-tab
  token at most) and what is still out (a synced or shared playhead, "one
  mark per visitor" enforcement, accounts, anything needing a second
  service), with the reasoning recorded, not left to quietly contradict a
  rule still sitting in the file.
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

Enforcing "one mark per visitor," accounts, and a synced or shared
playhead are not part of this crit. Don't build toward them; a half-built
version of a decision someone else is supposed to make and write down is
worse than not touching it. Real-time marks and the column decision below
are in scope, because the crit 9 brief asks for them.

## Make it live

1. **Real-time.** When anyone saves a mark, every other open tab shows it within about a second with no reload: the mark appears in the right column of the right layer, and each layer's open column and the grid's width update with it. Use server-sent events from the existing Astro node server. Send a heartbeat so Fly's proxy doesn't drop idle streams, keep connection state in memory (the machine is 256 MB and auto-stops), and make a reconnect, or a restart of the machine, catch up on marks missed by sending the last seen mark `id`. If a playhead is running locally, a new mark must not reset it.
2. **One multi-user decision, recorded before it's built: who gets the open column.** Right now everyone loads the page and is offered the same blank column in a layer, and whoever saves second is refused with a 409 and told to reload. With six people drawing at once, most would lose their mark. **The pod's decision is claim on pointer-down.** Starting to draw in a layer's open column reserves that column in that layer, and every other tab immediately sees it as taken ("someone is drawing here") and gets the next column. The claim expires if abandoned. Claims are short-lived, so hold them in server memory, not in a second table. Layers are independent, so someone drawing in the top grid doesn't block anyone in the bottom grid. Write the ADR at `docs/decisions/0001-who-gets-the-column.md`: weigh claim-on-pointer-down honestly against live shift (a saved mark pushes the open column right in every other tab, and half-drawn strokes are translated or dropped) and reserve-per-session (each tab is given a column ahead of time, leaving gaps when people leave). Include the strongest case for live shift, since the pod will argue it at the crit, and the cost of choosing claims (a stuck claim holding a column until the timeout, a timeout that is too short or too long, claims lost on restart). Only choose differently if you find a concrete reason claims can't work on this stack, and say what it was in the ADR. Commit the ADR before the code that implements it.
3. **The server stays the authority.** A claim is checked in the data layer, not trusted from the client. A save for a column claimed by someone else is refused, and a save with no claim, or an expired one, still works when the column is free. Use an anonymous per-tab token to say who holds a claim, as `CLAUDE.md` allows, and never a login. The per-column zone check (`zoneBounds`) and the server-derived layer stay in force.
4. **Felt, not decorated.** In a room, the other people drawing should be felt: a taken column should look taken, and a mark that arrives should visibly land in place. Keep to the page's existing visual language. No cursors, avatars or names.

### What good looks like for this half

- A new spec opens the live stream, POSTs a valid mark from a second client, and asserts the stream delivers it in under 1 s.
- Specs that pin the claim decision: two clients drawing in the same layer at once both get their marks saved in different columns, a save into a column someone else holds is refused, and a column whose claim has expired is free again. Make the claim timeout configurable by an environment variable, so a spec can use a short one.
- `spec/invariants.test.ts` stays green and untouched. Update `spec/scroll.test.ts` where the stale-column refusal changes.
- In a real browser, with two windows on the live Fly URL side by side: a mark drawn in one shows up in the other with no reload, and both windows drawing in the same layer at once keep their marks. Do this after the deploy, not just locally.
- The existing rows on the Fly volume survive. Schema changes are additive.
- `README.md` stops saying real-time is next crit's work and describes the claim behaviour, and `PROCESS.md` records why claims were chosen.

## The look

The page stops reading as a clean sparse scroll and becomes a scrunched-up
piece of paper with the grid's drawings on it — creased, a little
battered, not a flat rect. And a big trumpet, drawn large and prominent on
the page, is what the sound comes out of: when the playhead plays a mark,
something visibly bursts out of the trumpet's bell in time with it — a
puff, a note glyph, a flare, whatever reads as "the sound is coming from
here." This **overrides "Make it live"'s "keep to the page's existing
visual language"** instruction (item 4 above) on purpose; everywhere else
that item says, about claimed columns being felt rather than decorated,
still holds.

Two things this can't touch, because they're load-bearing, not decoration:

- **The stored geometry never changes.** The crumple is a rendering
  effect — a texture, a filter, a warped `<defs>` turbulence or a few
  folded-paper shapes behind and around the ink — applied to how the page
  *looks*, not to the coordinate system `d` paths are written in or
  checked against. `zoneBounds` and the per-column containment math in
  `src/lib/layout.ts` and `src/pages/api/strokes.ts` keep using the real,
  unwarped coordinates. A mark's saved path is exactly what the visitor
  drew; the paper around it is what's allowed to look crumpled.
- **The drawing zones and the no-JS page still work.** The trumpet and the
  paper texture are decorative: give them real `alt`/`aria-hidden` treatment
  so they don't get read as content or block a column's hit area or
  keyboard focus, and make sure they render as static art (no script
  required) so `/` still answers 200 and looks like this with JavaScript
  off — only the trumpet's burst-on-playback animation needs a script,
  same as drawing and the live stream already do.

Bring `README.md`'s aesthetic argument (the ink-wash references, "small on
purpose") up to date to describe this look honestly rather than leave it
describing a sparse scroll the page no longer is — the same rule this file
has already applied to the real-time and grid changes: argue a changed
decision in `README.md`, don't leave the file quietly contradicting what
shipped.

## Process

`pnpm check` and `pnpm check:evidence` pass before every commit. Every
commit that changes behaviour carries a `spec/` test that would have failed
without it. Keep `main` deployable throughout, not just at the end. Delete
this file in your last commit.
