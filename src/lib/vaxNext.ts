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
 * • كلُّ إعطاءٍ لجرعةٍ مجدولة يسأل «شوكت الجاية؟» بمدد نموذج الإضافة نفسها، ويقترح **نفسَ
 *   المدّة السابقة** (من الجرعة المعطاة قبلها إلى موعد هذه) — والاقتراحُ معلَنٌ لا خفيّ،
 *   و«ماكو جرعة جاية» خيارٌ صريح. وجرعةٌ لاحقةٌ محجوزةٌ أصلاً لا تُكرَّر.
 * • «انعطى اليوم» من النموذج (أو البيع) يقلب **المستحقّةَ** لنفس اللقاح معطاةً بدل صفٍّ ثانٍ —
 *   المستحقّة = أقربُ جرعةٍ غيرِ معطاة موعدُها لا يتعدّى اليومَ بأكثر من ٣٠ يوماً. ما بعدها
 *   موعدٌ قادمٌ حقيقيّ (معزّزُ السنة القادمة) لا يُستهلك.
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

/** المستحقّةُ تُستهلك إن كان موعدُها حتى ٣٠ يوماً بعد اليوم (مبكّرةٌ قليلاً = نفسُ الجرعة). */
export const CONSUME_AHEAD_DAYS = 30;

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10));
const day = (s: string) => s.slice(0, 10);
const dayNum = (s: string) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
/** الفرقُ بالأيام بين يومين (ب − أ). */
export const daysBetween = (a: string, b: string) => dayNum(day(b)) - dayNum(day(a));

/** نفسُ اللقاح: الاسمُ كما خُزّن بعد طيّ المسافات وحالة الأحرف («Rabies » = «rabies»). */
export const sameVaccine = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

export type NextSuggestion =
  | { kind: "preset"; interval: VaxInterval; due: string; gapDays: number }
  | { kind: "days"; days: number; due: string; gapDays: number };

/**
 * «نفسُ المدّة السابقة»: من آخر جرعةٍ معطاةٍ قبل هذه إلى موعد هذه، مطبَّقةً على يوم الإعطاء.
 * تُطابَق على أقرب مدّةٍ جاهزة إن كانت ضمن هامشٍ (١٥٪ أو ٣ أيام)، وإلا فبالأيام. لا اقتراحَ
 * بلا جرعةٍ سابقة أو بلا موعدٍ لهذه، ولا لفجوةٍ أقلّ من أسبوع (ليست سلسلةً بل خطأ إدخال).
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
  if (best) return { kind: "preset", interval: best.iv, due: addInterval(givenDay, best.iv), gapDays: gap };
  return { kind: "days", days: gap, due: addInterval(givenDay, { days: gap }), gapDays: gap };
}

/** جرعةٌ لاحقةٌ محجوزةٌ أصلاً لنفس اللقاح (غيرُ معطاة وغيرُ هذه، موعدُها بعد يوم الإعطاء). */
export function laterPending(series: readonly Vaccination[], dose: Pick<Vaccination, "id" | "name">, givenDay: string): Vaccination | null {
  return series
    .filter((v) => v.id !== dose.id && v.status !== "administered" && isDay(v.due_date) && sameVaccine(v.name, dose.name)
      && day(v.due_date!) > day(givenDay))
    .sort((a, b) => day(a.due_date!).localeCompare(day(b.due_date!)))[0] ?? null;
}

/**
 * الجرعةُ المستحقّة التي يستهلكها «انعطى اليوم»: أقربُ جرعةٍ غيرِ معطاة لنفس اللقاح موعدُها
 * حتى ٣٠ يوماً بعد اليوم (متأخرةً كانت أو مبكّرة). بلا موعدٍ = خطّةٌ بلا تاريخ: تُستهلك أيضاً.
 */
export function pendingToConsume(series: readonly Vaccination[], name: string, todayISO: string): Vaccination | null {
  const limit = addInterval(todayISO, { days: CONSUME_AHEAD_DAYS });
  return series
    .filter((v) => v.status !== "administered" && sameVaccine(v.name, name) && (!isDay(v.due_date) || day(v.due_date!) <= limit))
    .sort((a, b) => (isDay(a.due_date) ? day(a.due_date!) : "0000").localeCompare(isDay(b.due_date) ? day(b.due_date!) : "0000"))[0] ?? null;
}

