// Shared between the server (rendering the grid, validating saves) and the
// client (finding each layer's open column) so the two can never disagree
// about where a column sits. Every coordinate here is the real, unwarped one
// a mark's path is written in; the crumpled paper is only how it's drawn.

// Two stacked layers share the same columns: column c is beat c in both.
export const COL = 120;
export const ROWS = 8; // pitch rows in the melodic layer, top row highest
export const ROW_H = 36;

export type Layer = "top" | "bottom";

export const LAYERS: Record<Layer, { y: number; height: number }> = {
  top: { y: 24, height: ROWS * ROW_H },
  bottom: { y: 24 + ROWS * ROW_H + 32, height: 132 },
};

export const HEIGHT = LAYERS.bottom.y + LAYERS.bottom.height + 24;

// Colour still chooses the sound: each instrument's ink is its own
// (`--i-<key>` in global.css, with a dark-mode shade for each).
export const INSTRUMENTS = {
  piano: { label: "Piano", layer: "top" },
  strings: { label: "Strings", layer: "top" },
  flute: { label: "Flute", layer: "top" },
  bass: { label: "Bass", layer: "top" },
  synth: { label: "Synth", layer: "top" },
  drums: { label: "Drum Kit", layer: "bottom" },
  electro: { label: "Electronic Beat", layer: "bottom" },
  vocal: { label: "DJ Sample / Vocal Chop", layer: "bottom" },
} as const satisfies Record<string, { label: string; layer: Layer }>;

export type Instrument = keyof typeof INSTRUMENTS;

export function isInstrument(value: unknown): value is Instrument {
  return typeof value === "string" && Object.hasOwn(INSTRUMENTS, value);
}

// The server's fixed instrument→layer map. Clients never say which layer a
// mark is in; this decides it.
export function layerOf(instrument: Instrument): Layer {
  return INSTRUMENTS[instrument].layer;
}

export const MIN_COLUMNS = 8;
// Blank columns shown past the furthest open or claimed one, so the grid
// always reads as having somewhere left to go.
export const TRAILING_COLUMNS = 2;

export function totalWidth(columns: number): number {
  return Math.max(MIN_COLUMNS, columns + TRAILING_COLUMNS) * COL;
}

export function columnX(col: number): number {
  return col * COL;
}

// Which column a path belongs to: the one its first point sits in. The zone
// check below then holds every other point to that same column.
export function columnAt(x: number): number {
  return Math.floor(x / COL);
}

// The lowest column in a layer that has no mark and isn't held by anyone
// else's claim. Usually the right edge; an abandoned claim's gap comes first.
export function openColumn(occupied: Iterable<number>, claimed: Iterable<number>): number {
  const taken = new Set([...occupied, ...claimed]);
  let col = 0;
  while (taken.has(col)) col++;
  return col;
}

// Every mark is drawn twice: a soft halo this many times wider than its core
// stroke, then the stroke itself.
export const SOFT_SPREAD = 1.8;

// The box a mark's path coordinates must stay inside so its ink, halo
// included, never reaches past its own column into anyone else's mark.
export function zoneBounds(
  layer: Layer,
  col: number,
  width: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const reach = (width * SOFT_SPREAD) / 2;
  const x = columnX(col);
  const { y, height } = LAYERS[layer];
  return { minX: x + reach, maxX: x + COL - reach, minY: y + reach, maxY: y + height - reach };
}

// The y a keyboard dot lands at: the melodic layer's middle row, the
// percussive layer's middle.
export function defaultY(layer: Layer): number {
  const { y, height } = LAYERS[layer];
  return layer === "top" ? y + Math.floor(ROWS / 2) * ROW_H + ROW_H / 2 : y + height / 2;
}

// Every point a path names, control points included, or null if it isn't the
// one shape draw.ts emits: a moveto, then any run of L and Q segments. A
// quadratic curve never leaves the hull of its control points, so bounding
// these bounds the ink.
export function pathPoints(d: string): { x: number; y: number }[] | null {
  const tokens = d.trim().split(/\s+/);
  const arity: Record<string, number> = { M: 2, L: 2, Q: 4 };
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < tokens.length; ) {
    const command = tokens[i];
    const n = arity[command];
    if (n === undefined || (command === "M") !== (i === 0)) return null;
    const args = tokens.slice(i + 1, i + 1 + n).map(Number);
    if (args.length !== n || !args.every(Number.isFinite)) return null;
    for (let j = 0; j < n; j += 2) points.push({ x: args[j], y: args[j + 1] });
    i += 1 + n;
  }
  return points;
}
