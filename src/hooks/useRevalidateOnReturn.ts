import { useEffect, useRef } from "react";
import { cachedAt } from "@/lib/swrCache";
import { onReturnDecision } from "@/lib/freshness";

/**
 * يعيد جلبَ لقطةٍ حين يرجع التابُ للحياة: يصير ظاهراً، أو يرجع النت.
 *
 * كانت محفّزاتُ تحديث شاشة البيع اثنين لا غير: فتحُ الشاشة، وإتمامُ بيعة. فتابٌ
 * مفتوحٌ من الصبح بلا بيع يعرض قائمةَ الصبح، ولا شيءَ يقول إنها قديمة. والتابُ
 * الذي يرجع إليه الكاشيرُ هو بالضبط لحظةُ الحاجة للأرقام — فيُسأل عن عمرها هنا.
 *
 * عامٌّ بقصد: شاشةُ المخزون والسجلّات مرشّحتان بعدها، بمفتاح لقطتِهما.
 *
 * @param cb       ما يجلب (مثلاً `load` الشاشة). تُقرأ آخرُ نسخةٍ منه وقتَ الحدث.
 * @param staleMs  لقطةٌ أحدثُ من هذا لا تُجلب ثانية.
 * @param opts.key مفتاحُ اللقطة بـswrCache — منه يُقرأ عمرُها.
 * @param opts.isBusy «لا تستبدل القائمةَ الآن» (بيعةٌ جارية، أو جلبٌ قائم).
 * @param opts.pollMs ط٥: يُسأل أيضاً كلَّ هذا والتابُ ظاهر — بنفس القرار والحراسات.
 */
export function useRevalidateOnReturn(
  cb: () => void,
  staleMs: number,
  opts: { key: string; isBusy?: () => boolean; enabled?: boolean; pollMs?: number },
): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (opts.enabled === false) return;
    const check = () => {
      const o = optsRef.current;
      const at = cachedAt(o.key);
      const decision = onReturnDecision({
        visible: document.visibilityState === "visible",
        ageMs: at == null ? Infinity : Date.now() - at,
        staleMs,
        busy: !!o.isBusy?.(),
      });
      if (decision === "reload") cbRef.current();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", check);
    // ط٥: نفسُ `check` بالضبط — التابُ المخفيُّ والبيعةُ الجارية والجلبُ القائم يُتخطّون.
    const poll = opts.pollMs && opts.pollMs > 0 ? window.setInterval(check, opts.pollMs) : null;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", check);
      if (poll != null) window.clearInterval(poll);
    };
  }, [staleMs, opts.enabled, opts.pollMs]);
}
