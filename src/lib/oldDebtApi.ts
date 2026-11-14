/* ============================================================================
 * الديونُ القديمة (0271) — بابٌ واحد للسحابة وللتجريبيّ. كسولٌ: لا تستورده إلا قطعةُ «دين قديم» (OldDebt.tsx) —
 * repo.ts بحزمة الإقلاع وفسحتُها بضعُ مئات بايت.
 *
 * العقد:
 *  • الخادمُ يقرّر كلَّ شيء (old_debt_add): المديرُ وحده، والزبونُ والمبلغُ و«شنو» والتاريخُ والعملة، ودينارُ الدولار بسعر اليوم.
 *    والجهازُ يرسل ما كُتب كما هو (المبلغُ نصّاً مقروءاً — لا عائم)، ومرجعَ إعادةٍ (client_ref) يولّده مرّةً للنافذة.
 *  • الكتابةُ تُسمع: الخطأُ يُرمى برمز الخادم وتلميحه، والشاشةُ تترجمه. وفشلٌ غيرُ حاسم (الشبكة) يُبقي المرجعَ فالإعادةُ
 *    لا تكتب ديناً ثانياً (shouldReleaseRef).
 *  • قاعدةٌ قبل 0271 (لا دالّة) ⇒ `odebt_absent`: «يحتاج تحديث» لا خطأً خامّاً.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError).
 * ========================================================================= */
import type { Invoice } from "@/types";
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";

export type OldDebtCurrency = "IQD" | "USD";
export interface OldDebtInput {
  name: string | null;
  phone: string | null;
  /** «شنو» — المادّةُ أو الخدمةُ التي عليها الدين. */
  what: string;
  /** «ليش» — سببُه أو ملاحظتُه (اختياريّ). */
  why: string | null;
  /** «شكد» — نصٌّ عشريٌّ قانونيّ (canonDec) لا عائم. */
  amount: string;
  currency: OldDebtCurrency;
  /** «شوكت» — اليومُ المحلّيّ YYYY-MM-DD (غيابُه = اليوم). */
  date: string | null;
  clientRef: string;
}

const code = (e: unknown) => String((e as { code?: string } | null)?.code ?? "");
const ABSENT = ["42883", "PGRST202"];
export const isOldDebtAbsent = (e: unknown): boolean => code(e) === "odebt_absent";

export async function addOldDebt(x: OldDebtInput): Promise<Invoice> {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
  if (supabase) {
    const r = await supabase.rpc("old_debt_add", {
      p_name: x.name, p_phone: x.phone, p_what: x.what, p_why: x.why, p_amount: x.amount,
      p_currency: x.currency, p_date: x.date, p_client_ref: x.clientRef,
    });
    if (r.error) {
      if (ABSENT.includes(code(r.error))) throw Object.assign(new Error("odebt_absent"), { code: "odebt_absent" });
      throw Object.assign(new Error(r.error.message), { code: r.error.code, details: r.error.details, hint: r.error.hint });
    }
    const inv = r.data as Invoice | null;
    if (!inv || typeof inv !== "object" || !inv.id) throw Object.assign(new Error("odebt_shape"), { code: "odebt_shape" });
    return inv;
  }
  return (await import("./demoOldDebt")).demoOldDebtAdd(x);
}
