// The playhead: steps column by column across the whole grid and plays every
// mark each column holds, both layers at once, out of the trumpet. Started by
// a real button, never on its own, and local to this tab: nobody else's
// playhead moves when yours does (README.md says why).
import { createSynth, type Synth } from "./audio";
import type { Box, Mark } from "./box";
import { COL } from "./layout";

const BEAT = 0.5; // seconds per column
const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of the clock
const TICK_MS = 30;
const GLYPHS = ["♪", "♫", "♩", "♬"];

export function initPlayback(box: Box): void {
  const transport = document.querySelector<HTMLElement>(".transport");
  const button = document.querySelector<HTMLButtonElement>("#play");
  const range = document.querySelector<HTMLInputElement>("#playhead-pos");
  const label = document.querySelector<HTMLOutputElement>("#playhead-label");
  const playhead = box.svg.querySelector<SVGRectElement>("#playhead");
  const bursts = document.querySelector<HTMLElement>("#bursts");
  const trumpet = document.querySelector<HTMLElement>(".trumpet-wrap");
  if (!transport || !button || !range || !label || !playhead || !bursts || !trumpet) return;
  transport.hidden = false;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let synth: Synth | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let next = 0; // the next column to schedule
  let nextTime = 0;

  const marksIn = (col: number): Mark[] => [...box.marks.values()].filter((m) => m.col === col);
  const lastCol = (): number => Math.max(0, box.lastFilled());

  const show = (col: number): void => {
    playhead.setAttribute("x", String(col * COL));
    playhead.setAttribute("visibility", "visible");
    range.value = String(col);
    label.value = String(col + 1);
    const played = marksIn(col);
    for (const g of box.svg.querySelectorAll<SVGGElement>(`g.mark[data-col="${col}"]`)) {
      g.classList.remove("playing");
      void g.getBoundingClientRect(); // restart the animation
      g.classList.add("playing");
    }
    if (played.length > 0) blast(played);
  };

  // Something bursts out of the bell for every mark the column plays, in that
  // instrument's own ink.
  const blast = (played: Mark[]): void => {
    trumpet.classList.remove("blowing");
    void trumpet.offsetWidth;
    trumpet.classList.add("blowing");
    if (reducedMotion.matches) return;
    for (const m of played) {
      const span = document.createElement("span");
      span.className = `burst i-${m.instrument}`;
      span.textContent = GLYPHS[m.id % GLYPHS.length];
      span.style.setProperty("--rise", `${Math.round((Math.random() - 0.5) * 140)}px`);
      span.style.setProperty("--fly", `${120 + Math.round(Math.random() * 120)}px`);
      span.addEventListener("animationend", () => span.remove());
      bursts.append(span);
    }
  };

  const playColumn = (col: number, when: number): void => {
    if (!synth) return;
    for (const m of marksIn(col)) synth.play(m.instrument, m.d, m.width, when, BEAT);
    const delay = Math.max(0, (when - synth.ctx.currentTime) * 1000);
    setTimeout(() => show(col), delay);
  };

  const ensureSynth = async (): Promise<Synth> => {
    synth ??= createSynth();
    if (synth.ctx.state === "suspended") await synth.ctx.resume();
    return synth;
  };

  // A lookahead scheduler: audio is booked slightly ahead on the audio clock,
  // which keeps the beat steady however busy the main thread gets. Marks
  // arriving live extend the loop without resetting it.
  const tick = (): void => {
    if (!synth) return;
    while (nextTime < synth.ctx.currentTime + LOOKAHEAD) {
      playColumn(next, nextTime);
      nextTime += BEAT;
      next = next >= lastCol() ? 0 : next + 1;
    }
  };

  const stop = (): void => {
    clearInterval(timer);
    timer = undefined;
    button.textContent = "Play";
    button.setAttribute("aria-pressed", "false");
  };

  button.addEventListener("click", async () => {
    if (timer !== undefined) return stop();
    const s = await ensureSynth();
    next = Math.min(Number(range.value), lastCol());
    nextTime = s.ctx.currentTime + 0.05;
    button.textContent = "Stop";
    button.setAttribute("aria-pressed", "true");
    timer = setInterval(tick, TICK_MS);
    tick();
  });

  // The playhead is a real control: arrow keys (or a drag) move it a column
  // at a time. Stopped, a move plays that one column; playing, it carries on
  // from wherever it was put.
  range.addEventListener("input", async () => {
    const col = Number(range.value);
    label.value = String(col + 1);
    if (timer !== undefined) {
      next = col;
      return;
    }
    const s = await ensureSynth();
    playColumn(col, s.ctx.currentTime + 0.02);
  });

  const fit = (): void => {
    range.max = String(lastCol());
  };
  box.onLayout.add(fit);
  fit();
}
