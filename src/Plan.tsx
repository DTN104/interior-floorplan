import { useRef, useState, useEffect } from "react";
import { Project, Point, names, bounds } from "./project";
import { furnSVG } from "./legacy-svg";
import { buildDefs } from "./legacy-defs";
type Props = {
  project: Project;
  selected: string | null;
  kind: "room" | "furniture";
  onSelect: (id: string, kind: "room" | "furniture") => void;
  onMove: (id: string, x: number, y: number, finished: boolean) => void;
  onMeasure: (a: Point, b: Point) => void;
  onDemolish: (i: number) => void;
  tool: "select" | "measure" | "demolish";
  grid: boolean;
  fitKey: number;
  svgRef: React.RefObject<SVGSVGElement>;
};
export function Plan({
  project: p,
  selected,
  kind,
  onSelect,
  onMove,
  onMeasure,
  onDemolish,
  tool,
  grid,
  fitKey,
  svgRef,
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
  const pan = useRef<{ start: Point; view: typeof view } | null>(null);
  const local = (e: { clientX: number; clientY: number }): Point => {
    const el = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      el.getScreenCTM()!.inverse(),
    );
    return [Math.round(pt.x), Math.round(pt.y)];
  };
  const finish = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    pan.current = null;
    if (d) {
      onMove(
        d.id,
        d.cx + d.last[0] - d.start[0],
        d.cy + d.last[1] - d.start[1],
        true,
      );
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  return (
    <svg
      ref={svgRef}
      className={"plan tool-" + tool}
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
        if (tool === "measure") {
          if (measure) {
            onMeasure(measure, at);
            setMeasure(null);
          } else setMeasure(at);
          return;
        }
        if (tool === "select" && !drag.current) {
          pan.current = { start: at, view };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        const at = local(e),
          d = drag.current;
        if (d) {
          d.last = at;
          onMove(
            d.id,
            d.cx + at[0] - d.start[0],
            d.cy + at[1] - d.start[1],
            false,
          );
        } else if (pan.current) {
          const old = pan.current;
          setView((v) => ({
            ...v,
            x: v.x + old.start[0] - at[0],
            y: v.y + old.start[1] - at[1],
          }));
        }
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
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
        <g
          key={r.id}
          onClick={() => tool === "select" && onSelect(r.id, "room")}
        >
          <polygon
            data-room={r.id}
            points={r.poly.map((p) => p.join(",")).join(" ")}
            fill={`url(#m-${p.rooms[r.id].mat})`}
            stroke={
              selected === r.id && kind === "room" ? "#bf693f" : "#d1c7b8"
            }
            strokeWidth={selected === r.id ? 35 : 10}
          />
        </g>
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
        ...p.geometry.windows,
        ...p.geometry.slides.map((s) => s.rect),
        ...p.geometry.bayOpenings,
      ].map((r, i) => (
        <rect
          key={i}
          x={r[0]}
          y={r[1]}
          width={r[2] - r[0]}
          height={r[3] - r[1]}
          fill="#a8c7cb"
          fillOpacity={0.45}
          stroke="#668f96"
          strokeWidth={15}
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
        return (
          <g key={d.id} fill="none" stroke="#9c7753" strokeWidth={20}>
            <path
              d={`M${closed.join(" ")} Q${closed[0] + d.o[0] * d.len} ${closed[1] + d.o[1] * d.len} ${end.join(" ")}`}
              strokeDasharray="40 25"
              strokeWidth={10}
            />
            <line x1={d.h[0]} y1={d.h[1]} x2={end[0]} y2={end[1]} />
          </g>
        );
      })}
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
            if (tool !== "select") return;
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
      {p.geometry.rooms
        .filter((r) => r.counted !== false)
        .map((r) => {
          const box = bounds(r.poly),
            at = r.at ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
          return (
            <text
              key={r.id}
              x={at[0]}
              y={at[1]}
              textAnchor="middle"
              className="room-label"
              pointerEvents="none"
            >
              {p.rooms[r.id].name === r.name
                ? (names[r.id] ?? r.name)
                : p.rooms[r.id].name}
            </text>
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
    </svg>
  );
}
