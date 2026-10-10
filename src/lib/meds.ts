import { catalogTypeOf } from "./medCatalog";

/* ============================================================================
 * عرضُ الدواء للمالك — ما بقي من `meds.ts` بعد «أدويتي» (0229).
 *
 * كان هنا مُرطِّبُ «أدوية العيادة» (clinic_meds): مرآةٌ بالجهاز، وبذرةٌ ترفع ما بالجهاز إن
 * كان الجدولُ فارغاً، وكتابةٌ تُرسل مرّةً وتُنسى، وحذفٌ بـilike — وكان `clinicConfig` يستورده
 * لأثره فيُحزَم الكتالوجُ كلُّه مع الإقلاع. القائمةُ صارت «أدويتي» بجدولها وبابها (0229)،
 * والكتالوجُ بياناتٌ كسولة بـ`medCatalog.ts`. يبقى هنا ما تقرؤه شاشاتُ السجلّ وحدها.
 * ==========================================================================*/

/** صنفُ الدواء العلاجيّ كما بالكتالوج — وما ليس فيه «Other». */
export function medType(name: string): string {
  return catalogTypeOf(name) ?? "Other";
}

/**
 * What a viewer sees for a medication.
 * Clinic staff always see the exact medication. Clients (owners) see the prescribed name for
 * 7 days, after which only the therapeutic class is shown.
 */
export function medicationDisplay(name: string, prescribedISO: string, isOwner: boolean): string {
  if (!isOwner) return name;
  const days = (Date.now() - new Date(prescribedISO).getTime()) / 86400000;
  if (days <= 7) return name;
  return medType(name);
}
