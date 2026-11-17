/* ============================================================================
 * إعادةُ جلبٍ فشل — وحدها، لا بضغطةٍ ينتظرها شيءٌ صغيرٌ أحمر.
 *
 * بلاغُ المالك (١٧/١١): «دكتور جرّب الخانة الجديدة وثاني يوم كال اختفت». خاناتُ الطبيب تُجلب مرّةً حين تُفتح شاشةُ البيع؛ وصباحاً
 * رمزُ الجلسة منتهٍ ليلاً ويتجدّد، أو النتُّ يتأخّر — والطلبُ الذي يخرج بلا جلسةٍ يُرفض (الجدولُ مسحوبٌ من anon)، فيُرسم مكانَ الخانة
 * «تعذّر جلب خاناتك» مقصوصاً، ولا يُعاد الجلبُ إلا بضغطه: يُقرأ «اختفت». هنا تُعاد المحاولةُ بمهلةٍ متزايدة، وفوراً حين يرجع النتّ أو
 * تظهر الشاشة؛ والتابُ المخفيّ لا يطلب شيئاً حتى يظهر. صِرفٌ بالبيئة (`RetryEnv`) فيُفحص بساعةٍ وأحداثٍ بيد الفحص.
 * ========================================================================= */

export interface RetryEnv {
  setTimeout(f: () => void, ms: number): number;
  clearTimeout(id: number): void;
  visible(): boolean;
  /** يسجّل مستمعاً ويرجع ما يزيله. */
  on(ev: "online" | "visible", f: () => void): () => void;
}

export const RETRY_DELAYS = [4_000, 15_000, 60_000, 120_000] as const;
export const retryDelay = (attempt: number): number => RETRY_DELAYS[Math.min(Math.max(0, attempt), RETRY_DELAYS.length - 1)];

/** يسلّح إعادةً واحدة للمحاولة رقم `attempt` (من الصفر): بعد مهلتها، أو حين يرجع النتّ أو تظهر الشاشة — أيُّها أوّلاً، ومرّةً
 *  واحدة. يرجع ما يُلغيها (فشلٌ جديد يسلّح التالية بمهلتها). */
export function armRetry(env: RetryEnv, attempt: number, retry: () => void): () => void {
  let done = false;
  const offs: (() => void)[] = [];
  const stop = () => { done = true; env.clearTimeout(timer); for (const off of offs) off(); };
  const go = () => {
    if (done || !env.visible()) return;   // المخفيُّ ينتظر «visible»
    stop();
    retry();
  };
  const timer = env.setTimeout(go, retryDelay(attempt));
  offs.push(env.on("online", go), env.on("visible", go));
  return stop;
}

/** المتصفّح. */
export const browserRetryEnv: RetryEnv = {
  setTimeout: (f, ms) => window.setTimeout(f, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  visible: () => document.visibilityState === "visible",
  on(ev, f) {
    if (ev === "online") { window.addEventListener("online", f); return () => window.removeEventListener("online", f); }
    const h = () => { if (document.visibilityState === "visible") f(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  },
};
