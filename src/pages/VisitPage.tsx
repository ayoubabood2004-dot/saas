import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Clock, Check, Plus, NotebookPen, ClipboardList,
  Loader2, Lock, CheckCircle2, Stethoscope, UserRound, RotateCcw, AlertTriangle,
} from "lucide-react";
import type { Pet, ClinicVisit, PetNote, TreatmentEntry } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { TreatmentPlan } from "@/components/TreatmentPlan";
import { DoctorSelect } from "@/components/MedicalEntry";
import { ClinicalRecordCard } from "@/components/ClinicalRecordCard";
import { parseClinical } from "@/lib/clinicalRecord";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { visitKindMeta } from "@/lib/visits";
import { localISO, formatDate, formatNum, cn } from "@/lib/utils";
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
const dayShort = (iso: string, lang: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return { wd: d.toLocaleDateString(lang, { weekday: "short" }), dn: formatNum(d.getDate()) };
};

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
  const { i18n } = useTranslation();
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
  const todayColRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    todayColRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
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

      {/* ── Agenda timeline — day columns, today expanded ── */}
      {hasFlowsheet && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink">جدول العلاج اليومي</h2>
            <div className="ms-auto flex flex-wrap gap-x-3 gap-y-1">
              {(["done", "due", "overdue", "upcoming"] as DoseStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-ink-muted"><span className={cn("inline-block h-3 w-3 rounded-sm", STATUS_META[s].bar)} /> {STATUS_META[s].label}</span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-2.5">
              {dayGroups.map(([day, rows]) => (
                <DayColumn
                  key={day} innerRef={day === todayISO ? todayColRef : undefined}
                  day={day} rows={rows} isToday={day === todayISO} todayISO={todayISO}
                  ended={ended} lang={lang} notes={dayNotes.get(day) ?? []}
                  onGive={(t) => { playTap(); setGiveId(t.id); }} onNote={(text) => addNote(text, day)}
                />
              ))}
            </div>
          </div>
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
          <button onClick={() => { playTap(); setNoteText(""); setNoteOpen(true); }} className="inline-flex items-center gap-2 rounded border border-line-strong bg-surface-1 px-4 py-2.5 text-sm font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
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

      <Modal open={noteOpen} onClose={() => { setNoteOpen(false); setNoteText(""); }} title="إضافة ملاحظة">
        <div className="space-y-3">
          <textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus placeholder="اكتب ملاحظة…" className="input min-h-[110px] resize-y leading-relaxed" />
          <div className="flex justify-end">
            <Button leftIcon={<Plus size={16} />} disabled={!noteText.trim()} onClick={async () => { await addNote(noteText); setNoteOpen(false); setNoteText(""); }}>إضافة</Button>
          </div>
        </div>
      </Modal>

      {giveTarget && <GiveModal t={giveTarget} lang={lang} defaultDoctor={user?.full_name ?? ""} ended={ended} onClose={() => setGiveId(null)} onGive={giveDose} onUndo={undoDose} />}
      <EndVisitModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={endVisit} />
    </div>
  );
}

/* ------------------------------- Day column ------------------------------- */
function DayColumn({ day, rows, isToday, todayISO, ended, lang, notes, onGive, onNote, innerRef }: {
  day: string; rows: TreatmentEntry[]; isToday: boolean; todayISO: string; ended: boolean; lang: string;
  notes: PetNote[]; onGive: (t: TreatmentEntry) => void; onNote: (text: string) => void;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const { wd, dn } = dayShort(day, lang);
  const doneN = rows.filter((r) => r.administered_at).length;
  const overdue = rows.filter((r) => doseStatus(r, todayISO) === "overdue").length;
  const dueN = rows.filter((r) => doseStatus(r, todayISO) === "due").length;
  const allDone = doneN === rows.length;
  const barStatus: DoseStatus = allDone ? "done" : overdue ? "overdue" : dueN ? "due" : "upcoming";
  const summary = allDone ? "اكتمل" : [overdue && `${formatNum(overdue)} متأخّرة`, dueN && `${formatNum(dueN)} مستحقّة`].filter(Boolean).join(" · ") || `${formatNum(doneN)}/${formatNum(rows.length)}`;

  return (
    <div ref={innerRef} className={cn("flex shrink-0 flex-col overflow-hidden rounded border bg-surface-1", isToday ? "w-72 border-brand-500 shadow-card" : "w-40 border-line")}>
      <div className={cn("px-2.5 py-2 text-center", isToday ? "bg-brand-50 dark:bg-brand-500/10" : "bg-surface-2")}>
        <div className="text-[9px] font-extrabold text-ink-subtle">{wd}{isToday && " · اليوم"}</div>
        <div className={cn("text-lg font-black leading-none", isToday ? "text-brand-700 dark:text-brand-300" : "text-ink")}>{dn}</div>
        <div className={cn("mt-0.5 text-[9px] font-bold", overdue ? "text-danger-600" : dueN ? "text-warn-600" : allDone ? "text-success-600" : "text-ink-subtle")}>{summary}</div>
      </div>
      <div className={cn("h-1", STATUS_META[barStatus].bar)} />
      <div className="flex flex-col gap-1.5 p-2">
        {rows.map((t) => {
          const st = doseStatus(t, todayISO);
          const m = STATUS_META[st];
          return (
            <button key={t.id} type="button" disabled={ended} onClick={() => onGive(t)}
              className={cn("flex items-center gap-2 rounded border border-transparent text-start transition enabled:hover:border-brand-300 disabled:cursor-default", m.row, isToday ? "p-2" : "px-2 py-1.5")}>
              <span className={cn("grid shrink-0 place-items-center rounded font-black", m.mark, isToday ? "h-6 w-6 text-xs" : "h-4 w-4 text-[9px]")}>
                {st === "done" ? <Check size={isToday ? 14 : 10} /> : st === "overdue" ? "!" : st === "due" ? "●" : "○"}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate font-black text-ink", isToday ? "text-xs" : "text-[10px]")}>{t.medication}</span>
                {isToday && <span className="block truncate text-[9px] font-bold text-ink-subtle">{[t.amount, t.observations].filter(Boolean).join(" · ")}</span>}
                {st === "done" && t.administered_at && <span className={cn("block text-[9px] font-bold", isToday ? "text-success-700 dark:text-success-300" : "text-ink-subtle")}>{clockOf(t.administered_at, lang)}{isToday && t.administered_by ? ` · ${t.administered_by}` : ""}</span>}
              </span>
              {isToday && !ended && st !== "done" && <span className="shrink-0 rounded bg-brand-600 px-2 py-1 text-[10px] font-black text-white">تم العلاج</span>}
            </button>
          );
        })}
        {notes.length > 0 && (
          <div className="mt-0.5 space-y-1">
            {notes.map((n) => <div key={n.id} className="flex items-start gap-1 rounded bg-surface-2 px-1.5 py-1 text-[9px] leading-snug text-ink-muted"><NotebookPen size={9} className="mt-0.5 shrink-0 text-ink-subtle" /> {parseDayNote(n.note_text).body}</div>)}
          </div>
        )}
        {isToday && !ended && <DayNoteInput onNote={onNote} />}
      </div>
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

/* ------------------------------ Day note input ---------------------------- */
function DayNoteInput({ onNote }: { onNote: (text: string) => void }) {
  const [note, setNote] = useState("");
  const submit = () => { if (note.trim()) { onNote(note); setNote(""); } };
  return (
    <div className="mt-1 flex gap-1.5">
      <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="ملاحظة على اليوم…" className="input h-8 flex-1 py-0 text-[11px]" />
      <button type="button" disabled={!note.trim()} onClick={submit} className="rounded bg-brand-50 px-2.5 text-[11px] font-bold text-brand-700 disabled:opacity-40 dark:bg-brand-500/10 dark:text-brand-300">حفظ</button>
    </div>
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
