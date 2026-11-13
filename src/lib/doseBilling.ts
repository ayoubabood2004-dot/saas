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

/** مرآةُ `_dose_plan(p_price, p_qty, p_unit, p_sell, p_sub, p_upb)`. */
export function dosePlan(price: number | null | undefined, qty: number | null | undefined, unit: DoseUnit | null | undefined,
  sell: number | null | undefined, sub: number | null | undefined, upb: number | null | undefined): DosePlan {
  const q = qty ?? 1;
  const perBox = upb != null && upb > 0 ? upb : null;
  let p: number | null = price ?? null;
  if (p == null) {
    if (unit === "sub" && perBox) p = Math.round((sub ?? (sell ?? 0) / perBox) * q);
    else if (unit === "box") p = Math.round((sell ?? 0) * q);
  }
  const stock = unit === "sub" && perBox ? Math.round((q / perBox) * 1e9) / 1e9 : unit === "box" ? q : null;
  return { price: p, stockQty: stock };
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
