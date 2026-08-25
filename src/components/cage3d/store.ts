import { useSyncExternalStore } from "react";
import { getCageLayout, setCageLayout } from "@/lib/settings";

/* ============================================================================
 * cage3dStore — طبقة «التخطيط» فقط: الغرف ومواقع الأقفاص على الشبكة.
 *
 * المرضى ليسوا هنا: يجيون من opsStore الحقيقي (نفس مصدر التقويم الرئيسي) —
 * القفص بالمشهد يُسكنه الرقود النشط الذي يحمل رمزه بحقل admission.cage،
 * فالمشهد المجسّم وخريطة 2D والتقويم كلهم حقيقة واحدة.
 *
 * التزامن مع بقية السستم:
 *   • كل تعديل تخطيط هنا يُعكس فوراً إلى clinic_prefs.cage_layout (نفس ما
 *     تقرأه خريطة 2D بالطبلات) — مصدر واحد للغرف والرموز.
 *   • adoptCodes: أي رمز قفص موجود على رقود نشط (أو مرسوم بخريطة 2D) وغير
 *     موجود هنا يُتبنّى تلقائياً بخلية فاضية — ما في حيوان يختفي أبداً.
 *
 * المواقع الشبكية (خاصية 3D الوحيدة) تُحفظ محلياً بـlocalStorage.
 * ==========================================================================*/

/** خطوة الشبكة = **ضِعف مقاس القفص** بالضبط.
 *
 * القاعدة صارت صريحة بدل أرقامٍ تُجرَّب: الفجوة بين قفصٍ وجاره = CELL − مقاس
 * القفص، فحين تكون الخطوة ضعف المقاس تصير الفجوة **قفصاً كاملاً من كل جهة**
 * — وهو ما طلبه المالك حرفياً. القفص ٣٫٢×٣٫٢ فالخطوة ٦٫٤، ولأن الفجوة تُشتقّ
 * لا تُضبط يدوياً، أيُّ تغيير لاحق بمقاس القفص يبقيها ضعفاً بلا إعادة معايرة.
 * (والتقارب/التباعد الظاهر على الشاشة تصنعه ملاءمة الكاميرا لا هذا الرقم.) */
export const CELL = 6.4;
export type Mode = "manage" | "build";

export const LED_CHOICES = ["#22d3ee", "#fb923c", "#f43f5e", "#4ade80", "#a78bfa", "#e2e8f0"] as const;

/** جهة باب الغرفة: front = السياج الأمامي (z+d) وهو الافتراضي التاريخي. */
export type DoorSide = "front" | "back" | "left" | "right";

export interface Room3D {
  id: string;
  name: string;
  x: number; z: number;
  w: number; d: number;
  /** موضع باب الغرفة: الجهة + الخلية على تلك الجهة (0..طولها-1).
   *  غيابه = السلوك القديم (منتصف الواجهة الأمامية) فلا تنكسر تخطيطات محفوظة. */
  door?: { side: DoorSide; at: number };
}

export interface CagePlacement {
  code: string;
  x: number; z: number;
  color?: string;
  /** اتجاه باب القفص بأرباع لفّة: 0 أمام (الافتراضي) · 1 يمين · 2 خلف · 3 يسار. */
  facing?: 0 | 1 | 2 | 3;
  /** الطابق: 0 أرضي (الافتراضي) · 1 قفصٌ مركّب فوق الأرضي بنفس الخلية. */
  level?: 0 | 1;
}

interface StudioState {
  mode: Mode;
  rooms: Room3D[];
  cages: CagePlacement[];
  selected: string | null;
}

const LS_KEY = "vp_cage3d_layout_v2";
const norm = (c: string) => c.trim().toLowerCase();

function seed(): StudioState {
  return {
    mode: "manage",
    rooms: [{ id: "r1", name: "غرفة الإقامة", x: 0, z: 0, w: 3, d: 2 }],
    cages: [
      { code: "101", x: 0, z: 0 }, { code: "102", x: 1, z: 0 }, { code: "103", x: 2, z: 0 },
      { code: "104", x: 0, z: 1 }, { code: "105", x: 1, z: 1 }, { code: "106", x: 2, z: 1 },
    ],
    selected: null,
  };
}

function load(): StudioState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return seed();
    const s = JSON.parse(raw) as StudioState;
    if (!Array.isArray(s.rooms) || !Array.isArray(s.cages)) return seed();
    return { ...s, mode: "manage", selected: null };
  } catch { return seed(); }
}

let state: StudioState = load();
const listeners = new Set<() => void>();

/** عكس التخطيط لخريطة 2D (clinic_prefs.cage_layout) — مصدر واحد للغرف.
 *  مؤجَّل ٤٠٠م.ث: جلسة بناء سريعة (قفص قفص قفص…) تكتب مرة واحدة بدل رفعة
 *  شبكة لكل ضغطة — هذا كان أكبر مصدر «لاق» بإضافة الأقفاص على الآيباد. */
let mirrorT: ReturnType<typeof setTimeout> | null = null;
function mirrorToPrefs() {
  if (mirrorT) clearTimeout(mirrorT);
  mirrorT = setTimeout(() => {
    mirrorT = null;
    try {
      setCageLayout(state.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        cages: state.cages
          .filter((c) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d)
          .map((c) => c.code),
      })));
    } catch { /* بيئة بلا تفضيلات (اختبارات) — التخطيط المحلي يبقى صحيحاً */ }
  }, 400);
}

function commit(next: Partial<StudioState>, touchesLayout = false) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...state, mode: "manage", selected: null }));
  } catch { /* مساحة ممتلئة؟ الحالة بالذاكرة تبقى صحيحة */ }
  if (touchesLayout) mirrorToPrefs();
  listeners.forEach((fn) => fn());
}

/* ------------------------------- استعلامات ------------------------------- */

export const roomAt = (s: StudioState, x: number, z: number): Room3D | null =>
  s.rooms.find((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) ?? null;

export const cageAt = (s: StudioState, x: number, z: number, level: 0 | 1 = 0): CagePlacement | null =>
  s.cages.find((c) => c.x === x && c.z === z && (c.level ?? 0) === level) ?? null;

/** القفص العلوي بالخلية — إن وُجد. */
export const upperAt = (s: StudioState, x: number, z: number): CagePlacement | null => cageAt(s, x, z, 1);

export const cellFree = (s: StudioState, x: number, z: number): boolean =>
  !!roomAt(s, x, z) && !cageAt(s, x, z);

export function bounds(s: StudioState) {
  if (!s.rooms.length) return { minX: 0, minZ: 0, maxX: 3, maxZ: 2 };
  const minX = Math.min(...s.rooms.map((r) => r.x));
  const minZ = Math.min(...s.rooms.map((r) => r.z));
  const maxX = Math.max(...s.rooms.map((r) => r.x + r.w));
  const maxZ = Math.max(...s.rooms.map((r) => r.z + r.d));
  return { minX, minZ, maxX, maxZ };
}

export function cellWorld(s: StudioState, x: number, z: number): [number, number] {
  const b = bounds(s);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [(x + 0.5 - cx) * CELL, (z + 0.5 - cz) * CELL];
}

export function cornerWorld(s: StudioState, x: number, z: number): [number, number] {
  const b = bounds(s);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [(x - cx) * CELL, (z - cz) * CELL];
}

export function nextCode(s: StudioState, room: Room3D): string {
  const base = (s.rooms.indexOf(room) + 1) * 100;
  const used = new Set(s.cages.map((c) => norm(c.code)));
  for (let i = 1; i < 100; i++) if (!used.has(String(base + i))) return String(base + i);
  return String(base + Math.floor(Math.random() * 900) + 100);
}

/* ---------------------- خوارزمية القواطع التلقائية ---------------------- */
export interface WallSeg { x1: number; z1: number; x2: number; z2: number }

export function buildPartitions(rooms: Room3D[]): WallSeg[] {
  const segs = new Map<string, WallSeg>();
  const key = (x1: number, z1: number, x2: number, z2: number) => `${x1},${z1}|${x2},${z2}`;
  const add = (x1: number, z1: number, x2: number, z2: number) =>
    segs.set(key(x1, z1, x2, z2), { x1, z1, x2, z2 });

  for (const r of rooms) {
    for (let i = 0; i < r.w; i++) {
      add(r.x + i, r.z, r.x + i + 1, r.z);
      add(r.x + i, r.z + r.d, r.x + i + 1, r.z + r.d);
    }
    for (let j = 0; j < r.d; j++) {
      add(r.x, r.z + j, r.x, r.z + j + 1);
      add(r.x + r.w, r.z + j, r.x + r.w, r.z + j + 1);
    }
  }
  for (const r of rooms) {
    const seg = doorSegment(r);
    segs.delete(key(seg.x1, seg.z1, seg.x2, seg.z2));
  }
  return [...segs.values()];
}

/** مقطعُ الجدار الذي يفتحه باب الغرفة — من door المخزَّن، وإلا منتصف الواجهة
 *  الأمامية (السلوك التاريخي، فتخطيطات ما قبل الميزة تبقى كما كانت). */
export function doorSegment(r: Room3D): WallSeg {
  const side = r.door?.side ?? "front";
  const span = side === "front" || side === "back" ? r.w : r.d;
  const at = Math.max(0, Math.min(span - 1, r.door?.at ?? Math.floor(r.w / 2)));
  switch (side) {
    case "front": return { x1: r.x + at, z1: r.z + r.d, x2: r.x + at + 1, z2: r.z + r.d };
    case "back": return { x1: r.x + at, z1: r.z, x2: r.x + at + 1, z2: r.z };
    case "left": return { x1: r.x, z1: r.z + at, x2: r.x, z2: r.z + at + 1 };
    case "right": return { x1: r.x + r.w, z1: r.z + at, x2: r.x + r.w, z2: r.z + at + 1 };
  }
}

/** خلية الباب لكل غرفة — للافتة المعلّقة فوقه. */
export const doorCell = (r: Room3D): [number, number] => {
  const seg = doorSegment(r);
  return [seg.x1, seg.z1];
};

/* -------------------------------- الأفعال -------------------------------- */

export const cageStudio = {
  get: (): StudioState => state,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  setMode(mode: Mode) { commit({ mode, selected: null }); },
  select(code: string | null) { commit({ selected: code }); },

  addRoom(name: string, w: number, d: number) {
    const b = bounds(state);
    const room: Room3D = {
      id: `r${Date.now().toString(36)}`,
      name: name.trim() || `غرفة ${state.rooms.length + 1}`,
      x: state.rooms.length ? b.maxX + 1 : 0, z: 0,
      w: Math.max(1, Math.min(5, w)), d: Math.max(1, Math.min(4, d)),
    };
    commit({ rooms: [...state.rooms, room] }, true);
    return room;
  },

  updateRoom(id: string, patch: { name?: string }) {
    commit({ rooms: state.rooms.map((r) => (r.id === id ? { ...r, ...patch, name: (patch.name ?? r.name).trim() || r.name } : r)) }, true);
  },

  /** موضع باب الغرفة: جهةٌ وخلية على تلك الجهة — يُقصّ على طولها تلقائياً. */
  setRoomDoor(id: string, side: DoorSide, at: number) {
    commit({
      rooms: state.rooms.map((r) => {
        if (r.id !== id) return r;
        const span = side === "front" || side === "back" ? r.w : r.d;
        return { ...r, door: { side, at: Math.max(0, Math.min(span - 1, Math.floor(at))) } };
      }),
    }, true);
  },

  /** تحجيم الغرفة بدقةٍ قفصاً قفصاً. التكبير يُرفض إن داس غرفةً أخرى،
   *  والتصغير يُرفض إن كان بالمساحة المقصوصة أقفاص — لا حذف صامت أبداً. */
  resizeRoom(id: string, w: number, d: number): { ok: boolean; reason?: "occupied" | "overlap" | "bounds" } {
    const room = state.rooms.find((r) => r.id === id);
    if (!room) return { ok: false, reason: "bounds" };
    const W = Math.max(1, Math.min(8, Math.floor(w)));
    const D = Math.max(1, Math.min(6, Math.floor(d)));
    if (W === room.w && D === room.d) return { ok: true };
    const next = { ...room, w: W, d: D };
    const overlaps = state.rooms.some((o) =>
      o.id !== id
      && next.x < o.x + o.w && next.x + next.w > o.x
      && next.z < o.z + o.d && next.z + next.d > o.z);
    if (overlaps) return { ok: false, reason: "overlap" };
    const cut = state.cages.some((c) =>
      c.x >= room.x && c.x < room.x + room.w && c.z >= room.z && c.z < room.z + room.d
      && !(c.x >= next.x && c.x < next.x + next.w && c.z >= next.z && c.z < next.z + next.d));
    if (cut) return { ok: false, reason: "occupied" };
    // الباب يبقى على جدارٍ موجود: يُقصّ موضعه على الطول الجديد
    const door = next.door
      ? { ...next.door, at: Math.min(next.door.at, (next.door.side === "front" || next.door.side === "back" ? W : D) - 1) }
      : undefined;
    commit({ rooms: state.rooms.map((r) => (r.id === id ? { ...next, door } : r)) }, true);
    return { ok: true };
  },

  /** حذف غرفة يحذف أقفاصها من التخطيط — المرضى لا يُمسّون (رموزهم تُتبنّى لاحقاً). */
  removeRoom(id: string) {
    const room = state.rooms.find((r) => r.id === id);
    if (!room) return;
    const inside = new Set(state.cages
      .filter((c) => c.x >= room.x && c.x < room.x + room.w && c.z >= room.z && c.z < room.z + room.d)
      .map((c) => c.code));
    commit({
      rooms: state.rooms.filter((r) => r.id !== id),
      cages: state.cages.filter((c) => !inside.has(c.code)),
      selected: state.selected && inside.has(state.selected) ? null : state.selected,
    }, true);
  },

  placeCage(x: number, z: number, code?: string): CagePlacement | null {
    if (!cellFree(state, x, z)) return null;
    const room = roomAt(state, x, z)!;
    const c = code?.trim() || nextCode(state, room);
    if (state.cages.some((k) => norm(k.code) === norm(c))) return null;
    const cage: CagePlacement = { code: c, x, z };
    // بلا تحديد تلقائي: لوح الخصائص كان ينفتح بعد كل إضافة ويغطي الخلايا
    // المجاورة فيقطع البناء السريع — التخصيص بضغطة متعمّدة على القفص.
    commit({ cages: [...state.cages, cage] }, true);
    return cage;
  },

  /** تغيير رقم/لون القفص — التكرار يُرفض. (مزامنة رقود الساكن مسؤولية المكوّن.) */
  updateCage(code: string, patch: { code?: string; color?: string }): boolean {
    const next = patch.code?.trim();
    if (next && norm(next) !== norm(code) && state.cages.some((c) => norm(c.code) === norm(next))) return false;
    commit({
      cages: state.cages.map((c) => (c.code === code ? { ...c, ...patch, code: next || c.code } : c)),
      selected: next || state.selected,
    }, true);
    return true;
  },

  /** إضافة قفص لغرفةٍ بعينها بلا اختيار خلية: أول خلية فاضية تُشغَل، وإن
   *  امتلأت الغرفة تتعمّق صفاً — فاللوحة المسطّحة لا تسأل الطبيب «وين أحطه؟». */
  addCageAuto(roomId: string): CagePlacement | null {
    let room = state.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    for (let j = 0; j < room.d; j++) for (let i = 0; i < room.w; i++) {
      const x = room.x + i, z = room.z + j;
      if (!cageAt(state, x, z)) return this.placeCage(x, z);
    }
    const grown = { ...room, d: room.d + 1 };
    commit({ rooms: state.rooms.map((r) => (r.id === roomId ? grown : r)) }, true);
    room = grown;
    return this.placeCage(room.x, room.z + room.d - 1);
  },

  removeCage(code: string) {
    const gone = state.cages.find((c) => c.code === code);
    let cages = state.cages.filter((c) => c.code !== code);
    // حذف الأرضي وفوقه علوي؟ العلوي ينزل مكانه — لا قفص يطفو بالهواء.
    if (gone && (gone.level ?? 0) === 0) {
      cages = cages.map((c) =>
        c.x === gone.x && c.z === gone.z && (c.level ?? 0) === 1 ? { ...c, level: 0 as const } : c);
    }
    commit({
      cages,
      selected: state.selected === code ? null : state.selected,
    }, true);
  },

  /** تدوير باب القفص ربع لفّة — 0 أمام ← 1 يمين ← 2 خلف ← 3 يسار. */
  rotateCage(code: string): number {
    let next = 0;
    commit({
      cages: state.cages.map((c) => {
        if (c.code !== code) return c;
        next = (((c.facing ?? 0) + 1) % 4);
        return { ...c, facing: next as 0 | 1 | 2 | 3 };
      }),
    }, true);
    return next;
  },

  /** تركيب قفصٍ علوي فوق قفصٍ أرضي بنفس الخلية — قفصان فوق بعض. */
  addUpper(code: string): CagePlacement | null {
    const base = state.cages.find((c) => c.code === code);
    if (!base || (base.level ?? 0) !== 0) return null;
    if (upperAt(state, base.x, base.z)) return null;
    const room = roomAt(state, base.x, base.z);
    const newCode = nextCode(state, room ?? state.rooms[0]);
    const cage: CagePlacement = { code: newCode, x: base.x, z: base.z, level: 1, facing: base.facing };
    commit({ cages: [...state.cages, cage] }, true);
    return cage;
  },

  /** صبغ ليد كل أقفاص غرفة بلون واحد دفعة وحدة — بدل قفص قفص. */
  paintRoom(roomId: string, color: string): number {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return 0;
    const inRoom = (c: CagePlacement) =>
      c.x >= room.x && c.x < room.x + room.w && c.z >= room.z && c.z < room.z + room.d;
    const n = state.cages.filter(inRoom).length;
    if (n) commit({ cages: state.cages.map((c) => (inRoom(c) ? { ...c, color } : c)) });
    return n;
  },

  /** ترقيم غرفة كاملة تلقائياً من أساس (مثال ٢٠١، ٢٠٢…) بترتيب الصفوف —
   *  الأرضي قبل العلوي بكل خلية، وببادئةٍ نصية اختيارية («أ-١»، «ع٢٠١»…).
   *  يرجع أزواج (قديم → جديد) حتى يزامن المكوّن رقود السكان. */
  renumberRoom(roomId: string, base: number, prefix = ""): Array<{ from: string; to: string }> {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !Number.isFinite(base)) return [];
    const pfx = prefix.trim();
    const inside = state.cages
      .filter((c) => c.x >= room.x && c.x < room.x + room.w && c.z >= room.z && c.z < room.z + room.d)
      .sort((a, b) => (a.z - b.z) || (a.x - b.x) || ((a.level ?? 0) - (b.level ?? 0)));
    const outside = new Set(state.cages.filter((c) => !inside.includes(c)).map((c) => norm(c.code)));
    const changes: Array<{ from: string; to: string }> = [];
    /* الأرقام تُخصَّص بترتيب `inside` **المفروز** (صفوف ← أعمدة ← طوابق)، لا
     * بترتيب المصفوفة: القفص العلوي يُضاف آخرَ المصفوفة، وبترتيبها كان ياخذ
     * آخرَ رقمٍ بدل الرقم الذي يلي أرضيَّه مباشرة. */
    let n = Math.max(1, Math.floor(base));
    const assigned = new Map<CagePlacement, string>();
    for (const c of inside) {
      while (outside.has(norm(`${pfx}${n}`))) n++;
      assigned.set(c, `${pfx}${n++}`);
    }
    const cages = state.cages.map((c) => {
      const to = assigned.get(c);
      if (!to) return c;
      if (to !== c.code) changes.push({ from: c.code, to });
      return { ...c, code: to };
    });
    commit({ cages, selected: null }, true);
    return changes;
  },

  /** تبنّي رموز موجودة بالسستم (رقود نشطة أو خريطة 2D) وغير مرسومة هنا:
   *  تُغرز بأول خلايا فاضية، وإن ضاقت الغرف تُبنى «غرفة غير مصنّفة» تسعها. */
  adoptCodes(codes: string[]) {
    const known = new Set(state.cages.map((c) => norm(c.code)));
    const todo = [...new Set(codes.map((c) => c.trim()).filter(Boolean))].filter((c) => !known.has(norm(c)));
    if (!todo.length) return;
    let rooms = state.rooms;
    const cages = [...state.cages];
    const free: Array<[number, number]> = [];
    const collectFree = () => {
      free.length = 0;
      for (const r of rooms) for (let j = 0; j < r.d; j++) for (let i = 0; i < r.w; i++) {
        const x = r.x + i, z = r.z + j;
        if (!cages.some((c) => c.x === x && c.z === z)) free.push([x, z]);
      }
    };
    collectFree();
    if (free.length < todo.length) {
      const need = todo.length - free.length;
      const w = Math.min(4, Math.max(1, need)), d = Math.ceil(need / w);
      const b = rooms.length
        ? { maxX: Math.max(...rooms.map((r) => r.x + r.w)) }
        : { maxX: -1 };
      rooms = [...rooms, {
        id: `r${Date.now().toString(36)}`, name: "غير مصنّفة",
        x: b.maxX + 1, z: 0, w, d,
      }];
      collectFree();
    }
    todo.forEach((code, i) => {
      const cell = free[i];
      if (cell) cages.push({ code, x: cell[0], z: cell[1] });
    });
    commit({ rooms, cages }, true);
  },

  reset() {
    try { localStorage.removeItem(LS_KEY); } catch { /* لا شيء */ }
    state = seed();
    listeners.forEach((fn) => fn());
  },
};

/** عند أول تشغيل: اكتساب غرف خريطة 2D المرسومة سابقاً (رموز فقط). */
export function codesFromPrefs(): string[] {
  try { return getCageLayout().flatMap((r) => r.cages); } catch { return []; }
}

export function useCageStudio(): StudioState {
  return useSyncExternalStore(cageStudio.subscribe, cageStudio.get);
}
