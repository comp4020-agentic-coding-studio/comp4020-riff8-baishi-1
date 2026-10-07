import type { APIRoute } from "astro";
import { claim, TOKEN } from "../../lib/claims";
import { isInstrument, layerOf } from "../../lib/layout";



// Pointer-down (or Enter/Space) on a layer's open column posts here. The
// layer comes from the instrument, never from the client. The response says
// which column was actually granted: the one asked for if it's still free,
// otherwise the next open one, and the client moves its stroke there.
export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response("expected a JSON body", { status: 400 });
  }
  const { instrument, col, token } = body ?? {};
  if (!isInstrument(instrument) || typeof token !== "string" || !TOKEN.test(token)) {
    return new Response('expected { "instrument": one of the eight, "col": number, "token": string }', {
      status: 400,
    });
  }
  const granted = claim(layerOf(instrument), typeof col === "number" ? col : -1, token);
  return new Response(JSON.stringify(granted), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
