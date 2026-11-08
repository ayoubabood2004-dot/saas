/* ============================================================================
 * مرآةُ الدولار (0264) للتجريبيّ — العقدُ نفسُه والحرّاسُ نفسُها، والحسابُ من usdMath.ts (مرآةُ الخادم المفحوصة بـusd-parity):
 *  • المفتاحُ مطفأ ⇒ usd_disabled لكلّ كتابة؛ والسعرُ للمدير (أو مفتاحِه الحيّ) ⇒ usd_rate_manager؛ وحدّاه ١٠٠–١٠٠٬٠٠٠ ⇒ usd_rate_bad.
 *  • البيعُ: معرّفُ السعر آخرُ سعر (usd_rate_changed)، موادُّ دولار وحدها بلا تكرار (usd_mixed/usd_duplicate_line)، كميةٌ
 *    صحيحةٌ موجبة (usd_qty)، سعرٌ موجود (usd_no_price)، نقداً كاملاً أو دَيناً (usd_partial_at_sale). والفاتورةُ من مرآة
 *    retail_checkout نفسِها والبابُ مفتوح، ثمّ تُختم، والنقدُ تسديدٌ كاملٌ بسعر البيع.
 *  • التسديد: باقٍ تغيّر (usd_due_changed)، صفرٌ أو أكبرُ من الباقي (usd_amount/usd_over)، سعرٌ غيرُ سعر اليوم للمدير وبسبب
 *    (usd_rate_override)، جزئيٌّ يطلع صفراً (usd_too_small)؛ والإعادةُ بنفس المرجع تسديدٌ واحد.
 *  • الإلغاءُ للمدير وبسبب، والحذفُ بعد إلغاء التسديدات (usd_delete_settled).
 *  • المصوّرُ مسيَّج: لا يرى (مطفأ) ولا يكتب (photographer_forbidden).
 * الرموزُ وحدها (P0001/42501) — الشاشةُ تترجمها (usdErrorText). كسولةٌ من باب repoDemo وحده (loadDemoUsd).
 * ========================================================================= */
import { loadDB, saveDB } from "./demoStore";
import { demoBaseRole, demoClinicId, demoPinLive, demoRepo, demoUserId, demoUsdRetail, demoWithUsdDoor } from "./repoDemo";
import { cartTotals, centsOf, costFilsOf, iqdOf, rate1e4Of, rateOfPer100, rateOk, settleRefusal, shareOf, USD_ROUND_STEPS } from "./usdMath";
import type { UsdLineIn, UsdMethod, UsdRate, UsdSaleMeta, UsdSettlement, UsdSettleResult, UsdState } from "./usdApi";
import type { CheckoutItem, Invoice, PaymentSplit } from "@/types";
import { uid } from "./utils";

interface Store { enabled: boolean; step: number; rates: Omit<UsdRate, "rate1e4">[]; settlements: UsdSettlement[] }
const key = () => `vp_usd_${demoClinicId() ?? "default"}`;
function load(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(key()) || "null") as Partial<Store> | null;
    return { enabled: v?.enabled === true, step: typeof v?.step === "number" ? v.step : 250, rates: Array.isArray(v?.rates) ? v!.rates : [], settlements: Array.isArray(v?.settlements) ? v!.settlements : [] };
  } catch { return { enabled: false, step: 250, rates: [], settlements: [] }; }
}
const save = (s: Store) => localStorage.setItem(key(), JSON.stringify(s));

const err = (code: string, sqlstate = "P0001") => Object.assign(new Error(code), { code: sqlstate });
const fenced = () => demoBaseRole() === "photographer";
const isManager = () => demoBaseRole() === "manager" || demoPinLive();
function gate(): void { if (fenced()) throw err("photographer_forbidden", "42501"); }
const C = (v: unknown): bigint => centsOf(v == null ? "0" : String(v)) ?? 0n;
const N = (c: bigint): number => Number(c) / 100;
/** ختمٌ يكبر دائماً (سعران بنفس الملّي ثانية كانا يتساويان فيضيع «آخرُ سعر»). */
function stamp(prev?: string): string {
  const p = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(Date.now(), p + 1)).toISOString();
}
const withId = (r: Omit<UsdRate, "rate1e4">): UsdRate => ({ ...r, rate1e4: rate1e4Of(r.rate)! });
const latest = (s: Store): UsdRate | null => (s.rates.length ? withId(s.rates[s.rates.length - 1]) : null);
const rateText = (rate1e4: bigint) => `${rate1e4 / 10_000n}.${String(rate1e4 % 10_000n).padStart(4, "0")}`;

export async function demoUsdState(): Promise<UsdState> {
  if (fenced()) return { enabled: false, step: 250, rate: null };
  const s = load();
  return { enabled: s.enabled, step: s.step, rate: latest(s) };
}

export async function demoUsdPrefs(enabled: boolean | null, step: number | null): Promise<UsdState> {
  gate();
  if (!isManager()) throw err("usd_prefs_manager", "42501");
  if (step != null && !(USD_ROUND_STEPS as readonly number[]).includes(step)) throw err("usd_step_bad");
  const s = load();
  if (enabled === false && s.enabled) {
    const db = loadDB();
    const prod = (db.products ?? []).filter((p) => p.price_currency === "USD").length;
    const debt = (db.invoices ?? []).filter((i) => i.currency === "USD" && (i.status ?? "paid") !== "refunded" && C(i.total_usd) > C(i.paid_usd)).length;
    if (prod > 0 || debt > 0) throw err("usd_in_use");
  }
  if (enabled != null) s.enabled = enabled;
  if (step != null) s.step = step;
  save(s);
  return demoUsdState();
}

export async function demoUsdRateSet(per100: string, note: string | null): Promise<UsdRate> {
  gate();
  const s = load();
  if (!s.enabled) throw err("usd_disabled");
  if (!isManager()) throw err("usd_rate_manager", "42501");
  const r = rateOfPer100(per100);
  if (!rateOk(r)) throw err("usd_rate_bad");
  const row = { id: uid("fx"), rate: rateText(r!), note: note?.trim() || null, set_by: demoUserId() ?? null, created_at: stamp(s.rates[s.rates.length - 1]?.created_at) };
  s.rates.push(row);
  save(s);
  return withId(row);
}

export async function demoUsdRates(limit: number): Promise<UsdRate[]> {
  if (fenced()) return [];
  return load().rates.slice().reverse().slice(0, limit).map(withId);
}

export async function demoUsdCheckout(items: UsdLineIn[], meta: UsdSaleMeta): Promise<Invoice> {
  gate();
  const s = load();
  if (!s.enabled) throw err("usd_disabled");
  const ref = meta.client_ref?.trim() || null;
  const db0 = loadDB();
  if (ref) { const prior = (db0.invoices ?? []).find((v) => v.client_ref === ref); if (prior) return prior; }
  if ((meta as { sale_at?: string }).sale_at?.trim()) throw err("usd_backdate");
  const cur = latest(s);
  if (!cur) throw err("usd_no_rate");
  if (meta.fx_rate_id !== cur.id) throw err("usd_rate_changed");
  const method: UsdMethod = (meta.payment_method || "cash") as UsdMethod;
  if (!["cash", "card", "transfer"].includes(method)) throw err("usd_method");
  if (!Array.isArray(items) || items.length === 0) throw new Error("empty cart");

  const seen = new Set<string>();
  const lines: { pid: string; name: string; barcode: string | null; qty: number; unitCents: bigint; costCents: bigint | null }[] = [];
  for (const it of items) {
    const p = (db0.products ?? []).find((x) => x.id === it.product_id);
    if (!p || p.price_currency !== "USD") throw err("usd_mixed");
    if (seen.has(p.id)) throw err("usd_duplicate_line");
    seen.add(p.id);
    const qty = Number(it.qty);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) throw err("usd_qty");
    const unit = it.unit_price_usd != null && it.unit_price_usd !== "" ? centsOf(it.unit_price_usd) : p.sell_price_usd == null ? null : C(p.sell_price_usd);
    if (unit == null || unit < 0n) throw err("usd_no_price");
    lines.push({ pid: p.id, name: p.name, barcode: p.barcode ?? null, qty, unitCents: unit, costCents: p.purchase_price_usd == null ? null : C(p.purchase_price_usd) });
  }
  const disc = meta.discount_usd != null && meta.discount_usd !== "" ? centsOf(meta.discount_usd) ?? 0n : 0n;
  const t = cartTotals(lines.map((l) => ({ qty: BigInt(l.qty), unitCents: l.unitCents })), disc, cur.rate1e4);
  const paidUsd = centsOf(meta.paid_usd || "0") ?? 0n;
  const paid = paidUsd === 0n ? false : paidUsd === t.totalUsdCents ? true : null;
  if (paid === null) throw err("usd_partial_at_sale");

  const checkout: CheckoutItem[] = lines.map((l, j) => ({
    product_id: l.pid, name: l.name, barcode: l.barcode, qty: l.qty, stock_qty: l.qty, unit_price: N(t.unitIqd[j] * 100n), unit_cost: 0, service_id: null,
  }));
  const inv0 = await demoUsdRetail(checkout, {
    customer_name: meta.customer_name ?? null, customer_phone: meta.customer_phone ?? null, pet_name: meta.pet_name ?? null,
    staff_id: meta.staff_id ?? null, notes: meta.notes ?? null, client_ref: ref, sale_kind: (meta.sale_kind as Invoice["sale_kind"]) ?? null,
    payment_method: paid ? method : null, discount_type: t.discountIqd > 0n ? "fixed" : null, discount_value: t.discountIqd > 0n ? N(t.discountIqd * 100n) : 0,
    amount_paid: 0,
  });
  if (inv0.currency === "USD") return inv0;   // سباقُ ضغطتين على نفس المرجع: الأولى ختمتها
  if (C(inv0.total) !== t.totalIqd * 100n) throw err("usd_total_mismatch");

  // الختم: الكلفةُ بالدولار × سعر يوم البيع، والأعمدةُ الدولارية — بالباب (كالخادم).
  const db = loadDB();
  const inv = (db.invoices ?? []).find((x) => x.id === inv0.id)!;
  let cost = 0n;
  for (const it of (db.invoiceItems ?? []).filter((x) => x.invoice_id === inv.id)) {
    const l = lines.find((x) => x.pid === it.product_id)!;
    // كلفةُ دولارٍ فارغة: تبقى كلفةُ مرآة retail_checkout (كالخادم) لا صفر.
    const fils = l.costCents == null ? C(it.unit_cost) : costFilsOf(l.costCents, cur.rate1e4);
    it.unit_price_usd = N(l.unitCents); it.unit_cost_usd = l.costCents == null ? null : N(l.costCents); it.unit_cost = N(fils);
    cost += BigInt(l.qty) * fils;
  }
  Object.assign(inv, {
    currency: "USD", fx_rate: Number(cur.rate), total_usd: N(t.totalUsdCents), discount_usd: N(t.discountUsdCents), paid_usd: 0,
    cost_total: N(cost), profit: N(C(inv.total) - cost),
  });
  saveDB(db);
  if (paid && t.totalUsdCents > 0n) {
    return (await settleLocal(inv.id, t.totalUsdCents, cur.rate1e4, method, t.totalUsdCents, null, null)).invoice;
  }
  return inv;
}

export async function demoUsdSettle(invoiceId: string, usd: string, per100: string, method: UsdMethod, expectDueUsd: string,
  note: string | null, clientRef: string | null): Promise<UsdSettleResult> {
  gate();
  const r = rateOfPer100(per100);
  return settleLocal(invoiceId, centsOf(usd) ?? 0n, r, method, centsOf(expectDueUsd), note, clientRef);
}

async function settleLocal(invoiceId: string, usd: bigint, rate: bigint | null, methodIn: UsdMethod, expect: bigint | null,
  noteIn: string | null, refIn: string | null): Promise<UsdSettleResult> {
  const s = load();
  if (!s.enabled) throw err("usd_disabled");
  const ref = refIn?.trim() || null;
  const db = loadDB();
  if (ref) {
    const prior = s.settlements.find((x) => x.client_ref === ref);
    if (prior) return { invoice: (db.invoices ?? []).find((i) => i.id === prior.invoice_id)!, settlement: prior };
  }
  const method = (methodIn || "cash") as UsdMethod;
  if (!["cash", "card", "transfer"].includes(method)) throw err("usd_method");
  const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
  if (!inv) throw new Error("invoice not found");
  if (inv.currency !== "USD") throw err("usd_not_usd");
  if ((inv.status ?? "paid") === "refunded") throw new Error("invoice refunded");
  const totalUsd = C(inv.total_usd), paidUsd = C(inv.paid_usd), due = totalUsd - paidUsd;
  if (expect != null && (expect - due > 0n || due - expect > 0n)) throw err("usd_due_changed");
  if (usd <= 0n) throw err("usd_amount");
  if (usd > due) throw err("usd_over");
  if (!rateOk(rate)) throw err("usd_rate_bad");
  const note = noteIn?.trim() || null;
  const cur = latest(s);
  if (!cur || rate !== cur.rate1e4) { if (!isManager() || !note) throw err("usd_rate_override", "42501"); }
  const received = iqdOf(usd, rate!, s.step);
  const refusal = settleRefusal(usd, due, received);
  if (refusal) throw err(refusal);
  const totalIqd = C(inv.total) / 100n, paidIqd = C(inv.amount_paid ?? 0) / 100n;
  const share = shareOf(usd, due, totalIqd - paidIqd, totalUsd, totalIqd);
  const fx = received - share;
  const at = new Date().toISOString();
  const row: UsdSettlement = {
    id: uid("ust"), invoice_id: inv.id, usd: N(usd), rate: Number(rate!) / 10_000, rate_note: note, received: Number(received), share: Number(share),
    fx: Number(fx), method, at, by_user: demoUserId() ?? null, client_ref: ref, voided_at: null, voided_by: null, void_reason: null,
  };
  const legs: PaymentSplit[] = [...(inv.payment_details ?? [])];
  if (share !== 0n) legs.push({ method, amount: Number(share), at, usd: N(usd), rate: Number(rate!) / 10_000, settlement_id: row.id });
  if (fx !== 0n) legs.push({ method, amount: Number(fx), at, kind: "fx", settlement_id: row.id });
  await demoWithUsdDoor(() => {
    inv.amount_paid = N((paidIqd + share) * 100n);
    inv.paid_usd = N(paidUsd + usd);
    inv.payment_details = legs;
    inv.payment_method = legs.filter((l) => l.kind !== "fx").sort((a, b) => b.amount - a.amount)[0]?.method ?? inv.payment_method ?? null;
    saveDB(db);
  });
  s.settlements.push(row);
  save(s);
  return { invoice: inv, settlement: row };
}

export async function demoUsdSettlements(invoiceIds: string[]): Promise<UsdSettlement[]> {
  if (fenced()) return [];
  const ids = new Set(invoiceIds);
  return load().settlements.filter((x) => ids.has(x.invoice_id)).sort((a, b) => a.at.localeCompare(b.at));
}

export async function demoUsdVoid(settlementId: string, reasonIn: string): Promise<UsdSettleResult> {
  gate();
  if (!isManager()) throw err("usd_void_manager", "42501");
  const reason = reasonIn?.trim();
  if (!reason) throw err("usd_void_reason");
  const s = load();
  const row = s.settlements.find((x) => x.id === settlementId);
  if (!row) throw err("usd_settlement_missing");
  if (row.voided_at) throw err("usd_already_void");
  const db = loadDB();
  const inv = (db.invoices ?? []).find((x) => x.id === row.invoice_id)!;
  const at = new Date().toISOString();
  const legs: PaymentSplit[] = [...(inv.payment_details ?? [])];
  if (row.share !== 0) legs.push({ method: row.method, amount: -row.share, at, reversal_of: row.id, note: reason });
  if (row.fx !== 0) legs.push({ method: row.method, amount: -row.fx, at, kind: "fx", reversal_of: row.id, note: reason });
  await demoWithUsdDoor(() => {
    const paidUsd = C(inv.paid_usd) - C(row.usd);
    inv.amount_paid = N(C(inv.amount_paid ?? 0) - C(row.share));
    inv.paid_usd = N(paidUsd);
    inv.payment_details = legs;
    saveDB(db);
  });
  Object.assign(row, { voided_at: at, voided_by: demoUserId() ?? null, void_reason: reason });
  save(s);
  return { invoice: inv, settlement: row };
}

export async function demoUsdDelete(invoiceId: string): Promise<void> {
  gate();
  if (load().settlements.some((x) => x.invoice_id === invoiceId && !x.voided_at)) throw err("usd_delete_settled");
  await demoWithUsdDoor(() => demoRepo.deleteInvoice(invoiceId));
  const s = load();
  s.settlements = s.settlements.filter((x) => x.invoice_id !== invoiceId);   // on delete cascade
  save(s);
}
