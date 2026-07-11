import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Clock, Check, Plus, NotebookPen, ClipboardList,
  Loader2, Lock, CheckCircle2, Stethoscope, UserRound, Syringe, RotateCcw,
  AlertTriangle, LayoutGrid,
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

/** Four-state dose status — the semantic system used by leading vet treatment sheets. */
type DoseStatus = "done" | "overdue" | "due" | "upcoming";
const doseStatus = (t: TreatmentEntry, todayISO: string): DoseStatus =>
  t.administered_at ? "done" : t.day < todayISO ? "overdue" : t.day === todayISO ? "due" : "upcoming";

const STATUS_META: Record<DoseStatus, { label: string; cell: string; mark: string; text: string; legend: string }> = {
  done: { label: "تمّ", cell: "bg-success-50 dark:bg-success-500/5", mark: "bg-success-600 text-white", text: "text-success-700 dark:text-success-300", legend: "bg-success-600" },
  due: { label: "مستحقّة", cell: "bg-warn-50 dark:bg-warn-500/10", mark: "bg-warn-500 text-white", text: "text-warn-700 dark:text-warn-200", legend: "bg-warn-500" },
  overdue: { label: "متأخّرة", cell: "bg-danger-50 dark:bg-danger-500/10", mark: "bg-danger-600 text-white", text: "text-danger-700 dark:text-danger-300", legend: "bg-danger-600" },
  upcoming: { label: "قادمة", cell: "bg-surface-1", mark: "bg-surface-2 text-ink-subtle border border-line", text: "text-ink-subtle", legend: "bg-surface-2 border border-line" },
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
 * Standalone VISIT page (زيارة). The treatment plan is laid out as a research-backed
 * TREATMENT SHEET: a medication × day grid where each dose carries a four-state
 * status colour (done / due-now / overdue / upcoming), a "due now" action strip for
 * fast administration, and a give-flow that records who administered each dose + when.
 * "تم إنهاء العلاج" locks the visit and syncs into the record.
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
  const [noteDay, setNoteDay] = useState<string | null>(null);

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
  const todayISO = localISO(new Date());

  const clinicalNotes = useMemo(() => notes.map((n) => ({ n, ...parseClinical(n.note_text) })).filter((x) => x.record), [notes]);
  const generalNotes = useMemo(
    () => notes.filter((n) => !parseClinical(n.note_text).record && !n.note_text.startsWith(DAY_MARK)),
    [notes],
  );

  // Days (columns) + medications (rows) of the treatment-sheet matrix.
  const days = useMemo(() => [...new Set(treatments.map((t) => t.day))].sort((a, b) => a.localeCompare(b)), [treatments]);
  const meds = useMemo(() => {
    const seen = new Set<string>(); const out: TreatmentEntry[] = [];
    for (const t of treatments) if (!seen.has(t.medication)) { seen.add(t.medication); out.push(t); }
    return out;
  }, [treatments]);
  const cellFor = (med: string, day: string) => treatments.find((t) => t.medication === med && t.day === day);
  const dayNotes = useMemo(() => {
    const map = new Map<string, PetNote[]>();
    for (const n of notes) { const { day } = parseDayNote(n.note_text); if (day) (map.get(day) ?? map.set(day, []).get(day)!).push(n); }
    return map;
  }, [notes]);

  const hasFlowsheet = treatments.length > 0;
  const totalDoses = treatments.length;
  const doneDoses = treatments.filter((t) => t.administered_at).length;
  const pct = totalDoses ? Math.round((doneDoses / totalDoses) * 100) : 0;

  // "Due now" = every not-yet-given dose scheduled for today or earlier (overdue first).
  const dueNow = useMemo(
    () => treatments.filter((t) => !t.administered_at && t.day <= todayISO).sort((a, b) => a.day.localeCompare(b.day)),
    [treatments, todayISO],
  );
  const giveTarget = treatments.find((t) => t.id === giveId) ?? null;

  const isIllness = visit?.kind === "illness";
  const primary = clinicalNotes.length ? clinicalNotes[clinicalNotes.length - 1].record : null;
  const dxName = primary?.diagnoses?.[0]?.disease;
  const dxWarn = (primary?.redFlags?.length ?? 0) > 0 || (primary?.zoonotic?.length ?? 0) > 0 || (primary?.reportable?.length ?? 0) > 0;

  const effNoteDay = noteDay && days.includes(noteDay) ? noteDay : (days.includes(todayISO) ? todayISO : days[days.length - 1] ?? null);

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

      {/* ── Header strip: patient · diagnosis · progress · doctor · status ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded border border-line-strong bg-surface-1 p-3.5 shadow-card">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded text-white", kind!.solid)}><KindIcon size={22} /></span>
        <div className="min-w-0">
          <div className="text-base font-black text-ink">{pet.name}</div>
          <div className="text-2xs font-bold text-ink-subtle">{[kind!.label, pet.breed].filter(Boolean).join(" · ")}</div>
        </div>
        {dxName && <><Divider /><KpiBlock k="التشخيص"><span className="flex items-center gap-1.5">{dxName}{dxWarn && <AlertTriangle size={13} className="text-danger-500" />}</span></KpiBlock></>}
        {hasFlowsheet && <><Divider /><div>
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">تقدّم العلاج</div>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} /></div>
            <span className="text-xs font-black text-ink">{formatNum(doneDoses)}<span className="text-ink-subtle">/{formatNum(totalDoses)}</span></span>
          </div>
        </div></>}
        {visit.opened_by && <><Divider /><KpiBlock k="الطبيب"><span className="inline-flex items-center gap-1"><UserRound size={12} /> {visit.opened_by}</span></KpiBlock></>}
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

      {/* ── "Due now" action strip — administer with one tap ── */}
      {!ended && dueNow.length > 0 && (
        <div className="mt-3 rounded border border-warn-200 bg-surface-1 p-3.5 dark:border-warn-500/30">
          <div className="mb-2.5 flex items-center gap-2 text-sm font-black text-warn-700 dark:text-warn-200">
            <Clock size={16} /> مستحقّة الآن — أعطِها بضغطة
            <span className="rounded bg-warn-500 px-2 py-0.5 text-2xs font-bold text-white">{formatNum(dueNow.length)}</span>
            <span className="ms-auto text-2xs font-bold text-ink-subtle">{formatDate(todayISO, lang)}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dueNow.map((t) => {
              const st = doseStatus(t, todayISO);
              const m = STATUS_META[st];
              return (
                <div key={t.id} className={cn("flex items-center gap-2.5 rounded border p-2.5", st === "overdue" ? "border-danger-200 bg-danger-50 dark:border-danger-500/30 dark:bg-danger-500/10" : "border-warn-200 bg-warn-50 dark:border-warn-500/30 dark:bg-warn-500/10")}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-ink">{t.medication}</div>
                    <div className="text-2xs font-bold text-ink-muted">{[t.amount, t.observations].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold", m.mark)}>{m.label}</span>
                  <button type="button" onClick={() => { playTap(); setGiveId(t.id); }} className="inline-flex shrink-0 items-center gap-1.5 rounded bg-brand-600 px-3 py-2 text-2xs font-black text-white transition hover:bg-brand-700">
                    <Syringe size={13} /> تم العلاج
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Treatment sheet — medication × day matrix, four-state status ── */}
      {hasFlowsheet && (
        <div className="mt-3 overflow-hidden rounded border border-line-strong">
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3.5 py-2.5">
            <LayoutGrid size={16} className="text-brand-600" />
            <span className="text-sm font-black text-ink">ورقة العلاج</span>
            <div className="ms-auto flex flex-wrap gap-x-3 gap-y-1">
              {(["done", "due", "overdue", "upcoming"] as DoseStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-ink-muted">
                  <span className={cn("inline-block h-3 w-3 rounded-sm", STATUS_META[s].legend)} /> {STATUS_META[s].label}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-center">
              <thead>
                <tr>
                  <th className="sticky start-0 z-10 w-44 min-w-[150px] border border-line bg-surface-1 p-2.5 text-start text-2xs font-extrabold text-ink-muted">الدواء</th>
                  {days.map((day) => {
                    const isToday = day === todayISO;
                    const { wd, dn } = dayShort(day, lang);
                    return (
                      <th key={day} onClick={() => setNoteDay(day)} className={cn("cursor-pointer border border-line p-2 align-middle", isToday ? "bg-brand-50 dark:bg-brand-500/10" : "bg-surface-2", effNoteDay === day && "ring-1 ring-inset ring-brand-400")}>
                        <div className="text-[9px] font-bold text-ink-subtle">{wd}{isToday && " · اليوم"}</div>
                        <div className={cn("text-sm font-black", isToday ? "text-brand-700 dark:text-brand-300" : "text-ink")}>{dn}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {meds.map((row) => (
                  <tr key={row.medication}>
                    <td className="sticky start-0 z-10 border border-line bg-surface-1 p-2.5 text-start">
                      <div className="text-xs font-black text-ink">{row.medication}</div>
                      <div className="text-[10px] font-bold text-ink-subtle">{[row.amount, row.observations].filter(Boolean).join(" · ")}</div>
                    </td>
                    {days.map((day) => {
                      const t = cellFor(row.medication, day);
                      if (!t) return <td key={day} className="border border-line bg-surface-2/40 text-ink-subtle">·</td>;
                      const st = doseStatus(t, todayISO);
                      const m = STATUS_META[st];
                      const isToday = day === todayISO;
                      return (
                        <td key={day} className={cn("border border-line p-0", m.cell, isToday && "shadow-[inset_0_0_0_2px] shadow-brand-200 dark:shadow-brand-500/40")}>
                          <button type="button" disabled={ended} onClick={() => { playTap(); setGiveId(t.id); }} className="flex h-14 w-full flex-col items-center justify-center gap-0.5 transition enabled:hover:brightness-95 disabled:cursor-default">
                            <span className={cn("grid h-6 w-6 place-items-center rounded text-xs font-black", m.mark)}>
                              {st === "done" ? <Check size={14} /> : st === "overdue" ? "!" : st === "due" ? "●" : "○"}
                            </span>
                            <span className={cn("text-[8px] font-extrabold", m.text)}>{st === "done" && t.administered_at ? clockOf(t.administered_at, lang) : m.label}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Day note + existing day notes */}
          {effNoteDay && (
            <div className="border-t border-line bg-surface-1 p-3">
              {(dayNotes.get(effNoteDay) ?? []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {(dayNotes.get(effNoteDay) ?? []).map((n) => (
                    <span key={n.id} className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-2 py-1 text-2xs text-ink-muted"><NotebookPen size={11} className="text-ink-subtle" /> {parseDayNote(n.note_text).body}</span>
                  ))}
                </div>
              )}
              {!ended && <DayNoteInput key={effNoteDay} dayLabel={formatDate(effNoteDay, lang)} onNote={(text) => addNote(text, effNoteDay)} />}
            </div>
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
          <button onClick={() => { playTap(); setNoteText(""); setNoteOpen(true); }} className="inline-flex items-center gap-2 rounded border border-line-strong bg-surface-1 px-4 py-2.5 text-sm font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
            <NotebookPen size={16} /> إضافة ملاحظة
          </button>
          <button onClick={() => { playTap(); setEndOpen(true); }} className="ms-auto inline-flex items-center gap-2 rounded bg-danger-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-danger-700">
            <Check size={16} /> إنهاء العلاج وإغلاق الزيارة
          </button>
        </div>
      )}

      {/* Full diagnosis & plan detail — expandable */}
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

      {giveTarget && (
        <GiveModal t={giveTarget} lang={lang} defaultDoctor={user?.full_name ?? ""} ended={ended} onClose={() => setGiveId(null)} onGive={giveDose} onUndo={undoDose} />
      )}

      <EndVisitModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={endVisit} />
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
            {!ended && (
              <Button variant="secondary" className="w-full" leftIcon={<RotateCcw size={16} />} onClick={() => onUndo(t)}>تراجع عن الإعطاء</Button>
            )}
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
function DayNoteInput({ dayLabel, onNote }: { dayLabel: string; onNote: (text: string) => void }) {
  const [note, setNote] = useState("");
  const submit = () => { if (note.trim()) { onNote(note); setNote(""); } };
  return (
    <div className="flex gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder={`ملاحظة على ${dayLabel}…`} className="input h-9 flex-1 py-0 text-xs" />
      <button type="button" disabled={!note.trim()} onClick={submit} className="rounded bg-brand-50 px-3 text-xs font-bold text-brand-700 disabled:opacity-40 dark:bg-brand-500/10 dark:text-brand-300">حفظ</button>
    </div>
  );
}

/* --------------------------------- Small bits ----------------------------- */
function Divider() { return <span className="hidden h-9 w-px bg-line sm:block" />; }
function KpiBlock({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">{k}</div>
      <div className="mt-0.5 text-sm font-black text-ink">{children}</div>
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
