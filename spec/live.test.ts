import { expect, it } from "vitest";
import { centre, claim, newToken, openStream, post } from "./helpers";

// Crit 9's bar: one person's change reaches every other open session within
// about a second, with no reload. And the multi-user decision recorded in
// docs/decisions/0001-who-gets-the-column.md: claim on pointer-down, with
// the server as the authority.

const dot = (layer: "top" | "bottom", col: number): string => {
  const { x, y } = centre(layer, col);
  return `M ${x} ${y} L ${x + 4} ${y}`;
};

it("the live stream delivers a mark saved by another client in under a second", async () => {
  // Far past any real id, so no backlog: only what's saved from here on.
  const stream = await openStream("?after=999999999");
  try {
    await stream.next((e) => e.event === "claims");
    const token = newToken();
    const { col } = await claim("flute", token);
    const sent = Date.now();
    const res = await post({ d: dot("top", col), width: 6, instrument: "flute", token });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const e = await stream.next((ev) => ev.event === "stroke" && JSON.parse(ev.data).id === id, 1000);
    expect(Date.now() - sent).toBeLessThan(1000);
    expect(e.id).toBe(String(id));
    expect(JSON.parse(e.data)).toMatchObject({ instrument: "flute", col });
  } finally {
    stream.close();
  }
});

it("a reconnect catches up on marks it missed, from the last id it saw", async () => {
  const token = newToken();
  const { col } = await claim("drums", token);
  const res = await post({ d: dot("bottom", col), width: 6, instrument: "drums", token });
  const { id } = await res.json();

  // As EventSource reconnects: Last-Event-ID says where it left off.
  for (const [query, headers] of [
    [`?after=${id - 1}`, {}],
    ["", { "last-event-id": String(id - 1) }],
  ] as const) {
    const stream = await openStream(query, headers);
    try {
      const e = await stream.next((ev) => ev.event === "stroke");
      expect(JSON.parse(e.data).id).toBe(id);
    } finally {
      stream.close();
    }
  }
});

it("a claim shows on every stream as taken, without saying whose it is", async () => {
  const stream = await openStream("?after=999999999");
  try {
    await stream.next((e) => e.event === "claims");
    const token = newToken();
    const { col } = await claim("vocal", token);
    const e = await stream.next(
      (ev) => ev.event === "claims" && JSON.parse(ev.data).some((c: { col: number }) => c.col === col),
    );
    expect(JSON.parse(e.data)).toContainEqual({ layer: "bottom", col });
    expect(e.data).not.toContain(token);
  } finally {
    stream.close();
  }
});

it("two people drawing in the same layer at once both keep their marks, in different columns", async () => {
  const a = newToken();
  const b = newToken();
  // Both see the same open column and press down at the same moment.
  const [ga, gb] = await Promise.all([claim("piano", a), claim("strings", b)]);
  expect(ga.col).not.toBe(gb.col);

  const [ra, rb] = await Promise.all([
    post({ d: dot("top", ga.col), width: 6, instrument: "piano", token: a }),
    post({ d: dot("top", gb.col), width: 6, instrument: "strings", token: b }),
  ]);
  expect(ra.status).toBe(201);
  expect(rb.status).toBe(201);
});

it("layers are independent: a claim in the top grid doesn't move the bottom grid's open column", async () => {
  const before = await claim("electro", newToken());
  await claim("synth", newToken());
  const after = await claim("electro", newToken());
  expect(after.col).toBe(before.col + 1);
});

it("a save into a column someone else holds is refused; the holder's own save lands", async () => {
  const holder = newToken();
  const { col } = await claim("bass", holder);
  const d = dot("top", col);

  expect((await post({ d, width: 6, instrument: "bass" })).status).toBe(409);
  expect((await post({ d, width: 6, instrument: "bass", token: newToken() })).status).toBe(409);
  expect((await post({ d, width: 6, instrument: "bass", token: holder })).status).toBe(201);

  // And once it's saved, the column is a mark's for good: nobody saves there.
  expect((await post({ d, width: 6, instrument: "bass", token: holder })).status).toBe(409);
});

it("a column whose claim has expired is free again, even to a save with no claim", async () => {
  const { col, ttlMs } = await claim("drums", newToken());
  const d = dot("bottom", col);
  expect((await post({ d, width: 6, instrument: "drums" })).status).toBe(409);

  await new Promise((resolve) => setTimeout(resolve, ttlMs + 500));
  expect((await post({ d, width: 6, instrument: "drums" })).status).toBe(201);
}, 60_000);

it("a save can't stretch the grid by landing far past its end", async () => {
  const { col } = await claim("synth", newToken());
  expect((await post({ d: dot("top", col + 50), width: 6, instrument: "synth", token: newToken() })).status).toBe(409);
});
