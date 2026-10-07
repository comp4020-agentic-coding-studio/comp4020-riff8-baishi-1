// The in-memory bus behind the live stream (src/pages/api/stream.ts). One
// process on one machine, so a Set of listeners is all a broadcast needs;
// nothing here outlives a restart, and nothing needs to: marks catch up from
// the database by id, and claims are short-lived by design
// (docs/decisions/0001-who-gets-the-column.md).

export interface LiveEvent {
  event: "stroke" | "claims";
  data: unknown;
  id?: number;
}

type Listener = (e: LiveEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish(e: LiveEvent): void {
  for (const listener of listeners) listener(e);
}
