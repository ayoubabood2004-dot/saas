import type { TreatmentEntry } from "@/types";
export type { TreatmentDropResult } from "@/types";

/* ============================================================================
 * treatmentDrop — حذفُ دواءٍ من الخطة: ما ينحذف وما يبقى (قرارُ المالك D1/D2).
 *
 * مرآةُ `drop_treatment_drug` (0238) شرطاً بشرط: الواجهةُ تعرض العددَ والأسماءَ قبل الضغط،
 * والنسخةُ التجريبية تحذف بها — فإن افترق الشرطان قال الزرُّ «احذف ٥» وحذف الخادمُ أربعاً،
 * أو حذفت التجريبيةُ ما يرفضه الخادم فأخفت العطل. ويقارنهما `treatment-drop-parity` بالحزمة.
 *
 *   النطاق:  صفوفُ الزيارة لنفس الدواء (اسماً حرفياً) من نوع «دواء»، يومُه = اليوم («بس»)
 *            أو ≥ اليوم («وطالع»).
 *   ينحذف:   المنتظرُ منها — لا المعطى، ولا الفائتُ المحسوم («ما انطت»)، ولا ما له نتيجة —
 *            و«وطالع» من يومٍ فات يبدأ من اليوم (الفائتُ يُسجَّل من «الجرعات الي فاتت»).
 *   يبقى:    المعطاة (`keptGiven`) والفائتةُ قبل اليوم (`keptPast`).
 * و«بس» على يومٍ فات مقفول (`pastDayBlocked`) كما يرفضه الخادم بـdrop_past_day.
 * بلا React وبلا repo — `repo.ts` لا يستوردها (وزنُ الإقلاع).
 * ==========================================================================*/

export type DropScope = "day" | "rest";

/** علامةُ «ما انطت» من نافذة الجرعات الفائتة — `PAST_MISS_REASON` بـbackdate.ts حرفاً (والخادمُ بنصّه). */
export const SETTLED_MISS = "past:not_given";

/* ── «إضافة دواء» تُعاد بلا تكرار ──────────────────────────────────────────
 * الكتابةُ تصل والجوابُ يضيع (شبكةٌ ضعيفة) ⇒ «تعذّر الحفظ» والنافذةُ بما فيها ⇒ الضغطةُ الثانية كانت
 * تُدخل الدفعةَ ثانيةً: جرعتان «أُعطيت» بنفس الدقيقة، وكلُّ يومٍ باقٍ بصفّين (مسكّنٌ بجرعةٍ مضاعفة).
 * فالمعرّفاتُ من المُرسِل: نفسُ المحاولة (نفسُ ما كُتب) ⇒ نفسُ المعرّفات، والخادمُ `on conflict (id) do
 * nothing`. وما تغيّر بعد فشل ⇒ معرّفاتٌ جديدة، والسابقةُ تُسأل القاعدةُ عنها أوّلاً (`check`) — فإن
 * وصلت لا يُكتب الجديدُ فوقها بصمت. */
export interface AddAttempt { sig: string; ids: string[] }
export function addAttemptIds(prev: AddAttempt | null, sig: string, n: number, mk: () => string): { ids: string[]; check: string[] } {
  if (prev && prev.sig === sig && prev.ids.length === n) return { ids: prev.ids, check: [] };
  return { ids: Array.from({ length: n }, () => mk()), check: prev ? prev.ids.slice() : [] };
}

export interface DropPlan {
  /** الصفوفُ التي ستنحذف، بترتيب اليوم ثم الساعة. */
  targets: TreatmentEntry[];
  keptGiven: number;
  keptPast: number;
  /** أوّلُ يومٍ وآخرُه بين ما ينحذف (null إن لا شيء). */
  from: string | null;
  to: string | null;
  /** «من هذا اليوم بس» على يومٍ فات — مقفولةٌ كالخادم. */
  pastDayBlocked: boolean;
}

export function dropTargets(
  rows: readonly TreatmentEntry[],
  o: { visitId: string; medication: string; day: string; scope: DropScope; today: string },
): DropPlan {
  const pastDayBlocked = o.scope === "day" && o.day < o.today;
  const from = o.scope === "day" ? o.day : (o.day > o.today ? o.day : o.today);
  const scope = rows.filter((r) =>
    r.visit_id === o.visitId && r.medication === o.medication && (r.task_type ?? "drug") === "drug"
    && (o.scope === "day" ? r.day === o.day : r.day >= o.day));
  const targets = pastDayBlocked ? [] : scope
    .filter((r) => !r.administered_at && (r.missed_reason ?? "") !== SETTLED_MISS && String(r.result ?? "") === ""
      && (o.scope === "day" ? r.day === o.day : r.day >= from))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? "") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    targets,
    keptGiven: scope.filter((r) => !!r.administered_at).length,
    keptPast: scope.filter((r) => !r.administered_at && r.day < o.today).length,
    from: targets.length ? targets[0].day : null,
    to: targets.length ? targets[targets.length - 1].day : null,
    pastDayBlocked,
  };
}

/** تلميحاتُ 0238 حرفاً بحرف (`raise … using hint`) — بمهارب يونيكود لأنها عقدٌ مع القاعدة
 *  لا نصٌّ يُترجم، ويفحص `treatment-drop-test` تطابقَها مع نصّ الهجرة. */
export const DROP_HINTS = {
  no_clinic: "\u0644\u0627 \u0639\u064a\u0627\u062f\u0629\u064e \u0644\u0644\u062c\u0644\u0633\u0629 \u2014 \u0633\u062c\u0651\u0644 \u062f\u062e\u0648\u0644 \u0645\u0646 \u062c\u062f\u064a\u062f.",
  bad_ops: "\u0637\u0644\u0628\u064c \u063a\u064a\u0631 \u0645\u0641\u0647\u0648\u0645 \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629.",
  visit_gone: "\u0627\u0644\u0632\u064a\u0627\u0631\u0629 \u0645\u0627 \u0639\u0627\u062f\u062a \u0645\u0648\u062c\u0648\u062f\u0629 \u0628\u0639\u064a\u0627\u062f\u062a\u0643 \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629.",
  visit_ended: "\u0627\u0644\u0632\u064a\u0627\u0631\u0629 \u0645\u0633\u0643\u0651\u0631\u0629 \u2014 \u0645\u0627 \u064a\u0646\u062d\u0630\u0641 \u0645\u0646\u0647\u0627 \u0634\u064a.",
  drop_past_day: "\u064a\u0648\u0645 \u0641\u0627\u062a: \u0633\u062c\u0651\u0644 \u062c\u0631\u0639\u0627\u062a\u0647 \u0623\u0648\u0644\u0627\u064b \u0645\u0646 \u00ab\u0627\u0644\u062c\u0631\u0639\u0627\u062a \u0627\u0644\u064a \u0641\u0627\u062a\u062a\u00bb \u2014 \u0627\u0644\u062d\u0630\u0641 \u0645\u0646 \u0627\u0644\u064a\u0648\u0645 \u0648\u0637\u0627\u0644\u0639 \u0628\u0633.",
  drop_nothing: "\u0645\u0627 \u0627\u0646\u062d\u0630\u0641 \u0634\u064a \u2014 \u0627\u0644\u062c\u0631\u0639\u0627\u062a \u0627\u0646\u0639\u0637\u062a \u0623\u0648 \u062a\u063a\u064a\u0651\u0631\u062a \u0645\u0646 \u062c\u0647\u0627\u0632 \u062b\u0627\u0646\u064a. \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629.",
  dose_given_keep: "\u0647\u0630\u064a \u0627\u0644\u062c\u0631\u0639\u0629 \u0645\u0639\u0637\u0627\u0629 \u2014 \u0645\u0627 \u062a\u0646\u062d\u0630\u0641. \u0625\u0630\u0627 \u0627\u0646\u0633\u062c\u0651\u0644\u062a \u0628\u0627\u0644\u063a\u0644\u0637: \u00ab\u062a\u0631\u0627\u062c\u0639 \u0639\u0646 \u0627\u0644\u0625\u0639\u0637\u0627\u0621\u00bb \u0623\u0648\u0651\u0644\u0627\u064b.",
} as const;
export type DropErrorCode = keyof typeof DROP_HINTS;

/** خطأٌ بشكل خطأ الخادم كما يصل من PostgREST: `message` = الرمز، و`code` = P0001 (وP0002 لـ
 *  «الزيارة ما عادت موجودة»)، و`hint` = الشرح العربيّ — فيقرؤه `describeDbError` كرفض القاعدة. */
export class TreatmentDropError extends Error {
  code: string;
  hint: string;
  constructor(reason: DropErrorCode) {
    super(reason);
    this.name = "TreatmentDropError";
    this.code = reason === "visit_gone" ? "P0002" : "P0001";
    this.hint = DROP_HINTS[reason];
  }
}
