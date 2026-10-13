# Process overview

## From the brief to a concept

The final project brief fixes three things &mdash; multi-user, real-time,
persists &mdash; and leaves everything else, including what "good" means, to
me. Crit 8's own brief narrows that further: ship a working slice and a first
README, and explicitly says the feature list, the real-time layer and the
polish can all wait, because this week's mark reads the exercise, not the
in-flight project. Two lines in the final project brief shaped the concept
more than any other: "small is fine: an app for twelve people, one street,
one book club or one afternoon is on-brief," and "design for co-presence: the
app should be more interesting because other people are using it at the same
time." I wanted a shared object that gets more interesting as more hands
touch it, without needing accounts, moderation, or anything that only makes
sense at a market's scale &mdash; which is also, not coincidentally, an
object I'm named after: a scroll that survives, imperfectly, across a long
time and several hands.

Long Scroll is the result: everyone who visits can add one stroke &mdash; a
colour, and an optional short note &mdash; to a single, shared, append-only
scroll. There's no feed, no ranking, no expiry. Multi-user is real (an
anonymous per-browser cookie is a person, and every visitor sees the same
persisted rows); persistence is real (SQLite on the Fly volume, verified to
survive a container restart, not just a page reload); real-time is
deliberately not built yet, because the brief stages it at the next crit
("All at once") and building it now, with nothing yet to test the several-
viewers story against, would have been work with no way to verify it was the
right call.

## Stack, and the trade-offs

The whole backend is a plain `node:http` server
([`2bfeff5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/2bfeff5)):
no Express, no Astro, no ORM. I weighed this against the stack I used for a
prior full-stack crit (Astro + Drizzle + better-sqlite3 + SSE) and chose
differently on purpose. That stack earns its weight when a site has many
content pages or needs a templating layer; this app has four JSON routes and
three static files, and a framework would be machinery the README's own
argument (fewer moving parts, matching Ben Hoyt's small-web case) would then
have to justify away. `node:sqlite`, not `better-sqlite3`, was the sharper
call: it ships inside Node 24 (already pinned in `mise.toml`), so there's no
native module to compile for the deploy target &mdash; one whole failure mode
(a missing build toolchain in a slim Docker image) doesn't exist. The cost is
real: it's a newer API with a smaller track record than `better-sqlite3`'s.
I judged that cost worth it against a 256MB machine and a course-long
project, where fewer things that can fail to build outweighs a library's
maturity.

The one runtime dependency is `marked`, to render `README.md` at `/readme/`
&mdash; hand-rolling a Markdown renderer for one file felt like exactly the
kind of premature abstraction the brief's "small is fine" argues against in
the other direction: pulling in machinery to avoid a small, well-tested
dependency isn't smaller, just differently complicated.

## Workflow: verify against the real thing before writing the claim

I built in the order a marker would read it, backwards: server and schema
first, front end second, then the checks in `spec/`
([`d417b24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/d417b24)),
then `README.md`
([`8e66feb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/8e66feb))
and `CLAUDE.md`
([`6ae9b34`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/6ae9b34))
last, so that every claim the README makes about what's enforced was already
true and tested, not aspirational. Before any of that landed, I built the
exact CI image locally (`docker build -t app .`, then the same
`docker run --tmpfs /data` line `checks.yml` uses) and ran `pnpm check`
against the running container, not just against a local `node --watch`
process &mdash; the same gap crit 7 taught me to check for: a stack behaving
correctly in dev and differently in the image CI actually gates on.

That local-against-Docker discipline caught a real bug before it ever
reached a commit. My first cut of the body-size guard called
`req.destroy()` the moment a request exceeded the cap, then tried to write a
413 response &mdash; but destroying the request's socket closes the
connection in both directions, so the response never reached the client;
`fetch` saw a bare connection reset instead of a 413. The regression test now
in `d417b24`
("rejects a body larger than the server's own cap") caught it immediately on
the first `pnpm test` run against the container. The fix
(`src/server.ts`) writes and ends the 413 response first, and only destroys
the socket afterwards. This is the shape of correction the brief asks for: a
real mistake, caught by a check written for a different reason (verifying the
cap exists at all), fixed in the code the check now guards &mdash; not a
retry until the suite went green.

The same discipline, applied to the front end rather than the server: once
every server-side boundary-validation and response-header check I could find
had come back clean, I asked what `fly.toml`'s own `auto_stop_machines`
setting implies for a real visitor &mdash; the one machine stops when idle
and starts on the next request, so a cold start (or any dropped connection)
is a genuine way for `app.js`'s `fetch` calls to reject, not just answer with
a bad status. Neither `load()` nor the submit handler checked for that;
confirmed live by routing `/api/marks` to abort mid-request
([`f1704db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/f1704db)):
an unhandled promise rejection in the console, and the status text stuck at
"adding your mark&hellip;" forever. Fixed with a `try`/`catch` around each
fetch, so a dropped connection degrades to a visible, honest message instead
of a silent hang.

A later pass asked a question none of the field-level validation above
covers: not what a direct request can put *in* the body, but what request
can reach the handler at all. The server never checked where a POST came
from, so I built a tiny page on a different local origin &mdash; a hidden,
auto-submitting `<form enctype="text/plain">`, the standard technique for
smuggling raw JSON past a server that (like this one) never checks the
`Content-Type` header &mdash; and confirmed live that visiting it silently
added a real row to the scroll, no click or confirmation involved. Into a
store with no edit or delete path, that is not a cosmetic gap: any visitor
who merely loaded an unrelated malicious page could have their browser
vandalise the scroll on their behalf, permanently. Fixed by checking every
POST's `Origin` header against its own `Host` &mdash; browsers set `Origin`
on every unsafe-method request and never let page script override it, so
this is the same defence Astro's own framework gave crit 7's project for
free; here, with no framework underneath, it had to be written by hand. Ran
the exact same attack page against the patched server afterward and
confirmed it no longer lands a row, while the real form still works.

A sixth pass asked a narrower question about the same body-size guard: the
existing test only ever sends a complete, over-cap request. A client whose
connection actually drops mid-upload (a flaky network, a closed tab) hits a
different branch of `readBody` &mdash; the socket's own `error` event, not the
size-cap check &mdash; which nothing exercised. Confirmed live with a raw
`node:net` socket that sends a partial body and then resets the connection:
the server already handles it correctly (the existing `req.on("error",
reject)` was wired up for the size-cap case but covers this one too), so this
didn't change `src/server.ts`. It did close a real coverage gap, landed as a
regression test
([`67e28e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/67e28e7))
that now pins the behaviour down rather than leaving it to coincidence.

A seventh pass asked a question none of the five before it had: not what a
request can carry, but what a genuine request, from a real visitor's own
browser, can be tricked into doing. The server had no defence against being
loaded inside another site's `<iframe>` at all. Confirmed live: a plain
cross-origin page embedding this app's `/` rendered it in full, no frame-
busting of any kind. Cross-origin JS can't read what's inside that frame,
but it doesn't need to &mdash; an attacker can overlay their own UI on top of
the iframe and trick a visitor into clicking "Add to the scroll" believing
they're clicking something else, landing a stroke under that visitor's own
real `hand` cookie. The Origin check from the fourth pass doesn't catch
this: the request is genuinely same-origin, made by the real page, with a
real cookie &mdash; only the click that triggered it was misdirected. Into a
store with no edit or delete path, that is exactly as serious as the forged-
origin gap it sits beside. Fixed with `X-Frame-Options: DENY` and a
`Content-Security-Policy: frame-ancestors 'none'` on every response
([`70cc828`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/70cc828)),
re-confirmed against the same attacker page: the frame now renders as a
broken image, nothing inside it.

An eighth pass stayed in the same family as the seventh rather than opening a
new area: once clickjacking was closed, what else belongs beside it among
response headers a browser reads on every request regardless of what the page
itself does. Neither `X-Content-Type-Options: nosniff` nor `Referrer-Policy`
were set anywhere. Both are cheap, zero-cost additions here &mdash; every
response already names its own content-type explicitly, so nosniff only
removes a browser's option to override that; and the page links out (the
source repo, the README's own cited essays) with nothing secret in its own
URL, so `no-referrer` costs nothing it needed to send
([`d908ddd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/d908ddd)).
Neither closes a reachable attack the way the Origin check or the frame
defence do; both are the kind of hardening worth having anyway once the
sharper gaps in the same family are already fixed.

A ninth pass turned the same "verify against the real thing before writing
the claim" discipline back on the README itself. It lists, under "Enforced,
in `spec/`," that a returning hand's past strokes survive a fresh server
restart &mdash; but every test in `spec/` hits the one app
`spec/global-setup.ts` finds already running; none of them ever restart it,
so that specific claim had nothing behind it. Closed the gap with a test
that spawns two short-lived `node src/server.ts` processes against an
isolated `DATA_DIR`, the same path production uses (a Fly volume standing in
for the temp directory), killing the first before starting the second
([`5987420`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/5987420)).
Checked the test was a real sensor, not a vacuous pass, by running the same
two-process sequence by hand with the second instance pointed at a
deliberately different data directory: the stroke correctly vanished,
confirming the assertion would have caught the regression it's there to
catch.

Running the same check over CLAUDE.md's rules found one more claim with
nothing behind it: the first and sharpest, that a stored stroke is never
edited or deleted. It held only because no route answered any method but
GET and POST, so nothing would notice a careless future route. A new test
tries PUT, PATCH and DELETE against both `/api/marks` and a stroke's own
path, as that stroke's own hand, and checks the stroke comes back
field-for-field unchanged; a sibling test confirms a body naming its own
`hand`, `id` or `createdAt` can't pass a stroke off as someone else's
([`ae4b724`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/ae4b724)).
As with the restart test, I checked it would actually fail by temporarily
adding a DELETE route that answered 204: the test caught it at once. The
README now names the rule among what `spec/` enforces
([`cbc60d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/cbc60d5)).

That left two rules only the page itself can keep, both checked so far only
by hand in a real browser: a stroke's owner is told in text, and every
control is a native labelled form element. A new spec file loads the served
page and the served `app.js` into jsdom against the running app, with the
page's fetch carrying a real `hand` cookie, and checks the visitor's own
stroke ends in "— yours" while someone else's doesn't, and that every input
and button has a label and sits in the tab order
([`0cd898c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi/commit/0cd898c)).
Each test failed against a deliberately broken build (the suffix removed;
the note's `<label for>` pointed elsewhere) before I kept it.

## What's next

Crit 9 is where real-time and a documented decision about several people
acting at once are due; crit 10 adds server-side logging. Both build on what
this crit ships rather than replace it: the schema, the validation, and the
append-only argument in this README are the foundation, not a placeholder to
be rewritten away. What I expect to revisit hardest by crit 9 is the
no-rate-limit choice &mdash; fine for a handful of known visitors, and the
first thing worth re-arguing once the scroll has to hold up with several
people adding strokes in the same few seconds.
