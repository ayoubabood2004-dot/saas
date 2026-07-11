import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Plus, X, Pill, CalendarClock, Check, Activity, Stethoscope,
  AlertTriangle, ShieldAlert, Biohazard, Sparkles, ChevronLeft, ChevronRight, Crosshair,
  Droplets, ChevronDown, Camera, Loader2, ImageIcon, Search, Scale, Calculator, FileText, ClipboardList,
} from "lucide-react";
import { AnatomyMap, type AnatomyFocus } from "@/components/AnatomyMap";
import { SymptomPicker, type QualifierMap } from "@/components/SymptomPicker";
import { CbcPanel } from "@/components/CbcPanel";
import { summarizeDiagnoses, BODY_SYSTEMS, systemById, type Diagnosis } from "@/lib/diagnoses";
import {
  DISEASES, differentialFor, interactionsIn, diseasesForSystem, symptomById, symptomLabel, RED_FLAG_QUALIFIERS,
  type Disease, type Sp,
} from "@/lib/clinicalKnowledge";
import { CBC, cbcRange, cbcFlag, FLAG_ARROW } from "@/lib/cbc";
import { encodeClinical, type ClinicalRecord } from "@/lib/clinicalRecord";
import { Glyph } from "@/lib/clinicalIcons";
import { MED_CATALOG, getClinicMeds } from "@/lib/meds";
import type { Product } from "@/types";
import { repo } from "@/lib/repo";
import { prepareUpload } from "@/lib/image";
import { Button, useToast } from "@/components/ui";
import { formatNum, cn } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/** How often a treatment is given — drives the dose-count math. */
const FREQS: { id: string; label: string; short: string; perDay: number }[] = [
  { id: "1", label: "مرة يومياً", short: "×١", perDay: 1 },
  { id: "2", label: "مرتين يومياً", short: "×٢", perDay: 2 },
  { id: "3", label: "٣ مرات", short: "×٣", perDay: 3 },
  { id: "4", label: "٤ مرات", short: "×٤", perDay: 4 },
  { id: "prn", label: "عند اللزوم", short: "PRN", perDay: 0 },
];

interface PlanRow { id: string; name: string; dose: string; mgPerKg?: number; freq: string; days: number; note?: string }

const rid = () => Math.random().toString(36).slice(2);
const blankRow = (): PlanRow => ({ id: rid(), name: "", dose: "", freq: "2", days: 7 });
const dosesOf = (r: PlanRow) => {
  const per = FREQS.find((f) => f.id === r.freq)?.perDay ?? 0;
  return per > 0 ? per * Math.max(0, r.days) : 0;
};
/** Pull a "N mg/kg" rate out of a protocol dose string, if present. */
const parseMgKg = (dose: string): number | undefined => {
  const m = dose.match(/([\d.]+)\s*mg\s*\/\s*kg/i);
  return m ? Number(m[1]) : undefined;
};

/** The clinic's medicine name catalog (built-in + clinic-custom), same source as الطبلة. */
const allMeds = (): { name: string; type: string }[] => {
  const map = new Map<string, string>();
  for (const c of MED_CATALOG) if (c.type !== "Vaccines") for (const it of c.items) map.set(it, c.type);
  for (const m of getClinicMeds()) map.set(m.name, m.type);
  return Array.from(map, ([name, type]) => ({ name, type }));
};

type StepId = "anatomy" | "symptoms" | "diagnosis" | "treatment";
const STEPS: { id: StepId; label: string; icon: typeof Activity }[] = [
  { id: "anatomy", label: "التشريح", icon: Crosshair },
  { id: "symptoms", label: "الأعراض", icon: Activity },
  { id: "diagnosis", label: "التشخيص", icon: Stethoscope },
  { id: "treatment", label: "العلاج", icon: Pill },
];

/**
 * ClinicalConsole — the spacious diagnosis & treatment workspace.
 *
 * Four guided steps in a wide two-column layout (work area + live case-summary
 * rail), all composable into one tidy record entry:
 *   ① Anatomy   — pin the exact organ/bone on a species-correct body map.
 *   ② Symptoms  — the organised sign picker with qualifiers.
 *   ③ Diagnosis — a species-filtered differential + browse-by-system, plus the
 *                 vet's own clinical notes.
 *   ④ Treatment — drugs synced with the clinic (catalog + in-stock), a
 *                 weight-based dose calculator, and LIVE interaction warnings.
 * The final OUTCOME is captured later, when the visit is closed — not here.
 */
export function TreatmentPlan({
  onSubmit, busy, species, petId, weightKg, onMediaAdded,
}: {
  onSubmit: (body: string) => void | Promise<void>;
  busy?: boolean;
  species?: Sp;
  petId?: string;
  weightKg?: number | null;
  onMediaAdded?: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<StepId>("anatomy");
  const [focus, setFocus] = useState<AnatomyFocus | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [qualifiers, setQualifiers] = useState<QualifierMap>({});
  const [cbc, setCbc] = useState<Record<string, number>>({});
  const [cbcOpen, setCbcOpen] = useState(false);
  const [labPhoto, setLabPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([blankRow()]);
  const [weight, setWeight] = useState<number | undefined>(weightKg && weightKg > 0 ? weightKg : undefined);

  /* ---- In-stock clinic medicines (category=medicine, stock>0) — availability only, no deduction ---- */
  const [stockMeds, setStockMeds] = useState<Product[]>([]);
  useEffect(() => {
    let alive = true;
    repo.listProducts().then((ps) => {
      if (alive) setStockMeds(ps.filter((p) => p.category === "medicine" && p.stock > 0));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const stockFor = (name: string) => stockMeds.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

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

  /* ---- Descriptor (qualifier) helpers + red-flag detection ---- */
  const qualSummary = (id: string): string => {
    const q = qualifiers[id]; const sym = symptomById(id);
    if (!q || !sym?.qualifiers) return "";
    return sym.qualifiers.map((ax) => q[ax.id]).filter(Boolean).join("، ");
  };
  const qualifierRedFlags = useMemo(
    () => RED_FLAG_QUALIFIERS.filter((rf) => qualifiers[rf.symptomId]?.[rf.qualifierId] === rf.value),
    [qualifiers],
  );

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

  const zoonotic = pickedDiseases.filter((d) => d.zoonotic);
  const reportable = pickedDiseases.filter((d) => d.reportable);
  const redFlags = pickedDiseases.filter((d) => d.redFlag);

  /* ---- Treatment rows ---- */
  const setRow = (id: string, patch: Partial<PlanRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs.map((r) => (r.id === id ? blankRow() : r))));
  const addDrug = (name: string, seed?: Partial<PlanRow>) => {
    playTap();
    setRows((rs) => {
      if (name && rs.some((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())) return rs;
      const kept = rs.filter((r) => r.name.trim());
      return [...kept, { ...blankRow(), name, ...seed }];
    });
  };
  const applyProtocol = (d: Disease) => {
    if (!d.protocol?.length) return;
    playTap();
    const added: PlanRow[] = d.protocol.map((p) => {
      const mgkg = parseMgKg(p.dose);
      return { id: rid(), name: p.drug, dose: mgkg ? "" : p.dose, mgPerKg: mgkg, freq: p.freq, days: p.days, note: p.note };
    });
    setRows((rs) => {
      const kept = rs.filter((r) => r.name.trim());
      const fresh = added.filter((a) => !kept.some((r) => r.name.trim().toLowerCase() === a.name.trim().toLowerCase()));
      return [...kept, ...fresh];
    });
    setStep("treatment");
  };

  /** The effective dose text for a row — the weight calculation when available, else the manual dose. */
  const doseText = (r: PlanRow): string => {
    if (r.mgPerKg && weight) return `${formatNum(Math.round(r.mgPerKg * weight * 100) / 100)} mg`;
    return r.dose.trim();
  };

  const filledRows = rows.filter((r) => r.name.trim());
  const interactions = useMemo(() => interactionsIn(filledRows.map((r) => r.name)), [filledRows]);
  const cbcIds = Object.keys(cbc);

  const canSave = !busy && (!!focus || symptoms.length > 0 || cbcIds.length > 0 || !!labPhoto || diagnoses.length > 0 || filledRows.length > 0 || !!notes.trim());

  const compose = () => {
    const lines: string[] = [];
    if (focus) lines.push(`🧭 التركيز التشريحي: ${focus.structure ?? focus.region}${focus.latin ? ` (${focus.latin})` : ""}`);
    if (symptoms.length) {
      const parts = symptoms.map((id) => {
        const s = qualSummary(id);
        return s ? `${symptomLabel(id)} (${s})` : symptomLabel(id);
      });
      lines.push(`🔬 الأعراض: ${parts.join(" · ")}`);
    }
    for (const rf of qualifierRedFlags) lines.push(`❗ علامة حمراء — ${rf.warn}`);
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
    if (notes.trim()) lines.push(`✎ ملاحظات الطبيب: ${notes.trim()}`);
    if (filledRows.length) {
      lines.push(`💊 خطة العلاج${weight ? ` (الوزن ${formatNum(weight)} كغ)` : ""}:`);
      for (const r of filledRows) {
        const freq = FREQS.find((f) => f.id === r.freq)?.label ?? "";
        const doses = dosesOf(r);
        const dt = doseText(r);
        const parts = [
          r.name.trim(),
          dt || null,
          r.mgPerKg && weight ? `(${formatNum(r.mgPerKg)} mg/kg)` : null,
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
    return lines.join("\n");
  };

  /** Structured payload so the timeline can render this as an organised card. */
  const buildRecord = (): ClinicalRecord => ({
    v: 1,
    focus: focus ? { region: focus.region, structure: focus.structure, latin: focus.latin } : undefined,
    symptoms: symptoms.length ? symptoms : undefined,
    qualifiers: Object.keys(qualifiers).length ? qualifiers : undefined,
    cbc: cbcIds.length
      ? CBC.filter((p) => cbc[p.id] !== undefined).map((p) => ({ id: p.id, value: cbc[p.id], flag: cbcFlag(cbc[p.id], cbcRange(p, species)) }))
      : undefined,
    diagnoses: diagnoses.length ? diagnoses : undefined,
    redFlags: redFlags.length ? redFlags.map((d) => ({ name: d.name, note: d.redFlag! })) : undefined,
    zoonotic: zoonotic.length ? zoonotic.map((d) => d.name) : undefined,
    reportable: reportable.length ? reportable.map((d) => d.name) : undefined,
    pathogens: pickedDiseases.filter((d) => d.latin).map((d) => ({ name: d.name, latin: d.latin! })),
    treatment: filledRows.length
      ? filledRows.map((r) => ({ name: r.name.trim(), dose: doseText(r) || undefined, freq: FREQS.find((f) => f.id === r.freq)?.label ?? "", days: r.days, doses: dosesOf(r), note: r.note?.trim() || undefined }))
      : undefined,
    interactions: interactions.length ? interactions : undefined,
    notes: notes.trim() || undefined,
    weightKg: weight,
    hasPhoto: labPhoto ? true : undefined,
  });

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const go = (dir: -1 | 1) => { playTap(); const n = STEPS[stepIndex + dir]; if (n) setStep(n.id); };

  const done: Record<StepId, boolean> = {
    anatomy: !!focus,
    symptoms: symptoms.length > 0 || cbcIds.length > 0 || !!labPhoto,
    diagnosis: diagnoses.length > 0 || !!notes.trim(),
    treatment: filledRows.length > 0,
  };

  return (
    <div className="space-y-4">
      {/* Big step nav */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-1.5">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const Icon = s.icon;
          return (
            <button
              key={s.id} type="button"
              onClick={() => { playTap(); setStep(s.id); }}
              className={cn(
                "relative inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-bold transition",
                active ? "bg-brand-600 text-white shadow-card" : done[s.id] ? "text-success-700 hover:bg-surface-1 dark:text-success-300" : "text-ink-muted hover:bg-surface-1 hover:text-ink",
              )}
            >
              <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-extrabold", active ? "bg-white/25 text-white" : done[s.id] ? "bg-success-500 text-white" : "bg-ink-subtle/20 text-ink-subtle")}>
                {done[s.id] && !active ? "✓" : formatNum(i + 1)}
              </span>
              <Icon size={15} className="hidden sm:block" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Two-column: work area + live case-summary rail (rail shows on lg+) */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5">
        <div className="min-h-[320px]">
          {step === "anatomy" && (
            <section className="space-y-2">
              <StepTitle icon={Crosshair} title="حدّد المنطقة التشريحية" hint="اختياري — يربط الحالة بالعضو أو العظم بالاسم العلمي، حسب نوع الحيوان." />
              <AnatomyMap value={focus} onChange={setFocus} species={species} />
            </section>
          )}

          {step === "symptoms" && (
            <section className="space-y-3">
              <StepTitle icon={Activity} title="العلامات السريرية المُلاحَظة" hint="اختر قالب الشكوى أو تصفّح المجموعات — واضغط «وصف» لتفصيل العرض." />
              {qualifierRedFlags.length > 0 && (
                <div className="space-y-2">
                  {qualifierRedFlags.map((rf) => (
                    <Banner key={`${rf.symptomId}-${rf.qualifierId}`} tone="danger" icon={AlertTriangle} title={`علامة حمراء — ${symptomLabel(rf.symptomId)}`}>{rf.warn}</Banner>
                  ))}
                </div>
              )}
              <SymptomPicker
                value={symptoms} onChange={setSymptoms}
                qualifiers={qualifiers} onQualifiersChange={setQualifiers}
                differentialCount={differential.length}
                onShowDifferential={() => setStep("diagnosis")}
                focusSystem={focus?.system}
              />

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
                  {cbcIds.length > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-2xs font-bold text-white">{formatNum(cbcIds.length)}</span>}
                  <ChevronDown size={18} className={cn("shrink-0 text-ink-subtle transition-transform", cbcOpen && "rotate-180")} />
                </button>

                {cbcOpen && (
                  <div className="mt-3 space-y-3">
                    <CbcPanel species={species} value={cbc} onChange={setCbc} />
                    <div className="rounded-2xl border border-dashed border-line bg-surface-1 p-3">
                      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
                      {labPhoto ? (
                        <div className="flex items-center gap-3">
                          <img src={labPhoto} alt="صورة التحليل" className="h-16 w-16 rounded-xl border border-line object-cover" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-success-700 dark:text-success-300"><ImageIcon size={14} /> أُضيفت إلى المعرض</div>
                            <div className="text-2xs text-ink-subtle">صُنّفت كتحليل مخبري في صور الحالة</div>
                          </div>
                          <button type="button" onClick={() => { playTap(); fileRef.current?.click(); }} disabled={photoBusy} className="rounded-full border border-line px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300">تغيير</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { playTap(); fileRef.current?.click(); }} disabled={photoBusy || !petId}
                          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-500/10">
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
            <DiagnosisStep
              species={species} differential={differential} topScore={topScore}
              isDiseasePicked={isDiseasePicked} toggleDisease={toggleDisease} applyProtocol={applyProtocol}
              diagnoses={diagnoses} setDiagnoses={setDiagnoses}
              zoonotic={zoonotic} reportable={reportable} redFlags={redFlags}
              notes={notes} setNotes={setNotes}
            />
          )}

          {step === "treatment" && (
            <TreatmentStep
              rows={rows} setRow={setRow} removeRow={removeRow} addDrug={addDrug}
              weight={weight} setWeight={setWeight}
              stockMeds={stockMeds} stockFor={stockFor} interactions={interactions}
            />
          )}
        </div>

        {/* Live case-summary rail */}
        <aside className="mt-4 hidden lg:mt-0 lg:block">
          <CaseSummaryRail
            focus={focus} symptoms={symptoms} qualSummary={qualSummary} symptomLabel={symptomLabel}
            diagnoses={diagnoses} rows={filledRows} doseText={doseText} dosesOf={dosesOf}
            weight={weight} notes={notes} cbcCount={cbcIds.length}
          />
        </aside>
      </div>

      {/* Footer nav + save */}
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <button type="button" onClick={() => go(-1)} disabled={stepIndex === 0} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-30">
          <ChevronRight size={16} className="rtl:hidden" /><ChevronLeft size={16} className="ltr:hidden" /> السابق
        </button>
        {stepIndex < STEPS.length - 1 ? (
          <Button className="ms-auto" rightIcon={<ChevronLeft size={16} className="rtl:block ltr:hidden" />} onClick={() => go(1)}>التالي</Button>
        ) : (
          <Button className="ms-auto" leftIcon={<Check size={18} />} disabled={!canSave} loading={busy} onClick={() => onSubmit(encodeClinical(buildRecord(), compose()))}>
            حفظ التشخيص وخطة العلاج
          </Button>
        )}
      </div>
    </div>
  );
}

/* =============================== Diagnosis step ============================= */
function DiagnosisStep({
  species, differential, topScore, isDiseasePicked, toggleDisease, applyProtocol,
  diagnoses, setDiagnoses, zoonotic, reportable, redFlags, notes, setNotes,
}: {
  species?: Sp;
  differential: (Disease & { score: number; match: number })[];
  topScore: number;
  isDiseasePicked: (d: Disease) => boolean;
  toggleDisease: (d: Disease) => void;
  applyProtocol: (d: Disease) => void;
  diagnoses: Diagnosis[];
  setDiagnoses: (d: Diagnosis[]) => void;
  zoonotic: Disease[]; reportable: Disease[]; redFlags: Disease[];
  notes: string; setNotes: (s: string) => void;
}) {
  const [sys, setSys] = useState<string>(BODY_SYSTEMS[0]?.id ?? "digestive");
  const [q, setQ] = useState("");
  const sysDiseases = useMemo(() => diseasesForSystem(sys, species), [sys, species]);
  const manualForSys = diagnoses.filter((d) => d.system === sys && !DISEASES.some((x) => x.name === d.disease && x.system === d.system));
  const addManual = (name: string) => {
    const t = name.trim();
    if (!t || diagnoses.some((d) => d.disease === t && d.system === sys)) return;
    playTap();
    setDiagnoses([...diagnoses, { system: sys, disease: t, severity: "moderate" }]);
    setQ("");
  };

  return (
    <section className="space-y-4">
      <StepTitle icon={Stethoscope} title="التشخيص — حسب نوع الحيوان" hint="مرشّحات مبنية على الأعراض، أو تصفّح حسب الجهاز — الأمراض المعروضة تخص هذا النوع فقط." />

      {(zoonotic.length > 0 || reportable.length > 0 || redFlags.length > 0) && (
        <div className="space-y-2">
          {reportable.length > 0 && <Banner tone="danger" icon={ShieldAlert} title="مرض واجب التبليغ">{reportable.map((d) => d.name).join("، ")} — بلّغ الجهات الصحية فوراً.</Banner>}
          {zoonotic.length > 0 && <Banner tone="warn" icon={Biohazard} title="ينتقل للإنسان (Zoonotic)">{zoonotic.map((d) => d.name).join("، ")} — التزم إجراءات الحماية والنظافة.</Banner>}
          {redFlags.map((d) => <Banner key={d.id} tone="danger" icon={AlertTriangle} title={d.name}>{d.redFlag}</Banner>)}
        </div>
      )}

      {/* Differential candidates (species-filtered, symptom-ranked) */}
      {differential.length > 0 && (
        <div className="space-y-2">
          <div className="text-2xs font-bold uppercase tracking-wide text-ink-subtle">مرشّحات حسب الأعراض</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {differential.map((d) => (
              <DiseaseCard key={d.id} d={d} picked={isDiseasePicked(d)} onToggle={() => toggleDisease(d)} onApply={() => applyProtocol(d)} pct={Math.round((d.score / topScore) * 100)} />
            ))}
          </div>
        </div>
      )}

      {/* Browse by system — species-filtered */}
      <div className="border-t border-line pt-3">
        <div className="mb-2 text-2xs font-bold uppercase tracking-wide text-ink-subtle">تصفّح حسب الجهاز</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {BODY_SYSTEMS.map((s) => {
            const on = sys === s.id;
            return (
              <button key={s.id} type="button" onClick={() => { playTap(); setSys(s.id); setQ(""); }}
                className={cn("inline-flex items-center gap-1.5 rounded-full border py-1.5 pe-3 ps-1.5 text-xs font-bold transition", on ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>
                <Glyph name={s.id} size={20} /> {s.name}
              </button>
            );
          })}
        </div>

        {sysDiseases.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {sysDiseases.map((d) => (
              <DiseaseCard key={d.id} d={d} picked={isDiseasePicked(d)} onToggle={() => toggleDisease(d)} onApply={() => applyProtocol(d)} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-surface-1 p-3 text-center text-2xs text-ink-subtle">
            لا أمراض مسجّلة لهذا الجهاز في هذا النوع — اكتب تشخيصاً يدوياً بالأسفل.
          </div>
        )}

        {/* manual free-type chips already added under this system */}
        {manualForSys.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {manualForSys.map((d) => (
              <span key={d.disease} className="inline-flex items-center gap-1.5 rounded-full border border-brand-500 bg-brand-600 py-1 pe-2 ps-3 text-xs font-bold text-white">
                {d.disease}
                <button type="button" onClick={() => { playTap(); setDiagnoses(diagnoses.filter((x) => !(x.disease === d.disease && x.system === d.system))); }} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/20"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}

        {/* free-type */}
        <div className="relative mt-3">
          <Search size={15} className="pointer-events-none absolute inset-y-0 end-3 my-auto text-ink-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); addManual(q); } }}
            placeholder={`اكتب تشخيصاً في ${systemById(sys)?.name ?? "هذا الجهاز"}…`}
            className="input h-10 w-full pe-9 text-sm" />
        </div>
        {q.trim() && (
          <button type="button" onClick={() => addManual(q)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-400 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
            <Plus size={13} /> إضافة تشخيص «{q.trim()}»
          </button>
        )}
      </div>

      {/* Doctor notes */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-b from-brand-50/50 to-transparent p-3.5 dark:border-brand-500/25">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-brand-700 dark:text-brand-300"><FileText size={16} /> ملاحظات الطبيب السريرية</div>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظاتك، الفحص السريري، الخطة، ما تنتظره…" className="input min-h-[84px] w-full resize-y text-sm leading-relaxed" />
      </div>
    </section>
  );
}

function DiseaseCard({ d, picked, onToggle, onApply, pct }: { d: Disease & { match?: number }; picked: boolean; onToggle: () => void; onApply: () => void; pct?: number }) {
  return (
    <div className={cn("rounded-2xl border p-3 transition", picked ? "border-brand-500 bg-brand-50/70 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 text-start" aria-pressed={picked}>
        <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition", picked ? "border-brand-600 bg-brand-600 text-white" : "border-ink-subtle/40")}>
          {picked && <Check size={13} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-extrabold text-ink">{d.name}</span>
            {d.latin && <span className="text-2xs italic text-ink-subtle">{d.latin}</span>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {d.protocol?.length ? <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">✦ بروتوكول ({formatNum(d.protocol.length)})</span> : null}
            {d.zoonotic && <span className="rounded-md bg-warn-100 px-1.5 py-0.5 text-[10px] font-bold text-warn-700 dark:bg-warn-500/20 dark:text-warn-200">ينتقل للإنسان</span>}
            {d.reportable && <span className="rounded-md bg-danger-50 px-1.5 py-0.5 text-[10px] font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">تبليغ</span>}
            {d.redFlag && <span className="rounded-md bg-danger-50 px-1.5 py-0.5 text-[10px] font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">علامة حمراء</span>}
            {typeof pct === "number" && typeof d.match === "number" && (
              <span className="ms-auto inline-flex items-center gap-1 text-[10px] font-bold tabular-nums text-ink-subtle">
                <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></span>
              </span>
            )}
          </span>
        </span>
      </button>
      {d.protocol?.length ? (
        <button type="button" onClick={onApply} className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 bg-brand-50 px-2.5 py-1 text-2xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
          <Sparkles size={12} /> أضِف بروتوكول العلاج
        </button>
      ) : null}
    </div>
  );
}

/* =============================== Treatment step ============================ */
function TreatmentStep({
  rows, setRow, removeRow, addDrug, weight, setWeight, stockMeds, stockFor, interactions,
}: {
  rows: PlanRow[];
  setRow: (id: string, patch: Partial<PlanRow>) => void;
  removeRow: (id: string) => void;
  addDrug: (name: string, seed?: Partial<PlanRow>) => void;
  weight?: number; setWeight: (n: number | undefined) => void;
  stockMeds: Product[];
  stockFor: (name: string) => Product | undefined;
  interactions: { a: string; b: string; severity: "major" | "moderate"; note: string }[];
}) {
  const [q, setQ] = useState("");
  const meds = useMemo(() => allMeds(), []);
  const matches = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return [];
    return meds.filter((m) => m.name.toLowerCase().includes(ql)).slice(0, 8);
  }, [q, meds]);

  return (
    <section className="space-y-3">
      <StepTitle icon={CalendarClock} title="خطة العلاج — متزامنة مع أدوية العيادة" hint="اختر من المتوفّر بالمخزون، أو ابحث بالكتالوج — الجرعة تُحسب من وزن الحيوان تلقائياً." />

      {/* Live drug-interaction warnings */}
      {interactions.length > 0 && (
        <div className="space-y-2">
          {interactions.map((it, i) => (
            <Banner key={i} tone={it.severity === "major" ? "danger" : "warn"} icon={AlertTriangle} title={`تداخل دوائي — ${it.a} + ${it.b}`}>{it.note}</Banner>
          ))}
        </div>
      )}

      {/* Weight (drives the dose calculator) */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/30 dark:bg-violet-500/10">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300"><Scale size={17} /></span>
        <label className="flex items-center gap-2 text-sm font-bold text-ink">
          وزن الحيوان
          <input type="number" min={0} step="0.1" inputMode="decimal" value={weight === undefined ? "" : String(weight)}
            onChange={(e) => { const v = Number(e.target.value); setWeight(e.target.value === "" || Number.isNaN(v) || v <= 0 ? undefined : v); }}
            className="input h-9 w-24 px-2 py-0 text-center text-base font-extrabold tabular-nums" placeholder="—" />
          كغ
        </label>
        <span className="text-2xs text-ink-subtle">{weight ? "تُحسب الجرعات تلقائياً بالوزن" : "أدخل الوزن لحساب الجرعات تلقائياً"}</span>
      </div>

      {/* In-stock quick picks */}
      {stockMeds.length > 0 && (
        <div className="rounded-2xl border border-success-100 bg-success-50 p-3 dark:border-success-500/25 dark:bg-success-500/10">
          <div className="mb-2 flex items-center gap-1.5 text-2xs font-extrabold text-success-700 dark:text-success-300"><Check size={13} /> متوفّر بمخزون العيادة — اضغط للإضافة</div>
          <div className="flex flex-wrap gap-1.5">
            {stockMeds.slice(0, 16).map((p) => (
              <button key={p.id} type="button" onClick={() => addDrug(p.name)}
                className="inline-flex items-center gap-1.5 rounded-full border border-success-200 bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink transition hover:border-success-400 dark:border-success-500/30">
                {p.name}
                <span className="rounded-full bg-success-100 px-1.5 py-0.5 text-[10px] font-extrabold text-success-700 dark:bg-success-500/20 dark:text-success-300">{formatNum(p.stock)} متوفّر</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Catalog search */}
      <div>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute inset-y-0 end-3 my-auto text-ink-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في كتالوج الأدوية… (مضادات حيوية، مسكّنات، سوائل…)" className="input h-11 w-full pe-9 text-sm" />
        </div>
        {q.trim() && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-line">
            {matches.length > 0 ? matches.map((m) => {
              const stk = stockFor(m.name);
              return (
                <button key={m.name} type="button" onClick={() => { addDrug(m.name); setQ(""); }}
                  className="flex w-full items-center gap-2 border-b border-line bg-surface-1 px-3 py-2.5 text-start transition last:border-b-0 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                  <Pill size={15} className="shrink-0 text-brand-600" />
                  <span className="flex-1 text-sm font-bold text-ink">{m.name}</span>
                  {stk ? <span className="rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">✓ متوفّر</span> : null}
                  <span className="text-2xs text-ink-subtle">{m.type}</span>
                </button>
              );
            }) : (
              <button type="button" onClick={() => { addDrug(q.trim()); setQ(""); }} className="flex w-full items-center gap-2 bg-surface-1 px-3 py-2.5 text-start hover:bg-brand-50 dark:hover:bg-brand-500/10">
                <Plus size={15} className="text-brand-600" /> <span className="text-sm font-bold text-brand-700 dark:text-brand-300">إضافة «{q.trim()}»</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drug rows */}
      <div className="space-y-2.5">
        {rows.map((r) => {
          const doses = dosesOf(r);
          const stk = r.name.trim() ? stockFor(r.name) : undefined;
          const computed = r.mgPerKg && weight ? Math.round(r.mgPerKg * weight * 100) / 100 : undefined;
          return (
            <div key={r.id} className="rounded-2xl border border-line bg-surface-1 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Pill size={16} /></span>
                <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} placeholder="اسم الدواء / العلاج" className="input h-9 flex-1 py-0 text-sm font-semibold" />
                {stk && <span className="hidden shrink-0 rounded-lg bg-success-50 px-2 py-1 text-[10px] font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300 sm:inline">✓ من المخزون · {formatNum(stk.stock)}</span>}
                <button type="button" onClick={() => removeRow(r.id)} aria-label="إزالة" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><X size={15} /></button>
              </div>

              {/* Dose: weight calculator + manual */}
              <div className="mt-2.5 rounded-xl border border-violet-100 bg-violet-50/60 p-2.5 dark:border-violet-500/20 dark:bg-violet-500/5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                  <span className="inline-flex items-center gap-1 text-2xs font-extrabold text-violet-600 dark:text-violet-300"><Calculator size={13} /> الجرعة</span>
                  <input type="number" min={0} step="0.05" inputMode="decimal" value={r.mgPerKg === undefined ? "" : String(r.mgPerKg)}
                    onChange={(e) => { const v = Number(e.target.value); setRow(r.id, { mgPerKg: e.target.value === "" || Number.isNaN(v) || v <= 0 ? undefined : v }); }}
                    className="input h-8 w-16 px-1.5 py-0 text-center text-sm font-bold tabular-nums" placeholder="mg/kg" />
                  <span className="text-2xs font-bold text-ink-subtle">mg/kg</span>
                  {computed !== undefined ? (
                    <>
                      <span className="font-black text-violet-500">× {formatNum(weight!)} كغ =</span>
                      <span className="rounded-lg bg-violet-600 px-2.5 py-1 text-sm font-extrabold text-white">{formatNum(computed)} mg</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xs text-ink-subtle">أو</span>
                      <input value={r.dose} onChange={(e) => setRow(r.id, { dose: e.target.value })} placeholder="جرعة يدوية (مثال: قطرة)" className="input h-8 flex-1 min-w-[120px] px-2 py-0 text-sm" />
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5">
                  {FREQS.map((f) => (
                    <button key={f.id} type="button" onClick={() => { playTap(); setRow(r.id, { freq: f.id }); }}
                      className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", r.freq === f.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>{f.label}</button>
                  ))}
                </div>
                {r.freq !== "prn" && (
                  <label className="inline-flex items-center gap-1.5 text-2xs font-semibold text-ink-muted">
                    المدة
                    <input type="number" min={1} max={365} inputMode="numeric" value={r.days === 0 ? "" : String(r.days)} onChange={(e) => setRow(r.id, { days: Math.max(0, Number(e.target.value) || 0) })} className="input h-8 w-16 px-2 py-0 text-center text-sm font-bold tabular-nums" />
                    يوم
                  </label>
                )}
                {doses > 0 && <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">{formatNum(doses)} جرعة</span>}
              </div>
              {r.note?.trim() && <div className="mt-2 text-2xs text-ink-subtle">📝 {r.note}</div>}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => addDrug("")} className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
        <Plus size={14} /> إضافة دواء / علاج يدوياً
      </button>
    </section>
  );
}

/* ============================= Live case summary ========================== */
function CaseSummaryRail({
  focus, symptoms, qualSummary, symptomLabel, diagnoses, rows, doseText, dosesOf, weight, notes, cbcCount,
}: {
  focus: AnatomyFocus | null;
  symptoms: string[]; qualSummary: (id: string) => string; symptomLabel: (id: string) => string;
  diagnoses: Diagnosis[]; rows: PlanRow[]; doseText: (r: PlanRow) => string; dosesOf: (r: PlanRow) => number;
  weight?: number; notes: string; cbcCount: number;
}) {
  const totalDoses = rows.reduce((s, r) => s + dosesOf(r), 0);
  const empty = !focus && !symptoms.length && !diagnoses.length && !rows.length && !notes.trim() && !cbcCount;
  return (
    <div className="sticky top-3 space-y-3.5 rounded-2xl border border-line bg-surface-2 p-4">
      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-brand-700 dark:text-brand-300"><ClipboardList size={15} /> ملخّص الحالة</h3>
      {empty ? (
        <p className="text-2xs leading-relaxed text-ink-subtle">تُجمَّع الحالة هنا وأنت تعمل — التركيز، الأعراض، التشخيص، والخطة.</p>
      ) : (
        <>
          {focus && <RailItem label="التركيز التشريحي"><span className="font-bold">{focus.structure ?? focus.region}</span>{focus.latin && <span className="text-ink-subtle"> · <i>{focus.latin}</i></span>}</RailItem>}
          {symptoms.length > 0 && (
            <RailItem label={`الأعراض (${formatNum(symptoms.length)})`}>
              <span className="flex flex-wrap gap-1">
                {symptoms.map((id) => { const s = qualSummary(id); return <span key={id} className="rounded-md border border-line bg-surface-1 px-1.5 py-0.5 text-2xs font-bold">{symptomLabel(id)}{s && <span className="font-semibold text-brand-600 dark:text-brand-300"> · {s}</span>}</span>; })}
              </span>
            </RailItem>
          )}
          {cbcCount > 0 && <RailItem label="تحليل الدم"><span className="font-bold">CBC · {formatNum(cbcCount)} قيمة</span></RailItem>}
          {diagnoses.length > 0 && <RailItem label="التشخيص"><span className="font-bold text-brand-700 dark:text-brand-300">{diagnoses.map((d) => d.disease).join("، ")}</span></RailItem>}
          {notes.trim() && <RailItem label="ملاحظات الطبيب"><span className="line-clamp-2 text-ink-muted">{notes.trim()}</span></RailItem>}
          {rows.length > 0 && (
            <RailItem label={`خطة العلاج (${formatNum(rows.length)})`}>
              <span className="block space-y-0.5">
                {rows.map((r) => <span key={r.id} className="block text-2xs font-semibold">• {r.name.trim()} {doseText(r) && <span className="text-brand-600 dark:text-brand-300">{doseText(r)}</span>}</span>)}
                {totalDoses > 0 && <span className="block pt-0.5 text-2xs font-bold text-success-700 dark:text-success-300">الإجمالي: {formatNum(totalDoses)} جرعة</span>}
              </span>
            </RailItem>
          )}
          {weight && <RailItem label="وزن الحيوان"><span className="text-lg font-black text-violet-600 dark:text-violet-300">{formatNum(weight)}</span> <span className="text-2xs text-ink-subtle">كغ · مصدر حساب الجرعات</span></RailItem>}
        </>
      )}
    </div>
  );
}

function RailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="text-xs leading-relaxed text-ink">{children}</div>
    </div>
  );
}

/* ------------------------------ Small helpers ----------------------------- */
function StepTitle({ icon: Icon, title, hint }: { icon: typeof Activity; title: string; hint: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-base font-extrabold text-ink">
        <Icon size={18} className="text-brand-600" /> {title}
      </div>
      <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>
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
