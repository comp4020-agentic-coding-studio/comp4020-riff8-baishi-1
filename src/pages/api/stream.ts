import type { APIRoute } from "astro";
import { publicClaims } from "../../lib/claims";
import { getStrokesAfter } from "../../lib/db";
import { type LiveEvent, subscribe } from "../../lib/live";

// Fly's proxy drops a connection that's been silent for about a minute.
const HEARTBEAT_MS = 20_000;

function frame({ event, data, id }: LiveEvent): string {
  return `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Server-sent events from the same process that saves marks. A client says
// the last mark id it has (`?after=` on first connect, the Last-Event-ID
// header EventSource sends on every reconnect), and gets every mark since
// from the database before anything live — so a dropped connection, or the
// machine stopping and starting, never loses a mark. Claims aren't replayed:
// the current set is sent on connect, and that's all of them there are.
export const GET: APIRoute = ({ request, url }) => {
  const fromHeader = Number(request.headers.get("last-event-id"));
  const fromQuery = Number(url.searchParams.get("after"));
  const after = Math.max(
    Number.isFinite(fromHeader) ? fromHeader : 0,
    Number.isFinite(fromQuery) ? fromQuery : 0,
  );

  let cleanup = (): void => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (chunk: string): void => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // All synchronous, so no save can land between reading the backlog
      // and subscribing: nothing is missed and nothing is sent twice.
      send("retry: 2000\n\n");
      for (const stroke of getStrokesAfter(after)) {
        send(frame({ event: "stroke", data: stroke, id: stroke.id }));
      }
      send(frame({ event: "claims", data: publicClaims() }));
      const unsubscribe = subscribe((e) => send(frame(e)));

      const heartbeat = setInterval(() => send(": heartbeat\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        cleanup = () => {};
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
};
