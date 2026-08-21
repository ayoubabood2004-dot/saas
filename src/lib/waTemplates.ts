/* ============================================================================
 * نسخ رسائل الواتساب — عشر صياغات لكل رسالة.
 *
 * لماذا: الإرسال الجماعي بنصٍّ واحد متطابق هو أوضح بصمة تلتقطها فلاتر
 * السبام عند واتساب. عشر صياغات تُنتقى شبه عشوائياً تجعل رسائل العيادة
 * تبدو كما هي فعلاً: رسائل بشرية متفاوتة، لا دفعة آلية — فتقلّ فرصة الحظر.
 *
 * أين النصوص: في ملفات اللغة تحت "waMsgs" (عربي وإنجليزي معاً) — فتُترجم
 * كأي نص، ويحرسها فاحص تكافؤ المفاتيح.
 *
 * الانتقاء «شبه العشوائي» مقصود أن يكون **ثابتاً لنفس البذرة**: نفس التذكير
 * بنفس اليوم يعطي نفس النسخة، فلا تتبدل الرسالة أمام عين الدكتور بين فتحٍ
 * وإغلاق — وزرّ «نسخة أخرى» هو من يبدّلها بإرادته.
 * ==========================================================================*/
import i18n from "@/i18n";

/** رسائل التذكيرات (بتفصيلٍ وتاريخ) ورسائل الحملات (عامة بلا تاريخ). */
export type WaPool =
  | "rem.vaccine" | "rem.deworming" | "rem.surgery" | "rem.appointment" | "rem.manual" | "rem.birthday"
  | "camp.birthday" | "camp.vaccine" | "camp.deworming" | "camp.offer";

/** الرموز داخل النصوص — نفسها التي تعرفها شاشة الحملات وتعرضها للتحرير. */
export const WA_TOKENS = {
  owner: "{{اسم_المالك}}",
  pet: "{{اسم_الحيوان}}",
  clinic: "{{اسم_العيادة}}",
  detail: "{{التفصيل}}",
  date: "{{التاريخ}}",
  time: "{{الوقت}}",
} as const;

/** كل نسخ رسالةٍ ما بلغة الواجهة الحالية. */
export function waVariants(pool: WaPool): string[] {
  const v = i18n.t(`waMsgs.${pool}`, { returnObjects: true }) as unknown;
  return Array.isArray(v) ? (v as string[]) : [];
}

/** FNV-1a — بذرة نصية ← فهرس ثابت. لا يحتاج عشوائية حقيقية، يحتاج ثباتاً. */
export function pickVariantIndex(seed: string, count: number): number {
  if (count <= 0) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % count;
}

export interface WaParams {
  owner?: string;
  pet?: string;
  clinic?: string;
  detail?: string;
  date?: string;
  /** يُمرَّر جاهزاً بصيغة « الساعة ٥:٣٠» — والقالب يضعه ملاصقاً للتاريخ. */
  time?: string;
}

/** يصبّ القيم مكان الرموز. رمزٌ بلا قيمة يُحذف بهدوء ولا يُترك بالرسالة. */
export function renderWaTemplate(tpl: string, p: WaParams): string {
  return tpl
    .split(WA_TOKENS.owner).join(p.owner ?? "")
    .split(WA_TOKENS.pet).join(p.pet ?? "")
    .split(WA_TOKENS.clinic).join(p.clinic ?? "")
    .split(WA_TOKENS.detail).join(p.detail ?? "")
    .split(WA_TOKENS.date).join(p.date ?? "")
    .split(WA_TOKENS.time).join(p.time ?? "")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
