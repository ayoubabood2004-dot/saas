/* ============================================================================
 * مرآةُ تحويل وحدة المادّة (0294) بالتجريبيّ — product_unit_change حرفاً بحرف على مخزن الجهاز: البوّابةُ (المدير والطبيب أو PIN
 * حيّ)، وما رآه النموذج شرطُ الكتابة (unit_seen_changed ثمّ price_moved)، والنسبةُ وما لا يُحوَّل بأمان بنفس الترتيب والتلميح،
 * ثمّ كلُّ ما يقرأ الوحدة: الدفعات، وstock_qty سطور البيع، والجرعاتُ وربطُها، والوصفات، والرصيدُ ومرحَّلُه، والمتوسّط — والكلُّ أو
 * لا شيء (كلُّ مخزنٍ يُحفظ بعد كلّ الفحوص). وحارسُ الدمج والترتيب (merge_unit_mismatch) هنا لأن نصَّه هنا.
 * كسولةٌ (unitChangeApi وrepoDemo يستوردانها بـimport()) فلا تدخل حزمةَ الإقلاع.
 * ========================================================================= */
import type { DeletedProduct, DemoDB, Product, PurchaseItem } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { loadLots, saveLots } from "./demoLots";
import { loadCounts } from "./demoCounts";
import { demoDrugLinksMap } from "./demoClinicDrugs";
import { demoApiGate, demoBaseRole, demoHint, demoPinLive } from "./demoRole";
import { groupKeyOf } from "./productGroups";
import { roundTo, sameUnit, scaleRound, unitKind, unitOf, type UnitOf } from "./unitChange";
import type { UnitSeen, UnitTo } from "./unitChangeApi";

/* نصوصُ الوحدة كما يكتبها `_unit_text` بالخادم — بياناتٌ بمهارب يونيكود (تُقارَن بتلميح الخادم) لا نصُّ واجهة. */
const T_KG = "\u0628\u0627\u0644\u0643\u064A\u0644\u0648";        // بالكيلو
const T_BOX = "\u0628\u0627\u0644\u0639\u0644\u0628\u0629";       // بالعلبة
const T_COUNT = "\u0628\u0627\u0644\u0639\u062F\u062F";           // بالعدد
const T_UNIT = "\u0648\u062D\u062F\u0629";                        // وحدة
const ISO = (s: string): string => String.fromCharCode(8296) + s + String.fromCharCode(8297);   // FSI…PDI كـchr(8296)/chr(8297)

/** مرآةُ `_unit_text`: «بالكيلو» / «بالعلبة (١٠ حبة)» / «بالعدد». */
export function unitText(p: Pick<Product, "sold_by_weight" | "has_sub_unit" | "units_per_box" | "sub_unit_name">): string {
  const u = unitOf(p);
  if (u.weight) return T_KG;
  if (u.per != null) return `${T_BOX} (${String(roundTo(u.per, 3))} ${(p.sub_unit_name ?? "").trim() || T_UNIT})`;
  return T_COUNT;
}

/** مرآةُ حارس merge_products (0294): بعد حرّاس التعبئة، قبل أيّ كتابة. */
export function demoMergeUnitCheck(keep: Product, drop: Product): void {
  if (sameUnit(unitOf(drop), unitOf(keep))) return;
  throw demoHint("merge_unit_mismatch", `«${ISO(drop.name)}» ${unitText(drop)} و«${ISO(keep.name)}» ${unitText(keep)} — وحدتان مختلفتان، فالرصيدان ما ينجمعون. وحّد الوحدة من نموذج إحداهما (تغيير الوحدة يحوّل رصيدها)، وبعدين ادمج.`);
}
/** مرآةُ تخطّي «رتّب المخزن» (0294): توأمٌ بوحدةٍ غيرِ وحدة أصله لا يُطوى. */
export const demoTidyUnitSkip = (dup: Product, target: Product): boolean => !sameUnit(unitOf(dup), unitOf(target));

/** مرآةُ purchase_items_unit_guard (0294): تعديلُ فاتورةٍ فيها سطرٌ كُتب قبل تحويل وحدة مادّته يُرفض — update_purchase كان يعكسه
 *  بالوحدة الجديدة ويعيد بناءَ دفعتها منه. يُنادى حيث يحذف الخادمُ السطورَ القديمة (بعد عكسها، قبل إدراج الجديدة). */
export function demoPurchaseUnitCheck(db: DemoDB, oldItems: readonly PurchaseItem[]): void {
  const marks = new Set(db.purchaseUnitMarks ?? []);
  const hit = oldItems.find((it) => marks.has(it.id));
  if (!hit) return;
  throw demoHint("purchase_unit_changed", `«${ISO(hit.name ?? "")}» تحوّلت وحدتها بعد هالفاتورة، وسطرها مكتوب بالوحدة القديمة — تعديل الفاتورة كان راح يحسب كميتها بالوحدة الجديدة ويخرّب الرصيد والدفعات. ما انحفظ شي: الفاتورة تبقى مثل ما هي، والفرق يتصحّح بالجرد.`);
}
/** مرآةُ products_restore_unit_guard (0294): فكُّ دمجٍ بعد تحويل الأصل يُرفض — يطرح رصيدَ التوأم بالوحدة القديمة من أصلٍ تحوّل. */
export function demoRestoreUnitCheck(db: DemoDB, t: DeletedProduct): void {
  if (!t.merged_into) return;
  // ‏>= لا >: ساعةُ الجهاز بالملّي ثانية، والطيُّ والتحويلُ بنفس الملّي ثانية لا يُعرف أيُّهما سبق — الرفضُ هو الجانبُ الآمن.
  const later = (db.unitChanges ?? []).filter((u) => u.product_id === t.merged_into && u.at >= t.deleted_at);
  if (!later.length) return;
  const kn = later.reduce((a, b) => (b.at > a.at ? b : a)).product_name;
  throw demoHint("restore_unit_changed", `«${ISO(t.row?.name ?? "")}» اندمجت بـ«${ISO(kn)}» قبل ما تتحوّل وحدتها — فكّ الدمج هسه يرجّع رصيداً ومبيعاتٍ بالوحدة القديمة. ما انحفظ شي؛ إذا لازم ترجع: ضيفها مادة جديدة وصحّح الرصيدين بالجرد.`);
}

/** مرآةُ products_unit_guard (0294): كتابةٌ مباشرة تغيّر الوحدةَ الفعليّة تُرفض — القيمُ نفسُها تمرّ (النسخةُ القديمة ترسلها مع كلّ حفظ). */
export function demoUnitDirectCheck(before: Product, after: Product): void {
  if (sameUnit(unitOf(before), unitOf(after))) return;
  throw demoHint("unit_server_only", "وحدة المادة (بالوزن، المفرد، عدد العلبة) تتغيّر من نموذج المادة بالنسخة الجديدة — تحوّل الرصيد والأسعار وياها. حدّث الصفحة وأعد. ما انحفظ شي.");
}

function gate(): void {
  demoApiGate();
  const r = demoBaseRole();
  if (r === "photographer" || !(r === "manager" || r === "veterinarian" || demoPinLive())) {
    throw demoHint("unit_forbidden", "تغيير وحدة المادة للمدير والطبيب.");
  }
}
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const q3 = (x: number, mul: number, div: number): number => scaleRound(x, mul, div, 3);
const q6 = (x: number, mul: number, div: number): number => scaleRound(x, mul, div, 6);
/** كميةُ جرعةٍ بالوحدة الجديدة: ثلاثُ منازل كما يخزّنها retail_checkout ويخصمها _dose_plan، ولا تحت ٠٫٠٠١ (greatest بالخادم). */
const doseQ = (x: number, mul: number, div: number): number => Math.max(scaleRound(x, mul, div, 3), 0.001);
const packsOf = (p: Product): number => (Array.isArray(p.packs) ? p.packs.length : 0);

export function demoUnitChange(id: string, seen: UnitSeen, to: UnitTo, mul: number, div: number): Product {
  gate();
  if (!id || !seen || typeof seen !== "object" || !to || typeof to !== "object") {
    throw demoHint("unit_bad_request", "الطلب ناقص — حدّث الصفحة وأعد. ما انحفظ شي.");
  }
  const db = loadDB();
  const p = (db.products ?? []).find((x) => x.id === id);
  if (!p) throw demoHint("unit_product_gone", "المادة ما عادت موجودة (انحذفت أو اندمجت) — حدّث القائمة.");
  const from: UnitOf = unitOf(p);
  /* عددُ المفرد الخامّ (n0 بالخادم): صفٌّ قديمٌ بالوزن بقي عليه مفرد — وحدتُه الفعليّة «بالكيلو» (from)، أمّا ربطُه «بالحبّة» فيحسبه
   * _dose_plan بعدده؛ وما رآه النموذج يُقارَن بالخامّ كالخادم. */
  const rawPer = (x: { has_sub_unit?: boolean | null; units_per_box?: number | null }): number | null =>
    x.has_sub_unit && (Number(x.units_per_box) || 0) > 0 ? Number(x.units_per_box) : null;
  const n0 = rawPer(p);
  if (!!seen.sold_by_weight !== !!p.sold_by_weight || rawPer(seen) !== n0) {
    throw demoHint("unit_seen_changed", "وحدة المادة تغيّرت من جهاز ثاني من فتحت النموذج — ما انحفظ شي. سكّر النموذج وافتحه من جديد.");
  }
  if (num(seen.sell_price) !== num(p.sell_price) || num(seen.purchase_price) !== num(p.purchase_price) || num(seen.sub_unit_price) !== num(p.sub_unit_price)) {
    throw demoHint("price_moved", "سعر المادة تغيّر من جهاز ثاني (رفع أسعار أو فاتورة شراء) من فتحت النموذج — ما انحفظ شي. سكّر النموذج وافتحه من جديد.");
  }
  const w1 = !!to.sold_by_weight, s1 = !!to.has_sub_unit;
  if (w1 && s1) throw demoHint("unit_both", "المادة إمّا بالوزن وإمّا بالمفرد — مو الاثنين.");
  const n1 = s1 ? num(to.units_per_box) : null;
  if (s1 && !(n1 != null && n1 > 0 && n1 <= 100000 && roundTo(n1, 3) === n1)) throw demoHint("unit_per_bad", "عدد الوحدات بالعلبة لازم رقم أكبر من صفر.");
  const sell = num(to.sell_price), buy = num(to.purchase_price), sub = s1 ? num(to.sub_unit_price) : null;
  const min = to.min_stock == null ? (p.min_stock ?? 0) : num(to.min_stock);
  const okP = (v: number | null) => v != null && v >= 0 && v < 1e10;
  if (!(okP(sell) && okP(buy) && (sub == null || okP(sub)) && min != null && min >= 0 && min <= 1e9 && Math.round(min) === min)) {
    throw demoHint("unit_price_bad", "الأسعار والحدّ الأدنى لازم أرقام صفر أو أكثر.");
  }
  const toU: UnitOf = { weight: w1, per: n1 };
  const kind = unitKind(from, toU);
  if (kind === "none") throw demoHint("unit_no_change", "الوحدة ما تغيّرت — احفظ النموذج عادي.");
  if (!(Number.isFinite(mul) && Number.isFinite(div) && mul > 0 && mul <= 1e6 && div > 0 && div <= 1e6)
      || (kind === "sub_on" && !(mul === 1 && (div === 1 || div === n1)))
      || ((kind === "sub_off" || kind === "per") && !(mul === 1 && div === 1))) {
    throw demoHint("unit_factor_bad", "نسبة التحويل غير صحيحة — جاوب سؤال الوحدة بالنموذج من جديد.");
  }
  const scale = mul !== div;
  const pieces = kind === "sub_on" && scale;

  if ((p.price_currency ?? "IQD") === "USD") throw demoHint("unit_usd", "المادة مسعّرة بالدولار وحده — ما تنباع بالوزن ولا بالمفرد.");
  if (p.farm_id) throw demoHint("unit_farm", "مادة مخزن الحقل ما تتغيّر وحدتها من هنا.");
  if (w1 && ((p.sub_codes ?? []).length > 0 || packsOf(p) > 0)) {
    throw demoHint("unit_packs_weight", "المادة بالوزن ما يصير الها كراتين ولا باركود مغلّف — احذفها من نموذج المادة واحفظ، وبعدين حوّلها للوزن.");
  }
  if (!s1 && n0 != null && (p.sub_codes ?? []).length > 0) {
    throw demoHint("unit_sub_codes", "للمادة باركود مغلّف (للمفرد) — احذفه من نموذج المادة واحفظ، وبعدين اطفي المفرد.");
  }
  const counts = loadCounts();
  if (scale) {
    if (p.pooled) throw demoHint("unit_pooled", "المادة «بدون كمية» — رصيدها بحوض القسم وياه غيرها، فما يتحوّل وحده. فكّ التجميع أوّلاً.");
    if (p.sell_price_usd != null || p.sub_unit_price_usd != null) {
      throw demoHint("unit_dual", "المادة بسعرين (دينار ودولار) — امسح سعر الدولار من نموذجها واحفظ، حوّل الوحدة، وبعدين رجّعه بالوحدة الجديدة.");
    }
    if (packsOf(p) > 0) throw demoHint("unit_packs", "للمادة كراتين محسوبة بالوحدة القديمة — احذفها واحفظ، حوّل الوحدة، وبعدين رجّعها.");
    const g = groupKeyOf(p.bulk_group);
    if (g != null && (db.products ?? []).some((x) => x.id !== p.id && groupKeyOf(x.bulk_group) === g)) {
      throw demoHint("unit_grouped", "المادة مربوطة بمجموعة بسعر واحد — فكّها من «المربوطة» أوّلاً، بعدين حوّل وحدتها.");
    }
    if (counts.some((c) => c.product_id === p.id && c.status === "pending")) {
      throw demoHint("unit_count_pending", "على المادة جرد أو سند تلف ينتظر، مكتوب بالوحدة القديمة — خلّي المدير يبتّ بيه أوّلاً.");
    }
    if ((db.consumption ?? []).some((c) => c.product_id === p.id)) {
      throw demoHint("unit_consumption", "المادة انصرفت كمستهلكات خدمة، ودفترها بالوحدة القديمة — ما تتحوّل. اعمل مادة جديدة بالوحدة الثانية وحوّل الرصيد بالجرد.");
    }
    if ((db.oldDebtItems ?? []).some((d) => d.product_id === p.id && Number(d.returned_qty) < Number(d.qty))) {
      throw demoHint("unit_old_debt", "على المادة مواد دين قديم ما رجعت، مكتوبة بالوحدة القديمة — رجّعها أو صفّها أوّلاً.");
    }
    if ((db.storeOrders ?? []).some((o) => o.status === "new" && Array.isArray(o.items) && o.items.some((x) => String(x.product_id) === p.id))) {
      throw demoHint("unit_store_pending", "على المادة طلب من المتجر ينتظر، كميته بالوحدة القديمة — اقبله أو ارفضه أوّلاً، بعدين حوّل الوحدة.");
    }
  }

  const now = new Date().toISOString();
  // ١) الدفعات
  const lots = loadLots();
  let lotsTouched = false;
  if (scale) {
    for (const l of lots) {
      if (l.product_id !== p.id) continue;
      l.qty = q3(l.qty, mul, div);
      l.received_qty = q3(l.received_qty, mul, div);
      if (l.unit_cost != null) l.unit_cost = q6(l.unit_cost, div, mul);
      lotsTouched = true;
    }
  }
  // ٢) سطورُ البيع القديمة: stock_qty بالوحدة الجديدة، وحصّةُ الحوض كما هي.
  if (scale) {
    for (const it of db.invoiceItems ?? []) {
      if (it.product_id !== p.id) continue;
      const pool = Number(it.pooled_qty ?? 0), st = Number(it.stock_qty ?? it.qty);
      // round((stock_qty − pooled) × mul ÷ div + pooled, 3) بتقريبٍ واحد — والحوضُ صفرٌ بأغلب السطور.
      it.stock_qty = pool === 0 ? q3(st, mul, div) : roundTo(scaleRound(st - pool, mul, div, 12) + pool, 3);
    }
  }
  // ٣) الجرعات المعلَّقة والمختومة
  for (const d of db.doseCharges ?? []) {
    if (d.product_id !== p.id || (d.status !== "pending" && d.status !== "billed")) continue;
    const u0 = d.dose_unit, q0 = d.dose_qty ?? 1;
    if (scale && d.stock_qty != null) d.stock_qty = q3(d.stock_qty, mul, div);
    else if (kind === "per" && u0 === "sub" && n1 != null) d.stock_qty = scaleRound(q0, 1, n1, 3);
    if (u0 === "sub" && !s1 && n0 != null) { d.dose_qty = doseQ(scaleRound(q0, 1, n0, 12), mul, div); d.dose_unit = "box"; }
    else if (u0 === "box" && scale && !pieces) d.dose_qty = doseQ(q0, mul, div);
    else if (pieces && u0 === "box") d.dose_unit = "sub";
  }
  // ٢ب) سطورُ فواتير الشراء وثيقةٌ لا تُحوَّل — تُعلَّم فلا يعكسها تعديلُ فاتورتها بالجديدة (purchase_item_unit_marks).
  if (scale) {
    const marks = new Set(db.purchaseUnitMarks ?? []);
    for (const it of db.purchaseItems ?? []) if (it.product_id === p.id) marks.add(it.id);
    db.purchaseUnitMarks = [...marks];
  }
  // ٥) وصفاتُ الخدمات (qty_m: آلافٌ صحيحة)
  for (const r of db.serviceRecipes ?? []) {
    if (r.product_id !== p.id) continue;
    const q = Number(r.qty_m) / 1000;
    if (r.unit === "sub" && !s1 && n0 != null) { r.qty_m = String(Math.max(Math.round(scaleRound(scaleRound(q, 1, n0, 12), mul, div, 3) * 1000), 1)); r.unit = "stock"; r.updated_at = now; }
    else if (r.unit === "stock" && scale && !pieces) { r.qty_m = String(Math.max(Math.round(q3(q, mul, div) * 1000), 1)); r.updated_at = now; }
    else if (pieces && r.unit === "stock") { r.unit = "sub"; r.updated_at = now; }
  }
  // ٦) الرصيدُ ومرحَّلُه
  const carry = db.stockCarry?.[p.id];
  let e = scaleRound(Number(p.stock) || 0, mul, div, 9);
  if (scale && carry) e = scaleRound((Number(p.stock) || 0) + Number(carry.carry_n) / 1e9, mul, div, 9);
  let stock = roundTo(e, 3);
  let c = roundTo(e - stock, 9);
  if (c >= 0.0005) { stock = roundTo(stock + 0.001, 3); c = roundTo(e - stock, 9); }
  if (scale && carry) {
    const cn = BigInt(Math.round(c * 1e9));
    carry.carry_n = String(cn);
    carry.ext_in_n = String(BigInt(carry.ext_out_m) * 1_000_000n + cn);
    carry.updated_at = now;
  }
  // ٧) المادّة
  Object.assign(p, {
    sold_by_weight: w1,
    has_sub_unit: s1,
    units_per_box: n1,
    sub_unit_name: s1 ? ((to.sub_unit_name ?? "").trim() || T_UNIT) : null,
    sub_unit_price: s1 && sub != null ? roundTo(sub, 2) : null,
    sub_purchase_price: s1 ? (p.sub_purchase_price ?? null) : null,
    sell_price: roundTo(sell as number, 2),
    purchase_price: roundTo(buy as number, 2),
    min_stock: min,
    stock,
    avg_cost: scale && p.avg_cost != null ? q6(Number(p.avg_cost), div, mul) : p.avg_cost,
    expiry_ack_qty: scale && p.expiry_ack_qty != null ? q3(Number(p.expiry_ack_qty), mul, div) : p.expiry_ack_qty,
  });
  // ٨) عدّادُ الأسعار: كلُّ قائمةٍ قبل هذه اللحظة قديمة. والسجلُّ (product_unit_changes) يسأله فكُّ الدمج.
  db.priceSeq = (db.priceSeq ?? 0) + 1;
  db.unitChanges = [...(db.unitChanges ?? []), { product_id: p.id, product_name: p.name, at: now }];
  // ٤) ربطُ «سعر الجرعة» — آخرَ الكتابات بعد كلّ الفحوص: مخزنٌ آخر (vp_demo_clinic_drugs) لا يُكتب قبل أن يثبت الباقي.
  saveDB(db);
  if (lotsTouched) saveLots(lots);
  demoDrugLinksMap(p.id, (d) => {
    if (d.dose_unit === "sub" && !s1 && n0 != null) return { dose_qty: doseQ(scaleRound(d.dose_qty ?? 1, 1, n0, 12), mul, div), dose_unit: "box" };
    if (d.dose_unit === "box" && scale) return pieces ? { dose_unit: "sub" } : { dose_qty: doseQ(d.dose_qty ?? 1, mul, div) };
    return null;
  });
  return p;
}
