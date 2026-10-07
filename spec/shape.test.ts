import { expect, it } from "vitest";
import { COL, LAYERS, ROW_H } from "../src/lib/layout";
import { classify, melodicNote, percussionHits } from "../src/lib/shape";

// The shape reading is a pure function of the saved path, so its
// classification can be held here. Whether each one then *sounds* right (a
// rising line audibly rising, a trill trilling) is a real-browser check: the
// Web Audio API doesn't run under vitest. See PROCESS.md.

const x0 = 2 * COL + 20;
const yMid = LAYERS.top.y + 4 * ROW_H;
const poly = (pts: [number, number][]): string =>
  `M ${pts[0][0]} ${pts[0][1]}` + pts.slice(1).map(([x, y]) => ` L ${x} ${y}`).join("");

it("tells a dot, a short stroke and a long horizontal stroke apart", () => {
  expect(classify(poly([[x0, yMid], [x0, yMid]])).kind).toBe("dot");
  expect(classify(poly([[x0, yMid], [x0 + 25, yMid + 4]])).kind).toBe("short");
  expect(classify(poly([[x0, yMid], [x0 + 40, yMid], [x0 + 80, yMid + 2]])).kind).toBe("sustain");
});

it("reads a rising line as a rising pitch, and a falling one as falling", () => {
  const rise = poly([[x0, yMid + 2 * ROW_H], [x0 + 40, yMid - 2 * ROW_H]]);
  const fall = poly([[x0, yMid - 2 * ROW_H], [x0 + 40, yMid + 2 * ROW_H]]);
  expect(classify(rise).kind).toBe("rise");
  expect(melodicNote(rise, 8).glide).toBeGreaterThan(0);
  expect(classify(fall).kind).toBe("fall");
  expect(melodicNote(fall, 8).glide).toBeLessThan(0);
});

it("reads a zigzag as a trill, and a loop as a repeating figure", () => {
  const zigzag = poly([0, 1, 2, 3, 4, 5, 6].map((i) => [x0 + i * 10, yMid + (i % 2 ? -30 : 30)]));
  expect(classify(zigzag).kind).toBe("trill");
  expect(melodicNote(zigzag, 8).trill).toBeGreaterThan(0);

  const circle = poly(
    Array.from({ length: 25 }, (_, i): [number, number] => {
      const a = (i / 24) * 2 * Math.PI;
      return [x0 + 40 + 30 * Math.cos(a), yMid + 30 * Math.sin(a)];
    }),
  );
  expect(classify(circle).kind).toBe("loop");
  expect(melodicNote(circle, 8).repeats).toBeGreaterThan(1);
});

it("pitch is the row: higher on the page is a higher step", () => {
  const high = melodicNote(poly([[x0, LAYERS.top.y + 10], [x0, LAYERS.top.y + 10]]), 8);
  const low = melodicNote(poly([[x0, LAYERS.top.y + LAYERS.top.height - 10], [x0, LAYERS.top.y + LAYERS.top.height - 10]]), 8);
  expect(high.step).toBeGreaterThan(low.step);
});

it("in the percussive layer, a dot is one hit and a long stroke a run of hits inside the beat", () => {
  const y = LAYERS.bottom.y + LAYERS.bottom.height / 2;
  expect(percussionHits(poly([[x0, y], [x0, y]]), 8)).toHaveLength(1);
  const run = percussionHits(poly([[x0, y], [x0 + 80, y]]), 8);
  expect(run.length).toBeGreaterThan(1);
  for (const h of run) {
    expect(h.at).toBeGreaterThanOrEqual(0);
    expect(h.at).toBeLessThan(1);
  }
});
