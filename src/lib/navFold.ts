import { useEffect, useState } from "react";

/* ============================================================================
 * طيّ شريط التنقّل — «وضع التركيز».
 *
 * شريط التنقّل يأكل ٢٥٦px من العرض بشكل دائم، وهو ثمنٌ عادل وأنت تتنقّل بين
 * الأقسام، لكنه ثمنٌ باهظ وأنت واقف بالكاشير ساعةً كاملة داخل شاشة واحدة:
 * تلك البكسلات هي بالضبط ما تحتاجه السلة لتُظهر أصنافاً أكثر.
 *
 * فالطيّ اختياري، محفوظ لكل جهاز (لا لكل عيادة — الطبيب على آيباده الضيّق
 * يطوي، وعلى شاشة المكتب الواسعة لا يطوي)، ويُبثّ كحدث نافذة ليتغيّر الشريط
 * وحشوة الصفحة وعرض السلة **معاً بالإطار نفسه** — بلا إعادة تحميل، وبلا أن
 * تختلف حالة مكوّنين على الشاشة نفسها.
 * ==========================================================================*/

const KEY = "vp_nav_folded";
const EVENT = "vp:navfold";

export function getNavFolded(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setNavFolded(v: boolean): void {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

/** الحالة الحيّة — كل من يقرأها يتحرّك بنفس اللحظة. */
export function useNavFolded(): boolean {
  const [folded, setFolded] = useState(getNavFolded);
  useEffect(() => {
    const on = () => setFolded(getNavFolded());
    window.addEventListener(EVENT, on);
    // تبويب آخر بنفس المتصفّح غيّر التفضيل — نتبعه بدل أن نتناقض معه.
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  return folded;
}
