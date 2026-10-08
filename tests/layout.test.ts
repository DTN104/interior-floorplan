import { describe, it, expect } from "vitest";
import {
  LayoutSpec,
  newLayoutProject,
  readOpenings,
  addRoom,
  setRoomRect,
  moveRoom,
  deleteRoom,
  mergeRooms,
  toggleWall,
  addOpening,
  updateOpening,
  removeOpening,
  setLayoutSettings,
  hitEdge,
  snapRect,
  neighbours,
  roomEdges,
  sideAxis,
  newPartition,
} from "../src/layout";
import {
  Project,
  Rect,
  importProject,
  moveEdge,
  defaultProject,
  area,
  bounds,
  roomLabel,
  openingName,
  sceneOrigin,
  windowSpec,
  labelPoint,
  pointIn,
  Point,
  resizeRoom,
} from "../src/project";
import {
  BUILTIN_TEMPLATES,
  TEMPLATE_STORAGE_KEY,
  UNREADABLE_TEMPLATES_KEY,
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  instantiate,
  usableArea,
} from "../src/templates";

// Two bedrooms on the left, a WC and an L-shaped living room; exterior 220 mm, partitions 110 mm.
const plan: LayoutSpec = {
  name: "Căn thử",
  rooms: [
    { id: "pn1", name: "Phòng ngủ 1", mat: "wood", rect: [0, 0, 3500, 3500] },
    { id: "pn2", name: "Phòng ngủ 2", mat: "wood", rect: [0, 3610, 3500, 7000] },
    { id: "wc", name: "WC", mat: "antislip", rect: [3610, 0, 5610, 2000] },
    {
      id: "pk",
      name: "Phòng khách",
      mat: "tile800",
      poly: [
        [5720, 0],
        [9000, 0],
        [9000, 7000],
        [3610, 7000],
        [3610, 2110],
        [5720, 2110],
      ],
    },
  ],
  openings: [
    { kind: "door", room: "pn1", side: "e", offset: 2500, width: 800, name: "Cửa PN1", hingeAtStart: false },
    { kind: "door", room: "pn2", side: "e", offset: 200, width: 800, name: "Cửa PN2" },
    { kind: "door", room: "wc", side: "s", offset: 200, width: 700, name: "Cửa WC" },
    { kind: "door", room: "pk", side: "s", offset: 3000, entry: true, name: "Cửa vào" },
    { kind: "window", room: "pn1", side: "n", offset: 1000, width: 1500 },
    { kind: "window", room: "pn2", side: "w", offset: 700, width: 1500, sill: 1000, head: 2200 },
    { kind: "slide", room: "pk", side: "e", offset: 2000, width: 2400 },
  ],
};
const thickness = (p: Project, i: number) => {
  const w = p.geometry.walls[i],
    t = p.geometry.tracks.find((t) => t.id === p.geometry.wallTracks[i])!;
  return t.axis === 0 ? w[2] - w[0] : w[3] - w[1];
};
const roomArea = (p: Project, id: string) =>
  area(p.geometry.rooms.find((r) => r.id === id)!.poly);
const roundTrip = (p: Project) => importProject(JSON.parse(JSON.stringify(p)));

describe("drawn plans: walls generated around clear room dimensions", () => {
  const p = newLayoutProject(plan);
  it("keeps room sizes, closes every face and round-trips through JSON", () => {
    expect(roomArea(p, "pn1")).toBeCloseTo(12.25);
    expect(roomArea(p, "wc")).toBeCloseTo(4);
    expect(p.geometry.layout).toEqual({ exterior: 220, partition: 110 });
    const kinds = p.geometry.walls.map((w, i) => [w[4], thickness(p, i)]);
    expect(kinds.every(([k, t]) => (k === "e" ? t === 220 : t === 110))).toBe(true);
    // Every face of every room is backed by a wall run (no room touches another one here).
    for (const r of p.geometry.rooms)
      expect(r.boundary!.every((b) => b.wallId !== null)).toBe(true);
    expect(p.geometry.doors).toHaveLength(4);
    expect(p.geometry.windows).toHaveLength(2);
    expect(p.geometry.slides).toHaveLength(1);
    expect(p.geometry.windowSpecs).toEqual([
      { sill: 900, head: 2400 },
      { sill: 1000, head: 2200 },
    ]);
    expect(roundTrip(p)).toEqual(p);
  });
  it("puts doors on the intended faces, hinged and swinging into the host room", () => {
    const doors = readOpenings(p).filter((o) => o.kind === "door");
    expect(doors.map((o) => [o.id, o.room, o.side, o.swingIn])).toEqual([
      ["door-0", "pn1", "e", true],
      ["door-1", "pn2", "e", true],
      ["door-2", "wc", "s", true],
      ["door-3", "pk", "s", true],
    ]);
    const d = p.geometry.doors[0];
    // PN1 lies left of its door: the leaf opens towards −x, hinged at the lower end of the opening.
    expect(d.o).toEqual([-1, 0]);
    expect(d.h).toEqual([3500, 3300]);
    expect(p.geometry.doors[3].entry).toBe(true);
  });
  it("lets the existing edge-resize engine work on every face", () => {
    let accepted = 0,
      total = 0;
    for (const r of p.geometry.rooms)
      for (let i = 0; i < r.poly.length; i++)
        for (const d of [-500, -100, 100, 500]) {
          total++;
          try {
            moveEdge(p, r.id, i, d);
            accepted++;
          } catch {
            /* a blocked drag is allowed, counted below */
          }
        }
    expect(accepted).toBe(total);
  });
  it("closes walls between rooms that are offset from each other", () => {
    const offset = newLayoutProject({
      name: "lệch",
      rooms: [
        { id: "a", name: "A", mat: "wood", rect: [0, 0, 3000, 3000] },
        { id: "b", name: "B", mat: "wood", rect: [3110, 100, 6000, 3100] },
        { id: "c", name: "C", mat: "wood", rect: [-150, 3110, 2000, 5000] },
        { id: "d", name: "D", mat: "wood", rect: [2000, 3210, 4000, 5000] },
      ],
    });
    expect(roundTrip(offset)).toEqual(offset);
    for (const r of offset.geometry.rooms)
      expect(r.boundary!.filter((b) => b.wallId === null)).toHaveLength(
        r.id === "c" || r.id === "d" ? 1 : 0,
      );
  });
  it("rejects overlapping rooms and gaps too thin for a wall", () => {
    expect(() =>
      newLayoutProject({
        name: "x",
        rooms: [
          { id: "a", name: "A", mat: "wood", rect: [0, 0, 3000, 3000] },
          { id: "b", name: "B", mat: "wood", rect: [2900, 0, 6000, 3000] },
        ],
      }),
    ).toThrow("A chồng lên B.");
    expect(() =>
      newLayoutProject({
        name: "x",
        rooms: [
          { id: "a", name: "A", mat: "wood", rect: [0, 0, 3000, 3000] },
          { id: "b", name: "B", mat: "wood", rect: [3020, 0, 6000, 3000] },
        ],
      }),
    ).toThrow("cách phòng bên cạnh 20 mm");
    expect(() =>
      newLayoutProject({
        name: "x",
        rooms: [{ id: "a", name: "A", mat: "wood", rect: [0, 0, 400, 3000] }],
      }),
    ).toThrow("ít nhất 500 mm");
  });
  it("labels drawn rooms and doors by their stored names, even with original IDs", () => {
    const q = newLayoutProject({
      name: "x",
      rooms: [{ id: "master", name: "Phòng ngủ lớn", mat: "wood", rect: [0, 0, 3000, 3000] }],
      openings: [{ kind: "door", room: "master", side: "s", offset: 500, name: "Cửa chính" }],
    });
    expect(roomLabel(q, "master")).toBe("Phòng ngủ lớn");
    expect(openingName(q, "door-0")).toBe("Cửa chính");
    const legacy = defaultProject();
    expect(roomLabel(legacy, "master")).toBe("Phòng ngủ chính");
    expect(openingName(legacy, "door-0")).toBe("Cửa phòng trẻ");
  });
  it("leaves the original apartment as it was: fixed origin, window heights, no layout editing", () => {
    const legacy = defaultProject();
    expect(legacy.geometry.layout).toBeUndefined();
    expect(sceneOrigin(legacy)).toEqual([6000, 5300]);
    expect(windowSpec(legacy.geometry, 0).sill).toBe(1400);
    expect(windowSpec(legacy.geometry, 7).sill).toBe(450);
    expect(() => addRoom(legacy, [20000, 0, 23000, 3000])).toThrow("Căn hộ gốc");
    expect(sceneOrigin(p)).toEqual([4500, 3500]);
  });
});

describe("editing a drawn plan", () => {
  const p = newLayoutProject(plan);
  it("adds a room one partition away (shared wall) or flush (open to it)", () => {
    const shared = addRoom(p, [9110, 0, 11000, 2000]);
    expect(shared.id).toBe("r5");
    expect(neighbours(shared.project, "r5")).toEqual([
      { id: "pk", gap: 110, length: 2000 },
    ]);
    const open = addRoom(p, [9000, 4500, 11000, 7000]);
    expect(neighbours(open.project, open.id!)).toEqual([
      { id: "pk", gap: 0, length: 2500 },
    ]);
    const face = open.project.geometry.rooms
      .find((r) => r.id === open.id)!
      .boundary!.filter((b) => b.wallId === null);
    expect(face).toHaveLength(1);
    // The sliding door on that facade stays where the new room does not reach.
    expect(open.dropped).toHaveLength(0);
  });
  it("reports openings that no longer sit on one wall", () => {
    const r = addRoom(p, [9110, 1000, 11000, 3000]);
    expect(r.dropped.map((o) => o.id)).toEqual(["slide-0"]);
    expect(r.project.geometry.slides).toHaveLength(0);
  });
  it("moves a room together with its doors and windows", () => {
    const studio = BUILTIN_TEMPLATES.find((t) => t.id === "studio")!.create(),
      before = studio.geometry.slides[0].rect,
      moved = moveRoom(studio, "balcony", 500, 0).project;
    expect(moved.geometry.slides[0].rect).toEqual([
      before[0] + 500,
      before[1],
      before[2] + 500,
      before[3],
    ]);
    // Half outside the living room, the glass door would span two walls of different thickness.
    expect(moveRoom(studio, "balcony", -500, 0).dropped.map((o) => o.id)).toEqual(["slide-0"]);
    expect(roomArea(moved, "balcony")).toBeCloseTo(roomArea(studio, "balcony"));
  });
  it("resizes only the chosen room; openings follow their face and keep their place along it", () => {
    const r = setRoomRect(p, "pn1", [0, 0, 3200, 3500]).project;
    expect(roomArea(r, "pn1")).toBeCloseTo(11.2);
    expect(roomArea(r, "pk")).toBeCloseTo(roomArea(p, "pk"));
    const door = r.geometry.doors.find((d) => d.id === "door-0")!;
    expect(door.rect[0]).toBe(3200);
    expect(r.geometry.windows[0]).toEqual(p.geometry.windows[0]);
    // The gap left between PN1 and the living room becomes a thicker wall, still closed.
    expect(roundTrip(r)).toEqual(r);
  });
  it("deletes a room: its partition doors move to the neighbour, outside doors go", () => {
    const r = deleteRoom(p, "pn1");
    expect(r.project.geometry.rooms.map((x) => x.id)).toEqual(["pn2", "wc", "pk"]);
    expect(r.dropped).toHaveLength(1); // the window on PN1's outside wall
    const kept = readOpenings(r.project).find((o) => o.id === "door-0")!;
    expect(kept.room).toBe("pk");
    expect(kept.swingIn).toBe(false);
    expect(r.project.rooms.pn1).toBeUndefined();
    expect(() => deleteRoom(newLayoutProject({ name: "x", rooms: [plan.rooms[0]] }), "pn1")).toThrow(
      "ít nhất một phòng",
    );
  });
  it("merges two rooms with the partition between them", () => {
    const r = mergeRooms(p, "pk", "pn2");
    expect(r.dropped.map((o) => o.id)).toEqual(["door-1"]);
    expect(roomArea(r.project, "pk")).toBeCloseTo(
      roomArea(p, "pk") + roomArea(p, "pn2") + 0.11 * 3.39,
    );
    expect(r.project.geometry.rooms.some((x) => x.id === "pn2")).toBe(false);
    expect(() => mergeRooms(p, "pn1", "pn2")).not.toThrow();
    expect(() => mergeRooms(p, "wc", "pn2")).toThrow("không nằm cạnh nhau");
  });
  it("opens and closes the partition between two rooms, keeping both floors", () => {
    const open = toggleWall(p, "pk", "pn2").project;
    expect(neighbours(open, "pk").find((n) => n.id === "pn2")!.gap).toBe(0);
    expect(roomArea(open, "pk")).toBeCloseTo(roomArea(p, "pk") + 0.11 * 3.39);
    const closed = toggleWall(open, "pk", "pn2").project;
    expect(neighbours(closed, "pk").find((n) => n.id === "pn2")!.gap).toBe(110);
    expect(roomArea(closed, "pk")).toBeCloseTo(roomArea(p, "pk"));
  });
  it("places openings on the clicked wall; the first outside door is the entrance", () => {
    const studio = BUILTIN_TEMPLATES.find((t) => t.id === "blank")!.create(),
      face = hitEdge(studio, [2000, 3100])!;
    expect(face).toMatchObject({ room: "r1", side: "s", line: 3000 });
    const door = addOpening(studio, "door", face, 2000);
    expect(door.id).toBe("door-0");
    expect(door.project.geometry.doors[0]).toMatchObject({
      name: "Cửa vào",
      entry: true,
      rect: [1550, 3000, 2450, 3220],
    });
    const second = addOpening(door.project, "door", hitEdge(door.project, [4100, 1500])!, 1500);
    expect(second.project.geometry.doors[1].entry).toBeUndefined();
    expect(() => addOpening(door.project, "window", face, 2100)).toThrow("Không đặt được ở đây");
    const window = addOpening(door.project, "window", hitEdge(door.project, [2000, -100])!, 2000);
    expect(window.id).toBe("window-0");
    expect(window.project.geometry.windowSpecs).toEqual([{ sill: 900, head: 2400 }]);
    expect(hitEdge(studio, [2000, 1500])).toBeNull();
  });
  it("changes width, hinge, swing and the single entrance; removes openings", () => {
    const wide = updateOpening(p, "door-0", { width: 900 }).project;
    expect(wide.geometry.doors[0].width).toBe(900);
    const flipped = updateOpening(p, "door-0", { swingIn: false, hingeAtStart: true }).project.geometry.doors[0];
    expect(flipped.o).toEqual([1, 0]);
    expect(flipped.h).toEqual([3610, 2500]);
    const entrance = updateOpening(p, "door-2", { entry: true }).project.geometry.doors;
    expect(entrance.filter((d) => d.entry).map((d) => d.id)).toEqual(["door-2"]);
    expect(() => updateOpening(p, "door-0", { width: 5000 })).toThrow("vượt ra ngoài cạnh");
    expect(updateOpening(p, "door-0", { start: 2300 }).project.geometry.doors[0].rect[1]).toBe(2300);
    // Across the junction where the WC partition meets: not one wall.
    expect(() => updateOpening(p, "door-0", { start: 1950 })).toThrow("chạm góc tường");
    expect(() => updateOpening(p, "window-0", { sill: 2400 })).toThrow("Đỉnh cửa sổ");
    const removed = removeOpening(p, "window-0").project;
    expect(removed.geometry.windows).toHaveLength(1);
  });
  it("changes the exterior thickness and ceiling height", () => {
    const r = setLayoutSettings(p, { exterior: 250, ceiling: 3000 }).project;
    expect(r.geometry.ceiling).toBe(3000);
    expect(
      r.geometry.walls.every((w, i) => thickness(r, i) === (w[4] === "e" ? 250 : 110)),
    ).toBe(true);
    expect(() => setLayoutSettings(p, { exterior: 20 })).toThrow("Tường ngoài");
  });
  it("snaps flush, one partition away or in line with nearby faces", () => {
    const sides = { x0: true, x1: true, y0: true, y1: true };
    expect(snapRect(p, [9150, 30, 11000, 2000], null, sides, 150, true)).toEqual([
      9110, 0, 10960, 1970,
    ]);
    expect(snapRect(p, [9040, 4500, 11000, 7000], null, { x0: true }, 150)).toEqual([
      9000, 4500, 11000, 7000,
    ]);
    expect(snapRect(p, [9400, 4505, 11003, 7000], null, { x0: true, y0: true, x1: true }, 150)).toEqual([
      9400, 4510, 11000, 7000,
    ]);
  });
  it("keeps furniture and re-links its wall after a regeneration", () => {
    const withBed: Project = {
      ...p,
      furniture: [
        {
          id: "bed",
          type: "bed",
          name: "Giường",
          cx: 1750,
          cy: 1500,
          w: 1600,
          d: 2000,
          rot: 0,
          color: "#c8b9a6",
          modelSeed: 1,
          placement: { roomId: "pn1", wallId: p.geometry.rooms[0].boundary![0].wallId! },
        },
      ],
    };
    const moved = addRoom(withBed, [9110, 0, 11000, 2000]).project;
    expect(moved.furniture[0]).toMatchObject({ cx: 1750, cy: 1500 });
    expect(moved.furniture[0].placement?.wallId).toBeDefined();
    const gone = deleteRoom(withBed, "pn1").project;
    expect(gone.furniture[0].placement).toBeUndefined();
  });
});

describe("edits that cannot keep everything say so", () => {
  const two = BUILTIN_TEMPLATES.find((t) => t.id === "two-bedrooms")!.create();
  it("reports openings left on no room face by earlier edge drags instead of dropping them silently", () => {
    const pn1 = two.geometry.rooms.findIndex((r) => r.id === "pn1"),
      east = two.geometry.rooms[pn1].poly.findIndex(
        (v, i, poly) => v[0] === 3600 && poly[(i + 1) % poly.length][0] === 3600,
      ),
      dragged = moveEdge(two, "pn1", east, -1500).project;
    expect(dragged.geometry.windows).toHaveLength(3);
    const r = setLayoutSettings(dragged, { ceiling: 2700 });
    expect(r.dropped.map((o) => o.id)).toEqual(["window-0"]);
    expect(r.project.geometry.windows).toHaveLength(2);
  });
  it("stores whole millimetres so a saved plan always loads again", () => {
    const r = setLayoutSettings(two, { exterior: 220.5, partition: 110.4, ceiling: 2750.6 }).project;
    expect(r.geometry.layout).toEqual({ exterior: 221, partition: 110 });
    expect(r.geometry.ceiling).toBe(2751);
    expect(roundTrip(r)).toEqual(r);
    const moved = moveRoom(two, "balcony", 10.4, 0).project;
    expect(roundTrip(moved)).toEqual(moved);
  });
  it("explains a room drawn with no depth", () => {
    expect(() => addRoom(two, [0, 12000, 3000, 12000])).toThrow("ít nhất 500 mm");
  });
  it("keeps a removed partition removed when the wall is regenerated", () => {
    const pn1Door = two.geometry.doors.find((d) => d.id === "door-0")!,
      above = two.geometry.walls.findIndex(
        (w) => w[0] === 3600 && w[2] === 3710 && w[3] === pn1Door.rect[1],
      );
    expect(above).toBeGreaterThanOrEqual(0);
    const removed = { ...two, demolished: ["w" + above] },
      r = removeOpening(removed, "door-0"),
      gone = r.project.demolished.map((id) => r.project.geometry.walls[Number(id.slice(1))]);
    expect(gone).toEqual([[3600, 0, 3710, 2500, "n"]]);
    expect(r.restored).toBeUndefined();
    // Without the hall, the lower part of that stretch becomes an outside wall: it is put back, with a
    // note, while the partition to the WC stays removed.
    const back = deleteRoom(removed, "hall"),
      kept = back.project.demolished.map((id) => back.project.geometry.walls[Number(id.slice(1))]);
    expect(back.restored).toBe(1);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((w) => w[0] === 3600 && w[2] === 3710 && w[1] >= 0 && w[3] <= 2500 && w[4] === "n")).toBe(true);
  });
  it("lowers window heads with the ceiling so the windows stay editable", () => {
    const low = setLayoutSettings(two, { ceiling: 2200 }).project;
    expect(low.geometry.windowSpecs!.every((w) => w.head <= 2200 && w.sill <= 2100)).toBe(true);
    expect(() => updateOpening(low, "window-0", { width: 1300 })).not.toThrow();
    const blank = setLayoutSettings(BUILTIN_TEMPLATES[3].create(), { ceiling: 2300 }).project,
      added = addOpening(blank, "window", hitEdge(blank, [2000, -100])!, 2000).project;
    expect(added.geometry.windowSpecs).toEqual([{ sill: 900, head: 2300 }]);
  });
});

describe("random editing keeps drawn plans valid", () => {
  it("survives a long chain of random operations; every accepted plan validates", () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648,
      pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let p = newLayoutProject(plan);
    const failures = new Map<string, number>();
    let accepted = 0;
    for (let step = 0; step < 220; step++) {
      const r = pick(p.geometry.rooms),
        b = bounds(r.poly),
        op = pick(["add", "add", "move", "resize", "merge", "toggle", "door", "window", "edge", "delete"]);
      try {
        let next: Project | undefined;
        if (op === "add") {
          const w = 1500 + Math.round(rnd() * 20) * 100,
            h = 1500 + Math.round(rnd() * 20) * 100,
            gap = pick([0, 110, 110]),
            off = Math.round((rnd() - 0.5) * 10) * 100,
            side = pick(["e", "w", "s", "n"]);
          const rect: Rect =
            side === "e"
              ? [b[2] + gap, b[1] + off, b[2] + gap + w, b[1] + off + h]
              : side === "w"
                ? [b[0] - gap - w, b[1] + off, b[0] - gap, b[1] + off + h]
                : side === "s"
                  ? [b[0] + off, b[3] + gap, b[0] + off + w, b[3] + gap + h]
                  : [b[0] + off, b[1] - gap - h, b[0] + off + w, b[1] - gap];
          next = addRoom(p, snapRect(p, rect, null, { x0: true, x1: true, y0: true, y1: true }, 150, true)).project;
        } else if (op === "move")
          next = moveRoom(p, r.id, Math.round((rnd() - 0.5) * 8) * 100, Math.round((rnd() - 0.5) * 8) * 100).project;
        else if (op === "resize" && r.poly.length === 4) {
          const k = Math.floor(rnd() * 4),
            nb: Rect = [...b];
          nb[k] += Math.round((rnd() - 0.5) * 16) * 50;
          next = setRoomRect(p, r.id, nb).project;
        } else if (op === "merge" || op === "toggle") {
          const n = neighbours(p, r.id)[0];
          if (n) next = (op === "merge" ? mergeRooms : toggleWall)(p, r.id, n.id).project;
        } else if (op === "door" || op === "window") {
          const e = pick(roomEdges(r));
          next = addOpening(p, op, e, (e.s0 + e.s1) / 2).project;
        } else if (op === "edge")
          next = moveEdge(p, r.id, Math.floor(rnd() * r.poly.length), pick([-300, -100, 100, 300])).project;
        else if (op === "delete" && p.geometry.rooms.length > 3) next = deleteRoom(p, r.id).project;
        if (next) {
          expect(roundTrip(next)).toEqual(next);
          p = next;
          accepted++;
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        failures.set(m.split(":")[0].slice(0, 40), (failures.get(m.split(":")[0].slice(0, 40)) ?? 0) + 1);
      }
    }
    expect(accepted).toBeGreaterThan(80);
    // Rejections are ordinary (overlaps, an opening that does not fit), never a wall that cannot close.
    expect([...failures.keys()].some((m) => m.includes("tường quanh"))).toBe(false);
    expect(sideAxis("n")).toBe(1);
  });
});

describe("partitions stay thinner than two exterior walls", () => {
  const blankPlan = () => BUILTIN_TEMPLATES[3].create(),
    east = (p: Project, id = "r1") =>
      roomEdges(p.geometry.rooms.find((r) => r.id === id)!).find((e) => e.side === "e")!;
  it("refuses a new-partition width that would turn into two exterior walls", () => {
    const thin = setLayoutSettings(blankPlan(), { exterior: 100 }).project;
    expect(() => setLayoutSettings(thin, { partition: 250 })).toThrow("tối đa 199 mm");
    const ok = setLayoutSettings(thin, { partition: 199 }).project,
      two = addRoom(ok, [4199, 0, 7199, 3000]).project;
    expect(neighbours(two, "r1")).toEqual([{ id: "r2", gap: 199, length: 3000 }]);
    // A door in it goes through the whole partition and is not taken for the entrance.
    const door = addOpening(two, "door", east(two), 1500).project.geometry.doors[0];
    expect(door).toMatchObject({ rect: [4000, 1100, 4199, 1900], name: "Cửa Phòng 1" });
    expect(door.entry).toBeUndefined();
  });
  it("refuses a thinner exterior wall that would split an existing partition", () => {
    let p = addRoom(blankPlan(), [4250, 0, 7250, 3000]).project;
    p = addOpening(p, "door", east(p), 1500).project;
    expect(() => setLayoutSettings(p, { exterior: 120 })).toThrow(
      "vách giữa Phòng 1 và Phòng 2 dày 250 mm, phải mỏng hơn 2 lần tường ngoài (tường ngoài cần từ 126 mm)",
    );
    const res = setLayoutSettings(p, { exterior: 126 });
    expect(res.dropped).toEqual([]);
    expect(res.project.geometry.doors[0].rect).toEqual([4000, 1100, 4250, 1900]);
    expect(neighbours(res.project, "r1")).toEqual([{ id: "r2", gap: 250, length: 3000 }]);
    expect(() => setLayoutSettings(res.project, { partition: 260 })).toThrow("tối đa 251 mm");
  });
  it("still edits plans saved with a too-thick partition setting, but adds no split walls", () => {
    const p = blankPlan();
    p.geometry.layout = { exterior: 100, partition: 250 }; // as saved before the limit existed
    expect(setLayoutSettings(p, { ceiling: 3000 }).project.geometry.ceiling).toBe(3000);
    expect(() => newPartition(p.geometry.layout!)).toThrow(
      "Vách mới (250 mm) phải mỏng hơn 2 lần tường ngoài (100 mm)",
    );
    const open = addRoom(p, [4000, 0, 7000, 3000]).project;
    expect(() => toggleWall(open, "r1", "r2")).toThrow("Vách mới (250 mm)");
  });
  it("does not list rooms two exterior walls apart as neighbours: each has its own wall", () => {
    const p = addRoom(blankPlan(), [4440, 0, 7440, 3000]).project;
    expect(neighbours(p, "r1")).toEqual([]);
    expect(p.geometry.walls.filter((w) => w[0] >= 4000 && w[2] <= 4440 && w[1] === 0)).toEqual([
      [4000, 0, 4220, 3000, "e"],
      [4220, 0, 4440, 3000, "e"],
    ]);
  });
  it("keeps a window editable after the ceiling leaves exactly 100 mm between sill and head", () => {
    const p0 = blankPlan(),
      top = roomEdges(p0.geometry.rooms[0]).find((e) => e.side === "n")!,
      w = addOpening(p0, "window", top, 2000);
    let p = updateOpening(w.project, w.id!, { sill: 2150 }).project;
    p = setLayoutSettings(p, { ceiling: 2200 }).project;
    expect(p.geometry.windowSpecs).toEqual([{ sill: 2100, head: 2200 }]);
    const wider = updateOpening(p, w.id!, { width: 1300 }).project.geometry.windows[0];
    expect(wider[2] - wider[0]).toBe(1300);
    expect(() => updateOpening(p, w.id!, { sill: 2101 })).toThrow("ít nhất 100 mm");
  });
});

describe("holes in the wall mass and room labels", () => {
  const wallAt = (p: Project, x: number, y: number) =>
      p.geometry.walls.some((w) => w[0] <= x && x <= w[2] && w[1] <= y && y <= w[3]),
    strictlyInside = (poly: Point[], [x, y]: Point) =>
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([dx, dy]) => pointIn(poly, [x + dx, y + dy]));
  it("fills a narrow hole walled in between rooms, but keeps a courtyard open", () => {
    // A and B are 500 mm apart: two exterior walls with a 60 mm gap, closed at both ends by N and S.
    const cavity = newLayoutProject({
      name: "Khe kín",
      rooms: [
        { id: "a", name: "A", mat: "wood", rect: [0, 0, 3000, 3000] },
        { id: "b", name: "B", mat: "wood", rect: [3500, 0, 6500, 3000] },
        { id: "n", name: "N", mat: "wood", rect: [0, -3110, 6500, -110] },
        { id: "s", name: "S", mat: "wood", rect: [0, 3110, 6500, 6110] },
      ],
    });
    expect(wallAt(cavity, 3250, 1500)).toBe(true);
    expect(roundTrip(cavity)).toEqual(cavity);
    const yard = newLayoutProject({
      name: "Giếng trời",
      rooms: [
        { id: "n", name: "N", mat: "wood", rect: [0, 0, 5000, 1500] },
        { id: "s", name: "S", mat: "wood", rect: [0, 3500, 5000, 5000] },
        { id: "w", name: "W", mat: "wood", rect: [0, 1610, 1500, 3390] },
        { id: "e", name: "E", mat: "wood", rect: [3500, 1610, 5000, 3390] },
      ],
    });
    expect(wallAt(yard, 2500, 2500)).toBe(false);
    expect(wallAt(yard, 1600, 2500)).toBe(true);
  });
  it("puts labels strictly inside rooms, also after edge drags in normal mode", () => {
    const u: Point[] = [[0, 0], [1000, 0], [1000, 2000], [2000, 2000], [2000, 0], [3000, 0], [3000, 3000], [0, 3000]];
    expect(labelPoint(u)).toEqual([1500, 2500]);
    // Merged room whose bounding-box middle lies exactly on one of its sides.
    const odd: Point[] = [[5120, -13100], [8520, -13100], [8520, -9500], [1470, -9500], [1470, -9580], [1410, -9580],
      [1410, -11300], [1610, -11300], [1610, -13000], [4310, -13000], [4310, -11300], [5120, -11300]];
    expect(strictlyInside(odd, labelPoint(odd))).toBe(true);
    // Dragging the far end of the thin arm used to shift the label by half the change, off the floor.
    const l = newLayoutProject({
      name: "L",
      rooms: [{ id: "l", name: "L", mat: "wood",
        poly: [[100, -100], [3600, -100], [3600, 3910], [8620, 3910], [8620, 7800], [0, 7800], [0, 3910], [100, 3910]] }],
    });
    expect(l.geometry.rooms[0].at).toEqual([4310, 5860]);
    const dragged = moveEdge(l, "l", 0, -4000).project.geometry.rooms[0];
    expect(dragged.poly[0]).toEqual([100, -4100]);
    expect(dragged.at).toEqual([4310, 5860]);
    let p = newLayoutProject(plan),
      moved = 0;
    const pk = () => p.geometry.rooms.find((r) => r.id === "pk")!;
    for (let i = 0; i < pk().poly.length; i++)
      for (const d of [-300, 600, -900]) {
        try {
          p = moveEdge(p, "pk", i, d).project;
          moved++;
        } catch {
          continue;
        }
        for (const r of p.geometry.rooms) expect(strictlyInside(r.poly, r.at!)).toBe(true);
      }
    expect(moved).toBeGreaterThan(5);
  });
});

describe("room size floor in normal mode and furniture that follows its room", () => {
  const blankPlan = () => BUILTIN_TEMPLATES[3].create(),
    eastEdge = (p: Project, id = "r1") => {
      const r = p.geometry.rooms.find((x) => x.id === id)!;
      return r.poly.findIndex((a, i) => a[0] === bounds(r.poly)[2] && r.poly[(i + 1) % r.poly.length][0] === a[0]);
    };
  it("refuses normal-mode edits that shrink a drawn room below 500 mm, but lets a small room grow", () => {
    const p = blankPlan();
    expect(() => moveEdge(p, "r1", eastEdge(p), -3600)).toThrow("Phòng 1 phải rộng và sâu ít nhất 500 mm.");
    expect(() => resizeRoom(p, "r1", 1, 400, "min")).toThrow("Phòng 1 phải rộng và sâu ít nhất 500 mm.");
    const narrow = moveEdge(p, "r1", eastEdge(p), -3500).project;
    expect(bounds(narrow.geometry.rooms[0].poly)).toEqual([0, 0, 500, 3000]);
    // A room left below the floor (plans edited before the rule) can still be widened.
    const legacy = { ...narrow, geometry: { ...narrow.geometry, layout: undefined } },
      small = moveEdge(legacy, "r1", eastEdge(legacy), -200).project;
    small.geometry.layout = narrow.geometry.layout;
    expect(bounds(moveEdge(small, "r1", eastEdge(small), 100).project.geometry.rooms[0].poly)).toEqual([0, 0, 400, 3000]);
    expect(() => moveEdge(small, "r1", eastEdge(small), -100)).toThrow("ít nhất 500 mm");
    // The original apartment keeps its own rules.
    expect(defaultProject().geometry.layout).toBeUndefined();
  });
  it("moves the furniture standing in a room with it, keeping wall fixings; resizing leaves it", () => {
    const p = blankPlan(),
      north = p.geometry.tracks.find((t) => t.axis === 1 && t.cross[1] === 0)!,
      base = defaultProject().furniture[0];
    p.furniture = [
      { ...base, id: "in", cx: 2000, cy: 1500, w: 400, d: 400, placement: { roomId: "r1" } },
      { ...base, id: "wall", cx: 1000, cy: 300, w: 400, d: 400, placement: { roomId: "r1", wallId: north.id } },
      { ...base, id: "out", cx: 6000, cy: 1500, w: 400, d: 400 },
    ];
    const moved = moveRoom(roundTrip(p), "r1", 1000, -500).project,
      at = (q: Project, id: string) => q.furniture.find((f) => f.id === id)!;
    expect([at(moved, "in").cx, at(moved, "in").cy]).toEqual([3000, 1000]);
    expect([at(moved, "wall").cx, at(moved, "wall").cy]).toEqual([2000, -200]);
    expect([at(moved, "out").cx, at(moved, "out").cy]).toEqual([6000, 1500]);
    const wall = moved.geometry.tracks.find((t) => t.id === at(moved, "wall").placement!.wallId)!;
    expect([wall.axis, wall.cross]).toEqual([1, [-720, -500]]);
    expect(roundTrip(moved)).toEqual(moved);
    const resized = setRoomRect(moved, "r1", [1000, -500, 4000, 2500]).project;
    expect(resized.furniture.map((f) => [f.cx, f.cy])).toEqual(moved.furniture.map((f) => [f.cx, f.cy]));
  });
});

describe("templates", () => {
  it("builds every built-in template as a valid plan", () => {
    const built = BUILTIN_TEMPLATES.map((t) => [t.id, t.create()] as const);
    for (const [, p] of built) expect(roundTrip(p)).toEqual(p);
    expect(built.map(([id, p]) => [id, Math.round(usableArea(p))])).toEqual([
      ["original", 87],
      ["two-bedrooms", 72],
      ["studio", 34],
      ["blank", 12],
    ]);
    expect(built[0][1].geometry.layout).toBeUndefined();
    expect(built.slice(1).every(([, p]) => p.geometry.layout)).toBe(true);
  });
  it("saves, lists and deletes templates in the browser, skipping unreadable entries", () => {
    const data = new Map<string, string>(),
      storage = {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
      };
    expect(loadTemplates(storage)).toEqual([]);
    const p = defaultProject();
    saveTemplate(storage, "  Căn của tôi ", p, false);
    const list = saveTemplate(storage, "Có nội thất", p, true);
    expect(list.map((t) => [t.name, t.project.furniture.length])).toEqual([
      ["Có nội thất", 46],
      ["Căn của tôi", 0],
    ]);
    expect(list[1].project.name).toBe("Căn của tôi");
    const raw = JSON.parse(data.get(TEMPLATE_STORAGE_KEY)!);
    raw.push({ id: "bad", name: "Hỏng", project: { schemaVersion: 2 } });
    data.set(TEMPLATE_STORAGE_KEY, JSON.stringify(raw));
    expect(loadTemplates(storage).map((t) => t.name)).toEqual(["Có nội thất", "Căn của tôi"]);
    expect(deleteTemplate(storage, list[0].id).map((t) => t.name)).toEqual(["Căn của tôi"]);
    expect(() => saveTemplate(storage, "   ", p, true)).toThrow("Hãy đặt tên");
    data.set(TEMPLATE_STORAGE_KEY, "{not json");
    expect(loadTemplates(storage)).toEqual([]);
  });
  it("keeps entries it cannot read when saving or deleting, and copies a broken list aside", () => {
    const data = new Map<string, string>(),
      storage = {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
      },
      future = { id: "future", name: "Mẫu của bản mới hơn", project: { schemaVersion: 3 } },
      names = () => JSON.parse(data.get(TEMPLATE_STORAGE_KEY)!).map((t: { name: string }) => t.name);
    data.set(TEMPLATE_STORAGE_KEY, JSON.stringify([future]));
    const list = saveTemplate(storage, "Mới", defaultProject(), false);
    expect(list.map((t) => t.name)).toEqual(["Mới"]);
    expect(names()).toEqual(["Mới", "Mẫu của bản mới hơn"]);
    expect(deleteTemplate(storage, list[0].id)).toEqual([]);
    expect(JSON.parse(data.get(TEMPLATE_STORAGE_KEY)!)).toEqual([future]);
    // Past the limit only the oldest readable templates go.
    for (let i = 0; i < 21; i++) saveTemplate(storage, "Mẫu " + i, defaultProject(), false);
    expect(loadTemplates(storage)).toHaveLength(20);
    expect(names().slice(-2)).toEqual(["Mẫu 1", "Mẫu của bản mới hơn"]);
    data.set(TEMPLATE_STORAGE_KEY, "{broken");
    saveTemplate(storage, "Sau khi hỏng", defaultProject(), false);
    expect(data.get(UNREADABLE_TEMPLATES_KEY)).toBe("{broken");
    expect(names()).toEqual(["Sau khi hỏng"]);
  });
  it("starts from an independent, named copy of a template", () => {
    const source = newLayoutProject(plan),
      copy = instantiate(source, "Bản của tôi");
    expect(copy.name).toBe("Bản của tôi");
    copy.geometry.rooms[0].poly[0][0] = -1;
    expect(source.geometry.rooms[0].poly[0][0]).toBe(0);
  });
});
