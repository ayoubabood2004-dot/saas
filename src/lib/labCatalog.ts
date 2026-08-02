// ============================================================================
// Veterinary laboratory catalog (كتالوج المختبر) — every test the clinic runs,
// organised the way world-class systems (IDEXX / ezyVet) do it, kept two-taps
// simple:
//
//   • NUMERIC params with a species-aware normal band (dog/cat; others fall
//     back to dog) → auto-flag low/normal/high as the doctor types.
//   • PANELS: one tap opens exactly the fields of that panel (CBC, full chem,
//     renal, hepatic, pre-anaesthetic…). No scrolling a 100-item list.
//   • SNAP (rapid) tests → positive / negative, no numbers.
//   • DESCRIPTIVE tests (cytology, culture, fecal…) → text + photo.
//
// IMPORTANT modelling rule (the professional detail): the normal range and
// unit are SNAPSHOTTED onto each saved value at entry time — analysers differ
// and references evolve, so historic results must never be re-judged by
// tomorrow's ranges. This file only supplies the DEFAULTS for new entries.
// ============================================================================
import type { Species } from "@/types";
import { cbcFlag, type CbcFlag } from "@/lib/cbc";

export type LabFlag = CbcFlag; // "low" | "normal" | "high"

export interface LabParam {
  id: string;
  label: string;   // Arabic name
  abbr: string;    // BUN, ALT, …
  unit: string;
  step: number;
  /** Normal band per species — dog is the universal fallback. */
  ranges: { dog: [number, number]; cat: [number, number] };
}

/** Resolve the default normal band for the patient's species. */
export const labRange = (p: LabParam, species?: Species): [number, number] =>
  species === "cat" ? p.ranges.cat : p.ranges.dog;

export const labFlag = (value: number, lo?: number, hi?: number): LabFlag => {
  if (lo === undefined || hi === undefined) return "normal";
  return cbcFlag(value, [lo, hi]);
};

/* ------------------------------- Parameters ------------------------------- */
// Hematology (CBC + differential)
const HEMATOLOGY: LabParam[] = [
  { id: "wbc", label: "كريات بيضاء", abbr: "WBC", unit: "10³/µL", step: 0.1, ranges: { dog: [6, 17], cat: [5.5, 19.5] } },
  { id: "rbc", label: "كريات حمراء", abbr: "RBC", unit: "10⁶/µL", step: 0.1, ranges: { dog: [5.5, 8.5], cat: [5, 10] } },
  { id: "hgb", label: "هيموغلوبين", abbr: "HGB", unit: "g/dL", step: 0.1, ranges: { dog: [12, 18], cat: [8, 15] } },
  { id: "hct", label: "هيماتوكريت (PCV)", abbr: "HCT", unit: "%", step: 1, ranges: { dog: [37, 55], cat: [30, 45] } },
  { id: "plt", label: "صفائح دموية", abbr: "PLT", unit: "10³/µL", step: 5, ranges: { dog: [200, 500], cat: [300, 700] } },
  { id: "mcv", label: "متوسط حجم الكرية", abbr: "MCV", unit: "fL", step: 1, ranges: { dog: [60, 77], cat: [39, 55] } },
  { id: "mchc", label: "تركيز الخضاب الوسطي", abbr: "MCHC", unit: "g/dL", step: 0.1, ranges: { dog: [32, 36], cat: [30, 36] } },
  { id: "neut", label: "العدلات", abbr: "NEU", unit: "10³/µL", step: 0.1, ranges: { dog: [3, 11.5], cat: [2.5, 12.5] } },
  { id: "lymph", label: "اللمفاويات", abbr: "LYM", unit: "10³/µL", step: 0.1, ranges: { dog: [1, 4.8], cat: [1.5, 7] } },
  { id: "mono", label: "الوحيدات", abbr: "MONO", unit: "10³/µL", step: 0.1, ranges: { dog: [0.15, 1.35], cat: [0, 0.85] } },
  { id: "eos", label: "الحمضات", abbr: "EOS", unit: "10³/µL", step: 0.1, ranges: { dog: [0.1, 1.25], cat: [0, 1.5] } },
];

// Clinical chemistry
const CHEMISTRY: LabParam[] = [
  { id: "bun", label: "يوريا الدم", abbr: "BUN", unit: "mg/dL", step: 1, ranges: { dog: [7, 27], cat: [16, 36] } },
  { id: "crea", label: "كرياتينين", abbr: "CREA", unit: "mg/dL", step: 0.1, ranges: { dog: [0.5, 1.8], cat: [0.8, 2.4] } },
  { id: "phos", label: "فسفور", abbr: "PHOS", unit: "mg/dL", step: 0.1, ranges: { dog: [2.5, 6.8], cat: [3.1, 7.5] } },
  { id: "alt", label: "ناقلة أمين الألانين", abbr: "ALT", unit: "U/L", step: 1, ranges: { dog: [10, 125], cat: [12, 130] } },
  { id: "ast", label: "ناقلة أمين الأسبارتات", abbr: "AST", unit: "U/L", step: 1, ranges: { dog: [0, 50], cat: [0, 48] } },
  { id: "alp", label: "فوسفاتاز قلوي", abbr: "ALP", unit: "U/L", step: 1, ranges: { dog: [23, 212], cat: [14, 111] } },
  { id: "ggt", label: "غاما جي تي", abbr: "GGT", unit: "U/L", step: 1, ranges: { dog: [0, 11], cat: [0, 4] } },
  { id: "tbil", label: "بيليروبين كلي", abbr: "TBIL", unit: "mg/dL", step: 0.1, ranges: { dog: [0, 0.9], cat: [0, 0.9] } },
  { id: "tp", label: "بروتين كلي", abbr: "TP", unit: "g/dL", step: 0.1, ranges: { dog: [5.2, 8.2], cat: [5.7, 8.9] } },
  { id: "alb", label: "ألبومين", abbr: "ALB", unit: "g/dL", step: 0.1, ranges: { dog: [2.3, 4], cat: [2.2, 4] } },
  { id: "glob", label: "غلوبيولين", abbr: "GLOB", unit: "g/dL", step: 0.1, ranges: { dog: [2.5, 4.5], cat: [2.8, 5.1] } },
  { id: "glu", label: "سكر الدم", abbr: "GLU", unit: "mg/dL", step: 1, ranges: { dog: [74, 143], cat: [74, 159] } },
  { id: "amyl", label: "أميليز", abbr: "AMYL", unit: "U/L", step: 10, ranges: { dog: [500, 1500], cat: [500, 1500] } },
  { id: "lipa", label: "لايبيز", abbr: "LIPA", unit: "U/L", step: 10, ranges: { dog: [200, 1800], cat: [100, 1400] } },
  { id: "chol", label: "كوليسترول", abbr: "CHOL", unit: "mg/dL", step: 1, ranges: { dog: [110, 320], cat: [65, 225] } },
  { id: "na", label: "صوديوم", abbr: "Na", unit: "mmol/L", step: 1, ranges: { dog: [144, 160], cat: [150, 165] } },
  { id: "k", label: "بوتاسيوم", abbr: "K", unit: "mmol/L", step: 0.1, ranges: { dog: [3.5, 5.8], cat: [3.5, 5.8] } },
  { id: "cl", label: "كلورايد", abbr: "Cl", unit: "mmol/L", step: 1, ranges: { dog: [109, 122], cat: [112, 129] } },
  { id: "ca", label: "كالسيوم", abbr: "Ca", unit: "mg/dL", step: 0.1, ranges: { dog: [7.9, 12], cat: [7.8, 11.3] } },
  { id: "t4", label: "الغدة الدرقية", abbr: "T4", unit: "µg/dL", step: 0.1, ranges: { dog: [1, 4], cat: [0.8, 4.7] } },
];

// Urinalysis (numeric part — sediment goes in the notes)
const URINALYSIS: LabParam[] = [
  { id: "usg", label: "الكثافة النوعية", abbr: "USG", unit: "", step: 0.001, ranges: { dog: [1.015, 1.045], cat: [1.035, 1.06] } },
  { id: "uph", label: "حموضة البول", abbr: "pH", unit: "", step: 0.5, ranges: { dog: [5.5, 7], cat: [6, 7] } },
];

export const LAB_PARAMS: LabParam[] = [...HEMATOLOGY, ...CHEMISTRY, ...URINALYSIS];
export const labParamById = (id: string): LabParam | undefined => LAB_PARAMS.find((p) => p.id === id);

/* --------------------------------- Panels --------------------------------- */
export type PanelKind = "numeric" | "snap" | "descriptive";

export interface LabPanel {
  id: string;
  label: string;
  emoji: string;
  kind: PanelKind;
  /** For numeric panels: which params open (ordered). */
  params?: string[];
  hint?: string;
}

export const LAB_PANELS: LabPanel[] = [
  { id: "cbc", label: "تعداد الدم CBC", emoji: "🩸", kind: "numeric", params: HEMATOLOGY.map((p) => p.id), hint: "تعداد كامل مع التفريق" },
  { id: "chem", label: "كيمياء شاملة", emoji: "🧪", kind: "numeric", params: CHEMISTRY.map((p) => p.id), hint: "كلى + كبد + سكر + بروتينات + أملاح" },
  { id: "renal", label: "لوحة الكلى", emoji: "💧", kind: "numeric", params: ["bun", "crea", "phos", "usg"], hint: "الفشل الكلوي ومتابعته" },
  { id: "hepatic", label: "لوحة الكبد", emoji: "🟠", kind: "numeric", params: ["alt", "ast", "alp", "ggt", "tbil", "alb"], hint: "وظائف الكبد" },
  { id: "preanesthetic", label: "ما قبل التخدير", emoji: "💉", kind: "numeric", params: ["hct", "tp", "glu", "bun", "alt"], hint: "الحد الأدنى الآمن قبل أي عملية" },
  { id: "electrolytes", label: "الأملاح", emoji: "⚡", kind: "numeric", params: ["na", "k", "cl", "ca"], hint: "جفاف، قيء، إسهال" },
  { id: "urinalysis", label: "تحليل البول", emoji: "🟡", kind: "numeric", params: ["usg", "uph"], hint: "القيم الرقمية + الرواسب بالملاحظات" },
  { id: "snap", label: "فحص سريع Snap", emoji: "⚡", kind: "snap", hint: "بارفو، ديستمبر، FeLV/FIV…" },
  { id: "fecal", label: "فحص البراز", emoji: "🔬", kind: "descriptive", hint: "طفيليات، تعويم، جيارديا" },
  { id: "skin", label: "كشط جلد / فطريات", emoji: "🧫", kind: "descriptive", hint: "جرب، فطريات، خميرة الأذن" },
  { id: "cytology", label: "خلايا / خزعة", emoji: "🔍", kind: "descriptive", hint: "FNA، مسحة، نسيج" },
  { id: "culture", label: "زراعة وحساسية", emoji: "🧬", kind: "descriptive", hint: "البكتيريا والمضاد الفعال" },
  { id: "custom", label: "تحليل حر", emoji: "➕", kind: "numeric", params: [], hint: "أي فحص مو بالكتالوج — اسم وقيمة ونطاق" },
];

export const labPanelById = (id: string): LabPanel | undefined => LAB_PANELS.find((p) => p.id === id);

/* ------------------------- Simple entry groups -------------------------
 * The recording sheet doesn't ask the doctor to know panel names — it shows
 * ONE sheet of values grouped by organ/system; he types only what's on the
 * analyser printout and the entry names itself from the groups he touched. */
export interface LabGroup { id: string; label: string; emoji: string; params: string[] }

export const LAB_GROUPS: LabGroup[] = [
  { id: "blood", label: "الدم", emoji: "🩸", params: HEMATOLOGY.map((p) => p.id) },
  { id: "renal", label: "الكلى", emoji: "💧", params: ["bun", "crea", "phos"] },
  { id: "hepatic", label: "الكبد", emoji: "🟠", params: ["alt", "ast", "alp", "ggt", "tbil"] },
  { id: "protein", label: "السكر والبروتين", emoji: "🍬", params: ["glu", "tp", "alb", "glob"] },
  { id: "lytes", label: "الأملاح", emoji: "⚡", params: ["na", "k", "cl", "ca"] },
  { id: "other", label: "بنكرياس وغدد", emoji: "🧪", params: ["amyl", "lipa", "chol", "t4"] },
  { id: "urine", label: "البول", emoji: "🟡", params: ["usg", "uph"] },
];

/** Name a numeric entry from the groups that actually got values. */
export function nameFromGroups(valueIds: string[]): { panel_id: string; panel_label: string } {
  const touched = LAB_GROUPS.filter((g) => g.params.some((p) => valueIds.includes(p)));
  const hasFree = valueIds.some((id) => id.startsWith("free_"));
  if (touched.length === 0) return { panel_id: "custom", panel_label: "تحاليل مخبرية" };
  if (touched.length === 1 && !hasFree) {
    const g = touched[0];
    return g.id === "blood"
      ? { panel_id: "cbc", panel_label: "تعداد الدم CBC" }
      : g.id === "urine"
        ? { panel_id: "urinalysis", panel_label: "تحليل البول" }
        : { panel_id: g.id, panel_label: `كيمياء — ${g.label}` };
  }
  const blood = touched.some((g) => g.id === "blood");
  const chem = touched.some((g) => g.id !== "blood" && g.id !== "urine");
  if (blood && chem) return { panel_id: "mixed", panel_label: "دم + كيمياء" };
  if (chem) return { panel_id: "chem", panel_label: `كيمياء — ${touched.filter((g) => g.id !== "urine").map((g) => g.label).join(" و")}` };
  return { panel_id: "mixed", panel_label: "تحاليل مخبرية" };
}

/* -------------------------------- Snap tests ------------------------------- */
export interface SnapTest { id: string; label: string; species: "dog" | "cat" | "both" }

export const SNAP_TESTS: SnapTest[] = [
  { id: "parvo", label: "بارفو Parvo", species: "dog" },
  { id: "distemper", label: "ديستمبر Distemper", species: "dog" },
  { id: "ehrlichia", label: "إيرليخيا Ehrlichia", species: "dog" },
  { id: "heartworm", label: "ديدان القلب Heartworm", species: "dog" },
  { id: "brucella", label: "بروسيلا Brucella", species: "dog" },
  { id: "giardia", label: "جيارديا Giardia", species: "both" },
  { id: "felv", label: "لوكيميا القطط FeLV", species: "cat" },
  { id: "fiv", label: "إيدز القطط FIV", species: "cat" },
  { id: "fip", label: "التهاب البريتون FIP", species: "cat" },
  { id: "panleukopenia", label: "بانليكوبينيا", species: "cat" },
];

export const snapTestById = (id: string): SnapTest | undefined => SNAP_TESTS.find((s) => s.id === id);

/** Snap tests relevant to the patient first, the rest after. */
export function snapTestsFor(species?: Species): SnapTest[] {
  const mine = (s: SnapTest) => s.species === "both" || s.species === species;
  return [...SNAP_TESTS.filter(mine), ...SNAP_TESTS.filter((s) => !mine(s))];
}
