import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowRight, Clock, Check, Plus, NotebookPen, ClipboardList,
  Loader2, Lock, CheckCircle2, Stethoscope, UserRound, RotateCcw, AlertTriangle,
  Pill,
  Zap, Rows3, LayoutGrid, CalendarPlus, CalendarClock, FolderOpen, FlaskConical, Pencil, Printer, FileText,
} from "lucide-react";
import { toneOfResult } from "@/lib/observations";
import { CareIcon, careKindOf, type CareKind } from "@/components/CareIcon";
import { ObsRecorder } from "@/components/Flowsheet";
import { protocolMarksOf, isProtocolMark, type ProtocolMark } from "@/lib/protocolMark";
import type { Pet, ClinicVisit, PetNote, TreatmentEntry, LabResult, PetProblem } from "@/types";
import { LastLabsStrip, LabEntry } from "@/components/LabCenter";
import { JourneyCard } from "@/components/JourneyCard";
import { labParamById, labRange } from "@/lib/labCatalog";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { TreatmentPlan } from "@/components/TreatmentPlan";
import { DoctorSelect } from "@/components/MedicalEntry";
import { SurgerySection } from "@/components/Surgeries";
import { ClinicalRecordCard } from "@/components/ClinicalRecordCard";
import { parseClinical, type ClinicalRecord } from "@/lib/clinicalRecord";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { MED_CATALOG, getClinicMeds } from "@/lib/meds";
import { GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { visitKindMeta } from "@/lib/visits";
import { localISO, formatDate, formatNum, ageFromDOB, cn } from "@/lib/utils";
import { getClinicName, getClinicLogo, getClinicSocials, getClockFormat } from "@/lib/settings";
import { fmtClock } from "@/lib/clock";
import { openTreatmentSheet, type SheetTreatmentRow } from "@/lib/treatmentSheetPrint";
import { openCareReport } from "@/lib/careReportPrint";
import { syncDoseCycleForPet } from "@/lib/doseCycle";
import { doseTimesFor, perDayFrom } from "@/lib/treatmentSchedule";
import { ProblemList } from "@/components/ProblemList";
import { CareSheet } from "@/components/CareSheet";
import { VisitBanner } from "@/components/VisitBanner";
import { CaseSummary } from "@/components/CaseSummary";
import { Section } from "@/components/VisitTabs";
import { flagsFromProblems, isJuvenile, type ChartFlags } from "@/lib/problems";
import { playTap, playSuccess, playWarning, playAchievement, playDoseGiven } from "@/lib/sounds";
import { celebrate } from "@/lib/celebrate";

const DAY_MARK = "⟦D:";
const dayNoteEncode = (day: string, text: string) => `${DAY_MARK}${day}⟧${text}`;
function parseDayNote(text: string): { day: string | null; body: string } {
  if (!text.startsWith(DAY_MARK)) return { day: null, body: text };
  const end = text.indexOf("⟧");
  if (end < 0) return { day: null, body: text };
  return { day: text.slice(DAY_MARK.length, end), body: text.slice(end + 1) };
}
const addDaysISO = (iso: string, n: number) => localISO(new Date(new Date(iso).getTime() + n * 86400000));
const pad = (n: number) => (n < 10 ? "0" : "") + n;
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const clockOf = (iso: string, lang: string) =>
  new Date(iso).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12: getClockFormat() === "12" });

/** Human age string ("٣ سنة و٤ أشهر" / "8 أشهر") — empty when DOB is unknown. */
function ageText(dob: string | null | undefined, t: TFunction): string {
  const a = ageFromDOB(dob);
  if (!a) return "";
  const parts: string[] = [];
  if (a.years) parts.push(t("visit.ageYears", { n: formatNum(a.years), defaultValue: "{{n}} سنة" }));
  if (a.months) parts.push(t("visit.ageMonths", { n: formatNum(a.months), defaultValue: "{{n}} شهر" }));
  return parts.join(t("visit.ageJoiner", " و")) || t("visit.ageUnderMonth", "أقل من شهر");
}

/** Singular Arabic species name for a single patient ("كلب" — not the plural "كلاب"). */
const SPECIES_SINGULAR_AR: Record<string, string> = {
  dog: "كلب", cat: "قطة", horse: "حصان", cow: "بقرة", bird: "طائر", rabbit: "أرنب", other: "أخرى",
};

/** Brief diagnosis line from a clinical record ("داء البارفو (شديد) · و٢ آخر"). */
function diagnosisText(rec: ClinicalRecord | null, t: TFunction): string {
  const dx = rec?.diagnoses ?? [];
  if (!dx.length) return "";
  const first = dx[0].disease;
  return dx.length > 1 ? t("visit.dxMore", { first, n: formatNum(dx.length - 1), defaultValue: "{{first}} · و{{n}} آخر" }) : first;
}

/** «تم العلاج» حقُّ الأدوية وحدها. السوائلُ والمتابعات (حرارة/أكل/إخراج…)
 *  رعايةُ يومٍ تُسجَّل من مصفوفة «رعاية اليوم» المقابلة لليوم بالجدول — لا
 *  صفوفَ جرعاتٍ تنتظر زراً، فلا تتسجّل النتائج بمكانين. */
const isGivable = (t: TreatmentEntry): boolean => (t.task_type ?? "drug") === "drug";

/** Four-state dose status — the semantic system leading vet treatment sheets use. */
type DoseStatus = "done" | "overdue" | "due" | "upcoming";
const doseStatus = (t: TreatmentEntry, todayISO: string): DoseStatus =>
  t.administered_at ? "done" : t.day < todayISO ? "overdue" : t.day === todayISO ? "due" : "upcoming";
const STATUS_META: Record<DoseStatus, { label: string; row: string; mark: string; bar: string }> = {
  done: { label: "تمّ", row: "bg-success-50 dark:bg-success-500/10", mark: "bg-success-600 text-white", bar: "bg-success-500" },
  due: { label: "مستحقّة", row: "bg-warn-50 dark:bg-warn-500/10", mark: "bg-warn-500 text-white", bar: "bg-warn-500" },
  overdue: { label: "متأخّرة", row: "bg-danger-50 dark:bg-danger-500/10", mark: "bg-danger-600 text-white", bar: "bg-danger-500" },
  upcoming: { label: "قادمة", row: "bg-surface-1", mark: "bg-surface-2 text-ink-subtle border border-line", bar: "bg-line" },
};

const OUTCOME_BADGE: Record<string, string> = {
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  warn: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300",
};
function OutcomeBadge({ id }: { id: string }) {
  const o = OUTCOMES.find((x) => x.id === id);
  if (!o) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-2.5 py-1 text-2xs font-extrabold", OUTCOME_BADGE[o.tone])}>
      <GlyphMark name={o.id} size={14} className={glyphToneText(glyphTone(o.id) ?? "blue")} /> {o.label}
    </span>
  );
}

/**
 * Standalone VISIT page (زيارة) — an AGENDA timeline treatment sheet: each day of
 * the course is a column (right-to-left), the current day expanded with one-tap
 * administration, others compact. Every dose carries a four-state status colour
 * (done / due / overdue / upcoming); giving a dose records who + when.
 */
export default function VisitPage() {
  const { petId, visitId } = useParams<{ petId: string; visitId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const toast = useToast();

  // Seed from navigation state (e.g. the charts hub) so the page paints instantly
  // with the pet/visit/doses we already have, then refreshes in the background.
  const seed = location.state as { pet?: Pet; visit?: ClinicVisit; treatments?: TreatmentEntry[]; from?: string } | null;
  // جاي من قسم الطبلات؟ زر الرجوع يرجعه للطبلات — وملف الحيوان له زر مستقل.
  const cameFromCharts = seed?.from === "charts";
  const seeded = !!(seed?.pet && seed?.visit && seed.visit.id === visitId);
  const [pet, setPet] = useState<Pet | null>(seeded ? seed!.pet! : null);
  const [visit, setVisit] = useState<ClinicVisit | null>(seeded ? seed!.visit! : null);
  const [notes, setNotes] = useState<PetNote[]>([]);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>(seeded ? (seed!.treatments ?? []) : []);
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(!seeded);

  const [planOpen, setPlanOpen] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  /** True while the wizard holds unsaved selections — guards the modal close. */
  const planDirty = useRef(false);
  const [labOpen, setLabOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteDay, setNoteDay] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [giveId, setGiveId] = useState<string | null>(null);
  const [addDrugOpen, setAddDrugOpen] = useState(false);
  const [addDrugDay, setAddDrugDay] = useState<string>(() => localISO(new Date()));
  const [extendOpen, setExtendOpen] = useState(false);
  /** صفُّ الدواء المفتوح للتعديل — قبل إعطائه، بمدى «اليوم» أو «الباقي كله». */
  const [editTarget, setEditTarget] = useState<TreatmentEntry | null>(null);
  const [planView, setPlanView] = useState<"day" | "drug">("day");

  const reload = useCallback(async () => {
    if (!petId || !visitId) return;
    const [p, v, ns, tx, lab] = await Promise.all([
      repo.getPet(petId),
      repo.getClinicVisit(visitId),
      repo.listPetNotes(petId).catch(() => [] as PetNote[]),
      repo.listTreatments(petId).catch(() => [] as TreatmentEntry[]),
      repo.listLabResults(petId).catch(() => [] as LabResult[]),
    ]);
    setPet(p ?? null);
    setVisit(v);
    setNotes(ns.filter((n) => n.visit_id === visitId));
    setTreatments(tx.filter((t) => t.visit_id === visitId));
    setLabs(lab);
    setLoading(false);
  }, [petId, visitId]);

  useEffect(() => { void reload(); }, [reload]);

  // Bring the current day into view — with a multi-day course the "today" column
  // is the one the doctor needs, and it may otherwise sit off-screen.
  const todayRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [loading, treatments.length]);

  const ended = visit?.status === "ended";
  const kind = visit ? visitKindMeta(visit.kind) : null;
  const KindIcon = kind?.icon ?? Stethoscope;
  const todayISO = localISO(new Date());

  const clinicalNotes = useMemo(() => notes.map((n) => ({ n, ...parseClinical(n.note_text) })).filter((x) => x.record), [notes]);
  const generalNotes = useMemo(
    () => notes.filter((n) => !parseClinical(n.note_text).record && !n.note_text.startsWith(DAY_MARK) && !isProtocolMark(n.note_text)),
    [notes],
  );

  /* بروتوكولات هذه الزيارة (علامات ⟦P⟧): الأحدث يرسم الشريط، وملاحظاتُ
   * بنودها كلِّها تُعرض بعمود الملاحظات بكسوة «من البروتوكول». */
  const protoMarks = useMemo(() => protocolMarksOf(notes, visitId ?? null), [notes, visitId]);
  const protoNotes = useMemo(() => {
    const m: Record<string, string> = {};
    for (const mk of protoMarks) for (const [med, note] of Object.entries(mk.notes)) if (!m[med]) m[med] = note;
    return m;
  }, [protoMarks]);
  const activeProto = protoMarks[0] ?? null;

  const dayGroups = useMemo(() => {
    const map = new Map<string, TreatmentEntry[]>();
    for (const t of treatments) (map.get(t.day) ?? map.set(t.day, []).get(t.day)!).push(t);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [treatments]);
  /* الطبلةُ تُفتح مسطّرةً لا مطويّة: يومُ اليوم صفٌّ جاهزٌ بأعمدته حتى قبل
   * أوّل دواء، فيرى الطبيبُ الورقةَ التي سيملؤها لا دعوةً تصفُ ورقةً غائبة.
   * ولو كانت هناك خطةٌ فأيّامُها هي، بلا صفٍّ مصطنع. */
  const dayNotes = useMemo(() => {
    const map = new Map<string, PetNote[]>();
    for (const n of notes) { const { day } = parseDayNote(n.note_text); if (day) (map.get(day) ?? map.set(day, []).get(day)!).push(n); }
    return map;
  }, [notes]);

  const hasFlowsheet = treatments.length > 0;
  /* الطبلةُ تُفتح مسطّرةً لا مطويّة: قبل أوّل دواءٍ يبقى الجدولُ بأعمدته
   * الخمسة وصفُّ اليوم جاهزٌ فارغ — الطبيبُ يرى الورقةَ التي سيملؤها، لا
   * دعوةً تصف ورقةً غائبة. ولو كانت هناك خطةٌ فأيّامُها هي بلا صفٍّ مصطنع. */
  const planDays: [string, TreatmentEntry[]][] = dayGroups.length ? dayGroups : [[todayISO, []]];
  /* كل حسابات «الجرعات» تمشي على الأدوية والسوائل وحدها: العدّاد والالتزام
   * و«إعطاء الكل» ما عاد يحسبون الحرارة والأكل جرعاتٍ تنتظر. */
  const medRows = useMemo(() => treatments.filter(isGivable), [treatments]);
  const totalDoses = medRows.length;
  const doneDoses = medRows.filter((t) => t.administered_at).length;
  const remaining = totalDoses - doneDoses;
  const giveTarget = treatments.find((t) => t.id === giveId) ?? null;

  // ── Smart treatment intelligence — the numbers that drive the command panel ──
  const todayDoses = useMemo(() => medRows.filter((t) => t.day === todayISO), [medRows, todayISO]);
  const todayPending = useMemo(() => todayDoses.filter((t) => !t.administered_at), [todayDoses]);
  const overdueDoses = useMemo(
    () => medRows.filter((t) => !t.administered_at && t.day < todayISO).sort((a, b) => a.day.localeCompare(b.day)),
    [medRows, todayISO],
  );
  const nextDose = useMemo(
    () => medRows.filter((t) => !t.administered_at && t.day > todayISO).sort((a, b) => a.day.localeCompare(b.day))[0] ?? null,
    [medRows, todayISO],
  );
  const adherence = totalDoses ? Math.round((doneDoses / totalDoses) * 100) : 0;
  const lastDay = dayGroups.length ? dayGroups[dayGroups.length - 1][0] : null;
  const daysLeft = lastDay
    ? Math.max(0, Math.round((new Date(`${lastDay}T00:00:00`).getTime() - new Date(`${todayISO}T00:00:00`).getTime()) / 86400000))
    : 0;
  // Group the flowsheet by medication — a clinical bird's-eye course view.
  const medCourses = useMemo(() => {
    const map = new Map<string, TreatmentEntry[]>();
    for (const t of medRows) (map.get(t.medication) ?? map.set(t.medication, []).get(t.medication)!).push(t);
    return [...map.entries()]
      .map(([name, rows]) => {
        const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
        const given = sorted.filter((r) => r.administered_at).length;
        const overdueN = sorted.filter((r) => !r.administered_at && r.day < todayISO).length;
        const next = sorted.find((r) => !r.administered_at) ?? null;
        return { name, rows: sorted, total: sorted.length, given, overdueN, next, amount: sorted[0]?.amount ?? "", freq: sorted[0]?.observations ?? "" };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [medRows, todayISO]);

  const isIllness = visit?.kind === "illness";
  // Singular species name for a single patient (Arabic uses a plural in the catalog).
  const speciesSingular = (species: string) =>
    lang.startsWith("ar") && SPECIES_SINGULAR_AR[species]
      ? t(`visit.species.${species}`, SPECIES_SINGULAR_AR[species])
      : t(`pet.species.${species}`, species);
  const primary = clinicalNotes.length ? clinicalNotes[clinicalNotes.length - 1].record : null;
  const dxName = primary?.diagnoses?.[0]?.disease;
  const dxWarn = (primary?.redFlags?.length ?? 0) > 0 || (primary?.zoonotic?.length ?? 0) > 0 || (primary?.reportable?.length ?? 0) > 0;

  /* ---- Save the clinical console: store the record note + generate the daily flowsheet ---- */
  const savePlan = async (body: string) => {
    if (!visit || planBusy) return;
    setPlanBusy(true);
    try {
      await repo.addPetNote({ pet_id: visit.pet_id, note_text: body, author_id: user?.id ?? null, author_name: user?.full_name ?? null, visit_id: visit.id });
      const { record } = parseClinical(body);
      // جسر المختبر: قيم الـCBC المكتوبة بمعالج التشخيص تنحفظ تلقائياً كنتيجة
      // رسمية بالمختبر مربوطة بهاي الزيارة (فقط عند أول تشخيص — التعديل لا يكرر).
      if (record?.cbc?.length && clinicalNotes.length === 0 && pet) {
        const values = record.cbc.map((c) => {
          const p = labParamById(c.id);
          const [lo, hi] = p ? labRange(p, pet.species) : [undefined, undefined];
          return { id: c.id, label: p?.label ?? c.id, abbr: p?.abbr, value: c.value, unit: p?.unit ?? "", low: lo, high: hi, flag: c.flag };
        });
        void repo.addLabResult({
          pet_id: visit.pet_id, visit_id: visit.id, panel_id: "cbc", panel_label: "تعداد الدم CBC",
          kind: "numeric", values, snap_test_id: null, snap_result: null, notes: null, photo_url: null,
          doctor: user?.full_name ?? null, billed: false, taken_at: new Date().toISOString(),
        }).catch(() => { /* الجسر إضافة — لا يعطل حفظ الخطة */ });
      }
      if (record?.treatment?.length && !hasFlowsheet) {
        // كل جرعات الخطة تنبني محلياً ثم تُرسل دفعة وحدة — رحلة سيرفر واحدة
        // بدل رحلة لكل جرعة (خطة ٣ أدوية × ١٠ أيام كانت ٣٠ رحلة متسلسلة).
        const start = visit.opened_at;
        const rows: Parameters<typeof repo.addTreatments>[0] = [];
        for (const m of record.treatment) {
          const nDays = Math.max(1, Math.min(60, m.days || 1));
          // One row PER DOSE at a real clock time — that's what lets الطبلة say
          // "متأخرة ساعتين" instead of just "في جرعات اليوم". PRN keeps a single
          // untimed row per day.
          const times = doseTimesFor(perDayFrom(m.doses, m.days));
          const slots = times.length ? times : [""];
          for (let i = 0; i < nDays; i++) {
            for (const time of slots) {
              rows.push({
                pet_id: visit.pet_id, visit_id: visit.id, day: addDaysISO(start, i),
                medication: m.name, amount: m.dose || "", time, observations: m.freq, doctor: user?.full_name,
              });
            }
          }
        }
        await repo.addTreatments(rows);
      } else if (record?.treatment?.length && hasFlowsheet) {
        await Promise.all(treatments.map((t) => repo.setTreatmentGiven(t.id, !!t.administered_at, t.administered_by, t.administered_at ?? undefined).catch(() => {})));
      }
      if (visit) await syncDoseCycleForPet(visit.pet_id);
      // The earned moment: fanfare + a brief spark burst + a receipt of what
      // was actually created — the wizard's two minutes end with an achievement,
      // not a silent page swap.
      planDirty.current = false;
      setPlanOpen(false);
      playAchievement();
      celebrate();
      const nDrugs = record?.treatment?.length ?? 0;
      const nDoses = record?.treatment?.reduce((s, t) => s + (t.doses || 0), 0) ?? 0;
      if (nDrugs > 0) toast.success(t("visit.planSaved", "حُفظت الخطة 🎉"), t("visit.planSavedDetail", { drugs: formatNum(nDrugs), doses: formatNum(nDoses), defaultValue: "{{drugs}} دواء · {{doses}} جرعة مجدولة بالطبلة" }));
      else toast.success(t("visit.dxSaved", "حُفظ التشخيص"));
      await reload();
    } catch (e) {
      playWarning();
      toast.error(t("visit.saveFailed", "تعذّر الحفظ"), e instanceof Error ? e.message : undefined);
    } finally { setPlanBusy(false); }
  };

  // The live problem list feeds the prescription guard: an active renal problem
  // must block an NSAID even when nobody remembers to mention it.
  const [problems, setProblems] = useState<PetProblem[]>([]);
  const chartFlags = useMemo(() => flagsFromProblems(problems), [problems]);
  const prescribingFlags: ChartFlags = { ...chartFlags, puppy: isJuvenile(pet?.dob) || chartFlags.puppy };

  const giveDose = async (t: TreatmentEntry, doctor: string, atISO: string) => {
    playDoseGiven();
    await repo.setTreatmentGiven(t.id, true, doctor || (user?.full_name ?? undefined), atISO);
    await syncDoseCycleForPet(t.pet_id);
    setGiveId(null); await reload();
  };
  /** One-tap give for a single dose (records the current doctor + now). */
  const giveQuick = async (t: TreatmentEntry) => {
    playDoseGiven();
    await repo.setTreatmentGiven(t.id, true, user?.full_name ?? undefined, new Date().toISOString());
    await syncDoseCycleForPet(t.pet_id);
    await reload();
  };
  /** Batch give — mark every dose in the list administered now by the current doctor. */
  const giveMany = async (list: TreatmentEntry[]) => {
    if (!list.length) return;
    playDoseGiven();
    const at = new Date().toISOString();
    await Promise.all(list.map((t) => repo.setTreatmentGiven(t.id, true, user?.full_name ?? undefined, at))); // بالتوازي — مو طابور
    await syncDoseCycleForPet(list[0].pet_id);
    await reload();
  };
  /** Extend the course — repeat the last day's medications for N more days. */
  const extendCourse = async (extraDays: number) => {
    if (!visit || !lastDay || extraDays < 1) return;
    const lastMeds = treatments.filter((t) => t.day === lastDay);
    if (!lastMeds.length) { setExtendOpen(false); return; }
    const rows: Parameters<typeof repo.addTreatments>[0] = [];
    for (let i = 1; i <= extraDays; i++) {
      const base = new Date(`${lastDay}T00:00:00`); base.setDate(base.getDate() + i);
      const day = localISO(base);
      for (const m of lastMeds) {
        // Keep each dose's clock slot — the extension repeats the day as scheduled,
        // it doesn't flatten it back into untimed rows.
        //
        // ويُنقل معها **نوع المهمّة وطريق الإعطاء**: التمديد كان يكتب صفوفاً
        // عاريةً من `task_type`، فينهار كل قياسٍ وكل سائلٍ إلى «دواء» (لأن
        // غياب النوع يعني دواءً)، ويضيع «وريدي». يعني يومٌ فيه حرارةٌ وسوائل
        // يُمدَّد فيصير ثلاثة أدوية — تزييفٌ صامت لخطّة العلاج.
        rows.push({
          pet_id: visit.pet_id, visit_id: visit.id, day, medication: m.medication,
          amount: m.amount, time: m.time, observations: m.observations,
          task_type: m.task_type, route: m.route, doctor: user?.full_name,
        });
      }
    }
    await repo.addTreatments(rows); // دفعة وحدة
    await syncDoseCycleForPet(visit.pet_id);
    playSuccess(); setExtendOpen(false); await reload();
  };
  const undoDose = async (t: TreatmentEntry) => {
    playTap();
    await repo.setTreatmentGiven(t.id, false);
    await syncDoseCycleForPet(t.pet_id);
    setGiveId(null); await reload();
  };
  const addNote = async (text: string, day?: string) => {
    if (!visit || !text.trim()) return;
    const body = day ? dayNoteEncode(day, text.trim()) : text.trim();
    await repo.addPetNote({ pet_id: visit.pet_id, note_text: body, author_id: user?.id ?? null, author_name: user?.full_name ?? null, visit_id: visit.id });
    playSuccess(); await reload();
  };

  /* ---- تسجيل خانة رعاية من المصفوفة — نفس ورقة الشبكة (ObsRecorder) ---- */
  const [obsTarget, setObsTarget] = useState<TreatmentEntry | null>(null);
  const saveObs = async (entry: TreatmentEntry, value: string) => {
    try {
      await repo.setTreatmentResult(entry.id, value, user?.full_name ?? undefined, new Date().toISOString());
      playSuccess();
    } catch (e) {
      playWarning();
      toast.error(t("visit.obsSaveFail", "ما انحفظت القيمة — أعد المحاولة."), e instanceof Error ? e.message : undefined);
    }
    setObsTarget(null);
    await reload();
  };
  const endVisit = async (outcome: string, summary: string) => {
    if (!visit) return;
    await repo.updateClinicVisit(visit.id, { status: "ended", ended_at: new Date().toISOString(), ended_by: user?.full_name ?? null, outcome, summary: summary.trim() || null });
    playSuccess(); setEndOpen(false); await reload();
  };

  /* ---- تعديل دواءٍ قبل إعطائه — لهذا اليوم وحده أو من يومه لنهاية الخطة ---- */
  const editDrug = async (
    orig: TreatmentEntry,
    patch: { medication: string; amount: string; time: string; observations: string },
    scope: "day" | "rest",
  ) => {
    const clean = {
      medication: patch.medication.trim() || orig.medication,
      amount: patch.amount.trim(),
      observations: patch.observations.trim(),
      // الوقت يدخل التعديل فقط إذا تغيّر فعلاً: تعميم وقتٍ واحد على كل جرعات
      // اليوم كان سيطوي مواعيدها على بعضها بصمت.
      ...(patch.time !== (orig.time ?? "") ? { time: patch.time } : {}),
    };
    /* الجرعات المعطاة تاريخٌ لا يُمسّ — التعديل يطال ما لم يُعطَ فقط. */
    const targets = treatments.filter((x) =>
      x.medication === orig.medication && !x.administered_at
      && (scope === "day" ? x.day === orig.day : x.day >= orig.day));
    await Promise.all(targets.map((x) => repo.updateTreatment(x.id, clean)));
    if (visit) await syncDoseCycleForPet(visit.pet_id);
    playSuccess();
    toast.success(t("visit.drugEdited", { n: formatNum(targets.length), defaultValue: "تعدّلت {{n}} جرعة" }));
    setEditTarget(null);
    await reload();
  };

  /* ---- Add a single ad-hoc medication (بشكل مفرد) — لليوم أو لكل الأيام الباقية ---- */
  const openAddDrug = (day?: string) => { playTap(); setAddDrugDay(day ?? localISO(new Date())); setAddDrugOpen(true); };
  const addDrug = async (d: { day: string; medication: string; amount: string; freq: string; doctor: string; givenNow: boolean; repeatRest: boolean }) => {
    if (!visit || !d.medication.trim()) return;
    const nowISO = new Date().toISOString();
    const by = d.doctor || (user?.full_name ?? undefined);
    const base = {
      pet_id: visit.pet_id, visit_id: visit.id,
      medication: d.medication.trim(), amount: d.amount.trim(), time: "",
      observations: d.freq.trim(), doctor: by,
    };
    /* «ولكل الأيام الباقية»: صفٌّ لكل يومٍ من يومه حتى آخر يوم بالخطة —
     * و«أُعطي الآن» يختم جرعة يومه وحدها، فالبقية تبقى تنتظر أيامها. */
    const endDay = d.repeatRest && lastDay && lastDay > d.day ? lastDay : d.day;
    const rows: Parameters<typeof repo.addTreatments>[0] = [];
    for (let day = d.day; day <= endDay; day = addDaysISO(`${day}T00:00:00`, 1)) {
      rows.push({
        ...base, day,
        administered_at: d.givenNow && day === d.day ? nowISO : undefined,
        administered_by: d.givenNow && day === d.day ? by : undefined,
      });
    }
    await repo.addTreatments(rows);
    await syncDoseCycleForPet(visit.pet_id);
    playSuccess(); setAddDrugOpen(false); await reload();
  };

  /* ---- Print the paper treatment sheet (ورقة خطة العلاج) — one row per dose ---- */
  const printSheet = () => {
    if (!pet || !visit) return;
    playTap();
    // Group by day so the date is printed once per day; each dose row shows only its time.
    const rows: SheetTreatmentRow[] = dayGroups.flatMap(([day, dayRows]) =>
      dayRows.map((tx, i) => {
        const time = tx.administered_at ? clockOf(tx.administered_at, lang) : tx.time;
        return {
          dayTime: [i === 0 ? formatDate(day, lang) : "", time].filter(Boolean).join(" — "),
          treatment: [tx.medication, tx.amount, tx.observations].filter(Boolean).join(" · "),
          doctor: tx.administered_by || tx.doctor || "",
          notes: tx.administered_at ? t("visit.givenMark", "✓ أُعطيت") : "",
        };
      }),
    );
    const socials = getClinicSocials();
    const ok = openTreatmentSheet({
      clinicName: getClinicName() || user?.full_name || t("visit.clinicFallback", "عيادة بيطرية"),
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      logoUrl: getClinicLogo(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
      lang,
      pet: {
        name: pet.name,
        species: speciesSingular(pet.species),
        sex: t(`pet.sex.${pet.sex}`, pet.sex),
        age: ageText(pet.dob, t),
      },
      date: formatDate(visit.opened_at, lang),
      diagnosis: diagnosisText(primary, t),
      clinicalTreatments: primary?.treatment?.map((m) => m.name).join("، ") ?? "",
      rows,
    });
    if (!ok) toast.error(t("visit.printFailed", "تعذّرت الطباعة"), t("visit.printFailedHint", "اسمح بالنوافذ المنبثقة ثم أعد المحاولة."));
  };

  /* ---- تقرير الحالة للزبون — سردٌ بلا أسماء أدوية (careReportPrint) ----
   * ورقة الخطة أعلاه وثيقةٌ داخلية بأسماء الأدوية ومقاديرها. وهذا شيءٌ آخر:
   * ورقةٌ تُسلَّم لصاحب الحيوان تحكي ما جرى وكيف نُفِّذت الرعاية — والأدوية
   * تُعدّ ولا تُسمّى، لأن الوصفة قرارٌ طبيّ لا ورقةٌ تُحمل للصيدلية. */
  const printCareReport = () => {
    if (!pet || !visit) return;
    playTap();
    const socials = getClinicSocials();
    // المتابعات = ما ليس دواءً ولا سائلاً، والمسجَّل منها وحده يُعدّ.
    const obsAll = treatments.filter((x) => !isGivable(x));
    // السائل المُعطى رعايةٌ منفَّذة وإن بلا قيمة مكتوبة — يُحسَب في التقرير.
    const obsDone = obsAll.filter((x) => (x.result != null && String(x.result).trim() !== "") || x.administered_at);
    const kinds = [...new Set(obsDone.map((x) => x.medication?.trim()).filter(Boolean) as string[])];
    const ok = openCareReport({
      clinicName: getClinicName() || user?.full_name || t("visit.clinicFallback", "عيادة بيطرية"),
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      logoUrl: getClinicLogo(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
      lang,
      pet: {
        name: pet.name,
        species: speciesSingular(pet.species),
        sex: t(`pet.sex.${pet.sex}`, pet.sex),
        age: ageText(pet.dob, t),
      },
      ownerName: pet.owner_name ?? null,
      fileNo: pet.serial ?? null,
      openedAt: formatDate(visit.opened_at, lang),
      endedAt: visit.ended_at ? formatDate(visit.ended_at, lang) : null,
      printedAt: formatDate(new Date().toISOString(), lang),
      reason: visit.reason ?? null,
      diagnosis: diagnosisText(primary, t) || null,
      outcome: visit.outcome ? t(`outcome.${visit.outcome}`, visit.outcome) : null,
      summary: visit.summary ?? null,
      doctor: user?.full_name ?? null,
      stats: {
        days: dayGroups.length,
        doses: totalDoses,
        dosesGiven: doneDoses,
        adherence,
        observations: obsDone.length,
        observationKinds: kinds,
        labs: labs.length,
        surgeries: [],
      },
    });
    if (!ok) toast.error(t("visit.printFailed", "تعذّرت الطباعة"), t("visit.printFailedHint", "اسمح بالنوافذ المنبثقة ثم أعد المحاولة."));
  };

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-subtle"><Loader2 className="mx-auto mb-2 animate-spin" /> {t("visit.loading", "جارٍ التحميل…")}</div>;
  if (!visit || !pet) return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-subtle">
      {t("visit.notFound", "لم يتم العثور على الزيارة.")}
      <div className="mt-4"><Button variant="secondary" onClick={() => navigate(-1)}>{t("visit.back", "رجوع")}</Button></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate(cameFromCharts ? "/charts" : `/pet/${petId}`)}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted transition hover:text-ink"
        >
          <ArrowRight size={16} /> {cameFromCharts ? t("visit.backToCharts", "رجوع إلى الطبلات") : t("visit.backToFile", { name: pet.name, defaultValue: "رجوع إلى ملف {{name}}" })}
        </button>
        <button
          onClick={() => navigate(`/pet/${petId}`)}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-xs font-extrabold text-ink-muted transition hover:border-brand-300 hover:text-brand-700"
        >
          <FolderOpen size={14} /> {t("visit.fullFile", "ملف الحيوان الكامل")}
        </button>
      </div>

      {/* ── Persistent patient banner — the 90-second rule: identity, weight,
             allergy, problems and how far behind the doses are, never scrolled away ── */}
      <VisitBanner
        pet={pet}
        kindLabel={kind!.label}
        kindIcon={<KindIcon size={13} />}
        kindSolid={kind!.solid}
        dxName={dxName}
        dxWarn={dxWarn}
        problems={problems}
        weightKg={pet.current_weight_kg}
        status={ended ? "ended" : "open"}
        outcomeBadge={ended && visit.outcome ? <OutcomeBadge id={visit.outcome} /> : undefined}
        dayNumber={dayGroups.length ? (dayGroups.findIndex(([d]) => d === todayISO) + 1 || dayGroups.length) : 1}
        openedAt={visit.opened_at}
        lang={lang}
        fileNo={pet.serial}
        ownerName={pet.owner_name}
        ownerPhone={pet.owner_phone}
        done={doneDoses} total={totalDoses} remaining={remaining}
        adherence={adherence} daysLeft={daysLeft}
        overdue={overdueDoses.length} dueNow={todayPending.length}
        onPrint={printSheet} printable={hasFlowsheet || !!primary}
        onOpenFile={() => navigate(`/pet/${petId}`)}
      />

      {ended && visit.summary && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" /><div><b className="font-extrabold">{t("visit.treatmentEnded", "تم إنهاء العلاج")}</b> — {visit.summary}</div>
        </div>
      )}

      {/* رحلة الحيوان — تأسيسها ومتابعتها من داخل طبلة الزيارة: الطبيب يتحكّم
          بالمراحل والطمأنات، والمالك يتابع برابط عام. للكادر فقط. */}
      {user?.role !== "owner" && (
        <div className="mt-1">
          <JourneyCard pet={pet} doctor={user?.full_name} />
        </div>
      )}

      {/* ── ملخّص الحالة — نفس المكان المعتاد ── */}
      <div className="mt-1">
        <CaseSummary pet={pet} problems={problems} treatments={treatments} labs={labs} todayISO={todayISO} />
      </div>

      {/* ── آخر تحاليل — نظرة سريعة، وضغطة تفتح تبويب المختبر ── */}
      {labs.length > 0 && (
        <div className="mt-3">
          <LastLabsStrip results={labs} onOpen={() => navigate(`/pet/${pet.id}?tab=labs`)} />
        </div>
      )}

      {/* ── لوحة اليوم — شنو لازم يصير الآن ── */}
      {hasFlowsheet && !ended && (
        <TodayPanel
          todayISO={todayISO} lang={lang}
          todayPending={todayPending} todayDoneCount={todayDoses.length - todayPending.length}
          overdueDoses={overdueDoses} nextDose={nextDose} remaining={remaining} totalDoses={totalDoses}
          onGiveAll={() => giveMany(todayPending)} onGiveOne={giveQuick} onGiveOverdue={() => giveMany(overdueDoses)}
        />
      )}

      {/* ── خطة العلاج — باليوم أو بالدواء، بمكانها المعتاد ── */}
      {(hasFlowsheet || !ended) && (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-brand-600 dark:from-brand-500/25 dark:to-brand-500/10 dark:text-brand-300"><ClipboardList size={16} /></span>
              خطة العلاج
            </h2>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {hasFlowsheet && (
                <div className="inline-flex rounded-full border border-line bg-surface-2 p-0.5">
                  <ViewToggleBtn active={planView === "day"} icon={<Rows3 size={14} />} label="باليوم" onClick={() => { playTap(); setPlanView("day"); }} />
                  <ViewToggleBtn active={planView === "drug"} icon={<LayoutGrid size={14} />} label="بالدواء" onClick={() => { playTap(); setPlanView("drug"); }} />
                </div>
              )}
              {hasFlowsheet && planView === "day" && (
                <div className="hidden flex-wrap gap-x-3 gap-y-1 sm:flex">
                  {(["done", "due", "overdue", "upcoming"] as DoseStatus[]).map((st) => (
                    <span key={st} className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-ink-muted"><span className={cn("inline-block h-3 w-3 rounded-sm", STATUS_META[st].bar)} /> {STATUS_META[st].label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* البروتوكول يبيّن نفسه فوق الطبلة — اسمه ويومه وتقدّمه وتحذيره */}
          {activeProto && <ProtocolBand mark={activeProto} todayISO={todayISO} treatments={treatments} />}
          {planView === "day" || !hasFlowsheet ? (
            <TreatmentSheetTable
              dayGroups={planDays} todayISO={todayISO} ended={ended} lang={lang} dayNotes={dayNotes}
              species={pet?.species}
              protoNotes={protoNotes}
              todayRowRef={todayRowRef}
              onGive={(tx) => { playTap(); setGiveId(tx.id); }}
              onEditDrug={(tx) => { playTap(); setEditTarget(tx); }}
              onAddNote={(day) => { playTap(); setNoteText(""); setNoteDay(day); setNoteOpen(true); }}
              onAddDrug={openAddDrug}
              onRecordObs={(tx) => { playTap(); setObsTarget(tx); }}
            />
          ) : (
            <MedCourseView courses={medCourses} todayISO={todayISO} ended={ended} lang={lang} onGive={giveQuick} />
          )}
        </div>
      )}

      {/* ── طباعة الطبلة — زرٌّ بارز ودائم ────────────────────────────────
          كان موجوداً لكن مدفوناً داخل قسمٍ مطويّ باللافتة وبخطٍّ صغير، ويختفي
          كلياً بعد إنهاء العلاج — وهو أكثر وقتٍ تُطلب فيه الورقة. فصار سطراً
          قائماً بذاته يظهر دائماً: أثناء العلاج وبعده. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          data-printsheet
          onClick={printSheet}
          disabled={!hasFlowsheet && !primary}
          style={{ minHeight: 44 }}
          className="inline-flex items-center gap-2 rounded-full border-2 border-brand-500 bg-brand-50 px-4 py-2.5 text-sm font-extrabold text-brand-700 transition hover:bg-brand-100 disabled:opacity-45 dark:bg-brand-500/15 dark:text-brand-300"
        >
          <Printer size={16} /> {t("visit.printSheet", "طباعة الطبلة")}
        </button>
        {/* تقرير الزبون — ورقةٌ أخرى تماماً: سردٌ عن الحالة والرعاية بلا
            أسماء أدوية، تُسلَّم لصاحب الحيوان. */}
        <button
          data-printreport
          onClick={printCareReport}
          disabled={!hasFlowsheet && !primary}
          style={{ minHeight: 44 }}
          className="inline-flex items-center gap-2 rounded-full border-2 border-teal-500 bg-teal-50 px-4 py-2.5 text-sm font-extrabold text-teal-700 transition hover:bg-teal-100 disabled:opacity-45 dark:bg-teal-500/15 dark:text-teal-300"
        >
          <FileText size={16} /> {t("visit.printReport", "تقرير للزبون")}
        </button>
        <span className="text-2xs font-semibold text-ink-subtle">
          {hasFlowsheet || primary
            ? t("visit.printBothHint", "الطبلة: ورقة داخلية بكل الجرعات · التقرير: ورقة لصاحب الحيوان تحكي الحالة والرعاية بلا ذكر أسماء الأدوية.")
            : t("visit.printSheetEmpty", "سجّل تشخيصاً أو أضف دواءً أولاً حتى تصير الطبلة قابلة للطباعة.")}
        </span>
      </div>

      {/* ── شريط الأزرار — نفس الترتيب المعتاد، بمظهر أهدأ ── */}
      {!ended && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isIllness && (
            <button onClick={() => { playTap(); setPlanOpen(true); }} className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-soft transition hover:bg-brand-700">
              <ClipboardList size={16} /> {clinicalNotes.length ? "تعديل التشخيص وخطة العلاج" : "التشخيص وخطة العلاج"}
            </button>
          )}
          <SecondaryBtn icon={<Pill size={15} />} label="إضافة دواء" onClick={() => openAddDrug()} />
          <SecondaryBtn icon={<FlaskConical size={15} />} label="تسجيل تحاليل" onClick={() => { playTap(); setLabOpen(true); }} />
          {hasFlowsheet && <SecondaryBtn icon={<CalendarPlus size={15} />} label="تمديد الخطة" onClick={() => { playTap(); setExtendOpen(true); }} />}
          <SecondaryBtn icon={<NotebookPen size={15} />} label="إضافة ملاحظة" onClick={() => { playTap(); setNoteText(""); setNoteDay(null); setNoteOpen(true); }} />
          <button onClick={() => { playTap(); setEndOpen(true); }} className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-danger-300 px-4 py-2.5 text-sm font-bold text-danger-600 transition hover:bg-danger-50 dark:border-danger-500/40 dark:hover:bg-danger-500/10">
            <Check size={15} /> إنهاء العلاج وإغلاق الزيارة
          </button>
        </div>
      )}

      {/* ── العمليات الجراحية — سطر واحد لمّا فاضية ── */}
      <div className="mt-4">
        <SurgerySection petId={pet.id} visitId={visit.id} lang={lang} defaultSurgeon={user?.full_name ?? ""} readonly={ended} />
      </div>

      {clinicalNotes.length > 0 && (
        <div className="mt-3 space-y-3">
          {clinicalNotes.map(({ n, record }) => <div key={n.id}><ClinicalRecordCard record={record!} compact /></div>)}
        </div>
      )}

      {generalNotes.length > 0 ? (
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 dark:from-amber-500/25 dark:to-amber-500/10 dark:text-amber-300"><NotebookPen size={16} /></span>
            ملاحظات الزيارة
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {generalNotes.map((n) => (
              <div key={n.id} className="rounded-xl border border-line bg-surface-1 p-3">
                <div className="mb-1 flex items-center gap-2 text-2xs text-ink-subtle">
                  <span className="font-semibold text-ink-muted">{n.author_name || "—"}</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(n.created_at, lang)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{n.note_text}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-4">
          <Section icon={<NotebookPen size={14} />} title="ملاحظات الزيارة" empty emptyText="ما في ملاحظات"
            action={ended ? undefined : () => { setNoteText(""); setNoteDay(null); setNoteOpen(true); }} actionLabel="ملاحظة" />
        </div>
      )}

      <section className="mt-4">
        <CareSheet pet={pet} visitId={visit.id} day={todayISO} doctor={user?.full_name} treatments={treatments} />
      </section>

      <section className="mt-4">
        <ProblemList petId={pet.id} doctor={user?.full_name} onFlagsChange={setProblems} />
      </section>

      <Modal open={labOpen} onClose={() => setLabOpen(false)} size="wide" title={`تسجيل تحاليل — ${pet.name}`}>
        <LabEntry pet={pet} visitId={visit.id} doctor={user?.full_name} onSaved={() => void reload()} onClose={() => setLabOpen(false)} />
      </Modal>

      <Modal
        open={planOpen}
        onClose={() => {
          // A stray Escape or backdrop tap must not throw away 5 steps of work.
          if (planDirty.current && !window.confirm("في تشخيص وخطة غير محفوظة بالمعالج — تريد تسكّر وتخسرها؟")) return;
          planDirty.current = false;
          setPlanOpen(false);
        }}
        size="full" title={`التشخيص وخطة العلاج — ${pet.name}`}
      >
        <TreatmentPlan onSubmit={savePlan} busy={planBusy} species={pet.species} petId={pet.id} weightKg={pet.current_weight_kg} allergies={pet.allergies} flags={prescribingFlags} onMediaAdded={reload} onDirtyChange={(d) => { planDirty.current = d; }} />
      </Modal>

      <Modal open={noteOpen} onClose={() => { setNoteOpen(false); setNoteText(""); setNoteDay(null); }} title={noteDay ? `ملاحظة على ${formatDate(noteDay, lang)}` : "إضافة ملاحظة"}>
        <div className="space-y-3">
          <textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus placeholder="اكتب ملاحظة…" className="input min-h-[110px] resize-y leading-relaxed" />
          <div className="flex justify-end">
            <Button leftIcon={<Plus size={16} />} disabled={!noteText.trim()} onClick={async () => { await addNote(noteText, noteDay ?? undefined); setNoteOpen(false); setNoteText(""); setNoteDay(null); }}>إضافة</Button>
          </div>
        </div>
      </Modal>

      {giveTarget && <GiveModal t={giveTarget} lang={lang} defaultDoctor={user?.full_name ?? ""} ended={ended} onClose={() => setGiveId(null)} onGive={giveDose} onUndo={undoDose} />}
      {/* تسجيل خانة رعاية من المصفوفة — نفس ورقة الشبكة حرفياً */}
      {obsTarget && (
        <ObsRecorder
          entry={obsTarget} species={pet.species} petId={pet.id}
          onSave={(v) => { void saveObs(obsTarget, v); }}
          onClose={() => setObsTarget(null)}
        />
      )}
      <AddDrugModal open={addDrugOpen} day={addDrugDay} lang={lang} lastDay={lastDay} defaultDoctor={user?.full_name ?? ""} onClose={() => setAddDrugOpen(false)} onAdd={addDrug} />
      {editTarget && (
        <EditDrugModal
          entry={editTarget}
          treatments={treatments}
          lang={lang}
          onClose={() => setEditTarget(null)}
          onSave={editDrug}
        />
      )}
      <ExtendPlanModal open={extendOpen} lastDay={lastDay} lang={lang} medCount={lastDay ? treatments.filter((t) => t.day === lastDay).length : 0} onClose={() => setExtendOpen(false)} onExtend={extendCourse} />
      <EndVisitModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={endVisit} />
    </div>
  );
}

/* ------------------------------ View toggle ------------------------------- */
function ViewToggleBtn({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-extrabold transition", active ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink")}>
      {icon} {label}
    </button>
  );
}

/* -------------------------- Today command panel --------------------------- */
/** The single most-used surface: what the doctor must do RIGHT NOW — today's due
 *  doses with one-tap give (and give-all), overdue catch-up, or a calm all-done state. */
function TodayPanel({ todayISO, lang, todayPending, todayDoneCount, overdueDoses, nextDose, remaining, totalDoses, onGiveAll, onGiveOne, onGiveOverdue }: {
  todayISO: string; lang: string; todayPending: TreatmentEntry[]; todayDoneCount: number;
  overdueDoses: TreatmentEntry[]; nextDose: TreatmentEntry | null; remaining: number; totalDoses: number;
  onGiveAll: () => void; onGiveOne: (t: TreatmentEntry) => void; onGiveOverdue: () => void;
}) {
  const hasToday = todayPending.length > 0;
  const allDoneEver = totalDoses > 0 && remaining === 0;
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-surface-1 shadow-card dark:border-brand-500/30 dark:from-brand-500/10 dark:to-surface-1">
      <div className="flex items-center gap-2 border-b border-brand-100 px-4 py-2.5 dark:border-brand-500/20">
        <Zap size={16} className="text-brand-600" />
        <h2 className="text-sm font-black text-ink">لوحة اليوم</h2>
        <span className="text-2xs font-bold text-ink-subtle">· {formatDate(todayISO, lang)}</span>
      </div>
      <div className="space-y-3 p-4">
        {overdueDoses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5 dark:border-danger-500/30 dark:bg-danger-500/10">
            <AlertTriangle size={16} className="shrink-0 text-danger-600" />
            <span className="text-sm font-extrabold text-danger-700 dark:text-danger-300">{formatNum(overdueDoses.length)} جرعة متأخّرة</span>
            <span className="text-xs text-danger-600/80 dark:text-danger-300/80">لم تُعطَ في أيامها</span>
            <button onClick={onGiveOverdue} className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-danger-700">
              <Check size={13} /> تسجيل إعطائها الآن
            </button>
          </div>
        )}
        {hasToday ? (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold text-ink">جرعات اليوم المستحقّة <span className="text-brand-600">({formatNum(todayPending.length)})</span></div>
              {todayDoneCount > 0 && <div className="text-2xs font-bold text-success-600">✓ أُعطيت {formatNum(todayDoneCount)}</div>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {todayPending.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 p-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warn-50 text-warn-600 dark:bg-warn-500/15"><Pill size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-ink">{t.medication}</div>
                    <div className="truncate text-2xs font-bold text-ink-subtle">{[t.amount, t.observations].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <button onClick={() => onGiveOne(t)} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-brand-700">تم</button>
                </div>
              ))}
            </div>
            <button onClick={onGiveAll} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-grad py-3 text-sm font-black text-white shadow-card transition hover:opacity-95 active:scale-[0.99]">
              <Check size={18} /> إعطاء كل جرعات اليوم ({formatNum(todayPending.length)})
            </button>
          </>
        ) : allDoneEver ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-success-50 px-3 py-3 text-success-700 dark:bg-success-500/10 dark:text-success-300">
            <CheckCircle2 size={20} className="shrink-0" /><div><b className="font-black">اكتمل العلاج بالكامل</b> — كل الجرعات أُعطيت. أحسنت! 🎉</div>
          </div>
        ) : todayDoneCount > 0 ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-success-50 px-3 py-3 text-success-700 dark:bg-success-500/10 dark:text-success-300">
            <CheckCircle2 size={20} className="shrink-0" /><div><b className="font-black">أُكملت جرعات اليوم</b> — لا جرعات متبقية اليوم.{nextDose && <> القادمة {formatDate(nextDose.day, lang)}.</>}</div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-3 text-ink-muted">
            <CalendarClock size={20} className="shrink-0 text-brand-600" /><div>لا جرعات مجدولة اليوم.{nextDose && <> الجرعة القادمة <b className="font-bold text-ink">{formatDate(nextDose.day, lang)}</b> — {nextDose.medication}.</>}</div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------- Per-medication course view --------------------- */
interface MedCourse { name: string; rows: TreatmentEntry[]; total: number; given: number; overdueN: number; next: TreatmentEntry | null; amount: string; freq: string }
function MedCourseView({ courses, todayISO, ended, lang, onGive }: { courses: MedCourse[]; todayISO: string; ended: boolean; lang: string; onGive: (t: TreatmentEntry) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => {
        const pct = c.total ? Math.round((c.given / c.total) * 100) : 0;
        const done = c.given === c.total;
        const dueNow = !!c.next && c.next.day <= todayISO;
        return (
          <div key={c.name} className="flex flex-col gap-2.5 rounded-xl border border-line-strong bg-surface-1 p-3.5 shadow-card">
            <div className="flex items-start gap-2">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", done ? "bg-success-50 text-success-600 dark:bg-success-500/15" : c.overdueN ? "bg-danger-50 text-danger-600 dark:bg-danger-500/15" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15")}><Pill size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black leading-tight text-ink">{c.name}</div>
                {(c.amount || c.freq) && <div className="truncate text-2xs font-bold text-ink-subtle">{[c.amount, c.freq].filter(Boolean).join(" · ")}</div>}
              </div>
              {done ? <CheckCircle2 size={18} className="shrink-0 text-success-500" /> : c.overdueN > 0 ? <span className="shrink-0 rounded bg-danger-100 px-1.5 py-0.5 text-[9px] font-black text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">{formatNum(c.overdueN)} متأخّرة</span> : null}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-2xs font-bold">
                <span className="text-ink-subtle">{formatNum(c.given)} من {formatNum(c.total)} جرعة</span>
                <span className={done ? "text-success-600" : "text-brand-600"}>{formatNum(pct)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className={cn("h-full rounded-full transition-all", done ? "bg-success-500" : c.overdueN ? "bg-danger-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
              <span className="text-2xs font-bold text-ink-muted">
                {done ? <span className="text-success-600">✓ مكتمل</span> : c.next ? <>التالية: {formatDate(c.next.day, lang)}</> : "—"}
              </span>
              {!ended && !done && c.next && dueNow && (
                <button onClick={() => onGive(c.next!)} className="rounded-lg bg-brand-600 px-2.5 py-1 text-2xs font-black text-white transition hover:bg-brand-700">تم إعطاؤها</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------- Extend plan modal -------------------------- */
function ExtendPlanModal({ open, lastDay, lang, medCount, onClose, onExtend }: {
  open: boolean; lastDay: string | null; lang: string; medCount: number; onClose: () => void; onExtend: (days: number) => void | Promise<void>;
}) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDays(7); setBusy(false); } }, [open]);
  const submit = async () => { if (busy || days < 1) return; setBusy(true); try { await onExtend(days); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="تمديد خطة العلاج">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">تُكرَّر أوامر آخر يوم كما هي — أدويةً ومتابعاتٍ بأوقاتها{medCount ? ` (${formatNum(medCount)} أمراً)` : ""} — لعدد إضافي من الأيام{lastDay ? <> بعد <b className="text-ink">{formatDate(lastDay, lang)}</b></> : ""}.</p>
        <div className="flex flex-wrap gap-2">
          {[3, 5, 7, 14].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={cn("rounded-lg border px-4 py-2 text-sm font-black transition", days === d ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>{formatNum(d)} أيام</button>
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-bold text-ink-muted">عدد الأيام</div>
          <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className="input h-11 w-full tabular-nums" dir="ltr" />
        </div>
        <Button size="lg" className="w-full" leftIcon={<CalendarPlus size={18} />} loading={busy} disabled={!medCount} onClick={submit}>تمديد {formatNum(days)} أيام</Button>
      </div>
    </Modal>
  );
}

/* -------------------- Paper-style daily treatment table ------------------- */
/**
 * The daily plan laid out EXACTLY like the clinic's paper sheet — the same four
 * columns in the same order (اليوم والساعة | العلاج | الطبيب المعالج | الملاحظات),
 * one row per dose. Doctors used to the paper read it the same way; giving a dose
 * fills in the treating doctor + time just as they would write it by hand.
 */
/** درجةُ خانة المصفوفة → كسوة رقاقتها: القيمة تلبس لون حكمها. */
const CELL_TONE: Record<string, string> = {
  good: "border-success-300 bg-success-50 text-success-700 dark:border-success-500/40 dark:bg-success-500/10 dark:text-success-300",
  mid: "border-warn-300 bg-warn-50 text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-300",
  low: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300",
  crit: "border-danger-300 bg-danger-50 text-danger-700 dark:border-danger-500/40 dark:bg-danger-500/10 dark:text-danger-300",
  none: "border-line-strong bg-surface-1 text-ink-muted",
};

/** ترتيب أسطر المصفوفة — سريريّ ثابت: الحيوية أولاً وينزل للمختبر. */
const CARE_ORDER: Record<CareKind, number> = {
  vitals: 0, mentation: 1, fluid: 2, feed: 3, elim: 4, urine: 5, nurse: 6, lab: 7, drug: 8, protocol: 9,
};

function TreatmentSheetTable({ dayGroups, todayISO, ended, lang, species, dayNotes, protoNotes, onGive, onEditDrug, onAddNote, onAddDrug, onRecordObs, todayRowRef }: {
  dayGroups: [string, TreatmentEntry[]][]; todayISO: string; ended: boolean; lang: string;
  species?: Pet["species"];
  dayNotes: Map<string, PetNote[]>;
  /** ملاحظاتُ بنود البروتوكول باسم الدواء — تُعرض بعمود الملاحظات بكسوةٍ زرقاء. */
  protoNotes: Record<string, string>;
  onGive: (t: TreatmentEntry) => void; onEditDrug: (t: TreatmentEntry) => void;
  onAddNote: (day: string) => void; onAddDrug: (day: string) => void;
  onRecordObs: (t: TreatmentEntry) => void;
  todayRowRef?: React.Ref<HTMLTableRowElement>;
}) {
  const { t } = useTranslation();
  const editLabel = t("visit.editDrug", "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u062f\u0648\u0627\u0621");
  const th = "border-b-2 border-line-strong bg-surface-2 px-3 py-2.5 text-start text-xs font-extrabold text-ink";
  /** \u062a\u0631\u0648\u064a\u0633\u0629 \u0627\u0644\u064a\u0648\u0645 \u2014 \u062a\u064f\u0631\u0633\u0645 \u0628\u0623\u0648\u0644 \u0635\u0641 \u0628\u0627\u0644\u064a\u0648\u0645. */
  const dayHead = (day: string, isToday: boolean) => (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-sm font-black text-ink">{formatDate(day, lang)}</span>
      {isToday && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[9px] font-black text-white">{t("visit.todayChip", "\u0627\u0644\u064a\u0648\u0645")}</span>}
    </div>
  );
  /** \u0645\u0644\u0627\u062d\u0638\u0629 \u0628\u0631\u0648\u062a\u0648\u0643\u0648\u0644 \u0644\u0635\u0641 \u062f\u0648\u0627\u0621 \u2014 \u0643\u0633\u0648\u0629 \u0632\u0631\u0642\u0627\u0621 \u062a\u0641\u0631\u0642\u0647\u0627 \u0639\u0646 \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u064a\u062f. */
  const protoNoteOf = (med: string): string | null => protoNotes[med] ?? null;
  return (
    <div className="overflow-x-auto rounded border border-line-strong shadow-card">
      <table className="w-full min-w-[620px] border-collapse lg:min-w-[960px]">
        <thead>
          <tr>
            <th className={cn(th, "w-[24%] border-e border-line lg:w-[14%]")}>{t("visit.colDayTime", "\u0627\u0644\u064a\u0648\u0645 \u0648\u0627\u0644\u0633\u0627\u0639\u0629")}</th>
            <th className={cn(th, "w-[34%] border-e border-line lg:w-[24%]")}>{t("visit.colTreatment", "\u0627\u0644\u0639\u0644\u0627\u062c")}</th>
            <th className={cn(th, "w-[20%] border-e border-line lg:w-[14%]")}>{t("visit.colDoctor", "\u0627\u0644\u0637\u0628\u064a\u0628 \u0627\u0644\u0645\u0639\u0627\u0644\u062c")}</th>
            <th className={cn(th, "w-[22%] lg:w-[18%] lg:border-e lg:border-line")}>{t("visit.colNotes", "\u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a")}</th>
            {/* \u0639\u0645\u0648\u062f \u0627\u0644\u0631\u0639\u0627\u064a\u0629 \u2014 \u062f\u0627\u062e\u0644 \u0627\u0644\u0637\u0628\u0644\u0629\u060c \u0645\u0642\u0627\u0628\u0644 \u0643\u0644 \u064a\u0648\u0645. \u0628\u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0636\u064a\u0651\u0642\u0629 \u064a\u0646\u0632\u0644 \u062a\u062d\u062a \u064a\u0648\u0645\u0647 */}
            <th className={cn(th, "hidden lg:table-cell lg:w-[30%]")}>{t("visit.colCare", "\u0631\u0639\u0627\u064a\u0629 \u0627\u0644\u064a\u0648\u0645")}</th>
          </tr>
        </thead>
        <tbody>
          {dayGroups.map(([day, rows]) => {
            const isToday = day === todayISO;
            const notes = dayNotes.get(day) ?? [];
            /* \u00ab\u062a\u0645 \u0627\u0644\u0639\u0644\u0627\u062c\u00bb \u0644\u0644\u0623\u062f\u0648\u064a\u0629 \u0648\u062d\u062f\u0647\u0627 \u2014 \u0627\u0644\u0633\u0648\u0627\u0626\u0644 \u0648\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0627\u062a \u0631\u0639\u0627\u064a\u0629\u064c \u062a\u0633\u0643\u0646 \u0645\u0635\u0641\u0648\u0641\u0629\u064e \u064a\u0648\u0645\u0647\u0627 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629. */
            const meds = rows.filter(isGivable);
            const care = rows.filter((r) => !isGivable(r));
            /* خانةُ الرعاية تُرسم دائماً ولو فرغت: عمودٌ برأسٍ بلا خانةٍ تحته
             * يجعل الجدولَ يتزحزح صفاً عن صفّ — والطبلةُ الفارغة أوّلُ من
             * يُظهر ذلك، لأن كلَّ أيامها بلا رعاية. */
            const careCell = (
              <td className="hidden border-s-2 border-line-strong bg-surface-2/50 p-2 align-top lg:table-cell" rowSpan={Math.max(1, meds.length)} data-carecell={day}>
                {care.length > 0 ? (
                  <CareMatrix rows={care} day={day} todayISO={todayISO} ended={ended} species={species}
                    onCell={(x) => ((x.task_type ?? "") === "fluid" ? onGive(x) : onRecordObs(x))} />
                ) : (
                  <span className="text-[11px] font-semibold text-ink-subtle">{t("visit.noCareDay", "\u0645\u0627 \u0641\u064a \u0631\u0639\u0627\u064a\u0629\u064c \u0645\u062c\u062f\u0648\u0644\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u064a\u0648\u0645")}</span>
                )}
              </td>
            );
            const notesCell = (first: boolean, tx: TreatmentEntry) => {
              const pNote = protoNoteOf(tx.medication);
              return (
                <td className={cn("border-line px-3 py-2.5 align-top", "lg:border-e")}>
                  {tx.administered_at && (
                    <div className="mb-1 flex items-center gap-1 text-xs font-bold text-success-700 dark:text-success-300"><Check size={12} className="shrink-0" /> {t("visit.givenShort", "\u0623\u064f\u0639\u0637\u064a\u062a")}</div>
                  )}
                  {pNote && (
                    <div data-protonote className="mb-1 rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-semibold leading-snug text-brand-800 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-200">
                      <span className="mb-0.5 flex items-center gap-1 text-[9px] font-black opacity-70"><CareIcon kind="protocol" size={10} /> {t("visit.fromProtocol", "\u0645\u0646 \u0627\u0644\u0628\u0631\u0648\u062a\u0648\u0643\u0648\u0644")}</span>
                      {pNote}
                    </div>
                  )}
                  {first && notes.map((n) => (
                    <div key={n.id} className="flex items-start gap-1 text-xs leading-snug text-ink-muted"><NotebookPen size={11} className="mt-0.5 shrink-0 text-ink-subtle" /> {parseDayNote(n.note_text).body}</div>
                  ))}
                  {first && !ended && (
                    <button type="button" onClick={() => onAddNote(day)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300">
                      <Plus size={11} /> {t("visit.addNoteBtn", "\u0645\u0644\u0627\u062d\u0638\u0629")}
                    </button>
                  )}
                </td>
              );
            };
            const medRowsJsx = meds.map((tx, idx) => {
              const st = doseStatus(tx, todayISO);
              const m = STATUS_META[st];
              const first = idx === 0;
              const pNote = protoNoteOf(tx.medication);
              // \u0627\u0644\u062a\u0648\u062c\u064a\u0647 \u0627\u0644\u0645\u0623\u062e\u0648\u0630 \u0645\u0646 \u0627\u0644\u0628\u0631\u0648\u062a\u0648\u0643\u0648\u0644 \u064a\u064f\u0639\u0631\u0636 \u0628\u0639\u0645\u0648\u062f \u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u2014 \u0641\u0644\u0627 \u064a\u064f\u0643\u0631\u0651\u0631 \u062a\u062d\u062a \u0627\u0644\u0627\u0633\u0645.
              const subBits = [tx.amount, tx.observations && tx.observations !== pNote ? tx.observations : null].filter(Boolean);
              return (
                <tr key={tx.id} ref={isToday && first ? todayRowRef : undefined}
                  className={cn(m.row, first ? "border-t-2 border-line-strong" : "border-t border-line")}>
                  <td className="border-e border-line px-3 py-2.5 align-top">
                    {first && dayHead(day, isToday)}
                    <div className="flex items-center gap-1.5">
                      <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-sm", m.bar)} />
                      <span className="text-xs font-bold tabular-nums text-ink-subtle" dir="ltr">
                        {tx.administered_at ? clockOf(tx.administered_at, lang) : (fmtClock(tx.time) || "\u2014")}
                      </span>
                    </div>
                    {first && !ended && (
                      <button type="button" onClick={() => onAddDrug(day)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300">
                        <Plus size={11} /> {t("visit.addDrugBtn", "\u062f\u0648\u0627\u0621")}
                      </button>
                    )}
                  </td>
                  <td className="border-e border-line px-3 py-2.5 align-top">
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-extrabold text-ink">{tx.medication}</div>
                        {subBits.length > 0 && (
                          <div className="mt-0.5 text-xs font-semibold text-ink-subtle">{subBits.join(" \u00b7 ")}</div>
                        )}
                      </div>
                      {!ended && !tx.administered_at && (
                        <button type="button" data-editdrug={tx.id} onClick={() => onEditDrug(tx)}
                          title={editLabel}
                          aria-label={editLabel}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border-e border-line px-3 py-2.5 align-top">
                    {tx.administered_at ? (
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-ink"><UserRound size={13} className="shrink-0 text-ink-subtle" /> {tx.administered_by || "\u2014"}</span>
                    ) : ended ? (
                      <span className="text-sm text-ink-subtle">{"\u2014"}</span>
                    ) : (
                      <button type="button" onClick={() => onGive(tx)}
                        className="inline-flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-brand-700">
                        <Check size={13} /> {t("visit.giveBtn", "\u062a\u0645 \u0627\u0644\u0639\u0644\u0627\u062c")}
                      </button>
                    )}
                  </td>
                  {notesCell(first, tx)}
                  {first && careCell}
                </tr>
              );
            });
            /* \u064a\u0648\u0645\u064c \u0628\u0644\u0627 \u0623\u062f\u0648\u064a\u0629: \u0635\u0641\u064c \u0648\u0627\u062d\u062f \u064a\u062d\u0645\u0644 \u062a\u0631\u0648\u064a\u0633\u062a\u0647 \u0648\u0645\u0642\u0627\u0628\u0644\u0647 \u0631\u0639\u0627\u064a\u062a\u0647 \u2014 \u0644\u0627 \u064a\u062e\u062a\u0641\u064a \u0627\u0644\u064a\u0648\u0645 \u0644\u0645\u062c\u0631\u062f \u0623\u0646 \u062f\u0648\u0627\u0621\u0647 \u0627\u0646\u062a\u0647\u0649. */
            const emptyDayRow = meds.length === 0 && (
              <tr key={`${day}-empty`} ref={isToday ? todayRowRef : undefined} className="border-t-2 border-line-strong">
                <td className="border-e border-line px-3 py-2.5 align-top">
                  {dayHead(day, isToday)}
                  {!ended && (
                    <button type="button" onClick={() => onAddDrug(day)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300">
                      <Plus size={11} /> {t("visit.addDrugBtn", "\u062f\u0648\u0627\u0621")}
                    </button>
                  )}
                </td>
                <td className="border-e border-line px-3 py-2.5 align-top text-xs font-semibold text-ink-subtle">{t("visit.noDrugsDay", "\u0644\u0627 \u0623\u062f\u0648\u064a\u0629 \u0647\u0630\u0627 \u0627\u0644\u064a\u0648\u0645")}</td>
                <td className="border-e border-line px-3 py-2.5 align-top text-sm text-ink-subtle">{"\u2014"}</td>
                <td className={cn("border-line px-3 py-2.5 align-top", "lg:border-e")}>
                  {notes.map((n) => (
                    <div key={n.id} className="flex items-start gap-1 text-xs leading-snug text-ink-muted"><NotebookPen size={11} className="mt-0.5 shrink-0 text-ink-subtle" /> {parseDayNote(n.note_text).body}</div>
                  ))}
                  {!ended && (
                    <button type="button" onClick={() => onAddNote(day)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300">
                      <Plus size={11} /> {t("visit.addNoteBtn", "\u0645\u0644\u0627\u062d\u0638\u0629")}
                    </button>
                  )}
                </td>
                {careCell}
              </tr>
            );
            /* \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0636\u064a\u0651\u0642\u0629: \u0627\u0644\u0645\u0635\u0641\u0648\u0641\u0629 \u062a\u0646\u0632\u0644 \u062a\u062d\u062a \u064a\u0648\u0645\u0647\u0627 \u0647\u064a \u2014 \u0644\u0627 \u062a\u062d\u062a \u0627\u0644\u062c\u062f\u0648\u0644 \u0643\u0644\u0647. */
            const mobileCareRow = care.length > 0 && (
              <tr key={`${day}-care-m`} className="border-t border-line lg:hidden" data-carerow={day}>
                <td colSpan={4} className="bg-surface-2/50 p-2">
                  <CareMatrix rows={care} day={day} todayISO={todayISO} ended={ended} species={species}
                    onCell={(x) => ((x.task_type ?? "") === "fluid" ? onGive(x) : onRecordObs(x))} />
                </td>
              </tr>
            );
            return [emptyDayRow, ...medRowsJsx, mobileCareRow];
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------- \u0645\u0635\u0641\u0648\u0641\u0629 \u0631\u0639\u0627\u064a\u0629 \u0627\u0644\u064a\u0648\u0645 --------------------- */
/**
 * CareMatrix \u2014 \u0631\u0639\u0627\u064a\u0629 \u064a\u0648\u0645\u064d \u0648\u0627\u062d\u062f \u0645\u0635\u0641\u0648\u0641\u0629\u064b: \u0643\u0644 \u0633\u0637\u0631 \u0646\u0648\u0639\u064c (\u062d\u064a\u0648\u064a\u0629\u060c \u0633\u0648\u0627\u0626\u0644\u060c
 * \u062a\u063a\u0630\u064a\u0629\u2026) \u0648\u0643\u0644 \u0639\u0645\u0648\u062f \u0648\u0642\u062a\u064c. \u0627\u0644\u0627\u0633\u0645 \u064a\u064f\u0643\u062a\u0628 \u0645\u0631\u0629\u064b \u0648\u0627\u0644\u0648\u0642\u062a \u0645\u0631\u0629\u064b\u060c \u0648\u0627\u0644\u062e\u0627\u0646\u0629 \u062a\u062d\u0645\u0644
 * **\u0627\u0644\u0642\u064a\u0645\u0629 \u0646\u0641\u0633\u0647\u0627** \u0628\u0644\u0648\u0646 \u062d\u0643\u0645\u0647\u0627 \u2014 \u0644\u0627 \u00ab\u0644\u0645 \u062a\u0633\u062c\u0651\u0644 \u0628\u0639\u062f\u00bb \u062e\u0645\u0633\u0629 \u0639\u0634\u0631 \u0645\u0631\u0629.
 * \u0627\u0644\u0636\u063a\u0637 \u0639\u0644\u0649 \u0627\u0644\u062e\u0627\u0646\u0629 \u064a\u0641\u062a\u062d \u0648\u0631\u0642\u0629 \u0627\u0644\u062a\u0633\u062c\u064a\u0644 \u0645\u0628\u0627\u0634\u0631\u0629 (\u0623\u0648 \u0646\u0627\u0641\u0630\u0629 \u0627\u0644\u0625\u0639\u0637\u0627\u0621 \u0644\u0644\u0633\u0648\u0627\u0626\u0644).
 */
function CareMatrix({ rows, day, todayISO, ended, species, onCell }: {
  rows: TreatmentEntry[]; day: string; todayISO: string; ended: boolean;
  species?: Pet["species"];
  onCell: (t: TreatmentEntry) => void;
}) {
  const { t } = useTranslation();
  const isToday = day === todayISO;
  const now = nowHHMM();
  // الأوقات المولَّدة مصفَّرة ("08:00") لكن المكتوبة باليد قد تجيء "8:00" —
  // والمقارنة النصية بلا تصفيرٍ تقرأ "8" أكبر من "16". يُصفَّر قبل أي مقارنة.
  const hm = (s: string): string => { const m = /^(\d{1,2}):(\d{2})/.exec(s.trim()); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s; };
  const doneOf = (x: TreatmentEntry) => !!x.administered_at || (x.result != null && String(x.result).trim() !== "");
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; kind: CareKind; cells: Map<string, TreatmentEntry> }>();
    for (const x of rows) {
      const name = x.medication || t("visit.careRow", "\u0631\u0639\u0627\u064a\u0629");
      const g = m.get(name) ?? m.set(name, { name, kind: careKindOf(x), cells: new Map() }).get(name)!;
      // \u0648\u0642\u062a\u0627\u0646 \u0645\u062a\u0637\u0627\u0628\u0642\u0627\u0646 \u0644\u0646\u0641\u0633 \u0627\u0644\u0627\u0633\u0645 \u0646\u0627\u062f\u0631\u2014 \u0627\u0644\u0623\u0648\u0644 \u064a\u0628\u0642\u0649.
      if (!g.cells.has(x.time || "")) g.cells.set(x.time || "", x);
    }
    return [...m.values()].sort((a, b) => (CARE_ORDER[a.kind] - CARE_ORDER[b.kind]) || a.name.localeCompare(b.name));
  }, [rows, t]);
  const times = useMemo(
    () => [...new Set(rows.map((x) => x.time || ""))].sort((a, b) => (a === "" ? "99:99" : hm(a)).localeCompare(b === "" ? "99:99" : hm(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const total = rows.length;
  const done = rows.filter(doneOf).length;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface-1" data-caregrid={day}>
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-2 py-1.5">
        <CareIcon kind="nurse" size={14} className="shrink-0 text-brand-600 dark:text-brand-300" />
        <span className="text-[11px] font-black text-ink">{t("visit.careDay", "\u0631\u0639\u0627\u064a\u0629 \u0627\u0644\u064a\u0648\u0645")}</span>
        <span className="ms-auto rounded-full border border-line bg-surface-1 px-1.5 text-[10px] font-black tabular-nums text-ink-subtle">{formatNum(done)}/{formatNum(total)}</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="px-1.5 py-1 text-start text-[9px] font-bold text-ink-subtle" />
            {times.map((tm) => (
              <th key={tm || "-"} className="border-s border-line px-1 py-1 text-center text-[9.5px] font-black tabular-nums text-ink-subtle" dir="ltr">{tm ? fmtClock(tm) : "\u2014"}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.name} className="border-t border-line">
              <td className="max-w-[92px] px-1.5 py-1">
                <span className="flex items-center gap-1 text-[10.5px] font-black leading-tight text-ink">
                  <CareIcon kind={g.kind} size={15} className="shrink-0 text-ink-subtle" />
                  <span className="truncate">{g.name}</span>
                </span>
              </td>
              {times.map((tm) => {
                const x = g.cells.get(tm);
                if (!x) return <td key={tm || "-"} className="border-s border-line px-1 py-1 text-center text-[10px] text-ink-subtle/40">{"\u2014"}</td>;
                const isDone = doneOf(x);
                const fluid = (x.task_type ?? "") === "fluid";
                const label = isDone
                  ? (fluid ? ((x.amount ?? "").trim() || t("visit.doneCell", "\u062a\u0645\u0651")) : String(x.result ?? "").trim() || t("visit.doneCell", "\u062a\u0645\u0651"))
                  : null;
                const tone = isDone ? (fluid ? "good" : (toneOfResult(x, species) ?? "none")) : "none";
                const due = isToday && !isDone && !!x.time && hm(x.time) <= now;
                const cellCls = cn(
                  "mx-auto flex min-h-[30px] w-full items-center justify-center rounded-md border px-1 text-[10.5px] font-black leading-tight tabular-nums transition",
                  isDone ? CELL_TONE[tone] ?? CELL_TONE.none
                    : due ? "border-brand-500 bg-brand-50 text-brand-700 shadow-[0_0_0_2px_rgba(88,159,251,.25)] dark:bg-brand-500/15 dark:text-brand-300"
                      : "border-dashed border-line-strong bg-transparent text-ink-subtle/60",
                  !ended && "hover:border-brand-400 active:scale-95",
                );
                const text = label ?? (due ? t("visit.dueNowCell", "\u0627\u0644\u0622\u0646") : "\u00b7");
                return (
                  <td key={tm || "-"} className="border-s border-line p-0.5 text-center">
                    {ended ? (
                      <span className={cellCls}>{label ?? "\u2014"}</span>
                    ) : (
                      <button type="button" data-carecellbtn={x.id} title={g.name} onClick={() => { playTap(); onCell(x); }} className={cellCls}>
                        <span className="truncate">{text}</span>
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------- \u0634\u0631\u064a\u0637 \u0627\u0644\u0628\u0631\u0648\u062a\u0648\u0643\u0648\u0644 ------------------------- */
/**
 * ProtocolBand \u2014 \u0627\u0644\u0628\u0631\u0648\u062a\u0648\u0643\u0648\u0644 \u064a\u0628\u064a\u0651\u0646 \u0646\u0641\u0633\u0647 \u0641\u0648\u0642 \u0627\u0644\u0637\u0628\u0644\u0629: \u0627\u0633\u0645\u0647 \u0648\u0627\u0633\u062a\u0637\u0628\u0627\u0628\u0647\u060c
 * \u00ab\u0627\u0644\u064a\u0648\u0645 \u0643\u0645 \u0645\u0646 \u0643\u0645\u00bb\u060c \u062a\u0642\u062f\u0651\u0645 \u0627\u0644\u064a\u0648\u0645 (\u0623\u062f\u0648\u064a\u0629/\u0631\u0639\u0627\u064a\u0629)\u060c \u0648\u062a\u062d\u0630\u064a\u0631\u0647 \u0627\u0644\u062f\u0627\u0626\u0645.
 * \u064a\u0642\u0631\u0623 \u0644\u0642\u0637\u0629\u064e \u2e18P\u2e19 \u0644\u0627 \u0627\u0644\u0645\u0643\u062a\u0628\u0629 \u2014 \u0641\u0645\u0627 \u0637\u064f\u0628\u0651\u0642 \u0641\u0639\u0644\u0627\u064b \u0647\u0648 \u0645\u0627 \u064a\u064f\u0639\u0631\u0636.
 */
function ProtocolBand({ mark, todayISO, treatments }: { mark: ProtocolMark; todayISO: string; treatments: TreatmentEntry[] }) {
  const { t } = useTranslation();
  const dayDiff = Math.round((new Date(`${todayISO}T00:00:00`).getTime() - new Date(`${mark.start}T00:00:00`).getTime()) / 86400000);
  const over = dayDiff >= mark.days;
  const before = dayDiff < 0;
  const dayIdx = Math.min(Math.max(dayDiff + 1, 1), mark.days);
  const todays = treatments.filter((x) => x.day === todayISO);
  const meds = todays.filter(isGivable);
  const medsDone = meds.filter((x) => x.administered_at).length;
  const care = todays.filter((x) => !isGivable(x));
  const careDone = care.filter((x) => !!x.administered_at || (x.result != null && String(x.result).trim() !== "")).length;
  const bar = (label: string, doneN: number, totalN: number) => (
    <div className="min-w-[140px] flex-1">
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-black text-ink-subtle">
        <span>{label}</span>
        <span className="tabular-nums" dir="ltr">{formatNum(doneN)}/{formatNum(totalN)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={cn("h-full rounded-full", totalN > 0 && doneN >= totalN ? "bg-success-500" : "bg-brand-500")} style={{ width: totalN ? `${Math.round((doneN / totalN) * 100)}%` : "0%" }} />
      </div>
    </div>
  );
  return (
    <div data-protoband className="mb-2 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-surface-1 p-3 dark:border-brand-500/30 dark:from-brand-500/10 dark:to-surface-1">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white"><CareIcon kind="protocol" size={19} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-ink">{mark.name}</p>
          {mark.indication && <p className="truncate text-[11px] font-semibold text-ink-subtle">{mark.indication}</p>}
        </div>
        <span className="shrink-0 rounded-full border border-brand-200 bg-surface-1 px-2.5 py-1 text-[11px] font-black text-brand-700 dark:border-brand-500/40 dark:text-brand-300">
          {over
            ? t("visit.protoOver", "\u0645\u0646\u062a\u0647\u064d")
            : before
              ? t("visit.protoSoon", "\u064a\u0628\u062f\u0623 \u063a\u062f\u0627\u064b")
              : t("visit.protoDay", { i: formatNum(dayIdx), n: formatNum(mark.days), defaultValue: "\u0627\u0644\u064a\u0648\u0645 {{i}} \u0645\u0646 {{n}}" })}
        </span>
      </div>
      {!over && !before && (meds.length > 0 || care.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-3">
          {meds.length > 0 && bar(t("visit.protoDrugs", "\u0623\u062f\u0648\u064a\u0629 \u0627\u0644\u064a\u0648\u0645"), medsDone, meds.length)}
          {care.length > 0 && bar(t("visit.protoCare", "\u0631\u0639\u0627\u064a\u0629 \u0627\u0644\u064a\u0648\u0645"), careDone, care.length)}
        </div>
      )}
      {mark.caution && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-warn-300 bg-warn-50 px-2.5 py-1.5 text-[11px] font-bold leading-snug text-warn-800 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{mark.caution}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Give modal ------------------------------- */
function GiveModal({ t, lang, defaultDoctor, ended, onClose, onGive, onUndo }: {
  t: TreatmentEntry; lang: string; defaultDoctor: string; ended: boolean;
  onClose: () => void; onGive: (t: TreatmentEntry, doctor: string, atISO: string) => void; onUndo: (t: TreatmentEntry) => void;
}) {
  const given = !!t.administered_at;
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [time, setTime] = useState(nowHHMM);
  const confirm = () => {
    const at = new Date(`${t.day}T${(time || nowHHMM())}:00`);
    onGive(t, doctor || defaultDoctor, isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString());
  };
  return (
    <Modal open onClose={onClose} title={t.medication}>
      <div className="space-y-4">
        <div className="rounded border border-line bg-surface-2 p-3 text-sm">
          <div className="font-bold text-ink">{t.medication}</div>
          <div className="text-2xs text-ink-subtle">{[t.amount, t.observations].filter(Boolean).join(" · ")} · {formatDate(t.day, lang)}</div>
        </div>
        {given ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded bg-success-50 px-3 py-2 text-sm font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300"><Check size={15} /> أُعطيت</span>
              <span className="inline-flex items-center gap-1.5 rounded border border-line bg-surface-1 px-2.5 py-2 text-xs font-bold text-ink-muted"><Clock size={13} /> {clockOf(t.administered_at!, lang)}</span>
              {t.administered_by && <span className="inline-flex items-center gap-1.5 rounded border border-line bg-surface-1 px-2.5 py-2 text-xs font-bold text-ink-muted"><UserRound size={13} /> {t.administered_by}</span>}
            </div>
            {!ended && <Button variant="secondary" className="w-full" leftIcon={<RotateCcw size={16} />} onClick={() => onUndo(t)}>تراجع عن الإعطاء</Button>}
          </>
        ) : (
          <>
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><UserRound size={13} /> الطبيب الذي أعطى العلاج</div>
              <DoctorSelect value={doctor} onChange={setDoctor} placeholder="اختر الطبيب…" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Clock size={13} /> وقت الإعطاء</div>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input h-11 w-full text-base tabular-nums" dir="ltr" />
            </div>
            <Button size="lg" className="w-full" leftIcon={<Check size={18} />} onClick={confirm}>تأكيد الإعطاء</Button>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ Edit-drug modal --------------------------- */
/** تعديل دواءٍ قبل إعطائه: الاسم/الكمية/الوقت/التكرار، وبمدى يقرّره الدكتور —
 *  هذا اليوم وحده، أو من هذا اليوم لنهاية الخطة. المعطى تاريخٌ لا يُمسّ. */
function EditDrugModal({ entry, treatments, onClose, onSave }: {
  entry: TreatmentEntry; treatments: TreatmentEntry[]; lang: string;
  onClose: () => void;
  onSave: (orig: TreatmentEntry, patch: { medication: string; amount: string; time: string; observations: string }, scope: "day" | "rest") => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [med, setMed] = useState(entry.medication);
  const [amount, setAmount] = useState(entry.amount ?? "");
  const [time, setTime] = useState(entry.time ?? "");
  const [freq, setFreq] = useState(entry.observations ?? "");
  const [scope, setScope] = useState<"day" | "rest">("day");
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const mine = treatments.filter((x) => x.medication === entry.medication && !x.administered_at);
    return {
      day: mine.filter((x) => x.day === entry.day).length,
      rest: mine.filter((x) => x.day >= entry.day).length,
    };
  }, [treatments, entry]);

  const submit = async () => {
    if (busy || !med.trim()) return;
    setBusy(true);
    try { await onSave(entry, { medication: med, amount, time, observations: freq }, scope); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={t("visit.editDrugTitle", { name: entry.medication, defaultValue: "تعديل — {{name}}" })}>
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Pill size={13} /> {t("visit.drugName", "اسم الدواء")}</div>
          <input value={med} onChange={(e) => setMed(e.target.value)} autoFocus className="input h-11 w-full text-base" data-editmed />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 text-xs font-bold text-ink-muted">{t("visit.doseAmount", "الجرعة / الكمية")}</div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className="input h-11 w-full" data-editamount />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold text-ink-muted">{t("visit.doseTime", "الوقت")}</div>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className="input h-11 w-full tabular-nums" data-edittime />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold text-ink-muted">{t("visit.doseFreq", "التكرار / ملاحظة")}</div>
            <input value={freq} onChange={(e) => setFreq(e.target.value)} className="input h-11 w-full" data-editfreq />
          </div>
        </div>
        {/* المدى — جوهر الميزة: ضغطة تقرّر «اليوم» أو «الباقي كله» */}
        <div>
          <div className="mb-1.5 text-xs font-bold text-ink-muted">{t("visit.editScope", "يشمل التعديل")}</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-scope="day" onClick={() => { playTap(); setScope("day"); }}
              className={cn("rounded-xl border-2 px-3 py-2.5 text-start transition", scope === "day" ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
              <span className="block text-sm font-extrabold text-ink">{t("visit.scopeDay", "هذا اليوم فقط")}</span>
              <span className="block text-2xs font-bold text-ink-subtle">{t("visit.scopeDayN", { n: formatNum(counts.day), defaultValue: "{{n}} جرعة غير معطاة" })}</span>
            </button>
            <button type="button" data-scope="rest" onClick={() => { playTap(); setScope("rest"); }}
              className={cn("rounded-xl border-2 px-3 py-2.5 text-start transition", scope === "rest" ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
              <span className="block text-sm font-extrabold text-ink">{t("visit.scopeRest", "من اليوم لنهاية الخطة")}</span>
              <span className="block text-2xs font-bold text-ink-subtle">{t("visit.scopeRestN", { n: formatNum(counts.rest), defaultValue: "{{n}} جرعة غير معطاة" })}</span>
            </button>
          </div>
          <p className="mt-1.5 text-2xs font-bold text-ink-subtle">{t("visit.editGivenSafe", "الجرعات المعطاة سابقاً تبقى كما سُجّلت — التعديل لا يمسّها.")}</p>
        </div>
        <Button size="lg" className="w-full" data-editsave leftIcon={<Check size={18} />} disabled={!med.trim()} loading={busy} onClick={submit}>
          {t("visit.editApply", "حفظ التعديل")}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Add-drug modal ---------------------------- */
/** Add a SINGLE ad-hoc medication for one day — for when the doctor decides to give
 *  an extra drug on the spot, without reopening the full diagnosis & plan. */
function AddDrugModal({ open, day, lastDay, defaultDoctor, onClose, onAdd }: {
  open: boolean; day: string; lang: string; lastDay: string | null; defaultDoctor: string;
  onClose: () => void;
  onAdd: (d: { day: string; medication: string; amount: string; freq: string; doctor: string; givenNow: boolean; repeatRest: boolean }) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [med, setMed] = useState("");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState("");
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [d, setD] = useState(day);
  const [givenNow, setGivenNow] = useState(false);
  const [repeatRest, setRepeatRest] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset the form each time the modal opens (for a fresh day/doctor).
  useEffect(() => {
    if (open) { setMed(""); setAmount(""); setFreq(""); setDoctor(defaultDoctor); setD(day); setGivenNow(false); setRepeatRest(false); setBusy(false); }
  }, [open, day, defaultDoctor]);

  /** كم يوماً يغطي التكرار حتى نهاية الخطة — للمعاينة على الخيار نفسه. */
  const restDays = useMemo(() => {
    if (!lastDay || lastDay <= d) return 0;
    return Math.round((new Date(`${lastDay}T00:00:00`).getTime() - new Date(`${d}T00:00:00`).getTime()) / 86400000) + 1;
  }, [lastDay, d]);

  // Drug-name suggestions: the built-in catalogue + the clinic's own medications.
  const drugNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of MED_CATALOG) if (c.type !== "Vaccines") for (const it of c.items) set.add(it);
    for (const m of getClinicMeds()) set.add(m.name);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [open]);

  const submit = async () => {
    if (!med.trim() || busy) return;
    setBusy(true);
    try { await onAdd({ day: d, medication: med, amount, freq, doctor, givenNow, repeatRest }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="إضافة دواء لهذا اليوم">
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Pill size={13} /> اسم الدواء</div>
          <input list="vp-drug-list" value={med} onChange={(e) => setMed(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && med.trim()) submit(); }}
            placeholder="اكتب أو اختر من القائمة…" className="input h-11 w-full text-base" />
          <datalist id="vp-drug-list">{drugNames.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-bold text-ink-muted">الجرعة / الكمية</div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="مثال: ١٦٠ ملغ" className="input h-11 w-full" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold text-ink-muted">التكرار / ملاحظة</div>
            <input value={freq} onChange={(e) => setFreq(e.target.value)} placeholder="مثال: مرتين يومياً" className="input h-11 w-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Clock size={13} /> اليوم</div>
            <input type="date" value={d} onChange={(e) => setD(e.target.value)} dir="ltr" className="input h-11 w-full tabular-nums" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><UserRound size={13} /> الطبيب</div>
            <DoctorSelect value={doctor} onChange={setDoctor} placeholder="اختر الطبيب…" />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-3 py-2.5 text-sm font-bold text-ink">
          <input type="checkbox" checked={givenNow} onChange={(e) => setGivenNow(e.target.checked)} className="h-4 w-4 accent-success-600" />
          <Check size={15} className="text-success-600" /> تم إعطاؤه الآن (تسجيل الجرعة كمُعطاة)
        </label>
        {/* «ولكل الأيام الباقية»: صف لكل يوم حتى نهاية الخطة — لا يوم واحد فقط */}
        {restDays > 1 && (
          <label className="flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-3 py-2.5 text-sm font-bold text-ink">
            <input type="checkbox" data-repeatrest checked={repeatRest} onChange={(e) => setRepeatRest(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            <CalendarPlus size={15} className="text-brand-600" /> {t("visit.repeatRest", { n: formatNum(restDays), defaultValue: "كرّره لكل الأيام الباقية بالخطة ({{n}} أيام)" })}
          </label>
        )}
        <Button size="lg" className="w-full" leftIcon={<Plus size={18} />} disabled={!med.trim()} loading={busy} onClick={submit}>
          إضافة الدواء
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------- End modal -------------------------------- */
function EndVisitModal({ open, onClose, onEnd }: { open: boolean; onClose: () => void; onEnd: (outcome: string, summary: string) => void | Promise<void> }) {
  const [outcome, setOutcome] = useState<string>("recovered");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="إنهاء الزيارة">
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-bold text-ink-muted">وضع الحالة النهائي</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OUTCOMES.map((o) => {
              const on = outcome === o.id;
              return (
                <button key={o.id} type="button" onClick={() => { playTap(); setOutcome(o.id); }}
                  className={cn("flex flex-col items-center gap-1 rounded border-2 p-3 text-center transition", on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
                  <GlyphMark name={o.id} size={28} className={glyphToneText(glyphTone(o.id) ?? "blue")} />
                  <span className="text-2xs font-bold text-ink">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-bold text-ink-muted">ملاحظة ختامية</div>
          <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="خلاصة الحالة عند الإغلاق…" className="input min-h-[80px] resize-y leading-relaxed" />
        </div>
        <Button size="lg" className="w-full" variant="danger" leftIcon={<Lock size={18} />} loading={busy}
          onClick={async () => { setBusy(true); try { await onEnd(outcome, summary); } finally { setBusy(false); } }}>
          تأكيد إنهاء العلاج وإغلاق الزيارة
        </Button>
      </div>
    </Modal>
  );
}


function SecondaryBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-4 py-2.5 text-sm font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
      {icon} {label}
    </button>
  );
}
