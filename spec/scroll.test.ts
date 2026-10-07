import { expect, it } from "vitest";
import { COL, LAYERS } from "../src/lib/layout";
import { baseUrl, centre, claim, newToken, page, post } from "./helpers";

// The promises the grid makes to a stranger, checked over HTTP against
// whatever's running, never by reaching into the database: a mark you make
// is still there when you come back, in its own column of its own layer, and
// nothing can erase or paint over it.

it("a mark in each layer persists, and a fresh request finds it in that layer", async () => {
  for (const [instrument, layer] of [
    ["piano", "top"],
    ["drums", "bottom"],
  ] as const) {
    const token = newToken();
    const { col } = await claim(instrument, token);
    const { x, y } = centre(layer, col);
    const d = `M ${x} ${y} L ${x + 10} ${y + 10}`;
    const res = await post({ d, width: 6, instrument, token });
    expect(res.status).toBe(201);
    const saved = await res.json();
    expect(saved).toMatchObject({ instrument, col });

    // A second, independent request: only the database carries the mark.
    const doc = await page();
    const g = doc.querySelector(`#marks-${layer} g.mark[data-id="${saved.id}"]`);
    expect(g, `mark ${saved.id} should render in the ${layer} layer`).not.toBeNull();
    expect(g?.getAttribute("data-instrument")).toBe(instrument);
    expect(g?.querySelector("path.ink")?.getAttribute("d")).toBe(d);
  }
});

it("the server derives the layer from the instrument, whatever the body says", async () => {
  const token = newToken();
  const { col } = await claim("strings", token);
  const { x, y } = centre("top", col);
  const res = await post({ d: `M ${x} ${y} L ${x} ${y}`, width: 6, instrument: "strings", layer: "bottom", token });
  expect(res.status).toBe(201);
  const saved = await res.json();
  expect((await page()).querySelector(`#marks-top g.mark[data-id="${saved.id}"]`)).not.toBeNull();

  // A melodic instrument drawn in the percussive layer's space is outside
  // its own layer, so it's refused.
  const other = newToken();
  const granted = await claim("flute", other);
  const below = centre("bottom", granted.col);
  const wrong = await post({ d: `M ${below.x} ${below.y} L ${below.x} ${below.y}`, width: 6, instrument: "flute", token: other });
  expect(wrong.status).toBe(409);
});

it("rejects an unknown or missing instrument", async () => {
  const { x, y } = centre("top", 0);
  for (const instrument of ["kazoo", "", undefined, 3]) {
    const res = await post({ d: `M ${x} ${y} L ${x} ${y}`, width: 6, instrument });
    expect(res.status, String(instrument)).toBe(400);
  }
});

it("rejects a mark with no path, and one with an out-of-range width", async () => {
  expect((await post({ d: "", width: 6, instrument: "piano" })).status).toBe(400);
  expect((await post({ d: "M 60 100 L 61 101", width: 999, instrument: "piano" })).status).toBe(400);
});

it("normalises a bare tap (a moveto with no drawing command) into a paintable mark", async () => {
  // SVG renders nothing for "M x y" alone; see src/lib/db.ts.
  const token = newToken();
  const { col } = await claim("bass", token);
  const { x, y } = centre("top", col);
  const res = await post({ d: `M ${x} ${y}`, width: 14, instrument: "bass", token });
  expect(res.status).toBe(201);
  expect((await res.json()).d).toMatch(/L/);
});

it("refuses a mark that reaches outside its own column, halo included", async () => {
  const token = newToken();
  const { col } = await claim("synth", token);
  const { x, y } = centre("top", col);

  // A drag that starts in the column and runs left across the ones before it.
  const across = await post({ d: `M ${x} ${y} L ${x - COL * 3} ${y}`, width: 6, instrument: "synth", token });
  expect(across.status).toBe(409);

  // The halo counts: a path hugging the column's edge still bleeds over it.
  const edge = col * COL + 1;
  const bleed = await post({ d: `M ${edge} ${y} L ${edge} ${y}`, width: 40, instrument: "synth", token });
  expect(bleed.status).toBe(409);

  // And so does the layer's edge: no reaching from the top grid into the bottom.
  const down = await post({ d: `M ${x} ${y} L ${x} ${LAYERS.bottom.y + 20}`, width: 6, instrument: "synth", token });
  expect(down.status).toBe(409);
});

it("refuses a path that isn't the moveto-then-segments shape the client draws", async () => {
  const { x, y } = centre("top", 0);
  for (const d of [`L ${x} ${y}`, `M ${x} ${y} Z`, `M ${x} ${y} L ${x}`, `M ${x} ${y} L NaN ${y}`]) {
    const res = await post({ d, width: 6, instrument: "piano" });
    expect(res.status, d).toBe(400);
  }
});

it("never deletes: nothing in the app exposes a way to remove a mark", async () => {
  for (const path of ["/api/strokes", "/api/claims"]) {
    const res = await fetch(new URL(path, baseUrl), { method: "DELETE" });
    // No route handles DELETE (Astro's same-origin check rejects it with 403
    // before routing even gets a say): there's no delete path to call.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  }
});
