// Room-first plans. Rooms are drawn with clear (inside) dimensions and every wall is generated around
// them: rooms a little apart share a partition as wide as the gap, rooms that touch are open to each
// other and every other face gets an exterior wall. Openings are kept on a room face, so after any edit
// they are placed again on whatever wall is generated there.
import clipping from "polygon-clipping";
import {
  Project,
  Room,
  Rect,
  Point,
  Wall,
  Door,
  Attachment,
  LayoutSettings,
  WindowSpec,
  topology,
  validateGeometry,
  validatePolygon,
  verifyTopology,
  bounds,
  clone,
  pointIn,
  windowSpec,
} from "./project";

export const DEFAULT_LAYOUT: LayoutSettings = { exterior: 220, partition: 110 };
/** Smallest room side, wall and opening the editor creates (mm). */
export const MIN_ROOM = 500;
export const MIN_WALL = 50;
export const MIN_OPENING = 300;
/**
 * Two facing rooms share one partition when the gap between them is under this limit (two exterior
 * thicknesses). From there on each room gets its own exterior wall, so partitions stay thinner than that.
 */
export const partitionLimit = (exterior: number) => 2 * exterior;
/** Partition width for a new wall; settings saved before the limit existed are refused, not split. */
export function newPartition(settings: LayoutSettings) {
  if (settings.partition >= partitionLimit(settings.exterior))
    throw Error(
      `Vách mới (${settings.partition} mm) phải mỏng hơn 2 lần tường ngoài (${settings.exterior} mm). Hãy chỉnh lại ở mục Bố cục mặt bằng.`,
    );
  return settings.partition;
}
export const OPENING_WIDTH = {
  door: 800,
  entry: 900,
  window: 1200,
  slide: 1800,
} as const;
export const WINDOW_HEIGHTS: WindowSpec = { sill: 900, head: 2400 };
/** Outward direction of a room face: n = up (−y), s = down (+y), w = left (−x), e = right (+x). */
export type Side = "n" | "s" | "w" | "e";
export type OpeningKind = "door" | "window" | "slide";
export type LayoutOpening = {
  kind: OpeningKind;
  /** Doors and sliding doors keep their ID; windows are numbered by position ("window-<n>"). */
  id: string;
  /** Host room face: `line` is its coordinate. */
  room: string;
  side: Side;
  line: number;
  /** Opposite face of the wall the opening sits in (read from the current plan). */
  far?: number;
  /** Absolute start along the wall and width (mm). */
  start: number;
  width: number;
  anchor: Attachment["anchor"];
  name?: string;
  /** Doors: hinge at the low-coordinate end; leaf swings into the host room. */
  hingeAtStart?: boolean;
  swingIn?: boolean;
  entry?: boolean;
  sill?: number;
  head?: number;
};
export type RoomEdge = {
  room: string;
  index: number;
  side: Side;
  line: number;
  s0: number;
  s1: number;
};
export type LayoutResult = {
  project: Project;
  /** Openings that no longer sit on a wall after the edit and were removed. */
  dropped: LayoutOpening[];
  /** Walls removed with the wall tool that had to be put back because their wall changed. */
  restored?: number;
  /** ID of the room or opening the operation created. */
  id?: string;
};

export const sideAxis = (s: Side): 0 | 1 => (s === "n" || s === "s" ? 1 : 0);
export const sideDir = (s: Side) => (s === "s" || s === "e" ? 1 : -1);
const sideOf = (axis: 0 | 1, dir: number): Side =>
  axis === 1 ? (dir > 0 ? "s" : "n") : dir > 0 ? "e" : "w";
export const rectPoly = ([x0, y0, x1, y1]: Rect): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
export const isRectRoom = (r: Room) => r.poly.length === 4;
const round10 = (v: number) => Math.round(v / 10) * 10;
/** Ordered rectangle in whole millimetres (the JSON schema stores layout settings as integers). */
const normRect = (r: Rect): Rect =>
  [
    Math.min(r[0], r[2]),
    Math.min(r[1], r[3]),
    Math.max(r[0], r[2]),
    Math.max(r[1], r[3]),
  ].map(Math.round) as Rect;

/** Faces of a room polygon with their outward direction. */
export function roomEdges(r: Room): RoomEdge[] {
  return r.poly.map((a, index) => {
    const b = r.poly[(index + 1) % r.poly.length],
      axis: 0 | 1 = a[0] === b[0] ? 0 : 1,
      along = 1 - axis,
      s0 = Math.min(a[along], b[along]),
      s1 = Math.max(a[along], b[along]),
      probe: Point = [0, 0];
    probe[axis] = a[axis] + 1;
    probe[along] = (s0 + s1) / 2;
    return {
      room: r.id,
      index,
      side: sideOf(axis, pointIn(r.poly, probe) ? -1 : 1),
      line: a[axis],
      s0,
      s1,
    };
  });
}
/** Horizontal slabs of an orthogonal polygon. */
export function slabs(poly: Point[]): Rect[] {
  const ys = [...new Set(poly.map((v) => v[1]))].sort((a, b) => a - b),
    out: Rect[] = [];
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k],
      y1 = ys[k + 1],
      ym = (y0 + y1) / 2,
      xs: number[] = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      if (a[0] === b[0] && Math.min(a[1], b[1]) < ym && ym < Math.max(a[1], b[1]))
        xs.push(a[0]);
    });
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) out.push([xs[j], y0, xs[j + 1], y1]);
  }
  return out;
}
/** Drop repeated and collinear vertices, orient like the source data and start at the top-left corner. */
function simplify(poly: Point[]): Point[] {
  let pts = poly.map((v) => [v[0], v[1]] as Point);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length],
        b = pts[i],
        c = pts[(i + 1) % pts.length];
      if (
        (a[0] === b[0] && a[1] === b[1]) ||
        (a[0] === b[0] && b[0] === c[0]) ||
        (a[1] === b[1] && b[1] === c[1])
      ) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  const signed = pts.reduce((s, v, i) => {
    const q = pts[(i + 1) % pts.length];
    return s + v[0] * q[1] - q[0] * v[1];
  }, 0);
  if (signed < 0) pts.reverse();
  const first = pts.reduce(
    (best, v, i) =>
      v[1] < pts[best][1] || (v[1] === pts[best][1] && v[0] < pts[best][0])
        ? i
        : best,
    0,
  );
  return [...pts.slice(first), ...pts.slice(0, first)];
}
function single(result: number[][][][], what: string): Point[] {
  if (result.length !== 1 || result[0].length !== 1) throw Error(what);
  return simplify(result[0][0].slice(0, -1) as Point[]);
}
const unionPoly = (polys: Point[][], what: string) =>
  single(
    clipping.union(
      [polys[0]] as any,
      ...polys.slice(1).map((p) => [p] as any),
    ) as number[][][][],
    what,
  );
const diffPoly = (a: Point[], cut: Point[][], what: string) =>
  single(
    clipping.difference([a] as any, ...cut.map((p) => [p] as any)) as number[][][][],
    what,
  );
/** Point to put the room label and lamp on: the middle of the room, or of its largest part. */
function labelPoint(poly: Point[]): Point {
  const b = bounds(poly),
    c: Point = [round10((b[0] + b[2]) / 2), round10((b[1] + b[3]) / 2)];
  if (pointIn(poly, c)) return c;
  const s = slabs(poly).sort(
    (p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]),
  )[0];
  return [round10((s[0] + s[2]) / 2), round10((s[1] + s[3]) / 2)];
}

type Band = {
  axis: 0 | 1;
  c0: number;
  c1: number;
  kind: "e" | "n";
  /** Longest room face that claimed this wall: where walls overlap, the longer one runs through. */
  len?: number;
};
type Piece = {
  axis: 0 | 1;
  c0: number;
  c1: number;
  s0: number;
  s1: number;
  kind: "e" | "n";
  /** Stretches that close a corner or junction: openings may not cut them. */
  junctions: [number, number][];
};

/**
 * Generate the walls around the rooms. The plan is cut into a grid on every room coordinate (± the
 * exterior thickness). Cells within that thickness of a room are wall. Walking out from each room face,
 * a wall that ends at another room is a partition as wide as the gap; one that ends in the open after
 * exactly the exterior thickness is an exterior wall. Remaining wall cells close corners and junctions:
 * each continues a neighbouring wall in line (preferring one that continues on both sides, then exterior
 * walls, then horizontal walls).
 */
function generateWalls(
  rooms: Room[],
  t: number,
  label: (id: string) => string,
): Piece[] {
  const xsSet = new Set<number>(),
    ysSet = new Set<number>();
  for (const r of rooms)
    for (const [x, y] of r.poly) {
      xsSet.add(x - t).add(x).add(x + t);
      ysSet.add(y - t).add(y).add(y + t);
    }
  const xs = [...xsSet].sort((a, b) => a - b),
    ys = [...ysSet].sort((a, b) => a - b),
    ix = new Map(xs.map((x, i) => [x, i])),
    iy = new Map(ys.map((y, i) => [y, i])),
    nx = xs.length - 1,
    ny = ys.length - 1,
    n = nx * ny,
    kind = new Uint8Array(n), // 0 open air, 1 room, 2 wall
    band: (Band | null)[] = new Array(n).fill(null),
    edge = new Uint8Array(n),
    at = (i: number, j: number) => j * nx + i;
  const roomSlabs = rooms.map((r) => slabs(r.poly));
  roomSlabs.forEach((ss) =>
    ss.forEach(([x0, y0, x1, y1]) => {
      for (let j = iy.get(y0)!; j < iy.get(y1)!; j++)
        for (let i = ix.get(x0)!; i < ix.get(x1)!; i++) kind[at(i, j)] = 1;
    }),
  );
  roomSlabs.forEach((ss) =>
    ss.forEach(([x0, y0, x1, y1]) => {
      for (let j = iy.get(y0 - t)!; j < iy.get(y1 + t)!; j++)
        for (let i = ix.get(x0 - t)!; i < ix.get(x1 + t)!; i++)
          if (!kind[at(i, j)]) kind[at(i, j)] = 2;
    }),
  );
  const bands = new Map<string, Band>(),
    bandOf = (axis: 0 | 1, c0: number, c1: number, k: "e" | "n") => {
      const key = `${axis}:${c0}:${c1}:${k}`;
      if (!bands.has(key)) bands.set(key, { axis, c0, c1, kind: k });
      return bands.get(key)!;
    };
  // Each face claims the strip in front of it: up to the facing room when one is within two exterior
  // thicknesses (a partition as wide as the gap), otherwise one exterior thickness.
  const claims = new Map<number, Band[]>(),
    claim = (c: number, b: Band) => {
      const list = claims.get(c);
      if (!list) claims.set(c, [b]);
      else if (!list.includes(b)) list.push(b);
    };
  for (const r of rooms)
    for (const e of roomEdges(r)) {
      const axis = sideAxis(e.side),
        dir = sideDir(e.side),
        cross = axis === 0 ? xs : ys,
        crossN = axis === 0 ? nx : ny,
        alongIdx = axis === 0 ? iy : ix,
        lineIdx = (axis === 0 ? ix : iy).get(e.line)!;
      for (let a = alongIdx.get(e.s0)!; a < alongIdx.get(e.s1)!; a++) {
        const strip: [number, number][] = [];
        let gap: number | null = null;
        for (let q = dir > 0 ? lineIdx : lineIdx - 1; q >= 0 && q < crossN; q += dir) {
          const c = axis === 0 ? at(q, a) : at(a, q),
            near = dir > 0 ? cross[q] - e.line : e.line - cross[q + 1];
          if (near >= 2 * t) break;
          if (kind[c] === 1) {
            gap = near;
            break;
          }
          strip.push([c, near]);
        }
        if (gap === 0) continue; // touching another room: open to it
        if (gap !== null && gap < MIN_WALL)
          throw Error(
            `${label(r.id)} cách phòng bên cạnh ${gap} mm. Hãy đặt sát nhau (0 mm) hoặc cách ít nhất ${MIN_WALL} mm để có vách.`,
          );
        const depth = gap ?? t,
          reach = e.line + dir * depth,
          b = bandOf(
            axis,
            Math.min(e.line, reach),
            Math.max(e.line, reach),
            gap === null ? "e" : "n",
          );
        b.len = Math.max(b.len ?? 0, e.s1 - e.s0);
        for (const [c, near] of strip) if (near < depth) claim(c, b);
      }
    }
  // Where strips overlap (inner corners, junctions of offset rooms) a partition wins over an exterior
  // wall, then the wall of the longer face runs through, then the horizontal one; the loser gives up its
  // whole cross-section there.
  const beats = (a: Band, b: Band) =>
    a.kind !== b.kind
      ? a.kind === "n"
      : (a.len ?? 0) !== (b.len ?? 0)
        ? (a.len ?? 0) > (b.len ?? 0)
        : a.axis > b.axis;
  for (const [c, list] of claims) {
    if (list.length < 2) continue;
    const winner = list.reduce((w, b) => (beats(b, w) ? b : w));
    for (const b of [...list]) {
      if (b === winner) continue;
      const i = c % nx,
        j = Math.floor(c / nx);
      const cells: number[] = [];
      if (b.axis === 1)
        for (let k = iy.get(b.c0)!; k < iy.get(b.c1)!; k++) cells.push(at(i, k));
      else for (let k = ix.get(b.c0)!; k < ix.get(b.c1)!; k++) cells.push(at(k, j));
      for (const x of cells) {
        const l = claims.get(x),
          k = l ? l.indexOf(b) : -1;
        if (k >= 0) l!.splice(k, 1);
      }
    }
  }
  for (const [c, list] of claims)
    if (list.length === 1) {
      band[c] = list[0];
      edge[c] = 1;
    }
  const slice = (i: number, j: number, b: Band) => {
    const out: number[] = [];
    if (b.axis === 1)
      for (let k = iy.get(b.c0)!; k < iy.get(b.c1)!; k++) out.push(at(i, k));
    else for (let k = ix.get(b.c0)!; k < ix.get(b.c1)!; k++) out.push(at(k, j));
    return out.every((c) => kind[c] === 2 && (!band[c] || band[c] === b))
      ? out
      : null;
  };
  for (const minScore of [4, 0])
    for (let changed = true; changed; ) {
      changed = false;
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const c = at(i, j);
          if (kind[c] !== 2 || band[c]) continue;
          let best: { b: Band; cells: number[]; score: number } | null = null;
          for (const [di, dj] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]) {
            const ni = i + di,
              nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
            // Left/right neighbours continue horizontal walls (thickness along y), above/below vertical ones.
            const b = band[at(ni, nj)],
              axis = di ? 1 : 0;
            if (!b || b.axis !== axis) continue;
            const lo = axis === 1 ? ys[j] : xs[i],
              hi = axis === 1 ? ys[j + 1] : xs[i + 1];
            if (lo < b.c0 || hi > b.c1) continue;
            const cells = slice(i, j, b);
            if (!cells) continue;
            const oi = i - di,
              oj = j - dj,
              other =
                oi >= 0 && oj >= 0 && oi < nx && oj < ny ? band[at(oi, oj)] : null,
              score = (other === b ? 4 : 0) + (b.kind === "e" ? 2 : 0) + axis;
            if (score >= minScore && (!best || score > best.score))
              best = { b, cells, score };
          }
          if (best) {
            for (const cell of best.cells) band[cell] = best.b;
            changed = true;
          }
        }
    }
  // Leftover wall cells: a stub that touches no room only filled the outside of an offset corner and is
  // left out; one next to a room (a sliver between almost-aligned rooms) becomes its own small piece.
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = at(i, j);
      if (kind[c] !== 2 || band[c]) continue;
      const room = [
        [i - 1, j, 0],
        [i + 1, j, 0],
        [i, j - 1, 1],
        [i, j + 1, 1],
      ].find(
        ([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && kind[at(a, b)] === 1,
      );
      if (!room) {
        kind[c] = 0;
        continue;
      }
      const axis = room[2] as 0 | 1;
      band[c] = bandOf(
        axis,
        axis === 0 ? xs[i] : ys[j],
        axis === 0 ? xs[i + 1] : ys[j + 1],
        "e",
      );
    }
  const pieces: Piece[] = [],
    seen = new Uint8Array(n),
    merge = (iv: [number, number][]) =>
      iv.reduce<[number, number][]>((out, v) => {
        const last = out[out.length - 1];
        if (last && last[1] === v[0]) last[1] = v[1];
        else out.push([v[0], v[1]]);
        return out;
      }, []);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = at(i, j),
        b = band[c];
      if (!b || seen[c]) continue;
      const junctions: [number, number][] = [];
      if (b.axis === 1) {
        if (ys[j] !== b.c0) continue;
        let k = i;
        for (; k < nx && band[at(k, j)] === b && !seen[at(k, j)]; k++) {
          seen[at(k, j)] = 1;
          if (!edge[at(k, j)]) junctions.push([xs[k], xs[k + 1]]);
        }
        pieces.push({ ...b, s0: xs[i], s1: xs[k], junctions: merge(junctions) });
      } else {
        if (xs[i] !== b.c0) continue;
        let k = j;
        for (; k < ny && band[at(i, k)] === b && !seen[at(i, k)]; k++) {
          seen[at(i, k)] = 1;
          if (!edge[at(i, k)]) junctions.push([ys[k], ys[k + 1]]);
        }
        pieces.push({ ...b, s0: ys[j], s1: ys[k], junctions: merge(junctions) });
      }
    }
  return pieces;
}
/** Cut an opening out of the wall next to its host face; null when it does not fit on one wall. */
function cutOpening(pieces: Piece[], o: LayoutOpening): Rect | null {
  const axis = sideAxis(o.side),
    dir = sideDir(o.side),
    s = o.start,
    e = o.start + o.width;
  if (!(o.width >= MIN_OPENING)) return null;
  const hits = pieces
    .filter(
      (p) =>
        p.axis === axis &&
        (dir > 0 ? p.c0 === o.line : p.c1 === o.line) &&
        p.s1 > s &&
        p.s0 < e,
    )
    .sort((p, q) => p.s0 - q.s0);
  if (!hits.length || hits.some((p) => p.c0 !== hits[0].c0 || p.c1 !== hits[0].c1))
    return null;
  let cursor = s;
  for (const p of hits) {
    if (p.s0 > cursor) return null;
    if (p.junctions.some(([a, b]) => a < e && b > s)) return null;
    cursor = Math.max(cursor, p.s1);
  }
  if (cursor < e) return null;
  for (const p of hits) {
    const k = pieces.indexOf(p),
      parts: Piece[] = [];
    if (p.s0 < s) parts.push({ ...p, s1: s, junctions: p.junctions.filter(([a]) => a < s) });
    if (p.s1 > e) parts.push({ ...p, s0: e, junctions: p.junctions.filter(([, b]) => b > e) });
    pieces.splice(k, 1, ...parts);
  }
  const { c0, c1 } = hits[0];
  return axis === 1 ? [s, c0, e, c1] : [c0, s, c1, e];
}
function doorFrom(o: LayoutOpening, rect: Rect): Door {
  const axis = sideAxis(o.side),
    along = 1 - axis,
    dir = sideDir(o.side),
    swingIn = o.swingIn !== false,
    hingeAtStart = o.hingeAtStart !== false,
    h: Point = [0, 0],
    c: Point = [0, 0],
    open: Point = [0, 0];
  // The hinge sits on the face of the room the leaf swings into.
  h[axis] = swingIn === dir > 0 ? rect[axis] : rect[axis + 2];
  h[along] = hingeAtStart ? o.start : o.start + o.width;
  c[along] = hingeAtStart ? 1 : -1;
  open[axis] = swingIn ? -dir : dir;
  return {
    id: o.id,
    name: o.name ?? "Cửa",
    rect,
    h,
    c,
    o: open,
    len: o.width,
    ...(o.entry ? { entry: true } : {}),
    wallId: "",
    offset: 0,
    width: 0,
    anchor: o.anchor,
  };
}
/** Doors, windows and sliding doors of a plan, each on the face of a room. */
export function readOpenings(p: Project): LayoutOpening[] {
  const g = p.geometry,
    edges = g.rooms.flatMap(roomEdges),
    out: LayoutOpening[] = [];
  // A door belongs to the room it swings into (`prefer` side first). A window or sliding door in a
  // partition belongs to the room whose face it covers most, e.g. the balcony rather than the living room.
  const locate = (rect: Rect, wallId: string, prefer: number | null) => {
    const t = g.tracks.find((t) => t.id === wallId);
    if (!t) return null;
    const axis = t.axis,
      along = 1 - axis,
      s0 = rect[along],
      s1 = rect[along + 2];
    const found = [prefer ?? -1, -(prefer ?? -1)].flatMap((d) => {
      const face = d > 0 ? rect[axis + 2] : rect[axis],
        e = edges.find(
          (e) =>
            sideAxis(e.side) === axis &&
            e.line === face &&
            sideDir(e.side) === -d &&
            e.s0 <= s0 &&
            s1 <= e.s1,
        );
      return e
        ? [{ e, d, along, s0, s1, far: d > 0 ? rect[axis] : rect[axis + 2] }]
        : [];
    });
    if (prefer === null)
      found.sort((a, b) => a.e.s1 - a.e.s0 - (b.e.s1 - b.e.s0));
    return found[0] ?? null;
  };
  const host = (l: NonNullable<ReturnType<typeof locate>>) => ({
    room: l.e.room,
    side: l.e.side,
    line: l.e.line,
    far: l.far,
    start: l.s0,
    width: l.s1 - l.s0,
  });
  for (const d of g.doors) {
    const t = g.tracks.find((t) => t.id === d.wallId),
      prefer = t ? Math.sign(d.o[t.axis]) || 1 : 1,
      l = locate(d.rect, d.wallId, prefer);
    if (!l) continue;
    out.push({
      kind: "door",
      id: d.id,
      ...host(l),
      anchor: d.anchor,
      name: d.name,
      hingeAtStart: d.c[l.along] > 0,
      swingIn: l.d === prefer,
      entry: d.entry,
    });
  }
  g.windows.forEach((r, i) => {
    const a = g.windowAttachments[i],
      l = locate(r, a.wallId, null);
    if (!l) return;
    const spec = windowSpec(g, i);
    out.push({
      kind: "window",
      id: "window-" + i,
      ...host(l),
      anchor: a.anchor,
      sill: spec.sill,
      head: spec.head,
    });
  });
  for (const s of g.slides) {
    const l = locate(s.rect, s.wallId, null);
    if (l) out.push({ kind: "slide", id: s.id, ...host(l), anchor: s.anchor });
  }
  return out;
}
const rectsOverlap = (a: Rect, b: Rect) =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 &&
  Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;
const nextNumber = (ids: string[], prefix: string) =>
  ids.reduce((m, id) => {
    const k = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    return Number.isInteger(k) ? Math.max(m, k + 1) : m;
  }, 0);

/**
 * Regenerate a drawn plan from its rooms and openings. Furniture, measures and room names stay; walls
 * marked as removed are carried over by position. Throws a Vietnamese message when the rooms overlap or
 * the walls cannot be closed.
 */
export function buildLayout(
  base: Project,
  rooms: Room[],
  openings: LayoutOpening[],
  settings: LayoutSettings = base.geometry.layout ?? DEFAULT_LAYOUT,
): LayoutResult {
  if (!rooms.length) throw Error("Mặt bằng cần ít nhất một phòng.");
  const meta: Project["rooms"] = {},
    label = (id: string) => meta[id]?.name ?? id;
  const out: Room[] = rooms.map((r) => {
    const m = base.rooms[r.id] ?? { name: r.name, mat: r.mat },
      raw = r.poly.map(([x, y]) => [Math.round(x), Math.round(y)] as Point);
    meta[r.id] = { name: m.name, mat: m.mat };
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i],
        b = raw[(i + 1) % raw.length];
      if (a[0] !== b[0] && a[1] !== b[1])
        throw Error("Chỉ hỗ trợ phòng có cạnh vuông góc.");
    }
    const b = bounds(raw),
      tooSmall = Error(`${m.name} phải rộng và sâu ít nhất ${MIN_ROOM} mm.`);
    if (raw.length < 4 || b[2] - b[0] < MIN_ROOM || b[3] - b[1] < MIN_ROOM)
      throw tooSmall;
    const poly = simplify(raw);
    if (poly.length < 4) throw tooSmall;
    const room: Room = { id: r.id, name: m.name, mat: m.mat, poly };
    validatePolygon(room);
    return { ...room, at: labelPoint(poly) };
  });
  const parts = out.map((r) => slabs(r.poly));
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++)
      if (parts[i].some((a) => parts[j].some((b) => rectsOverlap(a, b))))
        throw Error(`${label(out[i].id)} chồng lên ${label(out[j].id)}.`);
  const pieces = generateWalls(out, settings.exterior, label),
    dropped: LayoutOpening[] = [],
    windows: Rect[] = [],
    windowSpecs: WindowSpec[] = [],
    windowAnchors: Attachment["anchor"][] = [],
    doors: Door[] = [],
    slides: Project["geometry"]["slides"] = [],
    axes = new Map<string, 0 | 1>(),
    key = (r: Rect) => r.join(",");
  let nextDoor = nextNumber(
      openings.filter((o) => o.kind === "door").map((o) => o.id),
      "door-",
    ),
    nextSlide = nextNumber(
      openings.filter((o) => o.kind === "slide").map((o) => o.id),
      "slide-",
    );
  const used = new Set<string>();
  for (const o of openings) {
    const rect = cutOpening(pieces, o);
    if (!rect) {
      dropped.push(o);
      continue;
    }
    axes.set(key(rect), sideAxis(o.side));
    if (o.kind === "window") {
      windows.push(rect);
      windowSpecs.push({
        sill: o.sill ?? WINDOW_HEIGHTS.sill,
        head: o.head ?? WINDOW_HEIGHTS.head,
      });
      windowAnchors.push(o.anchor);
      continue;
    }
    let id = o.id;
    if (!id || used.has(id) || !id.startsWith(o.kind + "-"))
      id = o.kind === "door" ? "door-" + nextDoor++ : "slide-" + nextSlide++;
    used.add(id);
    if (o.kind === "door") doors.push(doorFrom({ ...o, id }, rect));
    else
      slides.push({
        id,
        rect,
        v: sideAxis(o.side) === 0,
        wallId: "",
        offset: 0,
        width: 0,
        anchor: o.anchor,
      });
  }
  // Partitions removed with the wall tool stay removed: the generated partition in the same place is cut
  // at the old stretch. A stretch whose wall moved or became an exterior wall is put back and reported.
  const old = base.geometry,
    removedPieces = new Set<Piece>();
  let restored = 0;
  for (const id of base.demolished) {
    const i = Number(id.slice(1)),
      w = old.walls[i],
      axis = old.tracks.find((t) => t.id === old.wallTracks[i])?.axis;
    if (!w || axis === undefined || w[2] <= w[0] || w[3] <= w[1]) continue;
    const along = 1 - axis,
      c0 = Number(w[axis]),
      c1 = Number(w[axis + 2]),
      s0 = Number(w[along]),
      s1 = Number(w[along + 2]);
    let kept = 0;
    for (const p of [...pieces]) {
      if (p.axis !== axis || p.c0 !== c0 || p.c1 !== c1 || p.kind !== "n" || p.s1 <= s0 || p.s0 >= s1)
        continue;
      const a = Math.max(p.s0, s0),
        b = Math.min(p.s1, s1),
        mid: Piece = { ...p, s0: a, s1: b, junctions: p.junctions.filter(([x, y]) => y > a && x < b) },
        parts: Piece[] = [];
      if (p.s0 < a) parts.push({ ...p, s1: a, junctions: p.junctions.filter(([x]) => x < a) });
      parts.push(mid);
      if (b < p.s1) parts.push({ ...p, s0: b, junctions: p.junctions.filter(([, y]) => y > b) });
      pieces.splice(pieces.indexOf(p), 1, ...parts);
      removedPieces.add(mid);
      kept += b - a;
    }
    // Openings now cut into the stretch are fine; any other part that is wall again counts as put back.
    const openingsInside = [...windows, ...doors.map((d) => d.rect), ...slides.map((x) => x.rect)]
      .filter((r) => r[axis] === c0 && r[axis + 2] === c1)
      .reduce((sum, r) => sum + Math.max(0, Math.min(r[along + 2], s1) - Math.max(r[along], s0)), 0);
    if (kept + openingsInside < s1 - s0 - 1) restored++;
  }
  const walls: Wall[] = pieces.map((p) => {
    const rect: Rect =
      p.axis === 1 ? [p.s0, p.c0, p.s1, p.c1] : [p.c0, p.s0, p.c1, p.s1];
    axes.set(key(rect), p.axis);
    return [...rect, p.kind] as Wall;
  }),
    demolished = pieces.flatMap((p, i) => (removedPieces.has(p) ? ["w" + i] : []));
  const g: Project["geometry"] = {
    rooms: out,
    walls,
    windows,
    doors,
    slides,
    bayOpenings: [],
    tracks: [],
    wallTracks: [],
    windowAttachments: [],
    bayAttachments: [],
    layout: { exterior: settings.exterior, partition: settings.partition },
    windowSpecs,
  };
  if (base.geometry.ceiling !== undefined) g.ceiling = base.geometry.ceiling;
  topology(g, (r) => axes.get(key(r)));
  // topology() starts every opening as "fixed"; keep the anchors chosen before.
  g.windowAttachments.forEach((a, i) => (a.anchor = windowAnchors[i]));
  const anchorOf = new Map(openings.map((o) => [o.id, o.anchor]));
  for (const d of [...g.doors, ...g.slides]) d.anchor = anchorOf.get(d.id) ?? "fixed";
  // Furniture keeps its position; a placement on a removed room or wall run is dropped or re-linked.
  const furniture = base.furniture.map((f) => {
    if (!f.placement) return clone(f);
    if (!meta[f.placement.roomId]) {
      const { placement, ...rest } = clone(f);
      return rest;
    }
    const before = old.tracks.find((t) => t.id === f.placement!.wallId);
    const after =
      before &&
      g.tracks.find(
        (t) =>
          t.axis === before.axis &&
          t.cross[0] < before.cross[1] &&
          t.cross[1] > before.cross[0] &&
          t.start < before.end &&
          t.end > before.start,
      );
    return {
      ...clone(f),
      placement: {
        roomId: f.placement.roomId,
        ...(after ? { wallId: after.id } : {}),
      },
    };
  });
  const project: Project = {
    schemaVersion: 2,
    units: "mm",
    ...(base.name ? { name: base.name } : {}),
    geometry: g,
    rooms: meta,
    furniture,
    demolished,
    measures: clone(base.measures),
  };
  validateGeometry(project);
  verifyTopology(g);
  return { project, dropped, ...(restored ? { restored } : {}) };
}

const blankGeometry = (): Project["geometry"] => ({
  rooms: [],
  walls: [],
  windows: [],
  doors: [],
  slides: [],
  bayOpenings: [],
  tracks: [],
  wallTracks: [],
  windowAttachments: [],
  bayAttachments: [],
});
export type LayoutSpec = {
  name: string;
  settings?: LayoutSettings;
  ceiling?: number;
  rooms: { id: string; name: string; mat: string; rect?: Rect; poly?: Point[] }[];
  /** Openings on a room face: `offset` from the face's start (left/top end). */
  openings?: {
    kind: OpeningKind;
    room: string;
    side: Side;
    offset: number;
    width?: number;
    name?: string;
    hingeAtStart?: boolean;
    swingIn?: boolean;
    entry?: boolean;
    sill?: number;
    head?: number;
  }[];
};
/** A new drawn plan (no furniture) from rooms and openings given per room face. */
export function newLayoutProject(spec: LayoutSpec): Project {
  const rooms: Room[] = spec.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      mat: r.mat,
      poly: r.poly ?? rectPoly(r.rect!),
    })),
    edges = rooms.flatMap(roomEdges);
  let doors = 0,
    slides = 0,
    windows = 0;
  const openings: LayoutOpening[] = (spec.openings ?? []).map((o) => {
    const e = edges.find((e) => e.room === o.room && e.side === o.side);
    if (!e) throw Error(`Không có cạnh ${o.side} của phòng ${o.room}.`);
    const width =
      o.width ?? (o.entry ? OPENING_WIDTH.entry : OPENING_WIDTH[o.kind]);
    return {
      kind: o.kind,
      id:
        o.kind === "door"
          ? "door-" + doors++
          : o.kind === "slide"
            ? "slide-" + slides++
            : "window-" + windows++,
      room: o.room,
      side: o.side,
      line: e.line,
      start: e.s0 + o.offset,
      width,
      anchor: "fixed",
      name: o.name,
      hingeAtStart: o.hingeAtStart,
      swingIn: o.swingIn,
      entry: o.entry,
      sill: o.sill,
      head: o.head,
    };
  });
  const base: Project = {
    schemaVersion: 2,
    units: "mm",
    name: spec.name,
    geometry: {
      ...blankGeometry(),
      ...(spec.ceiling ? { ceiling: spec.ceiling } : {}),
    },
    rooms: Object.fromEntries(
      spec.rooms.map((r) => [r.id, { name: r.name, mat: r.mat }]),
    ),
    furniture: [],
    demolished: [],
    measures: [],
  };
  const res = buildLayout(base, rooms, openings, spec.settings ?? DEFAULT_LAYOUT);
  if (res.dropped.length)
    throw Error(
      `Không đặt được ${res.dropped.map((o) => o.id).join(", ")} lên tường.`,
    );
  return res.project;
}

type LayoutState = {
  rooms: Room[];
  openings: LayoutOpening[];
  /** Openings of the plan that sit on no room face (e.g. after edge drags in normal mode). */
  lost: LayoutOpening[];
};
function state(p: Project): LayoutState {
  if (!p.geometry.layout)
    throw Error(
      "Căn hộ gốc không chỉnh được bố cục. Hãy tạo mặt bằng mới từ Mẫu để vẽ phòng.",
    );
  const g = p.geometry,
    openings = readOpenings(p),
    found = new Set(openings.map((o) => o.id)),
    stub = (kind: OpeningKind, id: string, r: Rect): LayoutOpening => ({
      kind,
      id,
      room: "",
      side: "n",
      line: r[1],
      start: r[0],
      width: r[2] - r[0],
      anchor: "fixed",
    });
  const lost = [
    ...g.doors.filter((d) => !found.has(d.id)).map((d) => stub("door", d.id, d.rect)),
    ...g.windows.flatMap((r, i) =>
      found.has("window-" + i) ? [] : [stub("window", "window-" + i, r)],
    ),
    ...g.slides.filter((x) => !found.has(x.id)).map((x) => stub("slide", x.id, x.rect)),
  ];
  return { rooms: clone(g.rooms), openings, lost };
}
/** Regenerate; besides what the edit removed, report the openings that sat on no room face. */
function rebuild(
  s: LayoutState,
  base: Project,
  rooms: Room[],
  openings: LayoutOpening[],
  settings?: LayoutSettings,
  removed: LayoutOpening[] = [],
): LayoutResult {
  const res = buildLayout(base, rooms, openings, settings);
  return { ...res, dropped: [...s.lost, ...removed, ...res.dropped] };
}
/** Default heights of a new window, kept under the ceiling. */
const windowHeights = (p: Project): WindowSpec => {
  const head = Math.min(WINDOW_HEIGHTS.head, p.geometry.ceiling ?? 2800);
  return { head, sill: Math.max(0, Math.min(WINDOW_HEIGHTS.sill, head - 100)) };
};
const findRoom = (rooms: Room[], id: string) => {
  const r = rooms.find((r) => r.id === id);
  if (!r) throw Error("Không tìm thấy phòng.");
  return r;
};
const labelOf = (p: Project, id: string) => p.rooms[id]?.name ?? id;
/** Rectangle of an opening in the current plan, by layout ID. */
function openingRect(p: Project, id: string): Rect | undefined {
  const g = p.geometry;
  if (id.startsWith("window-")) return g.windows[Number(id.slice(7))];
  return [...g.doors, ...g.slides].find((o) => o.id === id)?.rect;
}

/** Add a rectangular room (clear dimensions). */
export function addRoom(
  p: Project,
  rect: Rect,
  meta: { name?: string; mat?: string } = {},
): LayoutResult {
  const s = state(p),
    n = Math.max(
      nextNumber(Object.keys(p.rooms), "r"),
      s.rooms.length + 1,
    ),
    id = "r" + n,
    name = meta.name?.trim() || `Phòng ${n}`,
    mat = meta.mat ?? "wood";
  const res = rebuild(
    s,
    { ...p, rooms: { ...p.rooms, [id]: { name, mat } } },
    [...s.rooms, { id, name, mat, poly: rectPoly(normRect(rect)) }],
    s.openings,
  );
  return { ...res, id };
}
/**
 * Move or resize a rectangular room. Only this room changes; its doors and windows follow the face they
 * sit on, keep their place along it and are pulled back inside a face that became shorter.
 */
export function setRoomRect(p: Project, id: string, rect: Rect): LayoutResult {
  const s = state(p),
    r = findRoom(s.rooms, id);
  if (!isRectRoom(r))
    throw Error("Phòng không chữ nhật: hãy dịch cả phòng hoặc chỉnh từng cạnh ở chế độ thường.");
  const old = bounds(r.poly),
    next = normRect(rect);
  r.poly = rectPoly(next);
  return rebuild(s, p, s.rooms, followRoom(s.openings, id, old, next));
}
/** Translate any room with its doors and windows. */
export function moveRoom(p: Project, id: string, dx: number, dy: number): LayoutResult {
  dx = Math.round(dx);
  dy = Math.round(dy);
  const s = state(p),
    r = findRoom(s.rooms, id),
    old = bounds(r.poly);
  r.poly = r.poly.map(([x, y]) => [x + dx, y + dy] as Point);
  return rebuild(
    s,
    p,
    s.rooms,
    followRoom(s.openings, id, old, [old[0] + dx, old[1] + dy, old[2] + dx, old[3] + dy]),
  );
}
function followRoom(
  openings: LayoutOpening[],
  id: string,
  old: Rect,
  next: Rect,
): LayoutOpening[] {
  const face = (side: Side, b: Rect) =>
    side === "n" ? b[1] : side === "s" ? b[3] : side === "w" ? b[0] : b[2];
  return openings.map((o) => {
    if (o.room !== id) return o;
    const along = 1 - sideAxis(o.side),
      shift = next[along] - old[along],
      translated = next[along + 2] - old[along + 2] === shift,
      line = o.line + face(o.side, next) - face(o.side, old),
      // Faces of an L-shaped room move by the same amount; on a rectangle they are the box sides.
      lo = translated ? -Infinity : next[along],
      hi = translated ? Infinity : next[along + 2];
    const start = translated
      ? o.start + shift
      : Math.max(lo, Math.min(o.start, hi - o.width));
    return { ...o, line, start, far: undefined };
  });
}
/** Remove a room. Openings in a partition it shared stay, now on the neighbouring room. */
export function deleteRoom(p: Project, id: string): LayoutResult {
  const s = state(p);
  findRoom(s.rooms, id);
  if (s.rooms.length === 1) throw Error("Mặt bằng cần ít nhất một phòng.");
  const rooms = s.rooms.filter((r) => r.id !== id),
    edges = rooms.flatMap(roomEdges),
    dropped: LayoutOpening[] = [],
    openings: LayoutOpening[] = [];
  for (const o of s.openings) {
    if (o.room !== id) {
      openings.push(o);
      continue;
    }
    const axis = sideAxis(o.side),
      e =
        o.far !== undefined &&
        edges.find(
          (e) =>
            sideAxis(e.side) === axis &&
            e.line === o.far &&
            sideDir(e.side) === -sideDir(o.side) &&
            e.s0 <= o.start &&
            o.start + o.width <= e.s1,
        );
    if (e)
      openings.push({
        ...o,
        room: e.room,
        side: e.side,
        line: e.line,
        far: o.line,
        swingIn: o.kind === "door" ? o.swingIn === false : o.swingIn,
      });
    else dropped.push(o);
  }
  const { [id]: _, ...meta } = p.rooms;
  return rebuild(s, { ...p, rooms: meta }, rooms, openings, undefined, dropped);
}
type Facing = { a: RoomEdge; b: RoomEdge; gap: number; s0: number; s1: number; strip: Rect };
/** Faces of two rooms looking at each other less than `limit` apart, with the strip between them. */
export function facing(A: Room, B: Room, limit: number): Facing[] {
  const out: Facing[] = [];
  for (const a of roomEdges(A))
    for (const b of roomEdges(B)) {
      const axis = sideAxis(a.side);
      if (sideAxis(b.side) !== axis || sideDir(a.side) !== -sideDir(b.side)) continue;
      const gap = (b.line - a.line) * sideDir(a.side) || 0,
        s0 = Math.max(a.s0, b.s0),
        s1 = Math.min(a.s1, b.s1);
      if (gap < 0 || gap >= limit || s1 - s0 <= 0) continue;
      const lo = Math.min(a.line, b.line),
        hi = Math.max(a.line, b.line);
      out.push({ a, b, gap, s0, s1, strip: axis === 1 ? [s0, lo, s1, hi] : [lo, s0, hi, s1] });
    }
  return out;
}
/** Rooms next to a room: `gap` 0 means open to it, otherwise the partition width. */
export function neighbours(p: Project, id: string) {
  const g = p.geometry,
    t = g.layout?.exterior ?? DEFAULT_LAYOUT.exterior,
    room = g.rooms.find((r) => r.id === id);
  if (!room) return [];
  return g.rooms.flatMap((r) => {
    if (r.id === id) return [];
    const f = facing(room, r, partitionLimit(t));
    return f.length ? [{ id: r.id, gap: Math.max(...f.map((x) => x.gap)), length: f.reduce((s, x) => s + x.s1 - x.s0, 0) }] : [];
  });
}
/** Merge room `b` into room `a`, including the partition between them. */
export function mergeRooms(p: Project, a: string, b: string): LayoutResult {
  const s = state(p),
    A = findRoom(s.rooms, a),
    B = findRoom(s.rooms, b),
    f = facing(A, B, partitionLimit(p.geometry.layout!.exterior));
  if (!f.length) throw Error(`${labelOf(p, a)} và ${labelOf(p, b)} không nằm cạnh nhau.`);
  const strips = f.filter((x) => x.gap > 0).map((x) => x.strip);
  A.poly = unionPoly(
    [A.poly, B.poly, ...strips.map(rectPoly)],
    "Không gộp được hai phòng này thành một phòng liền.",
  );
  const dropped: LayoutOpening[] = [],
    openings = s.openings.flatMap((o) => {
      const r = openingRect(p, o.id);
      if (r && strips.some((x) => rectsOverlap(x, r))) {
        dropped.push(o);
        return [];
      }
      return [o.room === b ? { ...o, room: a } : o];
    });
  const { [b]: _, ...meta } = p.rooms,
    base = {
      ...p,
      rooms: meta,
      furniture: p.furniture.map((f) =>
        f.placement?.roomId === b
          ? { ...f, placement: { roomId: a } }
          : f,
      ),
    },
    rooms = s.rooms.filter((r) => r.id !== b);
  return rebuild(s, base, rooms, openings, undefined, dropped);
}
/**
 * Remove or put back the partition between two rooms. Removing it gives the strip to room `a`; putting
 * it back takes a partition-wide strip from room `a`.
 */
export function toggleWall(p: Project, a: string, b: string): LayoutResult {
  const s = state(p),
    A = findRoom(s.rooms, a),
    B = findRoom(s.rooms, b),
    settings = p.geometry.layout!,
    f = facing(A, B, partitionLimit(settings.exterior));
  if (!f.length) throw Error(`${labelOf(p, a)} và ${labelOf(p, b)} không nằm cạnh nhau.`);
  const dropped: LayoutOpening[] = [];
  let openings = s.openings;
  if (f.some((x) => x.gap > 0)) {
    const strips = f.filter((x) => x.gap > 0).map((x) => x.strip);
    A.poly = unionPoly([A.poly, ...strips.map(rectPoly)], "Không bỏ được vách này.");
    openings = s.openings.filter((o) => {
      const r = openingRect(p, o.id),
        gone = !!r && strips.some((x) => rectsOverlap(x, r));
      if (gone) dropped.push(o);
      return !gone;
    });
  } else {
    const tp = newPartition(settings),
      cuts = f.map((x) => {
        const axis = sideAxis(x.a.side),
          inner = x.a.line - sideDir(x.a.side) * tp,
          lo = Math.min(inner, x.a.line),
          hi = Math.max(inner, x.a.line);
        return rectPoly(axis === 1 ? [x.s0, lo, x.s1, hi] : [lo, x.s0, hi, x.s1]);
      });
    A.poly = diffPoly(A.poly, cuts, "Không thêm được vách: phòng quá nhỏ.");
  }
  return rebuild(s, p, s.rooms, openings, undefined, dropped);
}
/** Room face whose wall contains a point (the nearest face when a partition has one on each side). */
export function hitEdge(p: Project, pt: Point): RoomEdge | null {
  const t = p.geometry.layout?.exterior ?? DEFAULT_LAYOUT.exterior;
  let best: RoomEdge | null = null,
    bestD = Infinity;
  for (const r of p.geometry.rooms)
    for (const e of roomEdges(r)) {
      const axis = sideAxis(e.side),
        along = 1 - axis,
        d = (pt[axis] - e.line) * sideDir(e.side);
      if (d < -5 || d > 2 * t || pt[along] < e.s0 || pt[along] > e.s1) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
  return best;
}
/** Add a door, window or sliding door on a room face, centred at `at` along it. */
export function addOpening(
  p: Project,
  kind: OpeningKind,
  face: RoomEdge,
  at: number,
): LayoutResult {
  const s = state(p),
    t = p.geometry.layout!.exterior,
    room = findRoom(s.rooms, face.room),
    axis = sideAxis(face.side),
    across = s.rooms.some(
      (r) =>
        r.id !== room.id &&
        roomEdges(r).some(
          (e) =>
            sideAxis(e.side) === axis &&
            sideDir(e.side) === -sideDir(face.side) &&
            (e.line - face.line) * sideDir(face.side) >= 0 &&
            (e.line - face.line) * sideDir(face.side) < partitionLimit(t) &&
            e.s0 <= at &&
            at <= e.s1,
        ),
    ),
    entry =
      kind === "door" &&
      !across &&
      !s.openings.some((o) => o.kind === "door" && o.entry),
    length = face.s1 - face.s0;
  if (length < MIN_OPENING) throw Error("Cạnh phòng quá ngắn để đặt cửa.");
  const width = Math.min(entry ? OPENING_WIDTH.entry : OPENING_WIDTH[kind], length),
    start = Math.max(face.s0, Math.min(round10(at - width / 2), face.s1 - width)),
    id =
      kind === "window"
        ? "window-new"
        : kind + "-" + nextNumber(s.openings.filter((o) => o.kind === kind).map((o) => o.id), kind + "-"),
    o: LayoutOpening = {
      kind,
      id,
      room: room.id,
      side: face.side,
      line: face.line,
      start,
      width,
      anchor: "fixed",
      ...(kind === "door"
        ? {
            name: entry ? "Cửa vào" : `Cửa ${labelOf(p, room.id)}`,
            hingeAtStart: true,
            swingIn: true,
            ...(entry ? { entry: true } : {}),
          }
        : {}),
      ...(kind === "window" ? windowHeights(p) : {}),
    };
  const res = rebuild(s, p, s.rooms, [...s.openings, o]);
  if (res.dropped.includes(o))
    throw Error(
      "Không đặt được ở đây: trùng cửa khác, chạm góc tường hoặc tường quá ngắn.",
    );
  return {
    ...res,
    id: kind === "window" ? "window-" + (res.project.geometry.windows.length - 1) : id,
  };
}
export type OpeningChange = Partial<
  Pick<LayoutOpening, "start" | "width" | "hingeAtStart" | "swingIn" | "entry" | "sill" | "head" | "name">
>;
/** Change an opening: position and width stay on its room face; one door at most is the entrance. */
export function updateOpening(p: Project, id: string, change: OpeningChange): LayoutResult {
  const s = state(p),
    o = s.openings.find((o) => o.id === id);
  if (!o) throw Error("Không tìm thấy cửa.");
  Object.assign(
    o,
    Object.fromEntries(
      Object.entries(change).map(([k, v]) => [k, typeof v === "number" ? Math.round(v) : v]),
    ),
  );
  if (!(o.width >= MIN_OPENING)) throw Error(`Cửa phải rộng ít nhất ${MIN_OPENING} mm.`);
  if (o.kind === "window" && !(o.sill! >= 0 && o.head! - o.sill! >= 100))
    throw Error("Đỉnh cửa sổ phải cao hơn bậu ít nhất 100 mm.");
  if (o.kind === "window" && o.head! > (p.geometry.ceiling ?? 2800))
    throw Error("Đỉnh cửa sổ không được cao hơn trần.");
  const face = roomEdges(findRoom(s.rooms, o.room)).find(
    (e) => e.side === o.side && e.line === o.line && e.s0 <= o.start + 1e-6 && o.start + o.width <= e.s1,
  );
  if (!face) throw Error("Cửa vượt ra ngoài cạnh phòng.");
  if (change.entry) for (const x of s.openings) if (x !== o && x.kind === "door") x.entry = false;
  const res = buildLayout(p, s.rooms, s.openings);
  if (res.dropped.length)
    throw Error("Cửa trùng với cửa khác hoặc chạm góc tường.");
  return { ...res, dropped: s.lost, id };
}
export function removeOpening(p: Project, id: string): LayoutResult {
  const s = state(p);
  if (!s.openings.some((o) => o.id === id)) throw Error("Không tìm thấy cửa.");
  return rebuild(s, p, s.rooms, s.openings.filter((o) => o.id !== id));
}
/** Exterior wall thickness, default partition width for new rooms and ceiling height. */
export function setLayoutSettings(
  p: Project,
  change: { exterior?: number; partition?: number; ceiling?: number },
): LayoutResult {
  const s = state(p),
    current = p.geometry.layout!,
    settings = {
      exterior: Math.round(change.exterior ?? current.exterior),
      partition: Math.round(change.partition ?? current.partition),
    },
    ceiling =
      change.ceiling === undefined ? p.geometry.ceiling : Math.round(change.ceiling);
  if (!(settings.exterior >= 100 && settings.exterior <= 500))
    throw Error("Tường ngoài dày từ 100 đến 500 mm.");
  if (!(settings.partition >= MIN_WALL && settings.partition <= 300))
    throw Error(`Vách dày từ ${MIN_WALL} đến 300 mm.`);
  if (ceiling !== undefined && !(ceiling >= 2200 && ceiling <= 4500))
    throw Error("Trần cao từ 2200 đến 4500 mm.");
  // Partitions stay thinner than two exterior walls; otherwise each room would get its own exterior wall
  // and doors in the partition would end against the other one. Only checked when these settings change.
  const limit = partitionLimit(settings.exterior);
  if (change.partition !== undefined && settings.partition >= limit)
    throw Error(`Vách mới phải mỏng hơn 2 lần tường ngoài: tối đa ${limit - 1} mm.`);
  if (change.exterior !== undefined && settings.exterior < current.exterior) {
    if (settings.partition >= limit)
      throw Error(
        `Tường ngoài ${settings.exterior} mm thì Vách mới (${settings.partition} mm) quá dày: vách phải mỏng hơn 2 lần tường ngoài. Hãy giảm Vách mới trước.`,
      );
    s.rooms.forEach((A, i) => {
      for (const B of s.rooms.slice(i + 1))
        for (const f of facing(A, B, partitionLimit(current.exterior)))
          if (f.gap >= limit)
            throw Error(
              `Không hạ tường ngoài xuống ${settings.exterior} mm được: vách giữa ${labelOf(p, A.id)} và ${labelOf(p, B.id)} dày ${f.gap} mm, phải mỏng hơn 2 lần tường ngoài (tường ngoài cần từ ${Math.floor(f.gap / 2) + 1} mm).`,
            );
    });
  }
  const base = {
    ...p,
    geometry: { ...p.geometry, ...(ceiling !== undefined ? { ceiling } : {}) },
  };
  // A lower ceiling lowers window heads with it (sills stay at least 100 mm below).
  if (ceiling !== undefined)
    for (const o of s.openings)
      if (o.kind === "window" && o.head !== undefined && o.head > ceiling) {
        o.head = ceiling;
        o.sill = Math.max(0, Math.min(o.sill ?? 0, ceiling - 100));
      }
  return rebuild(s, base, s.rooms, s.openings, settings);
}
/**
 * Snap the moving sides of a rectangle to the other rooms: flush with a face it looks at (open to it), one
 * partition away from it, or in line with a face nearby; otherwise to 10 mm. With `translate` the whole
 * rectangle moves by the best snap of its sides.
 */
export function snapRect(
  p: Project,
  rect: Rect,
  ignore: string | null,
  sides: { x0?: boolean; x1?: boolean; y0?: boolean; y1?: boolean },
  threshold: number,
  translate = false,
): Rect {
  const tp = p.geometry.layout?.partition ?? DEFAULT_LAYOUT.partition,
    edges = p.geometry.rooms.filter((r) => r.id !== ignore).flatMap(roomEdges),
    out: Rect = [...rect];
  const best = (k: 0 | 1, w: 0 | 2) => {
    const v = rect[k + w],
      dir = w === 2 ? 1 : -1,
      lo = rect[1 - k],
      hi = rect[1 - k + 2];
    let pick: number | null = null;
    for (const e of edges) {
      if (sideAxis(e.side) !== k) continue;
      const near = e.s1 > lo - 1500 && e.s0 < hi + 1500,
        facingIt = e.s1 > lo && e.s0 < hi && sideDir(e.side) === -dir,
        targets = facingIt ? [e.line, e.line - dir * tp] : near ? [e.line] : [];
      for (const target of targets) {
        const d = target - v;
        if (Math.abs(d) <= threshold && (pick === null || Math.abs(d) < Math.abs(pick)))
          pick = d;
      }
    }
    return pick;
  };
  for (const k of [0, 1] as const) {
    const lo = k === 0 ? sides.x0 : sides.y0,
      hi = k === 0 ? sides.x1 : sides.y1;
    if (translate) {
      const picks = [lo ? best(k, 0) : null, hi ? best(k, 2) : null].filter(
          (d): d is number => d !== null,
        ),
        d = picks.length
          ? picks.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))
          : round10(rect[k]) - rect[k];
      out[k] += d;
      out[k + 2] += d;
      continue;
    }
    if (lo) out[k] += best(k, 0) ?? round10(rect[k]) - rect[k];
    if (hi) out[k + 2] += best(k, 2) ?? round10(rect[k + 2]) - rect[k + 2];
  }
  return out;
}
