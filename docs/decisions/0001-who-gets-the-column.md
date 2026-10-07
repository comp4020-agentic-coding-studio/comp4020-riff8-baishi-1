# 0001: Who gets the open column

- Status: accepted
- Date: 2026-10-07
- Decided by: pod 1 at crit 8 (claim on pointer-down), recorded and built by
  the crit agent

## Context

The Scroll is becoming the Endless Music Box: two stacked grids that share
their columns, a melodic layer on top and a percussive one underneath. Each
layer grows the way the single strip used to, one mark per column, and a
saved mark is never erased or painted over (`CLAUDE.md`). The server checks
every mark sits inside its own column, halo included (`zoneBounds` in
`src/lib/layout.ts`).

Until now every visitor who loaded the page was offered the same blank
strip, and whoever saved second got a 409 and was told to reload. That was
an honest stopgap with one visitor at a time. At crit 9, five or six people
will open the app at once and draw. Under the old rule most of them would
lose the mark they had just made, which is the one thing `README.md` says a
visitor can rely on.

So the question is: when several people want the open column in the same
layer at the same moment, who gets it, and what does everyone else see?

## Options

### A. Claim on pointer-down (chosen)

Starting to draw in a layer's open column reserves it. The client posts a
claim the moment the pointer goes down (or Enter/Space is pressed), naming
the column it sees as open and an anonymous per-tab token. The server grants
that column if it is still free, or the next free one if not, and every
other tab hears about the claim over the live stream within a second and
moves its own open column along. The claim expires if the drawer goes quiet
(`CLAIM_TTL_MS`, ten seconds by default, renewed while the stroke is still
being drawn), and is released the moment the mark saves. Claims live in a
`Map` in server memory, not a table. Layers are independent: a claim in the
top grid never blocks the bottom one.

### B. Live shift

Nobody reserves anything. Everyone draws in the column they see; the first
save wins it, and every other tab's open column shifts right. A stroke still
in progress in a tab that lost is translated into the next column (or
dropped, if it can't be).

The strongest case for live shift, which the pod should argue at the crit:

- **It has no state that can go stale.** There is no claim to expire, no
  timeout to tune and nothing to lose on a restart. The database is the only
  truth, which is exactly the "one table, one file" standard `README.md`
  holds everything else to.
- **It never shows a column as taken by someone who isn't drawing.** A claim
  is a promise about the future; a saved mark is a fact. Live shift only ever
  displays facts.
- **It costs nothing to someone who starts and walks away.** With claims, a
  visitor who presses down, gets distracted and leaves a tab open blocks a
  column until the timeout. With live shift there's nothing to block.
- **Translation is cheap here.** Every mark lives inside one column, and every
  column in a layer has the same geometry, so moving a half-drawn stroke one
  column right is a single `dx`. It's the same move this ADR uses as its own
  fallback (below).

Why not, for this app: what moves is the stroke under the visitor's hand.
Someone mid-zigzag watching their own line jump a column to the right, or
vanish, because a stranger lifted their pen first, is the old 409 with
better manners. A music box is drawn with attention to *where* a note falls
relative to its neighbours in the other layer, and live shift takes that
placement away mid-gesture. Claims move the *other* people's open column,
before they have started, which costs them nothing.

### C. Reserve per session

Each tab is handed its own column ahead of time, on page load. No conflict
can happen, because nobody shares a column.

Why not: most tabs never draw (people look, play it back, leave). Every one
of them would leave a permanent blank beat in the music, and a blank column
in a sequencer is not neutral, it's a rest. It also turns "the open column
at the right edge" into a row of columns nobody may be using, which reads as
broken.

## Decision

Claim on pointer-down, as the pod chose. Nothing about this stack stops it:
the Astro node server is one long-lived process on one machine, so an
in-memory `Map` of claims is shared by every request and every live stream,
and server-sent events from the same process can tell every tab about a
claim the instant it's made.

The server stays the authority (`src/pages/api/strokes.ts`):

- a save into a column held by someone else's live claim is refused
- a save with no claim, or an expired one, is accepted when the column is
  the layer's open one
- layer is always derived from the instrument on the server, and the
  per-column `zoneBounds` check still applies to every save

## Costs, accepted

- **A stuck claim holds a column until the timeout.** A tab that presses
  down and is closed mid-stroke leaves that column marked "someone is drawing
  here" for up to `CLAIM_TTL_MS`. Other tabs simply get the next column, so
  nobody is blocked, but for those seconds the music has a reserved gap.
- **The timeout is a guess.** Too short, and a slow, careful stroke loses its
  claim mid-gesture; renewing the claim every few seconds while the pointer
  is still down covers that. Too long, and abandoned claims linger. Ten
  seconds, renewed every three, is the starting point; it's an environment
  variable so it can move without a code change (and so the spec can wait
  out a real expiry).
- **Claims are lost on restart.** Fly stops the machine when nobody is
  connected and a deploy restarts it. Claims vanish with it. Because a save
  with no claim is still accepted when the column is free, a stroke in
  flight across a restart usually still lands; when it doesn't (someone else
  saved there first), the client asks for a fresh claim and moves the stroke
  into the column it's granted before saving, rather than throwing it away.
  That fallback is live shift, used only where claims can't cover the case.
- **The lowest free column wins, not strictly the right edge.** When a claim
  is abandoned after a later column has been filled, the gap it leaves is the
  next column offered, so the music doesn't keep a permanent rest there. The
  open column is therefore usually, not always, at the right edge.
- **A malicious client can claim columns it never draws in.** Nothing stops
  a script from claiming the open column every ten seconds. That's the same
  class of problem as "one mark per visitor", which this crit deliberately
  leaves unenforced; the cost of abuse is a gap, never a lost or overwritten
  mark.
