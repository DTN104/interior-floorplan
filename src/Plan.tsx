import { useRef, useState, useEffect } from "react";
import { Project, Point, Rect, area, bounds, roomLabel } from "./project";
import { isRectRoom, snapRect } from "./layout";
import { furnSVG } from "./legacy-svg";
import { buildDefs } from "./legacy-defs";
export type EdgeDragPhase = "move" | "end" | "cancel";
export type LayoutTool = "select" | "room" | "door" | "window" | "slide";
export type RoomGesture =
  | { kind: "move"; roomId: string; dx: number; dy: number }
  | { kind: "draw"; rect: Rect };
/** Editing a drawn plan: rooms are drawn, moved and resized on their own; openings are placed on walls. */
export type PlanLayout = {
  tool: LayoutTool;
  selectedOpening: string | null;
  /** Rectangle being drawn and whether it is currently invalid. */
  draft: Rect | null;
  draftError: boolean;
  onGesture: (g: RoomGesture, phase: EdgeDragPhase) => void;
  onPlace: (kind: "door" | "window" | "slide", at: Point) => void;
  onSelectOpening: (id: string) => void;
};
type Props = {
  project: Project;
  /** Committed project: edge handles always refer to its room polygons. */
  base: Project;
  edgeDrag: {
    roomId: string;
    index: number;
    delta: number;
    error: string;
  } | null;
  onEdgeDrag: (
    roomId: string,
    index: number,
    delta: number,
    phase: EdgeDragPhase,
  ) => void;
  selected: string | null;
  kind: "room" | "furniture" | "opening";
  onSelect: (id: string, kind: "room" | "furniture") => void;
  onMove: (id: string, x: number, y: number, finished: boolean) => void;
  onCancelMove: () => void;
  dragKey: number;
  onMeasure: (a: Point, b: Point) => void;
  onDemolish: (i: number) => void;
  tool: "select" | "measure" | "demolish";
  grid: boolean;
  fitKey: number;
  svgRef: React.RefObject<SVGSVGElement>;
  layout: PlanLayout | null;
};
export function Plan({
  project: p,
  base,
  edgeDrag,
  onEdgeDrag,
  selected,
  kind,
  onSelect,
  onMove,
  onCancelMove,
  dragKey,
  onMeasure,
  onDemolish,
  tool,
  grid,
  fitKey,
  svgRef,
  layout,
}: Props) {
  const all = p.geometry.rooms.flatMap((r) => r.poly),
    b = bounds(all);
  const initial = {
    x: b[0] - 750,
    y: b[1] - 750,
    w: b[2] - b[0] + 1500,
    h: b[3] - b[1] + 1500,
  };
  const [view, setView] = useState(initial);
  useEffect(() => {
    setView(initial);
  }, [fitKey]);
  const [measure, setMeasure] = useState<Point | null>(null);
  const drag = useRef<{
    id: string;
    start: Point;
    cx: number;
    cy: number;
    last: Point;
    pid: number;
  } | null>(null);
  // Pointer capture for panning retargets the click event to <svg>, so a room is selected on
  // pointerup when the pointer did not travel further than a tap.
  const pan = useRef<{
    start: Point;
    view: typeof view;
    pid: number;
    client: Point;
    tap: number;
    room: string | null;
    moved: boolean;
    /** Layout mode: opening tool to use when this turns out to be a tap. */
    place?: "door" | "window" | "slide";
  } | null>(null);
  // Dragging a room edge: the delta is measured perpendicular to the edge and snapped to 10 mm.
  const edge = useRef<{
    roomId: string;
    index: number;
    axis: 0 | 1;
    start: number;
    pid: number;
    delta: number;
    client: Point;
    moved: boolean;
  } | null>(null);
  // Drawing or moving a room in layout mode.
  const gesture = useRef<{
    kind: "move" | "draw";
    roomId: string;
    start: Point;
    box: Rect;
    pid: number;
    client: Point;
    moved: boolean;
    last: RoomGesture | null;
  } | null>(null);
  // Snapping reach: about 12 screen pixels, in millimetres.
  const reach = () => {
    const w = svgRef.current?.clientWidth || 1000;
    return Math.min(400, Math.max(20, (view.w / w) * 12));
  };
  useEffect(() => {
    const pid = drag.current?.pid ?? edge.current?.pid ?? gesture.current?.pid;
    drag.current = null;
    pan.current = null;
    edge.current = null;
    gesture.current = null;
    const svg = svgRef.current;
    if (pid !== undefined && svg?.hasPointerCapture(pid))
      svg.releasePointerCapture(pid);
  }, [dragKey]);
  const local = (e: { clientX: number; clientY: number }): Point => {
    const el = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      el.getScreenCTM()!.inverse(),
    );
    return [Math.round(pt.x), Math.round(pt.y)];
  };
  const finish = (e: React.PointerEvent<SVGSVGElement>) => {
    const gs = gesture.current;
    if (gs) {
      if (gs.pid !== e.pointerId) return;
      gesture.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      // A tap without movement neither moves a room nor draws one.
      layout?.onGesture(
        gs.last ?? { kind: "draw", rect: [...gs.box] },
        gs.moved && gs.last ? "end" : "cancel",
      );
      return;
    }
    const d = drag.current,
      tap = pan.current,
      ed = edge.current;
    if (ed) {
      if (ed.pid !== e.pointerId) return;
      edge.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      onEdgeDrag(ed.roomId, ed.index, ed.delta, "end");
      return;
    }
    if (d && d.pid !== e.pointerId) return;
    drag.current = null;
    pan.current = null;
    if (!d && tap && !tap.moved && tap.pid === e.pointerId) {
      if (tap.place) layout?.onPlace(tap.place, tap.start);
      else if (tap.room) onSelect(tap.room, "room");
    }
    if (d) {
      onMove(
        d.id,
        d.cx + d.last[0] - d.start[0],
        d.cy + d.last[1] - d.start[1],
        true,
      );
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const cancel = (e: React.PointerEvent<SVGSVGElement>) => {
    const gs = gesture.current;
    if (gs) {
      if (gs.pid !== e.pointerId) return;
      gesture.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      layout?.onGesture(gs.last ?? { kind: "draw", rect: [...gs.box] }, "cancel");
      return;
    }
    const ed = edge.current;
    if (ed) {
      if (ed.pid !== e.pointerId) return;
      edge.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      onEdgeDrag(ed.roomId, ed.index, ed.delta, "cancel");
      return;
    }
    if (drag.current && drag.current.pid !== e.pointerId) return;
    const wasDragging = !!drag.current;
    drag.current = null;
    pan.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (wasDragging) onCancelMove();
  };
  return (
    <svg
      ref={svgRef}
      className={"plan tool-" + (layout ? "layout-" + layout.tool : tool)}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      aria-label="Bản vẽ 2D"
      onWheel={(e) => {
        const factor = e.deltaY > 0 ? 1.12 : 0.88,
          at = local(e);
        setView((v) => ({
          ...v,
          x: at[0] + (v.x - at[0]) * factor,
          y: at[1] + (v.y - at[1]) * factor,
          w: Math.min(50000, Math.max(2000, v.w * factor)),
          h: Math.min(50000, Math.max(2000, v.h * factor)),
        }));
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const at = local(e);
        if (layout) {
          const target = e.target as Element;
          if (layout.tool === "room") {
            gesture.current = {
              kind: "draw",
              roomId: "",
              start: at,
              box: [at[0], at[1], at[0], at[1]],
              pid: e.pointerId,
              client: [e.clientX, e.clientY],
              moved: false,
              last: null,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          if (layout.tool !== "select") {
            // A tap places the opening on the wall under it; a drag pans the view.
            pan.current = {
              start: at,
              view,
              pid: e.pointerId,
              client: [e.clientX, e.clientY],
              tap: e.pointerType === "mouse" ? 4 : 9,
              room: null,
              moved: false,
              place: layout.tool,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          const opening = target.closest("[data-opening]")?.getAttribute("data-opening");
          if (opening) {
            layout.onSelectOpening(opening);
            return;
          }
          const roomId = target.closest("[data-room]")?.getAttribute("data-room");
          const room = roomId && kind === "room" && selected === roomId && base.geometry.rooms.find((r) => r.id === roomId);
          if (room) {
            gesture.current = {
              kind: "move",
              roomId: room.id,
              start: at,
              box: bounds(room.poly),
              pid: e.pointerId,
              client: [e.clientX, e.clientY],
              moved: false,
              last: null,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
        }
        if (tool === "measure") {
          if (measure) {
            onMeasure(measure, at);
            setMeasure(null);
          } else setMeasure(at);
          return;
        }
        if (tool === "select" && !drag.current) {
          pan.current = {
            start: at,
            view,
            pid: e.pointerId,
            client: [e.clientX, e.clientY],
            tap: e.pointerType === "mouse" ? 4 : 9,
            room:
              (e.target as Element)
                .closest("[data-room]")
                ?.getAttribute("data-room") ?? null,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        const at = local(e),
          d = drag.current,
          ed = edge.current,
          gs = gesture.current;
        if (gs) {
          if (gs.pid !== e.pointerId) return;
          if (
            !gs.moved &&
            Math.hypot(e.clientX - gs.client[0], e.clientY - gs.client[1]) <
              (e.pointerType === "mouse" ? 4 : 9)
          )
            return;
          gs.moved = true;
          let next: RoomGesture;
          if (gs.kind === "move") {
            const b = gs.box,
              dx = at[0] - gs.start[0],
              dy = at[1] - gs.start[1],
              snapped = snapRect(
                base,
                [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy],
                gs.roomId,
                { x0: true, x1: true, y0: true, y1: true },
                reach(),
                true,
              );
            next = { kind: "move", roomId: gs.roomId, dx: snapped[0] - b[0], dy: snapped[1] - b[1] };
          } else {
            // Every side snaps for the side it is now, so dragging left or up works like right or down.
            const [sx, sy] = gs.start,
              rect = snapRect(
                base,
                [Math.min(sx, at[0]), Math.min(sy, at[1]), Math.max(sx, at[0]), Math.max(sy, at[1])],
                null,
                { x0: true, x1: true, y0: true, y1: true },
                reach(),
              );
            gs.box = rect;
            next = { kind: "draw", rect };
          }
          const same =
            gs.last &&
            JSON.stringify(gs.last) === JSON.stringify(next);
          if (!same) {
            gs.last = next;
            layout?.onGesture(next, "move");
          }
          return;
        }
        if (ed) {
          if (ed.pid !== e.pointerId) return;
          let delta = Math.round((at[ed.axis] - ed.start) / 10) * 10;
          // Layout mode resizes only this room: once the pointer really moves, its side also snaps to the
          // neighbouring rooms (no snap without movement, so pressing a handle never changes the room).
          if (layout && !ed.moved) {
            if (
              Math.hypot(e.clientX - ed.client[0], e.clientY - ed.client[1]) <
              (e.pointerType === "mouse" ? 4 : 9)
            )
              return;
            ed.moved = true;
          }
          const room =
            layout && delta !== 0 && base.geometry.rooms.find((r) => r.id === ed.roomId);
          if (room) {
            const b = bounds(room.poly),
              c = room.poly[ed.index][ed.axis],
              k = (c === b[ed.axis] ? ed.axis : ed.axis + 2) as 0 | 1 | 2 | 3,
              moved: Rect = [...b];
            moved[k] += delta;
            const snapped = snapRect(
              base,
              moved,
              room.id,
              { x0: k === 0, y0: k === 1, x1: k === 2, y1: k === 3 },
              reach(),
            );
            delta = snapped[k] - b[k];
          }
          if (delta !== ed.delta) {
            ed.delta = delta;
            onEdgeDrag(ed.roomId, ed.index, delta, "move");
          }
        } else if (d) {
          if (d.pid !== e.pointerId) return;
          d.last = at;
          onMove(
            d.id,
            d.cx + at[0] - d.start[0],
            d.cy + at[1] - d.start[1],
            false,
          );
        } else if (pan.current) {
          const old = pan.current;
          if (old.pid !== e.pointerId) return;
          if (
            !old.moved &&
            Math.hypot(e.clientX - old.client[0], e.clientY - old.client[1]) <
              old.tap
          )
            return;
          old.moved = true;
          setView((v) => ({
            ...v,
            x: v.x + old.start[0] - at[0],
            y: v.y + old.start[1] - at[1],
          }));
        }
      }}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      <defs dangerouslySetInnerHTML={{ __html: buildDefs() }} />
      <rect
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        fill="#f7f4ee"
      />
      {grid && (
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill="url(#grid)"
        />
      )}
      {p.geometry.rooms.map((r) => (
        <polygon
          key={r.id}
          data-room={r.id}
          points={r.poly.map((p) => p.join(",")).join(" ")}
          fill={`url(#m-${p.rooms[r.id].mat})`}
          stroke={selected === r.id && kind === "room" ? "#bf693f" : "#d1c7b8"}
          strokeWidth={selected === r.id ? 35 : 10}
        />
      ))}
      {p.geometry.walls.map((w, i) => (
        <rect
          key={i}
          data-wall={"w" + i}
          x={w[0]}
          y={w[1]}
          width={w[2] - w[0]}
          height={w[3] - w[1]}
          fill={
            p.demolished.includes("w" + i)
              ? "transparent"
              : w[4] === "b"
                ? "#292723"
                : w[4] === "low"
                  ? "#b3ab9d"
                  : "#827a6e"
          }
          stroke={p.demolished.includes("w" + i) ? "#bd6043" : "#48433c"}
          strokeWidth={8}
          strokeDasharray={p.demolished.includes("w" + i) ? "40 30" : undefined}
          onClick={(e) => {
            if (tool === "demolish") {
              e.stopPropagation();
              onDemolish(i);
            }
          }}
        />
      ))}
      {[
        ...p.geometry.windows.map((r, i) => ({ id: "window-" + i, r })),
        ...p.geometry.slides.map((s) => ({ id: s.id, r: s.rect })),
        ...p.geometry.bayOpenings.map((r, i) => ({ id: "bay-" + i, r })),
      ].map(({ id, r }) => (
        <rect
          key={id}
          data-opening={layout && !id.startsWith("bay-") ? id : undefined}
          x={r[0]}
          y={r[1]}
          width={r[2] - r[0]}
          height={r[3] - r[1]}
          fill="#a8c7cb"
          fillOpacity={0.45}
          stroke={layout?.selectedOpening === id ? "#bf693f" : "#668f96"}
          strokeWidth={layout?.selectedOpening === id ? 45 : 15}
        />
      ))}
      {p.geometry.doors.map((d) => {
        const end: [number, number] = [
            d.h[0] + d.o[0] * d.len,
            d.h[1] + d.o[1] * d.len,
          ],
          closed: [number, number] = [
            d.h[0] + d.c[0] * d.len,
            d.h[1] + d.c[1] * d.len,
          ];
        const chosen = layout?.selectedOpening === d.id;
        return (
          <g
            key={d.id}
            data-opening={layout ? d.id : undefined}
            fill="none"
            stroke={chosen ? "#bf693f" : "#9c7753"}
            strokeWidth={chosen ? 32 : 20}
          >
            {layout && (
              <rect
                className="opening-hit"
                x={d.rect[0]}
                y={d.rect[1]}
                width={d.rect[2] - d.rect[0]}
                height={d.rect[3] - d.rect[1]}
                fill="#f4d9a0"
                fillOpacity={chosen ? 0.9 : 0.55}
                strokeWidth={chosen ? 30 : 8}
              />
            )}
            <path
              d={`M${closed.join(" ")} Q${closed[0] + d.o[0] * d.len} ${closed[1] + d.o[1] * d.len} ${end.join(" ")}`}
              strokeDasharray="40 25"
              strokeWidth={10}
            />
            <line x1={d.h[0]} y1={d.h[1]} x2={end[0]} y2={end[1]} />
          </g>
        );
      })}
      <g
        className={layout ? "furniture-locked" : undefined}
        pointerEvents={layout ? "none" : undefined}
      >
      {p.furniture.map((f) => (
        <g
          key={f.id}
          data-furniture={f.id}
          transform={`translate(${f.cx} ${f.cy}) rotate(${f.rot})`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(f.id, "furniture");
          }}
          onPointerDown={(e) => {
            if (tool !== "select" || e.button !== 0 || drag.current) return;
            e.stopPropagation();
            onSelect(f.id, "furniture");
            const start = local(e);
            drag.current = {
              id: f.id,
              start,
              cx: f.cx,
              cy: f.cy,
              last: start,
              pid: e.pointerId,
            };
            svgRef.current!.setPointerCapture(e.pointerId);
          }}
        >
          <g
            dangerouslySetInnerHTML={{
              __html: furnSVG(f.type, f.w, f.d, f.color),
            }}
          />
          {kind === "furniture" && selected === f.id && (
            <rect
              x={-f.w / 2 - 35}
              y={-f.d / 2 - 35}
              width={f.w + 70}
              height={f.d + 70}
              fill="none"
              stroke="#bf693f"
              strokeWidth={28}
            />
          )}
        </g>
      ))}
      </g>
      {p.geometry.rooms
        .filter((r) => r.counted !== false)
        .map((r) => {
          const box = bounds(r.poly),
            at = r.at ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
          return (
            <g key={r.id} pointerEvents="none">
              <text
                x={at[0]}
                y={at[1]}
                textAnchor="middle"
                className="room-label"
              >
                {roomLabel(p, r.id)}
              </text>
              {layout && (
                <text
                  x={at[0]}
                  y={at[1] + 260}
                  textAnchor="middle"
                  className="room-size"
                >
                  {isRectRoom(r)
                    ? `${box[2] - box[0]} × ${box[3] - box[1]}`
                    : `${area(r.poly).toFixed(1)} m²`}
                </text>
              )}
            </g>
          );
        })}
      {kind === "room" &&
        p.geometry.rooms
          .find((r) => r.id === selected)
          ?.poly.map((a, i, poly) => {
            const q = poly[(i + 1) % poly.length],
              length = Math.hypot(a[0] - q[0], a[1] - q[1]);
            return (
              <g key={i} pointerEvents="none">
                <text
                  x={(a[0] + q[0]) / 2 + (a[0] === q[0] ? 110 : 0)}
                  y={(a[1] + q[1]) / 2 + (a[1] === q[1] ? -100 : 0)}
                  textAnchor="middle"
                  className="dimension"
                >
                  {Math.round(length)} mm · {i + 1}
                </text>
              </g>
            );
          })}
      {kind === "room" &&
        tool === "select" &&
        (!layout || layout.tool === "select") &&
        base.geometry.rooms
          .filter((r) => !layout || isRectRoom(r))
          .find((r) => r.id === selected)
          ?.poly.map((a, i, poly) => {
            const q = poly[(i + 1) % poly.length],
              axis: 0 | 1 = a[0] === q[0] ? 0 : 1,
              active = edgeDrag?.roomId === selected && edgeDrag.index === i,
              box = bounds(poly),
              inward = (c: number, k: 0 | 1) =>
                (box[k] + box[k + 2]) / 2 > c ? 650 : -650;
            if (edgeDrag && !active) return null;
            const off = active ? edgeDrag!.delta : 0,
              blocked = active && !!edgeDrag!.error,
              p1: Point = [...a] as Point,
              p2: Point = [...q] as Point;
            p1[axis] += off;
            p2[axis] += off;
            const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
              half = Math.min(
                320,
                Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 0.2,
              ),
              g1: Point = [...mid] as Point,
              g2: Point = [...mid] as Point;
            g1[1 - axis] -= half;
            g2[1 - axis] += half;
            return (
              <g key={"edge-" + i}>
                <line
                  className="edge-hit"
                  data-edge-handle={i}
                  x1={p1[0]}
                  y1={p1[1]}
                  x2={p2[0]}
                  y2={p2[1]}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: axis === 0 ? "ew-resize" : "ns-resize" }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || drag.current || edge.current) return;
                    e.stopPropagation();
                    // A door or window under the handle takes the press: it is selected, not dragged.
                    const opening = layout
                      ? document
                          .elementsFromPoint(e.clientX, e.clientY)
                          .find((el) => el.closest("[data-opening]"))
                          ?.closest("[data-opening]")
                          ?.getAttribute("data-opening")
                      : null;
                    if (opening) {
                      layout!.onSelectOpening(opening);
                      return;
                    }
                    edge.current = {
                      roomId: selected!,
                      index: i,
                      axis,
                      start: local(e)[axis],
                      pid: e.pointerId,
                      delta: 0,
                      client: [e.clientX, e.clientY],
                      moved: false,
                    };
                    svgRef.current!.setPointerCapture(e.pointerId);
                  }}
                />
                <line
                  className="edge-grip-halo"
                  x1={g1[0]}
                  y1={g1[1]}
                  x2={g2[0]}
                  y2={g2[1]}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  className={"edge-grip" + (blocked ? " blocked" : "")}
                  x1={g1[0]}
                  y1={g1[1]}
                  x2={g2[0]}
                  y2={g2[1]}
                  vectorEffect="non-scaling-stroke"
                />
                {active && (
                  <text
                    className={"edge-badge" + (blocked ? " blocked" : "")}
                    // Inside the room and off the edge's own dimension label.
                    x={mid[0] + (axis === 0 ? inward(a[0], 0) : -half - 250)}
                    y={mid[1] + (axis === 1 ? inward(a[1], 1) : -half - 120)}
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    {(off > 0 ? "+" : off < 0 ? "−" : "±") +
                      Math.abs(off) +
                      " mm" +
                      (blocked ? " · bị chặn" : "")}
                  </text>
                )}
              </g>
            );
          })}
      {p.measures.map((m, i) => (
        <g key={i} stroke="#b65039" strokeWidth={12}>
          <line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} />
          <text
            x={(m.a[0] + m.b[0]) / 2}
            y={(m.a[1] + m.b[1]) / 2 - 70}
            stroke="none"
            className="dimension"
          >
            {Math.round(Math.hypot(m.a[0] - m.b[0], m.a[1] - m.b[1]))} mm
          </text>
        </g>
      ))}
      {measure && (
        <circle cx={measure[0]} cy={measure[1]} r={70} fill="#b65039" />
      )}
      {layout?.draft && (
        <g pointerEvents="none" className={"room-draft" + (layout.draftError ? " blocked" : "")}>
          <rect
            x={layout.draft[0]}
            y={layout.draft[1]}
            width={layout.draft[2] - layout.draft[0]}
            height={layout.draft[3] - layout.draft[1]}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={(layout.draft[0] + layout.draft[2]) / 2}
            y={(layout.draft[1] + layout.draft[3]) / 2}
            textAnchor="middle"
            className="dimension"
          >
            {layout.draft[2] - layout.draft[0]} × {layout.draft[3] - layout.draft[1]}
          </text>
        </g>
      )}
    </svg>
  );
}
