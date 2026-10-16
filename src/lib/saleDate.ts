/* ============================================================================
 * «تاريخ المبيع» — فاتورةٌ نُسيت تُسجَّل بيومها (0242). نقيّةٌ ومفحوصةٌ بـ
 * `scripts/sale-date-test.mjs`، ومرآتُها شرطُ `retail_checkout` حرفاً:
 *
 *   ١) **المدير وحده** (أو مفتاحُه الحيّ)، ولا مشغّلُ المنصّة — سطرُ مالٍ يسمّي كادرَ العيادة.
 *   ٢) **يومٌ قبل اليوم** بتوقيت الجهاز — فاتورةُ اليوم تنسجّل بلا تاريخ، ونقلُها بين دوامَي
 *      اليوم ليس «نسياناً» بل تغييرٌ لصندوقٍ مفتوح.
 *   ٣) **ولا أقدم من ٧ أيام** — الأسبوعُ يغطّي «نسيتها»، وما قبله تقاريرُ قُرئت وقرارُ صاحب العيادة.
 *
 * واليومُ محلّيّ لا غرينتش (درسُ 0223): `toISOString().slice(0,10)` يعطي أمسَ لبيعةٍ بعد منتصف الليل
 * ببغداد. والوقتُ يبقى بيد الطبيب (افتراضُه الساعةُ الآن كزيارةٍ سابقة) — الدوامان يُقسمان بالساعة.
 * ========================================================================= */
import { localISO } from "./utils";
import { isClock, isDay } from "./backdate";

/** أقدمُ يومٍ يُقبل: اليوم − هذا العدد (مرآةُ `v_today - 7` بالخادم). */
export const BACKDATE_DAYS = 7;

export type SaleDateCode = "sale_at_invalid" | "sale_day_not_past" | "backdate_window" | "backdate_not_allowed" | "backdate_operator_not_allowed";

/** يومٌ محلّيّ مزاحٌ بأيام (بلا ساعاتٍ تنزلق عند حدّ الشهر). */
export function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localISO(new Date(y, m - 1, d + by));
}

/** حدودُ منتقي اليوم: من (اليوم − ٧) إلى أمس. */
export function saleDayBounds(now: Date = new Date()): { today: string; min: string; max: string } {
  const today = localISO(now);
  return { today, min: shiftDay(today, -BACKDATE_DAYS), max: shiftDay(today, -1) };
}

export type SaleDateCheck = { ok: true; at: string; day: string } | { ok: false; code: SaleDateCode };

/** حكمُ لحظةٍ جاهزة (ISO) — مرآةُ الخادم، وبها يحكم التجريبيّ على ما وصله. */
export function checkSaleAt(iso: string | null | undefined, now: Date = new Date()): SaleDateCheck {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return { ok: false, code: "sale_at_invalid" };
  const day = localISO(at);
  const { today, min } = saleDayBounds(now);
  if (at.getTime() > now.getTime() || day >= today) return { ok: false, code: "sale_day_not_past" };
  if (day < min) return { ok: false, code: "backdate_window" };
  return { ok: true, at: at.toISOString(), day };
}

/** لحظةُ البيع من يومٍ ووقتٍ محلّيّين كما اختارهما الطبيب. */
export function checkSaleMoment(day: string, time: string, now: Date = new Date()): SaleDateCheck {
  if (!isDay(day) || !isClock(time)) return { ok: false, code: "sale_at_invalid" };
  const at = new Date(`${day}T${time}:00`);
  if (Number.isNaN(at.getTime())) return { ok: false, code: "sale_at_invalid" };
  return checkSaleAt(at.toISOString(), now);
}

/** مَن يرى «تاريخ المبيع»: الدورُ الفعليّ مدير (حسابُه أو مفتاحُه الحيّ)، ولا جهازٌ مقفولٌ بلا مفتاح،
 *  ولا مشغّلُ منصّة. الخادمُ يفرض الأوّل والثالث بنفسه؛ هنا لا يُعرض زرٌّ سيُرفض حفظُه. */
export function canBackdate(x: { role: string | null | undefined; restricted: boolean; operator?: boolean }): boolean {
  return x.role === "manager" && !x.restricted && !x.operator;
}

/** توقيتُ الجهاز للخادم (كـp_tz بتقارير 0149)، والمجهولُ بغداد. */
export function saleTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Baghdad"; } catch { return "Asia/Baghdad"; }
}

/** سُجّلت بيومٍ سابق (0242)؟ — ختمُ الإدخال موجود. */
export function isBackdated(inv: { recorded_at?: string | null } | null | undefined): boolean {
  return !!inv?.recorded_at;
}

/** سِيَقُ البيعة المؤرَّخة تُكتب بلا `at` — فتُؤرَّخ بالفاتورة (مرآةُ `l - 'at'` بالخادم). */
export function stripLegTimes<T extends { at?: string | null }>(legs: readonly T[] | null | undefined): Omit<T, "at">[] | null {
  if (!legs || legs.length === 0) return null;
  return legs.map((l) => { const { at, ...rest } = l; void at; return rest; });
}
