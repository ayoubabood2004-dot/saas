// سطورُ «تسديد دفعة» بقائمة الفواتير — عرضٌ لتسديدٍ مسجَّلٍ أصلاً لا فاتورةٌ جديدة.
//
// settle_invoice (0061) تُلحق بـpayment_details ساقاً مختومةً بـ`at`. القائمةُ تعرضها
// سطراً بوقتها وسط الفواتير، والفاتورةُ الأصلية تبقى بمكان إنشائها بدينها المتبقّي —
// فلا مالٌ يُحسب مرّتين ولا تقريرٌ يتغيّر (التقاريرُ تقرأ الأرجلَ نفسَها بـreceiptsOf).
//
// الجذر: كان «آخرُ نشاط» يرفع الفاتورةَ كلَّها بالمتصفّح، والوضعُ المصفَّح (0150، الافتراضيّ)
// يرتّب بالخادم بـcreated_at و`if (paged) return rows;` يتجاوز الترتيب — فاختفى الصعود.
// الآن الوضعان يمرّان من buildInvoiceFeed، وأرجلُ التسديد خارج النافذة تجيبها invoice_settlements.
import type { Invoice, PaymentMethod } from "@/types";
import { dueOf, round2 } from "@/lib/debt";

const EPS = 0.01;

export interface SettlementEntry {
  kind: "settlement";
  key: string;
  /** الفاتورةُ الأصلية كاملةً — الضغطُ يفتحها. */
  inv: Invoice;
  at: string;
  amount: number;
  method: PaymentMethod;
  /** دينُ الفاتورة بعد هذه الدفعة. */
  remainingAfter: number;
}
export interface InvoiceEntry { kind: "invoice"; key: string; inv: Invoice; at: string }
export type FeedEntry = InvoiceEntry | SettlementEntry;

const ms = (iso: string): number => new Date(iso).getTime();

/**
 * أرجلُ التسديد بفاتورة: موجبةٌ مختومةٌ بوقتٍ **بعد** إنشائها، وليست ساقَ فكّ.
 *  • ساقُ البيع بلا `at` — دُفعت عند البيع؛
 *  • ساقُ التثبيت (0113/0121) تُختم بـcreated_at نفسِه — أصلُ البيع لا تسديد؛
 *  • السالبةُ تصحيحٌ أو مرتجع، و`reversal_of` فكُّ تحصيلِ شركة.
 * «المتبقّي بعده» يُحسب من الآخر: الدينُ الآن + كلُّ ما دُخل بعد هذه الساق (بإشارته) —
 * لأن ساقَ البيع النقديّة البسيطة لا تُخزَّن، فالجمعُ من الأوّل لا يعرف ما دُفع عند البيع.
 */
export function settlementsOf(inv: Invoice): SettlementEntry[] {
  const legs = Array.isArray(inv.payment_details) ? inv.payment_details : [];
  if (!legs.length) return [];
  const created = ms(inv.created_at);
  const out: SettlementEntry[] = [];
  let after = 0; // مجموعُ ما بعد الساق الحالية
  const tail: number[] = new Array(legs.length).fill(0);
  for (let i = legs.length - 1; i >= 0; i--) { tail[i] = after; after += Number(legs[i]?.amount) || 0; }
  const due = dueOf(inv);
  legs.forEach((l, i) => {
    if (!l || !l.at || l.reversal_of) return;
    const amount = Number(l.amount) || 0;
    if (amount <= EPS) return;
    const t = ms(l.at);
    if (!Number.isFinite(t) || t <= created) return;
    out.push({
      kind: "settlement", key: `${inv.id}:pay:${i}`, inv, at: l.at, amount: round2(amount),
      method: (l.method ?? "cash") as PaymentMethod,
      remainingAfter: Math.max(0, round2(due + tail[i])),
    });
  });
  return out;
}

/**
 * القائمةُ المعروضة: الفواتيرُ بتاريخ إنشائها وسطورُ التسديد بوقتها، الأحدثُ أوّلاً.
 * `sources` فواتيرُ قد تحمل تسديداً (الصفوفُ نفسُها + ما جاء به invoice_settlements)؛
 * الفاتورةُ الواحدة من مصدرين لا تكرّر تسديدَها. `floor` أرضيّةُ ما عُرض: تسديدٌ تحتها
 * يقع بمدىً لم تُجلب فواتيرُه بعد، فلا يُعرض حتى لا يبدو المدى كاملاً وهو ناقص.
 */
export function buildInvoiceFeed(invoices: Invoice[], sources: Invoice[], floor: string | null): FeedEntry[] {
  const lo = floor ? ms(floor) : -Infinity;
  const byId = new Map<string, Invoice>();
  for (const s of sources) byId.set(s.id, s);
  for (const r of invoices) byId.set(r.id, r); // الصفُّ المعروض أحدثُ نسخة
  const feed: FeedEntry[] = invoices.map((inv) => ({ kind: "invoice", key: inv.id, inv, at: inv.created_at }));
  for (const inv of byId.values()) {
    for (const s of settlementsOf(inv)) if (ms(s.at) >= lo) feed.push(s);
  }
  // ثابتٌ: الأحدثُ أوّلاً، وبالتعادل ترتيبُ المفتاح — نفسُ القائمة تُرسم بنفس الترتيب.
  return feed.sort((x, y) => ms(y.at) - ms(x.at) || (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));
}
