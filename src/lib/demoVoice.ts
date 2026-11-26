/* ============================================================================
 * مرآةُ الملاحظة الصوتية (0287) للتجريبيّ — الحرّاسُ نفسُها:
 *  • التسجيلُ لمن عنده «السجلات الطبية» (editMedical) ولا لصاحب الحيوان ولا للمصوّر (البوّابة).
 *  • الإضافةُ بمعرّفٍ من الجهاز (إعادةٌ = الصفُّ نفسُه، ومعرّفٌ لملفٍّ آخر ⇒ voice_id_taken)، والزيارةُ لحيوانها
 *    (voice_visit)، والمسارُ مسارُها حرفاً (voice_path)، والملفُّ موجودٌ بحجمه (voice_object_missing/voice_size)،
 *    و`recorded_at` يُحصر بنافذة الزيارة ±١٠ دقائق (لا يُرفض: ساعةُ جهازٍ غلط لا تُضيّع تسجيلاً).
 *  • الحذفُ للمؤلّف خلال ٢٤ ساعة والزيارةُ مفتوحة وللمدير بأيّ وقت؛ والإرجاعُ للمدير أو لمن حذف خلال ٢٤ ساعة؛
 *    والصوتُ المحذوف للمدير وحده (قرارُ المالك ٢٢/١١) — والسجلُّ (history) يُضاف ولا يُمحى.
 *  • الصفوفُ بـlocalStorage والصوتُ بـIndexedDB (`demo_audio`) — لا بقاعدة التجريبيّ (DemoQuotaError)؛
 *    وسقفٌ للجهاز: ٣٠ تسجيلاً ودقيقتان لكلّ واحد (يُقال بالشاشة).
 *  • الامتلاءُ يُرمى ولا يُبلع.
 * كسولةٌ من باب repoDemo وحده (loadDemoVoice)، والأثرُ بسجلّ الحركات التجريبيّ كمحفّز audit_all.
 * ========================================================================= */
import { demoApiGate, demoAuditPush, demoBaseRole, demoClinicId, demoPinLive, demoUserId } from "./repoDemo";
import { loadDB } from "./demoStore";
import { effectiveCan, peekMyPermissions, type StaffRole } from "./staff";
import { openVoiceDb } from "./voice/voiceShelf";
import { readVoiceRow, type PutOpts, type VoiceAddPayload } from "./voiceApi";
import type { VoiceMime, VoiceRow } from "./voice/voiceTypes";
import { DEMO_VOICE_MAX_MS } from "./voice/voiceFormat";

export const DEMO_VOICE_MAX = 30;
const KEY = "vp_demo_voice";
const H24 = 24 * 3600_000;
const TEN_MIN = 10 * 60_000;

const err = (code: string, sql = "P0001") => Object.assign(new Error(code), { code: sql });
const clinic = () => demoClinicId() ?? "default";

function session(): { name?: string; email?: string; rawRole?: string } {
  try {
    const raw = (JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { name?: string; full_name?: string; email?: string; rawRole?: string } } | null)?.raw;
    return { name: raw?.full_name ?? raw?.name, email: raw?.email, rawRole: raw?.rawRole };
  } catch { return {}; }
}
const isManager = () => demoBaseRole() === "manager" || demoPinLive();

function readRows(): VoiceRow[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? (v as Record<string, unknown>[]).map(readVoiceRow) : []; }
  catch { return []; }
}
/** الكتابةُ ترمي عند الامتلاء — «ما انحفظ» لا «تمّ». */
const writeRows = (rows: VoiceRow[]) => localStorage.setItem(KEY, JSON.stringify(rows));

/* الصوتُ بـIndexedDB (مخزن demo_audio) */
async function audio<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openVoiceDb();
  try {
    return await new Promise<T>((ok, no) => {
      const t = db.transaction(["demo_audio"], mode);
      const r = fn(t.objectStore("demo_audio"));
      let out: T;
      r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => ok(out);
      t.onerror = () => no(t.error);
      t.onabort = () => no(t.error ?? new DOMException("aborted", "AbortError"));
    });
  } finally { db.close(); }
}
const getAudio = (path: string) => audio<{ path: string; blob: Blob; size: number } | undefined>("readonly", (s) => s.get(path));

export function demoVoiceCanRecord(): boolean {
  if (demoBaseRole() === "photographer") return false;
  if (session().rawRole === "owner" && !demoClinicId()) return false;
  return effectiveCan(demoBaseRole() as StaffRole, "editMedical", peekMyPermissions(session().email ?? null)) || demoPinLive();
}

export async function demoVoiceList(visitId: string): Promise<VoiceRow[]> {
  demoApiGate();
  return readRows().filter((r) => r.visit_id === visitId && r.clinic_id === clinic())
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export async function demoVoiceOrphans(): Promise<VoiceRow[]> {
  demoApiGate();
  const pets = new Set((loadDB().pets ?? []).map((p) => p.id));
  return readRows().filter((r) => r.clinic_id === clinic() && !pets.has(r.pet_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

/** روابطُ blob: للصوت المحفوظ — المحذوفُ للمدير وحده (يغيب من الناتج لغيره كسياسة الدلو). */
export async function demoVoiceSign(paths: string[]): Promise<Record<string, string>> {
  demoApiGate();
  const rows = new Map(readRows().map((r) => [r.path, r]));
  const out: Record<string, string> = {};
  for (const p of paths) {
    const row = rows.get(p);
    if (row && row.clinic_id !== clinic()) continue;
    if (row?.voided_at && !isManager()) continue;
    const a = await getAudio(p);
    if (a) out[p] = URL.createObjectURL(a.blob);
  }
  return out;
}

export async function demoVoicePut(path: string, blob: Blob, type: VoiceMime, opts?: PutOpts): Promise<void> {
  demoApiGate();
  if (!demoVoiceCanRecord() || path.split("/")[0] !== clinic()) throw Object.assign(new Error("new row violates row-level security policy"), { status: 403 });
  if (await getAudio(path)) throw Object.assign(new Error("The resource already exists"), { status: 409 });
  await audio("readwrite", (s) => s.put({ path, blob: new Blob([blob], { type }), size: blob.size }));
  opts?.onProgress?.(blob.size, blob.size);
}

export async function demoVoiceInfo(path: string): Promise<number | null> {
  const a = await getAudio(path);
  return a ? a.size : null;
}

export async function demoVoiceAdd(p: VoiceAddPayload): Promise<VoiceRow> {
  demoApiGate();
  if (!demoVoiceCanRecord()) throw err("voice_forbidden", "42501");
  const c = clinic();
  const visit = (loadDB().clinicVisits ?? []).find((v) => v.id === p.visit_id && v.pet_id === p.pet_id && (!v.clinic_id || v.clinic_id === c || c === "default"));
  if (!visit) throw err("voice_visit");
  const ext = p.mime === "audio/mp4" ? "m4a" : p.mime === "audio/webm" ? "webm" : p.mime === "audio/ogg" ? "ogg" : "x";
  const path = `${c}/${p.pet_id}/${p.id}.${ext}`;
  if (p.path !== path) throw err("voice_path", "22023");
  if ((p.kind === "day") !== !!p.day) throw err("check", "23514");
  const rows = readRows();
  const had = rows.find((r) => r.id === p.id);
  if (had) {
    if (had.path !== path || had.sha256 !== p.sha256.toLowerCase()) throw err("voice_id_taken", "23505");
    return had;
  }
  if (rows.filter((r) => r.clinic_id === c).length >= DEMO_VOICE_MAX) throw err("voice_demo_cap");
  // المسجِّلُ يقف عند السقف بالساعة، والحاويةُ تُقرأ أطولَ بجزءٍ من الثانية — فسحةُ ثانيتين لا رفضٌ لكلّ تسجيلٍ بلغ السقف
  if (p.duration_ms > DEMO_VOICE_MAX_MS + 2_000) throw err("voice_demo_long");
  const size = await demoVoiceInfo(path);
  if (size === null) throw err("voice_object_missing");
  if (size !== p.bytes) throw err("voice_size");
  const opened = Date.parse(visit.opened_at);
  const ended = visit.ended_at ? Date.parse(visit.ended_at) : Date.now();
  const at = Date.parse(p.recorded_at);
  const clamped = Math.max(opened - TEN_MIN, Math.min(Number.isFinite(at) ? at : Date.now(), ended + TEN_MIN, Date.now() + TEN_MIN));
  const pet = (loadDB().pets ?? []).find((x) => x.id === p.pet_id);
  const now = new Date().toISOString();
  const row: VoiceRow = {
    id: p.id, clinic_id: c, pet_id: p.pet_id, visit_id: p.visit_id, kind: p.kind, day: p.kind === "day" ? p.day : null,
    path, mime: p.mime, codecs: p.codecs && /^[a-z0-9.]{1,24}$/.test(p.codecs) ? p.codecs : null,
    duration_ms: Math.min(Math.max(Math.round(p.duration_ms) || 0, 0), 600_000), bytes: p.bytes, sha256: p.sha256.toLowerCase(),
    recorded_at: new Date(clamped).toISOString(), created_at: now, created_by: demoUserId(),
    doctor_name: (session().name ?? "").trim().slice(0, 120) || null, pet_name: pet?.name?.slice(0, 120) ?? null,
    voided_at: null, voided_by: null, voided_name: null, void_reason: null, history: [],
  };
  writeRows([...rows, row]);
  demoAuditPush({ action: "INSERT", entity: "visit_voice_notes", entity_id: row.id, details: { pet_id: row.pet_id, pet_name: row.pet_name, kind: row.kind, recorded_at: row.recorded_at, doctor_name: row.doctor_name } });
  return row;
}

function mine(id: string): { rows: VoiceRow[]; i: number } {
  const rows = readRows();
  const i = rows.findIndex((r) => r.id === id && r.clinic_id === clinic());
  if (i < 0) throw err("voice_gone", "P0002");
  return { rows, i };
}

export async function demoVoiceVoid(id: string, reason: string | null): Promise<VoiceRow> {
  demoApiGate();
  const { rows, i } = mine(id);
  const r = rows[i];
  if (r.voided_at) return r;
  const visit = (loadDB().clinicVisits ?? []).find((v) => v.id === r.visit_id);
  const open = visit?.status === "open";
  const own = r.created_by === demoUserId() && Date.now() - Date.parse(r.created_at) < H24 && open;
  if (!isManager() && !own) throw err("voice_void_forbidden", "42501");
  const now = new Date().toISOString();
  const name = (session().name ?? "").trim().slice(0, 120) || null;
  const why = (reason ?? "").trim().slice(0, 200) || null;
  const next: VoiceRow = { ...r, voided_at: now, voided_by: demoUserId(), voided_name: name, void_reason: why,
    history: [...r.history, { a: "void" as const, at: now, by: demoUserId(), name, reason: why }].slice(-100) };
  rows[i] = next;
  writeRows(rows);
  demoAuditPush({ action: "UPDATE", entity: "visit_voice_notes", entity_id: id, details: { pet_id: r.pet_id, pet_name: r.pet_name, kind: r.kind, __changed: { voided_at: [null, now] } } });
  return next;
}

export async function demoVoiceRestore(id: string): Promise<VoiceRow> {
  demoApiGate();
  const { rows, i } = mine(id);
  const r = rows[i];
  if (!r.voided_at) return r;
  const undo = r.voided_by === demoUserId() && Date.now() - Date.parse(r.voided_at) < H24;
  if (!isManager() && !undo) throw err("voice_restore_forbidden", "42501");
  const now = new Date().toISOString();
  const next: VoiceRow = { ...r, voided_at: null, voided_by: null, voided_name: null, void_reason: null,
    history: [...r.history, { a: "restore" as const, at: now, by: demoUserId(), name: (session().name ?? "").trim().slice(0, 120) || null }].slice(-100) };
  rows[i] = next;
  writeRows(rows);
  demoAuditPush({ action: "UPDATE", entity: "visit_voice_notes", entity_id: id, details: { pet_id: r.pet_id, pet_name: r.pet_name, kind: r.kind, __changed: { voided_at: [r.voided_at, null] } } });
  return next;
}

/** ملفٌّ يتيم (لا صفَّ يشير إليه) يُمسح — المشارُ إليه يبقى (سياسةُ voice_notes_keep). */
export async function demoVoiceDrop(path: string): Promise<boolean> {
  if (readRows().some((r) => r.path === path)) return false;
  if (!(await getAudio(path))) return false;
  await audio("readwrite", (s) => s.delete(path));
  return true;
}

export async function demoVoiceClinic(): Promise<string | null> { return clinic(); }

export async function demoVoiceVisitExists(visitId: string): Promise<boolean> {
  return (loadDB().clinicVisits ?? []).some((v) => v.id === visitId);
}
