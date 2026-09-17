/* ============================================================================
 * تهيئةُ الترجمة لمدخل الزائر — عربيةٌ وحدَها، وستّةُ أقسامٍ لا خمسةٌ وتسعون.
 *
 * صفحةُ الزائر عربيّةٌ صلبةٌ عمداً (`preferArabicForVisitor`)، فحملُ الإنكليزية
 * معها حملُ ٦٤ كيلو مضغوطة لا يقرؤها أحد. والقاموسُ مولَّدٌ من `ar.json` نفسِه
 * بـ`scripts/store-i18n.mjs`، وحارسُ البناء يفشّل إن بارَ عن أصله.
 *
 * ولا `fallbackLng` إلى الإنكليزية: مفتاحٌ ناقصٌ يسقط إلى نصّه الافتراضيّ
 * المكتوب بالنداء — وهو عربيٌّ بكلّ صفحات الزائر.
 * ==========================================================================*/
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./store.ar.json";

void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar } },
  lng: "ar",
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

export default i18n;
