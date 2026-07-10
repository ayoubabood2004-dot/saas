import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Plus, X, Pill, ClipboardList, CalendarClock, Check, Activity, Stethoscope,
  AlertTriangle, ShieldAlert, Biohazard, Sparkles, TrendingUp, ChevronLeft, ChevronRight, Crosshair,
  Droplets, ChevronDown, Camera, Loader2, ImageIcon,
} from "lucide-react";
import { AnatomyMap, type AnatomyFocus } from "@/components/AnatomyMap";
import { DiagnosisPicker } from "@/components/DiagnosisPicker";
import { CbcPanel } from "@/components/CbcPanel";
import { summarizeDiagnoses, type Diagnosis } from "@/lib/diagnoses";
import {
  SYMPTOMS, DISEASES, differentialFor, interactionsIn, OUTCOMES,
  type Disease, type CaseOutcome, type Sp,
} from "@/lib/clinicalKnowledge";
import { CBC, cbcRange, cbcFlag, FLAG_ARROW } from "@/lib/cbc";
import { Glyph, GlyphMark, glyphTone, glyphToneText } from "@/lib/clinicalIcons";
import { repo } from "@/lib/repo";
import { prepareUpload } from "@/lib/image";
import { Button, useToast } from "@/components/ui";
import { formatNum, cn } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/** How often a treatment is given — drives the dose-count math. */
const FREQS: { id: string; label: string; perDay: number }[] = [
  { id: "1", label: "مرة يومياً", perDay: 1 },
  { id: "2", label: "مرتين يومياً", perDay: 2 },
  { id: "3", label: "٣ مرات", perDay: 3 },
  { id: "4", label: "٤ مرات", perDay: 4 },
  { id: "prn", label: "عند اللزوم", perDay: 0 },
];

interface PlanRow { id: string; name: string; dose: string; freq: string; days: number; note?: string }

const rid = () => Math.random().toString(36).slice(2);
const blankRow = (): PlanRow => ({ id: rid(), name: "", dose: "", freq: "2", days: 7 });
const dosesOf = (r: PlanRow) => {
  const per = FREQS.find((f) => f.id === r.freq)?.perDay ?? 0;
  return per > 0 ? per * Math.max(0, r.days) : 0;
};

type StepId = "anatomy" | "symptoms" | "diagnosis" | "treatment" | "outcome";
const STEPS: { id: StepId; label: string; icon: typeof Activity }[] = [
  { id: "anatomy", label: "التشريح", icon: Crosshair },
  { id: "symptoms", label: "الأعراض", icon: Activity },
  { id: "diagnosis", label: "التشخيص", icon: Stethoscope },
  { id: "treatment", label: "العلاج", icon: Pill },
  { id: "outcome", label: "النتيجة", icon: TrendingUp },
];

const OUTCOME_TONE: Record<string, string> = {
  brand: "border-brand-500 bg-brand-600 text-white",
  success: "border-success-500 bg-success-600 text-white",
  violet: "border-violet-500 bg-violet-600 text-white",
  warn: "border-warn-500 bg-warn-500 text-white",
  danger: "border-danger-500 bg-danger-600 text-white",
};

/**
 * ClinicalConsole — the smart diagnosis & treatment workspace.
 *
 * Five guided steps, all optional and composable into one tidy record entry:
 *   ① Anatomy   — pin the exact organ/bone on an interactive body map.
 *   ② Symptoms  — tick the observed clinical signs.
 *   ③ Diagnosis — a ranked DIFFERENTIAL from the signs (+ manual picker),
 *                 with zoonotic / reportable / red-flag warnings and pathogen.
 *   ④ Treatment — scheduled plan with one-tap PROTOCOL auto-fill and LIVE
 *                 drug-interaction warnings.
 *   ⑤ Outcome   — track how the case ended.
 */
export function TreatmentPlan({
  onSubmit, busy, species, petId, onMediaAdded,
}: {
  onSubmit: (body: string) => void | Promise<void>;
  busy?: boolean;
  species?: Sp;
  petId?: string;
  onMediaAdded?: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<StepId>("anatomy");
  const [focus, setFocus] = useState<AnatomyFocus | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [cbc, setCbc] = useState<Record<string, number>>({});
  const [cbcOpen, setCbcOpen] = useState(false);
  const [labPhoto, setLabPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [rows, setRows] = useState<PlanRow[]>([blankRow()]);
  const [outcome, setOutcome] = useState<CaseOutcome | null>(null);

  /* ---- Lab photo: take a picture and file it into the pet's media vault ---- */
  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || photoBusy) return;
    if (!petId) { toast.error("تعذّر إرفاق الصورة"); return; }
    setPhotoBusy(true);
    try {
      const prepared = await prepareUpload(file, { maxDim: 2400 });
      await repo.uploadMedia(petId, prepared, "lab", "تحليل CBC");
      setLabPhoto(prepared.dataUrl);
      playSuccess();
      toast.success("أُضيفت صورة التحليل إلى المعرض");
      onMediaAdded?.();
    } catch (err) {
      playWarning();
      toast.error("تعذّر رفع الصورة", err instanceof Error ? err.message : undefined);
    } finally {
      setPhotoBusy(false);
    }
  };

  /* ---- Differential engine ---- */
  const differential = useMemo(() => differentialFor(symptoms, species), [symptoms, species]);
  const topScore = differential[0]?.score ?? 1;

  /* ---- Which knowledge-base diseases are currently chosen (single source: diagnoses) ---- */
  const pickedDiseases = useMemo(
    () => DISEASES.filter((d) => diagnoses.some((x) => x.disease === d.name && x.system === d.system)),
    [diagnoses],
  );
  const isDiseasePicked = (d: Disease) => diagnoses.some((x) => x.disease === d.name && x.system === d.system);
  const toggleDisease = (d: Disease) => {
    playTap();
    if (isDiseasePicked(d)) {
      setDiagnoses((ds) => ds.filter((x) => !(x.disease === d.name && x.system === d.system)));
    } else {
      setDiagnoses((ds) => [...ds, { system: d.system, disease: d.name, severity: "moderate" }]);
    }
  };

  /* ---- Warnings gathered from the chosen diseases ---- */
  const zoonotic = pickedDiseases.filter((d) => d.zoonotic);
  const reportable = pickedDiseases.filter((d) => d.reportable);
  const redFlags = pickedDiseases.filter((d) => d.redFlag);

  /* ---- Treatment rows ---- */
  const setRow = (id: string, patch: Partial<PlanRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => { playTap(); setRows((rs) => [...rs, blankRow()]); };
  const removeRow = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  const applyProtocol = (d: Disease) => {
    if (!d.protocol?.length) return;
    playTap();
    const added: PlanRow[] = d.protocol.map((p) => ({ id: rid(), name: p.drug, dose: p.dose, freq: p.freq, days: p.days, note: p.note }));
    setRows((rs) => {
      const kept = rs.filter((r) => r.name.trim()); // drop empty starter row
      return [...kept, ...added];
    });
    setStep("treatment");
  };

  const filledRows = rows.filter((r) => r.name.trim());
  const interactions = useMemo(() => interactionsIn(filledRows.map((r) => r.name)), [filledRows]);
  const cbcIds = Object.keys(cbc);

  const canSave = !busy && (!!focus || symptoms.length > 0 || cbcIds.length > 0 || !!labPhoto || diagnoses.length > 0 || filledRows.length > 0 || !!outcome);

  const compose = () => {
    const lines: string[] = [];
    if (focus) lines.push(`🧭 التركيز التشريحي: ${focus.structure ?? focus.region}${focus.latin ? ` (${focus.latin})` : ""}`);
    if (symptoms.length) {
      const labels = symptoms.map((id) => SYMPTOMS.find((s) => s.id === id)?.label).filter(Boolean);
      lines.push(`🔬 الأعراض: ${labels.join(" · ")}`);
    }
    if (cbcIds.length) {
      lines.push("🩸 تحليل الدم (CBC):");
      for (const p of CBC) {
        if (cbc[p.id] === undefined) continue;
        const v = cbc[p.id];
        const flag = cbcFlag(v, cbcRange(p, species));
        const val = formatNum(Number(v.toFixed(p.step < 1 ? 1 : 0)));
        lines.push(`• ${p.abbr} (${p.label}): ${val} ${p.unit} ${FLAG_ARROW[flag]}${flag !== "normal" ? " ⚠️" : ""}`);
      }
    }
    if (labPhoto) lines.push("📎 صورة التحليل مُرفقة بمعرض الصور.");
    if (diagnoses.length) lines.push(`🩺 التشخيص: ${summarizeDiagnoses(diagnoses)}`);
    for (const d of pickedDiseases) if (d.latin) lines.push(`   ↳ ${d.name} — ${d.latin}`);
    if (zoonotic.length) lines.push(`⚠️ مرض حيواني المنشأ (ينتقل للإنسان): ${zoonotic.map((d) => d.name).join("، ")} — التزم الحماية.`);
    if (reportable.length) lines.push(`🚨 مرض واجب التبليغ: ${reportable.map((d) => d.name).join("، ")}.`);
    for (const d of redFlags) lines.push(`❗ ${d.name}: ${d.redFlag}`);
    if (filledRows.length) {
      lines.push("💊 خطة العلاج:");
      for (const r of filledRows) {
        const freq = FREQS.find((f) => f.id === r.freq)?.label ?? "";
        const doses = dosesOf(r);
        const parts = [
          r.name.trim(),
          r.dose.trim() || null,
          freq,
          r.freq === "prn" ? null : `لمدة ${formatNum(r.days)} يوم`,
          doses ? `(${formatNum(doses)} جرعة)` : null,
          r.note?.trim() ? `— ${r.note.trim()}` : null,
        ].filter(Boolean);
        lines.push(`• ${parts.join(" — ")}`);
      }
    }
    if (interactions.length) {
      lines.push("⛔ تداخلات دوائية:");
      for (const it of interactions) lines.push(`• ${it.a} + ${it.b} (${it.severity === "major" ? "خطير" : "متوسط"}): ${it.note}`);
    }
    if (outcome) {
      const o = OUTCOMES.find((x) => x.id === outcome);
      if (o) lines.push(`📈 نتيجة الحالة: ${o.emoji} ${o.label}`);
    }
    return lines.join("\n");
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const go = (dir: -1 | 1) => { playTap(); const n = STEPS[stepIndex + dir]; if (n) setStep(n.id); };

  /* completion dots per step */
  const done: Record<StepId, boolean> = {
    anatomy: !!focus,
    symptoms: symptoms.length > 0 || cbcIds.length > 0 || !!labPhoto,
    diagnosis: diagnoses.length > 0,
    treatment: filledRows.length > 0,
    outcome: !!outcome,
  };

  return (
    <div className="space-y-4">
      {/* Step nav */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-1">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const Icon = s.icon;
          return (
            <button
              key={s.id} type="button"
              onClick={() => { playTap(); setStep(s.id); }}
              className={cn(
                "relative inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-xs font-bold transition",
                active ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink",
              )}
            >
              <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[10px]", done[s.id] ? "bg-success-500 text-white" : "bg-ink-subtle/20 text-ink-subtle")}>
                {done[s.id] ? "✓" : formatNum(i + 1)}
              </span>
              <Icon size={14} className="hidden sm:block" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ---------------- Panels ---------------- */}
      <div className="min-h-[220px]">
        {step === "anatomy" && (
          <section className="space-y-2">
            <StepTitle icon={Crosshair} title="حدّد المنطقة التشريحية" hint="اختياري — يربط الحالة بالعضو أو العظم بالاسم العلمي." />
            <AnatomyMap value={focus} onChange={setFocus} species={species} />
          </section>
        )}

        {step === "symptoms" && (
          <section className="space-y-3">
            <StepTitle icon={Activity} title="العلامات السريرية المُلاحَظة" hint="اختر الأعراض — يبني منها النظام تشخيصاً تفريقياً مرتّباً." />
            <div className="flex flex-wrap gap-1.5">
              {SYMPTOMS.map((s) => {
                const on = symptoms.includes(s.id);
                return (
                  <button
                    key={s.id} type="button"
                    onClick={() => { playTap(); setSymptoms((xs) => (on ? xs.filter((x) => x !== s.id) : [...xs, s.id])); }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border py-1 pe-3 ps-1 text-xs font-semibold transition",
                      on ? "border-brand-500 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:text-brand-700",
                    )}
                  >
                    <Glyph name={s.id} size={22} /> {s.label}
                  </button>
                );
              })}
            </div>
            {symptoms.length > 0 && (
              <button type="button" onClick={() => { playTap(); setStep("diagnosis"); }} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-4 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
                <Sparkles size={14} /> عرض التشخيص التفريقي ({formatNum(differential.length)})
              </button>
            )}

            {/* ---- CBC blood panel (collapsible) ---- */}
            <div className="border-t border-line pt-3">
              <button
                type="button"
                onClick={() => { playTap(); setCbcOpen((o) => !o); }}
                className="flex w-full items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-start transition hover:bg-surface-3"
              >
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-danger-50 text-danger-600 dark:bg-danger-500/15"><Droplets size={16} /></span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-ink">تحليل الدم (CBC)</span>
                  <span className="block text-2xs text-ink-subtle">اسحب مؤشر كل قيمة — يظهر الطبيعي والمرتفع والمنخفض فوراً</span>
                </span>
                {cbcIds.length > 0 && (
                  <span className="rounded-full bg-brand-600 px-2 py-0.5 text-2xs font-bold text-white">{formatNum(cbcIds.length)}</span>
                )}
                <ChevronDown size={18} className={cn("shrink-0 text-ink-subtle transition-transform", cbcOpen && "rotate-180")} />
              </button>

              {cbcOpen && (
                <div className="mt-3 space-y-3">
                  <CbcPanel species={species} value={cbc} onChange={setCbc} />

                  {/* Photo of the lab report → filed into the media vault */}
                  <div className="rounded-2xl border border-dashed border-line bg-surface-1 p-3">
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
                    {labPhoto ? (
                      <div className="flex items-center gap-3">
                        <img src={labPhoto} alt="صورة التحليل" className="h-16 w-16 rounded-xl border border-line object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-success-700 dark:text-success-300"><ImageIcon size={14} /> أُضيفت إلى المعرض</div>
                          <div className="text-2xs text-ink-subtle">صُنّفت كتحليل مخبري في صور الحالة</div>
                        </div>
                        <button type="button" onClick={() => { playTap(); fileRef.current?.click(); }} disabled={photoBusy} className="rounded-full border border-line px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300">
                          تغيير
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { playTap(); fileRef.current?.click(); }}
                        disabled={photoBusy || !petId}
                        className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                      >
                        {photoBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                        {photoBusy ? "جارٍ الرفع…" : "صوّر ورقة التحليل وأرفقها"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {step === "diagnosis" && (
          <section className="space-y-4">
            <StepTitle icon={Stethoscope} title="التشخيص التفريقي والمؤكَّد" hint="رشّح من الأعراض — أو أضِف تشخيصاً يدوياً بالأسفل." />

            {/* Warnings */}
            {(zoonotic.length > 0 || reportable.length > 0 || redFlags.length > 0) && (
              <div className="space-y-2">
                {reportable.length > 0 && (
                  <Banner tone="danger" icon={ShieldAlert} title="مرض واجب التبليغ">
                    {reportable.map((d) => d.name).join("، ")} — بلّغ الجهات الصحية فوراً.
                  </Banner>
                )}
                {zoonotic.length > 0 && (
                  <Banner tone="warn" icon={Biohazard} title="ينتقل للإنسان (Zoonotic)">
                    {zoonotic.map((d) => d.name).join("، ")} — التزم إجراءات الحماية والنظافة.
                  </Banner>
                )}
                {redFlags.map((d) => (
                  <Banner key={d.id} tone="danger" icon={AlertTriangle} title={d.name}>{d.redFlag}</Banner>
                ))}
              </div>
            )}

            {/* Differential ranked list */}
            {differential.length > 0 ? (
              <div className="space-y-2">
                <div className="text-2xs font-bold uppercase tracking-wide text-ink-subtle">مرشّحات حسب الأعراض</div>
                {differential.map((d) => {
                  const picked = isDiseasePicked(d);
                  const pct = Math.round((d.score / topScore) * 100);
                  return (
                    <div
                      key={d.id}
                      className={cn(
                        "rounded-2xl border p-3 transition",
                        picked ? "border-brand-500 bg-brand-50/70 dark:bg-brand-500/10" : "border-line bg-surface-1",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button" onClick={() => toggleDisease(d)}
                          className="flex min-w-0 flex-1 items-start gap-2 text-start"
                          aria-pressed={picked}
                        >
                          <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition", picked ? "border-brand-600 bg-brand-600 text-white" : "border-ink-subtle/40")}>
                            {picked && <Check size={13} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-extrabold text-ink">{d.name}</span>
                              {d.latin && <span className="text-2xs italic text-ink-subtle">{d.latin}</span>}
                              {d.zoonotic && <span className="rounded-full bg-warn-50 px-1.5 py-0.5 text-[10px] font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">حيواني المنشأ</span>}
                              {d.reportable && <span className="rounded-full bg-danger-50 px-1.5 py-0.5 text-[10px] font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">تبليغ</span>}
                            </span>
                            {/* match bar */}
                            <span className="mt-1.5 flex items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                                <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                              </span>
                              <span className="text-2xs font-bold tabular-nums text-ink-subtle">{formatNum(d.match)}/{formatNum(d.symptoms.length)}</span>
                            </span>
                          </span>
                        </button>
                      </div>
                      {d.protocol?.length ? (
                        <button
                          type="button" onClick={() => applyProtocol(d)}
                          className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 bg-brand-50 px-2.5 py-1 text-2xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
                        >
                          <Sparkles size={12} /> أضِف بروتوكول العلاج ({formatNum(d.protocol.length)})
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-surface-1 p-4 text-center text-xs text-ink-subtle">
                اختر أعراضاً في خطوة «الأعراض» ليظهر التشخيص التفريقي — أو أضِف تشخيصاً يدوياً بالأسفل.
              </div>
            )}

            {/* Manual structured picker */}
            <div className="border-t border-line pt-3">
              <div className="mb-2 text-2xs font-bold uppercase tracking-wide text-ink-subtle">إضافة يدوية حسب الجهاز</div>
              <DiagnosisPicker value={diagnoses} onChange={setDiagnoses} />
            </div>
          </section>
        )}

        {step === "treatment" && (
          <section className="space-y-3">
            <StepTitle icon={CalendarClock} title="خطة العلاج ومدتها" hint="كل دواء مع تكراره ومدته — يُحسب عدد الجرعات تلقائياً." />

            {/* Live drug-interaction warnings */}
            {interactions.length > 0 && (
              <div className="space-y-2">
                {interactions.map((it, i) => (
                  <Banner key={i} tone={it.severity === "major" ? "danger" : "warn"} icon={AlertTriangle} title={`تداخل دوائي — ${it.a} + ${it.b}`}>
                    {it.note}
                  </Banner>
                ))}
              </div>
            )}

            <div className="space-y-2.5">
              {rows.map((r) => {
                const doses = dosesOf(r);
                return (
                  <div key={r.id} className="rounded-2xl border border-line bg-surface-1 p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Pill size={15} /></span>
                      <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} placeholder="اسم الدواء / العلاج" className="input h-9 flex-1 py-0 text-sm font-semibold" />
                      <input value={r.dose} onChange={(e) => setRow(r.id, { dose: e.target.value })} placeholder="الجرعة" className="input h-9 w-28 py-0 text-sm" />
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(r.id)} aria-label="إزالة" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5">
                        {FREQS.map((f) => (
                          <button
                            key={f.id} type="button"
                            onClick={() => { playTap(); setRow(r.id, { freq: f.id }); }}
                            className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", r.freq === f.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      {r.freq !== "prn" && (
                        <label className="inline-flex items-center gap-1.5 text-2xs font-semibold text-ink-muted">
                          المدة
                          <input type="number" min={1} max={365} inputMode="numeric" value={r.days === 0 ? "" : String(r.days)} onChange={(e) => setRow(r.id, { days: Math.max(0, Number(e.target.value) || 0) })} className="input h-8 w-16 px-2 py-0 text-center text-sm font-bold tabular-nums" />
                          يوم
                        </label>
                      )}
                      {doses > 0 && (
                        <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                          {formatNum(doses)} جرعة
                        </span>
                      )}
                    </div>
                    {r.note?.trim() && <div className="mt-2 text-2xs text-ink-subtle">📝 {r.note}</div>}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addRow} className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
              <Plus size={14} /> إضافة دواء / علاج
            </button>
          </section>
        )}

        {step === "outcome" && (
          <section className="space-y-3">
            <StepTitle icon={TrendingUp} title="نتيجة الحالة" hint="تتبّع مصير الحالة — يظهر في السجل الزمني." />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OUTCOMES.map((o) => {
                const on = outcome === o.id;
                return (
                  <button
                    key={o.id} type="button"
                    onClick={() => { playTap(); setOutcome((cur) => (cur === o.id ? null : o.id)); }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-center transition",
                      on ? OUTCOME_TONE[o.tone] : "border-line bg-surface-1 text-ink-muted hover:border-brand-300",
                    )}
                  >
                    <GlyphMark name={o.id} size={34} className={on ? "text-white" : glyphToneText(glyphTone(o.id) ?? "blue")} />
                    <span className="text-xs font-bold">{o.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Final summary preview */}
            <div className="rounded-2xl border border-line bg-surface-2 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-ink-subtle"><ClipboardList size={13} /> معاينة السجل</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-ink">{compose() || "لم تُدخل أي بيانات بعد."}</pre>
            </div>
          </section>
        )}
      </div>

      {/* Footer nav + save */}
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <button type="button" onClick={() => go(-1)} disabled={stepIndex === 0} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-30">
          <ChevronRight size={16} className="rtl:hidden" /><ChevronLeft size={16} className="ltr:hidden" /> السابق
        </button>
        {stepIndex < STEPS.length - 1 ? (
          <Button className="ms-auto" rightIcon={<ChevronLeft size={16} className="rtl:block ltr:hidden" />} onClick={() => go(1)}>
            التالي
          </Button>
        ) : (
          <Button className="ms-auto" leftIcon={<Check size={18} />} disabled={!canSave} loading={busy} onClick={() => onSubmit(compose())}>
            حفظ التشخيص وخطة العلاج
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Small helpers ----------------------------- */
function StepTitle({ icon: Icon, title, hint }: { icon: typeof Activity; title: string; hint: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
        <Icon size={16} className="text-brand-600" /> {title}
      </div>
      <p className="mt-0.5 text-2xs text-ink-subtle">{hint}</p>
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  danger: "border-danger-200 bg-danger-50 text-danger-800 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200",
  warn: "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200",
};
function Banner({ tone, icon: Icon, title, children }: { tone: "danger" | "warn"; icon: typeof Activity; title: string; children: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-2xl border p-3", TONE_CLASS[tone])}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-xs leading-relaxed">
        <div className="font-extrabold">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
