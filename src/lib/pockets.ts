/* ============================================================================
 * الجيوب — أين المال فعلاً، داخلاً وخارجاً.
 *
 * ── المشكلة التي أنشأت هذا الملفّ ────────────────────────────────────────
 * شاشةُ المال كانت تعرض **الداخلَ** لكلّ طريقة (نقد/بطاقة/تحويل) و**الصافيَ
 * للنقد وحدَه**. فالبطاقةُ والتحويلُ يظهران بمبلغهما الداخل كاملاً وكأنّ شيئاً
 * لم يخرج منهما.
 *
 * والقياسُ على الإنتاج يقول كم كلّف ذلك (٢٠٢٦-٠٨):
 *   تحويلٌ داخل ٢٬٣٤٨٬٠٠٠ · خارج ٣٬٣٣٢٬٠٠٠ ⇒ **الصافي سالبٌ ٩٨٤٬٠٠٠**
 * والشاشةُ كانت تقول «+٢٬٣٤٨٬٠٠٠». ليس رقماً ناقصاً — **إشارةٌ معكوسة**.
 * وأيلول: بطاقةٌ معروضةٌ ١٬٧٨٩٬٥٠٠ وصافيها ٤٨٧٬٥٠٠ (مبالَغٌ بها ٧٣٪).
 *
 * ── المصيدة: جيبٌ واحدٌ باسمين ───────────────────────────────────────────
 * الداخلُ مفرداتُه `cash | card | transfer` (PaymentMethod)، والخارجُ
 * `cash | card | bank` (ExpenseMethod). فـ«تحويل» و«حوالة بنك» **جيبٌ واحد**
 * باسمين، وأيُّ ربطٍ ساذجٍ بالاسم يطرح صفراً ويبدو أنه يعمل.
 *
 * والترجمةُ كانت مكرّرةً بأربعة مواضع بالشِفرة (تعبيرٌ ثلاثيٌّ منسوخٌ بيدٍ)
 * ولم تكن مكتوبةً بمكانٍ واحد. صارت هنا: **مصدرُ الحقيقة الوحيد للجيوب**.
 *
 * ── ما يدخل الحساب وما لا يدخل ──────────────────────────────────────────
 * الداخلُ من سيقان التحصيل (`collectionsInRange`) لا من `payment_method`
 * بالفاتورة: الفاتورةُ تحمل «الطريقةَ الغالبة» فقط، والدفعُ قد يكون مجزّأً،
 * وتسديدُ دينٍ قديمٍ يقع بيومه لا بيوم البيع. والساقُ السالبة **تبقى** —
 * هي تصحيحُ تحصيل (0113)، وإسقاطُها يترك مالاً لم يصل محسوباً.
 *
 * والخارجُ من `expenses` كلِّها بمدّتها — ومنها المرتجعاتُ للزبائن، وهي مالٌ
 * خرج فعلاً (هذا ما كان يفعله `netCash` قبل هذا الملفّ، ولم يتغيّر).
 *
 * **وما لا يدخل، ويجب أن يُقال**: تسديدُ المورّدين (`settlePurchase`) وتحصيلُ
 * السائقين (`settleCourier`) يحرّكان مالاً بلا صفٍّ بـ`expenses`. القياسُ
 * على تسعين يوماً: كلُّ حركةٍ منهما كانت **نقداً** (مشترياتٌ ٦١٢٬٩٠٠،
 * توصيلٌ ٨٩٣٬٥٠٠، صفرُ بطاقةٍ وصفرُ حوالة) — فجيبا البطاقة والتحويل دقيقان
 * تماماً، وجيبُ النقد يبقى بنقصِه القديم. لا يُدّعى غيرُ هذا.
 * ==========================================================================*/
import type { PaymentMethod, ExpenseMethod } from "@/types";

/** الجيبُ الحقيقيّ. ثلاثةٌ لا ستّة — «تحويل» و«حوالة بنك» واحد. */
export type Pocket = "cash" | "card" | "transfer";

export const POCKETS: readonly Pocket[] = ["cash", "card", "transfer"] as const;

/** طريقةُ قبضٍ ⇒ جيب. (تطابقٌ اسميّ، والدالّةُ موجودةٌ ليبقى المرورُ واحداً.) */
export const pocketOfPayment = (m: PaymentMethod | null | undefined): Pocket =>
  m === "card" ? "card" : m === "transfer" ? "transfer" : "cash";

/**
 * طريقةُ سحبٍ ⇒ جيب. **هنا تُترجم `bank` إلى `transfer`.**
 * والفارغُ نقدٌ: صفوفٌ قديمةٌ سبقت وجودَ العمود، ومعناها الأصليّ «من الصندوق».
 */
export const pocketOfExpense = (m: ExpenseMethod | null | undefined): Pocket =>
  m === "card" ? "card" : m === "bank" ? "transfer" : "cash";

/**
 * طريقةُ قبضٍ ⇒ طريقةُ سحب — حين يُقيَّد مالٌ خارجٌ بمفردات السحوبات
 * (المرتجعات مثلاً). كانت منسوخةً بأربعة مواضع؛ صارت هنا.
 * والمدخلُ نصٌّ حرٌّ عمداً: بعضُ المستدعين يمرّرون `bank` وبعضُهم `transfer`.
 */
export const expenseMethodOf = (m: string | null | undefined): ExpenseMethod => {
  const s = (m ?? "").toLowerCase();
  return s === "card" ? "card" : s === "transfer" || s === "bank" ? "bank" : "cash";
};

export interface PocketFlow {
  /** المُحصَّل بهذا الجيب خلال المدّة (بالإشارة — التصحيحُ السالب يخفّضه). */
  in: number;
  inCount: number;
  /** المسحوب منه خلال المدّة. */
  out: number;
  outCount: number;
  /** `in − out`. قد يكون سالباً، وهذا خبرٌ لا عطل. */
  net: number;
}

export type PocketTotals = Record<Pocket, PocketFlow>;

const empty = (): PocketFlow => ({ in: 0, inCount: 0, out: 0, outCount: 0, net: 0 });

/**
 * صافي كلّ جيبٍ من تحصيلاتٍ ومصروفاتٍ **مقصوصةٍ على المدّة مسبقاً**.
 *
 * الدالّةُ نقيّةٌ عمداً (لا تواريخَ ولا تصفية): المدّةُ شأنُ المستدعي، وهكذا
 * تُفحص بلا ساعةٍ ولا منطقةٍ زمنية.
 */
export function netPerPocket(
  collections: readonly { method: PaymentMethod | null | undefined; amount: number }[],
  expenses: readonly { method?: ExpenseMethod | null; amount: number }[],
): PocketTotals {
  const acc: PocketTotals = { cash: empty(), card: empty(), transfer: empty() };
  for (const c of collections) {
    const n = Number(c.amount);
    if (!Number.isFinite(n) || n === 0) continue;
    const p = acc[pocketOfPayment(c.method)];
    p.in += n; p.inCount += 1;
  }
  for (const e of expenses) {
    // سحبُ المخزن (0216) لا جيبَ له: فلوسُ البضاعة طلعت يوم شرائها، والدرجُ ما نقص.
    if (e.method === "stock") continue;
    const n = Number(e.amount);
    if (!Number.isFinite(n) || n === 0) continue;
    const p = acc[pocketOfExpense(e.method)];
    p.out += n; p.outCount += 1;
  }
  for (const k of POCKETS) acc[k].net = acc[k].in - acc[k].out;
  return acc;
}
