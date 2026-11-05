/* ============================================================================
 * مرآةُ الراجيتة (0261) للتجريبيّ — الحرّاسُ نفسُها:
 *  • التصميمُ صفٌّ واحدٌ لكلّ عيادة (المفتاحُ بـdemoClinicId — مرآةُ auth_clinic())، والحفظُ بشرط «كما فُتح»:
 *    إدخالٌ ثانٍ أو ختمٌ قديم ⇒ rx_stale. والصورُ `data:` (لا دلوَ بالتجريبيّ) — والقاعدةُ بالسحابة ترفضها.
 *  • الراجيتةُ تُختم بالكاتب واللحظة ولا تولد ملغاة، ونصُّها ١–٨٠٠٠ (القيدُ 23514)، ولا تتعدّل؛ والإلغاءُ مرّةً،
 *    للمدير (`auth_role() = 'manager'` ⇒ demoBaseRole/PIN)، وغيرُه 42501 برسالة المحفّز.
 *  • المصوّرُ مسيَّج: لا يرى ولا يكتب (photographer_fence_table) — القراءةُ فارغة والكتابةُ 42501.
 *  • الامتلاءُ (localStorage) يُرمى ولا يُبلع: «تمّ» عن حفظٍ لم يحصل أسوأُ من خطأ.
 * كسولةٌ من باب repoDemo وحده (loadDemoRx)، والأثرُ بسجلّ الحركات التجريبيّ كمحفّز audit_all.
 * ========================================================================= */
import { demoAuditPush, demoBaseRole, demoClinicId, demoPinLive, demoUserId } from "./repoDemo";
import type { PreparedUpload } from "./image";
import { cleanRxPad, cleanRxBody, type RxPadConfig } from "./rxLayout";
import { readRx, rxInsertRow, rxStale, type RxNew, type RxNote, type RxPadRow, type RxRecord } from "./rxApi";
import { uid } from "./utils";

const clinic = () => demoClinicId() ?? "default";
const padKey = () => `vp_rx_pad_${clinic()}`;
const listKey = () => `vp_rx_list_${clinic()}`;
const fenced = () => demoBaseRole() === "photographer";
const fenceErr = () => Object.assign(new Error("new row violates row-level security policy"), { code: "42501" });
const checkErr = () => Object.assign(new Error("new row violates check constraint"), { code: "23514" });

/** ختمٌ يكبر دائماً (لا يتكرّر بنفس الملّي ثانية فيصير شرطُ «كما فُتح» بلا معنى). */
function stamp(prev?: string | null): string {
  const p = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(Date.now(), (Number.isFinite(p) ? p : 0) + 1)).toISOString();
}
function readJson<T>(key: string, dflt: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? dflt : (v as T); } catch { return dflt; }
}
/** الكتابةُ ترمي عند الامتلاء — يصل الشاشةَ «ما انحفظ» لا «تمّ». */
const write = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

export async function demoRxGetPad(): Promise<RxPadRow | null> {
  if (fenced()) return null;
  const row = readJson<{ config?: unknown; updated_at?: string } | null>(padKey(), null);
  return row && row.updated_at ? { cfg: cleanRxPad(row.config, { allowData: true }), updated_at: row.updated_at } : null;
}

export async function demoRxSavePad(cfg: RxPadConfig, expect: string | null): Promise<RxPadRow> {
  if (fenced()) throw fenceErr();
  const cur = readJson<{ config?: unknown; updated_at?: string } | null>(padKey(), null);
  if (expect === null ? !!cur : !cur || cur.updated_at !== expect) throw rxStale();
  const row = { config: cleanRxPad(cfg, { allowData: true }), updated_at: stamp(cur?.updated_at) };
  write(padKey(), row);
  demoAuditPush({ action: cur ? "UPDATE" : "INSERT", entity: "clinic_rx_pad", entity_id: clinic(), details: { mode: row.config.mode } });
  return { cfg: row.config, updated_at: row.updated_at };
}

const loadList = (): Record<string, unknown>[] => {
  const v = readJson<unknown>(listKey(), []);
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
};

export async function demoRxList(petId: string): Promise<RxRecord[]> {
  if (fenced()) return [];
  return loadList().filter((r) => r.pet_id === petId).map(readRx).sort((a, b) => b.issued_at.localeCompare(a.issued_at));
}

export async function demoRxAdd(r: RxNew): Promise<RxRecord> {
  if (fenced()) throw fenceErr();
  const row = rxInsertRow(r);
  const len = row.body.trim().length;
  if (len < 1 || len > 8000) throw checkErr();
  const now = new Date().toISOString();
  const rec = { id: uid("rx"), ...row, author_id: demoUserId(), issued_at: now, created_at: now, voided_at: null, voided_by: null, void_reason: null };
  write(listKey(), [rec, ...loadList()]);
  demoAuditPush({ action: "INSERT", entity: "pet_prescriptions", entity_id: rec.id, details: { pet_id: rec.pet_id, pet_name: rec.pet_name, doctor_name: rec.doctor_name } });
  return readRx(rec);
}

export async function demoRxVoid(id: string, reason: string): Promise<RxRecord> {
  if (fenced()) throw rxStale();
  const list = loadList();
  const i = list.findIndex((r) => r.id === id && r.voided_at == null);
  if (i < 0) throw rxStale();
  if (demoBaseRole() !== "manager" && !demoPinLive()) {
    throw Object.assign(new Error("rx_void_manager"), { code: "42501" });
  }
  const rec: Record<string, unknown> = { ...list[i], voided_at: new Date().toISOString(), voided_by: demoUserId(), void_reason: cleanRxBody(reason).replace(/\s+/g, " ").trim().slice(0, 200) || null };
  list[i] = rec;
  write(listKey(), list);
  demoAuditPush({ action: "UPDATE", entity: "pet_prescriptions", entity_id: id, details: { pet_id: rec.pet_id, pet_name: rec.pet_name, __changed: { voided_at: [null, rec.voided_at] } } });
  return readRx(rec);
}

/** بالتجريبيّ لا دلو: الصورةُ تُحفظ بالتصميم نفسِه `data:` (والسحابةُ ترفضها بالقيد). */
export async function demoRxUpload(_kind: "bg" | "emblem", up: PreparedUpload): Promise<string> {
  if (fenced()) throw fenceErr();
  return up.dataUrl;
}

export async function demoRxNotes(petId: string): Promise<RxNote[]> {
  if (fenced()) return [];
  const { repo } = await import("./repo");
  /* الملاحظاتُ كلُّها (لا سقفَ بالتجريبيّ) — والمحلّلُ نفسُه (latestPlan ⇐ parseClinical) يعرف المنظّمةَ بعلامتها. */
  const notes = await repo.listPetNotes(petId);
  return notes.filter((n) => typeof n.note_text === "string").map((n) => ({ note_text: n.note_text, created_at: n.created_at }));
}
