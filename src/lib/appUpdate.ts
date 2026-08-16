/* ============================================================================
 * appUpdate — التعافي من «القشرة القديمة» بعد أي دبلوي جديد.
 *
 * المشكلة الحقيقية (مثبتة بمحاكاة دبلوي على نسخة إنتاج بـservice worker):
 * التطبيق مثبّت كـPWA، فالـSW يخدم index.html من مخبئه. بعد أي نشر جديد
 * تتغيّر بصمات ملفات الصفحات، فجهاز ماسك القشرة القديمة يطلب ملفاً انحذف
 * من الخادم (404) → الصفحة تعلق على الدوّارة. وإعادة التحميل وحدها لا تكفي:
 * الـSW يعيد تقديم نفس القشرة القديمة، فتتكرر نفس الطلبات الميتة.
 *
 * العلاج: عند فشل تحميل صفحة، نمسح مخابئ القشرة ونلغي تسجيل الـSW ثم نحدّث
 * — فتُجلب النسخة الجديدة من الشبكة مباشرة، ويعيد main.tsx تسجيل الـSW فوراً
 * بعد الإقلاع (فالعمل بلا إنترنت يرجع تلقائياً). البيانات لا تُمس إطلاقاً:
 * لا localStorage ولا IndexedDB — فقط مخبأ الملفات الثابتة.
 * ==========================================================================*/

const ONCE_KEY = "vp_shell_recovered_at";
const GAP_MS = 30000; // حارس ضد دوّامة تحديث لو كان الفشل لسبب آخر

/** تعافٍ واحد لكل صفحة: مستمع vite:preloadError وغلاف الاستيراد قد ينطلقان
 *  معاً على نفس الفشل — يتشاركان هذه العملية بدل ما يتسابقان. */
let inFlight: Promise<boolean> | null = null;

/** هل جرّبنا التعافي للتو؟ (يمنع الحلقة) */
export function recoveredRecently(): boolean {
  const last = Number(sessionStorage.getItem(ONCE_KEY) || 0);
  return Date.now() - last < GAP_MS;
}

/**
 * امسح القشرة القديمة وأعد التحميل على النسخة الجديدة.
 * يرجع false إذا رفض التنفيذ (جرّبناه للتو، أو الجهاز بلا إنترنت فلا فائدة
 * من مسح المخبأ — بل ضرر).
 */
export function recoverFromStaleShell(): Promise<boolean> {
  if (inFlight) return inFlight;
  if (recoveredRecently()) return Promise.resolve(false);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(false);
  sessionStorage.setItem(ONCE_KEY, String(Date.now()));
  inFlight = (async () => {
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        // مخبأ القشرة فقط (workbox) — مخبأ صور المرضى يبقى، فلا نعيد تنزيلها بلا سبب.
        await Promise.all(keys.filter((k) => /workbox|precache|assets/i.test(k)).map((k) => caches.delete(k)));
      }
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs ?? []).map((r) => r.unregister()));
    } catch { /* أي فشل هنا لا يمنع المحاولة الأهم: إعادة التحميل */ }
    window.location.reload();
    return true;
  })();
  return inFlight;
}

/**
 * غلاف حول أي `import()` لصفحة: عند فشل التحميل (قشرة قديمة بعد نشر جديد)
 * ينفّذ التعافي مرة واحدة. أثناء انتظار إعادة التحميل نُبقي الوعد معلّقاً
 * (الصفحة على وشك أن تُستبدل) — لكن بسقف زمني: لو ما صارت إعادة التحميل
 * خلال ١٢ ثانية نرمي الخطأ ليظهر للمستخدم شيء قابل للتصرّف بدل دوّارة أبدية.
 */
export function retryImport<T>(load: () => Promise<T>): Promise<T> {
  return load().catch(async (err) => {
    const started = await recoverFromStaleShell();
    if (!started) throw err;
    return new Promise<T>((_, reject) => {
      setTimeout(() => reject(err), 12000);
    });
  });
}
