/* ============================================================================
 * swUpdate — النسخةُ الجديدة تنزل بلحظةٍ لا يضيع فيها شيء، لا تحت يد الطبيب.
 *
 * ── القياس الذي فرضه (١٧/١٠) ─────────────────────────────────────────────
 * «أسجّل حالة، وبنصّها السستم يفصل ويرجع يحمل من الصفر». سجلُّ طلبات الخادم
 * حسمها: الجهازُ الذي يُفتح أوّلَ مرّةٍ بعد نشرٍ يُقلع **مرّتين** بفاصل ٢٣–٢٧ ثانية
 * بلا أيّ ضغطة بينهما (ستُّ عيادات، ويندوز وأندرويد)، والتبويبُ المفتوح يُقلع من
 * جديد دقائقَ بعد النشر. والفاصلُ هو زمنُ تنزيل الـprecache (٧ ميغا، ٢٨١ ملفّاً)
 * على نتّ العيادة. السببُ `registerType: "autoUpdate"`: الخدمةُ الجديدة تتخطّى
 * الانتظار وتستولي، ومستمعُ `activated` بحزمة الإضافة يُنادي `location.reload()`
 * بلا شرط — والنشرُ عندنا مراتٌ باليوم. وأُعيد إنتاجُها بالمختبر.
 *
 * ── السياسة ───────────────────────────────────────────────────────────────
 * الخدمةُ الجديدة تُنزَّل بالخلفية وتنتظر (`registerType: "prompt"`)، وتُطبَّق
 * (SKIP_WAITING ثم تحميلٌ واحد) بإحدى ثلاث لحظات:
 *   ١) قبل أن يلمس المستخدمُ الصفحة منذ تحميلها؛
 *   ٢) عند تبديل `pathname` — التبديلُ يرمي حالةَ الصفحة القديمة أصلاً — ما لم يحمل
 *      التبديلُ تسليماً تقرؤه الوجهةُ وتمسحه (App.tsx)؛
 *   ٣) بعد خمولٍ طويل (التبويبُ مخفيّ ٣٠ دقيقة، أو ظاهرٌ بلا لمسة ٣ ساعات، ولا حقلَ
 *      مركَّزٌ فيه نصّ) — حاسوبُ الكاشير الذي لا يبدّل صفحتَه أبداً كان سيبقى على
 *      النسخة القديمة بلا حدّ (تدقيقٌ عدائيّ).
 * وبكلّها شرطان يُعادان حتى لحظةِ التحميل نفسها:
 *   - **لا لمسةَ منذ بدأت المحاولة** — وإلا تراجعت (تُطبَّق باللحظة الآمنة التالية)؛
 *   - **لا كتابةَ بالطريق** (`inflight.ts`): سلسلةُ ما بعد البيعة ممسوكةٌ صراحةً، وأيُّ
 *     كتابةٍ أخرى تُنتظر قليلاً — وإلا تُتخطّى.
 * وتبويبٌ استولت عليه نسخةٌ طبّقها تبويبٌ آخر («taken») **لا يُحمَّل** — شِفرتُه القديمة
 * تكمل، ويُحمَّل باللحظة الآمنة التالية؛ وإن طلب قطعةً انحذفت فـ`appUpdate.ts` يحمّله
 * تحميلاً عادياً (الخدمةُ الجديدة تخدم الجديد) بلا مسح المخبأ.
 *
 * القرارُ كلُّه بـ`createUpdater` على بيئةٍ تُحقن، فيُفحص بسلوكه (sw-update-test).
 * ==========================================================================*/

import { holdsActive, setUpdater, writesBusy } from "./inflight";

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
  /** وقتُ آخر ضغطةٍ أو حرف بالصفحة (0 = لم يلمسها أحدٌ منذ تحميلها). */
  lastInput(): number;
  /** كتابةٌ بالطريق أو ممسوكة (`inflight.writesBusy`). */
  busy(): boolean;
  /** سلسلةٌ ممسوكةٌ صراحةً (`inflight.holdsActive`) — تبديلُ الصفحة لا ينتظرها، يتخطّى. */
  held(): boolean;
  hidden(): boolean;
  /** حقلٌ مركَّزٌ فيه نصّ — الخمولُ لا يطبّق فوقه. */
  editing(): boolean;
  /** ذاكرةُ الجلسة — حارسُ الدوّامة يعيش عبر التحميل. */
  session: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  setTimer(fn: () => void, ms: number): void;
}

export type UpdateState = "none" | "waiting" | "taken";

const APPLIED_KEY = "vp_sw_applied_at";
/** تطبيقٌ واحد كلّ ٣٠ ثانية: إن لم تنفع إعادةُ التحميل فلا دوّامة. */
const LOOP_GAP_MS = 30_000;
/** بعد طلب التخطّي: إن بقيت الخدمةُ تنتظر فالتفعيلُ مؤجَّل (الخدمةُ القديمة تُكمل صوراً) — نتراجع. */
const FALLBACK_MS = 4_000;
/** كم تُنتظر كتابةٌ بالطريق قبل التخطّي: عند تبديل الصفحة قصيراً، وعند الإقلاع والخمول أطول. */
const DRAIN_PAGE_MS = 3_000;
const DRAIN_LONG_MS = 15_000;
const DRAIN_STEP_MS = 250;
export const IDLE_HIDDEN_MS = 30 * 60_000;
export const IDLE_VISIBLE_MS = 3 * 3600_000;

export function createUpdater(env: UpdaterEnv) {
  let reg: RegLike | null = null;
  let state: UpdateState = "none";
  let applying = false;
  let appliedAt = 0;
  let attempt = 0; // معرّفُ المحاولة الجارية — محاولةٌ أحدث تُلغي مؤقّتاتِ ما قبلها
  let wasControlled = env.controlled();

  /** هل لمس أحدٌ الصفحةَ بعد `since`؟ (0 = منذ التحميل) */
  const touchedSince = (since: number) => env.lastInput() > since;

  /** حمّل الآن إن بقي الشرطان، وإلا انتظر الكتابةَ حتى المهلة، أو تراجع. */
  const reloadWhenSafe = (since: number, deadline: number) => {
    if (touchedSince(since)) { standDown(); return; }
    if (env.busy()) {
      if (env.now() >= deadline) { standDown(); return; }
      env.setTimer(() => { if (applying) reloadWhenSafe(since, deadline); }, DRAIN_STEP_MS);
      return;
    }
    env.reload();
  };

  /** تراجع: الخدمةُ إن استولت فالحالةُ «taken» — تُطبَّق باللحظة الآمنة التالية. */
  const standDown = () => {
    applying = false;
    if (!reg?.waiting && env.controlled() && state === "waiting") state = "taken";
  };

  /** ابدأ التطبيق. `since` = لحظةُ القرار (لمسةٌ بعدها تلغيه)، `drainMs` = كم تُنتظر الكتابات. */
  const apply = (since: number, drainMs: number): boolean => {
    if (applying || state === "none") return false;
    if (touchedSince(since)) return false;
    const last = Number(env.session.getItem(APPLIED_KEY) || 0);
    if (env.now() - last < LOOP_GAP_MS) return false;
    const my = ++attempt;
    const deadline = env.now() + drainMs;
    const go = () => {
      if (my !== attempt) return;
      if (touchedSince(since)) return;
      if (env.busy()) {
        if (env.now() >= deadline) return; // كتابةٌ لم تنتهِ: تُتخطّى هذه اللحظة
        env.setTimer(go, DRAIN_STEP_MS);
        return;
      }
      env.session.setItem(APPLIED_KEY, String(env.now()));
      applying = true;
      appliedAt = env.now();
      const waiting = reg?.waiting;
      if (state === "waiting" && waiting) {
        // التخطّي يُطلب، والتحميلُ عند `controllerchange` (أدناه).
        waiting.postMessage({ type: "SKIP_WAITING" });
        env.setTimer(() => {
          if (!applying || my !== attempt) return;
          // ما زالت تنتظر = التفعيلُ مؤجَّل؛ تحميلٌ الآن تخدمه القديمةُ نفسُها — نتراجع.
          if (reg?.waiting) { applying = false; return; }
          reloadWhenSafe(appliedAt, appliedAt + drainMs + FALLBACK_MS);
        }, FALLBACK_MS);
      } else {
        // «taken»: الخدمةُ الجديدة تتحكّم أصلاً — ما بقي إلا شِفرتُها.
        reloadWhenSafe(appliedAt, appliedAt + drainMs);
      }
    };
    go();
    return true;
  };

  const ready = (s: Exclude<UpdateState, "none">) => {
    if (state !== "taken") state = s;
    if (!touchedSince(0)) apply(0, DRAIN_LONG_MS);
  };

  env.onControllerChange(() => {
    if (!wasControlled) { wasControlled = true; return; }      // أوّلُ تثبيت: لا نسخةَ قديمة
    if (applying) { state = "taken"; reloadWhenSafe(appliedAt, appliedAt + DRAIN_LONG_MS); return; } // نحن طلبناه
    ready("taken");                                              // تبويبٌ آخر طبّقه
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
    /** تبدّلت الصفحة — اللحظةُ الآمنة. سلسلةٌ ممسوكة ⇒ تُتخطّى (لا تحميلَ لاحقٌ تحت اليد). */
    pageChanged(): boolean {
      if (state === "none" || env.held()) return false;
      return apply(env.now(), DRAIN_PAGE_MS);
    },
    /** كلّ دقيقة: خمولٌ طويل بلا حقلٍ مكتوب ⇒ تُطبَّق. */
    idleTick(): boolean {
      if (state === "none" || applying || env.held() || env.editing()) return false;
      const idle = env.now() - env.lastInput();
      if (idle < (env.hidden() ? IDLE_HIDDEN_MS : IDLE_VISIBLE_MS)) return false;
      return apply(env.lastInput(), DRAIN_LONG_MS);
    },
    get state(): UpdateState { return state; },
  };
}

/** الإقلاع (`main.tsx` يحمّل هذه القطعةَ فوراً): سجّل الخدمة بسياسة «لا تحميلَ تحت اليد».
 *  `App.tsx` و`appUpdate.ts` يصلانها من جسر `inflight.ts` (`notePageChange`/`updateTaken`). */
export function startAppUpdates(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  let lastInput = 0;
  const stamp = () => { lastInput = Date.now(); };
  for (const ev of ["pointerdown", "keydown", "input"] as const) {
    window.addEventListener(ev, stamp, { capture: true, passive: true });
  }
  const u = createUpdater({
    controlled: () => !!sw.controller,
    register: () => sw.register("/sw.js", { scope: "/" }) as Promise<RegLike>,
    onControllerChange: (fn) => sw.addEventListener("controllerchange", fn),
    reload: () => window.location.reload(),
    now: () => Date.now(),
    lastInput: () => lastInput,
    busy: () => writesBusy(),
    held: () => holdsActive(),
    hidden: () => document.visibilityState === "hidden",
    editing: () => {
      const el = document.activeElement as (HTMLElement & { value?: unknown }) | null;
      if (!el) return false;
      if (el.isContentEditable) return !!el.textContent?.trim();
      return /^(INPUT|TEXTAREA)$/.test(el.tagName) && typeof el.value === "string" && el.value.trim() !== "";
    },
    session: {
      getItem: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
      setItem: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* خاصّ */ } },
    },
    setTimer: (fn, ms) => { window.setTimeout(fn, ms); },
  });
  setUpdater(u);
  void u.start().catch(() => { /* متصفّحٌ يرفض الخدمة — التطبيقُ يعمل بلاها */ });
  // التبويبُ المثبَّت على الجهاز يُستأنف ولا يُحمَّل — نسأل عند العودة وكلّ ٢٠ دقيقة.
  // السؤالُ يُنزّل فقط؛ التطبيقُ بقرار `pageChanged`/`idleTick`/الإقلاع غير الملموس.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") u.check(); });
  window.setInterval(() => u.check(), 20 * 60 * 1000);
  window.setInterval(() => u.idleTick(), 60 * 1000);
}

