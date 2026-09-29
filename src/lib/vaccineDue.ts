import type { Vaccination } from "@/types";

/* ============================================================================
 * تعديلُ موعد اللقاح — القاعدةُ النقيّة (مفحوصةٌ بـ`scripts/vaccine-due-test.mjs`).
 *
 * «متأخر» حالةٌ **تُكتب** لا تُحسب بالخادم (لا مهمّةَ تقلبها)، فتأجيلُ لقاحٍ متأخرٍ لموعدٍ
 * قادم يلزمه أن يرجع «مجدول» — وإلا بقيت العلامةُ الحمراء بملفّ الحيوان على موعدٍ
 * لم يحن، والتذكيرُ يقول «متأخر» عمّا أجّله الطبيب عمداً. والعكسُ كذلك: موعدٌ
 * صُحّح لتاريخٍ فات صار متأخراً فعلاً.
 * ========================================================================= */

export type DueStatus = Extract<Vaccination["status"], "scheduled" | "overdue">;

/** الحالةُ التي يوجبها موعدٌ جديد، بتاريخ اليوم المحلّيّ (YYYY-MM-DD). */
export function statusForDue(dueISO: string, todayISO: string): DueStatus {
  return dueISO.slice(0, 10) < todayISO.slice(0, 10) ? "overdue" : "scheduled";
}

/** موعدٌ صالح للحفظ: تاريخٌ حقيقيّ بصيغة YYYY-MM-DD، لا أبعد من خمس سنوات ولا أقدم من سنة. */
export function validDue(dueISO: string, todayISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueISO)) return false;
  const d = new Date(`${dueISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dueISO) return false;
  const today = new Date(`${todayISO.slice(0, 10)}T00:00:00Z`).getTime();
  const span = (d.getTime() - today) / 86400000;
  return span >= -366 && span <= 5 * 366;
}

/** يزيد أيّاماً على تاريخ (YYYY-MM-DD) — لأزرار «أسبوع/أسبوعين/شهر». */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
