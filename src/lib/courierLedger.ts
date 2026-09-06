// ============================================================================
// دفترُ حاملِ التوصيل — حسابُ ما على الشركة، وما راح معها صنفاً صنفاً.
//
// ── لماذا ملفٌّ مستقلّ ───────────────────────────────────────────────────────
// معادلةُ «المطلوب من الشركة» كانت مكتوبةً بأربعة مواضع داخل لوحة التوصيل:
// بطاقةُ الشركة، ومؤشّرُ «بذمّة الشركات»، وترويسةُ نافذة التحصيل، وترويسةُ
// السجلّ. أربعُ نسخٍ تقدر أن تختلف — ويوم المحاسبة يقف المندوبُ أمام رقمين.
// هنا مصدرٌ واحد، وهو مكتوبٌ **حرفياً** بمعادلة `courier_settle` (0148):
//
//     status = 'delivered'  و  collected_at IS NULL
//     و فاتورتُه ليست 'refunded'  و  المتبقّي > 0.009
//
// فما تعرضه الشاشةُ هو بالضبط ما ستقبله القاعدةُ يومَ التحصيل. أيُّ اختلافٍ
// بينهما يصير خطأً يُمسَك بفحص التطابق، لا مفاجأةً أمام المندوب.
//
// ── ولماذا بلا نصٍّ معروض ───────────────────────────────────────────────────
// حسابٌ خالص: لا ترجمة، ولا تنسيقَ عملة، ولا JSX. تُفحَص دوالُّه بـnode مباشرةً
// بلا متصفّح ولا React — وهذا شرطُ أن تُقاس فلساً بفلس مقابل `dueOf`.
// ============================================================================
import type { DeliveryOrder, Invoice, InvoiceItem } from "@/types";
import { dueOf, paidOf, round2 } from "./debt";

/** فاتورةٌ بمعرّفها — الدالّاتُ هنا لا تعرف كيف تُجلب، تستلمها جاهزة. */
export type InvoiceLookup = (id: string) => Invoice | undefined;

/** حالةُ الطلب بنظر التحصيل. */
export type LedgerState = "owed" | "collected" | "returned";

export interface LedgerOrderRow {
  order: DeliveryOrder;
  invoice?: Invoice;
  /** المتبقّي على هذا الطلب وقتَ العرض (من الفاتورة إن حضرت، وإلا `cod_amount`). */
  due: number;
  state: LedgerState;
}

export interface CourierTotals {
  /** كلُّ ما سُلّم (لا يشمل الراجع). */
  deliveries: number;
  returned: number;
  /** عددُ الطلبات التي ما زالت بذمّة الحامل. */
  openOrders: number;
  /** المطلوبُ الآن — بمعادلة `courier_settle` حرفياً. */
  owedNow: number;
  /** ما وصل فعلاً من طلباتٍ مختومةٍ بـ`collected_at`. */
  collected: number;
  /** قيمةُ البضاعة التي خرجت مع هذا الحامل (المسلَّمةُ وحدها). */
  goodsOut: number;
}

/** المتبقّي على طلب: من فاتورته إن حضرت، وإلا لقطةُ `cod_amount` وقتَ الإرسال.
 *  السقوطُ إلى اللقطة مقصود — طلبٌ قديمٌ فاتورتُه خارج المدّة أفضلُ برقمٍ
 *  تقريبيٍّ صريحٍ من أن يختفي من الكشف. */
export function orderDue(o: DeliveryOrder, inv?: Invoice): number {
  return inv ? dueOf(inv) : round2(o.cod_amount ?? 0);
}

/** قيمةُ بضاعةِ الطلب — الفاتورةُ كاملةً لا المتبقّي منها.
 *
 * **المتبقّي ليس القيمة.** `courier_settle` (0148) لا تختم `collected_at` إلا
 * حين تُسدَّد الفاتورةُ كاملةً (`v_pay >= v_due`)، فكلُّ طلبٍ محصَّلٍ متبقّيه صفر.
 * فحسابُ القيمة من المتبقّي كان يمحو من الكشف كلَّ ما حُصِّل: الشركةُ التي
 * سلّمت ٨٠ ألفاً وحُصِّل منها ٥٠ تظهر «قيمة البضاعة ٣٠». والأسوأ أن 0148
 * ختمت الطلباتِ القديمةَ كلَّها بـ`collected_at`، فتاريخُ الشركة كلُّه يختفي. */
export function orderGoods(o: DeliveryOrder, inv?: Invoice): number {
  return inv ? round2(inv.total) : round2((o.cod_amount ?? 0) + (o.prepaid ?? 0));
}

/** ما وصل فعلاً من هذا الطلب — المدفوعُ ناقصَ ما دُفع مقدَّماً قبل خروجه.
 *  (المقدَّمُ لم يمرّ بيد الحامل، فلا يُحسب عليه تحصيلاً.) */
export function orderCollected(o: DeliveryOrder, inv?: Invoice): number {
  if (!o.collected_at) return 0;
  return inv
    ? Math.max(0, round2(paidOf(inv) - (o.prepaid ?? 0)))
    : round2(o.cod_amount ?? 0);
}

/** هل ما زال المبلغُ بذمّة الحامل؟ نفسُ شرط `courier_settle` (0148). */
export function isOwed(o: DeliveryOrder, inv?: Invoice): boolean {
  if (o.status !== "delivered") return false;
  if (o.collected_at) return false;
  // فاتورةٌ مردودة لا تُحصَّل — القاعدة ترفضها، فلا نعدّها هنا أيضاً.
  if (inv && inv.status === "refunded") return false;
  return orderDue(o, inv) > 0.009;
}

export function stateOf(o: DeliveryOrder): LedgerState {
  if (o.status === "returned") return "returned";
  return o.collected_at ? "collected" : "owed";
}

/** المطلوبُ من شركةٍ الآن وعددُ طلباته — المصدرُ الوحيد لهذا الرقم. */
export function companyOwed(orders: readonly DeliveryOrder[], invoiceById: InvoiceLookup): { openOrders: number; owed: number } {
  let openOrders = 0, owed = 0;
  for (const o of orders) {
    const inv = invoiceById(o.invoice_id);
    if (!isOwed(o, inv)) continue;
    openOrders++;
    owed += orderDue(o, inv);
  }
  return { openOrders, owed: round2(owed) };
}

/** مجاميعُ كشفِ الحامل — ما يُقرأ فوق الجدول يومَ المحاسبة. */
export function courierTotals(orders: readonly DeliveryOrder[], invoiceById: InvoiceLookup): CourierTotals {
  let deliveries = 0, returned = 0, collected = 0, goodsOut = 0;
  for (const o of orders) {
    if (o.status === "returned") { returned++; continue; }
    if (o.status !== "delivered") continue;
    deliveries++;
    const inv = invoiceById(o.invoice_id);
    goodsOut += orderGoods(o, inv);
    collected += orderCollected(o, inv);
  }
  const { openOrders, owed } = companyOwed(orders, invoiceById);
  return {
    deliveries, returned, openOrders,
    owedNow: owed,
    collected: round2(collected),
    goodsOut: round2(goodsOut),
  };
}

/** صفٌّ بجدول «شنو راح مع هذه الشركة» — صنفٌ واحد مجمَّعٌ عبر كل طلباتها. */
export interface LedgerItemRow {
  /** مفتاحُ التجميع: الباركود إن وُجد، وإلا الاسم — فالمنتجُ الواحد صفٌّ واحد. */
  key: string;
  name: string;
  barcode: string | null;
  qty: number;
  amount: number;
  /** بكم طلبٍ ظهر هذا الصنف. */
  orders: number;
  /** خدمةٌ أو أجرةُ توصيل: سطرٌ بلا `product_id`. يُعرض منفصلاً لا يُخلط. */
  isService: boolean;
}

/**
 * يجمع سطورَ الفواتير إلى صفوفِ أصناف.
 *
 * الأسماءُ والباركوداتُ والأسعارُ تُقرأ من `invoice_items` لا من `products`:
 * السطرُ لقطةٌ وقتَ البيع، فمنتجٌ أُعيدت تسميتُه أو اندمج بعد شهرين لا يفسد
 * كشفَ الشركة. وهذا شرطُ «التحصيل بعد فتراتٍ طويلة».
 *
 * السطورُ السالبة (الإرجاع الجزئيّ، 0121) تُطرح كما هي — فالكشفُ يعرض الصافي.
 */
export function itemsFromInvoices(
  invoiceIds: readonly string[],
  itemsByInvoice: (id: string) => readonly InvoiceItem[],
): LedgerItemRow[] {
  const rows = new Map<string, LedgerItemRow>();
  const seenIn = new Map<string, Set<string>>();
  for (const invId of invoiceIds) {
    for (const it of itemsByInvoice(invId)) {
      const code = (it.barcode ?? "").trim();
      const name = (it.name ?? "").trim();
      const isService = !it.product_id;
      const key = (code || name || "—") + (isService ? "\u0000svc" : "");
      let row = rows.get(key);
      if (!row) {
        row = { key, name: name || code || "—", barcode: code || null, qty: 0, amount: 0, orders: 0, isService };
        rows.set(key, row);
        seenIn.set(key, new Set());
      }
      row.qty += Number(it.qty ?? 0);
      row.amount += Number(it.line_total ?? 0);
      const s = seenIn.get(key);
      if (s && !s.has(invId)) { s.add(invId); row.orders++; }
    }
  }
  for (const r of rows.values()) { r.qty = round2(r.qty); r.amount = round2(r.amount); }
  // البضاعةُ أولاً بالأكبر مبلغاً، ثم الخدماتُ والأجور بذيل الجدول.
  return [...rows.values()].sort((a, b) =>
    (a.isService === b.isService ? b.amount - a.amount : (a.isService ? 1 : -1)));
}

/** صفوفُ الطلبات مرتّبةً بالأحدث — العرضُ الثاني بالكشف. */
export function orderRows(orders: readonly DeliveryOrder[], invoiceById: InvoiceLookup): LedgerOrderRow[] {
  return orders
    .map((order) => {
      const invoice = invoiceById(order.invoice_id);
      return { order, invoice, due: orderDue(order, invoice), state: stateOf(order) };
    })
    .sort((a, b) => {
      const ka = a.order.delivered_at ?? a.order.returned_at ?? a.order.created_at ?? "";
      const kb = b.order.delivered_at ?? b.order.returned_at ?? b.order.created_at ?? "";
      return kb.localeCompare(ka);
    });
}
