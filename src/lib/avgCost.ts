/* ============================================================================
 * متوسّطُ الكلفة المتحرّك (0255) — مرآةُ _avg_receive و_avg_adjust و_avg_merge حرفاً بحرف.
 *
 * قرارُ المالك (٣١/١٠): الكلفةُ للمستهلكات والتلف وبيع المواد = المتوسّطُ المتحرّك من يوم 0255،
 * و«سعر الشراء» يبقى آخرَ سعر. فـstock_unit_cost(p) = greatest(coalesce(avg_cost, purchase_price, 0), 0)
 * (stockUnitCost بـconsumption.ts)، وهذه الدوالُّ وحدها تحرّك avg_cost.
 *
 * ── المقاييس (أعدادٌ صحيحة BigInt، لا عائمَ بأيّ خطوة) ─────────────────────
 *   s, q       الرصيدُ وكميةُ الاستلام بالألف (×10³) — numeric(·,3)
 *   a, c       المتوسّطُ وكلفةُ الاستلام لوحدة المخزون بالمليون (×10⁶) — numeric(24,6)؛ null = مجهول
 *   v          قيمةٌ دقيقة Σ q·c بالمليار (×10⁹ = ألفٌ × مليون) — لا تقريبَ قبل القسمة
 *   variance   فرقُ الكلفة بالفلوس (×10²) — purchase_effects.cost_variance numeric(24,2)
 *   والقسمةُ الوحيدة _cons_round_div(…, 6) = roundDiv على هذه المقاييس (ألف·مليون ÷ ألف = مليون)،
 *   النصفُ بعيداً عن الصفر.
 *
 * ── القواعد (التصميم §10) ──────────────────────────────────────────────
 *   الاستلام: كميةٌ ≤ 0 أو كلفةٌ ≤ 0 ⇒ يبقى المتوسّط (المجّانيُّ لا يخفّضه، والكلفةُ الصفرية مجهولة)؛
 *     متوسّطٌ مجهولٌ أو ≤ 0 ⇒ كلفةُ الاستلام (وحداتٌ بلا كلفةٍ معروفة لا وزنَ لها)؛ رصيدٌ ≤ 0 ⇒ كلفةُ
 *     الاستلام، والسالبُ يُسجَّل فرقُه (−s)·(c − a)؛ وإلا (s·a + q·c)/(s + q).
 *   تعديلُ الشراء: V = s0·a0 − v_old + v_new؛ s1 > 0 و V > 0 ⇒ V/s1؛ s1 > 0 ⇒ coalesce(c_last, a0)؛
 *     وإلا a0 (a0 مجهولٌ ⇒ V مجهول). و**s0 بإشارته** كما قرّرته 0255 بالقياس: الرصيدُ السالب وحداتٌ خرجت
 *     بكلفة a0، فتصحيحُ كميةٍ كُتبت ناقصة بنفس الكلفة يُبقي المتوسّطَ هو (max(s0,0) كان يرفعه ٣٨٪).
 *   الدمج: وزنُ كلٍّ max(s,0) بين المعروفَين (> 0) وحدهما؛ معروفٌ واحد ⇒ هو؛ لا معروف ⇒ a1.
 *     ومعروفان بلا وزن (رصيداهما ≤ 0) ⇒ a1 — لا قسمةَ على صفر.
 *
 * ومفحوصةٌ بسلسلة التصميم (١١٠٠ ← ١١٤٧٫٦١٩٠٤٨ ← ١١٧١٫٤٢٨٥٧٢ …): scripts/consumption-math-test.mjs.
 * ==========================================================================*/
import { roundDiv, roundScaled } from "./consumption";

/** كلفةٌ معروفة: موجودةٌ وفوق الصفر. */
const known = (a: bigint | null): a is bigint => a !== null && a > 0n;
const nonNeg = (s: bigint): bigint => (s > 0n ? s : 0n);

/** أساسُ الاستلام كما يمرّره record_purchase: `_avg_base` = nullif(greatest(coalesce(avg_cost, purchase_price), 0), 0)
 *  بالمليون — null = مجهول (لا متوسّطَ ولا سعر، أو صفر، أو سالب: سعرُ شراءٍ سالب بياناتٌ تالفة). */
export function avgBase(p: { avg_cost?: number | string | null; purchase_price?: number | string | null }): bigint | null {
  const v = p.avg_cost != null ? roundScaled(p.avg_cost, 6)
    : p.purchase_price != null ? roundScaled(p.purchase_price, 2) * 10_000n : null;
  return v === null || v <= 0n ? null : v;
}

/** `_avg_receive(s, a, q, c)` ← المتوسّطُ بعد استلام q بكلفة c على رصيد s ومتوسّط a. */
export function avgReceive(sM: bigint, aU: bigint | null, qM: bigint, cU: bigint): bigint | null {
  if (qM <= 0n || cU <= 0n) return aU;
  if (!known(aU)) return cU;
  if (sM <= 0n) return cU;
  return roundDiv(sM * aU + qM * cU, sM + qM);
}

/** فرقُ الكلفة بالفلوس حين يصفّر الاستلامُ متوسّطاً معروفاً على رصيدٍ سالب: (−s)·(c − a)
 *  — وحداتٌ صُرفت والرصيدُ سالب بكلفةٍ غير كلفتها تُرى مالاً. null حين لا يقع (القواعدُ قبله، أو s ≥ 0)،
 *  وكذلك فرقٌ يُقرَّب صفراً (−٢ بـ١٠٠٠ ثمّ ١٠ بـ١٠٠٠): لم يقع — `nullif(…, 0)` بـ_avg_variance (0255). */
export function receiveVarianceCents(sM: bigint, aU: bigint | null, qM: bigint, cU: bigint): bigint | null {
  if (qM <= 0n || cU <= 0n || !known(aU) || sM >= 0n) return null;
  const v = roundDiv(-sM * (cU - aU), 10_000_000n);   // ألف·مليون (×10⁹) ← فلوس (×10²)
  return v === 0n ? null : v;
}

/** قيمةُ سطر شراءٍ دقيقة q·c بالمليار — لجمع v_old و v_new بلا تقريب. */
export function lineValueNano(qM: bigint, cU: bigint): bigint {
  return qM * cU;
}

/** `_avg_adjust(s0, a0, v_old, v_new, s1, c_last)` ← المتوسّطُ بعد تعديل فاتورة شراء: s0/a0 لحظةَ أوّل لمس،
 *  v_old/v_new مجموعا Σ q·c للسطور القديمة والجديدة (الصفريّةُ بـa0)، s1 الرصيدُ بعد إعادة التطبيق. */
export function avgAdjust(
  s0M: bigint, a0U: bigint | null, vOldN: bigint, vNewN: bigint, s1M: bigint, cLastU: bigint | null,
): bigint | null {
  if (s1M <= 0n) return a0U;
  if (a0U !== null) {
    const v = s0M * a0U - vOldN + vNewN;
    if (v > 0n) return roundDiv(v, s1M);
  }
  return cLastU ?? a0U;
}

/** `_avg_merge(s1, a1, s2, a2)` ← متوسّطُ الباقي بعد طيّ التوأم (1 الباقي، 2 التوأم). */
export function avgMerge(s1M: bigint, a1U: bigint | null, s2M: bigint, a2U: bigint | null): bigint | null {
  if (known(a1U) && known(a2U)) {
    const w1 = nonNeg(s1M), w2 = nonNeg(s2M);
    return w1 + w2 === 0n ? a1U : roundDiv(w1 * a1U + w2 * a2U, w1 + w2);
  }
  if (known(a2U) && !known(a1U)) return a2U;
  return a1U;
}
