/* ============================================================================
 * رفعُ الأسعار بنسبة (0226) — الحسابُ كلُّه هنا، ومرآتُه بالقاعدة حرفاً بحرف.
 *
 * طلبُ المالك: «اريد رفع سعر المنتج يرتفع بشكل صحيح ومابي اغلاط بالارقام وما يكون
 * شيء عشوائي». فلا عشريٌّ عائم بأيّ خطوة: السعرُ بالفلوس (×١٠٠، صحيحٌ BigInt)،
 * والنسبةُ بنقاط الأساس (٢٥٪ = ٢٥٠٠)، والقسمةُ صحيحةٌ بالسقف. بالعائم كانت
 * 750 × 1.10 = 825.0000000000001 تُقرَّب لأعلى إلى 850 — والخادمُ يكتب 825.
 *
 * ── القاعدة ─────────────────────────────────────────────────────────────
 *   الخام = السعر × (١ + النسبة).  الجديد = الخامُ مقرَّباً **لأعلى** لمضاعفِ خطوة.
 *   «ذكي» (الافتراضيّ): أكبرُ خطوةٍ بسلّم العملة (حتى ٢٥٠ للدينار) **يضيف تقريبُها
 *   أقلَّ من ربع الزيادة**. «ثابت»: الخطوةُ التي اختارها المستخدم لكلّ سعر.
 *
 * المقيسُ على أسعار الإنتاج كلِّها (٣٢٢٩ منتجاً و٩٧٨ خدمة) قبل الاختيار: القاعدةُ
 * الأولى («أكبرُ خطوةٍ ≤ نصف الزيادة» بلا نظرٍ للخام) رفعت 1000 بـ٢٥٪ إلى 1300 بدل
 * 1250 الصريحة. والذكيّةُ: ٨٧٪ من الأسعار مضاعفاتُ ٢٥٠ بـ٢٥٪، وكلُّ سعرٍ ≥ ١٠٠ يرتفع
 * بين ٢٥٪ و٣٠٪ (1666 ⇒ 2100، 1250 ⇒ 1600، 5000 ⇒ 6250).
 *
 * ما يُضمن ويُفحص: الجديدُ أكبرُ من القديم دائماً؛ السعران المتساويان يصيران متساويَين
 * (مجموعاتُ «نفس السعر» تبقى متساوية)؛ والأغلى قبلُ لا يصير أرخصَ بعد (رتابة)؛
 * وبالذكيّ الرفعُ الفعليّ أقلُّ من مرّةٍ وربعِ النسبة إلا عند أصغر وحدة (سعر ٢ ⇒ ٣)،
 * فيُعلَّم «قفزة» ويُرى قبل الحفظ.
 *
 * ── لماذا السقفُ لا «الأقرب» ────────────────────────────────────────────
 * «الأقرب» يُنزل السعر أحياناً: 1100 بـ٥٪ لأقرب 1000 = 1000. رفعٌ يُنقص سعراً
 * خطأٌ لا يُغتفر بهذه الشاشة.
 *
 * والمرآةُ بالقاعدة (`_price_new` بـ0226) تُفحص مقابل هذا الملفّ نفسِه (لا نسخةٍ
 * منه) بـ`price-parity.mjs` داخل الحزمة.
 * ========================================================================= */
import { currencyInfo } from "./currency";

/** أقصى نسبةٍ تُقبل: ١٠٠٪ (ضِعف السعر). أكثرُ منها خطأُ كتابةٍ أرجحُ من نيّة. */
export const MAX_BP = 10000;

/** سلّمُ الخطوات بوحدات العملة — **كلُّ درجةٍ تقسم التي فوقها** (١|٥|٢٥|٥٠|٢٥٠…).
 *  بسلّمٍ فيه ١٠٠ و٢٥٠ معاً (١٠٠ لا تقسم ٢٥٠) كان السقفُ لدرجةٍ أنعم يتجاوز سقفَ
 *  الأخشن: 6204 بـ٨٪ ⇒ 6800 و6250 ⇒ 6750 — الأرخصُ صار أغلى (أمسكه تدقيقٌ عدائيّ،
 *  ٣٦٤ انقلاباً بمسحٍ كامل). بسلسلة القواسم صفرُ انقلابٍ على ٤ ملايين حالة. */
const LADDER_WHOLE = [1, 5, 25, 50, 250, 500, 1000];
const LADDER_FRAC = [0.01, 0.05, 0.25, 0.5, 1, 5, 10];

/** هل تُعرض العملةُ بكسور؟ (مرآةُ `frac` بـcurrency.ts — والقاعدةُ تحمل القائمةَ نفسها.) */
export function isFracCurrency(code: string | null | undefined): boolean {
  return !!currencyInfo((code || "IQD").toUpperCase()).frac;
}

export function ladderFor(frac: boolean): number[] { return frac ? LADDER_FRAC : LADDER_WHOLE; }

export type RoundMode = "smart" | "fixed";

/** خياراتُ «ثابت» بالقائمة — «بلا تقريب» أوّلاً (= أصغرُ وحدة). */
export function fixedChoices(code: string | null | undefined): number[] {
  const c = (code || "IQD").toUpperCase();
  if (isFracCurrency(c)) return [0.01, 0.05, 0.25, 0.5, 1];
  if (c === "IQD" || c === "LBP" || c === "SYP") return [1, 250, 500, 1000];
  return [1, 5, 25];
}

/** سقفُ «الذكيّ»: ٢٥٠ للدينار العراقي (٩٤٪ من أسعار الإنتاج مضاعفاتُها)، و١٠٠٠ للّيرتين
 *  (أسعارٌ بمئات الألوف)، و٥ لبقيّة العملات الصحيحة، وربعٌ لذات الكسور. */
export function smartMax(code: string | null | undefined): number {
  const c = (code || "IQD").toUpperCase();
  if (isFracCurrency(c)) return 0.25;
  if (c === "IQD") return 250;
  if (c === "LBP" || c === "SYP") return 1000;
  return 5;
}

/** سعرٌ مخزَّنٌ (≤ خانتين) ← فلوسٌ صحيحة. الخطأُ العائم أصغرُ من نصف فلس فـround يكفي. */
export function toCents(n: number): bigint {
  return BigInt(Math.round((Number(n) || 0) * 100));
}
export function fromCents(c: bigint): number { return Number(c) / 100; }

/** سقفُ الخام (×١٠٠٠٠) لمضاعف s بالفلوس. */
function ceilTo(raw1e4: bigint, s: bigint): bigint {
  const d = 10000n * s;
  return ((raw1e4 + d - 1n) / d) * s;
}

/** الخطوةُ لهذا السعر بالفلوس. «ثابت» = ما اختير. «ذكي» = أكبرُ درجةٍ ≤ السقف يضيف
 *  تقريبُها **أقلَّ** من ربع الزيادة (بالضبط: (الجديد − الخام)·4 < الزيادة)، وإلا أصغرُ وحدة. */
export function stepCents(oldC: bigint, bp: number, round: RoundMode, maxStep: number, frac: boolean): bigint {
  const unit = frac ? 1n : 100n;
  const max = toCents(maxStep);
  if (round === "fixed") return max >= unit ? max : unit;
  const raw = oldC * BigInt(10000 + bp);
  const inc = oldC * BigInt(bp);
  const lad = ladderFor(frac);
  for (let i = lad.length - 1; i >= 0; i--) {
    const lc = toCents(lad[i]);
    if (lc > max || lc < unit) continue;
    if ((ceilTo(raw, lc) * 10000n - raw) * 4n < inc) return lc;
  }
  return unit;
}

/** السعرُ الجديد بالفلوس. */
export function raiseCents(oldC: bigint, bp: number, s: bigint): bigint {
  return ceilTo(oldC * BigInt(10000 + bp), s);
}

export interface Raised { price: number; step: number }
/** السعرُ الجديد وخطوتُه — ما تعرضه المعاينة وما تكتبه المرآةُ التجريبية. */
export function raisePrice(old: number, bp: number, round: RoundMode, maxStep: number, frac: boolean): Raised {
  const oldC = toCents(old);
  const s = stepCents(oldC, bp, round, maxStep, frac);
  return { price: fromCents(raiseCents(oldC, bp, s)), step: fromCents(s) };
}

/** «قفزة»: الرفعُ الفعليّ أكثرُ من مرّةٍ ونصفِ المطلوب (يقع عند أصغر وحدة وحدها). */
export function isJump(old: number, next: number, bp: number): boolean {
  const o = toCents(old), n = toCents(next);
  return (n - o) * 10000n * 2n > o * BigInt(bp) * 3n;
}

/** الرفعُ الفعليّ بالمئة للعرض (منزلةٌ عشرية واحدة) — عرضٌ لا حساب. */
export function effectivePct(old: number, next: number): number {
  if (!(old > 0)) return 0;
  return Math.round(((next - old) / old) * 1000) / 10;
}

/** «25» أو «12.5» أو «٢٥٫٥» أو «25%» ← نقاطُ أساس (٢٥٠٠). خارجَ ٠٫٠١..١٠٠ أو بأكثر من
 *  منزلتين ⇒ null: لا نقرّب نسبةً كتبها المستخدم — نرفضها ونقول. */
export function parsePct(input: string | number | null | undefined): number | null {
  let s = String(input ?? "").trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066B,]/g, ".").replace(/[%\u066A\s]/g, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  s = w + (f + "00").slice(0, 2);
  const bp = Number(s);
  return bp >= 1 && bp <= MAX_BP ? bp : null;
}

/** نقاطُ الأساس ← نصٌّ للعرض: 2500 ⇒ "25"، 1250 ⇒ "12.5". */
export function bpText(bp: number): string {
  const w = Math.floor(bp / 100), f = bp % 100;
  return f === 0 ? String(w) : `${w}.${String(f).padStart(2, "0").replace(/0$/, "")}`;
}

/* ── النطاق (spec) — نفسُ الشكل الذي تقرؤه `_price_plan` بالقاعدة ───────── */
export interface PriceSpec {
  pct_bp: number;
  /** «ذكي» أو «ثابت» — انظر رأس الملفّ. */
  round: RoundMode;
  /** «ذكي»: أكبرُ خطوةٍ مسموحة (smartMax). «ثابت»: الخطوةُ نفسُها. */
  max_step: number;
  /** المنتجات — وأسعارُ مفردها (حبّة/شريط) معها دائماً: مفردٌ لا يتبع علبتَه يصير
   *  أرخصَ نسبياً فيُشترى بدلها (لا خيارَ لفصلهما — قرارُ تدقيقٍ عدائيّ). */
  products: boolean;
  services: boolean;
  /** النطاقُ اختيارٌ **واحد** للمنتجات: كلُّها (الكلّ null)، أو أصناف، أو شركات/أقسام،
   *  أو موادّ معيّنة. الجمعُ بين اثنين يُرفض بالقاعدة (`mixed_scope`): تقاطعٌ صامتٌ
   *  أسقط موادَّ اختارها المدير بيده من معاينة ٣٠٠ سطر. */
  p_categories: string[] | null;
  p_companies: string[] | null;
  /** أقسامُ الشركات — مع `p_companies` اتّحاداً (شركةٌ كاملة أو قسمٌ منها). */
  p_sections: string[] | null;
  p_ids: string[] | null;
  p_exclude: string[];
  s_categories: string[] | null;
  s_ids: string[] | null;
  s_exclude: string[];
  /** ما رُفع برفعٍ قائمٍ خلال ٣٠ يوماً لا يُرفع ثانيةً إلا بطلبٍ صريح — مديران بلّغهما
   *  المالكُ نفسَ الـ٢٥٪ كانا سيجعلانها ٥٦٪. */
  skip_recent: boolean;
}

/** أيُّ نطاقٍ للمنتجات؟ (للشاشة وللتحقّق.) */
export type ProductScope = "all" | "category" | "company" | "chosen";
export function productScopeOf(s: Pick<PriceSpec, "p_categories" | "p_companies" | "p_sections" | "p_ids">): ProductScope | "mixed" {
  const fams = [s.p_categories?.length ? "category" : null, (s.p_companies?.length || s.p_sections?.length) ? "company" : null, s.p_ids?.length ? "chosen" : null]
    .filter(Boolean) as ProductScope[];
  return fams.length > 1 ? "mixed" : fams[0] ?? "all";
}

export type PriceField = "sell_price" | "sub_unit_price" | "price";
/** jump: رفعٌ فعليّ > مرّةٍ ونصف المطلوب · recent: رفعٌ قائمٌ عليه خلال ٣٠ يوماً ·
 *  below_cost: ما زال تحت الكلفة · group: دخل لأن مجموعتَه (نفس السعر) داخلة ·
 *  sub_aligned: سعرُ المفرد رُفع ليبقى المفردُ × العدد ≥ العلبة كما كان. */
export type PriceFlag = "jump" | "recent" | "below_cost" | "group" | "sub_aligned";

/** سطرُ المعاينة — مختصرُ الأسماء لأن منتجاتِ عيادةٍ واحدة تتجاوز الألف. */
export interface PlanLine {
  k: "product" | "service";
  id: string;
  f: PriceField;
  /** الاسم. */
  n: string;
  /** القديم. */
  o: number;
  /** الجديد. */
  w: number;
  /** الخطوة التي قُرِّب لها. */
  s: number;
  /** مفتاحُ المجموعة (منتجاتٌ بسعرٍ واحد) إن كان. */
  g: string | null;
  fl: PriceFlag[];
}

export interface PriceMissing { p_ids: string[]; p_exclude: string[]; s_ids: string[]; s_exclude: string[] }

export interface PricePreview {
  plan_hash: string;
  currency: string;
  frac: boolean;
  pct_bp: number;
  round: RoundMode;
  max_step: number;
  counts: { products: number; sub_units: number; services: number; lines: number; via_group: number; recent_skipped: number };
  skipped: { zero_products: number; zero_services: number };
  /** معرّفاتٌ بالنطاق لم تعد موجودة (حُذفت أو طُويت) — تُسقطها الشاشة وتقول، لا خطأ. */
  missing: PriceMissing;
  lines: PlanLine[];
}

/** الشكلُ المعياريّ للنطاق: مصفوفاتٌ مرتّبةٌ بلا تكرار، وفراغٌ ⇒ null. نفسُه يُرسل
 *  للمعاينة وللحفظ، فلا يختلف ما رآه المدير عمّا يُحفظ بسبب ترتيبِ اختيار. */
export function normalizeSpec(s: PriceSpec): PriceSpec {
  const uniq = (a: string[] | null | undefined): string[] => [...new Set((a ?? []).map(String).filter(Boolean))].sort();
  const opt = (a: string[] | null | undefined): string[] | null => (a && a.length ? uniq(a) : null);
  return {
    pct_bp: Math.trunc(s.pct_bp), round: s.round === "fixed" ? "fixed" : "smart", max_step: s.max_step,
    products: !!s.products, services: !!s.services,
    p_categories: s.products ? opt(s.p_categories) : null, p_companies: s.products ? opt(s.p_companies) : null,
    p_sections: s.products ? opt(s.p_sections) : null,
    p_ids: s.products ? opt(s.p_ids) : null, p_exclude: s.products ? uniq(s.p_exclude) : [],
    s_categories: s.services ? opt(s.s_categories) : null, s_ids: s.services ? opt(s.s_ids) : null,
    s_exclude: s.services ? uniq(s.s_exclude) : [],
    skip_recent: s.skip_recent !== false,
  };
}

/* ── الخطّة (للمرآة التجريبية؛ السحابيُّ يحسبها بالقاعدة) ─────────────────── */
export interface PlanProduct {
  id: string; name: string; sell_price: number; purchase_price: number;
  category?: string | null; company_id?: string | null; section_id?: string | null; bulk_group?: string | null; farm_id?: string | null;
  has_sub_unit?: boolean; sub_unit_price?: number | null; units_per_box?: number | null;
}
export interface PlanService { id: string; name: string; price: number; category_id: string; cost?: number | null }

/** مفتاحُ المجموعة: فارغٌ أو مسافاتٌ = لا مجموعة (`nullif(btrim(..),'')` بالقاعدة). */
export const groupKeyOf = (g: string | null | undefined): string | null => (g && g.trim() ? g : null);

/** المنتجاتُ الداخلة بالرفع.
 *  • الأساس: منتجاتُ العيادة بلا مخزن حقل (`farm_id`) — **قبل** فرز السعر.
 *  • المباشر: الأساس ∩ الأصناف ∩ الشركات ∩ المعرّفات (فارغٌ ⇒ بلا قيد؛ الصنفُ الفارغ لا يطابق).
 *  • المجموعة كلُّها أو لا شيء: تدخل إن دخل منها واحد، وتخرج كلُّها إن استُثني منها واحد.
 *  • ثمّ: السعرُ صفرٌ لا يُرفع بنسبة (يُعدّ ولا يُكتب). */
export function productsInScope(all: PlanProduct[], spec: PriceSpec): { rows: PlanProduct[]; direct: Set<string>; zero: number } {
  if (!spec.products) return { rows: [], direct: new Set(), zero: 0 };
  const base = all.filter((p) => !p.farm_id);
  const cats = spec.p_categories ? new Set(spec.p_categories) : null;
  const cos = spec.p_companies ? new Set(spec.p_companies) : null;
  const secs = spec.p_sections ? new Set(spec.p_sections) : null;
  const ids = spec.p_ids ? new Set(spec.p_ids) : null;
  const ex = new Set(spec.p_exclude);
  const exGroups = new Set(base.filter((p) => ex.has(p.id)).map((p) => groupKeyOf(p.bulk_group)).filter((g): g is string => !!g));
  const directRows = base.filter((p) =>
    (!cats || (p.category != null && cats.has(p.category)))
    && ((!cos && !secs) || (!!cos && p.company_id != null && cos.has(p.company_id)) || (!!secs && p.section_id != null && secs.has(p.section_id)))
    && (!ids || ids.has(p.id)));
  const direct = new Set(directRows.map((p) => p.id));
  const inGroups = new Set(directRows.map((p) => groupKeyOf(p.bulk_group)).filter((g): g is string => !!g));
  const keep = base.filter((p) => {
    if (ex.has(p.id)) return false;
    const g = groupKeyOf(p.bulk_group);
    if (g && exGroups.has(g)) return false;
    return direct.has(p.id) || (!!g && inGroups.has(g));
  });
  return { rows: keep.filter((p) => p.sell_price > 0), direct, zero: keep.filter((p) => !(p.sell_price > 0)).length };
}

export function servicesInScope(all: PlanService[], spec: PriceSpec): { rows: PlanService[]; zero: number } {
  if (!spec.services) return { rows: [], zero: 0 };
  const cats = spec.s_categories ? new Set(spec.s_categories) : null;
  const ids = spec.s_ids ? new Set(spec.s_ids) : null;
  const ex = new Set(spec.s_exclude);
  const keep = all.filter((s) => !ex.has(s.id) && (!cats || cats.has(s.category_id)) && (!ids || ids.has(s.id)));
  return { rows: keep.filter((s) => s.price > 0), zero: keep.filter((s) => !(s.price > 0)).length };
}

/** ترتيبُ السطور الثابت (نفسُه بالقاعدة بـcollate "C"): النوع، ثمّ المعرّف، ثمّ الحقل. */
export function lineOrder(a: { k: string; id: string; f: string }, b: { k: string; id: string; f: string }): number {
  return a.k < b.k ? -1 : a.k > b.k ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : a.f < b.f ? -1 : a.f > b.f ? 1 : 0;
}

/** نصُّ السعر الذي يدخل البصمة — بخانتين دائماً كما يطبعه `::numeric(24,2)::text`. */
export const hashMoney = (n: number): string => {
  const c = toCents(n);
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};

/** نصُّ البصمة: ما يُكتب فعلاً (نوع|معرّف|حقل|قديم|جديد) بالترتيب الثابت — لا الأعلام:
 *  شراءٌ يغيّر الكلفة أو يومٌ يُسقط «حديث» لا يجعل معاينةً صحيحةً «قديمة». */
export function planHashText(lines: Pick<PlanLine, "k" | "id" | "f" | "o" | "w">[]): string {
  return [...lines].sort(lineOrder).map((l) => `${l.k}|${l.id}|${l.f}|${hashMoney(l.o)}|${hashMoney(l.w)}`).join(";");
}

/** سقفُ مبلغٍ بالفلوس لمضاعف s. */
const ceilCents = (x: bigint, s: bigint): bigint => ((x + s - 1n) / s) * s;

/** المفردُ × العدد كان ≥ العلبة؟ يبقى كذلك بعد الرفع: إن صار أرخصَ رُفع المفردُ لأقلّ
 *  مضاعفٍ لخطوته يعيد التساوي — فالزبونُ لا يشتري العلبةَ حبّاتٍ بأقلّ من سعرها.
 *  (العددُ بثلاث خانات: ×١٠٠٠ صحيحاً.) يُرجع null إن لم يلزم. */
export function alignSub(oldBox: number, newBox: number, oldSub: number, newSub: number, subStep: number, unitsPerBox: number | null | undefined): number | null {
  const nM = BigInt(Math.round((Number(unitsPerBox) || 0) * 1000));
  if (nM <= 0n) return null;
  const B = toCents(oldBox), B2 = toCents(newBox), S = toCents(oldSub), S2 = toCents(newSub);
  if (S * nM < B * 1000n) return null;            // المفردُ كان أرخص أصلاً — قرارُ العيادة، لا نمسّه
  if (S2 * nM >= B2 * 1000n) return null;         // ما زال ≥ العلبة
  const target = (B2 * 1000n + nM - 1n) / nM;      // سقفُ العلبة ÷ العدد
  return fromCents(ceilCents(target, toCents(subStep)));
}

/** الخطّة كاملة — مرآةُ `_price_plan` + `price_change_preview`. `recent` = مفاتيحُ
 *  `kind:id:field` رُفعت برفعٍ قائمٍ خلال ٣٠ يوماً. */
export function buildPlan(
  products: PlanProduct[], services: PlanService[], spec0: PriceSpec, frac: boolean,
  recent: Set<string> = new Set(),
): Omit<PricePreview, "plan_hash" | "currency" | "missing"> & { hashText: string } {
  const spec = normalizeSpec(spec0);
  const bp = spec.pct_bp, max = spec.max_step, round = spec.round;
  const P = productsInScope(products, spec);
  const S = servicesInScope(services, spec);
  const lines: PlanLine[] = [];
  /** ما رُفع حديثاً يُتخطّى سطرُه (لا مادتُه كلُّها) إن طُلب — ويُعدّ. */
  let recentSkipped = 0;
  const skip = (k: PlanLine["k"], id: string, f: PriceField): boolean => {
    if (spec.skip_recent && recent.has(`${k}:${id}:${f}`)) { recentSkipped++; return true; }
    return false;
  };
  const flagsOf = (k: PlanLine["k"], id: string, f: PriceField, old: number, next: number, cost: number | null, viaGroup: boolean): PriceFlag[] => {
    const fl: PriceFlag[] = [];
    if (isJump(old, next, bp)) fl.push("jump");
    if (recent.has(`${k}:${id}:${f}`)) fl.push("recent");
    if (cost != null && cost > 0 && next < cost) fl.push("below_cost");
    if (viaGroup) fl.push("group");
    return fl;
  };
  let subCount = 0, viaGroup = 0;
  for (const p of P.rows) {
    const g = groupKeyOf(p.bulk_group);
    const vg = !P.direct.has(p.id);
    const box = raisePrice(p.sell_price, bp, round, max, frac);
    const boxSkipped = skip("product", p.id, "sell_price");
    if (!boxSkipped) {
      if (vg) viaGroup++;
      lines.push({ k: "product", id: p.id, f: "sell_price", n: p.name, o: p.sell_price, w: box.price, s: box.step, g,
        fl: flagsOf("product", p.id, "sell_price", p.sell_price, box.price, p.purchase_price, vg) });
    }
    const sub0 = Number(p.sub_unit_price ?? 0);
    if (p.has_sub_unit && sub0 > 0 && !skip("product", p.id, "sub_unit_price")) {
      const sub = raisePrice(sub0, bp, round, max, frac);
      // المقارنةُ بما ستصيره العلبةُ فعلاً: علبةٌ تُخطّيت (رُفعت حديثاً) باقيةٌ بسعرها.
      const aligned = alignSub(p.sell_price, boxSkipped ? p.sell_price : box.price, sub0, sub.price, sub.step, p.units_per_box);
      const w = aligned ?? sub.price;
      const n = Number(p.units_per_box ?? 0);
      const unitCost = n > 0 ? Math.round((p.purchase_price / n) * 100) / 100 : null;
      const fl = flagsOf("product", p.id, "sub_unit_price", sub0, w, unitCost, vg);
      if (aligned != null) fl.push("sub_aligned");
      lines.push({ k: "product", id: p.id, f: "sub_unit_price", n: p.name, o: sub0, w, s: sub.step, g, fl });
      subCount++;
    }
  }
  for (const s of S.rows) {
    if (skip("service", s.id, "price")) continue;
    const r = raisePrice(s.price, bp, round, max, frac);
    lines.push({ k: "service", id: s.id, f: "price", n: s.name, o: s.price, w: r.price, s: r.step, g: null,
      fl: flagsOf("service", s.id, "price", s.price, r.price, s.cost ?? null, false) });
  }
  lines.sort(lineOrder);
  return {
    frac, pct_bp: bp, round, max_step: max,
    counts: {
      products: lines.filter((l) => l.f === "sell_price").length, sub_units: subCount,
      services: lines.filter((l) => l.k === "service").length, lines: lines.length, via_group: viaGroup, recent_skipped: recentSkipped,
    },
    skipped: { zero_products: P.zero, zero_services: S.zero },
    lines, hashText: planHashText(lines),
  };
}

/** معرّفاتُ النطاق التي لم تعد موجودة (مرآةُ `missing` بالمعاينة). */
export function missingIds(products: { id: string }[], services: { id: string }[], spec: PriceSpec): PriceMissing {
  const ps = new Set(products.map((p) => p.id)), ss = new Set(services.map((s) => s.id));
  const gone = (a: string[] | null, have: Set<string>) => (a ?? []).filter((x) => !have.has(x)).sort();
  return { p_ids: gone(spec.p_ids, ps), p_exclude: gone(spec.p_exclude, ps), s_ids: gone(spec.s_ids, ss), s_exclude: gone(spec.s_exclude, ss) };
}

/** بصمةٌ صغيرةٌ ثابتة للمرآة التجريبية (FNV-1a ٦٤) — السحابيُّ يستعمل md5 بالقاعدة. */
export function demoHash(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}
