/* الشراءُ بالعملتين (0274) — حسابٌ صِرف بلا نصوص، تستورده فاتورةُ الشراء ثابتاً وقطعُ نطاق `pfx` (PurchaseFx.tsx) معاً: المالكُ لا
 * يُستورد ثابتاً (i18n-owned-guard)، فما يحتاجه الطرفان هنا. */
import type { Product, Purchase, PurchaseItem } from "@/types";
import { centsOf, decOf, usdText } from "./usdMath";

export type FxCur = "IQD" | "USD";

/** «سعر 100$» كما يقوله السوق ⇒ سعرُ الدولار الواحد بأربع منازل (كالقاعدة)، أو null إن لم يُقرأ أو خرج عن 100..100000. */
export function ratePerUsd(per100: string): number | null {
  const v = decOf(per100.trim(), 2);
  if (v == null) return null;
  const r = Number(v) / 10000;
  return r >= 100 && r <= 100000 ? Math.round(r * 10000) / 10000 : null;
}
/** سعرُ الدولار الواحد ⇒ «سعر 100$» للخانة. */
export const per100Text = (rate: number | null | undefined): string => (rate ? String(Math.round(rate * 100 * 100) / 100) : "");

/** مبلغٌ بالدولار للعرض («$1,234.50»). */
export const usdOf = (n: number): string => usdText(centsOf(String(Math.round((Number(n) || 0) * 100) / 100)) ?? 0n);

/** باقي الفاتورة بعملتها (الدولارُ من أعمدته). */
export const purchaseDueCur = (p: Purchase): number =>
  p.currency === "USD" ? Math.max(0, Math.round((Number(p.total_usd ?? 0) - Number(p.paid_usd ?? 0)) * 100) / 100)
    : Math.max(0, Math.round((p.total - (p.amount_paid ?? p.total)) * 100) / 100);

/** عملةُ بيع سطر الشراء: المادّةُ القائمة بعملتها، والجديدةُ بما اختاره سطرُها (مرآةُ _purchase_fx_prep). */
export const lineSellCur = (product: Product | undefined, chosen: FxCur | undefined): FxCur =>
  product ? (product.price_currency === "USD" ? "USD" : "IQD") : (chosen ?? "IQD");

/** تبديلُ عملة الفاتورة يحوّل ما كُتب (سعر الشراء، الخصمُ المبلغ، المدفوع) بالسعر: لا «7,350$» عن سعرٍ كُتب ديناراً. */
export function convertTyped(v: string, from: FxCur, to: FxCur, rate: number | null): string {
  if (from === to || rate == null || v.trim() === "") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return String(to === "USD" ? Math.round((n / rate) * 100) / 100 : Math.round(n * rate));
}

/** فاتورةُ الدولار للطباعة بدولارها: الإجماليُّ والمدفوعُ والخصمُ وكلفةُ كلّ سطر — وغيرُها كما هي. والرمزُ «$» يمرّ بخيار الطباعة. */
export function usdPrintView(p: Purchase, items: PurchaseItem[]): { purchase: Purchase; items: PurchaseItem[]; usd: boolean } {
  if (p.currency !== "USD") return { purchase: p, items, usd: false };
  const rate = Number(p.fx_rate) || 0;
  return {
    usd: true,
    purchase: { ...p, total: Number(p.total_usd ?? 0), amount_paid: Number(p.paid_usd ?? 0), discount: Number(p.discount_usd ?? 0) },
    items: items.map((it) => ({ ...it, purchase_price: it.purchase_price_usd ?? (rate ? Math.round((it.purchase_price / rate) * 100) / 100 : 0) })),
  };
}
