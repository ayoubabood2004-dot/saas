import { SYSTEM_EXPENSE_TEXT } from "./expenseCategoryRules";

/* ============================================================================
 * أثرُ مرتجعٍ عالقٍ بالخادم (صفحةُ /outbox) — كسولةٌ معها، لا بحزمة الإقلاع.
 *
 * مرجعُ إعادة المرتجع (rpc_refs) يُمسح بعد ٧ أيام، فأثرُه الباقي سطورُ «مرتجع» التي كتبها
 * retail_return (0136): سطرٌ لكلّ مادّةٍ كميّتُها ومبلغُها فوق الصفر، **ونصُّه مبنيٌّ من الحمولة كلّها**:
 *   'راجع: ' || coalesce(nullif(btrim(name),''),'صنف')
 *     || (كميةٌ ≠ ١ ? ' × ' || الكميةُ بلا أصفارٍ زائدة : '')
 *     || (زبون ? ' — ' || الزبون : '') || (ملاحظة ? ' (' || الملاحظة || ')' : '')
 * والكميةُ numeric(14,3) والسعرُ numeric(14,2) — يُقرَّبان **قبل** الضرب. فالمطابقةُ النصُّ كلُّه
 * والمبلغ: كانت بادئةَ الاسم وحدها، فمرتجعُ زبونٍ آخر لنفس المادّة والمبلغ بعده بأيّام قيل عنه
 * «وصلت للخادم — الأسلم تحذفها» (تدقيقٌ عدائيّ ١٣/١٠)، والحذفُ يُسقط ردَّ مالٍ ومخزونٍ حقيقيّ.
 *
 * والوقتُ **مدّةٌ لا لحظة** (`TraceSpan`): من الحفظ إلى آخر محاولة — أيُّ محاولةٍ قد تصل ويضيع
 * جوابُها. وحولَها هامشٌ واسع: ساعةُ الجهاز قد تنحرف عن ساعة الخادم.
 * ==========================================================================*/
export const RETURN_TRACE_WINDOW_MS = 12 * 3600_000;
const PREFIX = "\u0631\u0627\u062c\u0639: ";   // the server's "returned: " prefix
const NO_NAME = "\u0635\u0646\u0641";            // the server's name for a nameless line ("item")

export interface TraceSpan { from: string; to: string }
/** سطرُ «مرتجع» كما يكتبه الخادمُ لهذه الحمولة. */
export interface ReturnLine { desc: string; amount: number }
type TraceRow = { id?: string; category?: string | null; spent_at: string; description?: string | null; amount?: number | string | null };

/** btrim بوستغريس: المسافاتُ وحدها، لا كلُّ فراغ. */
const btrim = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").replace(/^ +| +$/g, "");
const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
};
/** تقريبُ numeric(p,s): النصفُ بعيداً عن الصفر (والقيمُ هنا موجبة). */
const round = (x: number, d: number): number => { const f = 10 ** d; return Math.round(x * f + 1e-9) / f; };

/** السطورُ التي كان retail_return سيكتبها لهذه الحمولة — نصّاً ومبلغاً. */
export function expectedReturnRows(args: unknown): ReturnLine[] {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const meta = (a.p_meta && typeof a.p_meta === "object" ? a.p_meta : {}) as Record<string, unknown>;
  const who = btrim(meta.customer_name), note = btrim(meta.note);
  const out: ReturnLine[] = [];
  for (const it of Array.isArray(a.p_items) ? a.p_items : []) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const qty = round(Math.abs(num(r.qty)), 3);
    if (qty === 0) continue;
    const amount = round(qty * round(Math.abs(num(r.unit_price)), 2), 2);
    if (!(amount > 0)) continue;
    const q = qty === 1 ? "" : ` × ${qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
    out.push({ desc: PREFIX + (btrim(r.name) || NO_NAME) + q + (who ? ` — ${who}` : "") + (note ? ` (${note})` : ""), amount });
  }
  return out;
}

/** بُعدُ لحظةٍ عن المدّة (صفرٌ داخلها)، أو NaN إن تعذّر حسابُه. */
const spanGap = (ms: number, span: TraceSpan): number => {
  const a = Date.parse(span.from), b = Math.max(a, Date.parse(span.to));
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(ms)) return NaN;
  return ms < a ? a - ms : ms > b ? ms - b : 0;
};
/** حدودُ السؤال: المدّةُ وهامشُها — أو null إن تعذّرت (لا «ما لكينا» عن سؤالٍ لم يُسأل). */
export function traceBounds(span: TraceSpan): { from: string; to: string } | null {
  const a = Date.parse(span.from), b = Date.parse(span.to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { from: new Date(a - RETURN_TRACE_WINDOW_MS).toISOString(), to: new Date(Math.max(a, b) + RETURN_TRACE_WINDOW_MS).toISOString() };
}
export function returnLineMatches(row: TraceRow, span: TraceSpan, line: ReturnLine): boolean {
  if (!(spanGap(Date.parse(row.spent_at), span) <= RETURN_TRACE_WINDOW_MS)) return false;
  if (row.category !== SYSTEM_EXPENSE_TEXT.returns) return false;
  return (row.description ?? "") === line.desc && Math.abs(Number(row.amount ?? NaN) - line.amount) < 0.005;
}
/** سطورُ الخادم المطابقةُ لكلّ سطور المرتجع (لكلٍّ أقربُ سطرٍ لم يُستعمل)، أو [] إن نقص واحد —
 *  نصفُ تطابقٍ ليس أثراً. */
export function matchReturnRows<T extends TraceRow>(rows: T[], span: TraceSpan, lines: ReturnLine[]): T[] {
  if (!lines.length) return [];
  const used = new Set<T>();
  const out: T[] = [];
  for (const l of lines) {
    const hit = rows.filter((r) => !used.has(r) && returnLineMatches(r, span, l))
      .sort((a, b) => spanGap(Date.parse(a.spent_at), span) - spanGap(Date.parse(b.spent_at), span))[0];
    if (!hit) return [];
    used.add(hit); out.push(hit);
  }
  return out;
}
