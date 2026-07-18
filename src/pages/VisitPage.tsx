import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Clock, Check, Plus, NotebookPen, ClipboardList,
  Loader2, Lock, CheckCircle2, Stethoscope, UserRound, RotateCcw, AlertTriangle,
  Printer, Syringe, ShieldCheck,
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
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const toast = useToast();

  const [pet, setPet] = useState<Pet | null>(null);
  const [visit, setVisit] = useState<ClinicVisit | null>(null);
  const [notes, setNotes] = useState<PetNote[]>([]);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [planOpen, setPlanOpen] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteDay, setNoteDay] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [giveId, setGiveId] = useState<string | null>(null);

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

  /* ---- Print the paper treatment sheet (ورقة خطة العلاج) — one row per dose ---- */
  const printSheet = () => {
    if (!pet || !visit) return;
    playTap();
    const rows: SheetTreatmentRow[] = treatments.map((tx) => ({
      dayTime: [formatDate(tx.day, lang), tx.administered_at ? clockOf(tx.administered_at, lang) : tx.time]
        .filter(Boolean).join(" · "),
      treatment: [tx.medication, tx.amount, tx.observations].filter(Boolean).join(" · "),
      doctor: tx.administered_by || tx.doctor || "",
      notes: tx.administered_at ? "✓ أُعطيت" : "",
    }));
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
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">{remaining > 0 ? "متبقٍّ" : "اكتمل"}</div>
            <div className="text-sm font-black text-ink">{remaining > 0 ? <>{formatNum(remaining)} جرعة</> : "كل الجرعات ✓"}</div>
            <div className="text-2xs text-ink-subtle">على {formatNum(dayGroups.length)} أيام</div>
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

      {/* ── Daily treatment plan — laid out exactly like the clinic's paper sheet ── */}
      {hasFlowsheet && (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><ClipboardList size={16} className="text-brand-600" /> خطة العلاج</h2>
            <div className="ms-auto flex flex-wrap gap-x-3 gap-y-1">
              {(["done", "due", "overdue", "upcoming"] as DoseStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-ink-muted"><span className={cn("inline-block h-3 w-3 rounded-sm", STATUS_META[s].bar)} /> {STATUS_META[s].label}</span>
              ))}
            </div>
          </div>
          <TreatmentSheetTable
            dayGroups={dayGroups} todayISO={todayISO} ended={ended} lang={lang} dayNotes={dayNotes}
            todayRowRef={todayRowRef}
            onGive={(tx) => { playTap(); setGiveId(tx.id); }}
            onAddNote={(day) => { playTap(); setNoteText(""); setNoteDay(day); setNoteOpen(true); }}
          />
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
      <EndVisitModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={endVisit} />
    </div>
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
function TreatmentSheetTable({ dayGroups, todayISO, ended, lang, dayNotes, onGive, onAddNote, todayRowRef }: {
  dayGroups: [string, TreatmentEntry[]][]; todayISO: string; ended: boolean; lang: string;
  dayNotes: Map<string, PetNote[]>;
  onGive: (t: TreatmentEntry) => void; onAddNote: (day: string) => void;
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
                  {/* اليوم والساعة */}
                  <td className="border-e border-line px-3 py-2.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-sm", m.bar)} />
                      <span className="text-sm font-black text-ink">{formatDate(day, lang)}</span>
                      {isToday && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[9px] font-black text-white">اليوم</span>}
                    </div>
                    <div className="mt-1 ps-4 text-xs font-bold tabular-nums text-ink-subtle" dir="ltr">
                      {t.administered_at ? clockOf(t.administered_at, lang) : (t.time || "—")}
                    </div>
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
