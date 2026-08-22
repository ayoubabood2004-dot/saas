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

/** حجم خلية الشبكة — متباعد عمداً: هواء واسع بين الأقفاص فلا تتكدّس. */
/* خطوة الشبكة. وُسِّعت (٣٫٠ ← ٣٫٧) مع تكبير القفص نفسه: الفجوة بين قفصٍ
 * وجاره = CELL − بُعد القفص، فصارت ١٫٢٥ عرضاً (كانت ١٫٠) و١٫٦٥ عمقاً (كانت
 * ١٫٢٥) — أوسعُ رغم أن الأقفاص كبرت. وهذا هو المطلوب: لا متكدّسة ولا ضائعة.
 * ثم وُسِّعت ثانيةً (٣٫٧ ← ٤٫٠٥) مع تكبيرٍ أكبرَ منها للقفص نفسه. */
export const CELL = 4.05;
export type Mode = "manage" | "build";

export const LED_CHOICES = ["#22d3ee", "#fb923c", "#f43f5e", "#4ade80", "#a78bfa", "#e2e8f0"] as const;

export interface Room3D {
  id: string;
  name: string;
  x: number; z: number;
  w: number; d: number;
}

export interface CagePlacement {
  code: string;
  x: number; z: number;
  color?: string;
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

export const cageAt = (s: StudioState, x: number, z: number): CagePlacement | null =>
  s.cages.find((c) => c.x === x && c.z === z) ?? null;

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
    const doorX = r.x + Math.floor(r.w / 2);
    segs.delete(key(doorX, r.z + r.d, doorX + 1, r.z + r.d));
  }
  return [...segs.values()];
}

/** خلية الباب لكل غرفة — للافتة المعلّقة فوقه. */
export const doorCell = (r: Room3D): [number, number] => [r.x + Math.floor(r.w / 2), r.z + r.d];

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
    commit({
      cages: state.cages.filter((c) => c.code !== code),
      selected: state.selected === code ? null : state.selected,
    }, true);
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

  /** ترقيم غرفة كاملة تلقائياً من أساس (مثال ٢٠١، ٢٠٢…) بترتيب الصفوف.
   *  يرجع أزواج (قديم → جديد) حتى يزامن المكوّن رقود السكان. */
  renumberRoom(roomId: string, base: number): Array<{ from: string; to: string }> {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !Number.isFinite(base)) return [];
    const inside = state.cages
      .filter((c) => c.x >= room.x && c.x < room.x + room.w && c.z >= room.z && c.z < room.z + room.d)
      .sort((a, b) => (a.z - b.z) || (a.x - b.x));
    const outside = new Set(state.cages.filter((c) => !inside.includes(c)).map((c) => norm(c.code)));
    const changes: Array<{ from: string; to: string }> = [];
    let n = Math.max(1, Math.floor(base));
    const cages = state.cages.map((c) => {
      if (!inside.includes(c)) return c;
      while (outside.has(String(n))) n++;
      const to = String(n++);
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
