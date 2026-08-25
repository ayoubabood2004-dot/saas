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
 * النطاق الحالي: إدراجات المخزون (منتج/شركة/صنف) — أكثر ما اشتكت منه العيادات.
 * ==========================================================================*/
import { supabase } from "./supabase";

export type OutboxOp = {
  /** معرف الصف نفسه (وُلد بالجهاز) — به يصير الرفع متسامحاً مع التكرار. */
  id: string;
  table: "products" | "companies" | "company_sections";
  row: Record<string, unknown>;
  queued_at: string;
  tries: number;
};

const KEY = "vp_outbox_v1";
/** بعد هذا العدد من الأخطاء **غير الشبكية** تُتْرك العملية (بسجلٍّ بالكونسول)
 *  كي لا يسدّ صفٌّ مرفوض من القاعدة طابورَ ما بعده للأبد. */
const MAX_TRIES = 10;

const load = (): OutboxOp[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as OutboxOp[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};
const save = (ops: OutboxOp[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch { /* جهاز ممتلئ — الرفع الفوري يبقى يحاول */ }
  try { window.dispatchEvent(new CustomEvent("vp-outbox", { detail: { count: ops.length } })); } catch { /* بيئة بلا window */ }
};

export const outboxCount = (): number => load().length;

/** فشلُ شبكةٍ (لم يصل الخادم، أو انقطع قبل الجواب) — يستحق الطابور لا الرفض. */
export const isNetworkError = (e: unknown): boolean => {
  if (e instanceof TypeError) return true;
  const m = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return /failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout|timed out|aborted|err_network|err_internet/.test(m);
};

/** خزّن عمليةً فشلت شبكياً — وتُجدول محاولة رفعٍ قريبة تلقائياً. */
export function outboxEnqueue(table: OutboxOp["table"], row: Record<string, unknown> & { id: string }): void {
  const ops = load();
  if (!ops.some((o) => o.id === row.id)) {
    ops.push({ id: row.id, table, row, queued_at: new Date().toISOString(), tries: 0 });
    save(ops);
  }
  setTimeout(() => { void flushOutbox(); }, 4000);
}

let flushing = false;
/** ارفع الطابور بالترتيب: نجاحٌ يُسقط العملية، فشلُ شبكةٍ يوقف الجولة (سنعود)،
 *  وخطأٌ دائم يُحتسب على العملية حتى تُترك بعد MAX_TRIES. */
export async function flushOutbox(): Promise<{ sent: number; left: number }> {
  const sb = supabase;
  if (!sb || flushing) return { sent: 0, left: outboxCount() };
  let ops = load();
  if (ops.length === 0) return { sent: 0, left: 0 };
  flushing = true;
  let sent = 0;
  try {
    for (const op of [...ops]) {
      try {
        // upsert بتجاهل التكرار: لو الطلب الأصلي كان وصل فعلاً، لا ازدواج.
        const r = await sb.from(op.table).upsert(op.row as never, { onConflict: "id", ignoreDuplicates: true });
        if (r.error) throw new Error(r.error.message);
        ops = ops.filter((o) => o.id !== op.id);
        save(ops);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break; // النت بعده واگع — نعود بالجولة الجاية
        op.tries += 1;
        if (op.tries >= MAX_TRIES) {
          console.error("[outbox] dropped after permanent errors:", op.table, op.id, e);
          ops = ops.filter((o) => o.id !== op.id);
        }
        save(ops);
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, left: ops.length };
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
