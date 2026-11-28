/* ============================================================================
 * المخزنُ لا يُحسب مرّتين، وكلُّ تغييرٍ بدفتر (0287) — بابٌ كسولٌ خارج repo.ts (حزمةُ الإقلاع وفسحتُها محدودة)،
 * تستورده شاشاتُ المشتريات والدفعات والمرتجع وحركاتُ المادّة وحدها.
 *
 * العقد:
 *  • `recordPurchase` / `addLot` / `returnItems`: دوالُّ الخادم نفسُها ملفوفةً بمرجع محاولة (`ref`) تولّده الشاشةُ مرّةً
 *    وتعيده بكلّ إعادة حتى تنجح — جوابٌ ضاع بعد أن ثبتت المحاولةُ الأولى يُرجعها ولا يكتب ثانية، وطلبٌ تغيّر بعدها
 *    يُرفض باسمه (`*_ref_changed`، والتلميحُ العربيّ يقول أين يجده). قاعدةٌ قبل 0287 (الدالّةُ غائبة PGRST202/42883)
 *    ⇒ الدالّةُ القديمة كما كانت: الواجهةُ لا تنتظر الهجرة، والحمايةُ تبدأ حين تنزل.
 *  • `ledger`: حركاتُ المادّة من دفتر الرصيد بنوعها الحقيقيّ. `null` = الدفترُ غائب (قاعدةٌ قبل 0287) ⇒ الشاشةُ
 *    تعرض الحركاتَ القديمة. ورفضُ الصلاحية يُرمى برمزه (`stock_ledger_forbidden`) — لا «ماكو حركات».
 *  • الكتابةُ تُسمع: كلُّ خطأٍ يُرمى برمز الخادم وتلميحه (rpcJson)، و«القراءة فقط» تمنع كما بـrepo.
 *  • التجريبيّ: الدوالُّ القديمة نفسُها (localStorage لا يضيع جوابُه).
 * ========================================================================= */
import { supabase } from "./supabase";
import { repo } from "./repo";
import { rpcJson } from "./rpcJson";
import { isConfigReadOnly } from "./clinicSync";
import type { Invoice, PaymentMethod, Purchase, PurchaseDraftLine, PurchaseMeta } from "@/types";

const MISSING = new Set(["PGRST202", "42883"]);
const codeOf = (e: unknown): string => String((e as { code?: unknown } | null)?.code ?? "");
const absent = (e: unknown): boolean => MISSING.has(codeOf(e));

/** بابُ الشراء بالعملتين (0274) كسولاً: لا يُحمَّل إلا حين يُنادى — فلا يجرّ وحدةَ الدولار إلى كلّ من يستورد هذا الباب. */
const fxApi = () => import("./purchaseFxApi").then((m) => m.purchaseFx);

function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}

/** مرجعُ محاولةٍ جديد (يولَّد مرّةً لكلّ نموذج، ويُعاد بكلّ إعادة). */
export const newAttemptRef = (): string =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto ? globalThis.crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

/** هل رفضُ الخادم يقول إن المحاولةَ الأولى **ثبتت** وهذه غيرُها؟ (الشاشةُ تقول التلميحَ وتعيد القراءة، ولا تكتب بمرجعٍ جديد.)
 *  الاسمُ بالرسالة والرمزُ P0001 (`raise exception '…_ref_changed'` بلا errcode) — فحصُ الرمز وحده كان لا يُطابق أبداً
 *  فلا تُغلق الشاشةُ ولا تُقرأ، وكلُّ حفظٍ بعدها يُرفض بالاسم نفسِه (freshness-test يفحصه بشكل خطأ PostgREST الحقيقيّ). */
export const isRefChanged = (e: unknown): boolean =>
  /_ref_changed$/.test(codeOf(e)) || /_ref_changed$/.test(String((e as { message?: unknown } | null)?.message ?? ""));

/** فاتورةُ شراءٍ جديدة مرّةً واحدة. `fx`: من باب العملتين (0274). */
export async function recordPurchaseOnce(ref: string, lines: PurchaseDraftLine[], meta: PurchaseMeta, fx: boolean): Promise<Purchase> {
  if (!supabase) return fx ? (await fxApi()).record(lines, meta) : repo.recordPurchase(lines, meta);
  writable();
  try {
    return await rpcJson<Purchase>("purchase_record_once", { p_ref: ref, p_lines: lines, p_meta: meta, p_fx: fx });
  } catch (e) {
    if (!absent(e)) throw e;
    return fx ? (await fxApi()).record(lines, meta) : repo.recordPurchase(lines, meta);
  }
}

/** «أضف دفعة» مرّةً واحدة — يرجع معرّفَ الدفعة. */
export async function addLotOnce(ref: string, productId: string, qty: number, expiry: string | null, note?: string | null): Promise<string> {
  if (!supabase) return repo.addLot(productId, qty, expiry, note ?? null);
  writable();
  try {
    return await rpcJson<string>("lot_add_once", { p_ref: ref, p_product: productId, p_qty: qty, p_expiry: expiry, p_note: note ?? null });
  } catch (e) {
    if (!absent(e)) throw e;
    return repo.addLot(productId, qty, expiry, note ?? null);
  }
}

/** المرتجعُ على فاتورة مرّةً واحدة. */
export async function returnItemsOnce(
  ref: string, invoiceId: string, returns: { item_id: string; qty: number }[], method: PaymentMethod | null, note: string | null,
): Promise<Invoice> {
  if (!supabase) return repo.returnInvoiceItems(invoiceId, returns, method, note);
  writable();
  try {
    return await rpcJson<Invoice>("return_invoice_items_once", {
      p_ref: ref, p_invoice: invoiceId, p_returns: returns, p_method: method, p_note: note,
    });
  } catch (e) {
    if (!absent(e)) throw e;
    return repo.returnInvoiceItems(invoiceId, returns, method, note);
  }
}

/** نوعُ الحركة كما يحسبه الخادمُ من الدالّة التي كتبت (0287 `_stock_ledger_kind`). */
export type LedgerKind =
  | "checkpoint" | "open" | "manual" | "delete" | "count" | "waste" | "merge" | "restore" | "pool" | "farm"
  | "purchase" | "purchase_edit" | "lot" | "consume" | "consume_return" | "sale" | "return" | "refund"
  | "invoice_delete" | "invoice_edit"
  /** 0294: تحويلُ الوحدة — الفرقُ ليس بضاعةً دخلت أو خرجت، الرقمُ نفسُه بوحدةٍ أخرى. */
  | "unit"
  | "other";

export interface LedgerRow {
  id: number;
  at: string;
  kind: LedgerKind;
  source: string;
  delta: number;
  qty_before: number | null;
  qty_after: number | null;
  actor_name: string;
  /** staff | owner (صاحب العيادة) | manager (كادرٌ لا يُعرف — يُقرأ «مدير العيادة») | system (بلا فاعل) */
  actor_kind: "staff" | "owner" | "manager" | "system";
  ref_kind: "invoice" | "purchase" | "count" | null;
  ref_id: string | null;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** صفحةٌ من دفتر المادّة، الأحدثُ أوّلاً (`before` = أصغرُ معرّفٍ رُئي). `null` = لا دفترَ بهذه القاعدة بعد. */
export async function ledgerPage(productId: string, before: number | null, limit = 100): Promise<LedgerRow[] | null> {
  if (!supabase) return null;
  const res = await supabase.rpc("stock_ledger_of", { p_product: productId, p_before: before, p_limit: limit });
  if (res.error) {
    if (MISSING.has(res.error.code ?? "")) return null;
    const err = new Error(res.error.message) as Error & { code?: string; hint?: string };
    err.code = /stock_ledger_forbidden/.test(res.error.message) ? "stock_ledger_forbidden" : res.error.code;
    if (res.error.hint) err.hint = res.error.hint;
    throw err;
  }
  return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    at: String(r.at),
    kind: String(r.kind) as LedgerKind,
    source: String(r.source ?? ""),
    delta: Number(r.delta) || 0,
    qty_before: num(r.qty_before),
    qty_after: num(r.qty_after),
    actor_name: String(r.actor_name ?? ""),
    actor_kind: (String(r.actor_kind ?? "system") as LedgerRow["actor_kind"]),
    ref_kind: (r.ref_kind ?? null) as LedgerRow["ref_kind"],
    ref_id: (r.ref_id ?? null) as string | null,
  }));
}
