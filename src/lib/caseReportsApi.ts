/* ============================================================================
 * تقاريرُ الحالة المطبوعة (0287) — بابٌ واحد للسحابة وللتجريبيّ. خارج repo.ts (حزمةُ الإقلاع)، ويُستورد كسولاً.
 *
 * العقد (كـrxApi، درسُ الراجيتة):
 *  • القراءةُ ترمي عند أيّ فشل — لا «ما انطبع شي» عن خطأ (قائمةٌ ناقصة أخطرُ من خطأ ظاهر).
 *  • جدولٌ غائب (واجهةٌ سبقت هجرتها: 42P01/PGRST205) ⇒ `reports_missing` — النافذةُ تطبع كما كانت وتُخفي السجلّ
 *    والحفظ بصمت، لا «تعذّر» دائم.
 *  • التقريرُ يُكتب **بمعرّفٍ من الجهاز** يُختم لحظةَ الطباعة: ردٌّ ضاع ثمّ «احفظها» ⇒ 23505 ⇒ يُقرأ بمعرّفه ويُعدّ
 *    محفوظاً — لا صفٌّ ثانٍ لورقةٍ واحدة (والصفُّ لا يُحذف).
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الحفظ (ReadOnlyError).
 *  • الورقةُ تُحفظ نموذجاً (caseSheetPrint) لا HTML، وتُقرأ بحذر (readSheet): jsonb قد يحمل أيَّ شيء.
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { readEdits, readSheet, type CaseSheet, type Paper, type SheetEdit } from "./caseSheetPrint";

export interface CaseReportHead {
  id: string;
  pet_id: string;
  admission_id: string | null;
  scope: "stay" | "all";
  paper: Paper;
  title: string;
  author_id: string | null;
  author_name: string;
  created_at: string;
  edits: SheetEdit[];
}
export interface CaseReport extends CaseReportHead { sheet: CaseSheet | null }
export interface CaseReportNew {
  id: string; pet_id: string; admission_id: string | null; scope: "stay" | "all"; paper: Paper;
  sheet: CaseSheet; edits: SheetEdit[]; author_name: string | null;
}

export interface CaseReportsApi {
  /** تقاريرُ الحيوان المطبوعة، الأحدثُ أوّلاً (بلا الورقة نفسِها — تُجلب حين تُفتح). */
  listForPet(petId: string): Promise<CaseReportHead[]>;
  get(id: string): Promise<CaseReport | null>;
  add(r: CaseReportNew): Promise<CaseReportHead>;
}

/** سقفُ القائمة: أحدثُ مئة تقرير — والفائضُ يُقال لا يُخفى بصمت (الشاشةُ تعدّ). */
export const REPORTS_LIMIT = 100;

type PgErr = { message: string; code?: string; details?: string; hint?: string };
const serverError = (e: PgErr) => Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint });
export const reportsMissing = () => Object.assign(new Error("reports_missing"), { code: "reports_missing" });
export const isReportsMissing = (e: unknown) => (e as { code?: string } | null)?.code === "reports_missing";
const MISSING = new Set(["42P01", "PGRST205"]);
const fail = (e: PgErr) => (MISSING.has(e.code ?? "") ? reportsMissing() : serverError(e));

function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}

const HEAD = "id,pet_id,admission_id,scope,paper,title,author_id,author_name,created_at,edits";
const s = (x: unknown) => (typeof x === "string" ? x : "");
export function readHead(r: Record<string, unknown>): CaseReportHead {
  return {
    id: String(r.id),
    pet_id: String(r.pet_id),
    admission_id: typeof r.admission_id === "string" ? r.admission_id : null,
    scope: r.scope === "all" ? "all" : "stay",
    paper: r.paper === "a5" || r.paper === "letter" ? r.paper : "a4",
    title: s(r.title),
    author_id: typeof r.author_id === "string" ? r.author_id : null,
    author_name: s(r.author_name),
    created_at: String(r.created_at ?? ""),
    edits: readEdits(r.edits),
  };
}
export const readReport = (r: Record<string, unknown>): CaseReport => ({ ...readHead(r), sheet: readSheet(r.sheet) });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (x: string, n: number) => (x.length > n ? x.slice(0, n) : x);
/** ما يُرسل للإدخال: الورقةُ بلا الطباعة التلقائيّة، والعنوانُ والاسمُ بسقف القيد. */
export function reportInsertRow(r: CaseReportNew) {
  return {
    ...(UUID_RE.test(r.id) ? { id: r.id.toLowerCase() } : {}),
    pet_id: r.pet_id,
    admission_id: r.admission_id && UUID_RE.test(r.admission_id) ? r.admission_id : null,
    scope: r.scope,
    paper: r.paper,
    title: clip(r.sheet.title.trim(), 200),
    sheet: { ...r.sheet, autoPrint: false },
    edits: r.edits.map((e) => ({ k: e.k, from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}) })),
    author_name: r.author_name ? clip(r.author_name.trim(), 120) || null : null,
  };
}

const cloud: CaseReportsApi = {
  async listForPet(petId) {
    const { data, error } = await supabase!.from("pet_case_reports").select(HEAD).eq("pet_id", petId)
      .order("created_at", { ascending: false }).limit(REPORTS_LIMIT);
    if (error) throw fail(error);
    return (data ?? []).map((r) => readHead(r as Record<string, unknown>));
  },
  async get(id) {
    const { data, error } = await supabase!.from("pet_case_reports").select(`${HEAD},sheet`).eq("id", id).limit(1);
    if (error) throw fail(error);
    const row = (data ?? [])[0];
    return row ? readReport(row as Record<string, unknown>) : null;
  },
  async add(r) {
    writable();
    const row = reportInsertRow(r);
    const { data, error } = await supabase!.from("pet_case_reports").insert(row).select(HEAD).single();
    if (error) {
      /* المعرّفُ موجود ⇒ الإدخالُ السابق كُتب وضاع ردُّه: يُقرأ هو (لا صفٌّ ثانٍ). وإن لم يُرَ بمعرّفه ⇒ الخطأُ كما هو. */
      if (error.code === "23505" && "id" in row) {
        const again = await supabase!.from("pet_case_reports").select(HEAD).eq("id", row.id).limit(1);
        if (again.error) throw fail(again.error);
        const hit = (again.data ?? [])[0];
        if (hit) return readHead(hit as Record<string, unknown>);
      }
      throw fail(error);
    }
    return readHead(data as Record<string, unknown>);
  },
};

/* التجريبيّ: نفسُ العقد على localStorage، كسولٌ من باب repoDemo وحده (demoCaseReports.ts). */
const local = () => import("./repoDemo").then((m) => m.loadDemoCaseReports());
const demo: CaseReportsApi = {
  listForPet: async (id) => (await local()).demoReportsList(id),
  get: async (id) => (await local()).demoReportsGet(id),
  add: async (r) => { writable(); return (await local()).demoReportsAdd(r); },
};

export const caseReportsApi: CaseReportsApi = supabase ? cloud : demo;
