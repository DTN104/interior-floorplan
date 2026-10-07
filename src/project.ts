import { z } from "zod";
import clipping from "polygon-clipping";
import {
  WALLS,
  WINS,
  DOORS,
  SLIDES,
  ROOMS,
  LIB,
  MATS,
  defaultState,
} from "./legacy-data";
export type Point = [number, number];
export type Rect = [number, number, number, number];
export type Wall = [...Rect, string];
export type Room = {
  id: string;
  name: string;
  mat: string;
  poly: Point[];
  at?: Point;
  counted?: boolean;
  boundary?: { wallId: string | null; reversed: boolean }[];
};
export type Track = {
  id: string;
  axis: 0 | 1;
  cross: [number, number];
  start: number;
  end: number;
};
export type Attachment = {
  wallId: string;
  offset: number;
  width: number;
  /** fixed: keep position (default); start/end: follow that end of the run; center: move half of the change. */
  anchor: "fixed" | "start" | "end" | "center";
};
export type Door = Attachment & {
  id: string;
  name: string;
  rect: Rect;
  h: Point;
  c: Point;
  o: Point;
  len: number;
  entry?: boolean;
};
export type Furniture = {
  id: string;
  type: string;
  name: string;
  cx: number;
  cy: number;
  w: number;
  d: number;
  rot: number;
  color: string;
  modelSeed: number;
  placement?: { roomId: string; wallId?: string };
};
/** Plans drawn with the room editor: walls are generated around the rooms with these thicknesses (mm). */
export type LayoutSettings = {
  exterior: number;
  /** Default gap left between two rooms that share a partition; existing gaps keep their width. */
  partition: number;
};
export type WindowSpec = { sill: number; head: number };
export type Project = {
  schemaVersion: 2;
  units: "mm";
  /** Plan name shown in the editor, e.g. the template it was created from. */
  name?: string;
  geometry: {
    rooms: Room[];
    walls: Wall[];
    windows: Rect[];
    doors: Door[];
    slides: (Attachment & { id: string; rect: Rect; v: boolean })[];
    bayOpenings: Rect[];
    tracks: Track[];
    wallTracks: string[];
    windowAttachments: Attachment[];
    bayAttachments: Attachment[];
    /** 2 = openings default to "fixed". Older v2 files used "start" as the implicit default. */
    anchorVersion?: 2;
    layout?: LayoutSettings;
    /** Ceiling height in mm (the original apartment: 2800). */
    ceiling?: number;
    /** Sill and head height of each window (mm), parallel to `windows`. Missing: the original apartment's rule. */
    windowSpecs?: WindowSpec[];
  };
  rooms: Record<string, { name: string; mat: string }>;
  furniture: Furniture[];
  demolished: string[];
  measures: { a: Point; b: Point }[];
};
export const clone = <T>(v: T): T => structuredClone(v);
export const area = (poly: Point[]) => Math.abs(signedArea(poly)) / 1e6;
const signedArea = (p: Point[]) =>
  p.reduce((a, v, i) => {
    const q = p[(i + 1) % p.length];
    return a + v[0] * q[1] - q[0] * v[1];
  }, 0) / 2;
export const bounds = (p: Point[]) =>
  [
    Math.min(...p.map((v) => v[0])),
    Math.min(...p.map((v) => v[1])),
    Math.max(...p.map((v) => v[0])),
    Math.max(...p.map((v) => v[1])),
  ] as Rect;
export const types = new Set(
  LIB.flatMap((c) => c.items.map((i) => String(i[0]))),
);
export const names: Record<string, string> = {
  master: "Phòng ngủ chính",
  mbath: "WC chính",
  kid: "Phòng trẻ nhỏ",
  gbath: "WC chung",
  laundry: "Ban công giặt",
  child: "Phòng con",
  kitchen: "Bếp",
  dining: "Phòng ăn",
  hall: "Hành lang",
  living: "Phòng khách",
  balcony: "Ban công thư giãn",
  bay1: "Bệ cửa sổ chính",
  bay2: "Bệ cửa sổ phòng con",
};
const legacyRoomNames = new Map((ROOMS as Room[]).map((r) => [r.id, r.name]));
/**
 * Name shown for a room: rooms of the original apartment that still carry their source name get the
 * Vietnamese label; every other room shows its stored name.
 */
export function roomLabel(p: Project, id: string) {
  const r = p.geometry.rooms.find((r) => r.id === id),
    stored = p.rooms[id]?.name ?? r?.name ?? id;
  return r && stored === r.name && legacyRoomNames.get(id) === r.name
    ? (names[id] ?? stored)
    : stored;
}
export const DEFAULT_CEILING = 2800;
/** Window heights of the original apartment: bathroom window high, bay windows low. */
export function windowSpec(g: Project["geometry"], i: number): WindowSpec {
  return (
    g.windowSpecs?.[i] ?? {
      sill: i === 0 ? 1400 : i >= 6 ? 450 : 900,
      head: 2400,
    }
  );
}
/** World origin (mm) of the 3D scene. The original apartment keeps the source's fixed origin. */
export function sceneOrigin(p: Project): Point {
  if (!p.geometry.layout) return [6000, 5300];
  const b = bounds(p.geometry.rooms.flatMap((r) => r.poly));
  return [
    Math.round((b[0] + b[2]) / 200) * 100,
    Math.round((b[1] + b[3]) / 200) * 100,
  ];
}
export const materials: Record<string, string> = {
  wood: "Sàn sồi",
  walnut: "Sàn óc chó",
  tile800: "Gạch 800",
  tile600: "Gạch 600",
  marble: "Đá cẩm thạch",
  antislip: "Gạch chống trượt",
  terrazzo: "Terrazzo",
  carpet: "Thảm",
};
export const itemNames: Record<string, string> = {
  bed: "Giường",
  crib: "Nôi",
  nightstand: "Tủ đầu giường",
  wardrobe: "Tủ áo",
  dresser: "Bàn trang điểm",
  desk: "Bàn làm việc",
  chair: "Ghế",
  bookshelf: "Kệ sách",
  baycushion: "Đệm bệ cửa sổ",
  sofa: "Sofa",
  cornersofa: "Sofa góc",
  armchair: "Ghế bành",
  beanbag: "Ghế lười",
  coffeetable: "Bàn trà",
  sidetable: "Bàn phụ",
  tvstand: "Kệ TV",
  rug: "Thảm",
  shoecab: "Tủ giày",
  floorlamp: "Đèn sàn",
  plant: "Cây xanh",
  table: "Bàn ăn",
  roundtable: "Bàn tròn",
  island: "Đảo bếp",
  barstool: "Ghế bar",
  counter: "Tủ bếp",
  stove: "Bếp nấu",
  ksink: "Chậu rửa bếp",
  fridge: "Tủ lạnh",
  cabinet: "Tủ lưu trữ",
  toilet: "Bồn cầu",
  vanity: "Tủ lavabo",
  shower: "Buồng tắm",
  bathtub: "Bồn tắm",
  washer: "Máy giặt",
  waterheater: "Bình nước nóng",
  tv: "TV",
  aircon: "Điều hòa đứng",
  acwall: "Điều hòa treo",
  dishwasher: "Máy rửa bát",
  ovencol: "Tủ lò nướng",
  dryer: "Máy sấy",
  purifier: "Máy lọc khí",
  officechair: "Ghế văn phòng",
  piano: "Piano",
  treadmill: "Máy chạy bộ",
};
const overlap = (a: number, b: number, c: number, d: number) =>
  Math.min(b, d) - Math.max(a, c) > 0.01;
const rectAxis = (r: Rect): 0 | 1 => (r[2] - r[0] <= r[3] - r[1] ? 0 : 1);
/**
 * Derive wall runs, opening attachments and room-edge links from the primary rectangles. `axisOf` names
 * the thickness axis of pieces whose shape is ambiguous (generated plans know it for every piece).
 */
export function topology(
  g: Project["geometry"],
  axisOf?: (r: Rect) => 0 | 1 | undefined,
) {
  // Wall thickness is 240 mm in the source, even for short stubs whose length is smaller than their thickness.
  const wallAxis = (r: Rect): 0 | 1 =>
      axisOf?.(r) ??
      (r[2] - r[0] === 240 ? 0 : r[3] - r[1] === 240 ? 1 : rectAxis(r)),
    openingAxis = (r: Rect): 0 | 1 => axisOf?.(r) ?? rectAxis(r);
  const pieces = [
    ...g.walls.map((w) => ({
      r: w.slice(0, 4) as Rect,
      axis: wallAxis(w.slice(0, 4) as Rect),
    })),
    ...[
      ...g.windows,
      ...g.doors.map((d) => d.rect),
      ...g.slides.map((d) => d.rect),
      ...g.bayOpenings,
    ].map((r) => ({ r, axis: openingAxis(r) })),
  ];
  const tracks: Track[] = [];
  for (const { r, axis } of pieces) {
    const along = 1 - axis,
      cross: [number, number] = [r[axis], r[axis + 2]],
      start = r[along],
      end = r[along + 2];
    const matches = tracks.filter(
      (t) =>
        t.axis === axis &&
        t.cross[0] === cross[0] &&
        t.cross[1] === cross[1] &&
        t.start <= end &&
        t.end >= start,
    );
    if (matches.length) {
      const first = matches[0];
      first.start = Math.min(start, ...matches.map((t) => t.start));
      first.end = Math.max(end, ...matches.map((t) => t.end));
      matches.slice(1).forEach((t) => tracks.splice(tracks.indexOf(t), 1));
    } else tracks.push({ id: "", axis, cross, start, end });
  }
  tracks.forEach((t, i) => (t.id = "wall-run-" + i));
  g.tracks = tracks;
  const link = (r: Rect, axis: 0 | 1 = openingAxis(r)): Attachment => {
    const along = 1 - axis;
    const t = tracks.find(
      (t) =>
        t.axis === axis &&
        t.cross[0] === r[axis] &&
        t.cross[1] === r[axis + 2] &&
        t.start <= r[along] &&
        t.end >= r[along + 2],
    )!;
    return {
      wallId: t.id,
      offset: r[along] - t.start,
      width: r[along + 2] - r[along],
      anchor: "fixed",
    };
  };
  g.wallTracks = g.walls.map(
    (w) => link(w.slice(0, 4) as Rect, wallAxis(w.slice(0, 4) as Rect)).wallId,
  );
  g.windowAttachments = g.windows.map((r) => link(r));
  g.bayAttachments = g.bayOpenings.map((r) => link(r));
  g.doors.forEach((d) => Object.assign(d, link(d.rect)));
  g.slides.forEach((d) => Object.assign(d, link(d.rect)));
  g.anchorVersion = 2;
  refreshRoomLinks(g);
}
export function edgeTrack(
  g: Project["geometry"],
  room: Room,
  index: number,
): Track | undefined {
  const a = room.poly[index],
    b = room.poly[(index + 1) % room.poly.length],
    axis: 0 | 1 = a[0] === b[0] ? 0 : 1,
    along = 1 - axis;
  return g.tracks
    .filter(
      (t) =>
        t.axis === axis &&
        t.cross.includes(a[axis]) &&
        overlap(
          t.start,
          t.end,
          Math.min(a[along], b[along]),
          Math.max(a[along], b[along]),
        ),
    )
    .sort(
      (t, u) =>
        Math.min(u.end, Math.max(a[along], b[along])) -
        Math.max(u.start, Math.min(a[along], b[along])) -
        (Math.min(t.end, Math.max(a[along], b[along])) -
          Math.max(t.start, Math.min(a[along], b[along]))),
    )[0];
}
function refreshRoomLinks(g: Project["geometry"]) {
  g.rooms.forEach(
    (r) =>
      (r.boundary = r.poly.map((p, i) => ({
        wallId: edgeTrack(g, r, i)?.id ?? null,
        reversed:
          p[0] > r.poly[(i + 1) % r.poly.length][0] ||
          p[1] > r.poly[(i + 1) % r.poly.length][1],
      }))),
  );
}
export function defaultProject(): Project {
  const s = defaultState();
  const geometry: Project["geometry"] = {
    rooms: clone(ROOMS) as Room[],
    walls: clone(WALLS) as Wall[],
    windows: clone(WINS) as Rect[],
    doors: clone(DOORS).map((d, i) => ({ ...d, id: "door-" + i })) as Door[],
    slides: clone(SLIDES).map((d, i) => ({
      ...d,
      id: "slide-" + i,
    })) as Project["geometry"]["slides"],
    bayOpenings: [
      [10270, 800, 10510, 2600],
      [10270, 4260, 10510, 5740],
    ],
    tracks: [],
    wallTracks: [],
    windowAttachments: [],
    bayAttachments: [],
  };
  topology(geometry);
  return {
    schemaVersion: 2,
    units: "mm",
    geometry,
    ...s,
    furniture: s.furniture.map((f, i) => ({
      ...f,
      id: "default-" + i,
      modelSeed: Math.round(f.w * 7 + f.d * 13 + f.cx + f.cy),
    })),
  } as unknown as Project;
}
function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const on = (p: Point, q: Point, r: Point) =>
    cross(p, q, r) === 0 &&
    r[0] >= Math.min(p[0], q[0]) &&
    r[0] <= Math.max(p[0], q[0]) &&
    r[1] >= Math.min(p[1], q[1]) &&
    r[1] <= Math.max(p[1], q[1]);
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function validatePolygon(r: Room) {
  if (r.poly.length < 4 || signedArea(r.poly) <= 0)
    throw Error("Polygon phòng phải có diện tích dương và thứ tự đỉnh hợp lệ.");
  for (let i = 0; i < r.poly.length; i++) {
    const a = r.poly[i],
      b = r.poly[(i + 1) % r.poly.length];
    if (a[0] !== b[0] && a[1] !== b[1])
      throw Error("Chỉ hỗ trợ cạnh vuông góc.");
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 10)
      throw Error("Cạnh phòng quá ngắn.");
    for (let j = i + 2; j < r.poly.length; j++) {
      if (i === 0 && j === r.poly.length - 1) continue;
      if (segmentsCross(a, b, r.poly[j], r.poly[(j + 1) % r.poly.length]))
        throw Error("Polygon phòng tự giao nhau.");
    }
  }
}
const boxesOverlap = (a: Point[], b: Point[]) => {
  const p = bounds(a),
    q = bounds(b);
  return (
    Math.min(p[2], q[2]) - Math.max(p[0], q[0]) > 0 &&
    Math.min(p[3], q[3]) - Math.max(p[1], q[1]) > 0
  );
};
// Bounding boxes are checked first: most pairs are far apart and polygon clipping is the costly part.
const intersectionArea = (a: Point[], b: Point[]) =>
  boxesOverlap(a, b)
    ? clipping
        .intersection([a], [b])
        .reduce(
          (sum, p) =>
            sum +
            p.reduce(
              (s, r, i) =>
                s + (i === 0 ? 1 : -1) * Math.abs(signedArea(r as Point[])),
              0,
            ),
          0,
        )
    : 0;
// Preserve the original bearing-block intrusions into nominal room polygons; reject any increase.
const originalIntrusions = new Map(
  (ROOMS as Room[]).flatMap((r) =>
    (WALLS as Wall[]).map(
      (w, i) =>
        [
          r.id + ":" + i,
          intersectionArea(r.poly, [
            [w[0], w[1]],
            [w[2], w[1]],
            [w[2], w[3]],
            [w[0], w[3]],
          ]),
        ] as [string, number],
    ),
  ),
);
export function validateGeometry(p: Project) {
  const g = p.geometry;
  for (const v of [
    ...g.rooms.flatMap((r) => r.poly),
    ...g.walls.map((w) => w.slice(0, 4) as number[]),
    ...g.windows,
    ...g.doors.map((d) => d.rect),
    ...g.slides.map((d) => d.rect),
  ])
    if (v.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000))
      throw Error("Tọa độ phải hữu hạn và không vượt 100.000 mm.");
  g.rooms.forEach(validatePolygon);
  for (let i = 0; i < g.rooms.length; i++)
    for (let j = i + 1; j < g.rooms.length; j++)
      if (intersectionArea(g.rooms[i].poly, g.rooms[j].poly) > 1)
        throw Error(
          `Phòng ${roomLabel(p, g.rooms[i].id)} và ${roomLabel(p, g.rooms[j].id)} chồng nhau.`,
        );
  const openingRects = [
    ...g.windows,
    ...g.doors.map((d) => d.rect),
    ...g.slides.map((d) => d.rect),
    ...g.bayOpenings,
  ];
  // A wall piece may shrink to zero length when a resize consumes it; it must never turn inside out.
  for (const w of g.walls)
    if (w[2] < w[0] || w[3] < w[1] || (w[2] === w[0] && w[3] === w[1]))
      throw Error("Tường hoặc cửa có kích thước không hợp lệ.");
  for (const r of openingRects)
    if (r[2] <= r[0] || r[3] <= r[1])
      throw Error("Tường hoặc cửa có kích thước không hợp lệ.");
  const pieces = [
    ...g.walls.map((w) => w.slice(0, 4) as Rect),
    ...openingRects,
  ];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i],
        b = pieces[j];
      if (
        Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.5 &&
        Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.5
      )
        throw Error("Tường hoặc cửa chồng lên nhau.");
    }
  for (const a of [
    ...g.windowAttachments,
    ...g.bayAttachments,
    ...g.doors,
    ...g.slides,
  ]) {
    const t = g.tracks.find((t) => t.id === a.wallId);
    if (!t || a.offset < 0 || a.offset + a.width > t.end - t.start + 0.01)
      throw Error("Cửa/cửa sổ không còn vừa tường.");
  }
  // Only the original apartment has walls standing inside nominal room polygons; drawn plans have none.
  for (let i = 0; i < g.walls.length; i++) {
    const w = g.walls[i];
    for (const r of g.rooms)
      if (
        intersectionArea(r.poly, [
          [w[0], w[1]],
          [w[2], w[1]],
          [w[2], w[3]],
          [w[0], w[3]],
        ]) >
        (g.layout ? 0 : (originalIntrusions.get(r.id + ":" + i) ?? 0)) + 1
      )
        throw Error("Tường xâm nhập phòng " + roomLabel(p, r.id) + ".");
  }
  for (const t of g.tracks)
    if (t.end <= t.start || t.cross[1] <= t.cross[0])
      throw Error("Đoạn tường không hợp lệ.");
}
export type ResizeResult = {
  project: Project;
  affected: string[];
  warnings: string[];
  /** Openings that moved along their wall run (mm, + = right/down) or were narrowed (windows only). */
  openings: { id: string; shift: number; narrowed?: number }[];
};
const doorLabels = [
  "Cửa phòng trẻ",
  "Cửa phòng chính",
  "Cửa WC chính",
  "Cửa WC chung",
  "Cửa phòng con",
  "Cửa vào",
];
const legacyDoorNames = DOORS.map((d) => d.name);
/** Doors of the original apartment keep their Vietnamese labels; drawn plans use the stored door name. */
export function openingName(p: Project, id: string) {
  const n = Number(id.slice(id.lastIndexOf("-") + 1));
  if (id.startsWith("door-")) {
    const d = p.geometry.doors.find((d) => d.id === id);
    if (d?.name && (p.geometry.layout || d.name !== legacyDoorNames[n]))
      return d.name;
    return p.geometry.layout
      ? `Cửa ${n + 1}`
      : (doorLabels[n] ?? `Cửa ${n + 1}`);
  }
  if (id.startsWith("slide-")) return `Cửa trượt ${n + 1}`;
  if (id.startsWith("bay-")) return `Ô bệ cửa sổ ${n + 1}`;
  return `Cửa sổ ${n + 1}`;
}
// Move a local wall run, its opposite room faces and incident endpoints. No global coordinate scaling.
export function moveEdge(
  input: Project,
  roomId: string,
  index: number,
  delta: number,
  moveAttached = false,
): ResizeResult {
  if (!Number.isFinite(delta) || Math.abs(delta) > 10000)
    throw Error("Khoảng dịch chuyển phải hữu hạn và không vượt 10.000 mm.");
  const p = clone(input),
    g = p.geometry,
    room = g.rooms.find((r) => r.id === roomId);
  if (!room || !room.poly[index]) throw Error("Không tìm thấy cạnh.");
  const a = room.poly[index],
    b = room.poly[(index + 1) % room.poly.length],
    axis: 0 | 1 = a[0] === b[0] ? 0 : 1,
    along = 1 - axis,
    coordinate = a[axis],
    track = edgeTrack(g, room, index);
  const band = track ? [...track.cross] : [coordinate, coordinate];
  let lo = track
      ? Math.min(track.start, a[along], b[along])
      : Math.min(a[along], b[along]),
    hi = track
      ? Math.max(track.end, a[along], b[along])
      : Math.max(a[along], b[along]); // Follow touching parallel wall runs, including irregular bearing blocks, without touching disconnected equal coordinates.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const r of g.rooms)
      for (let i = 0; i < r.poly.length; i++) {
        const a = r.poly[i],
          b = r.poly[(i + 1) % r.poly.length];
        if (a[axis] !== b[axis] || !band.includes(a[axis])) continue;
        const start = Math.min(a[along], b[along]),
          end = Math.max(a[along], b[along]);
        if (!overlap(start, end, lo, hi)) continue;
        if (start < lo) {
          lo = start;
          expanded = true;
        }
        if (end > hi) {
          hi = end;
          expanded = true;
        }
      }
    for (const t of g.tracks) {
      if (
        t.axis !== axis ||
        t.start > hi ||
        t.end < lo ||
        !t.cross.some((c) => band.includes(c))
      )
        continue;
      for (const c of t.cross)
        if (!band.includes(c)) {
          band.push(c);
          expanded = true;
        }
      if (t.start < lo) {
        lo = t.start;
        expanded = true;
      }
      if (t.end > hi) {
        hi = t.end;
        expanded = true;
      }
    }
  }
  const og = input.geometry;
  const items = [
    ...og.walls.map((w, i) => ({
      track: og.wallTracks[i],
      rect: w.slice(0, 4) as Rect,
    })),
    ...og.windows.map((rect, i) => ({
      track: og.windowAttachments[i].wallId,
      rect,
    })),
    ...og.bayOpenings.map((rect, i) => ({
      track: og.bayAttachments[i].wallId,
      rect,
    })),
    ...[...og.doors, ...og.slides].map((d) => ({
      track: d.wallId,
      rect: d.rect,
    })),
  ];
  // Runs lying in the moving band are translated as a whole.
  const moved = new Set(
    og.tracks
      .filter(
        (t) =>
          t.axis === axis &&
          band.includes(t.cross[0]) &&
          band.includes(t.cross[1]) &&
          t.start <= hi &&
          t.end >= lo,
      )
      .map((t) => t.id),
  );
  // Bay boxes (rooms not counted in the usable area) hanging off the moving wall travel with it,
  // together with their own frame runs.
  const carriedRooms = new Set<string>(),
    carried = new Set<string>();
  for (const r of og.rooms) {
    if (r.counted !== false || r.id === roomId) continue;
    const touches = r.poly.some((v, i) => {
      const w = r.poly[(i + 1) % r.poly.length];
      return (
        v[axis] === w[axis] &&
        band.includes(v[axis]) &&
        overlap(
          Math.min(v[along], w[along]),
          Math.max(v[along], w[along]),
          lo,
          hi,
        )
      );
    });
    if (!touches) continue;
    const bb = bounds(r.poly),
      inside = (x: Rect) =>
        x[0] >= bb[0] - 300 &&
        x[1] >= bb[1] - 300 &&
        x[2] <= bb[2] + 300 &&
        x[3] <= bb[3] + 300;
    carriedRooms.add(r.id);
    for (const t of og.tracks)
      if (
        !moved.has(t.id) &&
        items.every((it) => it.track !== t.id || inside(it.rect))
      )
        carried.add(t.id);
  }
  // A perpendicular run follows the moving wall at an end only where it stops against that wall.
  // Runs continued beyond that face by other fixed walls (T-junctions, corner blocks) keep their ends,
  // so bearing blocks and neighbouring partitions are no longer stretched by accident.
  const fixedItems = items.filter(
    (it) => !moved.has(it.track) && !carried.has(it.track),
  );
  const continued = (t: Track, c: number, beyond: -1 | 1) => {
    const ax = t.axis,
      al = 1 - ax,
      s0 = beyond < 0 ? c - 1 : c,
      s1 = beyond < 0 ? c : c + 1;
    return fixedItems.some(
      (it) =>
        it.track !== t.id &&
        Math.min(it.rect[al + 2], s1) - Math.max(it.rect[al], s0) > 0 &&
        Math.min(it.rect[ax + 2], t.cross[1]) -
          Math.max(it.rect[ax], t.cross[0]) >
          0,
    );
  };
  const ends = new Map<string, [number, number]>();
  for (const t of og.tracks) {
    if (
      t.axis === axis ||
      moved.has(t.id) ||
      carried.has(t.id) ||
      t.cross[0] > hi ||
      t.cross[1] < lo
    )
      continue;
    const s =
        band.includes(t.start) && !continued(t, t.start, -1)
          ? t.start + delta
          : t.start,
      e =
        band.includes(t.end) && !continued(t, t.end, 1) ? t.end + delta : t.end;
    if (s !== t.start || e !== t.end) ends.set(t.id, [s, e]);
  }
  const travels = (id: string) => moved.has(id) || carried.has(id),
    faceFollows = (it: { track: string; rect: Rect }, c: number) => {
      const e = ends.get(it.track),
        t = og.tracks.find((t) => t.id === it.track)!;
      return (
        !!e &&
        ((c === t.start && e[0] !== t.start && it.rect[axis] === c) ||
          (c === t.end && e[1] !== t.end && it.rect[axis + 2] === c))
      );
    };
  const affected: string[] = [];
  for (const r of g.rooms) {
    let changed = false;
    const original = input.geometry.rooms.find((q) => q.id === r.id)!;
    if (carriedRooms.has(r.id)) {
      // Moved as a whole with the wall; its size does not change, so it is not listed as affected.
      r.poly.forEach((v) => (v[axis] += delta));
      if (r.at) r.at[axis] += delta;
      continue;
    }
    // Room edges on the moving line follow it, except the stretches held by a wall that stays:
    // a fixed block the line runs through or along. Those stretches keep their place and a short jog
    // joins both parts, so e.g. the corner under a bearing block keeps its notch.
    const n = original.poly.length,
      at = (c: number, s: number): Point => {
        const q: Point = [0, 0];
        q[axis] = c;
        q[along] = s;
        return q;
      },
      startAt = new Map<number, Point>(),
      jogs = new Map<number, Point[]>();
    original.poly.forEach((v, i) => {
      const w = original.poly[(i + 1) % n],
        s = Math.min(v[along], w[along]),
        e = Math.max(v[along], w[along]),
        c = v[axis];
      if (v[axis] !== w[axis] || !band.includes(c) || !overlap(s, e, lo, hi))
        return;
      const held = items
        .filter(
          (it) =>
            !travels(it.track) &&
            it.rect[axis] <= c &&
            c <= it.rect[axis + 2] &&
            Math.min(it.rect[along + 2], e) - Math.max(it.rect[along], s) > 0 &&
            ((it.rect[axis] < c && c < it.rect[axis + 2]) ||
              !faceFollows(it, c)),
        )
        .map((it) => [
          Math.max(s, it.rect[along]),
          Math.min(e, it.rect[along + 2]),
        ]);
      const cuts = [
        ...new Set([s, e, ...held.flat()].filter((x) => x >= s && x <= e)),
      ].sort((x, y) => x - y);
      let parts = cuts
        .slice(0, -1)
        .map((x, k) => ({
          from: x,
          to: cuts[k + 1],
          off: held.some(([hs, he]) => hs <= x && cuts[k + 1] <= he)
            ? 0
            : delta,
        }))
        .filter((part) => part.to - part.from > 0.5);
      if (v[along] > w[along])
        parts = parts
          .reverse()
          .map((part) => ({ from: part.to, to: part.from, off: part.off }));
      if (!parts.some((part) => part.off)) return;
      changed = true;
      startAt.set(i, at(c + parts[0].off, v[along]));
      startAt.set(
        -1 - ((i + 1) % n),
        at(c + parts[parts.length - 1].off, w[along]),
      );
      const jog: Point[] = [];
      parts.forEach((part, k) => {
        if (k && part.off !== parts[k - 1].off)
          jog.push(
            at(c + parts[k - 1].off, part.from),
            at(c + part.off, part.from),
          );
      });
      if (jog.length) jogs.set(i, jog);
    });
    if (changed)
      r.poly = original.poly.flatMap((v, i) => [
        startAt.get(i) ?? startAt.get(-1 - i) ?? ([...v] as Point),
        ...(jogs.get(i) ?? []),
      ]);
    if (changed) {
      affected.push(r.id);
      // Drawn plans place the label again; the original apartment keeps its hand-placed labels.
      if (g.layout) r.at = labelPoint(r.poly);
      else if (r.at) {
        const old = bounds(original.poly),
          now = bounds(r.poly);
        r.at[axis] +=
          (now[axis] + now[axis + 2] - (old[axis] + old[axis + 2])) / 2;
      }
    }
  }
  // Translate the runs in the band and the carried bay frames.
  const shiftRect = (r: Rect) => {
    r[axis] += delta;
    r[axis + 2] += delta;
  };
  for (const t of g.tracks)
    if (moved.has(t.id) || (carried.has(t.id) && t.axis === axis)) {
      t.cross[0] += delta;
      t.cross[1] += delta;
    } else if (carried.has(t.id)) {
      t.start += delta;
      t.end += delta;
    }
  g.walls.forEach(
    (w, i) => travels(g.wallTracks[i]) && shiftRect(w as unknown as Rect),
  );
  g.windows.forEach(
    (r, i) => travels(g.windowAttachments[i].wallId) && shiftRect(r),
  );
  g.bayOpenings.forEach(
    (r, i) => travels(g.bayAttachments[i].wallId) && shiftRect(r),
  );
  g.doors.forEach((d) => {
    if (!travels(d.wallId)) return;
    shiftRect(d.rect);
    d.h[axis] += delta;
  });
  g.slides.forEach((d) => travels(d.wallId) && shiftRect(d.rect));
  // Re-lay every run whose ends moved. Openings keep their position ("fixed"), follow the end they are
  // anchored to, and are pushed back inside the run when it gets too short. Solid pieces then fill
  // whatever is left between openings: they stretch, shrink to zero length, or a new piece is added
  // where a gap would otherwise appear.
  const shifted: ResizeResult["openings"] = [];
  for (const [id, [s1, e1]] of ends) {
    const t = g.tracks.find((t) => t.id === id)!,
      old = og.tracks.find((t) => t.id === id)!,
      ax = t.axis,
      al = 1 - ax,
      ds = s1 - old.start,
      de = e1 - old.end;
    if (e1 - s1 < 10) throw Error("Một đoạn tường bị co hết chiều dài.");
    t.start = s1;
    t.end = e1;
    const ops = [
      ...g.windows.map((rect, i) => ({
        id: "window-" + i,
        rect,
        old: og.windows[i],
        a: g.windowAttachments[i] as Attachment,
        hinge: undefined as Point | undefined,
      })),
      ...g.bayOpenings.map((rect, i) => ({
        id: "bay-" + i,
        rect,
        old: og.bayOpenings[i],
        a: g.bayAttachments[i] as Attachment,
        hinge: undefined,
      })),
      ...g.doors.map((d, i) => ({
        id: d.id,
        rect: d.rect,
        old: og.doors[i].rect,
        a: d as Attachment,
        hinge: d.h,
      })),
      ...g.slides.map((d, i) => ({
        id: d.id,
        rect: d.rect,
        old: og.slides[i].rect,
        a: d as Attachment,
        hinge: undefined,
      })),
    ]
      .filter((o) => o.a.wallId === id)
      .sort((x, y) => x.old[al] - y.old[al]);
    const pos = ops.map(
      (o) =>
        o.old[al] +
        (o.a.anchor === "start"
          ? ds
          : o.a.anchor === "end"
            ? de
            : o.a.anchor === "center"
              ? (ds + de) / 2
              : 0),
    );
    // Windows (not doors, sliding doors or bay openings) narrow when the run becomes shorter than the
    // openings on it, widest first and never below 300 mm; e.g. a glazing strip spanning a whole wall.
    const narrowed = new Map<string, number>();
    let deficit = ops.reduce((s, o) => s + o.a.width, 0) - (e1 - s1);
    for (const o of [...ops]
      .filter((o) => o.id.startsWith("window-"))
      .sort((x, y) => y.a.width - x.a.width)) {
      if (deficit <= 0) break;
      const cut = Math.min(deficit, Math.max(0, o.a.width - 300));
      o.a.width -= cut;
      deficit -= cut;
      if (cut) narrowed.set(o.id, cut);
    }
    let cursor = s1;
    ops.forEach((o, k) => {
      pos[k] = Math.max(pos[k], cursor);
      cursor = pos[k] + o.a.width;
    });
    cursor = e1;
    for (let k = ops.length - 1; k >= 0; k--) {
      pos[k] = Math.min(pos[k], cursor - ops[k].a.width);
      cursor = pos[k];
    }
    if (ops.length && pos[0] < s1 - 0.01)
      throw Error("Đoạn tường quá ngắn cho cửa/cửa sổ trên đó.");
    const oldGaps: Point[] = [],
      newGaps: Point[] = [];
    let oc = old.start,
      nc = s1;
    ops.forEach((o, k) => {
      const shift = pos[k] - o.old[al];
      o.rect[al] = pos[k];
      o.rect[al + 2] = pos[k] + o.a.width;
      o.a.offset = pos[k] - s1;
      if (o.hinge) o.hinge[al] += shift;
      if (shift || narrowed.has(o.id))
        shifted.push({ id: o.id, shift, narrowed: narrowed.get(o.id) });
      oldGaps.push([oc, o.old[al]]);
      newGaps.push([nc, pos[k]]);
      oc = o.old[al + 2];
      nc = pos[k] + o.a.width;
    });
    oldGaps.push([oc, old.end]);
    newGaps.push([nc, e1]);
    const pieces = og.walls
      .map((w, i) => ({ i, s: Number(w[al]), e: Number(w[al + 2]) }))
      .filter((x) => og.wallTracks[x.i] === id)
      .sort((x, y) => x.s - y.s || x.e - y.e);
    const used = new Set<number>(),
      clampTo = (v: number, L: number, R: number) =>
        Math.min(R, Math.max(L, v));
    newGaps.forEach(([L, R], k) => {
      const [L0, R0] = oldGaps[k],
        inGap = pieces.filter(
          (x) => !used.has(x.i) && x.s >= L0 - 0.01 && x.e <= R0 + 0.01,
        );
      inGap.forEach((x) => used.add(x.i));
      if (inGap.length)
        inGap.forEach((x, n) => {
          const w = g.walls[x.i];
          w[al] = n === 0 ? L : clampTo(x.s, L, R);
          w[al + 2] = n === inGap.length - 1 ? R : clampTo(x.e, L, R);
        });
      else if (R - L > 0.01) {
        // New filler piece: same kind as the nearest piece of this run, never a bearing block.
        const near = [...pieces].sort(
            (x, y) =>
              Math.min(Math.abs(x.s - R0), Math.abs(x.e - L0)) -
              Math.min(Math.abs(y.s - R0), Math.abs(y.e - L0)),
          )[0],
          kind = near ? og.walls[near.i][4] : "e",
          w = [0, 0, 0, 0, kind === "b" ? "n" : kind] as unknown as Wall;
        w[ax] = t.cross[0];
        w[ax + 2] = t.cross[1];
        w[al] = L;
        w[al + 2] = R;
        g.walls.push(w);
        g.wallTracks.push(id);
      }
    });
  }
  if (moveAttached && track)
    for (const f of p.furniture)
      if (f.placement?.wallId === track.id) {
        if (axis === 0) f.cx += delta;
        else f.cy += delta;
      }
  refreshRoomLinks(g);
  validateGeometry(p);
  verifyTopology(g);
  const warnings = furnitureWarnings(p);
  return { project: p, affected, warnings, openings: shifted };
}
export function resizeRoom(
  p: Project,
  id: string,
  axis: 0 | 1,
  size: number,
  fixed: "min" | "max",
  moveAttached = false,
) {
  const room = p.geometry.rooms.find((r) => r.id === id)!;
  if (room.poly.length !== 4)
    throw Error("Phòng không chữ nhật: hãy chỉnh từng cạnh.");
  if (!Number.isFinite(size) || size < 100 || size > 20000)
    throw Error("Kích thước phải từ 100 đến 20.000 mm.");
  const box = bounds(room.poly),
    coord = fixed === "min" ? box[axis + 2] : box[axis];
  const edge = room.poly.findIndex(
    (a, i) =>
      a[axis] === coord &&
      room.poly[(i + 1) % room.poly.length][axis] === coord,
  );
  return moveEdge(
    p,
    id,
    edge,
    (size - (box[axis + 2] - box[axis])) * (fixed === "min" ? 1 : -1),
    moveAttached,
  );
}
export function pointIn(poly: Point[], p: Point) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
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
/** Distance from a point to the nearest side of a polygon (0 on a side). */
function clearance(poly: Point[], [x, y]: Point) {
  return poly.reduce((d, a, i) => {
    const b = poly[(i + 1) % poly.length],
      dx = Math.max(Math.min(a[0], b[0]) - x, 0, x - Math.max(a[0], b[0])),
      dy = Math.max(Math.min(a[1], b[1]) - y, 0, y - Math.max(a[1], b[1]));
    return Math.min(d, Math.hypot(dx, dy));
  }, Infinity);
}
/** Labels keep at least this far from the walls when the room allows it (mm). */
const LABEL_CLEARANCE = 200;
const round10 = (v: number) => Math.round(v / 10) * 10 || 0;
/**
 * Point for a room's label and ceiling lamp, always strictly inside the room: the middle of its bounding
 * box when that is clear of the walls, otherwise the middle of the room's largest part.
 */
export function labelPoint(poly: Point[]): Point {
  const inside = (p: Point) => pointIn(poly, p) && clearance(poly, p) > 0,
    part = slabs(poly).sort(
      (p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]),
    )[0],
    exact: Point = [(part[0] + part[2]) / 2 + 0, (part[1] + part[3]) / 2 + 0],
    rounded: Point = [round10(exact[0]), round10(exact[1])],
    fallback = inside(rounded) ? rounded : exact,
    b = bounds(poly),
    middle: Point = [round10((b[0] + b[2]) / 2), round10((b[1] + b[3]) / 2)];
  return inside(middle) &&
    clearance(poly, middle) >= Math.min(LABEL_CLEARANCE, clearance(poly, fallback))
    ? middle
    : fallback;
}
export function footprint(f: Furniture): Point[] {
  const a = (f.rot * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-f.w / 2, -f.d / 2],
    [f.w / 2, -f.d / 2],
    [f.w / 2, f.d / 2],
    [-f.w / 2, f.d / 2],
  ].map(([x, y]) => [f.cx + x * c - y * s, f.cy + x * s + y * c]);
}
export function furnitureWarnings(p: Project) {
  return p.furniture.flatMap((f) => {
    const poly = footprint(f),
      covered = p.geometry.rooms.reduce(
        (s, r) => s + intersectionArea(poly, r.poly),
        0,
      );
    const wallHit = p.geometry.walls.some(
      (w, i) =>
        !p.demolished.includes("w" + i) &&
        intersectionArea(poly, [
          [w[0], w[1]],
          [w[2], w[1]],
          [w[2], w[3]],
          [w[0], w[3]],
        ]) > 100,
    );
    const assigned =
      f.placement && p.geometry.rooms.find((r) => r.id === f.placement!.roomId);
    return covered < f.w * f.d - 100 ||
      wallHit ||
      (assigned && intersectionArea(poly, assigned.poly) < f.w * f.d - 100)
      ? [f.id]
      : [];
  });
}
const finite = z.number().finite().min(-100000).max(100000),
  pt = z.tuple([finite, finite]),
  rect = z.tuple([finite, finite, finite, finite]);
const attachment = z.object({
  wallId: z.string(),
  offset: finite,
  width: z.number().positive().max(100000),
  anchor: z.enum(["fixed", "start", "end", "center"]),
});
const furnitureSchema = z.object({
  id: z.string().min(1),
  type: z.string().refine((t) => types.has(t)),
  name: z.string().max(200),
  cx: finite,
  cy: finite,
  w: z.number().positive().max(20000),
  d: z.number().positive().max(20000),
  rot: finite,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  modelSeed: z.number().int().finite().optional(),
  placement: z
    .object({ roomId: z.string(), wallId: z.string().optional() })
    .optional(),
});
const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  mat: z.string().refine((k) => k in MATS),
  poly: z.array(pt).min(4).max(200),
  at: pt.optional(),
  counted: z.boolean().optional(),
  boundary: z.array(
    z.object({ wallId: z.string().nullable(), reversed: z.boolean() }),
  ),
});
const geometrySchema = z.object({
  rooms: z.array(roomSchema).min(1).max(100),
  walls: z
    .array(
      z.tuple([finite, finite, finite, finite, z.enum(["b", "e", "n", "low"])]),
    )
    .max(2000),
  windows: z.array(rect).max(1000),
  doors: z.array(
    attachment.extend({
      id: z.string(),
      name: z.string(),
      rect,
      h: pt,
      c: pt,
      o: pt,
      len: z.number().positive(),
      entry: z.boolean().optional(),
    }),
  ),
  slides: z.array(attachment.extend({ id: z.string(), rect, v: z.boolean() })),
  bayOpenings: z.array(rect),
  tracks: z.array(
    z.object({
      id: z.string(),
      axis: z.union([z.literal(0), z.literal(1)]),
      cross: pt,
      start: finite,
      end: finite,
    }),
  ),
  wallTracks: z.array(z.string()),
  windowAttachments: z.array(attachment),
  bayAttachments: z.array(attachment),
  anchorVersion: z.literal(2).optional(),
  layout: z
    .object({
      exterior: z.number().int().min(50).max(1000),
      partition: z.number().int().min(50).max(1000),
    })
    .optional(),
  ceiling: z.number().min(2000).max(6000).optional(),
  windowSpecs: z
    .array(
      z.object({
        sill: z.number().min(0).max(5000),
        head: z.number().min(100).max(6000),
      }),
    )
    .optional(),
});
// The original HTML app stores measurement points as {x, y}; v2 stores [x, y].
const legacyPoint = z.union([
  pt,
  z.object({ x: finite, y: finite }).transform((v): Point => [v.x, v.y]),
]);
const baseSchema = (legacy: boolean) =>
  z.object({
    name: z.string().max(200).optional(),
    furniture: z.array(furnitureSchema).max(2000),
    rooms: z
      .record(
        z.object({
          name: z.string().max(200),
          mat: z.string().refine((k) => k in MATS),
        }),
      )
      .optional(),
    demolished: z.array(z.string()).optional(),
    measures: z
      .array(
        legacy
          ? z.object({ a: legacyPoint, b: legacyPoint })
          : z.object({ a: pt, b: pt }),
      )
      .max(2000)
      .optional(),
  });
// Turn schema errors into a short Vietnamese message instead of raw Zod JSON.
function check<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  root?: string,
): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const [issue] = r.error.issues,
    where = [root, ...issue.path].filter((s) => s !== undefined).join(".");
  const why =
    issue.code === "invalid_type"
      ? issue.received === "undefined"
        ? "thiếu dữ liệu"
        : "sai kiểu dữ liệu"
      : issue.code === "too_small" || issue.code === "too_big"
        ? "giá trị ngoài giới hạn cho phép"
        : issue.code === "invalid_string"
          ? "sai định dạng"
          : "giá trị không được hỗ trợ";
  const more =
    r.error.issues.length > 1
      ? ` (và ${r.error.issues.length - 1} lỗi khác)`
      : "";
  throw Error(
    `Dữ liệu không hợp lệ tại ${where || "gốc file"}: ${why}${more}.`,
  );
}
function unique(ids: string[], what: string) {
  if (new Set(ids).size !== ids.length) throw Error(`ID ${what} bị trùng.`);
}
export function importProject(value: unknown): Project {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("JSON không hợp lệ.");
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== undefined &&
    raw.schemaVersion !== 1 &&
    raw.schemaVersion !== 2
  )
    throw Error("Phiên bản JSON không được hỗ trợ.");
  const b = check(baseSchema(raw.schemaVersion !== 2), value),
    p = defaultProject();
  if (raw.schemaVersion === 2) {
    if (raw.units !== "mm") throw Error("Đơn vị phải là mm.");
    p.geometry = check(
      geometrySchema,
      raw.geometry,
      "geometry",
    ) as Project["geometry"];
    // Before anchorVersion 2 every opening carried the implicit default "start", which made doors and
    // windows slide whenever a neighbouring wall moved. Those defaults become "fixed".
    if (p.geometry.anchorVersion !== 2) {
      for (const a of [
        ...p.geometry.windowAttachments,
        ...p.geometry.bayAttachments,
        ...p.geometry.doors,
        ...p.geometry.slides,
      ])
        if (a.anchor === "start") a.anchor = "fixed";
      p.geometry.anchorVersion = 2;
    }
  }
  p.furniture = b.furniture.map((f) => ({
    ...f,
    modelSeed: f.modelSeed ?? Math.round(f.w * 7 + f.d * 13 + f.cx + f.cy),
  }));
  p.rooms = Object.fromEntries(
    p.geometry.rooms.map((r) => [
      r.id,
      b.rooms?.[r.id] ?? { name: r.name, mat: r.mat },
    ]),
  );
  p.demolished = b.demolished ?? [];
  p.measures = b.measures ?? [];
  if (b.name) p.name = b.name;
  const g = p.geometry;
  if (
    g.windowSpecs &&
    (g.windowSpecs.length !== g.windows.length ||
      g.windowSpecs.some((w) => w.sill >= w.head))
  )
    throw Error("Chiều cao bậu/đỉnh cửa sổ không hợp lệ.");
  unique(
    g.rooms.map((r) => r.id),
    "phòng",
  );
  unique(
    g.tracks.map((t) => t.id),
    "tường",
  );
  unique(
    p.furniture.map((f) => f.id),
    "nội thất",
  );
  unique(
    [...g.doors, ...g.slides].map((o) => o.id),
    "cửa",
  );
  if (
    g.wallTracks.length !== g.walls.length ||
    g.windowAttachments.length !== g.windows.length ||
    g.bayAttachments.length !== g.bayOpenings.length
  )
    throw Error("Thiếu tham chiếu geometry.");
  for (const id of g.wallTracks)
    if (!g.tracks.some((t) => t.id === id))
      throw Error("Tham chiếu tường không tồn tại.");
  for (const f of p.furniture)
    if (
      f.placement &&
      (!g.rooms.some((r) => r.id === f.placement!.roomId) ||
        (f.placement.wallId &&
          !g.tracks.some((t) => t.id === f.placement!.wallId)))
    )
      throw Error("Tham chiếu nội thất không tồn tại.");
  for (const id of p.demolished) {
    const i = Number(id.slice(1));
    if (
      !/^w\d+$/.test(id) ||
      !g.walls[i] ||
      g.walls[i][4] === "b" ||
      g.walls[i][4] === "e"
    )
      throw Error("Không thể phá tường chịu lực/ngoài nhà.");
  }
  validateGeometry(p);
  verifyTopology(g);
  refreshRoomLinks(g);
  return p;
}
export function verifyTopology(g: Project["geometry"]) {
  for (const r of g.rooms) {
    if (r.boundary?.length !== r.poly.length)
      throw Error("Thiếu tham chiếu cạnh phòng.");
    r.boundary.forEach((b, i) => {
      if (b.wallId !== (edgeTrack(g, r, i)?.id ?? null))
        throw Error("Tham chiếu cạnh phòng không nhất quán.");
    });
  }
  const check = (r: Rect, a: Attachment) => {
    const t = g.tracks.find((t) => t.id === a.wallId)!;
    const axis = t.axis,
      along = 1 - axis;
    if (
      r[axis] !== t.cross[0] ||
      r[axis + 2] !== t.cross[1] ||
      Math.abs(r[along] - t.start - a.offset) > 0.01 ||
      Math.abs(r[along + 2] - r[along] - a.width) > 0.01
    )
      throw Error("Geometry cửa và tham chiếu tường không nhất quán.");
  };
  g.windows.forEach((r, i) => check(r, g.windowAttachments[i]));
  g.bayOpenings.forEach((r, i) => check(r, g.bayAttachments[i]));
  g.doors.forEach((d) => {
    check(d.rect, d);
    const t = g.tracks.find((t) => t.id === d.wallId)!,
      a = t.axis,
      b = 1 - a;
    if (
      ![d.rect[a], d.rect[a + 2]].includes(d.h[a]) ||
      d.h[b] !== d.rect[b + (d.c[b] < 0 ? 2 : 0)] ||
      Math.abs(d.c[0]) + Math.abs(d.c[1]) !== 1 ||
      Math.abs(d.o[0]) + Math.abs(d.o[1]) !== 1 ||
      d.c[0] * d.o[0] + d.c[1] * d.o[1] !== 0 ||
      d.c[a] !== 0
    )
      throw Error("Bản lề hoặc hướng cửa không hợp lệ.");
    if (Math.abs(d.len - d.width) > 0.01)
      throw Error("Chiều rộng cánh cửa không khớp lỗ mở.");
  });
  g.slides.forEach((d) => check(d.rect, d));
  g.walls.forEach((w, i) => {
    const t = g.tracks.find((t) => t.id === g.wallTracks[i])!,
      a = t.axis,
      b = 1 - a;
    if (
      w[a] !== t.cross[0] ||
      w[a + 2] !== t.cross[1] ||
      Number(w[b]) < t.start ||
      Number(w[b + 2]) > t.end
    )
      throw Error("Geometry tường và topology không nhất quán.");
  });
  for (const t of g.tracks) {
    const b = 1 - t.axis,
      intervals: [number, number][] = [];
    g.walls.forEach((w, i) => {
      if (g.wallTracks[i] === t.id)
        intervals.push([Number(w[b]), Number(w[b + 2])]);
    });
    const add = (r: Rect, a: Attachment) => {
      if (a.wallId === t.id) intervals.push([r[b], r[b + 2]]);
    };
    g.windows.forEach((r, i) => add(r, g.windowAttachments[i]));
    g.bayOpenings.forEach((r, i) => add(r, g.bayAttachments[i]));
    g.doors.forEach((d) => add(d.rect, d));
    g.slides.forEach((d) => add(d.rect, d));
    intervals.sort((a, b) => a[0] - b[0]);
    let end = t.start;
    for (const [start, stop] of intervals) {
      if (start > end + 0.01)
        throw Error("Vị trí neo cửa tạo khoảng trống trong đoạn tường.");
      end = Math.max(end, stop);
    }
    if (end < t.end - 0.01)
      throw Error(
        "Cần thêm đoạn tường quanh cửa trước khi đổi kích thước này.",
      );
  }
}
export const STORAGE_KEY = "interior-floorplan-v2";
export const LEGACY_STORAGE_KEY = "huxing-design-v1";
export const UNREADABLE_STORAGE_KEY = "interior-floorplan-v2-unreadable";
export type LoadResult = {
  project: Project;
  source: "v2" | "v1" | "default";
  /** Non-empty when saved data could not be read; the caller must not autosave over it silently. */
  notice: string;
};
const reason = (e: unknown) =>
  e instanceof SyntaxError
    ? "JSON bị hỏng"
    : e instanceof Error
      ? e.message.replace(/\.$/, "")
      : "lỗi không xác định";
export function loadProject(
  storage?: Pick<Storage, "getItem" | "setItem">,
): LoadResult {
  const fallback = (notice = ""): LoadResult => ({
    project: defaultProject(),
    source: "default",
    notice,
  });
  let store = storage,
    saved: string | null = null,
    old: string | null = null;
  try {
    store ??= localStorage;
    saved = store.getItem(STORAGE_KEY);
    if (!saved) old = store.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return fallback();
  }
  if (saved) {
    try {
      return {
        project: importProject(JSON.parse(saved)),
        source: "v2",
        notice: "",
      };
    } catch (e) {
      let kept = false;
      try {
        store!.setItem(UNREADABLE_STORAGE_KEY, saved);
        kept = true;
      } catch {
        /* Quota or privacy mode: the original key is still left untouched until the next edit. */
      }
      return fallback(
        `Không đọc được phương án đã lưu (${reason(e)}). ` +
          (kept
            ? `Bản lưu gốc được giữ trong khóa "${UNREADABLE_STORAGE_KEY}" của trình duyệt. `
            : "") +
          "Đang mở căn hộ mặc định; dữ liệu đã lưu chỉ bị thay khi bạn chỉnh sửa.",
      );
    }
  }
  if (old) {
    try {
      return {
        project: importProject(JSON.parse(old)),
        source: "v1",
        notice: "",
      };
    } catch (e) {
      return fallback(
        `Không chuyển được phương án từ bản HTML cũ (${reason(e)}). ` +
          "Dữ liệu bản cũ vẫn giữ nguyên; đang mở căn hộ mặc định.",
      );
    }
  }
  return fallback();
}
export function historyCommit(
  history: { past: Project[]; present: Project; future: Project[] },
  next: Project,
) {
  return {
    past: [...history.past, history.present].slice(-150),
    present: next,
    future: [],
  };
}

export function snapFurniture(
  p: Project,
  f: Furniture,
  x: number,
  y: number,
): Point {
  const angle = (f.rot * Math.PI) / 180,
    hw =
      (Math.abs(Math.cos(angle)) * f.w + Math.abs(Math.sin(angle)) * f.d) / 2,
    hh =
      (Math.abs(Math.sin(angle)) * f.w + Math.abs(Math.cos(angle)) * f.d) / 2;
  let bestX = 80,
    bestY = 80,
    nx = x,
    ny = y;
  for (const w of p.geometry.walls.filter(
    (w, i) => !p.demolished.includes("w" + i) && w[2] > w[0] && w[3] > w[1],
  )) {
    if (w[2] - w[0] <= w[3] - w[1] && overlap(y - hh, y + hh, w[1], w[3]))
      for (const c of [w[0] - hw, w[2] + hw])
        if (Math.abs(x - c) < bestX) {
          bestX = Math.abs(x - c);
          nx = c;
        }
    if (w[2] - w[0] >= w[3] - w[1] && overlap(x - hw, x + hw, w[0], w[2]))
      for (const c of [w[1] - hh, w[3] + hh])
        if (Math.abs(y - c) < bestY) {
          bestY = Math.abs(y - c);
          ny = c;
        }
  }
  return [Math.round(nx / 10) * 10, Math.round(ny / 10) * 10];
}
