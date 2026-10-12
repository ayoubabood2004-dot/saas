import { pointerWithin, closestCenter, type Active, type CollisionDetection, type Over } from "@dnd-kit/core";

/* ============================================================================
 * sortDnd — ترتيبُ قائمةٍ بالسحب (تصنيفاتُ المتجر وموادُّ التصنيف). بلا React: يقوده فحصُ
 * node بـdnd-kit الحقيقيّ (store-cats-test).
 *
 * ── الجذر (درسُ medDnd) ─────────────────────────────────────────────────
 * الاصطدامُ «تحت المؤشّر، وإلا الأقرب» يجعل كلَّ إفلاتٍ — **أينما** وقع — كتابةً: الأقربُ لا
 * يكون فارغاً ما دام بالشاشة صفٌّ واحد. فسحبٌ تُرك بالفراغ كان سيعيد ترتيبَ متجر العيادة
 * كلِّه للزبائن. هنا الإفلاتُ يُحسب **حيث المؤشّر** وحده: خارج الصفوف ⇒ لا شيء يُكتب، والأقربُ
 * للكيبورد وحده (لا إحداثيات مؤشّر). والنتيجةُ عمليةٌ نسبيّة واحدة (`after`) يحسب الخادمُ
 * موضعَها — لا أرقامُ مواضع من المتصفّح.
 *
 * ولا يُعاد بناءُ medDnd على هذا عمداً: ذاك مفحوصٌ بمضيفيه، وتعميمُه خطرٌ بلا ربح.
 * ==========================================================================*/

/** عتبةُ الفأرة: حركةٌ أقلُّ من ٦ بكسل ضغطةٌ لا سحب. */
export const SORT_MOUSE_DISTANCE = 6;
/** الإصبع: ضغطٌ مطوَّل (التمريرُ السريع يبقى تمريراً) وتسامحُ حركته. */
export const SORT_TOUCH_DELAY = 200;
export const SORT_TOUCH_TOLERANCE = 8;

/** الهدفُ تحت المؤشّر وحده؛ والأقربُ للكيبورد وحده. */
export const sortCollision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

/**
 * `after` لعملية move من إفلاتٍ: `undefined` = لا شيء يُكتب (خارج الصفوف، أو نفسُ المكان)،
 * و`null` = أوّلُ القائمة، ومعرّفٌ = بعده مباشرة. النصفُ الذي فوقه مركزُ المسحوب يقرّر قبل/بعد.
 */
export function dropAfter(ids: readonly string[], active: Pick<Active, "id" | "rect">, over: Pick<Over, "id" | "rect"> | null): string | null | undefined {
  if (!over) return undefined;
  const me = String(active.id);
  const target = String(over.id);
  // على نفسه = لا شيء (وإلا صار «قبل لا أحد» = أوّلَ القائمة).
  if (me === target || !ids.includes(me) || !ids.includes(target)) return undefined;
  const r = active.rect.current.translated;
  const mid = over.rect.top + over.rect.height / 2;
  const center = r ? r.top + r.height / 2 : mid;
  const rest = ids.filter((x) => x !== me);
  const at = rest.indexOf(target) + (center > mid ? 1 : 0);
  return placeAt(ids, me, at);
}

/** نقلُ صفٍّ ليصير بالموضع `at` من القائمة **بدونه** — `undefined` إن لم يتغيّر شيء. */
export function placeAt(ids: readonly string[], id: string, at: number): string | null | undefined {
  const from = ids.indexOf(id);
  if (from < 0) return undefined;
  const rest = ids.filter((x) => x !== id);
  const to = Math.max(0, Math.min(at, rest.length));
  if (to === from) return undefined;
  return to === 0 ? null : rest[to - 1];
}

/** الأسهم (الهاتف والكيبورد): خطوةٌ لفوق أو لجوّه — `undefined` عند الحافّة. */
export const stepAfter = (ids: readonly string[], id: string, dir: -1 | 1): string | null | undefined => {
  const i = ids.indexOf(id);
  return i < 0 ? undefined : placeAt(ids, id, i + dir);
};
/** «لفوق»: أوّلُ القائمة. */
export const topAfter = (ids: readonly string[], id: string): string | null | undefined => placeAt(ids, id, 0);

/** القائمةُ بعد النقل — للعرض المتفائل وللفحص. */
export function moved(ids: readonly string[], id: string, after: string | null): string[] {
  const rest = ids.filter((x) => x !== id);
  const at = after === null ? 0 : rest.indexOf(after) + 1;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
