import { useLocation, useNavigate } from "react-router-dom";

/* ============================================================================
 * طبقاتُ صفحة الزائر بسجلّ التصفّح — زرُّ الرجوع يُغلق ما فوق ولا يُخرج من المتجر.
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * ورقةُ المنتج والسلّةُ كانتا حالةً داخل React وحدها: زرُّ «رجوع» بالهاتف (أكثرُ ما يضغطه
 * زائرُ البايو) لا يعرفهما، فيُخرج الزبونَ من المتجر كلِّه وهو يريد إغلاقَ صورة. والآن كلُّ
 * طبقةٍ مدخلٌ بالسجلّ: `location.state.layers` (مثلاً ['sheet','zoom'] أو ['cart']) والرسمُ
 * منها. الفتحُ يدفع مدخلاً، والإغلاقُ من الواجهة `navigate(-1)` — فالرجوعُ والـX طريقٌ واحد.
 * والترتيبُ: العارض، ثم الورقة، ثم السلّة/الإتمام، ثم الخروج.
 *
 * والسلّةُ والإتمامُ بعمقٍ واحد (تبديلٌ لا دفع). وبعد إعادة التحميل تبقى الحالةُ بالسجلّ ولا
 * تبقى الورقةُ (المنتجُ بذاكرة React) — فنرجع للأساس بـgo(-عمق) لا ضغطاتِ رجوعٍ ميتة. وبعد
 * الطلب كذلك: لا مدخلَ يتسرّب يعيد الزبونَ لسلّةٍ أُفرغت.
 * ==========================================================================*/

export type Layer = "sheet" | "zoom" | "cart" | "checkout";
export type LayerEvent =
  | { type: "open"; layer: Layer }
  | { type: "swap"; layer: Layer }
  | { type: "close" }
  | { type: "reload" }
  | { type: "placed" };
export type LayerNav = { push: Layer[] } | { replace: Layer[] } | { go: number } | null;

const KNOWN = new Set<Layer>(["sheet", "zoom", "cart", "checkout"]);
/** حالةُ السجلّ ⇒ طبقات (غريبٌ أو تالفٌ = لا طبقات). */
export function readLayers(state: unknown): Layer[] {
  const l = (state as { layers?: unknown } | null)?.layers;
  return Array.isArray(l) ? l.filter((x): x is Layer => KNOWN.has(x as Layer)) : [];
}

/** الحدثُ ⇒ الطبقاتُ بعده وفعلُ السجلّ الذي يصنعها (خالص — يفحصه back-layers-test). */
export function layersAfter(cur: readonly Layer[], ev: LayerEvent): { layers: Layer[]; nav: LayerNav } {
  const top = cur[cur.length - 1];
  switch (ev.type) {
    case "open":
      if (top === ev.layer) return { layers: [...cur], nav: null };
      return { layers: [...cur, ev.layer], nav: { push: [...cur, ev.layer] } };
    case "swap": {
      if (!cur.length) return { layers: [ev.layer], nav: { push: [ev.layer] } };
      const next = [...cur.slice(0, -1), ev.layer];
      return { layers: next, nav: top === ev.layer ? null : { replace: next } };
    }
    case "close":
      return cur.length ? { layers: cur.slice(0, -1), nav: { go: -1 } } : { layers: [], nav: null };
    case "reload":
    case "placed":
      return { layers: [], nav: cur.length ? { go: -cur.length } : null };
  }
}

export function useLayers() {
  const loc = useLocation();
  const navigate = useNavigate();
  const layers = readLayers(loc.state);
  const run = (ev: LayerEvent) => {
    const { nav } = layersAfter(layers, ev);
    if (!nav) return;
    const to = loc.pathname + loc.search;
    if ("push" in nav) navigate(to, { state: { layers: nav.push } });
    else if ("replace" in nav) navigate(to, { replace: true, state: { layers: nav.replace } });
    else navigate(nav.go);
  };
  return {
    layers,
    has: (l: Layer) => layers.includes(l),
    open: (l: Layer) => run({ type: "open", layer: l }),
    swap: (l: Layer) => run({ type: "swap", layer: l }),
    close: () => run({ type: "close" }),
    reload: () => run({ type: "reload" }),
    placed: () => run({ type: "placed" }),
  };
}
