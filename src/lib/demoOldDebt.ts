/* ============================================================================
 * مرآةُ الدين القديم (0271) للتجريبيّ — حرّاسُ old_debt_add نفسُها بترتيبها (CLAUDE.md §٤: حارسٌ لا يوجد هنا حارسٌ لم يُفحص):
 * المديرُ وحده (أو مفتاحُه الحيّ)، والمرجعُ يُرجع الدينَ نفسَه قبل أيّ فحص، والزبونُ بمفتاحه، و«شنو» ولا أطول من حدّه، والعملةُ،
 * والمبلغُ، والتاريخُ (لا أبعد من الغد ولا قبل ٢٠٠٠). واليومُ ⇒ الآن، وما قبله ظهراً ببغداد وختمُ الإدخال الآن. والدولار: الدينارُ
 * الكامل بسعر اليوم (iqdOf بخطوة ١، كسطر usd_checkout). والشكل: بلا أسطرٍ ولا ربحٍ ولا كلفة، مدفوعُه صفر، بلا طريقة دفع.
 * وحرّاسُ ما بعد الإدراج (لا ترجيع، لا أسطر، الحذفُ بلا تسديد، الربحُ صفرٌ بالخصم) بـrepoDemo نفسِه — كمحفّزات القاعدة.
 * كسولةٌ من باب oldDebtApi وحده.
 * ========================================================================= */
import type { Invoice, OldDebtItem, OldDebtReturn, PaymentSplit as PaymentLeg } from "@/types";
import type { OldDebtInput, OldDebtReturnInput } from "./oldDebtApi";
import { loadDB, saveDB } from "./demoStore";
import { demoAuditPush, demoBaseRole, demoClinicId, demoPinLive, demoConsumeForgiveness } from "./repoDemo";
import { demoUsdState } from "./demoUsd";
import { centsOf, iqdOf, decText, decOf } from "./usdMath";
import { custKey } from "./customerKey";
import { getDialCode } from "./settings";
import { uid } from "./utils";

const err = (c: string, sqlstate = "P0001") => Object.assign(new Error(c), { code: sqlstate });
const clean = (s: string | null | undefined, collapse = false): string | null => {
  const t = (collapse ? (s ?? "").replace(/[ \t\r\n]+/g, " ") : (s ?? "")).trim();
  return t === "" ? null : t;
};
const len = (s: string | null) => [...(s ?? "")].length;
/** اليومُ ببغداد YYYY-MM-DD — «اليوم» الذي يقارن به الخادم. */
export const baghdadToday = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const addDays = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* 0273: الرقمُ كما يقبله الخادم (`^[0-9]+(\.[0-9]+)?$` على النصّ مقصوصاً) — لا فاصلةَ ولا سالبَ ولا أرقامَ شرقية (الشاشةُ ترسل canonDec). */
const plainDec = (v: unknown): string | null => {
  const t = v == null ? "" : String(v).trim();
  return /^[0-9]+(\.[0-9]+)?$/.test(t) ? t : null;
};
/** round(a / b) بنصفٍ بعيداً عن الصفر — كـround(numeric) (القيمُ هنا موجبة). */
const divRound = (a: bigint, b: bigint): bigint => (2n * a + b) / (2n * b);
/* نصوصُ الخادم المخزَّنة حرفاً — بياناتٌ تُقارن بالقاعدة لا واجهة، فبرموزها (كفئة «مرتجع» بـrepoDemo):
 *   SEP = «، » (array_to_string بـold_debt_add_items)، RET = «مرتجع» (ساقُ النقد الخارج وسطرُ الخصم المستهلَك)،
 *   CASH_BACK = «أُعيد نقداً» (ختمُ الملاحظات بـold_debt_return). */
const SEP = "\u060c ";
const RET = "\u0645\u0631\u062a\u062c\u0639";
const CASH_BACK = "\u0623\u064f\u0639\u064a\u062f \u0646\u0642\u062f\u0627\u064b";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function demoOldDebtAdd(x: OldDebtInput): Promise<Invoice> {
  if (demoBaseRole() === "photographer") throw err("photographer_forbidden", "42501");
  const db = loadDB();
  const ref = clean(x.clientRef);
  /* 0273 (old_debt_add_items) بترتيبه: القائمةُ ١–١٠٠، ثمّ مرجعٌ ثبت ⇒ بابُ old_debt_add نفسُه، ثمّ المرورُ الأوّل (المادّةُ من
   * المخزن واسمُها من الصفّ، أو اسمٌ مكتوب) ومنه «شنو» الفارغ — ثمّ الدينُ، ثمّ الكميةُ والسعرُ والمجموع. */
  const items = x.items && x.items.length > 0 ? x.items : null;
  let whatIn = x.what;
  let names: string[] = [];
  if (items) {
    if (items.length > 100) throw err("old_debt_items");
    const prior = ref ? (db.invoices ?? []).find((v) => v.client_ref === ref) : undefined;
    if (!prior) {
      for (const it of items) {
        if (!it || typeof it !== "object") throw err("old_debt_item");
        const pid = clean(it.product_id ?? null);
        if (pid) {
          if (!UUID.test(pid) && !(db.products ?? []).some((p) => p.id === pid)) throw err("old_debt_item");
          const p = (db.products ?? []).find((q) => q.id === pid && !q.farm_id);
          if (!p) throw err("old_debt_item_product");
          names.push([...p.name.trim()].slice(0, 120).join(""));
        } else {
          const nm = clean(it.name, true);
          if (!nm || len(nm) > 120) throw err("old_debt_item_name");
          names.push(nm);
        }
      }
      if (!clean(whatIn, true)) whatIn = [...names.join(SEP)].slice(0, 200).join("");
    }
  }
  if (demoBaseRole() !== "manager" && !demoPinLive()) throw err("old_debt_manager", "42501");
  if (ref) {
    const prior = (db.invoices ?? []).find((v) => v.client_ref === ref);
    if (prior) {
      if (prior.sale_kind !== "opening") throw err("old_debt_ref");
      return prior;
    }
  }
  const name = clean(x.name, true), phone = clean(x.phone), what = clean(whatIn, true), why = clean(x.why);
  if (!custKey(phone, name, getDialCode())) throw err("old_debt_customer");
  if (!what) throw err("old_debt_what");
  if (len(what) > 200 || len(why) > 500 || len(name) > 80 || len(phone) > 40) throw err("old_debt_long");
  const cur = (clean(x.currency) ?? "IQD").toUpperCase();
  if (cur !== "IQD" && cur !== "USD") throw err("old_debt_currency");
  const cents = centsOf(x.amount);
  if (cents == null || cents <= 0n) throw err("old_debt_amount");
  const today = baghdadToday();
  const date = clean(x.date);
  if (date != null && (date > addDays(today, 1) || date < "2000-01-01")) throw err("old_debt_date");
  const now = new Date().toISOString();
  const backdated = date != null && date < today;
  const createdAt = backdated ? new Date(`${date}T12:00:00+03:00`).toISOString() : now;

  let total: number, usd: { fx_rate: number; total_usd: number } | null = null;
  let rate1e4: bigint | null = null;
  if (cur === "USD") {
    const st = await demoUsdState();
    if (!st.enabled) throw err("usd_disabled");
    if (!st.rate) throw err("usd_no_rate");
    rate1e4 = st.rate.rate1e4;
    total = Number(iqdOf(cents, st.rate.rate1e4, 1));
    usd = { fx_rate: Number(st.rate.rate), total_usd: Number(decText(cents, 2)) };
  } else {
    total = Number(decText(cents, 2));
  }
  if (total <= 0 || total >= 1e10 || (usd != null && usd.total_usd >= 1e12)) throw err("old_debt_amount");

  // 0273: المرورُ الثاني — الكميةُ موجبة والسعرُ صفرٌ فأكثر (بعملة الدين)، ومجموعُ round(كمية × سعر، ٢) ≤ المبلغ.
  const lines: OldDebtItem[] = [];
  if (items) {
    let sum = 0n;
    const amountCents = usd ? (centsOf(usd.total_usd) ?? 0n) : (centsOf(total) ?? 0n);
    items.forEach((it, i) => {
      const nm = names[i];
      const qt = plainDec(it.qty), pt = plainDec(it.price);
      const q = qt == null ? null : decOf(qt, 3);
      const pc = pt == null ? null : decOf(pt, 2);
      if (q == null || q <= 0n || q >= 1_000_000_000n) throw err("old_debt_item_qty");
      if (pc == null || pc >= (usd ? 100_000_000_000n : 1_000_000_000_000n)) throw err("old_debt_item_price");
      sum += divRound(q * pc, 1000n);
      lines.push({
        id: uid("odi"), clinic_id: demoClinicId() ?? null, invoice_id: "", product_id: clean(it.product_id ?? null),
        name: nm, qty: Number(decText(q, 3)),
        unit_price: usd && rate1e4 != null ? Number(iqdOf(pc, rate1e4, 1)) : Number(decText(pc, 2)),
        unit_price_usd: usd ? Number(decText(pc, 2)) : null, returned_qty: 0, created_at: new Date().toISOString(),
      });
    });
    if (sum > amountCents) throw err("old_debt_items_sum");
  }

  const inv: Invoice = {
    id: uid("inv"),
    clinic_id: demoClinicId() ?? null,
    customer_name: name, customer_phone: phone, pet_name: null,
    subtotal: total, discount: 0, discount_type: null,
    payment_method: null, payment_details: [],
    total, amount_paid: 0, cost_total: 0, profit: 0, item_count: 0,
    print_count: 0, status: "paid", refunded_at: null, staff_id: null, notes: null,
    sale_kind: "opening", client_ref: ref, created_at: createdAt, recorded_at: backdated ? now : null,
    opening_what: what, opening_why: why,
    ...(usd ? { currency: "USD", fx_rate: usd.fx_rate, total_usd: usd.total_usd, paid_usd: 0 } : { currency: "IQD" }),
  } as Invoice;
  (db.invoices ??= []).push(inv);
  if (lines.length) db.oldDebtItems = [...(db.oldDebtItems ?? []), ...lines.map((l) => ({ ...l, invoice_id: inv.id }))];
  saveDB(db);
  // سطرُ التدقيق كمحفّزه (audit_change + فرعُ 0271): قائمةُ keep، وختمُ المؤرَّخ ويومُه، وعلامةُ الدين القديم وما هو.
  demoAuditPush({
    action: "INSERT", entity: "invoices", entity_id: inv.id,
    details: {
      total, customer_name: name, status: "paid",
      ...(backdated ? { recorded_at: now, sold_at: createdAt } : {}),
      sale_kind: "opening", opening_what: what,
    },
  });
  return inv;
}

/* ── موادُّ الدين القديم ومرتجعُها (0273) ──────────────────────────────────────────────────────────────── */

export async function demoOldDebtItems(invoiceId: string): Promise<OldDebtItem[]> {
  if (demoBaseRole() === "photographer") throw err("photographer_forbidden", "42501");
  return (loadDB().oldDebtItems ?? []).filter((d) => d.invoice_id === invoiceId);
}

/** مرآةُ old_debt_return بترتيبها: الدينُ القديم بعيادتك، ثمّ مرجعٌ ثبت ⇒ هو، ثمّ الدولارُ بمرحلته، ثمّ السطور (لا أكثر من الباقي،
 *  والمادّةُ لرفّها أو لأصلها إن اندمجت، والمحذوفةُ تُرفض)، ثمّ المالُ بقاعدة 0121/0241: الدينُ أوّلاً ثمّ الخصمُ ثمّ النقد. */
export async function demoOldDebtReturn(x: OldDebtReturnInput): Promise<Invoice> {
  if (demoBaseRole() === "photographer") throw err("photographer_forbidden", "42501");
  const db = loadDB();
  const inv = (db.invoices ?? []).find((v) => v.id === x.invoiceId);
  if (!inv || inv.sale_kind !== "opening") throw err("old_debt_not_found");
  const ref = clean(x.clientRef);
  if (ref && (db.oldDebtReturns ?? []).some((r) => r.client_ref === ref)) return inv;
  if (inv.currency === "USD") throw err("old_debt_return_usd");
  if (!Array.isArray(x.lines) || x.lines.length === 0) throw new Error("nothing to return");
  const note = clean(x.note);
  if (len(note) > 200) throw err("old_debt_long");

  const items = (db.oldDebtItems ?? []).map((d) => ({ ...d }));
  const products = db.products ?? [];
  const restock = new Map<string, bigint>();
  const done: OldDebtReturn["lines"] = [];
  let val = 0n;
  for (const e of x.lines) {
    if (!e || typeof e !== "object" || !UUID.test(String(e.item_id ?? "")) && !items.some((d) => d.id === e.item_id)) throw err("old_debt_return_item");
    const qt = plainDec(e.qty);
    if (qt == null) throw err("old_debt_return_item");
    const q = decOf(qt, 3)!;
    if (q === 0n) continue;
    const it = items.find((d) => d.id === e.item_id && d.invoice_id === inv.id);
    if (!it) throw err("old_debt_return_item");
    const left = (decOf(it.qty, 3) ?? 0n) - (decOf(it.returned_qty, 3) ?? 0n);
    if (q > left) throw err("old_debt_return_over");
    let target: string | null = null;
    if (it.product_id) {
      target = it.product_id;
      for (let hops = 0; !products.some((p) => p.id === target); hops++) {
        const t = (db.productsTrash ?? []).find((r) => r.id === target);
        target = t?.merged_into ?? null;
        if (!target || hops >= 5) throw err("old_debt_return_gone");
      }
      restock.set(target, (restock.get(target) ?? 0n) + q);
    }
    it.returned_qty = Number(decText((decOf(it.returned_qty, 3) ?? 0n) + q, 3));
    const lineVal = divRound(q * (centsOf(it.unit_price) ?? 0n), 1000n);
    val += lineVal;
    done.push({ item_id: it.id, name: it.name, qty: Number(decText(q, 3)), value: Number(decText(lineVal, 2)), product_id: target });
  }
  if (done.length === 0) throw new Error("nothing to return");

  for (const [pid, q] of [...restock.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const p = products.find((r) => r.id === pid)!;
    p.stock = Number(decText((decOf(p.stock ?? 0, 3) ?? 0n) + q, 3));
  }

  const c = (n: number | null | undefined) => centsOf(n ?? 0) ?? 0n;
  const paid = c(inv.amount_paid), forgOld = c(inv.forgiven);
  const gross = c(inv.total) + forgOld - val;
  if (gross < 0n) throw err("old_debt_return_value");
  const big = (a: bigint, b: bigint) => (a > b ? a : b), small = (a: bigint, b: bigint) => (a < b ? a : b);
  const forgNew = small(forgOld, big(0n, gross - paid));
  const total = gross - forgNew;
  const back = big(paid - total, 0n);
  const num = (v: bigint) => Number(decText(v, 2));

  let details: PaymentLeg[] = [...(inv.payment_details ?? [])];
  if (back > 0n) {
    const top = details.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.method;
    const method = (clean(x.method) ?? top ?? inv.payment_method ?? "cash") as PaymentLeg["method"];
    const pos = details.filter((l) => l.amount > 0).reduce((s2, l) => s2 + c(l.amount), 0n);
    if (pos < paid) details.push({ method: (inv.payment_method ?? method) as PaymentLeg["method"], amount: num(paid - pos), at: inv.created_at });
    details.push({ method, amount: -num(back), at: new Date().toISOString(), note: [...(RET + (note ? `: ${note}` : ""))].slice(0, 120).join("") } as PaymentLeg);
  }
  if (forgNew < forgOld) demoConsumeForgiveness(db, inv, num(forgOld - forgNew), RET, Number(inv.total ?? 0), num(paid));

  const day = baghdadToday();
  const qtyTxt = (n: number) => String(Number(n));
  const stamp = `${RET} ${day}: ${done.map((l) => `${l.name} × ${qtyTxt(l.qty)}`).join(SEP)} · ${Number(inv.total ?? 0)} ← ${num(total)}`
    + (back > 0n ? ` · ${CASH_BACK} ${num(back)}` : "") + (note ? ` · ${[...note].slice(0, 120).join("")}` : "");
  Object.assign(inv, {
    subtotal: num(gross), total: num(total), forgiven: num(forgNew), amount_paid: num(big(paid - back, 0n)),
    payment_details: details, notes: inv.notes ? `${inv.notes}\n${stamp}` : stamp, profit: 0, cost_total: 0, item_count: 0,
  });
  db.oldDebtItems = items;
  db.oldDebtReturns = [...(db.oldDebtReturns ?? []), {
    id: uid("odr"), clinic_id: demoClinicId() ?? null, invoice_id: inv.id, client_ref: ref, lines: done,
    value: num(val), cash_back: num(back), note, created_at: new Date().toISOString(), created_by: null,
  }];
  saveDB(db);
  demoAuditPush({ action: "UPDATE", entity: "invoices", entity_id: inv.id, details: { total: inv.total, notes: stamp } });
  return inv;
}
