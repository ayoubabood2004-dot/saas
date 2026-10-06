import type { TreatmentEntry, Vaccination } from "@/types";
import { localISO } from "./utils";
import { statusForDue } from "./vaccineDue";

/* ============================================================================
 * التسجيلُ بتاريخٍ سابق — زيارةٌ وجرعاتٌ ولقاحاتٌ صارت قبل ما تنكتب بالسستم
 * (ورقٌ قديم، سستمٌ سابق، أو حيوانٌ يعرف الطبيبُ تاريخَه). نقيّةٌ ومفحوصةٌ
 * بـ`scripts/backdate-test.mjs`.
 *
 * القياسُ قبل البناء (٦/١٠): العياداتُ ما كانت تسجّل تاريخاً سابقاً لأن الشاشات
 * ما تسمح — زيارةُ الملفّ تنفتح بـ«هسّة» (٠ من ٣٠٤ زيارة بتاريخٍ أقدم من إنشائها)،
 * واللقاحُ «انعطى اليوم» وحده (صفٌّ واحد من ١٢١٢ بطريقةٍ ملتوية). والخطةُ أصلاً
 * تبدأ من `opened_at`، فزيارةٌ بتاريخٍ سابق تبني خطّتها على أيّامها هي.
 *
 * ثلاثُ قواعد تحكم الباقي:
 *   ١) **كلُّ جرعةٍ تُختم بيومها لا بيوم إدخالها.** جرعةُ ١/٩ إذا انعلّمت «انطت»
 *      اليوم تُكتب ١/٩ بوقتها المجدول — لا ٦/١٠ الساعة هسّة.
 *   ٢) **الفائتُ يُحسم لا يُترك.** الجرعةُ القديمة إمّا انطت (بيومها) أو ما انطت
 *      (فواتٌ موثّق) — جرعةٌ بلا قرار تبقى «متأخرة» حمراء للأبد بكلّ لوحة.
 *   ٣) **التاريخُ محلّيّ.** عمودُ `administered_at` باللقاحات `date`: كتابةُ
 *      `toISOString()` فيه تحفظ يومَ غرينتش، فلقاحٌ بعد منتصف الليل ببغداد
 *      ينكتب أمس (مقيس: ٣ صفوف). اليومُ يُكتب `YYYY-MM-DD` محلّياً.
 * ========================================================================= */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** يومٌ حقيقيّ بصيغة YYYY-MM-DD (يرفض ٣١ شباط). */
export function isDay(s: string | null | undefined): s is string {
  if (!s || !DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** وقتٌ HH:MM بنظام ٢٤ ساعة. */
export const isClock = (s: string | null | undefined): s is string => !!s && TIME_RE.test(s);

/** أقدمُ يومٍ يُقبل لزيارةٍ أو لقاحٍ سابق — حارسٌ من سنةٍ مكتوبةٍ غلط (٢٠٠٦ بدل ٢٠٢٦). */
export const EARLIEST_DAY = "2000-01-01";

/**
 * لحظةُ زيارةٍ سابقة من يومٍ ووقتٍ محلّيّين — أو `null` إن لم تكن صالحة:
 * يومٌ أو وقتٌ غير حقيقيّ، أقدمُ من `EARLIEST_DAY`، أو **بالمستقبل** (تاريخٌ
 * سابق لا يتجاوز الآن؛ والزيارةُ القادمة موعدٌ لا زيارة).
 */
export function pastMoment(day: string, time: string, now: Date = new Date()): string | null {
  if (!isDay(day) || !isClock(time) || day < EARLIEST_DAY) return null;
  const at = new Date(`${day}T${time}:00`);
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) return null;
  return at.toISOString();
}

/**
 * سُجّلت بعد يومها: يومُ الحدث المحلّيّ أقدمُ من يوم إدخاله. للشارة «سُجّلت لاحقاً».
 * و`minGapMs` للحظاتٍ من ساعتين مختلفتين (`opened_at` ساعةُ الجهاز و`created_at` ساعةُ
 * الخادم): جهازٌ متأخّرٌ دقائق يفتح زيارةً ٢٣:٥٨ والخادمُ يختم ٠٠:٠١ — يومان، وما
 * صارت «بتاريخٍ سابق».
 */
export function recordedLater(happenedISO: string | null | undefined, createdISO: string | null | undefined, minGapMs = 0): boolean {
  if (!happenedISO || !createdISO) return false;
  const happened = happenedISO.length === 10 ? happenedISO : localISO(new Date(happenedISO));
  const created = new Date(createdISO);
  if (Number.isNaN(created.getTime())) return false;
  if (minGapMs > 0 && happenedISO.length > 10 && created.getTime() - new Date(happenedISO).getTime() < minGapMs) return false;
  return happened < localISO(created);
}

/** فجوةُ «بتاريخٍ سابق» للزيارات: ساعةٌ تبتلع فرقَ ساعتي الجهاز والخادم. */
export const VISIT_LATE_GAP_MS = 60 * 60 * 1000;

/** يومُ لحظةٍ محلّياً، وساعتُها HH:MM. */
export const dayOf = (iso: string): string => localISO(new Date(iso));
export function clockOf24(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ------------------------------ الجرعات ---------------------------------- */

const isDrug = (t: TreatmentEntry) => (t.task_type ?? "drug") === "drug";

/** لحظةُ جرعةٍ بيومها: وقتُها المجدول، أو الظهر لجرعةٍ بلا وقت. */
export function doseMoment(t: Pick<TreatmentEntry, "day" | "time">): string {
  return new Date(`${t.day}T${isClock(t.time) ? t.time : "12:00"}:00`).toISOString();
}

/**
 * علامةُ «ما انطت» من نافذة الجرعات الفائتة — **رمزٌ ثابت** يُخزَّن بـ`missed_reason`
 * وتترجمه الشاشاتُ عند العرض (`missReasonText` بـflowsheet.ts)، لا نصٌّ بلغة الكاتب:
 * المطابقةُ عليه، فلا يتبدّل بتبديل اللغة. ولا يكفي «أيُّ سببِ فوات»: أسبابُ الجناح
 * (`MISS_REASONS`: «أُجّلت»، «خارج القفص»، «الدواء غير متوفّر») معناها «ما انطت
 * **بعد**» — جعلُها محسومةً كان يُسقط جرعةً مؤجّلةً من كلّ لوحةٍ بمنتصف الليل.
 */
export const PAST_MISS_REASON = "past:not_given";

/** جرعةٌ فائتةٌ حُسمت بـ«ما انطت» من نافذة الجرعات الفائتة: قبل اليوم، غيرُ معطاة، وبعلامتها هي. */
export function isSettledMiss(t: TreatmentEntry, todayISO: string): boolean {
  return !t.administered_at && t.missed_reason?.trim() === PAST_MISS_REASON && t.day < todayISO;
}

/**
 * الجرعاتُ الفائتة التي تنتظر قراراً: أدويةٌ قبل اليوم، لا انطت ولا حُسمت (المؤجّلةُ بالجناح منها) —
 * بترتيب اليوم ثم الساعة. السوائلُ والمتابعات (حرارة، أكل…) خارجها: تُسجَّل بقيمتها
 * من مصفوفة الرعاية لا بعلامة «انطت».
 */
export function pendingPast(rows: TreatmentEntry[], todayISO: string): TreatmentEntry[] {
  return rows
    .filter((t) => isDrug(t) && !t.administered_at && t.day < todayISO && !isSettledMiss(t, todayISO))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.time || "99:99").localeCompare(b.time || "99:99"));
}

export interface PastDecision { id: string; given: boolean }
export interface PastWrite { id: string; given: boolean; at?: string }

/**
 * قراراتُ الجرعات الفائتة ⇒ ما يُكتب: المعلَّمةُ «انطت» بلحظتها المجدولة بيومها،
 * والباقيةُ «ما انطت» (فواتٌ موثّق). صفٌّ غيرُ موجود بالقائمة يُسقَط — لا يُكتب
 * قرارٌ على جرعةٍ ما عُرضت.
 */
export function pastWrites(rows: TreatmentEntry[], decisions: PastDecision[]): PastWrite[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: PastWrite[] = [];
  for (const d of decisions) {
    const r = byId.get(d.id);
    if (!r) continue;
    out.push(d.given ? { id: r.id, given: true, at: doseMoment(r) } : { id: r.id, given: false });
  }
  return out;
}

/**
 * متى تنغلق زيارةٌ سابقة افتراضياً: آخرُ جرعةٍ معطاة، وإلا آخرُ يومٍ بالخطة (ظهراً)،
 * وإلا لحظةُ فتحها — ولا تتجاوز الآن ولا تسبق الفتح.
 */
export function suggestedEnd(openedISO: string, rows: TreatmentEntry[], now: Date = new Date()): string {
  const opened = new Date(openedISO).getTime();
  let best = opened;
  for (const r of rows) {
    const at = r.administered_at ? new Date(r.administered_at).getTime() : new Date(doseMoment(r)).getTime();
    if (!Number.isNaN(at) && at > best) best = at;
  }
  return new Date(Math.min(Math.max(best, opened), now.getTime())).toISOString();
}

/** لحظةُ إغلاقٍ صالحة: بين الفتح والآن — وإلا `null`. */
export function endMoment(day: string, time: string, openedISO: string, now: Date = new Date()): string | null {
  const at = pastMoment(day, time, now);
  if (!at) return null;
  // بدقّة الدقيقة: الحقلُ بلا ثوانٍ، والفتحُ بثوانيه — الافتراضيُّ «لحظة الفتح» نفسها
  // كان يُرفض لأنه أقدمُ منها بثوانٍ.
  const opened = Math.floor(new Date(openedISO).getTime() / 60000) * 60000;
  return new Date(at).getTime() < opened ? null : at;
}

/* ------------------------------ اللقاحات --------------------------------- */

export interface Interval { days?: number; months?: number; years?: number }

/** يومٌ + مدّة (أيام/أشهر/سنوات) — بحساب التقويم، لا بضرب ٨٦٤٠٠٠٠٠. */
export function addInterval(dayISO: string, iv: Interval): string {
  const [y, m, d] = dayISO.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (iv.years) dt.setUTCFullYear(dt.getUTCFullYear() + iv.years);
  if (iv.months) dt.setUTCMonth(dt.getUTCMonth() + iv.months);
  if (iv.days) dt.setUTCDate(dt.getUTCDate() + iv.days);
  return dt.toISOString().slice(0, 10);
}

/** تواريخُ تلقيحٍ سابقة نظيفة: حقيقيةٌ، لا بالمستقبل، لا أقدمُ من الحدّ، بلا تكرار، تصاعدياً. */
export function cleanHistory(dates: (string | null | undefined)[], todayISO: string): string[] {
  const set = new Set<string>();
  for (const d of dates) if (isDay(d) && d <= todayISO && d >= EARLIEST_DAY) set.add(d);
  return [...set].sort();
}

/** ما يمنع حفظَ سجلٍّ سابق — أو `null`. */
export type HistoryProblem = "empty" | "future" | "tooOld" | "nextNotAfterLast";
export function historyProblem(dates: (string | null | undefined)[], nextDue: string | null, todayISO: string): HistoryProblem | null {
  const filled = dates.filter((d): d is string => !!d && d.trim() !== "");
  if (filled.length === 0) return "empty";
  if (filled.some((d) => isDay(d) && d > todayISO)) return "future";
  if (filled.some((d) => !isDay(d) || d < EARLIEST_DAY)) return "tooOld";
  const clean = cleanHistory(filled, todayISO);
  if (nextDue && isDay(nextDue) && clean.length && nextDue <= clean[clean.length - 1]) return "nextNotAfterLast";
  return null;
}

export type VaxInsert = Omit<Vaccination, "id" | "pet_id" | "created_at">;

/**
 * صفوفُ سجلٍّ سابق للقاحٍ واحد: جرعةٌ معطاةٌ لكلّ تاريخ (بيومها، رقمُها بالترتيب،
 * بلا «من كم» لأن المجموعَ مجهول، وبلا طبيبٍ معطٍ لأن العيادةَ ما أعطته بالضرورة)،
 * ثم الموعدُ القادم إن وُجد — حالتُه من تاريخه: موعدٌ فات يُكتب «متأخر» فتطلع
 * العلامةُ الحمراء والتذكير صادقَين.
 */
export function historyRows(name: string, dates: string[], nextDue: string | null, todayISO: string): VaxInsert[] {
  const clean = cleanHistory(dates, todayISO);
  const rows: VaxInsert[] = clean.map((d, i) => ({
    name, status: "administered", administered_at: d, due_date: null,
    dose_number: i + 1, doses_total: null,
  }));
  if (nextDue && isDay(nextDue) && (!clean.length || nextDue > clean[clean.length - 1])) {
    rows.push({
      name, status: statusForDue(nextDue, todayISO), administered_at: null, due_date: nextDue,
      dose_number: clean.length + 1, doses_total: null,
    });
  }
  return rows;
}
