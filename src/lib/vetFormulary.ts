// ============================================================================
// الدليل الدوائي البيطري — an on-device veterinary formulary + dose engine.
//
// Same philosophy as labIntelligence.ts: 100% local, deterministic, explainable.
// No server, no key, no subscription. Every number here is established
// small-animal clinical pharmacology encoded as data, so the doctor can always
// see WHY a warning fired. Final judgement always stays with the veterinarian.
//
// Three layers:
//   1. Monographs   — per-drug dose ranges BY SPECIES, routes, concentrations,
//                     and the hard species red-lines (cat + paracetamol, etc).
//   2. Dose math    — weight → mg → ml at the real vial concentration, with
//                     safe rounding to what a syringe can actually measure.
//   3. Safety rules — overdose / underdose / duplicate therapy / dangerous
//                     combinations / species contraindications, before giving.
//
// Refs (encoded, not fetched): Plumb's Veterinary Drug Handbook dose ranges;
// BSAVA Small Animal Formulary; enrofloxacin feline retinotoxicity ≤5 mg/kg
// (Baytril label / Gelatt et al.); feline acetaminophen & permethrin toxicity
// (ASPCA APCC); NSAID + corticosteroid GI ulceration; MDR1/ABCB1 ivermectin
// sensitivity in herding breeds (WSU VCPL).
// ============================================================================
import type { Species } from "@/types";
import { formatDec, foldAr } from "./utils";
import { normalizeDigits } from "./digits";

export type DoseTone = "critical" | "warn" | "info" | "good";

/** How often the dose repeats, in hours. 0 = single / once. */
export type Frequency = 6 | 8 | 12 | 24 | 48 | 0;

export type Route = "PO" | "IV" | "IM" | "SC" | "topical" | "IP" | "otic" | "ocular";

export const ROUTE_LABEL: Record<Route, string> = {
  PO: "فموي",
  IV: "وريدي",
  IM: "عضلي",
  SC: "تحت الجلد",
  topical: "موضعي",
  IP: "بريتوني",
  otic: "بالأذن",
  ocular: "بالعين",
};

export const FREQ_LABEL: Record<Frequency, string> = {
  6: "كل ٦ ساعات",
  8: "كل ٨ ساعات",
  12: "كل ١٢ ساعة",
  24: "مرة باليوم",
  48: "كل يومين",
  0: "جرعة واحدة",
};

/** A per-species dose window. Everything is mg/kg unless noted. */
export interface SpeciesDose {
  species: Species[];
  min: number;          // subtherapeutic below this
  max: number;          // toxic risk above this
  typical: number;      // what the field defaults to
  freq: Frequency;
  routes: Route[];
  /** Hard ceiling that must never be crossed for this species, whatever the indication. */
  hardMax?: number;
  /** Why the hard ceiling exists — shown as the reason on the alert. */
  hardMaxReason?: string;
  note?: string;
}

/** A drug the clinic actually reaches for. */
export interface Monograph {
  id: string;
  ar: string;               // الاسم العلمي بالعربي
  en: string;               // generic name
  brands?: string[];        // ما بيتعرّف عليه الفني بالرف
  /** What the drug ALONE is written as when that is not its generic or a brand:
   *  the generic's first word where the rest is a salt or «acid» («Pyrantel»,
   *  «Tolfenamic»), or the name the clinic uses for a combination («Trimethoprim»
   *  for trimethoprim-sulfa). Matched like the generic — never as a fragment. */
  aka?: string[];
  /** A combination monograph's active ingredients, each as the whole words that
   *  name it (single words, read through `normalizeName`). A name that lists exactly these is this
   *  monograph («Trimethoprim + Sulfadiazine»); one that lists them among other
   *  ingredients CONTAINS it — for bans, allergies and pairs, never for a dose. */
  components?: string[][];
  /** Therapeutic class — drives duplicate-therapy detection. */
  klass: DrugClass;
  doses: SpeciesDose[];
  /** Vial/tablet strengths on the market, mg per ml (or mg per tablet if `solid`). */
  strengths?: number[];
  solid?: boolean;          // tablet: strengths are mg per tablet
  /** Species this drug must NEVER be given to. */
  banned?: { species: Species[]; reason: string }[];
  warnings?: string[];
  maxDailyMgPerKg?: number; // cumulative ceiling across the day
}

export type DrugClass =
  | "nsaid"
  | "corticosteroid"
  | "opioid"
  | "sedative"
  | "anesthetic"
  | "beta-lactam"
  | "fluoroquinolone"
  | "aminoglycoside"
  | "tetracycline"
  | "nitroimidazole"
  | "sulfonamide"
  | "macrolide"
  | "antifungal"
  | "antiparasitic"
  | "antiemetic"
  | "diuretic"
  | "anticonvulsant"
  | "gastroprotectant"
  | "antihistamine"
  | "vitamin"
  | "other";

export const CLASS_LABEL: Record<DrugClass, string> = {
  nsaid: "مضاد التهاب لاستيرويدي (NSAID)",
  corticosteroid: "كورتيزون",
  opioid: "مسكّن أفيوني",
  sedative: "مهدّئ",
  anesthetic: "مخدّر",
  "beta-lactam": "بيتا-لاكتام",
  fluoroquinolone: "فلوروكينولون",
  aminoglycoside: "أمينوغلايكوزيد",
  tetracycline: "تتراسايكلين",
  nitroimidazole: "نيتروإيميدازول",
  sulfonamide: "سلفا",
  macrolide: "ماكروليد",
  antifungal: "مضاد فطريات",
  antiparasitic: "مضاد طفيليات",
  antiemetic: "مضاد قيء",
  diuretic: "مدرّ بول",
  anticonvulsant: "مضاد تشنّج",
  gastroprotectant: "حامي معدة",
  antihistamine: "مضاد هيستامين",
  vitamin: "فيتامين",
  other: "أخرى",
};

const DOG_CAT: Species[] = ["dog", "cat"];

/* ----------------------------- 1. Monographs ------------------------------
 * Ranges are deliberately the conservative, widely-published small-animal
 * windows. Where a species has a genuinely different ceiling (enrofloxacin in
 * cats, meloxicam in cats) it gets its own entry with a hardMax. */
export const FORMULARY: Monograph[] = [
  // ---------------------------------------------------------------- مضادات حيوية
  {
    id: "amoxi-clav",
    ar: "أموكسيسيلين + كلافولانيك",
    en: "Amoxicillin-clavulanate",
    brands: ["Augmentin", "Clavamox", "Synulox"],
    components: [["amoxicillin", "amoxycillin", "أموكسيسيلين"], ["clavulanate", "clavulanic", "كلافولانيك", "كلافولانات"]],
    klass: "beta-lactam",
    strengths: [50, 140, 250],
    doses: [{ species: DOG_CAT, min: 12.5, max: 25, typical: 12.5, freq: 12, routes: ["PO", "SC", "IM"] }],
    warnings: ["إسهال خفيف شائع — أعطِه مع الأكل."],
  },
  {
    id: "amoxicillin",
    ar: "أموكسيسيلين",
    en: "Amoxicillin",
    klass: "beta-lactam",
    strengths: [100, 150],
    doses: [{ species: DOG_CAT, min: 10, max: 22, typical: 15, freq: 12, routes: ["PO", "SC", "IM"] }],
  },
  {
    id: "cephalexin",
    ar: "سيفاليكسين",
    en: "Cephalexin",
    brands: ["Keflex"],
    klass: "beta-lactam",
    solid: true,
    strengths: [250, 500],
    doses: [{ species: DOG_CAT, min: 20, max: 30, typical: 22, freq: 12, routes: ["PO"] }],
  },
  {
    id: "ceftriaxone",
    ar: "سيفترياكسون",
    en: "Ceftriaxone",
    klass: "beta-lactam",
    strengths: [100, 250],
    doses: [{ species: DOG_CAT, min: 25, max: 50, typical: 25, freq: 24, routes: ["IV", "IM"] }],
  },
  {
    id: "enrofloxacin",
    ar: "إنروفلوكساسين",
    en: "Enrofloxacin",
    brands: ["Baytril"],
    klass: "fluoroquinolone",
    strengths: [25, 50, 100],
    doses: [
      { species: ["dog"], min: 5, max: 20, typical: 5, freq: 24, routes: ["PO", "SC", "IM"] },
      {
        species: ["cat"], min: 5, max: 5, typical: 5, freq: 24, routes: ["PO", "SC"],
        hardMax: 5,
        hardMaxReason: "فوق ٥ ملغ/كغ باليوم بتسبب عمى شبكي مفاجئ ودائم بالقطط.",
      },
    ],
    warnings: ["تجنّبه بالحيوانات الصغيرة اللي بعدها بتكبر — بيأذي غضاريف المفاصل."],
  },
  {
    id: "marbofloxacin",
    ar: "ماربوفلوكساسين",
    en: "Marbofloxacin",
    brands: ["Marbocyl"],
    klass: "fluoroquinolone",
    strengths: [20, 100],
    doses: [{ species: DOG_CAT, min: 2, max: 4, typical: 2, freq: 24, routes: ["PO", "SC"] }],
  },
  {
    id: "doxycycline",
    ar: "دوكسيسيكلين",
    en: "Doxycycline",
    klass: "tetracycline",
    solid: true,
    strengths: [50, 100],
    doses: [{ species: DOG_CAT, min: 5, max: 10, typical: 5, freq: 12, routes: ["PO"] }],
    warnings: ["بالقطط: مرّرها بمي أو أكل بعدها — الحبة الجافة بتحرق المريء."],
  },
  {
    id: "metronidazole",
    ar: "ميترونيدازول",
    en: "Metronidazole",
    brands: ["Flagyl"],
    klass: "nitroimidazole",
    solid: true,
    strengths: [250, 500],
    maxDailyMgPerKg: 50,
    doses: [{ species: DOG_CAT, min: 10, max: 25, typical: 15, freq: 12, routes: ["PO", "IV"] }],
    warnings: ["الاستعمال الطويل أو الجرعة العالية بتسبب رنح وعصبية — أوقفه فوراً لو ترنّح."],
  },
  {
    id: "gentamicin",
    ar: "جنتاميسين",
    en: "Gentamicin",
    klass: "aminoglycoside",
    strengths: [40, 80],
    doses: [{ species: DOG_CAT, min: 6, max: 8, typical: 6, freq: 24, routes: ["IV", "IM", "SC"] }],
    warnings: ["سام للكلى والأذن — ممنوع مع الجفاف، رطّب الحيوان أول.", "راقب الكرياتينين خلال الكورس."],
  },
  {
    id: "tmps",
    ar: "ترايميثوبريم + سلفا",
    en: "Trimethoprim-sulfa",
    aka: ["Trimethoprim", "ترايميثوبريم"],
    components: [["trimethoprim", "ترايميثوبريم"], ["sulfa", "sulfadiazine", "sulfamethoxazole", "سلفا", "سلفاديازين", "سلفاميثوكسازول"]],
    klass: "sulfonamide",
    solid: true,
    strengths: [480],
    doses: [{ species: DOG_CAT, min: 15, max: 30, typical: 15, freq: 12, routes: ["PO"] }],
    warnings: ["الكورس الطويل بيسبب جفاف عين (KCS) بالكلاب."],
  },

  // ------------------------------------------------------------- مسكّنات NSAID
  {
    id: "meloxicam",
    ar: "ميلوكسيكام",
    en: "Meloxicam",
    brands: ["Metacam", "Mobic"],
    klass: "nsaid",
    strengths: [1.5, 5],
    doses: [
      { species: ["dog"], min: 0.1, max: 0.2, typical: 0.2, freq: 24, routes: ["PO", "SC"], note: "٠٫٢ أول يوم، بعدها ٠٫١ ملغ/كغ." },
      {
        species: ["cat"], min: 0.05, max: 0.1, typical: 0.1, freq: 24, routes: ["PO", "SC"],
        hardMax: 0.1,
        hardMaxReason: "القطط بتطرح الميلوكسيكام ببطء — التكرار بجرعة الكلاب بيوقّع الكلى.",
        note: "٠٫١ جرعة أولى وحيدة، وبعدها ٠٫٠٥ ملغ/كغ فقط لأيام محدودة.",
      },
    ],
    warnings: ["ممنوع مع الجفاف أو قصور الكلى أو قرحة معدة.", "لا تعطيه أبداً مع كورتيزون أو NSAID تاني."],
  },
  {
    id: "carprofen",
    ar: "كاربروفين",
    en: "Carprofen",
    brands: ["Rimadyl"],
    klass: "nsaid",
    solid: true,
    strengths: [25, 50, 100],
    banned: [{ species: ["cat"], reason: "القطط ما بتقدر تستقلبه — سُميّة كلوية وكبدية. استعمل ميلوكسيكام بجرعة القطط بدله." }],
    doses: [{ species: ["dog"], min: 2, max: 4.4, typical: 2.2, freq: 12, routes: ["PO", "SC"], note: "٢٫٢ كل ١٢ ساعة أو ٤٫٤ مرة باليوم." }],
    warnings: ["راقب إنزيمات الكبد بالكورسات الطويلة."],
  },
  {
    id: "ketoprofen",
    ar: "كيتوبروفين",
    en: "Ketoprofen",
    klass: "nsaid",
    strengths: [10, 100],
    doses: [{ species: DOG_CAT, min: 1, max: 2, typical: 1, freq: 24, routes: ["SC", "IM", "PO"], note: "لا تتجاوز ٣ أيام متتالية." }],
  },
  {
    id: "paracetamol",
    ar: "باراسيتامول",
    en: "Paracetamol / Acetaminophen",
    brands: ["Panadol", "Adol", "Tylenol"],
    klass: "nsaid",
    solid: true,
    strengths: [500],
    banned: [{
      species: ["cat"],
      reason: "قاتل للقطط — حبة وحدة بتكفي. القطط ناقصها إنزيم الغلوكورونيداز فبيتحوّل لسم بيخرّب الهيموغلوبين (ميتهيموغلوبينيميا) وبيقتل خلال ساعات.",
    }],
    doses: [{ species: ["dog"], min: 10, max: 15, typical: 10, freq: 12, routes: ["PO"], note: "للكلاب فقط ولمدة قصيرة." }],
    warnings: ["أي قطة تعرّضت للباراسيتامول = طوارئ فورية (N-acetylcysteine)."],
  },
  {
    id: "ibuprofen",
    ar: "آيبوبروفين",
    en: "Ibuprofen",
    brands: ["Brufen", "Advil"],
    klass: "nsaid",
    banned: [{
      species: ["dog", "cat"],
      reason: "ممنوع بيطرياً — هامش الأمان ضيّق جداً وبيسبب قرحة معدة نازفة وفشل كلوي. استعمل NSAID بيطري مرخّص.",
    }],
    doses: [],
  },
  {
    id: "aspirin",
    ar: "أسبرين",
    en: "Aspirin",
    klass: "nsaid",
    solid: true,
    strengths: [81, 325],
    doses: [{ species: ["dog"], min: 10, max: 20, typical: 10, freq: 12, routes: ["PO"], note: "مسكّن — نادراً ما ينصح فيه اليوم." }],
    banned: [{ species: ["cat"], reason: "القطط بتطرحه ببطء شديد — بيتراكم ويسمّم. لا تستعمله إلا بجرعة اختصاصي وفواصل طويلة جداً." }],
    warnings: ["بيمنع تخثّر الصفيحات — أوقفه قبل أي جراحة."],
  },

  // ------------------------------------------------------------------ كورتيزون
  {
    id: "dexamethasone",
    ar: "ديكساميثازون",
    en: "Dexamethasone",
    klass: "corticosteroid",
    strengths: [2, 4],
    doses: [{ species: DOG_CAT, min: 0.1, max: 0.5, typical: 0.2, freq: 24, routes: ["IV", "IM", "SC"] }],
    warnings: ["ممنوع مع أي NSAID — قرحة معدة نازفة.", "بيرفع السكر ويخفي الالتهاب — لا تعطيه قبل التشخيص."],
  },
  {
    id: "prednisolone",
    ar: "بريدنيزولون",
    en: "Prednisolone",
    klass: "corticosteroid",
    solid: true,
    strengths: [5, 20],
    doses: [{ species: DOG_CAT, min: 0.5, max: 2, typical: 0.5, freq: 24, routes: ["PO"], note: "٠٫٥–١ مضاد التهاب، ٢ مثبّط مناعة." }],
    warnings: ["لا توقفه فجأة بعد كورس طويل — نزّله بالتدريج."],
  },

  // -------------------------------------------------------- تسكين وتهدئة وتخدير
  {
    id: "tramadol",
    ar: "ترامادول",
    en: "Tramadol",
    klass: "opioid",
    solid: true,
    strengths: [50],
    doses: [{ species: DOG_CAT, min: 2, max: 5, typical: 3, freq: 8, routes: ["PO"] }],
  },
  {
    id: "buprenorphine",
    ar: "بوبرينورفين",
    en: "Buprenorphine",
    klass: "opioid",
    strengths: [0.3],
    doses: [{ species: DOG_CAT, min: 0.01, max: 0.02, typical: 0.02, freq: 8, routes: ["IV", "IM", "SC"], note: "بالقطط: ممتاز عبر الغشاء المخاطي بالفم." }],
  },
  {
    id: "butorphanol",
    ar: "بوتورفانول",
    en: "Butorphanol",
    klass: "opioid",
    strengths: [10],
    doses: [{ species: DOG_CAT, min: 0.2, max: 0.4, typical: 0.2, freq: 6, routes: ["IV", "IM", "SC"] }],
  },
  {
    id: "xylazine",
    ar: "زايلازين",
    en: "Xylazine",
    klass: "sedative",
    strengths: [20, 100],
    doses: [
      { species: ["dog"], min: 0.5, max: 1.1, typical: 1, freq: 0, routes: ["IM", "IV"] },
      { species: ["cat"], min: 0.5, max: 1.1, typical: 1, freq: 0, routes: ["IM"] },
    ],
    warnings: ["بيبطّئ القلب بشدة — جهّز أتروبين.", "بيسبب قيء بالقطط (متوقّع).", "ممنوع مع أمراض القلب."],
  },
  {
    id: "ketamine",
    ar: "كيتامين",
    en: "Ketamine",
    klass: "anesthetic",
    strengths: [50, 100],
    doses: [{ species: DOG_CAT, min: 5, max: 10, typical: 5, freq: 0, routes: ["IM", "IV"], note: "دائماً مع مهدّئ (زايلازين/ميدازولام) — لحاله بيسبب تشنّج عضلي." }],
    warnings: ["ممنوع لحاله بدون مهدّئ.", "بيرفع الضغط داخل العين والدماغ."],
  },
  {
    id: "diazepam",
    ar: "ديازيبام",
    en: "Diazepam",
    klass: "anticonvulsant",
    strengths: [5],
    doses: [{ species: DOG_CAT, min: 0.5, max: 1, typical: 0.5, freq: 0, routes: ["IV", "IP"], note: "لوقف التشنّج — كرّرها لحد ٣ مرات." }],
    warnings: ["بالقطط: الاستعمال الفموي المتكرر بيسبب فشل كبد حاد."],
  },

  // ------------------------------------------------------- معدة وقيء ومدرّات
  {
    id: "maropitant",
    ar: "ماروبيتانت",
    en: "Maropitant",
    brands: ["Cerenia"],
    klass: "antiemetic",
    strengths: [10],
    doses: [{ species: DOG_CAT, min: 1, max: 1, typical: 1, freq: 24, routes: ["SC", "PO"], note: "لا تتجاوز ٥ أيام متتالية." }],
    warnings: ["الحقن تحت الجلد بيوجع — برّد الأمبولة بالثلاجة قبلها."],
  },
  {
    id: "metoclopramide",
    ar: "ميتوكلوبراميد",
    en: "Metoclopramide",
    brands: ["Primperan"],
    klass: "antiemetic",
    strengths: [5],
    doses: [{ species: DOG_CAT, min: 0.2, max: 0.5, typical: 0.3, freq: 8, routes: ["SC", "IM", "IV", "PO"] }],
    warnings: ["ممنوع لو في انسداد معوي — بيزيد الحركة على انسداد."],
  },
  {
    id: "omeprazole",
    ar: "أوميبرازول",
    en: "Omeprazole",
    klass: "gastroprotectant",
    solid: true,
    strengths: [20],
    doses: [{ species: DOG_CAT, min: 0.5, max: 1, typical: 1, freq: 24, routes: ["PO"] }],
  },
  {
    id: "furosemide",
    ar: "فوروسيميد",
    en: "Furosemide",
    brands: ["Lasix"],
    klass: "diuretic",
    strengths: [10, 50],
    doses: [{ species: DOG_CAT, min: 1, max: 4, typical: 2, freq: 12, routes: ["IV", "IM", "SC", "PO"] }],
    warnings: ["بيجفّف ويهبّط البوتاسيوم — راقب الكلى والشوارد.", "لا تجمعه مع جنتاميسين — سُميّة كلوية مضاعفة."],
  },
  {
    id: "atropine",
    ar: "أتروبين",
    en: "Atropine",
    klass: "other",
    strengths: [0.5, 1],
    doses: [{ species: DOG_CAT, min: 0.02, max: 0.04, typical: 0.02, freq: 0, routes: ["IV", "IM", "SC"] }],
  },
  {
    id: "diphenhydramine",
    ar: "ديفينهيدرامين",
    en: "Diphenhydramine",
    klass: "antihistamine",
    strengths: [10, 50],
    doses: [{ species: DOG_CAT, min: 1, max: 2, typical: 2, freq: 8, routes: ["IM", "PO"] }],
  },

  // ------------------------------------------------------------- طفيليات وفيتامينات
  {
    id: "ivermectin",
    ar: "آيفرمكتين",
    en: "Ivermectin",
    klass: "antiparasitic",
    strengths: [10],
    doses: [{ species: DOG_CAT, min: 0.2, max: 0.4, typical: 0.2, freq: 0, routes: ["SC", "PO"] }],
    warnings: [
      "خطر MDR1: الكولي والشيبرد الأسترالي والسلوقي وأشباهها بتنهار عصبياً حتى بجرعة عادية.",
      "ممنوع بالجراء تحت ٦ أسابيع.",
    ],
  },
  {
    id: "praziquantel",
    ar: "برازيكوانتيل",
    en: "Praziquantel",
    klass: "antiparasitic",
    solid: true,
    strengths: [50],
    doses: [{ species: DOG_CAT, min: 5, max: 7.5, typical: 5, freq: 0, routes: ["PO", "SC"] }],
  },
  {
    id: "fenbendazole",
    ar: "فينبيندازول",
    en: "Fenbendazole",
    brands: ["Panacur"],
    klass: "antiparasitic",
    strengths: [100],
    doses: [{ species: DOG_CAT, min: 50, max: 50, typical: 50, freq: 24, routes: ["PO"], note: "٣ أيام متتالية." }],
  },
  {
    id: "permethrin",
    ar: "بيرميثرين",
    en: "Permethrin",
    klass: "antiparasitic",
    banned: [{
      species: ["cat"],
      reason: "قاتل للقطط — رعشة وتشنّجات وموت. حتى ملامسة كلب متعالج طازج بتكفي. اغسل القطة فوراً بمي دافي وصابون واعمل تحكّم تشنّج.",
    }],
    doses: [{ species: ["dog"], min: 0, max: 0, typical: 0, freq: 0, routes: ["topical"], note: "موضعي حسب وزن العبوة." }],
  },
  {
    id: "vitamin-k1",
    ar: "فيتامين ك١",
    en: "Vitamin K1",
    aka: ["Vitamin K", "فيتامين ك"],
    klass: "vitamin",
    strengths: [10],
    doses: [{ species: DOG_CAT, min: 2.5, max: 5, typical: 2.5, freq: 12, routes: ["SC", "PO"], note: "تسمّم مبيدات فئران — كمّل ٣–٤ أسابيع." }],
    warnings: ["لا تحقنه بالوريد — صدمة تحسّسية."],
  },

  // -------------------------------- بقية أدوية الكتالوج اللي إلها قواعد أمان
  {
    id: "clindamycin",
    ar: "كليندامايسين",
    en: "Clindamycin",
    klass: "macrolide",
    solid: true,
    strengths: [25, 75, 150],
    doses: [{ species: DOG_CAT, min: 5.5, max: 11, typical: 11, freq: 12, routes: ["PO"] }],
    warnings: ["بالقطط: مرّرها بمي بعدها — بتعلق بالمريء."],
  },
  {
    id: "amikacin",
    ar: "أميكاسين",
    en: "Amikacin",
    klass: "aminoglycoside",
    strengths: [50, 250],
    doses: [{ species: DOG_CAT, min: 15, max: 20, typical: 15, freq: 24, routes: ["IV", "IM", "SC"] }],
    warnings: ["سام للكلى — ممنوع مع الجفاف، وراقب الكرياتينين."],
  },
  {
    id: "firocoxib",
    ar: "فيروكوكسيب",
    en: "Firocoxib",
    brands: ["Previcox"],
    klass: "nsaid",
    solid: true,
    strengths: [57, 227],
    banned: [{ species: ["cat"], reason: "غير مرخّص ولا موثّق بالقطط — استعمل ميلوكسيكام بجرعة القطط." }],
    doses: [{ species: ["dog"], min: 5, max: 5, typical: 5, freq: 24, routes: ["PO"] }],
  },
  {
    id: "robenacoxib",
    ar: "روبيناكوكسيب",
    en: "Robenacoxib",
    brands: ["Onsior"],
    klass: "nsaid",
    solid: true,
    strengths: [6, 20, 40],
    doses: [
      { species: ["dog"], min: 1, max: 2, typical: 1, freq: 24, routes: ["PO", "SC"] },
      { species: ["cat"], min: 1, max: 2.4, typical: 1, freq: 24, routes: ["PO", "SC"], note: "لا تتجاوز ٦ أيام متتالية بالقطط." },
    ],
  },
  {
    id: "tolfenamic",
    ar: "حمض التولفيناميك",
    en: "Tolfenamic acid",
    aka: ["Tolfenamic", "تولفيناميك"],
    klass: "nsaid",
    strengths: [40],
    doses: [{ species: DOG_CAT, min: 4, max: 4, typical: 4, freq: 24, routes: ["SC", "IM", "PO"], note: "٣ أيام، ثم توقّف ٤ أيام." }],
  },
  {
    id: "gabapentin",
    ar: "غابابنتين",
    en: "Gabapentin",
    klass: "anticonvulsant",
    solid: true,
    strengths: [100, 300],
    doses: [{ species: DOG_CAT, min: 5, max: 20, typical: 10, freq: 12, routes: ["PO"], note: "بالقطط: ١٠٠ ملغ قبل الزيارة بساعتين بهدّيها كثير." }],
    warnings: ["تجنّب الشراب البشري المحلّى بالزايليتول — سام."],
  },
  {
    id: "acepromazine",
    ar: "أسيبرومازين",
    en: "Acepromazine",
    klass: "sedative",
    strengths: [10],
    doses: [{ species: DOG_CAT, min: 0.01, max: 0.1, typical: 0.03, freq: 0, routes: ["IM", "SC", "IV", "PO"] }],
    warnings: ["بينزّل الضغط — ممنوع بالصدمة أو النزف.", "بيقلّل عتبة التشنّج — تجنّبه بالصرع.", "البوكسر حسّاس جداً — نصّف الجرعة."],
  },
  {
    id: "midazolam",
    ar: "ميدازولام",
    en: "Midazolam",
    klass: "sedative",
    strengths: [5],
    doses: [{ species: DOG_CAT, min: 0.1, max: 0.3, typical: 0.2, freq: 0, routes: ["IV", "IM"] }],
  },
  {
    id: "dexmedetomidine",
    ar: "ديكسميديتوميدين",
    en: "Dexmedetomidine",
    brands: ["Dexdomitor"],
    klass: "sedative",
    strengths: [0.5],
    doses: [{ species: DOG_CAT, min: 0.005, max: 0.02, typical: 0.01, freq: 0, routes: ["IM", "IV"], note: "الجرعة الدقيقة بالميكروغرام/م² — راجع الجدول." }],
    warnings: ["بيبطّئ القلب بشدة — الترياق أتيباميزول.", "ممنوع بأمراض القلب أو الكبد أو التنفّس."],
  },
  {
    id: "prednisone",
    ar: "بريدنيزون",
    en: "Prednisone",
    klass: "corticosteroid",
    solid: true,
    strengths: [5, 20],
    doses: [{ species: ["dog"], min: 0.5, max: 2, typical: 0.5, freq: 24, routes: ["PO"] }],
    warnings: ["القطط بتحوّله بصعوبة — استعمل بريدنيزولون بدله بالقطط."],
  },
  {
    id: "methylprednisolone",
    ar: "ميثيل بريدنيزولون",
    en: "Methylprednisolone",
    klass: "corticosteroid",
    strengths: [20, 40],
    doses: [{ species: DOG_CAT, min: 0.5, max: 1, typical: 0.5, freq: 24, routes: ["IM", "PO"] }],
  },
  {
    id: "famotidine",
    ar: "فاموتيدين",
    en: "Famotidine",
    klass: "gastroprotectant",
    solid: true,
    strengths: [10, 20],
    doses: [{ species: DOG_CAT, min: 0.5, max: 1, typical: 0.5, freq: 24, routes: ["PO", "IV", "SC"] }],
  },
  {
    id: "ondansetron",
    ar: "أوندانسيترون",
    en: "Ondansetron",
    klass: "antiemetic",
    strengths: [2, 4],
    doses: [{ species: DOG_CAT, min: 0.1, max: 1, typical: 0.5, freq: 12, routes: ["IV", "PO", "SC"] }],
  },
  {
    id: "ketoconazole",
    ar: "كيتوكونازول",
    en: "Ketoconazole",
    klass: "antifungal",
    solid: true,
    strengths: [200],
    doses: [{ species: DOG_CAT, min: 5, max: 10, typical: 5, freq: 12, routes: ["PO"] }],
    warnings: ["سام للكبد — راقب الإنزيمات.", "بيرفع تركيز أدوية كثيرة (سايكلوسبورين، بنزوديازيبين)."],
  },
  {
    id: "itraconazole",
    ar: "إيتراكونازول",
    en: "Itraconazole",
    klass: "antifungal",
    solid: true,
    strengths: [100],
    doses: [{ species: DOG_CAT, min: 5, max: 10, typical: 5, freq: 24, routes: ["PO"] }],
    warnings: ["سام للكبد — أوقفه لو فقد الشهية."],
  },
  {
    id: "pimobendan",
    ar: "بيموبيندان",
    en: "Pimobendan",
    brands: ["Vetmedin"],
    klass: "other",
    solid: true,
    strengths: [1.25, 2.5, 5],
    doses: [{ species: DOG_CAT, min: 0.25, max: 0.3, typical: 0.25, freq: 12, routes: ["PO"], note: "على معدة فاضية — قبل الأكل بساعة." }],
  },
  {
    id: "benazepril",
    ar: "بينازيبريل",
    en: "Benazepril",
    klass: "other",
    solid: true,
    strengths: [5, 20],
    doses: [{ species: DOG_CAT, min: 0.25, max: 0.5, typical: 0.5, freq: 24, routes: ["PO"] }],
    warnings: ["راقب الكلى والبوتاسيوم بعد أسبوع من البدء.", "ممنوع بالحمل."],
  },
  {
    id: "calcium-gluconate",
    ar: "غلوكونات الكالسيوم ١٠٪",
    en: "Calcium gluconate 10%",
    klass: "other",
    strengths: [100],
    doses: [{ species: DOG_CAT, min: 50, max: 150, typical: 100, freq: 0, routes: ["IV"], note: "ببطء شديد على ١٠–٢٠ دقيقة." }],
    warnings: ["احقنه ببطء مع مراقبة القلب — الحقن السريع بيوقّف القلب."],
  },
  {
    id: "epinephrine",
    ar: "إبينفرين (أدرينالين)",
    en: "Epinephrine",
    klass: "other",
    strengths: [1],
    doses: [{ species: DOG_CAT, min: 0.01, max: 0.1, typical: 0.01, freq: 0, routes: ["IV", "IM"], note: "٠٫٠١ للإنعاش، ٠٫١ للجرعة العالية عند الفشل." }],
  },
  {
    id: "atipamezole",
    ar: "أتيباميزول",
    en: "Atipamezole",
    brands: ["Antisedan"],
    klass: "other",
    strengths: [5],
    doses: [{ species: DOG_CAT, min: 0.05, max: 0.25, typical: 0.1, freq: 0, routes: ["IM"], note: "ترياق الميديتوميدين/الزايلازين." }],
  },
  {
    id: "naloxone",
    ar: "نالوكسون",
    en: "Naloxone",
    klass: "other",
    strengths: [0.4],
    doses: [{ species: DOG_CAT, min: 0.01, max: 0.04, typical: 0.02, freq: 0, routes: ["IV", "IM"], note: "ترياق الأفيونيات." }],
  },
  {
    id: "selamectin",
    ar: "سيلامكتين",
    en: "Selamectin",
    brands: ["Revolution", "Stronghold"],
    klass: "antiparasitic",
    doses: [{ species: DOG_CAT, min: 6, max: 12, typical: 6, freq: 0, routes: ["topical"], note: "موضعي بين الكتفين، شهرياً." }],
  },
  {
    id: "pyrantel",
    ar: "بيرانتيل",
    en: "Pyrantel pamoate",
    aka: ["Pyrantel"],
    klass: "antiparasitic",
    doses: [{ species: DOG_CAT, min: 5, max: 10, typical: 5, freq: 0, routes: ["PO"], note: "كرّرها بعد أسبوعين." }],
  },
];

export const DRUG_BY_ID = new Map(FORMULARY.map((d) => [d.id, d] as const));

/** Free-text search across Arabic, English, and brand names. */
export function searchDrugs(q: string, limit = 12): Monograph[] {
  const s = q.trim().toLowerCase();
  if (!s) return FORMULARY.slice(0, limit);
  const hit = (d: Monograph) =>
    d.ar.includes(s) ||
    d.en.toLowerCase().includes(s) ||
    (d.brands ?? []).some((b) => b.toLowerCase().includes(s));
  return FORMULARY.filter(hit).slice(0, limit);
}

/* ------------------------- Matching the clinic's own names ------------------
 * The plan stores a drug as FREE TEXT, and the catalog decorates names with
 * strengths and brands — "Amoxicillin 250mg", "Enrofloxacin (Baytril)",
 * "Paracetamol (dogs only)". So we strip the decoration and match on the stem,
 * longest generic first so "Amoxicillin-Clavulanate" never resolves to plain
 * "Amoxicillin".
 *
 * Both sides pass through the SAME fold (`foldAr`, the one search uses): the
 * formulary writes «آيبوبروفين» and «أسبرين», a clinic types «ايبوبروفين» — 7
 * rows for a cat in production (2026-10-06) matched nothing, so no species ban.
 * Eastern digits become ASCII first (as `searchable` does), so «ك١» and «K1» end
 * alike. A digit glued to a letter is part of the name — «K1» is not «K3» — and a
 * bare number is a strength or a count.
 *
 * Arabic punctuation is punctuation. «،» «؛» «؟» «٪» sit inside the Arabic block, and
 * a class that keeps the block kept them as letters: «أموكسيسيلين، جنتاميسين» was one
 * word «اموكسيسيلين،» — where the Latin comma of «Amoxicillin, Gentamicin» was a space. */
const AR_PUNCT = /[،؛؟٪-٭۔]/g; // ، ؛ ؟ ٪ ٫ ٬ ٭ ۔
const normalizeName = (s: string) =>
  foldAr(normalizeDigits(s))
    .replace(/\([^)]*\)/g, " ")        // drop "(Baytril)", "(dogs only)"
    // drop "250mg", "2%", «١٠٪» — a number, then a unit that ends there: ". G" of
    // «Meloxicam. Gentamicin» is no strength, and it left «meloxicam entamicin».
    .replace(/\d[\d.]*\s*(mg|ml|mcg|g|%|٪)(?![a-z])/g, " ")
    .replace(AR_PUNCT, " ")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .replace(/(^| )\d+(?= |$)/g, "$1")  // drop "200", "52" — keep "k1", "ad3e"
    .replace(/ +/g, " ")
    .trim();

/** The same fold as `normalizeName`, every word kept — brackets, strengths and all.
 *  For text read as words, not as a drug name: a charted allergy («حساسية (أموكسيسيلين)»),
 *  the form a name declares («Gentamicin (eye drops)»). */
const toWords = (s: string) =>
  foldAr(normalizeDigits(s)).replace(AR_PUNCT, " ").replace(/[^a-z0-9؀-ۿ]+/g, " ").replace(/ +/g, " ").trim();

/** Generic stems, longest-first, so compound names win over their prefixes. A
 *  generic name that lists synonyms ("Paracetamol / Acetaminophen") answers to
 *  each of them alone too — "Paracetamol (dogs only)" is the drug, not a guess —
 *  and so does what the drug alone is written as (`aka`: «Pyrantel»). */
interface IndexKey {
  key: string;
  drug: Monograph;
  /** The key cut for the completion pass once, not on every name it is tried against. */
  words: number; head: string; last: string;
}
const MATCH_INDEX: IndexKey[] = FORMULARY
  .flatMap((d) => [...new Set([d.en, ...d.en.split("/"), d.ar, ...(d.aka ?? []), ...(d.brands ?? [])].map(normalizeName))]
    .map((key) => {
      const ws = key.split(" ");
      return { key, drug: d, words: ws.length, head: ws.slice(0, -1).join(" "), last: ws[ws.length - 1] };
    }))
  .filter((x) => x.key.length > 2)
  .sort((a, b) => b.key.length - a.key.length);
/** A name that IS a key — the longest-first order decides a key two drugs share, as `find` did. */
const EXACT = new Map<string, Monograph>();
for (const x of MATCH_INDEX) if (!EXACT.has(x.key)) EXACT.set(x.key, x.drug);

/** Combination monographs, the whole words that name each of their ingredients, and the
 *  drugs those words alone name (`covers`: «Amoxicillin» inside «Amoxicillin + Clavulanic
 *  acid» is the combination's ingredient, not a second drug beside it). */
const COMBOS = FORMULARY.filter((d) => d.components?.length).map((d) => {
  const components = d.components!.map((names) => new Set(names.map(normalizeName)));
  const words = new Set(components.flatMap((s) => [...s]));
  const covers = new Set(MATCH_INDEX.filter((x) => x.drug !== d && x.key.split(" ").every((w) => words.has(w))).map((x) => x.drug));
  return { drug: d, components, covers };
});
const isComponentWord = (w: string) => COMBOS.some((c) => c.components.some((s) => s.has(w)));

/* ── الاسمُ الذي يعدّد موادَّه ليس واحدةً منها (١٤/١٠) ─────────────────────────
 * عيادتان كتبتا بتصنيفاتهما «Oxytetracycline + Thiamphenicol + Prednisolone +
 * Lidocaine + Bromhexine (Bio-Sone)» و«Florfenicol + … + Prednisolone … (Vimespiro)»،
 * فاحتوت المطابقةُ «prednisolone» وصار المركّبُ بريدنيزولون: عنوانُه «بريدنيزولون»،
 * وجرعتُه وعيارُ حبّته ونافذتُه منه. ومثلُها «Florfenicol + Doxycycline» ⇒ دوكسيسيكلين
 * و«Ciprofloxacin + Flagyle» ⇒ ميترونيدازول.
 *
 * فالاسمُ يُقرأ قائمةَ موادّ، وكلُّ مادةٍ تُطابَق وحدها: الاسمُ مونوغرافٌ واحد **فقط إن
 * سمّت كلُّ موادّه ذلك المونوغراف** — مترادفان («Paracetamol / Acetaminophen»)، أو موادُّ
 * مركّبٍ بأسمائها («Trimethoprim + Sulfadiazine» ⇒ TMPS). أمّا «Amoxicillin-Clavulanate +
 * Paracetamol» فمادّتان: المركّبُ والباراسيتامول — وكان عدُّ الموادّ وحده يجعله المركّبَ
 * فيضيع منعُ الباراسيتامول للقطّ. ومنعُ الموادّ وحساسيتُها وتعارضُها يُقرأ من كلّ مادةٍ
 * تُعرف (ingredientMonographs) — لا جرعة.
 *
 * الفواصلُ: «+» (بفراغٍ وبلاه، وبالعربي «دوكسي +فلورفنيكول»)، و«&»، وكلمة «and»
 * («doxycycline and flor») — مقيسةٌ بالإنتاج؛ و«/» و«,» و«;» و«with» كما تُكتب بالإنجليزية —
 * **وتوائمُها العربية مثلها**: «،» و«؛» و«مع» و«و» المنفصلة. كانت «أموكسيسيلين مع جنتاميسين»
 * و«أموكسيسيلين، جنتاميسين» جزءاً واحداً فصارتا أموكسيسيلين: جرعتُه وعيارُه يُبذران لخليط،
 * والقطّةُ المجفّفة بلا «أمينوغلايكوزيد مع جفاف» — وبـ«and» و«,» يوقفها. فاصلٌ بخطٍّ دون توأمه
 * تطبيعٌ بطرفٍ واحد: يفشل بصمت ويبدو أنه يعمل. أمّا «و» الملتصقة فتقسم حين يليها اسمُ مادةٍ
 * يعرفها الدليل («أموكسيسيلين وجنتاميسين») — لا «كلاب وقطط» ولا «للعين والاذن» ولا «وردية»
 * (هكذا تلتصق «و» بالإنتاج: وصفٌ لا مادّة). ولا «-»: «Amoxicillin-Clavulanate»
 * و«Trimethoprim-Sulfadiazine» منتجٌ واحد كلٌّ منهما. ونسبةُ الوحدات عيارٌ لا قائمة
 * («250mg/5ml»، «mg/kg»، «١٫٥ ملغ/مل»، «1% w/v»)، والفاصلةُ بين رقمين كسرٌ («1,5%»، «١،٥»).
 * وما بين القوسين يُشال أوّلاً — «(Bio-Sone)» اسمٌ تجاريّ لا مادّة.
 *
 * وجزءٌ ليس فيه إلا ما لا يكون مادّةً ليس مادّة (NOT_INGREDIENT): لمن هو («for dogs and
 * cats»)، وشكلُه («, oral suspension»، «, injectable»)، وعبوتُه («1g/vial»، «with dosing
 * syringe»)، وعيارُه بالكلمات («, low dose»، «, 10 tabs»)، وكيف يُعطى («مع الأكل»)، وما يعالج
 * («and ear infections»). «/» و«,» و«with» دخلت بالجولة الثانية بلا هذا، فقطعت «Enrofloxacin,
 * injectable» عن دليلها: قطّةٌ ٤ كغ بـ١٠ ملغ/كغ بلا «تجاوزت السقف» (العمى). والكلمةُ المجهولة
 * تبقى مادّةً مجهولة: «Florfenicol, injectable» لا شيء، و«Florfenicol + Doxycycline» ليست
 * دوكسيسيكلين. */
const AR_UNIT = "ملغم|ملغ|ملجم|مغ|غرام|غم|ملل|مل|كغم|كغ|كيلو|لتر";
const UNIT_RATIO = new RegExp(
  `(?:\\d[\\d.]*\\s*(?:mg|mcg|µg|g|iu|ml|%|٪|${AR_UNIT})?|\\b(?:mg|mcg|µg|g|iu|ml)|(?:^|\\s)(?:${AR_UNIT}))` +
  `\\s*\\/\\s*(?:\\d[\\d.]*\\s*)?(?:ml|kg|l|g|mg|tabs?|tablets?|doses?|${AR_UNIT}|حبة|حبه|قرص|جرعة|جرعه)(?![a-z0-9؀-ۿ])`, "gi");
const CONCENTRATION = /\b[wv]\s*\/\s*[wv]\b/gi;   // «1% w/v», «5% w/w»
const LIST_SEP = /\+|&|\/|,|;|،|؛|\band\b|\bwith\b|(?:^|\s)(?:مع|و)(?=\s|$)/i;
const NOT_INGREDIENT = new Set([
  // لمن
  "dog", "dogs", "cat", "cats", "puppy", "puppies", "kitten", "kittens", "bird", "birds", "poultry", "horse", "horses",
  "pet", "pets", "small", "large", "breed", "breeds", "adult", "adults",
  "كلب", "كلاب", "قط", "قطط", "قطة", "جراء", "كتن", "طير", "طيور", "دواجن",
  // حشو
  "for", "only", "use", "all", "in", "per", "of", "by", "via", "لل", "ل", "في", "من", "على",
  // الشكل
  "oral", "orally", "injection", "injectable", "injectible", "inj", "suspension", "solution", "syrup", "drop", "drops",
  "tablet", "tablets", "tab", "tabs", "caplet", "caplets", "capsule", "capsules", "cap", "caps", "chewable", "chewables",
  "chew", "chews", "powder", "granules", "paste", "gel", "cream", "ointment", "spray", "lotion", "shampoo", "bolus",
  "soluble", "water", "wsp", "ready", "rtu",
  "حقن", "حقنة", "إبرة", "ابر", "فموي", "شراب", "معلق", "محلول", "قطرة", "قطرات", "نقط", "حبوب", "حبة", "أقراص", "قرص",
  "كبسول", "كبسولة", "كبسولات", "بودرة", "مسحوق", "معجون", "جل", "كريم", "مرهم", "بخاخ", "سبري", "لوشن", "شامبو", "ماء", "مذاب",
  // العبوة
  "vial", "vials", "amp", "amps", "ampoule", "ampoules", "ampule", "ampules", "bottle", "bottles", "sachet", "sachets",
  "syringe", "syringes", "dosing", "pack", "box", "strip", "strips", "blister", "pipette", "pipettes", "tube",
  "فيال", "أمبول", "أمبولة", "عبوة", "علبة", "سرنجة", "شريط", "ظرف", "أنبوب",
  // العيار بالكلمات
  "low", "high", "dose", "doses", "dosage", "strength", "mg", "ml", "mcg", "g", "kg", "iu", "unit", "units",
  "جرعة", "جرعات", "ملغ", "ملغم", "ملجم", "مغ", "مل", "ملل", "غم", "غرام", "كغ", "كغم", "وحدة",
  // كيف يُعطى
  "food", "meal", "meals", "after", "before", "أكل", "طعام", "وجبة", "بعد", "قبل",
  // ما يعالج
  "skin", "ear", "ears", "eye", "eyes", "infection", "infections", "pain", "wound", "wounds",
  "جلد", "أذن", "عين", "التهاب", "التهابات", "ألم", "جروح",
].map(normalizeName));
/** The article an Arabic word may carry before a qualifier: «القطط»، «للقطط»، «بالأكل»، «والماء». */
const bareArticle = (w: string) => w.replace(/^(?:[وفبك]?ال|لل)(?=..)/, "");
const isQualifier = (n: string) => n.split(" ").every((w) => NOT_INGREDIENT.has(w) || NOT_INGREDIENT.has(bareArticle(w)));

/** A «و» glued to the next word joins two ingredients only when that word names one
 *  («أموكسيسيلين وجنتاميسين»); «كلاب وقطط» and «وردية» are not. A «و» standing alone is
 *  «and» (LIST_SEP). */
function splitWaw(part: string): string[] {
  const groups: string[][] = [[]];
  for (const w of part.trim().split(/\s+/)) {
    const rest = w.length > 2 && w.startsWith("و") ? w.slice(1) : "";
    const n = rest && normalizeName(rest);
    if (groups[groups.length - 1].length && n && (EXACT.has(n) || isComponentWord(n))) { groups.push([rest]); continue; }
    groups[groups.length - 1].push(w);
  }
  return groups.map((g) => g.join(" "));
}

/** The active ingredients a free-text name lists, as written — one entry for a
 *  plain name. Parenthesised brands and notes are dropped first, and a part made
 *  only of qualifiers («cats», «للقطط», «oral suspension», «vial») is no ingredient. */
export function ingredientParts(name: string): string[] {
  return normalizeDigits(name).replace(/\([^)]*\)/g, " ").replace(/(\d)[,،](\d)/g, "$1.$2")
    .replace(UNIT_RATIO, " ").replace(CONCENTRATION, " ")
    .split(LIST_SEP).flatMap(splitWaw)
    .map((s) => s.trim())
    .filter((s) => { const n = normalizeName(s); return n !== "" && !isQualifier(n); });
}

/** Shortest unfinished word the completion pass will finish. Measured on every
 *  distinct production name (2026-10-14): the shortest it rightly finished was
 *  «parac» (5); below it sat «CA» ⇒ calcium gluconate. Four keeps the clinic
 *  shorthands that name one drug — «doxy», «enro», «dexa» — and drops the
 *  two- and three-letter fragments («ca», «ace», «fur») that name nothing. */
const MIN_COMPLETION = 4;

/** What an Arabic word may carry before a name and still be that name: «و» or «ف», then
 *  «ب» «ك» «ل», then the article — «التولفيناميك»، «للديكساميثازون»، «وأموكسيسيلين». */
const PROCLITIC = /^[وف]?(?:[بكل]?ال|لل|[بكل])?$/;

/**
 * Where `n` holds the stem `key` as words, or -1. It starts where a word starts, or
 * after an Arabic proclitic (PROCLITIC); it ends where a word ends — or inside one only
 * if its own last word is a stem of MIN_COMPLETION letters and what follows in that word
 * is shorter than it («flagyle» ⊃ «flagyl», «adolescent» ⊅ «adol»; «Sulfadiazine» is
 * TMPS's ingredient by `components`, not by «sulfa»). «علبة فيتامين كلاب» does not hold «فيتامين ك»: one
 * letter of «كلاب» names nothing — and «فيتامين كومبلكس» does not either (`allergyHit`).
 * An occurrence inside a span already `taken` by a longer name does not count. When
 * the KEY is what a person typed (`completes`: a charted «Amox»), its unfinished last
 * word is a beginning to complete, as the completion pass does for names.
 */
function heldAt(n: string, key: string, taken: readonly { at: number; end: number }[] = [], completes = false): number {
  const last = key.length - 1 - key.lastIndexOf(" ");
  for (let i = n.indexOf(key); i >= 0; i = n.indexOf(key, i + 1)) {
    const end = i + key.length;
    if (end < n.length && n[end] !== " ") {
      // Inside a word only as that word's own ending («flagyl|e», «amoxicillin|s») — never as
      // the head of a longer word: «adol» (Panadol's Adol) is not «adol|escent». Read as one
      // drug among several, that head named paracetamol in «Meloxicam for adolescent dogs».
      const wordEnd = n.indexOf(" ", end);
      const rest = (wordEnd < 0 ? n.length : wordEnd) - end;
      if (last < MIN_COMPLETION || (rest >= last && !completes)) continue;
    }
    if (!PROCLITIC.test(n.slice(n.lastIndexOf(" ", i - 1) + 1, i))) continue;
    if (taken.some((t) => i < t.end && end > t.at)) continue;
    return i;
  }
  return -1;
}

/* ── دواءان بجزءٍ واحد ليسا أطولَهما ──────────────────────────────────────────────
 * الجزءُ كان يُطابَق بأوّل جذعٍ يحتويه، والفهرسُ مرتّبٌ بالطول: «Amoxicillin Gentamicin»
 * و«Amoxicillin - Gentamicin» و«أموكسيسيلين جنتاميسين» — وكلُّ فاصلٍ لا يعرفه LIST_SEP —
 * صارت أموكسيسيلين، والجنتاميسينُ لا يُرى. فالجزءُ يُقرأ بكلّ ما يسمّيه، الأطولُ أوّلاً،
 * والأطولُ يغطّي ما بداخله («ميثيل بريدنيزولون» ليست بريدنيزولون معها، و«Amoxicillin
 * Clavulanate» المركّبُ وحده)؛ وإن بقي دواءان فهو خليطٌ مهما كان الفاصل. */

/** The drugs one listed part names, in the order written: one for a drug name, two
 *  or more when two drugs sit in it unseparated, none when it names nothing. */
function namedIn(n: string): Monograph[] {
  const exact = EXACT.get(n);
  if (exact) return [exact];
  const taken: { at: number; end: number; drug: Monograph }[] = [];
  for (const x of MATCH_INDEX) {                       // longest first
    const at = heldAt(n, x.key, taken);
    if (at >= 0) taken.push({ at, end: at + x.key.length, drug: x.drug });
  }
  if (taken.length) return [...new Set(taken.sort((a, b) => a.at - b.at).map((t) => t.drug))];
  const done = completed(n);
  return done ? [done] : [];
}

/* الإكمال: كلمةٌ أخيرةٌ لم تكتمل بعد («Itraconazol»، «parac»، «Calcium glucon») تُكمَل إلى
 * اسمٍ بعدد كلماتها نفسِه، كلماتُه قبلها هي هي، وأخيرتُه **تبدأ** بها — لا اسمٌ **يحتويها**
 * («Ronidazole» ليست ذيلَ «metronidazole»). ولا تُخترع كلمةٌ لم تُكتب: «Calcium» ليست
 * «Calcium gluconate 10%» الوريدية (مكمّلُ الدواجن الفمويّ غيرُها)، و«Vitamin» ليست
 * «Vitamin K1». وما يُكتب به الدواءُ وحده من اسمٍ بكلمتين («Pyrantel»، «Tolfenamic»)
 * مسمّى بالدليل (aka) لا مُستنتَج. وإن بدأ بها دواءان («pred» ⇒ بريدنيزولون/بريدنيزون)
 * فلا تخمين. */
function completed(n: string): Monograph | undefined {
  const words = n.split(" ");
  const tail = words[words.length - 1];
  if (tail.length < MIN_COMPLETION) return undefined;
  const head = words.slice(0, -1).join(" ");
  let hit: Monograph | undefined;
  for (const x of MATCH_INDEX) {
    if (x.words !== words.length || x.head !== head || !x.last.startsWith(tail)) continue;
    if (hit && hit !== x.drug) return undefined;
    hit = x.drug;
  }
  return hit;
}

/** A listed ingredient, resolved: the drug it names (`named`), or — for safety
 *  only — a drug it holds beside another, or the combination it is one ingredient
 *  of («Sulfadiazine» ⇒ TMPS). */
interface Resolved { drug: Monograph | undefined; named: boolean }

function resolveParts(parts: string[]): Resolved[] {
  const ps = parts.map((p) => { const n = normalizeName(p); return { words: new Set(n.split(" ")), named: namedIn(n), used: false }; });
  const out: Resolved[] = [];
  // A combination whose every ingredient is named among the parts takes them as one
  // («Amoxicillin + Clavulanic acid» ⇒ amoxi-clav, «… + Trimethoprim + Sulfadiazine» ⇒ TMPS)
  // — and what else such a part names is another ingredient beside it («Amoxicillin
  // Clavulanate Gentamicin»).
  for (const c of COMBOS) {
    const at = c.components.map((stems) => ps.findIndex((p) => !p.used && [...stems].some((s) => p.words.has(s))));
    if (!at.every((i) => i >= 0)) continue;
    out.push({ drug: c.drug, named: true });
    for (const i of new Set(at)) {
      ps[i].used = true;
      for (const d of ps[i].named) if (d !== c.drug && !c.covers.has(d)) out.push({ drug: d, named: false });
    }
  }
  for (const p of ps) {
    if (p.used) continue;
    if (p.named.length === 1) out.push({ drug: p.named[0], named: true });
    else if (p.named.length) for (const d of p.named) out.push({ drug: d, named: false });
    else out.push({ drug: COMBOS.find((c) => c.components.some((stems) => [...stems].some((s) => p.words.has(s))))?.drug, named: false });
  }
  return out;
}

/* ── الشكلُ الموضعيّ ليس الحقنة ──────────────────────────────────────────────
 * «Gentamicin eye drop» و«Gentamicin ear drop» بمخزون عيادة كانتا جنتاميسين الحقن:
 * ٦ ملغ/كغ وريدي/عضلي بعيار ٤٠/٨٠ تُبذر عند الإضافة، وقطّةٌ مجفّفة تُمنع من قطرة عينٍ
 * بتنبيه «أمينوغلايكوزيد مع جفاف» الحاجب. فالاسمُ الذي يعلن شكلاً موضعياً لا يصير
 * مونوغرافاً لا طريقَ موضعياً له (البيرميثرين الموضعيّ يبقى بيرميثرين، ومنعُه للقطّ معه)؛
 * ومادّتُه تبقى لمنع النوع والحساسية وحدهما — لا لأعلام الملفّ ولا للتعارض ولا للتكرار:
 * ما يوضع بالعين لا يدخل الدم كالحقنة.
 *
 * والشكلُ يُعلنه **الشكل**، لا مكانُ المرض (الجولة الثالثة): كانت كلُّ كلمةٍ «ear» أو «eye»
 * تكفي، فـ«Gentamicin injection (ear infection)» و«Enrofloxacin (ear infection)» صارتا
 * قطرتين — بلا نافذةٍ ولا سقف، وقطّةٌ مجفّفة بصفّ ميلوكسيكام بلا «أمينوغلايكوزيد مع جفاف»
 * ولا تعارض. فالعينُ والأذنُ تُعلنان شكلاً موضعياً مع ما يوضع فيهما (قطرة، منظّف، عناية)؛
 * ووحدهما مكانُ مرضٍ («ear infection»، «(ear/skin)»). والشكلُ الموضعيّ الصريح (مرهم، كريم،
 * بخاخ، شامبو، ophthalmic، otic) يكفي وحده. والاسمُ الذي يعلن شكلاً جهازياً (حقن، فموي، حبوب)
 * ليس موضعياً مهما ذكر — والشكُّ يميل للجهازيّ: تنبيهٌ زائد يُقرأ ويُتجاوز، وتنبيهٌ ناقص لا يُرى.
 * و«pour-on» و«spot-on» ليستا موضعيّتين: الآيفرمكتين المسكوبُ على الظهر يُمتصّ للدم بالتصميم،
 * وحقنتُه بصفٍّ آخر تكرارٌ حاجب. */
const LOCAL_FORM = new Set([
  "ophthalmic", "otic", "auricular", "ointment", "ointmint", "cream", "creme", "lotion", "shampoo", "shamppo", "spray", "topical",
  "مرهم", "كريم", "شامبو", "بخاخ", "سبري", "لوشن", "غسول", "موضعي",
].map(normalizeName));
const LOCAL_SITE = new Set(["eye", "eyes", "ear", "ears", "عين", "أذن"].map(normalizeName));
const LOCAL_USE = new Set([
  "drop", "drops", "cleaner", "cleanser", "wash", "care", "قطرة", "قطرات", "نقط", "منظف", "تنظيف", "عناية",
].map(normalizeName));
const SYSTEMIC_FORM = new Set([
  "injection", "injectable", "injectible", "inj", "oral", "orally", "tablet", "tablets", "tab", "tabs", "capsule", "capsules", "syrup", "bolus",
  "حقن", "حقنة", "إبرة", "ابر", "فموي", "شراب", "حبوب", "حبة", "أقراص", "كبسول", "كبسولات",
].map(normalizeName));
const LOCAL_ROUTES: Route[] = ["topical", "otic", "ocular"];
const actsLocally = (d: Monograph) => d.doses.some((w) => w.routes.some((r) => LOCAL_ROUTES.includes(r)));

/** Does the name declare a local form — an ointment, cream, spray, shampoo, or an
 *  eye/ear drop or cleaner? Read on every word, the parenthesised ones too
 *  («Gentamicin (eye drops)»); a site alone is an indication («(ear infection)»),
 *  and a declared systemic form («injection», «حقن») is never local. */
export function isLocalForm(name: string): boolean {
  const ws = toWords(name).split(" ");
  const has = (set: Set<string>) => ws.some((w) => set.has(w) || set.has(bareArticle(w)));   // «بالعين»، «والأذن»
  if (has(SYSTEMIC_FORM)) return false;
  return has(LOCAL_FORM) || (has(LOCAL_SITE) && has(LOCAL_USE));
}

/* ── الاسمُ يُقرأ مرّة ─────────────────────────────────────────────────────────
 * منتقي الأدوية يُبنى بكلّ فتحةٍ وتغيّرِ نوع، وكان كلُّ اسمٍ بلا دليلٍ واحد (أغلبُ أسماء
 * العيادة والمخزن) يُقرأ ثلاثاً: matchMonograph، ثم bannedIngredient (يعيدها ومعها
 * ingredientMonographs)، ثم ingredientMonographs للبحث — وكلُّ قراءةٍ تقسم الاسمَ وتطابق كلَّ
 * جزءٍ بكلّ جذعٍ بالفهرس. مقيسٌ بحجم الإنتاج (١١٠ دواء + ٢٠١ منتج) لكلّ
 * بناء: ٣٫٠ ms على main و٣٥٫٦ بعد الجولة الثانية. فالقراءةُ دالّةٌ نقيّة للاسم تُحفظ: كلُّ
 * اسمٍ يُقرأ مرّةً، وإعادةُ البناء لا تقرأ شيئاً. */
interface NameRead { one: Monograph | undefined; all: readonly Monograph[]; local: boolean }
const READS = new Map<string, NameRead>();
const READS_MAX = 8192;   // typed names are keys too — the oldest go first
let reads = 0;

function readName(name: string): NameRead {
  const known = READS.get(name);
  if (known) return known;
  reads++;
  const local = isLocalForm(name);
  let one: Monograph | undefined;
  let all: Monograph[] = [];
  const n = normalizeName(name);
  const exact = n ? EXACT.get(n) : undefined;
  if (exact) { one = exact; all = [exact]; }
  else if (n) {
    const parts = resolveParts(ingredientParts(name));
    const first = parts[0]?.drug;
    one = first && parts.every((p) => p.named && p.drug === first) ? first : undefined;
    all = [...new Map(parts.flatMap((p) => (p.drug ? [[p.drug.id, p.drug] as const] : []))).values()];
  }
  if (one && local && !actsLocally(one)) one = undefined;
  const read = { one, all, local };
  if (READS.size >= READS_MAX) READS.delete(READS.keys().next().value!);
  READS.set(name, read);
  return read;
}

/** Names read so far (not served from memory) — scripts/med-match-test.mjs §٢١ counts a build by it. */
export const nameReadCount = () => reads;

/**
 * Resolve a free-text drug name (catalog, clinic-custom, or typed) to ONE
 * monograph — the one whose label, dose, strength and window the plan uses.
 *
 * Order matters, and getting it wrong is a safety bug: matching loosely first
 * makes "Amoxicillin 250mg" resolve to Amoxicillin-Clavulanate, whose wider
 * window then swallows a genuine overdose warning. So: the exact stem wins;
 * otherwise the name is read as the ingredients it lists, each matched alone
 * (exact, then every contained stem, longest first, then an unfinished word
 * completed — a real prefix of a one-word name, at least MIN_COMPLETION letters,
 * naming one drug only), and it is one monograph only when every ingredient names
 * that monograph and no part names a second drug. A mixture is not its first — or
 * its longest — recognisable ingredient. And a name that declares a local form is
 * no monograph without a local route.
 */
export function matchMonograph(name: string): Monograph | undefined {
  return readName(name).one;
}

/**
 * Every monograph a name's recognised ingredients resolve to — for what needs no
 * dose: species bans, charted allergies, duplicate therapy and dangerous class
 * pairs. A single drug (or an exact combination monograph) is itself; a listed
 * mixture is each ingredient the formulary knows («Paracetamol + Vitamin C» ⇒
 * paracetamol, so a cat still gets the ban; «Amoxicillin-Clavulanate +
 * Gentamicin» ⇒ both). Each monograph once. Never feed these to a dose path: the
 * mixture's mg/kg is not any one ingredient's.
 */
export function ingredientMonographs(name: string): Monograph[] {
  return [...readName(name).all];
}

/**
 * The formulary ids the OTHER rows of a plan put into the body — what duplicate
 * therapy and class pairs are judged against. Each id once: Bio-Sone and
 * Vimespiro side by side are one prednisolone, not two «تعارض» rows with the same
 * React key. A local form (eye drops, cream) is left out — it is not in the blood.
 */
export function concurrentIds(names: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const name of names) {
    const r = readName(name);
    if (r.local && !r.one) continue;
    for (const d of r.all) ids.add(d.id);
  }
  return [...ids];
}

/** The first species ban among a name's ingredients, naming the ingredient when
 *  the name is a mixture (its own label is the mixture's, not the banned drug's). */
export function bannedIngredient(name: string, species: Species): string | undefined {
  const { one: whole, all } = readName(name);
  if (whole) return isBannedFor(whole, species);
  for (const d of all) {
    const why = isBannedFor(d, species);
    if (why) return `${d.ar} — ${why}`;
  }
  return undefined;
}

/* ---- Bridges to the ids the treatment plan already uses ---- */

/** TreatmentPlan `ROUTES` ids → formulary routes. */
export const APP_ROUTE: Record<string, Route> = {
  oral: "PO", sc: "SC", im: "IM", iv: "IV", topical: "topical", eye_ear: "otic",
};

/** TreatmentPlan `FREQS` ids → hours between doses. */
export function appFreqHours(id: string): Frequency {
  return id === "1" ? 24 : id === "2" ? 12 : id === "3" ? 8 : id === "4" ? 6 : 0;
}

/** The frequency id that matches a monograph's documented interval. */
export function freqIdFor(freq: Frequency): string {
  return freq === 24 ? "1" : freq === 12 ? "2" : freq === 8 ? "3" : freq === 6 ? "4" : "prn";
}

/** The dose window that applies to this species, if the drug has one. */
export function doseFor(drug: Monograph, species: Species): SpeciesDose | undefined {
  return drug.doses.find((d) => d.species.includes(species)) ?? drug.doses.find((d) => d.species.includes("other"));
}

export function isBannedFor(drug: Monograph, species: Species): string | undefined {
  return drug.banned?.find((b) => b.species.includes(species))?.reason;
}

/* ------------------------------- 2. Dose math -----------------------------
 * mg/kg × kg = mg. mg ÷ (mg/ml) = ml. The only subtlety worth encoding is
 * ROUNDING: a syringe can't measure 0.4237 ml, so we round to what the vet can
 * actually draw — and we round DOWN near the ceiling so rounding never pushes a
 * dose over the toxic line.
 *
 * ذلك الوعدُ كان تعليقاً بلا شِفرة: `Math.round` عارٍ، وحبةٌ بحدٍّ أدنى ربع.
 * فإنروفلوكساسين ١٠٠ ملغ/مل لقطّةٍ 4.5 كغ صار 0.23 مل = 5.11 ملغ/كغ فوق خطّ العمى،
 * وبريدنيزولون ٢٠ ملغ لقطّةٍ ٢ كغ صار ¼ حبة = خمسةُ أضعاف المقصود — والفحصُ
 * يقرأ المقصودَ فيقول «ضمن النطاق». الآن: التقريبُ لا يعبر السقفَ الصلب
 * (`ceiling`)، والحبةُ دون ⅛ لا تُرفع بل تُرفض، وما يُعطى فعلاً (`givenMg`) هو
 * ما يحكم عليه `checkSafety`. */

export interface DoseCalc {
  mgPerKg: number;
  weightKg: number;
  /** Total milligrams for one administration. */
  mg: number;
  /** Volume in ml at the chosen concentration — undefined for tablets/topicals. */
  ml?: number;
  /** The syringe-friendly volume actually drawn. Never 0: an unmeasurable volume is `tooSmall`. */
  mlRounded?: number;
  /** Tablet count when the product is solid. */
  tablets?: number;
  tabletsLabel?: string;
  /** What actually reaches the patient once the volume or the tablet is rounded —
   *  `mg` itself when nothing was rounded (no strength, or too small to measure). */
  givenMg: number;
  givenMgPerKg: number;
  /** The product can't carry this dose: under ⅛ of the tablet, or under 0.0005 ml —
   *  or the smallest piece (¼ tablet) would cross `ceiling` (then `held` too). */
  tooSmall?: "tablet" | "volume";
  /** `ceiling` held the rounding down: the nearest mark (or quarter) would cross it,
   *  so the one below is given — a move of up to a whole step, not half (`HELD_SLACK`). */
  held?: boolean;
  /** mg/kg one quarter tablet carries — set when `tooSmall` is "tablet", so the
   *  alert can say what the smallest piece would have given. */
  quarterMgPerKg?: number;
  /** Doses per day implied by the frequency. */
  perDay: number;
  mgPerDay: number;
}

/** Floating-point slack when comparing against a line: 5 × 4.5 ÷ 100 must equal 0.225. */
const ON_LINE = 1 + 1e-9;

/** Round a volume to something a real syringe can measure — and when the exact
 *  volume is at or under `ceilingMl`, never round it over (round down instead). */
export function roundVolume(ml: number, ceilingMl?: number): number {
  if (!isFinite(ml) || ml <= 0) return 0;
  // insulin-syringe territory 0.001 · 0.01 ml · 0.05 ml · 0.1 ml
  const f = ml < 0.1 ? 1000 : ml < 1 ? 100 : ml < 10 ? 20 : 10;
  const v = Math.round(ml * f) / f;
  if (ceilingMl !== undefined && ml <= ceilingMl * ON_LINE && v > ceilingMl * ON_LINE) {
    return Math.floor(ceilingMl * f + 1e-9) / f;
  }
  return v;
}

/** What a dose under ⅛ tablet says instead of a number. */
export const TABLET_TOO_SMALL = "اختر عياراً أصغر أو سائلاً";

/** Nearest practical tablet fraction — whole, half, or quarter. Under ⅛ the
 *  nearest quarter is nothing: it says so, rather than raising the dose to ¼
 *  (the old floor turned 0.05 tablet into five times the dose). And when the
 *  exact count is at or under `ceiling`, rounding never carries it over — it
 *  drops a quarter instead (`held`), which can reach nothing even above ⅛:
 *  0.126 tablet whose quarter crosses the line. `held` keeps the two apart. */
export function roundTablets(count: number, ceiling?: number): { value: number; label: string; tooSmall?: boolean; held?: boolean } {
  if (!isFinite(count) || count <= 0) return { value: 0, label: "—" };
  const nearest = Math.round(count * 4) / 4;
  const q = ceiling !== undefined && count <= ceiling * ON_LINE && nearest > ceiling * ON_LINE
    ? Math.floor(ceiling * 4 + 1e-9) / 4
    : nearest;
  const held = q < nearest ? { held: true } : {};
  if (q <= 0) return { value: 0, label: TABLET_TOO_SMALL, tooSmall: true, ...held };
  const whole = Math.floor(q);
  const frac = q - whole;
  const fracLabel = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : "";
  const label = whole > 0 ? `${whole}${fracLabel ? ` و${fracLabel}` : ""} حبة` : `${fracLabel} حبة`;
  return { value: q, label, ...held };
}

/**
 * The hard line one dose must not cross for this species: its `hardMax`, or the
 * drug's daily ceiling spread over the day's doses — whichever is lower. Every
 * `calcDose` caller passes it as `ceiling`, so rounding never carries a dose
 * across it (scripts/dose-safety-test.mjs §٦ fails a caller that forgets).
 */
export function doseCeiling(drug: Monograph | undefined, win: SpeciesDose | undefined, freq: Frequency): number | undefined {
  const perDay = freq === 0 ? 1 : 24 / freq;
  const lines: number[] = [];
  if (win?.hardMax !== undefined) lines.push(win.hardMax);
  if (drug?.maxDailyMgPerKg !== undefined) lines.push(drug.maxDailyMgPerKg / perDay);
  return lines.length ? Math.min(...lines) : undefined;
}

export function calcDose(opts: {
  mgPerKg: number;
  weightKg: number;
  /** mg per ml for liquids, mg per tablet for solids. */
  strength?: number;
  solid?: boolean;
  freq: Frequency;
  /** mg/kg per dose that rounding must not cross (`doseCeiling`). Explicit
   *  `undefined` when the drug has none — the call site says it looked. */
  ceiling: number | undefined;
}): DoseCalc {
  const { mgPerKg, weightKg, strength, solid, freq, ceiling } = opts;
  const mg = mgPerKg * weightKg;
  const perDay = freq === 0 ? 1 : 24 / freq;
  const out: DoseCalc = { mgPerKg, weightKg, mg, perDay, mgPerDay: mg * perDay, givenMg: mg, givenMgPerKg: mgPerKg };
  if (strength && strength > 0 && mg > 0) {
    const cap = ceiling !== undefined ? (ceiling * weightKg) / strength : undefined;
    if (solid) {
      const t = roundTablets(mg / strength, cap);
      if (t.held) out.held = true;
      if (t.tooSmall) {
        out.tooSmall = "tablet";
        if (weightKg > 0) out.quarterMgPerKg = (0.25 * strength) / weightKg;
      } else {
        out.tablets = t.value;
        out.tabletsLabel = t.label;
        out.givenMg = t.value * strength;
      }
    } else {
      out.ml = mg / strength;
      const v = roundVolume(out.ml, cap);
      if (v < roundVolume(out.ml)) out.held = true;
      if (v > 0) {
        out.mlRounded = v;
        out.givenMg = v * strength;
      } else out.tooSmall = "volume";
    }
    if (weightKg > 0) out.givenMgPerKg = out.givenMg / weightKg;
  }
  return out;
}

/** A dose number as it is written: decimals kept (0.06 stays 0.06 — `formatNum`
 *  wrote it «0»), and a real dose never collapses to «0». */
export function doseNum(n: number): string {
  if (n > 0 && n < 0.0005) return String(Number(n.toPrecision(2)));
  return formatDec(n);
}

/** The plan's amount line (TreatmentPlan → treatment_entries.amount): what is
 *  drawn or given, then the milligrams it actually carries. */
export function planAmountText(c: DoseCalc): string {
  const mg = `${doseNum(c.givenMg)} mg`;
  if (c.mlRounded) return `${doseNum(c.mlRounded)} مل (${mg})`;
  if (c.tabletsLabel && c.tablets) return `${c.tabletsLabel} (${mg})`;
  return mg;
}

/** The treatment sheet's amount (Flowsheet AddTaskSheet). The tablet label
 *  already ends in «حبة» — appending «قرص» wrote «½ حبة قرص». */
export function taskAmountText(c: DoseCalc): string {
  if (c.tabletsLabel && c.tablets) return c.tabletsLabel;
  if (c.mlRounded) return `${doseNum(c.mlRounded)} مل`;
  return `${doseNum(c.givenMg)} ملغم`;
}

/** How far rounding to the NEAREST mark may move a dose and still be the dose the
 *  vet chose: half a step on the syringe ladder's coarsest rung (0.005 ml on
 *  0.1 ml). Beyond it — a quarter tablet for a twentieth — what is given is a
 *  different dose. */
export const ROUNDING_SLACK = 0.05;

/** The same, when `ceiling` held the rounding down (`DoseCalc.held`): the dose
 *  drops to the mark BELOW the nearest one, which is up to a whole step away —
 *  0.10 ml for 0.1075 (enrofloxacin, cat 2.15 kg) is 7% under, and it is the
 *  closest that strength can come without crossing the line. Judged on half a
 *  step, the usual feline dose read «underdose» at 73 weights, and the only way
 *  up was over the line. A whole step on the coarsest rung is 10%; more than
 *  that (a quarter tablet for 0.4) is still a different dose. */
export const HELD_SLACK = 2 * ROUNDING_SLACK;

/** The mg/kg a dose window is judged on: what is actually given, unless rounding
 *  moved it by no more than the measure's resolution (then the vet's own choice,
 *  so the «typical» tile of a point window doesn't cry «underdose» at 0.22 ml).
 *  Takes the whole calculation — `givenMgPerKg` alone loses `held`. */
export function judgedMgPerKg(intended: number, dose: Pick<DoseCalc, "givenMgPerKg" | "held"> | undefined): number {
  const given = dose?.givenMgPerKg;
  if (given === undefined || !(intended > 0)) return intended;
  const slack = dose?.held ? HELD_SLACK : ROUNDING_SLACK;
  return Math.abs(given - intended) <= intended * slack * ON_LINE ? intended : given;
}

/** Is this mg/kg outside the documented window? The one test the card's tiles and
 *  `checkSafety` both make — float-safe, so 0.45 ml × 50 ÷ 4.5 is 5, not «over 5». */
export function outsideWindow(v: number, win: Pick<SpeciesDose, "min" | "max">): boolean {
  return v > win.max * ON_LINE || v < win.min / ON_LINE;
}

/** Three significant digits for a computed mg/kg in an alert: 5.111… → 5.11. */
const sig = (n: number) => Number(n.toPrecision(3));

/* ----------------------------- 3. Safety rules ----------------------------
 * Fired BEFORE the drug is given, against the dose the vet just typed plus
 * everything else the patient is already on. */

export interface DoseAlert {
  id: string;
  tone: DoseTone;
  title: string;
  detail?: string;
  /** A critical alert the UI should make the user acknowledge before saving. */
  blocking?: boolean;
}

/* ------------------------- Allergies on the chart -------------------------
 * `pet.allergies` is free text a receptionist typed months ago — "Penicillin",
 * "بنسلين", "sulfa drugs". A recorded allergy is only worth having if it fires
 * on the DRUG CLASS too: a penicillin allergy must stop amoxicillin, not merely
 * a drug literally spelled "penicillin". */
const ALLERGY_CLASS_ALIASES: { match: string[]; klass: DrugClass; as: string }[] = [
  { match: ["penicillin", "بنسلين", "amoxicillin", "أموكسيسيلين", "augmentin", "ampicillin"], klass: "beta-lactam", as: "البنسلينات والبيتا-لاكتام" },
  { match: ["cephalosporin", "سيفالوسبورين", "cephalexin", "سيفاليكسين"], klass: "beta-lactam", as: "السيفالوسبورينات (تتقاطع مع البنسلين)" },
  { match: ["sulfa", "sulpha", "سلفا", "sulfonamide", "trimethoprim"], klass: "sulfonamide", as: "السلفا" },
  { match: ["nsaid", "مضاد التهاب", "meloxicam", "ميلوكسيكام", "carprofen", "aspirin", "أسبرين", "ibuprofen"], klass: "nsaid", as: "مضادات الالتهاب اللاستيرويدية" },
  { match: ["quinolone", "fluoroquinolone", "كينولون", "enrofloxacin", "ciprofloxacin"], klass: "fluoroquinolone", as: "الكينولونات" },
  { match: ["tetracycline", "تتراسايكلين", "doxycycline", "دوكسيسيكلين"], klass: "tetracycline", as: "التتراسايكلينات" },
  { match: ["aminoglycoside", "gentamicin", "جنتاميسين", "amikacin"], klass: "aminoglycoside", as: "الأمينوغلايكوزيدات" },
  { match: ["opioid", "أفيون", "morphine", "tramadol", "ترامادول"], klass: "opioid", as: "الأفيونيات" },
];

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Does a charted allergy cover this drug? Returns the reason to show, or
 * undefined. Checks the drug's own names first, then its therapeutic class.
 *
 * The chart's free text and the drug's names are read alike, as WORDS (`toWords`
 * on both, `heldAt` both ways — the reader the names are matched with). It was a
 * substring test both ways, and «Vitamin K» / «فيتامين ك» (the K1 monograph's
 * `aka`) is the start of «فيتامين كومبلكس» and «Vitamin K3»: a pet charted with
 * B-complex got a blocking «هذا هو نفس الدواء» on Vitamin K1 — the rodenticide
 * antidote. And «لا» typed in the allergy box sits inside «كلافولانيك». A name
 * still ends inside a word when its last word is a whole stem («amoxicillins»),
 * and an Arabic proclitic may lead («للديكساميثازون»، «وأموكسيسيلين»).
 */
export function allergyHit(drug: Monograph, allergy: string): string | undefined {
  const a = toWords(allergy);
  if (!a) return undefined;

  // Direct: the allergy names this exact drug (or one of its brands).
  const names = [drug.en, drug.ar, ...(drug.aka ?? []), ...(drug.brands ?? [])].map(toWords);
  if (names.some((n) => heldAt(a, n) >= 0 || heldAt(n, a, [], true) >= 0)) {
    return `مسجّل بالملف: حساسية من «${allergy.trim()}» — وهذا هو نفس الدواء.`;
  }

  // Class-level: a penicillin allergy has to stop every beta-lactam.
  for (const alias of ALLERGY_CLASS_ALIASES) {
    if (alias.klass !== drug.klass) continue;
    if (alias.match.some((m) => a.includes(toWords(m)))) {
      return `مسجّل بالملف: حساسية من «${allergy.trim()}» — و${drug.ar} من نفس الصنف (${alias.as}).`;
    }
  }
  return undefined;
}

/** Pairs that must not be co-administered, by therapeutic class. */
const BAD_PAIRS: { a: DrugClass; b: DrugClass; tone: DoseTone; msg: string }[] = [
  { a: "nsaid", b: "corticosteroid", tone: "critical", msg: "NSAID مع كورتيزون = قرحة معدة نازفة وثقب. اختر واحد بس، وافصل بينهم ٣–٧ أيام." },
  { a: "nsaid", b: "nsaid", tone: "critical", msg: "مسكّنين NSAID مع بعض بيضاعفوا سُميّة الكلى والمعدة بلا أي فائدة زيادة." },
  { a: "corticosteroid", b: "corticosteroid", tone: "critical", msg: "كورتيزونين مع بعض — تثبيط مناعة وكبح كظر مضاعف." },
  { a: "nsaid", b: "aminoglycoside", tone: "warn", msg: "NSAID مع أمينوغلايكوزيد بيضاعفوا خطر الفشل الكلوي. رطّب وراقب الكرياتينين." },
  { a: "diuretic", b: "aminoglycoside", tone: "warn", msg: "مدرّ بول مع أمينوغلايكوزيد = جفاف + سُميّة كلوية. رطّب أول." },
  { a: "diuretic", b: "nsaid", tone: "warn", msg: "مدرّ بول مع NSAID بيقلّل تروية الكلى — خطر قصور كلوي حاد." },
  { a: "sedative", b: "opioid", tone: "info", msg: "مهدّئ مع أفيوني: تهدئة أعمق ومتوقّعة — نزّل جرعة الاثنين وراقب التنفّس." },
];

export function checkSafety(opts: {
  drug: Monograph;
  species: Species;
  weightKg?: number;
  mgPerKg: number;
  route?: Route;
  freq?: Frequency;
  /** Drug ids the patient is already on. */
  concurrent?: string[];
  /** Free-text allergies recorded on the patient's chart (`pet.allergies`). */
  allergies?: string[];
  /** Known flags on the chart. */
  flags?: { pregnant?: boolean; renal?: boolean; hepatic?: boolean; dehydrated?: boolean; puppy?: boolean };
  /** The calculated dose (`calcDose`) — so the window is judged on what the
   *  rounded volume or tablet actually delivers, not on what was intended.
   *  Every caller that has a dose passes it (scripts/dose-safety-test.mjs §٦). */
  dose: DoseCalc | undefined;
}): DoseAlert[] {
  const { drug, species, mgPerKg, route, freq, dose, allergies = [], flags = {} } = opts;
  // Each drug the patient is on, once: two other rows that both carry prednisolone
  // are one «تعارض مع بريدنيزولون», not two alerts sharing one id (and React key).
  const concurrent = [...new Set(opts.concurrent ?? [])];
  const out: DoseAlert[] = [];

  // --- Hard species ban: the highest-value rule in the whole engine.
  const banned = isBannedFor(drug, species);
  if (banned) {
    out.push({ id: "banned", tone: "critical", blocking: true, title: `ممنوع منعاً باتاً لهذا النوع — ${drug.ar}`, detail: banned });
    return out; // nothing else matters
  }

  // --- Charted allergy. Ranked with the species ban because the consequence is
  //     the same kind of harm, and the chart already knew.
  for (const a of allergies) {
    const hit = allergyHit(drug, a);
    if (hit) {
      out.push({ id: `allergy-${norm(a)}`, tone: "critical", blocking: true, title: `حساسية مسجّلة — لا تعطيه ${drug.ar}`, detail: hit });
      return out;
    }
  }

  const win = doseFor(drug, species);
  const perDay = freq === 0 || freq === undefined ? 1 : 24 / freq;

  // --- The product can't carry this dose at all. Said whatever the window: the
  //     old engine raised it to ¼ tablet in silence. Two different reasons, said
  //     apart: under ⅛ the nearest quarter is nothing; `held` means ¼ — the
  //     smallest piece — would cross a hard line, though the dose is above ⅛
  //     (metronidazole 250 for a 2.1 kg cat at 15 q12 is 0.126 tablet; its quarter
  //     is 59.5 mg/kg a day against 50). Calling that «under ⅛» hid the line and
  //     the vet's other way out: widen the interval.
  if (mgPerKg > 0 && dose?.tooSmall === "tablet") {
    const q = dose.quarterMgPerKg;
    if (dose.held && q !== undefined) {
      const quarter = `أصغرُ ما تُقسم إليه الحبة ربعُها: ${sig(q)} ملغ/كغ للجرعة`;
      if (win?.hardMax !== undefined && q > win.hardMax * ON_LINE) {
        out.push({
          id: "too-small", tone: "warn",
          title: `ربعُ الحبة فوق السقف المسموح (${win.hardMax} ملغ/كغ) — ${TABLET_TOO_SMALL}`,
          detail: `${quarter}. ${win.hardMaxReason ?? ""}`.trim(),
        });
      } else if (drug.maxDailyMgPerKg && q * perDay > drug.maxDailyMgPerKg * ON_LINE) {
        out.push({
          id: "too-small", tone: "warn",
          title: `ربعُ الحبة يعبر السقف اليومي (${drug.maxDailyMgPerKg} ملغ/كغ) — ${TABLET_TOO_SMALL}`,
          detail: `${quarter}، فيصير مجموعُ اليوم بهذا التكرار ${sig(q * perDay)} ملغ/كغ. أو وسّع الفاصل بين الجرعات.`,
        });
      } else {
        // The caller's ceiling is not one this drug documents — say a line held it, not «⅛».
        out.push({ id: "too-small", tone: "warn", title: `ربعُ الحبة يعبر الحدّ المسموح للجرعة — ${TABLET_TOO_SMALL}`, detail: `${quarter}.` });
      }
    } else {
      out.push({
        id: "too-small", tone: "warn",
        title: `الجرعة أقل من ⅛ الحبة — ${TABLET_TOO_SMALL}`,
        detail: "أصغرُ ما تُقسم إليه الحبة ربعُها، وربعُ هذه الحبة أضعافُ الجرعة.",
      });
    }
  } else if (mgPerKg > 0 && dose?.tooSmall === "volume") {
    out.push({ id: "too-small", tone: "warn", title: "الحجم أصغر من أن تقيسه سرنجة — خفّف المحلول أو اختر تركيزاً أقل" });
  }

  if (!win) {
    out.push({ id: "no-window", tone: "warn", title: "ما عندنا جرعة موثّقة لهذا النوع", detail: "راجع مرجع دوائي قبل الإعطاء." });
  } else if (mgPerKg > 0) {
    /* المُعطى لا المقصود: ما يصل بعد تقريب الحجم أو الحبة. الخطوطُ الصلبة (السقف،
     * والسقفُ اليوميّ) تُقرأ على الأعلى من الاثنين بلا تسامح؛ والنافذةُ اللينة على
     * المُعطى إلا إن حرّكه التقريبُ بأقلّ من دقّة السرنجة (ROUNDING_SLACK: نصفُ علامة)
     * — أو بعلامةٍ كاملة إن كان الحدُّ هو الذي أنزله (HELD_SLACK). */
    const given = dose?.givenMgPerKg;
    const judged = judgedMgPerKg(mgPerKg, dose);
    const peak = Math.max(mgPerKg, given ?? mgPerKg);
    const rounded = (v: number) => (v !== mgPerKg ? `بعد التقريب لما يُعطى فعلاً يصل ${sig(v)} ملغ/كغ، والمقصود ${sig(mgPerKg)}. ` : "");
    // --- Hard ceiling (enrofloxacin in cats, meloxicam in cats).
    if (win.hardMax !== undefined && peak > win.hardMax * ON_LINE) {
      out.push({
        id: "hard-max", tone: "critical", blocking: true,
        title: `تجاوزت السقف المسموح: ${sig(peak)} ملغ/كغ (الحد ${win.hardMax})`,
        detail: `${rounded(peak)}${win.hardMaxReason ?? ""}`.trim() || undefined,
      });
    } else if (judged > win.max * 2 * ON_LINE) {
      out.push({
        id: "overdose-severe", tone: "critical", blocking: true,
        title: `جرعة زائدة خطيرة — ضعف الحد الأعلى (${win.max} ملغ/كغ)`,
        detail: `${rounded(judged)}تأكّد من الوزن ومن تركيز الأمبولة قبل الحقن.`,
      });
    } else if (judged > win.max * ON_LINE) {
      out.push({
        id: "overdose", tone: "warn",
        title: `فوق النطاق المعتاد (${win.min}–${win.max} ملغ/كغ)`,
        detail: `${rounded(judged)}مقبول أحياناً بحالات معيّنة — بس تأكّد إنك قاصدها.`,
      });
    } else if (judged < win.min / ON_LINE) {
      out.push({
        id: "underdose", tone: "warn",
        title: `تحت الجرعة العلاجية (${win.min}–${win.max} ملغ/كغ)`,
        detail: `${rounded(judged)}الجرعة الناقصة ما بتعالج وبتربّي مقاومة للمضاد الحيوي.`,
      });
    } else {
      out.push({ id: "in-range", tone: "good", title: `ضمن النطاق العلاجي (${win.min}–${win.max} ملغ/كغ)` });
    }

    // --- Cumulative daily ceiling — a hard line, read on the higher of the two.
    if (drug.maxDailyMgPerKg && peak * perDay > drug.maxDailyMgPerKg * ON_LINE) {
      out.push({
        id: "daily-max", tone: "critical", blocking: true,
        title: `مجموع اليوم ${(peak * perDay).toFixed(1)} ملغ/كغ — فوق السقف اليومي (${drug.maxDailyMgPerKg})`,
        detail: `${rounded(peak)}وسّع الفاصل بين الجرعات أو نزّل الجرعة الواحدة.`,
      });
    }

    // --- Route sanity.
    if (route && !win.routes.includes(route)) {
      out.push({
        id: "route", tone: "warn",
        title: `طريق الإعطاء غير معتاد لهذا الدواء`,
        detail: `الموثّق: ${win.routes.map((r) => ROUTE_LABEL[r]).join("، ")}.`,
      });
    }
  }

  // --- Duplicate therapy & dangerous combinations.
  for (const id of concurrent) {
    if (id === drug.id) {
      out.push({ id: "dup-same", tone: "critical", blocking: true, title: `${drug.ar} موصوف أصلاً لهذا الحيوان`, detail: "تكرار نفس الدواء = جرعة مضاعفة بدون قصد." });
      continue;
    }
    const other = DRUG_BY_ID.get(id);
    if (!other) continue;
    for (const p of BAD_PAIRS) {
      const match = (p.a === drug.klass && p.b === other.klass) || (p.b === drug.klass && p.a === other.klass);
      if (match) {
        out.push({
          id: `pair-${other.id}`,
          tone: p.tone,
          blocking: p.tone === "critical",
          title: `تعارض مع ${other.ar}`,
          detail: p.msg,
        });
      }
    }
  }

  // --- Chart flags.
  if (drug.klass === "nsaid" && (flags.renal || flags.dehydrated)) {
    out.push({ id: "nsaid-renal", tone: "critical", blocking: true, title: "NSAID مع جفاف أو قصور كلوي", detail: "بيقطع تروية الكلى — رطّب أول أو اختر مسكّن أفيوني." });
  }
  if (drug.klass === "aminoglycoside" && (flags.renal || flags.dehydrated)) {
    out.push({ id: "amino-renal", tone: "critical", blocking: true, title: "أمينوغلايكوزيد مع جفاف أو كلى متعبة", detail: "سُميّة كلوية شبه مؤكدة. رطّب أول أو غيّر المضاد." });
  }
  if (drug.klass === "fluoroquinolone" && flags.puppy) {
    out.push({ id: "fq-puppy", tone: "warn", title: "فلوروكينولون بحيوان صغير", detail: "بيأذي غضروف المفاصل بفترة النمو." });
  }
  if (flags.pregnant && ["nsaid", "fluoroquinolone", "tetracycline", "corticosteroid", "nitroimidazole"].includes(drug.klass)) {
    out.push({ id: "pregnant", tone: "warn", title: "حَمْل — هذا الصنف بيأثر على الأجنّة", detail: "اختر بديل آمن بالحمل إن أمكن." });
  }
  if (drug.klass === "tetracycline" && flags.puppy) {
    out.push({ id: "tetra-puppy", tone: "warn", title: "تتراسايكلين بحيوان صغير", detail: "بيصبغ الأسنان الدائمة." });
  }

  // --- Static monograph warnings, last.
  for (const [i, w] of (drug.warnings ?? []).entries()) {
    out.push({ id: `warn-${i}`, tone: "info", title: w });
  }

  return out;
}

/**
 * Safety for a name that lists several ingredients and so is no ONE monograph
 * («… + Prednisolone + … (Bio-Sone)», «Paracetamol + Vitamin C»). Its mg/kg is
 * no ingredient's, so there is no window, route or over/under verdict here — but
 * everything that needs no dose fires for EVERY recognised ingredient: species
 * ban, charted allergy (drug or class), duplicate therapy, dangerous class pairs
 * and chart flags. A mixture must not be safer on paper than its parts.
 * Alert ids carry the ingredient («paracetamol:banned») so two never collide.
 *
 * A local form (`local`: «Gentamicin eye drop», `isLocalForm`) keeps only what
 * holds wherever the drug is put — the species ban and the charted allergy. Its
 * chart flags, pairs and duplicates are the injection's, not the drop's: a
 * dehydrated cat is not blocked from an eye drop by «أمينوغلايكوزيد مع جفاف».
 *
 * The mixture's own ingredients are each other's concurrent drugs too. Only the
 * OTHER rows were passed, so «ميلوكسيكام وديكساميثازون» in one row raised no
 * «NSAID مع كورتيزون» — the same two drugs as two rows block. Each pair once:
 * an ingredient is judged against the ones after it.
 */
export function checkIngredientSafety(opts: {
  ingredients: Monograph[];
  species: Species;
  concurrent?: string[];
  allergies?: string[];
  flags?: { pregnant?: boolean; renal?: boolean; hepatic?: boolean; dehydrated?: boolean; puppy?: boolean };
  local?: boolean;
}): DoseAlert[] {
  const out: DoseAlert[] = [];
  for (const [i, drug] of opts.ingredients.entries()) {
    const siblings = opts.ingredients.slice(i + 1).map((d) => d.id);
    const alerts = checkSafety({
      drug, species: opts.species, mgPerKg: 0, dose: undefined,
      concurrent: opts.local ? [] : [...(opts.concurrent ?? []), ...siblings], allergies: opts.allergies, flags: opts.local ? {} : opts.flags,
    });
    for (const a of alerts) {
      if (a.id === "no-window") continue;                 // judges a dose this mixture does not have
      if (opts.local && a.id !== "banned" && !a.id.startsWith("allergy-")) continue;
      out.push({ ...a, id: `${drug.id}:${a.id}` });
    }
  }
  return out;
}

/** Worst tone in a set of alerts — drives the summary chip color. */
export function worstTone(alerts: DoseAlert[]): DoseTone {
  if (alerts.some((a) => a.tone === "critical")) return "critical";
  if (alerts.some((a) => a.tone === "warn")) return "warn";
  if (alerts.some((a) => a.tone === "good")) return "good";
  return "info";
}

export function hasBlocking(alerts: DoseAlert[]): boolean {
  return alerts.some((a) => a.blocking);
}
