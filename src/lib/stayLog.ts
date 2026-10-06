import type { Admission, ClinicVisit, LabResult, PetMovement, PetNote, TreatmentEntry, Vaccination, WeightLog } from "@/types";
import { parseClinical, type ClinicalRecord } from "./clinicalRecord";
import { isIntake } from "./intake";
import { isProtocolMark } from "./protocolMark";
import { localISO } from "./utils";
import { isSettledMiss } from "./backdate";

/* ============================================================================
 * سجلُّ الدخول والخروج — «شنو صار وياه بكلّ يوم؟» بمكانٍ واحد. نقيٌّ ومفحوصٌ بـ
 * `scripts/stay-log-test.mjs`.
 *
 * كلُّ دخولٍ (admission) إقامةٌ لها يومُ دخولٍ ويومُ خروج (أو «بعده داخل»)، وأيّامُها
 * تُفرد يوماً يوماً بما صار فيها: حركاتُه (دخل، خرج، انتقل، غيّر قفصه — من pet_movements
 * المختومة بالدقيقة)، وزياراتُه، وجرعاتُه (مجمّعةً بالدواء: «Ceftriaxone ×٢»، وما فات
 * يُقال)، ولقاحاتُه، وتحاليلُه، ووزنُه، وملاحظاتُه. ومعلوماتُ الحالة عند الدخول (intake)
 * تُعلَّق على إقامتها. وما صار خارج أيّ إقامة (زيارةٌ عابرة، لقاحٌ بموعد) يبقى بأيّامه
 * تحت «زيارات بدون مبيت» — لا يُرمى.
 *
 * لا يخترع: إقامةٌ قديمة بلا حركاتٍ مختومة (أقدمُ من محفّز 0219) تُرسم من أيّامها
 * وحدها بلا ساعة، والمفتوحةُ تمتدّ لليوم لا لموعدٍ مفترض.
 * ========================================================================= */

export type LogKind =
  | "in" | "out" | "transfer" | "cage"
  | "visitOpen" | "visitClose"
  | "doses" | "dosesMissed"
  | "vaccine" | "lab" | "weight" | "note" | "plan";

export interface LogEvent {
  kind: LogKind;
  /** لحظةٌ ISO إن عُرفت ساعتُها، وإلا null (حدثٌ بيومه فقط). */
  at: string | null;
  /** بياناتُ العرض — تُترجم بالشاشة لا هنا. */
  data: { [k: string]: string | number | null | undefined | [string, number][] | string[] };
}

export interface DayLog { day: string; events: LogEvent[] }

export interface Stay {
  id: string;
  kind: Admission["kind"];
  inDay: string;
  outDay: string | null;   // null = بعده داخل
  active: boolean;
  /** أيّامُ الإقامة شاملةً يومَ الدخول والخروج (أقلّها ١). */
  days: number;
  cage: string | null;
  outcome: Admission["outcome"] | null;
  reason: string | null;
  /** معلوماتُ الحالة عند الدخول لهذه الإقامة (أحدثُها أوّلاً). */
  intakes: ClinicalRecord[];
  /** الأيّامُ التي حدث فيها شيء — الأحدثُ أوّلاً. */
  dayLogs: DayLog[];
}

export interface StayLog {
  stays: Stay[];           // الأحدثُ أوّلاً
  outside: DayLog[];       // أيّامٌ خارج كلّ إقامة — الأحدثُ أوّلاً
  totals: { stays: number; daysInClinic: number; lastIn: string | null; inNow: boolean };
}

export interface StayInput {
  admissions: Admission[];
  movements: PetMovement[];
  visits: ClinicVisit[];
  treatments: TreatmentEntry[];
  vaccinations: Vaccination[];
  notes: PetNote[];
  labs: LabResult[];
  weights: WeightLog[];
}

const dayOfISO = (iso: string): string => (iso.length === 10 ? iso : localISO(new Date(iso)));
const diffDays = (a: string, b: string): number =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

/** أوّلُ سطرٍ مقروءٍ من ملاحظة — للسجلّ، لا النصّ كلّه. */
function firstLine(text: string): string {
  const s = text.trim().split("\n").find((l) => l.trim()) ?? "";
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

export function buildStayLog(inp: StayInput, todayISO: string = localISO()): StayLog {
  // ── الإقامات ومداها ────────────────────────────────────────────────────────
  const adms = inp.admissions
    .filter((a) => a.admitted_on)
    .map((a) => {
      const inDay = a.admitted_on.slice(0, 10);
      const active = a.status === "active";
      const outDay = active ? null : (a.discharged_on?.slice(0, 10) ?? inDay);
      const end = outDay ?? (todayISO > inDay ? todayISO : inDay);
      return { a, inDay, outDay, active, end: end < inDay ? inDay : end };
    })
    .sort((x, y) => y.inDay.localeCompare(x.inDay) || (y.a.created_at ?? "").localeCompare(x.a.created_at ?? ""));

  /** أيُّ إقامةٍ تضمّ هذا اليوم؟ الأحدثُ دخولاً يغلب عند التداخل. */
  const stayOf = (day: string): string | null => adms.find((s) => day >= s.inDay && day <= s.end)?.a.id ?? null;

  const buckets = new Map<string, Map<string, LogEvent[]>>(); // stayId|"" → day → events
  const push = (stayId: string | null, day: string, ev: LogEvent) => {
    const key = stayId ?? "";
    const m = buckets.get(key) ?? buckets.set(key, new Map()).get(key)!;
    (m.get(day) ?? m.set(day, []).get(day)!).push(ev);
  };
  const place = (day: string, ev: LogEvent, stayHint?: string | null) => push(stayHint ?? stayOf(day), day, ev);

  // ── الحركات المختومة (أو أيّامُ الإقامة إن غابت) ──────────────────────────────
  const movedAdm = new Set(inp.movements.map((m) => m.admission_id).filter(Boolean) as string[]);
  for (const m of inp.movements) {
    const kind: LogKind = m.event === "admitted" ? "in" : m.event === "discharged" ? "out" : m.event === "transferred" ? "transfer" : "cage";
    place(dayOfISO(m.at), { kind, at: m.at, data: { from: m.from_kind ?? null, to: m.to_kind ?? null, fromCage: m.from_cage ?? null, toCage: m.to_cage ?? null } }, m.admission_id ?? null);
  }
  for (const s of adms) {
    if (movedAdm.has(s.a.id)) continue;
    place(s.inDay, { kind: "in", at: null, data: { to: s.a.kind, toCage: s.a.cage ?? null } }, s.a.id);
    if (s.outDay) place(s.outDay, { kind: "out", at: null, data: {} }, s.a.id);
  }

  // ── الزيارات ─────────────────────────────────────────────────────────────
  for (const v of inp.visits) {
    place(dayOfISO(v.opened_at), { kind: "visitOpen", at: v.opened_at, data: { visitKind: v.kind, id: v.id } });
    if (v.status === "ended" && v.ended_at) place(dayOfISO(v.ended_at), { kind: "visitClose", at: v.ended_at, data: { outcome: v.outcome ?? null, id: v.id } });
  }

  // ── الجرعات: مجمّعةً لكلّ يومٍ بالدواء — المعطاةُ بيوم إعطائها، والفائتةُ بيومها ──
  const given = new Map<string, Map<string, number>>();
  const missed = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, Map<string, number>>, day: string, name: string) => {
    const d = m.get(day) ?? m.set(day, new Map()).get(day)!;
    d.set(name, (d.get(name) ?? 0) + 1);
  };
  for (const t of inp.treatments) {
    if ((t.task_type ?? "drug") !== "drug") continue;
    const name = t.medication?.trim() || "—";
    if (t.administered_at) bump(given, dayOfISO(t.administered_at), name);
    else if (t.day < todayISO && (isSettledMiss(t, todayISO) || t.missed_reason?.trim())) bump(missed, t.day, name);
  }
  const summary = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [day, m] of given) place(day, { kind: "doses", at: null, data: { count: [...m.values()].reduce((a, b) => a + b, 0), list: summary(m) } });
  for (const [day, m] of missed) place(day, { kind: "dosesMissed", at: null, data: { count: [...m.values()].reduce((a, b) => a + b, 0), list: summary(m) } });

  // ── اللقاحات والتحاليل والوزن ──────────────────────────────────────────────
  for (const v of inp.vaccinations) {
    if (v.status === "administered" && v.administered_at) place(v.administered_at.slice(0, 10), { kind: "vaccine", at: null, data: { name: v.name } });
  }
  for (const l of inp.labs) place(dayOfISO(l.taken_at), { kind: "lab", at: l.taken_at, data: { name: l.panel_label } });
  for (const w of inp.weights) place(w.measured_at.slice(0, 10), { kind: "weight", at: null, data: { kg: w.weight_kg } });

  // ── الملاحظات: معلوماتُ الدخول تُعلَّق على إقامتها، والخطّةُ حدث، والباقي سطر ──
  const intakeOf = new Map<string, ClinicalRecord[]>();
  const visitStay = new Map(inp.visits.map((v) => [v.id, stayOf(dayOfISO(v.opened_at))]));
  for (const n of inp.notes) {
    if (isProtocolMark(n.note_text)) continue;
    const { record, text } = parseClinical(n.note_text);
    const day = dayOfISO(n.created_at);
    if (record && isIntake(record)) {
      // إقامتُها: زيارتُها المربوطة، وإلا الإقامةُ التي بدأت حول يوم كتابتها (±١).
      const sid = (n.visit_id ? visitStay.get(n.visit_id) : null)
        ?? adms.find((s) => Math.abs(diffDays(s.inDay, day)) <= 1)?.a.id ?? null;
      if (sid) { (intakeOf.get(sid) ?? intakeOf.set(sid, []).get(sid)!).push(record); continue; }
      place(day, { kind: "note", at: n.created_at, data: { text: firstLine(text), intake: 1 } });
      continue;
    }
    if (record) {
      place(day, { kind: "plan", at: n.created_at, data: { dx: record.diagnoses?.map((d) => d.disease) ?? [], meds: record.treatment?.length ?? 0 } });
      continue;
    }
    if (n.note_text.startsWith("⟦D:")) continue; // ملاحظةُ يومٍ بالطبلة — تُقرأ هناك
    const line = firstLine(text);
    if (line) place(day, { kind: "note", at: n.created_at, data: { text: line } });
  }

  // ── التجميع ──────────────────────────────────────────────────────────────
  const order: Record<LogKind, number> = { in: 0, visitOpen: 1, transfer: 2, cage: 3, weight: 4, lab: 5, plan: 6, doses: 7, dosesMissed: 8, vaccine: 9, note: 10, visitClose: 11, out: 12 };
  const toDays = (m?: Map<string, LogEvent[]>): DayLog[] =>
    m ? [...m.entries()]
      .map(([day, events]) => ({ day, events: events.sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : order[a.kind] - order[b.kind])) }))
      .sort((a, b) => b.day.localeCompare(a.day)) : [];

  const stays: Stay[] = adms.map((s) => ({
    id: s.a.id, kind: s.a.kind, inDay: s.inDay, outDay: s.outDay, active: s.active,
    days: Math.max(1, diffDays(s.inDay, s.end) + 1),
    cage: s.a.cage ?? null, outcome: s.a.outcome ?? null, reason: s.a.reason?.trim() || null,
    intakes: intakeOf.get(s.a.id) ?? [],
    dayLogs: toDays(buckets.get(s.a.id)),
  }));

  return {
    stays,
    outside: toDays(buckets.get("")),
    totals: {
      stays: stays.length,
      daysInClinic: stays.reduce((n, s) => n + s.days, 0),
      lastIn: stays[0]?.inDay ?? null,
      inNow: stays.some((s) => s.active),
    },
  };
}
