# Process overview

## From the brief to a decision

The final project brief fixes three requirements (multi-user, real-time,
persists) and leaves what "good" means to me. Crit 8 asks only for proof of
life: deployed, doing its core thing for a stranger, with a trace that's
still there when they come back. Rather than plan a feature-complete app and
ship a fraction of it, I picked one small idea and built all of it: **The
Scroll**, a shared ink canvas that only ever grows, one mark per visit, none
of them ever erased.

The brief's reading list (the small web, games for a handful of friends,
tools for one workshop) pointed away from the "median answer" it warns
against, a chat room with the nouns swapped. A drawing surface with a hard
rule against editing is small, testable, and takes a position.
`README.md` argues that position and cites what I read; this file doesn't
restate it.

## The stack, and what it costs

**Astro in server mode, the Node adapter, `better-sqlite3` with no ORM**
([`b3e5356`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/b3e5356)).
The app is two rendered pages and one write endpoint. Astro's file routing
gives me that without the middleware boilerplate of a bare Express server,
and server output means `/` reads the database on every request, so the
scroll renders with JavaScript off. The adapter's standalone mode is a
single `node entry.mjs` process, which is what a 256MB Fly machine can run.

Drizzle was the obvious alternative. I didn't take it because the schema is
one table: a `CREATE TABLE IF NOT EXISTS` and two prepared statements say
everything a migration tool would, without a generate step or the
dependency weight. The cost is real and deferred, not avoided. When crit 9
needs a second table for identity, or transactions around concurrent
writes, that absence will start to hurt, and I'll write down the switch if
I make it rather than drift into it.

The Dockerfile is two stages: build, then a runtime with production
dependencies only. It originally installed `python3 make g++` with a
comment claiming they were a fallback for `better-sqlite3`. I checked the
package rather than the comment: it has no install script and ships
prebuilt N-API binaries per platform, so the fallback could never run. The
toolchain went
([`961bafc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/961bafc)),
which is the README's "less technology" standard applied to the build.

## How I directed the work

I designed the interaction (a variable-width brush from real pointer speed,
a scroll that grows by one blank strip per mark, the enforced/judged split
in `README.md`) and the API's validation rules myself.
`CLAUDE.md` turns that argument into rules the agent works under: never
update or delete a mark, never require an account, validate in the data
layer rather than trusting `draw.ts`, keep to one table on one volume, and
don't build crit 9's real-time layer early. Its opening line says a rule
that doesn't trace back to a sentence in `README.md` doesn't belong in
either file.

## How I grounded and corrected it

A green `pnpm check` was never treated as proof the interaction worked.
Every change was checked against the container CI actually builds
(`docker build`, then `docker run --tmpfs /data` as `checks.yml` does), and
in a real browser with real pointer and keyboard input.

That caught the first bug a code read hadn't. A single tap saved correctly
but rendered as nothing, because an SVG path of just `M x y` has no
paintable geometry. The fix went into the data layer, not just the client
that produced it: `addStroke` normalises a bare moveto, and
`spec/scroll.test.ts` asserts every saved path is paintable
([`0a10659`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/0a10659)).
That's the pattern I held to afterwards: a correction lands in `CLAUDE.md`
or `spec/`, not just at the call site.

The biggest correction came from re-reading my own rule. For ten passes
"never erased" meant no update or delete statement, and that held. It
didn't cover overpainting. The zone uses `setPointerCapture`, so an
over-long drag kept reporting points outside it, and the API accepted any
path. I reproduced it live (a real drag swept back across three earlier
marks) before touching anything. The fix pins points to the zone in
`draw.ts`, and `strokes.ts` parses the path strictly and refuses any point,
halo included, outside the current strip. Two new spec cases would have
failed beforehand, and `CLAUDE.md` now says overpainting is erasing
([`3a57fdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/3a57fdf)).
That fix created a stale-strip refusal for two visitors loading at once.
The first version reopened the zone and told the visitor to retry, which
`README.md` contradicted. A 409 now names the cause and keeps the zone
closed
([`070af85`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/070af85)).

Three more fixes came from checking claims against behaviour rather than
markup:

- keyboard drawing: adding `tabindex` to the zone looked fixed but wasn't,
  because its parent `<svg role="img">` hid every descendant from assistive
  tech. The role came off and the zone became a real button that Enter and
  Space drive
  ([`fbb528d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/fbb528d))
- contrast: axe reported zero violations while two elements sat under 3:1,
  one dimmed by an ancestor's `opacity` and one in SVG text axe can't
  measure. I found them by computing the ratios by hand
  ([`874ccac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/874ccac)),
  then found the same bad colour still on every `/readme/` link
  ([`7e2939a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/7e2939a))
- pointer identity: `drawing` was a boolean, so a second touch's release
  threw inside an async handler and silently dropped the real mark
  ([`75bc2b5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/75bc2b5)).

That last one has no spec test, deliberately. jsdom has no
`createSVGPoint`, `getScreenCTM` or `setPointerCapture`, so the bug isn't
"the kind a test can hold" in `CLAUDE.md`'s terms. A two-pointer browser
reproduction, before and after, is the verification.

Smaller passes added a favicon after Lighthouse flagged a console error on
every load
([`36f8174`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/36f8174)),
touch-callout and tap-highlight overrides on the drawing zone
([`17216c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baishi/commit/17216c8)),
and in-range dependency patches. Some checks came back clean and changed
nothing: dark-mode contrast, 200% zoom, and an `html-validate` warning I
confirmed is the tool contradicting its own rules.

## Crit 9: from a scroll to a music box

This round ran from a pod's prompt rather than my own plan: one unattended
run, three pieces from three pod members, all of which had to ship. The
scroll becomes a shared sequencer grid, the grid goes live with one recorded
multi-user decision, and the page takes on a new look.

**Why the pivot.** A continuous scroll gave six people in a room nothing to
do together except take turns, and nothing to listen to. A grid whose
columns are beats gives every mark a place relative to everyone else's, and
two layers that share columns mean a drum hit and a note drawn by different
people can land on the same beat. What it cost: the "one strip, one mark"
simplicity, and the old marks' place in the main sheet. They had no
instrument, so rather than invent one they stay as a silent prologue under
the grid, coordinates untouched. The schema change is additive: `PRAGMA
table_info`, then `ALTER TABLE ADD COLUMN` for `instrument` and `col`, so
the rows on the Fly volume survive.

**Shape read off the path, not stored.** The prompt asked for sound shaped
by the stroke (dot, held note, rise, fall, trill, loop). That reads off the
`d` already saved, client-side at playback (`src/lib/shape.ts`), so the
sound can never disagree with the ink, and a better classifier later
re-voices every old mark for free. The cost is that two people's browsers
could hear the same mark slightly differently if the code changes between
their loads. The classifier is a pure function, so unlike the audio it has
a spec (`spec/shape.test.ts`).

**Synthesis over samples.** Every instrument is a few Web Audio oscillators,
a noise buffer and a filter (`src/lib/audio.ts`). A sample library would
sound richer, but it's megabytes to serve from a 256 MB machine, licensing
to check, and a fetch before the first note. A synthesized "piano" is
honest about being a sketch of one, which suits a crumpled paper music box.

**Claims, and the stream.** The pod chose claim on pointer-down, and I wrote
the ADR before the code
([`07dbcb2`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-baishi-1/commit/07dbcb2)), including the best case for live shift since the
pod will argue it. Claims live in a `Map`; server-sent events come from the
same Node process, with a heartbeat for Fly's proxy and replay by last
mark id, so a reconnect or a machine restart misses nothing
([`179c65f`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-baishi-1/commit/179c65f)). The playhead stays local to each tab: a shared
one is a bigger decision than this round should make in passing.

Building it corrected the ADR. My first rule let a save with no claim land
only in the layer's open column. The expiry spec failed against it: an
expired claim's stroke was refused because another lapsed claim had opened
an earlier gap meanwhile. A free column is now anyone's, capped at eight
past the furthest mark or claim so nobody can stretch the grid, and the ADR
says why it changed.

**Verified in a real browser, not just in `spec/`.** Two tabs on the CI
container: tab 1 held a stroke mid-drag while tab 2 drew in the same layer;
both marks saved in different columns and each tab saw the other's land
without a reload. With an analyser spliced in front of the speakers, a
rising flute line climbed from 574 to 891 Hz, a falling one fell from about
1055 to 662 Hz, a zigzag alternated between 879 and 1043 Hz, and a long
drum stroke booked three hits where a dot booked one. A mark arriving
mid-playback didn't reset the playhead. None of that has a spec: Web Audio,
pointer capture and playhead timing don't run under vitest, the same call
this file makes for the pointer-identity bug. Two fixes came from looking
rather than testing: the sheet opened scrolled to column 0, hiding the open
column on any grid wider than the screen, and the crumple lighting had
darkened the paper behind "draw here", so its ink moved to `--link`, which
measured 5.05:1 at worst against sampled pixels
([`58f4a4f`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-baishi-1/commit/58f4a4f)).

## What's still open

A shared playhead, enforcing "one mark per visitor" and accounts are
deliberately not built; `README.md` and `CLAUDE.md` say why. Claims are
lost on a restart, which the save path tolerates rather than prevents. The
crit's real test, six phones at once on the live URL, happens in the room.
