/**
 * تسلسلُ الخروج: إنهاءُ رفعِ المدير يُرسَل **بهويّة المستخدم**، ثم تُمسح الجلسة.
 *
 * كان الخروجُ يطلق `end_elevation` بلا انتظار (`void Promise.resolve(rpc)`) ثم
 * يمسح الجلسةَ بنفس النبضة. و`Promise.resolve` تؤجّل الإرسالَ نبضةً، وsupabase-js
 * يقرأ الرمزَ قبل الإرسال من خلف قفلٍ واحدٍ يمرّ منه `signOut` أيضاً — فيسبق المسحُ
 * القراءةَ، ويخرج الطلبُ **مجهولاً** (anon) فيرفضه الخادم 42501. مقيسٌ بسجلّ
 * الإنتاج (١٨ أيلول): نفسُ الدالّة لنفس المستخدم — `anon` ⇒ 401/42501، و`authenticated`
 * ⇒ 204. والصلاحياتُ سليمة: `end_elevation` للمستخدم المسجَّل وحده، عمداً (0163).
 *
 * والأثرُ ليس ضجيجاً بالسجلّ: الرفعُ لا يُنهى بالخادم عند الخروج، فيبقى حيّاً حتى
 * تنقضي دقائقُه العشر — الشاشةُ تُقفل، والخادمُ يسمح لو رجع نفسُ الشخص خلالها.
 *
 * فالخروجُ ينتظر ردَّ `end_elevation` — بسقفٍ قصير — **ثم** يمسح الجلسة. والسقفُ
 * يضمن ألّا يُحبس أحدٌ بالخروج على نتٍ ميّت: الرمزُ يُقرأ محلّياً بأجزاءٍ من الثانية،
 * فحين ينقضي السقفُ يكون الطلبُ قد خرج بهويّته أصلاً.
 */

export const END_ELEVATION_WAIT_MS = 1500;

export async function endElevationThenSignOut(opts: {
  /** نداءُ `end_elevation` (أو `undefined` بلا عميلٍ سحابيّ — الوضع التجريبي). */
  endElevation: () => PromiseLike<unknown> | undefined | void;
  /** مسحُ الجلسة المحلّية — يُنادى **بعد** أن يخرج نداءُ الإنهاء. */
  signOutLocal: () => PromiseLike<unknown>;
  waitMs?: number;
}): Promise<void> {
  let pending: PromiseLike<unknown> | undefined | void;
  try { pending = opts.endElevation(); } catch { pending = undefined; }
  if (pending) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      // فشلُ الإنهاء لا يوقف الخروج — الخروجُ يُكمل دائماً.
      Promise.resolve(pending).then(() => undefined, () => undefined),
      new Promise<void>((r) => { timer = setTimeout(r, opts.waitMs ?? END_ELEVATION_WAIT_MS); }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
  }
  await opts.signOutLocal();
}
