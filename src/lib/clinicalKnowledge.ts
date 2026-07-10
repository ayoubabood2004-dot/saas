// ============================================================================
// The Clinical Brain — a veterinary knowledge base that powers the smart
// diagnosis & treatment workspace:
//
//   • SYMPTOMS      → free clinical signs the vet can tick.
//   • DISEASES      → each linked to its system, species, symptoms, pathogen,
//                     zoonotic flag, a suggested treatment PROTOCOL, and red
//                     flags. This drives the DIFFERENTIAL engine + auto-fill.
//   • DRUG_INTERACTIONS → pairwise conflicts, checked live as drugs are added.
//   • ANATOMY       → body regions and their structures with SCIENTIFIC (Latin)
//                     names, so a diagnosis can be pinned to the exact organ/bone.
//
// This is a strong STARTER corpus — every list is meant to grow. Names are
// Arabic (primary) with Latin where it adds precision.
// ============================================================================

export type Sp = "dog" | "cat" | "bird" | "rabbit" | "horse" | "cow" | "other";
export const ALL_SPECIES: Sp[] = ["dog", "cat", "bird", "rabbit", "horse", "cow", "other"];

/* ------------------------------- Symptoms -------------------------------- */
export interface Symptom { id: string; label: string; emoji: string }

export const SYMPTOMS: Symptom[] = [
  { id: "vomiting", label: "قيء", emoji: "🤮" },
  { id: "diarrhea", label: "إسهال", emoji: "💩" },
  { id: "bloody_stool", label: "دم في البراز", emoji: "🩸" },
  { id: "anorexia", label: "فقدان شهية", emoji: "🍽️" },
  { id: "lethargy", label: "خمول", emoji: "😴" },
  { id: "fever", label: "حرارة مرتفعة", emoji: "🌡️" },
  { id: "cough", label: "سعال", emoji: "😮‍💨" },
  { id: "dyspnea", label: "صعوبة تنفس", emoji: "🫁" },
  { id: "nasal_discharge", label: "إفرازات أنفية", emoji: "👃" },
  { id: "sneezing", label: "عطاس", emoji: "🤧" },
  { id: "lameness", label: "عرج", emoji: "🦿" },
  { id: "swelling", label: "تورّم", emoji: "🎈" },
  { id: "pain", label: "ألم عند الجس", emoji: "❗" },
  { id: "pruritus", label: "حكّة", emoji: "🐾" },
  { id: "hair_loss", label: "تساقط شعر", emoji: "🪮" },
  { id: "skin_lesion", label: "آفة جلدية", emoji: "🔴" },
  { id: "seizures", label: "نوبات تشنّج", emoji: "⚡" },
  { id: "ataxia", label: "فقدان توازن", emoji: "🌀" },
  { id: "polyuria", label: "كثرة تبوّل", emoji: "💧" },
  { id: "dysuria", label: "عسر تبوّل", emoji: "🚱" },
  { id: "polydipsia", label: "عطش شديد", emoji: "🚰" },
  { id: "jaundice", label: "يرقان", emoji: "🟡" },
  { id: "ocular_discharge", label: "إفراز عيني", emoji: "👁️" },
  { id: "dehydration", label: "جفاف", emoji: "🏜️" },
  { id: "weight_loss", label: "نقص وزن", emoji: "📉" },
  { id: "abdominal_distension", label: "انتفاخ بطن", emoji: "🎈" },
];

/* -------------------------------- Diseases ------------------------------- */
export interface ProtocolItem { drug: string; dose: string; freq: string; days: number; note?: string }

export interface Disease {
  id: string;
  name: string;          // Arabic
  latin?: string;        // scientific name / pathogen
  system: string;        // body-system id (see diagnoses.ts BODY_SYSTEMS)
  species: Sp[];         // applicable species
  symptoms: string[];    // symptom ids that point here (drives differential)
  zoonotic?: boolean;    // human-transmissible → safety warning
  reportable?: boolean;  // notifiable disease
  redFlag?: string;      // one-line clinical warning
  protocol?: ProtocolItem[]; // suggested treatment plan
}

// freq ids match TreatmentPlan's FREQS: "1" | "2" | "3" | "4" | "prn"
export const DISEASES: Disease[] = [
  // — infectious / viral —
  {
    id: "parvo", name: "التهاب الأمعاء الفيروسي (بارفو)", latin: "Canine Parvovirus (CPV-2)",
    system: "infectious", species: ["dog"], symptoms: ["vomiting", "bloody_stool", "diarrhea", "anorexia", "lethargy", "dehydration", "fever"],
    reportable: false, redFlag: "شديد العدوى — اعزل الحيوان وطهّر الأدوات فوراً.",
    protocol: [
      { drug: "محلول رنجر لاكتات (وريدي)", dose: "حسب الوزن", freq: "4", days: 3, note: "تعويض السوائل والجفاف" },
      { drug: "ماروبيتانت (Maropitant)", dose: "1 mg/kg", freq: "1", days: 5, note: "مضاد قيء" },
      { drug: "سيفازولين", dose: "22 mg/kg", freq: "3", days: 7, note: "مضاد حيوي واقي" },
    ],
  },
  {
    id: "distemper", name: "الديستمبر (الكارّيه)", latin: "Canine Distemper Virus (CDV)",
    system: "infectious", species: ["dog"], symptoms: ["fever", "nasal_discharge", "cough", "ocular_discharge", "seizures", "ataxia", "anorexia"],
    redFlag: "قد يترك أعراضاً عصبية دائمة — الإنذار متحفّظ.",
    protocol: [
      { drug: "سوائل داعمة (وريدي)", dose: "حسب الوزن", freq: "3", days: 3 },
      { drug: "دوكسيسيكلين", dose: "5 mg/kg", freq: "2", days: 10, note: "للعدوى الثانوية" },
    ],
  },
  {
    id: "panleuk", name: "طاعون القطط", latin: "Feline Panleukopenia Virus (FPV)",
    system: "infectious", species: ["cat"], symptoms: ["vomiting", "diarrhea", "fever", "anorexia", "dehydration", "lethargy"],
    redFlag: "شديد العدوى بين القطط — اعزل فوراً.",
    protocol: [
      { drug: "محلول رنجر لاكتات (وريدي)", dose: "حسب الوزن", freq: "4", days: 3 },
      { drug: "ماروبيتانت", dose: "1 mg/kg", freq: "1", days: 5 },
    ],
  },
  {
    id: "rabies", name: "داء الكلب (السعار)", latin: "Rabies Virus",
    system: "infectious", species: ["dog", "cat", "cow", "horse", "other"], symptoms: ["seizures", "ataxia", "fever"],
    zoonotic: true, reportable: true, redFlag: "⚠️ مرض قاتل ينتقل للإنسان — بلّغ الجهات الصحية فوراً ولا تتعامل بدون حماية.",
  },
  {
    id: "leishmania", name: "الليشمانيا", latin: "Leishmania spp.",
    system: "infectious", species: ["dog"], symptoms: ["skin_lesion", "hair_loss", "weight_loss", "lethargy"],
    zoonotic: true, redFlag: "ينتقل للإنسان عبر ذبابة الرمل — احرص على الحماية.",
    protocol: [{ drug: "ألوبيورينول", dose: "10 mg/kg", freq: "2", days: 30, note: "علاج طويل الأمد" }],
  },
  // — digestive —
  {
    id: "gastroenteritis", name: "التهاب المعدة والأمعاء", latin: "Gastroenteritis",
    system: "digestive", species: ALL_SPECIES, symptoms: ["vomiting", "diarrhea", "anorexia", "lethargy", "dehydration"],
    protocol: [
      { drug: "ميترونيدازول", dose: "10 mg/kg", freq: "2", days: 5 },
      { drug: "ماروبيتانت", dose: "1 mg/kg", freq: "1", days: 3, note: "عند القيء" },
    ],
  },
  {
    id: "pancreatitis", name: "التهاب البنكرياس", latin: "Pancreatitis",
    system: "digestive", species: ["dog", "cat"], symptoms: ["vomiting", "anorexia", "pain", "abdominal_distension", "lethargy"],
    redFlag: "امنع الطعام الدهني — قد يتطلب تنويماً.",
    protocol: [
      { drug: "سوائل وريدية", dose: "حسب الوزن", freq: "3", days: 3 },
      { drug: "مسكّن (بوبرينورفين)", dose: "0.02 mg/kg", freq: "3", days: 3 },
    ],
  },
  {
    id: "foreign_body", name: "جسم غريب معوي", latin: "GI Foreign Body",
    system: "digestive", species: ["dog", "cat"], symptoms: ["vomiting", "anorexia", "pain", "abdominal_distension"],
    redFlag: "قد يحتاج تدخّلاً جراحياً عاجلاً — صوّر بالأشعة.",
  },
  // — respiratory —
  {
    id: "kennel_cough", name: "سعال الكلاب (الكنلي)", latin: "Canine Infectious Tracheobronchitis",
    system: "respiratory", species: ["dog"], symptoms: ["cough", "nasal_discharge", "sneezing"],
    protocol: [{ drug: "دوكسيسيكلين", dose: "5 mg/kg", freq: "2", days: 10 }],
  },
  {
    id: "cat_asthma", name: "الربو القططي", latin: "Feline Asthma",
    system: "respiratory", species: ["cat"], symptoms: ["cough", "dyspnea"],
    protocol: [{ drug: "بريدنيزولون", dose: "1 mg/kg", freq: "1", days: 7, note: "مع تقليل الجرعة تدريجياً" }],
  },
  {
    id: "pneumonia", name: "التهاب رئوي", latin: "Pneumonia",
    system: "respiratory", species: ALL_SPECIES, symptoms: ["cough", "dyspnea", "fever", "nasal_discharge", "lethargy"],
    protocol: [{ drug: "أموكسيسيلين-كلافولانيك", dose: "12.5 mg/kg", freq: "2", days: 10 }],
  },
  // — dermatology —
  {
    id: "atopic_derm", name: "التهاب جلد تحسّسي", latin: "Atopic Dermatitis",
    system: "derm", species: ["dog", "cat"], symptoms: ["pruritus", "skin_lesion", "hair_loss"],
    protocol: [{ drug: "أوكلاسيتينيب (Apoquel)", dose: "0.4 mg/kg", freq: "2", days: 14 }],
  },
  {
    id: "sarcoptic_mange", name: "جرب (مانج ساركوبتيك)", latin: "Sarcoptes scabiei",
    system: "derm", species: ["dog"], symptoms: ["pruritus", "hair_loss", "skin_lesion"],
    zoonotic: true, redFlag: "قد يسبّب حكّة عابرة للإنسان.",
    protocol: [{ drug: "سيلامكتين موضعي", dose: "6 mg/kg", freq: "prn", days: 30, note: "يُعاد كل أسبوعين" }],
  },
  {
    id: "ringworm", name: "قوباء حلقية (فطريات)", latin: "Dermatophytosis",
    system: "derm", species: ["dog", "cat"], symptoms: ["hair_loss", "skin_lesion"],
    zoonotic: true, redFlag: "معدٍ للإنسان — التزم النظافة.",
    protocol: [{ drug: "إيتراكونازول", dose: "5 mg/kg", freq: "1", days: 28 }],
  },
  // — urinary —
  {
    id: "flutd", name: "متلازمة المجاري البولية القططية", latin: "FLUTD",
    system: "urinary", species: ["cat"], symptoms: ["dysuria", "polyuria", "pain", "bloody_stool"],
    redFlag: "الانسداد البولي في الذكور طارئ قاتل — تحقّق من المثانة فوراً.",
    protocol: [{ drug: "مسكّن (بوبرينورفين)", dose: "0.02 mg/kg", freq: "3", days: 3 }],
  },
  {
    id: "cystitis", name: "التهاب المثانة", latin: "Cystitis",
    system: "urinary", species: ["dog", "cat"], symptoms: ["dysuria", "bloody_stool", "polyuria"],
    protocol: [{ drug: "أموكسيسيلين-كلافولانيك", dose: "12.5 mg/kg", freq: "2", days: 10 }],
  },
  {
    id: "ckd", name: "قصور كلوي مزمن", latin: "Chronic Kidney Disease",
    system: "urinary", species: ["cat", "dog"], symptoms: ["polyuria", "polydipsia", "weight_loss", "anorexia", "lethargy"],
    redFlag: "حالة مزمنة — تحتاج مراقبة دورية للكرياتينين.",
    protocol: [{ drug: "سوائل تحت الجلد", dose: "حسب الوزن", freq: "prn", days: 30 }],
  },
  // — musculoskeletal —
  {
    id: "fracture", name: "كسر", latin: "Fracture",
    system: "msk", species: ALL_SPECIES, symptoms: ["lameness", "swelling", "pain"],
    redFlag: "صوّر بالأشعة لتحديد الإزاحة قبل التجبير.",
    protocol: [
      { drug: "ترامادول", dose: "3 mg/kg", freq: "2", days: 5, note: "مسكّن" },
      { drug: "ميلوكسيكام", dose: "0.1 mg/kg", freq: "1", days: 5, note: "مضاد التهاب — تجنّبه في القطط المصابة بالكلى" },
    ],
  },
  {
    id: "arthritis", name: "التهاب المفاصل", latin: "Osteoarthritis",
    system: "msk", species: ["dog", "cat"], symptoms: ["lameness", "pain"],
    protocol: [{ drug: "ميلوكسيكام", dose: "0.1 mg/kg", freq: "1", days: 10 }],
  },
  {
    id: "ccl_rupture", name: "تمزّق الرباط الصليبي", latin: "Cranial Cruciate Ligament Rupture",
    system: "msk", species: ["dog"], symptoms: ["lameness", "swelling", "pain"],
    redFlag: "غالباً يحتاج إصلاحاً جراحياً.",
  },
  // — neuro —
  {
    id: "ivdd", name: "انزلاق غضروفي", latin: "Intervertebral Disc Disease (IVDD)",
    system: "neuro", species: ["dog"], symptoms: ["ataxia", "pain", "lameness"],
    redFlag: "فقدان الحس العميق طارئ جراحي.",
    protocol: [{ drug: "بريدنيزولون", dose: "0.5 mg/kg", freq: "1", days: 5 }],
  },
  {
    id: "epilepsy", name: "الصرع", latin: "Idiopathic Epilepsy",
    system: "neuro", species: ["dog", "cat"], symptoms: ["seizures", "ataxia"],
    protocol: [{ drug: "فينوباربيتال", dose: "2.5 mg/kg", freq: "2", days: 30, note: "علاج مزمن — راقب الكبد" }],
  },
  // — endocrine —
  {
    id: "diabetes", name: "داء السكري", latin: "Diabetes Mellitus",
    system: "endocrine", species: ["dog", "cat"], symptoms: ["polyuria", "polydipsia", "weight_loss", "anorexia"],
    redFlag: "حالة مزمنة — تحتاج معايرة أنسولين ومتابعة.",
    protocol: [{ drug: "أنسولين", dose: "0.25 U/kg", freq: "2", days: 30, note: "يُعاير حسب منحنى السكر" }],
  },
  // — eyes / ear —
  {
    id: "conjunctivitis", name: "التهاب الملتحمة", latin: "Conjunctivitis",
    system: "eyes", species: ALL_SPECIES, symptoms: ["ocular_discharge"],
    protocol: [{ drug: "قطرة مضاد حيوي عيني", dose: "قطرة", freq: "3", days: 7 }],
  },
  {
    id: "otitis_externa", name: "التهاب الأذن الخارجية", latin: "Otitis Externa",
    system: "ear", species: ["dog", "cat"], symptoms: ["pain", "pruritus"],
    protocol: [{ drug: "قطرة أذن (مضاد حيوي/فطري)", dose: "قطرات", freq: "2", days: 10 }],
  },
];

/* ---------------------------- Drug interactions -------------------------- */
export interface DrugInteraction { a: string; b: string; severity: "major" | "moderate"; note: string }

// Matched loosely (substring, case/space-insensitive) against typed drug names.
export const DRUG_INTERACTIONS: DrugInteraction[] = [
  { a: "ميلوكسيكام", b: "بريدنيزولون", severity: "major", note: "مضاد التهاب لا-ستيرويدي + كورتيزون → خطر تقرّح ونزف معدي. لا تجمعهما." },
  { a: "ميلوكسيكام", b: "ديكساميثازون", severity: "major", note: "NSAID + كورتيزون → نزف هضمي. تجنّب الجمع." },
  { a: "ترامادول", b: "فلوكسيتين", severity: "major", note: "خطر متلازمة السيروتونين." },
  { a: "أنسولين", b: "بريدنيزولون", severity: "moderate", note: "الكورتيزون يرفع السكر ويضعف مفعول الأنسولين — راقب الجرعة." },
  { a: "فينوباربيتال", b: "كلورامفينيكول", severity: "moderate", note: "يبطئ استقلاب الفينوباربيتال → تراكم وسميّة." },
  { a: "ديجوكسين", b: "فوروسيميد", severity: "moderate", note: "نقص البوتاسيوم يزيد سمّية الديجوكسين — راقب الأملاح." },
  { a: "أموكسيسيلين", b: "دوكسيسيكلين", severity: "moderate", note: "مضاد قاتل + مضاد موقف للنمو → تعارض نظري في الفعالية." },
];

/* -------------------------------- Anatomy -------------------------------- */
export interface AnatomyStructure { name: string; latin: string }
export interface AnatomyRegion {
  id: string;
  name: string;         // Arabic region name
  system: string;       // default body-system id it maps to
  cx: number; cy: number; r: number; // hotspot on the 320×200 map
  structures: AnatomyStructure[];
}

// Hotspots laid over a 320×200 quadruped side-profile (see AnatomyMap.tsx).
export const ANATOMY: AnatomyRegion[] = [
  {
    id: "head", name: "الرأس والوجه", system: "neuro", cx: 262, cy: 74, r: 26,
    structures: [
      { name: "الجمجمة", latin: "Cranium" }, { name: "الفك السفلي", latin: "Mandible" },
      { name: "الدماغ", latin: "Cerebrum" }, { name: "العين", latin: "Oculus" },
      { name: "الأذن", latin: "Auris" }, { name: "الأنف", latin: "Nasus" },
    ],
  },
  {
    id: "oral", name: "الفم والأسنان", system: "dental", cx: 286, cy: 96, r: 18,
    structures: [
      { name: "الأنياب", latin: "Canini" }, { name: "الأضراس", latin: "Molares" },
      { name: "اللثة", latin: "Gingiva" }, { name: "اللسان", latin: "Lingua" },
    ],
  },
  {
    id: "neck", name: "الرقبة", system: "msk", cx: 222, cy: 82, r: 20,
    structures: [
      { name: "الفقرات الرقبية", latin: "Vertebrae cervicales" }, { name: "القصبة الهوائية", latin: "Trachea" },
      { name: "المريء", latin: "Oesophagus" }, { name: "الغدة الدرقية", latin: "Gl. thyroidea" },
    ],
  },
  {
    id: "thorax", name: "الصدر", system: "respiratory", cx: 176, cy: 104, r: 30,
    structures: [
      { name: "الرئتان", latin: "Pulmones" }, { name: "القلب", latin: "Cor" },
      { name: "الأضلاع", latin: "Costae" }, { name: "الحجاب الحاجز", latin: "Diaphragma" },
    ],
  },
  {
    id: "abdomen", name: "البطن", system: "digestive", cx: 120, cy: 116, r: 32,
    structures: [
      { name: "المعدة", latin: "Gaster" }, { name: "الأمعاء", latin: "Intestinum" },
      { name: "الكبد", latin: "Hepar" }, { name: "الطحال", latin: "Lien" },
      { name: "الكلى", latin: "Ren" }, { name: "المثانة", latin: "Vesica urinaria" },
      { name: "البنكرياس", latin: "Pancreas" },
    ],
  },
  {
    id: "spine", name: "العمود الفقري", system: "neuro", cx: 150, cy: 66, r: 22,
    structures: [
      { name: "الفقرات الصدرية", latin: "Vertebrae thoracicae" },
      { name: "الفقرات القطنية", latin: "Vertebrae lumbales" },
      { name: "الأقراص الفقرية", latin: "Disci intervertebrales" }, { name: "النخاع الشوكي", latin: "Medulla spinalis" },
    ],
  },
  {
    id: "pelvis", name: "الحوض", system: "msk", cx: 74, cy: 82, r: 20,
    structures: [
      { name: "عظم الحوض", latin: "Pelvis" }, { name: "المفصل الوركي", latin: "Art. coxae" },
      { name: "العجز", latin: "Os sacrum" },
    ],
  },
  {
    id: "foreleg", name: "الطرف الأمامي", system: "msk", cx: 176, cy: 168, r: 22,
    structures: [
      { name: "عظم العضد", latin: "Humerus" }, { name: "عظم الكعبرة", latin: "Radius" },
      { name: "عظم الزند", latin: "Ulna" }, { name: "مفصل الكتف", latin: "Art. humeri" },
      { name: "الرسغ", latin: "Carpus" },
    ],
  },
  {
    id: "hindleg", name: "الطرف الخلفي", system: "msk", cx: 74, cy: 162, r: 24,
    structures: [
      { name: "عظم الفخذ", latin: "Femur" }, { name: "عظم الظنبوب", latin: "Tibia" },
      { name: "عظم الشظية", latin: "Fibula" }, { name: "مفصل الركبة", latin: "Art. genus" },
      { name: "العرقوب", latin: "Tarsus" }, { name: "الرباط الصليبي", latin: "Lig. cruciatum" },
    ],
  },
  {
    id: "skin", name: "الجلد والفراء", system: "derm", cx: 130, cy: 150, r: 0,
    structures: [
      { name: "البشرة", latin: "Epidermis" }, { name: "الأدمة", latin: "Dermis" }, { name: "جريبات الشعر", latin: "Folliculi pili" },
    ],
  },
];

/* ------------------------------- Engine ---------------------------------- */
/** Rank diseases by how many of the selected symptoms they match, filtered by species. */
export function differentialFor(symptomIds: string[], species?: Sp): (Disease & { score: number; match: number })[] {
  if (!symptomIds.length) return [];
  const set = new Set(symptomIds);
  return DISEASES
    .filter((d) => !species || d.species.includes(species))
    .map((d) => {
      const match = d.symptoms.filter((s) => set.has(s)).length;
      // score = matched symptoms weighted by specificity (fewer symptoms in DB → more specific)
      const score = match === 0 ? 0 : match / Math.sqrt(d.symptoms.length);
      return { ...d, match, score };
    })
    .filter((d) => d.match > 0)
    .sort((a, b) => b.score - a.score || b.match - a.match)
    .slice(0, 8);
}

export function diseaseById(id: string): Disease | undefined { return DISEASES.find((d) => d.id === id); }
export function diseasesForSystem(system: string, species?: Sp): Disease[] {
  return DISEASES.filter((d) => d.system === system && (!species || d.species.includes(species)));
}
export function regionById(id: string): AnatomyRegion | undefined { return ANATOMY.find((r) => r.id === id); }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
/** Live interaction check over a list of typed drug names. */
export function interactionsIn(drugNames: string[]): DrugInteraction[] {
  const names = drugNames.map(norm).filter(Boolean);
  const hits: DrugInteraction[] = [];
  for (const it of DRUG_INTERACTIONS) {
    const a = norm(it.a), b = norm(it.b);
    const hasA = names.some((n) => n.includes(a) || a.includes(n));
    const hasB = names.some((n) => n.includes(b) || b.includes(n));
    if (hasA && hasB) hits.push(it);
  }
  return hits;
}

/* ------------------------------- Outcomes -------------------------------- */
export type CaseOutcome = "under_treatment" | "recovered" | "referred" | "deceased" | "chronic";
export const OUTCOMES: { id: CaseOutcome; label: string; emoji: string; tone: "brand" | "success" | "warn" | "danger" | "violet" }[] = [
  { id: "under_treatment", label: "تحت العلاج", emoji: "💊", tone: "brand" },
  { id: "recovered", label: "شُفي", emoji: "✅", tone: "success" },
  { id: "chronic", label: "حالة مزمنة", emoji: "♾️", tone: "violet" },
  { id: "referred", label: "مُحال", emoji: "↗️", tone: "warn" },
  { id: "deceased", label: "متوفى", emoji: "🕊️", tone: "danger" },
];
