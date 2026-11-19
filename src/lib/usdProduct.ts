/* ============================================================================
 * سعرُ المادّة بالدولار بنموذج المادّة (0264) — صِرفٌ يستورده Inventory.tsx ثابتاً (لا نصّ، لا شبكة):
 * المسودّة، وما يمنعها، وما يُرسَل.
 *
 *  • ممنوعٌ على مادّة الدولار (قيدُ products_usd_ok): الوزنُ والوحدةُ الفرعية والحوض — حسابُ أسعارٍ مشتقّة يحتاج تصميمَه بالدولار.
 *    النموذجُ يقولها بمكانها قبل أن يرفضها الخادمُ بـ23514. والكراتينُ مسموحةٌ منذ 0272: سعرُها بعملة المادّة (الدولار).
 *  • يُرسَل ما تغيّر وحده (كالسعر بالدينار، 0226): نموذجٌ فُتح قبل تعديلٍ من جهازٍ ثانٍ لا يدوسه بحفظ اسم.
 *  • لا يُرسَل شيءٌ والميزةُ مطفأة (`enabled` false): قاعدةٌ قبل 0264 لا تعرف الأعمدة (PGRST204).
 *  • **بسعرين (0282)** — `dual`: المادّةُ دينارٌ بكلّ آلته (الوحدةُ الفرعية، الكراتين) ولها سعرُ بيعٍ بالدولار، والسطرُ يختار عملتَه بالبيع.
 *    فلا «ممنوع» إلا الوزن (السطرُ بالدولار لا يُوزن). وسعرُ الوحدة الفرعية بالدولار (`sub`) فارغٌ = محسوبٌ من العلبة ÷ العدد، ولا يُرسل
 *    إلا والقاعدةُ تعرف عمودَه (`dualReady`). والعودةُ «للدينار وحده» تمسح سعرَ الدولار — وإلا بقيت المادّةُ بسعرين بلا قرار.
 * ========================================================================= */
import type { Product } from "@/types";
import { centsOf, usdText } from "./usdMath";

/** `on` = بالدولار وحده (0264)؛ `dual` = بالدينار والدولار (0282)؛ كلاهما false = بالدينار وحده. `sub` سعرُ المفرد بالدولار ("" محسوب). */
export interface UsdDraft { on: boolean; dual: boolean; sell: string; buy: string; sub: string }
export interface UsdBlockers { weight: boolean; sub: boolean; pooled: boolean }
export type UsdDraftProblem = "blocked" | "sell" | "buy" | "sub";
type UsdFields = Partial<Pick<Product, "price_currency" | "sell_price_usd" | "purchase_price_usd" | "sub_unit_price_usd">>;

export const usdDraftOf = (p?: Product | null): UsdDraft => ({
  on: p?.price_currency === "USD",
  dual: p?.price_currency !== "USD" && p?.sell_price_usd != null,
  sell: p?.sell_price_usd != null ? String(p.sell_price_usd) : "",
  buy: p?.purchase_price_usd != null ? String(p.purchase_price_usd) : "",
  sub: p?.sub_unit_price_usd != null ? String(p.sub_unit_price_usd) : "",
});

/** ما يمنع الحفظ، أو null. سعرُ البيع لازم (بلاه usd_no_price عند البيع)، والشراءُ اختياريّ (كلفةُ صفرٍ تُرى بالربح). */
export function usdDraftProblem(d: UsdDraft, b: UsdBlockers): UsdDraftProblem | null {
  if (!d.on && !d.dual) return null;
  if (d.on ? b.weight || b.sub || b.pooled : b.weight) return "blocked";
  const s = centsOf(d.sell);
  if (s == null || s < 0n) return "sell";
  if (d.buy.trim() !== "") { const c = centsOf(d.buy); if (c == null || c < 0n) return "buy"; }
  if (d.dual && b.sub && d.sub.trim() !== "") { const c = centsOf(d.sub); if (c == null || c < 0n) return "sub"; }
  return null;
}

const dollars = (s: string): number | null => { const c = centsOf(s); return c == null ? null : Number(c) / 100; };

/** الحقولُ التي تُرسَل: ما يختلف عن المادّة كما فُتحت (أو كلُّها لمادّةٍ جديدة بالدولار). مطفأةً ⇒ لا شيء. */
export function usdPatch(d: UsdDraft, p: Product | null | undefined, enabled: boolean, dualReady = false, hasSub = false): UsdFields {
  if (!enabled) return {};
  const out: UsdFields = {};
  const cur = d.on ? "USD" : "IQD";
  const dual = d.dual && !d.on;
  const sub = dual && hasSub && d.sub.trim() !== "" ? dollars(d.sub) : null;
  if (!p) {
    if (d.on) return { price_currency: "USD", sell_price_usd: dollars(d.sell), purchase_price_usd: d.buy.trim() === "" ? null : dollars(d.buy) };
    if (!dual) return out;
    return { sell_price_usd: dollars(d.sell), purchase_price_usd: d.buy.trim() === "" ? null : dollars(d.buy), ...(dualReady && sub != null ? { sub_unit_price_usd: sub } : {}) };
  }
  if ((p.price_currency ?? "IQD") !== cur) out.price_currency = cur;
  if (d.on || dual) {
    const sell = dollars(d.sell);
    const buy = d.buy.trim() === "" ? null : dollars(d.buy);
    if ((p.sell_price_usd ?? null) !== sell) out.sell_price_usd = sell;
    if ((p.purchase_price_usd ?? null) !== buy) out.purchase_price_usd = buy;
  } else if (p.sell_price_usd != null) {
    // «بالدينار وحده»: سعرُ البيع بالدولار يُمسح — بقاؤه يجعلها «بسعرين» (0282). والشراءُ بالدولار يبقى (آخرُ شراءٍ بالدولار، 0274).
    out.sell_price_usd = null;
  }
  if (dualReady && (p.sub_unit_price_usd ?? null) !== sub) out.sub_unit_price_usd = sub;
  return out;
}

/** سعرُ مادّة الدولار للعرض بقائمة المخزن: «$12.50»، والغائبُ «$—» (لا صفر: الصفرُ سعرٌ والفراغُ ليس سعراً). */
export const usdPriceText = (n: number | null | undefined): string => (n == null ? "$—" : usdText(centsOf(String(n)) ?? 0n));
