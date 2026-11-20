/* ============================================================================
 * مستهلكاتُ الخدمات (0252) — الحسابُ كلُّه هنا، ومرآتُه بالقاعدة حرفاً بحرف.
 *
 * كلُّ رقمٍ تكتبه الوصفةُ بالمخزن وبالمال يُحسب بأعدادٍ صحيحة (BigInt) لا بالعائم: ١٠ مل من
 * مكعّبٍ ٢٠ لتراً = ٠٫٠٠٠٥ عبوة لا يحملها العائمُ صحيحة، و١٫٥ × ٨١٥٫٠١ بالعائم ١٢٢٢٫٥١
 * والخادمُ يكتب ١٢٢٢٫٥٢. فالتجريبيُّ والمعاينةُ والمحرّرُ يمرّون من هنا ويطابقون الخادمَ فلساً بفلس.
 *
 * ── المقاييس (لاحقةُ الاسم تحمل مقياسَه) ──────────────────────────────────
 *   _m / Milli  بالألف (×10³)    الكمياتُ كما يخزّنها numeric(·,3): الرصيد، الكمية، units_per_box
 *   _n / Nano   بالمليار (×10⁹)  المقدارُ الدقيقُ قبل الرصيد: T(Q)، المرحَّل، ext_in
 *   _u          بالمليون (×10⁶)  كلفةُ وحدة المخزون: unit_cost، avg_cost — numeric(24,6)
 *   _c / Cents  بالفلوس (×10²)   المال: w، V، الكلفة، المجاميع — numeric(·,2)
 *
 * ── القسمةُ الواحدة ─────────────────────────────────────────────────────
 *   _cons_round_div(n, d, s) = round(sign(n)·sign(d)·div(|n|·10ˢ·2 + |d|, 2|d|) / 10ˢ, s)
 *   = n/d بـs منازل، النصفُ بعيداً عن الصفر، بقسمةٍ صحيحة. مرآتُه `roundDiv` على أعدادٍ مُقاسةٍ
 *   سلفاً، وكلُّ دالّةٍ أدناه تكتب تحويلَ مقياسها بجانبها (التصميم §3.2–§3.4).
 *
 * ── الترحيل (_stock_post) ──────────────────────────────────────────────
 *   المقدارُ الدقيق (٩ منازل) يصل الرصيدَ (٣ منازل) عبر مرحَّلٍ لكلّ مادّة: المجموع = المرحَّل + x،
 *   والمكتوب = floor(المجموع·1000 + ½)/1000 — النصفُ للأعلى، فالمكتوبُ يتبع المجموعَ التراكميّ
 *   وحده: إرجاعُ مقدارٍ ثم إعادتُه صفرٌ صافٍ. والمرحَّلُ الجديد = المجموع − المكتوب ∈ [−0.0005, 0.0005).
 *   والثابتُ لكلّ مادّة (verify_consumption): Σ qty − Σ posted + ext_in − ext_out = carry.
 *
 * بلا استيرادٍ وبلا نصٍّ معروض: رموزُ الرفض وحدها (نصوصُها بالواجهة عبر t())، والوحدةُ لا تُحمَّل
 * إلا من وحداتٍ كسولة. ومفحوصةٌ بأرقام التصميم والحزمة: scripts/consumption-math-test.mjs.
 * ==========================================================================*/

const NANO_PER_MILLI = 1_000_000n;

const abs = (n: bigint): bigint => (n < 0n ? -n : n);
/** القسمةُ الحقيقيّة للأسفل (floor) — قسمةُ BigInt تقطع نحو الصفر، والسالبُ يحتاج خطوةً بعد. */
const floorDiv = (n: bigint, d: bigint): bigint => {
  const q = n / d;
  return n % d !== 0n && (n < 0n) !== (d < 0n) ? q - 1n : q;
};

/** n/d مقرَّباً لعددٍ صحيح، النصفُ بعيداً عن الصفر: sign(n)·sign(d)·⌊(2|n| + |d|) / (2|d|)⌋.
 *  مرآةُ `_cons_round_div(n, d, s)` حين يُمرَّر n مضروباً بـ10ˢ مسبقاً. ومقامٌ صفر يرمي كما يرمي `div`. */
export function roundDiv(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError("roundDiv: division by zero");
  const q = (2n * abs(n) + abs(d)) / (2n * abs(d));
  return (n < 0n) !== (d < 0n) ? -q : q;
}

/* ── القرّاءُ الدقيقة ──────────────────────────────────────────────────── */
const DEC = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

/** رقمٌ كما يقرؤه numeric ← عددٌ صحيح بـ`scale` منازل، أو نصُّ السبب إن لم يُقرأ.
 *  الرقمُ يُقرأ بأقصر نصٍّ يرجع إليه (`String(x)`، ومنه الأُسّيّ «1e-7» و«1e+21»).
 *  والنصُّ تُشال من طرفيه المسافاتُ الستُّ اللاتينية وحدها (isspace بـnumeric_in): المسافةُ غيرُ
 *  المنكسرة وعلامةُ BOM يرفضهما الخادم، و`trim()` كان يقبلهما فيقول التجريبيُّ «سليم» عمّا يرفضه.
 *  `round` = تقريبُ numeric(p, scale) (النصفُ بعيداً عن الصفر)؛ وبدونه منزلةٌ زائدةٌ غيرُ صفرية تُرفض. */
function parse(x: unknown, scale: number, round: boolean): bigint | string {
  let s: string;
  if (typeof x === "number") {
    if (!Number.isFinite(x)) return `not a finite number: ${x}`;
    s = String(x);
  } else if (typeof x === "string") s = x.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, "");
  else return `not a number: ${x === null ? "null" : typeof x}`;
  const m = DEC.exec(s);
  if (!m || !(m[2] || m[3])) return `not a decimal: "${s}"`;
  const frac = m[3] ?? "";
  let digits = (m[2] + frac).replace(/^0+/, "");
  if (!digits) return 0n;
  // القيمة × 10^scale = digits × 10^k
  let k = Number(m[4] ?? 0) - frac.length + scale;
  while (k < 0 && digits.endsWith("0")) { digits = digits.slice(0, -1); k++; }   // «1.2300» = ١٫٢٣ بلا تقريب
  let v: bigint;
  if (k >= 0) {
    if (k + digits.length > 60) return `out of range: "${s}"`;
    v = BigInt(digits) * 10n ** BigInt(k);
  } else if (!round) {
    return `"${s}" has more than ${scale} decimals`;
  } else {
    v = -k > digits.length ? 0n : roundDiv(BigInt(digits), 10n ** BigInt(-k));   // أقلُّ من عُشر الوحدة ⇒ صفر
  }
  return m[1] === "-" ? -v : v;
}
const must = (r: bigint | string): bigint => {
  if (typeof r === "string") throw new RangeError(r);
  return r;
};

/** كميةٌ ← بالألف. أكثرُ من ٣ منازل يرمي — لا تقريبَ صامتاً لكميةٍ كتبها أحد. */
export function toMilli(x: number | string): bigint { return must(parse(x, 3, false)); }
/** مالٌ ← بالفلوس (منزلتان). */
export function toCents(x: number | string): bigint { return must(parse(x, 2, false)); }
/** كلفةُ وحدة ← بالمليون (٦ منازل). */
export function toMicro(x: number | string): bigint { return must(parse(x, 6, false)); }
/** مقدارٌ دقيق ← بالمليار (٩ منازل). */
export function toNano(x: number | string): bigint { return must(parse(x, 9, false)); }
/** `round(x, scale)` / إسنادٌ لـnumeric(p, scale): النصفُ بعيداً عن الصفر، بالأجزاء. لقيمةِ عمودٍ يقرّبها
 *  عمودُه (سعرُ شراءٍ عائمٌ بالتجريبيّ، كلفةٌ ثابتة بخدمة) — لا لكميةٍ أُدخلت (تلك toMilli ترفض). */
export function roundScaled(x: number | string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 30) throw new RangeError(`bad scale: ${scale}`);
  return must(parse(x, scale, true));
}
/** عددٌ مُقاس ← رقمٌ للعرض، من نصّه العشريّ (أقربُ عائمٍ إليه، بلا تقريبٍ مزدوج). */
export function fromScaled(v: bigint, scale: number): number {
  if (!Number.isInteger(scale) || scale < 0) throw new RangeError(`bad scale: ${scale}`);
  const a = abs(v).toString().padStart(scale + 1, "0");
  const t = scale ? `${a.slice(0, a.length - scale)}.${a.slice(a.length - scale)}` : a;
  return Number(v < 0n ? `-${t}` : t);
}

/* ── المادّة ───────────────────────────────────────────────────────────── */
export type RecipeUnit = "stock" | "sub";

/** ما تقرؤه الوحدةُ من المادّة — حقولُ products كما تصل (رقماً أو نصّاً). */
export interface ConsProduct {
  purchase_price?: number | string | null;
  /** 0255: متوسّطُ الكلفة المتحرّك — null يتبع سعرَ الشراء. */
  avg_cost?: number | string | null;
  has_sub_unit?: boolean | null;
  units_per_box?: number | string | null;
  pooled?: boolean | null;
  farm_id?: string | null;
  /** 0259: الكراتين — `[{ per, … }]` كما يخزّنها العمود (jsonb). */
  packs?: unknown;
}

/** `stock_unit_cost(p)` بالمليون = greatest(coalesce(avg_cost, purchase_price, 0), 0) (0255، الملخّص §A3).
 *  كلُّ حقلٍ يُقرأ كما يخزّنه عمودُه: avg_cost numeric(24,6) و purchase_price numeric(12,2) (0007) — قيمُ الخادم
 *  عليه أصلاً، والعائمُ التجريبيّ يُقرَّب كما كان العمودُ سيقرّبه. و0 بالمتوسّط كلفةٌ لا «مجهول» (coalesce). */
export function stockUnitCost(p: Pick<ConsProduct, "avg_cost" | "purchase_price">): bigint {
  const k = p.avg_cost != null ? roundScaled(p.avg_cost, 6)
    : p.purchase_price != null ? roundScaled(p.purchase_price, 2) * 10_000n : 0n;
  return k > 0n ? k : 0n;
}

/** units_per_box بالألف حين للمادّة وحدةٌ صغيرة (has_sub_unit و units_per_box > 0)، وإلا null. */
export function subUnitMilli(p: Pick<ConsProduct, "has_sub_unit" | "units_per_box">): bigint | null {
  if (!p.has_sub_unit || p.units_per_box == null) return null;
  const u = roundScaled(p.units_per_box, 3);   // numeric(12,3) (0033)
  return u > 0n ? u : null;
}
/** per_div بالألف: 'stock' ← ١، و'sub' ← units_per_box — أو null لـ'sub' بلا وحدةٍ صغيرة (no_sub_unit). */
export function perDivMilli(unit: RecipeUnit, p: Pick<ConsProduct, "has_sub_unit" | "units_per_box">): bigint | null {
  return unit === "stock" ? 1000n : subUnitMilli(p);
}
/** سببُ تخطّي مادّةٍ حيّة بالبيعة (§5.2 الخطوة ٤، بترتيبها): حقل، ثم حوض، ثم 'sub' بلا وحدةٍ صغيرة. */
export type EntrySkip = "farm_stock" | "pooled" | "no_sub_unit";
export function entrySkip(p: ConsProduct, unit: RecipeUnit): EntrySkip | null {
  if (p.farm_id) return "farm_stock";
  if (p.pooled) return "pooled";
  return perDivMilli(unit, p) === null ? "no_sub_unit" : null;
}

/* ── أهدافُ الوصفة لسطرٍ كميّتُه Q (التصميم §3.3) ─────────────────────── */
/** T(Q) = _cons_round_div(Q × per_qty, per_div, 9): (Qm/10³)(qm/10³)/(dm/10³)·10⁹ = Qm·qm·10⁶/dm. */
export function targetNano(Qm: bigint, qm: bigint, dm: bigint): bigint {
  return roundDiv(Qm * qm * NANO_PER_MILLI, dm);
}
/** w = _cons_round_div(per_qty × unit_cost, per_div, 2): (qm/10³)(ku/10⁶)/(dm/10³)·10² = qm·ku/(dm·10⁴). */
export function perValueCents(qm: bigint, ku: bigint, dm: bigint): bigint {
  return roundDiv(qm * ku, dm * 10_000n);
}
/** V(Q) = round(Q × w, 2): (Qm/10³)(wc/10²)·10² = Qm·wc/10³. */
export function valueCents(Qm: bigint, wc: bigint): bigint {
  return roundDiv(Qm * wc, 1000n);
}
/** المقدارُ الدقيق بوحدة المخزون لكميةٍ qm بوحدةٍ قاسمُها dm = T(1): مقدارُ سند التلف d
 *  (_cons_round_div(qty, units_per_box, 9) للصغيرة، والكميةُ نفسُها للعلبة)، و«٢ مل = ٠٫٠٠٤ عبوة» بالمحرّر. */
export function stockNano(qm: bigint, dm: bigint): bigint {
  return targetNano(1000n, qm, dm);
}

/** القيمُ المجمَّدة لمدخلٍ واحد (حقولُ invoice_consumption بمقاييس التجريبيّ §11.3). */
export interface SpecValues { per_qty_m: bigint; per_div_m: bigint; unit_cost_u: bigint; per_value_c: bigint }
/** مدخلُ وصفةٍ أو تعديلٍ على مادّةٍ حيّة ← قيمُه: k = stock_unit_cost، d = per_div، w. null = 'sub' بلا وحدةٍ صغيرة.
 *  (الحقلُ والحوضُ يُفحصان قبلها بـentrySkip.) */
export function specValues(p: ConsProduct, qtyM: bigint, unit: RecipeUnit): SpecValues | null {
  const d = perDivMilli(unit, p);
  if (d === null) return null;
  const k = stockUnitCost(p);
  return { per_qty_m: qtyM, per_div_m: d, unit_cost_u: k, per_value_c: perValueCents(qtyM, k, d) };
}
/** unit_cost سطرٍ مخطَّط = round(coalesce(cost, 0), 2) + C، و C = Σ w — بمقياس العمود. */
export function lineUnitCostCents(flat: number | string | null | undefined, perValuesC: readonly bigint[]): bigint {
  let c = roundScaled(flat ?? 0, 2);
  for (const w of perValuesC) c += w;
  return c;
}

/** حركةُ مدخلٍ إلى هدف (_consumption_move §5.4): T و V عند max(الهدف، 0) ناقصَ الحيّ.
 *  null = لا شيء (كلُّ تكرارٍ لنفس الهدف لا شيء). النوعُ use إن زاد المقدار، أو ثبت وزادت القيمة؛ وإلا restore. */
export interface MoveDelta { qty_n: bigint; value_c: bigint; kind: "use" | "restore" }
export function consumptionMove(
  spec: Pick<SpecValues, "per_qty_m" | "per_div_m" | "per_value_c">,
  live: { qty_n: bigint; value_c: bigint },
  targetM: bigint,
): MoveDelta | null {
  const q = targetM > 0n ? targetM : 0n;
  const dq = targetNano(q, spec.per_qty_m, spec.per_div_m) - live.qty_n;
  const dv = valueCents(q, spec.per_value_c) - live.value_c;
  if (dq === 0n && dv === 0n) return null;
  return { qty_n: dq, value_c: dv, kind: dq > 0n || (dq === 0n && dv > 0n) ? "use" : "restore" };
}
/** العجزُ بالألف لصرفٍ من مادّةٍ حيّة: max(0, المكتوب − max(الرصيد قبله، 0)). */
export function shortfallMilli(postedM: bigint, beforeM: bigint): bigint {
  const have = beforeM > 0n ? beforeM : 0n;
  return postedM > have ? postedM - have : 0n;
}

/* ── الترحيل (_stock_post §3.4) ───────────────────────────────────────── */
export type PostMode = "ledger" | "external" | "fold";
/** صفُّ product_stock_carry: المرحَّل و ext_in بالمليار، و ext_out بالألف. */
export interface CarryState { carry_n: bigint; ext_in_n: bigint; ext_out_m: bigint }
export const EMPTY_CARRY: Readonly<CarryState> = Object.freeze({ carry_n: 0n, ext_in_n: 0n, ext_out_m: 0n });

/** ترحيلُ مقدارٍ دقيق x (موجبٌ أخذ، سالبٌ ردّ) ← ما يُطرح من الرصيد بالألف والمرحَّلُ الجديد.
 *  المكتوب = floor((المجموع + ½·10⁶) / 10⁶) — floor حقيقيٌّ للسالب. 'external' (سندُ تلف) يزيد ext_in بـx
 *  و ext_out بالمكتوب؛ و'fold' (طيُّ مرحَّل توأمٍ بالدمج) يزيد ext_out وحده؛ و'ledger' لا هذا ولا ذاك. */
export function stockPost(state: Readonly<CarryState>, xNano: bigint, mode: PostMode = "ledger"): { posted: bigint; state: CarryState } {
  if (mode !== "ledger" && mode !== "external" && mode !== "fold") throw new Error("stock_post_mode");
  const total = state.carry_n + xNano;
  const posted = floorDiv(total + NANO_PER_MILLI / 2n, NANO_PER_MILLI);
  return {
    posted,
    state: {
      carry_n: total - posted * NANO_PER_MILLI,
      ext_in_n: state.ext_in_n + (mode === "external" ? xNano : 0n),
      ext_out_m: state.ext_out_m + (mode === "external" || mode === "fold" ? posted : 0n),
    },
  };
}
/** حدثُ دفترٍ كما يدخل الثابت: المقدارُ بالمليار والمكتوبُ بالألف. */
export interface CarryEvent { qty_n: bigint; posted_m: bigint }
/** Σ qty − Σ posted + ext_in − ext_out − carry بالمليار — صفرٌ حين يصحّ الثابت. الأحداثُ أحداثُ المادّة
 *  بلا ما ملاحظتُه product_gone (لم يُكتب شيءٌ ولا مرحَّل). */
export function carryResidual(events: readonly CarryEvent[], state: Readonly<CarryState>): bigint {
  let r = state.ext_in_n - state.ext_out_m * NANO_PER_MILLI - state.carry_n;
  for (const e of events) r += e.qty_n - e.posted_m * NANO_PER_MILLI;
  return r;
}
export function carryInvariant(events: readonly CarryEvent[], state: Readonly<CarryState>): boolean {
  return carryResidual(events, state) === 0n;
}

/* ── المال بمقياس الأعمدة ─────────────────────────────────────────────── */
/** `v := v + q*p` بمتغيّرٍ numeric(14,2): المجموعُ الدقيق ثم تقريبُ الإسناد — S_c·10³ + q_m·p_c بالألف من الفلس. */
export function addLineCents(sumCents: bigint, qtyMilli: bigint, priceCents: bigint): bigint {
  return roundDiv(sumCents * 1000n + qtyMilli * priceCents, 1000n);
}
/** round(qty × unit_cost, 2) لسطرٍ واحد (المجموعُ سطراً سطراً بالتعديل والمرتجع). */
export function lineCents(qtyMilli: bigint, priceCents: bigint): bigint {
  return roundDiv(qtyMilli * priceCents, 1000n);
}

/** 0267: عددُ علب الكارتون الذي يطابقه سطرٌ — بالمليار — مرآةُ فرع `_product_line_cost`: كارتونٌ محفوظٌ بـ`packs` (عددُه رقمٌ ≥ ٢)
 *  و round(per × |qty|, 3) = |stock_qty|، وqty ≠ 0 وstock_qty حاضرة؛ وإلا null (السطرُ يسلك فرعَي 0255). أوّلُ كارتونٍ يطابق — والعددُ
 *  نفسُه لأيّ مطابق (per × |qty| يحدّده). */
export function packPerNano(p: Pick<ConsProduct, "packs">, qtyM: bigint, stockQtyM: bigint | null | undefined): bigint | null {
  if (stockQtyM == null || qtyM === 0n || !Array.isArray(p.packs)) return null;
  for (const k of p.packs as unknown[]) {
    const per = k && typeof k === "object" ? (k as { per?: unknown }).per : undefined;
    if (typeof per !== "number" || !Number.isFinite(per) || per < 2) continue;
    const perN = roundScaled(per, 9);
    if (roundDiv(perN * abs(qtyM), 1_000_000_000n) === abs(stockQtyM)) return perN;
  }
  return null;
}

/** 0267: هل يرفض الخادمُ السطرَ `pack_changed`؟ — مرآةُ شرطه: |stock_qty| > |qty| (qty ≠ 0) ولا كارتونَ محفوظاً يطابقه، وليس مفرداً
 *  (|stock_qty| × عددُه ≤ |qty| + عددُه × ٠٫٠٠١ — بالألف: |sq|·upb ≤ |q|·1000 + upb). كارتونٌ تبدّل عددُه بعد ما نزل بشاشةٍ بائتة. */
export function packChanged(p: Pick<ConsProduct, "packs" | "has_sub_unit" | "units_per_box">, qtyM: bigint, stockQtyM: bigint | null | undefined): boolean {
  if (stockQtyM == null || qtyM === 0n || abs(stockQtyM) <= abs(qtyM)) return false;
  if (packPerNano(p, qtyM, stockQtyM) !== null) return false;
  const upb = subUnitMilli(p);
  return !(upb !== null && abs(stockQtyM) * upb <= abs(qtyM) * 1000n + upb);
}

/** `_product_line_cost` (0255، الملخّص §A4): كلفةُ سطر مادّةٍ بالفلوس يحسبها الخادم.
 *  مادّةٌ حيّةٌ بالعيادة لا حقلَ لها: سطرٌ بالوحدة الصغيرة (has_sub_unit و units_per_box > 0 و stock_qty حاضرة
 *  و |stock_qty| ≠ |qty|) ← _cons_round_div(k, units_per_box, 2) = (ku/10⁶)/(upb_m/10³)·10² = ku/(upb_m·10)؛
 *  وغيرُه (علبة، كيلو) ← round(k, 2) = ku/10⁴. وغيرُ موجودة (`p` فارغ) أو حقلٌ ← كلفةُ الجهاز كما هي. */
export function productLineCostCents(
  p: ConsProduct | null | undefined,
  qtyM: bigint,
  stockQtyM: bigint | null | undefined,
  deviceC: bigint,
): bigint {
  if (!p || p.farm_id) return deviceC;
  const k = stockUnitCost(p);
  // 0267: سطرُ كارتون ← round(k × per, 2) = k·perN / 10¹³ (k بالمليون وper بالمليار).
  const perN = packPerNano(p, qtyM, stockQtyM);
  if (perN !== null) return roundDiv(k * perN, 10_000_000_000_000n);
  const upb = subUnitMilli(p);
  if (upb !== null && stockQtyM != null && abs(stockQtyM) !== abs(qtyM)) return roundDiv(k, upb * 10n);
  return roundDiv(k, 10_000n);
}

/* ── الوصفة: سطورُها ورفضُها (service_recipe_set §11.2، وحرّاسُ المحرّر §3.5) ── */
export const MAX_RECIPE_LINES = 40;
/** (0, 1e6] بوحدة السطر — بالألف. */
export const MAX_LINE_QTY_M = 1_000_000_000n;

/** سطرٌ مقروء (غيرُ RecipeLine بـconsumptionApi — ذاك صفُّ الخادم المعروض). */
export interface ParsedRecipeLine { product_id: string; /** للمقارنة: المعرّفُ بحروفٍ صغيرة (uuid لا يفرّق). */ key: string; qty_m: bigint; unit: RecipeUnit }
/** سطرُ وصفةٍ أو تعديلٍ ← مقروءاً، أو null إن خالف الشكل: معرّفٌ نصٌّ غيرُ فارغ، وكميةٌ ∈ (0, 1e6] بثلاث منازل
 *  أقصى، ووحدةٌ 'stock' أو 'sub' (الغائبةُ 'stock' كافتراض العمود). */
export function parseRecipeLine(l: unknown): ParsedRecipeLine | null {
  if (!l || typeof l !== "object") return null;
  const r = l as { product_id?: unknown; qty?: unknown; unit?: unknown };
  if (typeof r.product_id !== "string" || !r.product_id) return null;
  const unit = r.unit == null || r.unit === "" ? "stock" : r.unit;
  if (unit !== "stock" && unit !== "sub") return null;
  const q = parse(r.qty, 3, false);
  if (typeof q === "string" || q <= 0n || q > MAX_LINE_QTY_M) return null;
  return { product_id: r.product_id, key: r.product_id.toLowerCase(), qty_m: q, unit };
}

export type RecipeLineProblem =
  | "recipe_bad_line" | "recipe_duplicate" | "recipe_product_missing"
  | "recipe_pooled" | "recipe_farm" | "recipe_no_sub_unit" | "recipe_too_small";
export type RecipeRefusal = "recipe_too_many" | RecipeLineProblem;
export interface RecipeCheck {
  /** أوّلُ رفضٍ كما يرمي به الخادم — العددُ أوّلاً، ثم السطورُ بترتيبها وكلُّ سطرٍ بترتيب فحوصه — أو null. */
  first: { code: RecipeRefusal; index: number | null } | null;
  /** مشكلةُ كلّ سطرٍ بترتيب الإدخال (null = سليم) — للمحرّر يعلّم السطرَ نفسَه. */
  lines: (RecipeLineProblem | null)[];
}
/** موادُّ العيادة الحيّة بمعرّفها. */
export type ProductLookup<P> = ReadonlyMap<string, P> | Readonly<Record<string, P | undefined>>;
function lookup<P>(m: ProductLookup<P>, id: string): P | undefined {
  if (m instanceof Map) return m.get(id);
  const rec = m as Readonly<Record<string, P | undefined>>;
  return Object.prototype.hasOwnProperty.call(rec, id) ? rec[id] : undefined;
}

/** فحصُ سطور وصفةٍ قبل حفظها، برموز service_recipe_set. لكلّ سطرٍ بالترتيب: الشكل (recipe_bad_line) ← التكرار
 *  (recipe_duplicate، لمادّةٍ سبقت بأيّ وحدة) ← المادّة بموادّ العيادة الحيّة (recipe_product_missing) ← الحوض
 *  ← الحقل ← 'sub' بلا وحدةٍ صغيرة ← T(1) = 0 (recipe_too_small). وأكثرُ من ٤٠ سطراً recipe_too_many قبل كلّ سطر. */
export function validateRecipeLines(lines: readonly unknown[], products: ProductLookup<ConsProduct>): RecipeCheck {
  const out: (RecipeLineProblem | null)[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const l = parseRecipeLine(raw);
    let prob: RecipeLineProblem | null = null;
    if (!l) prob = "recipe_bad_line";
    else if (seen.has(l.key)) prob = "recipe_duplicate";
    else {
      seen.add(l.key);
      const p = lookup(products, l.product_id) ?? lookup(products, l.key);
      if (!p) prob = "recipe_product_missing";
      else if (p.pooled) prob = "recipe_pooled";
      else if (p.farm_id) prob = "recipe_farm";
      else {
        const d = perDivMilli(l.unit, p);
        if (d === null) prob = "recipe_no_sub_unit";
        else if (stockNano(l.qty_m, d) === 0n) prob = "recipe_too_small";
      }
    }
    out.push(prob);
  }
  const i = out.findIndex((x) => x !== null);
  const bad = i >= 0 ? out[i] : null;
  const first = lines.length > MAX_RECIPE_LINES ? { code: "recipe_too_many" as const, index: null }
    : bad ? { code: bad, index: i } : null;
  return { first, lines: out };
}

/** تعديلُ حالةٍ بالبيعة (§5.2 الخطوة ٢): غائبٌ/null = الوصفة كما هي؛ مصفوفةٌ ≤ ٤٠ سطراً سليمَ الشكل بلا مادّةٍ
 *  مرّتين = تعديل؛ وغيرُ ذلك consumables_bad. */
export function overrideRefusal(list: unknown): "consumables_bad" | null {
  if (list == null) return null;
  if (!Array.isArray(list) || list.length > MAX_RECIPE_LINES) return "consumables_bad";
  const seen = new Set<string>();
  for (const e of list) {
    const l = parseRecipeLine(e);
    if (!l || seen.has(l.key)) return "consumables_bad";
    seen.add(l.key);
  }
  return null;
}
/** قائمتان متساويتان كمجموعتين بتكرار من (المادّة، الكمية، الوحدة) — بالقيمة لا بالنصّ («10.000» = 10).
 *  تعديلٌ يساوي الوصفةَ يُسقط (§5.2)، وحفظُ قائمةٍ تساويها بالورقة يمسح التعديل. سطرٌ لا يُقرأ ⇒ غيرُ متساويتين. */
export function sameConsumables(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  const keys = (xs: readonly unknown[]): string[] | null => {
    const out: string[] = [];
    for (const x of xs) {
      const l = parseRecipeLine(x);
      if (!l) return null;
      out.push(`${l.key}|${l.qty_m}|${l.unit}`);
    }
    return out.sort();
  };
  const ka = keys(a), kb = keys(b);
  return !!ka && !!kb && ka.every((k, i) => k === kb[i]);
}
