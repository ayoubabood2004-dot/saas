import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { clampPan, doubleTap, fitSize, IDENTITY, panBy, pinch, wheelZoom, type Size, type View } from "@/lib/zoomMath";

/* ============================================================================
 * عارضُ صورة المنتج بملء الشاشة — بصفحة الزائر (متجر v1، طلبُ المالك: «الصورة تُرى أوضح»).
 *
 * إصبعان يكبّران حول منتصفهما (١–٥)، وإصبعٌ يسحب حين تكون مكبَّرة وحوافُّها لا تفارق الشاشة،
 * ونقرتان ١ ⇄ ٢٫٥، والعجلةُ بالحاسوب. ويُغلق بـX وEscape وزرّ الرجوع (طبقةٌ بسجلّ التصفّح —
 * storeLayers). **بلا framer-motion**: حزمةُ الزائر تحت ميزانيّتها (store-weight-guard)، والحسابُ
 * كلُّه بـzoomMath الخالص المفحوص.
 * ==========================================================================*/

type Pt = { x: number; y: number };

export function ZoomViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const [natural, setNatural] = useState<Size>({ w: 0, h: 0 });
  const live = useRef({ view: IDENTITY, natural: { w: 0, h: 0 } as Size });
  live.current = { view, natural };
  const pts = useRef(new Map<number, Pt>());
  const gesture = useRef<{ v0: View; m0: Pt; d0: number } | null>(null);
  const lastTap = useRef<{ at: number; p: Pt } | null>(null);

  const box = (): Size => {
    const r = boxRef.current?.getBoundingClientRect();
    return { w: r?.width || 1, h: r?.height || 1 };
  };
  const content = (): Size => fitSize(box(), live.current.natural);
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const two = () => { const [a, b] = [...pts.current.values()]; return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) }; };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  /* العجلةُ مستمعٌ غيرُ سلبيّ (React يسجّلها سلبيةً فلا يُمنع تمريرُ الصفحة تحتها). */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setView((v) => wheelZoom(v, local(e), e.deltaY, box(), content())); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* دورانُ الهاتف/تغيّرُ المقاس: الإزاحةُ تُعاد داخل الحدود الجديدة. */
  useEffect(() => {
    const onResize = () => setView((v) => clampPan(v, box(), content()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* مؤشّرٌ اصطناعيّ */ }
    const p = local(e);
    pts.current.set(e.pointerId, p);
    if (pts.current.size === 2) {
      const { m, d } = two();
      gesture.current = { v0: live.current.view, m0: m, d0: d };
      lastTap.current = null;
    } else if (pts.current.size === 1) {
      const now = performance.now();
      const prev = lastTap.current;
      if (prev && now - prev.at < 300 && Math.hypot(prev.p.x - p.x, prev.p.y - p.y) < 30) {
        setView((v) => doubleTap(v, p, box(), content()));
        lastTap.current = null;
      } else lastTap.current = { at: now, p };
    }
  };
  const move = (e: React.PointerEvent) => {
    const before = pts.current.get(e.pointerId);
    if (!before) return;
    const p = local(e);
    pts.current.set(e.pointerId, p);
    if (pts.current.size >= 2 && gesture.current) {
      const { m, d } = two();
      const g = gesture.current;
      setView(pinch(g.v0, g.m0, g.d0, m, d, box(), content()));
    } else if (pts.current.size === 1) {
      setView((v) => panBy(v, p.x - before.x, p.y - before.y, box(), content()));
    }
  };
  const up = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) gesture.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-modal="true" aria-label={alt} data-zoomviewer>
      <div ref={boxRef} className="absolute inset-0 overflow-hidden" style={{ touchAction: "none" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="h-full w-full" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "0 0" }} data-zoomstage>
          <img src={src} alt={alt} draggable={false} className="h-full w-full select-none object-contain"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label={t("sf.close", "إغلاق")} data-zoomclose
        className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25">
        <X size={20} />
      </button>
    </div>
  );
}
