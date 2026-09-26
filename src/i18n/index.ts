import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import arHot from "./arHot";
import arOwned from "./arOwned";
import { LOCALES, localeInfo, fallbackMap } from "./registry";
// نسبيٌّ لا `@/`: حُزمُ esbuild بالفحوص (`lang-default-test` وأخواتها) تحلّه
// بلا اسمٍ مستعار. و`appUpdate` بلا أثرٍ على مستوى الوحدة.
import { retryImport } from "../lib/appUpdate";

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
  // نصفُ العربية **الحارّ** وحدَه بالحزمة (`arHot.ts`، والمساراتُ بـ`hot-paths.json`)؛
  // نصفُها البارد يصل بـ`ensureDictionary()`، والبقيةُ تُحمَّل بمحمّلها (`registry.ts`).
  resources: { ar: { translation: arHot } },
  lng: initialLang(),
  // سلاسل السقوط من سجل اللغات: السورانية القادمة تسقط للعربية قبل
  // الإنجليزية — المفتاح الناقص يظهر بأقرب لغة مفهومة لا بأبعدها.
  fallbackLng: fallbackMap(),
  interpolation: { escapeValue: false },
  /* شبكةُ أمانٍ أخيرة: وصولُ حزمةٍ (النصفُ البارد أو لغةٌ كسولة) يعيد رسمَ كلِّ
   * مستهلكٍ لـ`useTranslation` — فمفتاحٌ باردٌ قُرئ قبل وصوله (ولا يُفترض أن
   * يحدث: `i18n-hot-guard` يمنعه) يُصحَّح بإطارٍ واحد بدل أن يبقى خاماً حتى رسمٍ
   * عابر. **وكلفتُها**: كلُّ أثرٍ (`useEffect`) يضع `t` باعتماده يُعاد مرّةً عند
   * الإقلاع — اليومَ مستمعُ الحصّة بـ`Housekeeping` وحدَه، ويعيد الاشتراكَ فقط.
   * أثرٌ قادمٌ يجلب بياناتٍ ويعتمد `t` سيجلب مرّتين؛ فلا تضع `t` باعتماد جلب. */
  react: { bindI18nStore: "added" },
});

export { applyDir } from "./dir";
import { applyDir } from "./dir";

/* ── النصفُ البارد ───────────────────────────────────────────────────────────
 * كان `ar.json` كلُّه مستورداً هنا استيراداً ثابتاً، فجرّته السلسلةُ
 * `repo → payrollDemo → payrollLabels → @/i18n` إلى حزمة الإقلاع: ٧٨ كيلو
 * مضغوطة، ٥٥٪ منها، أغلبُها نصوصُ شاشاتٍ كسولة. فصار كلُّ نصٍّ جديدٍ لشاشةٍ
 * عميقةٍ يُدفع من مسار الإقلاع، وارتفع السقفُ ثلاثاً بثلاثة أيام.
 *
 * فالآن: النصفُ الحارّ مع القشرة، والباردُ حزمةٌ واحدةٌ تبدأ مع الإقلاع
 * (`main.tsx`) موازيةً لحزمة الصفحة الأولى، وكلُّ صفحةٍ تنتظرها (`page()`).
 * والتحميلُ يمرّ من `retryImport` كأيّ صفحة: قشرةٌ قديمةٌ بعد نشرٍ تُصلَح
 * بإعادة تحميلٍ واحدة، والفشلُ يُرمى — لا يُبلع — فتقول الصفحةُ «أعد
 * المحاولة» بدل أن ترسم نصفَ قاموسٍ بمفاتيحَ خام. */
let coldLoaded = false;
let coldLoading: Promise<void> | null = null;

/** العربيةُ نفسُها وكلُّ لغةٍ تسقط إليها (السورانية) — من السجلّ لا بشرطٍ ثابت،
 *  فلغةٌ قادمةٌ تسقط للعربية تُغطّى وحدَها. والإنكليزيةُ لا تسقط للعربية أبداً،
 *  فمستخدمُها لا ينزّل النصفَ البارد إطلاقاً. */
function needsArCold(lang: string): boolean {
  const info = localeInfo(lang);
  return info.code === "ar" || info.fallback.includes("ar");
}

/**
 * يضمن أن القاموسَ العربيّ كاملٌ قبل أن يُرسم ما يحتاجه — مرّةً واحدةً مهما
 * تكرّر النداء. الدمجُ عميقٌ بلا كتابةٍ فوق القائم: النصفان منفصلان بالبناء.
 *
 * والفشلُ: الوعدُ المرفوض يُمسح فالنداءُ التالي يمرّ من `retryImport` ثانيةً — لكن
 * المتصفّحَ يحفظ فشلَ `import()` بخريطة الوحدات طولَ عمر الصفحة (قاسته المراجعة:
 * لا طلبَ ثانٍ للخادم ولو صار الملفُّ متاحاً). فالتعافي **ليس** إعادةَ الاستيراد
 * داخل الصفحة؛ هو إعادةُ تحميلها بـ`recoverFromStaleShell` عند أوّل نداءٍ والشبكةُ
 * قائمة وخارجَ حارس الثلاثين ثانية. وقبلها تقول كلُّ صفحةٍ «حدث خطأ ما» بزرّ إعادة
 * تحميل — لا مفاتيحَ خاماً. وهذا أوسعُ أثراً من فشل حزمة صفحةٍ واحدة (يصيب كلَّ
 * الصفحات معاً)، ومدّتُه محدودةٌ بانقطاع الشبكة أو بالحارس.
 */
export function ensureDictionary(lang: string = i18n.language): Promise<void> {
  if (coldLoaded || !needsArCold(lang)) return Promise.resolve();
  if (!coldLoading) {
    coldLoading = retryImport(() => import("./arCold")).then(
      (m) => {
        i18n.addResourceBundle("ar", "translation", m.default, true, false);
        coldLoaded = true;
      },
      (err: unknown) => {
        coldLoading = null;
        throw err;
      },
    );
  }
  return coldLoading;
}

/* ── النطاقاتُ المملوكة لصفحةٍ واحدة (`owned` بـhot-paths.json) ──────────────
 * نصوصُ سجلّ الحركات وحقول الدواجن كانت بالنصف البارد تنزل مع أوّل صفحةٍ لكلّ
 * مستخدم، ولا تُقرأ إلا بصفحتيهما. فصار لكلٍّ حزمتُه تصل مع صفحته (`page(load, [ns])`)،
 * بنفس عقد `ensureDictionary`: مرّةً واحدة، والفشلُ يُرمى ويُعاد، والإنكليزيُّ لا ينزّلها.
 * و`ownedWanted` يتذكّر ما طلبته صفحةٌ: تبديلُ اللغة إلى العربية وهي مفتوحة يجلبه أيضاً —
 * وإلا بقيت الصفحةُ المفتوحةُ بمفاتيحَ خام حتى إعادة التحميل. */
const ownedLoaded = new Set<string>();
const ownedLoading = new Map<string, Promise<void>>();
const ownedWanted = new Set<string>();
export function ensureOwned(ns: string, lang: string = i18n.language): Promise<void> {
  ownedWanted.add(ns);
  if (ownedLoaded.has(ns) || !needsArCold(lang)) return Promise.resolve();
  const load = arOwned[ns];
  if (!load) return Promise.resolve();   // خارج Vite: النطاقُ حاضرٌ بالقاموس الكامل
  let p = ownedLoading.get(ns);
  if (!p) {
    p = retryImport(load).then(
      (m) => {
        i18n.addResourceBundle("ar", "translation", { [ns]: m.default }, true, false);
        ownedLoaded.add(ns);
      },
      (err: unknown) => {
        ownedLoading.delete(ns);
        throw err;
      },
    );
    ownedLoading.set(ns, p);
  }
  return p;
}

/* ظهيرٌ وقتَ التشغيل: كلُّ تبديلٍ إلى لغةٍ تحتاج العربيةَ كاملةً يبدأ تحميلَ
 * النصف البارد — ومنه `changeLanguage("ar")` المباشر بـ`portal.ts`، الذي لا يمرّ
 * من `setLang`. والفشلُ هنا لا يُقال مرّتين: الصفحةُ التالية تنتظر نفسَ الوعد
 * وتعرض «أعد المحاولة» بنفسها. */
i18n.on("languageChanged", (lng: string) => {
  if (needsArCold(lng)) ensureDictionary(lng).catch(() => { /* تقوله بوّابةُ الصفحة */ });
  if (needsArCold(lng)) for (const ns of ownedWanted) ensureOwned(ns, lng).catch(() => { /* كذلك */ });
});

/* التبديلُ يحمّل **أوّلاً** ثم يثبّت: كانت `vp_lang` تُكتب والاتجاهُ يُقلب قبل
 * وصول الحزمة، فإن فشل التحميلُ بقي الجهازُ على اتجاهٍ جديدٍ بلا نصوصه —
 * ومحفوظاً كذلك للإقلاع التالي. الآن: حزمةُ اللغة (إن كانت كسولة) ثم نصفُ
 * العربية البارد (إن احتاجته)، وبعدهما وحدَهما الحفظُ والاتجاهُ والتبديل.
 * ولا `try` هنا عمداً: الفشلُ يبقى رفضاً غيرَ ملتقَط فيقوله توستُ `errors.async`
 * القائمُ بـ`main.tsx`، ولا يُحفظ شيءٌ ولا ينقلب اتجاه. */
let langSeq = 0;
export function setLang(lang: Lang): void {
  const my = ++langSeq;
  void (async () => {
    const info = localeInfo(lang);
    // لغات المخزن غير المدمجة تُحمَّل كسولاً أول مرة تُختار — مستخدم
    // الإسبانية لا يدفع كلفة تنزيل بقية اللغات أبداً.
    if (info.loader && !i18n.hasResourceBundle(info.code, "translation")) {
      const mod = await retryImport(info.loader);
      i18n.addResourceBundle(info.code, "translation", mod.default, true, true);
    }
    await ensureDictionary(info.code);
    /* آخرُ اختيارٍ يفوز: «العربية» تنتظر نصفَها البارد و«English» تُحسم فوراً، فبلا
     * هذا يصل التنزيلُ المتأخّر ويقلب كلَّ شيءٍ لاختيارٍ سابق (i18n-cold-test B10). */
    if (my !== langSeq) return;
    try {
      localStorage.setItem("vp_lang", lang);
    } catch {
      /* ignore */
    }
    applyDir(lang);
    await i18n.changeLanguage(info.code);
  })();
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
 * إطار. وفشلُ التحميل **لا يعلّق الإقلاع**: يُحلّ الوعدُ على أيّة حال.
 *
 * وما يغطّي الواجهةَ حينها ليس «السقوط» كما كان يُقال هنا: سلسلةُ الإنكليزية
 * `[en]` وحدَها (`fallbackMap`) — **لا تسقط للعربية أبداً** — فحزمتُها إن فشلت
 * تُظهر النصوصَ الافتراضيةَ المضمَّنة بالنداءات، أو المفتاحَ خاماً حيث لا
 * افتراض. السورانيةُ وحدَها تسقط للعربية (ckb ← ar ← en). وللسبب نفسه لا ينزّل
 * مستخدمُ الإنكليزية نصفَ العربية البارد إطلاقاً (`ensureDictionary`).
 */
export const i18nReady: Promise<void> = (async () => {
  const info = localeInfo(initialLang());
  if (!info.loader || i18n.hasResourceBundle(info.code, "translation")) return;
  try {
    const mod = await info.loader();
    i18n.addResourceBundle(info.code, "translation", mod.default, true, true);
    await i18n.changeLanguage(info.code);
  } catch {
    /* تعذّر تحميل اللغة (شبكة/ملف) — لا انهيار؛ والنصوصُ الافتراضيةُ تغطّي الواجهة (انظر أعلاه) */
  }
})();

export default i18n;
