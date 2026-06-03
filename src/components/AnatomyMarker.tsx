import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eraser, Pencil } from "lucide-react";
import type { Species } from "@/types";
import { silhouetteDataUrl } from "@/lib/silhouettes";

const W = 300;
const H = 230;

export function AnatomyMarker({ species, onChange }: { species: Species; onChange: (dataUrl: string | null) => void }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  const redrawBackground = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !bgRef.current) return;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgRef.current, 0, 0, W, H);
  };

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      bgRef.current = img;
      redrawBackground();
      setDirty(false);
      onChange(null);
    };
    img.src = silhouetteDataUrl(species);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species]);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!dirty) setDirty(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  };

  const clear = () => {
    redrawBackground();
    setDirty(false);
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-ink-muted flex items-center gap-1"><Pencil size={13} /> {t("consult.markHint")}</span>
        {dirty && (
          <button type="button" className="btn-ghost py-1 px-2 text-xs" onClick={clear}>
            <Eraser size={14} /> {t("consult.clear")}
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full rounded-xl bg-white border border-line touch-none cursor-crosshair"
        style={{ aspectRatio: `${W}/${H}` }}
      />
    </div>
  );
}
