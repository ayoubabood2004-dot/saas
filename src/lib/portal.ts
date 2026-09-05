// ============================================================================
// بوّابة المالك — طرفُ المتصفّح (0158)
//
// الرمزُ المُسلَّم من `portal_verify_code` يُحفظ **لكل عيادةٍ على حدة**: مالكٌ
// يتعامل مع عيادتين يفتح رابطيهما بلا أن تطرد إحداهما جلسةَ الأخرى. ومفتاحُ
// الحفظ يحمل الرابط (slug) لهذا السبب بالضبط.
//
// وهو محفوظٌ بالمتصفّح لا بالكوكيز عمداً: البوّابةُ لا تمشي على مصادقة
// Supabase أصلاً (لا مزوّدَ رسائل بعد)، والرمزُ مفتاحٌ مبهم كرمز الرحلة —
// من يملكه يرى، ولذلك عمرُه محدود ويُبطَل من عند العيادة.
// ============================================================================
import i18n from "i18next";
import { applyDir } from "@/i18n";

const KEY = (slug: string) => `vp_portal_tok_${slug}`;

export function getPortalToken(slug: string): string | null {
  try { return localStorage.getItem(KEY(slug)); } catch { return null; }
}
export function setPortalToken(slug: string, token: string): void {
  try { localStorage.setItem(KEY(slug), token); } catch { /* تجاهل */ }
}
export function clearPortalToken(slug: string): void {
  try { localStorage.removeItem(KEY(slug)); } catch { /* تجاهل */ }
}

/* ---------------------------------------------------------------------------
 * لغةُ الزائر: من يفتح رابطَ عيادةٍ عراقية ولا تفضيلَ لغةٍ محفوظاً عنده يستحقّ
 * العربية. `initialLang()` ترجع الإنجليزية حين لا يوجد `vp_lang` — وهذا صحيحٌ
 * لصفحة الهبوط العالمية وخاطئٌ تماماً هنا: المراجعُ ليس زائرَ موقعٍ تسويقيّ.
 *
 * ولا نكتب `vp_lang`: من اختار الإنجليزية صراحةً يبقى عليها، ومن لم يختر لا
 * نقرّر عنه قراراً دائماً من صفحةٍ عابرة. ولهذا لا نستعمل `setLang` — هي
 * تحفظ التفضيل.
 *
 * و`applyDir` لازمةٌ مع التبديل لا بعده: `changeLanguage` وحدها تبدّل النصوص
 * ولا تلمس `<html lang>` ولا `dir`، ولا تطلب خطّ الحرف العربي — فيبقى المستند
 * معلَناً إنكليزياً (قارئُ الشاشة ينطق العربية نطقاً إنكليزياً) والنصُّ يُرسم
 * بخطٍّ احتياطي. الصفحتان العامّتان تفرضان `dir="rtl"` على حاوياتهما فالشكل
 * يبدو سليماً — وهذا بالضبط ما يجعل العطل يمرّ بلا أن يُرى.
 * ------------------------------------------------------------------------- */
export function preferArabicForVisitor(): void {
  try {
    if (localStorage.getItem("vp_lang")) return;
  } catch { /* تخزينٌ محجوب — نكمل ونعرّب */ }
  if (i18n.language !== "ar") void i18n.changeLanguage("ar");
  applyDir("ar");
}

/* ---------------------------------------------------------------------------
 * صياغاتٌ صغيرة تخصّ البوّابة
 * ------------------------------------------------------------------------- */

/** رمزُ النوع — نفس رموز شاشات العيادة حتى لا يختلف الحيوانُ بين الشاشتين. */
export const SPECIES_EMOJI: Record<string, string> = {
  dog: "🐶", cat: "🐱", horse: "🐴", cow: "🐄", bird: "🦜", rabbit: "🐰", other: "🐾",
};
export const speciesEmoji = (s?: string | null): string =>
  SPECIES_EMOJI[(s ?? "other").toLowerCase()] ?? "🐾";

/** فرقُ الأيام بين اليوم وتاريخٍ — موجبٌ للقادم، سالبٌ للفائت. */
export function daysFromToday(dateISO?: string | null): number | null {
  if (!dateISO) return null;
  const d = new Date(dateISO + (dateISO.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** حالةُ اللقاح للعرض: متأخّر / اليوم / قريب / بعيد. */
export type VaxUrgency = "overdue" | "today" | "soon" | "later";
export function vaxUrgency(dueISO?: string | null): VaxUrgency | null {
  const d = daysFromToday(dueISO);
  if (d === null) return null;
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 30) return "soon";
  return "later";
}

/** الرقمُ العراقي بصيغةٍ صالحة للإرسال: ٧–١٥ خانة بعد التطبيع. */
export function looksLikePhone(raw: string): boolean {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}
