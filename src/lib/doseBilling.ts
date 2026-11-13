/* ============================================================================
 * الجرعةُ بيع (0269) — الحسابُ الصِّرف: مرآةُ `_dose_plan` و`treatment_entries_dose_charge` بالقاعدة.
 *
 * السعرُ: المكتوبُ على الدواء، وإلا سعرُ وحدة المادّة × كمّية الجرعة (الغائبةُ ١) مقرَّباً لدينار. والمخصومُ بوحدة الرصيد (العلبة):
 * الصغرى ÷ عددِها بتسع منازل. ومادّةٌ غابت أو صارت بالدولار أو فقدت وحدتَها الصغرى لا تُستعمل — فالسعرُ المكتوبُ وحده، أو لا حساب.
 * يطابقه dose-billing-test مع `_dose_plan` الحقيقيّة بالحزمة (حالةً بحالة).
 * ========================================================================= */
import type { ClinicDrug, Product } from "@/types";

export type DoseUnit = "box" | "sub";
export interface DosePlan { price: number | null; stockQty: number | null }

/* الحسابُ بالكسر التامّ لا بالعائم: نصفٌ تامٌّ عند المنزلة (١٠٠١ × ٣ ÷ ٦ = ٥٠٠٫٥) يقرّبه بوستغريس بعيداً عن الصفر، والعائمُ يراه أحياناً
 * ٥٠٠٫٤٩٩… — أمسكه dose-parity والمراجعةُ العدائيّة. فكلُّ رقمٍ عشريٌّ صحيحٌ ومقام، والتقريبُ نصفٌ بعيداً عن الصفر (round بالقاعدة). */
const dec = (x: number): [bigint, bigint] => {
  const s = Math.abs(x) < 1e-6 || Math.abs(x) >= 1e21 ? x.toFixed(20).replace(/0+$/, "") : String(x);
  const neg = s.startsWith("-");
  const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
  return [BigInt((i + f) || "0") * (neg ? -1n : 1n), 10n ** BigInt(f.length)];
};
const roundRatio = (num: bigint, den: bigint): bigint => {
  const q = num / den, r = num % den;
  return 2n * (r < 0n ? -r : r) >= den ? q + (num < 0n ? -1n : 1n) : q;
};

/** مرآةُ `_dose_plan(p_price, p_qty, p_unit, p_sell, p_sub, p_upb)`: السعرُ لدينار والمخصومُ بالعلبة بثلاث منازل. */
export function dosePlan(price: number | null | undefined, qty: number | null | undefined, unit: DoseUnit | null | undefined,
  sell: number | null | undefined, sub: number | null | undefined, upb: number | null | undefined): DosePlan {
  const [qn, qd] = dec(qty ?? 1);
  const per = upb != null && upb > 0 ? dec(upb) : null;
  let p: number | null = price ?? null;
  if (p == null) {
    if (unit === "sub" && per) {
      if (sub != null) { const [sn, sd] = dec(sub); p = Number(roundRatio(sn * qn, sd * qd)); }
      else { const [sn, sd] = dec(sell ?? 0); p = Number(roundRatio(sn * qn * per[1], sd * qd * per[0])); }
    } else if (unit === "box") { const [sn, sd] = dec(sell ?? 0); p = Number(roundRatio(sn * qn, sd * qd)); }
  }
  const stock = unit === "sub" && per ? Number(roundRatio(qn * per[1] * 1000n, qd * per[0])) / 1000
    : unit === "box" ? Number(roundRatio(qn * 1000n, qd)) / 1000 : null;
  return { price: p === 0 ? 0 : p, stockQty: stock };
}

export type DoseProduct = Pick<Product, "id" | "sell_price" | "sub_unit_price" | "units_per_box" | "price_currency">;

/** ما يُحسب لجرعةٍ تُعطى الآن من هذا الدواء — مرآةُ المحفّز: null = لا حساب. */
export function doseCharge(drug: Pick<ClinicDrug, "dose_price" | "dose_qty" | "dose_unit" | "product_id">, product: DoseProduct | null | undefined):
  { price: number; productId: string | null; stockQty: number | null } | null {
  if (drug.dose_price == null && !drug.product_id) return null;
  const unit = drug.dose_unit ?? null;
  const use = !!product && !!drug.product_id && product.id === drug.product_id && (product.price_currency ?? "IQD") !== "USD"
    && (unit === "box" || (unit === "sub" && (product.units_per_box ?? 0) > 0));
  const plan = use
    ? dosePlan(drug.dose_price, drug.dose_qty, unit, product!.sell_price, product!.sub_unit_price, product!.units_per_box)
    : { price: drug.dose_price ?? null, stockQty: null };
  if (plan.price == null) return null;
  return { price: plan.price, productId: use ? product!.id : null, stockQty: use ? plan.stockQty : null };
}

/** هل للدواء حسابٌ أصلاً (واحدٌ من الاثنين يكفي)؟ */
export const drugBills = (d: Pick<ClinicDrug, "dose_price" | "product_id">): boolean => d.dose_price != null || !!d.product_id;
