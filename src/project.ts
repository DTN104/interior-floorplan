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
  anchor: "start" | "end" | "center";
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
export type Project = {
  schemaVersion: 2;
  units: "mm";
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
function topology(g: Project["geometry"]) {
  // Wall thickness is 240 mm in the source, even for short stubs whose length is smaller than their thickness.
  const wallAxis = (r: Rect): 0 | 1 =>
    r[2] - r[0] === 240 ? 0 : r[3] - r[1] === 240 ? 1 : rectAxis(r);
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
    ].map((r) => ({ r, axis: rectAxis(r) })),
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
  const link = (r: Rect, axis: 0 | 1 = rectAxis(r)): Attachment => {
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
      anchor: "start",
    };
  };
  g.wallTracks = g.walls.map(
    (w) => link(w.slice(0, 4) as Rect, wallAxis(w.slice(0, 4) as Rect)).wallId,
  );
  g.windowAttachments = g.windows.map((r) => link(r));
  g.bayAttachments = g.bayOpenings.map((r) => link(r));
  g.doors.forEach((d) => Object.assign(d, link(d.rect)));
  g.slides.forEach((d) => Object.assign(d, link(d.rect)));
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
function validatePolygon(r: Room) {
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
const intersectionArea = (a: Point[], b: Point[]) =>
  clipping
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
    );
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
          `Phòng ${names[g.rooms[i].id] ?? g.rooms[i].id} và ${names[g.rooms[j].id] ?? g.rooms[j].id} chồng nhau.`,
        );
  for (const r of [
    ...g.walls,
    ...g.windows,
    ...g.doors.map((d) => d.rect),
    ...g.slides.map((d) => d.rect),
    ...g.bayOpenings,
  ])
    if (r[2] <= r[0] || r[3] <= r[1])
      throw Error("Tường hoặc cửa có kích thước không hợp lệ.");
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
        (originalIntrusions.get(r.id + ":" + i) ?? 0) + 1
      )
        throw Error("Tường xâm nhập phòng " + (names[r.id] ?? r.id) + ".");
  }
  for (const t of g.tracks)
    if (t.end <= t.start || t.cross[1] <= t.cross[0])
      throw Error("Đoạn tường không hợp lệ.");
}
export type ResizeResult = {
  project: Project;
  affected: string[];
  warnings: string[];
};
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
  const affected: string[] = [];
  for (const r of g.rooms) {
    let changed = false;
    const original = input.geometry.rooms.find((q) => q.id === r.id)!;
    const moving = new Set<number>();
    original.poly.forEach((v, i) => {
      const w = original.poly[(i + 1) % original.poly.length];
      if (
        v[axis] === w[axis] &&
        band.includes(v[axis]) &&
        overlap(
          Math.min(v[along], w[along]),
          Math.max(v[along], w[along]),
          lo,
          hi,
        )
      ) {
        moving.add(i);
        moving.add((i + 1) % r.poly.length);
      }
    });
    moving.forEach((i) => {
      r.poly[i][axis] += delta;
      changed = true;
    });
    if (changed) {
      affected.push(r.id);
      if (r.at) {
        const old = bounds(original.poly),
          now = bounds(r.poly);
        r.at[axis] +=
          (now[axis] + now[axis + 2] - (old[axis] + old[axis + 2])) / 2;
      }
    }
  }
  // Track changes define opening anchors and preserve opening widths.
  for (const t of g.tracks) {
    const old = input.geometry.tracks.find((q) => q.id === t.id)!;
    if (
      t.axis === axis &&
      band.includes(t.cross[0]) &&
      band.includes(t.cross[1]) &&
      t.start <= hi &&
      t.end >= lo
    ) {
      t.cross[0] += delta;
      t.cross[1] += delta;
    } else if (t.axis !== axis && t.cross[0] <= hi && t.cross[1] >= lo) {
      if (band.includes(old.start)) t.start += delta;
      if (band.includes(old.end)) t.end += delta;
    }
  }
  const updateRect = (r: Rect, old: Rect, sourceAxis: 0 | 1) => {
    if (
      sourceAxis === axis &&
      band.includes(old[axis]) &&
      band.includes(old[axis + 2]) &&
      old[along] <= hi &&
      old[along + 2] >= lo
    ) {
      r[axis] += delta;
      r[axis + 2] += delta;
    } else if (old[along] <= hi && old[along + 2] >= lo) {
      if (band.includes(old[axis])) r[axis] += delta;
      if (band.includes(old[axis + 2])) r[axis + 2] += delta;
    }
  };
  g.walls.forEach((r, i) =>
    updateRect(
      r as unknown as Rect,
      input.geometry.walls[i] as unknown as Rect,
      input.geometry.tracks.find((t) => t.id === input.geometry.wallTracks[i])!
        .axis,
    ),
  );
  const opening = (
    rect: Rect,
    oldRect: Rect,
    attachment: Attachment,
    oldAttachment: Attachment,
  ) => {
    const t = g.tracks.find((t) => t.id === attachment.wallId)!,
      old = input.geometry.tracks.find((t) => t.id === attachment.wallId)!;
    const axis = t.axis,
      along = 1 - axis;
    const gap =
      old.end - old.start - oldAttachment.offset - oldAttachment.width;
    attachment.offset =
      attachment.anchor === "start"
        ? oldAttachment.offset
        : attachment.anchor === "end"
          ? t.end - t.start - gap - attachment.width
          : (t.end - t.start - attachment.width) / 2;
    rect[axis] = t.cross[0];
    rect[axis + 2] = t.cross[1];
    rect[along] = t.start + attachment.offset;
    rect[along + 2] = rect[along] + attachment.width;
    return [rect[0] - oldRect[0], rect[1] - oldRect[1]] as Point;
  };
  g.windows.forEach((r, i) =>
    opening(
      r,
      input.geometry.windows[i],
      g.windowAttachments[i],
      input.geometry.windowAttachments[i],
    ),
  );
  g.bayOpenings.forEach((r, i) =>
    opening(
      r,
      input.geometry.bayOpenings[i],
      g.bayAttachments[i],
      input.geometry.bayAttachments[i],
    ),
  );
  g.doors.forEach((d, i) => {
    const shift = opening(
      d.rect,
      input.geometry.doors[i].rect,
      d,
      input.geometry.doors[i],
    );
    d.h[0] += shift[0];
    d.h[1] += shift[1];
  });
  g.slides.forEach((d, i) =>
    opening(d.rect, input.geometry.slides[i].rect, d, input.geometry.slides[i]),
  );
  // When an incident run's start moves, its first solid segment must end at the anchored opening's new start.
  const allOpenings = [
    ...g.windows.map((rect, i) => ({
      rect,
      a: g.windowAttachments[i],
      old: input.geometry.windows[i],
    })),
    ...g.doors.map((d, i) => ({
      rect: d.rect,
      a: d,
      old: input.geometry.doors[i].rect,
    })),
    ...g.slides.map((d, i) => ({
      rect: d.rect,
      a: d,
      old: input.geometry.slides[i].rect,
    })),
    ...g.bayOpenings.map((rect, i) => ({
      rect,
      a: g.bayAttachments[i],
      old: input.geometry.bayOpenings[i],
    })),
  ];
  for (const o of allOpenings) {
    const t = g.tracks.find((t) => t.id === o.a.wallId)!,
      along = 1 - t.axis;
    g.walls.forEach((w, i) => {
      if (g.wallTracks[i] !== t.id) return;
      const old = input.geometry.walls[i];
      if (old[along + 2] === o.old[along]) w[along + 2] = o.rect[along];
      if (old[along] === o.old[along + 2]) w[along] = o.rect[along + 2];
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
  return { project: p, affected, warnings };
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
  anchor: z.enum(["start", "end", "center"]),
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
});
const baseSchema = z.object({
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
    .array(z.object({ a: pt, b: pt }))
    .max(2000)
    .optional(),
});
function unique(ids: string[], what: string) {
  if (new Set(ids).size !== ids.length) throw Error(`ID ${what} bị trùng.`);
}
export function importProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw Error("JSON không hợp lệ.");
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== undefined &&
    raw.schemaVersion !== 1 &&
    raw.schemaVersion !== 2
  )
    throw Error("Phiên bản JSON không được hỗ trợ.");
  const b = baseSchema.parse(value),
    p = defaultProject();
  if (raw.schemaVersion === 2) {
    if (raw.units !== "mm") throw Error("Đơn vị phải là mm.");
    p.geometry = geometrySchema.parse(raw.geometry) as Project["geometry"];
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
  const g = p.geometry;
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
function verifyTopology(g: Project["geometry"]) {
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
export function loadProject(): Project {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return importProject(JSON.parse(saved));
    const old = localStorage.getItem("huxing-design-v1");
    if (old) return importProject(JSON.parse(old));
  } catch (e) {
    console.warn("Không thể đọc phương án đã lưu:", e);
  }
  return defaultProject();
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
    (_, i) => !p.demolished.includes("w" + i),
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
