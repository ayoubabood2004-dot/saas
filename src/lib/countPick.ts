import type { CountReason, Product } from "@/types";

/* ============================================================================
 * الجردُ الدوريّ — م٦ (docs/inventory-vnext-plan.md). نقيٌّ ومفحوصٌ بـ`scripts/count-test.mjs`.
 *
 * «عدّ اليوم N» بدل جردٍ كبيرٍ بالسنة: كلَّ يومٍ خمسُ موادّ (إعداد)، مختارةٌ بترتيبٍ
 * يُقال للعادّ بكلمة:
 *   • **ABC** بقيمة مبيع ٩٠ يوماً (المبيع × سعر الشراء): A أوّلُ ٨٠٪ من القيمة، B
 *     حتى ٩٥٪، والباقي C. الغالي المتحرّك خطؤه يكلّف فلوساً — فيُعدّ أكثر.
 *   • **الأقدمُ عدّاً**: لكلّ صنفٍ دورة (A شهر، B ثلاثة، C ستة)، والتأخّرُ عنها
 *     يرفع المادة. ما انعدّت أبداً = متأخّرةٌ سنة.
 *   • **المشكوك**: فرقٌ بآخر ٩٠ يوماً يضاعف الأولوية — ما فرّق قبل يحتمل يفرّق.
 * والمجمَّعةُ (`pooled`) ومخزنُ الحقل خارجان، والمعلَّقةُ بانتظار الموافقة، وما
 * انعدّ اليوم. ومادةٌ رصيدُها صفر ولا تُباع لا شيءَ فيها يُعدّ.
 *
 * والأسبابُ مرآةُ `stock_count_submit` (0216) — النقصُ غيرُ الزيادة.
 * ========================================================================= */

export type AbcClass = "A" | "B" | "C";
export type PickWhy = "abc_a" | "never" | "stale" | "suspect";

export interface CountState { lastCountedAt: string | null; lastDiffAt: string | null }
export interface CountPick {
  product: Product; abc: AbcClass; daysSince: number | null; suspect: boolean; score: number; why: PickWhy[];
}

export const CYCLE_DAYS: Record<AbcClass, number> = { A: 30, B: 90, C: 180 };
const NEVER_DAYS = 365;
const SUSPECT_DAYS = 90;
const DAY = 86_400_000;

/** أسبابُ النقص وأسبابُ الزيادة — «تالف» لا يفسّر زيادة، و«لقينا زيادة» لا يفسّر نقصاً. */
export const LOSS_REASONS: readonly CountReason[] = ["damaged", "expired", "shortage", "entry_error"];
export const GAIN_REASONS: readonly CountReason[] = ["found", "entry_error"];
/** ما يصير سحباً «من المخزن» عند الموافقة — خطأُ الإدخال لم يكن مالاً أصلاً. */
export const WITHDRAWAL_REASONS: readonly CountReason[] = ["damaged", "expired", "shortage"];

export const countable = (p: Product): boolean => !p.pooled && !p.farm_id;

export const reasonsFor = (diff: number): readonly CountReason[] =>
  diff < 0 ? LOSS_REASONS : diff > 0 ? GAIN_REASONS : [];

/** قيمةُ الفرق بسعر الشراء — موجبٌ خسارة، سالبٌ زيادة (نفسُ إشارة `report_stock_losses`). */
export const diffValue = (system: number, counted: number, cost: number): number =>
  (system - counted) * Math.max(0, Number(cost) || 0);

export function abcClasses(products: readonly Product[], sold: ReadonlyMap<string, number>): Map<string, AbcClass> {
  const vals = products
    .map((p) => ({ id: p.id, v: Math.max(0, Number(sold.get(p.id)) || 0) * Math.max(0, Number(p.purchase_price) || 0) }))
    .sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  const total = vals.reduce((s, x) => s + x.v, 0);
  const out = new Map<string, AbcClass>();
  let before = 0;
  for (const x of vals) {
    // الصنفُ بما **قبل** المادة: المادةُ التي تعبر ٨٠٪ تبقى A (هي من صنعت العبور).
    const share = total > 0 ? before / total : 1;
    out.set(x.id, x.v <= 0 ? "C" : share < 0.8 ? "A" : share < 0.95 ? "B" : "C");
    before += x.v;
  }
  return out;
}

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function pickToday(
  products: readonly Product[], sold: ReadonlyMap<string, number>, state: ReadonlyMap<string, CountState>,
  n: number, now: Date, pending: ReadonlySet<string> = new Set(),
): CountPick[] {
  const pool = products.filter((p) => countable(p) && !pending.has(p.id)
    && ((Number(p.stock) || 0) > 0 || (Number(sold.get(p.id)) || 0) > 0));
  const abc = abcClasses(pool, sold);
  const picks: (CountPick & { value: number })[] = [];
  for (const p of pool) {
    const st = state.get(p.id);
    const last = st?.lastCountedAt ? new Date(st.lastCountedAt) : null;
    if (last && sameLocalDay(last, now)) continue;
    const cls = abc.get(p.id) ?? "C";
    const daysSince = last ? Math.max(0, Math.floor((now.getTime() - last.getTime()) / DAY)) : null;
    const suspect = !!st?.lastDiffAt && now.getTime() - new Date(st.lastDiffAt).getTime() <= SUSPECT_DAYS * DAY;
    const score = ((daysSince ?? NEVER_DAYS) / CYCLE_DAYS[cls]) * (suspect ? 2 : 1);
    const why: PickWhy[] = [];
    if (cls === "A") why.push("abc_a");
    if (daysSince === null) why.push("never");
    else if (daysSince >= CYCLE_DAYS[cls]) why.push("stale");
    if (suspect) why.push("suspect");
    const value = (Number(sold.get(p.id)) || 0) * (Number(p.purchase_price) || 0);
    picks.push({ product: p, abc: cls, daysSince, suspect, score, why, value });
  }
  picks.sort((a, b) => b.score - a.score || b.value - a.value || a.product.name.localeCompare(b.product.name));
  return picks.slice(0, Math.max(0, Math.floor(n))).map(({ value: _v, ...rest }) => rest);
}

/** الراكد: رصيدٌ بلا مبيعٍ بالمدّة — قيمتُه بسعر الشراء، الأغلى أوّلاً. */
export function deadStock(products: readonly Product[], sold: ReadonlyMap<string, number>): { product: Product; value: number }[] {
  return products
    .filter((p) => countable(p) && (Number(p.stock) || 0) > 0 && !((Number(sold.get(p.id)) || 0) > 0))
    .map((p) => ({ product: p, value: (Number(p.stock) || 0) * Math.max(0, Number(p.purchase_price) || 0) }))
    .sort((a, b) => b.value - a.value || a.product.name.localeCompare(b.product.name));
}
