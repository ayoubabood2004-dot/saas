import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    void QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#0d2449", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }, [value, size]);

  return <canvas ref={ref} width={size} height={size} className="rounded-xl" />;
}
