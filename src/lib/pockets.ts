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
 *
 * ── جيبان بالشاشة وحسابٌ واحد بالواقع (0262) ────────────────────────────
 * أغلبُ العيادات تستلم البطاقةَ والتحويلَ على **نفس الحساب البنكيّ**: استلم ٢٥٠٠ بطاقة
 * و١٥٠٠ تحويل، فيرى بحسابه ٤٠٠٠ ويسحبها «من البطاقة» — فالبطاقةُ −١٥٠٠ والتحويلُ +١٥٠٠،
 * والمجموعُ صحيحٌ والتقسيمةُ كذب. فخيارُ العيادة `one_account` (نعم افتراضياً)
 * يعرض جيبين: الدرج، و«الحساب» = البطاقة + التحويل (`pocketsShown`). **خيارُ عرضٍ لا يغيّر
 * صفّاً**: كلُّ سحبٍ يبقى بما سُجّل به ويُجمع لحظةَ العرض، فالأشهرُ الماضية تُقرأ صحيحةً
 * وإطفاؤه يرجّع العرضَ القديم حرفاً. والسحبُ الجديد «من الحساب» يُكتب `account` كما حصل —
 * لا يُنسب لبطاقةٍ ولا تحويل (`shared`)، فمدّةٌ فيها مثلُه تُعرض مجموعةً ولو فُصل الحسابان
 * (`forced`): تقسيمُ ما لا يُعرف تخمينٌ يُصدَّق.
 *
 * والوحدةُ كلُّها لصفحة التقارير وحدها: ما يحتاجه الإقلاع (repo: قيدُ المرتجع) بـ`expenseMethod.ts` —
 * استيرادُه من هنا كان يُدخل حسابَ الجيوب كلَّه حزمةَ الإقلاع (0262).
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
 * و`account` (0262) لا جيبَ له من الثلاثة: «من الحساب» = البطاقةُ والتحويل معاً (`shared`) —
 * سقوطُه للنقد (الفرعُ الأخير) كان سيطرحه من الدرج وهو ما لمس الدرج.
 */
export const pocketOfExpense = (m: ExpenseMethod | null | undefined): Pocket | "shared" =>
  m === "card" ? "card" : m === "bank" ? "transfer" : m === "account" ? "shared" : "cash";

/** طريقةُ قبضٍ ⇒ طريقةُ سحب — بوحدتها الصغيرة (`expenseMethod.ts`)، ويُعاد تصديرُها هنا. */
export { expenseMethodOf } from "./expenseMethod";

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

/** الجيوبُ الثلاثة، و`shared` = سحوباتٌ «من الحساب» (0262) لا تُنسب لبطاقةٍ ولا تحويل (داخلُها صفرٌ دائماً). */
export type PocketTotals = Record<Pocket, PocketFlow> & { shared: PocketFlow };

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
  const acc: PocketTotals = { cash: empty(), card: empty(), transfer: empty(), shared: empty() };
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
  acc.shared.net = -acc.shared.out;
  return acc;
}

/** جيبٌ كما يُعرض: الثلاثةُ، أو «الحساب» = البطاقة + التحويل + سحوباتُ «من الحساب» (0262). */
export type PocketView = Pocket | "account";
export interface PocketRow { key: PocketView; flow: PocketFlow }
export interface PocketsShown {
  rows: PocketRow[];
  /** البطاقةُ والتحويل معروضان حساباً واحداً. */
  merged: boolean;
  /** مدموجان والعيادةُ فصلتهما: بالمدّة سحبٌ «من الحساب» لا يُقسَّم بلا تخمين. */
  forced: boolean;
}

const sum = (...fs: PocketFlow[]): PocketFlow => {
  const r = empty();
  for (const f of fs) { r.in += f.in; r.inCount += f.inCount; r.out += f.out; r.outCount += f.outCount; }
  r.net = r.in - r.out;
  return r;
};

/**
 * الجيوبُ كما تُعرض. `oneAccount` = خيارُ العيادة (0262، نعم افتراضياً): الدرج والحساب.
 * والمفصولُ يبقى ثلاثةً **إلا** مدّةً فيها سحبٌ «من الحساب» — تُعرض مدموجةً (`forced`)
 * ويُقال لماذا. والثابتُ: مجموعُ الصافي بأيّ عرضٍ = مجموعُه بالجيوب كلّها، فلا عرضَ يُخفي فلساً.
 */
export function pocketsShown(t: PocketTotals, oneAccount: boolean): PocketsShown {
  const forced = !oneAccount && t.shared.outCount > 0;
  if (!oneAccount && !forced) return { rows: POCKETS.map((k) => ({ key: k, flow: t[k] })), merged: false, forced: false };
  return { rows: [{ key: "cash", flow: t.cash }, { key: "account", flow: sum(t.card, t.transfer, t.shared) }], merged: true, forced };
}

/** طريقةُ سحبٍ ⇒ جيبُها بالعرض (شاراتُ «منين انسحبت»)، و`null` لسحب المخزن (لا جيبَ له). */
export const shownPocketOfExpense = (m: ExpenseMethod | null | undefined, merged: boolean): PocketView | null => {
  if (m === "stock") return null;
  const p = pocketOfExpense(m);
  if (p === "shared") return "account";
  return merged && p !== "cash" ? "account" : p;
};
