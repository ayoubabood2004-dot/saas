import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
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
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLang(),
  // سلاسل السقوط من سجل اللغات: السورانية القادمة تسقط للعربية قبل
  // الإنجليزية — المفتاح الناقص يظهر بأقرب لغة مفهومة لا بأبعدها.
  fallbackLng: fallbackMap(),
  interpolation: { escapeValue: false },
});

/* خطّ الحرف العربي يُحمَّل عند الحاجة إليه لا قبلها.
 *
 * صار الافتراضُ عربياً، فالخطُّ يُطلب على كلّ مسارٍ عمليّاً — لكنّ الطلبَ يبقى
 * هنا لا بالمسار الحرج، ومقايضتُه مقبولةٌ لأنها ليست جديدة: كلُّ عيادةٍ اختارت
 * العربيةَ تمرّ بها اليوم (تُرسم بخطّ النظام أجزاءَ من الثانية ثم تتبدّل).
 * ومن يحمل `vp_lang="en"` لا يُحمَّل عنده شيء — وهذا ما يحفظه تأجيلُ الطلب.
 *
 * وبما أن كل اللغات عربية الحرف (العربية، السورانية) هي RTL بسجلّنا، فاتجاه
 * اللغة هو الفحص الصحيح — لا اسم اللغة. */
const ARABIC_FONT = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";
let arabicFontAsked = false;

function ensureScriptFont(lang: string) {
  if (arabicFontAsked || localeInfo(lang).dir !== "rtl") return;
  arabicFontAsked = true;
  try {
    // الصفحاتُ العامّة تطلبه بـindex.html مع أوّل رسمة — فلا يُطلب مرّتين.
    if (document.getElementById("ar-font")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    // غير حاجب كذلك: تبديل اللغة يجب ألّا يجمّد الشاشة بانتظار طرفٍ ثالث.
    l.media = "print";
    l.onload = () => { l.media = "all"; };
    l.href = ARABIC_FONT;
    document.head.appendChild(l);
  } catch { /* بلا DOM (اختبار/تصيير خادمي) — الاحتياط بالمكدّس يغطّي */ }
}

/** الاتجاه من سجل اللغات — لا شرط «ar» مثبّتاً بعد اليوم: أي لغة RTL
 *  جديدة (سورانية، فارسية، أردية) تنقلب الواجهة لها من سطرها بالسجل. */
export function applyDir(lang: string) {
  const info = localeInfo(lang);
  document.documentElement.lang = info.code;
  document.documentElement.dir = info.dir;
  ensureScriptFont(lang);
}

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

/* لغة مخزَّنة غير مدمجة بالحزمة (أي لغة بمحمّل كسول) لا يعرفها i18next عند
 * الإقلاع، فتُرسم الواجهة بالسقوط وتبقى كذلك حتى يبدّل المستخدم يدوياً.
 * نحمّل حزمتها فوراً بعد التهيئة ونعيد ضبط اللغة، فمن يفتح النظام وقد اختار
 * لغته سابقاً يراها من أول إطار — لا بعد نقرة. */
void (async () => {
  const info = localeInfo(initialLang());
  if (!info.loader || i18n.hasResourceBundle(info.code, "translation")) return;
  try {
    const mod = await info.loader();
    i18n.addResourceBundle(info.code, "translation", mod.default, true, true);
    await i18n.changeLanguage(info.code); // يعيد الرسم بالحزمة المحمّلة
  } catch {
    /* تعذّر تحميل اللغة (شبكة/ملف) — السقوط يغطي الواجهة بلا انهيار */
  }
})();

export default i18n;
