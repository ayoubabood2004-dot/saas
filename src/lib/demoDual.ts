/* ============================================================================
 * مرآةُ retail_checkout_fx (0282) بالتجريبيّ — نفسُ الرفض بترتيبه، ثمّ البيعةُ الدينارية نفسُها (بجرعاتها إن وُجدت)، ثمّ ختمُ سعر الدولار
 * على سطوره وسعر الصرف على الفاتورة. كسولةٌ من باب repoDemo وحده (loadDemoDual).
 * ========================================================================= */
import type { CheckoutItem, Invoice, SaleMeta } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { demoRepo } from "./repoDemo";
import { demoHint } from "./demoRole";
import { iqdOf, rate1e4Of } from "./usdMath";
import type { DualLineIn, MixedMeta, MixedResult, MixedUsdLine } from "./dualApi";

const strip = ({ price_currency: _c, unit_price_usd: _u, ...rest }: DualLineIn) => rest;

export async function demoDualCheckout(items: DualLineIn[], meta: SaleMeta & { fx_rate_id: string }, charges: string[]): Promise<Invoice> {
  const run = async (lines: DualLineIn[]) => (charges.length
    ? (await import("./doseApi")).checkoutWithDoses(lines.map(strip), meta)
    : demoRepo.retailCheckout(lines.map(strip), meta));
  if (!items.some((i) => i.price_currency === "USD")) return run(items);
  const ref = (meta.client_ref ?? "").trim();
  if (ref) {
    const hit = (loadDB().invoices ?? []).find((i) => (i as Invoice & { client_ref?: string | null }).client_ref === ref);
    if (hit) return hit;
  }
  const st = await (await import("./demoUsd")).demoUsdState();
  if (!st.enabled) throw demoHint("usd_disabled", "الدولار مو مفعّل بهالعيادة — بيع السطر بالدينار، أو فعّله من الإعدادات.");
  if ((meta as SaleMeta & { sale_at?: string | null }).sale_at) throw demoHint("usd_backdate", "بيعةٌ بيومٍ سابق ما بيها سطر بالدولار — سعرُ صرف ذاك اليوم غير معروف. بيعها بالدينار.");
  if (!st.rate) throw demoHint("usd_no_rate", "حدّد سعرَ الدولار اليوم أوّلاً (الإعدادات › الدولار).");
  if (meta.fx_rate_id !== st.rate.id) throw demoHint("usd_rate_changed", "سعرُ الدولار تغيّر — حدّث وشوف المجموع الجديد قبل البيع.");
  const db = loadDB();
  const marks: { product_id: string; qty: number; unit_price: number; unit_label: string | null; usd: number; name: string }[] = [];
  for (const it of items) {
    if (it.price_currency !== "USD") continue;
    const p = it.product_id ? db.products.find((x) => x.id === it.product_id) : undefined;
    if (!p) throw demoHint("dual_not_product", "سطرُ الدولار لازم يكون مادّة من المخزن — الخدماتُ بالدينار.");
    if ((p.price_currency ?? "IQD") !== "IQD") throw demoHint("dual_usd_only", `«${p.name}» سعرها بالدولار وحده — تنباع ببيع الدولار. حدّث الصفحة.`);
    if (p.sell_price_usd == null) throw demoHint("dual_no_usd", `«${p.name}» ما إلها سعر بالدولار — حدّده من المخزون، أو بيعها بالدينار.`);
    if (p.sold_by_weight) throw demoHint("dual_weight", `«${p.name}» تنباع بالوزن — بالدينار وحده.`);
    const qty = Number(it.qty);
    if (!(qty > 0)) throw demoHint("dual_qty", `سطرُ «${p.name}» بالدولار لازم يكون بيع — الراجعُ بالدينار.`);
    const usd = it.unit_price_usd == null || it.unit_price_usd === "" ? NaN : Math.round(Number(it.unit_price_usd) * 100) / 100;
    if (!Number.isFinite(usd) || usd < 0) throw demoHint("dual_no_price", `سطرُ «${p.name}» بالدولار بلا سعر — حدّث الصفحة.`);
    const iqd = Number(iqdOf(BigInt(Math.round(usd * 100)), rate1e4Of(st.rate.rate)!, 1));
    if (Number(it.unit_price) !== iqd) throw demoHint("dual_price_mismatch", `سعرُ «${p.name}» بالدينار ما يطابق ${usd}$ بسعر اليوم (${iqd}) — حدّث الصفحة وعيد البيع.`);
    marks.push({ product_id: p.id, qty, unit_price: iqd, unit_label: it.unit_label ?? null, usd, name: p.name });
  }
  const inv = await run(items);
  const db2 = loadDB();
  const lines = (db2.invoiceItems ?? []).filter((x) => x.invoice_id === inv.id);
  for (const m of marks) {
    const row = lines.find((x) => x.product_id === m.product_id && Number(x.qty) === m.qty && Number(x.unit_price) === m.unit_price
      && (x.unit_label ?? null) === (m.unit_label || null) && x.unit_price_usd == null);
    if (!row) throw demoHint("dual_stamp", `ما انختم سعر الدولار على «${m.name}» — ما انحفظ شي، جرّب مرّة ثانية.`);
    row.unit_price_usd = m.usd;
  }
  const saved = (db2.invoices ?? []).find((x) => x.id === inv.id);
  if (saved) saved.fx_rate = Number(st.rate.rate);
  saveDB(db2);
  return saved ?? { ...inv, fx_rate: Number(st.rate.rate) };
}

/* ============================================================================
 * مرآةُ mixed_checkout (0283) — فاتورةٌ بمجموعين: فاتورةُ دينارٍ لسطور الدينار (بجرعاتها) ثمّ فاتورةُ دولارٍ لسطور الدولار بمرجعها `~usd`،
 * كمعاملةٍ واحدة (رفضُ نصف الدولار يُرجع لقطةَ ما قبل البيعة)، والإعادةُ بالمرجع ترجع الاثنتين كما ثبتتا.
 * ========================================================================= */
export async function demoMixedCheckout(iqd: CheckoutItem[], usd: MixedUsdLine[], meta: SaleMeta & MixedMeta, charges: string[]): Promise<MixedResult> {
  const ref = (meta.client_ref ?? "").trim();
  if (!ref) throw demoHint("mixed_ref", "البيعة تحتاج مرجع — حدّث الصفحة وعيد البيع.");
  if (!Array.isArray(usd) || usd.length === 0) throw demoHint("mixed_no_usd", "ماكو سطر بالدولار — هاي بيعة دينار عادية. حدّث الصفحة.");
  if ((meta.sale_kind ?? "retail") === "wholesale") throw demoHint("mixed_wholesale", "الجملة بالدينار وحده — رجّع سطور الدولار للدينار.");
  const uref = `${ref}~usd`;
  const refOf = (i: Invoice) => (i as Invoice & { client_ref?: string | null }).client_ref;
  const { fx_rate_id, discount_usd, paid_usd, usd_method, ...imeta } = meta;
  const runIqd = () => (charges.length ? import("./doseApi").then((m) => m.checkoutWithDoses(iqd, imeta)) : demoRepo.retailCheckout(iqd, imeta));
  const db0 = loadDB();
  const a0 = (db0.invoices ?? []).find((i) => refOf(i) === ref) ?? null;
  const b0 = (db0.invoices ?? []).find((i) => refOf(i) === uref) ?? null;
  if (a0 || b0) {
    // وبجرعاتٍ تمرّ فاتورةُ الدينار من بابها: جرعةٌ نزلت بعد محاولةٍ مجهولة المصير تُقال (dose_charge_late).
    const a = a0 && charges.length ? await runIqd() : a0;
    return { iqd: a, usd: b0 };
  }
  if (iqd.length === 0 && charges.length) throw demoHint("mixed_shape", "جرعات الطبلة بالدينار — رجّعها للسلّة وعيد البيع.");
  const u = await import("./demoUsd");
  const snapDb = JSON.stringify(loadDB());
  const snapUsd = u.demoUsdSnapshot();
  try {
    const a = iqd.length > 0 ? await runIqd() : null;
    const b = await u.demoUsdCheckout(usd, {
      client_ref: uref, fx_rate_id, customer_name: meta.customer_name ?? null, customer_phone: meta.customer_phone ?? null,
      pet_name: meta.pet_name ?? null, staff_id: meta.staff_id ?? null, notes: meta.notes ?? null, sale_kind: meta.sale_kind ?? null,
      sale_at: (meta as SaleMeta & { sale_at?: string | null }).sale_at ?? null,
      payment_method: usd_method || "cash", discount_usd, paid_usd, partial_ok: true,
    });
    return { iqd: a, usd: b };
  } catch (e) {
    saveDB(JSON.parse(snapDb));
    u.demoUsdRestore(snapUsd);
    throw e;
  }
}
