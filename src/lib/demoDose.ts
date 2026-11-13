/* ============================================================================
 * الجرعةُ بيع (0269) — مرآةُ التجريبيّ: المحفّزُ على الطبلة، ومعلَّقاتُ الزبون، والبيعُ الذي يختمها، وبابُ حساب الدواء.
 * كسولةٌ من باب repoDemo وحده (loadDemoDose) كمرايا 0252–0267. الحراسُ والرموزُ نفسُها: dose_charge_gone/lines/ref،
 * dose_billing_denied/product_gone/product_usd/unit_bad/qty_bad/price_bad — الرمزُ بـmessage كالخادم.
 * ========================================================================= */
import type { CheckoutItem, DemoDB, DoseCharge, Invoice, SaleMeta, TreatmentEntry } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { demoRepo } from "./repoDemo";
import { demoBaseRole, demoPinLive } from "./demoRole";
import { demoDrugsList, demoDrugBillingWrite } from "./demoClinicDrugs";
import { doseCharge } from "./doseBilling";
import { searchable, uid } from "./utils";
import { custKey } from "./customerKey";
import { getDialCode } from "./settings";

/* الرمزُ وحده (كمرايا 0266/0264): الشاشةُ تقوله بنطاقها (mmset.billErr_* بالإعدادات، وdosl بشاشة البيع) — لا نصَّ عربياً هنا. */
type DoseCode = "dose_charge_gone" | "dose_charge_late" | "dose_charge_lines" | "dose_charge_ref" | "dose_billing_denied" | "dose_product_gone"
  | "dose_product_usd" | "dose_unit_bad" | "dose_qty_bad" | "dose_price_bad";
const fail = (code: DoseCode): never => { throw Object.assign(new Error(code), { code: "P0001" }); };

/** مرآةُ treatment_entries_bill_stamp: الغائبُ = معلَّقةٌ (خطّة) أو معطاةٌ بزيارة. */
export function demoBillStamp(e: Pick<TreatmentEntry, "administered_at" | "visit_id" | "bill">): boolean {
  return e.bill ?? (e.administered_at == null || e.visit_id != null);
}

/** مرآةُ treatment_entries_dose_charge — تُنادى بعد كلّ كتابةٍ على الطبلة (before = null للإدراج). تكتب بـdb ولا تحفظه. */
export function demoDoseHook(db: DemoDB, before: Pick<TreatmentEntry, "administered_at"> | null, e: TreatmentEntry): void {
  const list = (db.doseCharges ??= []);
  const now = new Date().toISOString();
  if (before && before.administered_at && !e.administered_at) {
    for (const c of list) if (c.entry_id === e.id && c.status === "pending") { c.status = "void"; c.voided_at = now; }
    return;
  }
  if (!e.administered_at || !(e.bill ?? false)) return;   // فارغٌ = صفٌّ قبل 0269: لا يُحسب (لا يُعرف أبِيع بالكاشير)
  if (before && before.administered_at) return;
  if (list.some((c) => c.entry_id === e.id && c.status !== "void")) return;
  const key = searchable(e.medication);
  const drug = demoDrugsList().rows.find((d) => d.archived_at == null && searchable(d.name) === key && (d.dose_price != null || !!d.product_id));
  if (!drug) return;
  const product = drug.product_id ? db.products.find((p) => p.id === drug.product_id) : null;
  const ch = doseCharge(drug, product);
  if (!ch) return;
  list.push({
    id: uid("dc"), entry_id: e.id, pet_id: e.pet_id, drug_id: drug.id, product_id: ch.productId, name: drug.name, price: ch.price,
    stock_qty: ch.stockQty, dose_qty: ch.productId ? (drug.dose_qty ?? 1) : null, dose_unit: ch.productId ? (drug.dose_unit ?? null) : null,
    given_at: e.administered_at, status: "pending", invoice_id: null, billed_at: null, voided_at: null, created_at: now,
  });
}

/** المادّةُ «الفعّالة» للمعلَّق: باقيةٌ وبالدينار، وإلا null — تُباع الجرعةُ بسعرها بلا مخزن (مرآةُ v_eff وleft join بالخادم). */
function effProduct(db: DemoDB, id: string | null): string | null {
  const p = id ? db.products.find((x) => x.id === id) : undefined;
  return p && (p.price_currency ?? "IQD") !== "USD" ? p.id : null;
}

/** مرآةُ dose_charges_pending: حيواناتٌ مسمّاة، أو مفتاحُ الزبون (cust_key) على صاحب الحيوان. */
export function demoDosePending(phone: string | null, name: string | null, pets: readonly string[]): DoseCharge[] {
  const db = loadDB();
  const dial = getDialCode();
  const key = custKey(phone, name, dial);
  const out: DoseCharge[] = [];
  for (const c of db.doseCharges ?? []) {
    if (c.status !== "pending") continue;
    const pet = db.pets.find((p) => p.id === c.pet_id);
    if (!pet) continue;
    if (!pets.includes(c.pet_id) && !(key && custKey(pet.owner_phone, pet.owner_name, dial) === key)) continue;
    const eff = effProduct(db, c.product_id);
    out.push({ id: c.id, pet_id: c.pet_id, pet_name: pet.name, name: c.name, price: c.price, product_id: eff,
      stock_qty: eff ? c.stock_qty : null, dose_qty: eff ? c.dose_qty : null, dose_unit: eff ? c.dose_unit : null, given_at: c.given_at });
  }
  return out.sort((a, b) => a.given_at.localeCompare(b.given_at) || (a.id < b.id ? -1 : 1));
}

/** مرآةُ retail_checkout_doses: الحراسُ قبل أيّ كتابة، ثمّ البيعةُ نفسُها، ثمّ الختمُ — بلا حفظٍ بينهما يُرى نصفُه. */
export async function demoDoseCheckout(items: CheckoutItem[], meta: SaleMeta, ids: readonly string[]): Promise<Invoice> {
  if (!ids.length) return demoRepo.retailCheckout(items, meta);
  const ref = (meta.client_ref ?? "").trim();
  if (!ref) fail("dose_charge_ref");
  const want = [...ids].sort();
  const lines = items.filter((l) => l.dose_charge).map((l) => l.dose_charge as string).sort();
  if (new Set(ids).size !== ids.length || want.join() !== lines.join()) fail("dose_charge_lines");
  const db0 = loadDB();
  const prev = db0.invoices.find((i) => i.client_ref === ref)?.id ?? null;
  for (const id of ids) {
    const c = (db0.doseCharges ?? []).find((x) => x.id === id);
    if (!c) fail("dose_charge_gone");
    if (prev && !(c!.status === "billed" && c!.invoice_id === prev)) fail("dose_charge_late");
    if (!prev && c!.status !== "pending") fail("dose_charge_gone");
    const eff = effProduct(db0, c!.product_id);
    const l = items.find((x) => x.dose_charge === id)!;
    if ((l.product_id ?? null) !== eff || Number(l.qty) !== (eff ? (c!.dose_qty ?? 1) : 1) || (eff && Number(l.stock_qty) !== c!.stock_qty)) fail("dose_charge_lines");
  }
  const inv = await demoRepo.retailCheckout(items, meta);
  const db = loadDB();
  const at = new Date().toISOString();
  for (const c of db.doseCharges ?? []) if (ids.includes(c.id) && c.status === "pending") { c.status = "billed"; c.invoice_id = inv.id; c.billed_at = at; }
  saveDB(db);
  return inv;
}

/** مرآةُ clinic_drug_billing_set: صلاحيةُ المخزون، والمادّةُ بالعيادة وبالدينار، والوحدةُ الصغرى قائمة. */
export function demoDrugBillingSet(id: string, price: number | null, productId: string | null, qty: number | null, unit: "box" | "sub" | null): void {
  // staff_can('manageInventory'): المدير (أو PIN حيّ) والطبيب بقالبه؛ والمصوّرُ أبداً.
  const base = demoBaseRole();
  if (base === "photographer" || !(base === "manager" || base === "veterinarian" || demoPinLive())) fail("dose_billing_denied");
  if (price != null && (price < 0 || price > 1e9)) fail("dose_price_bad");
  let u: "box" | "sub" | null = null;
  let q: number | null = qty;
  if (!productId) q = null;
  else {
    const p = loadDB().products.find((x) => x.id === productId);
    if (!p) fail("dose_product_gone");
    if ((p!.price_currency ?? "IQD") === "USD") fail("dose_product_usd");
    u = unit ?? "box";
    if (u === "sub" && !(p!.has_sub_unit && (p!.units_per_box ?? 0) > 0)) fail("dose_unit_bad");
    if (q != null && (q <= 0 || q > 100000)) fail("dose_qty_bad");
  }
  demoDrugBillingWrite(id, { dose_price: price, product_id: productId, dose_qty: q, dose_unit: u });
}
