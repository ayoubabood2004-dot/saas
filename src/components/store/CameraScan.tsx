import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ScanLine } from "lucide-react";
import { Dialog } from "@/components/ui";

/* ============================================================================
 * مسحُ الباركود بكاميرا الموبايل (0229) — المصوّرُ بيده العلبة لا القائمة.
 *
 * `BarcodeDetector` مدمجٌ بكروم أندرويد (أغلبُ أجهزة العيادات) فلا مكتبةَ تُحمَّل؛
 * ومتصفّحٌ بلاه (سفاري) لا يرى الزرَّ أصلاً — والبحثُ بالكتابة والماسحُ اليدويّ
 * (`useBarcodeScanner`) يبقيان. والرمزُ كما وصل يُطابَق بـ`findByScan` على
 * الطرفين بـ`normalizeCode`.
 * ==========================================================================*/

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

export const cameraScanSupported = (): boolean =>
  typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"];

export function CameraScan({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "live" | "denied" | "failed">("starting");
  const done = useRef(false);
  /* المعالجُ بمرجع لا بتبعيّات المؤثّر: قائمةٌ تتحدّث والكاميرا مفتوحة كانت تعيد تشغيلَ الكاميرا
   * (إذنٌ وتركيزٌ من جديد) بكلّ تحديث. */
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!open) return;
    done.current = false;
    setState("starting");
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!alive || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
        if (!Ctor) { setState("failed"); return; }
        let det: Detector;
        try { det = new Ctor({ formats: FORMATS }); } catch { det = new Ctor(); }
        setState("live");
        const tick = async () => {
          if (!alive || done.current || !video.current) return;
          try {
            const hits = await det.detect(video.current);
            const code = hits.find((h) => h.rawValue)?.rawValue;
            if (code && !done.current) { done.current = true; onCodeRef.current(code); return; }
          } catch { /* إطارٌ لم يُقرأ — نجرّب التالي */ }
          timer = window.setTimeout(() => void tick(), 220);
        };
        void tick();
      } catch (e) {
        if (!alive) return;
        setState(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "failed");
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={t("sb.scan.title", "امسح باركود العلبة")} size="md">
      {/* بلا حشوةٍ ثانية — Dialog يحشو `px-6 pb-6` أصلاً، والكاميرا تأخذ العرضَ كلَّه. */}
      <div className="space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          {state === "live" && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-danger-500 shadow-[0_0_12px_2px] shadow-danger-500/60" />
          )}
          {state === "starting" && <div className="absolute inset-0 grid place-items-center"><Loader2 size={28} className="animate-spin text-white" /></div>}
        </div>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
          <ScanLine size={14} />
          {state === "denied"
            ? t("sb.scan.denied", "الكاميرا مرفوضة من إعدادات المتصفح — اسمح بيها أو ابحث بالكتابة.")
            : state === "failed"
              ? t("sb.scan.failed", "ما اشتغلت الكاميرا على هذا الجهاز — ابحث بالكتابة أو بالماسح.")
              : t("sb.scan.hint", "قرّب الباركود من الخط الأحمر — يفتح المنتج لحاله.")}
        </p>
      </div>
    </Dialog>
  );
}
