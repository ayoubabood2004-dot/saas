import type { PetNote } from "@/types";
import { BODY_SYSTEMS, type Diagnosis } from "./diagnoses";
import { parseClinical, encodeClinical, type ClinicalRecord } from "./clinicalRecord";
import { addInterval, isDay } from "./backdate";

/* ============================================================================
 * معلوماتُ الحالة عند الدخول — ما يُعرف عن الحيوان لحظةَ وصوله، قبل أيّ زيارة:
 * التاريخُ المرضي (شنو صار، ومن كم يوم)، والتشخيصُ الأوّلي، والعلامات.
 * نقيّةٌ ومفحوصةٌ بـ`scripts/intake-test.mjs`.
 *
 * القياسُ قبل البناء (٦/١٠، آخر ٣٠ يوماً): ٢٧٩ حالة دخول، ٨٤ منها بسببٍ مكتوب، وقراءاتُ
 * الدخول استُعملت مرّةً واحدة — و٥٩ حالةً فقط انفتحت لها طبلةٌ خلال ثلاثة أيام. فالمعلومةُ
 * لا تُعلَّق على الطبلة وحدها (أغلبُ الحالات بلا طبلة): تُحفظ **بملفّ الحيوان فوراً**،
 * و**تنتقل لأوّل زيارةٍ أو طبلةٍ تُفتح بعدها** فتظهر فيها وتعبّي معالجَ التشخيص.
 *
 * الشكلُ: ملاحظةٌ منظّمة بنفس صيغة «التشخيص وخطة العلاج» (CLINRX1) بنوع `intake` —
 * فكلُّ مكانٍ يعرض الملاحظات يعرضها بطاقةً لا نصّاً خامّاً، بلا مسارٍ ثانٍ. والعلاماتُ
 * معرّفاتُ نفس كتالوج المعالج (SYMPTOMS) — فما يُختار عند الدخول هو ما يجده الطبيبُ
 * مؤشَّراً حين يفتح المعالج، لا نصٌّ يُعاد إدخاله.
 * ========================================================================= */

export interface IntakeDraft {
  /** شنو صار — بكلام صاحب الحيوان أو الطبيب. */
  history: string;
  /** صارلها كم يوم (٠ = اليوم). null = ما معروف. */
  sinceDays: number | null;
  /** التشخيصُ الأوّلي — نصٌّ حرّ أو من القائمة. */
  diagnosis: string;
  /** العلامات: معرّفاتُ كتالوج SYMPTOMS، ووصفُها. */
  signs: string[];
  qualifiers: Record<string, Record<string, string>>;
}

export const emptyIntake = (): IntakeDraft => ({ history: "", sinceDays: null, diagnosis: "", signs: [], qualifiers: {} });

/** أطولُ مدّةٍ تُقبل — سنةٌ تكفي حالةً مزمنة، وأكثرُ منها غلطُ إدخال. */
export const MAX_SINCE_DAYS = 365;

/** مدّةٌ صالحة أو null: عددٌ صحيح بين ٠ والحدّ. */
export function cleanSince(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= MAX_SINCE_DAYS ? n : null;
}

export const isEmptyIntake = (d: IntakeDraft): boolean =>
  !d.history.trim() && cleanSince(d.sinceDays) === null && !d.diagnosis.trim() && d.signs.length === 0;

/** يومُ بداية الأعراض: يومُ الدخول ناقص المدّة — «صارلها ٣ أيام» يوم ٦/١٠ = بدأت ٣/١٠. */
export function onsetDay(admittedOn: string, sinceDays: number | null): string | null {
  const n = cleanSince(sinceDays);
  if (n === null || !isDay(admittedOn)) return null;
  return addInterval(admittedOn, { days: -n });
}

/**
 * التشخيصُ الأوّلي بصيغة المعالج: إن طابق اسماً من كتالوج الأجهزة أخذ جهازَه،
 * وإلا فـ«عام / أخرى» — والشدّةُ «متوسط» افتراضياً (الطبيبُ يعدّلها بالمعالج).
 */
export function diagnosisOf(text: string): Diagnosis | null {
  const name = text.trim();
  if (!name) return null;
  const low = name.toLowerCase();
  const sys = BODY_SYSTEMS.find((s) => s.diseases.some((d) => d.toLowerCase() === low));
  return { system: sys?.id ?? "general", disease: name, severity: "moderate" };
}

/** السجلُّ المنظّم الذي يُحفظ ملاحظةً بملفّ الحيوان. */
export function intakeRecord(d: IntakeDraft, admittedOn: string): ClinicalRecord {
  const since = cleanSince(d.sinceDays);
  const dx = diagnosisOf(d.diagnosis);
  const rec: ClinicalRecord = { v: 1, kind: "intake" };
  const history = d.history.trim();
  if (history || since !== null) {
    rec.intake = {
      ...(history ? { history } : {}),
      ...(since !== null ? { sinceDays: since, onset: onsetDay(admittedOn, since) ?? undefined } : {}),
    };
  }
  if (d.signs.length) {
    rec.symptoms = [...new Set(d.signs)];
    const q = Object.fromEntries(Object.entries(d.qualifiers).filter(([k, v]) => rec.symptoms!.includes(k) && Object.keys(v).length));
    if (Object.keys(q).length) rec.qualifiers = q;
  }
  if (dx) rec.diagnoses = [dx];
  return rec;
}

/** سطرٌ مقروءٌ لنفس السجلّ — للطباعة والتصدير وكلّ عارضٍ نصّيّ. */
export function intakeText(d: IntakeDraft, signLabel: (id: string) => string, words: {
  history: string; since: (n: number) => string; diagnosis: string; signs: string; sep?: string;
}): string {
  const lines: string[] = [];
  const since = cleanSince(d.sinceDays);
  const history = d.history.trim();
  if (history || since !== null) lines.push(`${words.history}: ${[history, since !== null ? words.since(since) : ""].filter(Boolean).join(" — ")}`);
  if (d.diagnosis.trim()) lines.push(`${words.diagnosis}: ${d.diagnosis.trim()}`);
  if (d.signs.length) lines.push(`${words.signs}: ${d.signs.map(signLabel).join(words.sep ?? ", ")}`);
  return lines.join("\n");
}

/** الملاحظةُ بصيغتها المخزّنة. */
export function encodeIntake(d: IntakeDraft, admittedOn: string, human: string): string {
  return encodeClinical(intakeRecord(d, admittedOn), human);
}

export const isIntake = (rec: ClinicalRecord | null | undefined): boolean => rec?.kind === "intake";

/** كم يوماً تبقى معلوماتُ الدخول تنتظر أوّلَ زيارة — بعدها هي تاريخٌ لا حالةٌ مفتوحة. */
export const ATTACH_WINDOW_DAYS = 14;

/**
 * معلوماتُ الدخول التي تنتظر أوّلَ زيارة: ملاحظاتُ intake بلا زيارة، أحدثُها أوّلاً، خلال
 * النافذة. تُربط **كلُّها** بأوّل زيارةٍ تُفتح (حيوانٌ دخل مرّتين قبل أن تُفتح له طبلة
 * يحمل الدخولين).
 */
export function pendingIntakes(notes: PetNote[], now: Date = new Date()): PetNote[] {
  const cutoff = now.getTime() - ATTACH_WINDOW_DAYS * 86400000;
  return notes
    .filter((n) => !n.visit_id && isIntake(parseClinical(n.note_text).record) && new Date(n.created_at).getTime() >= cutoff)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** ما يعبّي معالجَ التشخيص من معلومات الدخول (أحدثُها يغلب). */
export function wizardSeed(records: ClinicalRecord[]): { symptoms: string[]; qualifiers: Record<string, Record<string, string>>; diagnoses: Diagnosis[]; notes: string } | null {
  const intakes = records.filter(isIntake);
  if (!intakes.length) return null;
  const symptoms = [...new Set(intakes.flatMap((r) => r.symptoms ?? []))];
  const qualifiers = Object.assign({}, ...intakes.slice().reverse().map((r) => r.qualifiers ?? {}));
  const seen = new Set<string>();
  const diagnoses = intakes.flatMap((r) => r.diagnoses ?? []).filter((d) => !seen.has(d.disease) && seen.add(d.disease));
  const notes = intakes.map((r) => r.intake?.history).filter(Boolean).join("\n");
  return { symptoms, qualifiers, diagnoses, notes };
}
