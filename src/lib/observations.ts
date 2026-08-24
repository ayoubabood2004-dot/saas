import i18n from "@/i18n";
import type { Species, TaskType, TreatmentEntry } from "@/types";
import { rangeForPet, type VitalRange } from "./vitals";

/* ============================================================================
 * observations — مفردات المتابعة اليومية المعيارية.
 *
 * ── لماذا اختياراتٌ لا كتابة ─────────────────────────────────────────────
 * نصٌّ حرّ («الحيوان تعبان شوية») لا يُقارَن بين الأيام، ولا يُرسَم منحنى،
 * ولا يقرأه طبيبُ الوردية التالية بالمعنى الذي قُصد. والاختيار المعياري
 * («ضعيفة») يفعل الثلاثة — وهو أسرع من أي كتابةٍ على آيباد بيدٍ مشغولة.
 *
 * وهذا هو المعيار العالمي نفسه (BAR / QAR / Dull / Obtunded بأوراق الرقود)
 * مكتوباً بلسان العيادة العراقية: «زينة» لا «Bright, Alert, Responsive».
 *
 * ── أين تُخزَّن القيمة ────────────────────────────────────────────────────
 * بعمود `result` الموجود منذ الهجرة ٠١١٥ — **نصَّ التسمية كما يقرؤها
 * الإنسان** («زينة»، «أكل نصّه»، «39.7»). فالطبلة القديمة واللوحة والتقارير
 * تقرؤها بلا أن تعرف هذا الملف، وأي تصديرٍ يبقى مقروءاً خارج النظام.
 * والدرجة اللونية لا تُخزَّن بل **تُستنتج عند الرسم** (`toneOfResult`) —
 * فتصحيحُ تصنيفٍ هنا يسري على كل التاريخ المسجَّل بلا لمس بيانات.
 *
 * ── كيف يُعرف سُلَّمُ صفٍّ ما ─────────────────────────────────────────────
 * لا عمودَ جديداً يحمل «نوع المتابعة»: يُستدلّ عليه من اسم الصفّ بكلماتٍ
 * مفتاحية (حرارة → temp، بول → urine…)، وإن لم يُصِب الاسمُ شيئاً فمن
 * `task_type` (feed → الشهية…). فالصفوف التي تكتبها البروتوكولات بأسمائها
 * القانونية تُصيب دائماً، والمكتوبة باليد تسقط على سلّمِ نوعها — وما لا
 * سلّمَ له (مختبر، تمريض حرّ) يبقى على الإدخال الحرّ القديم كما هو.
 * ==========================================================================*/

/** درجةُ خيارٍ واحد — تقود لون الخانة واليومية، من الأخضر إلى الأحمر. */
export type ObsTone = "good" | "mid" | "low" | "crit" | "none";

export interface ObsOption {
  /** معرّفٌ ثابت عبر اللغات — للفحص والإحصاء. */
  id: string;
  /** التسمية الكاملة — هي ما يُخزَّن بـ`result` ويُعرض بالقوائم. */
  label: () => string;
  /** ما يُطبع داخل الخانة الضيّقة — كلمةٌ واحدة تُقرأ بحجم ٤٤ بكسل. */
  short: () => string;
  tone: ObsTone;
  /** سطرُ إيضاحٍ صغير بورقة الاختيار — يعرّف الدرجة تعريفاً لا لبس فيه. */
  hint?: () => string;
}

export interface ObsScale {
  id: string;
  name: () => string;
  options: ObsOption[];
  /**
   * سُلَّمٌ رقمي إلى جانب الخيارات (الحرارة): شرائحُ قيمٍ جاهزة تُضبط
   * بـ±٠٫١ — فالرقم الدقيق له قيمةٌ سريرية لا تعوّضها كلمة، ولوحةُ مفاتيح
   * النظام تقلب نصف الشاشة.
   */
  numeric?: {
    /** الشرائح الجاهزة — تغطّي المدى السريري المعقول. */
    presets: number[];
    step: number;
    unit: () => string;
    /** المفتاح بجدول المدى الطبيعي (`vitals`) — منه يُصنَّف الرقم. */
    vitalKey: "temp";
  };
}

const o = (id: string, tone: ObsTone, label: () => string, short: () => string, hint?: () => string): ObsOption =>
  ({ id, tone, label, short, hint });

/* ── السلالم ──────────────────────────────────────────────────────────────
 * الترتيب داخل كل سُلَّم ثابت: من الأحسن إلى الأسوأ — فموضع الخيار وحده
 * يحمل معنى، والإصبع يتعلّم المواضع مع التكرار.                             */
export const OBS_SCALES: Record<string, ObsScale> = {
  mentation: {
    id: "mentation",
    name: () => i18n.t("obs.mentation", "الحالة العامة"),
    options: [
      o("bar", "good", () => i18n.t("obs.mBar", "زينة"), () => i18n.t("obs.mBarS", "زينة"), () => i18n.t("obs.mBarH", "نشيط ويستجيب")),
      o("qar", "mid", () => i18n.t("obs.mQar", "متوسطة"), () => i18n.t("obs.mQarS", "متوسطة"), () => i18n.t("obs.mQarH", "هادئ لكنه يستجيب")),
      o("dull", "low", () => i18n.t("obs.mDull", "ضعيفة"), () => i18n.t("obs.mDullS", "ضعيفة"), () => i18n.t("obs.mDullH", "خامل، استجابة قليلة")),
      o("obtunded", "crit", () => i18n.t("obs.mObt", "خطرة"), () => i18n.t("obs.mObtS", "خطرة"), () => i18n.t("obs.mObtH", "لا يستجيب")),
    ],
  },
  appetite: {
    id: "appetite",
    name: () => i18n.t("obs.appetite", "الأكل والشهية"),
    options: [
      o("all", "good", () => i18n.t("obs.aAll", "أكل كله"), () => i18n.t("obs.aAllS", "كله")),
      o("half", "mid", () => i18n.t("obs.aHalf", "أكل نصّه"), () => i18n.t("obs.aHalfS", "نصّه")),
      o("taste", "low", () => i18n.t("obs.aTaste", "ذاق بس"), () => i18n.t("obs.aTasteS", "ذاق")),
      o("refused", "crit", () => i18n.t("obs.aRef", "رفض الأكل"), () => i18n.t("obs.aRefS", "رفض")),
      o("npo", "none", () => i18n.t("obs.aNpo", "ممنوع أكل"), () => i18n.t("obs.aNpoS", "ممنوع"), () => i18n.t("obs.aNpoH", "بأمر الطبيب — صيام")),
    ],
  },
  stool: {
    id: "stool",
    name: () => i18n.t("obs.stool", "البراز"),
    options: [
      o("normal", "good", () => i18n.t("obs.sNorm", "طبيعي"), () => i18n.t("obs.sNormS", "طبيعي")),
      o("soft", "mid", () => i18n.t("obs.sSoft", "ليّن"), () => i18n.t("obs.sSoftS", "ليّن")),
      o("diarrhea", "low", () => i18n.t("obs.sDia", "إسهال"), () => i18n.t("obs.sDiaS", "إسهال")),
      o("bloody", "crit", () => i18n.t("obs.sBlood", "إسهال بدم"), () => i18n.t("obs.sBloodS", "بدم")),
      o("none", "none", () => i18n.t("obs.sNone", "ما تبرّز"), () => i18n.t("obs.sNoneS", "بلا")),
    ],
  },
  urine: {
    id: "urine",
    name: () => i18n.t("obs.urine", "البول"),
    options: [
      o("normal", "good", () => i18n.t("obs.uNorm", "طبيعي"), () => i18n.t("obs.uNormS", "طبيعي")),
      o("little", "mid", () => i18n.t("obs.uLittle", "قليل"), () => i18n.t("obs.uLittleS", "قليل")),
      o("strain", "low", () => i18n.t("obs.uStrain", "يجهد"), () => i18n.t("obs.uStrainS", "يجهد"), () => i18n.t("obs.uStrainH", "يحاول ويطلع قليل — راقبه")),
      o("none", "crit", () => i18n.t("obs.uNone", "ما بال"), () => i18n.t("obs.uNoneS", "ما بال"), () => i18n.t("obs.uNoneH", "انسدادٌ محتمل — أخبر الطبيب فوراً")),
    ],
  },
  fluids: {
    id: "fluids",
    name: () => i18n.t("obs.fluids", "السوائل"),
    options: [
      o("full", "good", () => i18n.t("obs.fFull", "تمّت كاملة"), () => i18n.t("obs.fFullS", "كاملة")),
      o("partial", "mid", () => i18n.t("obs.fPart", "جزئية"), () => i18n.t("obs.fPartS", "جزئية")),
      o("stopped", "crit", () => i18n.t("obs.fStop", "توقّفت"), () => i18n.t("obs.fStopS", "توقّفت"), () => i18n.t("obs.fStopH", "انسداد قسطرة أو تسريب — عالجه")),
    ],
  },
  temp: {
    id: "temp",
    name: () => i18n.t("obs.temp", "الحرارة"),
    options: [
      o("normal", "good", () => i18n.t("obs.tNorm", "طبيعية"), () => i18n.t("obs.tNormS", "طبيعية")),
      o("high", "low", () => i18n.t("obs.tHigh", "مرتفعة"), () => i18n.t("obs.tHighS", "مرتفعة")),
      o("lowt", "crit", () => i18n.t("obs.tLow", "منخفضة"), () => i18n.t("obs.tLowS", "منخفضة"), () => i18n.t("obs.tLowH", "انخفاض الحرارة أخطر من ارتفاعها")),
    ],
    numeric: {
      presets: [37.0, 37.5, 38.0, 38.5, 39.0, 39.5, 40.0, 40.5],
      step: 0.1,
      unit: () => i18n.t("obs.celsius", "°م"),
      vitalKey: "temp",
    },
  },
};

/* ── أي سُلَّمٍ لأي صف ────────────────────────────────────────────────────
 * الاسم أولاً ثم النوع: البروتوكولات تكتب أسماءً قانونية تُصيب الكلمات
 * المفتاحية، والمكتوب باليد يسقط على سُلَّمِ نوعه.
 *
 * والكلمات نفسها **محتوى مترجَم** لا بنيةٌ مجمّدة: بواجهةٍ إنجليزية يكتب
 * الطبيب «temp»، فتتبع القائمةُ اللغةَ عبر t() — مع إبقاء كلا اللسانين
 * بالافتراضي، لأن صفّاً كُتب بالعربية يجب أن يُحلّ سُلَّمُه أيضاً بعد تبديل
 * لغة الواجهة. */
const kw = (packed: string): string[] => packed.split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
const KEYWORDS: () => [string[], string][] = () => [
  [kw(i18n.t("obs.kwTemp", "حرار|درجة|temp")), "temp"],
  [kw(i18n.t("obs.kwMentation", "حالة|عام|وعي|مزاج|mentat|attitude")), "mentation"],
  [kw(i18n.t("obs.kwUrine", "بول|ادرار|إدرار|urin")), "urine"],
  [kw(i18n.t("obs.kwStool", "براز|تبرز|تبرّز|غائط|اخراج|إخراج|stool|fece")), "stool"],
  [kw(i18n.t("obs.kwAppetite", "أكل|اكل|شهي|تغذية|طعام|وجب|feed|appetite|eat")), "appetite"],
  [kw(i18n.t("obs.kwFluids", "سوائل|سائل|وريد|محلول|fluid|iv")), "fluids"],
];

const TYPE_FALLBACK: Partial<Record<TaskType, string>> = {
  vitals: "temp",
  feed: "appetite",
  elim: "stool",
  fluid: "fluids",
};

/** سُلَّم هذا الصفّ — أو لا شيء فيبقى على الإدخال الحرّ (مختبر، تمريض). */
export function scaleFor(entry: Pick<TreatmentEntry, "medication" | "task_type">): ObsScale | null {
  /* المختبر حرٌّ دائماً — بالعقد لا بالمصادفة: «تحليل البول» نتيجتُه كثافةٌ
   * ورقمُ pH وراسب، لا «قليل/يجهد». لولا هذا السطر لاختطفت كلمةُ «بول»
   * التحليلَ كلَّه وصار إدخالُ نتيجته مستحيلاً. */
  if (entry.task_type === "lab") return null;
  const name = (entry.medication ?? "").toLowerCase();
  for (const [words, id] of KEYWORDS()) if (words.some((w) => name.includes(w))) return OBS_SCALES[id];
  const fb = entry.task_type ? TYPE_FALLBACK[entry.task_type] : undefined;
  return fb ? OBS_SCALES[fb] : null;
}

/* ── قراءة قيمةٍ مخزَّنة ─────────────────────────────────────────────────── */

/** رقمٌ عربيّ الصياغة أو غربيّها → عدد. `null` لغير الرقمي. */
export function parseNum(v: string | null | undefined): number | null {
  if (!v) return null;
  // الأرقام العربية-الهندية (U+0660–0669) تُزاح حسابياً، والفاصلة العربية
  // (U+066B) تصير نقطة — بلا جداول محارف.
  // U+0660–0669 الأرقام العربية-الهندية، وU+066B الفاصلة العشرية العربية.
  const west = v.trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\u066B/g, ".");
  const m = /^(\d+(?:\.\d+)?)/.exec(west);
  return m ? parseFloat(m[1]) : null;
}

/** تصنيف رقمٍ على مدى النوع (مع تخصيص العيادة والحيوان إن وُجد). */
export function classifyNum(n: number, range: VitalRange): ObsTone {
  // الانخفاض عن المدى أخطر سريرياً من الارتفاع بنفس القدر — فهو `crit` دائماً.
  if (n < range.min) return "crit";
  // وفوق المدى درجتان لا واحدة: حمّى (برتقالي) وفرطُ حرارةٍ يهدّد الحياة
  // (أحمر). بلا هذا السقف كان ٤١٫٩ يُرسم كـ٣٩٫٣ سواء — وضربة الحرّ تستعجل.
  if (n > range.max + 1.2) return "crit";
  if (n > range.max) return "low";
  return "good";
}

/**
 * المدى المستعمل لتصنيف حرارة هذا الحيوان — تخصيص العيادة يسبق الافتراضي.
 *
 * وبلا نوعٍ معروف **لا مدى**: افتراضُ «كلب» كان يحكم على قطٍّ عند ٣٧٫٧
 * بأنه طبيعي (والحقّ أنه ناقص الحرارة) ويطبع المدى الخاطئ بثقةٍ كاملة.
 * فالجهل يُعلن جهلاً: الرقم يُسجَّل بلا حكمٍ لوني ولا مدى مطبوع.
 */
export function tempRange(species: Species | undefined, petId?: string): VitalRange | null {
  return species ? rangeForPet(species, "temp", petId) : null;
}

/**
 * درجةُ قيمةٍ مخزَّنة — للتلوين عند الرسم.
 *
 * تُطابَق التسمياتُ الكاملة والقصيرة معاً: القديم المخزَّن قبل هذا الملف
 * («بال / تغوّط» الحرّ) لا يطابق شيئاً فيرجع `null` ويُرسم كما كان — لا
 * نكسر تاريخاً مكتوباً.
 */
export function toneOfResult(
  entry: Pick<TreatmentEntry, "medication" | "task_type" | "result">,
  species?: Species,
  petId?: string,
): ObsTone | null {
  const v = (entry.result ?? "").trim();
  if (!v) return null;
  const scale = scaleFor(entry);
  if (!scale) return null;
  if (scale.numeric) {
    const n = parseNum(v);
    if (n !== null) {
      // بلا نوعٍ معروف لا حكمَ لونيّاً — الرقم يُعرض محايداً لا «طبيعياً» زوراً.
      const range = tempRange(species, petId);
      return range ? classifyNum(n, range) : null;
    }
  }
  const hit = scale.options.find((op) => op.label() === v || op.short() === v);
  return hit ? hit.tone : null;
}

/** الخيار المطابق لقيمةٍ مخزَّنة — لعرض تسميتها القصيرة بالخانة الضيقة. */
export function optionOfResult(
  entry: Pick<TreatmentEntry, "medication" | "task_type" | "result">,
): ObsOption | null {
  const v = (entry.result ?? "").trim();
  if (!v) return null;
  const scale = scaleFor(entry);
  if (!scale) return null;
  return scale.options.find((op) => op.label() === v || op.short() === v) ?? null;
}

/* ── المتابعات الجاهزة ────────────────────────────────────────────────────
 * أسماءٌ قانونية تُكتب بصفوف الورقة فتُصيب سُلَّمها دائماً. تُعرض شرائحَ
 * إضافةٍ سريعة، وتستعملها البروتوكولات المدمجة.                             */
export interface ObsPreset {
  scale: string;
  task_type: TaskType;
  label: () => string;
  /** كم مرّةً باليوم افتراضاً حين تُضاف من الشريحة. */
  perDay: number;
}

export const OBS_PRESETS: ObsPreset[] = [
  { scale: "mentation", task_type: "vitals", perDay: 3, label: () => i18n.t("obs.mentation", "الحالة العامة") },
  { scale: "temp", task_type: "vitals", perDay: 2, label: () => i18n.t("obs.temp", "الحرارة") },
  { scale: "appetite", task_type: "feed", perDay: 2, label: () => i18n.t("obs.appetite", "الأكل والشهية") },
  { scale: "stool", task_type: "elim", perDay: 1, label: () => i18n.t("obs.stool", "البراز") },
  { scale: "urine", task_type: "elim", perDay: 1, label: () => i18n.t("obs.urine", "البول") },
  { scale: "fluids", task_type: "fluid", perDay: 3, label: () => i18n.t("obs.fluids", "السوائل") },
];
