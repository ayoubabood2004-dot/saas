// ============================================================================
// Subscription plans — the SINGLE source of truth shared by the marketing
// Landing page and the in-app subscription / billing system.
//
// Prices are defined in USD. The clinic is charged the equivalent amount in
// Iraqi Dinar (IQD) through Wayl, converted at a configurable rate (the Iraqi
// market rate drifts, so the owner can update it from the admin panel rather
// than it being locked to a hard-coded number). Annual = 12 × monthly (no
// discount — the "two months free" promo was intentionally removed).
// ============================================================================

export type PlanId = "basic" | "advanced" | "super";
export type BillingPeriod = "monthly" | "annual";

export interface Plan {
  id: PlanId;
  name: string;         // Arabic display name
  tag: string;          // one-line positioning
  monthlyUsd: number;
  annualUsd: number;    // 12 × monthlyUsd
  popular?: boolean;
  feats: string[];      // included features
  missing: string[];    // features NOT in this tier (shown struck-through)
}

const monthly = (m: number) => m * 12; // annual price helper (no discount)

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "العادية",
    tag: "سجّل عيادتك — للعيادات الصغيرة",
    monthlyUsd: 30,
    annualUsd: monthly(30),
    feats: [
      "سجلات الحيوانات والملف الطبي الكامل",
      "التقويم الأساسي والتذكيرات",
      "المخزن — تسجيل المنتجات والكميات",
      "مساحة وسائط 5GB",
      "مستخدمان",
    ],
    missing: ["الكاشير والبيع والفواتير", "التقارير", "حملات واتساب"],
  },
  {
    id: "advanced",
    name: "المطورة",
    tag: "عيادتك بدت تبيع — للعيادات المتوسطة",
    monthlyUsd: 55,
    annualUsd: monthly(55),
    feats: [
      "كل ما في العادية",
      "الكاشير الكامل + فواتير A4 وحراري",
      "البيع الجزئي (حبة / شريط / مل)",
      "تقارير أساسية: اليوم والأسبوع والشهر",
      "مساحة وسائط 25GB",
      "4 مستخدمين",
    ],
    missing: ["البيع بالدين وسجل الديون", "تصدير Excel وطباعة التقارير", "حملات واتساب"],
  },
  {
    id: "super",
    name: "السوبر",
    tag: "كل شيء — للعيادة المتكاملة",
    monthlyUsd: 78,
    annualUsd: monthly(78),
    popular: true,
    feats: [
      "كل ما في المطورة",
      "البيع بالدين + سجل الديون + الدفع الجزئي",
      "التقارير والإحصائيات كاملة + Excel وطباعة",
      "حملات واتساب والتذكيرات الآلية",
      "نماذج الإقرار + مطبوعات بشعار عيادتك",
      "صلاحيات الموظفين الدقيقة",
      "مساحة وسائط 100GB",
      "10 مستخدمين + دعم أولوية وتدريب",
    ],
    missing: [],
  },
];

/** Default USD→IQD rate. Admin-editable so it can track the market (see settings). */
export const DEFAULT_USD_RATE = 1535;

/** Free trial length for a brand-new clinic (full access, no card required). */
export const TRIAL_DAYS = 14;

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** The USD price for a plan on the chosen billing period. */
export function priceUsd(plan: Plan, period: BillingPeriod): number {
  return period === "annual" ? plan.annualUsd : plan.monthlyUsd;
}

/** Convert a USD price to a whole-dinar amount (Wayl requires IQD ≥ 1000). */
export function usdToIqd(usd: number, rate: number = DEFAULT_USD_RATE): number {
  return Math.round(usd * rate);
}

/** Months added to the subscription for a billing period. */
export function periodMonths(period: BillingPeriod): number {
  return period === "annual" ? 12 : 1;
}
