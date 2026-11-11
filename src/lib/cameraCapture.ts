/* ============================================================================
 * الكاميرا داخل السستم — ما يُقرَّر قبل الرسم (صِرفٌ ومفحوصٌ بسلوكه: camera-test).
 *
 * بلاغُ المالك (٦/١١): «لما أضيف تحليل أو صورة تحليل ما أكدر أفتح الكاميرا من داخل السستم وأصوّر — لازم
 * صورة حافظها». والجذرُ أن الصفحةَ كانت تطلب من المتصفّح **منتقيَ ملفّات** وتترك له أن يعرض الكاميرا أو لا:
 * خزنةُ الحيوان بلا `capture` (وتحليلُها يقبل PDF، فأندرويد يفتح مديرَ الملفّات)، و«تسجيل تحاليل» بـ`capture`
 * فيفتح الكاميرا **وحدها** ولا صورةَ محفوظة. فلا الطبيبُ يختار ولا الصفحة تعرف ماذا سيظهر.
 *
 * الدفاع: زرّان صريحان دائماً — «صوّر» يفتح شاشةَ كاميرا داخل السستم (getUserMedia) و«من الجهاز» منتقٍ بلا
 * `capture`. والشاشةُ إن لم تنفتح تقول لماذا وتعرض كاميرا الجهاز (`capture`) والصورةَ المحفوظة بديلاً.
 * ========================================================================== */

/** حالُ شاشة الكاميرا. `denied`: المتصفّحُ أو المستعملُ رفض الإذن؛ `busy`: تطبيقٌ ثانٍ ماسكُها؛
 *  `unavailable`: لا كاميرا يُوصَل لها من هنا (حاسوبٌ بلا كاميرا، أو متصفّحٌ بلا getUserMedia). */
export type CameraPhase = "starting" | "live" | "shot" | "denied" | "busy" | "unavailable" | "failed";

/** خطأُ getUserMedia ⇒ ما يُقال للطبيب. الأسماءُ من مواصفة Media Capture وأسماءُ كروم القديمة معها. */
export function cameraPhaseOf(err: unknown): CameraPhase {
  const name = (err as { name?: unknown } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
    case "NotSupportedError": // متصفّحٌ لا يقدر يسأل الإذنَ هنا (مقيس: كروميوم بلا واجهة يرجعها حتى مع الإذن) — ليس رفضاً
    case "TypeError": // بلا mediaDevices، أو قيودٌ فارغة — لا كاميرا تُطلب من هنا
      return "unavailable";
    default:
      return "failed";
  }
}

/** قيودُ الفيديو: الخلفيةُ مفضَّلةٌ لا مفروضة (`ideal` — حاسوبٌ بكاميرا أماميّة وحدها يفتح بها)، ودقّةٌ تُقرأ
 *  بها أرقامُ ورقة المختبر (2560×1440 مثالية؛ المتصفّحُ يعطي أقربَ ما عنده ولا يرفض). وكاميرا اختيرت بالتبديل
 *  تُطلب بمعرّفها **بالضبط** — وإلا رجع المتصفّحُ للخلفية نفسِها ولم يتبدّل شيء. */
export function videoConstraints(deviceId?: string | null): MediaTrackConstraints {
  const size = { width: { ideal: 2560 }, height: { ideal: 1440 } };
  return deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: "environment" }, ...size };
}

/** الكاميرا التالية بالتبديل (دائرياً). بلا معرّفٍ نشط (قبل أن يقوله المسار) تبدأ من الثانية — الأولى غالباً
 *  هي المفتوحة. وأقلُّ من كاميرتين: لا تبديل (null) — والزرُّ لا يُعرض. */
export function nextCamera(cams: readonly { deviceId: string }[], activeId?: string | null): string | null {
  const ids = cams.map((c) => c.deviceId).filter(Boolean);
  if (ids.length < 2) return null;
  const at = activeId ? ids.indexOf(activeId) : 0;
  return ids[(at < 0 ? 0 : at + 1) % ids.length];
}

/** اسمُ ملفّ اللقطة بوقتها المحلّيّ — يُقرأ بالخزنة كـ«صورة كاميرا اليوم الساعة كذا»، ولا يتكرّر بنفس الدقيقة. */
export function shotName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `camera-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}

/** ما يقبله «من الجهاز» لنوع الملفّ: الصورةُ العاديّةُ صورةٌ وحدها، والتحليلُ والأشعةُ والمستندُ يقبلون PDF
 *  (تقريرُ المختبر الخارجيّ يجي PDF غالباً). */
export function acceptFor(kind: string): string {
  return kind === "photo" ? "image/*" : "image/*,application/pdf";
}
