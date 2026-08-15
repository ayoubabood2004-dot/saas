import { useSyncExternalStore } from "react";
import type { Occupant } from "./neon";

/* ============================================================================
 * cage3dStore — عقل الاستوديو المجسّم: وضعان فوق حالة واحدة.
 *
 * نفس فلسفة opsStore بالسستم (مخزن وحدة نمطية + مشتركون — بلا مكتبة ستيت
 * خارجية) لكن بواجهة useSyncExternalStore، فأي مكوّن يقرأ لقطة متزامنة
 * ويُعاد رسمه عند كل تحوّل.
 *
 * النموذج شبكي: العالم مقسوم خلايا مربعة (CELL وحدة عالمية)، الغرفة مستطيل
 * خلايا {x,z,w,d}، والقفص يسكن خلية واحدة داخل غرفة. هذا ما يجعل «البناء»
 * قابلاً للتفكير: السحب يلتقط لخلية، والتحقق «هل الخلية داخل غرفة وفاضية؟»
 * سؤال حسابي بسيط، والقواطع تُشتق اشتقاقاً من حدود الغرف (بلا رسم يدوي).
 *
 * المثابرة: localStorage (مسودة الاستوديو) — والحدود load/save مصمّمة حتى
 * تتبدّل بالمرحلة ٤ إلى clinic_prefs.cage_layout + opsStore بلا لمس البقية.
 * ==========================================================================*/

export const CELL = 2.4;
export type Mode = "manage" | "build";

/** ألوان النيون المتاحة لتخصيص ليد القفص بوضع البناء. */
export const LED_CHOICES = ["#22d3ee", "#fb923c", "#f43f5e", "#4ade80", "#a78bfa", "#e2e8f0"] as const;

export interface Room3D {
  id: string;
  name: string;
  x: number; z: number; // خلية الزاوية (شمال-غرب)
  w: number; d: number; // بالأقفاص (خلايا)
}

export interface CagePlacement {
  code: string;
  x: number; z: number;   // خلية عالمية
  color?: string;         // ليد مخصّص — يظهر لما يكون القفص فاضياً
}

interface StudioState {
  mode: Mode;
  rooms: Room3D[];
  cages: CagePlacement[];
  occupants: Record<string, Occupant | null>; // بالكود — عينة حتى ربط المرحلة ٤
  selected: string | null;                    // قفص محدّد بوضع البناء
}

const LS_KEY = "vp_cage3d_studio_v1";

/** بذرة أول تشغيل: غرفة إقامة ٣×٢ بالأقفاص والمرضى المعتادين. */
function seed(): StudioState {
  return {
    mode: "manage",
    rooms: [{ id: "r1", name: "غرفة الإقامة", x: 0, z: 0, w: 3, d: 2 }],
    cages: [
      { code: "101", x: 0, z: 0 }, { code: "102", x: 1, z: 0 }, { code: "103", x: 2, z: 0 },
      { code: "104", x: 0, z: 1 }, { code: "105", x: 1, z: 1 }, { code: "106", x: 2, z: 1 },
    ],
    occupants: {
      "101": { name: "بيلا", species: "cat", emoji: "🐱", status: "boarding", days: 3 },
      "102": { name: "لولو", species: "bird", emoji: "🦜", status: "care", days: 1 },
      "103": null,
      "104": { name: "مشمش", species: "rabbit", emoji: "🐰", status: "careBoarding", days: 2 },
      "105": null,
      "106": { name: "روكي", species: "dog", emoji: "🐶", status: "boarding", days: 5 },
    },
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

function commit(next: Partial<StudioState>) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...state, mode: "manage", selected: null }));
  } catch { /* مساحة ممتلئة؟ المسودة بالذاكرة تبقى صحيحة */ }
  listeners.forEach((fn) => fn());
}

/* ------------------------------- استعلامات ------------------------------- */

export const roomAt = (s: StudioState, x: number, z: number): Room3D | null =>
  s.rooms.find((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) ?? null;

export const cageAt = (s: StudioState, x: number, z: number): CagePlacement | null =>
  s.cages.find((c) => c.x === x && c.z === z) ?? null;

/** خلية صالحة لقفص جديد = داخل غرفة، وفاضية. */
export const cellFree = (s: StudioState, x: number, z: number): boolean =>
  !!roomAt(s, x, z) && !cageAt(s, x, z);

/** حدود العالم بالخلايا — منها يتمركز المشهد وتتكيف الكاميرا. */
export function bounds(s: StudioState) {
  if (!s.rooms.length) return { minX: 0, minZ: 0, maxX: 3, maxZ: 2 };
  const minX = Math.min(...s.rooms.map((r) => r.x));
  const minZ = Math.min(...s.rooms.map((r) => r.z));
  const maxX = Math.max(...s.rooms.map((r) => r.x + r.w));
  const maxZ = Math.max(...s.rooms.map((r) => r.z + r.d));
  return { minX, minZ, maxX, maxZ };
}

/** خلية شبكية → مركزها بالعالم (المشهد متمركز حول أصل الرسم). */
export function cellWorld(s: StudioState, x: number, z: number): [number, number] {
  const b = bounds(s);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [(x + 0.5 - cx) * CELL, (z + 0.5 - cz) * CELL];
}

/** زاوية شبكية (حدود خلايا) → العالم — للقواطع. */
export function cornerWorld(s: StudioState, x: number, z: number): [number, number] {
  const b = bounds(s);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [(x - cx) * CELL, (z - cz) * CELL];
}

/** رقم تلقائي للقفص الجديد: أساس الغرفة (101، 201…) وأول رقم غير محجوز. */
export function nextCode(s: StudioState, room: Room3D): string {
  const base = (s.rooms.indexOf(room) + 1) * 100;
  const used = new Set(s.cages.map((c) => c.code));
  for (let i = 1; i < 100; i++) if (!used.has(String(base + i))) return String(base + i);
  return String(base + Math.floor(Math.random() * 900) + 100);
}

/* ---------------------- خوارزمية القواطع التلقائية ----------------------
 * الفكرة: كل غرفة تساهم بأضلاع محيطها كقطع بطول خلية واحدة، بمفتاح موحّد
 * للقطعة. الضلع المشترك بين غرفتين متلاصقتين يُضاف مرتين بنفس المفتاح →
 * يبقى قاطعاً واحداً مشتركاً (بدون جدارين متراكبين). ثم يُفتح باب لكل
 * غرفة: تُحذف القطعة الوسطى من ضلعها الأمامي (جهة الكاميرا، z الأكبر).
 * الناتج قائمة قطع {من، إلى} جاهزة للرسم كزجاج عيادات حديث. ------------- */
export interface WallSeg { x1: number; z1: number; x2: number; z2: number }

export function buildPartitions(rooms: Room3D[]): WallSeg[] {
  const segs = new Map<string, WallSeg>();
  const key = (x1: number, z1: number, x2: number, z2: number) => `${x1},${z1}|${x2},${z2}`;
  const add = (x1: number, z1: number, x2: number, z2: number) =>
    segs.set(key(x1, z1, x2, z2), { x1, z1, x2, z2 });

  for (const r of rooms) {
    for (let i = 0; i < r.w; i++) {
      add(r.x + i, r.z, r.x + i + 1, r.z);                 // الضلع الخلفي
      add(r.x + i, r.z + r.d, r.x + i + 1, r.z + r.d);     // الأمامي
    }
    for (let j = 0; j < r.d; j++) {
      add(r.x, r.z + j, r.x, r.z + j + 1);                 // الغربي
      add(r.x + r.w, r.z + j, r.x + r.w, r.z + j + 1);     // الشرقي
    }
  }
  // باب كل غرفة: القطعة الوسطى من الضلع الأمامي
  for (const r of rooms) {
    const doorX = r.x + Math.floor(r.w / 2);
    segs.delete(key(doorX, r.z + r.d, doorX + 1, r.z + r.d));
  }
  return [...segs.values()];
}

/* -------------------------------- الأفعال -------------------------------- */

export const cageStudio = {
  get: (): StudioState => state,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  setMode(mode: Mode) { commit({ mode, selected: null }); },
  select(code: string | null) { commit({ selected: code }); },

  /** غرفة جديدة تُصفّ تلقائياً يمين المخطط الحالي وبينهما ممر خلية. */
  addRoom(name: string, w: number, d: number) {
    const b = bounds(state);
    const room: Room3D = {
      id: `r${Date.now().toString(36)}`,
      name: name.trim() || `غرفة ${state.rooms.length + 1}`,
      x: state.rooms.length ? b.maxX + 1 : 0, z: 0,
      w: Math.max(1, Math.min(5, w)), d: Math.max(1, Math.min(4, d)),
    };
    commit({ rooms: [...state.rooms, room] });
    return room;
  },

  /** حذف غرفة يحذف أقفاصها — ومرضاها يرجعون «بلا قفص» (لا يُفقد أحد). */
  removeRoom(id: string) {
    const room = state.rooms.find((r) => r.id === id);
    if (!room) return;
    const inside = state.cages.filter((c) => roomAt(state, c.x, c.z)?.id === id);
    const codes = new Set(inside.map((c) => c.code));
    const occupants = { ...state.occupants };
    for (const c of codes) delete occupants[c];
    commit({
      rooms: state.rooms.filter((r) => r.id !== id),
      cages: state.cages.filter((c) => !codes.has(c.code)),
      occupants,
      selected: state.selected && codes.has(state.selected) ? null : state.selected,
    });
  },

  /** إسقاط قفص جديد على خلية — يرفض بهدوء إذا الخلية خارج غرفة أو مشغولة. */
  placeCage(x: number, z: number): CagePlacement | null {
    if (!cellFree(state, x, z)) return null;
    const room = roomAt(state, x, z)!;
    const cage: CagePlacement = { code: nextCode(state, room), x, z };
    commit({ cages: [...state.cages, cage], occupants: { ...state.occupants, [cage.code]: null }, selected: cage.code });
    return cage;
  },

  /** تخصيص قفص (الرقم / لون الليد). تغيير الرقم يرفض التكرار. */
  updateCage(code: string, patch: { code?: string; color?: string }): boolean {
    const next = patch.code?.trim();
    if (next && next !== code && state.cages.some((c) => c.code === next)) return false;
    const cages = state.cages.map((c) => (c.code === code ? { ...c, ...patch, code: next || c.code } : c));
    const occupants = { ...state.occupants };
    if (next && next !== code) {
      occupants[next] = occupants[code] ?? null;
      delete occupants[code];
    }
    commit({ cages, occupants, selected: next || state.selected });
    return true;
  },

  removeCage(code: string) {
    const occupants = { ...state.occupants };
    delete occupants[code];
    commit({
      cages: state.cages.filter((c) => c.code !== code),
      occupants,
      selected: state.selected === code ? null : state.selected,
    });
  },

  /** نقل مريض بين قفصين (وضع الإدارة) — الهدف لازم يكون فاضياً. */
  moveOccupant(from: string, to: string): boolean {
    const occ = state.occupants[from];
    if (!occ || state.occupants[to]) return false;
    commit({ occupants: { ...state.occupants, [from]: null, [to]: occ } });
    return true;
  },

  /** لإعادة ضبط العرض التجريبي (تستعملها الفحوصات). */
  reset() {
    try { localStorage.removeItem(LS_KEY); } catch { /* لا شيء */ }
    state = seed();
    listeners.forEach((fn) => fn());
  },
};

/** لقطة متزامنة للمكوّنات — إعادة رسم عند كل commit. */
export function useCageStudio(): StudioState {
  return useSyncExternalStore(cageStudio.subscribe, cageStudio.get);
}
