/* ============================================================================
 * سعرُ المادّة بالدولار بنموذج المادّة (0264) — صِرفٌ يستورده Inventory.tsx ثابتاً (لا نصّ، لا شبكة):
 * المسودّة، وما يمنعها، وما يُرسَل.
 *
 *  • ممنوعٌ على مادّة الدولار بالمرحلة ١ (قيدُ products_usd_ok): الوزنُ والوحدةُ الفرعية والحوضُ والكراتين — حسابُ أسعارٍ
 *    مشتقّة يحتاج تصميمَه بالدولار. النموذجُ يقولها بمكانها قبل أن يرفضها الخادمُ بـ23514.
 *  • يُرسَل ما تغيّر وحده (كالسعر بالدينار، 0226): نموذجٌ فُتح قبل تعديلٍ من جهازٍ ثانٍ لا يدوسه بحفظ اسم.
 *  • لا يُرسَل شيءٌ والميزةُ مطفأة (`enabled` false): قاعدةٌ قبل 0264 لا تعرف الأعمدة (PGRST204).
 * ========================================================================= */
import type { Product } from "@/types";
import { centsOf, usdText } from "./usdMath";

export interface UsdDraft { on: boolean; sell: string; buy: string }
export interface UsdBlockers { weight: boolean; sub: boolean; pooled: boolean; packs: boolean }
export type UsdDraftProblem = "blocked" | "sell" | "buy";
type UsdFields = Partial<Pick<Product, "price_currency" | "sell_price_usd" | "purchase_price_usd">>;

export const usdDraftOf = (p?: Product | null): UsdDraft => ({
  on: p?.price_currency === "USD",
  sell: p?.sell_price_usd != null ? String(p.sell_price_usd) : "",
  buy: p?.purchase_price_usd != null ? String(p.purchase_price_usd) : "",
});

/** ما يمنع الحفظ، أو null. سعرُ البيع لازم (بلاه usd_no_price عند البيع)، والشراءُ اختياريّ (كلفةُ صفرٍ تُرى بالربح). */
export function usdDraftProblem(d: UsdDraft, b: UsdBlockers): UsdDraftProblem | null {
  if (!d.on) return null;
  if (b.weight || b.sub || b.pooled || b.packs) return "blocked";
  const s = centsOf(d.sell);
  if (s == null || s < 0n) return "sell";
  if (d.buy.trim() !== "") { const c = centsOf(d.buy); if (c == null || c < 0n) return "buy"; }
  return null;
}

const dollars = (s: string): number | null => { const c = centsOf(s); return c == null ? null : Number(c) / 100; };

/** الحقولُ التي تُرسَل: ما يختلف عن المادّة كما فُتحت (أو كلُّها لمادّةٍ جديدة بالدولار). مطفأةً ⇒ لا شيء. */
export function usdPatch(d: UsdDraft, p: Product | null | undefined, enabled: boolean): UsdFields {
  if (!enabled) return {};
  const out: UsdFields = {};
  const cur = d.on ? "USD" : "IQD";
  if (!p) {
    if (!d.on) return out;
    return { price_currency: "USD", sell_price_usd: dollars(d.sell), purchase_price_usd: d.buy.trim() === "" ? null : dollars(d.buy) };
  }
  if ((p.price_currency ?? "IQD") !== cur) out.price_currency = cur;
  if (d.on) {
    const sell = dollars(d.sell);
    const buy = d.buy.trim() === "" ? null : dollars(d.buy);
    if ((p.sell_price_usd ?? null) !== sell) out.sell_price_usd = sell;
    if ((p.purchase_price_usd ?? null) !== buy) out.purchase_price_usd = buy;
  }
  return out;
}

/** سعرُ مادّة الدولار للعرض بقائمة المخزن: «$12.50»، والغائبُ «$—» (لا صفر: الصفرُ سعرٌ والفراغُ ليس سعراً). */
export const usdPriceText = (n: number | null | undefined): string => (n == null ? "$—" : usdText(centsOf(String(n)) ?? 0n));
