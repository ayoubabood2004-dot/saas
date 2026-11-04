/* ============================================================================
 * التعبئةُ متعدّدةُ المستويات (0259) — القاعدةُ النقيّة (مفحوصةٌ بـ`scripts/packs-test.mjs`).
 *
 * المادةُ: الكارتون (`packs`، حتى أربعة، كلٌّ بعدده من العلب) ← العلبة (الوحدةُ الوسطى ووحدةُ الرصيد: `barcode` و`alt_codes`)
 * ← المغلّف (الوحدةُ الفرعية القائمة `has_sub_unit`… وباركوداتُها `sub_codes`). لكلّ مستوى سعرا شراءٍ وبيع، والفارغُ مشتقٌّ من العلبة
 * (قرارُ المالك ٤/١١): الكارتونُ = العلبة × عددها، والمغلّفُ = العلبة ÷ عدده.
 *
 *  • الشكلُ مرآةُ قيد الخادم (`products_packaging_ok`، `_pkg_packs_ok`): ما يُرفض هناك لا يُرسل — والرفضُ يقول السببَ قبل الشبكة.
 *  • الرموزُ بمستوياتها مرآةُ `product_level_codes`، بالتطبيع نفسه على الطرفين (`matchCode` ⇔ `inv_norm_code`).
 *  • صاحبُ الرمز (`codeOwner`) مرآةُ حارس المستويات (`products_level_codes_guard`): رمزُ مغلّفٍ أو كارتونٍ لا يساوي رمزاً لغيره
 *    بأيّ مستوى، ورمزُ علبةٍ لا يساوي مغلّفَ غيره أو كارتونَه. والعلبةُ مقابلَ العلبة لـ`findByCode` كما كانت.
 *  • `findByCode`/`codeIndex` (البيعُ والشراء) **تبقى للعلبة وحدها**: شاشةُ البيع لا تبيع كارتوناً بسعر علبةٍ قبل أن تعرفه (المرحلة ٣)
 *    — تقول «ما ينعرف» كاليوم.
 *  • الأسعارُ بالفلس الصحيح لا بالعائم، والرصيدُ (ثلاثُ منازل) بالألف الصحيح.
 * ========================================================================= */
import type { Product, ProductPack } from "@/types";
import { matchCode, normalizeCode } from "./utils";

/** سقوفُ القيد بالهجرة (0259) — `packs-test` يقارنها بنصّها. */
export const PACK_LIMITS = { packs: 4, codes: 5, name: 20, unitName: 20, codeLen: 64, perMin: 2, perMax: 100000 } as const;

type Packaged = Pick<Product, "packs" | "sub_codes">;

/** الكراتينُ كما هي — مصفوفةً دائماً (null من لقطةٍ قديمة أو من قاعدةٍ قبل 0259 = لا كراتين). */
export function packsOf(p: Packaged): ProductPack[] {
  return Array.isArray(p.packs) ? p.packs : [];
}
export function subCodesOf(p: Packaged): string[] {
  return Array.isArray(p.sub_codes) ? p.sub_codes : [];
}
/** للمادة تعبئةٌ (كارتونٌ أو باركودُ مغلّف)؟ */
export function hasPackaging(p: Packaged): boolean {
  return packsOf(p).length > 0 || subCodesOf(p).length > 0;
}

/* ── الأسعار ─────────────────────────────────────────────────────────────── */
const fils = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** سعرُ الكارتون: المكتوبُ، وإلا العلبةُ × العدد (بالفلس). */
export function packPrice(p: Pick<Product, "sell_price" | "purchase_price">, pack: ProductPack, kind: "sell" | "purchase"): number {
  const own = kind === "sell" ? pack.sell_price : pack.purchase_price;
  if (own != null && Number.isFinite(own)) return own;
  return (fils(kind === "sell" ? p.sell_price : p.purchase_price) * pack.per) / 100;
}
/** سعرُ الكارتون محسوبٌ لا مكتوب؟ — العرضُ يقول «محسوب» والرفعُ (م٤) يتركه محسوباً. */
export const packPriceDerived = (pack: ProductPack, kind: "sell" | "purchase") => (kind === "sell" ? pack.sell_price : pack.purchase_price) == null;

/** سعرُ شراء المغلّف: المكتوبُ، وإلا شراءُ العلبة ÷ العدد لأقرب فلس. null بلا وحدةٍ صغرى. */
export function subPurchasePrice(p: Pick<Product, "purchase_price" | "sub_purchase_price" | "has_sub_unit" | "units_per_box">): number | null {
  const upb = Number(p.units_per_box) || 0;
  if (!p.has_sub_unit || upb <= 0) return null;
  if (p.sub_purchase_price != null && Number.isFinite(p.sub_purchase_price)) return p.sub_purchase_price;
  return Math.round(fils(p.purchase_price) / upb) / 100;
}

/* ── التفصيل ─────────────────────────────────────────────────────────────── */
export interface Breakdown {
  /** عددُ الكراتين بالكارتون الأوّل (كارتونُ التفصيل). */
  packs: number;
  pack: ProductPack;
  /** العلبُ الباقية — كسرٌ حين لا وحدةَ صغرى (٢٫٥ علبة). */
  boxes: number;
  /** المغلّفاتُ الباقية (صفرٌ بلا وحدةٍ صغرى). */
  subs: number;
}
/**
 * الرصيدُ مفصّلاً بالكارتون الأوّل: «٢ كارتون + ٣ علب + ٥ مغلّفات». بالألف الصحيح (الرصيدُ بثلاث منازل)، والمغلّفُ يُقرَّب
 * ويحمل للعلبة إن اكتملت (٠٫٩٩٩ × ١٠ مغلّفات = علبةٌ كاملة لا «١٠ مغلّفات»).
 * null حين لا كارتون، أو الرصيدُ سالب (عجزٌ يُعرض رقماً كما هو — التفصيلُ يكذب عليه)، أو المادةُ بالوزن.
 */
export function breakdown(p: Pick<Product, "packs" | "sub_codes" | "has_sub_unit" | "units_per_box" | "sold_by_weight">, stock: number): Breakdown | null {
  const pack = packsOf(p)[0];
  if (!pack || p.sold_by_weight || !Number.isFinite(stock)) return null;
  const s = Math.round(stock * 1000);
  if (s < 0) return null;
  const perT = pack.per * 1000;
  let packs = Math.floor(s / perT);
  const rest = s - packs * perT;
  const upb = p.has_sub_unit ? Number(p.units_per_box) || 0 : 0;
  if (upb <= 0) return { packs, pack, boxes: rest / 1000, subs: 0 };
  let boxes = Math.floor(rest / 1000);
  let subs = Math.round(((rest - boxes * 1000) * upb) / 1000);
  if (subs >= upb) { boxes += 1; subs = 0; }
  if (boxes >= pack.per) { packs += 1; boxes -= pack.per; }
  return { packs, pack, boxes, subs };
}

/* ── الرموز بمستوياتها ───────────────────────────────────────────────────── */
export type CodeLevel = "box" | "sub" | "pack";
export interface LevelCode { norm: string; raw: string; level: CodeLevel; slot: string; pack?: ProductPack }

/** كلُّ رموز المادة مطبَّعةً بمستواها وخانتها — مرآةُ `product_level_codes` (الفارغُ بعد التطبيع خارجها). */
export function levelCodes(p: Pick<Product, "barcode" | "alt_codes" | "packs" | "sub_codes">): LevelCode[] {
  const out: LevelCode[] = [];
  const put = (raw: string | null | undefined, level: CodeLevel, slot: string, pack?: ProductPack) => {
    const norm = matchCode(raw);
    if (norm) out.push({ norm, raw: String(raw), level, slot, ...(pack ? { pack } : {}) });
  };
  put(p.barcode, "box", "box");
  for (const c of p.alt_codes ?? []) put(c, "box", "box");
  for (const c of subCodesOf(p)) put(c, "sub", "sub");
  for (const k of packsOf(p)) for (const c of k.codes ?? []) put(c, "pack", `pack:${k.id}`, k);
  return out;
}

export interface CodeHit { product: Product; level: CodeLevel; pack?: ProductPack }

/** المادةُ ومستواها لرمزٍ كامل (بحثٌ بالمخزن، مسحٌ بحقل البحث) — أيُّ مستوى. */
export function levelByCode(products: readonly Product[], code: string | null | undefined): CodeHit | undefined {
  const c = matchCode(code);
  if (!c) return undefined;
  for (const p of products) {
    const hit = levelCodes(p).find((x) => x.norm === c);
    if (hit) return { product: p, level: hit.level, ...(hit.pack ? { pack: hit.pack } : {}) };
  }
  return undefined;
}

/** بحثٌ جزئيّ برموز المغلّف والكراتين (احتواءٌ كـ`codeMatcher` للعلبة، والطرفان مطبَّعان). استعلامٌ فارغ لا يطابق شيئاً. */
export function levelMatcher(query: string | null | undefined): (p: Product) => CodeHit | null {
  const c = matchCode(query);
  if (!c) return () => null;
  return (p) => {
    const hit = levelCodes(p).find((x) => x.level !== "box" && x.norm.includes(c));
    return hit ? { product: p, level: hit.level, ...(hit.pack ? { pack: hit.pack } : {}) } : null;
  };
}

/**
 * لمن هذا الرمز إن كُتب بمستوى `level` لمادة `selfId`؟ — مرآةُ حارس المستويات: المغلّفُ والكارتونُ مقابلَ كلّ رموز غيره،
 * والعلبةُ مقابلَ مغلّفِ غيره وكارتونِه وحدهما (العلبةُ مقابلَ العلبة لـ`findByCode`). undefined = حرّ.
 */
export function codeOwner(products: readonly Product[], code: string | null | undefined, level: CodeLevel, selfId?: string | null): CodeHit | undefined {
  const c = matchCode(code);
  if (!c) return undefined;
  for (const p of products) {
    if (selfId && p.id === selfId) continue;
    const hit = levelCodes(p).find((x) => x.norm === c && (level !== "box" || x.level !== "box"));
    if (hit) return { product: p, level: hit.level, ...(hit.pack ? { pack: hit.pack } : {}) };
  }
  return undefined;
}

/**
 * أوّلُ رمزٍ **جديد** (بخانته) بالصفّ كما سيُحفظ يملكه غيرُه — مرآةُ الشقّ (ب) من حارس المستويات، لتقوله الشاشةُ قبل الشبكة بالاسم
 * والمستوى. ما كان بخانته قبلُ لا يُعاد فحصُه (إعفاءُ الخادم: تصادمٌ قديمٌ لا يُسقط حفظَ اسم).
 */
export function firstTakenCode(
  products: readonly Product[],
  next: Pick<Product, "barcode" | "alt_codes" | "packs" | "sub_codes">,
  before: Pick<Product, "barcode" | "alt_codes" | "packs" | "sub_codes"> | null,
  selfId: string | null,
): { code: string; hit: CodeHit } | null {
  const was = before ? levelCodes(before) : [];
  for (const c of levelCodes(next)) {
    if (was.some((o) => o.norm === c.norm && o.slot === c.slot)) continue;
    const hit = codeOwner(products, c.raw, c.level, selfId);
    if (hit) return { code: c.raw, hit };
  }
  return null;
}

/* ── المسودّة (نموذج المادة) ────────────────────────────────────────────── */
/** كارتونٌ كما يُكتب بالنموذج: الأرقامُ نصوصٌ (الحقلُ الفارغ «محسوب»)، والرموزُ قائمة. */
export interface PackDraft { id: string; name: string; per: string; codes: string[]; purchase_price: string; sell_price: string }
export interface PackagingDraft { unit_name: string; sub_codes: string[]; sub_purchase_price: string; packs: PackDraft[] }

const numText = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : String(n));
export function draftOf(p: Partial<Pick<Product, "unit_name" | "sub_codes" | "sub_purchase_price" | "packs">> | null | undefined): PackagingDraft {
  return {
    unit_name: p?.unit_name ?? "",
    sub_codes: p ? [...subCodesOf(p as Packaged)] : [],
    sub_purchase_price: numText(p?.sub_purchase_price),
    packs: p ? packsOf(p as Packaged).map((k) => ({ id: k.id, name: k.name, per: String(k.per), codes: [...(k.codes ?? [])], purchase_price: numText(k.purchase_price), sell_price: numText(k.sell_price) })) : [],
  };
}

/** معرّفٌ جديدٌ لكارتون — عشوائيٌّ لا يتكرّر بين موادّ (الطيُّ يميّز به ما ضُمّ عمّا أُلحق). */
export function newPackId(): string {
  try { if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID(); } catch { /* أسفل */ }
  return `pk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** رقمٌ مكتوب ⇒ قيمة: الفارغُ null (محسوب)، والسيّئُ NaN (يُرفض). */
const priceOf = (s: string): number | null => {
  const t = normalizeCode(s).replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
/** قائمةُ رموزٍ كما تُحفظ: بلا فراغ، وبلا تكرارٍ مطبَّع، وكما مُسحت (لا طيَّ حالة — ملصقُ الرفّ). */
export function cleanCodes(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = normalizeCode(raw);
    const k = matchCode(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export type PackagingProblem =
  | { kind: "pack_count" }
  | { kind: "pack_name"; index: number }
  | { kind: "pack_per"; index: number }
  | { kind: "pack_price"; index: number }
  | { kind: "pack_codes"; index: number }
  | { kind: "code_len"; code: string }
  | { kind: "sub_codes" }
  | { kind: "sub_no_unit" }
  | { kind: "sub_price" }
  | { kind: "unit_name" }
  | { kind: "packs_unit" }
  | { kind: "level_twin"; code: string };

export interface PackagingValue { unit_name: string | null; sub_codes: string[]; sub_purchase_price: number | null; packs: ProductPack[] }

/**
 * المسودّةُ ⇒ ما يُحفظ، أو لماذا لا (نفسُ قيود الخادم وحارسُ «رمزٌ واحد لمستوىً واحد» داخل المادة؛ وصاحبُ الرمز بغيرها لـ`codeOwner`).
 * `ctx`: ما بالنموذج نفسه — باركودُ العلبة ورموزُها الإضافية، والوحدةُ الصغرى، ووزنٌ أو حوض.
 */
export function packagingFromDraft(
  d: PackagingDraft,
  ctx: { barcode: string | null; alt_codes: readonly string[]; hasSubUnit: boolean; unitsPerBox: number; byWeight: boolean; pooled: boolean },
): { ok: true; value: PackagingValue } | { ok: false; problem: PackagingProblem } {
  const unit = d.unit_name.replace(/\s+/g, " ").trim();
  if (unit.length > PACK_LIMITS.unitName) return { ok: false, problem: { kind: "unit_name" } };
  const sub = cleanCodes(d.sub_codes);
  if (sub.length > PACK_LIMITS.codes) return { ok: false, problem: { kind: "sub_codes" } };
  const subOn = ctx.hasSubUnit && ctx.unitsPerBox > 0 && !ctx.byWeight;
  if (sub.length > 0 && !subOn) return { ok: false, problem: { kind: "sub_no_unit" } };
  const subPrice = subOn ? priceOf(d.sub_purchase_price) : null;
  if (subPrice != null && (Number.isNaN(subPrice) || subPrice < 0)) return { ok: false, problem: { kind: "sub_price" } };
  const drafts = d.packs.filter((k) => k.name.trim() || k.per.trim() || k.codes.some((c) => matchCode(c)) || k.purchase_price.trim() || k.sell_price.trim());
  if (drafts.length > PACK_LIMITS.packs) return { ok: false, problem: { kind: "pack_count" } };
  if (drafts.length > 0 && (ctx.byWeight || ctx.pooled)) return { ok: false, problem: { kind: "packs_unit" } };
  const packs: ProductPack[] = [];
  for (const [index, k] of drafts.entries()) {
    const name = k.name.replace(/\s+/g, " ").trim();
    if (name.length < 1 || name.length > PACK_LIMITS.name) return { ok: false, problem: { kind: "pack_name", index } };
    const per = Number(normalizeCode(k.per));
    if (!Number.isInteger(per) || per < PACK_LIMITS.perMin || per > PACK_LIMITS.perMax) return { ok: false, problem: { kind: "pack_per", index } };
    const codes = cleanCodes(k.codes);
    if (codes.length > PACK_LIMITS.codes) return { ok: false, problem: { kind: "pack_codes", index } };
    const purchase_price = priceOf(k.purchase_price);
    const sell_price = priceOf(k.sell_price);
    if ([purchase_price, sell_price].some((x) => x != null && (Number.isNaN(x) || x < 0))) return { ok: false, problem: { kind: "pack_price", index } };
    packs.push({ id: k.id || newPackId(), name, codes, per, purchase_price, sell_price });
  }
  const long = [...sub, ...packs.flatMap((k) => k.codes)].find((c) => c.length > PACK_LIMITS.codeLen);
  if (long) return { ok: false, problem: { kind: "code_len", code: long } };
  // رمزٌ لخانتين بنفس المادة (علبةٌ وكارتون، أو كارتونان) — الخادمُ يرفضه code_level_twin.
  const slots = new Map<string, string>();
  const twin = levelCodes({ barcode: ctx.barcode, alt_codes: [...ctx.alt_codes], sub_codes: sub, packs })
    .find((x) => { const s = slots.get(x.norm); if (s == null) { slots.set(x.norm, x.slot); return false; } return s !== x.slot; });
  if (twin) return { ok: false, problem: { kind: "level_twin", code: twin.raw } };
  return { ok: true, value: { unit_name: unit || null, sub_codes: sub, sub_purchase_price: subPrice, packs } };
}

/** هل تغيّرت التعبئة عمّا بالصفّ؟ — لا يُرسل ما لم يتغيّر (قاعدةٌ قبل 0259 لا تعرف الأعمدة، ونموذجٌ فُتح قبل تعديلٍ من جهازٍ آخر لا يدوسه). */
export function packagingPatch(before: Partial<Pick<Product, "unit_name" | "sub_codes" | "sub_purchase_price" | "packs">> | null, v: PackagingValue): Partial<PackagingValue> {
  const out: Partial<PackagingValue> = {};
  const was = { unit_name: before?.unit_name ?? null, sub_codes: before ? subCodesOf(before as Packaged) : [], sub_purchase_price: before?.sub_purchase_price ?? null, packs: before ? packsOf(before as Packaged) : [] };
  if ((was.unit_name ?? null) !== v.unit_name) out.unit_name = v.unit_name;
  if (JSON.stringify(was.sub_codes) !== JSON.stringify(v.sub_codes)) out.sub_codes = v.sub_codes;
  if ((was.sub_purchase_price ?? null) !== v.sub_purchase_price) out.sub_purchase_price = v.sub_purchase_price;
  const norm = (ks: readonly ProductPack[]) => JSON.stringify(ks.map((k) => [k.id, k.name, k.per, k.codes ?? [], k.purchase_price ?? null, k.sell_price ?? null]));
  if (norm(was.packs) !== norm(v.packs)) out.packs = v.packs;
  return out;
}
