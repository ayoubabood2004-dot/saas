/* ============================================================================
 * قائمةُ تأشير التصنيف مدخلٌ بسجلّ التصفّح — زرُّ رجوع الهاتف يُغلقها ولا يُسقط التأشير.
 *
 * ── الجذر (قيس بالتجريبيّ: history.back() بقائمةٍ مؤشَّرة ⇒ /inventory بلا سؤال) ──────────
 * فتحُ تصنيفٍ من «التصنيفات» كان حالةَ React وحدها (openId): لا مدخلَ بالسجلّ. وحارسُ المغادرة
 * يغطّي سهمَ الرجوع بالشاشة وتبويباتِ المتجر وروابطَ <a href> — لا زرَّ الهاتف. فالمصوّرُ يؤشّر دفعةً
 * ويضغط «رجوع» يريد قائمةَ التصنيفات، فيخرج من المتجر كلِّه (المسارُ السابق) وتضيع كلُّ تأشيرة.
 *
 * والآن: الفتحُ يدفع مدخلاً بعلامة `catcheck` (نفسُ العنوان)، والإغلاقُ من الشاشة `navigate(-1)` —
 * فالرجوعُ والسهمُ طريقٌ واحد (درسُ storeLayers). ورجوعٌ يُسقط العلامةَ والتأشيرُ لم يُحفظ ⇒ العلامةُ
 * تُدفع ثانيةً وورقةُ «عندك تغييرات ما انحفظت» تسأل — فلا يضيع شيءٌ بلا كلمة.
 * ==========================================================================*/

/** العلامةُ بحالة المدخل (`location.state`) — معرّفُ التصنيف المفتوح، أو null. */
export function readCatcheck(state: unknown): string | null {
  const v = (state as { catcheck?: unknown } | null)?.catcheck;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** حالةُ المدخل نفسُها بعلامةٍ (أو بلاها) — ما سواها يبقى كما هو. */
export function withCatcheck(state: unknown, id: string | null): Record<string, unknown> {
  const base: Record<string, unknown> = state && typeof state === "object" ? { ...(state as Record<string, unknown>) } : {};
  if (id) base.catcheck = id;
  else delete base.catcheck;
  return base;
}

/**
 * تبدّلت العلامةُ تحت قائمةٍ مفتوحة (`mine`): ماذا تفعل؟
 *  • `none`  — ما زالت علامتَها، أو لم ترَها بعد (فُتحت بلا مدخل) فلا يُقرأ غيابُها رجوعاً.
 *  • `close` — رجوعٌ (الهاتف، أو إغلاقُها هي) أسقطها ولا تأشيرَ معلّق ⇒ تُغلق.
 *  • `hold`  — أسقطها والتأشيرُ لم يُحفظ ⇒ تُدفع العلامةُ ثانيةً وتسأل الورقة.
 */
export function onCatcheckChange(marker: string | null, mine: string, seen: boolean, dirty: boolean): "none" | "close" | "hold" {
  if (marker === mine || !seen) return "none";
  return dirty ? "hold" : "close";
}
