import { useSyncExternalStore } from "react";
import {
  parseLayout, serializeLayout, layoutFingerprint, orphanCodes,
  EMPTY_LAYOUT, type CageLayout, type LayoutRoom, type LayoutCage, type DoorSide,
} from "@/lib/cageLayout";
import { getCageLayoutRaw, getCageLayoutRev, noteCageLayoutSaved } from "@/lib/settings";
import { sb, registerHydrator, registerReset } from "@/lib/clinicSync";
import { getActiveClinicId } from "@/lib/clinics";

/* ============================================================================
 * cage3dStore — طبقة «التخطيط»: الغرف ومواقع الأقفاص.
 *
 * ── العطبُ الذي بُني هذا الملفُّ من جديد لأجله ──────────────────────────
 * «العيادة ترتّب غرفها على حاسبة، وتفتحه على حاسبة ثانية فيصير الترتيب
 * عشوائياً وكل الأقفاص بغرفة وحدة». وكان أسوأَ ممّا يبدو: الحاسبةُ الثانية
 * **تكتب** تلك الفوضى فوق ترتيب الأولى.
 *
 * ثلاثةُ أخطاءٍ فوق بعضها، وكلُّها هنا:
 *
 *   ١) **الهندسةُ ما كانت تصل السحابةَ أصلاً.** مواضعُ الغرف وأبعادُها
 *      وأبوابُها، وخليّةُ كلّ قفصٍ ولونُه واتجاهُه وطابقُه — كلُّها بـ
 *      `localStorage` تحت مفتاحٍ **بلا اسم عيادة**. والسحابةُ لا تحمل إلا
 *      أسماءَ الغرف ورموزَ أقفاصها. فلا جهازٌ ثانٍ يراها، ولا عيادتان على
 *      جهازٍ واحدٍ تفترقان.
 *
 *   ٢) **البذرةُ كانت تُقرأ كأنها حقيقة.** `load()` حين لا يجد محلّياً شيئاً
 *      كان يرجع ستّةَ أقفاصٍ وهمية بغرفة «غرفة الإقامة» — ثم يرفعها. بصمتُها
 *      بالإنتاج: كلُّ عيادةٍ لها تخطيطٌ تبدأ بـ«غرفة الإقامة» ١٠١–١٠٦.
 *
 *   ٣) **والتبنّي كان يكتب.** `adoptCodes` تكدّس الرموزَ غيرَ المرسومة بغرفةٍ
 *      جديدةٍ اسمُها «غير مصنّفة» ثم `commit(..., true)` يرفعها. المقيس:
 *      أربعُ عياداتٍ من سبعٍ فيها غرفةٌ بهذا الاسم، وواحدةٌ فيها **ثلاث**.
 *
 * ── القواعدُ الآن ───────────────────────────────────────────────────────
 *   • **لا بذرةَ أبداً.** لا تخطيطَ ⇒ شاشةٌ فارغةٌ تقول ذلك. فراغٌ صادقٌ
 *     يُصلَّح بضغطة، وبذرةٌ كاذبةٌ تُصدَّق وتُكتب فوق الحقيقة.
 *   • **يُقرأ قبل أن يُكتب.** `hydrate()` تملأ من السحابة، ولا كتابةَ قبلها.
 *   • **الحفظُ بشرط النسخة** (`save_cage_layout` — 0195). من بنى على نسخةٍ
 *     قديمةٍ لا يدوس: تُعرض عليه نسخةُ السحابة ويختار.
 *   • **التبنّي عرضٌ لا كتابة** (`orphanCodes` بـcageLayout.ts).
 *   • المرآةُ المحلّية **باسم العيادة** وذاكرةُ رسمٍ لا مصدرُ حقيقة.
 * ==========================================================================*/

/** خطوة الشبكة = **ضِعف مقاس القفص** بالضبط.
 *
 * القاعدة صارت صريحة بدل أرقامٍ تُجرَّب: الفجوة بين قفصٍ وجاره = CELL − مقاس
 * القفص، فحين تكون الخطوة ضعف المقاس تصير الفجوة **قفصاً كاملاً من كل جهة**
 * — وهو ما طلبه المالك حرفياً. القفص ٣٫٢×٣٫٢ فالخطوة ٦٫٤، ولأن الفجوة تُشتقّ
 * لا تُضبط يدوياً، أيُّ تغيير لاحق بمقاس القفص يبقيها ضعفاً بلا إعادة معايرة. */
export const CELL = 6.4;
export type Mode = "manage" | "build";
export type { DoorSide };

export const LED_CHOICES = ["#22d3ee", "#fb923c", "#f43f5e", "#4ade80", "#a78bfa", "#e2e8f0"] as const;

export type Room3D = LayoutRoom;
export type CagePlacement = LayoutCage;

/** حالةُ المزامنة كما تُقال للمستخدم — الشاشةُ لا تدّعي حفظاً لم يحصل. */
export type SyncState = "loading" | "saved" | "dirty" | "saving" | "offline" | "conflict" | "error";

interface StudioState {
  mode: Mode;
  /** هل وصل التخطيطُ من السحابة (أو من المرآة بالوضع التجريبي)؟ */
  ready: boolean;
  rooms: Room3D[];
  cages: CagePlacement[];
  selected: string | null;
  /** نسخةُ السحابة التي بُني عليها ما بالشاشة. */
  rev: number;
  sync: SyncState;
  /** آخرُ حفظٍ نجح — بالميلي ثانية المحلّية. */
  savedAt: number | null;
  /** نسخةُ السحابة الأحدث حين يقع تعارض — تُعرض ليختار صاحبُها. */
  conflict: { rev: number; layout: CageLayout } | null;
  /** نصُّ الخطأ الأخير، إن كان. */
  error: string | null;
}

const lsKey = () => `vp_cage3d_layout_${getActiveClinicId() || "anon"}`;
/** المفتاحُ القديم — بلا اسم عيادة. لا يُقرأ تلقائياً أبداً (كان يخلط
 *  عيادتين على جهازٍ واحد)؛ تعرضه الشاشةُ لصاحبه ليرفعه بقرارٍ منه. */
export const LEGACY_LS_KEY = "vp_cage3d_layout_v2";

const norm = (c: string) => c.trim().toLowerCase();

const blank = (): StudioState => ({
  mode: "manage", ready: false, rooms: [], cages: [], selected: null,
  rev: 0, sync: "loading", savedAt: null, conflict: null, error: null,
});

let state: StudioState = blank();
const listeners = new Set<() => void>();
const emit = () => { for (const fn of listeners) fn(); };

/** ما كان بالسحابة آخرَ ما قرأنا — لمقارنة «هل ما على الشاشة محفوظ؟». */
let cloudPrint = layoutFingerprint(EMPTY_LAYOUT);

function cacheLocal() {
  try { localStorage.setItem(lsKey(), serializeLayout(state)); } catch { /* مساحة ممتلئة */ }
}

function apply(l: CageLayout, sync: SyncState) {
  state = { ...state, rooms: l.rooms, cages: l.cages, rev: l.rev, ready: true, sync, conflict: null, error: null };
  cloudPrint = layoutFingerprint(l);
  cacheLocal();
  emit();
}

/* ------------------------------- الترطيب -------------------------------- */

/** يملأ التخطيطَ من السحابة. يُسجَّل بعد `hydrateClinicPrefs` فيقرأ ما وصل. */
export async function hydrateCageStudio(): Promise<void> {
  if (!sb()) {
    /* الوضعُ التجريبي: المرآةُ **هي** المصدر، ولا سحابةَ تُنازعها. */
    let raw: string | null = null;
    try { raw = localStorage.getItem(lsKey()); } catch { /* ignore */ }
    apply(parseLayout(raw), "offline");
    return;
  }
  apply(parseLayout(getCageLayoutRaw(), getCageLayoutRev()), "saved");
}

registerHydrator(hydrateCageStudio);
/* تبديلُ العيادة يُفرغ التخطيطَ فوراً: عرضُ غرفِ عيادةٍ على شاشة أخرى خطأٌ
 * يُصدَّق — ودرس 0153 أنّ التسريب يبدأ عرضاً قبل أن يصير كتابة. */
registerReset(() => { state = blank(); cloudPrint = layoutFingerprint(EMPTY_LAYOUT); emit(); });

/* -------------------------------- الحفظ --------------------------------- */

let saveT: ReturnType<typeof setTimeout> | null = null;

async function push(): Promise<void> {
  const json = serializeLayout(state);
  const client = sb();
  if (!client) { cacheLocal(); state = { ...state, sync: "offline", savedAt: Date.now() }; emit(); return; }
  state = { ...state, sync: "saving" }; emit();
  try {
    const { data, error } = await client.rpc("save_cage_layout", { p_json: json, p_base_rev: state.rev });
    if (error) throw error;
    const res = (data ?? {}) as { ok?: boolean; rev?: number; layout?: string | null };
    if (res.ok) {
      state = { ...state, rev: Number(res.rev ?? state.rev), sync: "saved", savedAt: Date.now(), error: null };
      cloudPrint = json;
      noteCageLayoutSaved(json, state.rev);
      cacheLocal();
      emit();
      return;
    }
    /* تعارض: **لا نكتب ولا نمسح**. نحمل نسخةَ السحابة بجانب نسخةِ الشاشة
       ويختار صاحبُها. حسمٌ تلقائيٌّ هنا يعني ضياعَ عملِ أحدهما بصمت. */
    const cloud = parseLayout(res.layout ?? null, Number(res.rev ?? 0));
    state = { ...state, sync: "conflict", conflict: { rev: cloud.rev, layout: cloud } };
    emit();
  } catch (e) {
    /* الفشلُ يُقال ويبقى «غير محفوظ»: كان الصمتُ يجعل العيادةَ تصدّق أنّ ما
       رسمته محفوظ. والمرآةُ المحلّية تحفظه حتى تعود الشبكة. */
    cacheLocal();
    state = { ...state, sync: "error", error: e instanceof Error ? e.message : String(e) };
    emit();
  }
}

function scheduleSave() {
  if (saveT) clearTimeout(saveT);
  /* ٦٠٠م.ث: جلسةُ بناءٍ سريعة (قفص قفص قفص…) تكتب مرّةً واحدة بدل رفعةٍ لكلّ
     ضغطة — وهذا كان أكبرَ مصدرِ «لاق» على الآيباد. */
  saveT = setTimeout(() => { saveT = null; void push(); }, 600);
}

function commit(next: Partial<StudioState>, touchesLayout = false) {
  state = { ...state, ...next };
  if (touchesLayout) {
    /* **لا كتابةَ قبل قراءة.** متجرٌ لم يُرطَّب بعدُ لا يعرف ماذا بالسحابة،
       فأيُّ حفظٍ منه حفظُ فراغٍ فوق تخطيطٍ قائم — وهو الجذرُ نفسُه. */
    if (!state.ready) { emit(); return; }
    state.sync = state.sync === "offline" ? "offline" : "dirty";
    cacheLocal();
    scheduleSave();
  }
  emit();
}

/** حفظٌ فوريٌّ بلا انتظار المهلة — تُنادى عند إخفاء الصفحة. */
export function flushCageLayout(): void {
  if (saveT) { clearTimeout(saveT); saveT = null; void push(); }
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

  /** ضمُّ رموزٍ غيرِ مرسومة إلى غرفةٍ **بقرار المستخدم**.
   *
   *  كانت `adoptCodes` تفعل هذا **تلقائياً عند كلّ فتحة شاشة**، وتبني غرفةً
   *  اسمُها «غير مصنّفة» إن ضاقت الغرف، **وترفع ذلك للسحابة**. فجهازٌ جديدٌ
   *  بذر ستّةَ أقفاصٍ ثم تبنّى الباقي بغرفةٍ واحدة ⇒ كتب ذلك فوق ترتيب
   *  العيادة. المقيس: أربعُ عياداتٍ من سبعٍ فيها غرفةٌ بهذا الاسم، وواحدةٌ
   *  فيها ثلاث. الآن: الرموزُ غيرُ المرسومة **تُعرض** (`orphanCodes`)، وهذه
   *  الدالّةُ لا تعمل إلا حين يضغط أحدٌ زراً. */
  adoptInto(roomId: string, codes: string[]): number {
    if (!state.ready) return 0;
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return 0;
    const known = new Set(state.cages.map((c) => norm(c.code)));
    const todo = [...new Set(codes.map((c) => c.trim()).filter(Boolean))].filter((c) => !known.has(norm(c)));
    if (!todo.length) return 0;
    const cages = [...state.cages];
    let rooms = state.rooms;
    let grown = { ...room };
    const freeIn = (r: Room3D): Array<[number, number]> => {
      const out: Array<[number, number]> = [];
      for (let jj = 0; jj < r.d; jj++) for (let ii = 0; ii < r.w; ii++) {
        const x = r.x + ii, z = r.z + jj;
        if (!cages.some((c) => c.x === x && c.z === z && (c.level ?? 0) === 0)) out.push([x, z]);
      }
      return out;
    };
    let free = freeIn(grown);
    /* الغرفةُ تتعمّق صفوفاً حتى تسع — **ولا تُبنى غرفةٌ باسمٍ مخترَع**.
       الغرفُ تُسمّى بيد العيادة لا بيد الشِفرة. */
    while (free.length < todo.length) {
      grown = { ...grown, d: grown.d + 1 };
      free = freeIn(grown);
    }
    if (grown.d !== room.d) rooms = rooms.map((r) => (r.id === roomId ? grown : r));
    todo.forEach((code, k) => {
      const cell = free[k];
      if (cell) cages.push({ code, x: cell[0], z: cell[1] });
    });
    commit({ rooms, cages }, true);
    return todo.length;
  },

  /** الرموزُ التي يعرفها النظامُ وليست مرسومة — **عرضٌ مشتقٌّ لا كتابة**. */
  orphans(known: Iterable<string>): string[] {
    return state.ready ? orphanCodes(state, known) : [];
  },

  /** هل ما على الشاشة هو نفسُه ما بالسحابة؟ يستعمله زرُّ «تحقّق». */
  matchesCloud(): boolean {
    return layoutFingerprint(state) === cloudPrint;
  },

  /** حسمُ التعارض بقرار المستخدم — لا يُحسم تلقائياً أبداً. */
  resolveConflict(take: "cloud" | "mine") {
    const c = state.conflict;
    if (!c) return;
    if (take === "cloud") { apply(c.layout, "saved"); return; }
    /* «افرض نسختي»: نُعيد البناءَ على نسخة السحابة الحالية ثم نحفظ — فالكتابةُ
       تمرّ من نفس الشرط، ولا يوجد بابٌ خلفيٌّ يدوس بلا نسخة. */
    state = { ...state, rev: c.rev, conflict: null, sync: "dirty" };
    emit();
    void push();
  },

  /** تحميلُ تخطيطٍ من سجلّ الترتيب أو من مرآة جهازٍ قديم — **معاينةٌ ثم حفظ**:
   *  يُوضع بالشاشة ويُعلَّم «غير محفوظ»، فيراه صاحبُه قبل أن يُثبَّت. */
  loadDraft(raw: string | null) {
    if (!state.ready) return;
    const l = parseLayout(raw, state.rev);
    state = { ...state, rooms: l.rooms, cages: l.cages, selected: null, sync: "dirty", conflict: null };
    cacheLocal();
    emit();
    scheduleSave();
  },

  /** إعادةُ القراءة من السحابة — ترمي ما لم يُحفظ عمداً، بزرٍّ صريح. */
  async reload(): Promise<void> {
    state = { ...state, ready: false, sync: "loading" };
    emit();
    const { hydrateClinicPrefs } = await import("@/lib/settings");
    await hydrateClinicPrefs().catch(() => undefined);
    await hydrateCageStudio();
  },
};

/** نسخُ التخطيط السابقة من سجلّ التدقيق (0195) — «ما دِيس يُرجَع».
 *
 *  ترمي على الفشل ولا ترجع قائمةً فارغة: قائمةٌ فارغةٌ عن خطأٍ تقول للعيادة
 *  «ماكو نسخ» وهي موجودة، فتيأس من استرجاع ترتيبها. (درسُ `listCouriers`.) */
export async function cageLayoutHistory(limit = 40): Promise<Array<{ at: string; actor: string | null; layout: string }>> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client.rpc("cage_layout_history", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as Array<{ at: string; actor: string | null; layout: string }>;
}

/** مرآةُ المفتاح القديم على هذا الجهاز — إن وُجدت. تُعرض لصاحبها ليقرّر؛
 *  ولا تُرفع تلقائياً أبداً: المفتاحُ بلا اسم عيادة، فقد يكون لعيادةٍ أخرى. */
export function legacyDeviceLayout(): string | null {
  try { return localStorage.getItem(LEGACY_LS_KEY); } catch { return null; }
}

export function useCageStudio(): StudioState {
  return useSyncExternalStore(cageStudio.subscribe, cageStudio.get);
}
