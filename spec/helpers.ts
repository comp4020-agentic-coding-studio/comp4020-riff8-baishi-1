import { JSDOM } from "jsdom";
import { inject } from "vitest";
import { COL, type Layer, LAYERS } from "../src/lib/layout";

export const baseUrl = inject("baseUrl");

export const newToken = (): string => `spec-${Math.random().toString(36).slice(2, 12)}`;

export function post(body: unknown): Promise<Response> {
  return fetch(new URL("/api/strokes", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Claims a column the way pointer-down does. -1 asks for the layer's open one.
export async function claim(
  instrument: string,
  token: string,
  col = -1,
): Promise<{ col: number; ttlMs: number }> {
  const res = await fetch(new URL("/api/claims", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instrument, col, token }),
  });
  if (!res.ok) throw new Error(`claim refused: ${res.status}`);
  return res.json();
}

export function centre(layer: Layer, col: number): { x: number; y: number } {
  return { x: col * COL + COL / 2, y: LAYERS[layer].y + LAYERS[layer].height / 2 };
}

export async function page(): Promise<Document> {
  const html = await fetch(new URL("/", baseUrl)).then((r) => r.text());
  return new JSDOM(html).window.document;
}

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

// A minimal EventSource over fetch: Node has no EventSource, and this lets a
// spec send headers (Last-Event-ID) and time each event as it arrives.
export async function openStream(
  query = "",
  headers: Record<string, string> = {},
): Promise<{ next(match: (e: SseEvent) => boolean, ms?: number): Promise<SseEvent>; close(): void }> {
  const controller = new AbortController();
  const res = await fetch(new URL(`/api/stream${query}`, baseUrl), { headers, signal: controller.signal });
  if (!res.ok || !res.body) throw new Error(`stream refused: ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  const queue: SseEvent[] = [];

  const pull = async (): Promise<void> => {
    const { value, done } = await reader.read();
    if (done) throw new Error("stream ended");
    buffer += value;
    let at: number;
    while ((at = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      const e: SseEvent = { event: "message", data: "" };
      for (const line of block.split("\n")) {
        const [field, ...rest] = line.split(": ");
        if (field === "event") e.event = rest.join(": ");
        else if (field === "data") e.data += rest.join(": ");
        else if (field === "id") e.id = rest.join(": ");
      }
      if (e.data) queue.push(e);
    }
  };

  return {
    async next(match, ms = 2000) {
      const deadline = Date.now() + ms;
      for (;;) {
        const i = queue.findIndex(match);
        if (i !== -1) return queue.splice(i, 1)[0];
        const left = deadline - Date.now();
        if (left <= 0) throw new Error("no matching event in time");
        await Promise.race([
          pull(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("no matching event in time")), left)),
        ]);
      }
    },
    close() {
      controller.abort();
    },
  };
}
