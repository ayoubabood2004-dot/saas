// ============================================================================
// Plan entitlements — which FEATURES each subscription tier unlocks.
//
// This is the billing counterpart to RBAC (usePermissions / can()): RBAC gates
// by the staff member's ROLE, entitlements gate by the clinic's PAID PLAN. A
// feature is available only when BOTH allow it.
//
// Resolution by subscription status:
//   • trialing → EVERYTHING (a full-access free trial, so the clinic can try
//                every tier before choosing — the standard SaaS trial model).
//   • active   → exactly the subscribed plan's features.
//   • expired  → the plan's features but read-only (the repo write-guard blocks
//                mutations); they can still SEE what their tier included.
//   • locked   → nothing (the whole app is already hidden behind the gate).
//
// Keep the feature lists in sync with the plan cards in src/lib/plans.ts.
// ============================================================================
import i18next from "i18next";
import { useSubscription } from "./subscription";
import type { PlanId } from "./plans";

export type Feature =
  | "pos"           // الكاشير والبيع والفواتير
  | "reports"       // التقارير والإحصائيات
  | "reportsExport" // تصدير Excel وطباعة التقارير
  | "debt"          // البيع بالدين وسجل الديون
  | "whatsapp"      // حملات واتساب
  | "consent"       // نماذج الإقرار
  | "branding"      // مطبوعات بشعار العيادة
  | "finePerms"     // صلاحيات الموظفين الدقيقة
  | "payroll"       // رواتب الكادر والسلف والقطوعات
  | "store"         // المتجر الإلكتروني العام للعيادة
  | "farm";         // قسمُ حقول الدواجن

/** What each PAID plan unlocks. (basic = records/calendar/inventory only.)
 *
 *  و«حقل الدواجن» **ليس ترقيةً**: جمهورُه صاحبُ الحقل لا الطبيب، فقائمتُه
 *  ليست «كلَّ ما بالسوبر + الحقل» بل شيئاً آخرَ — قسمُ الحقول والمخزنُ
 *  والتقارير، بلا كاشيرٍ ولا متجرٍ ولا حملاتِ واتساب. ولذلك **لا باقةَ عيادةٍ
 *  تُدرج `farm`**: من عنده عيادةٌ وحقلٌ يشترك بالاثنتين، وهذا قرارُ المالك. */
const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  basic: [],
  advanced: ["pos", "reports", "payroll"],
  super: ["pos", "reports", "reportsExport", "debt", "whatsapp", "consent", "branding", "finePerms", "payroll", "store"],
  farm: ["farm", "reports", "reportsExport"],
};

/**
 * صنفُ الميزة من القاموس لا من الشِفرة.
 *
 * كانت أصنافاً عربيةً صلبةً هنا و`FeatureGate` يمرّرها بديلاً لـ`t()` — فمن
 * يفتح شاشةَ الترقية بالإنكليزية يقرأ عربياً. ونقلُها أنزل سقفَ النصّ الصلب
 * لهذا الملفّ إلى صفر. (و«payroll» كانت إنكليزيةً وحدَها بين عشرٍ عربية —
 * فصارت عربيةً بالعربيّ وإنكليزيةً بالإنكليزيّ كأخواتها.)
 */
export const featureLabel = (f: Feature): string =>
  i18next.t(`features.${f}`, { defaultValue: f }) as string;


/** True if a specific PAID plan includes a feature. */
export function planAllows(plan: PlanId | null | undefined, f: Feature): boolean {
  if (!plan) return false;
  return PLAN_FEATURES[plan]?.includes(f) ?? false;
}

/** The cheapest plan that includes a feature (for "متوفر في باقة …" prompts).
 *
 *  والحقلُ أوّلاً: لولاه لقالت الشاشةُ لصاحب حقلٍ «متوفّرٌ بباقة السوبر» وهي
 *  لا تحتويه — وترقيةٌ تُشترى ولا تفتح ما اشتُريت له أسوأُ من لا اقتراح. */
export function minPlanFor(f: Feature): PlanId {
  if (PLAN_FEATURES.farm.includes(f) && !PLAN_FEATURES.super.includes(f)) return "farm";
  if (PLAN_FEATURES.advanced.includes(f)) return "advanced";
  return "super";
}

/** Resolve an entitlement from the live subscription status + plan. */
export function hasFeature(status: string, plan: PlanId | null | undefined, f: Feature): boolean {
  if (status === "trialing") return true; // full-access free trial
  if (status === "locked") return false;  // app hidden anyway
  return planAllows(plan, f);             // active / expired → the plan's tier
}

/** Hook: `const { has } = useEntitlements()` → `has("pos")`. Re-renders with the subscription. */
export function useEntitlements() {
  const { status, sub } = useSubscription();
  return {
    plan: sub.plan,
    status,
    has: (f: Feature) => hasFeature(status, sub.plan, f),
  };
}
