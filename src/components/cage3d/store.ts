import { useSyncExternalStore } from "react";
import { orphanCodes, type LayoutRoom, type LayoutCage, type DoorSide } from "@/lib/cageLayout";
import { sb, registerHydrator, registerReset } from "@/lib/clinicSync";
import { getActiveClinicId } from "@/lib/clinics";
import i18next from "i18next";

/* ============================================================================
 * cage3dStore — الغرفُ والأقفاص **صفوفاً** (0219، `docs/cages-rebuild-plan.md`).
 *
 * ── لماذا أُعيد بناؤه ───────────────────────────────────────────────────
 * «الأقفاص وترتيبُها تعبر من عيادةٍ للأخرى». كان التخطيطُ رسمةً واحدة بنصٍّ في
 * `clinic_prefs`، يُقرأ من مرآة الجهاز ويُحفظ كاملاً بشرط رقم نسخة. فمرآةٌ مسمومة
 * (عيادةٌ أخرى على نفس الجهاز، أو مشغّلٌ انقلبت جلستُه) تُعرض «محفوظة بالسحابة»،
 * ثم تُرفع كاملةً من الباب الشرعيّ لأنّ أرقام النسخ ١–٢ تتصادف بين العيادات.
 *
 * ── القواعدُ الآن ───────────────────────────────────────────────────────
 *   • **لا مرآة.** التخطيطُ يُقرأ من جدولَيه كأيّ قائمة (RLS يختمه بعيادة الجلسة)،
 *     ولا يُكتب بـ`localStorage` بالوضع السحابيّ إطلاقاً.
 *   • **الكتابةُ فرقٌ لا رسمة.** كلُّ فعلٍ يعدّل الحالة محلّياً، ثم يُحسب الفرقُ عن
 *     آخر ما أكّده الخادم (`base`) ويُرسل عملياتٍ على صفوفٍ بعينها بمعاملةٍ واحدة
 *     (`cage_layout_apply`). أسوأُ كتابةٍ ضالّة تمسّ صفّاً لا عيادة.
 *   • **مختومةٌ بعيادتها.** الدفعةُ تحمل العيادةَ التي قالها الخادمُ نفسُه لحظةَ
 *     القراءة (`my_workspace`) — لا مفتاحَ المتصفّح. تبدّلت الجلسة؟ تُرفض الدفعةُ كلُّها.
 *   • **الفشلُ يُسمَع.** رفضٌ أو شبكةٌ منقطعة ⇒ الشاشةُ ترجع لآخر ما أكّده الخادم
 *     وتقول لماذا. لا طابورَ مؤجَّلاً ولا «راح نعيد المحاولة» كاذبة.
 *   • **لا بذرةَ ولا تبنٍّ صامت** (كما قبل): فراغٌ صادق، والضمُّ بضغطة.
 * ==========================================================================*/

/** خطوة الشبكة = **ضِعف مقاس القفص** بالضبط: الفجوةُ بين قفصٍ وجاره قفصٌ كامل. */
export const CELL = 6.4;
export type Mode = "manage" | "build";
export type { DoorSide };

export const LED_CHOICES = ["#22d3ee", "#fb923c", "#f43f5e", "#4ade80", "#a78bfa", "#e2e8f0"] as const;

export type Room3D = LayoutRoom;
/** القفصُ بمعرّف صفّه — الرقمُ يتبدّل والمعرّفُ باقٍ، فالساكنُ يتبعه.
 *  و`room_id` غرفتُه كما قالها الخادم (احتياطٌ إن لم تحوِه هندسةُ غرفةٍ). */
export type CagePlacement = LayoutCage & { id: string; room_id?: string };

/** حالةُ المزامنة كما تُقال للمستخدم — الشاشةُ لا تدّعي حفظاً لم يحصل. */
export type SyncState = "loading" | "saved" | "saving" | "error";

interface StudioState {
  mode: Mode;
  /** وصلت الصفوفُ من الخادم (أو من المرآة بالوضع التجريبي) — المصفوفةُ الفارغة وصولٌ. */
  ready: boolean;
  rooms: Room3D[];
  cages: CagePlacement[];
  selected: string | null;
  sync: SyncState;
  savedAt: number | null;
  /** آخرُ رفضٍ أو فشل — الكائنُ كما رماه الخادم، تترجمه الشاشةُ بـ`describeDbError`. */
  error: unknown;
}

const norm = (c: string) => c.trim().toLowerCase();

const blank = (): StudioState => ({
  mode: "manage", ready: false, rooms: [], cages: [], selected: null,
  sync: "loading", savedAt: null, error: null,
});

let state: StudioState = blank();
const listeners = new Set<() => void>();
const emit = () => { for (const fn of listeners) fn(); };

/** آخرُ ما أكّده الخادم — الفرقُ عنه هو ما يُرسل، وإليه نرجع عند الرفض. */
let base: { rooms: Room3D[]; cages: CagePlacement[] } = { rooms: [], cages: [] };
/** العيادةُ التي قُرئت منها الصفوف — تُختم بها كلُّ دفعة. */
let stamp: string | null = null;
/** يتقدّم مع كلّ تصفيرٍ للعيادة: ردٌّ وصل بعده لعيادةٍ سابقة يُرمى. */
let gen = 0;

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ------------------------------- الصفوف --------------------------------- */

export interface RoomRow {
  id: string; name: string; x: number; z: number; w: number; d: number;
  door_side: DoorSide | null; door_at: number | null;
}
export interface CageRow {
  id: string; room_id: string; code: string; x: number; z: number;
  color: string | null; facing: number; level: number;
}

export const roomFromRow = (r: RoomRow): Room3D => ({
  id: r.id, name: r.name, x: r.x, z: r.z, w: r.w, d: r.d,
  ...(r.door_side ? { door: { side: r.door_side, at: r.door_at ?? 0 } } : {}),
});

export const cageFromRow = (c: CageRow): CagePlacement => {
  const out: CagePlacement = { id: c.id, room_id: c.room_id, code: c.code, x: c.x, z: c.z };
  if (c.color) out.color = c.color;
  if (c.facing === 1 || c.facing === 2 || c.facing === 3) out.facing = c.facing;
  if (c.level === 1) out.level = 1;
  return out;
};

const roomRow = (r: Room3D): RoomRow => ({
  id: r.id, name: r.name.trim(), x: r.x, z: r.z, w: r.w, d: r.d,
  door_side: r.door?.side ?? null, door_at: r.door ? r.door.at : null,
});

export type CageOp =
  | ({ op: "room_insert" | "room_update" } & RoomRow)
  | { op: "room_delete"; id: string }
  | ({ op: "cage_insert" | "cage_update" } & CageRow)
  | { op: "cage_delete"; id: string };

/** عملياتُ الصفوف التي تنقل `from` إلى `to`. القفصُ يُنسب لأوّل غرفةٍ تحويه
 *  (نفسُ `roomAt`)، والخادمُ يرفض قفصاً بلا غرفة — فلا يُرسل مثلُه أصلاً. */
export function diffOps(
  from: { rooms: Room3D[]; cages: CagePlacement[] },
  to: { rooms: Room3D[]; cages: CagePlacement[] },
): CageOp[] {
  const ops: CageOp[] = [];
  const fromRooms = new Map(from.rooms.map((r) => [r.id, roomRow(r)]));
  const toRooms = new Map(to.rooms.map((r) => [r.id, roomRow(r)]));
  for (const [id, row] of toRooms) {
    const was = fromRooms.get(id);
    if (!was) ops.push({ op: "room_insert", ...row });
    else if (JSON.stringify(was) !== JSON.stringify(row)) ops.push({ op: "room_update", ...row });
  }
  for (const id of fromRooms.keys()) if (!toRooms.has(id)) ops.push({ op: "room_delete", id });

  const rowOf = (s: { rooms: Room3D[] }, c: CagePlacement): CageRow | null => {
    const room = s.rooms.find((r) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d)
      ?? (c.room_id ? s.rooms.find((r) => r.id === c.room_id) : undefined);
    if (!room) return null;
    return {
      id: c.id, room_id: room.id, code: c.code.trim(), x: c.x, z: c.z,
      color: c.color ?? null, facing: c.facing ?? 0, level: c.level ?? 0,
    };
  };
  const fromCages = new Map<string, CageRow | null>(from.cages.map((c) => [c.id, rowOf(from, c)]));
  const seen = new Set<string>();
  for (const c of to.cages) {
    seen.add(c.id);
    const row = rowOf(to, c);
    if (!row) throw Object.assign(new Error("cage_outside_room"), {
      code: "P0001", hint: i18next.t("cages.errOutsideRoom", { code: c.code, defaultValue: "القفص {{code}} صار خارج كل غرفة — ما انحفظ. حدّث اللوحة." }),
    });
    const was = fromCages.get(c.id);
    if (was === undefined) ops.push({ op: "cage_insert", ...row });
    else if (JSON.stringify(was) !== JSON.stringify(row)) ops.push({ op: "cage_update", ...row });
  }
  for (const id of fromCages.keys()) if (!seen.has(id)) ops.push({ op: "cage_delete", id });
  return ops;
}

/* ------------------------------- الترطيب -------------------------------- */

/* الدفعةُ الجارية — معرّفةٌ قبل الترطيب: المُرطِّبُ المتأخّر يُنادى فورَ تسجيله. */
let inflight: Promise<void> | null = null;
let again = false;

function hasPending(): boolean {
  try { return diffOps(base, state).length > 0; } catch { return true; }
}

type Loaded = { clinic: string; rooms: Room3D[]; cages: CagePlacement[] };

const switchedError = () => Object.assign(new Error("clinic_switched"), {
  code: "P0001", hint: i18next.t("cages.errSwitched", "تبدّلت العيادة أثناء التحميل — حدّث الصفحة."),
});
const isSwitched = (e: unknown) => (e as { message?: string } | null)?.message === "clinic_switched";

async function loadCloud(): Promise<Loaded> {
  const client = sb();
  if (!client) throw new Error("no_client");
  /* العيادةُ كما يراها الخادم — هي ما تفحصه `cage_layout_apply`، لا مفتاحُ المتصفّح
     (والاثنان قد يفترقان: ذاك جذرُ صنف 0153). */
  const ws = await client.rpc("my_workspace");
  if (ws.error) throw ws.error;
  const clinic = (ws.data as { clinic_id?: string | null } | null)?.clinic_id ?? null;
  if (!clinic) throw Object.assign(new Error("no_clinic"), { code: "P0001", hint: i18next.t("cages.errNoClinic", "ما لكينا عيادة للجلسة — سجّل دخول من جديد.") });
  /* السقفان ٤٠ غرفة و٤٠٠ قفص (محفّزا 0219) تحت حدّ الألف صفّ للطلب — فطلبٌ واحد
     لكلّ جدولٍ يرجع الكلَّ أو يرمي، لا نصفاً يُصدَّق. */
  const [r, c] = await Promise.all([
    client.from("cage_rooms").select("id,clinic_id,name,x,z,w,d,door_side,door_at,created_at")
      .order("created_at").order("id").limit(1000),
    client.from("cages").select("id,clinic_id,room_id,code,x,z,color,facing,level")
      .order("created_at").order("id").limit(1000),
  ]);
  if (r.error) throw r.error;
  if (c.error) throw c.error;
  const rows = [...(r.data ?? []), ...(c.data ?? [])] as Array<{ clinic_id: string }>;
  /* قراءةٌ بعيادةٍ غير التي قالها الخادمُ قبل لحظة = هويّةٌ تبدّلت بين الطلبين.
     لا نعرض ولا نبني على خليط. */
  if (rows.some((x) => x.clinic_id !== clinic)) throw switchedError();
  return {
    clinic,
    rooms: ((r.data ?? []) as RoomRow[]).map(roomFromRow),
    cages: ((c.data ?? []) as CageRow[]).map(cageFromRow),
  };
}

async function loadDemo(): Promise<Loaded> {
  const { demoCageLoad } = await import("@/lib/demoCages");
  const clinic = getActiveClinicId() || "default";
  const { rooms, cages } = demoCageLoad(clinic);
  return { clinic, rooms: rooms.map(roomFromRow), cages: cages.map(cageFromRow) };
}

let reloadAfterSave = false;

/** يملأ التخطيطَ من الخادم. لا يدهس تعديلاً لم يُحفظ بعد: يؤجَّل حتى يُحسم. */
export async function hydrateCageStudio(): Promise<void> {
  if (inflight || (state.ready && hasPending())) { reloadAfterSave = true; return; }
  const my = gen;
  if (!state.ready) { state = { ...state, sync: "loading" }; emit(); }
  try {
    const l = sb() ? await loadCloud() : await loadDemo();
    if (my !== gen) return;
    if (inflight || (state.ready && hasPending())) { reloadAfterSave = true; return; }
    /* الخادمُ صار يقول عيادةً غير التي فُتحت عليها الشاشة (انقضت جلسةُ المشغّل،
       تبويبٌ آخر دخل عيادةً ثانية) — لا تُبدَّل اللوحةُ بصمت لأقفاص عيادةٍ أخرى:
       تتوقّف وتقول. التبديلُ المقصود يمرّ من `registerReset` فيُصفّر الختم أوّلاً. */
    if (stamp && l.clinic !== stamp) throw switchedError();
    stamp = l.clinic;
    base = { rooms: l.rooms, cages: l.cages };
    const selected = state.selected && l.cages.some((c) => c.code === state.selected) ? state.selected : null;
    state = { ...state, ready: true, rooms: l.rooms, cages: l.cages, selected, sync: "saved", error: null };
    emit();
  } catch (e) {
    if (my !== gen) return;
    /* الفشلُ يُقال ويُبقي آخرَ ما وصل (إن وصل): لا لوحةَ فارغةً «كأنها الحقيقة». */
    state = { ...state, sync: "error", error: e };
    emit();
    throw e;
  }
}

registerHydrator(async () => { await hydrateCageStudio().catch(() => undefined); });
/* تبديلُ العيادة يُفرغ كلَّ شيء فوراً، ويُسقط أيَّ ردٍّ أو دفعةٍ لم تُحسم بعد. */
registerReset(() => {
  gen++;
  state = blank();
  base = { rooms: [], cages: [] };
  stamp = null;
  reloadAfterSave = false;
  inflight = null;
  again = false;
  emit();
});

/* -------------------------------- الحفظ --------------------------------- */

async function send(clinic: string, ops: CageOp[]): Promise<void> {
  const client = sb();
  if (!client) {
    const { demoCageApply } = await import("@/lib/demoCages");
    demoCageApply(clinic, ops);
    return;
  }
  const { error } = await client.rpc("cage_layout_apply", { p_clinic: clinic, p_ops: ops });
  if (error) throw error;
}

function persist(): void {
  if (!state.ready) return;
  if (inflight) { again = true; return; }
  const my = gen;
  const target = { rooms: state.rooms, cages: state.cages };
  let ops: CageOp[];
  try { ops = diffOps(base, target); } catch (e) { fail(e); return; }
  if (!ops.length) return;
  const clinic = stamp;
  if (!clinic) { fail(Object.assign(new Error("no_clinic"), { code: "P0001", hint: i18next.t("cages.errNoClinic", "ما لكينا عيادة للجلسة — سجّل دخول من جديد.") })); return; }
  state = { ...state, sync: "saving" };
  emit();
  inflight = (async () => {
    try {
      await send(clinic, ops);
      if (my !== gen) return;
      /* الخادمُ جرّ نصَّ كلّ ساكنٍ مع رقم قفصه بنفس المعاملة — ذاكرةُ النزلاء
         المحلّية تتبعه بلا كتابة، وإلا بدا الساكنُ «بلا قفص» حتى الترطيب القادم. */
      const was = new Map(base.cages.map((c) => [c.id, c.code]));
      const renames = ops.flatMap((o) => (o.op === "cage_update" && was.has(o.id) && norm(was.get(o.id) as string) !== norm(o.code)
        ? [{ from: was.get(o.id) as string, to: o.code }] : []));
      if (renames.length) void import("@/lib/opsStore").then((m) => m.opsStore.mirrorCageRenames(renames));
      base = target;
      state = { ...state, sync: hasPending() ? "saving" : "saved", savedAt: Date.now(), error: null };
      emit();
    } catch (e) {
      if (my !== gen) return;
      again = false;
      fail(e);
    } finally {
      if (my === gen) {
        inflight = null;
        if (again) { again = false; persist(); }
        else if (reloadAfterSave) { reloadAfterSave = false; void hydrateCageStudio().catch(() => undefined); }
      }
    }
  })();
}

/** رفضٌ أو فشل: الشاشةُ ترجع لآخر ما أكّده الخادم وتقول لماذا، ثم نقرأ من جديد
 *  (قد يكون جهازٌ ثانٍ عدّل ما رفضنا بسببه). */
function fail(e: unknown) {
  state = { ...state, rooms: base.rooms, cages: base.cages, selected: null, sync: "error", error: e };
  emit();
  /* هويّةٌ تبدّلت تحت الشاشة: لا قراءةَ تلقائية (ستجلب أقفاصَ عيادةٍ أخرى) —
     تبقى الشاشةُ على آخر ما أكّده الخادم لعيادتها وتطلب تحديث الصفحة. */
  if (isSwitched(e)) return;
  if (!inflight) void hydrateCageStudio().catch(() => undefined);
  else reloadAfterSave = true;
}

function commit(next: Partial<StudioState>, touchesLayout = false) {
  if (touchesLayout && !state.ready) return;   // لا كتابةَ قبل قراءة
  state = { ...state, ...next };
  emit();
  if (touchesLayout) queueMicrotask(persist);  // أفعالُ الضغطة الواحدة تُجمع بدفعةٍ واحدة
}

/* ------------------------------- استعلامات ------------------------------- */

export const roomAt = (s: Pick<StudioState, "rooms">, x: number, z: number): Room3D | null =>
  s.rooms.find((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) ?? null;

export const cageAt = (s: Pick<StudioState, "cages">, x: number, z: number, level: 0 | 1 = 0): CagePlacement | null =>
  s.cages.find((c) => c.x === x && c.z === z && (c.level ?? 0) === level) ?? null;

/** القفص العلوي بالخلية — إن وُجد. */
export const upperAt = (s: Pick<StudioState, "cages">, x: number, z: number): CagePlacement | null => cageAt(s, x, z, 1);

export const cellFree = (s: Pick<StudioState, "rooms" | "cages">, x: number, z: number): boolean =>
  !!roomAt(s, x, z) && !cageAt(s, x, z);

export function bounds(s: Pick<StudioState, "rooms">) {
  if (!s.rooms.length) return { minX: 0, minZ: 0, maxX: 3, maxZ: 2 };
  const minX = Math.min(...s.rooms.map((r) => r.x));
  const minZ = Math.min(...s.rooms.map((r) => r.z));
  const maxX = Math.max(...s.rooms.map((r) => r.x + r.w));
  const maxZ = Math.max(...s.rooms.map((r) => r.z + r.d));
  return { minX, minZ, maxX, maxZ };
}

export function cellWorld(s: Pick<StudioState, "rooms">, x: number, z: number): [number, number] {
  const b = bounds(s);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [(x + 0.5 - cx) * CELL, (z + 0.5 - cz) * CELL];
}

export function cornerWorld(s: Pick<StudioState, "rooms">, x: number, z: number): [number, number] {
  const b = bounds(s);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return [(x - cx) * CELL, (z - cz) * CELL];
}

export function nextCode(s: Pick<StudioState, "rooms" | "cages">, room: Room3D): string {
  const base100 = (s.rooms.indexOf(room) + 1) * 100;
  const used = new Set(s.cages.map((c) => norm(c.code)));
  for (let i = 1; i < 100; i++) if (!used.has(String(base100 + i))) return String(base100 + i);
  return String(base100 + Math.floor(Math.random() * 900) + 100);
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

const inRoom = (room: Room3D) => (c: { x: number; z: number }) =>
  c.x >= room.x && c.x < room.x + room.w && c.z >= room.z && c.z < room.z + room.d;

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
      id: newId(),
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
    const cut = state.cages.some((c) => inRoom(room)(c) && !inRoom(next)(c));
    if (cut) return { ok: false, reason: "occupied" };
    const door = next.door
      ? { ...next.door, at: Math.min(next.door.at, (next.door.side === "front" || next.door.side === "back" ? W : D) - 1) }
      : undefined;
    commit({ rooms: state.rooms.map((r) => (r.id === id ? { ...next, door } : r)) }, true);
    return { ok: true };
  },

  /** حذف غرفةٍ مع أقفاصها — والخادمُ يرفض الدفعةَ كلَّها إن كان بقفصٍ منها ساكن. */
  removeRoom(id: string) {
    const room = state.rooms.find((r) => r.id === id);
    if (!room) return;
    const inside = new Set(state.cages.filter(inRoom(room)).map((c) => c.id));
    const gone = new Set(state.cages.filter((c) => inside.has(c.id)).map((c) => c.code));
    commit({
      rooms: state.rooms.filter((r) => r.id !== id),
      cages: state.cages.filter((c) => !inside.has(c.id)),
      selected: state.selected && gone.has(state.selected) ? null : state.selected,
    }, true);
  },

  placeCage(x: number, z: number, code?: string): CagePlacement | null {
    if (!cellFree(state, x, z)) return null;
    const room = roomAt(state, x, z)!;
    const c = code?.trim() || nextCode(state, room);
    if (state.cages.some((k) => norm(k.code) === norm(c))) return null;
    const cage: CagePlacement = { id: newId(), code: c, x, z };
    commit({ cages: [...state.cages, cage] }, true);
    return cage;
  },

  /** تغيير رقم/لون القفص — التكرار يُرفض. والساكنُ يتبع قفصَه بالخادم (0219). */
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
    commit({ cages, selected: state.selected === code ? null : state.selected }, true);
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
    const b = state.cages.find((c) => c.code === code);
    if (!b || (b.level ?? 0) !== 0) return null;
    if (upperAt(state, b.x, b.z)) return null;
    const room = roomAt(state, b.x, b.z);
    const cage: CagePlacement = { id: newId(), code: nextCode(state, room ?? state.rooms[0]), x: b.x, z: b.z, level: 1, facing: b.facing };
    commit({ cages: [...state.cages, cage] }, true);
    return cage;
  },

  /** صبغ ليد كل أقفاص غرفة بلون واحد دفعة وحدة — بدل قفص قفص. */
  paintRoom(roomId: string, color: string): number {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return 0;
    const n = state.cages.filter(inRoom(room)).length;
    if (n) commit({ cages: state.cages.map((c) => (inRoom(room)(c) ? { ...c, color } : c)) }, true);
    return n;
  },

  /** ترقيم غرفة كاملة تلقائياً من أساس (مثال ٢٠١، ٢٠٢…) بترتيب الصفوف —
   *  الأرضي قبل العلوي بكل خلية، وببادئةٍ نصية اختيارية («أ-١»، «ع٢٠١»…).
   *  الخادمُ يطبّقه بمعاملةٍ واحدة ويجرّ نصوصَ السكّان معه (0219). */
  renumberRoom(roomId: string, base0: number, prefix = ""): Array<{ from: string; to: string }> {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !Number.isFinite(base0)) return [];
    const pfx = prefix.trim();
    const inside = state.cages.filter(inRoom(room))
      .sort((a, b) => (a.z - b.z) || (a.x - b.x) || ((a.level ?? 0) - (b.level ?? 0)));
    const outside = new Set(state.cages.filter((c) => !inside.includes(c)).map((c) => norm(c.code)));
    const changes: Array<{ from: string; to: string }> = [];
    let n = Math.max(1, Math.floor(base0));
    const assigned = new Map<string, string>();
    for (const c of inside) {
      while (outside.has(norm(`${pfx}${n}`))) n++;
      assigned.set(c.id, `${pfx}${n++}`);
    }
    const cages = state.cages.map((c) => {
      const to = assigned.get(c.id);
      if (!to) return c;
      if (to !== c.code) changes.push({ from: c.code, to });
      return { ...c, code: to };
    });
    commit({ cages, selected: null }, true);
    return changes;
  },

  /** ضمُّ رموزٍ غيرِ مرسومة إلى غرفةٍ **بقرار المستخدم** — والخادمُ يربط كلَّ
   *  راقدٍ برقمه بقفصه الجديد تلقائياً. */
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
    while (free.length < todo.length) {
      grown = { ...grown, d: grown.d + 1 };
      free = freeIn(grown);
    }
    if (grown.d !== room.d) rooms = rooms.map((r) => (r.id === roomId ? grown : r));
    todo.forEach((code, k) => {
      const cell = free[k];
      if (cell) cages.push({ id: newId(), code, x: cell[0], z: cell[1] });
    });
    commit({ rooms, cages }, true);
    return todo.length;
  },

  /** الرموزُ التي يعرفها النظامُ وليست مرسومة — **عرضٌ مشتقٌّ لا كتابة**. */
  orphans(known: Iterable<string>): string[] {
    return state.ready ? orphanCodes(state, known) : [];
  },

  /** إعادةُ القراءة من الخادم — زرُّ «أعد المحاولة». */
  async reload(): Promise<void> {
    await hydrateCageStudio();
  },
};

/* العودةُ للتبويب تقرأ من جديد: جهازٌ ثانٍ ربما عدّل أثناء الغياب، فلا تبقى الشاشةُ
   على ما كان. لا تدهس تعديلاً معلّقاً (`hydrateCageStudio` يؤجّل نفسه). */
let lastBack = 0;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state.ready) return;
    const now = Date.now();
    if (now - lastBack < 15000) return;
    lastBack = now;
    void hydrateCageStudio().catch(() => undefined);
  });
}

export function useCageStudio(): StudioState {
  return useSyncExternalStore(cageStudio.subscribe, cageStudio.get);
}
