// سطورُ «تسديد دفعة» بقائمة الفواتير — عرضٌ لتسديدٍ مسجَّلٍ أصلاً لا فاتورةٌ جديدة.
//
// settle_invoice (0061) تُلحق بـpayment_details ساقاً مختومةً بـ`at`. القائمةُ تعرضها
// سطراً بوقتها وسط الفواتير، والفاتورةُ الأصلية تبقى بمكان إنشائها بدينها المتبقّي —
// فلا مالٌ يُحسب مرّتين ولا تقريرٌ يتغيّر (التقاريرُ تقرأ الأرجلَ نفسَها بـreceiptsOf).
//
// الجذر: كان «آخرُ نشاط» يرفع الفاتورةَ كلَّها بالمتصفّح، والوضعُ المصفَّح (0150، الافتراضيّ)
// يرتّب بالخادم بـcreated_at و`if (paged) return rows;` يتجاوز الترتيب — فاختفى الصعود.
// الآن الوضعان يمرّان من buildInvoiceFeed، وأرجلُ التسديد خارج النافذة تجيبها invoice_settlements.
//
// 0241: «خصم على الدين» سطرٌ بوقته كذلك (بلا نقد): «المتبقّي ٧٠ ← ٥٠». والخصمُ يُنزل total، فـ«المتبقّي
// بعده» لسطر تسديدٍ أقدم يُعيد إليه كلَّ ما تغيّر من forgiven **بعد** ساقه (خصمٌ بعده يُضاف، واستهلاكُه
// بمرتجعٍ يُطرح، وإلغاؤه بعده يُطرح) — فخصمٌ لاحق لا يعيد كتابة سطورٍ سابقة.
import type { ForgiveReason, Invoice, InvoiceForgiveness, PaymentMethod } from "@/types";
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
/** سطرُ «خصم على الدين» — صفرُ نقد. الملغى لا يُعرض سطراً، ولا الاستهلاكُ (أثرُ مرتجعٍ/تعديل). */
export interface ForgivenessEntry {
  kind: "forgiveness";
  key: string;
  /** الفاتورةُ الأصلية كاملةً — الضغطُ يفتحها. */
  inv: Invoice;
  at: string;
  amount: number;
  reason: ForgiveReason | null;
  note: string | null;
  /** المتبقّي لحظتَها قبل الخصم وبعده (بعد دفعة «التسوية» إن كانت) — لقطةُ السطر، لا حسابٌ من الآن. */
  dueBefore: number;
  dueAfter: number;
  aboveCap: boolean;
  /** سطرُ الدفتر نفسُه. */
  row: InvoiceForgiveness;
}
export type FeedEntry = InvoiceEntry | SettlementEntry | ForgivenessEntry;

const ms = (iso: string): number => new Date(iso).getTime();

/** هل وقع سطرُ الدفتر بعد ساقٍ بوقت `legMs`؟ الخصمُ والساقُ بنفس الدالّة («تسوية») يحملان نفسَ
 *  اللحظة (now() بالمعاملة) — والدفعةُ قبل الخصم فيها، فالتعادلُ «بعد» حين للسطر دفعة. */
const rowAfter = (rowMs: number, legMs: number, pay: number): boolean => rowMs > legMs || (rowMs === legMs && pay > 0);

/** ما تغيّر من `invoices.forgiven` بعد لحظة الساق: خصمٌ أُنشئ بعدها (+)، واستهلاكٌ بعدها (−، مبلغُه
 *  سالب أصلاً)، وخصمٌ أُلغي بعدها (−، فالإلغاءُ أنزل forgiven). خصمٌ أُنشئ وأُلغي بعدها صفر. */
function forgivenSince(rows: readonly InvoiceForgiveness[], legMs: number): number {
  let s = 0;
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    if (rowAfter(ms(r.created_at), legMs, Number(r.pay_amount) || 0)) s += amt;
    if (r.voided_at && ms(r.voided_at) > legMs) s -= amt;
  }
  return s;
}

/**
 * أرجلُ التسديد بفاتورة: موجبةٌ مختومةٌ بوقتٍ **بعد** إنشائها، وليست ساقَ فكّ.
 *  • ساقُ البيع بلا `at` — دُفعت عند البيع؛
 *  • ساقُ التثبيت (0113/0121) تُختم بـcreated_at نفسِه — أصلُ البيع لا تسديد؛
 *  • السالبةُ تصحيحٌ أو مرتجع، و`reversal_of` فكُّ تحصيلِ شركة.
 * «المتبقّي بعده» يُحسب من الآخر: الدينُ الآن + كلُّ ما دُخل بعد هذه الساق (بإشارته) —
 * لأن ساقَ البيع النقديّة البسيطة لا تُخزَّن، فالجمعُ من الأوّل لا يعرف ما دُفع عند البيع.
 * و`forgiveness` سطورُ دفتر هذه الفاتورة (0241): ما تغيّر من الخصم بعد الساق يُعاد إليها. **لازمٌ بلا افتراض**:
 * `[]` افتراضيّاً كان يعني «لا خصم» لا «لا نعرف»، فمستدعٍ نسيه يرى خصماً لاحقاً «تسديداً كاملاً» — رقمُ مالٍ
 * كاذبٌ يُصدَّق. فـtsc يمسك كلَّ مستدعٍ لم يجلب الدفتر، ومن لم يجلبه بعدُ لا يرسم سطورَ التسديد أصلاً.
 */
export function settlementsOf(inv: Invoice, forgiveness: readonly InvoiceForgiveness[]): SettlementEntry[] {
  const legs = Array.isArray(inv.payment_details) ? inv.payment_details : [];
  if (!legs.length) return [];
  const created = ms(inv.created_at);
  const out: SettlementEntry[] = [];
  let after = 0; // مجموعُ ما بعد الساق الحالية
  const tail: number[] = new Array(legs.length).fill(0);
  for (let i = legs.length - 1; i >= 0; i--) { tail[i] = after; after += Number(legs[i]?.amount) || 0; }
  const due = dueOf(inv);
  const rows = forgiveness.filter((r) => r.invoice_id === inv.id);
  legs.forEach((l, i) => {
    if (!l || !l.at || l.reversal_of) return;
    const amount = Number(l.amount) || 0;
    if (amount <= EPS) return;
    const t = ms(l.at);
    if (!Number.isFinite(t) || t <= created) return;
    out.push({
      kind: "settlement", key: `${inv.id}:pay:${i}`, inv, at: l.at, amount: round2(amount),
      method: (l.method ?? "cash") as PaymentMethod,
      remainingAfter: Math.max(0, round2(due + tail[i] + (rows.length ? forgivenSince(rows, t) : 0))),
    });
  });
  return out;
}

/** سطورُ «خصم على الدين» لفاتورة: الخصمُ الحيّ وحده (لا الملغى ولا الاستهلاك)، بلقطته. */
export function forgivenessOf(inv: Invoice, forgiveness: readonly InvoiceForgiveness[]): ForgivenessEntry[] {
  const out: ForgivenessEntry[] = [];
  for (const r of forgiveness) {
    if (r.invoice_id !== inv.id || r.kind !== "forgive" || r.voided_at) continue;
    const amount = round2(Number(r.amount) || 0);
    // لا عتبةَ فلس: الخادمُ يقبل أيَّ خصمٍ round(a,2) > 0 (٠٫٠١ صالح) وinvoice_settlements تُرجع فاتورتَه بلا
    // عتبة — و`> 0.01` قاعدةُ سِيَق الدفع لا الخصم؛ بها كان دينٌ يختفي بلا سطرٍ يشرحه.
    if (amount <= 0 || !Number.isFinite(ms(r.created_at))) continue;
    const before = r.due_before != null ? Number(r.due_before) : null;
    const dueBefore = before != null && Number.isFinite(before) ? round2(before) : round2(dueOf(inv) + amount);
    out.push({
      kind: "forgiveness", key: `${inv.id}:forgive:${r.id}`, inv, at: r.created_at, amount,
      reason: r.reason_code ?? null, note: r.note ?? null,
      dueBefore, dueAfter: Math.max(0, round2(dueBefore - amount)), aboveCap: !!r.above_cap, row: r,
    });
  }
  return out;
}

/** بالتعادل بالوقت: الخصمُ أحدثُ من دفعة «التسوية» التي سبقته بنفس المعاملة. */
const RANK: Record<FeedEntry["kind"], number> = { invoice: 0, settlement: 1, forgiveness: 2 };

/**
 * القائمةُ المعروضة: الفواتيرُ بتاريخ إنشائها وسطورُ التسديد بوقتها، الأحدثُ أوّلاً.
 * `sources` فواتيرُ قد تحمل تسديداً (الصفوفُ نفسُها + ما جاء به invoice_settlements)؛
 * الفاتورةُ الواحدة من مصدرين لا تكرّر تسديدَها. `floor` أرضيّةُ ما عُرض: تسديدٌ تحتها
 * يقع بمدىً لم تُجلب فواتيرُه بعد، فلا يُعرض حتى لا يبدو المدى كاملاً وهو ناقص.
 * `forgiveness` سطورُ دفتر الخصم لهذه الفواتير (listInvoiceForgiveness): خصمٌ حيّ سطرٌ بوقته، وكلُّها
 * تدخل «المتبقّي بعده» لسطور التسديد. سطرٌ لفاتورةٍ ليست بالمصادر لا يُعرض (لا شيءَ يُفتح منه).
 */
export function buildInvoiceFeed(invoices: Invoice[], sources: Invoice[], floor: string | null,
  forgiveness: readonly InvoiceForgiveness[]): FeedEntry[] {
  const lo = floor ? ms(floor) : -Infinity;
  const byId = new Map<string, Invoice>();
  for (const s of sources) byId.set(s.id, s);
  for (const r of invoices) byId.set(r.id, r); // الصفُّ المعروض أحدثُ نسخة
  const rowsOf = new Map<string, InvoiceForgiveness[]>();
  const seen = new Set<string>();
  for (const r of forgiveness) {
    if (!r || seen.has(r.id)) continue; // نفسُ السطر من جلبين لا يتكرّر
    seen.add(r.id);
    const list = rowsOf.get(r.invoice_id);
    if (list) list.push(r); else rowsOf.set(r.invoice_id, [r]);
  }
  const feed: FeedEntry[] = invoices.map((inv) => ({ kind: "invoice", key: inv.id, inv, at: inv.created_at }));
  for (const inv of byId.values()) {
    const rows = rowsOf.get(inv.id) ?? [];
    for (const s of settlementsOf(inv, rows)) if (ms(s.at) >= lo) feed.push(s);
    for (const f of forgivenessOf(inv, rows)) if (ms(f.at) >= lo) feed.push(f);
  }
  // ثابتٌ: الأحدثُ أوّلاً، وبالتعادل الخصمُ فوق دفعة تسويته، ثم ترتيبُ المفتاح — نفسُ القائمة تُرسم بنفس الترتيب.
  return feed.sort((x, y) => ms(y.at) - ms(x.at) || RANK[y.kind] - RANK[x.kind] || (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));
}
