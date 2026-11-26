// ============================================================================
// قصُّ الحافّة البيضاء (أو الشفّافة) حول المنتج — صِرف، يفحصه pdf-catalog-test.
//
// كاتالوجُ Canva يضع صورةَ العلبة بوسط صفحةٍ بيضاء أو صورةٍ أعرضَ منها بخلفيّةٍ بيضاء (مقيسٌ على كاتالوج المالك):
// المقصوصُ بحدود الصورة نصفُه فراغ، وبطاقةُ المتجر تُصغّر العلبةَ داخله. فالمحتوى وحده وهامشٌ صغير.
// ============================================================================

export interface Rect { x: number; y: number; w: number; h: number }

/** صندوقُ المحتوى: بكسلٌ غيرُ شفّاف (ألفا > ١٦) وأحدُ ألوانه أغمقُ من `white`. بلا محتوى ⇒ الصورةُ كلُّها. */
export function trimRect(data: Uint8ClampedArray | Uint8Array, w: number, h: number, opts: { white?: number; pad?: number } = {}): Rect {
  const white = opts.white ?? 238, padK = opts.pad ?? 0.02;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 500));
  const ink = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return data[i + 3] > 16 && (data[i] < white || data[i + 1] < white || data[i + 2] < white);
  };
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    if (!ink(x, y)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * padK) + step;
  const rx = Math.max(0, x0 - pad), ry = Math.max(0, y0 - pad);
  return { x: rx, y: ry, w: Math.min(w, x1 + pad + 1) - rx, h: Math.min(h, y1 + pad + 1) - ry };
}
