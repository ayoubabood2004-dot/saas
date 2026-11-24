/* ============================================================================
 * مرآةُ تقارير الحالة المطبوعة (0287) للتجريبيّ — الحرّاسُ نفسُها:
 *  • لكلّ عيادةٍ تقاريرُها (المفتاحُ بـdemoClinicId — مرآةُ auth_clinic()).
 *  • التقريرُ يُختم بالكاتب واللحظة من «الخادم» لا من المُرسِل، ولا يتعدّل ولا يُحذف (لا بابَ لهما أصلاً).
 *  • المعرّفُ من الجهاز: إعادتُه ⇒ 23505 كالقاعدة، والبابُ (caseReportsApi) لا يناديها مرّتين — يقرأ القائمَ.
 *  • المصوّرُ مسيَّج: لا يرى ولا يكتب (photographer_fence_table) — القراءةُ فارغة والكتابةُ 42501.
 *  • الامتلاءُ (localStorage) يُرمى ولا يُبلع: «انحفظت» عن حفظٍ لم يحصل أسوأُ من خطأ.
 * كسولةٌ من باب repoDemo وحده (loadDemoCaseReports).
 * ========================================================================= */
import { demoBaseRole, demoClinicId, demoUserId } from "./repoDemo";
import { readHead, readReport, reportInsertRow, type CaseReport, type CaseReportHead, type CaseReportNew } from "./caseReportsApi";
import { uid } from "./utils";

const clinic = () => demoClinicId() ?? "default";
const listKey = () => `vp_case_reports_${clinic()}`;
const fenced = () => demoBaseRole() === "photographer";
const fenceErr = () => Object.assign(new Error("new row violates row-level security policy"), { code: "42501" });

type Row = Record<string, unknown>;
function rows(): Row[] {
  try { const v = JSON.parse(localStorage.getItem(listKey()) || "[]"); return Array.isArray(v) ? (v as Row[]) : []; } catch { return []; }
}

export function demoReportsList(petId: string): CaseReportHead[] {
  if (fenced()) return [];
  return rows().filter((r) => r.pet_id === petId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(readHead);
}

export function demoReportsGet(id: string): CaseReport | null {
  if (fenced()) return null;
  const r = rows().find((x) => x.id === id);
  return r ? readReport(r) : null;
}

export function demoReportsAdd(r: CaseReportNew): CaseReportHead {
  if (fenced()) throw fenceErr();
  const ins = reportInsertRow(r);
  const all = rows();
  const id = "id" in ins && ins.id ? ins.id : uid();
  if (all.some((x) => x.id === id)) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
  // الختمُ «من الخادم»: الكاتبُ صاحبُ الجلسة واللحظةُ الآن — ما يرسله الجهازُ غيرَهما لا يُقرأ.
  const row: Row = { ...ins, id, clinic_id: clinic(), author_id: demoUserId(), created_at: new Date().toISOString() };
  localStorage.setItem(listKey(), JSON.stringify([...all, row]));
  return readHead(row);
}
