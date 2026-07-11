// ============================================================================
// Structured clinical diagnoses — a veterinary catalogue organised BY BODY
// SYSTEM, so a doctor picks the system, sees the conditions that belong to it,
// selects one or MORE, and grades each by severity. This turns the free-text
// "assessment" into a tidy, consistent, searchable record (the thing that makes
// a good clinic system read as "organised, no mistakes").
//
// The catalogue is a sensible starter set — extend the disease lists freely;
// nothing else has to change. Names are Arabic (the app's primary language).
// ============================================================================

export type Severity = "mild" | "moderate" | "severe";

export const SEVERITIES: { id: Severity; label: string; dot: string; chip: string }[] = [
  { id: "mild",     label: "خفيف",  dot: "bg-success-500", chip: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" },
  { id: "moderate", label: "متوسط", dot: "bg-warn-500",    chip: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300" },
  { id: "severe",   label: "شديد",  dot: "bg-danger-500",  chip: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" },
];

export const severityLabel = (s: Severity) => SEVERITIES.find((x) => x.id === s)?.label ?? "";

export interface BodySystem {
  id: string;
  name: string;   // Arabic display
  emoji: string;
  diseases: string[];
}

/** Body systems → the conditions commonly seen in each. */
export const BODY_SYSTEMS: BodySystem[] = [
  {
    id: "respiratory", name: "الجهاز التنفسي", emoji: "🫁",
    diseases: ["التهاب القصبات", "التهاب رئوي", "التهاب الأنف والحنجرة", "سعال الكلاب (السعال الكنلي)", "ربو قططي", "انصباب جنبي", "التهاب الجيوب", "رعاف (نزيف أنفي)"],
  },
  {
    id: "digestive", name: "الجهاز الهضمي", emoji: "🩻",
    diseases: ["التهاب المعدة والأمعاء", "إسهال حاد", "إمساك", "التهاب البنكرياس", "انسداد معوي", "التهاب الكبد", "قيء مزمن", "التهاب القولون", "جسم غريب معوي", "انتفاخ المعدة (GDV)"],
  },
  {
    id: "derm", name: "الجلد والفراء", emoji: "🐾",
    diseases: ["التهاب جلد تحسسي", "جرب (مانج)", "قوباء حلقية (فطريات)", "التهاب جلد بكتيري (بيوديرما)", "حساسية لدغ البراغيث", "خراج جلدي", "تساقط شعر (ثعلبة)", "ورم جلدي", "التهاب الغدد الزهمية"],
  },
  {
    id: "eyes", name: "العيون", emoji: "👁️",
    diseases: ["التهاب الملتحمة", "قرحة القرنية", "الساد (المياه البيضاء)", "الزرق (المياه الزرقاء)", "جفاف القرنية (KCS)", "التهاب القزحية", "انسداد القناة الدمعية", "بروز الغدة الدمعية (Cherry eye)"],
  },
  {
    id: "ear", name: "الأذن", emoji: "👂",
    diseases: ["التهاب الأذن الخارجية", "التهاب الأذن الوسطى", "ورم دموي بصيوان الأذن", "عث الأذن", "التهاب أذن فطري", "انسداد صملاخي"],
  },
  {
    id: "urinary", name: "الجهاز البولي", emoji: "💧",
    diseases: ["التهاب المثانة", "حصى بولية", "انسداد مجرى البول", "قصور كلوي حاد", "قصور كلوي مزمن", "التهاب الكلية", "سلس بولي", "متلازمة المجاري البولية القططية (FLUTD)"],
  },
  {
    id: "reproductive", name: "الجهاز التناسلي", emoji: "⚧️",
    diseases: ["تقيّح الرحم (Pyometra)", "التهاب الرحم", "عسر الولادة", "التهاب البروستات", "التهاب الضرع", "خراج المهبل", "احتباس المشيمة", "ورم الغدد اللبنية"],
  },
  {
    id: "cardio", name: "القلب والأوعية", emoji: "❤️",
    diseases: ["قصور القلب الاحتقاني", "اعتلال عضلة القلب الضخامي", "أمراض الصمامات", "الديدان القلبية (Heartworm)", "عدم انتظام ضربات القلب", "ارتفاع ضغط الدم"],
  },
  {
    id: "msk", name: "العظام والمفاصل", emoji: "🦴",
    diseases: ["كسر", "التهاب المفاصل", "خلع مفصل", "تمزق الرباط الصليبي", "خلل التنسج الوركي", "التواء", "التهاب العظم والنقي", "ضمور عضلي", "عرج غير محدد السبب"],
  },
  {
    id: "neuro", name: "الجهاز العصبي", emoji: "🧠",
    diseases: ["نوبات صرع", "شلل", "انزلاق غضروفي (IVDD)", "التهاب الدماغ", "متلازمة الدهليز", "رنح (فقدان التوازن)", "رضّ دماغي"],
  },
  {
    id: "dental", name: "الأسنان والفم", emoji: "🦷",
    diseases: ["التهاب اللثة", "التهاب دواعم السن", "جير وترسبات", "خراج سني", "كسر سن", "التهاب الفم التقرحي", "ورم فموي"],
  },
  {
    id: "endocrine", name: "الغدد والهرمونات", emoji: "⚗️",
    diseases: ["داء السكري", "قصور الغدة الدرقية", "فرط نشاط الغدة الدرقية", "متلازمة كوشينغ", "داء أديسون", "السمنة"],
  },
  {
    id: "infectious", name: "أمراض معدية وطفيلية", emoji: "🦠",
    diseases: ["بارفو الكلاب", "ديستمبر (الكارّيه)", "طاعون القطط (Panleukopenia)", "الديدان المعوية", "طفيليات دموية", "الليشمانيا", "داء البابيزيا", "التهاب الصفاق القططي (FIP)", "سعار (اشتباه)"],
  },
  {
    id: "general", name: "عام / أخرى", emoji: "🩺",
    diseases: ["حمى غير محددة السبب", "جفاف", "تسمم", "صدمة", "فقر دم", "خمول وفقدان شهية", "جرح رضّي", "لدغة/عضة", "ضربة شمس"],
  },
];

export interface Diagnosis {
  system: string;   // BodySystem.id
  disease: string;
  severity: Severity;
}

export function systemById(id: string): BodySystem | undefined {
  return BODY_SYSTEMS.find((s) => s.id === id);
}

/** One-line human summary, e.g. "التهاب الأذن الخارجية (متوسط) · كسر (شديد)". */
export function summarizeDiagnoses(list: Diagnosis[]): string {
  return list.map((d) => `${d.disease} (${severityLabel(d.severity)})`).join(" · ");
}
