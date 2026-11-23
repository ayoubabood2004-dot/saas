/* ============================================================================
 * مرآةُ الراجع الإكسباير (0288) بالتجريبيّ — return_expired وretail_checkout_lots بقواعدهما. كسولةٌ من باب repoDemo وحده
 * (loadDemoExpired)، ويستوردها expiredApi وحده.
 *
 * الحساب (لا خسارةَ وهميّة): سطرُ الفاتورة ينقص بالراجع، و«سطرُ أثر» بلا مادّة سعرُه ما لم يرجع للزبون وكلفتُه ما لم ينتقل للدفعة — فربحُ
 * الفاتورة لا يتغيّر والدَّينُ ينزل قيمةَ الراجع (الدَّينُ ثمّ الخصمُ على الدين ثمّ النقد — حسابُ return_invoice_items). والدفعةُ بكلفة
 * min(القيمة، الكلفة) فبيعُها بقيمة الراجع ربحُه صفر.
 * ========================================================================= */
import type { CheckoutItem, Invoice, InvoiceItem, PaymentMethod, Product, ProductLot, SaleMeta } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { demoAddExpense, demoConsumeForgiveness, demoRepo } from "./repoDemo";
import { demoHint } from "./demoRole";

/** رفضٌ برمزه وحده — الشاشةُ تقوله بلغتها (xret.err)، والخادمُ يشرحه بـhint عربيّ. */
const refuse = (code: string): Error => demoHint(code, "");
import { loadLots, reconcileAll, saveLots } from "./demoLots";
import { custKey } from "./customerKey";
import { getDialCode } from "./settings";
import { consumeForgiveness } from "./debtForgive";
import { uid } from "./utils";
import type { ExpiredItem, ExpiredMeta } from "./expiredApi";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const q3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const RET_WORD = "\u0631\u0627\u062C\u0639 \u0625\u0643\u0633\u0628\u0627\u064A\u0631";   // «راجع إكسباير» — نصُّ الخادم المخزَّن
const RET_CAT = "\u0645\u0631\u062A\u062C\u0639";                                          // «مرتجع» — فئةُ السحب
const BACK_WORD = "\u0623\u064F\u0639\u064A\u062F";                                        // «أُعيد»
const UNIT_SUB = "\u0642\u0637\u0639\u0629";                                               // «قطعة»
const UNIT_PACK = "\u0643\u0627\u0631\u062A\u0648\u0646";                                  // «كارتون»
type Ref = { fn: string; ref: string; result: unknown };
const REFS = "vp_demo_rpc_refs_0288";
const refsLoad = (): Ref[] => { try { return JSON.parse(localStorage.getItem(REFS) ?? "[]") as Ref[]; } catch { return []; } };
const refsSave = (l: Ref[]) => localStorage.setItem(REFS, JSON.stringify(l.slice(-300)));

export function demoReturnLots(productId: string | null): ProductLot[] {
  const lots = reconcileAll();
  return lots.filter((l) => l.source === "return" && (productId ? l.product_id === productId : l.qty > 0))
    .sort((a, b) => (productId ? (b.returned_at ?? "").localeCompare(a.returned_at ?? "") : (a.returned_at ?? "").localeCompare(b.returned_at ?? "")));
}

const keyOf = (i: Pick<Invoice, "customer_phone" | "customer_name">) => custKey(i.customer_phone, i.customer_name, getDialCode());
const due = (i: Invoice) => r2((Number(i.total) || 0) - (i.amount_paid != null ? Number(i.amount_paid) : Number(i.total) || 0));
const qtyText = (n: number) => String(q3(n)).replace(/\.0+$/, "");
/** طلبُ توصيلٍ بالطريق (المندوبُ يحصّل مجموعَ الفاتورة) — لا تُمسّ بالراجع ولا يُسدَّد منه (كالخادم). */
const inFlight = (db: ReturnType<typeof loadDB>, id: string) => (db.deliveryOrders ?? []).some((d) => d.invoice_id === id
  && (d.status === "preparing" || d.status === "out" || (d.status === "delivered" && !(d as { collected_at?: string | null }).collected_at)));

export async function demoReturnExpired(items: ExpiredItem[], meta: ExpiredMeta): Promise<unknown> {
  if (!Array.isArray(items) || items.length === 0) throw refuse("expired_empty");
  const ref = (meta.client_ref ?? "").trim();
  if (ref) { const hit = refsLoad().find((x) => x.fn === "return_expired" && x.ref === ref); if (hit) return hit.result; }
  reconcileAll();
  const db = loadDB();
  const lots = loadLots();
  const name = (meta.customer_name ?? "").trim() || null;
  const phone = (meta.customer_phone ?? "").trim() || null;
  const note = (meta.note ?? "").trim().slice(0, 120) || null;
  const method: PaymentMethod = meta.method === "card" || meta.method === "transfer" ? meta.method : "cash";
  const key = name || phone ? custKey(phone, name, getDialCode()) : null;
  const invs = (db.invoices ?? []) as Invoice[];
  const touched: string[] = [];
  const out: unknown[] = [];
  let free = 0;
  const now = new Date().toISOString();
  // الرفضُ قبل أيّ كتابة (معاملةٌ واحدة بالخادم): كلُّ السطور تُفحص أوّلاً.
  const plan = items.map((it) => {
    const qty = q3(Number(it.qty) || 0);
    const pct = Math.trunc(Number(it.pct ?? 100));
    if (!(qty > 0)) throw refuse("expired_qty");
    if (!(pct >= 1 && pct <= 100)) throw refuse("expired_pct");
    if (!it.expiry_date) throw refuse("expired_date");
    const p = (db.products ?? []).find((x) => x.id === it.product_id) as Product | undefined;
    if (!p) throw refuse("expired_product");
    if ((p.price_currency ?? "IQD") === "USD") throw refuse("expired_usd");
    if (p.pooled || p.farm_id) throw refuse("expired_pooled");
    let uret: number; let label = "";
    if (it.unit === "sub") {
      if (!p.has_sub_unit || !(Number(p.units_per_box) >= 2)) throw refuse("expired_unit");
      uret = 1 / Number(p.units_per_box); label = ` ${(p.sub_unit_name ?? "").trim() || UNIT_SUB}`;
    } else if (it.unit === "pack") {
      const k = (p.packs ?? []).find((x) => x.id === it.pack_id);
      if (!k || !(Number(k.per) >= 2)) throw refuse("expired_unit");
      uret = Number(k.per); label = ` ${(k.name ?? "").trim() || UNIT_PACK}`;
    } else if (it.unit === "box") uret = 1;
    else throw refuse("expired_unit");
    const rs = q3(qty * uret);
    if (!(rs > 0)) throw refuse("expired_qty");
    return { it, p, qty, pct, rs, uret, label };
  });

  for (const { it, p, qty, pct, rs, uret, label } of plan) {
    const fits = (l: InvoiceItem) => l.product_id === p.id && Number(l.qty) > 0 && !(Number(l.pooled_qty) > 0)
      && Number(l.stock_qty ?? l.qty) >= rs - 0.0005;
    const anchor = key ? invs.filter((i) => i.status !== "refunded" && (i.sale_kind ?? "retail") !== "opening" && (i.currency ?? "IQD") === "IQD"
        && keyOf(i) === key && !inFlight(db, i.id) && (db.invoiceItems ?? []).some((l) => l.invoice_id === i.id && fits(l)))
      .sort((a, b) => Number(due(b) > 0.005) - Number(due(a) > 0.005) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] : undefined;
    let V: number; let T: number; let Tl = 0;
    if (anchor) {
      const li = (db.invoiceItems ?? []).filter((l) => l.invoice_id === anchor.id && fits(l))
        .sort((a, b) => Number(b.stock_qty ?? b.qty) - Number(a.stock_qty ?? a.qty) || a.id.localeCompare(b.id))[0];
      // الراجعُ بوحدة السطر نفسِه (كالخادم): علبة، مفرد (١ ÷ عدده)، كارتون (عددُه).
      const lq = Number(li.qty), r = Number(li.stock_qty ?? li.qty) / lq;
      const uline = Math.abs(r - 1) < 0.0005 ? 1 : r < 1 && Number(p.units_per_box) >= 2 ? 1 / Number(p.units_per_box) : r;
      const rl = Math.min(q3(qty * uret / uline), lq);
      const oldv = Number(li.line_total), oldc = r2(lq * Number(li.unit_cost));
      let newv = 0, newc = 0;
      if (rl >= lq - 0.0005) db.invoiceItems = db.invoiceItems.filter((l) => l.id !== li.id);
      else {
        const nq = q3(lq - rl);
        newv = r2(nq * Number(li.unit_price)); newc = r2(nq * Number(li.unit_cost));
        if (li.stock_qty != null) li.stock_qty = q3(Number(li.stock_qty) * nq / lq);
        li.qty = nq; li.line_total = newv;
      }
      V = r2((oldv - newv) * pct / 100);
      T = Math.min(V, r2(oldc - newc));
      const lotq = (Number(p.stock) || 0) >= 0 ? rs : Math.max(q3((Number(p.stock) || 0) + rs), 0);
      Tl = lotq >= rs ? T : r2(T * lotq / rs);
      const restV = r2(oldv - newv - V), restC = r2(oldc - newc - Tl);
      if (restV > 0 || restC > 0 || !(db.invoiceItems ?? []).some((l) => l.invoice_id === anchor.id)) {
        db.invoiceItems.push({
          id: uid("ii"), invoice_id: anchor.id, clinic_id: null, product_id: null,
          name: `${p.name} — ${RET_WORD} ${qtyText(qty)}${label}${pct < 100 ? ` (${pct}%)` : ""}`.slice(0, 200),
          barcode: null, qty: 1, unit_price: restV, unit_cost: restC, line_total: restV, stock_qty: 0, unit_label: null, service_id: null,
          created_at: anchor.created_at,   // يومُ فاتورته (كالخادم)
        } as InvoiceItem);
      }
      if (!touched.includes(anchor.id)) touched.push(anchor.id);
    } else {
      V = r2(Math.abs(Number(it.unit_price) || 0) * qty * pct / 100);
      const unit = Math.max(0, Number(p.avg_cost ?? p.purchase_price ?? 0) || 0);
      T = Math.min(V, r2(unit * rs));
      free = r2(free + V);
    }
    // ما يدخل الدفعة: ما فوق عجز الرصيد (الدفعاتُ مجموعُها max(الرصيد، ٠)) — وكلفتُه بنسبته (كالخادم).
    const lotq = (Number(p.stock) || 0) >= 0 ? rs : Math.max(q3((Number(p.stock) || 0) + rs), 0);
    if (!anchor) Tl = lotq >= rs ? T : r2(T * lotq / rs);
    p.stock = q3((Number(p.stock) || 0) + rs);
    if (lotq > 0) lots.push({
      id: uid("lot"), product_id: p.id, qty: lotq, received_qty: lotq, expiry_date: it.expiry_date, received_at: now, source: "return",
      purchase_id: null, company_name: null, note, unit_cost: Math.round((Tl / lotq) * 1e6) / 1e6, return_from: (name ?? phone ?? "").slice(0, 120) || null,
      return_key: key, return_pct: pct, return_invoice: anchor?.id ?? null, returned_at: now,
    });
    out.push({ product_id: p.id, name: p.name, stock_qty: rs, value: V, cost: Tl, lot_qty: lotq, invoice_id: anchor?.id ?? null });
  }

  let debt = 0, cash = 0;
  for (const id of touched) {
    const inv = invs.find((i) => i.id === id) as Invoice;
    const left = (db.invoiceItems ?? []).filter((l) => l.invoice_id === id);
    const subtotal = r2(left.reduce((s, l) => s + Number(l.line_total), 0));
    const cost = r2(left.reduce((s, l) => s + r2(Number(l.qty) * Number(l.unit_cost)), 0));
    const oldTotal = Number(inv.total) || 0;
    const paid = inv.amount_paid != null ? Number(inv.amount_paid) : oldTotal;
    const forg = consumeForgiveness(Math.max(0, r2(subtotal - Math.max(0, Number(inv.discount) || 0))), paid, inv.forgiven);
    if (forg.consumed > 0) demoConsumeForgiveness(db, inv, forg.consumed, RET_CAT, oldTotal, paid);
    const back = Math.max(0, r2(paid - forg.total));
    debt = r2(debt + Math.max(0, r2((oldTotal - paid) - Math.max(0, forg.total - paid + back))));
    if (back > 0) {
      const legs = [...(inv.payment_details ?? [])];
      const pos = legs.filter((l) => l.amount > 0);
      // الساقُ بطريقة الشاشة (كالتسديد بعدها) — الجيبُ الذي خرج منه المالُ فعلاً.
      const posSum = r2(pos.reduce((s, l) => s + l.amount, 0));
      if (posSum < paid) legs.push({ method: (inv.payment_method ?? method) as PaymentMethod, amount: r2(paid - posSum), at: inv.created_at });
      legs.push({ method, amount: -back, at: new Date().toISOString(), note: RET_WORD });
      inv.payment_details = legs;
      cash = r2(cash + back);
    }
    inv.subtotal = subtotal; inv.total = forg.total;
    if (inv.forgiven != null || forg.forgiven) inv.forgiven = forg.forgiven;
    inv.cost_total = cost; inv.profit = r2(forg.total - cost);
    inv.item_count = Math.round(left.reduce((s, l) => s + Number(l.qty), 0));
    inv.amount_paid = Math.max(0, r2(paid - back));
    const posL = (inv.payment_details ?? []).filter((l) => l.amount > 0);
    if (posL.length) inv.payment_method = posL.reduce((b, x) => (x.amount > b.amount ? x : b), posL[0]).method;
    const stamp = `${RET_WORD} ${new Date().toLocaleDateString("en-CA")}: ${oldTotal.toLocaleString("en-US")} ← ${forg.total.toLocaleString("en-US")}${back > 0 ? ` · ${BACK_WORD} ${back.toLocaleString("en-US")}` : ""}${note ? ` · ${note}` : ""}`;
    inv.notes = inv.notes ? `${inv.notes}\n${stamp}` : stamp;
  }
  saveLots(lots);
  saveDB(db);
  if (free > 0) {
    demoAddExpense({ amount: free, description: `${RET_WORD}${name ? ` — ${name}` : ""}${note ? ` (${note})` : ""}`.slice(0, 200),
      category: RET_CAT, method: method === "transfer" ? "bank" : method, spent_at: new Date().toISOString() });
    cash = r2(cash + free);
  }
  // ما خرج نقداً والزبونُ عليه دَين: يُسدَّد به أقدمُ دَينه (نقدٌ يخرج ونقدٌ يدخل — الدرجُ لا يتحرّك).
  if (cash > 0 && key) {
    let left = cash;
    const db2 = loadDB();
    const debts = ((db2.invoices ?? []) as Invoice[]).filter((i) => i.status !== "refunded" && (i.currency ?? "IQD") === "IQD" && due(i) > 0.005 && keyOf(i) === key && !inFlight(db2, i.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    for (const d of debts) {
      if (left <= 0) break;
      const pay = Math.min(left, due(d));
      await demoRepo.settleInvoice(d.id, pay, method);
      left = r2(left - pay); debt = r2(debt + pay);
    }
    cash = left;
  }
  const result = { lines: out, invoices: touched, debt, cash, customer: name ?? phone };
  if (ref) refsSave([...refsLoad(), { fn: "return_expired", ref, result }]);
  return result;
}

/** البيعةُ ثمّ سطرُ الدفعة بكلفتها والدفعةُ تنقص — والإعادةُ بالمرجع لا تنقصها ثانيةً. */
export async function demoCheckoutLots(items: CheckoutItem[], meta: SaleMeta, usd: unknown[] | null, charges: string[] | null):
  Promise<{ iqd: Invoice | null; usd: Invoice | null }> {
  const ref = (meta.client_ref ?? "").trim();
  if (!ref) throw refuse("lot_ref");
  reconcileAll();
  // الرفضُ قبل البيعة (معاملةٌ واحدة بالخادم: رفضُ سطر الدفعة يُرجع البيعة).
  const lots0 = loadLots();
  const done = refsLoad().some((x) => x.fn === "lot_sale" && x.ref === ref);
  if (!done) for (const it of items) {
    if (!it.lot_id) continue;
    const l = lots0.find((x) => x.id === it.lot_id && x.source === "return");
    if (!l || l.product_id !== it.product_id) throw refuse("lot_gone");
    if (l.qty < Number(it.stock_qty ?? it.qty) - 0.0005) throw refuse("lot_short");
  }
  // فاتورةٌ ثبتت بالمرجع قبل هذا النداء (بطريقٍ آخر) لا تُختم ولا تُنقص الدفعةُ عنها — كالخادم (recorded_at/created_at < now()).
  const existed = (loadDB().invoices ?? []).some((i) => (i as Invoice & { client_ref?: string | null }).client_ref === ref);
  const snap = JSON.stringify(loadDB());   // البيعةُ وسطرُ الدفعة معاملةٌ واحدة بالخادم — رفضُ السطر يُرجع البيعة
  let res: { iqd: Invoice | null; usd: Invoice | null };
  if (usd && usd.length) {
    const m = await import("./demoDual");
    res = await m.demoMixedCheckout(items, usd as never, meta as never, charges ?? []);
  } else if (charges && charges.length) {
    res = { iqd: await (await import("./doseApi")).checkoutWithDoses(items, meta), usd: null };
  } else res = { iqd: await demoRepo.retailCheckout(items, meta), usd: null };
  if (!res.iqd || done || existed) return res;
  const db = loadDB();
  const inv = (db.invoices ?? []).find((i) => i.id === res.iqd?.id);
  if (!inv) return res;
  // الدفعاتُ كما كانت قبل البيعة (المطابقةُ تجري بعد القراءة لا مع البيعة): الدفعةُ تنقص أوّلاً، ثمّ المطابقةُ تأخذ الباقيَ من غير الراجع —
  // كالخادم: نقصُ الدفعة بالمعاملة نفسِها، والمطابقةُ المؤجَّلة تجد ما بقي.
  const lots = loadLots();
  const used: string[] = [];
  let delta = 0;
  for (const it of items) {
    if (!it.lot_id) continue;
    const l = lots.find((x) => x.id === it.lot_id) as ProductLot;
    const sq = q3(Number(it.stock_qty ?? it.qty)), q = q3(Number(it.qty));
    const li = (db.invoiceItems ?? []).find((x) => x.invoice_id === inv.id && !used.includes(x.id) && x.product_id === l.product_id
      && Number(x.qty) === q && Number(x.stock_qty ?? x.qty) === sq && r2(Number(x.unit_price)) === r2(Number(it.unit_price)));
    if (!li) { saveDB(JSON.parse(snap)); throw refuse("lot_line"); }
    const uc = r2(Number(l.unit_cost ?? 0) * sq / q);
    delta = r2(delta + r2(q * uc) - r2(Number(li.qty) * Number(li.unit_cost)));
    li.unit_cost = uc;
    used.push(li.id);
    l.qty = q3(l.qty - sq);
  }
  inv.cost_total = r2((Number(inv.cost_total) || 0) + delta);
  inv.profit = r2((Number(inv.profit) || 0) - delta);
  saveLots(lots);
  saveDB(db);
  reconcileAll();
  refsSave([...refsLoad(), { fn: "lot_sale", ref, result: null }]);
  return { ...res, iqd: inv };
}
