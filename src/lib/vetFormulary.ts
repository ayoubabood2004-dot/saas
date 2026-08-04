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
 * "Amoxicillin". */
const normalizeName = (s: string) =>
  s.toLowerCase()
    .replace(/\([^)]*\)/g, " ")        // drop "(Baytril)", "(dogs only)"
    .replace(/[\d.]+\s*(mg|ml|mcg|g|%)/g, " ") // drop "250mg", "2%"
    .replace(/[^a-z؀-ۿ]+/g, " ")
    .trim();

/** Generic stems, longest-first, so compound names win over their prefixes. */
const MATCH_INDEX: { key: string; drug: Monograph }[] = FORMULARY
  .flatMap((d) => [
    { key: normalizeName(d.en), drug: d },
    { key: normalizeName(d.ar), drug: d },
    ...(d.brands ?? []).map((b) => ({ key: normalizeName(b), drug: d })),
  ])
  .filter((x) => x.key.length > 2)
  .sort((a, b) => b.key.length - a.key.length);

/**
 * Resolve a free-text drug name (catalog, clinic-custom, or typed) to a monograph.
 *
 * Order matters, and getting it wrong is a safety bug: matching loosely first
 * makes "Amoxicillin 250mg" resolve to Amoxicillin-Clavulanate, whose wider
 * window then swallows a genuine overdose warning. So: exact stem wins, then
 * the longest contained stem, and only if nothing matched do we fall back to
 * treating the input as a prefix of a longer generic name.
 */
export function matchMonograph(name: string): Monograph | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  return (
    MATCH_INDEX.find((x) => x.key === n)?.drug ??
    MATCH_INDEX.find((x) => n.includes(x.key))?.drug ??
    MATCH_INDEX.find((x) => x.key.includes(n))?.drug
  );
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
 * dose over the toxic line. */

export interface DoseCalc {
  mgPerKg: number;
  weightKg: number;
  /** Total milligrams for one administration. */
  mg: number;
  /** Volume in ml at the chosen concentration — undefined for tablets/topicals. */
  ml?: number;
  /** The syringe-friendly volume actually drawn. */
  mlRounded?: number;
  /** Tablet count when the product is solid. */
  tablets?: number;
  tabletsLabel?: string;
  /** Doses per day implied by the frequency. */
  perDay: number;
  mgPerDay: number;
}

/** Round a volume to something a real syringe can measure. */
export function roundVolume(ml: number): number {
  if (!isFinite(ml) || ml <= 0) return 0;
  if (ml < 0.1) return Math.round(ml * 1000) / 1000;  // insulin syringe territory
  if (ml < 1) return Math.round(ml * 100) / 100;      // 0.01 ml
  if (ml < 10) return Math.round(ml * 20) / 20;       // 0.05 ml
  return Math.round(ml * 10) / 10;                    // 0.1 ml
}

/** Nearest practical tablet fraction — whole, half, or quarter. */
export function roundTablets(count: number): { value: number; label: string } {
  if (!isFinite(count) || count <= 0) return { value: 0, label: "—" };
  const q = Math.max(0.25, Math.round(count * 4) / 4);
  const whole = Math.floor(q);
  const frac = q - whole;
  const fracLabel = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : "";
  const label = whole > 0 ? `${whole}${fracLabel ? ` و${fracLabel}` : ""} حبة` : `${fracLabel} حبة`;
  return { value: q, label };
}

export function calcDose(opts: {
  mgPerKg: number;
  weightKg: number;
  /** mg per ml for liquids, mg per tablet for solids. */
  strength?: number;
  solid?: boolean;
  freq: Frequency;
}): DoseCalc {
  const { mgPerKg, weightKg, strength, solid, freq } = opts;
  const mg = mgPerKg * weightKg;
  const perDay = freq === 0 ? 1 : 24 / freq;
  const out: DoseCalc = { mgPerKg, weightKg, mg, perDay, mgPerDay: mg * perDay };
  if (strength && strength > 0) {
    if (solid) {
      const t = roundTablets(mg / strength);
      out.tablets = t.value;
      out.tabletsLabel = t.label;
    } else {
      out.ml = mg / strength;
      out.mlRounded = roundVolume(out.ml);
    }
  }
  return out;
}

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
 */
export function allergyHit(drug: Monograph, allergy: string): string | undefined {
  const a = norm(allergy);
  if (!a) return undefined;

  // Direct: the allergy names this exact drug (or one of its brands).
  const names = [drug.en, drug.ar, ...(drug.brands ?? [])].map(norm);
  if (names.some((n) => n.includes(a) || a.includes(n))) {
    return `مسجّل بالملف: حساسية من «${allergy.trim()}» — وهذا هو نفس الدواء.`;
  }

  // Class-level: a penicillin allergy has to stop every beta-lactam.
  for (const alias of ALLERGY_CLASS_ALIASES) {
    if (alias.klass !== drug.klass) continue;
    if (alias.match.some((m) => a.includes(m))) {
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
}): DoseAlert[] {
  const { drug, species, mgPerKg, route, freq, concurrent = [], allergies = [], flags = {} } = opts;
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
  if (!win) {
    out.push({ id: "no-window", tone: "warn", title: "ما عندنا جرعة موثّقة لهذا النوع", detail: "راجع مرجع دوائي قبل الإعطاء." });
  } else if (mgPerKg > 0) {
    // --- Hard ceiling (enrofloxacin in cats, meloxicam in cats).
    if (win.hardMax !== undefined && mgPerKg > win.hardMax) {
      out.push({
        id: "hard-max", tone: "critical", blocking: true,
        title: `تجاوزت السقف المسموح: ${mgPerKg} ملغ/كغ (الحد ${win.hardMax})`,
        detail: win.hardMaxReason,
      });
    } else if (mgPerKg > win.max * 2) {
      out.push({
        id: "overdose-severe", tone: "critical", blocking: true,
        title: `جرعة زائدة خطيرة — ضعف الحد الأعلى (${win.max} ملغ/كغ)`,
        detail: "تأكّد من الوزن ومن تركيز الأمبولة قبل الحقن.",
      });
    } else if (mgPerKg > win.max) {
      out.push({
        id: "overdose", tone: "warn",
        title: `فوق النطاق المعتاد (${win.min}–${win.max} ملغ/كغ)`,
        detail: "مقبول أحياناً بحالات معيّنة — بس تأكّد إنك قاصدها.",
      });
    } else if (mgPerKg < win.min) {
      out.push({
        id: "underdose", tone: "warn",
        title: `تحت الجرعة العلاجية (${win.min}–${win.max} ملغ/كغ)`,
        detail: "الجرعة الناقصة ما بتعالج وبتربّي مقاومة للمضاد الحيوي.",
      });
    } else {
      out.push({ id: "in-range", tone: "good", title: `ضمن النطاق العلاجي (${win.min}–${win.max} ملغ/كغ)` });
    }

    // --- Cumulative daily ceiling.
    const perDay = freq === 0 || freq === undefined ? 1 : 24 / freq;
    if (drug.maxDailyMgPerKg && mgPerKg * perDay > drug.maxDailyMgPerKg) {
      out.push({
        id: "daily-max", tone: "critical", blocking: true,
        title: `مجموع اليوم ${(mgPerKg * perDay).toFixed(1)} ملغ/كغ — فوق السقف اليومي (${drug.maxDailyMgPerKg})`,
        detail: "وسّع الفاصل بين الجرعات أو نزّل الجرعة الواحدة.",
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
