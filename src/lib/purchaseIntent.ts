/* ============================================================================
 * نيّةُ سطر الشراء — ما طلبه المستخدمُ فعلاً، مفصولاً عمّا عرضته الشاشة.
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * `record_purchase` تكتب سعرَ البيع هكذا:
 *     sell_price = case when v_sell > 0 then v_sell else sell_price end
 * أي أن **الخادمَ فيه بوّابةٌ أصلاً**: الصفرُ يعني «لا تلمس». والواجهةُ وحدَها
 * هي التي تهزمها: `lineFromProduct` كانت تعبّئ الخانةَ بسعر المنتج، فكلُّ سطرٍ
 * يرجّع القيمةَ نفسَها ⇒ أيُّ تغييرٍ صار بعد تحميل الشاشة يُدهس، ووضعُ التعديل
 * يرجّع سعرَ فاتورةٍ عمرُها شهر على الرفّ اليوم.
 *
 * فالإصلاحُ أن الخانةَ تبقى **فارغة**، والفارغُ يُرسَل صفراً = «لا تلمس».
 *
 * ── ولماذا حارسٌ مقرونٌ به إلزاماً ───────────────────────────────────────
 * فرعُ **إنشاء** منتجٍ جديد بنفس الدالّة يمرّر `v_sell` خامّاً بلا بوّابة:
 *     values (…, v_cost, v_sell, …)
 * فتفريغُ الخانة بلا حارسٍ يخلق منتجاً بسعر بيعٍ صفر — يُباع ببلاش. ولهذا
 * `sellPriceToSend` و`purchaseBlockers` يسكنان ملفّاً واحداً: فصلُهما يُغري
 * بأخذ أحدهما.
 *
 * ── ومَن «الجديد» أصلاً ──────────────────────────────────────────────────
 * ليس «بلا `product_id`». الخادمُ يطابق بالاسم أيضاً (`inv_norm_name`)، وهو
 * فرعٌ لا تعرفه الشاشةُ اليوم — ولهذا شارةُ «منتج جديد» تكذب. فالحكمُ هنا
 * يمرّ من `invNormName` نفسِها، فما يطابقه الخادمُ بالاسم لا يُحسب جديداً
 * ولا يُوقَف. مرآةٌ ناقصةٌ هنا تعني إنذاراً كاذباً يتعلّم المستخدمُ تجاهلَه.
 * ========================================================================= */
import { invNormName } from "./utils";

export interface IntentLine {
  product_id: string | null;
  barcode: string;
  name: string;
  qty: string;
  purchase_price: string;
  sell_price: string;
}

export interface KnownProduct {
  id: string;
  name: string;
}

/** الفارغُ (أو غيرُ الرقم) صفرٌ — والصفرُ عقدٌ مع الخادم: «لا تلمس السعر». */
export function sellPriceToSend(raw: string | null | undefined): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** هل سيخلق الخادمُ صفّاً جديداً لهذا السطر؟ (المعرّف، ثمّ الاسمُ المطبَّع) */
export function willCreateProduct(l: IntentLine, known: readonly KnownProduct[]): boolean {
  if (l.product_id) return false;
  const n = invNormName(l.name);
  // الخادمُ يشترط طولاً ≥ ٢ و«item» مستثناة — نفسُ الشرط حرفياً.
  if (n.length >= 2 && n !== "item" && known.some((p) => invNormName(p.name) === n)) return false;
  return true;
}

export type BlockerKind = "zero_sell" | "numeric_name";
export interface PurchaseBlocker {
  kind: BlockerKind;
  /** ما يُعرض للمستخدم ليعرف أيَّ سطرٍ يقصد. */
  label: string;
}

/**
 * ما يمنع الحفظ. **يمنع ولا يُنبّه**: منتجٌ ينزل بسعر صفرٍ يُباع ببلاش، واسمٌ
 * كلُّه أرقامٌ لا يُلقى بالبحث بعد شهر — وكلاهما لا يُرى إلا بعد الضرر.
 * وما عداهما يُقال ولا يمنع (سياسةُ `looksLayoutMangled` القائمة).
 */
export function purchaseBlockers(lines: readonly IntentLine[], known: readonly KnownProduct[]): PurchaseBlocker[] {
  const out: PurchaseBlocker[] = [];
  for (const l of lines) {
    if (!(Number(l.qty) > 0)) continue;              // السطورُ بلا كميةٍ لها حارسُها
    if (!willCreateProduct(l, known)) continue;      // القائمُ لا يُنشَأ، والفارغُ عنده «لا تلمس»
    const label = l.name.trim() || l.barcode.trim();
    if (sellPriceToSend(l.sell_price) <= 0) out.push({ kind: "zero_sell", label });
    // اسمٌ كلُّه أرقام (بعد التطبيع) — رمزٌ كُتب بخانة الاسم لا اسمُ مادّة.
    else if (/^\d+$/.test(invNormName(l.name))) out.push({ kind: "numeric_name", label });
  }
  return out;
}
