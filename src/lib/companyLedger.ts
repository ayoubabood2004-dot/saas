import type { CompanyCharge, CompanyEntry, PaymentMethod, Purchase, PurchasePayment } from "@/types";
import { localISO } from "./utils";

/* ============================================================================
 * دفترُ الشركة — جدولُها الخاصّ بحركاته كلّها ورصيدٍ جارٍ بعد كلّ سطر، مثل
 * كشف حسابٍ محاسبيّ: «علينا» (دائن) و«سدّدنا» (مدين) والرصيد. نقيٌّ ومفحوصٌ
 * بـ`scripts/company-ledger-test.mjs`.
 *
 * المصادرُ أربعة، ولا يُخترع منها شيء:
 *   • الفواتير: كلُّ فاتورةٍ سطرٌ دائن بإجماليها.
 *   • المدفوعُ عند الشراء: `amount_paid` ناقصَ دفعاتها المسجّلة — المقيسُ على
 *     الإنتاج أن الدفعَ عند الشراء لا يُسجَّل دفعةً (١٧٨ فاتورة)، فيُشتقّ هنا
 *     سطراً مديناً بيوم الفاتورة بدل ترحيل ١٧٨ صفّاً لسجلّ حركات العيادات.
 *   • دفعاتُ الفواتير (`purchase_payments`) — إلا ما جاء من تسديدٍ على الحساب
 *     (`entry_id`): ذاك يُعرض مرّةً واحدة بسطر التسديد مع توزيعه.
 *   • صفوفُ الدفتر (0224): رصيدٌ سابق، تسديدٌ على الحساب، تسوية. والملغى يُعرض
 *     مشطوباً بسببه ولا يحرّك الرصيد.
 *   • والمطالباتُ اليدوية (0155): دائنةٌ بيومها، ومدينةٌ بيوم طيّها.
 *
 * الثابتُ الذي يُفحص: الرصيدُ الأخير = دينُ الفواتير + الرصيدُ السابق القائم +
 * المطالباتُ القائمة — أيْ نفسُ الرقم بقائمة الشركات، من طريقين.
 * ========================================================================= */

export type LedgerKind =
  | "opening" | "purchase" | "upfront" | "payment" | "accountPay"
  | "adjustCredit" | "adjustDebit" | "charge" | "chargeSettled";

export interface LedgerAlloc { purchaseId: string; ref: string | null; amount: number }

export interface LedgerRow {
  key: string;
  /** رقمُ الحركة بالدفتر (١…) بترتيبها الزمنيّ. */
  no: number;
  day: string;
  kind: LedgerKind;
  /** رقمُ فاتورة المورّد إن وُجد. */
  ref: string | null;
  purchaseId: string | null;
  entryId: string | null;
  chargeId: string | null;
  /** علينا (يزيد الدين). صفرٌ على الملغى — والمبلغُ الأصليّ بـ`amount`. */
  credit: number;
  /** سدّدنا / ينقص الدين. */
  debit: number;
  amount: number;
  balance: number;
  method: PaymentMethod | null;
  note: string | null;
  voided: { at: string; reason: string | null } | null;
  /** تسديدٌ على الحساب: كم ذهب للرصيد السابق، وكم لكلّ فاتورة. */
  toOpening?: number;
  alloc?: LedgerAlloc[];
}

export interface LedgerInput {
  purchases: Purchase[];
  payments: PurchasePayment[];
  entries: CompanyEntry[];
  charges: CompanyCharge[];
}

export interface CompanyLedger {
  rows: LedgerRow[];
  totals: {
    credit: number;
    debit: number;
    balance: number;
    /** دينُ الفواتير كما بـ`amount_paid`. */
    invoiceDue: number;
    /** الرصيدُ السابق القائم (قد يكون سالباً إن زاد الخصمُ عليه). */
    poolDue: number;
    chargesDue: number;
  };
  /** ما بقي على كلّ فاتورة. */
  dueByPurchase: Map<string, number>;
  /** رصيدٌ سابقٌ حيّ — له واحدٌ فقط (إلا بعد طيّ شركتين). */
  hasOpening: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string) => (iso.length === 10 ? iso : localISO(new Date(iso)));

/** دينُ فاتورة واحدة — قديمةٌ بلا amount_paid تُعتبر مدفوعةً كاملة (مثل 0076). */
export const purchaseDue = (p: Purchase) => Math.max(0, r2(p.total - (p.amount_paid ?? p.total)));

/** الرصيدُ السابق القائم — مرآةُ `company_pool_due` بالقاعدة. */
export function poolDueOf(entries: CompanyEntry[], payments: PurchasePayment[]): number {
  const toInvoices = new Map<string, number>();
  for (const pp of payments) if (pp.entry_id) toInvoices.set(pp.entry_id, (toInvoices.get(pp.entry_id) ?? 0) + Number(pp.amount));
  let s = 0;
  for (const e of entries) {
    if (e.voided_at) continue;
    if (e.direction === "credit") s += e.amount;
    else if (e.kind === "payment") s -= e.amount - (toInvoices.get(e.id) ?? 0);
    else s -= e.amount;
  }
  return r2(s);
}

const ORDER: Record<LedgerKind, number> = {
  opening: 0, purchase: 1, upfront: 2, charge: 3, adjustCredit: 4,
  payment: 5, accountPay: 5, adjustDebit: 6, chargeSettled: 7,
};

export function buildCompanyLedger(inp: LedgerInput): CompanyLedger {
  const refOf = new Map(inp.purchases.map((p) => [p.id, p.reference?.trim() || null]));
  const mine = new Set(inp.purchases.map((p) => p.id));
  const payments = inp.payments.filter((pp) => mine.has(pp.purchase_id));
  const paidLogged = new Map<string, number>();
  for (const pp of payments) paidLogged.set(pp.purchase_id, (paidLogged.get(pp.purchase_id) ?? 0) + Number(pp.amount));
  const allocOf = new Map<string, LedgerAlloc[]>();
  for (const pp of payments) {
    if (!pp.entry_id) continue;
    (allocOf.get(pp.entry_id) ?? allocOf.set(pp.entry_id, []).get(pp.entry_id)!)
      .push({ purchaseId: pp.purchase_id, ref: refOf.get(pp.purchase_id) ?? null, amount: r2(Number(pp.amount)) });
  }

  type Raw = Omit<LedgerRow, "no" | "balance"> & { sortAt: string };
  const raw: Raw[] = [];
  const base = { ref: null, purchaseId: null, entryId: null, chargeId: null, method: null, note: null, voided: null } as const;

  for (const p of inp.purchases) {
    raw.push({ ...base, key: `p:${p.id}`, day: dayOf(p.purchased_at), kind: "purchase", ref: refOf.get(p.id) ?? null,
      purchaseId: p.id, credit: r2(p.total), debit: 0, amount: r2(p.total), note: p.notes?.trim() || null, sortAt: p.created_at ?? p.purchased_at });
    const upfront = r2((p.amount_paid ?? p.total) - (paidLogged.get(p.id) ?? 0));
    if (upfront > 0) {
      raw.push({ ...base, key: `u:${p.id}`, day: dayOf(p.purchased_at), kind: "upfront", ref: refOf.get(p.id) ?? null,
        purchaseId: p.id, credit: 0, debit: upfront, amount: upfront, method: p.payment_method ?? null, sortAt: p.created_at ?? p.purchased_at });
    }
  }
  for (const pp of payments) {
    if (pp.entry_id) continue;
    const a = r2(Number(pp.amount));
    raw.push({ ...base, key: `pp:${pp.id}`, day: dayOf(pp.paid_at), kind: "payment", ref: refOf.get(pp.purchase_id) ?? null,
      purchaseId: pp.purchase_id, credit: 0, debit: a, amount: a, method: pp.method ?? null, note: pp.note?.trim() || null, sortAt: pp.paid_at });
  }
  for (const e of inp.entries) {
    const kind: LedgerKind = e.kind === "opening" ? "opening" : e.kind === "payment" ? "accountPay"
      : e.direction === "credit" ? "adjustCredit" : "adjustDebit";
    const live = !e.voided_at;
    const a = r2(e.amount);
    const alloc = allocOf.get(e.id) ?? [];
    const toInv = r2(alloc.reduce((s, x) => s + x.amount, 0));
    raw.push({
      ...base, key: `e:${e.id}`, day: e.entry_date, kind, entryId: e.id,
      credit: live && e.direction === "credit" ? a : 0,
      debit: live && e.direction === "debit" ? a : 0,
      amount: a, method: e.method ?? null, note: e.note?.trim() || null,
      voided: e.voided_at ? { at: e.voided_at, reason: e.void_reason ?? null } : null,
      ...(e.kind === "payment" ? { toOpening: live ? r2(a - toInv) : 0, alloc } : {}),
      sortAt: e.created_at,
    });
  }
  for (const c of inp.charges) {
    const a = r2(c.amount);
    raw.push({ ...base, key: `c:${c.id}`, day: c.charged_at.slice(0, 10), kind: "charge", chargeId: c.id,
      credit: a, debit: 0, amount: a, note: [c.reason, c.note].map((x) => x?.trim()).filter(Boolean).join(" — ") || null, sortAt: c.created_at });
    if (c.settled_at) {
      raw.push({ ...base, key: `cs:${c.id}`, day: dayOf(c.settled_at), kind: "chargeSettled", chargeId: c.id,
        credit: 0, debit: a, amount: a, note: c.reason?.trim() || null, sortAt: c.settled_at });
    }
  }

  raw.sort((a, b) => a.day.localeCompare(b.day) || ORDER[a.kind] - ORDER[b.kind] || a.sortAt.localeCompare(b.sortAt) || a.key.localeCompare(b.key));
  let bal = 0, credit = 0, debit = 0;
  const rows: LedgerRow[] = raw.map(({ sortAt: _s, ...r }, i) => {
    bal = r2(bal + r.credit - r.debit);
    credit = r2(credit + r.credit);
    debit = r2(debit + r.debit);
    return { ...r, no: i + 1, balance: bal };
  });

  const dueByPurchase = new Map(inp.purchases.map((p) => [p.id, purchaseDue(p)]));
  const invoiceDue = r2([...dueByPurchase.values()].reduce((s, x) => s + x, 0));
  const poolDue = poolDueOf(inp.entries, payments);
  const chargesDue = r2(inp.charges.reduce((s, c) => s + (c.settled_at ? 0 : c.amount), 0));
  return {
    rows,
    totals: { credit, debit, balance: bal, invoiceDue, poolDue, chargesDue },
    dueByPurchase,
    hasOpening: inp.entries.some((e) => e.kind === "opening" && !e.voided_at),
  };
}

/** كم يقبل التسديدُ على الحساب — مرآةُ رفض `over_pay` بالقاعدة. */
export const payableOf = (invoiceDue: number, poolDue: number) => r2(invoiceDue + Math.max(0, poolDue));

/** معاينةُ التوزيع قبل الحفظ — نفسُ ترتيب `company_pay`: الرصيدُ السابق أوّلاً ثم
 *  الفواتير من الأقدم (بيوم الشراء ثم الإنشاء). الشاشةُ تقولها قبل الضغط. */
export function previewPay(amount: number, poolDue: number, purchases: Purchase[]): { toOpening: number; alloc: LedgerAlloc[]; left: number } {
  let left = r2(Math.max(0, amount));
  const toOpening = r2(Math.min(Math.max(0, poolDue), left));
  left = r2(left - toOpening);
  const alloc: LedgerAlloc[] = [];
  const open = purchases.filter((p) => purchaseDue(p) > 0)
    .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at) || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id));
  for (const p of open) {
    if (left <= 0) break;
    const part = r2(Math.min(left, purchaseDue(p)));
    alloc.push({ purchaseId: p.id, ref: p.reference?.trim() || null, amount: part });
    left = r2(left - part);
  }
  return { toOpening, alloc, left };
}
