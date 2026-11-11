/* ============================================================================
 * حالةُ الحقل (0265) — البابُ الواحد: السحابةُ بدوالّ القاعدة، والتجريبيُّ بمرآتها (demoFlock.ts، كسولٌ من repoDemo).
 *
 * لا يستورده إلا شاشاتُ الحقل الكسولة — فلا يدخل حزمةَ الإقلاع. والكتابةُ كلُّها بدوالّ تفحص العيادةَ والدورَ بنفسها،
 * ومرجعٌ من الجهاز (client_ref) لكلّ فتحٍ وزيارةٍ وطبلةٍ ونافق: إعادةُ الإرسال بعد انقطاعٍ ترجع ما انحفظ لا نسخةً ثانية.
 * والرفضُ يُرمى برمز الخادم (flock_*) وتلميحه — الشاشةُ تترجم الرمز (flockShared.flockErrorText)، لا «انتهت الجلسة».
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import type {
  FlockBoardRow, FlockBundle, FlockCase, FlockFarm, FlockKind, FlockMedia, FlockMortality, FlockProgram, FlockProgramStep,
  FlockRoute, FlockTreatment, FlockTreatmentLine, FlockVax, FlockVisit,
} from "./flockTypes";

export interface FlockOpenInput {
  client_ref: string;
  farm: { id: string } | { name: string; owner_name?: string | null; owner_phone?: string | null; governorate?: string | null; area?: string | null; houses_count?: number | null; note?: string | null };
  case: { kind: FlockKind; breed?: string | null; hatchery?: string | null; placed_on: string; placed_count?: number | null; vet_id?: string | null; note?: string | null };
  houses?: { label: string; placed_count: number }[];
  vax?: { vaccine: string; disease?: string | null; route: FlockRoute; age: number; at_hatchery?: boolean; from_program?: string | null }[];
}
export interface FlockMortalityInput {
  id?: string; expect_updated_at?: string | null; case_id?: string; house_id?: string | null; on_date: string; days?: number;
  dead: number; culled?: number; source?: "staff" | "farmer"; note?: string | null; client_ref?: string | null;
}
export interface FlockVisitInput {
  id?: string; expect_updated_at?: string | null; client_ref?: string | null; case_id?: string; at: string;
  kind?: FlockVisit["kind"]; quick?: boolean; flock?: FlockVisit["flock"]; signs?: string[]; env?: FlockVisit["env"];
  dx?: string | null; dx_codes?: string[]; dx_status?: FlockVisit["dx_status"]; notifiable?: boolean; advice?: string | null;
  notes?: string | null; trend?: FlockVisit["trend"]; next_visit_on?: string | null; compliance?: FlockVisit["compliance"];
  /** غائبٌ = لا يُمسّ نافقُ الزيارة؛ فارغٌ = يُمسح. صفٌّ لكلّ قاعة، أو صفٌّ واحد. */
  mortality?: { house_id?: string | null; on_date?: string; days?: number; dead: number; culled?: number; note?: string | null }[];
  /** غائبٌ = لا يُمسّ تشريحُ الزيارة؛ الحاضرُ يستبدله كلَّه. */
  necropsy?: { bird_no: number; source?: "dead" | "cull" | "sacrificed" | null; weight_g?: number | null; findings: string[]; scores?: Record<string, number>; note?: string | null }[];
  vax_given?: { id: string; given_on?: string | null; given_by?: FlockVax["given_by"]; batch_no?: string | null; birds_count?: number | null; take_ok?: boolean | null; note?: string | null }[];
  vax_new?: { vaccine: string; disease?: string | null; route: FlockRoute; given_on?: string | null; given_by?: FlockVax["given_by"]; batch_no?: string | null; birds_count?: number | null; take_ok?: boolean | null; note?: string | null }[];
}
export type FlockLineInput = Omit<FlockTreatmentLine, "id" | "treatment_id" | "position">;
export interface FlockTreatmentInput {
  id?: string; expect_updated_at?: string | null; client_ref?: string | null; case_id?: string; visit_id?: string | null;
  title?: string | null; start_on?: string | null; note?: string | null; lines: FlockLineInput[];
}
export interface FlockVaxInput {
  id?: string; expect_updated_at?: string | null; case_id?: string; vaccine: string; disease?: string | null; route: FlockRoute;
  planned_age?: number | null; status: FlockVax["status"]; given_on?: string | null; given_by?: FlockVax["given_by"];
  batch_no?: string | null; birds_count?: number | null; take_ok?: boolean | null; note?: string | null; skip_reason?: string | null;
}
export interface FlockFarmMatch { farm: FlockFarm; open_case: string | null }

export interface FlockApi {
  board(status?: "open" | "closed" | "all"): Promise<FlockBoardRow[]>;
  bundle(caseId: string): Promise<FlockBundle>;
  farmsFor(phone: string | null, name: string | null): Promise<FlockFarmMatch[]>;
  openCase(p: FlockOpenInput): Promise<{ case: FlockCase; farm: FlockFarm; replayed: boolean }>;
  updateCase(id: string, patch: Partial<Pick<FlockCase, "kind" | "breed" | "hatchery" | "placed_on" | "placed_count" | "vet_id" | "note">>, expect?: string | null): Promise<FlockCase>;
  closeCase(id: string, p: { closed_on?: string | null; reason: NonNullable<FlockCase["close_reason"]>; sold_count?: number | null; sold_avg_kg?: number | null; confirm_withdrawal?: boolean }): Promise<FlockCase>;
  reopenCase(id: string): Promise<FlockCase>;
  saveFarm(p: Partial<Omit<FlockFarm, "clinic_id" | "cust_key" | "created_at" | "updated_at">> & { id: string }, expect?: string | null): Promise<FlockFarm>;
  saveMortality(p: FlockMortalityInput): Promise<FlockMortality & { replayed: boolean }>;
  deleteMortality(id: string): Promise<void>;
  saveVisit(p: FlockVisitInput): Promise<{ visit: FlockVisit; replayed: boolean }>;
  saveTreatment(p: FlockTreatmentInput): Promise<FlockTreatment & { replayed: boolean }>;
  markTreatment(id: string, what: "sent" | "printed" | "stop" | "done" | "resume", on?: string | null): Promise<Omit<FlockTreatment, "lines">>;
  saveVax(p: FlockVaxInput): Promise<FlockVax>;
  deleteVax(id: string): Promise<void>;
  programs(): Promise<FlockProgram[]>;
  saveProgram(p: { id?: string; name: string; kind: FlockKind; steps: FlockProgramStep[]; archived?: boolean }): Promise<FlockProgram>;
  addMedia(p: { case_id: string; path: string; visit_id?: string | null; bird_no?: number | null; kind?: FlockMedia["kind"]; caption?: string | null }): Promise<FlockMedia>;
  removeMedia(id: string): Promise<FlockMedia>;
  /** صورةٌ بمسار وجبتها (`flock/<case>/…`، سياسةُ الدلو 0265) ثمّ صفُّها — وفشلُ الصفّ يمسح الملفّ. */
  uploadPhoto(p: { case_id: string; blob: Blob; dataUrl: string; ext: string; contentType: string; visit_id?: string | null; bird_no?: number | null; caption?: string | null }): Promise<FlockMedia>;
  /** روابطُ عرضٍ للمسارات (الدلو خاصّ: روابطُ موقّعةٌ مؤقّتة). المسارُ الذي لم يُوقَّع يغيب — لا رابطَ كاذب. */
  photoUrls(paths: string[]): Promise<Record<string, string>>;
}

type PgErr = { message: string; code?: string; details?: string; hint?: string };
const serverError = (e: PgErr) => Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint });
function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}
/** دالّةٌ ترجع void: الخطأُ وحده يُرمى (rpcJson يرمي على «لا بيانات»). */
async function rpcVoid(fn: string, args: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error("no_cloud");
  const { error } = await supabase.rpc(fn, args);
  if (error) throw serverError(error as PgErr);
}
const missing = () => Object.assign(new Error("flock_case_missing"), { code: "P0001" });
const MEDIA_BUCKET = "medical-media";
const photoPath = (caseId: string, ext: string) =>
  `flock/${caseId}/${(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)}.${ext.replace(/[^a-z0-9]/gi, "") || "jpg"}`;

/** سقفُ قائمة الوجبات (flock_board) — والشاشةُ تقوله حين تبلغه. */
export const FLOCK_BOARD_LIMIT = 300;

const cloud: FlockApi = {
  board: (status = "open") => rpcJson<FlockBoardRow[]>("flock_board", { p_status: status, p_limit: FLOCK_BOARD_LIMIT }),
  async bundle(caseId) {
    try { return await rpcJson<FlockBundle>("flock_case_bundle", { p_case: caseId }); }
    catch (e) { if ((e as Error)?.message === "No data returned") throw missing(); throw e; }
  },
  farmsFor: (phone, name) => rpcJson<FlockFarmMatch[]>("flock_farms_for", { p_phone: phone, p_name: name }),
  openCase: (p) => { writable(); return rpcJson("flock_case_open", { p }); },
  updateCase: (id, patch, expect) => { writable(); return rpcJson("flock_case_update", { p_case: id, p: patch, p_expect: expect ?? null }); },
  closeCase: (id, p) => { writable(); return rpcJson("flock_case_close", { p_case: id, p }); },
  reopenCase: (id) => { writable(); return rpcJson("flock_case_reopen", { p_case: id }); },
  saveFarm: (p, expect) => { writable(); return rpcJson("flock_farm_save", { p, p_expect: expect ?? null }); },
  saveMortality: (p) => { writable(); return rpcJson("flock_mortality_save", { p }); },
  deleteMortality: (id) => { writable(); return rpcVoid("flock_mortality_delete", { p_id: id }); },
  saveVisit: (p) => { writable(); return rpcJson("flock_visit_save", { p }); },
  saveTreatment: (p) => { writable(); return rpcJson("flock_treatment_save", { p }); },
  markTreatment: (id, what, on) => { writable(); return rpcJson("flock_treatment_mark", { p_id: id, p_what: what, p_on: on ?? null }); },
  saveVax: (p) => { writable(); return rpcJson("flock_vax_save", { p }); },
  deleteVax: (id) => { writable(); return rpcVoid("flock_vax_delete", { p_id: id }); },
  async programs() {
    if (!supabase) throw new Error("no_cloud");
    const { data, error } = await supabase.from("flock_vax_programs").select("*").eq("archived", false).order("kind").order("name");
    if (error) throw serverError(error as PgErr);    // قائمةٌ فارغة عن خطأ تُصدَّق — تُرمى (CLAUDE.md §٣)
    return (data ?? []) as FlockProgram[];
  },
  saveProgram: (p) => { writable(); return rpcJson("flock_program_save", { p }); },
  addMedia: (p) => { writable(); return rpcJson("flock_media_add", { p }); },
  async removeMedia(id) {
    writable();
    const m = await rpcJson<FlockMedia>("flock_media_remove", { p_id: id });
    // والملفُّ من الدلو أيضاً (أفضلَ جهد) — كان الصفُّ يُحذف ويبقى الملفُّ بالدلو الخاصّ بلا مرجع (مراجعةٌ عدائيّة).
    if (supabase && m?.path) await supabase.storage.from(MEDIA_BUCKET).remove([m.path]).catch(() => undefined);
    return m;
  },
  async uploadPhoto(p) {
    writable();
    if (!supabase) throw new Error("no_cloud");
    const path = photoPath(p.case_id, p.ext);
    const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, p.blob, { contentType: p.contentType, upsert: false });
    if (up.error) throw up.error;
    try {
      return await rpcJson<FlockMedia>("flock_media_add", { p: { case_id: p.case_id, path, visit_id: p.visit_id ?? null, bird_no: p.bird_no ?? null, kind: "photo", caption: p.caption ?? null } });
    } catch (e) {
      // صفٌّ رُفض ⇒ ملفٌّ يتيمٌ بلا مرجع: يُمسح (أفضلَ جهد) ويُرمى الرفضُ نفسُه.
      await supabase.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
      throw e;
    }
  },
  async photoUrls(paths) {
    if (!supabase || !paths.length) return {};
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 60 * 8);
    if (error) throw serverError(error as unknown as PgErr);
    const out: Record<string, string> = {};
    for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
    return out;
  },
};

/* التجريبيّ: نفسُ العقد والحرّاس على localStorage، كسولٌ من باب repoDemo وحده (demoFlock.ts). */
const local = () => import("./repoDemo").then((m) => m.loadDemoFlock());
const demo: FlockApi = {
  board: async (s) => (await local()).demoFlockBoard(s ?? "open"),
  bundle: async (id) => (await local()).demoFlockBundle(id),
  farmsFor: async (ph, n) => (await local()).demoFlockFarmsFor(ph, n),
  openCase: async (p) => { writable(); return (await local()).demoFlockOpen(p); },
  updateCase: async (id, patch, e) => { writable(); return (await local()).demoFlockUpdate(id, patch, e ?? null); },
  closeCase: async (id, p) => { writable(); return (await local()).demoFlockClose(id, p); },
  reopenCase: async (id) => { writable(); return (await local()).demoFlockReopen(id); },
  saveFarm: async (p, e) => { writable(); return (await local()).demoFlockFarmSave(p, e ?? null); },
  saveMortality: async (p) => { writable(); return (await local()).demoFlockMortalitySave(p); },
  deleteMortality: async (id) => { writable(); return (await local()).demoFlockMortalityDelete(id); },
  saveVisit: async (p) => { writable(); return (await local()).demoFlockVisitSave(p); },
  saveTreatment: async (p) => { writable(); return (await local()).demoFlockTreatmentSave(p); },
  markTreatment: async (id, w, on) => { writable(); return (await local()).demoFlockTreatmentMark(id, w, on ?? null); },
  saveVax: async (p) => { writable(); return (await local()).demoFlockVaxSave(p); },
  deleteVax: async (id) => { writable(); return (await local()).demoFlockVaxDelete(id); },
  programs: async () => (await local()).demoFlockPrograms(),
  saveProgram: async (p) => { writable(); return (await local()).demoFlockProgramSave(p); },
  addMedia: async (p) => { writable(); return (await local()).demoFlockMediaAdd(p); },
  removeMedia: async (id) => {
    writable();
    const m = await (await local()).demoFlockMediaRemove(id);
    try { localStorage.removeItem(`vp_flock_img:${m.path}`); } catch { /* swallow-ok: صورةُ التجريبيّ ثانويّة بعد حذف صفّها */ }
    return m;
  },
  // التجريبيُّ بلا دلو: الصورةُ (مصغّرةٌ سلفاً) بالجهاز بمفتاح مسارها — والتخزينُ الممتلئ يُقال لا يُبلع.
  async uploadPhoto(p) {
    writable();
    const path = photoPath(p.case_id, p.ext);
    localStorage.setItem(`vp_flock_img:${path}`, p.dataUrl);
    try {
      return await (await local()).demoFlockMediaAdd({ case_id: p.case_id, path, visit_id: p.visit_id ?? null, bird_no: p.bird_no ?? null, kind: "photo", caption: p.caption ?? null });
    } catch (e) {
      try { localStorage.removeItem(`vp_flock_img:${path}`); } catch { /* swallow-ok: تنظيفٌ بعد رفضٍ يُرمى */ }
      throw e;
    }
  },
  async photoUrls(paths) {
    const out: Record<string, string> = {};
    for (const p of paths) { const v = localStorage.getItem(`vp_flock_img:${p}`); if (v) out[p] = v; }
    return out;
  },
};

export const flockApi: FlockApi = supabase ? cloud : demo;
