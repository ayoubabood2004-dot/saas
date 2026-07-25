// ============================================================================
// كتالوج العمليات الجراحية البيطرية — منظم حسب التصنيف.
// يُستخدم في نافذة «تسجيل عملية» داخل سجل الحالة: الطبيب يبحث أو يتصفح
// بالتصنيف ويختار، مع إمكانية كتابة اسم عملية مخصص دائماً.
// followupDays: الافتراضي لموعد المتابعة/شيل الخيوط — يُقترح تلقائياً ويبقى قابلاً للتعديل.
// ============================================================================

export interface SurgeryCatalogItem {
  /** الاسم المعروض (عربي + الاسم العلمي/الإنجليزي للدقة). */
  name: string;
  en?: string;
  /** أيام المتابعة المقترحة (شيل خيوط / مراجعة). 0 = بلا اقتراح. */
  followupDays?: number;
}

export interface SurgeryCategory {
  key: string;
  label: string;
  icon: string;
  items: SurgeryCatalogItem[];
}

export const SURGERY_CATALOG: SurgeryCategory[] = [
  {
    key: "neuter",
    label: "التعقيم والتوليد",
    icon: "🐾",
    items: [
      { name: "تعقيم أنثى (استئصال الرحم والمبايض)", en: "Ovariohysterectomy (Spay)", followupDays: 10 },
      { name: "تعقيم ذكر", en: "Castration (Neuter)", followupDays: 7 },
      { name: "عملية قيصرية", en: "Caesarean Section", followupDays: 10 },
      { name: "استئصال رحم متقيح", en: "Pyometra Surgery", followupDays: 10 },
      { name: "إنزال خصية معلقة", en: "Cryptorchid Castration", followupDays: 10 },
    ],
  },
  {
    key: "soft",
    label: "الأنسجة الرخوة والبطن",
    icon: "🫀",
    items: [
      { name: "فتح بطن استكشافي", en: "Exploratory Laparotomy", followupDays: 10 },
      { name: "استخراج جسم غريب (معدة/أمعاء)", en: "GI Foreign Body Removal", followupDays: 10 },
      { name: "استئصال الطحال", en: "Splenectomy", followupDays: 10 },
      { name: "إصلاح فتق (سري/أربي/حجابي)", en: "Hernia Repair", followupDays: 10 },
      { name: "استئصال المرارة", en: "Cholecystectomy", followupDays: 10 },
      { name: "تثبيت المعدة (انتفاخ والتواء)", en: "Gastropexy (GDV)", followupDays: 10 },
      { name: "استئصال كتلة/ورم جلدي", en: "Mass / Tumor Removal", followupDays: 10 },
      { name: "استئصال أورام الغدد اللبنية", en: "Mammary Tumor Removal", followupDays: 10 },
      { name: "خياطة جرح / تنضير", en: "Wound Repair & Debridement", followupDays: 7 },
      { name: "تصريف خراج", en: "Abscess Drainage", followupDays: 5 },
    ],
  },
  {
    key: "ortho",
    label: "العظام والمفاصل",
    icon: "🦴",
    items: [
      { name: "تثبيت كسر (صفيحة/أسياخ)", en: "Fracture Fixation", followupDays: 14 },
      { name: "جراحة الرباط الصليبي", en: "Cruciate Ligament (TPLO/Lateral)", followupDays: 14 },
      { name: "إصلاح خلع الرضفة", en: "Patellar Luxation Repair", followupDays: 14 },
      { name: "استئصال رأس عظم الفخذ", en: "FHO — Femoral Head Ostectomy", followupDays: 14 },
      { name: "بتر طرف", en: "Limb Amputation", followupDays: 12 },
      { name: "بتر ذيل", en: "Tail Amputation / Docking", followupDays: 10 },
    ],
  },
  {
    key: "dental",
    label: "الأسنان والفم",
    icon: "🦷",
    items: [
      { name: "تنظيف أسنان تحت التخدير", en: "Dental Scaling & Polishing", followupDays: 0 },
      { name: "قلع أسنان", en: "Tooth Extraction", followupDays: 7 },
      { name: "إصلاح كسر فك", en: "Jaw Fracture Repair", followupDays: 14 },
      { name: "استئصال ورم فموي", en: "Oral Mass Removal", followupDays: 10 },
    ],
  },
  {
    key: "eye",
    label: "العيون",
    icon: "👁️",
    items: [
      { name: "إصلاح بروز الجفن الثالث", en: "Cherry Eye Repair", followupDays: 10 },
      { name: "خياطة جفون مؤقتة (قرحة قرنية)", en: "Tarsorrhaphy / Corneal Ulcer", followupDays: 10 },
      { name: "استئصال العين", en: "Enucleation", followupDays: 10 },
      { name: "إصلاح انقلاب الجفن", en: "Entropion / Ectropion Repair", followupDays: 10 },
    ],
  },
  {
    key: "ent",
    label: "الأذن والأنف",
    icon: "👂",
    items: [
      { name: "تصريف ورم دموي بالأذن", en: "Aural Hematoma Repair", followupDays: 10 },
      { name: "استئصال قناة الأذن", en: "Total Ear Canal Ablation", followupDays: 12 },
      { name: "توسيع فتحات الأنف (قصير الخطم)", en: "Stenotic Nares (BOAS)", followupDays: 10 },
    ],
  },
  {
    key: "uro",
    label: "المسالك البولية",
    icon: "💧",
    items: [
      { name: "فتح مثانة واستخراج حصى", en: "Cystotomy — Stone Removal", followupDays: 10 },
      { name: "توسيع مجرى البول / تحويله", en: "Urethrostomy", followupDays: 10 },
      { name: "قسطرة انسداد بولي تحت تخدير", en: "Urethral Obstruction Relief", followupDays: 3 },
    ],
  },
  {
    key: "other",
    label: "أخرى",
    icon: "🩺",
    items: [
      { name: "تركيب أنبوب تغذية", en: "Feeding Tube Placement", followupDays: 7 },
      { name: "تنظير / أخذ خزعة", en: "Endoscopy / Biopsy", followupDays: 7 },
      { name: "عملية أخرى (اكتب الاسم)", en: "Custom procedure", followupDays: 0 },
    ],
  },
];

/* ---------------------------------------------------------------------------
 * التفاصيل الجراحية العلمية (اختيارية) — الطرق الجراحية وأنماط الخياطة وموادها.
 * ------------------------------------------------------------------------- */

/** الطريقة / المدخل الجراحي (Surgical approach). */
export const APPROACH_OPTIONS = [
  "شق خط الوسط البطني (Ventral midline)",
  "شق جانبي (Flank approach)",
  "جراحة تنظيرية (Laparoscopic)",
  "مدخل جانبي للصدر (Lateral thoracotomy)",
  "مدخل فوق العانة (Prepubic)",
  "مدخل جلدي مباشر فوق الآفة",
  "مدخل فموي (Oral approach)",
  "أخرى — تُذكر في الملاحظات",
] as const;

/** أنماط الخياطة (Suture patterns) — تُختار أكثر من واحدة عند الحاجة. */
export const SUTURE_PATTERNS = [
  "متقطعة بسيطة (Simple interrupted)",
  "مستمرة بسيطة (Simple continuous)",
  "فورد المتشابكة (Ford interlocking)",
  "متصالبة (Cruciate)",
  "فراشية أفقية (Horizontal mattress)",
  "فراشية عمودية (Vertical mattress)",
  "تحت الجلد (Subcuticular / Intradermal)",
  "خيط الكيس (Purse-string)",
  "كوشينغ (Cushing)",
  "ليمبرت (Lembert)",
  "كونيل (Connell)",
  "بعيدة-قريبة (Far-near-near-far)",
] as const;

/** مواد الخيوط الجراحية (Suture materials). */
export const SUTURE_MATERIALS = [
  "PDS II (Polydioxanone)",
  "Vicryl (Polyglactin 910)",
  "Monocryl (Poliglecaprone 25)",
  "Prolene (Polypropylene)",
  "Nylon (Ethilon)",
  "Silk (حرير)",
  "Chromic Catgut",
  "Stainless wire (سلك)",
  "دبابيس جلدية (Staples)",
] as const;

/** قياسات الخيط (USP). */
export const SUTURE_SIZES = ["1", "0", "2-0", "3-0", "4-0", "5-0", "6-0"] as const;

/** خيارات التخدير المعروضة في النموذج. */
export const ANESTHESIA_OPTIONS = ["تخدير عام", "تخدير موضعي", "تهدئة", "بدون تخدير"] as const;

/** نتيجة العملية — success يفعّل الشارة الخضراء في السجل. */
export const SURGERY_OUTCOMES = [
  { id: "success", label: "ناجحة" },
  { id: "complications", label: "مضاعفات" },
  { id: "critical", label: "حرجة / تحت المراقبة" },
] as const;

export const outcomeLabel = (id: string | null | undefined): string =>
  SURGERY_OUTCOMES.find((o) => o.id === id)?.label ?? (id || "—");
