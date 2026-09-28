import type { CageOp, RoomRow, CageRow } from "@/components/cage3d/store";
import { parseLayout } from "./cageLayout";
import { loadDB, saveDB } from "./demoStore";
import type { Admission, DemoDB } from "@/types";

/* ============================================================================
 * مرآةُ 0219 للوضع التجريبي — صفوفُ الغرف والأقفاص **بمفتاح العيادة**، وبنفس حرّاس
 * الخادم ونفس رموز رفضه (فحوصُ المنطق تجري على هذه النسخة — قاعدة payrollDemo).
 *   • الرقمُ واحدٌ بالعيادة، والخليّةُ واحدةٌ بطابقها، والسقفان ٤٠ غرفة و٤٠٠ قفص.
 *   • حذفُ قفصٍ مسكون أو غرفةٍ فيها أقفاص يُرفض.
 *   • تحديثُ صفٍّ غير موجود يُرفض لا يُخلق.
 *   • الدفعةُ ذرّية: تُحسب على نسخة، وتُحفظ كلُّها أو لا شيء.
 *   • إعادةُ تسمية القفص تجرّ نصَّ ساكنه (مرآةُ `cages_sync_admissions`).
 * ==========================================================================*/

const KEY = (clinic: string) => `vp_demo_cage_rows_${clinic}`;
/** مرآةُ التخطيط القديمة بالوضع التجريبي — تُحوَّل صفوفاً مرّةً واحدة ثم تُحذف. */
const OLD_KEY = (clinic: string) => `vp_cage3d_layout_${clinic}`;

interface Rows { rooms: RoomRow[]; cages: CageRow[] }

const norm = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();

/** رفضٌ برمز الخادم نفسه، والجملةُ **مفتاحٌ يُترجم عند العرض** (`cageErrorText`):
 *  هذه الوحدةُ تُحمَّل من شِفرة الإقلاع (repoDemo) قبل وصول النصف البارد من القاموس،
 *  فترجمتُها هنا كانت سترسم مفتاحاً خاماً. نفسُ نصّ الـhint بـ0219. */
function refuse(code: string, key: string, vars: Record<string, string> = {}): never {
  throw Object.assign(new Error(code), { code: "P0001", cageErr: key, vars });
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function read(clinic: string): Rows | null {
  try {
    const raw = localStorage.getItem(KEY(clinic));
    if (!raw) return null;
    const j = JSON.parse(raw) as Rows;
    return { rooms: Array.isArray(j.rooms) ? j.rooms : [], cages: Array.isArray(j.cages) ? j.cages : [] };
  } catch { return null; }
}

function write(clinic: string, rows: Rows) {
  // يرمي: تخطيطٌ لم يُحفظ ويُقال «انحفظ» كذبٌ يُصدَّق.
  localStorage.setItem(KEY(clinic), JSON.stringify(rows));
}

/** يقرأ صفوف العيادة التجريبية — وأوّلَ مرّةٍ يحوّل مرآتَها القديمة صفوفاً (رسمُ زبونٍ
 *  يجرّب النظام لا يُمحى بالتحديث). */
export function demoCageLoad(clinic: string): Rows {
  const have = read(clinic);
  if (have) return have;
  let old: string | null = null;
  try { old = localStorage.getItem(OLD_KEY(clinic)); } catch { /* swallow-ok: جهازٌ بلا تخزين = لا رسمَ قديم */ }
  const l = parseLayout(old);
  const rooms: RoomRow[] = l.rooms.map((r) => ({
    id: newId(), name: r.name, x: r.x, z: r.z, w: r.w, d: r.d,
    door_side: r.door?.side ?? null, door_at: r.door ? r.door.at : null,
  }));
  const cages: CageRow[] = [];
  for (const c of l.cages) {
    const idx = l.rooms.findIndex((r) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d);
    if (idx < 0) continue;
    cages.push({
      id: newId(), room_id: rooms[idx].id, code: c.code, x: c.x, z: c.z,
      color: c.color ?? null, facing: c.facing ?? 0, level: c.level ?? 0,
    });
  }
  const rows = { rooms, cages };
  write(clinic, rows);
  if (old != null) { try { localStorage.removeItem(OLD_KEY(clinic)); } catch { /* swallow-ok: المرآةُ القديمة لا تُقرأ بعد اليوم */ } }
  return rows;
}

function occupantOf(db: DemoDB, code: string, exceptId?: string): Admission | null {
  const k = norm(code);
  if (!k) return null;
  return (db.admissions ?? []).find((a) => a.status !== "discharged" && a.id !== exceptId && norm(a.cage) === k) ?? null;
}

function petName(db: DemoDB, a: Admission): string {
  return (db.pets ?? []).find((p) => p.id === a.pet_id)?.name ?? "—";
}

/** يطبّق دفعةً بنفس ترتيب `cage_layout_apply` وحرّاسها — كلُّها أو لا شيء. */
export function demoCageApply(clinic: string, ops: CageOp[]): void {
  const cur = demoCageLoad(clinic);
  const rooms = cur.rooms.map((r) => ({ ...r }));
  let cages = cur.cages.map((c) => ({ ...c }));
  const db = loadDB();
  const renames: Array<{ from: string; to: string }> = [];

  for (const o of ops) if (o.op === "cage_delete") {
    const c = cages.find((x) => x.id === o.id);
    if (!c) continue;
    const occ = occupantOf(db, c.code);
    if (occ) refuse("cage_occupied_delete", "errOccupiedDelete", { code: c.code, name: petName(db, occ) });
    cages = cages.filter((x) => x.id !== o.id);
  }
  for (const o of ops) if (o.op === "room_insert") {
    if (rooms.length >= 40) refuse("too_many_rooms", "errTooManyRooms");
    const { op: _op, ...row } = o;
    rooms.push(row);
  }
  for (const o of ops) if (o.op === "room_update") {
    const i = rooms.findIndex((r) => r.id === o.id);
    if (i < 0) refuse("cage_row_gone", "errRoomGone");
    const { op: _op, ...row } = o;
    rooms[i] = row;
  }
  for (const o of ops) if (o.op === "cage_update") {
    const i = cages.findIndex((c) => c.id === o.id);
    if (i < 0) refuse("cage_row_gone", "errCageGone");
    const { op: _op, ...row } = o;
    if (norm(cages[i].code) !== norm(row.code)) renames.push({ from: cages[i].code, to: row.code });
    cages[i] = row;
  }
  for (const o of ops) if (o.op === "cage_insert") {
    if (cages.length >= 400) refuse("too_many_cages", "errTooManyCages");
    const { op: _op, ...row } = o;
    cages.push(row);
  }
  // الحرّاسُ على الحالة النهائية (مرآةُ الترقيم بمرحلتين: التبادلُ الداخليّ يمرّ).
  const codes = new Map<string, number>();
  const cells = new Map<string, number>();
  for (const c of cages) {
    const home = rooms.find((r) => r.id === c.room_id);
    if (!home) refuse("room_cross_clinic", "errCrossClinic");
    if (!(c.x >= home.x && c.x < home.x + home.w && c.z >= home.z && c.z < home.z + home.d)) {
      refuse("cage_outside_room", "errOutsideRoom", { code: c.code.trim() });
    }
    const k = norm(c.code);
    if (!k) refuse("cage_code_empty", "errCodeEmpty");
    codes.set(k, (codes.get(k) ?? 0) + 1);
    if ((codes.get(k) ?? 0) > 1) refuse("code_twin", "errCodeTwin", { code: c.code.trim() });
    const cell = `${c.x}|${c.z}|${c.level}`;
    cells.set(cell, (cells.get(cell) ?? 0) + 1);
    if ((cells.get(cell) ?? 0) > 1) refuse("cage_cell_taken", "errCellTaken");
  }
  for (const o of ops) if (o.op === "room_delete") {
    if (!rooms.some((r) => r.id === o.id)) continue;
    if (cages.some((c) => c.room_id === o.id)) refuse("room_not_empty", "errRoomNotEmpty");
    const i = rooms.findIndex((r) => r.id === o.id);
    rooms.splice(i, 1);
  }

  // الساكنُ يتبع رقمَ قفصه — بلا حركةٍ بسجلّه (الحيوانُ لم يتحرّك).
  if (renames.length) {
    // الساكنون يُحسمون **قبل** أيّ تبديل: تبادلُ ١٠١↔١٠٢ كان سيحرّك الأوّلَ مرّتين.
    const moves: Array<[Admission, string]> = [];
    const drawnBefore = new Set(cur.cages.map((c) => norm(c.code)));
    for (const r of renames) {
      const occ = occupantOf(db, r.from);
      if (!occ) continue;
      // مرآةُ code_held_by_orphan: راقدٌ غيرُ مربوط يحمل الرقمَ الجديد = راقدان بنفس الرقم.
      const orphan = (db.admissions ?? []).find((a) => a.status !== "discharged" && norm(a.cage) === norm(r.to) && !drawnBefore.has(norm(a.cage)));
      if (orphan) refuse("code_held_by_orphan", "errCodeHeldByOrphan", { code: r.to.trim(), name: petName(db, orphan) });
      moves.push([occ, r.to]);
    }
    for (const [a, to] of moves) a.cage = to;
    if (moves.length) saveDB(db);
  }
  write(clinic, { rooms, cages });
}

/** مرآةُ `admissions_cage_link` لكتابة إقامة: دخولٌ أو إعادةُ تفعيلٍ بقفصٍ مسكون ⇒ «بلا قفص»؛
 *  نقلٌ إلى قفصٍ مسكون ⇒ رفضٌ يسمّي الساكن؛ نقلُ مربوطٍ إلى رقمٍ غير مرسوم ⇒ رفض. */
export function demoAdmissionCageGuard(db: DemoDB, adm: Admission, before: { status: Admission["status"]; cage?: string | null } | null, clinic: string): void {
  if (adm.status === "discharged") return;
  const code = norm(adm.cage);
  const rows = read(clinic);
  const drawn = (c: string) => !!rows && rows.cages.some((r) => norm(r.code) === c);
  // مرآةُ admissions_cage_link (0219): دخولٌ جديد أو إعادةُ تفعيل = يأخذ القفصَ إن كان فارغاً
  // وإلا «بلا قفص»؛ أما النقلُ فيُرفض بقفصٍ مسكون أو غير مرسوم.
  const entering = !before || before.status !== "active";
  const moved = !!before && norm(before.cage) !== code;
  if (!code) return;
  if (!drawn(code)) {
    if (before && !entering && moved && drawn(norm(before.cage)))
      refuse("cage_not_drawn", "errCageNotDrawn", { code: (adm.cage ?? "").trim() });
    return;   // يتيمٌ مرئيّ لا رفض
  }
  if (!entering && !moved) return;
  const occ = occupantOf(db, adm.cage ?? "", adm.id);
  if (!occ) return;
  if (entering) { adm.cage = ""; return; }
  refuse("cage_occupied", "errOccupied", { code: (adm.cage ?? "").trim(), name: petName(db, occ) });
}
