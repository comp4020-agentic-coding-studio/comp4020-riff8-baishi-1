# Crit 9: make The Scroll live for a room full of people

Read the [crit 9 brief, "All at once"](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/) first. At the next crit, five or six people will open <https://comp4020-riff8-baishi-1.fly.dev/> on their phones and laptops at the same moment and draw. Get the app ready for that. `CLAUDE.md`'s "left open on purpose" section deferred real-time sync and multi-user behaviour to this crit, so that work is now in scope. Every other rule in `CLAUDE.md` still holds.

## The goal

1. **Real-time.** When anyone saves a mark, every other open tab shows it within about a second, with no reload. The mark count and the scroll width update along with it.
2. **One multi-user decision, recorded before it's built.** The decision this app has to make is **who gets the blank strip**. Right now everyone who loads the page is offered the same strip, and whoever saves second gets a 409 and a reload (`src/pages/api/strokes.ts`, `src/lib/draw.ts` around the 409 branch). With six people drawing at once, most of them would lose their mark. That is the problem to solve. Weigh at least these options:
   - **live shift**: a saved mark pushes the blank strip right in every other tab, and any half-drawn stroke is translated across or discarded
   - **claim on pointer-down**: starting to draw reserves the strip, others immediately see it as taken ("someone is drawing here") and get the next one, and the claim expires if abandoned
   - **reserve per session**: each open tab is given its own strip ahead of time, at the cost of gaps when someone leaves without drawing

   Judge them against `README.md`'s "small on purpose" argument and its never-erased, never-overpainted promise. Pick one and write an ADR at `docs/decisions/0001-who-gets-the-strip.md`: the options, why the winner fits _this_ app, what it costs, and the strongest argument for the option you rejected (the pod will make it at the crit). Commit the ADR before the code that implements it. Then bring `README.md` up to date: its "judged, not enforced" and "what's here now" paragraphs describe the stale-strip refusal and say real-time is next crit's work, and both stop being true.

What would make this interesting rather than merely compliant: in a room, the other people drawing should be _felt_. Someone watching should see that a strip is taken, or see a mark arrive and the scroll extend. Keep it to what fits the ink-wash aesthetic. Don't add cursors, avatars or names.

## Constraints

- **One process, one SQLite file, one volume.** Server-sent events from the existing Astro node server are the obvious fit. No Redis, no second service, no hosted realtime provider. The machine is 256 MB and auto-stops, so keep connection state in memory, send a heartbeat so Fly's proxy doesn't drop idle streams, and make reconnecting after a dropped connection or a machine restart catch up on missed marks (for example by sending the last seen `id`).
- **No accounts.** If your decision needs identity, use an anonymous per-tab token at most, as `CLAUDE.md` says.
- **The server stays the authority.** Whatever claim or zone logic you choose is enforced in the data layer, not just the client. Keep the overpaint check (`zoneBounds`) server-side, and adjust it to whatever the new strip-assignment rule is. Never add an update or delete on `strokes`. Keep `CLAUDE.md`'s one-table rule: claims or reservations are short-lived and there is one machine, so hold them in server memory, not in a second table.
- **Without JavaScript, `/` still renders every mark and answers 200.** Live updates are progressive enhancement.
- **Keyboard drawing still works** (Enter or Space leaves a dot).

## What good looks like (check all of these before you finish)

- A new spec in `spec/` opens the live stream, POSTs a valid mark from a second client, and asserts the stream delivers it in under 1 s. It runs in `pnpm check` against the running app, like the others.
- Specs that pin your strip decision: two clients drawing at the same time both get their marks saved without overlapping, or, if your decision still refuses in some case, the spec shows exactly which case and what message the client receives.
- `spec/invariants.test.ts` stays green and untouched. Update `spec/scroll.test.ts` where the stale-strip behaviour changes. Don't delete its no-delete or validation checks.
- `pnpm check` and `pnpm check:evidence` are green on every commit.
- In a real browser, with two windows on the deployed site side by side: a mark drawn in one shows up in the other with no reload, and both windows drawing at once both keep their marks. Do this on the live Fly URL after the deploy, not just locally.
- `main` deploys and the live site serves the new behaviour.

## Leave alone

- The look: the ink-wash style, the one-path-per-mark rendering, the sparse page. Visual changes are limited to what the live and presence behaviour needs.
- The existing 20+ marks in the production database. Any schema change must be additive and must not rewrite existing rows.
- `/readme/` rendering, and the `CLAUDE.md` riff block at the top.
- Don't build a gallery, undo, moderation or "one mark per person" enforcement. They aren't this crit's decision.

## Process

Commit in small steps that show the work growing: ADR, then stream, then strip logic, then README. This repo is a riff, so don't write `reflections/crit-9.md`. Rewrite `PROCESS.md` in place only if its description of the system is now wrong, and keep it inside its band. Delete `prompt.md` in your last commit, as `CLAUDE.md` says.

## Read first

- `README.md`: the argument every decision is judged against
- `CLAUDE.md`: the harness rules
- `src/pages/api/strokes.ts`, `src/lib/layout.ts`, `src/lib/draw.ts`, `src/lib/db.ts`, `src/pages/index.astro`: the whole app
- `reflections/crit-8.md` and `agent/now.md`: where the last run left off, and why "never overpainted" matters
- The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/), so the choice still makes sense for crit 10 and the final submission
