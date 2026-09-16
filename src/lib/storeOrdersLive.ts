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

/* ── هل للعيادة متجرٌ **مفعَّل**؟ ────────────────────────────────────────────
 *
 * الشرطُ كان `has("store") && can("processSales")` — أي **الباقة**، وهي صادقةٌ
 * لكلّ عيادةٍ بتجربةٍ أو باقةِ super. والمقيسُ على الإنتاج: **٦٤ عيادةً، واحدةٌ
 * منها عندها صفٌّ بـ`store_profiles`**. فثلاثٌ وستّون عيادةً تنبض كلَّ ٤٥ ثانية
 * لكلّ تبويبٍ مفتوح — ~٦٤٠ نداءً باليوم للتبويب الواحد — على بياناتِ موبايلٍ
 * يدفعها الدكتور، لتعدّ صفراً لا يمكن أن يصير غيرَ صفر.
 *
 * ولا يظهر شيءٌ بالشاشة أصلاً (الشارةُ `> 0`)، فالعطبُ **كلفةٌ لا صورة** — ولهذا
 * لم يشتكِ منه أحد، ولهذا بقي.
 *
 * وقراءةٌ واحدةٌ بالجلسة تحكمها كلَّها. وسقوطُ القراءة **ينبض** لا يسكت: صمتٌ
 * على خطأٍ عابر جرسٌ لا يرنّ وطلبٌ يُنسى، وهو أسوأُ العطبين لا أرخصُهما. */
let storeOn: boolean | null = null;
/** سلاگُ المتجر المفعَّل — يُملأ مع نفس المجسّ، ويُقرأ **بلا رحلة**. */
let storeSlug: string | null = null;
let probing: Promise<unknown> | null = null;
const onSubs = new Set<() => void>();
const fanOut = () => onSubs.forEach((f) => f());

/** تُنادى من شاشة المتجر بعد الجلب/الحفظ — يستيقظ الجرسُ أو يسكت بلا رحلةٍ ثانية. */
export function noteStoreProfile(p: { enabled?: boolean | null; slug?: string | null } | null | undefined): void {
  const next = !!p?.enabled;
  storeSlug = next ? (p?.slug ?? null) : null;
  if (next === storeOn) return;
  storeOn = next;
  fanOut();
}
function subscribeHasStore(cb: () => void) {
  onSubs.add(cb);
  if (storeOn === null && !probing) {
    probing = repo.getStoreProfile()
      .then((p) => { storeOn = !!p?.enabled; storeSlug = storeOn ? (p?.slug ?? null) : null; })
      .catch(() => { storeOn = true; })   // عابرٌ: لا نُسكت جرساً قد يكون له متجر
      .finally(fanOut);
  }
  return () => { onSubs.delete(cb); };
}
const readHasStore = () => storeOn === true;

/** رابطُ المتجر المفعَّل — **من الذاكرة لا من الشبكة**.
 *
 *  تُنادى من مسار **طباعة القسيمة**، وهو داخل البيعة: رحلةُ شبكةٍ هناك تؤخّر
 *  الكاشيرَ والزبونُ واقف. فالقيمةُ تُملأ من مجسّ الجرس (يعمل بكلّ شاشةٍ بها
 *  الشريطُ الجانبيّ) ومن شاشة المتجر نفسِها.
 *
 *  ولو لم تُملأ بعد ⇒ `null` ⇒ الـQR يرجع لواتساب — أي **سلوكُ اليوم بالضبط**،
 *  لا عطبٌ جديد. ونوقظ المجسَّ فتكون الطبعةُ التالية على علم. */
export function storeSlugCached(): string | null {
  if (storeOn === null && !probing) {
    probing = repo.getStoreProfile()
      .then((p) => { storeOn = !!p?.enabled; storeSlug = storeOn ? (p?.slug ?? null) : null; })
      .catch(() => { storeOn = null; })   // ما نثبّت «لا متجر» على فشلٍ عابر
      .finally(fanOut);
  }
  return storeOn === true ? storeSlug : null;
}
/** الشرطُ الحقيقيّ: صفٌّ **مفعَّل** بـ`store_profiles` — لا ما تسمح به الباقة. */
export function useHasEnabledStore(): boolean {
  return useSyncExternalStore(subscribeHasStore, readHasStore, () => false);
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

/* مرجعان ثابتان — بلا اسمٍ لا يُنزع المستمع، فيبقى كلُّ `focus` ينادي
 * `tick()` بعد أن يذهب آخرُ مشترك. تسريبٌ صامتٌ يعيش ما عاش التبويب. */
const onVis = () => { if (!document.hidden) void tick(); };
const onFocus = () => { void tick(); };
function wire() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  // العودةُ للتبويب تُعيد العدَّ فوراً — لا ينتظر الدكتورُ دورةَ نبضٍ كاملة.
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onFocus);
}
function unwire() {
  if (!wired || typeof document === "undefined") return;
  wired = false;
  document.removeEventListener("visibilitychange", onVis);
  window.removeEventListener("focus", onFocus);
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
      unwire();
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
