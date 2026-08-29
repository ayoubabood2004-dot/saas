import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Plus, X, Pill, CalendarClock, Check, Activity, Stethoscope,
  AlertTriangle, ShieldAlert, Biohazard, Sparkles, ChevronLeft, ChevronRight, Crosshair,
  Droplets, Camera, Loader2, ImageIcon, Search, Scale, FileText, ClipboardList, ScanLine, Pencil,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnatomyMap, type AnatomyFocus } from "@/components/AnatomyMap";
import { SymptomPicker, type QualifierMap } from "@/components/SymptomPicker";
import { CbcPanel } from "@/components/CbcPanel";
import { summarizeDiagnoses, BODY_SYSTEMS, systemById, type Diagnosis } from "@/lib/diagnoses";
import {
  DISEASES, differentialFor, interactionsIn, diseasesForSystem, symptomById, symptomLabel, RED_FLAG_QUALIFIERS,
  type Disease, type Sp,
} from "@/lib/clinicalKnowledge";
import { CBC, cbcRange, cbcFlag, FLAG_ARROW } from "@/lib/cbc";
import { readLabImage } from "@/lib/labOcr";
import { encodeClinical, type ClinicalRecord } from "@/lib/clinicalRecord";
import { Glyph } from "@/lib/clinicalIcons";
import { getActiveClinicId } from "@/lib/clinics";
import { DrugPickerSheet } from "@/components/treatment/DrugPickerSheet";
import { NumberPadSheet } from "@/components/treatment/NumberPadSheet";
import { WeightGate } from "@/components/treatment/WeightGate";
import { DrugCard } from "@/components/treatment/DrugCard";
import { DoseAlertRow, APP_ROUTE_BACK } from "@/components/DoseBlock";
import { matchMonograph, checkSafety, calcDose, appFreqHours, doseFor, freqIdFor, APP_ROUTE, type DoseAlert } from "@/lib/vetFormulary";
import type { Product } from "@/types";
import type { ChartFlags } from "@/lib/problems";
import { repo } from "@/lib/repo";
import { prepareUpload } from "@/lib/image";
import { Button, useToast } from "@/components/ui";
import { formatNum, normalizeAr, cn, formatDec } from "@/lib/utils";
import { playTap, playSuccess, playWarning, playStepDone } from "@/lib/sounds";

/** How often a treatment is given — drives the dose-count math.
 *  `label` is the canonical Arabic (kept for the persisted record text);
 *  `key` is the i18n key used at render sites via t(key, label). */
const FREQS: { id: string; key: string; label: string; short: string; perDay: number }[] = [
  { id: "1", key: "tplan.freqDaily1", label: "مرة يومياً", short: "×١", perDay: 1 },
  { id: "2", key: "tplan.freqDaily2", label: "مرتين يومياً", short: "×٢", perDay: 2 },
  { id: "3", key: "tplan.freqDaily3", label: "٣ مرات", short: "×٣", perDay: 3 },
  { id: "4", key: "tplan.freqDaily4", label: "٤ مرات", short: "×٤", perDay: 4 },
  { id: "prn", key: "tplan.freqPrn", label: "عند اللزوم", short: "PRN", perDay: 0 },
];

/** Route of administration — how the drug is given. Same key/label split as FREQS. */
const ROUTES: { id: string; key: string; label: string }[] = [
  { id: "oral", key: "tplan.routeOral", label: "فموي" },
  { id: "sc", key: "tplan.routeSc", label: "تحت الجلد" },
  { id: "im", key: "tplan.routeIm", label: "عضلي" },
  { id: "iv", key: "tplan.routeIv", label: "وريدي" },
  { id: "topical", key: "tplan.routeTopical", label: "موضعي" },
  { id: "eye_ear", key: "tplan.routeEyeEar", label: "عين / أذن" },
];
const routeLabel = (id?: string) => ROUTES.find((x) => x.id === id)?.label;

interface PlanRow {
  id: string; name: string; dose: string; mgPerKg?: number; freq: string; days: number;
  note?: string; route?: string; doseMode?: "weight" | "manual";
  /** Vial concentration (mg/ml) or tablet strength (mg/tab) — drives the volume math. */
  strength?: number; solid?: boolean;
  /** \u0639\u0627\u0631\u064e \u0627\u0644\u0639\u0628\u0648\u0629 \u0623\u0643\u0651\u062f\u0647 \u0627\u0644\u0637\u0628\u064a\u0628 \u0628\u0639\u064a\u0646\u0647. \u0648\u0627\u062d\u062f\u064c \u0648\u062b\u0644\u0627\u062b\u0648\u0646 \u0645\u0646 \u062b\u0645\u0627\u0646\u064d \u0648\u062e\u0645\u0633\u064a\u0646
   *  \u062f\u0648\u0627\u0621\u064b \u0628\u0627\u0644\u062f\u0644\u064a\u0644 \u0644\u0647 \u0623\u0643\u062b\u0631 \u0645\u0646 \u0639\u064a\u0627\u0631\u064d \u0628\u0627\u0644\u0633\u0648\u0642 (\u0623\u0645\u0648\u0643\u0633\u064a-\u0643\u0644\u0627\u0641 \u0665\u0660/\u0661\u0664\u0660/\u0662\u0665\u0660 \u2014 \u0641\u0631\u0642\u064c
   *  \u062e\u0645\u0633\u0629 \u0623\u0636\u0639\u0627\u0641)\u060c \u0648\u0627\u0644\u0628\u0630\u0631\u0629 \u062a\u0623\u062e\u0630 \u0627\u0644\u0623\u0648\u0644 \u0628\u0644\u0627 \u0625\u0634\u0627\u0631\u0629 \u2014 \u0648\u0627\u0644\u0645\u0644ّ \u0627\u0644\u0645\u062d\u0633\u0648\u0628 \u0645\u0646\u0647
   *  \u064a\u0638\u0647\u0631 \u0628\u0623\u0643\u0628\u0631 \u062e\u0637\u0651 \u0628\u0627\u0644\u0628\u0637\u0627\u0642\u0629. \u0641\u0645\u0627 \u0644\u0645 \u064a\u064f\u0624\u0643\u0651\u062f\u060c \u064a\u064f\u0639\u0631\u0636 \u0628\u0644\u0648\u0646 \u0627\u0644\u062a\u062d\u0630\u064a\u0631. \u062d\u0642\u0644\u064f \u0648\u0627\u062c\u0647\u0629\u064d
   *  \u0628\u062d\u062a: \u0644\u0627 \u064a\u064f\u062d\u0641\u0638 \u0645\u0639 \u0627\u0644\u0632\u064a\u0627\u0631\u0629 \u0648\u0644\u0627 \u064a\u062f\u062e\u0644 compose(). */
  strengthConfirmed?: boolean;
}

/* \u0639\u064a\u0627\u0631\u064c \u0623\u0643\u0651\u062f\u0647 \u0627\u0644\u0637\u0628\u064a\u0628 \u0645\u0631\u0651\u0629 \u064a\u0635\u064a\u0631 \u0627\u0641\u062a\u0631\u0627\u0636\u064e \u0639\u064a\u0627\u062f\u062a\u0647 \u2014 \u0641\u0627\u0644\u0631\u0641\u0651 \u0644\u0627 \u064a\u062a\u063a\u064a\u0651\u0631 \u0643\u0644 \u064a\u0648\u0645. */
const STRENGTH_PREF_KEY = () => `vp_strength_pref_${getActiveClinicId()}`;
const strengthPrefs = (): Record<string, number> => {
  try { const v = JSON.parse(localStorage.getItem(STRENGTH_PREF_KEY()) || "{}"); return v && typeof v === "object" ? v : {}; }
  catch { return {}; }
};
export const rememberStrength = (drugId: string, mg: number) => {
  try { localStorage.setItem(STRENGTH_PREF_KEY(), JSON.stringify({ ...strengthPrefs(), [drugId]: mg })); }
  catch { /* private mode \u2014 \u0627\u0644\u062a\u0641\u0636\u064a\u0644 \u0631\u0641\u0627\u0647\u064a\u0629 \u0644\u0627 \u0634\u0631\u0637 */ }
};

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

/**
 * Everything the formulary already knows about a drug, as row defaults: the
 * species-typical mg/kg, its frequency, first documented route, and the market
 * strength. Applied the moment a drug is ADDED — the human-test run showed a
 * catalog drug otherwise ships doseless to the nurse board unless the doctor
 * notices the tiny «استعمل الجرعة المعتادة» pill.
 */
const formularySeed = (name: string, species?: Sp): Partial<PlanRow> => {
  const drug = matchMonograph(name);
  if (!drug) return {};
  const win = species ? doseFor(drug, species) : undefined;
  /* \u0627\u0644\u0639\u064a\u0627\u0631 \u0627\u0644\u0645\u062e\u0632\u0651\u0646 \u064a\u0633\u0628\u0642 strengths[0]: \u0627\u0644\u0623\u0648\u0644 \u062a\u062e\u0645\u064a\u0646\u064c\u060c \u0648\u0627\u0644\u0645\u062e\u0632\u0651\u0646 \u0642\u0631\u0627\u0631\u064c
   * \u0633\u0627\u0628\u0642 \u0644\u0644\u0637\u0628\u064a\u0628. \u0648\u0645\u0627 \u0644\u0647 \u0639\u064a\u0627\u0631\u064c \u0648\u0627\u062d\u062f \u0645\u0624\u0643\u0651\u062f\u064c \u0628\u0637\u0628\u064a\u0639\u062a\u0647 \u2014 \u0645\u0627 \u0641\u064a\u0647 \u0645\u0627 \u064a\u064f\u062e\u062a\u0627\u0631. */
  const pref = strengthPrefs()[drug.id];
  const picked = pref ?? drug.strengths?.[0];
  const confirmed = pref !== undefined || (drug.strengths?.length ?? 0) === 1;
  return {
    strength: picked,
    strengthConfirmed: picked === undefined ? undefined : confirmed,
    solid: drug.solid || undefined,
    ...(win
      ? { doseMode: "weight" as const, mgPerKg: win.typical, freq: freqIdFor(win.freq), route: APP_ROUTE_BACK[win.routes[0]] }
      : {}),
  };
};

/* ---- The doctor's own habit: last-used drugs, newest first (per device) ---- */
const RECENT_DRUGS_KEY = "vp_recent_drugs";
const recentDrugs = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(RECENT_DRUGS_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
};
const pushRecentDrug = (name: string) => {
  const t = name.trim();
  if (!t) return;
  try {
    const list = [t, ...recentDrugs().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 10);
    localStorage.setItem(RECENT_DRUGS_KEY, JSON.stringify(list));
  } catch { /* private mode — the habit list is a bonus, never a blocker */ }
};


type StepId = "anatomy" | "symptoms" | "labs" | "diagnosis" | "treatment";
const STEPS: { id: StepId; key: string; label: string; icon: typeof Activity }[] = [
  { id: "anatomy", key: "tplan.stepAnatomy", label: "التشريح", icon: Crosshair },
  { id: "symptoms", key: "tplan.stepSymptoms", label: "الأعراض", icon: Activity },
  { id: "labs", key: "tplan.stepLabs", label: "التحاليل", icon: Droplets },
  { id: "diagnosis", key: "tplan.stepDiagnosis", label: "التشخيص", icon: Stethoscope },
  { id: "treatment", key: "tplan.stepTreatment", label: "العلاج", icon: Pill },
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
  onSubmit, busy, species, petId, weightKg, allergies, flags, onMediaAdded, onDirtyChange,
}: {
  onSubmit: (body: string) => void | Promise<void>;
  busy?: boolean;
  species?: Sp;
  petId?: string;
  weightKg?: number | null;
  /** Free-text allergies on the chart — a recorded allergy blocks the drug. */
  allergies?: string[];
  /** Prescribing flags from the live problem list — renal/hepatic/pregnant. */
  flags?: ChartFlags;
  onMediaAdded?: () => void;
  /** Fires with true while un-saved selections exist — parents guard their close. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [step, setStep] = useState<StepId>("anatomy");
  const [focus, setFocus] = useState<AnatomyFocus | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [qualifiers, setQualifiers] = useState<QualifierMap>({});
  const [cbc, setCbc] = useState<Record<string, number>>({});
  const [labPhoto, setLabPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrCount, setOcrCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [notes, setNotes] = useState("");
  // \u062a\u0628\u062f\u0623 \u0641\u0627\u0631\u063a\u0629: \u0635\u0641\u0651\u064c \u0628\u0644\u0627 \u0627\u0633\u0645\u064d \u0644\u064a\u0633 \u0648\u0635\u0641\u0629\u064b\u060c \u0648\u0625\u0646\u0645\u0627 \u0646\u0645\u0648\u0630\u062c\u064c \u064a\u0637\u0644\u0628 \u0627\u0644\u0643\u062a\u0627\u0628\u0629.
  const [rows, setRows] = useState<PlanRow[]>([]);
  /** Plan-wide course length — set once at the top, applied to every drug row.
   *  A row can still be overridden individually for the odd exception. */
  const [planDays, setPlanDays] = useState(7);
  const setAllDays = (d: number) => {
    setPlanDays(d);
    setRows((rs) => rs.map((r) => ({ ...r, days: d })));
  };
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
    if (!petId) { toast.error(t("tplan.attachFail", "تعذّر إرفاق الصورة")); return; }
    setPhotoBusy(true);
    try {
      const prepared = await prepareUpload(file, { maxDim: 2400 });
      await repo.uploadMedia(petId, prepared, "lab", "تحليل CBC");
      setLabPhoto(prepared.dataUrl);
      playSuccess();
      toast.success(t("tplan.photoAdded", "أُضيفت صورة التحليل إلى المعرض"));
      onMediaAdded?.();
      void runOcr(prepared.dataUrl); // read the values off the slip (best-effort)
    } catch (err) {
      playWarning();
      toast.error(t("tplan.uploadFail", "تعذّر رفع الصورة"), err instanceof Error ? err.message : undefined);
    } finally {
      setPhotoBusy(false);
    }
  };

  /** Read the lab photo in-browser and pre-fill the CBC sliders (doctor reviews). */
  const runOcr = async (src: string) => {
    setOcrBusy(true); setOcrCount(null);
    try {
      const { values } = await readLabImage(src);
      const n = Object.keys(values).length;
      setOcrCount(n);
      if (n > 0) {
        setCbc((prev) => ({ ...prev, ...values })); // OCR fills/overrides matched values
        playSuccess();
        toast.success(t("tplan.ocrToast", { n: formatNum(n), defaultValue: "تمّت قراءة {{n}} قيمة من التحليل — راجعها قبل الحفظ" }));
      }
    } catch {
      setOcrCount(0);
    } finally {
      setOcrBusy(false);
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
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addDrug = (name: string, seed?: Partial<PlanRow>) => {
    playTap();
    if (name.trim()) pushRecentDrug(name);
    setRows((rs) => {
      if (name && rs.some((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())) return rs;
      const kept = rs.filter((r) => r.name.trim());
      // The formulary fills the row before the doctor ever opens it: typical
      // mg/kg, frequency, route and strength — editing beats typing.
      return [...kept, { ...blankRow(), days: planDays, ...formularySeed(name, species), name, ...seed }];
    });
  };
  const applyProtocol = (d: Disease) => {
    if (!d.protocol?.length) return;
    playTap();
    const added: PlanRow[] = d.protocol.map((p) => {
      const mgkg = parseMgKg(p.dose);
      const seed = formularySeed(p.drug, species);
      return {
        id: rid(), name: p.drug, dose: mgkg ? "" : p.dose, mgPerKg: mgkg,
        doseMode: (mgkg ? "weight" : "manual") as "weight" | "manual",
        freq: p.freq, days: p.days, note: p.note,
        // The protocol says what and how much; the monograph completes how —
        // route and vial strength — so the ml volume appears with zero extra taps.
        route: seed.route, strength: seed.strength, solid: seed.solid,
      };
    });
    setRows((rs) => {
      const kept = rs.filter((r) => r.name.trim());
      const fresh = added.filter((a) => !kept.some((r) => r.name.trim().toLowerCase() === a.name.trim().toLowerCase()));
      return [...kept, ...fresh];
    });
    setStep("treatment");
  };

  /**
   * The effective dose text for a row. When the vial concentration is known this
   * is what the vet actually draws — "1.4 مل (35 mg)" — not just the milligrams.
   */
  const doseText = (r: PlanRow): string => {
    if (r.mgPerKg && weight) {
      const c = calcDose({
        mgPerKg: r.mgPerKg, weightKg: weight, strength: r.strength,
        solid: r.solid ?? matchMonograph(r.name)?.solid, freq: appFreqHours(r.freq),
      });
      const mg = `${formatNum(Math.round(c.mg * 100) / 100)} mg`;
      if (c.mlRounded) return `${formatNum(c.mlRounded)} مل (${mg})`;
      if (c.tabletsLabel && c.tablets) return `${c.tabletsLabel} (${mg})`;
      return mg;
    }
    return r.dose.trim();
  };

  const filledRows = rows.filter((r) => r.name.trim());
  const interactions = useMemo(() => interactionsIn(filledRows.map((r) => r.name)), [filledRows]);

  /**
   * Live drug-safety pass over the whole plan: species bans, over/under dosing,
   * daily ceilings, duplicate therapy and dangerous class pairs. Only the
   * actionable tones surface at plan level — the informational monograph notes
   * stay inside each drug's own card.
   */
  const safety = useMemo(() => {
    if (!species) return [] as { name: string; alerts: DoseAlert[] }[];
    const out: { name: string; alerts: DoseAlert[] }[] = [];
    for (const r of filledRows) {
      const drug = matchMonograph(r.name);
      if (!drug) continue;
      const others = filledRows
        .filter((x) => x.id !== r.id)
        .map((x) => matchMonograph(x.name)?.id)
        .filter((x): x is string => !!x);
      const alerts = checkSafety({
        drug, species, weightKg: weight, mgPerKg: r.mgPerKg ?? 0,
        route: r.route ? APP_ROUTE[r.route] : undefined,
        freq: appFreqHours(r.freq),
        allergies,
        flags,
        concurrent: others,
      }).filter((a) => a.tone === "critical" || a.tone === "warn");
      if (alerts.length) out.push({ name: r.name.trim(), alerts });
    }
    return out;
  }, [filledRows, species, weight, allergies, flags]);
  const cbcIds = Object.keys(cbc);

  const hasContent = !!focus || symptoms.length > 0 || cbcIds.length > 0 || !!labPhoto || diagnoses.length > 0 || filledRows.length > 0 || !!notes.trim();
  const canSave = !busy && hasContent;

  // The parent's close guard: unsaved work should not vanish on a stray Escape.
  useEffect(() => { onDirtyChange?.(hasContent); }, [hasContent, onDirtyChange]);

  /* ---- Doseless guard: a drug with no resolvable dose must not slip silently
     onto the nurse board as «أعطِ أموكسيسيلين — بدون كمية». First save click
     warns and names the drugs; a second click saves deliberately. ---- */
  const doseless = filledRows.filter((r) => !doseText(r));
  const [doselessAck, setDoselessAck] = useState(false);
  useEffect(() => { setDoselessAck(false); }, [doseless.length]);

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
      lines.push(`💊 خطة العلاج${weight ? ` (الوزن ${formatDec(weight)} كغ)` : ""}:`);
      for (const r of filledRows) {
        const freq = FREQS.find((f) => f.id === r.freq)?.label ?? "";
        const doses = dosesOf(r);
        const dt = doseText(r);
        const parts = [
          r.name.trim(),
          dt || null,
          r.mgPerKg && weight ? `(${formatDec(r.mgPerKg)} mg/kg)` : null,
          routeLabel(r.route) || null,
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
    if (safety.length) {
      lines.push("🛡️ فحص الأمان الدوائي:");
      for (const s of safety) {
        for (const a of s.alerts) {
          lines.push(`• ${s.name} — ${a.tone === "critical" ? "⛔" : "⚠️"} ${a.title}${a.detail ? `: ${a.detail}` : ""}`);
        }
      }
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
      ? filledRows.map((r) => ({ name: r.name.trim(), dose: doseText(r) || undefined, freq: FREQS.find((f) => f.id === r.freq)?.label ?? "", days: r.days, doses: dosesOf(r), note: [routeLabel(r.route), r.note?.trim()].filter(Boolean).join(" · ") || undefined }))
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
    symptoms: symptoms.length > 0,
    labs: cbcIds.length > 0 || !!labPhoto,
    diagnosis: diagnoses.length > 0 || !!notes.trim(),
    treatment: filledRows.length > 0,
  };
  const doneCount = STEPS.filter((s) => done[s.id]).length;

  /** What each step already holds — the tab wears its count like a quest tracker. */
  const stepCount: Record<StepId, number> = {
    anatomy: focus ? 1 : 0,
    symptoms: symptoms.length,
    labs: cbcIds.length + (labPhoto ? 1 : 0),
    diagnosis: diagnoses.length,
    treatment: filledRows.length,
  };

  // A step flipping to «done» earns one soft note, pitched by position — filling
  // the wizard literally plays a rising scale. Never re-fires on edits.
  const prevDone = useRef(done);
  useEffect(() => {
    STEPS.forEach((s, i) => { if (done[s.id] && !prevDone.current[s.id]) playStepDone(i); });
    prevDone.current = done;
  });

  const trySave = () => {
    if (!canSave) return;
    if (doseless.length > 0 && !doselessAck) { playWarning(); setDoselessAck(true); return; }
    void onSubmit(encodeClinical(buildRecord(), compose()));
  };

  // Ctrl/Cmd+Enter anywhere = التالي (or حفظ on the last step) — hands stay put.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (stepIndex < STEPS.length - 1) go(1);
        else trySave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

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
              <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-extrabold", active ? "bg-white/25 text-white" : done[s.id] ? "animate-scale-in bg-success-500 text-white" : "bg-ink-subtle/20 text-ink-subtle")}>
                {done[s.id] && !active ? "✓" : formatNum(i + 1)}
              </span>
              <Icon size={15} className="hidden sm:block" />
              {t(s.key, s.label)}
              {stepCount[s.id] > 0 && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums", active ? "bg-white/25 text-white" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300")}>
                  {formatNum(stepCount[s.id])}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Case-completion meter: five segments that fill as steps earn their ✓ —
          an almost-full bar pulls the doctor to close the loop. */}
      <div className="flex items-center gap-2 px-0.5">
        <div className="flex flex-1 items-center gap-1">
          {STEPS.map((s) => (
            <span key={s.id} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", done[s.id] ? "bg-brand-grad" : "bg-surface-3")} />
          ))}
        </div>
        <span className="shrink-0 text-2xs font-extrabold tabular-nums text-ink-subtle">
          {doneCount === STEPS.length ? t("tplan.allSteps", "اكتملت كل الخطوات 🎉") : t("tplan.progress", { done: formatNum(doneCount), total: formatNum(STEPS.length), defaultValue: "اكتمل {{done}} من {{total}}" })}
        </span>
      </div>

      {/* Two-column: work area + live case-summary rail (rail shows on lg+) */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5">
        <div className="min-h-[320px]">
          {step === "anatomy" && (
            <section className="space-y-2">
              <StepTitle icon={Crosshair} title={t("tplan.anatomyTitle", "حدّد المنطقة التشريحية")} hint={t("tplan.anatomyHint", "اختياري — يربط الحالة بالعضو أو العظم بالاسم العلمي، حسب نوع الحيوان.")} />
              <AnatomyMap value={focus} onChange={setFocus} species={species} />
            </section>
          )}

          {step === "symptoms" && (
            <section className="space-y-3">
              <StepTitle icon={Activity} title={t("tplan.symptomsTitle", "العلامات السريرية المُلاحَظة")} hint={t("tplan.symptomsHint", "اختر قالب الشكوى أو تصفّح المجموعات — واضغط «وصف» لتفصيل العرض.")} />
              {qualifierRedFlags.length > 0 && (
                <div className="space-y-2">
                  {qualifierRedFlags.map((rf) => (
                    <Banner key={`${rf.symptomId}-${rf.qualifierId}`} tone="danger" icon={AlertTriangle} title={t("tplan.redFlagSym", { s: symptomLabel(rf.symptomId), defaultValue: "علامة حمراء — {{s}}" })}>{rf.warn}</Banner>
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
            </section>
          )}

          {step === "labs" && (
            <section className="space-y-3">
              <StepTitle icon={Droplets} title={t("tplan.labsTitle", "نتيجة التحليل — تحليل الدم (CBC)")} hint={t("tplan.labsHint", "اسحب مؤشر كل قيمة يمين/يسار — يظهر الطبيعي والمرتفع والمنخفض فوراً حسب نوع الحيوان.")} />
              <CbcPanel species={species} value={cbc} onChange={setCbc} />
              <div className="rounded-2xl border border-dashed border-line bg-surface-1 p-3">
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
                {labPhoto ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <img src={labPhoto} alt={t("tplan.labPhotoAlt", "صورة التحليل")} className="h-16 w-16 rounded-xl border border-line object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-success-700 dark:text-success-300"><ImageIcon size={14} /> {t("tplan.addedToGallery", "أُضيفت إلى المعرض")}</div>
                        <div className="text-2xs text-ink-subtle">{t("tplan.filedAsLab", "صُنّفت كتحليل مخبري في صور الحالة")}</div>
                      </div>
                      <button type="button" onClick={() => { playTap(); fileRef.current?.click(); }} disabled={photoBusy || ocrBusy} className="rounded-full border border-line px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300">{t("tplan.change", "تغيير")}</button>
                    </div>
                    {/* Auto-read status */}
                    {ocrBusy ? (
                      <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                        <Loader2 size={14} className="animate-spin" /> {t("tplan.ocrReading", "جارٍ قراءة قيم التحليل من الصورة…")}
                      </div>
                    ) : ocrCount !== null && ocrCount > 0 ? (
                      <div className="flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-xs font-bold text-success-700 dark:bg-success-500/10 dark:text-success-300">
                        <Check size={14} /> {t("tplan.ocrDone", { n: formatNum(ocrCount), defaultValue: "قُرئت {{n}} قيمة تلقائياً — راجع المؤشرات بالأعلى وعدّل عند اللزوم." })}
                      </div>
                    ) : ocrCount === 0 ? (
                      <button type="button" onClick={() => { playTap(); if (labPhoto) void runOcr(labPhoto); }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 py-2 text-xs font-bold text-ink-muted transition hover:text-ink">
                        <ScanLine size={14} /> {t("tplan.ocrRetry", "تعذّرت القراءة التلقائية — أعِد المحاولة أو أدخل القيم يدوياً")}
                      </button>
                    ) : (
                      <button type="button" onClick={() => { playTap(); if (labPhoto) void runOcr(labPhoto); }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-50 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
                        <ScanLine size={14} /> {t("tplan.ocrRun", "اقرأ القيم من الصورة تلقائياً")}
                      </button>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => { playTap(); fileRef.current?.click(); }} disabled={photoBusy || !petId}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-500/10">
                    {photoBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    {photoBusy ? t("tplan.uploading", "جارٍ الرفع…") : t("tplan.snapLab", "صوّر ورقة التحليل — تُقرأ القيم تلقائياً")}
                  </button>
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
              initialSystem={focus?.system ?? differential[0]?.system}
            />
          )}

          {step === "treatment" && (
            <TreatmentStep
              rows={rows} setRow={setRow} removeRow={removeRow} addDrug={addDrug}
              weight={weight} setWeight={setWeight} species={species} allergies={allergies} flags={flags}
              speciesLabel={species ? t(`pet.species.${species}`, species) : t("tplan.unknownSpecies", "غير محدّد")} petId={petId} lang={i18n.language}
              stockMeds={stockMeds} stockFor={stockFor} interactions={interactions} safety={safety}
              protocolDiseases={pickedDiseases.filter((d) => d.protocol?.length)}
              applyProtocol={applyProtocol}
              planDays={planDays} setAllDays={setAllDays}
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

      {/* The deliberate-save gate for doseless drugs — named, explained, and one more click away */}
      {doselessAck && doseless.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-warn-200 bg-warn-50 p-3 text-xs dark:border-warn-500/30 dark:bg-warn-500/10">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn-600 dark:text-warn-300" />
          <div className="min-w-0 leading-relaxed text-warn-700 dark:text-warn-200">
            <div className="font-extrabold">{t("tplan.doselessTitle", { list: doseless.map((r) => r.name.trim()).join("، "), defaultValue: "في أدوية بدون جرعة: {{list}}" })}</div>
            <div className="mt-0.5">{t("tplan.doselessBody1", "رح تطلع للممرض بجدول الجرعات ")}<span className="font-extrabold">{t("tplan.doselessNoQty", "بدون كمية")}</span>{t("tplan.doselessBody2", ". ارجع كمّل الجرعة، أو اضغط «حفظ» مرة ثانية إذا هذا مقصود.")}</div>
          </div>
        </div>
      )}

      {/* Footer nav + save */}
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <button type="button" onClick={() => go(-1)} disabled={stepIndex === 0} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-30">
          <ChevronRight size={16} className="rtl:hidden" /><ChevronLeft size={16} className="ltr:hidden" /> {t("tplan.prev", "السابق")}
        </button>
        <span className="hidden text-2xs font-semibold text-ink-subtle sm:block">Ctrl+Enter = {stepIndex < STEPS.length - 1 ? t("tplan.next", "التالي") : t("tplan.save", "حفظ")}</span>
        {stepIndex < STEPS.length - 1 ? (
          <Button className="ms-auto" rightIcon={<ChevronLeft size={16} className="rtl:block ltr:hidden" />} onClick={() => go(1)}>
            {t("tplan.nextStep", { s: t(STEPS[stepIndex + 1].key, STEPS[stepIndex + 1].label), defaultValue: "التالي: {{s}}" })}
          </Button>
        ) : (
          <Button className="ms-auto" leftIcon={<Check size={18} />} disabled={!canSave} loading={busy} onClick={trySave}>
            {t("tplan.saveAll", "حفظ التشخيص وخطة العلاج")}
          </Button>
        )}
      </div>
    </div>
  );
}

/* =============================== Diagnosis step ============================= */
function DiagnosisStep({
  species, differential, topScore, isDiseasePicked, toggleDisease, applyProtocol,
  diagnoses, setDiagnoses, zoonotic, reportable, redFlags, notes, setNotes, initialSystem,
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
  /** Browse opens on the case's own system (anatomy focus → top differential), not a fixed default. */
  initialSystem?: string;
}) {
  const { t } = useTranslation();
  const [sys, setSys] = useState<string>(
    (initialSystem && BODY_SYSTEMS.some((s) => s.id === initialSystem) ? initialSystem : undefined) ?? BODY_SYSTEMS[0]?.id ?? "digestive",
  );
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

  // The typed text first searches the WHOLE knowledge base (all systems, this
  // species) with Arabic-orthography folding — a known disease picked here keeps
  // its latin name, zoonotic/reportable flags and protocol. Free text is the
  // last resort, not the first result.
  const kbMatches = useMemo(() => {
    const ql = normalizeAr(q.trim());
    if (!ql) return [];
    const all = BODY_SYSTEMS.flatMap((s) => diseasesForSystem(s.id, species));
    return all.filter((d) => normalizeAr(d.name).includes(ql) || (d.latin && normalizeAr(d.latin).includes(ql))).slice(0, 6);
  }, [q, species]);

  return (
    <section className="space-y-4">
      <StepTitle icon={Stethoscope} title={t("tplan.dxTitle", "التشخيص — حسب نوع الحيوان")} hint={t("tplan.dxHint", "مرشّحات مبنية على الأعراض، أو تصفّح حسب الجهاز — الأمراض المعروضة تخص هذا النوع فقط.")} />

      {(zoonotic.length > 0 || reportable.length > 0 || redFlags.length > 0) && (
        <div className="space-y-2">
          {reportable.length > 0 && <Banner tone="danger" icon={ShieldAlert} title={t("tplan.reportableTitle", "مرض واجب التبليغ")}>{t("tplan.reportableMsg", { list: reportable.map((d) => d.name).join("، "), defaultValue: "{{list}} — بلّغ الجهات الصحية فوراً." })}</Banner>}
          {zoonotic.length > 0 && <Banner tone="warn" icon={Biohazard} title={t("tplan.zoonoticTitle", "ينتقل للإنسان (Zoonotic)")}>{t("tplan.zoonoticMsg", { list: zoonotic.map((d) => d.name).join("، "), defaultValue: "{{list}} — التزم إجراءات الحماية والنظافة." })}</Banner>}
          {redFlags.map((d) => <Banner key={d.id} tone="danger" icon={AlertTriangle} title={d.name}>{d.redFlag}</Banner>)}
        </div>
      )}

      {/* Differential candidates (species-filtered, symptom-ranked) */}
      {differential.length > 0 && (
        <div className="space-y-2">
          <div className="text-2xs font-bold uppercase tracking-wide text-ink-subtle">{t("tplan.bySymptoms", "مرشّحات حسب الأعراض")}</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {differential.map((d) => (
              <DiseaseCard key={d.id} d={d} picked={isDiseasePicked(d)} onToggle={() => toggleDisease(d)} onApply={() => applyProtocol(d)} pct={Math.round((d.score / topScore) * 100)} />
            ))}
          </div>
        </div>
      )}

      {/* Browse by system — species-filtered */}
      <div className="border-t border-line pt-3">
        <div className="mb-2 text-2xs font-bold uppercase tracking-wide text-ink-subtle">{t("tplan.bySystem", "تصفّح حسب الجهاز")}</div>
        <div className="mb-3 flex flex-wrap gap-2">
          {BODY_SYSTEMS.map((s) => {
            const on = sys === s.id;
            return (
              <button key={s.id} type="button" onClick={() => { playTap(); setSys(s.id); setQ(""); }}
                className={cn("inline-flex items-center gap-2 rounded-2xl border-2 py-1.5 pe-3.5 ps-2 text-sm font-bold transition", on ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>
                <Glyph name={s.id} size={30} /> {s.name}
              </button>
            );
          })}
        </div>

        {sysDiseases.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sysDiseases.map((d) => (
              <DiseaseCard key={d.id} d={d} picked={isDiseasePicked(d)} onToggle={() => toggleDisease(d)} onApply={() => applyProtocol(d)} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-surface-1 p-3 text-center text-2xs text-ink-subtle">
            {t("tplan.noDiseases", "لا أمراض مسجّلة لهذا الجهاز في هذا النوع — اكتب تشخيصاً يدوياً بالأسفل.")}
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

        {/* Search the whole knowledge base — free text only as the last resort */}
        <div className="relative mt-3">
          <Search size={15} className="pointer-events-none absolute inset-y-0 end-3 my-auto text-ink-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) {
                e.preventDefault();
                if (kbMatches[0]) { toggleDisease(kbMatches[0]); setQ(""); } else addManual(q);
              }
              if (e.key === "Escape") setQ("");
            }}
            placeholder={t("tplan.searchDx", "ابحث عن أي تشخيص… (بكل الأجهزة، أو اكتبه يدوياً)")}
            className="input h-10 w-full pe-9 text-sm" />
        </div>
        {q.trim() && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {kbMatches.map((d) => (
              <button key={d.id} type="button" onClick={() => { toggleDisease(d); setQ(""); }}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition",
                  isDiseasePicked(d) ? "border-brand-500 bg-brand-600 text-white" : "border-brand-300 bg-surface-1 text-ink hover:bg-brand-50 dark:hover:bg-brand-500/10")}>
                {isDiseasePicked(d) ? <Check size={13} /> : <Plus size={13} />} {d.name}
                <span className="text-2xs font-semibold opacity-70">{systemById(d.system)?.name}</span>
                {d.protocol?.length ? <span className="text-2xs">✦</span> : null}
              </button>
            ))}
            <button type="button" onClick={() => addManual(q)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-400 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
              <Plus size={13} /> {t("tplan.addDx", { q: q.trim(), sys: systemById(sys)?.name, defaultValue: "إضافة «{{q}}» في {{sys}}" })}
            </button>
          </div>
        )}
      </div>

      {/* Doctor notes */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-b from-brand-50/50 to-transparent p-3.5 dark:border-brand-500/25">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-brand-700 dark:text-brand-300"><FileText size={16} /> {t("tplan.notesTitle", "ملاحظات الطبيب السريرية")}</div>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("tplan.notesPh", "ملاحظاتك، الفحص السريري، الخطة، ما تنتظره…")} className="input min-h-[84px] w-full resize-y text-sm leading-relaxed" />
      </div>
    </section>
  );
}

function DiseaseCard({ d, picked, onToggle, onApply, pct }: { d: Disease & { match?: number }; picked: boolean; onToggle: () => void; onApply: () => void; pct?: number }) {
  const { t } = useTranslation();
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
            {d.protocol?.length ? <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{t("tplan.protocolBadge", { n: formatNum(d.protocol.length), defaultValue: "✦ بروتوكول ({{n}})" })}</span> : null}
            {d.zoonotic && <span className="rounded-md bg-warn-100 px-1.5 py-0.5 text-[10px] font-bold text-warn-700 dark:bg-warn-500/20 dark:text-warn-200">{t("tplan.zoonoticBadge", "ينتقل للإنسان")}</span>}
            {d.reportable && <span className="rounded-md bg-danger-50 px-1.5 py-0.5 text-[10px] font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("tplan.reportableBadge", "تبليغ")}</span>}
            {d.redFlag && <span className="rounded-md bg-danger-50 px-1.5 py-0.5 text-[10px] font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("tplan.redFlagBadge", "علامة حمراء")}</span>}
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
          <Sparkles size={12} /> {t("tplan.applyProtocol", "أضِف بروتوكول العلاج")}
        </button>
      ) : null}
    </div>
  );
}

/* =============================== Treatment step ============================ */
/**
 * TreatmentStep — الخطة تُختار بالضغط، لا تُكتب.
 *
 * كانت الشاشة تفتح على صفٍّ فارغ مؤشّرُه ينتظر الكتابة، وفوقه خمسةُ أشرطة
 * رقاقاتٍ صغيرة تدفع الخطة نفسها تحت الطيّة، وتحته حقولُ أرقامٍ للجرعة
 * والتركيز والأيام. صارت: شريطُ تحكّمٍ واحد، وبوابةُ وزنٍ لا تُفوَّت حين
 * يغيب الوزن، ووصفاتٌ جاهزة بضغطة، وبلاطاتٌ سريعة لأكثر ما يُوصف، وزرٌّ
 * كبيرٌ يفتح منتقيَ أدويةٍ يُتصفَّح ولا يُكتب.
 *
 * ما بقي من الكتابة أبوابُ نجاةٍ مقصودة: دواءٌ خارج كل الفهارس، وجرعةٌ حرّة،
 * وأرقامٌ دقيقة خلف لوحات أرقامٍ بلا كيبورد. رفُّ العيادة أوسع من أي دليل،
 * فالكتابة تُخفَّض ولا تُحذف.
 */
function TreatmentStep({
  rows, setRow, removeRow, addDrug, weight, setWeight, species, speciesLabel, petId, lang, allergies, flags,
  stockMeds, stockFor, interactions, safety, protocolDiseases, applyProtocol, planDays, setAllDays,
}: {
  rows: PlanRow[];
  setRow: (id: string, patch: Partial<PlanRow>) => void;
  removeRow: (id: string) => void;
  addDrug: (name: string, seed?: Partial<PlanRow>) => void;
  weight?: number; setWeight: (n: number | undefined) => void;
  species?: Sp;
  speciesLabel: string;
  petId?: string;
  lang: string;
  allergies?: string[];
  flags?: ChartFlags;
  stockMeds: Product[];
  stockFor: (name: string) => Product | undefined;
  interactions: { a: string; b: string; severity: "major" | "moderate"; note: string }[];
  safety: { name: string; alerts: DoseAlert[] }[];
  protocolDiseases: Disease[];
  applyProtocol: (d: Disease) => void;
  planDays: number;
  setAllDays: (d: number) => void;
}) {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<{ open: boolean; replaceId?: string }>({ open: false });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weightSkipped, setWeightSkipped] = useState(false);
  const [weightPad, setWeightPad] = useState(false);
  const [daysPad, setDaysPad] = useState(false);
  const [recents] = useState<string[]>(recentDrugs);

  const named = rows.filter((r) => r.name.trim());
  const inPlan = (name: string): string | null =>
    named.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null;

  /** بلاطات الوصول السريع: ما بالعيادة فعلاً ثم ما اعتاده الطبيب — ستّةٌ فقط،
   *  فالحالة الشائعة تبقى ضغطةً واحدة كما كانت. */
  const quick = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; stock?: number }[] = [];
    for (const p of stockMeds) {
      const k = p.name.toLowerCase();
      if (seen.has(k) || inPlan(p.name)) continue;
      seen.add(k); out.push({ name: p.name, stock: p.stock });
    }
    for (const n of recents) {
      const k = n.toLowerCase();
      if (seen.has(k) || inPlan(n)) continue;
      seen.add(k); out.push({ name: n });
    }
    return out.slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockMeds, recents, rows]);

  /** بعد إدخال وزنٍ متأخّر: تُعاد بذرة الدليل للأسطر التي لم يلمسها الطبيب
   *  وحدها — سطرٌ عدّله بيده لا يُكتب فوقه أبداً. */
  const applyWeight = (kg: number) => {
    setWeight(kg);
    let n = 0;
    for (const r of rows) {
      if (r.mgPerKg !== undefined || r.dose.trim()) continue;
      const seed = formularySeed(r.name, species);
      if (seed.mgPerKg !== undefined) { setRow(r.id, seed); n += 1; }
    }
    if (n > 0) playSuccess();
  };

  const showGate = !weight && !weightSkipped;

  return (
    <section className="space-y-3">
      <StepTitle icon={CalendarClock} title={t("tplan.txTitle", "خطة العلاج — متزامنة مع أدوية العيادة")} hint={t("tplan.txHintPick", "اختر — ما تحتاج تكتب. الجرعة تنحسب من الوزن، وكل شي بضغطة.")} />

      {/* الأخطار القاطعة أولاً — بلا تغيير */}
      {safety.some((s) => s.alerts.some((a) => a.blocking)) && (
        <div className="rounded-2xl border border-danger-300 bg-danger-50 p-3 dark:border-danger-500/40 dark:bg-danger-500/10">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-danger-700 dark:text-danger-300">
            <ShieldAlert size={16} /> {t("tplan.safetyStop", "أوقف — في خطر دوائي بهالخطة")}
          </div>
          <div className="space-y-1.5">
            {safety.flatMap((s) => s.alerts.filter((a) => a.blocking).map((a) => (
              <DoseAlertRow key={`${s.name}-${a.id}`} alert={{ ...a, title: `${s.name} — ${a.title}` }} />
            )))}
          </div>
        </div>
      )}

      {interactions.length > 0 && (
        <div className="space-y-2">
          {interactions.map((it, i) => (
            <Banner key={i} tone={it.severity === "major" ? "danger" : "warn"} icon={AlertTriangle} title={t("tplan.interactionTitle", { a: it.a, b: it.b, defaultValue: "تداخل دوائي — {{a}} + {{b}}" })}>{it.note}</Banner>
          ))}
        </div>
      )}

      {/* شريط التحكّم — الوزن والنوع ومدة الخطة بسطرٍ واحد */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-2 p-2">
        <button type="button" data-weightpill onClick={() => { playTap(); setWeightPad(true); }}
          className={cn("inline-flex h-12 items-center gap-1.5 rounded-2xl border-2 px-3 transition",
            weight ? "border-line bg-surface-1 text-ink" : "border-warn-400 bg-warn-500 text-white shadow-soft")}>
          <Scale size={17} className={weight ? "text-brand-600 dark:text-brand-300" : ""} />
          {weight ? (
            <>
              <span className="text-lg font-black tabular-nums">{formatDec(weight)}</span>
              <span className="text-2xs font-bold text-ink-muted">{t("tplan.kg", "كغ")}</span>
              <Pencil size={13} className="opacity-50" />
            </>
          ) : (
            <span className="text-sm font-black">{t("tplan.needWeight", "شكد وزنه؟")}</span>
          )}
        </button>
        <span className="h-6 w-px bg-line" />
        <span className="inline-flex h-12 items-center rounded-2xl bg-surface-1 px-3 text-xs font-bold text-ink-muted">{speciesLabel}</span>
        <span className="h-6 w-px bg-line" />
        <span className="text-2xs font-bold text-ink-subtle">{t("tplan.planDays", "مدة الخطة")}</span>
        <span className="inline-flex items-center gap-1 rounded-2xl bg-surface-1 p-1">
          {[3, 5, 7, 10, 14].map((d) => (
            <button key={d} type="button" onClick={() => { playTap(); setAllDays(d); }}
              className={cn("h-10 min-w-[44px] rounded-xl px-2.5 text-sm font-black tabular-nums transition", planDays === d ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              {formatNum(d)}
            </button>
          ))}
          <button type="button" onClick={() => { playTap(); setDaysPad(true); }} className="h-10 rounded-xl px-2.5 text-xs font-bold text-ink-muted transition hover:text-ink">{t("tplan.other", "أخرى")}</button>
        </span>
        {named.length > 0 && (
          <span className="ms-auto rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-black tabular-nums text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {t("tplan.nDrugs", { n: formatNum(named.length), defaultValue: "{{n}} أدوية بالخطة" })}
          </span>
        )}
      </div>

      {/* بوابة الوزن — تُفتح حين يغيب، ولا تُعطّل ما تحتها */}
      {showGate && (
        <WeightGate species={species} speciesLabel={speciesLabel} petId={petId} lang={lang}
          onConfirm={(kg) => applyWeight(kg)}
          onSkip={() => setWeightSkipped(true)} />
      )}
      {!weight && weightSkipped && (
        <button type="button" onClick={() => { playTap(); setWeightSkipped(false); }}
          className="flex w-full items-center gap-2 rounded-2xl border border-warn-300 bg-warn-50 px-3 py-2.5 text-start text-2xs font-bold text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-300">
          <Scale size={15} className="shrink-0" /> {t("tplan.noWeightBanner", "الجرعات كلها يدوية لأن ما في وزن — اضغط لتسجيله")}
        </button>
      )}

      <div className={cn(showGate && "opacity-60")}>
        {/* وصفاتٌ جاهزة — ضغطةٌ واحدة تكتب الخطة كلها */}
        {protocolDiseases.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-extrabold text-brand-700 dark:text-brand-300">
              <Sparkles size={13} /> {t("tplan.readyPlans", "وصفات جاهزة — ضغطة وحدة تكتب الخطة كلها")}
            </div>
            <div className={cn(named.length === 0 ? "grid gap-2 sm:grid-cols-2" : "flex gap-2 overflow-x-auto pb-1")}>
              {protocolDiseases.map((d) => (
                <button key={d.id} type="button" data-readyplan={d.id} onClick={() => applyProtocol(d)}
                  className={cn("flex items-center gap-2 rounded-2xl border-2 border-brand-300 bg-brand-50 p-3 text-start transition active:scale-[0.99] dark:border-brand-500/30 dark:bg-brand-500/10",
                    named.length === 0 ? "min-h-[88px]" : "h-16 min-w-[220px] shrink-0")}>
                  <Sparkles size={18} className="shrink-0 text-brand-600 dark:text-brand-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-black text-ink">{d.name}</span>
                    {named.length === 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {d.protocol!.slice(0, 4).map((p) => <span key={p.drug} className="rounded-md bg-surface-1 px-1.5 py-0.5 text-2xs font-bold text-ink-muted">{p.drug}</span>)}
                      </span>
                    )}
                  </span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><Check size={20} /></span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-2xs font-semibold text-ink-subtle">{t("tplan.addedAtGuideDose", "تنضاف بجرعة الدليل — راجعها قبل الحفظ")}</p>
          </div>
        )}

        {/* الخطة */}
        <div className="space-y-2.5">
          {named.map((r) => (
            <DrugCard
              key={r.id} row={r} species={species} weight={weight} flags={flags} allergies={allergies}
              concurrent={named.filter((x) => x.id !== r.id).map((x) => x.name)}
              planDays={planDays} stockN={stockFor(r.name)?.stock}
              routes={ROUTES} freqs={FREQS}
              open={expandedId === r.id}
              onToggle={() => setExpandedId((c) => (c === r.id ? null : r.id))}
              onPatch={(p) => {
                // \u0639\u064a\u0627\u0631\u064c \u0623\u064f\u0643\u0651\u062f \u0628\u0639\u064a\u0646\u0647 \u064a\u0635\u064a\u0631 \u0627\u0641\u062a\u0631\u0627\u0636\u064e \u0627\u0644\u0639\u064a\u0627\u062f\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u062f\u0648\u0627\u0621 \u0645\u0646 \u0628\u0639\u062f.
                if (p.strengthConfirmed && p.strength !== undefined) {
                  const id = matchMonograph(r.name)?.id;
                  if (id) rememberStrength(id, p.strength);
                }
                setRow(r.id, p as Partial<PlanRow>);
              }}
              onRemove={() => { playTap(); removeRow(r.id); }}
              onReplace={() => { playTap(); setPicker({ open: true, replaceId: r.id }); }}
              onNeedWeight={() => { playTap(); setWeightPad(true); }}
            />
          ))}
        </div>

        {/* بلاطات الوصول السريع — الحالة الشائعة بضغطة واحدة */}
        {quick.length > 0 && (
          <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {quick.map((q) => (
              <button key={q.name} type="button" data-quickdrug={q.name} onClick={() => addDrug(q.name)}
                className="relative h-14 truncate rounded-2xl border border-line bg-surface-1 px-2 text-center text-xs font-bold text-ink transition hover:border-brand-300">
                {q.name}
                {q.stock != null && <span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success-500" />}
              </button>
            ))}
          </div>
        )}

        {/* الزرّ الكبير — يفتح المنتقي */}
        <div className="sticky bottom-0 z-20 -mx-1 mt-2 bg-gradient-to-t from-surface-1 via-surface-1 to-transparent px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center gap-2">
            {!weight && (
              <button type="button" onClick={() => { playTap(); setWeightPad(true); }}
                className="inline-flex h-14 shrink-0 items-center gap-1.5 rounded-2xl bg-warn-500 px-4 text-sm font-black text-white shadow-soft">
                <Scale size={18} /> {t("tplan.logWeight", "سجّل الوزن")}
              </button>
            )}
            <button type="button" data-adddrug onClick={() => { playTap(); setPicker({ open: true }); }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-black text-white shadow-raised transition hover:bg-brand-700">
              <Plus size={20} /> {t("tplan.addDrugBtn", "أضف دواء")}
            </button>
          </div>
        </div>
      </div>

      <DrugPickerSheet
        open={picker.open} species={species} stockMeds={stockMeds} recents={recents}
        inPlan={inPlan} replaceMode={!!picker.replaceId}
        onPick={(name) => {
          if (picker.replaceId) {
            const old = rows.find((r) => r.id === picker.replaceId);
            setRow(picker.replaceId, { name, ...formularySeed(name, species), ...(old?.days ? { days: old.days } : {}) });
            pushRecentDrug(name);
            setPicker({ open: false });
          } else addDrug(name);
        }}
        onUnpick={(rowId) => removeRow(rowId)}
        onClose={() => setPicker({ open: false })}
      />

      <NumberPadSheet
        open={weightPad} title={t("tplan.weightSheet", "وزن الحيوان")} unit={t("tplan.kg", "كغ")}
        initial={weight} min={0.01} max={2000}
        band={species === "cat" ? { min: 0.1, max: 12 } : species === "dog" ? { min: 0.3, max: 90 } : undefined}
        bandWarn={t("tplan.weightOddShort", "وزن غير معتاد — اضغط مرة ثانية لتأكيده")}
        onClose={() => setWeightPad(false)}
        onSubmit={(n) => { applyWeight(n); setWeightSkipped(false); setWeightPad(false); }}
      />
      <NumberPadSheet
        open={daysPad} title={t("tplan.padDays", "مدة العلاج")} unit={t("tplan.day", "يوم")}
        initial={planDays} decimals={false} min={1} max={365}
        onClose={() => setDaysPad(false)}
        onSubmit={(n) => { setAllDays(Math.round(n)); setDaysPad(false); }}
      />
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
  const { t } = useTranslation();
  const totalDoses = rows.reduce((s, r) => s + dosesOf(r), 0);
  const empty = !focus && !symptoms.length && !diagnoses.length && !rows.length && !notes.trim() && !cbcCount;
  return (
    <div className="sticky top-3 space-y-3.5 rounded-2xl border border-line bg-surface-2 p-4">
      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-brand-700 dark:text-brand-300"><ClipboardList size={15} /> {t("tplan.summary", "ملخّص الحالة")}</h3>
      {empty ? (
        <p className="text-2xs leading-relaxed text-ink-subtle">{t("tplan.summaryEmpty", "تُجمَّع الحالة هنا وأنت تعمل — التركيز، الأعراض، التشخيص، والخطة.")}</p>
      ) : (
        <>
          {focus && <RailItem label={t("tplan.railFocus", "التركيز التشريحي")}><span className="font-bold">{focus.structure ?? focus.region}</span>{focus.latin && <span className="text-ink-subtle"> · <i>{focus.latin}</i></span>}</RailItem>}
          {symptoms.length > 0 && (
            <RailItem label={t("tplan.railSymptoms", { n: formatNum(symptoms.length), defaultValue: "الأعراض ({{n}})" })}>
              <span className="flex flex-wrap gap-1">
                {symptoms.map((id) => { const s = qualSummary(id); return <span key={id} className="rounded-md border border-line bg-surface-1 px-1.5 py-0.5 text-2xs font-bold">{symptomLabel(id)}{s && <span className="font-semibold text-brand-600 dark:text-brand-300"> · {s}</span>}</span>; })}
              </span>
            </RailItem>
          )}
          {cbcCount > 0 && <RailItem label={t("tplan.railCbc", "تحليل الدم")}><span className="font-bold">{t("tplan.cbcValues", { n: formatNum(cbcCount), defaultValue: "CBC · {{n}} قيمة" })}</span></RailItem>}
          {diagnoses.length > 0 && <RailItem label={t("tplan.railDx", "التشخيص")}><span className="font-bold text-brand-700 dark:text-brand-300">{diagnoses.map((d) => d.disease).join("، ")}</span></RailItem>}
          {notes.trim() && <RailItem label={t("tplan.railNotes", "ملاحظات الطبيب")}><span className="line-clamp-2 text-ink-muted">{notes.trim()}</span></RailItem>}
          {rows.length > 0 && (
            <RailItem label={t("tplan.railPlan", { n: formatNum(rows.length), defaultValue: "خطة العلاج ({{n}})" })}>
              <span className="block space-y-0.5">
                {rows.map((r) => <span key={r.id} className="block text-2xs font-semibold">• {r.name.trim()} {doseText(r) && <span className="text-brand-600 dark:text-brand-300">{doseText(r)}</span>}</span>)}
                {totalDoses > 0 && <span className="block pt-0.5 text-2xs font-bold text-success-700 dark:text-success-300">{t("tplan.totalDoses", { n: formatNum(totalDoses), defaultValue: "الإجمالي: {{n}} جرعة" })}</span>}
              </span>
            </RailItem>
          )}
          {weight && <RailItem label={t("tplan.weightLabel", "وزن الحيوان")}><span className="text-lg font-black text-violet-600 dark:text-violet-300">{formatDec(weight)}</span> <span className="text-2xs text-ink-subtle">{t("tplan.kgSource", "كغ · مصدر حساب الجرعات")}</span></RailItem>}
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
  danger: "border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200",
  warn: "border-warn-200 bg-warn-50 text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200",
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
