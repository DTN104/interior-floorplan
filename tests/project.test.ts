import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultProject,
  importProject,
  resizeRoom,
  moveEdge,
  area,
  clone,
  furnitureWarnings,
  historyCommit,
  edgeTrack,
  validateGeometry,
  loadProject,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  UNREADABLE_STORAGE_KEY,
} from "../src/project";
import {
  ROOMS,
  WALLS,
  WINS,
  DOORS,
  SLIDES,
  LIB,
  defaultState,
} from "../src/legacy-data";

describe("original apartment and migration", () => {
  it("preserves every room, solid wall, opening and furniture placement", () => {
    const p = defaultProject();
    expect(p.geometry.rooms.map(({ boundary, ...r }) => r)).toEqual(ROOMS);
    expect(p.geometry.walls).toEqual(WALLS);
    expect(p.geometry.windows).toEqual(WINS);
    expect(
      p.geometry.doors.map(({ id, wallId, offset, width, anchor, ...d }) => d),
    ).toEqual(DOORS);
    expect(
      p.geometry.slides.map(({ id, wallId, offset, width, anchor, ...d }) => d),
    ).toEqual(SLIDES);
    expect(p.furniture).toHaveLength(46);
    expect(LIB.flatMap((c) => c.items)).toHaveLength(60);
    const original = defaultState().furniture;
    expect(p.furniture.map(({ id, modelSeed, ...f }) => f)).toEqual(
      original.map(({ id, ...f }) => f),
    );
    validateGeometry(p);
    expect(importProject(p)).toEqual(p);
  });
  it("migrates v1 names, materials, measures and furniture without losing the source data", () => {
    const old = defaultState();
    old.rooms["master"] = { name: "Phòng của tôi", mat: "carpet" };
    old.measures = [{ a: [0, 0], b: [100, 200] }] as never[];
    old.demolished = ["w30"] as never[];
    const before = JSON.stringify(old);
    const p = importProject(old);
    expect(p.rooms.master).toEqual(old.rooms.master);
    expect(p.demolished).toEqual(old.demolished);
    expect(p.measures).toEqual(old.measures);
    expect(p.furniture[0].id).toEqual(old.furniture[0].id);
    expect(p.furniture[0].modelSeed).toBe(
      Math.round(
        old.furniture[0].w * 7 +
          old.furniture[0].d * 13 +
          old.furniture[0].cx +
          old.furniture[0].cy,
      ),
    );
    expect(JSON.stringify(old)).toBe(before);
    expect(importProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it.each([NaN, Infinity, -1, 0])(
    "rejects bad furniture dimensions %s",
    (v) => {
      const p = defaultProject();
      p.furniture[0].w = v;
      expect(() => importProject(p)).toThrow();
    },
  );
  it("rejects duplicate IDs, unknown types, missing geometry, dangling refs and invalid colors", () => {
    for (const mutate of [
      (p: any) => (p.furniture[1].id = p.furniture[0].id),
      (p: any) => (p.furniture[0].type = "missing"),
      (p: any) => delete p.geometry,
      (p: any) => (p.geometry.doors[0].wallId = "missing"),
      (p: any) => (p.furniture[0].color = "red"),
      (p: any) => (p.geometry.windows[0][0] += 10),
      (p: any) => p.geometry.wallTracks.pop(),
      (p: any) => (p.geometry.rooms[0].boundary[0].wallId = "missing"),
      (p: any) => (p.geometry.rooms[0].poly[1] = [0, 999]),
    ]) {
      const p = defaultProject();
      mutate(p);
      expect(() => importProject(p)).toThrow();
    }
  });
  it("rejects unsupported versions, units and bearing demolition", () => {
    const p = defaultProject();
    expect(() => importProject({ ...p, schemaVersion: 9 })).toThrow();
    expect(() => importProject({ ...p, units: "m" })).toThrow();
    p.demolished = ["w0"];
    expect(() => importProject(p)).toThrow();
  });
});
describe("atomic shared geometry transactions", () => {
  it("moves the master/bath/hall shared wall, keeps door width and furniture exactly intact", () => {
    const p = defaultProject(),
      r = resizeRoom(p, "master", 0, 3870, "max");
    expect(r.affected).toContain("mbath");
    expect(r.affected).toContain("hall");
    const room = r.project.geometry.rooms.find((r) => r.id === "master")!;
    expect(room.poly[0][0]).toBe(6400);
    expect(room.poly[1][0]).toBe(10270);
    expect(area(room.poly)).toBeCloseTo(3.87 * 3.37);
    expect(r.project.geometry.doors[1].rect).toEqual([6160, 2400, 6400, 3280]);
    expect(r.project.geometry.doors[1].h).toEqual([6400, 3280]);
    expect(r.project.geometry.doors[1].len).toBe(880);
    expect(r.project.furniture).toEqual(p.furniture);
    expect(importProject(r.project)).toEqual(r.project);
    expect(p.geometry.rooms[0].poly[0][0]).toBe(6600);
  });
  it("expands depth with a shared wall and adjacent child room area", () => {
    const p = defaultProject(),
      r = resizeRoom(p, "master", 1, 3470, "min");
    expect(r.affected).toContain("child");
    expect(
      r.project.geometry.rooms.find((r) => r.id === "child")!.poly[0][1],
    ).toBe(3710);
    expect(r.project.geometry.walls[44].slice(1, 4)).toEqual([
      3470, 9960, 3710,
    ]);
    expect(importProject(r.project)).toEqual(r.project);
  });
  it("resizes laundry depth without moving the disconnected bathroom boundary at the same coordinate", () => {
    const p = defaultProject(),
      r = resizeRoom(p, "laundry", 1, 1440, "min");
    expect(
      r.project.geometry.rooms.find((r) => r.id === "gbath")!.poly,
    ).toEqual(p.geometry.rooms.find((r) => r.id === "gbath")!.poly);
    expect(
      r.project.geometry.rooms.find((r) => r.id === "master")!.poly,
    ).toEqual(p.geometry.rooms.find((r) => r.id === "master")!.poly);
    expect(importProject(r.project)).toEqual(r.project);
  });
  it("supports a concave dining edge and preserves furniture", () => {
    const p = defaultProject(),
      r = moveEdge(p, "dining", 2, 100);
    expect(r.affected).toContain("dining");
    expect(r.project.furniture).toEqual(p.furniture);
    expect(importProject(r.project)).toEqual(r.project);
  });
  it("preserves both opening width and end anchor when an incident wall changes length", () => {
    const p = defaultProject();
    p.geometry.doors[1].anchor = "end";
    const r = resizeRoom(p, "master", 1, 3470, "min").project;
    expect(r.geometry.doors[1].width).toBe(880);
    expect(r.geometry.doors[1].rect[1]).toBe(2500);
    expect(r.geometry.doors[1].rect[3]).toBe(3380);
    expect(importProject(r)).toEqual(r);
  });
  it("blocks opening overflow and inverted polygons without touching input", () => {
    const p = defaultProject(),
      s = JSON.stringify(p);
    expect(() => resizeRoom(p, "master", 1, 1000, "min")).toThrow();
    expect(() => moveEdge(p, "dining", 4, 10000)).toThrow();
    expect(() => resizeRoom(p, "master", 0, NaN, "min")).toThrow();
    expect(JSON.stringify(p)).toBe(s);
  });
  it("keeps attached furniture fixed unless explicit movement is requested", () => {
    const p = defaultProject(),
      room = p.geometry.rooms[0],
      track = edgeTrack(p.geometry, room, 3)!;
    p.furniture[0].placement = { roomId: "master", wallId: track.id };
    const stationary = resizeRoom(p, "master", 0, 3870, "max").project,
      moved = resizeRoom(p, "master", 0, 3870, "max", true).project;
    expect(stationary.furniture[0]).toEqual(p.furniture[0]);
    expect(moved.furniture[0].cx).toBe(p.furniture[0].cx - 200);
    expect(moved.furniture[0].w).toBe(p.furniture[0].w);
    expect(moved.furniture[0].modelSeed).toBe(p.furniture[0].modelSeed);
  });
  it("detects rotated furniture outside its assigned polygon and wall intersections", () => {
    const p = defaultProject(),
      f = p.furniture[0];
    f.cx = 6500;
    f.cy = 2000;
    f.rot = 45;
    f.placement = { roomId: "master" };
    expect(furnitureWarnings(p)).toContain(f.id);
  });
  it("moves an opening only when its own wall run changes; center follows half of the change", () => {
    const base = defaultProject();
    for (let i = 0; i < base.geometry.doors.length; i++) {
      const p = clone(base);
      p.geometry.doors[i].anchor = "center";
      const r = resizeRoom(p, "master", 0, 3870, "max");
      // Doors whose run did not change length keep their position along the wall.
      const along = (d: number[]) => [d[1], d[3]];
      expect(along(r.project.geometry.doors[i].rect)).toEqual(
        along(p.geometry.doors[i].rect),
      );
      expect(r.openings.find((o) => o.id === "door-" + i)).toBeUndefined();
    }
    const expected = {
      start: [2400, 3280],
      end: [2500, 3380],
      center: [2450, 3330],
    };
    for (const anchor of ["start", "end", "center"] as const) {
      const p = defaultProject();
      p.geometry.doors[1].anchor = anchor;
      const r = resizeRoom(p, "master", 1, 3470, "min");
      const rect = r.project.geometry.doors[1].rect;
      expect([rect[1], rect[3]]).toEqual(expected[anchor]);
      expect(r.project.geometry.doors[1].width).toBe(880);
      expect(r.openings.find((o) => o.id === "door-1")?.shift).toBe(
        anchor === "start" ? undefined : anchor === "end" ? 100 : 50,
      );
      expect(importProject(r.project)).toEqual(r.project);
    }
  });
  it("stores one completed transaction and restores all geometry on undo/redo", () => {
    const p = defaultProject(),
      next = resizeRoom(p, "master", 0, 3870, "max").project;
    const h = historyCommit({ past: [], present: p, future: [] }, next);
    expect(h.past).toHaveLength(1);
    expect(h.present).toEqual(next);
    const undone = { past: [], present: h.past[0], future: [h.present] };
    expect(undone.present).toEqual(p);
    expect(undone.future[0]).toEqual(next);
  });
});
describe("legacy v1 files and unreadable autosave", () => {
  const legacy = JSON.parse(
    readFileSync(
      new URL("./fixtures/legacy-v1-export.json", import.meta.url),
      "utf8",
    ),
  );
  const memory = (init: Record<string, string>) => {
    const m = new Map(Object.entries(init));
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  it("imports a file exported by the original HTML app, including {x, y} measures", () => {
    // Exported from legacy/index.html after one measurement with its own tool.
    expect(legacy.measures[0].a).toEqual({ x: 5140, y: 6050 });
    const p = importProject(legacy);
    expect(p.measures).toEqual([{ a: [5140, 6050], b: [7510, 6050] }]);
    expect(p.furniture.map((f) => f.id)).toEqual(
      legacy.furniture.map((f: { id: string }) => f.id),
    );
    expect(p.rooms).toEqual(legacy.rooms);
    expect(importProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("keeps v2 strict and explains invalid files in Vietnamese", () => {
    const v2 = JSON.parse(JSON.stringify(defaultProject()));
    v2.measures = [{ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }];
    expect(() => importProject(v2)).toThrow(
      "Dữ liệu không hợp lệ tại measures.0.a: sai kiểu dữ liệu",
    );
    expect(() =>
      importProject({
        ...legacy,
        furniture: [{ ...legacy.furniture[0], w: -5 }],
      }),
    ).toThrow("Dữ liệu không hợp lệ tại furniture.0.w");
  });
  it("migrates a legacy autosave and never silently replaces unreadable saved data", () => {
    const v1 = memory({ [LEGACY_STORAGE_KEY]: JSON.stringify(legacy) });
    const migrated = loadProject(v1);
    expect(migrated.source).toBe("v1");
    expect(migrated.notice).toBe("");
    expect(migrated.project.measures).toHaveLength(1);

    const broken = memory({ [STORAGE_KEY]: "{broken" });
    const loaded = loadProject(broken);
    expect(loaded.source).toBe("default");
    expect(loaded.notice).toContain("Không đọc được phương án đã lưu");
    expect(broken.m.get(STORAGE_KEY)).toBe("{broken");
    expect(broken.m.get(UNREADABLE_STORAGE_KEY)).toBe("{broken");

    const badLegacy = memory({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ ...legacy, furniture: "x" }),
    });
    const failed = loadProject(badLegacy);
    expect(failed.notice).toContain(
      "Không chuyển được phương án từ bản HTML cũ",
    );
    expect(badLegacy.m.size).toBe(1);
  });
});
