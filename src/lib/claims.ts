// Claims on a layer's open column, held in server memory only. See
// docs/decisions/0001-who-gets-the-column.md for why claims, and what they
// cost. The token is an anonymous per-tab id the client makes up; it is never
// broadcast, so nobody can save into a column someone else holds by copying
// theirs off the stream.
import { occupiedColumns } from "./db";
import { type Layer, openColumn } from "./layout";
import { publish } from "./live";

// The anonymous per-tab token: random, made up by the client, never a login.
export const TOKEN = /^[A-Za-z0-9-]{8,64}$/;

export const CLAIM_TTL_MS = Number(process.env.CLAIM_TTL_MS) || 10_000;

interface Claim {
  layer: Layer;
  col: number;
  token: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const claims = new Map<string, Claim>();
const key = (layer: Layer, col: number): string => `${layer}:${col}`;

// What every tab is told: where the claims are, never whose.
export function publicClaims(): { layer: Layer; col: number }[] {
  return [...claims.values()].map(({ layer, col }) => ({ layer, col }));
}

function broadcast(): void {
  publish({ event: "claims", data: publicClaims() });
}

export function holder(layer: Layer, col: number): string | null {
  return claims.get(key(layer, col))?.token ?? null;
}

// Columns held by anyone but `token`.
export function claimedByOthers(layer: Layer, token: string | null): number[] {
  return [...claims.values()]
    .filter((c) => c.layer === layer && c.token !== token)
    .map((c) => c.col);
}

function drop(claim: Claim): void {
  clearTimeout(claim.timer);
  claims.delete(key(claim.layer, claim.col));
}

// Grants `wanted` if it's still free for this token, otherwise the layer's
// next open column. A token holds one claim at a time: a tab draws one stroke
// at a time, so a new claim lets go of any older one. Renewing your own claim
// just pushes its expiry back.
export function claim(
  layer: Layer,
  wanted: number,
  token: string,
): { col: number; expiresAt: number; ttlMs: number } {
  const occupied = occupiedColumns()[layer];
  const others = claimedByOthers(layer, token);
  const free = (c: number): boolean => c >= 0 && !occupied.has(c) && !others.includes(c);
  const col = Number.isInteger(wanted) && free(wanted) ? wanted : openColumn(occupied, others);

  for (const c of [...claims.values()]) if (c.token === token) drop(c);

  const expiresAt = Date.now() + CLAIM_TTL_MS;
  const entry: Claim = {
    layer,
    col,
    token,
    expiresAt,
    timer: setTimeout(() => {
      if (claims.get(key(layer, col)) === entry) {
        drop(entry);
        broadcast();
      }
    }, CLAIM_TTL_MS),
  };
  claims.set(key(layer, col), entry);
  broadcast();
  return { col, expiresAt, ttlMs: CLAIM_TTL_MS };
}

// A saved mark ends its column's claim, whoever held it.
export function release(layer: Layer, col: number): void {
  const c = claims.get(key(layer, col));
  if (c) {
    drop(c);
    broadcast();
  }
}
