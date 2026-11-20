/* ============================================================================
 * بابُ البيع بسعرين (0282) — كسولٌ (شاشةُ البيع ونموذجُ المادّة يستوردانه بـimport()، لا يدخل الإقلاع).
 *  • `dualReady()`: هل القاعدةُ تعرف السطرَ بالدولار؟ (`dual_pricing_ready` — دالّةٌ غائبة 42883/PGRST202 ⇒ لا، والخيارُ مخفيّ بدل «تعذّر»
 *    دائم). نتيجةٌ «نعم» تُحفظ للجلسة؛ و«لا» تُسأل ثانيةً بعد دقيقة (الهجرةُ قد تُطبَّق والصفحةُ مفتوحة).
 *  • `dualCheckout(items, meta)`: بيعةٌ فيها سطرُ دولار ⇒ `retail_checkout_fx` (بجرعاتها إن وُجدت)؛ والخادمُ يحسب الدينار ويطابقه ويختم.
 *  • `dualRate()`: سعرُ صرف اليوم كما يعرفه الخادم — منه يُحسب دينارُ السطر (`iqdOfCents`) ويُرسل معرّفُه (`fx_rate_id`).
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { ReadOnlyError } from "./repo";
import type { CheckoutItem, Invoice, SaleMeta } from "@/types";
import type { UsdRate } from "./usdApi";

export interface DualLineIn extends CheckoutItem { price_currency?: "USD"; unit_price_usd?: string }
export type DualRate = { ok: true; rate: UsdRate } | { ok: false; why: "not_ready" | "disabled" | "no_rate" };

const MISSING = new Set(["42883", "PGRST202"]);
let readyYes = false;
let lastNo = 0;
export async function dualReady(): Promise<boolean> {
  if (!supabase) return true;
  if (readyYes) return true;
  if (lastNo && Date.now() - lastNo < 60_000) return false;
  try {
    const r = await supabase.rpc("dual_pricing_ready");
    if (!r.error && r.data === true) { readyYes = true; return true; }
    if (r.error && !MISSING.has(String(r.error.code ?? ""))) throw r.error;
  } catch (e) {
    if (!MISSING.has(String((e as { code?: string } | null)?.code ?? ""))) throw e;
  }
  lastNo = Date.now();
  return false;
}

/** سعرُ اليوم (أو لماذا لا سطرَ بالدولار الآن). يرمي على فشل الشبكة — الشاشةُ تقول «ما وصلنا» لا «ماكو دولار». */
export async function dualRate(): Promise<DualRate> {
  if (!(await dualReady())) return { ok: false, why: "not_ready" };
  const st = await (await import("./usdApi")).usdApi.state();
  if (!st.enabled) return { ok: false, why: "disabled" };
  if (!st.rate) return { ok: false, why: "no_rate" };
  return { ok: true, rate: st.rate };
}

export async function dualCheckout(items: DualLineIn[], meta: SaleMeta & { fx_rate_id: string }): Promise<Invoice> {
  /* اشتراكٌ منتهٍ للقراءة: البيعةُ العاديّة يردّها وكيلُ repo، وهذا البابُ يكلّم الخادمَ مباشرةً — فيسأل بنفسه (مراجعة 0282). */
  if (isConfigReadOnly()) throw new ReadOnlyError();
  const charges = items.map((l) => l.dose_charge).filter((x): x is string => !!x);
  if (!supabase) return (await import("./repoDemo").then((m) => m.loadDemoDual())).demoDualCheckout(items, meta, charges);
  const r = await supabase.rpc("retail_checkout_fx", { p_items: items, p_meta: meta, p_charges: charges.length ? charges : null });
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code, hint: r.error.hint, details: r.error.details });
  return r.data as Invoice;
}
