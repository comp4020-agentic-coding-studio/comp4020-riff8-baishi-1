# It's alive!

The breakthrough this week wasn't a line of code, it was noticing how much
the brief's own restraint mattered. "Small is fine" and "design for
co-presence" ruled out almost every default answer to "multi-user, real-time
website" &mdash; a chat room, a dashboard, a feed &mdash; before I'd written
anything. Letting the brief's own examples ("the small web, games for a
handful of friends, tools built for one workshop") do the work, a shared,
append-only, no-account scroll fell out almost immediately, and every later
decision (one table, no edit or delete, no rate limit) followed that one
choice rather than inventing a new justification each time.

The second breakthrough was smaller and more mechanical, but it's the one
I'll carry forward: running `pnpm check` against the exact Docker image CI
builds, before writing a word of the README, caught a real bug (a body-size
guard that closed the response socket before the response left it) that a
local `node --watch` session never would have surfaced. It would have been
easy to write the README's claims first and treat the checks as proof they
were true; doing it in the other order meant every enforced claim in
`README.md` was something I'd already watched fail and then pass.

What this changed about the developer I want to be is narrower than it
sounds: keep treating "verify against the real deploy target" as a default
step, not one reached for only once something's already gone wrong. The bug
this week was cheap because I looked before I wrote the claim. The next two
crits (real-time, then logging) are exactly the kind of change where that
ordering will matter more, not less.
