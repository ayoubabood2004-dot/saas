/* ============================================================================
 * تخصيصُ شاشة البيع — تفضيلاتُ الجهاز (localStorage): موضعُ السلة، وحجمُ خطّها،
 * وحجمُ بطاقات المنتجات، ونسبةُ السلة من الشاشة عرضاً (واسعة) وارتفاعاً (ضيّقة).
 *
 * نسبةٌ لا بكسل: طيُّ الشريط الجانبي أو تدويرُ الجهاز يعيد توزيعَ المساحة بنفس
 * النسبة، فلا تبقى السلةُ صغيرةً وبجانبها فراغ. null = الافتراضيُّ الذكي
 * (يكبر مع طيّ الشريط) حتى يختار الطبيب بنفسه.
 * ==========================================================================*/

export type CartSide = "end" | "start";

export interface PosLayout {
  /** end = طرفُ النهاية (يسارٌ بالعربية)، start = طرفُ البداية. */
  side: CartSide;
  /** تكبيرُ أسطر السلة (zoom) — ١ = الطبيعي. */
  cartZoom: number;
  /** تكبيرُ بطاقات/أسطر المنتجات. */
  gridZoom: number;
  /** نسبةُ عرض السلة من الشبكة على الشاشات الواسعة (٠..١)، null = افتراضي. */
  wFrac: number | null;
  /** نسبةُ ارتفاع السلة على الشاشات الضيّقة. */
  hFrac: number | null;
}

export const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];
const KEY = "vp_pos_layout";
const DEFAULT: PosLayout = { side: "end", cartZoom: 1, gridZoom: 1, wFrac: null, hFrac: null };

const frac = (v: unknown): number | null => (typeof v === "number" && v > 0.05 && v < 0.95 ? v : null);
const zoom = (v: unknown): number => (typeof v === "number" && ZOOM_STEPS.includes(v) ? v : 1);

export function loadPosLayout(): PosLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const p = JSON.parse(raw) as Partial<PosLayout>;
    return {
      side: p.side === "start" ? "start" : "end",
      cartZoom: zoom(p.cartZoom), gridZoom: zoom(p.gridZoom),
      wFrac: frac(p.wFrac), hFrac: frac(p.hFrac),
    };
  } catch { return { ...DEFAULT }; }
}

/** يدمج التعديلَ على المحفوظ ويرجع الكلَّ — نمطُ «اقرأ ثم اكتب» حتى لا يمحو تبويبٌ آخر خياراً. */
export function savePosLayout(patch: Partial<PosLayout>): PosLayout {
  const next = { ...loadPosLayout(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

/** الخطوةُ التالية بسلّم التكبير. */
export function stepZoom(v: number, dir: 1 | -1): number {
  const i = ZOOM_STEPS.indexOf(v);
  const j = Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir));
  return ZOOM_STEPS[j];
}
