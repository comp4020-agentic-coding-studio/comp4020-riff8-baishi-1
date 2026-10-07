// Captures one mark from real pointer input (mouse, pen or touch), or a dot
// from Enter/Space, in a layer's open column, and hands it to the server as
// a single SVG path, a width and the chosen instrument. No undo, no redo: see
// CLAUDE.md on why a mark, once lifted, is final.
//
// Pointer-down claims the column first (docs/decisions/0001-who-gets-the-
// column.md), so every other tab moves its own open column along before the
// stroke is even finished.
import type { Box } from "./box";
import { COL, defaultY, type Instrument, isInstrument, type Layer, SOFT_SPREAD } from "./layout";

interface Point {
  x: number;
  y: number;
  t: number;
}

const MIN_MOVE = 2; // px between recorded points, so a slow drag isn't thousands of points
const BASE_WIDTH = 14;
const MIN_WIDTH = 3;
const MAX_RETRIES = 3;

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  const local = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
  return { x: local.x, y: local.y, t: performance.now() };
}

function rectOf(el: SVGRectElement): { x: number; y: number; width: number; height: number } {
  const n = (a: string): number => parseFloat(el.getAttribute(a) ?? "0");
  return { x: n("x"), y: n("y"), width: n("width"), height: n("height") };
}

// Pointer capture keeps a drag reporting after it leaves the column, so every
// point is pinned back inside it — inset by the widest ink this client can
// lay down — rather than letting the mark run over its neighbours. The
// server holds the same line (src/pages/api/strokes.ts).
function clampToZone(zoneHit: SVGRectElement, p: Point): Point {
  const reach = (BASE_WIDTH * SOFT_SPREAD) / 2;
  const { x, y, width, height } = rectOf(zoneHit);
  return {
    x: Math.min(Math.max(p.x, x + reach), x + width - reach),
    y: Math.min(Math.max(p.y, y + reach), y + height - reach),
    t: p.t,
  };
}

// Turns the recorded polyline into a smooth curve: a quadratic segment per
// point, aimed at the midpoint to the next one, is the standard trick for
// smoothing freehand input without needing a spline library.
function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  // A bare "M" has no paintable geometry — a zero-length "L" to the same
  // point is what actually gets a round-linecap dot on screen.
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// A brush dragged quickly lays down a thinner line than one held still —
// the one bit of real ink physics this borrows.
function strokeWidth(points: Point[]): number {
  if (points.length < 2) return BASE_WIDTH; // a tap is a dot, at full width
  let dist = 0;
  let time = 0;
  for (let i = 1; i < points.length; i++) {
    dist += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    time += Math.max(1, points[i].t - points[i - 1].t);
  }
  const speed = dist / time; // px/ms
  const width = BASE_WIDTH / (1 + speed * 6);
  return Math.max(MIN_WIDTH, Math.min(BASE_WIDTH, width));
}

function chosenInstrument(layer: Layer): Instrument | null {
  const checked = document.querySelector<HTMLInputElement>(`input[name="instrument-${layer}"]:checked`);
  return isInstrument(checked?.value) ? checked.value : null;
}

async function requestClaim(
  box: Box,
  instrument: Instrument,
  col: number,
): Promise<{ col: number; ttlMs: number }> {
  const res = await fetch("/api/claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instrument, col, token: box.token }),
  });
  if (!res.ok) throw new Error(`server said ${res.status}`);
  return res.json();
}

function initLayer(box: Box, layer: Layer, busy: { now: boolean }): void {
  const { svg, status } = box;
  const zone = svg.querySelector<SVGGElement>(`.zone-${layer}`);
  const zoneHit = zone?.querySelector<SVGRectElement>(".zone-hit");
  const preview = zone?.querySelector<SVGPathElement>(".preview");
  if (!zone || !zoneHit || !preview) return;

  let points: Point[] = [];
  let instrument: Instrument | null = null;
  // Which pointer owns the current drag, not just whether one is happening —
  // a stray second contact (a palm, a bracing finger) during a one-finger
  // drag must never move the stroke or end it early.
  let drawingPointerId: number | null = null;
  let claimed: Promise<unknown> = Promise.resolve();
  let renew: ReturnType<typeof setInterval> | undefined;

  const showPreview = (): void => {
    preview.setAttribute("d", smoothPath(points));
    preview.setAttribute("stroke-width", String(strokeWidth(points)));
    preview.setAttribute("class", `preview ink i-${instrument}`);
  };

  // Moves the stroke (and this tab's zone) to the column the server granted.
  // Every column in a layer has the same shape, so it's a plain shift in x.
  const moveTo = (col: number): void => {
    if (!box.mine) return;
    const dx = (col - box.mine.col) * COL;
    box.mine = { layer, col };
    if (dx !== 0) points = points.map((p) => ({ ...p, x: p.x + dx }));
    box.layout();
    if (points.length > 0) showPreview();
  };

  const claimAt = (col: number): Promise<void> =>
    requestClaim(box, instrument as Instrument, col).then((granted) => {
      moveTo(granted.col);
      clearInterval(renew);
      // Renewed while the stroke is still being drawn, so a slow, careful
      // mark never loses its column to the timeout.
      renew = setInterval(() => {
        if (box.mine) void requestClaim(box, instrument as Instrument, box.mine.col).catch(() => {});
      }, granted.ttlMs / 3);
    });

  const start = (): boolean => {
    instrument = chosenInstrument(layer);
    if (busy.now || !instrument) return false;
    busy.now = true;
    box.mine = { layer, col: box.open(layer) };
    box.layout();
    zone.classList.add("drawing");
    claimed = claimAt(box.mine.col).catch(() => {
      // No claim is fine: the save still lands if the column stays free.
    });
    return true;
  };

  const end = (message?: string): void => {
    clearInterval(renew);
    box.mine = null;
    busy.now = false;
    points = [];
    preview.setAttribute("d", "");
    box.layout();
    if (message) status.textContent = message;
  };

  const submitMark = async (): Promise<void> => {
    await claimed;
    status.textContent = "saving your mark…";
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch("/api/strokes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ d: smoothPath(points), width: strokeWidth(points), instrument, token: box.token }),
        });
        if (res.status === 409) {
          // The claim lapsed (a restart, a very long pause) and someone else
          // took the column. Ask for the next one and move the stroke there,
          // rather than throwing the mark away.
          await claimAt(-1);
          continue;
        }
        if (!res.ok) throw new Error(`server said ${res.status}`);
        const saved = await res.json();
        box.addMark({ ...saved, instrument }, false);
        end(`saved in column ${saved.col + 1}. ${box.marks.size} marks in the grid so far.`);
        return;
      } catch (err) {
        end(`couldn't save your mark (${(err as Error).message}). Try again.`);
        return;
      }
    }
    end("the grid is busy right now: couldn't find a free column. Try again.");
  };

  zoneHit.addEventListener("pointerdown", (event) => {
    if (!start()) return;
    drawingPointerId = event.pointerId;
    zoneHit.setPointerCapture(event.pointerId);
    points = [clampToZone(zoneHit, svgPoint(svg, event.clientX, event.clientY))];
    showPreview();
    event.preventDefault();
  });

  zoneHit.addEventListener("pointermove", (event) => {
    if (event.pointerId !== drawingPointerId) return;
    const p = clampToZone(zoneHit, svgPoint(svg, event.clientX, event.clientY));
    const last = points[points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_MOVE) return;
    points.push(p);
    showPreview();
  });

  const finish = async (event: PointerEvent): Promise<void> => {
    if (event.pointerId !== drawingPointerId) return;
    drawingPointerId = null;
    if (zoneHit.hasPointerCapture(event.pointerId)) zoneHit.releasePointerCapture(event.pointerId);
    await submitMark();
  };

  zoneHit.addEventListener("pointerup", finish);
  zoneHit.addEventListener("pointercancel", finish);

  // A keyboard has no drag to read a position or speed from, so its mark is
  // a single dot: a short note at the melodic layer's middle row, or one hit
  // in the middle of the beat.
  zoneHit.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); // Space must not scroll the page instead
    if (!start() || !box.mine) return;
    points = [{ x: box.mine.col * COL + COL / 2, y: defaultY(layer), t: performance.now() }];
    showPreview();
    void submitMark();
  });
}

export function initDrawing(box: Box): void {
  // One stroke at a time per tab, whichever layer it's in.
  const busy = { now: false };
  initLayer(box, "top", busy);
  initLayer(box, "bottom", busy);
}
