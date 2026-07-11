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
/** A descriptor axis for a symptom — e.g. vomiting → onset (حاد / مزمن). Picks
 *  are single-select suggestions that let the vet describe a sign in 1-2 taps. */
export interface SymptomQualifier { id: string; label: string; options: string[] }
export interface Symptom { id: string; label: string; emoji: string; qualifiers?: SymptomQualifier[] }

// The canonical sign list (35). Each carries optional descriptor axes so a sign
// can be qualified ("قيء — حاد، مع دم"). Grouped for browsing by SYMPTOM_CATEGORIES.
// ⚠️ IDs are a hard contract: DISEASES.symptoms + differentialFor key on them.
export const SYMPTOMS: Symptom[] = [
  // — general —
  { id: "fever", label: "حرارة مرتفعة", emoji: "🌡️", qualifiers: [
    { id: "degree", label: "الدرجة", options: ["خفيفة", "متوسطة", "عالية جداً"] },
    { id: "pattern", label: "النمط", options: ["مستمرة", "متقطّعة"] },
  ] },
  { id: "lethargy", label: "خمول", emoji: "😴", qualifiers: [
    { id: "severity", label: "الشدّة", options: ["خفيف", "متوسط", "شديد", "إعياء شديد"] },
    { id: "onset", label: "البداية", options: ["مفاجئ", "تدريجي"] },
  ] },
  { id: "anorexia", label: "فقدان شهية", emoji: "🍽️", qualifiers: [
    { id: "amount", label: "المقدار", options: ["يأكل قليلاً", "امتناع تام"] },
    { id: "duration", label: "المدة", options: ["منذ يوم", "عدة أيام", "أكثر من أسبوع"] },
    { id: "water", label: "الماء", options: ["يشرب", "لا يشرب"] },
  ] },
  { id: "weight_loss", label: "نقص وزن", emoji: "📉", qualifiers: [
    { id: "amount", label: "المقدار", options: ["خفيف", "ملحوظ", "هزال شديد"] },
    { id: "onset", label: "المدة", options: ["سريع", "تدريجي"] },
    { id: "appetite", label: "الشهية", options: ["مع شهية جيدة", "مع فقدان شهية"] },
  ] },
  { id: "dehydration", label: "جفاف", emoji: "🏜️", qualifiers: [
    { id: "degree", label: "الدرجة", options: ["خفيف (أقل من ٥٪)", "متوسط (٥–٨٪)", "شديد (أكثر من ٨٪)"] },
    { id: "membranes", label: "الأغشية المخاطية", options: ["رطبة", "جافة", "لزجة"] },
  ] },
  // — digestive —
  { id: "vomiting", label: "قيء", emoji: "🤮", qualifiers: [
    { id: "onset", label: "البداية", options: ["حاد", "مزمن"] },
    { id: "content", label: "المحتوى", options: ["طعام", "عصارة صفراء", "دم", "رغوة", "ديدان"] },
    { id: "pattern", label: "النمط", options: ["متقطّع", "متكرّر", "قذفي"] },
    { id: "timing", label: "التوقيت", options: ["بعد الأكل", "على معدة فارغة"] },
  ] },
  { id: "diarrhea", label: "إسهال", emoji: "💩", qualifiers: [
    { id: "consistency", label: "القوام", options: ["مائي", "ليّن", "مخاطي"] },
    { id: "blood", label: "اللون والدم", options: ["طبيعي", "دموي", "أسود قطراني (ميلينا)", "فاتح"] },
    { id: "onset", label: "البداية", options: ["حاد", "مزمن"] },
    { id: "frequency", label: "التكرار", options: ["متقطّع", "متكرّر", "شديد"] },
  ] },
  { id: "bloody_stool", label: "دم في البراز", emoji: "🩸", qualifiers: [
    { id: "type", label: "نوع الدم", options: ["أحمر صريح", "أسود قطراني (ميلينا)"] },
    { id: "amount", label: "الكمية", options: ["خطوط بسيطة", "كمية كبيرة"] },
  ] },
  { id: "constipation", label: "إمساك", emoji: "🚧", qualifiers: [
    { id: "duration", label: "المدة", options: ["منذ يوم", "عدة أيام"] },
    { id: "effort", label: "المحاولة", options: ["يجهد بلا نتيجة", "لا يحاول"] },
    { id: "consistency", label: "القوام", options: ["صلب جاف", "مع دم"] },
  ] },
  { id: "abdominal_distension", label: "انتفاخ بطن", emoji: "🎈", qualifiers: [
    { id: "texture", label: "الملمس", options: ["متوتّر", "طري", "سوائل", "غازات"] },
    { id: "pain", label: "الألم", options: ["مؤلم", "غير مؤلم"] },
    { id: "onset", label: "السرعة", options: ["مفاجئ", "تدريجي"] },
  ] },
  { id: "jaundice", label: "يرقان", emoji: "🟡", qualifiers: [
    { id: "location", label: "الموضع", options: ["اللثة", "بياض العين", "الجلد", "الأذن"] },
    { id: "severity", label: "الشدّة", options: ["خفيف", "واضح"] },
  ] },
  // — respiratory —
  { id: "dyspnea", label: "صعوبة تنفّس", emoji: "🫁", qualifiers: [
    { id: "type", label: "النوع", options: ["شهيقي", "زفيري", "مختلط"] },
    { id: "severity", label: "الشدّة", options: ["عند المجهود", "أثناء الراحة", "مع زُرقة"] },
    { id: "posture", label: "الوضعية", options: ["فتح الفم", "الرقبة ممدودة"] },
  ] },
  { id: "cough", label: "سعال", emoji: "😮‍💨", qualifiers: [
    { id: "character", label: "الطبيعة", options: ["جاف", "رطب مُنتِج"] },
    { id: "timing", label: "التوقيت", options: ["ليلي", "بعد المجهود", "مستمر"] },
    { id: "pattern", label: "النمط", options: ["متقطّع", "نوبات"] },
  ] },
  { id: "sneezing", label: "عطاس", emoji: "🤧", qualifiers: [
    { id: "frequency", label: "التكرار", options: ["متقطّع", "نوبات"] },
    { id: "associated", label: "المصاحبات", options: ["مع إفراز", "مع دم", "عطاس عكسي"] },
  ] },
  { id: "nasal_discharge", label: "إفرازات أنفية", emoji: "👃", qualifiers: [
    { id: "character", label: "الطبيعة", options: ["مائي", "مخاطي", "قيحي", "دموي"] },
    { id: "side", label: "الجهة", options: ["أنف واحد", "الأنفين"] },
  ] },
  // — dermatology —
  { id: "pruritus", label: "حكّة", emoji: "🐾", qualifiers: [
    { id: "severity", label: "الشدّة", options: ["خفيفة", "متوسطة", "شديدة لا تهدأ"] },
    { id: "location", label: "الموضع", options: ["موضعي", "منتشر", "الوجه والأذن", "القوائم", "حول الذيل"] },
    { id: "timing", label: "التوقيت", options: ["موسمي", "دائم"] },
  ] },
  { id: "hair_loss", label: "تساقط شعر", emoji: "🪮", qualifiers: [
    { id: "pattern", label: "النمط", options: ["بقعي", "متماثل الجهتين", "منتشر"] },
    { id: "location", label: "الموضع", options: ["الظهر", "الأطراف", "حول العين", "الذيل"] },
    { id: "itch", label: "الحكّة", options: ["مع حكّة", "بدون حكّة"] },
  ] },
  { id: "skin_lesion", label: "آفة جلدية", emoji: "🔴", qualifiers: [
    { id: "type", label: "النوع", options: ["حطاطة", "بثرة", "قشرة", "تقرّح", "احمرار", "عقيدة"] },
    { id: "distribution", label: "التوزّع", options: ["موضعي", "منتشر", "متماثل"] },
    { id: "moisture", label: "الحالة", options: ["جافة", "رطبة", "متقيّحة"] },
  ] },
  { id: "mass", label: "كتلة أو ورم", emoji: "🔘", qualifiers: [
    { id: "texture", label: "القوام", options: ["صلبة", "طرية", "متحرّكة", "ملتصقة"] },
    { id: "growth", label: "النمو", options: ["بطيء", "سريع"] },
    { id: "surface", label: "السطح", options: ["سليم", "متقرّح"] },
    { id: "number", label: "العدد", options: ["مفردة", "متعدّدة"] },
  ] },
  // — urinary —
  { id: "dysuria", label: "عسر تبوّل", emoji: "🚱", qualifiers: [
    { id: "sign", label: "العلامة", options: ["إجهاد", "تبوّل متكرر قليل", "مؤلم", "انسداد تام"] },
    { id: "blood", label: "الدم", options: ["بدون", "مع دم"] },
  ] },
  { id: "polyuria", label: "كثرة تبوّل", emoji: "💧", qualifiers: [
    { id: "kind", label: "النوع", options: ["زيادة الكمية", "زيادة التكرار"] },
    { id: "night", label: "الليل", options: ["تبوّل ليلي", "سلس بولي"] },
  ] },
  { id: "hematuria", label: "دم في البول", emoji: "🩸", qualifiers: [
    { id: "color", label: "اللون", options: ["وردي", "أحمر صريح", "بني"] },
    { id: "timing", label: "التوقيت", options: ["بداية التبوّل", "طوال التبوّل"] },
  ] },
  { id: "polydipsia", label: "عطش شديد", emoji: "🚰", qualifiers: [
    { id: "severity", label: "الشدّة", options: ["زيادة ملحوظة", "إفراط شديد"] },
  ] },
  // — musculoskeletal —
  { id: "lameness", label: "عرج", emoji: "🦿", qualifiers: [
    { id: "limb", label: "الطرف", options: ["أمامي أيمن", "أمامي أيسر", "خلفي أيمن", "خلفي أيسر"] },
    { id: "weight_bearing", label: "تحميل الوزن", options: ["يحمّل الوزن", "لا يحمّل الوزن"] },
    { id: "onset", label: "البداية", options: ["مفاجئ", "تدريجي", "بعد إصابة"] },
    { id: "timing", label: "التوقيت", options: ["بعد الراحة", "بعد المجهود"] },
  ] },
  { id: "swelling", label: "تورّم", emoji: "🎈", qualifiers: [
    { id: "location", label: "الموضع", options: ["مفصل", "طرف", "وجه", "بطن", "عام"] },
    { id: "temperature", label: "الحرارة", options: ["حار", "بارد"] },
    { id: "pain", label: "الألم", options: ["مؤلم", "غير مؤلم"] },
    { id: "texture", label: "الملمس", options: ["صلب", "طري", "متموّج"] },
  ] },
  { id: "pain", label: "ألم عند الجس", emoji: "❗", qualifiers: [
    { id: "location", label: "الموضع", options: ["البطن", "الظهر", "الرقبة", "المفصل", "الطرف", "عام"] },
    { id: "severity", label: "الشدّة", options: ["خفيف", "متوسط", "شديد"] },
    { id: "response", label: "الاستجابة", options: ["توتّر", "أنين", "عدوانية"] },
  ] },
  // — senses (eye / ear / mouth) —
  { id: "ocular_discharge", label: "إفراز عيني", emoji: "👁️", qualifiers: [
    { id: "character", label: "الطبيعة", options: ["مائي", "مخاطي", "قيحي", "دموي"] },
    { id: "side", label: "الجهة", options: ["عين واحدة", "العينين"] },
  ] },
  { id: "eye_redness", label: "احمرار العين", emoji: "👁", qualifiers: [
    { id: "severity", label: "الشدّة", options: ["خفيف", "شديد"] },
    { id: "associated", label: "المصاحبات", options: ["مع إغماض", "مع تورّم", "مع إفراز"] },
    { id: "side", label: "الجهة", options: ["عين واحدة", "العينين"] },
  ] },
  { id: "ear_discharge", label: "إفراز الأذن وهزّ الرأس", emoji: "👂", qualifiers: [
    { id: "sign", label: "العلامة", options: ["هزّ الرأس", "حكّ الأذن", "إفراز", "رائحة"] },
    { id: "type", label: "النوع", options: ["بني شمعي", "قيحي", "دموي"] },
    { id: "side", label: "الجهة", options: ["أذن واحدة", "الأذنين"] },
  ] },
  { id: "drooling", label: "سيلان لعاب", emoji: "🤤", qualifiers: [
    { id: "amount", label: "الكمية", options: ["خفيف", "غزير"] },
    { id: "associated", label: "المصاحبات", options: ["مع ألم فموي", "مع غثيان", "مع صعوبة بلع"] },
  ] },
  { id: "halitosis", label: "رائحة فم كريهة", emoji: "👄", qualifiers: [
    { id: "severity", label: "الشدّة", options: ["خفيفة", "قوية"] },
    { id: "associated", label: "المصاحبات", options: ["مع جير", "مع نزف لثة", "مع فقدان شهية"] },
  ] },
  // — neurological —
  { id: "seizures", label: "نوبات تشنّج", emoji: "⚡", qualifiers: [
    { id: "type", label: "النوع", options: ["بؤري", "معمّم", "رجفان"] },
    { id: "duration", label: "المدة", options: ["ثوانٍ", "دقائق", "متتالية دون إفاقة"] },
    { id: "frequency", label: "التكرار", options: ["أول مرة", "متكرّرة", "عنقودية"] },
    { id: "consciousness", label: "الوعي", options: ["فاقد للوعي", "واعٍ"] },
  ] },
  { id: "ataxia", label: "فقدان توازن", emoji: "🌀", qualifiers: [
    { id: "kind", label: "النوع", options: ["ترنّح", "ضعف الأطراف", "دوران"] },
    { id: "limbs", label: "الأطراف", options: ["خلفية", "الأربعة"] },
    { id: "severity", label: "الشدّة", options: ["خفيف", "شديد مع سقوط"] },
  ] },
  { id: "head_tilt", label: "ميلان الرأس", emoji: "🙃", qualifiers: [
    { id: "side", label: "الجهة", options: ["يمين", "يسار"] },
    { id: "associated", label: "المصاحبات", options: ["رأرأة العين", "دوران", "سقوط"] },
  ] },
  { id: "tremor", label: "رعشة", emoji: "📳", qualifiers: [
    { id: "location", label: "الموضع", options: ["الرأس", "الأطراف", "الجسم كامل"] },
    { id: "timing", label: "التوقيت", options: ["أثناء الراحة", "أثناء الحركة", "عند الإثارة"] },
  ] },
];

export function symptomById(id: string): Symptom | undefined { return SYMPTOMS.find((s) => s.id === id); }
/** A display label for any sign id — including free-typed "custom:…" entries the
 *  vet added that aren't in the corpus (they record but don't drive the differential). */
export function symptomLabel(id: string): string {
  return symptomById(id)?.label ?? (id.startsWith("custom:") ? id.slice(7) : id);
}

/* --------------------------- Symptom categories -------------------------- */
/** The 8 scannable groups the picker browses by. Every `systemId` is a real
 *  BODY_SYSTEMS id so a section header can reuse the system Glyph + tone. */
export interface SymptomCategory { id: string; name: string; systemId: string; symptomIds: string[] }
export const SYMPTOM_CATEGORIES: SymptomCategory[] = [
  { id: "general", name: "الحالة العامة", systemId: "general", symptomIds: ["fever", "lethargy", "anorexia", "weight_loss", "dehydration"] },
  { id: "digestive", name: "الجهاز الهضمي", systemId: "digestive", symptomIds: ["vomiting", "diarrhea", "bloody_stool", "constipation", "abdominal_distension", "jaundice"] },
  { id: "respiratory", name: "التنفّس والأنف", systemId: "respiratory", symptomIds: ["dyspnea", "cough", "sneezing", "nasal_discharge"] },
  { id: "derm", name: "الجلد والفراء", systemId: "derm", symptomIds: ["pruritus", "hair_loss", "skin_lesion", "mass"] },
  { id: "urinary", name: "التبوّل والعطش", systemId: "urinary", symptomIds: ["dysuria", "polyuria", "hematuria", "polydipsia"] },
  { id: "msk", name: "الحركة والعظام", systemId: "msk", symptomIds: ["lameness", "swelling", "pain"] },
  { id: "senses", name: "العين والأذن والفم", systemId: "eyes", symptomIds: ["ocular_discharge", "eye_redness", "ear_discharge", "drooling", "halitosis"] },
  { id: "neuro", name: "الجهاز العصبي", systemId: "neuro", symptomIds: ["seizures", "ataxia", "head_tilt", "tremor"] },
];

/** Which category a body-system id belongs to (folds dental/ear/eyes into "senses").
 *  Lets the Anatomy step pre-open the matching symptom category. */
export function categoryForSystem(system: string): SymptomCategory | undefined {
  if (system === "dental" || system === "ear" || system === "eyes") return SYMPTOM_CATEGORIES.find((c) => c.id === "senses");
  return SYMPTOM_CATEGORIES.find((c) => c.systemId === system);
}

/* --------------------------- Chief complaints ---------------------------- */
/** One-tap presets for the most frequent dog/cat presentations — each SEEDS its
 *  core sign bundle into the tray (suggest-then-confirm). `system` picks the card
 *  glyph + tone from BODY_SYSTEMS. */
export interface CommonComplaint { label: string; system: string; symptomIds: string[] }
export const COMMON_COMPLAINTS: CommonComplaint[] = [
  { label: "اضطراب هضمي / نزلة معوية", system: "digestive", symptomIds: ["vomiting", "diarrhea", "anorexia", "lethargy"] },
  { label: "اشتباه بارفو (جرو)", system: "infectious", symptomIds: ["vomiting", "bloody_stool", "diarrhea", "anorexia", "dehydration", "lethargy"] },
  { label: "عدوى تنفسية / سعال الكلاب", system: "respiratory", symptomIds: ["cough", "nasal_discharge", "sneezing", "fever"] },
  { label: "حكّة والتهاب جلدي", system: "derm", symptomIds: ["pruritus", "hair_loss", "skin_lesion"] },
  { label: "عرج أو إصابة", system: "msk", symptomIds: ["lameness", "pain", "swelling"] },
  { label: "انسداد بولي (قطط)", system: "urinary", symptomIds: ["dysuria", "hematuria", "pain", "lethargy"] },
  { label: "عطش وتبوّل زائد", system: "endocrine", symptomIds: ["polyuria", "polydipsia", "weight_loss", "anorexia"] },
  { label: "خمول وفقدان شهية", system: "general", symptomIds: ["lethargy", "anorexia", "fever", "dehydration"] },
  { label: "التهاب أذن", system: "ear", symptomIds: ["ear_discharge", "pruritus", "pain"] },
  { label: "التهاب عين", system: "eyes", symptomIds: ["ocular_discharge", "eye_redness"] },
  { label: "نوبة عصبية / تشنّج", system: "neuro", symptomIds: ["seizures", "ataxia"] },
  { label: "بطن حاد / انتفاخ طارئ", system: "digestive", symptomIds: ["abdominal_distension", "vomiting", "pain", "dyspnea"] },
];

/** Red-flag qualifier values — when picked, the console raises an urgent banner. */
export const RED_FLAG_QUALIFIERS: { symptomId: string; qualifierId: string; value: string; warn: string }[] = [
  { symptomId: "dysuria", qualifierId: "sign", value: "انسداد تام", warn: "انسداد بولي تام — طارئ قاتل، افحص المثانة وأفرغها فوراً." },
  { symptomId: "abdominal_distension", qualifierId: "onset", value: "مفاجئ", warn: "انتفاخ بطن مفاجئ — اشتبه بانفتال المعدة (GDV)، حالة جراحية طارئة." },
  { symptomId: "seizures", qualifierId: "duration", value: "متتالية دون إفاقة", warn: "نوبات متتالية دون إفاقة (Status epilepticus) — طارئ، ثبّت النوبة فوراً." },
  { symptomId: "vomiting", qualifierId: "content", value: "دم", warn: "قيء دموي (Hematemesis) — قيّم النزف الهضمي والجفاف بسرعة." },
  { symptomId: "dyspnea", qualifierId: "severity", value: "مع زُرقة", warn: "زُرقة مع صعوبة تنفّس — نقص أكسجة، أعطِ أكسجين وتعامل كطارئ." },
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
    system: "infectious", species: ["dog"], symptoms: ["fever", "nasal_discharge", "cough", "ocular_discharge", "seizures", "ataxia", "anorexia", "tremor"],
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
    system: "infectious", species: ["dog", "cat", "cow", "horse", "other"], symptoms: ["seizures", "ataxia", "fever", "drooling"],
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
    system: "urinary", species: ["cat"], symptoms: ["dysuria", "polyuria", "pain", "bloody_stool", "hematuria"],
    redFlag: "الانسداد البولي في الذكور طارئ قاتل — تحقّق من المثانة فوراً.",
    protocol: [{ drug: "مسكّن (بوبرينورفين)", dose: "0.02 mg/kg", freq: "3", days: 3 }],
  },
  {
    id: "cystitis", name: "التهاب المثانة", latin: "Cystitis",
    system: "urinary", species: ["dog", "cat"], symptoms: ["dysuria", "bloody_stool", "polyuria", "hematuria"],
    protocol: [{ drug: "أموكسيسيلين-كلافولانيك", dose: "12.5 mg/kg", freq: "2", days: 10 }],
  },
  {
    id: "ckd", name: "قصور كلوي مزمن", latin: "Chronic Kidney Disease",
    system: "urinary", species: ["cat", "dog"], symptoms: ["polyuria", "polydipsia", "weight_loss", "anorexia", "lethargy", "halitosis"],
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
    system: "neuro", species: ["dog", "cat"], symptoms: ["seizures", "ataxia", "tremor"],
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
    system: "eyes", species: ALL_SPECIES, symptoms: ["ocular_discharge", "eye_redness"],
    protocol: [{ drug: "قطرة مضاد حيوي عيني", dose: "قطرة", freq: "3", days: 7 }],
  },
  {
    id: "otitis_externa", name: "التهاب الأذن الخارجية", latin: "Otitis Externa",
    system: "ear", species: ["dog", "cat"], symptoms: ["pain", "pruritus", "ear_discharge", "head_tilt"],
    protocol: [{ drug: "قطرة أذن (مضاد حيوي/فطري)", dose: "قطرات", freq: "2", days: 10 }],
  },
  // — added to host the new descriptive signs (constipation, mass) —
  {
    id: "obstipation", name: "إمساك وانحشار البراز", latin: "Constipation / Obstipation",
    system: "digestive", species: ["dog", "cat"], symptoms: ["constipation", "abdominal_distension", "anorexia", "pain"],
    redFlag: "الانحشار المزمن قد يؤدي لتضخّم القولون (Megacolon) — قيّم الترطيب واللين.",
    protocol: [
      { drug: "لاكتولوز", dose: "0.5 ml/kg", freq: "2", days: 7, note: "ملين تناضحي" },
      { drug: "حقنة شرجية دافئة", dose: "حسب الحجم", freq: "prn", days: 1, note: "تحت إشراف — تجنّب حقن الفوسفات في القطط" },
      { drug: "سوائل تحت الجلد", dose: "حسب الوزن", freq: "prn", days: 3, note: "لترطيب البراز" },
    ],
  },
  {
    id: "neoplasia", name: "كتلة / ورم (اشتباه)", latin: "Neoplasia (suspect)",
    system: "derm", species: ["dog", "cat", "other"], symptoms: ["mass", "weight_loss", "lethargy"],
    redFlag: "افحص الكتلة نسيجياً (شفط بالإبرة/خزعة) لتحديد طبيعتها قبل أي قرار علاجي.",
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
  cx?: number; cy?: number; r?: number; // hotspot on the map (omit → rendered as a chip below it)
  structures: AnatomyStructure[];
}

// The shared quadruped template (modeled on dog/cat), facing right on a 300×230
// canvas — head on the right, tail on the left. Per-species plans below REMOVE
// inapplicable regions and ADD species-correct ones. See AnatomyMap.tsx.
export const CORE_REGIONS: AnatomyRegion[] = [
  {
    id: "head", name: "الرأس والوجه", system: "neuro", cx: 208, cy: 102, r: 22,
    structures: [
      { name: "الجمجمة", latin: "Cranium" }, { name: "الفك السفلي", latin: "Mandibula" },
      { name: "الدماغ", latin: "Cerebrum" }, { name: "العين", latin: "Oculus" },
      { name: "الأذن", latin: "Auris" }, { name: "الأنف", latin: "Nasus" },
    ],
  },
  {
    id: "oral", name: "الفم والأسنان", system: "dental", cx: 244, cy: 111, r: 15,
    structures: [
      { name: "القواطع", latin: "Dentes incisivi" }, { name: "الأنياب", latin: "Dentes canini" },
      { name: "الأضراس", latin: "Dentes molares" }, { name: "اللثة", latin: "Gingiva" },
      { name: "اللسان", latin: "Lingua" },
    ],
  },
  {
    id: "neck", name: "الرقبة", system: "msk", cx: 186, cy: 104, r: 15,
    structures: [
      { name: "الفقرات الرقبية", latin: "Vertebrae cervicales" }, { name: "القصبة الهوائية", latin: "Trachea" },
      { name: "المريء", latin: "Oesophagus" }, { name: "الغدة الدرقية", latin: "Gl. thyroidea" },
    ],
  },
  {
    id: "thorax", name: "الصدر", system: "respiratory", cx: 166, cy: 117, r: 25,
    structures: [
      { name: "الرئتان", latin: "Pulmones" }, { name: "القلب", latin: "Cor" },
      { name: "الأضلاع", latin: "Costae" }, { name: "الحجاب الحاجز", latin: "Diaphragma" },
    ],
  },
  {
    id: "abdomen", name: "البطن", system: "digestive", cx: 112, cy: 126, r: 27,
    structures: [
      { name: "المعدة", latin: "Gaster" }, { name: "الأمعاء", latin: "Intestinum" },
      { name: "الكبد", latin: "Hepar" }, { name: "الطحال", latin: "Lien" },
      { name: "الكلى", latin: "Ren" }, { name: "المثانة", latin: "Vesica urinaria" },
      { name: "البنكرياس", latin: "Pancreas" },
    ],
  },
  {
    id: "spine", name: "العمود الفقري", system: "neuro", cx: 138, cy: 97, r: 17,
    structures: [
      { name: "الفقرات الصدرية", latin: "Vertebrae thoracicae" },
      { name: "الفقرات القطنية", latin: "Vertebrae lumbales" },
      { name: "الأقراص الفقرية", latin: "Disci intervertebrales" }, { name: "النخاع الشوكي", latin: "Medulla spinalis" },
    ],
  },
  {
    id: "pelvis", name: "الحوض", system: "msk", cx: 84, cy: 116, r: 17,
    structures: [
      { name: "عظم الحوض", latin: "Pelvis" }, { name: "المفصل الوركي", latin: "Art. coxae" },
      { name: "العجز", latin: "Os sacrum" },
    ],
  },
  {
    id: "foreleg", name: "الطرف الأمامي", system: "msk", cx: 180, cy: 174, r: 21,
    structures: [
      { name: "عظم العضد", latin: "Humerus" }, { name: "عظم الكعبرة", latin: "Radius" },
      { name: "عظم الزند", latin: "Ulna" }, { name: "مفصل الكتف", latin: "Art. humeri" },
      { name: "الرسغ", latin: "Carpus" },
    ],
  },
  {
    id: "hindleg", name: "الطرف الخلفي", system: "msk", cx: 104, cy: 174, r: 22,
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

/** Per-species differentiation of the quadruped template.
 *  ⚠️ MEDICAL CONTENT — the structures/notes below should be reviewed by the vet
 *  before relying on them clinically. Coordinates for ADDED hotspot regions
 *  (beak/wing/hoof) live in AnatomyMap's POSTURE; internal viscera (crop, gizzard,
 *  cloaca, forestomach, udder, hindgut, keel) intentionally carry no coords and
 *  render as labeled chips below the map. */
export interface SpeciesAnatomyPlan {
  removeRegionIds?: string[];
  addRegions?: AnatomyRegion[];
  structureOverrides?: Record<string, AnatomyStructure[]>;
  note?: string;
}

export const SPECIES_ANATOMY: Record<Sp, SpeciesAnatomyPlan> = {
  dog: {
    structureOverrides: {
      abdomen: [
        { name: "المعدة", latin: "Gaster" }, { name: "الأمعاء", latin: "Intestinum" },
        { name: "الكبد", latin: "Hepar" }, { name: "الطحال", latin: "Lien" },
        { name: "الكلى", latin: "Ren" }, { name: "المثانة", latin: "Vesica urinaria" },
        { name: "البنكرياس", latin: "Pancreas" }, { name: "البروستات (ذكر)", latin: "Prostata" },
        { name: "الرحم (أنثى)", latin: "Uterus" }, { name: "الغدد اللبنية", latin: "Mammae" },
      ],
    },
    note: "الكلب هو القالب الرباعي المرجعي — إضافات تناسلية وسنّية طفيفة فقط (تقيّح الرحم Pyometra شائع).",
  },
  cat: {
    structureOverrides: {
      abdomen: [
        { name: "المعدة", latin: "Gaster" }, { name: "الأمعاء", latin: "Intestinum" },
        { name: "الكبد", latin: "Hepar" }, { name: "الطحال", latin: "Lien" },
        { name: "الكلى (حسّاسة)", latin: "Ren" }, { name: "المثانة", latin: "Vesica urinaria" },
        { name: "البنكرياس", latin: "Pancreas" }, { name: "الرحم (أنثى)", latin: "Uterus" },
        { name: "الغدد اللبنية", latin: "Mammae" },
      ],
      foreleg: [
        { name: "عظم العضد", latin: "Humerus" }, { name: "عظم الكعبرة", latin: "Radius" },
        { name: "عظم الزند", latin: "Ulna" }, { name: "مفصل الكتف", latin: "Art. humeri" },
        { name: "مخالب قابلة للسحب", latin: "Ungues retractiles" },
      ],
    },
    note: "القطة قريبة من القالب الرباعي — مخالب قابلة للسحب وكلى حسّاسة (القصور الكلوي المزمن CKD شائع).",
  },
  bird: {
    removeRegionIds: ["oral", "foreleg"],
    structureOverrides: {
      head: [
        { name: "الجمجمة", latin: "Cranium" }, { name: "الدماغ", latin: "Cerebrum" },
        { name: "العين", latin: "Oculus" }, { name: "المنخران", latin: "Nares" },
        { name: "الشمعة (السدادة الأنفية)", latin: "Cera" }, { name: "الأذن (بلا صيوان خارجي)", latin: "Meatus acusticus" },
      ],
      thorax: [
        { name: "الرئتان الجاسئتان", latin: "Pulmones" }, { name: "الأكياس الهوائية", latin: "Sacci pneumatici" },
        { name: "القلب", latin: "Cor" }, { name: "العظام المُهوّاة", latin: "Ossa pneumatica" },
      ],
      abdomen: [
        { name: "الكبد", latin: "Hepar" }, { name: "الطحال", latin: "Lien" },
        { name: "الكلى", latin: "Ren" }, { name: "الحالبان (لا مثانة بولية)", latin: "Ureteres" },
        { name: "الأمعاء", latin: "Intestinum" },
      ],
      skin: [
        { name: "الريش", latin: "Pennae" }, { name: "غدة الزمكى الدهنية", latin: "Gl. uropygialis" },
        { name: "الجلد", latin: "Cutis" },
      ],
    },
    addRegions: [
      { id: "beak", name: "المنقار", system: "dental", structures: [
        { name: "المنقار العلوي", latin: "Rhinotheca" }, { name: "المنقار السفلي", latin: "Gnathotheca" },
        { name: "قنبة المنقار", latin: "Culmen" }, { name: "الشمعة (السدادة الأنفية)", latin: "Cera" },
        { name: "المنخران", latin: "Nares" },
      ] },
      { id: "wing", name: "الجناح", system: "msk", structures: [
        { name: "عظم العضد", latin: "Humerus" }, { name: "الكعبرة", latin: "Radius" },
        { name: "الزند", latin: "Ulna" }, { name: "الرسغ-المشط", latin: "Carpometacarpus" },
        { name: "الجُنيح", latin: "Alula" }, { name: "ريش الطيران (القوادم)", latin: "Remiges" },
      ] },
      { id: "crop", name: "الحوصلة", system: "digestive", structures: [
        { name: "الحوصلة", latin: "Ingluvies" }, { name: "المريء", latin: "Oesophagus" },
        { name: "المعدة الغدّية", latin: "Proventriculus" },
      ] },
      { id: "gizzard", name: "القانصة", system: "digestive", structures: [
        { name: "القانصة", latin: "Ventriculus" }, { name: "المعدة الغدّية", latin: "Proventriculus" },
        { name: "الكبد", latin: "Hepar" }, { name: "الأعوران", latin: "Caeca" },
      ] },
      { id: "cloaca", name: "المجمع (الكلواكة)", system: "digestive", structures: [
        { name: "الكلواكة", latin: "Cloaca" }, { name: "الردب المعوي", latin: "Coprodeum" },
        { name: "الردب البولي التناسلي", latin: "Urodeum" }, { name: "الردب الشرجي", latin: "Proctodeum" },
        { name: "المخرج (الزمكى)", latin: "Ventus" },
      ] },
      { id: "keel", name: "عظم القص (العارضة)", system: "msk", structures: [
        { name: "العارضة (لَبَّة القص)", latin: "Carina sterni" }, { name: "عظم القص", latin: "Sternum" },
        { name: "العضلة الصدرية", latin: "M. pectoralis" }, { name: "الشوكة (الترقوة الملتحمة)", latin: "Furcula" },
        { name: "الغرابي", latin: "Os coracoideum" },
      ] },
    ],
    note: "الطائر يختلف جذرياً: منقار بدل الأسنان، جناح بدل الطرف الأمامي، حوصلة وقانصة وكلواكة، أكياس هوائية بلا حجاب حاجز، وبلا مثانة بولية.",
  },
  rabbit: {
    structureOverrides: {
      oral: [
        { name: "القواطع دائمة النمو", latin: "Dentes incisivi (elodont)" }, { name: "القواطع الوتدية", latin: "Peg teeth" },
        { name: "الفجوة السنّية (لا أنياب)", latin: "Diastema" }, { name: "الأضراس الخدّية", latin: "Premolares/Molares" },
        { name: "اللسان", latin: "Lingua" },
      ],
    },
    addRegions: [
      { id: "hindgut", name: "الأعور والأمعاء الخلفية", system: "digestive", structures: [
        { name: "الأعور الضخم", latin: "Caecum" }, { name: "القولون", latin: "Colon" },
        { name: "الكييس المدوّر", latin: "Sacculus rotundus" }, { name: "الزائدة الدودية", latin: "Appendix vermiformis" },
        { name: "كريات الأعور (البراز الليّن)", latin: "Caecotrophae" },
      ] },
    ],
    note: "الأرنب مُخمّر لاحق الهضم: أسنان دائمة النمو بلا أنياب، أعور ضخم، اجترار للبراز (Caecotrophy)، ولا يستطيع التقيؤ.",
  },
  horse: {
    structureOverrides: {
      oral: [
        { name: "القواطع", latin: "Dentes incisivi" }, { name: "السن الذئبي", latin: "Dens lupinus" },
        { name: "الأضراس عالية التاج", latin: "Molares (hypsodont)" }, { name: "اللثة", latin: "Gingiva" },
        { name: "اللسان", latin: "Lingua" },
      ],
    },
    addRegions: [
      { id: "hoof", name: "الحافر", system: "msk", structures: [
        { name: "العظم السنبكي (الحُفّي)", latin: "Phalanx distalis (Os ungulare)" }, { name: "العظم الزورقي", latin: "Os naviculare" },
        { name: "الغمد القرني للحافر", latin: "Capsula ungulae" }, { name: "الصفائح الحسّاسة", latin: "Laminae" },
        { name: "الوسادة الرقمية", latin: "Pulvinus digitalis" },
      ] },
      { id: "hindgut", name: "الأعور والقولون", system: "digestive", structures: [
        { name: "الأعور", latin: "Caecum" }, { name: "القولون الكبير", latin: "Colon ascendens" },
        { name: "القولون الصغير", latin: "Colon descendens" }, { name: "الثنية الحوضية", latin: "Flexura pelvina" },
        { name: "الأمعاء الدقيقة", latin: "Intestinum tenue" },
      ] },
    ],
    note: "الحصان أحادي المعدة مُخمّر لاحق الهضم بحافر مفرد؛ المغص (Colic) والتهاب الصفيحة (Laminitis) مخاطر رئيسية، ولا يتقيّأ.",
  },
  cow: {
    structureOverrides: {
      oral: [
        { name: "الوسادة الأسنانية (بلا قواطع علوية)", latin: "Pulvinus dentalis" }, { name: "القواطع السفلية", latin: "Dentes incisivi inferiores" },
        { name: "الأضراس عالية التاج", latin: "Molares (hypsodont)" }, { name: "اللسان", latin: "Lingua" },
      ],
    },
    addRegions: [
      { id: "forestomach", name: "المعدة المركّبة (الكروش)", system: "digestive", structures: [
        { name: "الكرش", latin: "Rumen" }, { name: "الشبكية (القلنسوة)", latin: "Reticulum" },
        { name: "أم التلافيف (الورقية)", latin: "Omasum" }, { name: "الأنفحة (المعدة الحقيقية)", latin: "Abomasum" },
      ] },
      { id: "udder", name: "الضرع", system: "reproductive", structures: [
        { name: "الضرع", latin: "Uber" }, { name: "الحلمات", latin: "Papillae mammae" },
        { name: "الغدة اللبنية", latin: "Gl. mammaria" }, { name: "الصهريج اللبني", latin: "Sinus lactifer" },
      ] },
      { id: "cloven_hoof", name: "الظلف (المشقوق)", system: "msk", structures: [
        { name: "الظلف المشقوق (إصبعان III+IV)", latin: "Ungula bifida" }, { name: "العظم السنبكي", latin: "Phalanx distalis" },
        { name: "الغمد القرني", latin: "Capsula ungulae" }, { name: "المسافة بين الظلفين", latin: "Spatium interdigitale" },
        { name: "الوسادة الرقمية", latin: "Pulvinus digitalis" },
      ] },
    ],
    note: "البقرة مجترّة بأربع معد (كرش/شبكية/ورقية/أنفحة) وظلف مشقوق وضرع؛ التهاب الضرع (Mastitis) والنفاخ (Bloat) مشكلات مركزية.",
  },
  other: {
    note: "نوع غير محدّد — يستخدم القالب الرباعي العام؛ طابِق المناطق يدوياً حسب النوع الفعلي.",
  },
};

/** Resolve the species-correct region list: core minus removed, with structure
 *  overrides applied, plus the species' added regions. */
export function anatomyFor(species?: Sp): AnatomyRegion[] {
  const plan = species ? SPECIES_ANATOMY[species] : undefined;
  if (!plan) return CORE_REGIONS;
  const removed = new Set(plan.removeRegionIds ?? []);
  const base = CORE_REGIONS.filter((r) => !removed.has(r.id)).map((r) => {
    const ov = plan.structureOverrides?.[r.id];
    return ov ? { ...r, structures: ov } : r;
  });
  return [...base, ...(plan.addRegions ?? [])];
}

/** Back-compat alias — the generic quadruped template. */
export const ANATOMY = CORE_REGIONS;

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
export function regionById(id: string, species?: Sp): AnatomyRegion | undefined {
  return anatomyFor(species).find((r) => r.id === id);
}

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
