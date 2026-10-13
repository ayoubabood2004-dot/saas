import { SYSTEM_EXPENSE_TEXT } from "./expenseCategoryRules";

/* ============================================================================
 * أثرُ مرتجعٍ عالقٍ بالخادم (صفحةُ /outbox) — كسولةٌ معها، لا بحزمة الإقلاع.
 *
 * مرجعُ إعادة المرتجع (rpc_refs) يُمسح بعد ٧ أيام، فأثرُه الباقي سطورُ «مرتجع» التي كتبها
 * retail_return (0136): سطرٌ لكلّ مادّةٍ كميّتُها ومبلغُها فوق الصفر، **ونصُّه مبنيٌّ من الحمولة كلّها**:
 *   'راجع: ' || coalesce(nullif(btrim(name),''),'صنف')
 *     || (كميةٌ ≠ ١ ? ' × ' || الكميةُ بلا أصفارٍ زائدة : '')
 *     || (زبون ? ' — ' || الزبون : '') || (ملاحظة ? ' (' || الملاحظة || ')' : '')
 * والكميةُ numeric(14,3) والسعرُ numeric(14,2) — يُقرَّبان **قبل** الضرب، **بحسابٍ عشريٍّ صحيح** (BigInt
 * من نصّ JSON كما يقرؤه numeric): الفاصلةُ العائمة كانت تقرّب ٧٠٦١٦٫٨٧٥ إلى ‎.87‎ والخادمُ ‎.88‎، فيُقال
 * «ما لكينا» عن مرتجعٍ وصل. فالمطابقةُ النصُّ كلُّه والمبلغ: كانت بادئةَ الاسم وحدها، فمرتجعُ زبونٍ آخر
 * لنفس المادّة والمبلغ بعده بأيّام قيل عنه «وصلت للخادم — الأسلم تحذفها» (تدقيقٌ عدائيّ ١٣/١٠).
 *
 * و**النصُّ الكامل لا يكفي وحده للحكم**: مرتجعُ زبونٍ عابرٍ بلا اسمٍ ولا ملاحظة نصُّه «راجع: <المادّة>»
 * لكلّ مرتجعٍ مثله. فـ«وصلت — احذفها» (`found`) لا يُقال إلا لأثرٍ **مميِّز** (زبونٌ أو ملاحظة) **وقريبٍ**
 * من لحظةٍ أُرسل فيها فعلاً؛ وغيرُه «شبيه» (`similar`): يُعرض ليُقارَن بالعين، بلا توصيةٍ بالحذف.
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
/** |القيمة| كما يقرؤها numeric من نصّ JSON، مقرَّبةً لـ`scale` منازل (النصفُ بعيداً عن الصفر) —
 *  عدداً صحيحاً من الأجزاء. ما لا يُقرأ رقماً صفر (الخادمُ كان سيرفض النداءَ كلَّه أصلاً). */
function scaled(v: unknown, scale: number): bigint {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : typeof v === "string" ? v.trim() : "";
  const m = /^[+-]?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m || (!m[1] && !m[2])) return 0n;
  const n = BigInt((m[1] || "") + (m[2] || "") || "0");
  const k = Number(m[3] || 0) - (m[2] || "").length + scale;
  if (Math.abs(k) > 40) return 0n;   // خارج numeric(14,·) — النداءُ كان سيفشل
  if (k >= 0) return n * 10n ** BigInt(k);
  const d = 10n ** BigInt(-k);
  return n / d + (2n * (n % d) >= d ? 1n : 0n);
}

/** السطورُ التي كان retail_return سيكتبها لهذه الحمولة — نصّاً ومبلغاً. */
export function expectedReturnRows(args: unknown): ReturnLine[] {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const meta = (a.p_meta && typeof a.p_meta === "object" ? a.p_meta : {}) as Record<string, unknown>;
  const who = btrim(meta.customer_name), note = btrim(meta.note);
  const out: ReturnLine[] = [];
  for (const it of Array.isArray(a.p_items) ? a.p_items : []) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const qm = scaled(r.qty, 3);                       // v_qty بالألف
    if (qm === 0n) continue;
    const cents = (qm * scaled(r.unit_price, 2) + 500n) / 1000n;   // round(v_qty × v_price، ٢) بالفلس
    if (cents <= 0n) continue;
    const frac = (qm % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
    const q = qm === 1000n ? "" : ` \u00d7 ${qm / 1000n}${frac ? `.${frac}` : ""}`;
    out.push({ desc: PREFIX + (btrim(r.name) || NO_NAME) + q + (who ? ` \u2014 ${who}` : "") + (note ? ` (${note})` : ""), amount: Number(cents) / 100 });
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
  return (row.description ?? "") === line.desc && Math.round(Number(row.amount ?? NaN) * 100) === Math.round(line.amount * 100);
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

/** مرتجعٌ يميّزه نصُّه عن غيره؟ (زبونٌ أو ملاحظة) — بلاهما نصُّه نصُّ كلِّ مرتجعٍ مثله. */
export function returnIsDistinctive(args: unknown): boolean {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const meta = (a.p_meta && typeof a.p_meta === "object" ? a.p_meta : {}) as Record<string, unknown>;
  return !!(btrim(meta.customer_name) || btrim(meta.note));
}
/** حكمُ أثرٍ وُجد: `found` (وصل — الأسلمُ الحذف) لأثرٍ مميِّزٍ كلُّ سطوره قريبةٌ من لحظةٍ أُرسل فيها فعلاً
 *  (`moments`: الحفظ، والمحاولات، وقرارُ المراجعة)؛ وإلا `similar` — يُقارَن بالعين. */
export function traceVerdict(rows: TraceRow[], distinctive: boolean, moments: string[]): "found" | "similar" {
  const near = (r: TraceRow) => moments.some((m) => spanGap(Date.parse(r.spent_at), { from: m, to: m }) <= RETURN_TRACE_WINDOW_MS);
  return distinctive && rows.length > 0 && rows.every(near) ? "found" : "similar";
}
