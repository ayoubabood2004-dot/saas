import { useEffect, useId, useReducer, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { X, ZoomIn, ZoomOut, RotateCw, Maximize2 } from "lucide-react";
import { isTopModal, pushModal, removeModal } from "@/lib/modalStack";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * Full-screen clinical image viewer — zoom (buttons / wheel / keys / two-finger pinch),
 * drag-to-pan, rotate, scroll-lock and Esc-to-close. Rendered through a portal to
 * document.body so it escapes the page's transformed/filtered ancestors and truly fills
 * the viewport. `details` (0229) is an optional panel for what the photo *is* — size,
 * dimensions, when and from where — so the photographer can judge it, not just see it.
 */
export function ImageLightbox({ src, caption, onClose, details }: { src: string; caption?: string; onClose: () => void; details?: ReactNode }) {
  const { t } = useTranslation();
  // The transform is the source of truth in a ref (no stale closures in the wheel /
  // key listeners); `force` re-renders when it changes.
  const [, force] = useReducer((n: number) => n + 1, 0);
  const view = useRef({ scale: 1, x: 0, y: 0, rot: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  /* Pinch (0229): the phone is where product photos are checked, and the buttons alone
   * made "is the label readable?" a fiddly question. Two live pointers = pinch; the
   * zoom keeps the midpoint between the fingers fixed, exactly like `zoomAt`. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const set = (patch: Partial<typeof view.current>) => {
    Object.assign(view.current, patch);
    force();
  };
  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  const reset = () => set({ scale: 1, x: 0, y: 0, rot: 0 });
  const rotate = () => set({ rot: (view.current.rot + 90) % 360 });

  /** Zoom by a factor, optionally keeping the point under the cursor fixed. */
  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const s = view.current.scale;
    const next = clamp(Number((s * factor).toFixed(3)));
    if (next === s) return;
    if (next === 1) { set({ scale: 1, x: 0, y: 0 }); return; }
    let { x, y } = view.current;
    const el = stage.current;
    if (el && clientX != null && clientY != null) {
      const rect = el.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;
      x = cx - ((cx - x) * next) / s;
      y = cy - ((cy - y) * next) / s;
    }
    set({ scale: next, x, y });
  };

  /* 0229: يُفتح الآن فوق بطاقة المنتج (Dialog) — فيدخل مكدّسَ النوافذ، وEsc تطويه وحدَه.
   * بلاه كانت ضغطةٌ واحدة تغلق العارضَ والبطاقةَ تحته معاً. */
  const modalId = useId();
  // Scroll-lock, keyboard shortcuts, non-passive wheel zoom, and focus the close button.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    pushModal(modalId);
    closeBtn.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (!isTopModal(modalId)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomAt(1.3);
      else if (e.key === "-" || e.key === "_") zoomAt(1 / 1.3);
      else if (e.key === "0") reset();
      else if (e.key.toLowerCase() === "r") rotate();
    };
    window.addEventListener("keydown", onKey);

    const el = stage.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
    };
    el?.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      removeModal(modalId);
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pointers.current.size === 2) {
      drag.current = null;
      pinch.current = { d: spread().d, s: view.current.scale };
      return;
    }
    if (view.current.scale === 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: view.current.x, oy: view.current.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const { d, cx, cy } = spread();
      const target = clamp(pinch.current.s * (d / pinch.current.d));
      zoomAt(target / view.current.scale, cx, cy);
      return;
    }
    if (!drag.current) return;
    set({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (view.current.scale > 1) reset();
    else zoomAt(2.5, e.clientX, e.clientY);
  };

  const { scale, x, y, rot } = view.current;
  const zoomed = scale > 1;
  const ctrlBtn = "grid h-10 w-10 place-items-center rounded-full text-white/90 transition hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent";

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={caption || t("passport.mediaTitle", "Media")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm no-print"
      onClick={onClose}
    >
      {/* Image stage — fills the viewport; clicking the empty area closes. */}
      <div ref={stage} className="absolute inset-0 flex items-center justify-center overflow-hidden select-none touch-none"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <img
          src={src}
          alt={caption || ""}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={onDoubleClick}
          style={{
            transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}deg)`,
            transition: drag.current || pinch.current ? "none" : "transform 0.16s ease-out",
            cursor: zoomed ? (drag.current ? "grabbing" : "grab") : "zoom-in",
            maxWidth: "96vw",
            maxHeight: "88vh",
            willChange: "transform",
          }}
          className="rounded-lg shadow-2xl object-contain"
        />
      </div>

      {/* Caption (top-left) */}
      {caption && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start p-4">
          <span className="pointer-events-auto max-w-[70vw] truncate rounded-full bg-black/40 px-3 py-1.5 text-sm text-white/90 backdrop-blur" onClick={(e) => e.stopPropagation()}>
            {caption}
          </span>
        </div>
      )}

      {/* Prominent close button (top-right) */}
      <button
        ref={closeBtn}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={t("common.close")}
        className="absolute end-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/25 transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X size={22} />
      </button>

      {/* Floating control bar (bottom-center) */}
      <div
        className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-black/50 p-1.5 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={ctrlBtn} onClick={() => zoomAt(1 / 1.4)} disabled={!zoomed} aria-label={t("media.zoomOut", "Zoom out")} title={t("media.zoomOut", "Zoom out")}><ZoomOut size={20} /></button>
        <span className="w-14 text-center text-sm font-medium tabular-nums text-white/90">{Math.round(scale * 100)}%</span>
        <button className={ctrlBtn} onClick={() => zoomAt(1.4)} aria-label={t("media.zoomIn", "Zoom in")} title={t("media.zoomIn", "Zoom in")}><ZoomIn size={20} /></button>
        <span className="mx-1 h-6 w-px bg-white/15" />
        <button className={ctrlBtn} onClick={rotate} aria-label={t("media.rotate", "Rotate")} title={t("media.rotate", "Rotate")}><RotateCw size={19} /></button>
        <button className={ctrlBtn} onClick={reset} disabled={scale === 1 && rot === 0 && x === 0 && y === 0} aria-label={t("media.fit", "Fit to screen")} title={t("media.fit", "Fit to screen")}><Maximize2 size={18} /></button>
      </div>

      {/* Details panel (0229) — what the photo is: size, dimensions, when, from where. */}
      {details && (
        <div className="absolute start-4 top-20 max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/55 p-3 text-xs text-white/90 backdrop-blur"
          onClick={(e) => e.stopPropagation()}>
          {details}
        </div>
      )}

      {/* Discoverability hint */}
      <p className="pointer-events-none absolute inset-x-0 bottom-20 text-center text-xs text-white/40">
        {t("media.viewerHint", "Scroll or pinch to zoom · drag to pan · Esc to close")}
      </p>
    </motion.div>,
    document.body,
  );
}
