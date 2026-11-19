/* ============================================================================
 * المادّةُ بسعرين (0282) — الحسابُ الصِّرف: سعرُ كلّ مستوىً بالدولار، ودينارُه بسعر صرف اليوم.
 *
 *  • «بسعرين» = عملتُها دينار (كلُّ آلة الدينار: الوحدةُ الفرعية والكراتين والحوض) ولها `sell_price_usd`. مادّةُ «الدولار وحده» (0264)
 *    ليست منها — تُباع ببيع الدولار.
 *  • سعرُ المستوى بالدولار: العلبةُ `sell_price_usd`؛ الوحدةُ الفرعية `sub_unit_price_usd` وإلا **العلبةُ ÷ عددها** (قرارُ المالك: «يحسبه
 *    السستم ويتغيّر»)؛ الكارتونُ `pack.sell_price_usd` وإلا العلبةُ × عددها. بالسنت (أعدادٌ صحيحة) — لا عائم.
 *  • دينارُ الوحدة = `iqdOf(سنت, سعر, 1)` — مرآةُ `_usd_iqd(usd, rate, 1)` بالخادم حرفاً (دينارٌ كامل)؛ والخادمُ يرفض سطراً دينارُه غيرُ
 *    هذا (`dual_price_mismatch`) فالمرآةُ شرطُ البيع لا تجميل.
 * ========================================================================= */
import type { Product, ProductPack } from "@/types";
import { iqdOf } from "./usdMath";

export type DualLevel = "box" | "sub" | "pack";
type Priced = Pick<Product, "price_currency" | "sell_price_usd" | "sub_unit_price_usd" | "units_per_box" | "has_sub_unit" | "sold_by_weight">;

const centsOfNum = (n: unknown): number | null => {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
};

/** للمادّة سعرٌ بالدولار فوق دينارها؟ */
export const isDual = (p: Partial<Priced> | null | undefined): boolean =>
  !!p && (p.price_currency ?? "IQD") !== "USD" && centsOfNum(p.sell_price_usd) != null && !p.sold_by_weight;

/** سعرُ المستوى بالدولار بالسنت — المكتوبُ وإلا المحسوب؛ null = لا سعر (ليست بسعرين، أو مفردٌ بلا عدد، أو كارتونٌ غائب). */
export function usdCentsOf(p: Partial<Priced> | null | undefined, level: DualLevel, pack?: Pick<ProductPack, "per" | "sell_price_usd"> | null): number | null {
  if (!isDual(p)) return null;
  const box = centsOfNum(p!.sell_price_usd) as number;
  if (level === "box") return box;
  if (level === "sub") {
    const own = centsOfNum(p!.sub_unit_price_usd);
    if (own != null) return own;
    const n = Number(p!.units_per_box) || 0;
    return p!.has_sub_unit && n > 0 ? Math.round(box / n) : null;
  }
  if (!pack || !(Number(pack.per) >= 2)) return null;
  const own = centsOfNum(pack.sell_price_usd);
  return own ?? box * Number(pack.per);
}

/** سعرُ الوحدة الفرعية بالدولار محسوباً (للخانة الفارغة بالنموذج) — نصٌّ بمنزلتين أو "". */
export function subUsdComputed(boxUsd: string, unitsPerBox: number): string {
  const c = centsOfNum(boxUsd.trim() === "" ? null : boxUsd);
  if (c == null || !(unitsPerBox > 0)) return "";
  return (Math.round(c / unitsPerBox) / 100).toFixed(2);
}

/** دينارُ وحدةٍ بالدولار بسعر الصرف (`rate1e4`: الدولارُ الواحد بأربع منازل) — مرآةُ `_usd_iqd(usd, rate, 1)`. */
export const iqdOfCents = (cents: number, rate1e4: bigint): number => Number(iqdOf(BigInt(Math.round(cents)), rate1e4, 1));

/** «$58.00» بلا فواصل غريبة — للعرض تحت السطر وبالفاتورة. */
export const usdLabel = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
