/* ============================================================================
 * كتاباتُ لوحة المتجر (0229) — قواعدُ صافيةٌ تُفحص بالتشغيل (scripts/store-price-test.mjs).
 *
 * البطاقةُ ومراجعةُ الأسعار تكتبان سعرَ الكاشير نفسَه، فثلاثةُ أسئلةٍ تُحسم هنا مرّةً واحدة:
 *   • «تحت الكلفة» بعد الحفظ: العلامةُ يحسبها الخادمُ عند التحميل وحده، فكانت تبقى على
 *     السعر القديم حتى إعادةِ تحميلٍ كاملة — سعرٌ مكتوبٌ غلطاً تحت الكلفة بلا علامة، وسعرٌ
 *     صُحّح يبقى أحمرَ ومعدوداً فيُرفع مرّةً ثانية. فتُحسب من الصفّ الراجع بمرآة الخادم حرفاً.
 *   • السعرُ المشبوه: ماسحٌ بحقلٍ مفتوح يكتب الرمزَ ثمّ Enter، فيصير الباركودُ سعرَ الكاشير
 *     (صفرٌ + EAN-8 = 62,912,345 يمرّ بـnumeric(12,2)). فما يشبه رمزاً أو يقفز فوق عشرة
 *     أضعافٍ يُسأل عنه بزرٍّ صريح — لا يُحفظ بـEnter.
 *   • الرفضُ ماذا يعني: صفٌّ قديمٌ على الشاشة (تُعاد القراءة) أم إذنٌ سُحب (يُعاد جلبُ الإذن).
 * ==========================================================================*/

/** «تحت الكلفة» — مرآةُ `photo_products` (0229): كلفةٌ موجبة، وسعرٌ موجب، والسعرُ أقلّ منها. */
export function belowCost(purchase: unknown, sell: unknown): boolean {
  const c = Number(purchase) || 0;
  const s = Number(sell) || 0;
  return c > 0 && s > 0 && s < c;
}

/** ما يُرقَّع بالصفّ بعد حفظ السعر بـ`updateProduct`: السعرُ كما رجع من القاعدة، والعلامةُ منه.
 *  بلا صفٍّ راجع (المرآةُ التجريبية لم تلقَ المنتج) ⇒ السعرُ المطلوب وحده، والعلامةُ لا تُخمَّن. */
export function pricePatchFrom(
  saved: { sell_price?: unknown; purchase_price?: unknown } | null | undefined,
  v: number,
): { sell_price: number; below_cost?: boolean } {
  if (!saved) return { sell_price: v };
  const s = Number(saved.sell_price);
  const sell = Number.isFinite(s) && s > 0 ? s : v;
  return { sell_price: sell, below_cost: belowCost(saved.purchase_price, sell) };
}

/** فوق هذا المضاعَف من السعر الحالي يُسأل: صفرٌ زائدٌ أو رمزٌ ممسوح لا رفعٌ مقصود. */
export const JUMP_FACTOR = 10;
/** أقصرُ باركودٍ شائع (EAN-8 / UPC-E): رقمٌ صحيحٌ بثمانِ خاناتٍ فأكثر يشبه رمزاً لا سعراً. */
export const CODE_DIGITS = 8;

export type PriceDoubt = "code" | "jump";

/** هل يُسأل عن هذا السعر قبل حفظه؟ `raw` النصُّ كما كُتب (خاناتُه الصحيحة تُعدّ منه — صفرٌ
 *  بأوّله من مسودّةٍ «0» يبقى خانةً)، و`next` قيمتُه، و`prev` السعرُ الحالي (صفرٌ/فارغ = بلا سعر). */
export function priceDoubt(raw: string, next: number, prev: number | null | undefined): PriceDoubt | null {
  const intDigits = (String(raw).trim().split(/[.,\u066B]/)[0] ?? "").replace(/\D/g, "").length;
  if (intDigits >= CODE_DIGITS) return "code";
  const p = Number(prev) || 0;
  if (p > 0 && next > p * JUMP_FACTOR) return "jump";
  return null;
}

const fields = (e: unknown): { code?: unknown; message?: unknown } =>
  (e && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown };

/** رفضٌ لأنّ الإذنَ سُحب (`not_authorized` — P0001 منذ 0229، و42501 بالتعريفات الأقدم بنفس النصّ):
 *  الإذنُ المخبّأ بالجهاز قديم، فالشاشةُ ما زالت تعرض أزراراً لم تعد لصاحبها. */
export function refusedByRole(e: unknown): boolean {
  return fields(e).message === "not_authorized";
}

/** رفضٌ يقول إنّ الصفَّ المعروض قديم: السعرُ تغيّر من جهازٍ آخر (`price_moved`)، أو المنتجُ لم يعد
 *  كما فُتح (`product_not_found`، أو تحديثٌ لم يمسّ صفاً). اللوحةُ تعيد القراءة — وإلا فشلت كلُّ
 *  إعادةٍ بنفس الطريقة حتى تحديث المتصفّح. */
export function staleWrite(e: unknown): "price_moved" | "gone" | null {
  const { code, message } = fields(e);
  if (code === "price_moved" || message === "price_moved") return "price_moved";
  if (message === "product_not_found" || code === "no_row_updated" || message === "no_row_updated") return "gone";
  return null;
}
