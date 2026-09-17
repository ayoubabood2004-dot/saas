/* ============================================================================
 * الاتجاهُ وخطُّ الحرف — وحدةٌ بلا قاموس.
 *
 * كانتا داخل `src/i18n/index.ts`، وهي تستورد `ar.json` و`en.json` (١٣٧ كيلو
 * مضغوطة). و`portal.ts` تنادي `applyDir` وحدَها — فكلُّ صفحةِ زائرٍ كانت
 * تسحب القاموسَين كاملَين لتضبط `dir="rtl"`. الفصلُ هنا يقطع الخيط، و`index.ts`
 * تعيد تصديرَهما فلا مستدعيَ واحدٌ تغيّر.
 * ==========================================================================*/
import { localeInfo } from "./registry";

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

