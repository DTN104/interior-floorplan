// Plan templates: the original apartment, drawn sample plans and the user's own saved plans.
import { Project, area, clone, defaultProject, importProject } from "./project";
import { newLayoutProject, LayoutSpec } from "./layout";
import { newId } from "./id";

export type Template = {
  id: string;
  name: string;
  description: string;
  /** Built-in templates are created on demand; saved ones carry their project. */
  create: () => Project;
  savedAt?: string;
};
export type SavedTemplate = { id: string; name: string; savedAt: string; project: Project };
export const TEMPLATE_STORAGE_KEY = "interior-floorplan-templates";
/** Readable templates kept in the browser; the oldest is dropped past this count. */
export const MAX_SAVED_TEMPLATES = 20;

const twoBedrooms: LayoutSpec = {
  name: "Căn 2 phòng ngủ",
  rooms: [
    { id: "pn1", name: "Phòng ngủ 1", mat: "wood", rect: [0, 0, 3600, 3500] },
    { id: "wc", name: "WC", mat: "antislip", rect: [3710, 0, 5510, 2200] },
    { id: "pn2", name: "Phòng ngủ 2", mat: "wood", rect: [5620, 0, 8620, 3500] },
    { id: "hall", name: "Hành lang", mat: "tile800", rect: [3710, 2310, 5510, 3610] },
    { id: "living", name: "Phòng khách + bếp", mat: "tile800", rect: [0, 3610, 8620, 8100] },
    { id: "balcony", name: "Ban công", mat: "antislip", rect: [0, 8210, 3000, 9410] },
  ],
  openings: [
    { kind: "door", room: "pn1", side: "e", offset: 2500, width: 800, name: "Cửa phòng ngủ 1", hingeAtStart: false },
    { kind: "door", room: "pn2", side: "w", offset: 2500, width: 800, name: "Cửa phòng ngủ 2", hingeAtStart: false },
    { kind: "door", room: "wc", side: "s", offset: 500, width: 700, name: "Cửa WC" },
    { kind: "door", room: "living", side: "s", offset: 6100, width: 900, name: "Cửa vào", entry: true, hingeAtStart: false },
    { kind: "window", room: "pn1", side: "n", offset: 1100, width: 1400 },
    { kind: "window", room: "pn2", side: "n", offset: 800, width: 1400 },
    { kind: "window", room: "living", side: "e", offset: 1200, width: 1800 },
    { kind: "slide", room: "balcony", side: "n", offset: 300, width: 2400 },
  ],
};
const studio: LayoutSpec = {
  name: "Căn studio",
  rooms: [
    { id: "main", name: "Phòng chính", mat: "wood", rect: [0, 0, 5000, 4500] },
    { id: "wc", name: "WC", mat: "antislip", rect: [5110, 0, 6810, 2200] },
    { id: "kitchen", name: "Bếp", mat: "tile600", rect: [5000, 2310, 6810, 4500] },
    { id: "balcony", name: "Ban công", mat: "antislip", rect: [0, 4610, 3000, 5810] },
  ],
  openings: [
    { kind: "door", room: "wc", side: "s", offset: 600, width: 700, name: "Cửa WC" },
    { kind: "door", room: "kitchen", side: "s", offset: 500, width: 900, name: "Cửa vào", entry: true },
    { kind: "window", room: "main", side: "n", offset: 1300, width: 2000 },
    { kind: "slide", room: "balcony", side: "n", offset: 300, width: 2400 },
  ],
};
const blank: LayoutSpec = {
  name: "Mặt bằng trống",
  rooms: [{ id: "r1", name: "Phòng 1", mat: "wood", rect: [0, 0, 4000, 3000] }],
};
export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "original",
    name: "Căn hộ gốc",
    description: "Căn 3 phòng ngủ của bản gốc, kèm 46 món nội thất. Chỉ kéo cạnh, không vẽ lại phòng.",
    create: defaultProject,
  },
  {
    id: "two-bedrooms",
    name: twoBedrooms.name,
    description: "Mặt bằng tự vẽ: 2 phòng ngủ, WC, khách + bếp, ban công.",
    create: () => newLayoutProject(twoBedrooms),
  },
  {
    id: "studio",
    name: studio.name,
    description: "Mặt bằng tự vẽ: phòng chính, bếp mở, WC, ban công.",
    create: () => newLayoutProject(studio),
  },
  {
    id: "blank",
    name: blank.name,
    description: "Một phòng 4 × 3 m để bắt đầu vẽ bố cục mới.",
    create: () => newLayoutProject(blank),
  },
];
/** Usable area of the counted rooms (m²). */
export const usableArea = (p: Project) =>
  p.geometry.rooms
    .filter((r) => r.counted !== false)
    .reduce((s, r) => s + area(r.poly), 0);
/** Where a stored template list that is not a JSON list is copied before a save replaces it. */
export const UNREADABLE_TEMPLATES_KEY = "interior-floorplan-templates-unreadable";
/** A stored entry as it is, and the template it holds when this version can read it. */
type Entry = { raw: unknown; template: SavedTemplate | null };
function readStored(storage: Pick<Storage, "getItem">): {
  entries: Entry[];
  /** Raw text that is not a JSON list (nothing in it can be kept in place). */
  broken: string | null;
} {
  let raw: string | null;
  try {
    raw = storage.getItem(TEMPLATE_STORAGE_KEY);
  } catch {
    return { entries: [], broken: null };
  }
  if (raw === null) return { entries: [], broken: null };
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return { entries: [], broken: raw };
  }
  if (!Array.isArray(list)) return { entries: [], broken: raw };
  return {
    entries: list.map((t: any) => {
      try {
        if (typeof t?.id !== "string" || typeof t?.name !== "string") throw Error();
        return {
          raw: t,
          template: {
            id: t.id,
            name: t.name.slice(0, 200),
            savedAt: String(t.savedAt ?? ""),
            project: importProject(t.project),
          },
        };
      } catch {
        return { raw: t, template: null };
      }
    }),
    broken: null,
  };
}
const readable = (entries: Entry[]) => entries.flatMap((e) => (e.template ? [e.template] : []));
/** Saved templates that still validate; unreadable entries are skipped here but stay in storage. */
export function loadTemplates(
  storage: Pick<Storage, "getItem"> = localStorage,
): SavedTemplate[] {
  return readable(readStored(storage).entries);
}
/**
 * Write the list. Entries this version cannot read are written back as they were (a newer version may
 * read them); a list that is not JSON at all is copied to UNREADABLE_TEMPLATES_KEY first, as autosave does.
 */
function store(storage: Pick<Storage, "setItem">, broken: string | null, list: unknown[]) {
  try {
    if (broken !== null) storage.setItem(UNREADABLE_TEMPLATES_KEY, broken);
    storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(list));
  } catch {
    throw Error("Trình duyệt không còn chỗ lưu mẫu. Hãy xóa bớt mẫu hoặc xuất JSON.");
  }
}
/** Save a plan as a template (newest first). Without furniture the template keeps only the plan. */
export function saveTemplate(
  storage: Pick<Storage, "getItem" | "setItem">,
  name: string,
  project: Project,
  withFurniture: boolean,
): SavedTemplate[] {
  const title = name.trim().slice(0, 200);
  if (!title) throw Error("Hãy đặt tên cho mẫu.");
  const snapshot = clone(project);
  snapshot.name = title;
  if (!withFurniture) snapshot.furniture = [];
  const saved: SavedTemplate = {
      id: newId(),
      name: title,
      savedAt: new Date().toISOString(),
      project: importProject(JSON.parse(JSON.stringify(snapshot))),
    },
    { entries, broken } = readStored(storage);
  // The oldest readable templates past the limit are dropped; unreadable entries are kept.
  let count = 1;
  const kept = entries.filter((e) => !e.template || ++count <= MAX_SAVED_TEMPLATES);
  store(storage, broken, [saved, ...kept.map((e) => e.raw)]);
  return [saved, ...readable(kept)];
}
export function deleteTemplate(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
): SavedTemplate[] {
  const { entries, broken } = readStored(storage),
    kept = entries.filter((e) => e.template?.id !== id);
  store(storage, broken, kept.map((e) => e.raw));
  return readable(kept);
}
/** A fresh, validated copy of a template's plan, named after the template. */
export function instantiate(project: Project, name: string): Project {
  const p = importProject(JSON.parse(JSON.stringify(project)));
  p.name = name;
  return p;
}
