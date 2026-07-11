import type { Species } from "@/types";

export type EduCategory = "recovery" | "nutrition" | "preventive" | "behaviour" | "emergency";
export type EduLevel = "essential" | "intermediate" | "advanced";

interface Bi {
  en: string;
  ar: string;
}

export interface EduItem {
  id: string;
  category: EduCategory;
  level: EduLevel;
  minutes: number;
  emoji: string;
  species?: Species[]; // optional targeting; undefined = all
  title: Bi;
  summary: Bi;
  body: { en: string[]; ar: string[] };
}

/** Curated owner-education / aftercare guides (demo content; bilingual inline). */
export const EDUCATION: EduItem[] = [
  {
    id: "post-op-care",
    category: "recovery",
    level: "essential",
    minutes: 4,
    emoji: "🩹",
    title: { en: "Caring for your pet after surgery", ar: "العناية بحيوانك بعد العملية" },
    summary: { en: "Keep the incision clean, limit activity and know the warning signs.", ar: "حافظ على نظافة الجرح، قلّل النشاط، واعرف العلامات التحذيرية." },
    body: {
      en: [
        "Keep your pet calm and confined for the first few days — no running or jumping.",
        "Check the incision twice a day. A little redness is normal; swelling, discharge or a bad smell is not.",
        "Leave the e-collar on so they can't lick the stitches.",
        "Give all medication exactly as prescribed, even if your pet seems better.",
        "Call the clinic if they won't eat for more than 24 hours, or the wound opens.",
      ],
      ar: [
        "اجعل حيوانك هادئاً ومحدود الحركة في الأيام الأولى — لا جري أو قفز.",
        "افحص الجرح مرتين يومياً. القليل من الاحمرار طبيعي؛ أما التورّم أو الإفرازات أو الرائحة الكريهة فلا.",
        "أبقِ الطوق الواقي حتى لا يلعق الغرز.",
        "أعطِ كل الأدوية تماماً كما وُصفت، حتى لو بدا أنه تحسّن.",
        "اتصل بالعيادة إذا امتنع عن الأكل أكثر من 24 ساعة أو انفتح الجرح.",
      ],
    },
  },
  {
    id: "give-a-pill",
    category: "recovery",
    level: "essential",
    minutes: 3,
    emoji: "💊",
    title: { en: "How to give your pet a pill", ar: "كيف تعطي حيوانك حبة دواء" },
    summary: { en: "Simple, stress-free techniques to get medication down safely.", ar: "طرق بسيطة وخالية من التوتر لإعطاء الدواء بأمان." },
    body: {
      en: [
        "Hide the pill in a small treat, a piece of cheese, or a commercial pill pocket.",
        "If that fails, gently tilt the head back, open the jaw, and place the pill at the base of the tongue.",
        "Hold the mouth closed and stroke the throat to encourage swallowing.",
        "Follow with a little water or a treat so the pill doesn't stick in the throat.",
        "Never crush a tablet without asking your vet — some must stay whole.",
      ],
      ar: [
        "أخفِ الحبة في مكافأة صغيرة أو قطعة جبن أو جيب دواء مخصّص.",
        "إن لم ينجح ذلك، أمِل الرأس للخلف بلطف، افتح الفك، وضع الحبة في قاعدة اللسان.",
        "أغلق الفم وامسح الحلق برفق لتشجيع البلع.",
        "أتبِعها بقليل من الماء أو مكافأة كي لا تعلق الحبة في الحلق.",
        "لا تسحق أي قرص دون سؤال الطبيب — بعضها يجب أن يبقى كاملاً.",
      ],
    },
  },
  {
    id: "body-condition",
    category: "nutrition",
    level: "intermediate",
    minutes: 5,
    emoji: "⚖️",
    title: { en: "Is my pet the right weight?", ar: "هل وزن حيواني مثالي؟" },
    summary: { en: "Use the body-condition score to check at home in one minute.", ar: "استخدم مقياس حالة الجسم للفحص في المنزل خلال دقيقة." },
    body: {
      en: [
        "Run your hands along the ribs — you should feel them easily, like the back of your hand.",
        "Look from above: there should be a visible waist behind the ribs.",
        "Look from the side: the belly should tuck up, not hang down.",
        "If you can't feel the ribs, it's time to review portions and treats.",
        "Bring the weight trend to every visit — small changes matter.",
      ],
      ar: [
        "مرّر يديك على الأضلاع — يجب أن تشعر بها بسهولة كظهر يدك.",
        "انظر من الأعلى: يجب أن يكون هناك خصر واضح خلف الأضلاع.",
        "انظر من الجانب: يجب أن يرتفع البطن للأعلى لا أن يتدلّى.",
        "إذا لم تستطع الإحساس بالأضلاع، فحان وقت مراجعة الحصص والمكافآت.",
        "أحضِر منحنى الوزن في كل زيارة — التغيّرات الصغيرة مهمّة.",
      ],
    },
  },
  {
    id: "pain-signs",
    category: "behaviour",
    level: "intermediate",
    minutes: 4,
    emoji: "🐾",
    title: { en: "Spotting signs of pain", ar: "اكتشاف علامات الألم" },
    summary: { en: "Pets hide pain — learn the subtle behaviour changes to watch.", ar: "تخفي الحيوانات الألم — تعرّف على تغيّرات السلوك الدقيقة." },
    body: {
      en: [
        "Hiding, less grooming, or a change in sleeping spot can all signal discomfort.",
        "Watch for reluctance to jump, climb stairs, or be touched in one area.",
        "Cats often go quiet and still; dogs may pant, pace or whine.",
        "Reduced appetite is one of the earliest and most reliable signs.",
        "Trust your gut — if something feels off, it's worth a call.",
      ],
      ar: [
        "الاختباء أو قلّة التنظيف أو تغيّر مكان النوم قد تشير كلها إلى انزعاج.",
        "راقب التردّد في القفز أو صعود الدرج أو رفض اللمس في منطقة ما.",
        "غالباً تصمت القطط وتثبت؛ وقد تلهث الكلاب أو تتمشّى أو تئنّ.",
        "ضعف الشهية من أبكر العلامات وأكثرها موثوقية.",
        "ثق بحدسك — إن شعرت أن شيئاً غير طبيعي، فالاتصال يستحق.",
      ],
    },
  },
  {
    id: "vaccine-timeline",
    category: "preventive",
    level: "essential",
    minutes: 6,
    emoji: "💉",
    title: { en: "Your puppy & kitten vaccine timeline", ar: "جدول تطعيمات الجِرو والهريرة" },
    summary: { en: "What to expect in the first 16 weeks and beyond.", ar: "ما الذي تتوقّعه في أول 16 أسبوعاً وما بعدها." },
    body: {
      en: [
        "Core vaccines usually start at 6–8 weeks and repeat every 3–4 weeks until 16 weeks.",
        "Rabies is given once around 12–16 weeks, then boostered per local law.",
        "Keep young pets away from unknown animals until the series is complete.",
        "Deworming runs alongside the early visits — ask for the schedule.",
        "Your passport tracks every dose and the next due date automatically.",
      ],
      ar: [
        "تبدأ التطعيمات الأساسية عادةً في 6–8 أسابيع وتتكرّر كل 3–4 أسابيع حتى 16 أسبوعاً.",
        "يُعطى السعار مرة واحدة حوالي 12–16 أسبوعاً ثم جرعة داعمة وفق القانون المحلي.",
        "أبعِد الصغار عن الحيوانات المجهولة حتى تكتمل السلسلة.",
        "يسير التخلّص من الديدان مع الزيارات المبكرة — اطلب الجدول.",
        "يتتبّع جواز حيوانك كل جرعة وتاريخ الاستحقاق التالي تلقائياً.",
      ],
    },
  },
  {
    id: "emergency-signs",
    category: "emergency",
    level: "essential",
    minutes: 5,
    emoji: "🚨",
    title: { en: "When is it an emergency?", ar: "متى تكون الحالة طارئة؟" },
    summary: { en: "Red-flag signs that mean you should call the clinic now.", ar: "علامات خطر تعني أن تتصل بالعيادة الآن." },
    body: {
      en: [
        "Difficulty breathing, blue or pale gums — go in immediately.",
        "Repeated vomiting, a bloated hard belly, or collapse.",
        "Inability to urinate (especially male cats) is a true emergency.",
        "Seizures, suspected poisoning, or trauma from a fall or car.",
        "When unsure, call — it's always better to ask than to wait.",
      ],
      ar: [
        "صعوبة التنفّس أو لثة زرقاء أو شاحبة — توجّه فوراً.",
        "تقيّؤ متكرّر أو بطن منتفخ وصلب أو انهيار.",
        "عدم القدرة على التبوّل (خاصة ذكور القطط) حالة طارئة حقيقية.",
        "نوبات تشنّج أو اشتباه تسمّم أو إصابة من سقوط أو حادث.",
        "عند الشك، اتصل — السؤال دائماً أفضل من الانتظار.",
      ],
    },
  },
];

export const EDU_CATEGORIES: EduCategory[] = ["recovery", "nutrition", "preventive", "behaviour", "emergency"];
