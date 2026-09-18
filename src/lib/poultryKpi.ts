/* ============================================================================
 * مؤشّراتُ الدفعة — تعريفٌ واحدٌ لكلّ رقمٍ يُقال لصاحب الحقل.
 *
 * ── لماذا وحدةٌ مستقلّة، وليست بالقاعدة ولا بالشاشة ──────────────────────
 * «القاعدةُ تجمع والمتصفّحُ يعرض» (0149) قاعدةٌ عن **الجمع على جداولَ كبيرة**:
 * لا نجرّ ألفَ سطرِ فاتورةٍ لنجمعها بالمتصفّح. وهذه ليست جمعاً — هي قسمةٌ على
 * أرقامٍ **وصلت الشاشةَ أصلاً** (`poultry_cycle_stats` والأيام). فإضافتُها
 * للدالّة كانت ستعني حذفَها وإعادةَ إنشائها ثالثةً، وقد كلّفتنا مرّتَين
 * (0193: توقيعٌ ثانٍ يعطّل الصرف، و0191 ما عادت تُعاد) — بلا مقابل.
 *
 * والأهمّ: التجريبيُّ والسحابيُّ يمرّان من **هنا**، فلا نسختان لمعادلةٍ واحدة.
 *
 * ── والقاعدةُ الحاكمة: `null` تعني «ما نعرف» ─────────────────────────────
 * ما ينقصه مُدخَلٌ يرجع `null`، والشاشةُ تعرض «—». صفرٌ محسوبٌ من قسمةٍ على
 * لا شيء **رقمٌ مخترع**، ورقمٌ مخترعٌ بمؤشّرِ أداءٍ يُقرأ قراراً: «تحويلي ٠؟
 * إذاً العلفُ ممتاز» — وهو لم يوزن طيراً بعد.
 * ==========================================================================*/
import type { PoultryDaily, PoultryCycle, PoultryCycleStats } from "@/types";

export interface PoultryKpi {
  /** متوسّطُ وزن الطير بالكيلو — من **آخر** يومٍ فيه عيّنة، لا من متوسّطها. */
  avgWeightKg: number | null;
  /** تاريخُ تلك العيّنة: رقمٌ عمرُه أسبوعان يُقرأ «اليوم» إن لم يُقل متى وُزن. */
  weighedOn: string | null;
  /** الوزنُ الحيُّ الكلّيّ = الحيُّ × متوسّطُ الوزن. */
  liveWeightKg: number | null;
  /** معدّلُ التحويل: كيلو علفٍ لكلّ كيلو لحمٍ حيّ. الأقلُّ أفضل. */
  fcr: number | null;
  /** نسبةُ البقاء (الحيُّ ÷ المُدخَل) مئويّاً. */
  viabilityPct: number;
  /** مؤشّرُ الكفاءة الأوروبيّ — الأعلى أفضل (٣٠٠+ جيّد). */
  epef: number | null;
  /** كلفةُ الكيلو الحيّ الآن: كلُّ ما صُرف ÷ الوزن الحيّ القائم. */
  costPerLiveKg: number | null;
  /** مجموعُ ما صُرف على الدفعة (صيصان + علف + دواء + خدمات). */
  totalCost: number;
}

/** حصيلةُ الدفعة بعد الإغلاق — الجوابُ الذي يُغلق الدفتر. */
export interface PoultryOutcome {
  soldWeightKg: number | null;
  saleTotal: number | null;
  /** كلفةُ الكيلو المباع فعلاً — تُقارن بسعر البيع مباشرةً. */
  costPerSoldKg: number | null;
  /** الربح = مبلغُ البيع − كلُّ الكلف. سالبٌ يُعرض سالباً. */
  profit: number | null;
  /** هامشُ الربح من مبلغ البيع، مئويّاً. */
  marginPct: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** قسمةٌ لا تكذب: مقامٌ صفرٌ أو غيرُ متناهٍ ⇒ «ما نعرف» لا صفر. */
const div = (a: number, b: number): number | null =>
  Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null;

/**
 * متوسّطُ وزن الطير من **آخر** يومٍ حُمل فيه ميزان.
 *
 * ولماذا الآخِر لا متوسّطُ الكلّ: الطيرُ ينمو، فمتوسّطُ وزنٍ عمرُه عشرةُ أيام
 * مع وزنِ اليوم يعطي رقماً لا يصف أيَّ لحظةٍ مرّت بالحقل — ومعدّلُ التحويل
 * المبنيُّ عليه يصير كذبةً مركّبة.
 */
export function latestSample(days: PoultryDaily[]): { avgWeightKg: number; on: string } | null {
  let best: { avgWeightKg: number; on: string } | null = null;
  for (const d of days) {
    const g = d.sample_weight_g ?? null;
    const n = d.sample_size ?? 1;
    if (g == null || !(g > 0) || !(n > 0)) continue;
    if (best && best.on >= d.on_date) continue;
    best = { avgWeightKg: g / n / 1000, on: d.on_date };
  }
  return best;
}

export function poultryKpi(stats: PoultryCycleStats | null, days: PoultryDaily[]): PoultryKpi {
  const totalCost = stats
    ? (stats.feed_cost ?? 0) + (stats.med_cost ?? 0) + (stats.other_cost ?? 0) + (stats.chick_cost ?? 0)
    : 0;
  const empty: PoultryKpi = {
    avgWeightKg: null, weighedOn: null, liveWeightKg: null, fcr: null,
    viabilityPct: 0, epef: null, costPerLiveKg: null, totalCost: r2(totalCost),
  };
  if (!stats) return empty;

  const viabilityPct = stats.placed_count > 0 ? (stats.alive / stats.placed_count) * 100 : 0;
  const s = latestSample(days);
  if (!s) return { ...empty, viabilityPct: r2(viabilityPct) };

  const liveWeightKg = stats.alive > 0 ? stats.alive * s.avgWeightKg : 0;
  /* معدّلُ التحويل بتعريف الحقل: العلفُ المستهلَك ÷ الوزنِ الحيِّ المُنتَج.
     ولا يُطرح وزنُ الصوص (~٤٢ غم) — المراجعُ الميدانية تتجاهله، وطرحُه يجعل
     رقمَنا لا يطابق ما يقوله جارُه بنفس الاسم. */
  const fcr = div(stats.feed_kg ?? 0, liveWeightKg);
  const epef = fcr && stats.days > 0 ? (viabilityPct * s.avgWeightKg) / (stats.days * fcr) * 100 : null;
  return {
    avgWeightKg: r2(s.avgWeightKg),
    weighedOn: s.on,
    liveWeightKg: liveWeightKg > 0 ? r2(liveWeightKg) : null,
    fcr: fcr ? r2(fcr) : null,
    viabilityPct: r2(viabilityPct),
    epef: epef ? Math.round(epef) : null,
    costPerLiveKg: (() => { const v = div(totalCost, liveWeightKg); return v === null ? null : r2(v); })(),
    totalCost: r2(totalCost),
  };
}

/**
 * حصيلةُ الدفعة المغلقة.
 *
 * الكلفةُ تُقسم على الوزن **المباع** لا الحيِّ المقدَّر: عند الإغلاق صار عندنا
 * رقمٌ موزونٌ حقيقيّ، والتقدير لا يُقدَّم على القياس.
 */
export function poultryOutcome(cycle: PoultryCycle, totalCost: number): PoultryOutcome {
  const kg = cycle.sold_weight_kg ?? null;
  const total = cycle.sale_total ?? null;
  const costPerSoldKg = kg != null ? div(totalCost, kg) : null;
  const profit = total != null ? total - totalCost : null;
  return {
    soldWeightKg: kg,
    saleTotal: total,
    costPerSoldKg: costPerSoldKg === null ? null : r2(costPerSoldKg),
    profit: profit === null ? null : r2(profit),
    // الهامشُ من مبلغ البيع: بيعٌ بصفرٍ لا هامشَ له — لا «−∞».
    marginPct: profit !== null && total != null && total > 0 ? r2((profit / total) * 100) : null,
  };
}
