/**
 * طزاجةُ القائمة التي يقرّر بها الكاشير — قراراتٌ صِرفة خارج المكوّن لتُفحص.
 *
 * شاشةُ البيع ترسم لقطةً من ذاكرة التاب (`swrCache`)، قد يملؤها المسخّنُ الخلفيّ
 * بعد تسجيل الدخول بساعات. وما كان يحدّثها إلا فتحُ الشاشة وإتمامُ بيعة — فتابٌ
 * مفتوحٌ طول النهار بلا بيع يبيع بقائمة الصبح، والمديرُ رصّد شراءً ظهراً من جهازه.
 * فالكاشير يمسح مادةً على الرفّ فيُقال «رصيدها صفر»، وF5 يُرجعها. (خطة
 * طزاجة المخزون، ط١/ط٣.)
 */

/** لقطةٌ أقدمُ من هذا تُجلب ثانيةً حين يرجع التابُ للحياة (ظهورٌ أو عودةُ نت). */
export const RETURN_STALE_MS = 60_000;

/** فشلُ تحديثٍ فوق قائمةٍ معروضة ⇒ محاولةٌ تلقائيةٌ **واحدة** بعد هذا، والتابُ ظاهر. */
export const RETRY_AFTER_FAIL_MS = 30_000;

export type ReturnDecision =
  /** اجلبْ الآن. */
  | "reload"
  /** التابُ مخفيّ — لا يرى أحدٌ الأرقام، والجلبُ يُصرف على لا أحد. */
  | "skip-hidden"
  /** اللقطةُ أحدثُ من العتبة. */
  | "skip-fresh"
  /** بيعةٌ جارية — لا تُستبدل القائمةُ تحت يد الكاشير. وما يُفوَّت لا يضيع:
   *  إتمامُ البيعة نفسُه يعيد التحميل (`onSold`). */
  | "skip-busy";

/**
 * سؤالٌ واحدٌ مشترك لكلّ من يسأل عن المفتاح نفسه وهو معلَّق.
 *
 * مسحتان متلاحقتان لمادّةٍ «صفرٍ بالقائمة» على نتٍ بطيء: كان السائلُ الثاني
 * **يُرمى** بصمت (لا صوتَ ولا رسالة)، فعلبتان تخرجان والفاتورةُ واحدة. والمسحةُ
 * علبةٌ حقيقية. فهنا لا يُرمى أحد: الخادمُ يُسأل مرّةً، وكلُّ سائلٍ يستلم الجوابَ
 * نفسَه ويكمل بيعَه بنفسه. `first` يقول من سأل فعلاً — لرسالةٍ واحدةٍ لا أكثر.
 */
export function sharedAsk<T>(
  inflight: Map<string, Promise<T>>,
  key: string,
  ask: () => Promise<T>,
): { promise: Promise<T>; first: boolean } {
  const existing = inflight.get(key);
  if (existing) return { promise: existing, first: false };
  const promise: Promise<T> = ask().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return { promise, first: true };
}

/** هل نجلب حين يرجع التاب؟ `ageMs = Infinity` للقطةٍ لم تُجلب قطّ. */
export function onReturnDecision(s: { visible: boolean; ageMs: number; staleMs: number; busy: boolean }): ReturnDecision {
  if (!s.visible) return "skip-hidden";
  if (s.ageMs < s.staleMs) return "skip-fresh";
  if (s.busy) return "skip-busy";
  return "reload";
}
