/* ============================================================================
 * بابُ الديون القديمة الكثيرة بدفتر الشركة (0288) — خارج repo.ts (حزمةُ الإقلاع)، لا تستورده إلا شاشةُ دفتر الشركة الكسولة.
 *  • الكتابةُ تُسمع: الخادمُ يرمي برمزه وتلميحه العربيّ (rpcJson)، والشاشةُ تعرضه بـdescribeDbError.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابة كما بـrepo.
 *  • `openingsReady()`: هل القاعدةُ تعرف الباب؟ دالّةٌ غائبة (PGRST202/42883) ⇒ false — دينٌ واحد بالباب القديم كما كان.
 *    وفشلٌ غيرُه (الشبكة) يُرمى: «ما نعرف» ليس «لا».
 *  • التجريبيُّ يعرفه دائماً (مرآتُه بحرّاسه: demoCompanyOpenings).
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import type { CompanyEntry } from "@/types";
import type { OpeningRowOut } from "./companyOpenings";

export type OpeningsCur = "IQD" | "USD";
export interface OpeningsResult { entries: CompanyEntry[]; replayed: boolean }

const codeOf = (e: unknown): string => String((e as { code?: string } | null)?.code ?? "");
/** قاعدةٌ قبل 0288: الدالّةُ غائبة. */
export const isOpeningsAbsent = (e: unknown): boolean => codeOf(e) === "PGRST202" || codeOf(e) === "42883";

export async function openingsReady(): Promise<boolean> {
  if (!supabase) return true;
  try {
    return (await rpcJson<boolean>("company_openings_ready", {})) === true;
  } catch (e) {
    if (isOpeningsAbsent(e)) return false;
    throw e;
  }
}

export async function addCompanyOpenings(companyId: string, cur: OpeningsCur, rows: OpeningRowOut[], ref: string): Promise<OpeningsResult> {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
  if (!supabase) return (await import("./repoDemo").then((m) => m.loadDemoCompanyOpenings())).demoCompanyOpenings(companyId, cur, rows, ref);
  const r = await rpcJson<OpeningsResult>("company_openings_add", { p_company: companyId, p_currency: cur, p_rows: rows, p_ref: ref });
  return {
    replayed: r.replayed === true,
    entries: (Array.isArray(r.entries) ? r.entries : []).map((x) => ({ ...x, amount: Number(x.amount) || 0 })),
  };
}
