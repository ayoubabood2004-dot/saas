import i18n from "i18next";
import { initReactI18next } from "react-i18next";
/* **الحارُّ وحدَه بالإقلاع** (م٠·١). كان `import ar from "./ar.json"` يجرّ
 * القاموسَ كلَّه (٧٧ ألف بايتٍ مضغوطة) لكلّ فتحِ تطبيق، والقشرةُ تقرأ منه ٢٢
 * نطاقاً. الاستيرادُ بالاسم يجعل Rollup يُسقط الباقي؛ والباردُ بـ`arCold.ts`
 * يُحمَّل كسولاً وتنتظره كلُّ شاشةٍ قبل رسمها. **لا تُعِد الاستيرادَ الافتراضيّ**:
 * سطرٌ واحدٌ يعيد الـ٧٧ ألفاً كلَّها للإقلاع — ويمسكه `i18n-split-guard`. */
import {
  app, auth, bookReq, bookings, branches, clinicSync, common, errors, features, nav, outbox,
  override, payroll, plans, pos, reception, records, report, retail, role, storeBell, sub,
} from "./ar.json";
import { LOCALES, localeInfo, fallbackMap } from "./registry";
import { emitGlobalToast } from "../lib/globalToast";

const arHot = {
  app, auth, bookReq, bookings, branches, clinicSync, common, errors, features, nav, outbox,
  override, payroll, plans, pos, reception, records, report, retail, role, storeBell, sub,
};

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
  resources: { ar: { translation: arHot } },
  lng: initialLang(),
  // سلاسل السقوط من سجل اللغات: السورانية القادمة تسقط للعربية قبل
  // الإنجليزية — المفتاح الناقص يظهر بأقرب لغة مفهومة لا بأبعدها.
  fallbackLng: fallbackMap(),
  interpolation: { escapeValue: false },
});

export { applyDir } from "./dir";
import { applyDir } from "./dir";

let langSeq = 0;
/**
 * تبديلُ اللغة — **آخرُ اختيارٍ يفوز، ولا شيءَ يتغيّر قبل أن تكتمل نصوصُ اللغة.**
 *
 * كان الاتجاهُ والتفضيلُ المحفوظ يتغيّران فوراً والنصُّ بعد التنزيل، فأثبت التدقيقُ
 * العدائيُّ (أربعُ زوايا مستقلّة) سباقاً: إنكليزيٌّ يضغط «العربية» والقاموسُ البارد
 * يتنزّل، ثم يضغط «English» — فينتهي التنزيلُ المتأخّر ويقلب النصَّ عربياً بصفحةٍ
 * يسارية و`vp_lang` إنكليزية. وفشلُ التنزيل كان يبدّل على أيّة حال: شاشةٌ نصفُها
 * إنكليزيّ ونصفُها مفاتيحُ خامّة. فالآن: التنزيلُ أوّلاً، ثم — إن بقي هذا آخرَ
 * اختيار — اللغةُ والاتجاهُ والحفظُ معاً. وإن فشل يبقى كلُّ شيءٍ كما كان ويُقال.
 */
export function setLang(lang: Lang): Promise<void> {
  const my = ++langSeq;
  return (async () => {
    const info = localeInfo(lang);
    try {
      // لغات المخزن غير المدمجة تُحمَّل كسولاً أول مرة تُختار — مستخدم
      // الإسبانية لا يدفع كلفة تنزيل بقية اللغات أبداً.
      if (info.loader && !i18n.hasResourceBundle(info.code, "translation")) {
        const mod = await info.loader();
        i18n.addResourceBundle(info.code, "translation", mod.default, true, true);
      }
      /* الشاشةُ الحاليّةُ مرسومةٌ أصلاً ولن تمرّ من `page()` ثانيةً — فالتبديلُ
       * إلى العربية (أو لغةٍ تسقط إليها) ينتظر الباردَ قبل أيّ تغيير. */
      if (needsColdAr(info.code)) await loadColdAr();
    } catch {
      if (my === langSeq) {
        emitGlobalToast({ tone: "error", title: i18n.t("errors.langFailed", "ما تبدّلت اللغة — تعذّر تنزيل نصوصها. تأكّد من الإنترنت وحاول مرة ثانية.") });
      }
      return;
    }
    if (my !== langSeq) return;
    await i18n.changeLanguage(info.code);
    try {
      localStorage.setItem("vp_lang", lang);
    } catch {
      /* ignore */
    }
    applyDir(lang);
  })();
}

applyDir(initialLang());

/* ── القاموسُ البارد ──────────────────────────────────────────────────────
 * هل تحتاج هذه اللغةُ العربيةَ؟ العربيةُ نفسُها، وكلُّ لغةٍ سلسلةُ سقوطها تمرّ
 * بها (السورانية ⇐ العربية). والإنكليزيةُ مكتملةٌ بنفسها (حارسُ التكافؤ) —
 * فمستخدمُها لا يدفع ثمنَ قاموسٍ لا يقرؤه. */
export function needsColdAr(code: string = i18n.language): boolean {
  return code === "ar" || (fallbackMap()[code] ?? []).includes("ar");
}

let coldAr: Promise<void> | null = null;
/**
 * يحمّل النطاقاتِ الباردة ويدمجها بنفس المساحة (`translation`) — فالمفاتيحُ
 * بالشاشات لا تتغيّر حرفاً. مرّةً واحدة: النداءاتُ المتزامنة تتشارك الوعد.
 *
 * **ويرفض إن فشل** (ويُصفَّر الوعدُ فالنداءُ التالي يعيد المحاولة): شاشةٌ تُرسم
 * بلا نصوصها تعرض «claim.notFound» لعيادةٍ لا تقرأ غيرَ العربية — نقصٌ يُصدَّق
 * أنه التطبيق. `page()` تمرّره من `retryImport` كحزمة الشاشة نفسها: قشرةٌ
 * قديمةٌ بعد نشرٍ تُصلَح بإعادة التحميل، وما سواها يصل لشاشة «أعد المحاولة»
 * (نصوصُها `errors.*` حارّة).
 */
export function loadColdAr(): Promise<void> {
  if (!coldAr) {
    coldAr = import("./arCold").then(
      (m) => { i18n.addResourceBundle("ar", "translation", m.default, true, false); },
      (e: unknown) => { coldAr = null; throw e; },
    );
  }
  return coldAr;
}

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
  /* الباردُ يبدأ تنزيلُه مع الإقلاع **ولا يُنتظر هنا**: أوّلُ رسمٍ هو القشرة،
   * وهي لا تقرأ إلا الحارّ (يثبته الحارس). والشاشاتُ تنتظره بنفسها. بدؤه الآن
   * يجعله يصل بالتوازي مع حزمة الشاشة الأولى لا بعدها. */
  if (needsColdAr(info.code)) loadColdAr().catch(() => undefined);
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
