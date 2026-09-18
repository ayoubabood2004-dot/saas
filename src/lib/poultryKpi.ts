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
import type { PoultryDaily, PoultryCycle, PoultryCycleStats, PoultryUse } from "@/types";

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


/* ============================================================================
 * طيُّ الدفتر بالأسابيع — الحسابُ هنا لا داخل الشاشة.
 *
 * صار الملخّصُ الأسبوعيُّ هو الطريقَ الأوّلَ الذي يقرأ به صاحبُ الحقل تاريخَ
 * دفعته، فخطأٌ بالتجميع لا يظهر مكسوراً — يظهر رقماً معقولاً وخاطئاً. وإخراجُه
 * من `useMemo` بالمكوّن يجعله مفحوصاً بجدول حقيقة، كـ`pockets` و`poultryKpi`.
 * ==========================================================================*/

/** فرقُ الأيام بين تاريخَين نصّيَّين — يُقرآن **ظهراً** فلا تقضم ساعةُ التوقيت
 *  الصيفيّ يوماً من الفرق، ولا ينزلق التاريخُ بمناطقَ غربَ غرينتش. */
export const dayDiff = (from: string, to: string): number =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

export interface BatchDay {
  date: string;
  day?: PoultryDaily;
  uses: PoultryUse[];
}

export interface BatchWeek {
  /** رقمُ الأسبوع من يوم وضع الدجاج — الأوّلُ واحد لا صفر. */
  week: number;
  /** مدى أيام الدورة الذي يغطّيه (٠–٦، ٧–١٣ …). */
  from: number;
  to: number;
  dead: number;
  culled: number;
  feedKg: number;
  cost: number;
  /** متوسّطُ وزن الطير من **آخر** عيّنةٍ بالأسبوع — `null` إن لم يُوزن فيه. */
  weightKg: number | null;
  /** كم يوماً من هذا الأسبوع **سُجِّل عدّه** فعلاً (صفٌّ بـ`poultry_daily`). */
  daysEntered: number;
  /** وكم يوماً منه **مضى** أصلاً — الأسبوعُ الجاري ناقصٌ بطبعه. */
  daysElapsed: number;
  /** أيامُ الأسبوع من الأحدث للأقدم. */
  rows: BatchDay[];
}

/**
 * يجمع أيامَ الدفعة وسطورَ صرفها بأسابيعَ من تاريخ وضع الدجاج.
 *
 * وثلاثةُ قراراتٍ تستحقّ الذكر:
 *   • **يومٌ قبل تاريخ الوضع** (إدخالٌ بتاريخٍ خاطئ) يُنسب للأسبوع الأوّل لا
 *     لأسبوعٍ سالب: بندُ الخطأ يبقى مرئياً ليُصحَّح، ولا يختفي بمجموعةٍ لا
 *     تُعرض. ولا يُحذف — حذفُ صفٍّ كتبه المستخدم أسوأُ من عرضه بمكانٍ مقارب.
 *   • **الوزنُ آخرُ عيّنةٍ بالأسبوع** لا متوسّطُ عيّناته: الطيرُ ينمو، ومتوسّطُ
 *     وزنَين بينهما خمسةُ أيامٍ لا يصف أيَّ لحظة.
 *   • **الكلفةُ كلُّ سطورِ الصرف** (علفٌ ودواءٌ وخدمة)، والعلفُ بالكيلو وحدَه —
 *     جمعُ كيلواتِ العلف مع علبِ الدواء رقمٌ لا معنى له.
 */
export function batchWeeks(days: PoultryDaily[], uses: PoultryUse[], placedOn: string, through?: string): BatchWeek[] {
  const byDate = new Map<string, BatchDay>();
  for (const d of days) byDate.set(d.on_date, { date: d.on_date, day: d, uses: [] });
  for (const u of uses) {
    const e = byDate.get(u.on_date) ?? { date: u.on_date, uses: [] };
    e.uses.push(u);
    byDate.set(u.on_date, e);
  }

  const weighedOn = new Map<number, string>();
  const m = new Map<number, BatchWeek>();
  for (const e of byDate.values()) {
    const n = Math.max(0, dayDiff(placedOn, e.date));
    const wk = Math.floor(n / 7) + 1;
    const w = m.get(wk) ?? { week: wk, from: (wk - 1) * 7, to: wk * 7 - 1, dead: 0, culled: 0, feedKg: 0, cost: 0, weightKg: null, daysEntered: 0, daysElapsed: 0, rows: [] };
    if (e.day) { w.dead += e.day.dead ?? 0; w.culled += e.day.culled ?? 0; w.daysEntered += 1; }
    for (const u of e.uses) {
      if (u.kind === "feed") w.feedKg += u.qty;
      w.cost += u.line_cost;
    }
    const g = e.day?.sample_weight_g ?? null;
    const k = e.day?.sample_size ?? 1;
    if (g != null && g > 0 && k > 0) {
      const prev = weighedOn.get(wk);
      // آخرُ عيّنةٍ بالتاريخ لا آخرُ صفٍّ بالمرور: ترتيبُ المرور ترتيبُ الجلب.
      if (prev === undefined || e.date >= prev) { w.weightKg = g / k / 1000; weighedOn.set(wk, e.date); }
    }
    w.rows.push(e);
    m.set(wk, w);
  }
  /* **الأيامُ التي مضت** من كلّ أسبوع. بدونها لا يُعرف هل المجموعُ كاملٌ أم
     نصفُ عدٍّ — و«💀 ٠» عن أسبوعٍ لم يعدّه أحدٌ تُقرأ «ما نفق شيء»، وهي أخطرُ
     جملةٍ يقولها دفتر. */
  const lastDay = through ? Math.max(0, dayDiff(placedOn, through)) : Infinity;
  for (const w of m.values()) {
    w.rows.sort((a, b) => b.date.localeCompare(a.date));
    w.daysElapsed = Math.max(0, Math.min(7, lastDay - w.from + 1));
  }
  return [...m.values()].sort((a, b) => b.week - a.week);
}
