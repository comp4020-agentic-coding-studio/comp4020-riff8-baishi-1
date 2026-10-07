// Reads how a mark should sound off its shape alone: the saved path and
// width, nothing else. Pure functions, run client-side at playback time, so
// the sound is never a stored column that could disagree with the ink.
import { COL, LAYERS, pathPoints, ROW_H, ROWS, SOFT_SPREAD } from "./layout";

export type ShapeKind = "dot" | "short" | "sustain" | "rise" | "fall" | "trill" | "loop";

export interface Shape {
  kind: ShapeKind;
  length: number;
  reversals: number;
  turns: number; // full turns the path winds through
}

interface P {
  x: number;
  y: number;
}

const dist = (a: P, b: P): number => Math.hypot(b.x - a.x, b.y - a.y);

// Direction changes in y, ignoring wobble smaller than `hysteresis` px.
function yReversals(points: P[], hysteresis = 6): number {
  let count = 0;
  let dir = 0;
  let anchor = points[0].y;
  for (const p of points) {
    const delta = p.y - anchor;
    if (Math.abs(delta) < hysteresis) continue;
    const d = Math.sign(delta);
    if (dir !== 0 && d !== dir) count++;
    dir = d;
    anchor = p.y;
  }
  return count;
}

// Total signed turning along the path, in turns (2π = 1).
function winding(points: P[]): number {
  const steps: P[] = [points[0]];
  for (const p of points) if (dist(steps[steps.length - 1], p) >= 4) steps.push(p);
  let total = 0;
  for (let i = 2; i < steps.length; i++) {
    const a = Math.atan2(steps[i - 1].y - steps[i - 2].y, steps[i - 1].x - steps[i - 2].x);
    const b = Math.atan2(steps[i].y - steps[i - 1].y, steps[i].x - steps[i - 1].x);
    let turn = b - a;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    total += turn;
  }
  return Math.abs(total) / (2 * Math.PI);
}

export function classify(d: string): Shape {
  const points = pathPoints(d) ?? [{ x: 0, y: 0 }];
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  const start = points[0];
  const end = points[points.length - 1];
  const xs = points.map((p) => p.x);
  const w = Math.max(...xs) - Math.min(...xs);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const reversals = yReversals(points);
  const turns = winding(points);
  const closed = length > 60 && dist(start, end) < length * 0.2;

  let kind: ShapeKind;
  if (length < 14) kind = "dot";
  // A zigzag's turns cancel out and a loop's add up, so winding tells them
  // apart even though both reverse direction in y.
  else if (turns >= 0.85 || (closed && turns >= 0.5)) kind = "loop";
  else if (reversals >= 3) kind = "trill";
  else if (Math.abs(dy) >= ROW_H * 0.75 && Math.abs(dy) > Math.abs(dx) * 0.5)
    kind = dy < 0 ? "rise" : "fall";
  else if (w >= COL * 0.4 || length >= 60) kind = "sustain";
  else kind = "short";
  return { kind, length, reversals, turns };
}

// The melodic layer's pitch row at y, 0 the lowest.
export function pitchStep(y: number): number {
  const row = Math.floor((y - LAYERS.top.y) / ROW_H);
  return ROWS - 1 - Math.min(ROWS - 1, Math.max(0, row));
}

// 0..1 within its column's beat.
const beatFrac = (x: number): number => {
  const inner = COL - 2 * (14 * SOFT_SPREAD) / 2;
  const rel = (x - Math.floor(x / COL) * COL - (COL - inner) / 2) / inner;
  return Math.min(1, Math.max(0, rel));
};

// Thicker, slower strokes play louder.
export const intensity = (width: number): number => Math.min(1, Math.max(0.35, width / 14));

export interface Note {
  kind: ShapeKind;
  step: number; // starting pitch step
  glide: number; // steps to move by the end of the note (+ is up)
  start: number; // fraction of the beat
  duration: number; // fraction of the beat
  trill: number; // oscillations per beat, 0 for none
  repeats: number; // times the figure plays inside the beat
  gain: number;
}

export function melodicNote(d: string, width: number): Note {
  const shape = classify(d);
  const points = pathPoints(d) ?? [{ x: 0, y: 0 }];
  const xs = points.map((p) => p.x);
  const first = points[0];
  const last = points[points.length - 1];
  const start = beatFrac(Math.min(...xs));
  const span = Math.max(beatFrac(Math.max(...xs)) - start, 0);
  const note: Note = {
    kind: shape.kind,
    step: pitchStep(first.y),
    glide: 0,
    start: 0,
    duration: 0.95,
    trill: 0,
    repeats: 1,
    gain: intensity(width),
  };
  switch (shape.kind) {
    case "dot":
      return { ...note, start, duration: 0.14 };
    case "short":
      return { ...note, start, duration: 0.3 };
    case "sustain":
      return { ...note, start: Math.min(start, 0.3), duration: Math.max(0.6, span) * 1.1 };
    case "rise":
    case "fall": {
      const glide = pitchStep(last.y) - pitchStep(first.y);
      return { ...note, glide: glide === 0 ? (shape.kind === "rise" ? 1 : -1) : glide };
    }
    case "trill":
      return { ...note, trill: Math.min(16, 4 + shape.reversals * 2) };
    case "loop":
      return { ...note, repeats: Math.min(6, Math.max(3, Math.round(shape.turns * 2) + 1)), duration: 0.9 };
  }
}

export interface Hit {
  at: number; // fraction of the beat
  voice: 0 | 1 | 2; // 0 low (kick), 1 mid (snare), 2 high (hat)
  gain: number;
}

// The percussive layer: the column is the beat, the shape is the pattern
// inside it. A dot or short mark is one hit; a long stroke, a run of hits
// across the beat; a zigzag, a roll; a loop, a repeating figure. Each hit's
// voice comes from how high the path is at that point.
export function percussionHits(d: string, width: number): Hit[] {
  const shape = classify(d);
  const points = pathPoints(d) ?? [{ x: 0, y: 0 }];
  const { y, height } = LAYERS.bottom;
  const voiceAt = (py: number): 0 | 1 | 2 => {
    const f = (py - y) / height;
    return f < 1 / 3 ? 2 : f < 2 / 3 ? 1 : 0;
  };
  const gain = intensity(width);
  const xs = points.map((p) => p.x);
  const start = beatFrac(Math.min(...xs));

  const count =
    shape.kind === "dot" || shape.kind === "short"
      ? 1
      : shape.kind === "trill"
        ? 8
        : shape.kind === "loop"
          ? 4
          : Math.min(8, Math.max(2, Math.round(shape.length / 30)));
  if (count === 1) return [{ at: start, voice: voiceAt(points[0].y), gain }];

  const from = shape.kind === "trill" || shape.kind === "loop" ? 0 : Math.min(start, 0.5);
  const span = 1 - from;
  return Array.from({ length: count }, (_, i) => {
    const p = points[Math.round((i / (count - 1)) * (points.length - 1))];
    return { at: from + (span * i) / count, voice: voiceAt(p.y), gain: gain * (i === 0 ? 1 : 0.8) };
  });
}
