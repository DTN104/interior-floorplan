// Inspector sections for drawn plans and the template dialog.
import { useEffect, useMemo, useRef, useState } from "react";
import { NumberField } from "./fields";
import {
  Project,
  Rect,
  bounds,
  roomLabel,
  openingName,
  DEFAULT_CEILING,
} from "./project";
import {
  LayoutResult,
  OpeningKind,
  Side,
  MIN_ROOM,
  MIN_OPENING,
  readOpenings,
  roomEdges,
  sideAxis,
  sideDir,
  neighbours,
  isRectRoom,
  setRoomRect,
  moveRoom,
  addRoom,
  deleteRoom,
  mergeRooms,
  toggleWall,
  updateOpening,
  removeOpening,
  setLayoutSettings,
  addOpening,
} from "./layout";
import {
  BUILTIN_TEMPLATES,
  SavedTemplate,
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  instantiate,
  usableArea,
} from "./templates";

export type LayoutRun = (
  fn: () => LayoutResult,
  after?: (r: LayoutResult) => void,
) => void;
const sideNames: Record<Side, string> = {
  n: "trên",
  s: "dưới",
  w: "trái",
  e: "phải",
};

export function LayoutSettingsSection({ p, run }: { p: Project; run: LayoutRun }) {
  const s = p.geometry.layout!;
  return (
    <section>
      <h3>
        Bố cục mặt bằng <span>mm</span>
      </h3>
      <small className="help">
        Kích thước phòng là thông thủy. Kéo trên bản vẽ để vẽ phòng. Đặt cách
        phòng bên cạnh đúng độ dày vách để có vách chung, đặt sát để thông
        nhau; tường được vẽ lại tự động.
      </small>
      <div className="two-fields">
        <NumberField
          label="Tường ngoài"
          value={s.exterior}
          min={100}
          onChange={(v) => run(() => setLayoutSettings(p, { exterior: v }))}
        />
        <NumberField
          label="Vách mới"
          value={s.partition}
          min={50}
          onChange={(v) => run(() => setLayoutSettings(p, { partition: v }))}
        />
      </div>
      <NumberField
        label="Chiều cao trần"
        value={p.geometry.ceiling ?? DEFAULT_CEILING}
        min={2200}
        onChange={(v) => run(() => setLayoutSettings(p, { ceiling: v }))}
      />
    </section>
  );
}

export function LayoutRoomSection({
  p,
  roomId,
  run,
  onSelect,
}: {
  p: Project;
  roomId: string;
  run: LayoutRun;
  onSelect: (id: string, kind: "room" | "opening") => void;
}) {
  const room = p.geometry.rooms.find((r) => r.id === roomId)!,
    b = bounds(room.poly),
    near = neighbours(p, roomId),
    settings = p.geometry.layout!,
    faces = roomEdges(room),
    rect = isRectRoom(room);
  const [side, setSide] = useState<Side>("e"),
    [w, setW] = useState(3000),
    [h, setH] = useState(3000),
    [wall, setWall] = useState(true),
    [newKind, setNewKind] = useState<OpeningKind>("door"),
    [faceIndex, setFaceIndex] = useState(0);
  // Openings on this room's faces, whichever room they belong to (keyboard access to the opening panel).
  const openings = readOpenings(p).filter(
    (o) =>
      o.room === roomId ||
      faces.some(
        (f) =>
          sideAxis(f.side) === sideAxis(o.side) &&
          f.line === o.far &&
          f.s0 <= o.start &&
          o.start + o.width <= f.s1,
      ),
  );
  const faceName = (i: number) => {
    const f = faces[i];
    return `${rect ? "Cạnh " + sideNames[f.side] : `Cạnh ${i + 1} (${sideNames[f.side]})`} · ${f.s1 - f.s0} mm`;
  };
  const face = faces[Math.min(faceIndex, faces.length - 1)];
  const addNext = () => {
    const gap = wall ? settings.partition : 0,
      r: Rect =
        side === "e"
          ? [b[2] + gap, b[1], b[2] + gap + w, b[1] + h]
          : side === "w"
            ? [b[0] - gap - w, b[1], b[0] - gap, b[1] + h]
            : side === "s"
              ? [b[0], b[3] + gap, b[0] + w, b[3] + gap + h]
              : [b[0], b[1] - gap - h, b[0] + w, b[1] - gap];
    run(
      () => addRoom(p, r),
      (res) => onSelect(res.id!, "room"),
    );
  };
  return (
    <>
      <section>
        <h3>
          Kích thước & vị trí <span>thông thủy</span>
        </h3>
        {isRectRoom(room) ? (
          <div className="two-fields">
            <NumberField
              label="Rộng"
              value={b[2] - b[0]}
              min={MIN_ROOM}
              onChange={(v) =>
                run(() => setRoomRect(p, roomId, [b[0], b[1], b[0] + v, b[3]]))
              }
            />
            <NumberField
              label="Sâu"
              value={b[3] - b[1]}
              min={MIN_ROOM}
              onChange={(v) =>
                run(() => setRoomRect(p, roomId, [b[0], b[1], b[2], b[1] + v]))
              }
            />
            <NumberField
              label="X"
              value={b[0]}
              min={-90000}
              onChange={(v) => run(() => moveRoom(p, roomId, v - b[0], 0))}
            />
            <NumberField
              label="Y"
              value={b[1]}
              min={-90000}
              onChange={(v) => run(() => moveRoom(p, roomId, 0, v - b[1]))}
            />
          </div>
        ) : (
          <p className="help">
            Phòng chữ L/U: kéo cả phòng để di chuyển. Kéo từng cạnh ở chế độ
            thường (nút Xong).
          </p>
        )}
        <small className="help">
          Chỉ phòng này thay đổi; tường được vẽ lại. Kéo phòng đang chọn hoặc
          tay nắm cạnh trên bản vẽ — phòng tự hít vào phòng bên cạnh.
        </small>
      </section>
      <section>
        <h3>Cửa của phòng</h3>
        {openings.length ? (
          openings.map((o) => (
            <button
              key={o.id}
              className="opening-item"
              onClick={() => onSelect(o.id, "opening")}
            >
              {openingName(p, o.id)} · {o.width} mm · cạnh{" "}
              {o.room === roomId ? sideNames[o.side] : "giáp " + roomLabel(p, o.room)}
            </button>
          ))
        ) : (
          <p className="help">Phòng này chưa có cửa.</p>
        )}
        <div className="two-fields">
          <label>
            Loại
            <select
              aria-label="Loại cửa thêm mới"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as OpeningKind)}
            >
              <option value="door">Cửa đi</option>
              <option value="window">Cửa sổ</option>
              <option value="slide">Cửa trượt</option>
            </select>
          </label>
          <label>
            Trên cạnh
            <select
              aria-label="Cạnh đặt cửa"
              value={Math.min(faceIndex, faces.length - 1)}
              onChange={(e) => setFaceIndex(Number(e.target.value))}
            >
              {faces.map((_, i) => (
                <option key={i} value={i}>
                  {faceName(i)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="wide"
          onClick={() =>
            run(
              () => addOpening(p, newKind, face, (face.s0 + face.s1) / 2),
              (r) => onSelect(r.id!, "opening"),
            )
          }
        >
          ＋ Thêm vào giữa cạnh
        </button>
        <small className="help">
          Hoặc chọn công cụ Cửa đi / Cửa sổ / Cửa trượt rồi bấm lên tường.
        </small>
      </section>
      <section>
        <h3>Thêm phòng bên cạnh</h3>
        <div className="two-fields">
          <label>
            Phía
            <select
              aria-label="Phía thêm phòng"
              value={side}
              onChange={(e) => setSide(e.target.value as Side)}
            >
              <option value="e">Phải</option>
              <option value="w">Trái</option>
              <option value="s">Dưới</option>
              <option value="n">Trên</option>
            </select>
          </label>
          <label>
            Ngăn cách
            <select
              aria-label="Ngăn cách với phòng mới"
              value={wall ? "wall" : "open"}
              onChange={(e) => setWall(e.target.value === "wall")}
            >
              <option value="wall">Có vách</option>
              <option value="open">Thông nhau</option>
            </select>
          </label>
          <NumberField label="Rộng mới" value={w} min={MIN_ROOM} onChange={setW} />
          <NumberField label="Sâu mới" value={h} min={MIN_ROOM} onChange={setH} />
        </div>
        <button className="wide" onClick={addNext}>
          ＋ Thêm phòng
        </button>
      </section>
      {near.length > 0 && (
        <section>
          <h3>Phòng kề bên</h3>
          {near.map((n) => (
            <div key={n.id} className="neighbour">
              <span>
                {roomLabel(p, n.id)}
                <small>{n.gap ? ` · vách ${n.gap} mm` : " · thông nhau"}</small>
              </span>
              <button
                onClick={() => run(() => toggleWall(p, roomId, n.id))}
                title={
                  n.gap
                    ? "Bỏ vách: phần tường thuộc về phòng đang chọn"
                    : "Thêm vách: lấy từ phòng đang chọn"
                }
              >
                {n.gap ? "Bỏ vách" : "Thêm vách"}
              </button>
              <button
                onClick={() => run(() => mergeRooms(p, roomId, n.id))}
                title="Gộp thành một phòng, giữ tên phòng đang chọn"
              >
                Gộp
              </button>
            </div>
          ))}
          <small className="help">
            Bỏ vách: phần tường nhập vào phòng đang chọn, hai phòng vẫn giữ loại
            sàn riêng. Gộp: thành một phòng, giữ tên phòng đang chọn.
          </small>
        </section>
      )}
      <section>
        <button
          className="wide danger"
          onClick={() =>
            run(
              () => deleteRoom(p, roomId),
              (res) => onSelect(res.project.geometry.rooms[0].id, "room"),
            )
          }
        >
          Xóa phòng
        </button>
      </section>
    </>
  );
}

export function OpeningSection({
  p,
  id,
  run,
  onDone,
}: {
  p: Project;
  id: string;
  run: LayoutRun;
  onDone: () => void;
}) {
  const o = readOpenings(p).find((o) => o.id === id);
  if (!o)
    return (
      <section>
        <p className="help">Cửa này không còn trên mặt bằng.</p>
      </section>
    );
  const host = p.geometry.rooms.find((r) => r.id === o.room)!,
    face = roomEdges(host).find(
      (e) =>
        e.side === o.side &&
        e.line === o.line &&
        e.s0 <= o.start &&
        o.start + o.width <= e.s1,
    ),
    axis = sideAxis(o.side),
    across =
      o.far !== undefined &&
      p.geometry.rooms
        .filter((r) => r.id !== o.room)
        .find((r) =>
          roomEdges(r).some(
            (e) =>
              sideAxis(e.side) === axis &&
              e.line === o.far &&
              sideDir(e.side) === -sideDir(o.side) &&
              e.s0 <= o.start &&
              o.start + o.width <= e.s1,
          ),
        ),
    kindName =
      o.kind === "door" ? "cửa" : o.kind === "window" ? "cửa sổ" : "cửa trượt";
  return (
    <section>
      <h3>{openingName(p, id)}</h3>
      <p className="help">
        Trên cạnh {sideNames[o.side]} của {roomLabel(p, o.room)}
        {face ? ` (cạnh dài ${face.s1 - face.s0} mm)` : ""}
        {across ? `, giáp ${roomLabel(p, across.id)}` : ", tường ngoài"}.
      </p>
      {o.kind === "door" && (
        <label>
          Tên cửa
          <input
            key={id}
            maxLength={200}
            defaultValue={o.name ?? ""}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== o.name)
                run(() => updateOpening(p, id, { name }));
            }}
          />
        </label>
      )}
      <div className="two-fields">
        <NumberField
          label="Rộng"
          value={o.width}
          min={MIN_OPENING}
          onChange={(v) => run(() => updateOpening(p, id, { width: v }))}
        />
        <NumberField
          label="Cách đầu cạnh"
          value={face ? o.start - face.s0 : 0}
          onChange={(v) =>
            face && run(() => updateOpening(p, id, { start: face.s0 + v }))
          }
        />
        {o.kind === "window" && (
          <>
            <NumberField
              label="Bậu"
              value={o.sill ?? 900}
              onChange={(v) => run(() => updateOpening(p, id, { sill: v }))}
            />
            <NumberField
              label="Đỉnh"
              value={o.head ?? 2400}
              min={200}
              onChange={(v) => run(() => updateOpening(p, id, { head: v }))}
            />
          </>
        )}
      </div>
      {o.kind === "door" && (
        <>
          <p className="help">
            Mở vào{" "}
            {o.swingIn
              ? roomLabel(p, o.room)
              : across
                ? roomLabel(p, across.id)
                : "phía ngoài"}
            , bản lề ở đầu {o.hingeAtStart ? (axis === 1 ? "trái" : "trên") : axis === 1 ? "phải" : "dưới"}.
          </p>
          <div className="two-fields">
            <button
              onClick={() =>
                run(() => updateOpening(p, id, { hingeAtStart: !o.hingeAtStart }))
              }
            >
              Đổi bên bản lề
            </button>
            <button
              onClick={() =>
                run(() => updateOpening(p, id, { swingIn: !o.swingIn }))
              }
            >
              Đổi chiều mở
            </button>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!o.entry}
              onChange={(e) =>
                run(() => updateOpening(p, id, { entry: e.target.checked }))
              }
            />
            Cửa vào căn hộ
          </label>
        </>
      )}
      <button
        className="wide danger"
        onClick={() => run(() => removeOpening(p, id), onDone)}
      >
        Xóa {kindName}
      </button>
    </section>
  );
}

/** Small drawing of a plan for template cards. */
export function PlanThumb({ project }: { project: Project }) {
  const g = project.geometry,
    b = bounds(g.rooms.flatMap((r) => r.poly)),
    pad = 400;
  return (
    <svg
      className="plan-thumb"
      viewBox={`${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + 2 * pad} ${b[3] - b[1] + 2 * pad}`}
      aria-hidden="true"
    >
      {g.rooms.map((r) => (
        <polygon
          key={r.id}
          points={r.poly.map((v) => v.join(",")).join(" ")}
          fill={r.counted === false ? "#e3ddd1" : "#efe5d3"}
        />
      ))}
      {g.walls.map(
        (w, i) =>
          w[2] > w[0] &&
          w[3] > w[1] && (
            <rect
              key={i}
              x={w[0]}
              y={w[1]}
              width={w[2] - w[0]}
              height={w[3] - w[1]}
              fill={w[4] === "n" || w[4] === "low" ? "#8c8375" : "#3f3a33"}
            />
          ),
      )}
      {[...g.windows, ...g.slides.map((s) => s.rect)].map((r, i) => (
        <rect
          key={"o" + i}
          x={r[0]}
          y={r[1]}
          width={r[2] - r[0]}
          height={r[3] - r[1]}
          fill="#9cc3cb"
        />
      ))}
    </svg>
  );
}

type Choice = { name: string; create: () => Project };
export function TemplateDialog({
  p,
  onApply,
  onClose,
}: {
  p: Project;
  onApply: (next: Project) => void;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<SavedTemplate[]>(() => {
      try {
        return loadTemplates();
      } catch {
        return [];
      }
    }),
    [name, setName] = useState(p.name ? `${p.name} (của tôi)` : "Mẫu của tôi"),
    [withFurniture, setWithFurniture] = useState(true),
    [pending, setPending] = useState<Choice | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("button")?.focus();
    return () => before?.focus?.();
  }, []);
  const builtins = useMemo(
    () => BUILTIN_TEMPLATES.map((t) => ({ t, project: t.create() })),
    [],
  );
  const apply = (c: Choice) => {
    try {
      onApply(instantiate(c.create(), c.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không dùng được mẫu này.");
    }
  };
  const card = (
    key: string,
    project: Project,
    title: string,
    detail: string,
    choice: Choice,
  ) => (
    <button
      key={key}
      className={"template-card" + (pending?.name === title ? " pending" : "")}
      onClick={() => setPending(choice)}
      aria-label={"Dùng mẫu " + title}
    >
      <PlanThumb project={project} />
      <b>{title}</b>
      <small>
        {usableArea(project).toFixed(1)} m² · {project.geometry.rooms.filter((r) => r.counted !== false).length} phòng
        {project.furniture.length ? ` · ${project.furniture.length} món nội thất` : ""}
      </small>
      {detail && <span>{detail}</span>}
    </button>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={box}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Mẫu mặt bằng"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          // Keep keyboard focus inside the dialog.
          if (e.key === "Tab" && box.current) {
            const items = [
                ...box.current.querySelectorAll<HTMLElement>("button, input, select"),
              ].filter((el) => !(el as HTMLButtonElement).disabled),
              first = items[0],
              last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="modal-head">
          <div>
            <small>BẮT ĐẦU TỪ</small>
            <h2>Mẫu mặt bằng</h2>
          </div>
          <button className="library-close modal-close" aria-label="Đóng mẫu mặt bằng" onClick={onClose}>
            ×
          </button>
        </div>
        {pending && (
          <div className="confirm" role="status">
            <span>
              Thay phương án đang mở bằng “{pending.name}”? Có thể hoàn tác bằng
              Ctrl+Z.
            </span>
            <button onClick={() => setPending(null)}>Hủy</button>
            <button className="primary" onClick={() => apply(pending)}>
              Dùng mẫu này
            </button>
          </div>
        )}
        <h3>Có sẵn</h3>
        <div className="template-grid">
          {builtins.map(({ t, project }) =>
            card(t.id, project, t.name, t.description, { name: t.name, create: t.create }),
          )}
        </div>
        <h3>Mẫu của tôi</h3>
        {saved.length ? (
          <div className="template-grid">
            {saved.map((t) => (
              <div key={t.id} className="saved-template">
                {card(
                  t.id,
                  t.project,
                  t.name,
                  t.savedAt ? `Lưu ${new Date(t.savedAt).toLocaleString("vi-VN")}` : "",
                  { name: t.name, create: () => t.project },
                )}
                <button
                  className="danger"
                  aria-label={"Xóa mẫu " + t.name}
                  onClick={() => {
                    try {
                      setSaved(deleteTemplate(localStorage, t.id));
                      if (pending?.name === t.name) setPending(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Không xóa được mẫu.");
                    }
                  }}
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="help">
            Chưa có mẫu nào. Lưu phương án đang mở bên dưới để dùng lại sau.
          </p>
        )}
        <div className="save-template">
          <label>
            Lưu phương án hiện tại làm mẫu
            <input
              aria-label="Tên mẫu"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={withFurniture}
              onChange={(e) => setWithFurniture(e.target.checked)}
            />
            Kèm nội thất
          </label>
          <button
            className="primary"
            onClick={() => {
              try {
                setSaved(saveTemplate(localStorage, name, p, withFurniture));
                setError("");
                setMessage(`Đã lưu mẫu “${name.trim()}” trên trình duyệt này.`);
              } catch (e) {
                setMessage("");
                setError(e instanceof Error ? e.message : "Không lưu được mẫu.");
              }
            }}
          >
            Lưu mẫu
          </button>
        </div>
        {message && <p className="help" role="status">{message}</p>}
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <small className="help">
          Mẫu của tôi lưu trong trình duyệt này. Để chuyển sang máy khác, dùng
          Xuất phương án / Nhập JSON.
        </small>
      </div>
    </div>
  );
}
