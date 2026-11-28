/* ============================================================================
 * وحدةُ المادّة وتحويلُها (0294) — قراراتٌ صِرفة يقرؤها نموذجُ المادّة ونافذةُ الدمج والمرآةُ التجريبيّة، ويفحصها unit-change-test.
 *
 * ثلاثةُ أعمدةٍ تقرّر بأيّ وحدةٍ كلُّ رقمٍ عن المادّة (الرصيد، المتوسّط، الدفعات، stock_qty سطور البيع القديمة، كميةُ الجرعة
 * والوصفة): بالوزن؟ وبالمفرد بأيّ عدد؟ تغييرُها بلا تحويلٍ كان يُبقي الرقمَ ويبدّل معناه (٣ أكياس ⇒ ٣ كيلو). فالخادمُ وحده يغيّرها
 * (`product_unit_change`) بنسبةٍ صريحة، والنموذجُ يسأل عنها هنا.
 *
 * الوحدةُ **الفعليّة** مرآةُ `_unit_key` بالخادم حرفاً: بالوزن أوّلاً، ثمّ المفردُ بعددٍ موجب، وإلا «بالعدد» — صفٌّ قديمٌ بمفردٍ
 * بلا عدد يُباع بالعدد عند كلّ قارئ، فهو «بالعدد».
 * ========================================================================= */

export interface UnitOf {
  weight: boolean;
  /** عددُ المفرد بالعلبة، أو null بلا مفرد. */
  per: number | null;
}
export type UnitKind = "weight" | "sub_on" | "sub_off" | "per" | "none";
/** النسبةُ كسرٌ صريح: الكميةُ بالوحدة الجديدة = القديمة × mul ÷ div (١/١٠ و١/١٥ بلا تقريبٍ قبل الضرب). */
export interface UnitFactor { mul: number; div: number }

type UnitCols = { sold_by_weight?: boolean | null; has_sub_unit?: boolean | null; units_per_box?: number | string | null };

export function unitOf(p: UnitCols): UnitOf {
  const weight = !!p.sold_by_weight;
  const n = Number(p.units_per_box ?? 0);
  return { weight, per: !weight && !!p.has_sub_unit && Number.isFinite(n) && n > 0 ? roundTo(n, 3) : null };
}

/** مفتاحُ الوحدة — `_unit_key` بالخادم: 'w' / 'n:<العدد>' / 'b'. */
export const unitKey = (u: UnitOf): string => (u.weight ? "w" : u.per != null ? `n:${roundTo(u.per, 3)}` : "b");
export const sameUnit = (a: UnitOf, b: UnitOf): boolean => unitKey(a) === unitKey(b);

/** نوعُ التغيير — `v_kind` بالخادم. */
export function unitKind(from: UnitOf, to: UnitOf): UnitKind {
  if (from.weight !== to.weight) return "weight";
  if (from.per == null && to.per != null) return "sub_on";
  if (from.per != null && to.per == null) return "sub_off";
  if (from.per != null && to.per != null && from.per !== to.per) return "per";
  return "none";
}

/** يحتاج جواباً من الطبيب: تبديلُ الوزن («كم كيلو بالواحدة؟») وتشغيلُ المفرد («الرصيدُ كان علباً أم قطعاً؟»). إطفاءُ المفرد
 *  وتغييرُ عدده لا: الرصيدُ علبٌ قبلهما وبعدهما. */
export const needsAnswer = (k: UnitKind): boolean => k === "weight" || k === "sub_on";

export interface UnitAnswer {
  /** للوزن: كم كيلو بالعلبة/القطعة الواحدة. */
  size?: number | null;
  /** لتشغيل المفرد: الرصيدُ الحاليّ (والمبيعاتُ القديمة) كانت علباً أم قطعاً صغيرة. */
  stockIn?: "box" | "sub" | null;
}

/** النسبةُ من الجواب — وnull ما دام الجوابُ ناقصاً أو غيرَ مقروء. والقيودُ قيودُ الخادم (موجبة، حتى مليون). */
export function factorFor(kind: UnitKind, to: UnitOf, ans: UnitAnswer): UnitFactor | null {
  if (kind === "none") return null;
  if (kind === "sub_off" || kind === "per") return { mul: 1, div: 1 };
  if (kind === "sub_on") {
    if (ans.stockIn === "box") return { mul: 1, div: 1 };
    if (ans.stockIn === "sub" && to.per != null) return { mul: 1, div: to.per };
    return null;
  }
  const s = Number(ans.size);
  if (ans.size == null || !Number.isFinite(s) || s <= 0 || s > 1_000_000) return null;
  return to.weight ? { mul: s, div: 1 } : { mul: 1, div: s };
}
export const scales = (f: UnitFactor | null): boolean => !!f && f.mul !== f.div;

/* ── الحساب: مرآةُ round(x * mul / div, d) بالخادم — بالكسر التامّ (BigInt) لا بالعائم ─────────────────────────
 * round بوستغريس نصفُه بعيداً عن الصفر، وJS's Math.round نصفُه نحو +∞ — والعائمُ يقرّب ٢٫٠٠٥ لـ٢٫٠٠ (تمثيلُه ٢٫٠٠٤٩٩…).
 * فالمرآةُ (التجريبيّ) تحسب ما يكتبه الخادم حرفاً، والمعاينةُ بالنموذج من الدالّة نفسِها. */
const P = 9;
function frac(x: number): [bigint, bigint] {
  const s = x.toFixed(P);
  const neg = s.startsWith("-");
  const [a, b = ""] = (neg ? s.slice(1) : s).split(".");
  const n = BigInt(a + b.padEnd(P, "0"));
  return [neg ? -n : n, 10n ** BigInt(P)];
}
/** (x × mul ÷ div) مقرَّباً لـd منازل، نصفُه بعيداً عن الصفر. */
export function scaleRound(x: number, mul: number, div: number, d: number): number {
  const [xn, xd] = frac(x), [mn, md] = frac(mul), [dn, dd] = frac(div);
  if (dn === 0n) return NaN;
  let num = xn * mn * dd, den = xd * md * dn;
  if (den < 0n) { num = -num; den = -den; }
  const k = 10n ** BigInt(d);
  const a = (num < 0n ? -num : num) * k;
  const q = (2n * a + den) / (2n * den);   // floor(|x|·10^d + ½): النصفُ بعيداً عن الصفر
  return Number(num < 0n ? -q : q) / Number(k);
}
export const roundTo = (x: number, d: number): number => scaleRound(x, 1, 1, d);

/** الرصيدُ/الكميةُ بوحدة المخزون الجديدة (ثلاث منازل كعمود الرصيد). */
export const scaleQty = (q: number, f: UnitFactor): number => scaleRound(q, f.mul, f.div, 3);
/** سعرُ الوحدة الجديدة: السعرُ × div ÷ mul (منزلتان كعمود السعر). */
export const scalePrice = (price: number, f: UnitFactor): number => scaleRound(price, f.div, f.mul, 2);
/** المتوسّطُ بالوحدة الجديدة (ستّ منازل كعمود المتوسّط). */
export const scaleCost = (cost: number, f: UnitFactor): number => scaleRound(cost, f.div, f.mul, 6);
/** الحدُّ الأدنى عددٌ صحيح: يُرفع للأعلى (تنبيهٌ أبكر أهون من تنبيهٍ يضيع)، وموجبٌ يبقى موجباً. */
export function scaleMin(min: number, f: UnitFactor): number {
  if (!(min > 0)) return 0;
  const exact = scaleRound(min, f.mul, f.div, 6);
  return Math.max(1, Math.ceil(exact - 1e-9));
}
