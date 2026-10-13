/* ============================================================================
 * صندوق الصادر — كتابات لا تضيع بضعف النت.
 *
 * المشكلة: الدكتور يضيف منتجاً والنت واگع أو متقطّع؛ الطلب يفشل (أو يصل
 * والجواب يضيع) فيظنّ الحفظ تم أو يعيد فيزدوج — وبالحالتين تضيع الثقة.
 *
 * الحل: العملية الفاشلة **شبكياً** تُخزَّن هنا (localStorage) بصفّها الكامل
 * ومعرّفها المولود بالجهاز، وتُرفع تلقائياً عند عودة النت وبفواصل زمنية وعند
 * فتح التطبيق — بـupsert على المعرّف يتجاهل التكرار، فلو كان الطلب الأول قد
 * وصل فعلاً والجواب ضاع، لا يُزرع الصف مرتين أبداً. لا ضياع ولا ازدواج.
 *
 * ── ونوعان من العمليات ────────────────────────────────────────────────────
 *   * `insert` — صفٌّ بمعرّفٍ مولودٍ بالجهاز، يُرفع بـupsert متجاهلٍ للتكرار.
 *   * `rpc`    — نداءُ دالّةٍ بالقاعدة. وهذا **لا يجوز** إلا لدالّةٍ تعرف
 *                مرجعَ محاولتها (`client_ref`)، لأن الطابور يعيد بطبعه: نداءٌ
 *                بلا مرجعٍ يعني ازدواجاً منهجياً لا نادراً. الشرط مفروضٌ
 *                بالكود أدناه، لا بالنيّة.
 *
 * ── وثلاثةُ مسالكِ ضياعٍ كانت هنا، سُدّت ─────────────────────────────────
 *  ١) `save()` كان يبلع خطأ امتلاء الجهاز صامتاً. فالمنتج «ينحفظ» بنظر الدكتور
 *     ولا هو بالخادم ولا بالطابور. صار `enqueue` يُرجع صدقاً هل ثبت أم لا —
 *     ومَن يناديه يرمي الخطأ الأصلي حين لا يثبت، فيرى الدكتور فشلاً حقيقياً
 *     بدل نجاحٍ كاذب.
 *  ٢) الإسقاط بعد `MAX_TRIES` كان حذفاً نهائياً بسطرٍ بالكونسول لا يقرأه أحد.
 *     صار نقلاً إلى **رفّ المعطّلات**: العملية تبقى بحمولتها وسببِ فشلها،
 *     وتظهر بالشارة، وتُستأنف بضغطة. لا شيء ينمحي بلا قرارِ بشر.
 *  ٣) النطاق كان ثلاثة جداول. صار يشمل السحوبات والإرجاع كذلك.
 *
 * ── وما بقي خارجه عمداً: البيعة ───────────────────────────────────────────
 * `retail_checkout` صارت آمنةَ الإعادة (0135)، لكنها ما تدخل الطابور: نتيجتُها
 * يعتمد عليها ما بعدها — طلبُ التوصيل، وسجلّاتُ الحيوانات، وطباعةُ الوصل —
 * وكلّها تحتاج رقمَ الفاتورة الآن لا بعد ساعة. فطابورُها يعني بيعةً «محفوظة»
 * بلا وصلٍ ولا طلبِ توصيل ولا سجلٍّ طبّي. الحلّ الصحيح لها إعادةُ محاولةٍ
 * بيدِ الكاشير — وقد صارت مأمونة، فالمرجع يمنع الفاتورة الثانية.
 * ==========================================================================*/
import { supabase } from "./supabase";
import { confirmedClinic } from "./serverClinic";

/** الجداول التي معرّفُ صفّها يولَد بالجهاز — شرطُ الرفع المتسامح مع التكرار. */
export type OutboxTable = "products" | "companies" | "company_sections" | "expenses" | "poultry_daily";
/** الدوالّ التي تعرف `client_ref` فتُعاد بأمان (0136، و`poultry_consume` بـ0193). */
export type OutboxRpcFn = "retail_return" | "poultry_consume";

type OutboxBase = {
  /** معرّفُ العملية بالطابور (وهو معرّفُ الصفّ نفسه بعمليات الإدراج). */
  id: string;
  queued_at: string;
  tries: number;
  /** آخر سببِ رفضٍ من القاعدة — يُعرض بالمعطّلات كي يُفهم لا كي يُخمَّن. */
  last_error?: string;
  /** وقتُ قرار «احذفها» بالمراجعة — بالأرشيف وحده (`outboxDiscarded`). */
  discarded_at?: string;
  /** مرتجعٌ أقدمُ من حارس الإعادة بالخادم (rpc_refs يُمسح بعد ٧ أيام): إعادتُه العمياء قد تكرّره إن
   *  كان وصل وضاع جوابُه — فيُوقف للمراجعة (`needsReview`) ويُسأل الخادمُ عن أثره أوّلاً. */
  stale?: boolean;
  /** وقتُ قرار «ارفعها» على مرتجعٍ متقادم: يُعفيه من التوقيف ٦ أيامٍ وحدها — بعدها مرجعُ تلك
   *  المحاولة نفسِها يُمسح بالخادم، فيُوقف ثانيةً (كان الإعفاءُ أبدياً). */
  reviewed_at?: string;
  /** أوقاتُ محاولات رفع المرتجع: أيٌّ منها قد يكون وصل وضاع جوابُه — والبحثُ عن أثره يغطّيها كلَّها. */
  attempts?: string[];
  /** **هويّةُ من أنشأها.** الطابورُ يعيش بالجهاز لا بالحساب، والجهازُ يتبدّل
   *  عليه أهلُه: كاشيرٌ يخرج وآخرُ يدخل بعيادةٍ ثانية، أو مشغّلُ المنصّة يترك
   *  عيادةً ويدخل غيرها. وبلا ختمٍ كان النداءُ المؤجَّل يُنفَّذ بهويّة الداخل
   *  الجديد: `auth_clinic()` عيادتُه هو، فيهبط مرتجعُ عيادةٍ ومصروفُها بدفتر
   *  عيادةٍ أخرى — والأصليّةُ لا بضاعتَها رجعت ولا قيدَها سُجّل.
   *  والعيادةُ **ما أكّده الخادم** (serverClinic.ts)، أو `UNCONFIRMED` — فتُراجَع ولا تُرفع على ظنّ. */
  who?: { user: string; clinic: string };
};
export type OutboxOp =
  | (OutboxBase & {
      kind: "insert"; table: OutboxTable; row: Record<string, unknown>;
      /** مفتاحُ التصادم حين لا يكون `id`.
       *
       *  إدخالُ اليوم صفٌّ **مفتاحُه طبيعيّ** (الدفعة + التاريخ) لا معرّفٌ
       *  مولودٌ بالجهاز: القاعدةُ تولّد `id` عند أوّل حفظ. فلو رُفع بـ`id`
       *  مولودٍ هنا لاصطدم بالفهرس الفريد على (cycle_id,on_date) وانتهى
       *  بالمعطّلات وهو سليم. فالمفتاحُ يُصرَّح به، والرفعُ **يدمج** لا
       *  يتجاهل: قيمةُ الطابور هي ما كتبه الدكتور بالجملون. */
      conflict?: string;
    })
  | (OutboxBase & { kind: "rpc"; fn: OutboxRpcFn; args: Record<string, unknown> });

const KEY = "vp_outbox_v1";
/** رفُّ المعطّلات: ما رفضته القاعدة مراراً. يبقى حتى يقرّر بشرٌ مصيره. */
const KEY_DEAD = "vp_outbox_dead_v1";
/** أرشيفُ ما خرج من الرفّ بلا رفع: قرارُ بشرٍ بالمراجعة، أو إخلاءُ السقف — بالجهاز، لا محو. */
export const KEY_DISCARDED = "vp_outbox_discarded_v1";
export const DISCARDED_CAP = 200;
/** بعد هذا العدد من الأخطاء **غير الشبكية** تُنقل العملية للمعطّلات كي لا يسدّ
 *  صفٌّ مرفوض من القاعدة طابورَ ما بعده للأبد. */
const MAX_TRIES = 10;
/** سقفُ الرفّ. تجاوزُه ضياعٌ حقيقيّ، فيُصرخ به بالكونسول ولا يمرّ بصمت. */
const DEAD_CAP = 200;

/** الشكل القديم (قبل عمليات الـrpc) كان بلا `kind` — يُقرأ إدراجاً. */
const migrate = (o: unknown): OutboxOp => {
  const r = (o ?? {}) as Record<string, unknown>;
  return (r.kind ? r : { ...r, kind: "insert" }) as OutboxOp;
};

const readList = (key: string): OutboxOp[] => {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
    /* مدخلٌ تالفٌ (null، بلا معرّف) لا يُقرأ عمليةً: كان يُعرض بالمراجعة فيكسر رسمَها كلَّها
     * (لا الباقي يُرفع ولا يُحذف). لا يُمحى من التخزين هنا — يُتجاهل وحدَه. */
    return Array.isArray(arr) ? arr.map(migrate).filter((o) => typeof o.id === "string" && o.id !== "") : [];
  } catch { return []; }
};
const load = () => readList(KEY);
export const outboxDead = (): OutboxOp[] => readList(KEY_DEAD);
export const outboxDiscarded = (): OutboxOp[] => readList(KEY_DISCARDED);

const announce = (ops: OutboxOp[], dead: OutboxOp[], stored: boolean) => {
  try {
    window.dispatchEvent(new CustomEvent("vp-outbox", {
      detail: { count: ops.length, dead: dead.length, stored },
    }));
  } catch { /* بيئة بلا window */ }
};

/** يكتب الطابور ويقول **صدقاً** هل ثبت على القرص. جهازٌ ممتلئ يعني `false` —
 *  ولا يجوز لمن يناديه أن يُطمئن المستخدم بعدها. */
const save = (ops: OutboxOp[], dead?: OutboxOp[]): boolean => {
  let stored = true;
  try { localStorage.setItem(KEY, JSON.stringify(ops)); }
  catch (e) { stored = false; console.error("[outbox] device storage refused:", e); }
  if (dead) {
    try { localStorage.setItem(KEY_DEAD, JSON.stringify(dead)); }
    catch (e) { stored = false; console.error("[outbox] shelf write failed:", e); }
  }
  announce(ops, dead ?? outboxDead(), stored);
  return stored;
};

export const outboxCount = (): number => load().length;
export const outboxDeadCount = (): number => outboxDead().length;

/** فشلُ شبكةٍ (لم يصل الخادم، أو انقطع قبل الجواب) — يستحق الطابور لا الرفض. */
export const isNetworkError = (e: unknown): boolean => {
  if (e instanceof TypeError) return true;
  const m = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return /failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout|timed out|aborted|err_network|err_internet/.test(m);
};

const schedule = () => { setTimeout(() => { void flushOutbox(); }, 4000); };

/** مَن الداخل — **من جلسة Supabase المحفوظة**، وهي الهويّةُ التي يُرسل بها كلُّ طلبٍ فعلاً
 *  (`auth.uid()` بالخادم). بالنسخة التجريبية: `vp_session`.
 *
 *  كان يُقرأ من `vp_session` وحدها، والنسخةُ السحابيّة لا تكتبها أبداً (يكتبها الدخولُ
 *  التجريبيّ وحده — مقيس ١٣/١٠). فمن ٦/٩ (62a063ba) كلُّ عمليةٍ بالإنتاج خُتمت «بلا أحد»، وأوّلُ جولةٍ
 *  نقلتها للمعطّلات («queued by an older version»)، و«استأنف» ختمها بلا أحدٍ ثانيةً: منتجٌ
 *  ومصروفٌ ومرتجعٌ قيل عنها «تنحفظ لاحقاً» ولم تصل الخادمَ قطّ. والفحصُ لم يرَه لأن قالبَه
 *  يكتب `vp_session` بيده — فصار يفحص الحالَ السحابيّ بلا `vp_session`. */
const sessionUser = (): string | null => {
  try {
    if (supabase) {
      /* مفتاحُ الجلسة من العميل نفسه (`sb-<المشروع>-auth-token` افتراضاً)، وإن غاب
       * الحقلُ بنسخةٍ لاحقة فبالبحث عن نفس الشكل — لا رجوعَ صامتٌ إلى «لا أحد».
       * (و`userStorage` المنفصل غيرُ مستعمل: الحسابُ داخل الجلسة نفسها.) */
      const named = (supabase.auth as unknown as { storageKey?: unknown }).storageKey;
      const keys: string[] = typeof named === "string" ? [named] : [];
      if (!keys.length) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && /^sb-.+-auth-token$/.test(k)) keys.push(k);
        }
      }
      for (const k of keys) {
        const s = JSON.parse(localStorage.getItem(k) || "null") as { user?: { id?: unknown } } | null;
        if (typeof s?.user?.id === "string" && s.user.id) return s.user.id;
      }
      return null;
    }
    const d = JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { id?: string } } | null;
    return d?.raw?.id || null;
  } catch { return null; }
};

/** عيادةٌ لم يؤكّدها الخادمُ لهذا الحساب بعد. */
export const UNCONFIRMED = "?";
/** هويّةُ هذه اللحظة: مَن الداخل، وبأيّ عيادةٍ **قال الخادم** إنه يعمل (serverClinic.ts). كانت
 *  مفتاحَ العيادة المحلّيّ، و"default" فيه «عيادتي» و«لم يُحسم» معاً — فرُفع ما كُتب بعيادة زبونٍ
 *  بعيادة المشغّل. غيابُ الجلسة يعني «لا أحد» — ولا نرفع شيئاً باسم لا أحد. */
const whoNow = (): { user: string; clinic: string } | null => {
  const user = sessionUser();
  return user ? { user, clinic: confirmedClinic(user) ?? UNCONFIRMED } : null;
};
const sameWho = (a: OutboxOp["who"], b: { user: string; clinic: string } | null): boolean =>
  !!a && !!b && a.user === b.user && a.clinic === b.clinic;

/** خزّن إدراجاً فشل شبكياً. يُرجع `false` لو ما ثبت — فارمِ الخطأ الأصلي حينها. */
export function outboxEnqueue(
  table: OutboxTable,
  row: Record<string, unknown> & { id?: string },
  opts?: { id: string; conflict: string },
): boolean {
  /* بمفتاحٍ طبيعيٍّ يُفصل معرّفُ **العملية** عن حمولة الصفّ: كان يُؤخذ من
   * `row.id`، فكان معرّفُ الطابور (`poultry_daily:<دفعة>:<تاريخ>`) يُرفع
   * بعمود `id` ويرفضه بوستغريس — نصٌّ ليس uuid — فتنتهي عمليةٌ سليمةٌ
   * بالمعطّلات. الصفُّ يُرفع كما هو، والقاعدةُ تولّد معرّفَه. */
  const conflict = opts?.conflict;
  const opId = opts?.id ?? (row.id as string);
  const ops = load();
  /* بمفتاحٍ طبيعيٍّ **نستبدل** الموجود: الدكتور قد يصحّح رقمَ اليوم وهو بلا
   * نت، فالمكتوبُ أخيراً هو الصحيح. وبـ`id` نُبقي الأوّلَ كما كان — هناك
   * الثاني تكرارُ نفسِ الصفّ لا تصحيحُه. */
  const at = ops.findIndex((o) => o.id === opId);
  if (at >= 0 && !conflict) return true;
  const op: OutboxOp = { kind: "insert", id: opId, table, row, conflict, queued_at: new Date().toISOString(), tries: 0, who: whoNow() ?? undefined };
  if (at >= 0) ops[at] = op; else ops.push(op);
  const stored = save(ops);
  if (stored) schedule();
  return stored;
}

/** أسقط عمليةً من الطابور — يناديها من نجحت كتابتُه أونلاين على نفس المفتاح،
 *  فلا تعود نسخةٌ قديمةٌ بعد دقائقَ لتدهس ما حُفظ بعدها. */
/** يشيل عمليةً من الطابور. يرجع هل كانت فيه — فالحذفُ يعرف أنّ صفّاً لم يصل القاعدةَ بعد. */
export function outboxDrop(id: string): boolean {
  const ops = load();
  const dead = outboxDead();
  const inQueue = ops.some((o) => o.id === id);
  /* ونسخةٌ بالرفّ بنفس المفتاح تُشال كذلك: ما حُفظ أونلاين بعدها أحدثُ منها، و«ارفعها» عليها
   * بالمراجعة كان سيدهسه (إدخالُ يومٍ صُحّح يدوياً — تدقيق ١٣/١٠). */
  const onShelf = dead.some((d) => d.id === id);
  if (!inQueue && !onShelf) return false;
  save(ops.filter((o) => o.id !== id), onShelf ? dead.filter((d) => d.id !== id) : undefined);
  return true;
}

/** خزّن نداءَ دالّةٍ فشل شبكياً. المرجع شرطٌ لا نصيحة: بدونه تكون الإعادة
 *  ازدواجاً، فنرفض الحفظ ونترك الخطأ الأصلي يظهر للمستخدم. */
export function outboxEnqueueRpc(fn: OutboxRpcFn, args: Record<string, unknown>): boolean {
  const ref = typeof args.p_meta === "object" && args.p_meta !== null
    ? (args.p_meta as Record<string, unknown>).client_ref
    : null;
  if (typeof ref !== "string" || !ref.trim()) {
    console.error(`[outbox] ${fn} not queued: no client_ref`);
    return false;
  }
  const ops = load();
  const id = `${fn}:${ref}`;
  if (ops.some((o) => o.id === id)) return true;
  ops.push({ kind: "rpc", id, fn, args, queued_at: new Date().toISOString(), tries: 0, who: whoNow() ?? undefined });
  const stored = save(ops);
  if (stored) schedule();
  return stored;
}

let flushing = false;

type Locks = { request: (n: string, o: { ifAvailable?: boolean; signal?: AbortSignal }, f: (l: unknown) => Promise<unknown>) => Promise<unknown> };
const navLocks = (): Locks | undefined => {
  const l = (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks;
  return typeof l?.request === "function" ? l : undefined;
};
/** كتابةٌ على مفتاح عمليةٍ بالطابور **لا تتقاطع مع رفعها** — بأيّ تبويب (`navigator.locks`).
 *  الرفعُ يمسكه طولَ الإرسال، والكتابةُ أونلاين على نفس المفتاح (حذفُ سحبٍ لم يصل، حفظُ يومٍ مصحَّح)
 *  تنتظره: كان الحذفُ يجري والإدراجُ طائرٌ بشبكةٍ متعثّرة — صفرُ صفوف، و`outboxDrop` يقول «كانت
 *  بالطابور»، فيُقال «انحذف» ثم يصل الإدراجُ ويرجع السحبُ ويُحسب مرّتين (تدقيقٌ عدائيّ ثالث ١٣/١٠).
 *  وانتظارٌ يطول (طلبٌ عالقٌ بلا مهلة) يُرمى فشلَ شبكة بعد ١٠ ثوانٍ: «أعد المحاولة» لا «تمّ». */
export async function outboxExclusive<T>(id: string, f: () => Promise<T>): Promise<T> {
  const l = navLocks();
  if (!l) return f();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  let held = false;
  try {
    return (await l.request(`vp-outbox-op:${id}`, { signal: ac.signal }, () => { held = true; clearTimeout(timer); return f(); })) as T;
  } catch (e) {
    if (!held) throw new TypeError("outbox busy: timed out");
    throw e;
  } finally { clearTimeout(timer); }
}

/** نسخةُ العملية نفسُها؟ — إدخالُ يومٍ يُستبدل بنفس المفتاح (آخرُ ما كُتب)، فالمعرّفُ وحده لا يكفي. */
const sameVersion = (a: OutboxOp, b: OutboxOp): boolean =>
  a.id === b.id && a.queued_at === b.queued_at
  && JSON.stringify(a.kind === "rpc" ? a.args : a.row) === JSON.stringify(b.kind === "rpc" ? b.args : b.row);

/** انقل عمليةً للرفّ — على ما بالتخزين **الآن** لا على لقطةٍ قديمة. **الرفُّ أوّلاً**: إن لم يثبت
 *  (جهازٌ ممتلئ) تبقى بالطابور (`false`) — كانت تُشال من الطابور ثم يفشل الرفُّ فتضيع من الاثنين.
 *  وفي القائمتين لحظةً لا يضرّ: المعرّفُ واحد. والسقفُ يُخلي أقدمَ **المرفوضة** وحدها — ما يحتاج
 *  مراجعةَ بشرٍ لا يُرمى بلا بشر. */
const shelve = (op: OutboxOp): boolean => {
  let dead = [...outboxDead().filter((d) => d.id !== op.id), op];
  if (dead.length > DEAD_CAP) {
    // أقدمُ المرفوضة تخرج **للأرشيف** لا للعدم؛ وإن لم يثبت الأرشيفُ يبقى الرفُّ فوق سقفه.
    const evicted = dead.filter((d) => d.id !== op.id && !needsReview(d)).slice(0, dead.length - DEAD_CAP);
    if (evicted.length) {
      try {
        const at = new Date().toISOString();
        localStorage.setItem(KEY_DISCARDED, JSON.stringify([...outboxDiscarded(), ...evicted.map((d) => ({ ...d, discarded_at: at }))].slice(-DISCARDED_CAP)));
        dead = dead.filter((d) => !evicted.includes(d));
        console.error("[outbox] shelf full, archived:", evicted.map((d) => d.id));
      } catch { /* الأرشيفُ لم يثبت: لا إخلاء */ }
    }
  }
  try { localStorage.setItem(KEY_DEAD, JSON.stringify(dead)); }
  catch (e) { console.error("[outbox] shelf write failed:", e); return false; }
  // لم يصغر الطابور؟ في القائمتين لحظةً — لا ضرر، المعرّفُ واحد.
  try { localStorage.setItem(KEY, JSON.stringify(load().filter((o) => o.id !== op.id))); } catch { /* */ }
  announce(load(), outboxDead(), true);
  return true;
};

/** المرتجعُ يُعاد بأمانٍ بمرجعه ما دام مرجعُه بالخادم — ويُمسح بعد ٧ أيام (purge_rpc_refs). */
const STALE_RETURN_MS = 6 * 24 * 3600_000;
const age = (iso?: string): number => (iso && Number.isFinite(Date.parse(iso)) ? Date.now() - Date.parse(iso) : Infinity);
const staleReturn = (op: OutboxOp): boolean =>
  op.kind === "rpc" && op.fn === "retail_return" && age(op.queued_at) > STALE_RETURN_MS && !(age(op.reviewed_at) < STALE_RETURN_MS);

/** رفضٌ عابرٌ لا دائم: انتهاءُ الجلسة (تتجدّد)، وبوّابةٌ أو قاعدةٌ معطّلة (5xx، ومنها 520 وPGRST001/2)،
 *  وتقييدُ معدّل — لا يُحتسب على العملية. **بالحالة**: نصُّ البوّابة يتبدّل بين الطبقات (كان قائمةَ
 *  نصوصٍ تفوتها «upstream said no»)؛ والنصُّ لما يصل بلا حالة (الجلسة، PGRST00x). */
const transientReject = (e: unknown): boolean => {
  const st = Number((e as { status?: unknown })?.status);
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return st === 401 || st === 408 || st === 429 || st >= 500
    || /jwt expired|invalid jwt|PGRST00[12]/i.test(msg);
};
const fail = (r: { status?: number; error: { message: string; code?: string } }) =>
  Object.assign(new Error(r.error.message), { status: r.status, code: r.error.code });

async function send(sb: NonNullable<typeof supabase>, op: OutboxOp): Promise<void> {
  if (op.kind === "rpc") {
    // آمنةُ الإعادة بمرجعها: نداءٌ ثانٍ بنفس المرجع يُرجع نتيجة الأول.
    const r = await sb.rpc(op.fn, op.args as never);
    if (r.error) throw fail(r);
    return;
  }
  // upsert بتجاهل التكرار: لو الطلب الأصلي كان وصل فعلاً، لا ازدواج.
  /* بمفتاحٍ طبيعيٍّ ندمج (`ignoreDuplicates: false`): الصفُّ موجودٌ
   * بالضرورة أحياناً — يومٌ أُدخل جزئياً ثم أُكمل بلا نت — وتجاهلُه
   * يعني أنّ ما كتبه بالجملون لا يصل أبداً. وبـ`id` نتجاهل كما كان:
   * هناك وجودُ الصفّ يعني أنّ الطلبَ الأوّل وصل فعلاً.
   * وما أُعيد من المراجعة يدمج كذلك — بعد أن رأى المديرُ يومَ الخادم بجانبه (OutboxReview).
   * كان «لا يدمج» فيصير `DO NOTHING` صامتاً: تصحيحُ اليوم يضيع ويُقال «ارتفعت». */
  const conflict = op.conflict ?? "id";
  const r = await sb.from(op.table).upsert(op.row as never, { onConflict: conflict, ignoreDuplicates: conflict === "id" });
  if (r.error) throw fail(r);
}

/** ارفع الطابور بالترتيب: نجاحٌ يُسقط العملية، فشلُ شبكةٍ يوقف الجولة (سنعود)،
 *  وخطأٌ دائم يُحتسب على العملية حتى تنتقل للمعطّلات بعد MAX_TRIES.
 *
 *  **كلُّ خطوةٍ تقرأ التخزينَ من جديد وتكتب تغييرَ عمليتها وحدها.** الجولةُ تنتظر الشبكة،
 *  وفي أثنائها يُضاف للطابور (حفظٌ بلا نت) ويُسحب منه (حذفُ ما لم يصل) ويُعاد إليه (المراجعة).
 *  كانت تكتب لقطةَ أوّل الجولة فوق ذلك كلّه — فيضيع المضاف ويرجع المسحوب ويُرفع (تدقيق ١٣/١٠).
 *  ولم يظهر بالإنتاج لأن الختمَ الفارغ نقل كلَّ عمليةٍ للرفّ بلا انتظار شبكة.
 *
 *  و**الخادمُ يُسأل قبل كلّ عملية** (`my_workspace`): العمليةُ تُرفع حيث يوجّهها `auth_clinic()`،
 *  وهو يتبدّل من بعيد (جلسةُ مشغّلٍ انتهت ساعاتُها الاثنتا عشرة والصفحةُ مفتوحة، مديرٌ أزال موظّفاً)
 *  — فما خُتم بعيادةٍ غيرِ التي يقولها الخادمُ الآن ينتظر: يتأخّر ولا ينحرف. وتبويبان لا يرفعان معاً
 *  (`navigator.locks`) — كان العدّادُ يُحسب مرّتين والإدراجُ يتسابق. */
export async function flushOutbox(): Promise<{ sent: number; left: number; dead: number }> {
  const idle = () => ({ sent: 0, left: outboxCount(), dead: outboxDeadCount() });
  const locks = (globalThis as { navigator?: { locks?: { request?: (n: string, o: { ifAvailable: boolean }, f: (l: unknown) => Promise<unknown>) => Promise<unknown> } } }).navigator?.locks;
  if (typeof locks?.request === "function") {
    return (await locks.request("vp-outbox-flush", { ifAvailable: true }, async (lock) => (lock ? runFlush() : idle()))) as { sent: number; left: number; dead: number };
  }
  return runFlush();
}

async function runFlush(): Promise<{ sent: number; left: number; dead: number }> {
  const sb = supabase;
  if (!sb || flushing) return { sent: 0, left: outboxCount(), dead: outboxDeadCount() };
  if (load().length === 0) return { sent: 0, left: 0, dead: outboxDeadCount() };
  flushing = true;
  let sent = 0;
  /* عيادةُ الخادم **قبل كلّ عملية** (لا مرّةً للجولة): الجولةُ على شبكةٍ بطيئة تطول دقائق، وجلسةُ
   * المشغّل تنتهي أو يدخل عيادةً أخرى بتبويبٍ ثانٍ في أثنائها. تعذّرُ السؤال = لا رفعَ على ظنّ. */
  const askServer = async (): Promise<string | null> => {
    const w = await sb.rpc("my_workspace");
    if (w.error) throw fail(w);
    const c = (w.data as { clinic_id?: unknown } | null)?.clinic_id;
    return typeof c === "string" && c ? c : null;
  };
  try {
    for (const id of load().map((o) => o.id)) {
      const op = load().find((o) => o.id === id);
      if (!op) continue;   // سُحب قبل دوره (حُذف، أو نجح أونلاين بنفس المفتاح)
      /* الهويّةُ **قبل كلّ عملية** كذلك: كانت تُقرأ مرّةً للجولة، وطلبٌ عالقٌ بشبكةٍ متعثّرة يمتدّ
       * والكاشيرُ يخرج بتبويبٍ ثانٍ ويدخل غيرُه — وكلُّ طلبٍ يحمل جلسةَ التخزين الآن، فرُفع سحبُ الأوّل
       * باسم الثاني (تدقيقٌ عدائيّ ١٣/١٠). ما لم يُختم بها يبقى بالطابور بلا محاولة — ينتظر أهلَه. */
      const now = whoNow();
      if (!op.who || (op.who.clinic === UNCONFIRMED && op.who.user === now?.user)) {
        /* بلا ختم (نسخةٌ أقدم، أو بلا جلسة) أو بلا عيادةٍ مؤكَّدة: لا نعرف لمن هي فلا نرفعها على
         * ظنّ. تُنقل للرفّ بحمولتها، وتُراجَع بصفحة /outbox وحدةً وحدة — وسببُها حالُها (`needsReview`)
         * تقوله الصفحةُ بلغة العيادة، لا نصٌّ إنكليزيّ بالحمولة. */
        shelve(op);
        continue;
      }
      if (!sameWho(op.who, now)) continue;   // تنتظر أهلَها (الشارةُ تعدّها: «حساب ثاني»)
      if (staleReturn(op)) {
        shelve({ ...op, stale: true });
        continue;
      }
      let serverClinic: string | null;
      try { serverClinic = await askServer(); }
      catch (e) { if (isNetworkError(e) || transientReject(e)) break; serverClinic = null; }
      // الختمُ عيادةُ الخادم المؤكَّدة نفسُها — تُقارَن كما هي، بلا ترجمة.
      if (!serverClinic || op.who.clinic !== serverClinic) continue;
      let gone = false;
      try {
        // الفحصُ الأخير والإرسالُ تحت قفل العملية: لا حذفَ ولا حفظَ أونلاين على مفتاحها بينهما.
        await outboxExclusive(id, async () => {
          // سُحبت أو تبدّلت أثناء السؤال (حذفُ سحبٍ لم يصل، يومٌ صُحّح)، أو تبدّل الداخل: لا تُرفع.
          if (!load().some((o) => sameVersion(o, op)) || !sameWho(op.who, whoNow())) { gone = true; return; }
          if (op.kind === "rpc" && op.fn === "retail_return") {
            // كلُّ محاولةٍ قد تصل ويضيع جوابُها — وقتُها يُحفظ قبلها ليُبحث عن أثرها عنده (OutboxReview).
            const at = new Date().toISOString();
            save(load().map((o) => (o.id === id && sameVersion(o, op) ? { ...o, attempts: [...(o.attempts ?? []), at].slice(-20) } : o)));
          }
          await send(sb, op);
          /* نجحت: تُشال **هذه النسخة** وحدها — نسخةٌ أحدث بنفس المفتاح (يومٌ صُحّح أثناء الطلب)
           * تبقى وتُرفع بدورها. وتحت القفل: حذفٌ ينتظره يجد الصفَّ بالقاعدة لا بالطابور. */
          save(load().filter((o) => !sameVersion(o, op)));
        });
      } catch (e) {
        if (isNetworkError(e)) break; // النت بعده واگع — نعود بالجولة الجاية
        const msg = e instanceof Error ? e.message : String(e ?? "");
        if (transientReject(e)) break;   // الجلسةُ تتجدّد أو البوّابةُ تعود — لا يُحتسب
        const cur = load().find((o) => o.id === id);
        // تبدّلت أثناء الطلب (صُحّحت أو سُحبت): النسخةُ الجديدة تُجرَّب بدورها، والمسحوبةُ انتهت.
        if (!cur || !sameVersion(cur, op)) continue;
        const next = { ...cur, tries: cur.tries + 1, last_error: msg };
        const keep = () => save(load().map((o) => (o.id === id && sameVersion(o, cur) ? next : o)));
        if (next.tries >= MAX_TRIES) {
          // لا تُحذف: تُنقل بحمولتها وسببها إلى رفٍّ يراه صاحب العيادة (وإن لم يثبت الرفُّ تبقى).
          if (shelve(next)) console.error("[outbox] moved to dead letters:", op.id, msg);
          else keep();
        } else {
          keep();
        }
        continue;
      }
      if (gone) continue;
      sent++;
    }
  } finally {
    flushing = false;
  }
  return { sent, left: outboxCount(), dead: outboxDeadCount() };
}

/* ── الرفُّ والمراجعة (قرارُ المالك ١٣/١٠) ───────────────────────────────────────────
 * من ٦/٩ إلى ١٣/١٠ كان الختمُ يقرأ ما لا تكتبه النسخةُ السحابيّة، فكلُّ عمليةٍ فشلت شبكياً
 * خُتمت «بلا أحد» ونُقلت للرفّ، و«استأنف» لم يُحيِها. والعيادةُ رأتها «متعثّرة» — فربما أدخلتها
 * بيدها بعدها. فرفعُها الأعمى بضغطةٍ يكرّر (مرتجعٌ مرّتين، سحبٌ مرّتين)، وتركُها يُضيّعها.
 * فلا شيءَ من الرفّ يُرفع بلا أن يرى بشرٌ تفاصيلَه ويختار — بصفحة /outbox (OutboxReview):
 *   • بلا ختم (`needsReview`): «ارفعها» تختمها بمن قرّر، أو «احذفها».
 *   • مختومةٌ رفضتها القاعدةُ مراراً: سببُها ظاهر، و«أعد المحاولة» أو «احذفها» — كانت الشارةُ
 *     تعيدها بضغطةٍ عمياء، ومرفوضةٌ أبداً (توأمُ اسم) كانت تدور بلا مخرج. */
export const needsReview = (op: OutboxOp): boolean => !op.who || op.who.clinic === UNCONFIRMED || !!op.stale;
/** ما بالرفّ وينتظر قرارَ بشر (الشارةُ تعدّه — وما سواه بـ`outboxShelf.ts` مع الصفحة). */
export const outboxReviewList = (): OutboxOp[] => outboxDead().filter(needsReview);
/** بالطابور ومختومةٌ بحسابٍ أو عيادةٍ غيرِ الحاليّة: تنتظر أهلَها (لا تُرفع باسم غيرهم). */
export const outboxWaitingOthers = (): OutboxOp[] => {
  const now = whoNow();
  return load().filter((o) => !!o.who && !sameWho(o.who, now));
};

/** ما تحتاجه عملياتُ المراجعة (`outboxShelf.ts`، تُحمَّل مع صفحة /outbox وحدها — لا بحزمة الإقلاع). */
export const outboxInternals = { load, whoNow, sameWho, sameVersion, announce, schedule, KEY, KEY_DEAD };

let started = false;
/** يُستدعى مرة عند إقلاع التطبيق: رفعٌ فوري + عند عودة النت + كل ٣٠ ثانية. */
export function startOutbox(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  setTimeout(() => { void flushOutbox(); }, 3000);
  window.addEventListener("online", () => { void flushOutbox(); });
  setInterval(() => { if (outboxCount() > 0) void flushOutbox(); }, 30_000);
}
