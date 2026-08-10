/* ============================================================================
 * رحلة الحيوان داخل العيادة — الكتلوك والقواعد.
 *
 * الفكرة من متتبّع دومينوز وتطبيق EASE بالمستشفيات الأمريكية:
 *   · لكل نوع خدمة مراحل ثابتة تُعرض كخط زمني للمالك برابط عام بلا تسجيل.
 *   · التواصل باتجاه واحد: الطبيب يرسل، والمالك يرد بإيموجي فقط — لا دردشة
 *     تسحب الطبيب من شغله.
 *   · ولا حدث يوصل المالك بلا ضغطة صريحة من الكادر. لا أتمتة تخمينية:
 *     «دخل العملية» تلقائياً وهو ما دخل = كارثة ثقة.
 *
 * قاعدة السلامة الأولى (مبنية بالكود لا بالتعليمات): الأخبار الصعبة لا
 * تُرسل برسالة أبداً — إنهاء الرحلة بنتيجة سيئة يكون صامتاً، والسستم يعرض
 * «اتصل بالمالك» بدل أي زر إرسال.
 * ==========================================================================*/

import type { JourneyKind, JourneyStage } from "@/types";

export interface JourneyStageDef {
  id: JourneyStage;
  label: string;      // ما يراه المالك — بلا مصطلحات طبية
  emoji: string;
  /** المرحلة المطمئنة الكبيرة (خرج من العملية بخير…) تُبرز بالواجهتين. */
  milestone?: boolean;
}

export interface JourneyKindDef {
  id: JourneyKind;
  label: string;
  emoji: string;
  stages: JourneyStageDef[];
}

/* المراحل مصاغة بلغة المالك: «تحت العناية» لا «قيد التنويم»، و«يوصّى
 * بالاستلام» لا «discharge». آخر مرحلة بكل رحلة هي «جاهز للاستلام». */
export const JOURNEY_KINDS: JourneyKindDef[] = [
  {
    id: "checkup", label: "كشف وفحص", emoji: "🩺",
    stages: [
      { id: "arrived", label: "وصل للعيادة", emoji: "🏥" },
      { id: "waiting", label: "بالانتظار", emoji: "🪑" },
      { id: "with_doctor", label: "مع الطبيب", emoji: "🩺" },
      { id: "done", label: "انتهى الكشف", emoji: "✅", milestone: true },
      { id: "ready", label: "جاهز للاستلام", emoji: "🎉" },
    ],
  },
  {
    // ❤️‍🩹 لا 🔪: الإيموجي يظهر بترويسة صفحة مالكٍ قلق — سكينة فوق اسم
    // حيوانه هي أسوأ صورة ممكنة. قلب يتعافى يقول نفس الشي بحنان.
    id: "surgery", label: "عملية جراحية", emoji: "❤️‍🩹",
    stages: [
      { id: "arrived", label: "وصل للعيادة", emoji: "🏥" },
      { id: "prep", label: "تحضير للعملية", emoji: "🧴" },
      { id: "in_surgery", label: "داخل غرفة العمليات", emoji: "⏳" },
      // أهم رسالة بالسستم كله — المالك ينتظرها وحدها.
      { id: "out_ok", label: "خرج من العملية بخير", emoji: "💚", milestone: true },
      { id: "recovery", label: "بالإفاقة تحت المراقبة", emoji: "🛏️" },
      { id: "ready", label: "جاهز للاستلام", emoji: "🎉" },
    ],
  },
  {
    id: "grooming", label: "حلاقة وعناية", emoji: "✂️",
    stages: [
      { id: "arrived", label: "وصل للعيادة", emoji: "🏥" },
      { id: "grooming", label: "قيد الحلاقة والعناية", emoji: "✂️" },
      { id: "drying", label: "تجفيف وتنظيف أخير", emoji: "🧼" },
      { id: "ready", label: "جاهز للاستلام — تعال شوفه 😍", emoji: "🎉", milestone: true },
    ],
  },
  {
    id: "labs", label: "تحاليل", emoji: "🧪",
    stages: [
      { id: "arrived", label: "وصل للعيادة", emoji: "🏥" },
      { id: "sampled", label: "انسحبت العينة", emoji: "💉" },
      { id: "processing", label: "التحليل قيد التشغيل", emoji: "🔬" },
      // النتيجة لا تُعرض أبداً — الطبيب يناقشها. المرحلة تقول «جاهزة عند الطبيب».
      { id: "reviewed", label: "النتائج وصلت للطبيب", emoji: "📋", milestone: true },
      { id: "ready", label: "جاهز للاستلام والمناقشة", emoji: "🎉" },
    ],
  },
  {
    id: "boarding", label: "فندقة وإقامة", emoji: "🏨",
    stages: [
      { id: "arrived", label: "وصل واستقر", emoji: "🏥" },
      { id: "settled", label: "مرتاح بمكانه", emoji: "😌", milestone: true },
      { id: "ready", label: "جاهز للاستلام", emoji: "🎉" },
    ],
  },
];

export const journeyKindById = (id: string): JourneyKindDef | undefined => JOURNEY_KINDS.find((k) => k.id === id);

export function journeyStageDef(kind: string, stage: string): JourneyStageDef | undefined {
  return journeyKindById(kind)?.stages.find((s) => s.id === stage);
}

/** المرحلة التالية بالتسلسل — null إذا وصلنا الأخيرة. */
export function nextJourneyStage(kind: string, stage: string): JourneyStageDef | null {
  const stages = journeyKindById(kind)?.stages ?? [];
  const i = stages.findIndex((s) => s.id === stage);
  return i >= 0 && i + 1 < stages.length ? stages[i + 1] : null;
}

export function journeyStageIndex(kind: string, stage: string): number {
  const stages = journeyKindById(kind)?.stages ?? [];
  const i = stages.findIndex((s) => s.id === stage);
  return i < 0 ? 0 : i;
}

/* رسائل طمأنة جاهزة — الطبيب يضغط ولا يكتب. كلها إيجابية بالتصميم:
 * ما في «تعقيد بسيط» ولا «ننتظر ونشوف» — أي شي غير مطمئن طريقه الهاتف. */
export const REASSURE_MESSAGES: { id: string; label: string; body: string }[] = [
  { id: "all_good", label: "كلشي تمام 👍", body: "نطمّنك — كلشي يمشي على ما يرام، وحبيبك بأيدٍ أمينة. 🐾" },
  { id: "taking_time", label: "ياخذ وقته", body: "كل شي طبيعي، بس ياخذ وقته حتى نسويه على أكمل وجه. لا تقلق، نخبرك أول بأول. 💙" },
  { id: "eating", label: "أكل وشرب 😋", body: "أكل وجبته وشرب ماءه، ومزاجه رائق. 😋" },
  { id: "resting", label: "نايم ومرتاح", body: "نايم نومة هنيّة ومرتاح تماماً. 😴" },
  { id: "call_us", label: "احچي وينا 📞", body: "نحب نحچي وياك بخصوص حبيبك — دق علينا لمن يناسبك. 📞" },
];

/** ردود المالك المسموحة — إيموجي فقط، مو دردشة. */
export const OWNER_REACTIONS = ["❤️", "🙏", "😍", "😢"] as const;

/**
 * رمز التتبّع العام: قصير يُقرأ برسالة، بلا حروف ملتبسة (0/O، 1/I/L).
 * ١٠ خانات من أبجدية ٣١ ≈ ٤٩ بت عشوائية — التخمين غير عملي، والرابط
 * ينتهي بعد ٤٨ ساعة من إغلاق الرحلة فلا قيمة لتجميعه.
 */
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function journeyToken(): string {
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

/** ساعات الهدوء: ٢٢:٠٠–٠٨:٠٠ — تُستشار قبل أي قناة دفع مستقبلية (واتساب/إشعار). */
export function isQuietHour(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 22 || h < 8;
}
