// ============================================================================
// جرسُ طلبات المتجر — «طلبٌ ينتظر ساعتين بلا علم أحد» زبونٌ ضايع.
//
// الطلبُ يجي بالدفع عند الاستلام، والزبونُ ينتظر مكالمةَ التأكيد. فإن كان
// الدكتورُ بشاشةٍ أخرى — أو بتبويبٍ آخر بالمتصفّح — لازم يوصله الخبر بثلاث
// طبقاتٍ متدرّجة، كلٌّ منها تعمل حين تفشل التي قبلها:
//   ١) شارةٌ حمراء على «المتجر» بالقائمة الجانبية (تعمل دائماً، الشريط مركَّبٌ
//      بكلّ شاشة).
//   ٢) صوتٌ عند الارتفاع — يُسمع والدكتور ينظر لشاشةٍ أخرى بنفس الجهاز.
//   ٣) عنوانُ التبويب يحمل العدد، وإشعارُ نظامٍ إن أذن به الدكتور — يُريان
//      والتبويبُ بالخلف.
//
// وثلاثةُ قيودٍ تحكم التنفيذ:
//   • **لا عدٌّ بجرِّ الصفوف**: `countNewStoreOrders` ترجع رقماً بلا صفوف —
//     الجرسُ يدقّ كلَّ ٤٥ ثانية على بياناتِ موبايلٍ يدفعها الدكتور.
//   • **لا نبضَ على تبويبٍ مخفيّ**: المتصفّحاتُ تخنق مؤقّتاتِ الخلفية فيصير
//     النبضُ غيرَ موثوقٍ وغالي معاً؛ فنسكت حين يُخفى ونعُدّ **فوراً** حين يعود.
//   • **الفشلُ لا يصير صفراً**: خطأُ شبكةٍ عابرٌ يُبقي آخرَ عددٍ معروف. صفرٌ
//     كاذبٌ هنا = جرسٌ لا يرنّ وطلبٌ يُنسى، وهي «القائمةُ الناقصة تُصدَّق» عينُها.
// ============================================================================
import { useSyncExternalStore } from "react";
import i18next from "i18next";
import { repo } from "./repo";
import { playScan } from "./sounds";

const POLL_MS = 45000;

let count = 0;
let prev = -1; // أول قراءة لا تنبّه — الزيادات الحقيقية فقط
const subs = new Set<() => void>();
let timer: number | undefined;
let wired = false;

async function tick() {
  if (typeof document !== "undefined" && document.hidden) return;
  try {
    const fresh = await repo.countNewStoreOrders();
    if (prev >= 0 && fresh > prev) {
      playScan();
      notify(fresh - prev);
    }
    prev = fresh;
    if (fresh !== count) {
      count = fresh;
      applyTitle();
      subs.forEach((f) => f());
    }
  } catch { /* عابر — نحتفظ بآخر عدد معروف، ولا نهبط لصفرٍ كاذب */ }
}

/* عنوانُ التبويب: الإشارةُ الوحيدة التي تُرى والتطبيقُ بالخلف وبلا إذنِ إشعار.
 * نحفظ العنوانَ الأصلي أوّلَ مرّة فلا تتراكم البادئاتُ على بعضها. */
let baseTitle = "";
function applyTitle() {
  if (typeof document === "undefined") return;
  const cur = document.title.replace(/^\(\d+\)\s*/, "");
  if (!baseTitle || cur !== baseTitle) baseTitle = cur;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
}

function notify(fresh: number) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(i18next.t("storeBell.title", "doctorVet — طلب جديد من المتجر"), {
      body: fresh === 1
        ? i18next.t("storeBell.one", "وصل طلب جديد من متجرك — افتحه للقبول أو الرفض.")
        : i18next.t("storeBell.many", { n: fresh, defaultValue: "وصلت {{n}} طلبات جديدة من متجرك." }),
      icon: "/favicon.svg",
      tag: "vp-store-orders",
    });
    n.onclick = () => { try { window.focus(); window.location.href = "/store"; } catch { /* ignore */ } };
  } catch { /* بعض المنصات ترمي من Notification — لا نكسر التطبيق أبداً */ }
}

/** إعادة عدّ فورية (تُستدعى بعد قبول/رفض طلب). */
export function bumpStoreOrders() {
  void tick();
}

/** حالةُ إذن الإشعارات — تقرؤها شاشةُ المتجر لتعرض الزرَّ أو تخفيه. */
export function storeAlertsState(): "unsupported" | "default" | "granted" | "denied" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as "default" | "granted" | "denied";
}

/** يُطلب الإذنُ **بضغطةِ الدكتور** لا عند الإقلاع: سفاري تشترط إيماءةَ مستخدم،
 *  وطلبٌ يقفز أوّلَ فتحةٍ يُرفض عادةً فيُحرق الخيارُ إلى الأبد. */
export async function enableStoreAlerts(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    const res = await Notification.requestPermission();
    return res === "granted" ? "granted" : "denied";
  } catch { return "unsupported"; }
}

function wire() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  // العودةُ للتبويب تُعيد العدَّ فوراً — لا ينتظر الدكتورُ دورةَ نبضٍ كاملة.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void tick(); });
  window.addEventListener("focus", () => { void tick(); });
}

function subscribeLive(cb: () => void) {
  subs.add(cb);
  wire();
  if (timer == null) {
    void tick();
    timer = window.setInterval(() => { void tick(); }, POLL_MS);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer != null) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const subscribeOff = () => () => { /* معطّل */ };
const readCount = () => count;
const readZero = () => 0;

/** عدد الطلبات الجديدة (يعمل المجس ما دام في مشترك واحد على الأقل). */
export function useStoreOrderCount(enabled = true): number {
  return useSyncExternalStore(enabled ? subscribeLive : subscribeOff, enabled ? readCount : readZero, readZero);
}
