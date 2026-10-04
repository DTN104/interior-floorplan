import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  Component,
  ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
const Scene = React.lazy(() =>
  import("./Scene").then((m) => ({ default: m.Scene })),
);

import { Plan } from "./Plan";
import {
  Project,
  Furniture,
  Point,
  ResizeResult,
  clone,
  loadProject,
  importProject,
  STORAGE_KEY,
  area,
  bounds,
  names,
  materials,
  itemNames,
  resizeRoom,
  moveEdge,
  edgeTrack,
  furnitureWarnings,
  historyCommit,
  snapFurniture,
} from "./project";
import { LIB, MATS } from "./legacy-data";
import "./style.css";
class SceneBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="canvas-error">
        Trình duyệt không thể khởi tạo WebGL. Chuyển sang 2D để tiếp tục chỉnh
        bản vẽ.
      </div>
    ) : (
      this.props.children
    );
  }
}
function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={() => {
          const v = draft.trim() ? Number(draft) : NaN;
          if (Number.isFinite(v) && v >= min) onChange(v);
          else setDraft(String(value));
        }}
      />
    </label>
  );
}
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [history, setHistory] = useState(() => ({
      past: [] as Project[],
      present: loadProject(),
      future: [] as Project[],
    })),
    [preview, setPreview] = useState<ResizeResult | null>(null),
    [transient, setTransient] = useState<Project | null>(null),
    [selected, setSelected] = useState<string | null>("master"),
    [kind, setKind] = useState<"room" | "furniture">("room"),
    [mode, setMode] = useState<"2d" | "3d">("2d"),
    [tool, setTool] = useState<"select" | "measure" | "demolish">("select"),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("Đã lưu"),
    [search, setSearch] = useState(""),
    [fixed, setFixed] = useState<"min" | "max">("min"),
    [edge, setEdge] = useState(0),
    [delta, setDelta] = useState(100),
    [attached, setAttached] = useState(false),
    [night, setNight] = useState(false),
    [hour, setHour] = useState(10),
    [cut, setCut] = useState(true),
    [cameraMode, setCameraMode] = useState<"iso" | "top" | "walk">("iso"),
    [targetRoom, setTargetRoom] = useState<string | null>(null),
    [grid, setGrid] = useState(false),
    [fitKey, setFitKey] = useState(0),
    [libraryOpen, setLibraryOpen] = useState(false),
    [snap, setSnap] = useState(true);
  const exportReady = useCallback((fn: () => void) => {
    pngRef.current = fn;
  }, []);
  const p = history.present,
    display = preview?.project ?? transient ?? p,
    svgRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    pngRef = useRef<() => void>(() => {}),
    dragBase = useRef<Project | null>(null);
  const commit = useCallback((next: Project) => {
    setHistory((h) => historyCommit(h, next));
    setPreview(null);
    setTransient(null);
    setError("");
  }, []);
  const select = useCallback((id: string, k: "room" | "furniture") => {
    setSelected(id);
    setKind(k);
    setEdge(0);
    setPreview(null);
    setError("");
  }, []);
  const undo = useCallback(() => {
      setPreview(null);
      setTransient(null);
      setHistory((h) =>
        h.past.length
          ? {
              past: h.past.slice(0, -1),
              present: h.past[h.past.length - 1],
              future: [h.present, ...h.future],
            }
          : h,
      );
    }, []),
    redo = useCallback(() => {
      setPreview(null);
      setTransient(null);
      setHistory((h) =>
        h.future.length
          ? {
              past: [...h.past, h.present],
              present: h.future[0],
              future: h.future.slice(1),
            }
          : h,
      );
    }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      setSaveState("Đã lưu trên trình duyệt");
    } catch {
      setSaveState("Không thể autosave — hãy xuất JSON");
    }
  }, [p]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,select,textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") {
        setPreview(null);
        setTransient(null);
        setTool("select");
      }
      if (e.key.toLowerCase() === "t")
        setMode((m) => (m === "2d" ? "3d" : "2d"));
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [undo, redo]);
  const onMove = useCallback(
    (id: string, x: number, y: number, finished: boolean) => {
      if (preview) return;
      const base = dragBase.current ?? p;
      if (!dragBase.current) dragBase.current = base;
      const f = base.furniture.find((f) => f.id === id)!;
      const [cx, cy] = snap
        ? snapFurniture(base, f, x, y)
        : [Math.round(x / 10) * 10, Math.round(y / 10) * 10];
      const next = {
        ...base,
        furniture: base.furniture.map((f) =>
          f.id === id ? { ...f, cx, cy } : f,
        ),
      };
      if (finished) {
        dragBase.current = null;
        const f = base.furniture.find((f) => f.id === id)!,
          q = next.furniture.find((f) => f.id === id)!;
        if (f.cx !== q.cx || f.cy !== q.cy) commit(next);
        else setTransient(null);
      } else setTransient(next);
    },
    [p, preview, commit, snap],
  );
  const updateFurniture = (id: string, change: Partial<Furniture>) => {
    try {
      const next = {
        ...p,
        furniture: p.furniture.map((f) =>
          f.id === id ? { ...f, ...change } : f,
        ),
      };
      importProject(next);
      commit(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Thông số nội thất không hợp lệ.",
      );
    }
  };
  const room = p.geometry.rooms.find((r) => r.id === selected),
    furniture = p.furniture.find((f) => f.id === selected),
    box = room && bounds(room.poly),
    warnings = useMemo(() => furnitureWarnings(display), [display]);
  const cost = display.geometry.rooms
      .filter((r) => r.counted !== false)
      .reduce(
        (s, r) =>
          s +
          area(r.poly) * (MATS as any)[display.rooms[r.id].mat].price * 1.05,
        0,
      ),
    total = display.geometry.rooms
      .filter((r) => r.counted !== false)
      .reduce((s, r) => s + area(r.poly), 0);
  const attempt = (fn: () => ResizeResult) => {
    try {
      setPreview(fn());
      setError("");
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Không thể chỉnh geometry.");
    }
  };
  const add = (item: (string | number)[]) => {
    const id = crypto.randomUUID(),
      f: Furniture = {
        id,
        type: String(item[0]),
        name: String(item[1]),
        w: Number(item[2]),
        d: Number(item[3]),
        color: String(item[4]),
        cx: box ? (box[0] + box[2]) / 2 : 7600,
        cy: box ? (box[1] + box[3]) / 2 : 8500,
        rot: 0,
        modelSeed: Math.round(
          Number(item[2]) * 7 + Number(item[3]) * 13 + 7600 + 8500,
        ),
      };
    commit({ ...p, furniture: [...p.furniture, f] });
    select(id, "furniture");
    setLibraryOpen(false);
  };
  const exportPng = () => {
    if (mode === "3d") {
      pngRef.current();
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "1800");
    copy.setAttribute("height", "1600");
    const style = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style",
    );
    style.textContent =
      ".room-label{font:180px sans-serif;fill:#40392f}.dimension{font:130px sans-serif;fill:#a55732}";
    copy.prepend(style);
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], {
        type: "image/svg+xml",
      }),
      url = URL.createObjectURL(blob),
      img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1800;
      c.height = 1600;
      c.getContext("2d")!.drawImage(img, 0, 0);
      c.toBlob((b) => {
        if (b) download("ban-ve-2d.png", b);
      });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Không thể xuất ảnh 2D.");
    };
    img.src = url;
  };
  return (
    <div className="app">
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">⌑</span>
          <div>
            <b>
              nhà<span> / studio</span>
            </b>
            <small>BẢN VẼ & NỘI THẤT</small>
          </div>
        </a>
        <div className="mode-tabs">
          <button
            className={mode === "2d" ? "active" : ""}
            onClick={() => setMode("2d")}
          >
            Bản vẽ 2D
          </button>
          <button
            className={mode === "3d" ? "active" : ""}
            onClick={() => setMode("3d")}
          >
            Không gian 3D
          </button>
        </div>
        <div className="header-actions">
          <button
            disabled={!history.past.length}
            onClick={undo}
            title="Hoàn tác Ctrl+Z"
          >
            ↶ <span>Hoàn tác</span>
          </button>
          <button
            disabled={!history.future.length}
            onClick={redo}
            title="Làm lại"
          >
            ↷
          </button>
          <button onClick={() => fileRef.current?.click()}>Nhập JSON</button>
          <button onClick={exportPng}>Ảnh PNG</button>
          <button
            className="primary"
            onClick={() =>
              download(
                "noi-that-v2.json",
                new Blob([JSON.stringify(display, null, 2)], {
                  type: "application/json",
                }),
              )
            }
          >
            Xuất phương án ↗
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 8 * 1024 * 1024)
                throw Error("File không được vượt 8 MB.");
              const next = importProject(JSON.parse(await file.text()));
              commit(next);
              select(next.geometry.rooms[0].id, "room");
              setFitKey((k) => k + 1);
            } catch (e) {
              setError(e instanceof Error ? e.message : "File không hợp lệ.");
            } finally {
              if (fileRef.current) fileRef.current.value = "";
            }
          }}
        />
      </header>
      <aside className={"library " + (libraryOpen ? "open" : "")}>
        <div className="aside-title">
          <div>
            <small>BỘ SƯU TẬP GỐC</small>
            <h2>Nội thất</h2>
          </div>
          <span className="badge">60</span>
        </div>
        <input
          className="search"
          placeholder="Tìm loại nội thất…"
          aria-label="Tìm nội thất"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {LIB.map((c, ci) => (
          <section key={c.cat}>
            <h3>
              {
                [
                  "Phòng ngủ",
                  "Phòng khách",
                  "Bếp & phòng ăn",
                  "Phòng tắm",
                  "Thiết bị",
                  "Làm việc & thư giãn",
                ][ci]
              }
            </h3>
            <div className="library-grid">
              {c.items
                .filter((i) =>
                  (itemNames[String(i[0])] ?? String(i[1]))
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((i, index) => (
                  <button
                    key={index}
                    className="library-item"
                    onClick={() => add(i)}
                    title={String(i[1])}
                  >
                    <svg
                      viewBox={`${-Number(i[2]) * 0.65} ${-Number(i[3]) * 0.65} ${Number(i[2]) * 1.3} ${Number(i[3]) * 1.3}`}
                      dangerouslySetInnerHTML={{ __html: furnSVGIcon(i) }}
                    />
                    <b>{itemNames[String(i[0])] ?? i[0]}</b>
                    <small>
                      {i[2]} × {i[3]}
                    </small>
                  </button>
                ))}
            </div>
          </section>
        ))}
        <a
          href="/legacy/index.html"
          target="_blank"
          rel="noreferrer"
          className="legacy-link"
        >
          Mở bản gốc ↗
        </a>
      </aside>
      <main>
        <div className="canvas-toolbar">
          <button
            className="mobile-library"
            onClick={() => setLibraryOpen((v) => !v)}
          >
            ＋ Nội thất
          </button>
          {mode === "2d" ? (
            <>
              <button
                className={tool === "select" ? "active" : ""}
                onClick={() => setTool("select")}
              >
                ↖ Chọn
              </button>
              <button
                className={tool === "measure" ? "active" : ""}
                onClick={() => setTool("measure")}
              >
                ↔ Đo
              </button>
              <button
                className={tool === "demolish" ? "active" : ""}
                onClick={() => setTool("demolish")}
              >
                Tường
              </button>
              <button
                className={snap ? "active" : ""}
                onClick={() => setSnap((v) => !v)}
              >
                Bám tường
              </button>
              <button
                onClick={() => setGrid((v) => !v)}
                className={grid ? "active" : ""}
              >
                Lưới
              </button>
              <button onClick={() => setFitKey((k) => k + 1)}>Vừa khung</button>
            </>
          ) : (
            <>
              <button
                className={cameraMode === "iso" ? "active" : ""}
                onClick={() => setCameraMode("iso")}
              >
                Phối cảnh
              </button>
              <button
                className={cameraMode === "top" ? "active" : ""}
                onClick={() => setCameraMode("top")}
              >
                Nhìn từ trên
              </button>
              <button
                className={cameraMode === "walk" ? "active" : ""}
                onClick={() => setCameraMode("walk")}
              >
                Đi bộ
              </button>
              <button onClick={() => setCut((v) => !v)}>
                {cut ? "Tường thấp" : "Tường đầy đủ"}
              </button>
              <button onClick={() => setNight((v) => !v)}>
                {night ? "☾ Đêm" : "☀ Ngày"}
              </button>
              <input
                aria-label="Giờ nắng"
                title="Giờ nắng"
                type="range"
                min="6"
                max="18"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              />
            </>
          )}
        </div>
        <div className="viewport">
          {mode === "2d" ? (
            <Plan
              project={display}
              selected={selected}
              kind={kind}
              onSelect={select}
              onMove={onMove}
              onMeasure={(a: Point, b: Point) =>
                commit({ ...p, measures: [...p.measures, { a, b }] })
              }
              onDemolish={(i) => {
                const w = p.geometry.walls[i];
                if (w[4] === "b" || w[4] === "e") {
                  setError("Tường chịu lực và tường ngoài không được phá.");
                  return;
                }
                const id = "w" + i;
                commit({
                  ...p,
                  demolished: p.demolished.includes(id)
                    ? p.demolished.filter((k) => k !== id)
                    : [...p.demolished, id],
                });
              }}
              tool={tool}
              grid={grid}
              fitKey={fitKey}
              svgRef={svgRef}
            />
          ) : (
            <SceneBoundary>
              <React.Suspense
                fallback={
                  <div className="canvas-error">Đang tải không gian 3D…</div>
                }
              >
                <Scene
                  project={display}
                  selected={selected}
                  onSelect={select}
                  onMove={onMove}
                  night={night}
                  hour={hour}
                  cut={cut}
                  cameraMode={cameraMode}
                  targetRoom={targetRoom}
                  onExportReady={exportReady}
                />
              </React.Suspense>
            </SceneBoundary>
          )}
        </div>
        <div className="canvas-caption">
          <span>
            {preview
              ? "ĐANG XEM TRƯỚC · CHƯA LƯU"
              : "CĂN HỘ MẶC ĐỊNH · ĐƠN VỊ MM"}
          </span>
          <small>
            {mode === "2d"
              ? "Kéo nội thất · Cuộn để zoom · Kéo nền để di chuyển"
              : "Kéo nội thất · Kéo nền để xoay · Cuộn để zoom"}
          </small>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {preview && (
          <div className="preview-card">
            <div>
              <b>Xem trước thay đổi</b>
              <p>
                {preview.affected
                  .map(
                    (id) =>
                      `${names[id] ?? id}: ${area(p.geometry.rooms.find((r) => r.id === id)!.poly).toFixed(2)} → ${area(preview.project.geometry.rooms.find((r) => r.id === id)!.poly).toFixed(2)} m²`,
                  )
                  .join(" · ")}
              </p>
              <small>
                {preview.warnings.length} món cần kiểm tra vị trí · kích thước
                nội thất được giữ nguyên
              </small>
            </div>
            <button onClick={() => setPreview(null)}>Hủy</button>
            <button className="primary" onClick={() => commit(preview.project)}>
              Áp dụng
            </button>
          </div>
        )}
      </main>
      <aside className="inspector">
        <div className="aside-title">
          <div>
            <small>THÔNG TIN PHƯƠNG ÁN</small>
            <h2>Chi tiết</h2>
          </div>
          <span className="dot" />
        </div>
        <section>
          <label>
            Chọn phòng
            <select
              aria-label="Chọn phòng"
              value={kind === "room" ? (selected ?? "") : ""}
              onChange={(e) => {
                select(e.target.value, "room");
                setTargetRoom(e.target.value);
              }}
            >
              <option value="" disabled>
                Chọn phòng…
              </option>
              {p.geometry.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {p.rooms[r.id].name === r.name
                    ? (names[r.id] ?? r.name)
                    : p.rooms[r.id].name}
                </option>
              ))}
            </select>
          </label>
        </section>
        {kind === "room" && room && box && (
          <>
            <section>
              <h3>Phòng đang chọn</h3>
              <label>
                Tên phòng
                <input
                  key={room.id}
                  maxLength={200}
                  defaultValue={
                    p.rooms[room.id].name === room.name
                      ? (names[room.id] ?? room.name)
                      : p.rooms[room.id].name
                  }
                  onBlur={(e) => {
                    if (e.target.value.trim())
                      commit({
                        ...p,
                        rooms: {
                          ...p.rooms,
                          [room.id]: {
                            ...p.rooms[room.id],
                            name: e.target.value.trim(),
                          },
                        },
                      });
                  }}
                />
              </label>
              <label>
                Vật liệu sàn
                <select
                  aria-label="Vật liệu sàn"
                  value={p.rooms[room.id].mat}
                  onChange={(e) =>
                    commit({
                      ...p,
                      rooms: {
                        ...p.rooms,
                        [room.id]: { ...p.rooms[room.id], mat: e.target.value },
                      },
                    })
                  }
                >
                  {Object.keys(MATS).map((k) => (
                    <option key={k} value={k}>
                      {materials[k]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="metric">
                <span>
                  Diện tích
                  {room.counted === false ? " (không tính sử dụng)" : ""}
                </span>
                <b>
                  {area(
                    (
                      preview?.project.geometry.rooms.find(
                        (r) => r.id === room.id,
                      ) ?? room
                    ).poly,
                  ).toFixed(2)}{" "}
                  <small>m²</small>
                </b>
              </div>
            </section>
            <section>
              <h3>
                Chỉnh hình học <span>mm</span>
              </h3>
              {room.poly.length === 4 ? (
                <>
                  <label>
                    Cạnh giữ cố định
                    <select
                      aria-label="Cạnh giữ cố định"
                      value={fixed}
                      onChange={(e) =>
                        setFixed(e.target.value as "min" | "max")
                      }
                    >
                      <option value="min">Trái / trên</option>
                      <option value="max">Phải / dưới</option>
                    </select>
                  </label>
                  <div className="two-fields">
                    <NumberField
                      label="Chiều rộng"
                      value={box[2] - box[0]}
                      min={100}
                      onChange={(v) =>
                        attempt(() =>
                          resizeRoom(p, room.id, 0, v, fixed, attached),
                        )
                      }
                    />
                    <NumberField
                      label="Chiều sâu"
                      value={box[3] - box[1]}
                      min={100}
                      onChange={(v) =>
                        attempt(() =>
                          resizeRoom(p, room.id, 1, v, fixed, attached),
                        )
                      }
                    />
                  </div>
                  <small className="help">
                    Nhập kích thước rồi Enter hoặc rời ô để xem trước.
                  </small>
                </>
              ) : (
                <p className="help">
                  Phòng này có polygon lõm. Chọn cạnh và khoảng dịch chuyển thay
                  vì chiều rộng/sâu.
                </p>
              )}
              <label>
                Cạnh cần dịch
                <select
                  aria-label="Cạnh cần dịch"
                  value={edge}
                  onChange={(e) => setEdge(Number(e.target.value))}
                >
                  {room.poly.map((v, i) => (
                    <option key={i} value={i}>
                      Cạnh {i + 1} ·{" "}
                      {Math.round(
                        Math.hypot(
                          v[0] - room.poly[(i + 1) % room.poly.length][0],
                          v[1] - room.poly[(i + 1) % room.poly.length][1],
                        ),
                      )}{" "}
                      mm
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Dịch cạnh (+ phải/xuống)"
                value={delta}
                min={-10000}
                onChange={setDelta}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={attached}
                  onChange={(e) => setAttached(e.target.checked)}
                />
                Di chuyển đồ đã gắn với tường
              </label>
              <button
                className="wide"
                onClick={() =>
                  attempt(() => moveEdge(p, room.id, edge, delta, attached))
                }
              >
                Xem trước dịch cạnh →
              </button>
              <small className="help">
                Thay đổi bản vẽ kích thước thực tế. Tường chịu lực vẫn bị khóa
                trong công cụ phá tường.
              </small>
            </section>
            <section>
              <h3>Cửa trên cạnh đã chọn</h3>
              {(() => {
                const t = edgeTrack(p.geometry, room, edge);
                const openings = t
                  ? [
                      ...p.geometry.doors,
                      ...p.geometry.slides,
                      ...p.geometry.windowAttachments.map((a, i) => ({
                        ...a,
                        id: "window-" + i,
                        name: "Cửa sổ " + (i + 1),
                      })),
                    ].filter((a) => a.wallId === t.id)
                  : [];
                return openings.length ? (
                  openings.map((o) => (
                    <label key={o.id}>
                      {o.id.startsWith("door-")
                        ? [
                            "Cửa phòng trẻ",
                            "Cửa phòng chính",
                            "Cửa WC chính",
                            "Cửa WC chung",
                            "Cửa phòng con",
                            "Cửa vào",
                          ][Number(o.id.slice(5))]
                        : o.id.startsWith("window-")
                          ? "Cửa sổ " + (Number(o.id.slice(7)) + 1)
                          : "Cửa trượt"}{" "}
                      · {o.width} mm
                      <select
                        aria-label={"Neo " + o.id}
                        value={o.anchor}
                        onChange={(e) => {
                          const next = clone(p),
                            anchor = e.target.value as
                              | "start"
                              | "end"
                              | "center";
                          const item = o.id.startsWith("window-")
                            ? next.geometry.windowAttachments[
                                Number(o.id.slice(7))
                              ]
                            : [
                                ...next.geometry.doors,
                                ...next.geometry.slides,
                              ].find((a) => a.id === o.id)!;
                          item.anchor = anchor;
                          commit(next);
                        }}
                      >
                        <option value="start">Neo đầu tường</option>
                        <option value="end">Neo cuối tường</option>
                        <option value="center">Neo giữa tường</option>
                      </select>
                    </label>
                  ))
                ) : (
                  <p className="help">Cạnh này không có cửa được gắn.</p>
                );
              })()}
            </section>
          </>
        )}
        {kind === "furniture" && furniture && (
          <section>
            <h3>{itemNames[furniture.type] ?? furniture.name}</h3>
            <label>
              Tên
              <input
                key={furniture.id}
                maxLength={200}
                defaultValue={furniture.name}
                onBlur={(e) =>
                  updateFurniture(furniture.id, { name: e.target.value })
                }
              />
            </label>
            <div className="two-fields">
              <NumberField
                label="Rộng (mm)"
                value={furniture.w}
                min={10}
                onChange={(w) => updateFurniture(furniture.id, { w })}
              />
              <NumberField
                label="Sâu (mm)"
                value={furniture.d}
                min={10}
                onChange={(d) => updateFurniture(furniture.id, { d })}
              />
              <NumberField
                label="X (mm)"
                value={furniture.cx}
                min={-10000}
                onChange={(cx) => updateFurniture(furniture.id, { cx })}
              />
              <NumberField
                label="Y (mm)"
                value={furniture.cy}
                min={-10000}
                onChange={(cy) => updateFurniture(furniture.id, { cy })}
              />
            </div>
            <NumberField
              label="Góc xoay (°)"
              value={furniture.rot}
              min={-3600}
              onChange={(rot) => updateFurniture(furniture.id, { rot })}
            />
            <label>
              Màu
              <input
                type="color"
                value={furniture.color}
                onChange={(e) =>
                  updateFurniture(furniture.id, { color: e.target.value })
                }
              />
            </label>
            <label>
              Gắn phòng / tường
              <select
                value={furniture.placement?.roomId ?? ""}
                onChange={(e) =>
                  updateFurniture(furniture.id, {
                    placement: e.target.value
                      ? { roomId: e.target.value }
                      : undefined,
                  })
                }
              >
                <option value="">Giữ vị trí tuyệt đối</option>
                {p.geometry.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {names[r.id] ?? r.name}
                  </option>
                ))}
              </select>
            </label>
            {furniture.placement && (
              <label>
                Tường đi theo khi được chọn
                <select
                  value={furniture.placement.wallId ?? ""}
                  onChange={(e) =>
                    updateFurniture(furniture.id, {
                      placement: {
                        ...furniture.placement!,
                        wallId: e.target.value || undefined,
                      },
                    })
                  }
                >
                  <option value="">Không gắn tường</option>
                  {p.geometry.rooms
                    .find((r) => r.id === furniture.placement!.roomId)
                    ?.boundary?.map(
                      (b, i) =>
                        b.wallId && (
                          <option key={i} value={b.wallId}>
                            Cạnh {i + 1} · {b.wallId}
                          </option>
                        ),
                    )}
                </select>
              </label>
            )}
            <div className="two-fields">
              <button
                onClick={() => {
                  const f = {
                    ...furniture,
                    id: crypto.randomUUID(),
                    cx: furniture.cx + 100,
                    cy: furniture.cy + 100,
                  };
                  commit({ ...p, furniture: [...p.furniture, f] });
                  select(f.id, "furniture");
                }}
              >
                Nhân bản
              </button>
              <button
                className="danger"
                onClick={() => {
                  commit({
                    ...p,
                    furniture: p.furniture.filter((f) => f.id !== furniture.id),
                  });
                  select("master", "room");
                }}
              >
                Xóa món
              </button>
            </div>
            {warnings.includes(furniture.id) && (
              <p className="warning">
                Món này vượt phòng hoặc chạm tường. Kích thước vẫn được giữ
                nguyên.
              </p>
            )}
          </section>
        )}
        <section>
          <h3>Tổng quan</h3>
          <div className="metric">
            <span>Diện tích sử dụng</span>
            <b>
              {total.toFixed(2)} <small>m²</small>
            </b>
          </div>
          <div className="metric">
            <span>Vật liệu + hao hụt 5%</span>
            <b>¥{Math.round(cost).toLocaleString()}</b>
          </div>
          <small className="help">Đơn giá gốc bằng nhân dân tệ (¥).</small>
          <div className="metric">
            <span>Nội thất</span>
            <b>{display.furniture.length}</b>
          </div>
          {warnings.length > 0 && (
            <details className="warning">
              <summary>{warnings.length} món cần kiểm tra vị trí</summary>
              {warnings.map((id) => {
                const f = display.furniture.find((f) => f.id === id)!;
                return (
                  <button
                    key={id}
                    className="warning-item"
                    onClick={() => select(id, "furniture")}
                  >
                    {itemNames[f.type] ?? f.name} · {Math.round(f.cx)},{" "}
                    {Math.round(f.cy)}
                  </button>
                );
              })}
            </details>
          )}
          {p.measures.length > 0 && (
            <button
              className="wide"
              onClick={() => commit({ ...p, measures: [] })}
            >
              Xóa phép đo ({p.measures.length})
            </button>
          )}
        </section>
      </aside>
      <footer>
        <span className="save-dot" />
        {saveState}
        <span className="footer-right">
          SVG 2D / THREE.JS r160 <span>·</span> {history.past.length} thao tác
        </span>
      </footer>
    </div>
  );
}
import { furnSVG } from "./legacy-svg";
const furnSVGIcon = (i: (string | number)[]) =>
  furnSVG(String(i[0]), Number(i[2]), Number(i[3]), String(i[4]));
createRoot(document.getElementById("root")!).render(<App />);
