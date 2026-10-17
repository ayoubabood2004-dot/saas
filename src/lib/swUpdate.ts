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
 *   ١) لم يلمس أحدٌ الجهازَ منذ تحميل الصفحة؛
 *   ٢) تبديلُ `pathname` — التبديلُ يرمي حالةَ الصفحة القديمة أصلاً — ما لم يحمل
 *      التبديلُ تسليماً تقرؤه الوجهةُ وتمسحه (App.tsx)؛
 *   ٣) خمولٌ طويل: لا لمسةَ **بالجهاز كلِّه** (كلُّ التبويبات — `vp_last_input`) ٣٠ دقيقة
 *      والتبويبُ مخفيّ، أو ٣ ساعات وهو ظاهر، ولا حقلَ بالصفحة كُتب فيه ولم يُفرغ —
 *      حاسوبُ الكاشير الذي لا يبدّل صفحتَه كان سيبقى على القديمة بلا حدّ، وتبويبٌ خلفيّ
 *      خامل كان يطبّقها فوق تبويبٍ يعمل (تدقيقٌ عدائيّ).
 * وبكلّها شرطان يُعادان حتى لحظةِ التحميل نفسها:
 *   - **لا لمسةَ بالجهاز منذ القرار** — وإلا تراجعت (تُطبَّق باللحظة الآمنة التالية)؛
 *   - **لا كتابةَ بالطريق** (`inflight.ts`) — والقرارُ نفسُه يُؤجَّل خطوةً: كتابةُ الصفحة
 *     المغادَرة (تفريغُ ملاحظةٍ عند خروجها) تصل العدّادَ بعد جولةٍ من الوعود.
 * وطلبُنا للتخطّي محفوظٌ حتى يُحمَّل التبويب: استيلاءٌ تأخّر (القديمةُ تُكمل صوراً) يحمّله
 * ما لم يُلمس منذ الطلب. وتبويبٌ استولت عليه نسخةٌ طلبها غيرُه («taken») **لا يُحمَّل** —
 * يُحمَّل باللحظة الآمنة التالية؛ وإن طلب قطعةً انحذفت فـ`appUpdate.ts` يحمّله بعد أن تهدأ الكتابات.
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
  /** وقتُ آخر ضغطةٍ أو حرف **بالجهاز** (هذا التبويب أو غيرُه؛ 0 = لا شيء). */
  lastInput(): number;
  /** كتابةٌ بالطريق أو ممسوكة (`inflight.writesBusy`). */
  busy(): boolean;
  /** سلسلةٌ ممسوكةٌ صراحةً (`inflight.holdsActive`) — تبديلُ الصفحة لا ينتظرها، يتخطّى. */
  held(): boolean;
  hidden(): boolean;
  /** بالصفحة حقلٌ كُتب فيه وما زال فيه نصّ — الخمولُ لا يطبّق فوقه. */
  editing(): boolean;
  /** ذاكرةُ الجلسة — حارسُ الدوّامة يعيش عبر التحميل. */
  session: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  setTimer(fn: () => void, ms: number): void;
}

export type UpdateState = "none" | "waiting" | "taken";

const APPLIED_KEY = "vp_sw_applied_at";
/** تطبيقٌ واحد كلّ ٣٠ ثانية: إن لم تنفع إعادةُ التحميل فلا دوّامة. */
const LOOP_GAP_MS = 30_000;
/** بعد طلب التخطّي: إن بقيت الخدمةُ تنتظر فالتفعيلُ مؤجَّل (القديمةُ تُكمل صوراً) — نتراجع ونترك
 *  الاستيلاءَ المتأخّر يقرّر. */
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
  /** محاولةٌ تنتظر لحظتَها (خطوةٌ أو كتابةٌ تُفرَّغ) ولم تلتزم بعد — لحظةٌ آمنةٌ أحدث **تحلّ محلّها**
   *  لا تُرفض (تدقيقٌ عدائيّ ثالث: ضغطةُ الشريط أثناء انتظار الإقلاع كانت تُرفض ثم تُلغي القديمة). */
  let pending = false;
  /** التزمنا: طُلب التخطّي أو بدأ قرارُ التحميل — لا محاولةَ أخرى حتى يُحمَّل التبويب أو نتراجع. */
  let committed = false;
  /** طلبنا التخطّي في هذه اللحظة ولم يُحمَّل التبويبُ بعد — الاستيلاءُ المتأخّر لنا. */
  let requestedAt = 0;
  /** معرّفُ المحاولة — محاولةٌ أحدث تُبطل مؤقّتاتِ ما قبلها. */
  let attempt = 0;
  let wasControlled = env.controlled();
  const bootAt = env.now();

  const touchedSince = (since: number) => env.lastInput() > since;

  /** حمّل الآن إن بقي الشرطان، وإلا انتظر الكتابةَ حتى المهلة، أو تراجع. */
  const reloadWhenSafe = (my: number, since: number, deadline: number) => {
    if (my !== attempt || !committed) return;
    if (touchedSince(since)) { committed = false; return; }
    if (env.busy()) {
      if (env.now() >= deadline) { committed = false; return; }
      env.setTimer(() => reloadWhenSafe(my, since, deadline), DRAIN_STEP_MS);
      return;
    }
    env.reload();
  };

  /** ابدأ التطبيق. `since` = لحظةُ القرار (لمسةٌ بعدها تلغيه)، `drainMs` = كم تُنتظر الكتابات. */
  const apply = (since: number, drainMs: number): boolean => {
    if (committed || state === "none") return false;
    if (touchedSince(since)) return false;
    if (env.now() - Number(env.session.getItem(APPLIED_KEY) || 0) < LOOP_GAP_MS) return false;
    const my = ++attempt; // محاولةٌ معلّقةٌ أقدم تبطل: هذه لحظةٌ آمنةٌ أحدث
    pending = true;
    const deadline = env.now() + drainMs;
    const go = () => {
      if (my !== attempt || committed) return;
      if (touchedSince(since)) { pending = false; return; }
      if (env.busy()) {
        if (env.now() >= deadline) { pending = false; return; } // كتابةٌ لم تنتهِ: تُتخطّى هذه اللحظة
        env.setTimer(go, DRAIN_STEP_MS);
        return;
      }
      pending = false;
      committed = true;
      const at = env.now();
      env.session.setItem(APPLIED_KEY, String(at));
      const waiting = reg?.waiting;
      if (state === "waiting" && waiting) {
        requestedAt = at;
        waiting.postMessage({ type: "SKIP_WAITING" }); // والتحميلُ عند `controllerchange`
        env.setTimer(() => {
          if (my !== attempt || !committed) return; // الاستيلاءُ وصل وتسلّم القرار
          // ما زالت تنتظر = التفعيلُ مؤجَّل؛ تحميلٌ الآن تخدمه القديمةُ نفسُها — نتراجع،
          // و`requestedAt` يبقى: الاستيلاءُ المتأخّر يحمّل ما لم يُلمس منذ الطلب.
          if (reg?.waiting) { committed = false; return; }
          reloadWhenSafe(my, at, at + drainMs + FALLBACK_MS); // فُعِّلت ولم يصل الحدث
        }, FALLBACK_MS);
      } else {
        reloadWhenSafe(my, at, at + drainMs); // «taken»: الجديدةُ تتحكّم — ما بقي إلا شِفرتُها
      }
    };
    // خطوةً لا فوراً: كتابةُ الصفحة المغادَرة تمرّ بـgetSession قبل أن يعدّها trackedFetch.
    env.setTimer(go, DRAIN_STEP_MS);
    return true;
  };

  const ready = (s: Exclude<UpdateState, "none">) => {
    if (state !== "taken") state = s;
    if (!touchedSince(bootAt)) apply(bootAt, DRAIN_LONG_MS);
  };

  env.onControllerChange(() => {
    if (!wasControlled) { wasControlled = true; return; } // أوّلُ تثبيت: لا نسخةَ قديمة
    state = "taken";
    // محاولةٌ أحدث معلّقة: تأخذ فرعَ «taken» بلحظتها هي — طلبُنا القديمُ انتهى دورُه.
    if (pending) { requestedAt = 0; return; }
    if (requestedAt) {
      // طلبُنا — ولم يُحمَّل التبويبُ منذه، فلا دوّامةَ يحرسها APPLIED_KEY: حمّل إن لم يُلمس منذ الطلب.
      const since = requestedAt;
      requestedAt = 0;
      const my = ++attempt;
      committed = true;
      reloadWhenSafe(my, since, env.now() + DRAIN_LONG_MS);
      return;
    }
    if (committed) return; // قرارُ تحميلٍ جارٍ أصلاً
    ready("taken"); // طلبه تبويبٌ آخر
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
    /** كلّ دقيقة: خمولٌ طويل بالجهاز كلِّه، بلا حقلٍ مكتوب ⇒ تُطبَّق. */
    idleTick(): boolean {
      if (state === "none" || pending || committed || env.held() || env.editing()) return false;
      const last = Math.max(env.lastInput(), bootAt);
      if (env.now() - last < (env.hidden() ? IDLE_HIDDEN_MS : IDLE_VISIBLE_MS)) return false;
      return apply(last, DRAIN_LONG_MS);
    },
    get state(): UpdateState { return state; },
  };
}

const SHARED_INPUT_KEY = "vp_last_input";

/** حقلُ نصٍّ حرّ (لا قائمةَ ولا مربّعَ اختيارٍ ولا تاريخ): قيمُ تلك لا تُفرغ فكانت تُبقي الخمولَ مطفأً
 *  ما دامت معروضة — مربّعٌ أُلغي اختيارُه قيمتُه "on" (تدقيقٌ عدائيّ ثالث). */
const freeText = (t: EventTarget | null): boolean =>
  t instanceof HTMLTextAreaElement
  || (t instanceof HTMLInputElement && /^(text|search|tel|email|url|number|password)$/.test(t.type))
  || (t instanceof HTMLElement && t.isContentEditable);

/** الإقلاع (`main.tsx` يحمّل هذه القطعةَ فوراً): سجّل الخدمة بسياسة «لا تحميلَ تحت اليد».
 *  `App.tsx` و`appUpdate.ts` يصلانها من جسر `inflight.ts` (`notePageChange`/`updateTaken`). */
export function startAppUpdates(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  let lastInput = 0;
  let sharedAt = 0;
  /** حقولٌ كُتب فيها بهذه الصفحة — الخمولُ لا يطبّق ما دام فيها نصّ (عدٌّ للمخزن، ملاحظة…). */
  const typed = new Set<Element>();
  const stamp = (e: Event) => {
    lastInput = Date.now();
    if (e.type === "input" && freeText(e.target)) typed.add(e.target as Element);
    // ختمٌ مشترك بين التبويبات (كلّ ثانية بالأكثر): تبويبٌ خلفيّ لا يطبّق والآخرُ يعمل.
    if (lastInput - sharedAt > 1000) {
      sharedAt = lastInput;
      try { localStorage.setItem(SHARED_INPUT_KEY, String(lastInput)); } catch { /* ممنوع */ }
    }
  };
  for (const ev of ["pointerdown", "keydown", "input"] as const) {
    window.addEventListener(ev, stamp, { capture: true, passive: true });
  }
  const u = createUpdater({
    controlled: () => !!sw.controller,
    register: () => sw.register("/sw.js", { scope: "/" }) as Promise<RegLike>,
    onControllerChange: (fn) => sw.addEventListener("controllerchange", fn),
    reload: () => window.location.reload(),
    now: () => Date.now(),
    lastInput: () => {
      let shared = 0;
      try { shared = Number(localStorage.getItem(SHARED_INPUT_KEY) || 0); } catch { /* ممنوع */ }
      return Math.max(lastInput, shared);
    },
    busy: () => writesBusy(),
    held: () => holdsActive(),
    hidden: () => document.visibilityState === "hidden",
    editing: () => {
      for (const el of typed) {
        if (!el.isConnected) { typed.delete(el); continue; }
        const v = (el as HTMLElement & { value?: unknown }).value;
        if (typeof v === "string" ? v.trim() !== "" : !!(el as HTMLElement).isContentEditable && !!el.textContent?.trim()) return true;
      }
      return false;
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
