import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

/** Fullscreen image viewer with zoom (buttons + wheel) and drag-to-pan. */
export function ImageLightbox({ src, caption, onClose }: { src: string; caption?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const clamp = (s: number) => Math.min(5, Math.max(1, s));
  const zoom = (delta: number) => {
    setScale((s) => {
      const next = clamp(Number((s + delta).toFixed(2)));
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };
  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 0.3 : -0.3);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale === 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col no-print" onClick={onClose}>
      <div className="flex items-center justify-between p-4 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm truncate me-2">{caption}</span>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full hover:bg-white/15" onClick={() => zoom(-0.5)} aria-label="zoom out"><ZoomOut size={20} /></button>
          <span className="text-xs w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button className="p-2 rounded-full hover:bg-white/15" onClick={() => zoom(0.5)} aria-label="zoom in"><ZoomIn size={20} /></button>
          <button className="p-2 rounded-full hover:bg-white/15" onClick={reset} aria-label="reset"><RotateCcw size={18} /></button>
          <button className="p-2 rounded-full hover:bg-white/15" onClick={onClose} aria-label={t("common.close")}><X size={22} /></button>
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden flex items-center justify-center select-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
      >
        <img
          src={src}
          alt={caption}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => (scale === 1 ? zoom(1) : reset())}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            cursor: scale > 1 ? "grab" : "zoom-in",
            transition: drag.current ? "none" : "transform 0.15s ease",
            maxWidth: "92vw",
            maxHeight: "80vh",
          }}
          className="rounded-lg shadow-2xl object-contain"
        />
      </div>
    </div>
  );
}
