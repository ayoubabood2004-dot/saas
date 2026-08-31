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
export type OutboxTable = "products" | "companies" | "company_sections" | "expenses";
/** الدوالّ التي تعرف `client_ref` فتُعاد بأمان (0136). */
export type OutboxRpcFn = "retail_return";

type OutboxBase = {
  /** معرّفُ العملية بالطابور (وهو معرّفُ الصفّ نفسه بعمليات الإدراج). */
  id: string;
  queued_at: string;
  tries: number;
  /** آخر سببِ رفضٍ من القاعدة — يُعرض بالمعطّلات كي يُفهم لا كي يُخمَّن. */
  last_error?: string;
};
export type OutboxOp =
  | (OutboxBase & { kind: "insert"; table: OutboxTable; row: Record<string, unknown> })
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

/** خزّن إدراجاً فشل شبكياً. يُرجع `false` لو ما ثبت — فارمِ الخطأ الأصلي حينها. */
export function outboxEnqueue(table: OutboxTable, row: Record<string, unknown> & { id: string }): boolean {
  const ops = load();
  if (ops.some((o) => o.id === row.id)) return true;
  ops.push({ kind: "insert", id: row.id, table, row, queued_at: new Date().toISOString(), tries: 0 });
  const stored = save(ops);
  if (stored) schedule();
  return stored;
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
  ops.push({ kind: "rpc", id, fn, args, queued_at: new Date().toISOString(), tries: 0 });
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
  try {
    for (const op of [...ops]) {
      try {
        if (op.kind === "rpc") {
          // آمنةُ الإعادة بمرجعها: نداءٌ ثانٍ بنفس المرجع يُرجع نتيجة الأول.
          const r = await sb.rpc(op.fn, op.args as never);
          if (r.error) throw new Error(r.error.message);
        } else {
          // upsert بتجاهل التكرار: لو الطلب الأصلي كان وصل فعلاً، لا ازدواج.
          const r = await sb.from(op.table).upsert(op.row as never, { onConflict: "id", ignoreDuplicates: true });
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
  return { sent, left: ops.length, dead: dead.length };
}

/** أعِد المعطّلات للطابور بعدّادٍ صفر — بعد أن يُصلَّح سببُ الرفض. */
export function outboxRevive(): number {
  const dead = outboxDead();
  if (dead.length === 0) return 0;
  const ops = load();
  const known = new Set(ops.map((o) => o.id));
  for (const d of dead) if (!known.has(d.id)) ops.push({ ...d, tries: 0 });
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
