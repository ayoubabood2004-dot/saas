/* ============================================================================
 * الأرباح والخسائر شهراً بشهر (0256) — الحسابُ النقيّ، مرآةُ `report_pnl` فلساً بفلس.
 *
 * لا تعريفَ جديدَ لأيّ رقم (قرارُ المالك ٢/١١: «ابنيها بالطريقة العادية ولا تغيّر شيء منها»). كلُّ سطرٍ
 * قراءةٌ لما يُسجَّل اليوم بتعريفه القائم:
 *   • المبيعات والكلفة وربحُ المبيعات: فواتيرُ المدّة **بيوم البيع** (created_at) غيرُ المرجّعة — Σ total
 *     وΣ cost_total وΣ profit، كتبويب «المال» بالتقارير حرفاً (AnalyticsHub: invInRange ثمّ status ≠ refunded).
 *   • الكلفةُ مقسومة: المواد المباعة Σ round(qty × unit_cost, 2) لسطور المادّة، ومستهلكاتُ الخدمات Σ value
 *     بدفتر 0252، والباقي «كلفة الخدمات الثابتة وغيرها». و«تسويات فواتير قديمة» = ربحٌ مسجَّل − (مبيعات − كلفة):
 *     صفرٌ لكلّ فاتورةٍ يكتبها كاتبٌ اليوم، ويُرى إن خالف صفٌّ قديم.
 *   • السحوباتُ بجداولها كما يجمعها `bucketOf` (expenseCategoryRules.ts) — الدالّةُ نفسُها لا نسخةٌ منها —
 *     بيوم spent_at؛ وكلُّ جدولٍ يُقرَّب لفلسٍ بشهره (amount عمودٌ بلا مقياس)، والمجموعُ مجموعُ المقرَّب.
 *   • الصافي = ربحُ المبيعات − مجموعُ السحوبات. والمشترياتُ خارجه: مخزنٌ يُكلَّف حين يُباع أو يُصرف.
 * الشهرُ بتوقيت الجهاز، والمدّةُ مغلقةٌ بطرفيها (كتقارير 0149).
 *
 * والحسابُ بالأجزاء الصحيحة (BigInt): المالُ بالفلس، والكميةُ بالألف، وسحبٌ بلا مقياس باثنتي عشرة منزلة —
 * والتقريبُ نصفُه بعيداً عن الصفر كـround(numeric). تطابقُه مع القاعدة يفحصه pnl-parity بالحزمة.
 * ==========================================================================*/
import type { Expense, ExpenseCategory } from "@/types";
import { roundDiv, roundScaled, fromScaled } from "./consumption";
import { bucketOf } from "./expenseCategoryRules";

/** فاتورةٌ كما تُقرأ (أرقامُها رقماً أو نصّاً كما تصل). */
export interface PnlInvoice {
  id: string;
  created_at: string;
  status?: string | null;
  total?: number | string | null;
  profit?: number | string | null;
  cost_total?: number | string | null;
  /** 0264: فاتورةُ دولار وسِيَقُها — سِيَقُ `kind:'fx'` سطرُ «فرق سعر الصرف» بشهر يومها. */
  currency?: string | null;
  payment_details?: readonly { amount?: number | string | null; at?: string | null; kind?: string | null }[] | null;
}
export interface PnlItem {
  invoice_id: string;
  product_id?: string | null;
  qty?: number | string | null;
  unit_cost?: number | string | null;
}
/** حدثٌ من دفتر المستهلكات — قيمتُه بالفلس (كلُّ مصدرٍ يحوّل شكلَه: القاعدةُ value بالدينار، والتجريبيُّ value_c). */
export interface PnlConsumption { invoice_id: string; cents: bigint }
export type PnlExpense = Pick<Expense, "amount" | "category" | "category_id" | "method" | "spent_at">;
export type PnlCategory = Pick<ExpenseCategory, "id" | "name" | "created_at">;

export interface PnlCategoryLine { id: string; name: string | null; amount: number }
export interface PnlTotals {
  invoices: number;
  revenue: number;
  cogs: number;
  cogs_products: number;
  cogs_materials: number;
  cogs_other: number;
  gross: number;
  adjust: number;
  stock_loss: number;
  returns: number;
  payroll: number;
  payroll_loan: number;
  uncategorized: number;
  categories: PnlCategoryLine[];
  /** 0264: فرقُ سعر الصرف المحقَّق بالتسديدات — ربحٌ أو خسارة، والصافي يحمله: net = gross + fx − expenses. */
  fx: number;
  expenses: number;
  net: number;
}
export interface PnlMonth extends PnlTotals { month: string }
export interface PnlReport { months: PnlMonth[]; total: PnlTotals }

export interface PnlInput {
  invoices: readonly PnlInvoice[];
  items: readonly PnlItem[];
  consumption: readonly PnlConsumption[];
  expenses: readonly PnlExpense[];
  categories: readonly PnlCategory[];
}

/** أطولُ مدّةٍ يقبلها التقرير — نفسُ حدّ `report_pnl`. */
export const PNL_MAX_DAYS = 400;
const FALLBACK_TZ = "Asia/Baghdad";
const EXPENSE_SCALE = 12;   // amount عمودُ numeric بلا مقياس: اثنتا عشرة منزلة تكفي أيَّ مبلغٍ كتبه أحد
const cents = (x: number | string | null | undefined): bigint => roundScaled(x ?? 0, 2);

/** توقيتٌ يعرفه المتصفّح باسمه المعتمد، وإلا بغداد — كـ`report_pnl` (اسمٌ لا يعرفه pg_timezone_names ⇒ بغداد). */
export function pnlTz(tz: string | null | undefined): string {
  const z = (tz ?? "").trim();
  if (!z) return FALLBACK_TZ;
  try { return new Intl.DateTimeFormat("en-US", { timeZone: z }).resolvedOptions().timeZone || FALLBACK_TZ; }
  catch { return FALLBACK_TZ; }
}

const fmts = new Map<string, Intl.DateTimeFormat>();
/** «YYYY-MM» للحظةٍ بتوقيتٍ — نظيرُ to_char(ts at time zone tz, 'YYYY-MM'). */
export function pnlMonthOf(ms: number, tz: string): string {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" }); fmts.set(tz, f); }
  const parts = f.formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}`;
}

/** جدولُ السحب كما يُجمع بالتقرير: مفتاحُ التصنيف بمعرّفه، أو جدولُ النظام، أو «بدون تصنيف». */
type Bucket = "stock" | "returns" | "payroll" | "payroll_loan" | "none" | `cat:${string}`;
function bucketKey(e: PnlExpense): Bucket {
  const b = bucketOf(e);
  if (b.kind === "cat") return `cat:${b.id}`;
  if (b.kind === "system") return b.id;
  return "none";
}

interface Acc {
  n: number;
  revenue: bigint; cogs: bigint; gross: bigint; products: bigint; materials: bigint; fx: bigint;
  /** مجموعُ كلّ جدولٍ بالمنازل الاثنتي عشرة — يُقرَّب لفلسٍ عند الإخراج وحده. */
  buckets: Map<Bucket, bigint>;
}
const emptyAcc = (): Acc => ({ n: 0, revenue: 0n, cogs: 0n, gross: 0n, products: 0n, materials: 0n, fx: 0n, buckets: new Map() });

/** سطرٌ بالفلس — المجموعُ يُبنى من هذه ثمّ يُحوَّل للعرض مرّةً واحدة. */
interface Row {
  n: number;
  revenue: bigint; cogs: bigint; products: bigint; materials: bigint; other: bigint; gross: bigint; adjust: bigint;
  stock: bigint; returns: bigint; payroll: bigint; loan: bigint; none: bigint;
  cats: Map<string, bigint>;
  fx: bigint; expenses: bigint; net: bigint;
}

function rowOf(a: Acc): Row {
  const toC = (b: Bucket) => roundDiv(a.buckets.get(b) ?? 0n, 10n ** BigInt(EXPENSE_SCALE - 2));
  const cats = new Map<string, bigint>();
  for (const k of a.buckets.keys()) if (k.startsWith("cat:")) cats.set(k.slice(4), toC(k));
  const stock = toC("stock"), returns = toC("returns"), payroll = toC("payroll"), loan = toC("payroll_loan"), none = toC("none");
  let expenses = stock + returns + payroll + loan + none;
  for (const v of cats.values()) expenses += v;
  return {
    n: a.n, revenue: a.revenue, cogs: a.cogs, products: a.products, materials: a.materials,
    other: a.cogs - a.products - a.materials, gross: a.gross, adjust: a.gross - (a.revenue - a.cogs),
    stock, returns, payroll, loan, none, cats, fx: a.fx, expenses, net: a.gross + a.fx - expenses,
  };
}

function addRows(rows: readonly Row[]): Row {
  const z: Row = { n: 0, revenue: 0n, cogs: 0n, products: 0n, materials: 0n, other: 0n, gross: 0n, adjust: 0n,
    stock: 0n, returns: 0n, payroll: 0n, loan: 0n, none: 0n, cats: new Map(), fx: 0n, expenses: 0n, net: 0n };
  for (const r of rows) {
    z.n += r.n; z.revenue += r.revenue; z.cogs += r.cogs; z.products += r.products; z.materials += r.materials;
    z.other += r.other; z.gross += r.gross; z.adjust += r.adjust; z.stock += r.stock; z.returns += r.returns;
    z.payroll += r.payroll; z.loan += r.loan; z.none += r.none; z.fx += r.fx; z.expenses += r.expenses; z.net += r.net;
    for (const [id, v] of r.cats) z.cats.set(id, (z.cats.get(id) ?? 0n) + v);
  }
  return z;
}

/** ترتيبُ groupWithdrawals: التصنيفاتُ بإنشائها ثمّ بمعرّفها، ومعرّفٌ لا تعرفه القائمة بعدها بمعرّفه. */
function orderCats(ids: Iterable<string>, byId: ReadonlyMap<string, PnlCategory>): string[] {
  const at = (id: string) => { const c = byId.get(id); const t = c ? Date.parse(c.created_at) : NaN; return Number.isFinite(t) ? t : null; };
  return [...ids].sort((a, b) => {
    const ta = at(a), tb = at(b);
    if (ta !== tb) { if (ta === null) return 1; if (tb === null) return -1; return ta - tb; }
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function out(r: Row, byId: ReadonlyMap<string, PnlCategory>): PnlTotals {
  const c2 = (v: bigint) => fromScaled(v, 2);
  return {
    invoices: r.n, revenue: c2(r.revenue), cogs: c2(r.cogs), cogs_products: c2(r.products), cogs_materials: c2(r.materials),
    cogs_other: c2(r.other), gross: c2(r.gross), adjust: c2(r.adjust),
    stock_loss: c2(r.stock), returns: c2(r.returns), payroll: c2(r.payroll), payroll_loan: c2(r.loan), uncategorized: c2(r.none),
    categories: orderCats(r.cats.keys(), byId).map((id) => ({ id, name: byId.get(id)?.name ?? null, amount: c2(r.cats.get(id) ?? 0n) })),
    fx: c2(r.fx), expenses: c2(r.expenses), net: c2(r.net),
  };
}

/** التقرير لمدّةٍ مغلقةٍ بطرفيها [from, to] بتوقيت `tz`. والمدّةُ تُفحص كالخادم: طرفاها معروفان، والبدايةُ لا تتجاوز
 *  النهاية، ولا أطولَ من PNL_MAX_DAYS — رفضٌ برمز الخادم (`pnl_range` / `pnl_range_long`) لا تقريرٌ عن مدّةٍ غير ما طُلب. */
export function computePnl(input: PnlInput, from: string, to: string, tzIn?: string | null): PnlReport {
  const lo = Date.parse(from), hi = Date.parse(to);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw Object.assign(new Error("pnl_range"), { code: "P0001" });
  if (hi - lo > PNL_MAX_DAYS * 86_400_000) throw Object.assign(new Error("pnl_range_long"), { code: "P0001" });
  const tz = pnlTz(tzIn);
  // بالمللي (Date.parse) والقاعدةُ بالميكرو: يفترقان على صفٍّ داخل مللي طرف المدّة وحده — التجريبيُّ يكتب بالمللي، والقالبُ كذلك.
  const inside = (iso: string): number | null => { const t = Date.parse(iso); return Number.isFinite(t) && t >= lo && t <= hi ? t : null; };

  const accs = new Map<string, Acc>();
  const acc = (m: string) => { let a = accs.get(m); if (!a) { a = emptyAcc(); accs.set(m, a); } return a; };

  const monthOfInvoice = new Map<string, string>();
  for (const inv of input.invoices) {
    if ((inv.status ?? "paid") === "refunded") continue;
    const t = inside(inv.created_at);
    if (t === null) continue;
    const m = pnlMonthOf(t, tz);
    monthOfInvoice.set(inv.id, m);
    const a = acc(m);
    a.n += 1; a.revenue += cents(inv.total); a.cogs += cents(inv.cost_total); a.gross += cents(inv.profit);
  }
  // 0264: سِيَقُ فرق الصرف على فواتير الدولار غير المرجّعة — بشهر يوم الساق (أو يوم الفاتورة إن غاب)، داخل المدّة بيومها هي.
  for (const inv of input.invoices) {
    if (inv.currency !== "USD" || (inv.status ?? "paid") === "refunded") continue;
    for (const l of inv.payment_details ?? []) {
      if (l?.kind !== "fx") continue;
      const at = l.at && Number.isFinite(Date.parse(l.at)) ? l.at : inv.created_at;
      const t = inside(at);
      if (t === null) continue;
      acc(pnlMonthOf(t, tz)).fx += cents(l.amount);
    }
  }
  for (const it of input.items) {
    const m = monthOfInvoice.get(it.invoice_id);
    if (!m || !it.product_id) continue;
    acc(m).products += roundDiv(roundScaled(it.qty ?? 0, 3) * cents(it.unit_cost), 1000n);
  }
  for (const c of input.consumption) {
    const m = monthOfInvoice.get(c.invoice_id);
    if (m) acc(m).materials += c.cents;
  }
  for (const e of input.expenses) {
    const t = inside(e.spent_at);
    if (t === null) continue;
    const a = acc(pnlMonthOf(t, tz));
    const k = bucketKey(e);
    a.buckets.set(k, (a.buckets.get(k) ?? 0n) + roundScaled(e.amount, EXPENSE_SCALE));
  }

  const byId = new Map(input.categories.map((c) => [c.id, c]));
  const keys = [...accs.keys()].sort();
  const rows = keys.map((m) => rowOf(accs.get(m)!));
  return {
    months: keys.map((month, i) => ({ month, ...out(rows[i], byId) })),
    total: out(addRows(rows), byId),
  };
}
