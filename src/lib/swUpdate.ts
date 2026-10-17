/* ============================================================================
 * swUpdate — النسخةُ الجديدة تنزل عند تبديل الصفحة، لا تحت يد الطبيب.
 *
 * ── القياس الذي فرضه (١٧/١٠) ─────────────────────────────────────────────
 * «أسجّل حالة، وبنصّها السستم يفصل ويرجع يحمل من الصفر». سجلُّ طلبات الخادم
 * حسمها: الجهازُ الذي يُفتح أوّلَ مرّةٍ بعد نشرٍ يُقلع **مرّتين** بفاصل ٢٣–٢٧ ثانية
 * بلا أيّ ضغطة بينهما (ستُّ عيادات، ويندوز وأندرويد)، والتبويبُ المفتوح يُقلع من
 * جديد دقائقَ بعد النشر. والفاصلُ هو زمنُ تنزيل الـprecache (٧ ميغا، ٢٨١ ملفّاً)
 * على نتّ العيادة. السببُ `registerType: "autoUpdate"`: الخدمةُ الجديدة تتخطّى
 * الانتظار وتستولي، ومستمعُ `activated` بحزمة الإضافة يُنادي `location.reload()`
 * بلا شرط — والنشرُ عندنا مراتٌ باليوم. وأُعيد إنتاجُها بالمختبر: نسختان متتاليتان
 * وحالةٌ نصفُ مكتوبة ⇒ `navigation.type = "reload"` والحقولُ فارغة.
 *
 * ── السياسة ───────────────────────────────────────────────────────────────
 * الخدمةُ الجديدة تُنزَّل بالخلفية وتنتظر (`registerType: "prompt"`)، وتُطبَّق
 * بلحظةٍ لا يضيع فيها شيء:
 *   ١) قبل أن يلمس المستخدمُ الصفحة (لا ضغطةَ ولا حرف منذ تحميلها)؛
 *   ٢) أو عند تبديل الصفحة (`pathname`) — التبديلُ يرمي حالةَ الصفحة القديمة
 *      أصلاً (`Routes` مفتاحُها المسار)، فالتحميلُ عندها لا يُضيّع إلا ما ضاع.
 * ولا تحميلَ آخر أبداً: لا عند الاستيلاء، ولا عند عودة التبويب، ولا بمؤقّت.
 * وتبويبٌ استولت عليه نسخةٌ طبّقها تبويبٌ آخر **لا يُعاد تحميلُه** — شِفرتُه القديمة
 * تكمل، ويُحمَّل عند تبديل صفحته. (وإن طلب قطعةً كسولةً انحذفت فمسارُ
 * `appUpdate.ts` يعيده — ومسودّةُ النموذج `formDraft.ts` ترجّع ما كُتب.)
 *
 * القرارُ كلُّه بـ`createUpdater` على بيئةٍ تُحقن، فيُفحص بسلوكه (sw-update-test).
 * ==========================================================================*/

/** ما يلزم من `ServiceWorkerRegistration` — تكفيه المحاكاةُ بالفحص. */
export interface RegLike {
  waiting: { postMessage(msg: unknown): void } | null;
  installing: { state: string; addEventListener(type: "statechange", fn: () => void): void } | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", fn: () => void): void;
}

export interface UpdaterEnv {
  /** هل تتحكّم بالصفحة خدمةٌ الآن (`navigator.serviceWorker.controller`). */
  controlled(): boolean;
  register(): Promise<RegLike>;
  onControllerChange(fn: () => void): void;
  reload(): void;
  now(): number;
  /** ذاكرةُ الجلسة — حارسُ الدوّامة يعيش عبر التحميل. */
  session: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  setTimer(fn: () => void, ms: number): void;
}

export type UpdateState = "none" | "waiting" | "taken";

const APPLIED_KEY = "vp_sw_applied_at";
/** تطبيقٌ واحد كلّ ٣٠ ثانية: إن لم تنفع إعادةُ التحميل فلا دوّامة. */
const LOOP_GAP_MS = 30_000;
/** إن لم يصل `controllerchange` بعد طلب التخطّي نحمّل بأيّ حال. */
const FALLBACK_MS = 4_000;

export function createUpdater(env: UpdaterEnv) {
  let reg: RegLike | null = null;
  let state: UpdateState = "none";
  let touched = false;
  let applying = false;
  let wasControlled = env.controlled();

  const apply = (): boolean => {
    if (applying || state === "none") return false;
    const last = Number(env.session.getItem(APPLIED_KEY) || 0);
    if (env.now() - last < LOOP_GAP_MS) return false;
    env.session.setItem(APPLIED_KEY, String(env.now()));
    applying = true;
    const waiting = reg?.waiting;
    if (state === "waiting" && waiting) {
      // التخطّي يُطلب، والتحميلُ عند `controllerchange` (أدناه) — أو بعد مهلة.
      waiting.postMessage({ type: "SKIP_WAITING" });
      env.setTimer(() => env.reload(), FALLBACK_MS);
    } else {
      env.reload(); // «taken»: الخدمةُ الجديدة تتحكّم أصلاً — ما بقي إلا شِفرتُها.
    }
    return true;
  };

  const ready = (s: Exclude<UpdateState, "none">) => {
    if (state !== "taken") state = s;
    if (!touched) apply();
  };

  env.onControllerChange(() => {
    if (!wasControlled) { wasControlled = true; return; } // أوّلُ تثبيت: لا نسخةَ قديمة
    if (applying) { env.reload(); return; }               // نحن طلبناه: هذه لحظتُه
    ready("taken");                                        // تبويبٌ آخر طبّقه
  });

  return {
    /** سجّل الخدمة وراقب النسخَ الجديدة. */
    async start(): Promise<void> {
      reg = await env.register();
      if (reg.waiting && env.controlled()) ready("waiting");
      reg.addEventListener("updatefound", () => {
        const w = reg?.installing;
        if (!w) return;
        w.addEventListener("statechange", () => {
          // «installed» مع خدمةٍ تتحكّم = تحديثٌ ينتظر؛ بلا خدمة = أوّلُ تثبيت.
          if (w.state === "installed" && env.controlled()) ready("waiting");
        });
      });
    },
    /** اسأل الخادمَ عن نسخةٍ أحدث (يُنزّلها بالخلفية — لا يطبّقها). */
    check(): void {
      reg?.update().catch(() => { /* بلا نت — المرّةُ القادمة */ });
    },
    /** المستخدمُ لمس الصفحة: من الآن لا تحميلَ إلا عند تبديلها. */
    touch(): void { touched = true; },
    /** تبدّلت الصفحة — اللحظةُ الآمنة. يرجع هل بدأ التطبيق. */
    pageChanged(): boolean { return apply(); },
    get state(): UpdateState { return state; },
  };
}

let current: ReturnType<typeof createUpdater> | null = null;

/** الإقلاع (`main.tsx`): سجّل الخدمة بسياسة «لا تحميلَ تحت اليد». */
export function startAppUpdates(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  const u = createUpdater({
    controlled: () => !!sw.controller,
    register: () => sw.register("/sw.js", { scope: "/" }) as Promise<RegLike>,
    onControllerChange: (fn) => sw.addEventListener("controllerchange", fn),
    reload: () => window.location.reload(),
    now: () => Date.now(),
    session: {
      getItem: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
      setItem: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* خاصّ */ } },
    },
    setTimer: (fn, ms) => { window.setTimeout(fn, ms); },
  });
  current = u;
  const touch = () => u.touch();
  for (const ev of ["pointerdown", "keydown", "input"] as const) {
    window.addEventListener(ev, touch, { capture: true, once: true, passive: true });
  }
  void u.start().then(() => {
    // التبويبُ المثبَّت على الجهاز يُستأنف ولا يُحمَّل — نسأل عند العودة وكلّ ٢٠ دقيقة.
    // السؤالُ يُنزّل فقط؛ التطبيقُ بقرار `pageChanged`/`touch` أعلاه.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") u.check(); });
    window.setInterval(() => u.check(), 20 * 60 * 1000);
  }).catch(() => { /* متصفّحٌ يرفض الخدمة — التطبيقُ يعمل بلاها */ });
}

/** `App.tsx` ينادي هذا عند تبديل المسار. */
export function notePageChange(): void {
  current?.pageChanged();
}
