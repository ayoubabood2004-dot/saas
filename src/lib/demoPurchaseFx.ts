/* ============================================================================
 * الشراءُ بالعملتين ودفترُ الشركة بالعملتين (0274) بالتجريبيّ — مرآةُ record_purchase_fx وupdate_purchase_fx وpurchase_pay_fx
 * وcompany_pay_fx وcompany_opening_add_fx وcompany_adjust_fx بحسابها وحرّاسها، **فوق** recordPurchase وupdatePurchase وcompanyPay
 * التجريبيّة كما يقف الخادمُ فوق جسميه. الحسابُ بالأعداد الصحيحة (BigInt: سنتات، وسعرٌ بأربع منازل، وكميةٌ بثلاث) — كـnumeric
 * بالقاعدة، لا عائماً. كسولٌ من باب repoDemo وحده (loadDemoPurchaseFx).
 * ========================================================================= */
import type { CompanyEntry, CompanyPayResult, PaymentMethod, Purchase, PurchaseDraftLine, PurchaseMeta } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { demoRepo, demoPurchaseDoor, demoPoolDue, demoPoolDueUsd, demoLedgerGuard, demoEntry, demoHint, demoInventoryRole, demoChargesNorm } from "./repoDemo";
import type { PurchaseCharge } from "@/types";
import { demoUsdState } from "./demoUsd";
import { decOf, decText, iqdOf } from "./usdMath";
import { localISO, uid } from "./utils";

type Cur = "IQD" | "USD";
const RS = 10_000n;
const C = (v: unknown): bigint => decOf(v as string | number | null | undefined, 2) ?? 0n;
const n2 = (c: bigint): number => Number(decText(c, 2));
const n4 = (r: bigint): number => Number(decText(r, 4));
function dr(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  const neg = (a < 0n) !== (b < 0n);
  const aa = a < 0n ? -a : a, bb = b < 0n ? -b : b;
  const q = (2n * aa + bb) / (2n * bb);
  return neg ? -q : q;
}
const maxB = (a: bigint, b: bigint) => (a > b ? a : b);
const minB = (a: bigint, b: bigint) => (a < b ? a : b);
const statusOf = (total: bigint, paid: bigint): "paid" | "unpaid" | "partial" => (paid >= total ? "paid" : paid <= 0n ? "unpaid" : "partial");
/** _usd_share بالسنتات: حصّةُ الدينار (ديناراً كاملاً) بنسبة الفاتورة، والإغلاقُ باقي الدينار بالضبط. */
function shareC(usd: bigint, dueUsd: bigint, dueIqd: bigint, totalUsd: bigint, totalIqd: bigint): bigint {
  const due = maxB(dueIqd, 0n);
  if (usd >= dueUsd) return due;
  if (totalUsd <= 0n) return 0n;
  return minB(maxB(dr(usd * totalIqd, totalUsd * 100n) * 100n, 0n), due);
}
const rateOk = (r: bigint | null): r is bigint => r != null && r >= 100n * RS && r <= 100_000n * RS;
const badRate = () => demoHint("bad_rate", "اكتب سعر الدولار (بين 100 و100000 دينار).");
const curOf = (v: unknown): Cur => {
  const c = String(v ?? "IQD").toUpperCase();
  if (c !== "IQD" && c !== "USD") throw demoHint("bad_currency", "العملة دينار أو دولار.");
  return c;
};
const METHODS = new Set(["cash", "card", "transfer"]);
const usdCtx = async () => {
  const s = await demoUsdState();
  return { enabled: s.enabled, rate: s.rate ? s.rate.rate1e4 : null };
};
/** _purchase_rate: المكتوبُ وإلا سعرُ العيادة، بأربع منازل. */
function rateOf(meta: PurchaseMeta, fallback: bigint | null): bigint {
  const v = meta.fx_rate != null && String(meta.fx_rate) !== "" ? decOf(meta.fx_rate, 4) : fallback;
  if (v == null) throw demoHint("usd_no_rate", "اكتب سعر الدولار للفاتورة.");
  if (!rateOk(v)) throw demoHint("bad_rate", "سعرُ الدولار لازم بين 100 و100000 دينار.");
  return v;
}
const stripFx = (m: PurchaseMeta): PurchaseMeta => {
  const { currency: _c, fx_rate: _r, discount_usd: _d, amount_paid_usd: _p, ...rest } = m;
  return rest;
};

interface Prep { line: PurchaseDraftLine; sc: Cur; u: bigint | null; su: bigint; n: number }
/** _purchase_fx_prep: عملةُ بيع كلّ سطر، وكلفتُه بالدولار ودينارُها، وسعرُ بيعه بالدولار — ويُرسل بسعر بيعٍ صفر لما يُباع بالدولار. */
function prep(lines: PurchaseDraftLine[], cur: Cur, rate: bigint | null): Prep[] {
  const prods = loadDB().products ?? [];
  return lines.map((it, i) => {
    const prod = it.product_id ? prods.find((p) => p.id === it.product_id) : undefined;
    const sc = curOf(prod?.price_currency ?? (it.sell_currency || "IQD"));
    const su = C(it.sell_price_usd ?? 0);
    if (su < 0n) throw demoHint("bad_price", `سعرُ البيع بالسطر ${i + 1} سالب.`);
    const line: PurchaseDraftLine = { ...it };
    let u: bigint | null = null;
    if (cur === "USD") {
      u = C(it.purchase_price_usd ?? 0);
      if (u < 0n) throw demoHint("bad_price", `سعرُ الشراء بالسطر ${i + 1} سالب.`);
      line.purchase_price = n2(dr(u * rate!, RS));
    }
    if (sc === "USD") line.sell_price = 0;
    return { line, sc, u, su, n: i + 1 };
  });
}
/** _purchase_fx_after: كلُّ سطرٍ بمادّته من الكشف (ما كتبه هذا النداءُ وحده — من `from`)، ثمّ تُختم السطور. */
function after(purchaseId: string, op: "record" | "update", preps: Prep[], cur: Cur, rate: bigint | null, from: number): void {
  const db = loadDB();
  const effects = (db.purchaseEffects ?? []).slice(from).filter((e) => e.purchase_id === purchaseId && e.op === op && e.outcome !== "removed");
  const items = (db.purchaseItems ?? []).filter((x) => x.purchase_id === purchaseId);
  for (const x of preps) {
    const e = effects.find((f) => f.line_no === x.n);
    if (!e?.product_id) continue;
    const p = (db.products ?? []).find((q) => q.id === e.product_id);
    if (!p) continue;
    const su = x.su > 0n ? n2(x.su) : null;
    const u = cur === "USD" && x.u != null && x.u > 0n ? n2(x.u) : null;
    if (e.outcome === "created" && x.sc === "USD") {
      if ((p.price_currency ?? "IQD") === "IQD") Object.assign(p, { price_currency: "USD", sell_price_usd: su, purchase_price_usd: u });
    } else if (p.price_currency === "USD" && (su != null || u != null)) {
      if (su != null) p.sell_price_usd = su;
      if (u != null) p.purchase_price_usd = u;
    }
    const c: Cur = p.price_currency === "USD" ? "USD" : "IQD";
    for (const it of items) if (it.product_id === p.id) Object.assign(it, { sell_currency: c, sell_price_usd: c === "USD" ? su : null });
  }
  for (const it of items) it.purchase_price_usd = cur === "USD" ? n2(dr(C(it.purchase_price) * RS, rate!)) : null;
  saveDB(db);
}
/** رأسُ فاتورة الدولار كما يكتبه الخادمُ بعد جسمه. */
function stampUsd(purchaseId: string, rate: bigint, totalUsd: bigint, discUsd: bigint, paidUsd: bigint, charges: PurchaseCharge[]): Purchase {
  const db = loadDB();
  const p = (db.purchases ?? []).find((x) => x.id === purchaseId)!;
  const total = C(p.total);
  Object.assign(p, {
    currency: "USD", fx_rate: n4(rate), total_usd: n2(totalUsd), discount_usd: n2(discUsd), paid_usd: n2(paidUsd),
    amount_paid: n2(shareC(paidUsd, totalUsd, total, totalUsd, total)), status: statusOf(totalUsd, paidUsd),
    // 0276: القائمةُ بدولارها (جسمُ الشراء حفظها بالدينار وحده).
    charges: charges.length ? charges : null,
  });
  saveDB(db);
  return { ...p };
}
function sums(preps: Prep[]): bigint {
  let s = 0n;
  for (const x of preps) s += (decOf(x.line.qty as unknown as string, 3) ?? 0n) * (x.u ?? 0n);
  return dr(s, 1000n);
}
const discIqd = (disc: bigint, gross: bigint, rate: bigint): number =>
  disc >= gross && gross > 0n ? 999_999_999_999 : n2(dr(disc * rate, RS));

export async function demoRecordPurchaseFx(lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase> {
  demoInventoryRole();
  const cur = curOf(meta?.currency || "IQD");
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("empty purchase");
  const ctx = await usdCtx();
  let rate: bigint | null = null;
  if (cur === "USD") {
    if (!ctx.enabled) throw demoHint("usd_disabled", "الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.");
    rate = rateOf(meta, ctx.rate);
  }
  const preps = prep(lines, cur, rate);
  const from = (loadDB().purchaseEffects ?? []).length;
  const m = stripFx(meta);
  let p: Purchase;
  if (cur === "IQD") {
    p = await demoRepo.recordPurchase(preps.map((x) => x.line), m);
  } else {
    const gross = sums(preps);
    const disc = gross > 0n ? minB(maxB(C(meta.discount_usd ?? 0), 0n), gross) : 0n;
    // 0276: الأجورُ بعملة الفاتورة — دولارُ ما على الشركة يدخل total_usd، ودينارُ كلّ أجرةٍ بسعر الفاتورة لجسم الشراء.
    const ch = demoChargesNorm(meta.charges ?? null, n4(rate!));
    const total = gross - disc + C(ch.companyUsd);
    const paid = minB(maxB(meta.amount_paid_usd != null ? C(meta.amount_paid_usd) : total, 0n), total);
    const rec = await demoRepo.recordPurchase(preps.map((x) => x.line), { ...m, discount: discIqd(disc, gross, rate!), amount_paid: 0, charges: ch.list });
    p = stampUsd(rec.id, rate!, total, disc, paid, ch.list);
  }
  after(p.id, "record", preps, cur, rate, from);
  return (loadDB().purchases ?? []).find((x) => x.id === p.id) ?? p;
}

export async function demoUpdatePurchaseFx(purchaseId: string, lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase> {
  demoInventoryRole();
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("empty purchase");
  const db = loadDB();
  const old = (db.purchases ?? []).find((x) => x.id === purchaseId);
  if (!old) throw new Error("purchase not found");
  const oldCur: Cur = old.currency === "USD" ? "USD" : "IQD";
  const cur = curOf(meta?.currency || oldCur);
  if (cur !== oldCur && (db.purchasePayments ?? []).some((x) => x.purchase_id === purchaseId)) {
    throw demoHint("currency_has_payments", "على الفاتورة دفعاتٌ مسجّلة بعملتها — ألغِها أوّلاً قبل تغيير العملة.");
  }
  const ctx = await usdCtx();
  let rate: bigint | null = null;
  if (cur === "USD") {
    if (oldCur !== "USD" && !ctx.enabled) throw demoHint("usd_disabled", "الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.");
    rate = rateOf(meta, old.fx_rate != null ? decOf(old.fx_rate, 4) : ctx.rate);
  }
  const preps = prep(lines, cur, rate);
  // 0276: جهازٌ ما تحدّث (بلا مفتاح charges) يُبقي الأجور — إلا تبديلَ عملة فاتورةٍ عليها أجور: محفوظةٌ بعملةٍ لا تُقرأ بالأخرى.
  if (meta?.charges === undefined && cur !== oldCur && (old.charges?.length ?? 0) > 0) {
    throw demoHint("charges_currency", "على الفاتورة أجور إضافية بعملتها — حدّث الصفحة قبل تغيير العملة.");
  }
  const from = (loadDB().purchaseEffects ?? []).length;
  const m = stripFx(meta);
  let p: Purchase;
  if (cur === "IQD") {
    await demoPurchaseDoor(() => demoRepo.updatePurchase(purchaseId, preps.map((x) => x.line), m));
    const d2 = loadDB();
    const row = (d2.purchases ?? []).find((x) => x.id === purchaseId)!;
    if (oldCur === "USD") {
      Object.assign(row, { currency: "IQD", fx_rate: null, total_usd: null, paid_usd: null, discount_usd: null });
      saveDB(d2);
    }
    p = { ...row };
  } else {
    const gross = sums(preps);
    const discIn = "discount_usd" in (meta ?? {}) ? C(meta.discount_usd ?? 0) : C(old.discount_usd ?? 0);
    const disc = gross > 0n ? minB(maxB(discIn, 0n), gross) : 0n;
    const ch = demoChargesNorm(meta.charges !== undefined ? meta.charges : (old.charges ?? null), n4(rate!));
    const total = gross - disc + C(ch.companyUsd);
    const paidIn = meta.amount_paid_usd != null ? C(meta.amount_paid_usd)
      : oldCur === "USD" ? C(old.paid_usd ?? 0)
      : C(old.amount_paid ?? old.total) >= C(old.total) ? total
      : dr(C(old.amount_paid ?? 0) * RS, rate!);
    const paid = minB(maxB(paidIn, 0n), total);
    await demoPurchaseDoor(() => demoRepo.updatePurchase(purchaseId, preps.map((x) => x.line), { ...m, discount: discIqd(disc, gross, rate!), amount_paid: 0, charges: ch.list }));
    p = stampUsd(purchaseId, rate!, total, disc, paid, ch.list);
  }
  after(purchaseId, "update", preps, cur, rate, from);
  return (loadDB().purchases ?? []).find((x) => x.id === purchaseId) ?? p;
}

export async function demoPurchasePayFx(purchaseId: string, handed: number, payCur: Cur, rate: number | null, method: PaymentMethod,
  note: string | null, expectDue: number | null): Promise<Purchase> {
  demoInventoryRole();
  const pc = curOf(payCur || "IQD");
  const h = C(handed);
  if (h <= 0n) throw demoHint("bad_amount", "المبلغُ لازم أكبر من صفر.");
  if (method != null && !METHODS.has(method)) throw new Error("bad_method");
  const db = loadDB();
  const p = (db.purchases ?? []).find((x) => x.id === purchaseId);
  if (!p) throw new Error("purchase not found");
  const debt: Cur = p.currency === "USD" ? "USD" : "IQD";
  let r = rate != null ? decOf(rate, 4) : null;
  if (debt !== pc && !rateOk(r)) throw badRate();
  // 0275: دَينُ الدولار — كلُّ تسديدٍ بسعر يومه (ولو سُلّم دولاراً)، والغائبُ سعرُ العيادة الأخير.
  if (debt === "USD") {
    r = r ?? (await usdCtx()).rate;
    if (!rateOk(r)) throw demoHint("bad_rate", "اكتب سعر الدولار يوم التسديد (بين 100 و100000 دينار).");
  }
  const now = new Date().toISOString();
  const base = { id: uid("pp"), clinic_id: null, purchase_id: p.id, company_id: p.company_id ?? null, method,
    note: note?.trim() || null, paid_at: now, staff_id: null, created_at: now, pay_currency: pc, handed: n2(h) };
  if (debt === "IQD") {
    const paidNow = C(p.amount_paid ?? p.total);
    const due = maxB(C(p.total) - paidNow, 0n);
    if (expectDue != null && C(expectDue) !== due) throw demoHint("due_changed", "تغيّر الباقي على الفاتورة — راجعه وأعد.");
    let red = pc === "IQD" ? h : iqdOf(h, r!, 1) * 100n;
    if (red > due) {
      const tol = ((r ?? 0n) + 999_999n) / 1_000_000n * 100n;
      if (pc === "USD" && red - due <= tol) red = due;
      else throw demoHint("over_pay", `المبلغُ أكبر من الباقي (${n2(due)} د.ع).`);
    }
    if (red <= 0n) throw new Error("nothing to settle");
    (db.purchasePayments ??= []).push({ ...base, amount: n2(red), fx_rate: pc === "USD" ? n4(r!) : null });
    const np = paidNow + red;
    Object.assign(p, { amount_paid: n2(np), status: statusOf(C(p.total), np) });
  } else {
    const dueUsd = maxB(C(p.total_usd) - C(p.paid_usd), 0n);
    const dueIqd = maxB(C(p.total) - C(p.amount_paid), 0n);
    if (expectDue != null && C(expectDue) !== dueUsd) throw demoHint("due_changed", "تغيّر الباقي على الفاتورة — راجعه وأعد.");
    let red = pc === "USD" ? h : dr(h * RS, r!);
    if (red > dueUsd) {
      if (red - dueUsd <= 1n) red = dueUsd;
      else throw demoHint("over_pay", `المبلغُ أكبر من الباقي ($${n2(dueUsd)}).`);
    }
    if (red <= 0n) throw new Error("nothing to settle");
    const share = shareC(red, dueUsd, dueIqd, C(p.total_usd), C(p.total));
    // فرقُ الصرف (0275): الحصّةُ بدينار يوم الشراء ناقصَ ما كلّفت يومَ التسديد (المسلَّمُ دينارُه، أو الدولارُ بسعر يومه).
    const cost = pc === "IQD" ? h : iqdOf(red, r!, 1) * 100n;
    (db.purchasePayments ??= []).push({ ...base, amount: n2(share), usd: n2(red), fx_rate: n4(r!), fx: n2(share - cost) });
    const np = C(p.paid_usd) + red;
    Object.assign(p, { amount_paid: n2(C(p.amount_paid) + share), paid_usd: n2(np), status: statusOf(C(p.total_usd), np) });
  }
  saveDB(db);
  return { ...p };
}

export async function demoCompanyPayFx(companyId: string, cur: Cur, handed: number, payCur: Cur, rate: number | null,
  method: PaymentMethod | null, date: string | null, note: string | null): Promise<CompanyPayResult> {
  const db = loadDB();
  demoLedgerGuard(db, companyId, handed, date);
  const c = curOf(cur || "IQD"), pc = curOf(payCur || "IQD");
  const h = C(handed);
  if (method != null && !METHODS.has(method)) throw new Error("bad_method");
  let r = rate != null ? decOf(rate, 4) : null;
  if (c !== pc && !rateOk(r)) throw badRate();
  const mine = (db.purchases ?? []).filter((p) => p.company_id === companyId);

  if (c === "IQD") {
    let red = pc === "IQD" ? h : iqdOf(h, r!, 1) * 100n;
    if (pc === "USD") {
      const room = C(Math.max(0, demoPoolDue(db, companyId))) + mine.filter((p) => p.currency !== "USD")
        .reduce((s, p) => s + maxB(C(p.total) - C(p.amount_paid ?? p.total), 0n), 0n);
      if (red > room && red - room <= (r! + 999_999n) / 1_000_000n * 100n) red = room;
    }
    const res = await demoRepo.companyPay(companyId, n2(red), method, date, note);
    const d2 = loadDB();
    const e = (d2.companyEntries ?? []).find((x) => x.id === res.entry.id)!;
    Object.assign(e, { pay_currency: pc, handed: n2(h), fx_rate: pc === "USD" ? n4(r!) : null });
    saveDB(d2);
    return { ...res, entry: { ...e } };
  }

  // 0275: سعرُ يوم التسديد لدَين الدولار (ولو سُلّم دولاراً)، والغائبُ سعرُ العيادة.
  r = r ?? (await usdCtx()).rate;
  if (!rateOk(r)) throw demoHint("bad_rate", "اكتب سعر الدولار يوم التسديد (بين 100 و100000 دينار).");
  const pool = maxB(C(demoPoolDueUsd(db, companyId)), 0n);
  const open = mine.filter((p) => p.currency === "USD" && C(p.total_usd) - C(p.paid_usd) > 0n)
    .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at) || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id));
  const inv = open.reduce((s, p) => s + (C(p.total_usd) - C(p.paid_usd)), 0n);
  let red = pc === "USD" ? h : dr(h * RS, r!);
  if (red > pool + inv) {
    if (red - (pool + inv) <= 1n) red = pool + inv;
    else throw demoHint("over_pay", `المبلغُ أكبر من دين الشركة بالدولار ($${n2(pool + inv)}).`);
  }
  if (red <= 0n) throw demoHint("bad_amount", "المبلغُ لازم أكبر من صفر.");
  const entry: CompanyEntry = { ...demoEntry(companyId, "payment", "debit", n2(red), date, method, note),
    currency: "USD", pay_currency: pc, handed: n2(h), fx_rate: n4(r!) };
  (db.companyEntries ??= []).push(entry);
  const day = entry.entry_date;
  const paidAt = day === localISO() ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString();
  const poolPart = minB(pool, red);
  let left = red - poolPart;
  let n = 0;
  for (const p of open) {
    if (left <= 0n) break;
    const dueUsd = C(p.total_usd) - C(p.paid_usd);
    const part = minB(left, dueUsd);
    const share = shareC(part, dueUsd, C(p.total) - C(p.amount_paid), C(p.total_usd), C(p.total));
    (db.purchasePayments ??= []).push({
      id: uid("pp"), clinic_id: null, purchase_id: p.id, company_id: companyId, amount: n2(share), usd: n2(part), method,
      note: note?.trim() || null, paid_at: paidAt, staff_id: null, entry_id: entry.id, created_at: new Date().toISOString(),
      fx_rate: n4(r!), fx: n2(share - iqdOf(part, r!, 1) * 100n),
    });
    const np = C(p.paid_usd) + part;
    Object.assign(p, { amount_paid: n2(C(p.amount_paid) + share), paid_usd: n2(np), status: statusOf(C(p.total_usd), np) });
    left -= part;
    n++;
  }
  saveDB(db);
  return { entry, to_opening: n2(poolPart), to_invoices: n2(red - poolPart), invoices: n };
}

async function entryFx(kind: "opening" | "adjust", companyId: string, cur: Cur, direction: "credit" | "debit", amount: number,
  date: string | null, note: string | null): Promise<CompanyEntry> {
  const db = loadDB();
  const amt = demoLedgerGuard(db, companyId, amount, date);
  const c = curOf(cur || "IQD");
  if (c === "USD" && !(await usdCtx()).enabled) throw demoHint("usd_disabled", "الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.");
  if (kind === "opening") {
    if ((db.companyEntries ?? []).some((e) => e.company_id === companyId && e.kind === "opening" && !e.voided_at && (e.currency ?? "IQD") === c)) {
      throw demoHint("opening_exists", "لهاي الشركة رصيدٌ سابق بهاي العملة — ألغِه أوّلاً إن كان غلطاً.");
    }
  } else if (!note?.trim()) throw demoHint("note_required", "اكتب سببَ التسوية.");
  const row: CompanyEntry = { ...demoEntry(companyId, kind, direction, amt, date, null, note), currency: c };
  (db.companyEntries ??= []).push(row);
  saveDB(db);
  return row;
}
export const demoCompanyOpeningFx = (companyId: string, cur: Cur, amount: number, date: string | null, note: string | null) =>
  entryFx("opening", companyId, cur, "credit", amount, date, note);
export function demoCompanyAdjustFx(companyId: string, cur: Cur, direction: "credit" | "debit", amount: number, date: string | null, note: string) {
  if (direction !== "credit" && direction !== "debit") throw new Error("bad_direction");
  return entryFx("adjust", companyId, cur, direction, amount, date, note);
}
