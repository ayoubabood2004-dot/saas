// ============================================================================
// قوالب الحالات — presentation-based SOAP scaffolds.
//
// The SOAP page already existed; what took the time was the blank page. A vet
// seeing the fifth vomiting cat of the day retypes the same examination line by
// line, so in practice the objective section gets skipped and the record thins
// out — exactly the part that matters six months later.
//
// A template is a STARTING POINT, never a finished note: it pre-writes the
// structure and the things you must not forget to check, with blanks (____)
// where the actual findings go. The doctor edits every line.
// ============================================================================
import type { Sp } from "@/lib/clinicalKnowledge";

export interface SoapTemplate {
  id: string;
  label: string;
  /** Limit to species where the template makes sense; omitted = all. */
  species?: Sp[];
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

/** The shared physical-exam skeleton — every template starts from it. */
const EXAM = [
  "الفحص العام: الحرارة ____ °م · النبض ____ · التنفّس ____",
  "الأغشية المخاطية: ____ · زمن امتلاء الشعيرات: ____ ثانية",
  "الترطيب: ____ · درجة السمنة (BCS): ____/9 · الوزن: ____ كغ",
  "العقد اللمفاوية: ____ · تسمّع الصدر والقلب: ____ · جس البطن: ____",
].join("\n");

export const SOAP_TEMPLATES: SoapTemplate[] = [
  {
    id: "wellness",
    label: "فحص دوري / صحة عامة",
    subjective: "مراجعة دورية بلا شكوى. الشهية ____ · النشاط ____ · البول والبراز ____\nالغذاء الحالي: ____ · الوقاية من الطفيليات: ____ · آخر تطعيم: ____",
    objective: `${EXAM}\nالجلد والفراء: ____ · الأذنان: ____ · العينان: ____ · الفم والأسنان: ____`,
    assessment: "حيوان سليم ظاهرياً — فحص دوري",
    plan: "• تحديث التطعيمات حسب الجدول\n• جرعة مضاد الطفيليات الداخلية والخارجية\n• توصية غذائية: ____\n• مراجعة بعد ____",
  },
  {
    id: "vomiting",
    label: "قيء / اضطراب هضمي",
    subjective: "قيء منذ ____ · عدد المرات باليوم ____ · محتواه ____ (طعام/صفراء/دم)\nالشهية ____ · الشرب ____ · البراز ____ · احتمال ابتلاع جسم غريب أو سمّ: ____\nآخر وجبة/تغيير غذائي: ____",
    objective: `${EXAM}\nجس البطن: ألم ____ · انتفاخ ____ · كتلة محسوسة ____\nعلامات الجفاف: طيّة الجلد ____ · غؤور العينين ____`,
    assessment: "التهاب معدة وأمعاء — السبب قيد التحديد",
    plan: "• صيام ____ ساعة ثم غذاء سهل الهضم تدريجياً\n• سوائل وريدية/تحت الجلد حسب درجة الجفاف\n• مضاد قيء (ماروبيتانت) + حامي معدة\n• تحاليل: CBC + كيمياء + أشعة بطن إذا استمر\n• علامات خطر توجب المراجعة الفورية: قيء متواصل، خمول شديد، دم\n• مراجعة بعد ____",
  },
  {
    id: "diarrhea",
    label: "إسهال",
    subjective: "إسهال منذ ____ · القوام ____ · وجود دم/مخاط ____ · عدد المرات ____\nالشهية ____ · القيء ____ · تغيير غذائي أو أكل من الشارع: ____ · حالة الديدان: ____",
    objective: `${EXAM}\nجس البطن: ____ · فحص الشرج والمنطقة المحيطة: ____`,
    assessment: "إسهال حاد — التمييز بين غذائي وطفيلي وجرثومي",
    plan: "• فحص براز (طفيليات + جيارديا)\n• غذاء سهل الهضم + بروبيوتيك\n• ميترونيدازول إذا اشتُبه بالجرثومي/الأوّالي\n• سوائل حسب الجفاف\n• مراجعة بعد ____",
  },
  {
    id: "derm",
    label: "حكّة / مشكلة جلدية",
    subjective: "حكّة منذ ____ · شدّتها ____ · المناطق المصابة ____\nموسمية؟ ____ · الغذاء الحالي ____ · مكافحة البراغيث ____ · حكّة عند أهل البيت؟ ____",
    objective: `${EXAM}\nتوزّع الآفات: ____ · نوعها (احمرار/قشور/تساقط/بثور): ____\nكشط جلدي: ____ · فحص بالمصباح: ____ · شريط لاصق: ____`,
    assessment: "التهاب جلد — التمييز بين تحسّسي وطفيلي وفطري",
    plan: "• كشط جلدي + فحص فطري\n• مضاد براغيث فعّال لكل حيوانات البيت\n• علاج الالتهاب الثانوي إذا وُجد\n• تجربة غذاء استبعادي ٨ أسابيع إذا اشتُبه بحساسية غذائية\n• مراجعة بعد ____",
  },
  {
    id: "otitis",
    label: "التهاب أذن",
    subjective: "هزّ الرأس / حكّ الأذن منذ ____ · رائحة ____ · إفراز ____ · أذن واحدة أم الاثنتين ____\nتكرار سابق: ____",
    objective: `${EXAM}\nالمنظار الأذني: القناة ____ · الطبلة ____ · الإفراز: لون ____ قوام ____\nفحص مسحة مجهرياً: خمائر ____ · جراثيم ____ · حلم أذن ____`,
    assessment: "التهاب أذن خارجية",
    plan: "• تنظيف الأذن بمحلول مناسب\n• قطرة أذنية حسب نتيجة المسحة\n• البحث عن السبب الأساسي (حساسية/حلم) إذا تكرر\n• مراجعة بعد ____ لإعادة الفحص",
  },
  {
    id: "urinary",
    label: "مشكلة بولية",
    species: ["cat", "dog"],
    subjective: "تبوّل متكرر/مؤلم منذ ____ · دم بالبول ____ · تبوّل خارج الصندوق ____\n**هل يتبوّل فعلاً؟** ____ (انسداد كامل = طوارئ)",
    objective: `${EXAM}\nجس المثانة: الحجم ____ · الألم ____ · القضيب/الفتحة البولية: ____`,
    assessment: "التهاب مجاري بولية سفلية — استبعاد الانسداد",
    plan: "• تحليل بول + ترسّب + زراعة عند اللزوم\n• أشعة/سونار للحصى\n• مسكّن + مرخٍّ للعضلات الملساء\n• غذاء بولي متخصص + زيادة شرب الماء\n• ⚠ ذكر مسدود = تدخّل فوري (قسطرة + سوائل + مراقبة البوتاسيوم)\n• مراجعة بعد ____",
  },
  {
    id: "lameness",
    label: "عرج / مشكلة حركة",
    subjective: "عرج منذ ____ · الطرف المصاب ____ · حادث/سقوط ____ · يزيد بعد الراحة أم بعد الحركة ____",
    objective: `${EXAM}\nالمشي: ____ · جس الطرف: ألم عند ____ · مدى حركة المفصل ____ · تورّم ____\nاختبارات الرباط الصليبي (الدرج/الانضغاط): ____`,
    assessment: "عرج — التمييز بين رضّي ومفصلي والتهابي",
    plan: "• أشعة للطرف المصاب\n• راحة مقيّدة ____ يوم\n• مضاد التهاب بجرعة النوع (انتبه للكلى والمعدة)\n• مراجعة بعد ____ لإعادة التقييم",
  },
  {
    id: "postop",
    label: "مراجعة بعد عملية",
    subjective: "عملية ____ بتاريخ ____ · الشهية ____ · النشاط ____ · هل يلحس الجرح ____ · الأدوية المعطاة بالبيت ____",
    objective: `${EXAM}\nالجرح: الاحمرار ____ · الإفراز ____ · التباعد ____ · التورّم ____\nالغرز: سليمة ____ · موعد فكّها ____`,
    assessment: "شفاء بعد الجراحة — يسير كما هو متوقّع",
    plan: "• استكمال المضاد الحيوي والمسكّن\n• طوق واقٍ لحد فكّ الغرز\n• تقييد الحركة لمدة ____\n• فكّ الغرز بتاريخ ____\n• علامات توجب المراجعة الفورية: إفراز قيحي، تباعد الجرح، خمول",
  },
  {
    id: "vaccine",
    label: "زيارة تطعيم",
    subjective: "زيارة تطعيم. الحالة الصحية الحالية ____ · تفاعل سابق مع تطعيم ____ · آخر جرعة ____",
    objective: `${EXAM}\nمؤهّل للتطعيم: نعم / لا — السبب: ____`,
    assessment: "حيوان سليم — مؤهّل للتطعيم",
    plan: "• التطعيم المعطى: ____ · الشركة ____ · رقم التشغيلة ____ · مكان الحقن ____\n• الجرعة القادمة بتاريخ ____\n• مراقبة ٣٠ دقيقة بالعيادة تحسّباً لتفاعل تحسّسي\n• أعراض توجب المراجعة: تورّم الوجه، قيء، ضيق تنفّس",
  },
  {
    id: "emergency",
    label: "طوارئ / حالة حرجة",
    subjective: "حالة طارئة. ما حصل: ____ · منذ متى ____ · إسعافات قبل الوصول ____",
    objective: `تقييم أولي (ABC): المجرى الهوائي ____ · التنفّس ____ · الدورة الدموية ____\n${EXAM}\nمستوى الوعي: ____ · لون الأغشية: ____ · درجة الصدمة: ____`,
    assessment: "حالة حرجة — التثبيت أولاً ثم التشخيص",
    plan: "• أكسجين + مسلك وريدي\n• سوائل صدمة حسب الوزن والنوع\n• تسكين الألم\n• تحاليل عاجلة: PCV/TP + سكر + لاكتات\n• مراقبة مستمرة للعلامات الحيوية\n• شرح الحالة والتكلفة لصاحب الحيوان وأخذ الموافقة",
  },
];

/** Templates that apply to this species (untargeted templates always apply). */
export function templatesFor(species?: Sp): SoapTemplate[] {
  if (!species) return SOAP_TEMPLATES;
  return SOAP_TEMPLATES.filter((t) => !t.species || t.species.includes(species));
}

/**
 * Merge a template into whatever the doctor has already typed.
 *
 * Never destructive: an empty field takes the template outright, a field with
 * text keeps it and gets the template appended below. Losing a typed
 * observation to a mis-tap would make the whole feature untrustworthy.
 */
export function applyTemplate(current: string, incoming: string): string {
  const c = current.trim();
  if (!c) return incoming;
  if (c.includes(incoming.trim())) return current;   // already applied — don't double it
  return `${c}\n\n${incoming}`;
}
