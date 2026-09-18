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
  /** **هويّةُ من أنشأها.** الطابورُ يعيش بالجهاز لا بالحساب، والجهازُ يتبدّل
   *  عليه أهلُه: كاشيرٌ يخرج وآخرُ يدخل بعيادةٍ ثانية، أو مشغّلُ المنصّة يترك
   *  عيادةً ويدخل غيرها. وبلا ختمٍ كان النداءُ المؤجَّل يُنفَّذ بهويّة الداخل
   *  الجديد: `auth_clinic()` عيادتُه هو، فيهبط مرتجعُ عيادةٍ ومصروفُها بدفتر
   *  عيادةٍ أخرى — والأصليّةُ لا بضاعتَها رجعت ولا قيدَها سُجّل. */
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
    return Array.isArray(arr) ? arr.map(migrate) : [];
  } catch { return []; }
};
const load = () => readList(KEY);
export const outboxDead = (): OutboxOp[] => readList(KEY_DEAD);

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
  catch (e) { stored = false; console.error("[outbox] device storage refused the write — queue is in memory only:", e); }
  if (dead) {
    try { localStorage.setItem(KEY_DEAD, JSON.stringify(dead)); }
    catch (e) { stored = false; console.error("[outbox] dead-letter shelf did not persist:", e); }
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

/** هويّةُ هذه اللحظة: مَن الداخل، وبأيّ عيادةٍ يعمل. تُقرأ من التخزين مباشرةً
 *  (بلا استيراد) كي لا يصير الطابورُ عقدةً بحلقةِ استيراد. غيابُها يعني «لا
 *  أحد» — ولا نرفع شيئاً باسم لا أحد. */
const whoNow = (): { user: string; clinic: string } | null => {
  try {
    const s = JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { id?: string } } | null;
    const user = s?.raw?.id;
    if (!user) return null;
    return { user, clinic: localStorage.getItem("vp_active_clinic") || "default" };
  } catch { return null; }
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
export function outboxDrop(id: string): void {
  const ops = load();
  if (!ops.some((o) => o.id === id)) return;
  save(ops.filter((o) => o.id !== id));
}

/** خزّن نداءَ دالّةٍ فشل شبكياً. المرجع شرطٌ لا نصيحة: بدونه تكون الإعادة
 *  ازدواجاً، فنرفض الحفظ ونترك الخطأ الأصلي يظهر للمستخدم. */
export function outboxEnqueueRpc(fn: OutboxRpcFn, args: Record<string, unknown>): boolean {
  const ref = typeof args.p_meta === "object" && args.p_meta !== null
    ? (args.p_meta as Record<string, unknown>).client_ref
    : null;
  if (typeof ref !== "string" || !ref.trim()) {
    console.error(`[outbox] refused to queue ${fn}: without a client_ref a retry would duplicate it.`);
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
/** ارفع الطابور بالترتيب: نجاحٌ يُسقط العملية، فشلُ شبكةٍ يوقف الجولة (سنعود)،
 *  وخطأٌ دائم يُحتسب على العملية حتى تنتقل للمعطّلات بعد MAX_TRIES. */
export async function flushOutbox(): Promise<{ sent: number; left: number; dead: number }> {
  const sb = supabase;
  if (!sb || flushing) return { sent: 0, left: outboxCount(), dead: outboxDeadCount() };
  let ops = load();
  let dead = outboxDead();
  if (ops.length === 0) return { sent: 0, left: 0, dead: dead.length };
  flushing = true;
  let sent = 0;
  /* هويّةُ الجولة تُقرأ مرّةً: ما لم يُختم بها يبقى بالطابور بلا محاولة — لا
   * يُرفع باسم غيره ولا يُحرق عدّادُه فينتهي بالمعطّلات. ينتظر أهلَه. */
  const now = whoNow();
  let skipped = 0;
  try {
    for (const op of [...ops]) {
      if (!op.who) {
        /* عمليةٌ من قبل الختم (نسخةٌ أقدم): لا نعرف صاحبَها فلا نرفعها باسم
         * أحد. تُنقل للرفّ بحمولتها وسببها، ويقرّر بشرٌ استئنافَها — وهو ما
         * يمنحها هويّتَه صراحةً. لا ضياعَ ولا رفعٌ أعمى. */
        ops = ops.filter((o) => o.id !== op.id);
        dead = [...dead.filter((d) => d.id !== op.id), { ...op, last_error: "queued by an older version — resume it to send it under your account" }];
        save(ops, dead);
        continue;
      }
      if (!sameWho(op.who, now)) { skipped++; continue; }
      try {
        if (op.kind === "rpc") {
          // آمنةُ الإعادة بمرجعها: نداءٌ ثانٍ بنفس المرجع يُرجع نتيجة الأول.
          const r = await sb.rpc(op.fn, op.args as never);
          if (r.error) throw new Error(r.error.message);
        } else {
          // upsert بتجاهل التكرار: لو الطلب الأصلي كان وصل فعلاً، لا ازدواج.
          /* بمفتاحٍ طبيعيٍّ ندمج (`ignoreDuplicates: false`): الصفُّ موجودٌ
           * بالضرورة أحياناً — يومٌ أُدخل جزئياً ثم أُكمل بلا نت — وتجاهلُه
           * يعني أنّ ما كتبه بالجملون لا يصل أبداً. وبـ`id` نتجاهل كما كان:
           * هناك وجودُ الصفّ يعني أنّ الطلبَ الأوّل وصل فعلاً. */
          const conflict = op.conflict ?? "id";
          const r = await sb.from(op.table).upsert(op.row as never, { onConflict: conflict, ignoreDuplicates: conflict === "id" });
          if (r.error) throw new Error(r.error.message);
        }
        ops = ops.filter((o) => o.id !== op.id);
        save(ops);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break; // النت بعده واگع — نعود بالجولة الجاية
        op.tries += 1;
        op.last_error = e instanceof Error ? e.message : String(e ?? "");
        if (op.tries >= MAX_TRIES) {
          // لا تُحذف: تُنقل بحمولتها وسببها إلى رفٍّ يراه صاحب العيادة.
          ops = ops.filter((o) => o.id !== op.id);
          dead = [...dead.filter((d) => d.id !== op.id), op];
          if (dead.length > DEAD_CAP) {
            console.error("[outbox] dead-letter shelf is full — the oldest entry was discarded:", dead[0]);
            dead = dead.slice(dead.length - DEAD_CAP);
          }
          console.error("[outbox] moved to dead letters after repeated rejection:", op.id, op.last_error);
        }
        save(ops, dead);
      }
    }
  } finally {
    flushing = false;
  }
  if (skipped > 0) console.warn(`[outbox] ${skipped} op(s) belong to another account/clinic — left queued for them.`);
  return { sent, left: ops.length, dead: dead.length };
}

/** أعِد المعطّلات للطابور بعدّادٍ صفر — بعد أن يُصلَّح سببُ الرفض. */
export function outboxRevive(): number {
  const dead = outboxDead();
  if (dead.length === 0) return 0;
  const ops = load();
  const known = new Set(ops.map((o) => o.id));
  // الاستئنافُ قرارُ بشرٍ حاضر، فيُختم باسمه: عمليةٌ بلا هويّة (من نسخةٍ أقدم)
  // تأخذ هويّةَ من ضغط «استأنف»، ولا تُرفع باسم مجهول.
  const now = whoNow() ?? undefined;
  for (const d of dead) if (!known.has(d.id)) ops.push({ ...d, tries: 0, who: d.who ?? now });
  save(ops, []);
  schedule();
  return dead.length;
}

let started = false;
/** يُستدعى مرة عند إقلاع التطبيق: رفعٌ فوري + عند عودة النت + كل ٣٠ ثانية. */
export function startOutbox(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  setTimeout(() => { void flushOutbox(); }, 3000);
  window.addEventListener("online", () => { void flushOutbox(); });
  setInterval(() => { if (outboxCount() > 0) void flushOutbox(); }, 30_000);
}
