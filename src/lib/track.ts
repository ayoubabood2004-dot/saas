/* ============================================================================
 * قياس صفحة الهبوط — طرفُ المتصفّح.
 *
 * أصغر ما يمكن عمداً: لا مكتبة خارجية، ولا كوكيز، ولا معرّف يُخزَّن. تمييز
 * الزوّار يجري على الخادم ببصمةٍ تتبدّل كل يوم (api/track.ts).
 *
 * والإرسال بـsendBeacon حين توفّر: يُسلَّم الطلب للمتصفّح فيُنهيه بنفسه ولو
 * غادر الزائر الصفحة باللحظة نفسها — وهذا مهمّ تحديداً لـcta_click، فهو
 * حدثٌ يقع ثمّ تُغادَر الصفحة فوراً، ولو أرسلناه بطلبٍ عادي لضاع أكثره.
 *
 * كل شيء هنا صامتٌ عند الفشل: القياس خدمةٌ ثانوية لا تُسقط تجربة زائر.
 * ==========================================================================*/

export type LandingEvent =
  | "page_view" | "cta_click" | "signup_start" | "signup_done" | "trial_start";

/** يمنع تكرار حدثٍ لمرّةٍ واحدة بالجلسة (page_view مع إعادة التصيير مثلاً). */
const fired = new Set<string>();

function payload(event: LandingEvent, meta?: Record<string, unknown>): string {
  return JSON.stringify({
    event,
    path: location.pathname + location.search.slice(0, 100),
    lang: document.documentElement.lang || undefined,
    meta,
  });
}

/**
 * يرسل حدثاً. `once` يضمن مرّة واحدة بعمر الصفحة.
 * لا يرمي أبداً ولا ينتظر: النداء يرجع فوراً.
 */
export function track(event: LandingEvent, meta?: Record<string, unknown>, once = false): void {
  try {
    if (once) {
      const key = `${event}:${JSON.stringify(meta ?? {})}`;
      if (fired.has(key)) return;
      fired.add(key);
    }
    const body = payload(event, meta);
    // sendBeacon يبقى حيّاً بعد مغادرة الصفحة؛ fetch احتياطٌ للمتصفّح القديم.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/track", {
      method: "POST", body, keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => { /* صامت */ });
  } catch { /* صامت */ }
}
