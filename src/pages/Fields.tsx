/* ============================================================================
 * «حقول الدواجن» — مسارٌ واحد (/poultry) وخانةٌ واحدة بالقائمة لشاشتين:
 *   • باقةُ الحقل (صاحبُ الحقل لحقله): دفترُه القديم `PoultryFarms` كما كان، خلف بوّابة الباقة.
 *   • العيادات (وكلُّ تجربة): «حالة الحقل» (0265) — الطبيبُ يتابع وجباتِ حقول زبائنه.
 * وكانت الخانةُ تُظهر الدفترَ القديم لكلّ عيادةٍ بالتجربة (التجربةُ تفتح كلَّ ميزة)، وظهورُ الاثنين
 * جنب بعض يربك — فقرارُ المالك (docs/field-cases-plan.md §٣-٧): الدفترُ لباقة الحقل وحدها.
 * والقسمةُ هنا لا بـApp.tsx: سطرٌ بحزمة الإقلاع بدل سطرين (فسحتُها بايتات)، والشاشتان كسولتان.
 * ========================================================================= */
import { FeatureGate } from "@/components/FeatureGate";
import { useEntitlements } from "@/lib/entitlements";
import { page } from "@/lib/lazyPage";

const PoultryFarms = page(() => import("@/pages/PoultryFarms").then((m) => ({ default: m.PoultryFarms })), ["farm"]);
const FlockCases = page(() => import("@/pages/FlockCases").then((m) => ({ default: m.FlockCases })), ["flk"]);

export function Fields() {
  const { plan } = useEntitlements();
  return plan === "farm" ? <FeatureGate feature="farm"><PoultryFarms /></FeatureGate> : <FlockCases />;
}
