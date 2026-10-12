/* ============================================================================
 * zoomMath — حسابُ عارض الصورة بالمتجر (تكبيرٌ بإصبعين، سحب، نقرتان). خالصٌ بلا DOM.
 *
 * الإحداثيات: صندوقُ العارض w×h، والصورةُ مرسومةٌ فيه بمقاس «تتّسع» cw×ch بالوسط (s=1).
 * والتحويلُ `translate(x,y) scale(s)` بأصلٍ عند زاوية الصندوق: نقطةٌ p تُرى عند p·s + t.
 * فالتكبيرُ حول نقطةٍ f يُبقيها تحت الإصبع: t' = f − (f − t)·(s'/s).
 * والسحبُ مقيَّدٌ بأن تبقى حوافُّ الصورة على الشاشة (لا فراغَ أسود يُسحب إليه)، وما كان
 * أصغرَ من الصندوق يبقى بالوسط.
 * ==========================================================================*/

export interface View { s: number; x: number; y: number }
export interface Size { w: number; h: number }

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** النقرتان: ١ ⇄ ٢٫٥ عند نقطة النقر. */
export const TAP_SCALE = 2.5;
export const IDENTITY: View = { s: 1, x: 0, y: 0 };

export const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(s) ? s : 1));

/** مقاسُ «تتّسع»: الصورةُ كلُّها داخل الصندوق بنسبتها. */
export function fitSize(box: Size, natural: Size): Size {
  if (!natural.w || !natural.h) return { ...box };
  const k = Math.min(box.w / natural.w, box.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

/** يقيّد الإزاحة: حافّتا الصورة على الشاشة، والأصغرُ من الصندوق بالوسط. */
export function clampPan(v: View, box: Size, content: Size): View {
  const axis = (t: number, boxLen: number, len: number): number => {
    const off = (boxLen - len) / 2;          // موضعُ الصورة بالصندوق عند s=1
    const shown = len * v.s;
    if (shown <= boxLen) return (boxLen - shown) / 2 - off * v.s;
    return Math.min(-off * v.s, Math.max(boxLen - (off + len) * v.s, t));
  };
  return { s: v.s, x: axis(v.x, box.w, content.w), y: axis(v.y, box.h, content.h) };
}

/** تكبيرٌ إلى s' حول نقطةٍ f (إحداثيات الصندوق) — النقطةُ تبقى تحت الإصبع، ثم القيد. */
export function zoomAt(v: View, f: { x: number; y: number }, s: number, box: Size, content: Size): View {
  const s1 = clampScale(s);
  const k = s1 / v.s;
  return clampPan({ s: s1, x: f.x - (f.x - v.x) * k, y: f.y - (f.y - v.y) * k }, box, content);
}

/** إصبعان: من لقطة البداية (v0، منتصفٌ m0، مسافةٌ d0) إلى الآن (m، d) — تكبيرٌ حول m0 ثم انتقالٌ بحركة المنتصف. */
export function pinch(v0: View, m0: { x: number; y: number }, d0: number, m: { x: number; y: number }, d: number, box: Size, content: Size): View {
  const s1 = clampScale(v0.s * (d0 > 0 ? d / d0 : 1));
  const k = s1 / v0.s;
  return clampPan({ s: s1, x: m0.x - (m0.x - v0.x) * k + (m.x - m0.x), y: m0.y - (m0.y - v0.y) * k + (m.y - m0.y) }, box, content);
}

/** نقرتان: مكبَّرةٌ ⇒ ترجع، وإلا ٢٫٥ عند نقطة النقر. */
export const doubleTap = (v: View, f: { x: number; y: number }, box: Size, content: Size): View =>
  (v.s > 1.01 ? clampPan(IDENTITY, box, content) : zoomAt(v, f, TAP_SCALE, box, content));

/** العجلة (الحاسوب): خطوةٌ أُسّيّة ناعمة حول المؤشّر. */
export const wheelZoom = (v: View, f: { x: number; y: number }, deltaY: number, box: Size, content: Size): View =>
  zoomAt(v, f, v.s * Math.exp(-deltaY * 0.0015), box, content);

/** سحبٌ بإصبعٍ واحد — حين تكون مكبَّرةً وحدها (وإلا لا معنى له). */
export const panBy = (v: View, dx: number, dy: number, box: Size, content: Size): View =>
  (v.s <= 1.001 ? v : clampPan({ s: v.s, x: v.x + dx, y: v.y + dy }, box, content));
