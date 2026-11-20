/* ============================================================================
 * بابُ تعديل الرصيد السابق والتسوية (0281) — خارج repo.ts (حزمةُ الإقلاع)، لا تستورده إلا شاشةُ دفتر الشركة الكسولة.
 *  • الكتابةُ تُسمع: الخادمُ يرمي برمزه وتلميحه العربيّ (rpcJson) والشاشةُ تعرضه بـdescribeDbError.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابة كما بـrepo.
 *  • `entryEditReady(e)`: هل القاعدةُ تعرف التعديل؟ عمودُ `edits` يصل مع كلّ صفٍّ (`select *`) منذ 0281 ولو فارغاً —
 *    فغيابُ المفتاح = قاعدةٌ قبل الهجرة ⇒ الزرُّ مخفيّ بدل «تعذّر» دائم. والتجريبيُّ يعرفها دائماً.
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import type { CompanyEntry } from "@/types";
import type { EntrySnap } from "./companyEntryEdit";

export const entryEditReady = (e: CompanyEntry): boolean => !supabase || Object.prototype.hasOwnProperty.call(e, "edits");

export async function editCompanyEntry(id: string, amount: number, date: string, note: string | null, reason: string,
  seen: EntrySnap): Promise<CompanyEntry> {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
  if (!supabase) return (await import("./repoDemo").then((m) => m.loadDemoCompanyEntryEdit())).demoCompanyEntryEdit(id, amount, date, note, reason, seen);
  const row = await rpcJson<CompanyEntry>("company_entry_edit", {
    p_entry: id, p_amount: amount, p_date: date, p_note: note, p_reason: reason, p_seen: seen,
  });
  return { ...row, amount: Number(row.amount) || 0 };
}
