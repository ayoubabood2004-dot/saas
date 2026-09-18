// ============================================================================
// Subscription plans — the SINGLE source of truth shared by the marketing
// Landing page and the in-app subscription / billing system.
//
// Prices are defined in USD. The clinic is charged the equivalent amount in
// Iraqi Dinar (IQD) through Wayl, converted at a configurable rate (the Iraqi
// market rate drifts, so the owner can update it from the admin panel rather
// than it being locked to a hard-coded number). Annual = 12 × monthly for the
// lower tiers; السوبر annual is a flat $1000 (two months free).
// ============================================================================
import i18next from "i18next";

export type PlanId = "basic" | "advanced" | "super" | "farm";

/** لمن هذه الباقة. الحقلُ ليس ترقيةً للعيادة — هو جمهورٌ آخر. */
export type PlanAudience = "clinic" | "farm";
export type BillingPeriod = "monthly" | "annual";

export interface Plan {
  id: PlanId;
  /** غيابُها = عيادة (كلُّ ما سبق)، فلا تتغيّر باقةٌ قائمة. */
  audience?: PlanAudience;
  monthlyUsd: number;
  annualUsd: number;    // 12 × monthlyUsd
  popular?: boolean;
}

const annualUsdFor = (m: number) => m * 12; // annual = 12 × monthly (no discount)

export const PLANS: Plan[] = [
  {
    id: "basic",
    monthlyUsd: 30,
    annualUsd: annualUsdFor(30),
  },
  {
    id: "advanced",
    monthlyUsd: 55,
    annualUsd: annualUsdFor(55),
  },
  {
    id: "super",
    // الاشتراك الكامل: ١٠٠$ شهرياً، والسنوي ألف دولار صافية (شهران مجاناً) —
    // الباقة الوحيدة التي يكسر سنويّها قاعدة «١٢ × الشهري».
    monthlyUsd: 100,
    annualUsd: 1000,
    popular: true,
  },
  {
    /* ── باقةُ حقل الدواجن — قائمةٌ بذاتها لا ترقيةٌ لباقةِ عيادة ────────────
     * بقرار المالك: «باقة وحدها اسمها باقة حقل الدواجن، تفاصيلُ اشتراكها وما
     * بداخلها تختلف عن العيادة». فجمهورُها صاحبُ الحقل لا الطبيب، وما فيها
     * ليس «كلَّ ما بالمطورة + شيء» — بل شيءٌ آخر.
     *
     * والسعرُ هنا **افتراضٌ يُبدَّل من لوحة المشغّل بلا نشر** (`plan_prices`
     * تُحمَّل بالإقلاع وتغلب هذا الرقم) — لم يحدّده المالكُ بعد. */
    id: "farm",
    audience: "farm",
    monthlyUsd: 45,
    annualUsd: annualUsdFor(45),
  },
];

/** باقاتُ العيادة وحدَها — وهي ما تعرضه شبكةُ الأسعار بصفحة الهبوط والاشتراك.
 *  عرضُ باقةِ الحقل بينها يقول إنها «الأغلى» أو «الأكمل»، وهي ليست أيّاً منهما. */
export const CLINIC_PLANS: Plan[] = PLANS.filter((p) => (p.audience ?? "clinic") === "clinic");
export const FARM_PLANS: Plan[] = PLANS.filter((p) => p.audience === "farm");

/** هل هذه الباقةُ تفتح قسمَ الحقول؟ */
export const isFarmPlan = (id: string | null | undefined): boolean =>
  !!id && PLANS.some((p) => p.id === id && p.audience === "farm");

/** Default USD→IQD rate. Admin-editable so it can track the market (see settings). */
export const DEFAULT_USD_RATE = 1535;

/** Free trial length for a brand-new clinic (full access, no card required). */
export const TRIAL_DAYS = 14;

/**
 * نصُّ الباقة من القاموس لا من الشِفرة.
 *
 * كان الاسمُ والوصفُ والمزايا عربيةً صلبةً بهذا الملفّ، وLanding وحدَه يقرؤها
 * من `t()`. فمن يفتح شاشةَ الاشتراك أو لوحةَ الفوترة بالإنكليزية كان يرى
 * أسماءَ الباقات ومزاياها عربيةً — عطبٌ قائمٌ كشفه حارسُ i18n حين أضفنا
 * الباقةَ الرابعة. والنقلُ هنا أنزل سقفَ النصّ الصلب لهذا الملفّ إلى صفر.
 *
 * ولأنه يُنادى من دوالَّ لا مكوّنات، يقرأ من `i18next` مباشرةً لا من `useTranslation`.
 */
export interface PlanCopy { name: string; tag: string; feats: string[]; missing: string[] }
export function planCopy(id: PlanId): PlanCopy {
  const arr = (k: string): string[] => {
    const v = i18next.t(`plans.${id}.${k}`, { returnObjects: true, defaultValue: [] });
    return Array.isArray(v) ? (v as string[]) : [];
  };
  return {
    name: i18next.t(`plans.${id}.name`, { defaultValue: id }) as string,
    tag: i18next.t(`plans.${id}.tag`, { defaultValue: "" }) as string,
    feats: arr("feats"),
    missing: arr("missing"),
  };
}

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/* ---- تسعير حيّ (0104) ------------------------------------------------------
 * الأسعار أعلاه هي الافتراض، لكن المشغّل يعدّلها من لوحة المنصّة بلا نشر نسخة.
 * القيم الحيّة تُجلب مرة عند الإقلاع (plan_prices) وتُخزَّن هنا، فتبقى الدوال
 * أدناه متزامنة كما هي وتبقى كل مواضع الاستدعاء بلا تغيير. ------------------ */
type PriceOverride = { monthlyUsd: number; annualUsd: number };
const livePrices: Partial<Record<PlanId, PriceOverride>> = {};

/** يُستدعى بعد جلب plan_prices من الخادم. */
export function setLivePrices(rows: { plan: string; monthly_usd: number; annual_usd: number }[]) {
  for (const r of rows) {
    const id = r.plan as PlanId;
    if (!PLANS.some((p) => p.id === id)) continue;
    const m = Number(r.monthly_usd), a = Number(r.annual_usd);
    if (m > 0 && a > 0) livePrices[id] = { monthlyUsd: m, annualUsd: a };
  }
}

/** السعر المعروض لباقة: الحيّ إن وُجد، وإلا الافتراضي بالكود. */
export function planPrice(plan: Plan): PriceOverride {
  return livePrices[plan.id] ?? { monthlyUsd: plan.monthlyUsd, annualUsd: plan.annualUsd };
}

/** The USD price for a plan on the chosen billing period. */
export function priceUsd(plan: Plan, period: BillingPeriod): number {
  const p = planPrice(plan);
  return period === "annual" ? p.annualUsd : p.monthlyUsd;
}

/** Convert a USD price to a whole-dinar amount (Wayl requires IQD ≥ 1000). */
export function usdToIqd(usd: number, rate: number = DEFAULT_USD_RATE): number {
  return Math.round(usd * rate);
}

/** Months added to the subscription for a billing period. */
export function periodMonths(period: BillingPeriod): number {
  return period === "annual" ? 12 : 1;
}
