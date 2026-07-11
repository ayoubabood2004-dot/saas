import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Clock, CalendarDays, Check, Plus, NotebookPen, ClipboardList,
  Loader2, Lock, CheckCircle2, Pencil, Stethoscope, UserRound, Syringe, RotateCcw,
  Activity, StickyNote, type LucideIcon,
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
/** Short weekday + day number for the tracker cells. */
const dayShort = (iso: string, lang: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return { wd: d.toLocaleDateString(lang, { weekday: "short" }), dn: formatNum(d.getDate()) };
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
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-extrabold", OUTCOME_BADGE[o.tone])}>
      <GlyphMark name={o.id} size={14} className={glyphToneText(glyphTone(o.id) ?? "blue")} /> {o.label}
    </span>
  );
}

/** A compact circular progress dial — done / total doses. */
function ProgressRing({ done, total, size = 66 }: { done: number; total: number; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  const full = total > 0 && done === total;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="stroke-line" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} strokeLinecap="round"
        className={cn(full ? "stroke-success-500" : "stroke-brand-500", "transition-all")}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={cn("fill-ink font-black", full && "fill-success-600")} fontSize={size * 0.26}>
        {formatNum(done)}<tspan className="fill-ink-subtle" fontSize={size * 0.2}>/{formatNum(total)}</tspan>
      </text>
    </svg>
  );
}

/**
 * A standalone VISIT page (زيارة). An illness visit carries the clinical console,
 * which lays out a day-by-day treatment plan the vet checks off — recording WHO
 * gave each dose (clinic doctor) and at WHAT time. "تم إنهاء العلاج" locks it.
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
  const [selDay, setSelDay] = useState<string | null>(null);

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

  const clinicalNotes = useMemo(() => notes.map((n) => ({ n, ...parseClinical(n.note_text) })).filter((x) => x.record), [notes]);
  const generalNotes = useMemo(
    () => notes.filter((n) => !parseClinical(n.note_text).record && !n.note_text.startsWith(DAY_MARK)),
    [notes],
  );

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

  const todayISO = localISO(new Date());
  // Which day the focus panel shows: chosen, else today (if in course), else first pending, else last.
  const defaultDay = useMemo(() => {
    if (!days.length) return null;
    const keys = days.map((d) => d[0]);
    if (keys.includes(todayISO)) return todayISO;
    const pending = days.find(([, rows]) => rows.some((r) => !r.administered_at));
    return pending ? pending[0] : keys[keys.length - 1];
  }, [days, todayISO]);
  const activeDay = selDay && days.some((d) => d[0] === selDay) ? selDay : defaultDay;
  const activeRows = days.find((d) => d[0] === activeDay)?.[1] ?? [];
  const activeIndex = days.findIndex((d) => d[0] === activeDay);

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
              medication: m.name, amount: m.dose || "", time: "", observations: m.freq,
              doctor: user?.full_name,
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
    await reload();
  };
  const undoDose = async (t: TreatmentEntry) => {
    playTap();
    await repo.setTreatmentGiven(t.id, false);
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

  const remaining = totalDoses - doneDoses;
  const isIllness = visit.kind === "illness";
  // Latest saved plan → the diagnosis headline for the progress quadrant.
  const primary = clinicalNotes.length ? clinicalNotes[clinicalNotes.length - 1].record : null;
  const dxName = primary?.diagnoses?.[0]?.disease;
  const dxLatin = primary?.pathogens?.find((p) => p.name === dxName)?.latin ?? primary?.pathogens?.[0]?.latin;
  const dxWarn = (primary?.redFlags?.length ?? 0) > 0 || (primary?.zoonotic?.length ?? 0) > 0 || (primary?.reportable?.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <button onClick={() => navigate(`/pet/${petId}`)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted transition hover:text-ink">
        <ArrowRight size={16} /> رجوع إلى ملف {pet.name}
      </button>

      {/* ═══ 4-quadrant dashboard — sharp corners, thin dividers ═══ */}
      <div className="overflow-hidden rounded border border-line-strong shadow-card">
        <div className={cn("grid gap-px bg-line", isIllness && "lg:grid-cols-2")}>

          {/* Q1 — visit / patient */}
          <section className="bg-surface-1">
            <QuadHead icon={ClipboardList} label="بيانات الزيارة" num="١" />
            <div className="p-3.5">
              <div className="mb-3 flex items-center gap-3">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded text-white", kind!.solid)}><KindIcon size={22} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-black text-ink">{pet.name}</div>
                  <div className="truncate text-2xs font-bold text-ink-subtle">{[kind!.label, pet.breed].filter(Boolean).join(" · ")}</div>
                </div>
                {ended ? (
                  <span className="inline-flex items-center gap-1.5 rounded-sm bg-slate-200 px-2.5 py-1 text-xs font-extrabold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"><Lock size={12} /> منتهية</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-sm bg-success-50 px-2.5 py-1 text-xs font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300"><span className="h-2 w-2 rounded-full bg-success-500" /> مفتوحة</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line">
                <InfoCell icon={CalendarDays} k="فُتحت" v={formatDate(visit.opened_at, lang)} />
                <InfoCell icon={UserRound} k="الطبيب" v={visit.opened_by || "—"} />
                <InfoCell icon={Stethoscope} k="الحالة عند الدخول">{visit.condition ? <OutcomeBadge id={visit.condition} /> : "—"}</InfoCell>
                <InfoCell icon={ended ? Lock : Clock} k={ended ? "أُغلقت" : "المدة"} v={ended && visit.ended_at ? formatDate(visit.ended_at, lang) : hasFlowsheet ? `${formatNum(days.length)} أيام` : "—"} />
              </div>
              {ended && visit.summary && (
                <div className="mt-2.5 flex items-start gap-2 rounded border border-success-200 bg-success-50 p-2.5 text-2xs text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" /><div><b>الخلاصة:</b> {visit.summary}</div>
                </div>
              )}
            </div>
          </section>

          {isIllness && <>
            {/* Q2 — progress + diagnosis */}
            <section className="bg-surface-1">
              <QuadHead icon={Activity} label="التقدّم والتشخيص" num="٢" />
              <div className="p-3.5">
                {hasFlowsheet || dxName ? (
                  <div className="flex items-center gap-4">
                    {hasFlowsheet && <ProgressRing done={doneDoses} total={totalDoses} size={92} />}
                    <div className="min-w-0 flex-1">
                      {dxName ? (
                        <>
                          <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">التشخيص</div>
                          <div className="text-base font-black leading-tight text-ink">{dxName} {dxLatin && <span className="text-2xs font-bold not-italic text-ink-subtle"> · <i>{dxLatin}</i></span>}</div>
                        </>
                      ) : <div className="text-sm font-bold text-ink-muted">خطة علاج بلا تشخيص محدّد</div>}
                      {hasFlowsheet && (
                        <div className="mt-1.5 text-sm font-extrabold">
                          {remaining > 0 ? <span className="text-brand-600 dark:text-brand-300">متبقٍّ {formatNum(remaining)} جرعة</span> : <span className="text-success-600 dark:text-success-400">اكتملت كل الجرعات ✓</span>}
                          <span className="ms-1 text-2xs font-bold text-ink-subtle">· على {formatNum(days.length)} أيام</span>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ended && visit.outcome && <OutcomeBadge id={visit.outcome} />}
                        {dxWarn && <span className="rounded-sm bg-danger-50 px-2 py-0.5 text-[10px] font-extrabold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">⚠ علامة حمراء</span>}
                      </div>
                    </div>
                  </div>
                ) : <Empty icon={Stethoscope} text="ابدأ بزر «التشخيص وخطة العلاج» بالأسفل — يظهر التشخيص والتقدّم هنا." />}
              </div>
            </section>

            {/* Q3 — day calendar */}
            <section className="bg-surface-1">
              <QuadHead icon={CalendarDays} label="أيام العلاج" num="٣" />
              <div className="p-3.5">
                {hasFlowsheet ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {days.map(([day, rows], di) => {
                      const done = rows.filter((r) => r.administered_at).length;
                      const all = done === rows.length;
                      const some = done > 0 && !all;
                      const isToday = day === todayISO;
                      const active = day === activeDay;
                      const { wd, dn } = dayShort(day, lang);
                      return (
                        <button key={day} type="button" onClick={() => { playTap(); setSelDay(day); }}
                          className={cn("relative flex flex-col items-center gap-0.5 rounded border-2 py-1.5 transition",
                            active ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : all ? "border-success-300 bg-success-50/60 dark:border-success-500/30 dark:bg-success-500/5" : some ? "border-warn-300" : "border-line bg-surface-1 hover:border-brand-300")}>
                          {isToday && <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500" title="اليوم" />}
                          <span className="text-[9px] font-bold text-ink-subtle">{wd}</span>
                          <span className={cn("grid h-7 w-7 place-items-center rounded text-sm font-black",
                            all ? "bg-success-500 text-white" : active ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>
                            {all ? <Check size={15} /> : dn}
                          </span>
                          <span className="text-[8px] font-bold text-ink-muted">{isToday ? "اليوم" : `يوم ${formatNum(di + 1)}`}</span>
                          <span className="text-[8px] font-bold text-ink-subtle tabular-nums">{formatNum(done)}/{formatNum(rows.length)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : <Empty icon={CalendarDays} text="تظهر أيام العلاج هنا بعد حفظ خطة العلاج." />}
              </div>
            </section>

            {/* Q4 — selected-day doses */}
            <section className="bg-surface-1">
              <QuadHead icon={Syringe} label="جرعات اليوم المحدّد" right={activeDay ? <span className="ms-auto text-[10px] font-bold text-ink-subtle">{formatDate(activeDay, lang)}</span> : undefined} />
              <div className="p-3.5">
                {activeDay ? (
                  <>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded bg-brand-100 text-sm font-black text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{formatNum(activeIndex + 1)}</span>
                      <div className="text-sm font-black text-ink">اليوم {formatNum(activeIndex + 1)}{activeDay === todayISO && <span className="ms-1.5 rounded-sm bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">اليوم</span>}</div>
                      <span className="ms-auto text-2xs font-bold text-ink-subtle">{formatNum(activeRows.filter((r) => r.administered_at).length)}/{formatNum(activeRows.length)} تم</span>
                    </div>
                    <div className="space-y-2">
                      {activeRows.map((t) => (
                        <DoseRow key={t.id} t={t} ended={ended} lang={lang} defaultDoctor={user?.full_name ?? ""} onGive={giveDose} onUndo={undoDose} />
                      ))}
                    </div>
                    {(dayNotes.get(activeDay) ?? []).length > 0 && (
                      <div className="mt-2.5 space-y-1">
                        {(dayNotes.get(activeDay) ?? []).map((n) => (
                          <div key={n.id} className="flex items-start gap-1.5 rounded border border-line bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-muted"><StickyNote size={12} className="mt-0.5 shrink-0 text-ink-subtle" /> {parseDayNote(n.note_text).body}</div>
                        ))}
                      </div>
                    )}
                    {!ended && <DayNoteInput onNote={(text) => addNote(text, activeDay)} />}
                  </>
                ) : <Empty icon={Syringe} text="لا جرعات بعد — احفظ خطة العلاج لتُولّد الجرعات اليومية." />}
              </div>
            </section>
          </>}
        </div>
      </div>

      {/* Toolbar */}
      {!ended && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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

      {/* Full diagnosis & plan detail — the fifth, expandable panel */}
      {clinicalNotes.length > 0 && (
        <div className="mt-4 space-y-3">
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

      <EndVisitModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={endVisit} />
    </div>
  );
}

/* --------------------------- Dashboard helpers ---------------------------- */
function QuadHead({ icon: Icon, label, num, right }: { icon: LucideIcon; label: string; num?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3.5 py-2">
      <Icon size={15} className="text-brand-600" />
      <span className="text-[11px] font-black uppercase tracking-wide text-brand-700 dark:text-brand-300">{label}</span>
      {right ?? (num && <span className="ms-auto rounded-sm border border-line bg-surface-1 px-1.5 text-[10px] font-bold text-ink-subtle">{num}</span>)}
    </div>
  );
}
function InfoCell({ icon: Icon, k, v, children }: { icon: LucideIcon; k: string; v?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-surface-1 p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold text-ink-subtle"><Icon size={11} /> {k}</div>
      <div className="text-xs font-extrabold text-ink">{children ?? v}</div>
    </div>
  );
}
function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded border border-dashed border-line bg-surface-2/40 px-4 py-8 text-center">
      <Icon size={22} className="text-ink-subtle/50" />
      <p className="text-2xs font-semibold leading-relaxed text-ink-subtle">{text}</p>
    </div>
  );
}

/* ------------------------------- Dose row --------------------------------- */
function DoseRow({ t, ended, lang, defaultDoctor, onGive, onUndo }: {
  t: TreatmentEntry; ended: boolean; lang: string; defaultDoctor: string;
  onGive: (t: TreatmentEntry, doctor: string, atISO: string) => void; onUndo: (t: TreatmentEntry) => void;
}) {
  const given = !!t.administered_at;
  const [open, setOpen] = useState(false);
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [time, setTime] = useState(nowHHMM);

  const confirm = () => {
    const at = new Date(`${t.day}T${(time || nowHHMM())}:00`);
    onGive(t, doctor || defaultDoctor, isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString());
    setOpen(false);
  };

  if (given) {
    return (
      <div className="rounded border border-success-200 bg-success-50/50 p-2.5 dark:border-success-500/25 dark:bg-success-500/5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-success-500 text-white"><Check size={17} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
              {t.medication}
              {t.edited && <span className="inline-flex items-center gap-0.5 rounded-full bg-warn-50 px-1.5 py-0.5 text-[10px] font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"><Pencil size={9} /> عُدّل</span>}
            </div>
            <div className="text-2xs text-ink-subtle">{[t.amount, t.observations].filter(Boolean).join(" · ")}</div>
          </div>
          {!ended && (
            <button type="button" onClick={() => onUndo(t)} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-2xs font-bold text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600" aria-label="تراجع">
              <RotateCcw size={13} /> تراجع
            </button>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 ps-11">
          <span className="inline-flex items-center gap-1 rounded bg-surface-1 px-2 py-1 text-[11px] font-bold text-success-700 dark:text-success-300"><Clock size={12} /> {clockOf(t.administered_at!, lang)}</span>
          {t.administered_by && <span className="inline-flex items-center gap-1 rounded bg-surface-1 px-2 py-1 text-[11px] font-bold text-ink-muted"><UserRound size={12} /> {t.administered_by}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-line bg-surface-2/50 p-2.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button" disabled={ended} onClick={() => setOpen((o) => !o)}
          className={cn("grid h-9 w-9 shrink-0 place-items-center rounded border-2 transition disabled:opacity-60", open ? "border-brand-500 bg-brand-500 text-white" : "border-ink-subtle/40 text-transparent hover:border-success-400 hover:text-success-400")}
          aria-label="تم العلاج"
        ><Check size={17} /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{t.medication}</div>
          <div className="text-2xs text-ink-subtle">{[t.amount, t.observations].filter(Boolean).join(" · ")}</div>
        </div>
        {!ended && !open && (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-2xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
            <Syringe size={13} /> تم العلاج
          </button>
        )}
        {ended && <span className="shrink-0 text-2xs font-semibold text-ink-subtle">لم يُعطَ</span>}
      </div>

      {/* Give panel — who gave it + at what time */}
      {open && !ended && (
        <div className="mt-2.5 space-y-2.5 rounded border border-brand-200 bg-brand-50/50 p-2.5 dark:border-brand-500/25 dark:bg-brand-500/5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] font-extrabold text-ink-subtle"><UserRound size={11} /> الطبيب الذي أعطى العلاج</div>
              <DoctorSelect value={doctor} onChange={setDoctor} placeholder="اختر الطبيب…" />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] font-extrabold text-ink-subtle"><Clock size={11} /> وقت الإعطاء</div>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input h-10 w-full text-sm tabular-nums" dir="ltr" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-2xs font-bold text-ink-muted hover:text-ink">إلغاء</button>
            <Button className="ms-auto" leftIcon={<Check size={16} />} onClick={confirm}>تأكيد الإعطاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Day note input ---------------------------- */
function DayNoteInput({ onNote }: { onNote: (text: string) => void }) {
  const [note, setNote] = useState("");
  const submit = () => { if (note.trim()) { onNote(note); setNote(""); } };
  return (
    <div className="mt-2.5 flex gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="ملاحظة على هذا اليوم…" className="input h-9 flex-1 py-0 text-xs" />
      <button type="button" disabled={!note.trim()} onClick={submit} className="rounded bg-brand-50 px-3 text-xs font-bold text-brand-700 disabled:opacity-40 dark:bg-brand-500/10 dark:text-brand-300">حفظ</button>
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
