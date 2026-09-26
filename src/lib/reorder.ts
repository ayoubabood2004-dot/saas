import type { Product } from "@/types";

/* ============================================================================
 * اقتراحُ الطلب — م٥ (docs/inventory-vnext-plan.md). نقيٌّ ومفحوصٌ بـ`scripts/reorder-test.mjs`.
 *
 * المقيس (٢٦/٩): ٤٢١ مادةً عند نقطة إعادة الطلب أو تحتها والطلبُ يجري من الذاكرة.
 *
 * القاعدة، بلغة العيادة:
 *   • المعدّلُ = صافي المبيع بآخر `days` ÷ `days` (من الخادم: `product_sales_rate`).
 *   • نقطةُ إعادة الطلب (ROP) = المعدّل × مهلةِ الوصول + حدُّ التنبيه (`min_stock`):
 *     «إذا طلبناها هسّه، توصل قبل ما نوصل للحدّ؟»
 *   • تُقترح المادةُ حين رصيدُها ≤ ROP و ROP > 0 (مادةٌ لا تُباع ولا حدَّ لها لا تُقترح).
 *   • الكميةُ = ما يغطّي المهلةَ وشهراً بعدها فوق الحدّ، ناقصَ الرصيد، مقرّبةً للأعلى
 *     وواحدٌ على الأقل — **اقتراحٌ يعدّله المستخدم لا أمر**.
 *   • المجمَّعُ (`pooled`) خارجٌ: رصيدُه بحوض قسمه لا بصفّه، فالحسابُ عليه كاذب.
 * ========================================================================= */

export interface ReorderItem { product: Product; sold: number; perDay: number; rop: number; suggest: number }
export interface ReorderGroup { company: string; companyId: string | null; items: ReorderItem[] }

export const COVER_DAYS = 30;

export function reorderItem(p: Product, sold: number, days: number, leadDays: number): ReorderItem | null {
  if (p.pooled) return null;
  const perDay = Math.max(0, Number(sold) || 0) / Math.max(1, days);
  const min = Math.max(0, Number(p.min_stock) || 0);
  const stock = Number(p.stock) || 0;
  const rop = perDay * leadDays + min;
  if (rop <= 0 || stock > rop) return null;
  const suggest = Math.max(1, Math.ceil(perDay * (leadDays + COVER_DAYS) + min - stock));
  return { product: p, sold: Math.max(0, Number(sold) || 0), perDay, rop, suggest };
}

/** الاقتراحُ مجمَّعاً بالشركة — الأكثرُ موادَّ أوّلاً، و«بدون شركة» مجموعةٌ باسمها آخراً. */
export function reorderPlan(
  products: Product[], sold: ReadonlyMap<string, number>, days: number, leadDays: number,
  companyOf: (id: string | null | undefined) => string | undefined, noCompany: string,
): ReorderGroup[] {
  const m = new Map<string, ReorderGroup>();
  for (const p of products) {
    const it = reorderItem(p, sold.get(p.id) ?? 0, days, leadDays);
    if (!it) continue;
    const name = (p.company_id && companyOf(p.company_id)) || "";
    const key = name ? `c:${p.company_id}` : "none";
    const g = m.get(key) ?? { company: name || noCompany, companyId: name ? (p.company_id ?? null) : null, items: [] };
    g.items.push(it);
    m.set(key, g);
  }
  // داخل الشركة: الأقربُ للنفاد أوّلاً (أيامُ الرصيد المتبقية بالمعدّل).
  const left = (it: ReorderItem) => (it.perDay > 0 ? (Number(it.product.stock) || 0) / it.perDay : Infinity);
  for (const g of m.values()) g.items.sort((a, b) => left(a) - left(b) || a.product.name.localeCompare(b.product.name));
  return [...m.values()].sort((a, b) => Number(!a.companyId) - Number(!b.companyId) || b.items.length - a.items.length || a.company.localeCompare(b.company));
}

type T = (key: string, opts?: Record<string, unknown>) => string;

/** نصُّ الطلبية للمندوب (واتساب) — الاسمُ والكمية **بلا أسعار** (كقائمة الإرجاع بـم١). */
export function orderText(g: ReorderGroup, qtyOf: (it: ReorderItem) => number, t: T, dateISO: string): string {
  const lines = [t("reorder.textHead", { company: g.company, date: dateISO.replace(/-/g, "/") })];
  for (const it of g.items) {
    const q = qtyOf(it);
    if (q > 0) lines.push(t("reorder.textLine", { name: it.product.name, qty: q }));
  }
  return lines.join("\n");
}
