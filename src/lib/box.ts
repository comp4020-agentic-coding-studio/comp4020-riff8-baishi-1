// The client's picture of the shared grid: which columns hold marks, which
// are claimed by someone else drawing right now, and where each layer's open
// column therefore sits. The live stream (/api/stream) keeps it current;
// draw.ts and playback.ts read it.
import {
  COL,
  INSTRUMENTS,
  type Instrument,
  isInstrument,
  type Layer,
  LAYERS,
  openColumn,
  SOFT_SPREAD,
  totalWidth,
} from "./layout";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface Mark {
  id: number;
  d: string;
  width: number;
  instrument: Instrument;
  col: number;
}

export interface Box {
  svg: SVGSVGElement;
  status: HTMLElement;
  token: string;
  marks: Map<number, Mark>;
  // The claim this tab holds, if it's drawing.
  mine: { layer: Layer; col: number } | null;
  open(layer: Layer): number;
  zoneCol(layer: Layer): number;
  lastFilled(): number;
  addMark(mark: Mark, animate: boolean): void;
  layout(): void;
  onLayout: Set<() => void>;
}

function token(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function initBox(root: Document): Box | null {
  const svg = root.querySelector<SVGSVGElement>("#grid");
  const status = root.querySelector<HTMLElement>("#status");
  const claimsGroup = root.querySelector<SVGGElement>("#claims");
  if (!svg || !status || !claimsGroup) return null;

  const marks = new Map<number, Mark>();
  for (const g of svg.querySelectorAll<SVGGElement>("g.mark")) {
    const ink = g.querySelector<SVGPathElement>("path.ink");
    const instrument = g.dataset.instrument;
    if (!ink || !isInstrument(instrument)) continue;
    marks.set(Number(g.dataset.id), {
      id: Number(g.dataset.id),
      d: ink.getAttribute("d") ?? "",
      width: Number(ink.getAttribute("stroke-width")),
      instrument,
      col: Number(g.dataset.col),
    });
  }

  let claims: { layer: Layer; col: number }[] = [...claimsGroup.querySelectorAll<SVGGElement>("g.claim")].map(
    (g) => ({ layer: g.dataset.layer as Layer, col: Number(g.dataset.col) }),
  );
  let lastId = Number(svg.dataset.lastId) || 0;

  const occupied = (layer: Layer): number[] =>
    [...marks.values()].filter((m) => INSTRUMENTS[m.instrument].layer === layer).map((m) => m.col);
  const others = (layer: Layer): number[] =>
    claims
      .filter((c) => c.layer === layer && !(box.mine?.layer === layer && box.mine.col === c.col))
      .map((c) => c.col);

  const box: Box = {
    svg,
    status,
    token: token(),
    marks,
    mine: null,
    onLayout: new Set(),
    open: (layer) => openColumn(occupied(layer), others(layer)),
    zoneCol: (layer) => (box.mine?.layer === layer ? box.mine.col : box.open(layer)),
    lastFilled: () => Math.max(-1, ...[...marks.values()].map((m) => m.col)),

    addMark(mark, animate) {
      if (marks.has(mark.id)) return;
      marks.set(mark.id, mark);
      const layer = INSTRUMENTS[mark.instrument].layer;
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", `mark i-${mark.instrument}${animate ? " landing" : ""}`);
      g.dataset.id = String(mark.id);
      g.dataset.instrument = mark.instrument;
      g.dataset.col = String(mark.col);
      for (const [cls, w] of [
        ["ink-soft", mark.width * SOFT_SPREAD],
        ["ink", mark.width],
      ] as const) {
        const p = document.createElementNS(SVG_NS, "path");
        p.setAttribute("d", mark.d);
        p.setAttribute("class", cls);
        p.setAttribute("stroke-width", String(w));
        g.append(p);
      }
      svg.querySelector(`#marks-${layer}`)?.append(g);
      box.layout();
    },

    layout() {
      for (const layer of ["top", "bottom"] as const) {
        const col = box.zoneCol(layer);
        const zone = svg.querySelector<SVGGElement>(`.zone-${layer}`);
        if (!zone) continue;
        zone.querySelector(".zone-outline")?.setAttribute("x", String(col * COL + 4));
        zone.querySelector(".zone-prompt")?.setAttribute("x", String(col * COL + COL / 2));
        zone.querySelector(".zone-hit")?.setAttribute("x", String(col * COL));
        zone.classList.toggle("drawing", box.mine?.layer === layer);
      }

      claimsGroup.replaceChildren(
        ...claims
          .filter((c) => !(box.mine?.layer === c.layer && box.mine.col === c.col))
          .map((c) => {
            const { y, height } = LAYERS[c.layer];
            const g = document.createElementNS(SVG_NS, "g");
            g.setAttribute("class", "claim");
            const rect = document.createElementNS(SVG_NS, "rect");
            rect.setAttribute("x", String(c.col * COL + 3));
            rect.setAttribute("y", String(y + 3));
            rect.setAttribute("width", String(COL - 6));
            rect.setAttribute("height", String(height - 6));
            const text = document.createElementNS(SVG_NS, "text");
            text.setAttribute("x", String(c.col * COL + COL / 2));
            text.setAttribute("y", String(y + height / 2));
            for (const [line, dy] of [
              ["someone is", "-0.6em"],
              ["drawing here", "1.2em"],
            ]) {
              const tspan = document.createElementNS(SVG_NS, "tspan");
              tspan.setAttribute("x", String(c.col * COL + COL / 2));
              tspan.setAttribute("dy", dy);
              tspan.textContent = line;
              text.append(tspan);
            }
            g.append(rect, text);
            return g;
          }),
      );

      const columns = Math.max(
        box.zoneCol("top") + 1,
        box.zoneCol("bottom") + 1,
        box.lastFilled() + 1,
        ...claims.map((c) => c.col + 1),
      );
      const width = totalWidth(columns);
      if (Number(svg.getAttribute("width")) !== width) {
        svg.setAttribute("width", String(width));
        svg.setAttribute("viewBox", `0 0 ${width} ${svg.viewBox.baseVal.height}`);
        for (const r of svg.querySelectorAll(".js-width")) r.setAttribute("width", String(width));
      }
      for (const fn of box.onLayout) fn();
    },
  };

  const announce = (n: number): void => {
    status.textContent = `${n} mark${n === 1 ? "" : "s"} in the grid so far.`;
  };

  // Live: every mark anyone saves, and every claim, within about a second.
  // EventSource reconnects by itself and sends the last id it saw, so the
  // server replays whatever was saved while this tab was away.
  const stream = new EventSource(`/api/stream?after=${lastId}`);
  stream.addEventListener("stroke", (e) => {
    const s = JSON.parse((e as MessageEvent).data);
    lastId = Math.max(lastId, s.id);
    if (!isInstrument(s.instrument) || typeof s.col !== "number" || marks.has(s.id)) return;
    box.addMark({ id: s.id, d: s.d, width: s.width, instrument: s.instrument, col: s.col }, true);
    if (!box.mine) announce(marks.size);
  });
  stream.addEventListener("claims", (e) => {
    claims = JSON.parse((e as MessageEvent).data);
    box.layout();
  });

  box.layout();
  showOpenColumns(svg, "instant");
  return box;
}

// Scrolls the sheet so both layers' open columns are in view (the leftmost
// of the two, if they can't both fit), the way the old scroll opened at its
// blank strip.
export function showOpenColumns(svg: SVGSVGElement, behavior: ScrollBehavior): void {
  const wrap = svg.parentElement;
  if (!wrap) return;
  const xs = ["top", "bottom"].map((layer) =>
    Number(svg.querySelector(`.zone-${layer} .zone-hit`)?.getAttribute("x") ?? 0),
  );
  const scale = svg.getBoundingClientRect().width / Number(svg.getAttribute("width"));
  const left = Math.min(...xs) * scale;
  const right = (Math.max(...xs) + COL) * scale;
  const target = right - left <= wrap.clientWidth ? right - wrap.clientWidth + COL * scale : left - COL * scale;
  wrap.scrollTo({ left: Math.max(0, target), behavior });
}
