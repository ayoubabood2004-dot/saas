// ============================================================================
// UI font scaling (حجم الخط) — opt-in from Settings.
//
// The whole design system is sized in rem (Tailwind text + spacing), so scaling
// the ROOT font-size scales text and whitespace together, in proportion —
// nothing squeezes or overlaps, exactly like the browser's own zoom, while
// px-based media queries keep every layout breakpoint unchanged. Printed
// documents open their own windows and are untouched.
//
// The enable flag is clinic-wide (clinic_prefs.font_scale_enabled, migration
// 0068); the chosen size is a PER-DEVICE preference so a small-laptop screen
// can read comfortably without affecting the clinic's other devices.
// ============================================================================
export const FONT_SCALES = [
  { id: "xcompact", pct: 80 },  // 12.8px root — rescue mode for cramped laptops (125–150% OS scaling)
  { id: "compact", pct: 87.5 }, // 14px root — fit more on a big screen
  { id: "normal", pct: 100 },   // 16px root — the design default
  { id: "large", pct: 112.5 },  // 18px root — comfortable on small laptops
  { id: "xlarge", pct: 125 },   // 20px root — maximum readability
] as const;
export type FontScaleId = (typeof FONT_SCALES)[number]["id"];

const KEY = "vp_font_scale";

/** شاشة "مضغوطة": لابتوب ويندوز على تكبير نظام ١٢٥–١٥٠٪ يصير عرضه الفعلي
 *  ~١٠٢٤–١٢٠٠ بكسل — الشريط الجانبي ظاهر لكن المحتوى ضيّق وتختفي أطراف
 *  الواجهة، والدكتور لا يعرف زوم المتصفح. */
const isCrampedScreen = () =>
  typeof window !== "undefined" && window.innerWidth >= 1024 && window.innerWidth < 1200;

export function getFontScale(): FontScaleId {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && FONT_SCALES.some((s) => s.id === raw)) return raw as FontScaleId;
  } catch { /* ignore */ }
  // ملاءمة تلقائية: لا يوجد اختيار محفوظ → الشاشات الضيقة تنزل تلقائياً
  // درجة واحدة فيتّسع كل شيء بدون أي تدخل من المستخدم.
  return isCrampedScreen() ? "compact" : "normal";
}

/** ترتيب الدرجات للتنقل السريع بأزرار أ− / أ+. */
const ORDER: FontScaleId[] = FONT_SCALES.map((s) => s.id);

/** خطوة واحدة أصغر/أكبر — تُستخدم من أزرار الواجهة، وتُحفظ لهذا الجهاز. */
export function stepFontScale(dir: 1 | -1): FontScaleId {
  const i = ORDER.indexOf(getFontScale());
  const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, i + dir))];
  setFontScale(next);
  return next;
}

export const canStepFontScale = (dir: 1 | -1): boolean => {
  const i = ORDER.indexOf(getFontScale());
  return dir === 1 ? i < ORDER.length - 1 : i > 0;
};

export function setFontScale(id: FontScaleId): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  applyFontScale();
}

/** Stamp the effective scale on <html>. Feature off (or "normal") → the inline
 *  style is removed entirely, restoring the stock 16px root. Idempotent — safe
 *  to call at boot, after every hydrate, and on every Settings change. */
/** يطبّق حجم هذا الجهاز دائماً — أزرار أ−/أ+ والملاءمة التلقائية تعمل لكل
 *  المستخدمين بلا إعداد مسبق؛ خيار الإعدادات (clinic flag) يتحكم فقط بإظهار
 *  قسم الاختيار في صفحة الإعدادات. */
export function applyFontScale(): void {
  if (typeof document === "undefined") return;
  const pct = FONT_SCALES.find((s) => s.id === getFontScale())?.pct ?? 100;
  if (pct === 100) document.documentElement.style.removeProperty("font-size");
  else document.documentElement.style.fontSize = `${pct}%`;
}

/* ============================================================================
 * وضع الوضوح (crisp mode) — للشاشات الصغيرة/الضعيفة البكسلات.
 *
 * على شاشات 1x القديمة يظهر الخط رفيعاً ومبكسلاً لأن التنعيم العالمي
 * antialiased يلغي الرسم تحت-البكسلي. هذا الوضع (فئة `crisp` على <html>):
 *   · يرجّع subpixel-antialiased فتُرسم الحروف بحواف أحدّ وأثخن؛
 *   · يثخّن الحروف بظل مجهري بلون النص نفسه (لا يغيّر أي تخطيط)؛
 *   · يغمّق النصوص الرمادية الباهتة (ink-muted/subtle) فتبين على أي شاشة.
 * تفضيل لهذا الجهاز فقط — شاشة قوية بنفس العيادة ما تتأثر.
 * ==========================================================================*/
const CRISP_KEY = "vp_crisp_screen";

export function getCrispMode(): boolean {
  try { return localStorage.getItem(CRISP_KEY) === "1"; } catch { return false; }
}

export function setCrispMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(CRISP_KEY, "1");
    else localStorage.removeItem(CRISP_KEY);
  } catch { /* ignore */ }
  applyCrispMode();
}

/** Stamp/remove the `crisp` class on <html>. Idempotent — safe at boot and on
 *  every Settings change; the CSS lives in index.css under `html.crisp`. */
export function applyCrispMode(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("crisp", getCrispMode());
}
