/* ============================================================================
 * مفتاحُ قاعدة النسخة التجريبية، وكنسُ نسخها القديمة عند كلّ إقلاع.
 *
 * بوحدةٍ صغيرةٍ وحدَها لأن الإقلاع (main.tsx) ينادي الكنسَ كلَّ مرّة: كان يستورده من demoStore.ts فتدخل حزمةَ
 * الإقلاع كلُّها — بذرةُ النسخة التجريبية ومُحمّلُها (~١٥ كيلو خامّاً) — لدالّةٍ من سطرين، ولكلّ عيادةٍ سحابيّةٍ لا
 * تفتح التجريبيَّ أبداً. «وحدةٌ يستورد الإقلاعُ منها دالّةً واحدة تُدخلها كلَّها» (CLAUDE.md §٣، 0262) — مقيسٌ
 * بخريطة المصدر (sourcemap) لحزمة main أثناء حالة الحقل (0265).
 * ========================================================================= */
export const DEMO_DB_KEY = "vp_demo_db_v13";

/**
 * Drop demo databases left behind by OLDER app versions (vp_demo_db_v1..v11).
 * Each old DB can hold compressed base64 media and silently eats the ~5 MB
 * localStorage quota — once full, writes throw and the app appears to "freeze".
 * Safe + idempotent: only removes vp_demo_db_v* keys that aren't the current one.
 * Returns the number of stale keys removed.
 */
export function pruneStaleStorage(): number {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("vp_demo_db_v") && k !== DEMO_DB_KEY) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
    return stale.length;
  } catch {
    return 0;
  }
}
