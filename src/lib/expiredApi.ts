/* ============================================================================
 * الراجعُ الإكسباير (0288) — بابٌ واحد للسحابة وللتجريبيّ. كسولٌ: شاشةُ البيع والمخزون تستوردانه بـimport() وحده
 * (repo.ts بحزمة الإقلاع، وشاشةُ البيع لا تستورد وحدةً ثابتةً جديدة).
 *
 * • `returnExpired`: الخادمُ يختار فاتورةَ المادّة بمفتاح الزبون (الأحدثُ، وما عليها دَينٌ أوّلاً)، وينزّل من دَينها، وما زاد يسدّد أقدمَ دَينه،
 *   وما زاد بعدها نقد — ويكتب دفعةَ «راجع» بتاريخها وكلفتها (ما رجع للزبون). بمرجع إعادة: الإعادةُ ترجع الجوابَ الأوّل.
 * • `checkoutLots`: البيعةُ كما هي (عاديّة، بجرعات، أو بمجموعين) ثمّ سطرُ الدفعة بكلفتها والدفعةُ تنقص — بمعاملةٍ واحدة.
 * • `listReturnLots`: دفعاتُ الراجع الباقية. قاعدةٌ قبل 0288 لا مصدرَ «return» فيها ⇒ [] صادقة (لا خطأ يُبلع). وأيُّ فشلٍ يُرمى —
 *   «ماكو إكسباير» عن خطأٍ تُصدَّق فيُباع الإكسبايرُ بكلفة الجديد.
 * ========================================================================= */
import type { CheckoutItem, Invoice, PaymentMethod, ProductLot, SaleMeta } from "@/types";
import { supabase } from "./supabase";
import { ReadOnlyError } from "./repo";
import { isConfigReadOnly } from "./clinicSync";

const code = (e: unknown) => String((e as { code?: string } | null)?.code ?? "");
const absent = (e: unknown) => ["42883", "PGRST202"].includes(code(e));
const local = () => import("./repoDemo").then((m) => m.loadDemoExpired());

export type ExpiredUnit = "box" | "sub" | "pack";
export interface ExpiredItem {
  product_id: string;
  unit: ExpiredUnit;
  pack_id?: string | null;
  /** بوحدته (علب، قطع، كراتين). */
  qty: number;
  /** ١–١٠٠: كم يُردّ للزبون من سعره. */
  pct: number;
  /** شوكت خلص (YYYY-MM-DD) — إلزاميّ. */
  expiry_date: string;
  /** سعرُ الوحدة بالجهاز — يُقرأ حين لا فاتورةَ للمادّة عند الزبون (كراجع اليوم). */
  unit_price: number;
}
export interface ExpiredMeta {
  client_ref: string;
  customer_name: string | null;
  customer_phone: string | null;
  method: PaymentMethod;
  note: string | null;
}
export interface ExpiredLine { product_id: string; name: string; stock_qty: number; value: number; cost: number; invoice_id: string | null }
/** `debt` ما نزل من دَين الزبون (فاتورتُها ثمّ أقدمُ دَينه)، و`cash` ما خرج من الدرج. */
export interface ExpiredResult { debt: number; cash: number; customer: string | null; invoices: string[]; lines: ExpiredLine[] }

const num = (x: unknown) => Number(x) || 0;
export const expiredResultOf = (r: unknown): ExpiredResult => {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    debt: num(o.debt), cash: num(o.cash), customer: (o.customer as string | null) ?? null,
    invoices: Array.isArray(o.invoices) ? (o.invoices as string[]) : [],
    lines: Array.isArray(o.lines) ? (o.lines as Record<string, unknown>[]).map((l) => ({
      product_id: String(l.product_id), name: String(l.name ?? ""), stock_qty: num(l.stock_qty), value: num(l.value), cost: num(l.cost),
      invoice_id: (l.invoice_id as string | null) ?? null,
    })) : [],
  };
};

/** هل يعرف الخادمُ الراجعَ الإكسباير؟ قاعدةٌ قبل 0288 ⇒ false بصمت (الزرُّ يُخفى)؛ وغيرُه يُرمى. */
export async function returnLotsReady(): Promise<boolean> {
  if (!supabase) return true;
  const r = await supabase.rpc("return_lots_ready");
  if (r.error) { if (absent(r.error)) return false; throw r.error; }
  return r.data === true;
}

const lotOf = (l: ProductLot): ProductLot => ({
  ...l, qty: Number(l.qty), received_qty: Number(l.received_qty), unit_cost: l.unit_cost == null ? null : Number(l.unit_cost),
  return_pct: l.return_pct == null ? null : Number(l.return_pct),
});

/** دفعاتُ الراجع الباقية بالعيادة (شاشةُ البيع تسأل منها «من الإكسباير لو من الجديد؟»). */
export async function listReturnLots(): Promise<ProductLot[]> {
  if (supabase) {
    const r = await supabase.from("product_lots").select("*").eq("source", "return").gt("qty", 0)
      .order("returned_at", { ascending: true }).order("id", { ascending: true }).limit(1000);
    if (r.error) throw r.error;
    return ((r.data ?? []) as ProductLot[]).map(lotOf);
  }
  return (await local()).demoReturnLots(null);
}

/** دفعاتُ الراجع لمادّة (نموذجُ المادّة ونافذةُ الدفعات): الباقيةُ والتي بيعت. */
export async function listReturnLotsOf(productId: string): Promise<ProductLot[]> {
  if (supabase) {
    const r = await supabase.from("product_lots").select("*").eq("product_id", productId).eq("source", "return")
      .order("returned_at", { ascending: false }).limit(200);
    if (r.error) throw r.error;
    return ((r.data ?? []) as ProductLot[]).map(lotOf);
  }
  return (await local()).demoReturnLots(productId);
}

export async function returnExpired(items: ExpiredItem[], meta: ExpiredMeta): Promise<ExpiredResult> {
  if (isConfigReadOnly()) throw new ReadOnlyError();
  if (supabase) {
    const r = await supabase.rpc("return_expired", { p_items: items, p_meta: meta });
    if (r.error) throw r.error;
    return expiredResultOf(r.data);
  }
  return expiredResultOf(await (await local()).demoReturnExpired(items, meta));
}

/** البيعةُ وفيها سطرٌ من دفعة راجع (`lot_id`): `usd` سطورُ الدولار (بيعةٌ بمجموعين) أو null، و`charges` معلَّقاتُ الجرعات أو null. */
export async function checkoutLots(items: CheckoutItem[], meta: SaleMeta, usd: unknown[] | null, charges: string[] | null):
  Promise<{ iqd: Invoice | null; usd: Invoice | null }> {
  if (isConfigReadOnly()) throw new ReadOnlyError();
  if (supabase) {
    const r = await supabase.rpc("retail_checkout_lots", {
      p_items: items, p_meta: meta, p_usd: usd && usd.length ? usd : null, p_charges: charges && charges.length ? charges : null,
    });
    if (r.error) throw r.error;
    const d = (r.data ?? {}) as { iqd?: Invoice | null; usd?: Invoice | null };
    return { iqd: d.iqd ?? null, usd: d.usd ?? null };
  }
  return (await local()).demoCheckoutLots(items, meta, usd, charges);
}

/** رمزُ رفضٍ من أبواب 0288 (الخادمُ يضعه بـmessage وشرحَه العربيَّ بـhint، والتجريبيُّ الرمزَ وحده). */
export function expiredErrorCode(e: unknown): string | null {
  const m = /\b(expired_[a-z]+|lot_(?:short|gone|line|ref))\b/.exec(String((e as { message?: string } | null)?.message ?? ""));
  return m ? m[1] : null;
}
