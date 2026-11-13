/* ============================================================================
 * الجرعةُ بيع (0269) — بابٌ واحد للسحابة وللتجريبيّ. كسولٌ: الإعداداتُ وشاشةُ البيع تستوردانه بـimport() وحده
 * (repo.ts بحزمة الإقلاع، وشاشةُ البيع لا تستورد وحدةً ثابتةً جديدة).
 *
 * • حسابُ الدواء: `clinic_drug_billing_set` (صلاحيةُ المخزون، والمادّةُ بالعيادة وبالدينار) ثمّ قراءةُ القائمة من جديد.
 * • المعلَّقُ: `dose_charges_pending` — قاعدةٌ قبل 0269 (لا دالّة) ⇒ [] بصمت: الميزةُ غائبة لا «تعذّر» دائم (درسُ 0258).
 *   وأيُّ فشلٍ غيرِه يُرمى — قائمةٌ فارغةٌ عن خطأ تُصدَّق «ماكو جرعات».
 * • البيعةُ: `retail_checkout_doses` تبيع وتختم بمعاملةٍ واحدة؛ وسلّةٌ بلا جرعات تمرّ من repo.retailCheckout كما كانت.
 * ========================================================================= */
import type { CheckoutItem, DoseCharge, Invoice, SaleMeta } from "@/types";
import type { SheetCharge } from "./doseBilling";
import { supabase } from "./supabase";
import { getDrugsState, loadClinicDrugs } from "./clinicDrugs";
import { repo } from "./repo";

const code = (e: unknown) => String((e as { code?: string } | null)?.code ?? "");
const absent = (e: unknown) => ["42883", "PGRST202"].includes(code(e));
const local = () => import("./repoDemo").then((m) => m.loadDemoDose());

export interface DrugBilling { price: number | null; productId: string | null; qty: number | null; unit: "box" | "sub" | null }

/** قاعدةٌ قبل 0269: لا بابَ لحساب الدواء — الشاشةُ تقولها جملةً لا خطأً خامّاً. */
export const isDoseAbsent = (e: unknown): boolean => code(e) === "dose_absent";

export async function setDrugBilling(id: string, b: DrugBilling): Promise<void> {
  if (supabase) {
    const st = getDrugsState();
    if (st.status !== "ready" || !st.clinic) throw Object.assign(new Error("not_ready"), { code: "not_ready" });
    const r = await supabase.rpc("clinic_drug_billing_set", {
      p_clinic: st.clinic, p_id: id, p_price: b.price, p_product: b.productId, p_qty: b.productId ? b.qty : null, p_unit: b.productId ? b.unit : null,
    });
    if (r.error) throw absent(r.error) ? Object.assign(new Error("dose_absent"), { code: "dose_absent" }) : r.error;
  } else {
    (await local()).demoDrugBillingSet(id, b.price, b.productId, b.productId ? b.qty : null, b.productId ? b.unit : null);
  }
  await loadClinicDrugs(true);
}

/** معلَّقاتُ الزبون: بهاتفه أو اسمه (مفتاحُ الزبون كدليل الزبائن) أو بحيواناته المسمّاة على البيعة. */
export async function pendingDoses(phone: string | null, name: string | null, pets: readonly string[]): Promise<DoseCharge[]> {
  if (supabase) {
    const r = await supabase.rpc("dose_charges_pending", { p_phone: phone || null, p_name: name || null, p_pets: pets.length ? pets : null });
    if (r.error) { if (absent(r.error)) return []; throw r.error; }
    return ((r.data ?? []) as DoseCharge[]).map((c) => ({
      ...c, price: Number(c.price), stock_qty: c.stock_qty == null ? null : Number(c.stock_qty), dose_qty: c.dose_qty == null ? null : Number(c.dose_qty),
    }));
  }
  return (await local()).demoDosePending(phone || null, name || null, pets);
}

/** البيعةُ بجرعاتها: الخادمُ يقفل الجرعات ويبيع ويختمها مفوتَرةً بالمعاملة نفسِها. بلا جرعاتٍ: البيعةُ كما كانت. */
export async function checkoutWithDoses(items: CheckoutItem[], meta: SaleMeta): Promise<Invoice> {
  const ids = items.map((l) => l.dose_charge).filter((x): x is string => !!x);
  if (!ids.length) return repo.retailCheckout(items, meta);
  if (supabase) {
    const r = await supabase.rpc("retail_checkout_doses", { p_items: items, p_meta: meta, p_charges: ids });
    if (r.error) throw r.error;
    return r.data as Invoice;
  }
  return (await local()).demoDoseCheckout(items, meta, ids);
}

/** رمزُ رفضِ بابٍ من أبواب 0269 (الخادمُ يضعه بـmessage وشرحَه العربيَّ بـhint، والتجريبيُّ الرمزَ وحده) — الشاشةُ تقوله بلغتها. */
export function doseErrorCode(e: unknown): string | null {
  const m = /\b(dose_[a-z_]+|drug_row_gone|clinic_switched)\b/.exec(String((e as { message?: string } | null)?.message ?? ""));
  return m ? m[1] : null;
}

/** هل رُفضت البيعةُ لأنّ جرعةً فيها انحسبت أو انلغت من جهازٍ آخر (أو سطورُها لا تطابق)؟ — السلّةُ تُعاد مزامنتُها. */
export const isDoseStale = (e: unknown): boolean => {
  const m = `${code(e)} ${(e as { message?: string } | null)?.message ?? ""}`;
  return /dose_charge_(gone|lines|late)/.test(m);
};
/** «late»: مرجعُ البيعة ثبتت فاتورتُه بدون جرعاتٍ نزلت بعد المحاولة الأولى — تُشال، والإعادةُ ترجع الفاتورة. */
export const isDoseLate = (e: unknown): boolean => /dose_charge_late/.test(`${code(e)} ${(e as { message?: string } | null)?.message ?? ""}`);

/** معلَّقاتُ حيوانٍ واحد ومفوتَراتُه (للطبلة): قراءةٌ مباشرة بسياسة الجدول. جدولٌ غائب (قاعدةٌ قبل 0269) ⇒ [] بصمت؛ وغيرُه يُرمى —
 *  الطبلةُ لا ترسم «انحسبت» ولا مجموعاً عن قراءةٍ فشلت. */
export async function petDoseCharges(petId: string): Promise<SheetCharge[]> {
  if (supabase) {
    const r = await supabase.from("dose_charges").select("entry_id,status,price").eq("pet_id", petId).neq("status", "void");
    if (r.error) { if (["42P01", "PGRST205"].includes(code(r.error))) return []; throw r.error; }
    return ((r.data ?? []) as SheetCharge[]).map((c) => ({ ...c, price: Number(c.price) }));
  }
  return (await local()).demoPetCharges(petId);
}
