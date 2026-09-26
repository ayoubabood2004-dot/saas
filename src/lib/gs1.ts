import { normalizeCode } from "@/lib/utils";

/* ============================================================================
 * صيغةُ المسحة — م٣ (docs/inventory-vnext-plan.md): **قياسٌ قبل الميزة**.
 *
 * علبُ الأدوية الحديثة تحمل DataMatrix بصيغة GS1: GTIN وتاريخُ الانتهاء ورقمُ
 * الوجبة بمسحةٍ واحدة — (01)GTIN(17)YYMMDD(10)LOT. لو كانت ماسحاتُ العيادات
 * تقرؤها، فمسحةُ الاستلام تعبّي الانتهاءَ وحدَها. لكنّ «لو» هنا ثلاثةُ مجاهيل:
 * هل الماسحُ ثنائيُّ الأبعاد أصلاً؟ هل يرسل رأسَ AIM (`]d2`)؟ هل يصل فاصلُ
 * FNC1 (محرف GS) أم يبلعه الكيبورد؟ فهذه الوحدةُ **تصنّف فقط** — لا تفكّ ولا
 * تغيّر المسحة — وعدّادٌ صامت يقول بعد أسبوع أيَّها يصل فعلاً.
 *
 * نقيّةٌ عمداً، ومفحوصةٌ بـ`scripts/gs1-test.mjs`.
 * ========================================================================= */

export type ScanShape =
  | "gs1_aim"     // رأسُ AIM لرمزٍ من عائلة GS1: ]d2 (DataMatrix) ]C1 (GS1-128) ]Q3 (QR) ]e0 (DataBar)
  | "gs1_sep"     // فيه محرفُ GS (FNC1) — الفاصلُ وصل
  | "gs1_ai"      // يبدأ بـ(01)+١٤ رقماً وبعدها معرّفاتٌ أخرى — GS1 بلا رأسٍ ولا فاصل
  | "gtin14" | "ean13" | "upca" | "ean8"
  | "digits"      // أرقامٌ بطولٍ آخر (رقمُ رفٍّ يدويّ غالباً)
  | "alnum";      // حروفٌ وأرقام (Code128/Code39)

const GS = "\u001d";
const AIM_GS1 = /^\](d2|C1|Q3|e0)/;
const AIM_ANY = /^\][A-Za-z][0-9]/;

/**
 * صيغةُ مسحةٍ كما وصلت، أو `null` إن لم تكن رمزاً (اسمٌ مكتوب، كلامٌ بمسافات،
 * عربيّ، أو أقصرُ من ٤) — فالبحثُ بالاسم بصندوق المسح لا يُعدّ مسحة.
 */
export function scanShape(raw: string | null | undefined): ScanShape | null {
  const s = String(raw ?? "").replace(/[\r\n]+$/g, "");
  if (AIM_GS1.test(s)) return "gs1_aim";
  if (s.includes(GS)) return "gs1_sep";
  const body = normalizeCode(AIM_ANY.test(s) ? s.slice(3) : s);
  // الحروفُ العربية تُفحص **بعد** تطبيع الأرقام: ٦٢٨٥… مسحةٌ بكيبوردٍ عربيّ لا اسم.
  if (body.length < 4 || /\s/.test(s.trim()) || /[\u0600-\u06FF]/.test(body)) return null;
  if (/^01\d{14}\d{2,}/.test(body) && body.length >= 20) return "gs1_ai";
  if (/^\d+$/.test(body)) {
    if (body.length === 14) return "gtin14";
    if (body.length === 13) return "ean13";
    if (body.length === 12) return "upca";
    if (body.length === 8) return "ean8";
    return "digits";
  }
  return /^[0-9A-Za-z_.\-/+]+$/.test(body) ? "alnum" : null;
}

export const isGs1Shape = (s: ScanShape | null): boolean => s === "gs1_aim" || s === "gs1_sep" || s === "gs1_ai";

/** عيّنةٌ تُحفظ كما وصلت، والمحارفُ الخفيّة ظاهرةً — القياسُ يريد الشكلَ لا المعنى. */
export const sampleOf = (raw: string): string =>
  String(raw).slice(0, 80).replace(/\u001d/g, "<GS>").replace(/[\u0000-\u001f]/g, (c) => `<${c.charCodeAt(0)}>`);
