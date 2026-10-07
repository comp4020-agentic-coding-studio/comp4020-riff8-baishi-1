import type { APIRoute } from "astro";
import { claimedByOthers, holder, release, TOKEN } from "../../lib/claims";
import { addStroke, MAX_D_LENGTH, MAX_WIDTH, MIN_WIDTH, occupiedColumns } from "../../lib/db";
import { columnAt, isInstrument, layerOf, pathPoints, zoneBounds } from "../../lib/layout";
import { publish } from "../../lib/live";

const REACH_AHEAD = 8;

const refuse = (status: number, message: string): Response => new Response(message, { status });

// The only write path into the grid. Validated here, not just trusted from
// the client — see CLAUDE.md's rule that the data layer is the one place
// these promises actually hold.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, "expected a JSON body");
  }

  const { d, width, instrument, token } = (body ?? {}) as Record<string, unknown>;
  if (typeof d !== "string" || typeof width !== "number") {
    return refuse(400, 'expected { "d": string, "width": number, "instrument": string }');
  }
  if (!isInstrument(instrument)) {
    return refuse(400, "instrument must be one of the eight on the page");
  }
  if (d.length === 0 || d.length > MAX_D_LENGTH) {
    return refuse(400, "stroke path is empty or too long");
  }
  if (!Number.isFinite(width) || width < MIN_WIDTH || width > MAX_WIDTH) {
    return refuse(400, "stroke width out of range");
  }
  const points = pathPoints(d);
  if (points === null) {
    return refuse(400, "stroke path must be M, then L and Q segments only");
  }

  // The layer is the server's to decide, from the instrument alone; anything
  // else the body says about it is ignored.
  const layer = layerOf(instrument);
  const col = columnAt(points[0].x);
  const mine = typeof token === "string" && TOKEN.test(token) ? token : null;

  // A mark painted outside its own column would cover someone else's:
  // erasing by other means. Nothing awaits between these checks and the
  // insert, so no other write can land in between.
  const { minX, maxX, minY, maxY } = zoneBounds(layer, col, width);
  if (col < 0 || !points.every((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)) {
    return refuse(409, "stroke reaches outside its own column in its own layer");
  }

  const occupied = occupiedColumns()[layer];
  if (occupied.has(col)) {
    return refuse(409, "that column already has a mark");
  }
  const held = holder(layer, col);
  if (held !== null && held !== mine) {
    return refuse(409, "someone is drawing in that column");
  }
  // A free column is anyone's, claim or no claim (an expired claim is no
  // claim at all), but not one so far out it would stretch the grid: no
  // further than REACH_AHEAD past the furthest mark or claim in the layer.
  const furthest = Math.max(-1, ...occupied, ...claimedByOthers(layer, null));
  if (col > furthest + REACH_AHEAD) {
    return refuse(409, "that column is too far past the end of the grid");
  }

  const stroke = addStroke(d, width, instrument, col);
  release(layer, col);
  publish({ event: "stroke", data: stroke, id: stroke.id });
  return new Response(JSON.stringify(stroke), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};
