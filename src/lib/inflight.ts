/* ============================================================================
 * inflight — هل في الطريق كتابةٌ يقطعها تحميلُ الصفحة؟
 *
 * `swUpdate.ts` يطبّق النسخةَ الجديدة عند تبديل الصفحة. والتبديلُ لا يعني أن شغلَ
 * الصفحة السابقة انتهى: بعد البيعة يكمل SaleBuilder سلسلةً مباشرةً بالخادم (الجرعة ثم
 * المعزّزة ثم الجدول، العملية، ملاحظةُ الحيوان) **بعد** أن يُفتح زرُّ الرجوع — وليست
 * بالطابور فلا يعيدها شيء. تحميلٌ بنصّها = جرعةٌ بلا معزّزة، وزيارةٌ مفتوحة بلا عملية،
 * ولا توستَ يقول (تدقيقٌ عدائيّ، ١٧/١٠). فطبقتان:
 *   - عدّادُ كتاباتٍ عامّ: كلُّ طلبٍ غيرِ GET/HEAD من عميل Supabase (`trackedFetch`) يُعدّ،
 *     ومعه «هدوء» قصير بعده — السلسلةُ المتتابعة لا تُرى فارغةً بين خطوتين.
 *   - إمساكٌ صريح (`holdUpdates`) لسلسلةٍ معروفةٍ طويلة: يُمسك من أوّلها لـ`finally`.
 * ==========================================================================*/

let writes = 0;
let lastWriteDone = 0;
let holds = 0;

/** بعد آخر كتابة: سلسلةٌ تنتظر جواباً ثم تكتب ما بعده لا تُعدّ «هادئة» بين الخطوتين. */
export const QUIET_MS = 1500;

/** كتابةٌ بالطريق، أو انتهت للتوّ، أو سلسلةٌ ممسوكة. */
export function writesBusy(now = Date.now()): boolean {
  return holds > 0 || writes > 0 || now - lastWriteDone < QUIET_MS;
}

/** سلسلةٌ لا يُقطع نصُّها: كلُّ تحديثٍ عند تبديل الصفحة يُتخطّى حتى تُفلت. */
export const holdsActive = (): boolean => holds > 0;

/** سقفُ الإمساك: وعدٌ عالقٌ (شبكةٌ لا تجيب) لا يوقف التحديثَ للأبد. */
export const HOLD_MAX_MS = 120_000;

/** أمسِك التحديثَ حتى تنتهي السلسلة — والإفلاتُ مرّةً واحدة ولو نودي مرّتين، وبعد السقف وحده.
 *  `Infinity` لنموذجٍ مفتوحٍ عمداً (عدٌّ لم يُرسل): يُفلته الإرسالُ أو المغادرة، لا الوقت. */
export function holdUpdates(maxMs: number = HOLD_MAX_MS): () => void {
  holds++;
  let done = false;
  let cap: ReturnType<typeof setTimeout> | undefined;
  const release = () => { if (!done) { done = true; holds--; if (cap !== undefined) clearTimeout(cap); } };
  if (Number.isFinite(maxMs)) cap = setTimeout(release, maxMs);
  return release;
}

/**
 * أمسِك حتى **يستقرّ العملُ نفسُه** لا سباقُه: `withTimeout` يرفض بعد المهلة والسلسلةُ تكمل خلفه
 * (قراءةٌ بطيئة ثم كتابة) — إمساكٌ يُفلت بالمهلة كان يترك الكتابةَ الأخيرة لتحميلٍ يقطعها (تدقيقٌ عدائيّ).
 */
export function holdUntil<T>(work: Promise<T>): Promise<T> {
  const release = holdUpdates();
  work.then(release, release);
  return work;
}

/* ── الجسرُ إلى سياسة التحديث ─────────────────────────────────────────────
 * `swUpdate.ts` قطعةٌ تُحمَّل عند الإقلاع نفسِه (main.tsx) لا بحزمته — حزمةُ الإقلاع كانت على
 * ٢١٥ بايتاً من سقفها. فمن يحتاجها من حزمة الإقلاع (App.tsx عند تبديل الصفحة، appUpdate.ts)
 * يمرّ من هنا؛ وقبل أن تصل (أوّلُ لحظات الإقلاع) لا شيءَ يُطبَّق ولا تبويبَ «مستولىً عليه». */
interface UpdaterLike { pageChanged(): unknown; readonly state: string }
let updater: UpdaterLike | null = null;
export const setUpdater = (u: UpdaterLike): void => { updater = u; };
/** تبدّل المسار (App.tsx). */
export const notePageChange = (): void => { updater?.pageChanged(); };
/** هل تتحكّم بالتبويب نسخةٌ أحدث من شِفرته؟ (`appUpdate.ts`: القطعةُ الناقصة تكفيها إعادةُ تحميل.) */
export const updateTaken = (): boolean => updater?.state === "taken";

/** `fetch` عميل Supabase: يعدّ الكتابات (كلَّ ما ليس GET/HEAD — نداءُ RPC للقراءة يُعدّ أيضاً: الحذرُ أرخص). */
export const trackedFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return globalThis.fetch(input, init);
  writes++;
  return globalThis.fetch(input, init).finally(() => { writes--; lastWriteDone = Date.now(); });
};
