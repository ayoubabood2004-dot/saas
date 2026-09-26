import { lazy, type ComponentType } from "react";
import { retryImport } from "@/lib/appUpdate";
import { ensureDictionary, ensureOwned } from "@/i18n";

/**
 * كلُّ صفحةٍ كسولة تمرّ من هنا — وهنا وحدَه يُسمح بـ`lazy()` بشِفرة الإقلاع
 * (`i18n-hot-guard`).
 *
 * تنتظر شيئين معاً لا واحداً بعد الآخر:
 *   • حزمةَ الصفحة، عبر `retryImport`: لو فشل تحميلُها لأن الجهازَ ماسكٌ قشرةً
 *     قديمةً بعد نشرٍ جديد، يُمسح المخبأ وتُجلب النسخةُ الجديدة — مرّةً واحدة؛
 *   • ونصفَ القاموس العربيّ البارد (`ensureDictionary`): نصوصُ الشاشات الكسولة
 *     خرجت من حزمة الإقلاع، والصفحةُ لا تُرسم قبل وصولها — فلا مفتاحَ خاماً
 *     ولا نصَّ افتراضيٍّ إنكليزيٍّ على شاشةٍ عربية، ولا وميضَ ثم انقلاب.
 *     و`main.tsx` بدأ تنزيلَه عند الإقلاع، فالانتظارُ موازٍ لا متتالٍ، وبعد
 *     وصوله مرّةً صار وعداً محلولاً لا يؤخّر شيئاً.
 *
 * وفشلُ أيٍّ منهما يُرمى لحارس المسار (`ErrorBoundary`): «حدث خطأ ما / إعادة
 * التحميل» بالعربية — نصوصُه حارّة — لا صفحةٌ نصفُ مترجمة.
 */
export function page<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, owned: readonly string[] = []) {
  /* و`owned`: نطاقاتٌ تملكها هذه الصفحةُ وحدَها (hot-paths.json) — تصل معها بالتوازي. */
  return lazy(() => Promise.all([retryImport(load), ensureDictionary(), ...owned.map((ns) => ensureOwned(ns))]).then(([m]) => m));
}
