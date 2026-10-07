# The Endless Music Box

A shared music box drawn on a crumpled sheet of paper. Two grids share the
same columns: the top one is melodic, with eight pitch rows, and the bottom
one is percussive. A column is one beat in both. Pick an instrument, draw
one mark in a grid's open column, and it's part of the music from then on.
Nobody can undo it, including you. Press play and a playhead walks the
columns one beat at a time, and the sound blasts out of a big brass trumpet
at the side of the sheet.

It began as The Scroll, a single strip of ink that only grew. Its first
marks are still there, kept exactly as drawn under the grid, and silent.

## What good means here

Good, for this app, still means **small on purpose**: one shared surface,
one SQLite file, one small machine, nothing that scales past what those can
hold. Three things I read while deciding what that should look like:

- Robin Sloan's
  [_An app can be a home-cooked meal_](https://www.robinsloan.com/notes/home-cooked-app/)
  argues that software built for a small, known use doesn't need accounts,
  growth or retention. The music box has no login and no notion of "your"
  marks once they're made.
- Ben Hoyt's [_The small web is beautiful_](https://benhoyt.com/writings/the-small-web-is-beautiful/)
  argues for fewer moving parts as a virtue in itself. Real-time arrives
  without a second service: the same Node process that saves a mark streams
  it to every open tab.
- Hundred Rabbits'
  [description of their own practice](https://sourcehut.org/blog/2021-12-08-100-rabbits-interview/) —
  "if we can use less technology to solve any one task, we will" — is why
  every sound is synthesized in the browser rather than fetched from a
  sample library, and why how a mark sounds is read off the shape already
  saved rather than stored beside it.

## How a mark sounds

Colour chooses the instrument: Piano, Strings, Flute, Bass or Synth in the
top grid, Drum Kit, Electronic Beat or a vocal chop in the bottom. Height in
the top grid is pitch. The shape decides the rest. A dot is a short,
staccato note and a long horizontal stroke is held. A rising line rises in
pitch and a falling one falls. A zigzag trills, and a loop repeats inside
its beat. In the bottom grid a dot is one hit, a long stroke a run of hits
across the beat, a zigzag a roll, and how high each part is drawn picks
kick, snare or hi-hat.

## All at once

When anyone saves a mark, every other open tab sees it land within about a
second, no reload. When someone presses down in a grid's open column, that
column is theirs while they draw: every other tab sees it hatched as
"someone is drawing here" and is offered the next column instead, so six
people drawing at once all keep their marks. A claim is let go when the
mark saves, or after ten seconds of silence if the drawer walks away. The
reasoning, and the case for the alternatives, is in
[`docs/decisions/0001-who-gets-the-column.md`](docs/decisions/0001-who-gets-the-column.md).

## What's enforced, and what's judged

What's **enforced**, on the server: a mark, once saved, is never edited or
deleted, and nor can a later one paint over it, since every mark has to stay
inside its own column of its own layer, soft edge and all. The server
decides the layer from the instrument; a client can't say otherwise. A
column someone else has claimed can't be saved into. The page that shows the
grid works without JavaScript, and drawing doesn't need a pointer: each open
column is a real control, and Enter or Space leaves a dot. All of this is
checked over HTTP in `spec/`.

What's **judged, not enforced**: nothing stops a visitor drawing a second
mark, or a tenth. Enforcing "one mark per person" needs a real notion of a
person, which this app deliberately doesn't have; an anonymous per-tab token
says who holds a claim, and nothing more. The music box trusts you the way a
paper one would.

## The look

The sheet is crumpled now: creased and lit unevenly, with a battered edge,
like paper that's been carried around in a pocket. Ink-wash painting
tolerates the mark that goes wrong, and so does a scrunched-up sheet; neither
pretends to be pristine. The crumple is only how the paper is drawn. Every
mark is saved and checked in flat coordinates, and the trumpet and the
creases are decoration, hidden from assistive tech.

## What I deliberately didn't build

The playhead is yours alone: pressing play starts it for you, not for the
room. A shared playhead is a bigger decision (whose tempo, who can stop it)
than this round should make in passing. Also not here: accounts, undo,
moderation, likes, a gallery of past sheets, or anything needing a second
service.
