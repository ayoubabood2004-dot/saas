/* ============================================================================
 * شاشةُ الكاميرا داخل السستم — رفيقُ `Attach.tsx` (نطاقُ att المملوك): لا يستوردها غيرُه.
 *
 * «صوّر» يفتحها: بثٌّ حيّ من الكاميرا الخلفية (getUserMedia)، وزرُّ تصوير، ثمّ «استعمل الصورة / أعد». لا منتقيَ
 * ملفّاتٍ يقرّر عن الطبيب ماذا يظهر (cameraCapture.ts يحكي الجذر). وإن لم تنفتح: تقول السببَ (إذنٌ مرفوض،
 * كاميرا مشغولة، ماكو كاميرا) وتعرض كاميرا الجهاز (`capture`) والصورةَ المحفوظة — لا طريقَ مسدود.
 *
 * المسارُ يُطفأ بكلّ خروج (الإغلاق، تبديلُ الكاميرا، فكُّ المكوّن) — ضوءُ الكاميرا لا يبقى شاعلاً. وطلبٌ قديم
 * يصل بعد الإغلاق أو بعد طلبٍ أحدث يُطفأ بمكانه (عدّادُ الأجيال) — وإلا بقي مسارٌ يتيمٌ ماسكَ الكاميرا.
 * ========================================================================== */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Camera, Check, ImagePlus, Loader2, RotateCcw, SwitchCamera, X } from "lucide-react";
import { pushModal, removeModal, isTopModal } from "@/lib/modalStack";
import { playTap } from "@/lib/sounds";
import { cameraPhaseOf, nextCamera, shotName, videoConstraints, type CameraPhase } from "@/lib/cameraCapture";

export function CameraSheet({ open, onClose, onFile, accept = "image/*", title }: {
  open: boolean;
  onClose: () => void;
  /** اللقطةُ (أو ما اختير بالبديل) ملفّاً — كأنه من المنتقي، فالمستدعي لا يفرّق. */
  onFile: (f: File) => void;
  /** ما يقبله بديلُ «اختر صورة محفوظة» (التحليلُ يقبل PDF). */
  accept?: string;
  title?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const genRef = useRef(0);
  const camInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<CameraPhase>("starting");
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [shotFailed, setShotFailed] = useState(false);
  /* الإغلاقُ بمرجع: المستدعي يمرّر دالّةً جديدة كلَّ رسمة، وأثرُ المكدّس لا يُعاد بكلّ رسمة. */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const start = async (deviceId?: string | null) => {
    const gen = ++genRef.current;
    stop();
    setPhase("starting");
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) { setPhase("unavailable"); return; }
    try {
      const s = await md.getUserMedia({ video: videoConstraints(deviceId), audio: false });
      if (gen !== genRef.current) { s.getTracks().forEach((tr) => tr.stop()); return; }
      streamRef.current = s;
      const v = videoRef.current;
      if (v) { v.srcObject = s; await v.play().catch(() => undefined); }
      if (gen !== genRef.current) return;
      setActiveId(s.getVideoTracks()[0]?.getSettings?.().deviceId ?? null);
      setPhase("live");
      // الأسماءُ والمعرّفاتُ لا تُعطى قبل الإذن — فالعدُّ بعده.
      md.enumerateDevices?.()
        .then((list) => { if (gen === genRef.current) setCams(list.filter((d) => d.kind === "videoinput")); })
        .catch(() => undefined);
    } catch (e) {
      if (gen === genRef.current) setPhase(cameraPhaseOf(e));
    }
  };

  const dropShot = () => setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null; });

  // يفتح ويسكّر مع `open` وحدَه: كلُّ فتحٍ مسارٌ جديد، وكلُّ إغلاقٍ (أو فكٍّ) يطفئه ويُبطل ما بالطريق.
  useEffect(() => {
    if (!open) return;
    setShotFailed(false);
    void start(null);
    return () => { genRef.current++; stop(); dropShot(); setCams([]); setActiveId(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // مكانُها بمكدّس النوافذ: Esc تطوي الكاميرا وحدها لا النافذةَ التي فتحتها (نموذجُ التحليل مثلاً).
  useEffect(() => {
    if (!open) return;
    pushModal(id);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isTopModal(id)) closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { removeModal(id); document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [open, id]);

  const shoot = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) { setShotFailed(true); return; }
    playTap();
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) { setShotFailed(true); return; }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (!blob) { setShotFailed(true); return; }
    setShotFailed(false);
    v.pause();
    setShot({ blob, url: URL.createObjectURL(blob) });
    setPhase("shot");
  };

  const retake = () => {
    dropShot();
    setPhase("live");
    void videoRef.current?.play().catch(() => undefined);
  };

  const use = () => {
    if (!shot) return;
    onFile(new File([shot.blob], shotName(new Date()), { type: "image/jpeg" }));
    onClose();
  };

  const pickedFallback = (f: File | undefined) => {
    if (!f) return;
    onFile(f);
    onClose();
  };

  const next = nextCamera(cams, activeId);
  const problem = phase === "denied" || phase === "busy" || phase === "unavailable" || phase === "failed";

  if (!open) return null;
  return createPortal(
    <div className="att-cam no-print" role="dialog" aria-modal="true" aria-label={title ?? t("att.cam.title")} data-camera-sheet data-phase={phase}>
      <div className="att-cam-bar">
        <span className="att-cam-title">{title ?? t("att.cam.title")}</span>
        <button type="button" className="att-cam-icon" onClick={onClose} aria-label={t("att.cam.close")} data-camera-close><X size={22} /></button>
      </div>

      <div className="att-cam-stage">
        {/* الفيديو مرسومٌ دائماً (المسارُ يُربط به قبل أن يُعرض)، ومخفيٌّ ما دام ما يعرض شيئاً. */}
        <video ref={videoRef} className={phase === "live" ? "att-cam-video" : "att-cam-video att-hidden"} playsInline muted autoPlay />
        {shot && phase === "shot" && <img src={shot.url} alt="" className="att-cam-video" data-camera-shot />}
        {phase === "starting" && (
          <p className="att-cam-note"><Loader2 size={22} className="animate-spin" /> {t("att.cam.starting")}</p>
        )}
        {problem && (
          <div className="att-cam-problem" data-camera-problem={phase}>
            <p>{t(`att.cam.${phase}`)}</p>
            <div className="att-cam-alts">
              <button type="button" className="att-cam-alt" onClick={() => camInput.current?.click()} data-camera-device>
                <Camera size={18} /> {t("att.cam.deviceCamera")}
              </button>
              <button type="button" className="att-cam-alt" onClick={() => fileInput.current?.click()} data-camera-saved>
                <ImagePlus size={18} /> {t("att.cam.pickSaved")}
              </button>
              {phase !== "unavailable" && (
                <button type="button" className="att-cam-alt" onClick={() => void start(null)} data-camera-retry>
                  <RotateCcw size={18} /> {t("att.cam.retry")}
                </button>
              )}
            </div>
          </div>
        )}
        {shotFailed && phase === "live" && <p className="att-cam-toast" role="status">{t("att.cam.shotFailed")}</p>}
      </div>

      <div className="att-cam-controls">
        {phase === "shot" ? (
          <>
            <button type="button" className="att-cam-pill" onClick={retake} data-camera-retake><RotateCcw size={18} /> {t("att.cam.retake")}</button>
            <button type="button" className="att-cam-pill att-cam-primary" onClick={use} data-camera-use><Check size={18} /> {t("att.cam.use")}</button>
          </>
        ) : (
          <>
            <span className="att-cam-side">
              {next && phase === "live" && (
                <button type="button" className="att-cam-icon" onClick={() => void start(next)} aria-label={t("att.cam.switch")} data-camera-switch><SwitchCamera size={22} /></button>
              )}
            </span>
            <button type="button" className="att-cam-shutter" onClick={() => void shoot()} disabled={phase !== "live"} aria-label={t("att.cam.shoot")} data-camera-shoot />
            <span className="att-cam-side">
              <button type="button" className="att-cam-icon" onClick={() => fileInput.current?.click()} aria-label={t("att.cam.pickSaved")} data-camera-saved-corner><ImagePlus size={22} /></button>
            </span>
          </>
        )}
      </div>

      {/* البديلان: كاميرا الجهاز نفسُها (تطبيقُها)، والصورةُ المحفوظة — بلا capture. */}
      <input ref={camInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickedFallback(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={fileInput} type="file" accept={accept} className="hidden" onChange={(e) => { pickedFallback(e.target.files?.[0]); e.target.value = ""; }} />
    </div>,
    document.body,
  );
}
