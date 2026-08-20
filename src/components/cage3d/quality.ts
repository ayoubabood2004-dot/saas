import { useEffect, useState } from "react";

/* ============================================================================
 * quality.ts — مستوى الجودة المجسّمة: «تلقائي / عالية / خفيفة».
 *
 * غرفة الأقفاص تُفتح على أجهزة متباعدة جداً: آيباد برو بالعيادة، وهاتف أندرويد
 * رخيص بيد المساعد. مشهدٌ واحد يرضيهما لا وجود له — فالفرق يُدار بمستوى جودة
 * صريح، لا بمحاولة إرضاء الجميع بوسطٍ يخذل الطرفين.
 *
 * ما يسقط بالوضع الخفيف: الظلال (خريطة ظل + ظل الملامسة)، خريطة البيئة
 * (PMREM)، الزجاج الشفاف، الضباب، وكثافة البكسل تُثبَّت على ١. الشكل يبقى
 * مفهوماً تماماً — قفصٌ وإطارٌ ملوّن ورقم — والحركة تصير سلسة.
 *
 * الكشف التلقائي محافظ عمداً: الشك يذهب لصالح الخفيف. مشهدٌ خفيف على جهاز
 * قوي يخسر بعض اللمعان؛ ومشهدٌ ثقيل على جهاز ضعيف يخسر الميزة كلها.
 * ==========================================================================*/

export type Tier = "auto" | "high" | "light";

const KEY = "vp_cage3d_quality";
const EVENT = "vp:cagequality";

export function getTier(): Tier {
  try {
    const v = localStorage.getItem(KEY);
    return v === "high" || v === "light" ? v : "auto";
  } catch { return "auto"; }
}

export function setTier(t: Tier): void {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: t }));
}

/** هل الجهاز ضعيف؟ أنوية المعالج والذاكرة ونوع المؤشر — بلا قياس أداء يؤخّر الفتح. */
export function autoIsLow(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const smallScreen = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 700;
  if (cores <= 4 || mem <= 4) return true;
  // لمسي وشاشة صغيرة = هاتف: خفيف افتراضاً مهما ادّعى المتصفّح من أنوية.
  return coarse && smallScreen;
}

/** الوضع الفعلي المطبَّق الآن (يحلّ «تلقائي» لقرار). */
export function resolvedTier(): "high" | "light" {
  const t = getTier();
  return t === "auto" ? (autoIsLow() ? "light" : "high") : t;
}

/** قراءة رخيصة تُستدعى داخل الرسم — بلا حالة React (الجودة لا تتغيّر بالإطار). */
export function lowTier(): boolean {
  return resolvedTier() === "light";
}

/** الاختيار الحيّ + الوضع المحلول — إعادة تركيب المشهد عند التبديل. */
export function useQuality(): { tier: Tier; low: boolean } {
  const [tier, setT] = useState<Tier>(getTier);
  useEffect(() => {
    const on = () => setT(getTier());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  return { tier, low: tier === "auto" ? autoIsLow() : tier === "light" };
}
