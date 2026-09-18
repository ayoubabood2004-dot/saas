import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./ar.json";
import { LOCALES, localeInfo, fallbackMap } from "./registry";

export const LANGS = ["en", "ar"] as const;
export type Lang = (typeof LANGS)[number];
export { LOCALES, localeInfo } from "./registry";

/* الافتراضُ عربيّ — ومن اختار غيرَه يبقى على اختياره.
 *
 * المقيس: ٣٣ من ٤٩ تسجيلاً ماتت بصفر منتجٍ وصفر فاتورة، وأسماءُ العيادات
 * الأربع الحيّة عربيةٌ خالصةٌ بلا حرفٍ لاتينيٍّ واحد. لا يُدّعى أن اللغةَ
 * وحدَها سببُ الموت — يُدّعى أن أوّلَ شاشةٍ لعيادةٍ عراقيةٍ لا يجوز أن تكون
 * بلغةٍ لا تقرأها، وأن جعلَ العربية «خياراً ثانياً» قرارٌ لم يقرّره أحد:
 * كان أثراً جانبياً لصفحة هبوطٍ عالمية.
 *
 * وتبقى **قراءةً خالصة**: لا `setItem` هنا بأيّ ذريعة. تثبيتُ الافتراض
 * بالتخزين يزوّر تفضيلاً باسم مستخدمٍ لم يختر، ويجعل الرجوعَ عنه مستحيلاً
 * على كلّ جهازٍ أقلع مرّة. */
function initialLang(): Lang {
  try {
    const stored = localStorage.getItem("vp_lang");
    if (stored && stored in LOCALES) return stored as Lang;
  } catch {
    /* ignore */
  }
  return "ar";
}

void i18n.use(initReactI18next).init({
  // العربيةُ وحدَها بالحزمة؛ البقيةُ تُحمَّل بمحمّلها (انظر `registry.ts`).
  resources: { ar: { translation: ar } },
  lng: initialLang(),
  // سلاسل السقوط من سجل اللغات: السورانية القادمة تسقط للعربية قبل
  // الإنجليزية — المفتاح الناقص يظهر بأقرب لغة مفهومة لا بأبعدها.
  fallbackLng: fallbackMap(),
  interpolation: { escapeValue: false },
});

export { applyDir } from "./dir";
import { applyDir } from "./dir";

export function setLang(lang: Lang) {
  void (async () => {
    const info = localeInfo(lang);
    // لغات المخزن غير المدمجة تُحمَّل كسولاً أول مرة تُختار — مستخدم
    // الإسبانية لا يدفع كلفة تنزيل بقية اللغات أبداً.
    if (info.loader && !i18n.hasResourceBundle(info.code, "translation")) {
      const mod = await info.loader();
      i18n.addResourceBundle(info.code, "translation", mod.default, true, true);
    }
    await i18n.changeLanguage(info.code);
  })();
  try {
    localStorage.setItem("vp_lang", lang);
  } catch {
    /* ignore */
  }
  applyDir(lang);
}

applyDir(initialLang());

/**
 * جاهزيّةُ اللغة — **يُنتظر قبل أوّل رسم** (`main.tsx`).
 *
 * لغةٌ بمحمّلٍ كسول لا يعرفها i18next عند الإقلاع. وكان الحلُّ سابقاً: ارسمْ
 * بالسقوط ثم بدّل حين تصل — فيرى مستخدمُ السورانية عربيةً لجزءٍ من ثانيةٍ ثم
 * تنقلب الشاشةُ تحت عينه. ومع صيرورة الإنكليزية كسولةً صار ذلك الوميضُ يصيب
 * جمهوراً حقيقياً، فلا يُحتمل.
 *
 * فصارت وعداً يُنتظر: من لغتُه عربيةٌ (الافتراض) يُحلّ فوراً ولا ينتظر شيئاً،
 * ومن لغتُه غيرُها يتأخّر أوّلُ رسمه بقدر حزمتها — ثم يراها صحيحةً من أوّل
 * إطار. وفشلُ التحميل **لا يعلّق الإقلاع**: يُحلّ الوعدُ على أيّة حال
 * والسقوطُ يغطّي الواجهة.
 */
export const i18nReady: Promise<void> = (async () => {
  const info = localeInfo(initialLang());
  if (!info.loader || i18n.hasResourceBundle(info.code, "translation")) return;
  try {
    const mod = await info.loader();
    i18n.addResourceBundle(info.code, "translation", mod.default, true, true);
    await i18n.changeLanguage(info.code);
  } catch {
    /* تعذّر تحميل اللغة (شبكة/ملف) — السقوط يغطي الواجهة بلا انهيار */
  }
})();

export default i18n;
