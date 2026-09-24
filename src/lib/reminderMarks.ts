/**
 * علاماتُ التذكير المشتركة بين الأجهزة (0208) — والحكمُ على حالة كلّ صفّ.
 *
 * الشكوى: «التذكيرات المتأخرة حتى لو يدزون رسائل فيها تضل متأخرة وما تروح».
 * والجذر: حالةُ الصفّ (أُرسلت، جاؤوا، ما جاؤوا) كانت تُحفظ **بمتصفّح الجهاز وحده**،
 * والجسرُ العابر للأجهزة سجلُّ الواتساب مطابَقاً بـ«الحيوان + النوع» — وصفحةُ الحملات
 * تسجّل رسائلَ التذكير بنوع `manual` منذ c3680c1، فلا تطابق شيئاً. فالتذكيرُ الذي أُرسل
 * يبقى أحمرَ على كلّ جهازٍ غير الذي أرسله.
 *
 * العلامةُ مربوطةٌ بـ(مفتاح الصفّ، تاريخ الاستحقاق): يتجدّد الموعد فلا تنطبق القديمة —
 * وهذا «الخطوةُ التالية» بلا اختلاق: التكرارُ اليدويّ يظهر بموعده القادم، والجرعةُ الجديدة
 * بتاريخها. و«تمّ التذكير» **لا يكتب شيئاً سريريّاً**: لا «أُعطيت الجرعة».
 */

import type { ReminderMark } from "@/types";
export type { ReminderMark };
export type MarkState = ReminderMark["state"];

export type LifeStatus = "active" | "sent" | "arrived" | "missed";

export const markKey = (rowKey: string, dueDate: string): string => `${rowKey}|${dueDate}`;

export function indexMarks(marks: readonly ReminderMark[]): Map<string, ReminderMark> {
  const m = new Map<string, ReminderMark>();
  for (const x of marks) m.set(markKey(x.row_key, x.due_date), x);
  return m;
}

/** اليومُ المحلّيّ لطابعٍ زمنيّ (YYYY-MM-DD). الخادمُ يرجع الوقتَ بـUTC، و`.slice(0, 10)`
 *  عليه يجعل إرسالاً بعد منتصف ليل بغداد بثلاث ساعاتٍ «أمس» — فتبدأ مهلةُ السماح قبل يومٍ
 *  على كلّ جهازٍ غير المُرسِل، ويختلف الجهازان على الحالة. */
export function localDay(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** العلامةُ نفسُها لهذا الصفّ بتاريخه — أو undefined. */
export function markOf(index: ReadonlyMap<string, ReminderMark>, rowKey: string, dueDate: string): ReminderMark | undefined {
  return index.get(markKey(rowKey, dueDate));
}

/** يومُ الإرسال المسجَّل على الخادم لهذا الصفّ بتاريخه (باليوم المحلّيّ) — أو null. */
export function serverSentDay(index: ReadonlyMap<string, ReminderMark>, rowKey: string, dueDate: string): string | null {
  const m = index.get(markKey(rowKey, dueDate));
  return m?.sent_at ? localDay(m.sent_at) : null;
}

/** «تمّ التذكير» لهذا الصفّ بتاريخه؟ */
export function isDone(index: ReadonlyMap<string, ReminderMark>, rowKey: string, dueDate: string): boolean {
  return index.get(markKey(rowKey, dueDate))?.state === "done";
}

export interface JudgeRow {
  kind: string;
  date: string;
  inDays: number;
  autoArrivedAt?: string | null;
  autoMissed?: boolean;
}

export interface JudgeCtx {
  /** «تمّ التذكير» من الخادم — لهذا الصفّ بتاريخه. */
  done: boolean;
  /** تثبيتُ الدكتور اليدويّ على هذا الجهاز (جاء / ما جاء) — إن خصّ هذا التاريخ. */
  localOutcome?: { s: "arrived" | "missed"; d: string } | null;
  /** يومُ الإرسال (محلّيّ أو من الخادم أو من السجلّ) — أو null. */
  sentAt: string | null;
  /** كم يوماً مضى على الإرسال (سالب = مضى). */
  sentAgoDays: number;
  graceDays: number;
}

/**
 * الحكمُ النهائيّ لكلّ صفّ. الترتيب:
 * ١) «تمّ التذكير» — قرارٌ صريحٌ مشترك بين الأجهزة، يعلو على كلّ ما سواه.
 * ٢) تثبيتُ الدكتور على هذا الجهاز، إن خصّ هذا التاريخ.
 * ٣) شهادةُ السستم (زيارةٌ بعد المتابعة، جرعةٌ أُعطيت) ثم غيابُه.
 * ٤) أُرسلت — وتصير «ما جاؤوا» بعد مهلة السماح من يوم الإرسال (إلا أعياد الميلاد).
 * ٥) وإلا فهو قيد المتابعة.
 */
export function judgeLifecycle(r: JudgeRow, c: JudgeCtx): { st: LifeStatus; done: boolean } {
  if (c.done) return { st: "arrived", done: true };
  if (c.localOutcome && c.localOutcome.d === r.date) return { st: c.localOutcome.s, done: false };
  if (r.autoArrivedAt) return { st: "arrived", done: false };
  if (r.autoMissed) return { st: "missed", done: false };
  if (c.sentAt && r.kind !== "birthday" && r.inDays < -c.graceDays && c.sentAgoDays <= -c.graceDays) return { st: "missed", done: false };
  if (c.sentAt) return { st: "sent", done: false };
  return { st: "active", done: false };
}
