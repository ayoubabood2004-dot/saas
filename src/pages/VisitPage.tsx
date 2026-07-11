import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Clock, CalendarDays, Check, Plus, NotebookPen, ClipboardList,
  Loader2, Lock, CheckCircle2, Pencil, Stethoscope,
} from "lucide-react";
import type { Pet, ClinicVisit, PetNote, TreatmentEntry } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { TreatmentPlan } from "@/components/TreatmentPlan";
import { ClinicalRecordCard } from "@/components/ClinicalRecordCard";
import { parseClinical } from "@/lib/clinicalRecord";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { visitKindMeta } from "@/lib/visits";
import { localISO, formatDate, cn } from "@/lib/utils";
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
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-extrabold", OUTCOME_BADGE[o.tone])}>
      <GlyphMark name={o.id} size={14} className={glyphToneText(glyphTone(o.id) ?? "blue")} /> {o.label}
    </span>
  );
}

/**
 * A standalone VISIT page (زيارة) — its own route. Opened per encounter: an
 * illness visit carries the clinical console, which lays out a day-by-day
 * treatment plan the vet just checks off ("تم العلاج") with a note per day.
 * "تم إنهاء العلاج" locks the visit; it stays reviewable forever.
 */
export default function VisitPage() {
  const { petId, visitId } = useParams<{ petId: string; visitId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
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

  const ended = visit?.status === "ended";
  const kind = visit ? visitKindMeta(visit.kind) : null;
  const KindIcon = kind?.icon ?? Stethoscope;

  // Clinical-record notes (the saved diagnosis & treatment plans) vs day notes vs plain.
  const clinicalNotes = useMemo(() => notes.map((n) => ({ n, ...parseClinical(n.note_text) })).filter((x) => x.record), [notes]);
  const generalNotes = useMemo(
    () => notes.filter((n) => !parseClinical(n.note_text).record && !n.note_text.startsWith(DAY_MARK)),
    [notes],
  );

  // Group the generated flowsheet by day.
  const days = useMemo(() => {
    const map = new Map<string, TreatmentEntry[]>();
    for (const t of treatments) (map.get(t.day) ?? map.set(t.day, []).get(t.day)!).push(t);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [treatments]);
  const dayNotes = useMemo(() => {
    const map = new Map<string, PetNote[]>();
    for (const n of notes) {
      const { day } = parseDayNote(n.note_text);
      if (day) (map.get(day) ?? map.set(day, []).get(day)!).push(n);
    }
    return map;
  }, [notes]);

  const hasFlowsheet = treatments.length > 0;
  const totalDoses = treatments.length;
  const doneDoses = treatments.filter((t) => t.administered_at).length;

  /* ---- Save the clinical console: store the record note + generate the daily flowsheet ---- */
  const savePlan = async (body: string) => {
    if (!visit || planBusy) return;
    setPlanBusy(true);
    try {
      await repo.addPetNote({ pet_id: visit.pet_id, note_text: body, author_id: user?.id ?? null, author_name: user?.full_name ?? null, visit_id: visit.id });
      const { record } = parseClinical(body);
      // Generate the day-by-day sheet the first time a plan is saved for this visit.
      if (record?.treatment?.length && !hasFlowsheet) {
        const start = visit.opened_at;
        for (const m of record.treatment) {
          const nDays = Math.max(1, Math.min(60, m.days || 1));
          for (let i = 0; i < nDays; i++) {
            await repo.addTreatment({
              pet_id: visit.pet_id, visit_id: visit.id, day: addDaysISO(start, i),
              medication: m.name, amount: m.dose || "", time: "", observations: m.freq,
              doctor: user?.full_name,
            });
          }
        }
      } else if (record?.treatment?.length && hasFlowsheet) {
        // Plan re-saved after a sheet already exists → flag the existing rows as edited.
        for (const t of treatments) await repo.setTreatmentGiven(t.id, !!t.administered_at, t.administered_by).catch(() => {});
      }
      setPlanOpen(false); playSuccess(); await reload();
    } catch (e) {
      playWarning();
      toast.error("تعذّر الحفظ", e instanceof Error ? e.message : undefined);
    } finally { setPlanBusy(false); }
  };

  const markGiven = async (t: TreatmentEntry) => {
    playTap();
    await repo.setTreatmentGiven(t.id, !t.administered_at, user?.full_name);
    await reload();
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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Back */}
      <button onClick={() => navigate(`/pet/${petId}`)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted transition hover:text-ink">
        <ArrowRight size={16} /> رجوع إلى ملف {pet.name}
      </button>

      {/* Header */}
      <div className={cn("overflow-hidden rounded-3xl border shadow-card", ended ? "border-line" : "border-brand-200 dark:border-brand-500/30")}>
        <div className={cn("flex items-center gap-3 p-4", ended ? "bg-surface-2" : "bg-gradient-to-l from-brand-50/70 to-transparent dark:from-brand-500/10")}>
          <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-soft", kind!.solid)}>
            <KindIcon size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-extrabold text-ink">{kind!.label} — {pet.name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-subtle">
              <span className="flex items-center gap-1"><CalendarDays size={12} /> فُتحت {formatDate(visit.opened_at, i18n.language)}</span>
              {visit.opened_by && <span className="flex items-center gap-1"><Stethoscope size={12} /> {visit.opened_by}</span>}
              {ended && visit.ended_at && <span className="flex items-center gap-1"><Lock size={12} /> انتهت {formatDate(visit.ended_at, i18n.language)}</span>}
            </div>
          </div>
          {ended ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"><Lock size={13} /> منتهية</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-xs font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300">
              <span className="h-2 w-2 rounded-full bg-success-500 shadow-[0_0_0_4px_rgba(34,197,94,.25)]" /> مفتوحة
            </span>
          )}
        </div>
        {/* condition / outcome strip */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-2xs">
          {visit.condition && <><span className="font-bold text-ink-subtle">الحالة عند الدخول:</span> <OutcomeBadge id={visit.condition} /></>}
          {ended && visit.outcome && <><span className="ms-2 font-bold text-ink-subtle">النتيجة النهائية:</span> <OutcomeBadge id={visit.outcome} /></>}
          {hasFlowsheet && <span className="ms-auto font-bold text-ink-muted">العلاج: {doneDoses}/{totalDoses} تم</span>}
        </div>
      </div>

      {/* Ended summary banner */}
      {ended && visit.summary && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-success-200 bg-success-50 p-3.5 text-sm text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <div><b className="font-extrabold">تم إنهاء العلاج</b> — {visit.summary}</div>
        </div>
      )}

      {/* Illness workspace: add the clinical console */}
      {visit.kind === "illness" && !ended && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary py-2 px-4 text-sm" onClick={() => { playTap(); setPlanOpen(true); }}>
            <ClipboardList size={16} /> {clinicalNotes.length ? "تعديل التشخيص وخطة العلاج" : "التشخيص وخطة العلاج"}
          </button>
          <button className="btn-secondary py-2 px-4 text-sm" onClick={() => { playTap(); setNoteText(""); setNoteOpen(true); }}>
            <NotebookPen size={16} /> إضافة ملاحظة
          </button>
        </div>
      )}

      {/* Clinical record cards (diagnosis + plan) */}
      {clinicalNotes.length > 0 && (
        <div className="mt-4 space-y-3">
          {clinicalNotes.map(({ n, record }) => (
            <div key={n.id}>
              <ClinicalRecordCard record={record!} />
            </div>
          ))}
        </div>
      )}

      {/* Daily treatment flowsheet — the days laid out; just check off "تم العلاج" */}
      {hasFlowsheet && (
        <section className="mt-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-ink"><CalendarDays size={16} className="text-brand-600" /> جدول العلاج اليومي</h2>
          <div className="space-y-3">
            {days.map(([day, rows], di) => (
              <DaySection
                key={day} day={day} index={di} rows={rows} lang={i18n.language} ended={ended}
                notes={dayNotes.get(day) ?? []} onGiven={markGiven}
                onNote={(text) => addNote(text, day)}
              />
            ))}
          </div>
        </section>
      )}

      {/* General visit notes */}
      {generalNotes.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-ink"><NotebookPen size={16} className="text-brand-600" /> ملاحظات الزيارة</h2>
          <div className="space-y-2">
            {generalNotes.map((n) => (
              <div key={n.id} className="rounded-2xl border border-line bg-surface-1 p-3">
                <div className="mb-1 flex items-center gap-2 text-2xs text-ink-subtle">
                  <span className="font-semibold text-ink-muted">{n.author_name || "—"}</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(n.created_at, i18n.language)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{n.note_text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Routine visit: quick note area */}
      {visit.kind !== "illness" && !ended && clinicalNotes.length === 0 && generalNotes.length === 0 && (
        <div className="mt-4">
          <button className="btn-secondary py-2 px-4 text-sm" onClick={() => { playTap(); setNoteText(""); setNoteOpen(true); }}>
            <NotebookPen size={16} /> إضافة ملاحظة
          </button>
        </div>
      )}

      {/* End visit */}
      {!ended && (
        <div className="sticky bottom-3 z-10 mt-6">
          <button
            onClick={() => { playTap(); setEndOpen(true); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-danger-600 py-3.5 text-base font-extrabold text-white shadow-raised transition hover:bg-danger-700"
          >
            <Check size={20} /> تم إنهاء العلاج — إغلاق الزيارة
          </button>
        </div>
      )}

      {/* Clinical console modal */}
      <Modal open={planOpen} onClose={() => setPlanOpen(false)} size="full" title={`التشخيص وخطة العلاج — ${pet.name}`}>
        <TreatmentPlan onSubmit={savePlan} busy={planBusy} species={pet.species} petId={pet.id} weightKg={pet.current_weight_kg} onMediaAdded={reload} />
      </Modal>

      {/* Add-note modal */}
      <Modal open={noteOpen} onClose={() => { setNoteOpen(false); setNoteText(""); }} title="إضافة ملاحظة">
        <div className="space-y-3">
          <textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus placeholder="اكتب ملاحظة…" className="input min-h-[110px] resize-y leading-relaxed" />
          <div className="flex justify-end">
            <Button leftIcon={<Plus size={16} />} disabled={!noteText.trim()} onClick={async () => { await addNote(noteText); setNoteOpen(false); setNoteText(""); }}>إضافة</Button>
          </div>
        </div>
      </Modal>

      {/* End-visit modal */}
      <EndVisitModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={endVisit} />
    </div>
  );
}

/* ------------------------- Day section (flowsheet) ------------------------ */
function DaySection({ day, index, rows, lang, ended, notes, onGiven, onNote }: {
  day: string; index: number; rows: TreatmentEntry[]; lang: string; ended: boolean;
  notes: PetNote[]; onGiven: (t: TreatmentEntry) => void; onNote: (text: string) => void;
}) {
  const [note, setNote] = useState("");
  const done = rows.filter((r) => r.administered_at).length;
  const allDone = done === rows.length;
  return (
    <div className={cn("rounded-2xl border p-3", allDone ? "border-success-200 bg-success-50/40 dark:border-success-500/25 dark:bg-success-500/5" : "border-line bg-surface-1")}>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg text-2xs font-extrabold", allDone ? "bg-success-500 text-white" : "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300")}>{allDone ? "✓" : index + 1}</span>
        <span className="text-sm font-bold text-ink">اليوم {index + 1} · {formatDate(day, lang)}</span>
        <span className="ms-auto text-2xs font-bold text-ink-subtle">{done}/{rows.length}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((t) => {
          const given = !!t.administered_at;
          return (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 p-2">
              <button
                type="button" disabled={ended} onClick={() => onGiven(t)}
                className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 transition disabled:opacity-60", given ? "border-success-500 bg-success-500 text-white" : "border-ink-subtle/40 text-transparent hover:border-success-400")}
                aria-label="تم العلاج"
              >
                <Check size={16} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{t.medication} {t.edited && <span className="ms-1 inline-flex items-center gap-0.5 rounded-full bg-warn-50 px-1.5 py-0.5 text-[10px] font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"><Pencil size={9} /> عُدّل</span>}</div>
                <div className="text-2xs text-ink-subtle">{[t.amount, t.observations].filter(Boolean).join(" · ")}</div>
              </div>
              {given ? <span className="shrink-0 text-2xs font-extrabold text-success-600 dark:text-success-400">تم العلاج</span> : <span className="shrink-0 text-2xs font-semibold text-ink-subtle">بانتظار</span>}
            </div>
          );
        })}
      </div>
      {/* Per-day notes */}
      {notes.length > 0 && (
        <div className="mt-2 space-y-1">
          {notes.map((n) => <div key={n.id} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-muted">📝 {parseDayNote(n.note_text).body}</div>)}
        </div>
      )}
      {!ended && (
        <div className="mt-2 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { onNote(note); setNote(""); } }} placeholder="ملاحظة على هذا اليوم…" className="input h-9 flex-1 py-0 text-xs" />
          <button type="button" disabled={!note.trim()} onClick={() => { onNote(note); setNote(""); }} className="rounded-xl bg-brand-50 px-3 text-xs font-bold text-brand-700 disabled:opacity-40 dark:bg-brand-500/10 dark:text-brand-300">حفظ</button>
        </div>
      )}
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
                  className={cn("flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-center transition", on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
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
