import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Clock, Check, Plus, NotebookPen, ClipboardList,
  Loader2, Lock, CheckCircle2, Stethoscope, UserRound, RotateCcw, AlertTriangle,
  Printer, Syringe, ShieldCheck, Pill,
  Zap, Rows3, LayoutGrid, CalendarPlus, Gauge, CalendarClock,
} from "lucide-react";
import type { Pet, ClinicVisit, PetNote, TreatmentEntry } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { TreatmentPlan } from "@/components/TreatmentPlan";
import { DoctorSelect } from "@/components/MedicalEntry";
import { ClinicalRecordCard } from "@/components/ClinicalRecordCard";
import { parseClinical, type ClinicalRecord } from "@/lib/clinicalRecord";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { MED_CATALOG, getClinicMeds } from "@/lib/meds";
import { GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { visitKindMeta } from "@/lib/visits";
import { localISO, formatDate, formatNum, ageFromDOB, cn } from "@/lib/utils";
import { getClinicName, getClinicLogo, getClinicSocials } from "@/lib/settings";
import { openTreatmentSheet, type SheetTreatmentRow } from "@/lib/treatmentSheetPrint";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

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
const clockOf = (iso: string, lang: string) => new Date(iso).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });

/** Human age string ("٣ سنة و٤ أشهر" / "8 أشهر") — empty when DOB is unknown. */
function ageText(dob?: string | null): string {
  const a = ageFromDOB(dob);
  if (!a) return "";
  const parts: string[] = [];
  if (a.years) parts.push(`${formatNum(a.years)} سنة`);
  if (a.months) parts.push(`${formatNum(a.months)} شهر`);
  return parts.join(" و") || "أقل من شهر";
}

/** Singular Arabic species name for a single patient ("كلب" — not the plural "كلاب"). */
const SPECIES_SINGULAR_AR: Record<string, string> = {
  dog: "كلب", cat: "قطة", horse: "حصان", cow: "بقرة", bird: "طائر", rabbit: "أرنب", other: "أخرى",
};

/** Brief diagnosis line from a clinical record ("داء البارفو (شديد) · و٢ آخر"). */
function diagnosisText(rec: ClinicalRecord | null): string {
  const dx = rec?.diagnoses ?? [];
  if (!dx.length) return "";
  const first = dx[0].disease;
  return dx.length > 1 ? `${first} · و${formatNum(dx.length - 1)} آخر` : first;
}

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

/** Circular progress dial (not mirrored in RTL — clocks/rings turn the same). */
function ProgressRing({ done, total, size = 72 }: { done: number; total: number; size?: number }) {
  const r = size / 2 - 6; const c = 2 * Math.PI * r; const pct = total ? done / total : 0;
  const full = total > 0 && done === total;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="stroke-line" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} strokeLinecap="round"
        className={cn(full ? "stroke-success-500" : "stroke-brand-500", "transition-all")}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={cn("fill-ink font-black", full && "fill-success-600")} fontSize={size * 0.28}>
        {formatNum(done)}<tspan className="fill-ink-subtle" fontSize={size * 0.2}>/{formatNum(total)}</tspan>
      </text>
    </svg>
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
  const seed = location.state as { pet?: Pet; visit?: ClinicVisit; treatments?: TreatmentEntry[] } | null;
  const seeded = !!(seed?.pet && seed?.visit && seed.visit.id === visitId);
  const [pet, setPet] = useState<Pet | null>(seeded ? seed!.pet! : null);
  const [visit, setVisit] = useState<ClinicVisit | null>(seeded ? seed!.visit! : null);
  const [notes, setNotes] = useState<PetNote[]>([]);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>(seeded ? (seed!.treatments ?? []) : []);
  const [loading, setLoading] = useState(!seeded);

  const [planOpen, setPlanOpen] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteDay, setNoteDay] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [giveId, setGiveId] = useState<string | null>(null);
  const [addDrugOpen, setAddDrugOpen] = useState(false);
  const [addDrugDay, setAddDrugDay] = useState<string>(() => localISO(new Date()));
  const [extendOpen, setExtendOpen] = useState(false);
  const [planView, setPlanView] = useState<"day" | "drug">("day");

  const reload = useCallback(async () => {
    if (!petId || !visitId) return;
    const [p, v, ns, tx] = await Promise.all([
      repo.getPet(petId),
      repo.getClinicVisit(visitId),
      repo.listPetNotes(petId).catch(() => [] as PetNote[]),
      repo.listTreatments(petId).catch(() => [] as TreatmentEntry[]),
    ]);
    setPet(p ?? null);
    setVisit(v);
    setNotes(ns.filter((n) => n.visit_id === visitId));
    setTreatments(tx.filter((t) => t.visit_id === visitId));
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
    () => notes.filter((n) => !parseClinical(n.note_text).record && !n.note_text.startsWith(DAY_MARK)),
    [notes],
  );

  const dayGroups = useMemo(() => {
    const map = new Map<string, TreatmentEntry[]>();
    for (const t of treatments) (map.get(t.day) ?? map.set(t.day, []).get(t.day)!).push(t);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [treatments]);
  const dayNotes = useMemo(() => {
    const map = new Map<string, PetNote[]>();
    for (const n of notes) { const { day } = parseDayNote(n.note_text); if (day) (map.get(day) ?? map.set(day, []).get(day)!).push(n); }
    return map;
  }, [notes]);

  const hasFlowsheet = treatments.length > 0;
  const totalDoses = treatments.length;
  const doneDoses = treatments.filter((t) => t.administered_at).length;
  const remaining = totalDoses - doneDoses;
  const giveTarget = treatments.find((t) => t.id === giveId) ?? null;

  // ── Smart treatment intelligence — the numbers that drive the command panel ──
  const todayDoses = useMemo(() => treatments.filter((t) => t.day === todayISO), [treatments, todayISO]);
  const todayPending = useMemo(() => todayDoses.filter((t) => !t.administered_at), [todayDoses]);
  const overdueDoses = useMemo(
    () => treatments.filter((t) => !t.administered_at && t.day < todayISO).sort((a, b) => a.day.localeCompare(b.day)),
    [treatments, todayISO],
  );
  const nextDose = useMemo(
    () => treatments.filter((t) => !t.administered_at && t.day > todayISO).sort((a, b) => a.day.localeCompare(b.day))[0] ?? null,
    [treatments, todayISO],
  );
  const adherence = totalDoses ? Math.round((doneDoses / totalDoses) * 100) : 0;
  const lastDay = dayGroups.length ? dayGroups[dayGroups.length - 1][0] : null;
  const daysLeft = lastDay
    ? Math.max(0, Math.round((new Date(`${lastDay}T00:00:00`).getTime() - new Date(`${todayISO}T00:00:00`).getTime()) / 86400000))
    : 0;
  // Group the flowsheet by medication — a clinical bird's-eye course view.
  const medCourses = useMemo(() => {
    const map = new Map<string, TreatmentEntry[]>();
    for (const t of treatments) (map.get(t.medication) ?? map.set(t.medication, []).get(t.medication)!).push(t);
    return [...map.entries()]
      .map(([name, rows]) => {
        const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
        const given = sorted.filter((r) => r.administered_at).length;
        const overdueN = sorted.filter((r) => !r.administered_at && r.day < todayISO).length;
        const next = sorted.find((r) => !r.administered_at) ?? null;
        return { name, rows: sorted, total: sorted.length, given, overdueN, next, amount: sorted[0]?.amount ?? "", freq: sorted[0]?.observations ?? "" };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [treatments, todayISO]);

  const isIllness = visit?.kind === "illness";
  // Singular species name for a single patient (Arabic uses a plural in the catalog).
  const speciesSingular = (species: string) =>
    lang.startsWith("ar") ? SPECIES_SINGULAR_AR[species] ?? t(`pet.species.${species}`, species) : t(`pet.species.${species}`, species);
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
      if (record?.treatment?.length && !hasFlowsheet) {
        const start = visit.opened_at;
        for (const m of record.treatment) {
          const nDays = Math.max(1, Math.min(60, m.days || 1));
          for (let i = 0; i < nDays; i++) {
            await repo.addTreatment({
              pet_id: visit.pet_id, visit_id: visit.id, day: addDaysISO(start, i),
              medication: m.name, amount: m.dose || "", time: "", observations: m.freq, doctor: user?.full_name,
            });
          }
        }
      } else if (record?.treatment?.length && hasFlowsheet) {
        for (const t of treatments) await repo.setTreatmentGiven(t.id, !!t.administered_at, t.administered_by, t.administered_at ?? undefined).catch(() => {});
      }
      setPlanOpen(false); playSuccess(); await reload();
    } catch (e) {
      playWarning();
      toast.error("تعذّر الحفظ", e instanceof Error ? e.message : undefined);
    } finally { setPlanBusy(false); }
  };

  const giveDose = async (t: TreatmentEntry, doctor: string, atISO: string) => {
    playSuccess();
    await repo.setTreatmentGiven(t.id, true, doctor || (user?.full_name ?? undefined), atISO);
    setGiveId(null); await reload();
  };
  /** One-tap give for a single dose (records the current doctor + now). */
  const giveQuick = async (t: TreatmentEntry) => {
    playSuccess();
    await repo.setTreatmentGiven(t.id, true, user?.full_name ?? undefined, new Date().toISOString());
    await reload();
  };
  /** Batch give — mark every dose in the list administered now by the current doctor. */
  const giveMany = async (list: TreatmentEntry[]) => {
    if (!list.length) return;
    playSuccess();
    const at = new Date().toISOString();
    for (const t of list) await repo.setTreatmentGiven(t.id, true, user?.full_name ?? undefined, at);
    await reload();
  };
  /** Extend the course — repeat the last day's medications for N more days. */
  const extendCourse = async (extraDays: number) => {
    if (!visit || !lastDay || extraDays < 1) return;
    const lastMeds = treatments.filter((t) => t.day === lastDay);
    if (!lastMeds.length) { setExtendOpen(false); return; }
    for (let i = 1; i <= extraDays; i++) {
      const base = new Date(`${lastDay}T00:00:00`); base.setDate(base.getDate() + i);
      const day = localISO(base);
      for (const m of lastMeds) {
        await repo.addTreatment({ pet_id: visit.pet_id, visit_id: visit.id, day, medication: m.medication, amount: m.amount, time: "", observations: m.observations, doctor: user?.full_name });
      }
    }
    playSuccess(); setExtendOpen(false); await reload();
  };
  const undoDose = async (t: TreatmentEntry) => {
    playTap();
    await repo.setTreatmentGiven(t.id, false);
    setGiveId(null); await reload();
  };
  const addNote = async (text: string, day?: string) => {
    if (!visit || !text.trim()) return;
    const body = day ? dayNoteEncode(day, text.trim()) : text.trim();
    await repo.addPetNote({ pet_id: visit.pet_id, note_text: body, author_id: user?.id ?? null, author_name: user?.full_name ?? null, visit_id: visit.id });
    playSuccess(); await reload();
  };
  const endVisit = async (outcome: string, summary: string) => {
    if (!visit) return;
    await repo.updateClinicVisit(visit.id, { status: "ended", ended_at: new Date().toISOString(), ended_by: user?.full_name ?? null, outcome, summary: summary.trim() || null });
    playSuccess(); setEndOpen(false); await reload();
  };

  /* ---- Add a single ad-hoc medication for one day (بشكل مفرد) ---- */
  const openAddDrug = (day?: string) => { playTap(); setAddDrugDay(day ?? localISO(new Date())); setAddDrugOpen(true); };
  const addDrug = async (d: { day: string; medication: string; amount: string; freq: string; doctor: string; givenNow: boolean }) => {
    if (!visit || !d.medication.trim()) return;
    const nowISO = new Date().toISOString();
    const by = d.doctor || (user?.full_name ?? undefined);
    await repo.addTreatment({
      pet_id: visit.pet_id, visit_id: visit.id, day: d.day,
      medication: d.medication.trim(), amount: d.amount.trim(), time: "",
      observations: d.freq.trim(), doctor: by,
      administered_at: d.givenNow ? nowISO : undefined,
      administered_by: d.givenNow ? by : undefined,
    });
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
          notes: tx.administered_at ? "✓ أُعطيت" : "",
        };
      }),
    );
    const socials = getClinicSocials();
    const ok = openTreatmentSheet({
      clinicName: getClinicName() || user?.full_name || "عيادة بيطرية",
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
        age: ageText(pet.dob),
      },
      date: formatDate(visit.opened_at, lang),
      diagnosis: diagnosisText(primary),
      clinicalTreatments: primary?.treatment?.map((m) => m.name).join("، ") ?? "",
      rows,
    });
    if (!ok) toast.error("تعذّرت الطباعة", "اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
  };

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-subtle"><Loader2 className="mx-auto mb-2 animate-spin" /> جارٍ التحميل…</div>;
  if (!visit || !pet) return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-subtle">
      لم يتم العثور على الزيارة.
      <div className="mt-4"><Button variant="secondary" onClick={() => navigate(-1)}>رجوع</Button></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <button onClick={() => navigate(`/pet/${petId}`)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted transition hover:text-ink">
        <ArrowRight size={16} /> رجوع إلى ملف {pet.name}
      </button>

      {/* ── Header + progress ring hero ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded border border-line-strong bg-surface-1 p-4 shadow-card">
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded text-white", kind!.solid)}><KindIcon size={23} /></span>
        <div className="min-w-0">
          <div className="text-lg font-black text-ink">{pet.name}</div>
          <div className="flex items-center gap-1.5 text-2xs font-bold text-ink-subtle">
            {[kind!.label, pet.breed].filter(Boolean).join(" · ")}
            {dxName && <span className="flex items-center gap-1 text-ink-muted">· {dxName}{dxWarn && <AlertTriangle size={12} className="text-danger-500" />}</span>}
          </div>
        </div>
        {hasFlowsheet && <>
          <span className="mx-1 hidden h-10 w-px bg-line sm:block" />
          <ProgressRing done={doneDoses} total={totalDoses} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">{remaining > 0 ? "متبقٍّ" : "اكتمل"}</div>
              <div className="text-sm font-black text-ink">{remaining > 0 ? <>{formatNum(remaining)} جرعة</> : "كل الجرعات ✓"}</div>
              <div className="text-2xs text-ink-subtle">على {formatNum(dayGroups.length)} أيام</div>
            </div>
            <HeaderStat icon={<Gauge size={14} />} label="الالتزام" value={`${formatNum(adherence)}%`}
              tone={adherence >= 80 ? "success" : adherence >= 50 ? "warn" : "danger"} />
            <HeaderStat icon={<CalendarClock size={14} />} label="ينتهي" value={remaining === 0 ? "اكتمل" : daysLeft > 0 ? `بعد ${formatNum(daysLeft)} يوم` : "اليوم"} tone="brand" />
            {overdueDoses.length > 0 && (
              <HeaderStat icon={<AlertTriangle size={14} />} label="متأخّرة" value={`${formatNum(overdueDoses.length)} جرعة`} tone="danger" />
            )}
          </div>
        </>}
        <div className="ms-auto flex items-center gap-2">
          {ended && visit.outcome && <OutcomeBadge id={visit.outcome} />}
          {ended ? (
            <span className="inline-flex items-center gap-1.5 rounded bg-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"><Lock size={12} /> منتهية</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded bg-success-50 px-3 py-1.5 text-xs font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300"><span className="h-2 w-2 rounded-full bg-success-500" /> مفتوحة</span>
          )}
        </div>
      </div>

      {ended && visit.summary && (
        <div className="mt-3 flex items-start gap-2 rounded border border-success-200 bg-success-50 p-3 text-sm text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" /><div><b className="font-extrabold">تم إنهاء العلاج</b> — {visit.summary}</div>
        </div>
      )}

      {/* ── Paper-style patient & diagnosis summary (mirrors the clinic's form) ── */}
      <PaperSummary
        pet={pet} date={formatDate(visit.opened_at, lang)}
        speciesLabel={speciesSingular(pet.species)} sexLabel={t(`pet.sex.${pet.sex}`, pet.sex)}
        diagnosis={diagnosisText(primary)} record={primary}
        onPrint={printSheet} printable={hasFlowsheet || !!primary}
      />

      {/* ── Smart "today" command panel — what the doctor must do right now ── */}
      {hasFlowsheet && !ended && (
        <TodayPanel
          todayISO={todayISO} lang={lang}
          todayPending={todayPending} todayDoneCount={todayDoses.length - todayPending.length}
          overdueDoses={overdueDoses} nextDose={nextDose} remaining={remaining} totalDoses={totalDoses}
          onGiveAll={() => giveMany(todayPending)} onGiveOne={giveQuick} onGiveOverdue={() => giveMany(overdueDoses)}
        />
      )}

      {/* ── Treatment plan — switchable between the paper day-sheet and a per-drug course view ── */}
      {hasFlowsheet && (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><ClipboardList size={16} className="text-brand-600" /> خطة العلاج</h2>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
                <ViewToggleBtn active={planView === "day"} icon={<Rows3 size={14} />} label="باليوم" onClick={() => { playTap(); setPlanView("day"); }} />
                <ViewToggleBtn active={planView === "drug"} icon={<LayoutGrid size={14} />} label="بالدواء" onClick={() => { playTap(); setPlanView("drug"); }} />
              </div>
              {planView === "day" && (
                <div className="hidden flex-wrap gap-x-3 gap-y-1 sm:flex">
                  {(["done", "due", "overdue", "upcoming"] as DoseStatus[]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-ink-muted"><span className={cn("inline-block h-3 w-3 rounded-sm", STATUS_META[s].bar)} /> {STATUS_META[s].label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {planView === "day" ? (
            <TreatmentSheetTable
              dayGroups={dayGroups} todayISO={todayISO} ended={ended} lang={lang} dayNotes={dayNotes}
              todayRowRef={todayRowRef}
              onGive={(tx) => { playTap(); setGiveId(tx.id); }}
              onAddNote={(day) => { playTap(); setNoteText(""); setNoteDay(day); setNoteOpen(true); }}
              onAddDrug={openAddDrug}
            />
          ) : (
            <MedCourseView courses={medCourses} todayISO={todayISO} ended={ended} lang={lang} onGive={giveQuick} />
          )}
        </div>
      )}

      {/* Toolbar */}
      {!ended && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isIllness && (
            <button onClick={() => { playTap(); setPlanOpen(true); }} className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-700">
              <ClipboardList size={16} /> {clinicalNotes.length ? "تعديل التشخيص وخطة العلاج" : "التشخيص وخطة العلاج"}
            </button>
          )}
          <button onClick={() => openAddDrug()} className="inline-flex items-center gap-2 rounded border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm font-extrabold text-brand-700 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <Pill size={16} /> إضافة دواء
          </button>
          {hasFlowsheet && (
            <button onClick={() => { playTap(); setExtendOpen(true); }} className="inline-flex items-center gap-2 rounded border border-line-strong bg-surface-1 px-4 py-2.5 text-sm font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
              <CalendarPlus size={16} /> تمديد الخطة
            </button>
          )}
          <button onClick={() => { playTap(); setNoteText(""); setNoteDay(null); setNoteOpen(true); }} className="inline-flex items-center gap-2 rounded border border-line-strong bg-surface-1 px-4 py-2.5 text-sm font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
            <NotebookPen size={16} /> إضافة ملاحظة
          </button>
          <button onClick={() => { playTap(); setEndOpen(true); }} className="ms-auto inline-flex items-center gap-2 rounded bg-danger-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-danger-700">
            <Check size={16} /> إنهاء العلاج وإغلاق الزيارة
          </button>
        </div>
      )}

      {clinicalNotes.length > 0 && (
        <div className="mt-3 space-y-3">
          {clinicalNotes.map(({ n, record }) => <div key={n.id}><ClinicalRecordCard record={record!} compact /></div>)}
        </div>
      )}

      {generalNotes.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-ink"><NotebookPen size={16} className="text-brand-600" /> ملاحظات الزيارة</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {generalNotes.map((n) => (
              <div key={n.id} className="rounded border border-line bg-surface-1 p-3">
                <div className="mb-1 flex items-center gap-2 text-2xs text-ink-subtle">
                  <span className="font-semibold text-ink-muted">{n.author_name || "—"}</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(n.created_at, lang)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{n.note_text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal open={planOpen} onClose={() => setPlanOpen(false)} size="full" title={`التشخيص وخطة العلاج — ${pet.name}`}>
        <TreatmentPlan onSubmit={savePlan} busy={planBusy} species={pet.species} petId={pet.id} weightKg={pet.current_weight_kg} onMediaAdded={reload} />
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
      <AddDrugModal open={addDrugOpen} day={addDrugDay} lang={lang} defaultDoctor={user?.full_name ?? ""} onClose={() => setAddDrugOpen(false)} onAdd={addDrug} />
      <ExtendPlanModal open={extendOpen} lastDay={lastDay} lang={lang} medCount={lastDay ? treatments.filter((t) => t.day === lastDay).length : 0} onClose={() => setExtendOpen(false)} onExtend={extendCourse} />
      <EndVisitModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={endVisit} />
    </div>
  );
}

/* ------------------------------ Header stat ------------------------------- */
function HeaderStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "brand" | "success" | "warn" | "danger" }) {
  const toneCls = { brand: "text-brand-700 dark:text-brand-300", success: "text-success-700 dark:text-success-300", warn: "text-warn-700 dark:text-warn-300", danger: "text-danger-700 dark:text-danger-300" }[tone];
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("grid h-7 w-7 place-items-center rounded-lg bg-surface-2", toneCls)}>{icon}</span>
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">{label}</div>
        <div className={cn("text-sm font-black leading-tight", toneCls)}>{value}</div>
      </div>
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
            <button onClick={onGiveAll} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-black text-white shadow-sm transition hover:bg-brand-700">
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
        <p className="text-sm text-ink-muted">تُكرَّر أدوية آخر يوم{medCount ? ` (${formatNum(medCount)} دواء)` : ""} لعدد إضافي من الأيام{lastDay ? <> بعد <b className="text-ink">{formatDate(lastDay, lang)}</b></> : ""}.</p>
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

/* --------------------------- Paper-style summary -------------------------- */
/** A compact on-screen mirror of the clinic's paper form header — animal photo,
 *  brief animal info, and a brief diagnosis — with a one-tap print of the full sheet. */
function PaperSummary({ pet, date, speciesLabel, sexLabel, diagnosis, record, onPrint, printable }: {
  pet: Pet; date: string; speciesLabel: string; sexLabel: string;
  diagnosis: string; record: ClinicalRecord | null; onPrint: () => void; printable: boolean;
}) {
  const age = ageText(pet.dob);
  const weight = pet.current_weight_kg ?? record?.weightKg;
  const fields: { label: string; value: string }[] = [
    { label: "اسم الحيوان", value: pet.name },
    { label: "نوع الحيوان", value: speciesLabel },
    { label: "الجنس", value: sexLabel },
    { label: "العمر", value: age || "—" },
    { label: "التاريخ", value: date },
  ];
  const dxWarn = (record?.redFlags?.length ?? 0) > 0 || (record?.zoonotic?.length ?? 0) > 0 || (record?.reportable?.length ?? 0) > 0;

  return (
    <section className="mt-3 rounded border border-line-strong bg-surface-1 p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><ClipboardList size={16} className="text-brand-600" /> ورقة الحالة</h2>
        <button type="button" onClick={onPrint} disabled={!printable}
          className="ms-auto inline-flex items-center gap-2 rounded border border-brand-300 bg-brand-50 px-3.5 py-2 text-xs font-extrabold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
          <Printer size={15} /> طباعة خطة العلاج
        </button>
      </div>

      <div className="space-y-3">
        {/* Animal info + diagnosis */}
        <div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            {fields.map((f) => (
              <div key={f.label} className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">{f.label}</div>
                <div className="truncate text-sm font-bold text-ink">{f.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {diagnosis ? (
              <span className={cn("inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-extrabold",
                dxWarn ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" : "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300")}>
                <Stethoscope size={13} /> {diagnosis}{dxWarn && <AlertTriangle size={12} />}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink-subtle"><Stethoscope size={13} /> لا يوجد تشخيص بعد</span>
            )}
            {weight != null && (
              <span className="inline-flex items-center gap-1.5 rounded border border-line bg-surface-1 px-2.5 py-1 text-xs font-bold text-ink-muted"><ShieldCheck size={13} /> {formatNum(weight)} كغم</span>
            )}
            {(record?.treatment?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded border border-line bg-surface-1 px-2.5 py-1 text-xs font-bold text-ink-muted"><Syringe size={13} /> {formatNum(record!.treatment!.length)} دواء</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Paper-style daily treatment table ------------------- */
/**
 * The daily plan laid out EXACTLY like the clinic's paper sheet — the same four
 * columns in the same order (اليوم والساعة | العلاج | الطبيب المعالج | الملاحظات),
 * one row per dose. Doctors used to the paper read it the same way; giving a dose
 * fills in the treating doctor + time just as they would write it by hand.
 */
function TreatmentSheetTable({ dayGroups, todayISO, ended, lang, dayNotes, onGive, onAddNote, onAddDrug, todayRowRef }: {
  dayGroups: [string, TreatmentEntry[]][]; todayISO: string; ended: boolean; lang: string;
  dayNotes: Map<string, PetNote[]>;
  onGive: (t: TreatmentEntry) => void; onAddNote: (day: string) => void; onAddDrug: (day: string) => void;
  todayRowRef?: React.Ref<HTMLTableRowElement>;
}) {
  const th = "border-b-2 border-line-strong bg-surface-2 px-3 py-2.5 text-start text-xs font-extrabold text-ink";
  return (
    <div className="overflow-x-auto rounded border border-line-strong shadow-card">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr>
            <th className={cn(th, "w-[26%] border-e border-line")}>اليوم والساعة</th>
            <th className={cn(th, "w-[36%] border-e border-line")}>العلاج</th>
            <th className={cn(th, "w-[20%] border-e border-line")}>الطبيب المعالج</th>
            <th className={cn(th, "w-[18%]")}>الملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {dayGroups.map(([day, rows]) => {
            const isToday = day === todayISO;
            const notes = dayNotes.get(day) ?? [];
            return rows.map((t, idx) => {
              const st = doseStatus(t, todayISO);
              const m = STATUS_META[st];
              const first = idx === 0;
              return (
                <tr key={t.id} ref={isToday && first ? todayRowRef : undefined}
                  className={cn(m.row, first ? "border-t-2 border-line-strong" : "border-t border-line")}>
                  {/* اليوم والساعة — the date shows once per day; each dose row differs only by its time */}
                  <td className="border-e border-line px-3 py-2.5 align-top">
                    {first && (
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="text-sm font-black text-ink">{formatDate(day, lang)}</span>
                        {isToday && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[9px] font-black text-white">اليوم</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-sm", m.bar)} />
                      <span className="text-xs font-bold tabular-nums text-ink-subtle" dir="ltr">
                        {t.administered_at ? clockOf(t.administered_at, lang) : (t.time || "—")}
                      </span>
                    </div>
                    {first && !ended && (
                      <button type="button" onClick={() => onAddDrug(day)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300">
                        <Plus size={11} /> دواء
                      </button>
                    )}
                  </td>
                  {/* العلاج */}
                  <td className="border-e border-line px-3 py-2.5 align-top">
                    <div className="text-sm font-extrabold text-ink">{t.medication}</div>
                    {[t.amount, t.observations].filter(Boolean).length > 0 && (
                      <div className="mt-0.5 text-xs font-semibold text-ink-subtle">{[t.amount, t.observations].filter(Boolean).join(" · ")}</div>
                    )}
                  </td>
                  {/* الطبيب المعالج */}
                  <td className="border-e border-line px-3 py-2.5 align-top">
                    {t.administered_at ? (
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-ink"><UserRound size={13} className="shrink-0 text-ink-subtle" /> {t.administered_by || "—"}</span>
                    ) : ended ? (
                      <span className="text-sm text-ink-subtle">—</span>
                    ) : (
                      <button type="button" onClick={() => onGive(t)}
                        className="inline-flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-brand-700">
                        <Check size={13} /> تم العلاج
                      </button>
                    )}
                  </td>
                  {/* الملاحظات */}
                  <td className="px-3 py-2.5 align-top">
                    {t.administered_at && (
                      <div className="mb-1 flex items-center gap-1 text-xs font-bold text-success-700 dark:text-success-300"><Check size={12} className="shrink-0" /> أُعطيت</div>
                    )}
                    {first && notes.map((n) => (
                      <div key={n.id} className="flex items-start gap-1 text-xs leading-snug text-ink-muted"><NotebookPen size={11} className="mt-0.5 shrink-0 text-ink-subtle" /> {parseDayNote(n.note_text).body}</div>
                    ))}
                    {first && !ended && (
                      <button type="button" onClick={() => onAddNote(day)}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300">
                        <Plus size={11} /> ملاحظة
                      </button>
                    )}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
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

/* ------------------------------ Add-drug modal ---------------------------- */
/** Add a SINGLE ad-hoc medication for one day — for when the doctor decides to give
 *  an extra drug on the spot, without reopening the full diagnosis & plan. */
function AddDrugModal({ open, day, defaultDoctor, onClose, onAdd }: {
  open: boolean; day: string; lang: string; defaultDoctor: string;
  onClose: () => void;
  onAdd: (d: { day: string; medication: string; amount: string; freq: string; doctor: string; givenNow: boolean }) => void | Promise<void>;
}) {
  const [med, setMed] = useState("");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState("");
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [d, setD] = useState(day);
  const [givenNow, setGivenNow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset the form each time the modal opens (for a fresh day/doctor).
  useEffect(() => {
    if (open) { setMed(""); setAmount(""); setFreq(""); setDoctor(defaultDoctor); setD(day); setGivenNow(false); setBusy(false); }
  }, [open, day, defaultDoctor]);

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
    try { await onAdd({ day: d, medication: med, amount, freq, doctor, givenNow }); }
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
