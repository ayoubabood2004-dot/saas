/* ============================================================================
 * أسعارُ التطعيمات (0279) — الصِّرفُ: مفتاحُ الاسم ومرآتُه بالخادم، وقرارُ تعبئة السعر بشاشة البيع.
 *
 * طلبُ المالك (١٧/١١): «نسوي تسعيرات للتطعيمات … الدكتور لمن يختار تطعيم بالمبيعات يكون هو سعره سابقاً»، وجوابُه: **يتعبّى ويكدر
 * يغيّره**. فالقرارُ ثلاثُ قواعد:
 *  • يُعبّأ السعرُ حين تكون الخانةُ فارغةً أو فيها ما عبّأناه نحن — **ما كتبه الطبيبُ بيده لا يُداس** ولو اختار تطعيماً له سعر.
 *  • تطعيمٌ بلا سعرٍ بعد تطعيمٍ عبّأنا سعرَه يُفرغ الخانة: سعرُ تطعيمٍ لا يبقى على غيره فيُباع به بصمت.
 *  • خروجٌ من تبويب التطعيم (إلى الدواء) يُفرغ ما عبّأناه للسبب نفسِه.
 * ========================================================================= */

/** مرآةُ `lower(btrim(name))`: btrim يقصّ المسافةَ وحدها (لا كلَّ فراغ). */
export const vaxKey = (name: string): string => name.replace(/^ +| +$/g, "").toLowerCase();

export interface VaxPriceRow { name: string; price: number }

/** صفوفُ الجدول ⇒ خريطةٌ بالمفتاح. صفٌّ مكسور (بلا اسم أو سعرٍ غير رقم) يُرمى — لا سعرٌ يُخترع. */
export function vaxPriceMap(rows: readonly { name?: unknown; price?: unknown }[]): Map<string, VaxPriceRow> {
  const out = new Map<string, VaxPriceRow>();
  for (const r of rows) {
    const name = typeof r.name === "string" ? r.name : "";
    const price = typeof r.price === "number" ? r.price : typeof r.price === "string" && r.price.trim() !== "" ? Number(r.price) : NaN;
    if (!vaxKey(name) || !Number.isFinite(price) || price < 0) throw new Error("vaccine_prices_shape");
    out.set(vaxKey(name), { name, price });
  }
  return out;
}

/** خانةُ سعرٍ يكتبها المدير: أرقامٌ عربيةٌ أو لاتينية، وفواصلُ الآلاف (، ٬ ,) تُشال، و«٫» عشريّة. فارغٌ ⇒ null (يمسح السعر).
 *  غيرُ مقروء ⇒ NaN (الشاشةُ تقولها ولا ترسل). */
export function readVaxPrice(raw: string): number | null {
  const s = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٬,،\s]/g, "").replace(/٫/g, ".");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return n < 1e10 ? n : NaN;
}

/** قرارُ التعبئة. `cur` ما بالخانة الآن، و`auto` ما عبّأناه آخرَ مرّة (null = لا شيء)، و`want` سعرُ التطعيم المختار
 *  (undefined = بلا سعر أو لا تطعيم)، و`active` تبويبُ التطعيم مفتوح. يرجع الجديدَ أو null = لا تغيير. */
export function vaxPriceFill(cur: string, auto: string | null, want: number | undefined, active: boolean): { price: string; auto: string | null } | null {
  const ours = auto != null && cur === auto;
  if (!active || want == null) return ours ? { price: "", auto: null } : null;
  if (cur !== "" && !ours) return null;          // كتبه الطبيب — لا يُداس
  const next = String(want);
  return cur === next && auto === next ? null : { price: next, auto: next };
}
