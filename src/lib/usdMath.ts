/* ============================================================================
 * حسابُ الدولار (0264) — مرآةُ `_usd_iqd` و`_usd_rate_of` و`_usd_share` ومجاميعِ `usd_checkout` بالقاعدة،
 * ويطابقها usd-parity (supabase/tests/usd-parity.mjs) حالةً بحالة.
 *
 * كلُّه بالأعداد الصحيحة (BigInt): السنتُ للدولار، والدينارُ الكامل، والسعرُ × ١٠٬٠٠٠ (أربعُ منازل كعمود القاعدة).
 * والنصُّ يُقرأ بالضبط لا بـNumber: ١٤٦٠٠٠٫٠٠٥ عائماً تصير ١٤٦٠٠٠٫٠٠٤٩٩٩… فيقرّبها الجهازُ للأسفل والخادمُ للأعلى.
 *
 * الثابتُ الذي تُبنى عليه الميزة (docs/usd-plan.md §١٠): حصّةُ الفاتورة من تسديدٍ بنسبتها المخزّنة (دينارُها ÷ دولارُها)
 * لا بسعرها، وحين يُغلقها التسديدُ هي باقي الدينار بالضبط — فتُغلق بالعملتين معاً مهما تراكم التقريب. والفرقُ بين
 * ما دخل الدرجَ والحصّة «فرقُ صرف»: ربحٌ أو خسارة بيوم التسديد.
 * ========================================================================== */

/** خطواتُ التقريب المسموحة (قيدُ `clinic_prefs_usd_round_step`). */
export const USD_ROUND_STEPS = [1, 50, 100, 250, 500, 1000] as const;

const RATE_SCALE = 10_000n; // أربعُ منازل

/** قسمةٌ بنصفٍ بعيداً عن الصفر — كـ`round(numeric)` بالقاعدة. */
function divRound(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  const neg = (a < 0n) !== (b < 0n);
  const aa = a < 0n ? -a : a, bb = b < 0n ? -b : b;
  const q = (2n * aa + bb) / (2n * bb);
  return neg ? -q : q;
}

/** نصٌّ عشريّ (أرقامٌ شرقية أو غربية، فاصلةٌ عشرية «٫» أو «.») ⇒ عددٌ صحيح بمقياس scale، مقرَّبٌ كـ`round(x, scale)`.
 *  فاصلُ الآلاف («٬» أو «,») يُشال. وغيرُ العدد null — لا صفر: الصفرُ مبلغٌ والفراغُ ليس مبلغاً. */
export function decOf(v: string | number | bigint | null | undefined, scale: number): bigint | null {
  if (v == null) return null;
  if (typeof v === "bigint") return v * 10n ** BigInt(scale);
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  // الأرقامُ الشرقية (U+0660–0669) غربيةً، والفاصلةُ العشرية العربية (U+066B) نقطة، والمسافاتُ تُشال. وفاصلُ الآلاف (« , » أو
  // العربيّ U+066C) فاصلُ آلافٍ **بمجموعاتٍ ثلاثية وحدها** وإلا فليس مبلغاً: «12,5» بمعنى ١٢٫٥ كانت تصير ١٢٥$ بصمت.
  let s = String(v).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\u066B/g, ".").replace(/\s/g, "");
  if (/[,\u066C]/.test(s)) {
    if (!/^-?\d{1,3}([,\u066C]\d{3})+(\.\d*)?$/.test(s)) return null;
    s = s.replace(/[,\u066C]/g, "");
  }
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const neg = m[1] === "-";
  const fp = m[3] ?? "";
  const raw = BigInt((m[2] || "0") + (fp + "0".repeat(scale + 1)).slice(0, scale + 1)); // منزلةٌ زائدة للتقريب
  const r = divRound(raw, 10n);
  return neg ? -r : r;
}

/** عددٌ بمقياس scale ⇒ نصٌّ عشريّ قانونيّ يقبله numeric بالقاعدة («146000.00»، «-2.50»). */
export function decText(v: bigint, scale: number): string {
  const neg = v < 0n, a = (neg ? -v : v).toString().padStart(scale + 1, "0");
  return (neg ? "-" : "") + (scale ? `${a.slice(0, a.length - scale)}.${a.slice(a.length - scale)}` : a);
}
/** ما كتبه المستخدم ⇒ نصٌّ قانونيّ بمقياس scale، أو كما هو إن لم يُقرأ (الخادمُ يرفضه برمزه). «146,000» و«١٤٦٬٠٠٠» و«12٫5»
 *  تُقرأ بالشاشة (decOf) — فتُرسل مقروءةً لا خاماً: numeric بالقاعدة يرفض الفاصلة والأرقامَ الشرقية (22P02). */
export const canonDec = (v: string, scale: number): string => { const c = decOf(v, scale); return c == null ? v : decText(c, scale); };

/** سنتات من نصّ أو عدد — كـ`round(x, 2)`. */
export const centsOf = (v: string | number | null | undefined): bigint | null => decOf(v, 2);
/** باقي فاتورة الدولار بالسنت (بلا عائم): total_usd − paid_usd، ولا سالب. */
export const usdDueCentsOf = (inv: { total_usd?: number | string | null; paid_usd?: number | string | null }): bigint => {
  const t = centsOf(inv.total_usd ?? 0) ?? 0n, p = centsOf(inv.paid_usd ?? 0) ?? 0n;
  return t > p ? t - p : 0n;
};

/** «سعر ١٠٠ دولار» (كما يقوله السوق) ⇒ السعرُ × ١٠٬٠٠٠ للدولار الواحد — مرآةُ `_usd_rate_of` (round(per100/100, 4)).
 *  per100/100 بأربع منازل × ١٠٬٠٠٠ = per100 بمنزلتين — فهو `decOf(per100, 2)` نفسُه. */
export const rateOfPer100 = (per100: string | number | null | undefined): bigint | null => decOf(per100, 2);

/** الحدّان كقيد الجدول: ١٠٠–١٠٠٬٠٠٠ دينار للدولار — يمسك خلطَ «سعر ١٠٠» بـ«سعر الدولار». */
export const rateOk = (rate1e4: bigint | null): boolean =>
  rate1e4 != null && rate1e4 >= 100n * RATE_SCALE && rate1e4 <= 100_000n * RATE_SCALE;

/** دولار (سنتات) × سعر ⇒ دينار لأقرب خطوة — مرآةُ `_usd_iqd`. */
export function iqdOf(usdCents: bigint, rate1e4: bigint, step: number): bigint {
  const st = BigInt(step <= 1 ? 1 : step);
  return divRound(usdCents * rate1e4, 100n * RATE_SCALE * st) * st;
}

/** حصّةُ الفاتورة بالدينار من تسديد usdCents — مرآةُ `_usd_share`. */
export function shareOf(usdCents: bigint, dueUsdCents: bigint, dueIqd: bigint, totalUsdCents: bigint, totalIqd: bigint): bigint {
  const due = dueIqd > 0n ? dueIqd : 0n;
  if (usdCents >= dueUsdCents) return due;
  if (totalUsdCents <= 0n) return 0n;
  const s = divRound(usdCents * totalIqd, totalUsdCents);
  return s < 0n ? 0n : s > due ? due : s;
}

/** معاينةُ تسديد كما سيكتبه `settle_invoice_usd`: ما يدخل الدرج، وحصّةُ الفاتورة، والفرق، وباقي الدولار بعده. */
export function previewSettle(a: {
  usdCents: bigint; rate1e4: bigint; step: number;
  totalUsdCents: bigint; paidUsdCents: bigint; totalIqd: bigint; paidIqd: bigint;
}): { received: bigint; share: bigint; fx: bigint; dueAfterCents: bigint } {
  const dueUsd = a.totalUsdCents - a.paidUsdCents;
  const received = iqdOf(a.usdCents, a.rate1e4, a.step);
  const share = shareOf(a.usdCents, dueUsd, a.totalIqd - a.paidIqd, a.totalUsdCents, a.totalIqd);
  return { received, share, fx: received - share, dueAfterCents: dueUsd - a.usdCents };
}

/** سطرُ سلّة الدولار: الكميةُ عددٌ صحيح (`usd_qty` يرفض الكسر) والسعرُ بالسنت. */
export type UsdLine = { qty: bigint; unitCents: bigint };

/** مجاميعُ `usd_checkout` كما يكتبها الخادم: دينارُ الوحدة = `_usd_iqd(سعرُها، السعر، 1)` بالدينار الكامل — **لا بخطوة التقريب**
 *  (الخطوةُ للنقد الذي يُستلم: `cashAtSale`/`previewSettle`) — × الكمية؛ والخصمُ مقصوصٌ بين صفرٍ ومجموع الدولار ثمّ يُقلب
 *  بالدينار الكامل ويُقصّ بمجموع الدينار — والخصمُ الكامل يأخذ الدينارَ كلَّه. */
export function cartTotals(lines: UsdLine[], discountCents: bigint, rate1e4: bigint): {
  subUsdCents: bigint; subIqd: bigint; discountUsdCents: bigint; discountIqd: bigint; totalUsdCents: bigint; totalIqd: bigint;
  unitIqd: bigint[];
} {
  let subUsd = 0n, subIqd = 0n;
  const unitIqd: bigint[] = [];
  for (const l of lines) {
    const u = iqdOf(l.unitCents, rate1e4, 1);
    unitIqd.push(u);
    subUsd += l.qty * l.unitCents;
    subIqd += l.qty * u;
  }
  const dUsd = discountCents < 0n ? 0n : discountCents > subUsd ? subUsd : discountCents;
  // خصمٌ كامل يأخذ الدينارَ كلَّه (دينارُ السطور مقرَّبٌ وحدةً وحدة فلا يساوي تقليبَ المجموع)؛ وغيرُه يُقلب ويُقصّ.
  const dIqd0 = iqdOf(dUsd, rate1e4, 1);
  const dIqd = dUsd >= subUsd ? subIqd : dIqd0 < subIqd ? dIqd0 : subIqd;
  const tot = subIqd - dIqd;
  return { subUsdCents: subUsd, subIqd, discountUsdCents: dUsd, discountIqd: dIqd, totalUsdCents: subUsd - dUsd, totalIqd: tot > 0n ? tot : 0n, unitIqd };
}

/** البيعُ نقداً = تسديدٌ كاملٌ بسعر البيع بالمعاملة نفسِها: الدرجُ يستلم لأقرب خطوة، والحصّةُ قيمةُ الفاتورة، والفرقُ «فرق صرف».
 *  مجموعٌ صفرٌ بالدولار لا تسديدَ له (null). */
export function cashAtSale(totalUsdCents: bigint, totalIqd: bigint, rate1e4: bigint, step: number): { received: bigint; share: bigint; fx: bigint } | null {
  if (totalUsdCents <= 0n) return null;
  const r = previewSettle({ usdCents: totalUsdCents, rate1e4, step, totalUsdCents, paidUsdCents: 0n, totalIqd, paidIqd: 0n });
  return { received: r.received, share: r.share, fx: r.fx };
}

/** كلفةُ الوحدة بالفلس (منزلتان) كما يختمها `usd_checkout`: round(كلفةُ الدولار × السعر، 2). */
export const costFilsOf = (costCents: bigint, rate1e4: bigint): bigint => divRound(costCents * rate1e4, RATE_SCALE);

/** تسديدٌ يُقبل؟ مرآةُ رفوض `settle_invoice_usd` الحسابية (لا الصلاحيات): مبلغٌ صفر، أكبرُ من الباقي، أو جزئيٌّ يطلع صفراً بالخطوة. */
export function settleRefusal(usdCents: bigint, dueUsdCents: bigint, received: bigint): "usd_amount" | "usd_over" | "usd_too_small" | null {
  if (usdCents <= 0n) return "usd_amount";
  if (usdCents > dueUsdCents) return "usd_over";
  if (received <= 0n && usdCents < dueUsdCents) return "usd_too_small";
  return null;
}

const usdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdFmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
/** «$1,234.50» من سنتات (أرقامٌ غربية كـ`formatNum`)؛ العددُ الصحيح بلا «.00». العرضُ وحده — المالُ بالسنتات. */
export function usdText(cents: bigint | number | null | undefined): string {
  const c = typeof cents === "bigint" ? cents : BigInt(Math.round(Number(cents) || 0));
  const neg = c < 0n, a = neg ? -c : c;
  const whole = a / 100n, frac = a % 100n;
  const s = frac === 0n ? usdFmt0.format(Number(whole)) : usdFmt.format(Number(whole) + Number(frac) / 100);
  return `${neg ? "-" : ""}$${s}`;
}

/** عمودُ القاعدة (numeric بأربع منازل، نصّاً أو عدداً) ⇒ السعرُ × ١٠٬٠٠٠. */
export const rate1e4Of = (v: string | number | null | undefined): bigint | null => decOf(v, 4);
/** سعرُ المئة («146,000») كما يكتبه المدير — للعرض وللحقل. */
export const per100Of = (rate1e4: bigint): number => Number(rate1e4) / 100;
