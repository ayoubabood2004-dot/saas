// ============================================================================
// ملخّصُ الحالة — كلُّ ما بسجلّ الحيوان المتفرّق بمكانٍ واحد (طلبُ المالك ٢٢/١١).
//
// «اللقاحات شنو ماخذ أو لا، العلاجات هل ماخذها أو لا، الزيارات، ملاحظات الدكتور، وشوكت دخل وشوكت طلع بكلّ مرّة —
// هاي الأشياء كلّها متفرّقة داخل سجلّ الحيوان، أريد كلّهن تجمعهن بسكشن اسمه الملخّص، وقابليّة إنه ينطبع».
//
// صِرفٌ بلا React ولا نصوص (الشاشةُ وورقةُ الطباعة تسمّيان من نطاقيهما): يأخذ ما حمّلته صفحةُ الحيوان أصلاً ويعطي
// أقساماً محسوبة — ولا يخترع شيئاً: الجرعةُ «انطت» بختمها (administered_at)، و«فاتت» بعلامتها المحسومة
// (isSettledMiss — لا أيُّ سببِ فوات: «أُجّلت» معناها ما انطت بعد)، والباقي قبل اليوم «متأخّرة» تنتظر قراراً،
// واليومُ «مستحقّة»، وبعده «قادمة» — حالاتُ الطبلة نفسُها (VisitPage doseStatus). والإقامةُ من الدخول
// (admitted_on/discharged_on) وساعاتُها من سجلّ الحركة إن وُجد. و`range` يقصره على إقامةٍ (ورقةُ القفص).
// ============================================================================
import type {
  Admission, Appointment, ClinicVisit, DoseRoute, LabResult, MediaItem, MedicalVisit, PetMovement, PetNote,
  TreatmentEntry, Vaccination, WeightLog,
} from "@/types";
import { isSettledMiss } from "./backdate";
import { parseClinical } from "./clinicalRecord";
import { isProtocolMark } from "./protocolMark";
import { localISO } from "./utils";

export type DoseState = "given" | "missed" | "overdue" | "due" | "upcoming";

/** حالةُ الجرعة كما تقرؤها الطبلة: ختمُ الإعطاء أوّلاً، ثمّ «ما انطت» المحسومة، ثمّ باليوم. */
export function doseState(t: Pick<TreatmentEntry, "administered_at" | "missed_reason" | "day">, today: string): DoseState {
  if (t.administered_at) return "given";
  if (isSettledMiss(t as TreatmentEntry, today)) return "missed";
  return t.day < today ? "overdue" : t.day === today ? "due" : "upcoming";
}

/** دواءٌ وحده (لا سوائلُ ولا متابعات) — «تم العلاج» حقُّ الأدوية (VisitPage isGivable). */
export const isDrugEntry = (t: Pick<TreatmentEntry, "task_type">): boolean => (t.task_type ?? "drug") === "drug";

export interface MedLine {
  key: string;
  name: string;
  route: DoseRoute | null;
  /** المقاديرُ كما كُتبت، بترتيب أوّلِ ظهور (دواءٌ تغيّر مقدارُه يُرى بمقداريه). */
  amounts: string[];
  firstDay: string;
  lastDay: string;
  total: number;
  given: number;
  missed: number;
  overdue: number;
  /** مستحقّةٌ اليوم أو قادمة. */
  pending: number;
  lastGivenAt: string | null;
  /** أوّلُ زيارةٍ مربوطةٍ بجرعاته — رابطُ الطبلة. */
  visitId: string | null;
}
export interface DoseRow {
  id: string; day: string; time: string; name: string; amount: string; route: DoseRoute | null;
  state: DoseState; at: string | null; by: string | null; missedReason: string | null; visitId: string | null;
}
export interface StayRow {
  id: string; kind: Admission["kind"]; inDay: string; outDay: string | null;
  /** ساعةُ الدخول والخروج من سجلّ الحركة (`admitted`/`discharged`) — غيابُه = اليومُ وحده. */
  inAt: string | null; outAt: string | null;
  days: number; cage: string | null; reason: string | null; outcome: Admission["outcome"] | null; active: boolean;
}
export interface NoteRow { id: string; at: string; author: string | null; text: string; diagnoses: string[]; visitId: string | null }

export interface CaseInput {
  vaccines: Vaccination[];
  treatments: TreatmentEntry[];
  clinicVisits: ClinicVisit[];
  visits: MedicalVisit[];
  admissions: Admission[];
  movements?: PetMovement[];
  notes: PetNote[];
  labs: LabResult[];
  media: MediaItem[];
  appointments: Appointment[];
  weights: WeightLog[];
}
export interface CaseRange { from: string; to: string }
export interface CaseModel {
  range: CaseRange | null;
  current: StayRow | null;
  stays: StayRow[];
  meds: MedLine[];
  /** الجرعاتُ الدوائيّة بترتيب الزمن — سجلُّ «شنو الجرع اللي انطت». */
  doses: DoseRow[];
  totals: { meds: number; doses: number; given: number; missed: number; overdue: number; pending: number };
  vaccines: { given: Vaccination[]; due: Vaccination[]; overdue: Vaccination[] };
  visits: ClinicVisit[];
  soap: MedicalVisit[];
  notes: NoteRow[];
  labs: LabResult[];
  media: number;
  weight: { last: WeightLog | null; prev: WeightLog | null };
  upcoming: Appointment[];
  /** تشخيصاتُ الملاحظات السريرية بالمدى، بلا تكرار وبترتيب الظهور. */
  diagnoses: string[];
}

/** اليومُ المحلّيّ لختمٍ زمنيّ (لا `slice(0,10)` — ذاك يومُ غرينتش، درسُ 0265). يومٌ مكتوبٌ يومياً يبقى كما هو. */
export function dayOf(ts: string | null | undefined): string {
  if (!ts) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : localISO(d);
}

/** مدى إقامةٍ: من يوم الدخول إلى يوم الخروج، أو اليوم إن كانت قائمة. */
export function stayRange(a: Pick<Admission, "admitted_on" | "discharged_on">, today: string): CaseRange {
  return { from: dayOf(a.admitted_on), to: a.discharged_on ? dayOf(a.discharged_on) : today };
}

const within = (day: string, r: CaseRange | null) => !r || (day >= r.from && day <= r.to);
const daysBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000) + 1);

/** ملاحظةٌ يكتبها الطبيب لا ما يكتبه النظام: علاماتُ البروتوكول وملاحظاتُ اليوم («⟦D:») خارجها (VisitPage). */
export const isDoctorNote = (text: string): boolean => !!text.trim() && !isProtocolMark(text) && !text.startsWith("⟦D:");

export function buildCaseModel(inp: CaseInput, opts: { today: string; now?: string; range?: CaseRange | null }): CaseModel {
  const today = opts.today;
  const now = opts.now ?? new Date().toISOString();
  const range = opts.range ?? null;

  // ── الإقامات (الأحدثُ أوّلاً)، وساعاتُها من سجلّ الحركة ──
  const moves = inp.movements ?? [];
  const stays: StayRow[] = inp.admissions
    .filter((a) => a.admitted_on)
    .map((a) => {
      const inDay = dayOf(a.admitted_on);
      const outDay = a.discharged_on ? dayOf(a.discharged_on) : null;
      const mine = moves.filter((m) => m.admission_id === a.id).sort((x, y) => x.at.localeCompare(y.at));
      return {
        id: a.id, kind: a.kind, inDay, outDay,
        inAt: mine.find((m) => m.event === "admitted")?.at ?? null,
        outAt: [...mine].reverse().find((m) => m.event === "discharged")?.at ?? null,
        days: daysBetween(inDay, outDay ?? today), cage: a.cage?.trim() || null,
        reason: a.reason?.trim() || null, outcome: a.outcome ?? null, active: a.status === "active",
      };
    })
    .filter((s) => !range || (s.inDay <= range.to && (s.outDay ?? today) >= range.from))
    .sort((x, y) => y.inDay.localeCompare(x.inDay) || Number(y.active) - Number(x.active));
  const current = stays.find((s) => s.active) ?? null;

  // ── الأدوية والجرعات ──
  const drugEntries = inp.treatments
    .filter((t) => isDrugEntry(t) && t.medication?.trim() && within(t.day, range))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? ""));
  const doses: DoseRow[] = drugEntries.map((t) => ({
    id: t.id, day: t.day, time: t.time ?? "", name: t.medication.trim(), amount: (t.amount ?? "").trim(), route: t.route ?? null,
    state: doseState(t, today), at: t.administered_at ?? null, by: t.administered_by ?? null,
    missedReason: t.missed_reason ?? null, visitId: t.visit_id ?? null,
  }));
  const medMap = new Map<string, MedLine>();
  for (const d of doses) {
    const key = d.name.toLowerCase();
    const m = medMap.get(key) ?? {
      key, name: d.name, route: d.route, amounts: [], firstDay: d.day, lastDay: d.day,
      total: 0, given: 0, missed: 0, overdue: 0, pending: 0, lastGivenAt: null, visitId: d.visitId,
    };
    m.total++;
    if (d.amount && !m.amounts.includes(d.amount)) m.amounts.push(d.amount);
    if (!m.route && d.route) m.route = d.route;
    if (!m.visitId && d.visitId) m.visitId = d.visitId;
    m.lastDay = d.day;
    if (d.state === "given") { m.given++; if (d.at && (!m.lastGivenAt || d.at > m.lastGivenAt)) m.lastGivenAt = d.at; }
    else if (d.state === "missed") m.missed++;
    else if (d.state === "overdue") m.overdue++;
    else m.pending++;
    medMap.set(key, m);
  }
  const meds = [...medMap.values()].sort((a, b) => b.lastDay.localeCompare(a.lastDay) || a.name.localeCompare(b.name));
  const sum = (k: "given" | "missed" | "overdue" | "pending") => meds.reduce((s, m) => s + m[k], 0);

  // ── اللقاحات: المعطاةُ بالمدى، والقادمةُ والمتأخّرةُ اليوم (لا تُقصر — هي ما ينتظر الحيوان) ──
  const vGiven = inp.vaccines
    .filter((v) => v.status === "administered" && v.administered_at && within(dayOf(v.administered_at), range))
    .sort((a, b) => dayOf(b.administered_at).localeCompare(dayOf(a.administered_at)));
  const vOpen = inp.vaccines.filter((v) => v.status !== "administered");
  const vOverdue = vOpen.filter((v) => v.status === "overdue" || (!!v.due_date && dayOf(v.due_date) < today))
    .sort((a, b) => dayOf(a.due_date).localeCompare(dayOf(b.due_date)));
  const vDue = vOpen.filter((v) => !vOverdue.includes(v)).sort((a, b) => dayOf(a.due_date).localeCompare(dayOf(b.due_date)));

  // ── الزيارات والملاحظات والتحاليل ──
  const visits = inp.clinicVisits.filter((v) => within(dayOf(v.opened_at), range)).sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  const soap = inp.visits.filter((v) => within(dayOf(v.visit_date), range)).sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  const diagnoses: string[] = [];
  const notes: NoteRow[] = inp.notes
    .filter((n) => isDoctorNote(n.note_text) && within(dayOf(n.created_at), range))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((n) => {
      const { record, text } = parseClinical(n.note_text);
      const dx = (record?.diagnoses ?? []).map((d) => d.disease).filter(Boolean);
      for (const d of dx) if (!diagnoses.includes(d)) diagnoses.push(d);
      return { id: n.id, at: n.created_at, author: n.author_name ?? null, text: (text || record?.intake?.history || "").trim(), diagnoses: dx, visitId: n.visit_id ?? null };
    })
    .filter((n) => n.text || n.diagnoses.length);
  const labs = inp.labs.filter((l) => within(dayOf(l.taken_at), range)).sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  const media = inp.media.filter((m) => within(dayOf(m.created_at), range)).length;

  // ── الوزن (آخرُ قياسين)، والمواعيدُ القادمة ──
  const ws = [...inp.weights].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  const upcoming = inp.appointments
    .filter((a) => a.scheduled_at >= now && a.status !== "cancelled" && a.status !== "done" && a.status !== "no_show")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  return {
    range, current, stays, meds, doses,
    totals: { meds: meds.length, doses: doses.length, given: sum("given"), missed: sum("missed"), overdue: sum("overdue"), pending: sum("pending") },
    vaccines: { given: vGiven, due: vDue, overdue: vOverdue },
    visits, soap, notes, labs, media,
    weight: { last: ws[0] ?? null, prev: ws[1] ?? null },
    upcoming, diagnoses,
  };
}
