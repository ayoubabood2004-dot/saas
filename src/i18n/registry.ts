/* ============================================================================
 * سجل اللغات — المرحلة ١ من خطة العالمية (دراسة «doctorVet بلغات العالم» §٣).
 *
 * الحقيقة الواحدة عن كل لغة يعرفها النظام: اتجاهها، اسمها بلغتها، سلسلة
 * سقوطها، ومحمّلها الكسول. إضافة لغة جديدة للمخزن = سطر واحد هنا + ملف
 * ترجمة مكتمل المراجعة — لا شرط لغة مبعثر بالكود بعد اليوم.
 *
 * سياسة الأرقام: كل الأرقام بالنظام غربية (0-9) عبر en-US عمداً — الفواتير
 * والباركود والجرعات لا تتحمل التباس أرقام. حقل numberLocale موجود لليوم
 * الذي نقرر فيه خلاف ذلك للغة بعينها، لكن تغييره قرار واعٍ لا افتراض.
 * ==========================================================================*/

export interface LocaleInfo {
  code: string;
  /** اسم اللغة بلغتها — هكذا تُعرض بقائمة الاختيار دائماً. */
  native: string;
  dir: "rtl" | "ltr";
  /** سلسلة السقوط قبل الإنجليزية: السورانية ← العربية ← الإنجليزية مثلاً. */
  fallback: string[];
  /** محلّية Intl للأرقام — en-US للجميع حالياً (أرقام غربية دائماً). */
  numberLocale: string;
  /** محمّل كسول لملف الترجمة — اللغتان المدمجتان بالحزمة بلا محمّل. */
  loader?: () => Promise<{ default: Record<string, unknown> }>;
}

export const LOCALES: Record<string, LocaleInfo> = {
  en: { code: "en", native: "English", dir: "ltr", fallback: [], numberLocale: "en-US" },
  ar: { code: "ar", native: "العربية", dir: "rtl", fallback: [], numberLocale: "en-US" },
  /* اللغات القادمة تُفتح سطراً سطراً حين تكتمل مراجعتها البشرية — مثال:
   * ckb: { code: "ckb", native: "کوردیی ناوەندی", dir: "rtl", fallback: ["ar"],
   *        numberLocale: "en-US", loader: () => import("./ckb.json") },       */
};

export const localeInfo = (code: string): LocaleInfo => LOCALES[code] ?? LOCALES.en;

/** سلاسل السقوط بصيغة i18next — تُبنى من السجل فلا تفترق عنه أبداً. */
export function fallbackMap(): Record<string, string[]> {
  const m: Record<string, string[]> = { default: ["en"] };
  for (const l of Object.values(LOCALES)) if (l.fallback.length) m[l.code] = [...l.fallback, "en"];
  return m;
}
