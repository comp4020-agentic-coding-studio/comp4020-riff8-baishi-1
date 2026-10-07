import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Instrument, type Layer, isInstrument, layerOf } from "./layout";

// /data is the one thing Fly's volume gives us (see fly.toml); everywhere
// else (local dev, CI's throwaway container) falls back to a working-tree
// path that's gitignored.
const DB_PATH = process.env.DB_PATH ?? "./.data/scroll.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// The smallest schema that can carry the core interaction: one mark is one
// row. Nothing here ever updates or deletes a row — see CLAUDE.md.
db.exec(`
  CREATE TABLE IF NOT EXISTS strokes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    d TEXT NOT NULL,
    width REAL NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

// Additive migration for the grid. `CREATE TABLE IF NOT EXISTS` never adds a
// column to a table already on the volume, so each one is added only if it's
// missing. Rows from the continuous scroll keep NULL in both: they're the
// prologue, not part of the grid. Layer is never stored; it's derived from
// the instrument (layerOf).
const existing = new Set(
  (db.prepare("PRAGMA table_info(strokes)").all() as { name: string }[]).map((c) => c.name),
);
if (!existing.has("instrument")) db.exec("ALTER TABLE strokes ADD COLUMN instrument TEXT");
if (!existing.has("col")) db.exec("ALTER TABLE strokes ADD COLUMN col INTEGER");

export interface Stroke {
  id: number;
  d: string;
  width: number;
  createdAt: number;
  instrument: Instrument | null;
  col: number | null;
}

const COLUMNS = "id, d, width, created_at AS createdAt, instrument, col";
const insertStmt = db.prepare(
  "INSERT INTO strokes (d, width, created_at, instrument, col) VALUES (?, ?, ?, ?, ?)",
);
const selectAllStmt = db.prepare(`SELECT ${COLUMNS} FROM strokes ORDER BY id ASC`);
const selectAfterStmt = db.prepare(`SELECT ${COLUMNS} FROM strokes WHERE id > ? ORDER BY id ASC`);
const gridStmt = db.prepare("SELECT instrument, col FROM strokes WHERE col IS NOT NULL");

// A generous cap, not a design constraint: it exists only so one request
// can't hand the server an unbounded string.
export const MAX_D_LENGTH = 20_000;
export const MIN_WIDTH = 1;
export const MAX_WIDTH = 40;

export function getAllStrokes(): Stroke[] {
  return selectAllStmt.all() as Stroke[];
}

export function getStrokesAfter(id: number): Stroke[] {
  return selectAfterStmt.all(id) as Stroke[];
}

// The columns that already hold a mark, per layer.
export function occupiedColumns(): Record<Layer, Set<number>> {
  const occupied: Record<Layer, Set<number>> = { top: new Set(), bottom: new Set() };
  for (const row of gridStmt.all() as { instrument: string; col: number }[]) {
    if (isInstrument(row.instrument)) occupied[layerOf(row.instrument)].add(row.col);
  }
  return occupied;
}

// A bare "M x y" has no paintable geometry in SVG — a browser silently
// renders nothing for it. draw.ts already avoids emitting one, but the data
// layer is the one place this promise (every saved mark is visible) can
// actually be held regardless of what any future client sends.
const BARE_MOVETO = /^M\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*$/;

export function addStroke(d: string, width: number, instrument: Instrument, col: number): Stroke {
  const bare = d.match(BARE_MOVETO);
  const safeD = bare ? `${d} L ${bare[1]} ${bare[2]}` : d;
  const createdAt = Date.now();
  const info = insertStmt.run(safeD, width, createdAt, instrument, col);
  return { id: Number(info.lastInsertRowid), d: safeD, width, createdAt, instrument, col };
}
