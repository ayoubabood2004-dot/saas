/* ============================================================================
 * سلسلةُ اللقاح: الجرعةُ المعطاةُ تسأل عن التي بعدها، والمعطاةُ اليوم تستهلك المستحقّة.
 *
 * ── القياس (١٠/١٠، الإنتاج) ───────────────────────────────────────────────
 * «أعطِ الجرعة» بسجلّ الحيوان (وعلامةُ «تمّ» بتقويم الاستقبال) تقلب الجرعةَ «معطاة» ولا
 * تسأل عن التالية — فالتكرارُ الذي اختاره الطبيبُ يقف عند أوّل جرعةٍ معزّزة. والكادرُ يلتفّ:
 * يعطيها ثمّ يضيف اللقاحَ من جديد ليحصل على الموعد — ٤٠ جرعةً «معطاة» مكرّرةً بنفس اليوم.
 * والطريقُ الآخر («أضف لقاح» ← انعطى اليوم) يكتب جرعةً جديدة ويترك المستحقّةَ معلّقة: نحو
 * ١١٢ جرعةً «مستحقّة» انعطت فعلاً، تذكيرٌ كاذبٌ للزبون ولوحةٌ حمراء بلا سبب.
 *
 * ── القرار ─────────────────────────────────────────────────────────────────
 * • كلُّ إعطاءٍ لجرعةٍ مجدولة يسأل «شوكت الجاية؟» بمدد نموذج الإضافة نفسها، **ولا يختار عن
 *   الطبيب**: يعلّم بـ★ المدّةَ الجاهزةَ الأقربَ لما بين الجرعة السابقة وموعد هذه — علامةٌ لا
 *   اختيار، لأن الموعدَ قد يكون مؤجَّلاً («غيّر الموعد») أو هذه آخرُ السلسلة، واقتراحٌ مختارٌ سلفاً
 *   كان يحجز بضغطةٍ موعداً منحرفاً أو جرعةً لا وجود لها (أمسكه تدقيقٌ عدائيّ). و«ماكو جرعة
 *   جاية» خيارٌ صريح، وجرعةٌ لاحقةٌ محجوزةٌ أصلاً لا تُكرَّر.
 * • «انعطى اليوم» من النموذج (أو البيع) يقلب **المستحقّةَ** لنفس اللقاح معطاةً بدل صفٍّ ثانٍ —
 *   المستحقّة = الأقربُ لليوم من غير المعطاة: المتأخرةُ الأحدث، وإلا التي موعدُها خلال ٧ أيام.
 *   النافذةُ أقصرُ من أصغر معزّز (أسبوعان): بثلاثين يوماً كانت حفظةٌ ثانيةٌ بنفس اليوم (السجلُّ ثمّ
 *   البيع) تستهلك المعزّزَ الذي حُجز للتوّ فتقف السلسلة — نفسُ الشكوى. ولقاحٌ انعطى اليومَ أصلاً
 *   لا يُستهلك له شيء ولا يُكتب مرّتين: الحفظةُ الثانية تسجيلٌ مكرَّر لنفس الجرعة.
 * نقيّةٌ بلا React ولا repo: يفحصها `vax-next-test.mjs`.
 * ==========================================================================*/
import type { Vaccination } from "@/types";
import { addInterval, type Interval } from "./backdate";

export interface VaxInterval extends Interval { key: string }

/** مددُ الجرعة القادمة بمفاتيحها — أسماؤها المعروضة مع `BOOSTERS` بـMedicalEntry (والفحصُ يطابق
 *  القائمتين مفتاحاً ومدّةً: قائمتان تنحرفان فيقترح هذا ما لا يعرضه ذاك). */
export const VAX_INTERVALS: VaxInterval[] = [
  { key: "medentry.b2w", days: 14 },
  { key: "medentry.b3w", days: 21 },
  { key: "medentry.b1m", months: 1 },
  { key: "medentry.b2m", months: 2 },
  { key: "medentry.b3m", months: 3 },
  { key: "medentry.b6m", months: 6 },
  { key: "medentry.b1y", years: 1 },
];

/** المستحقّةُ تُستهلك إن كان موعدُها حتى ٧ أيام بعد اليوم (مبكّرةٌ قليلاً = نفسُ الجرعة) —
 *  أقصرُ من أصغر معزّز (١٤ يوماً) فلا يُستهلك المعزّزُ الذي حُجز للتوّ. */
export const CONSUME_AHEAD_DAYS = 7;

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10));
const day = (s: string) => s.slice(0, 10);
const dayNum = (s: string) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
/** الفرقُ بالأيام بين يومين (ب − أ). */
export const daysBetween = (a: string, b: string) => dayNum(day(b)) - dayNum(day(a));

/** نفسُ اللقاح: الاسمُ كما خُزّن بعد طيّ المسافات وحالة الأحرف («Rabies » = «rabies»). */
export const sameVaccine = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

export interface NextSuggestion { interval: VaxInterval; due: string; gapDays: number }

/**
 * «نفسُ المدّة السابقة»: من آخر جرعةٍ معطاةٍ قبل هذه إلى موعد هذه، مطابَقةً على أقرب مدّةٍ جاهزة
 * ضمن هامشٍ (١٥٪ أو ٣ أيام) ومطبَّقةً على يوم الإعطاء. **مدّةٌ جاهزةٌ أو لا شيء**: فجوةٌ لا تطابق
 * مدّةً (موعدٌ أُجّل شهرين ⇒ ٤٢٦ يوماً) كانت تُقترح بالأيام فينزاح الموعدُ كلَّ سنة. ولا اقتراحَ بلا
 * جرعةٍ سابقة أو بلا موعدٍ لهذه، ولا لفجوةٍ أقلّ من أسبوع (ليست سلسلةً بل خطأ إدخال).
 */
export function suggestNext(series: readonly Vaccination[], dose: Pick<Vaccination, "id" | "name" | "due_date">, givenDay: string): NextSuggestion | null {
  if (!isDay(dose.due_date) || !isDay(givenDay)) return null;
  const due = day(dose.due_date);
  const prev = series
    .filter((v) => v.id !== dose.id && v.status === "administered" && isDay(v.administered_at) && sameVaccine(v.name, dose.name)
      && day(v.administered_at!) < due)
    .sort((a, b) => day(b.administered_at!).localeCompare(day(a.administered_at!)))[0];
  if (!prev) return null;
  const from = day(prev.administered_at!);
  const gap = daysBetween(from, due);
  if (gap < 7) return null;
  let best: { iv: VaxInterval; off: number } | null = null;
  for (const iv of VAX_INTERVALS) {
    const off = Math.abs(daysBetween(addInterval(from, iv), due));
    const len = daysBetween(from, addInterval(from, iv));
    if (off <= Math.max(3, Math.round(len * 0.15)) && (!best || off < best.off)) best = { iv, off };
  }
  return best ? { interval: best.iv, due: addInterval(givenDay, best.iv), gapDays: gap } : null;
}

/** جرعةٌ لاحقةٌ محجوزةٌ أصلاً لنفس اللقاح (غيرُ معطاة وغيرُ هذه، موعدُها بعد يوم الإعطاء). */
export function laterPending(series: readonly Vaccination[], dose: Pick<Vaccination, "id" | "name">, givenDay: string): Vaccination | null {
  return series
    .filter((v) => v.id !== dose.id && v.status !== "administered" && isDay(v.due_date) && sameVaccine(v.name, dose.name)
      && day(v.due_date!) > day(givenDay))
    .sort((a, b) => day(a.due_date!).localeCompare(day(b.due_date!)))[0] ?? null;
}

/** لقاحٌ انعطى اليومَ أصلاً (أو بعده) لهذا الحيوان — الحفظةُ الثانية بنفس اليوم تكرارٌ لنفس الجرعة. */
export function givenToday(series: readonly Vaccination[], name: string, todayISO: string): boolean {
  return series.some((v) => v.status === "administered" && isDay(v.administered_at) && sameVaccine(v.name, name)
    && day(v.administered_at!) >= day(todayISO));
}

/**
 * الجرعةُ المستحقّة التي يستهلكها «انعطى اليوم» — **الأقربُ لليوم** لا الأقدم: المتأخرةُ الأحدث
 * (معلّقةٌ أقدم منها بقيت من قبل ولا تُختم «انعطت اليوم»)، ثمّ خطّةٌ بلا تاريخ، ثمّ التي موعدُها خلال
 * ٧ أيام. ولا شيءَ إن انعطى اللقاحُ اليومَ أصلاً (المعزّزُ المحجوزُ للتوّ ليس هذه الجرعة).
 */
export function pendingToConsume(series: readonly Vaccination[], name: string, todayISO: string): Vaccination | null {
  if (givenToday(series, name, todayISO)) return null;
  const today = day(todayISO);
  const limit = addInterval(today, { days: CONSUME_AHEAD_DAYS });
  const pend = series.filter((v) => v.status !== "administered" && sameVaccine(v.name, name));
  const late = pend.filter((v) => isDay(v.due_date) && day(v.due_date!) <= today)
    .sort((a, b) => day(b.due_date!).localeCompare(day(a.due_date!)));
  if (late.length) return late[0];
  const undated = pend.find((v) => !isDay(v.due_date));
  if (undated) return undated;
  return pend.filter((v) => isDay(v.due_date) && day(v.due_date!) > today && day(v.due_date!) <= limit)
    .sort((a, b) => day(a.due_date!).localeCompare(day(b.due_date!)))[0] ?? null;
}
