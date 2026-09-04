/* ============================================================================
 * رموز المنتج — الحقيقة التي بُني عليها هذا الملفّ:
 *
 * **المنتج بالنظام له رمزٌ واحد، وبالواقع له عدّة رموز.** رقمُ الرفّ الذي كتبته
 * العيادة أوّلَ يوم، وباركودُ المصنع على العلبة، وربما باركودُ عبوةٍ ثانية.
 * فيُدخَل المنتجُ برمزٍ، ويُمسَح بعد أسبوع برمزٍ آخر، فيقول النظام «لا يوجد» —
 * والمنتج موجودٌ تحت رمزٍ ثانٍ. هذي مقيسة: ٢٨١ منتجاً بأربع عيادات رمزُه
 * يدويّ قصير (`00`، `247`، `w90`)، و١٠٧ بلا رمزٍ أصلاً.
 *
 * فالدفاعُ يصير على طرفين: عند المسح (ربطُ الرمز الجديد بالمنتج القائم —
 * 0141)، وعند **الإدخال** (هذا الملفّ): قبل أن يُحفظ منتجٌ نفحص مخزن العيادة
 * بالرمز المطبَّع، فنعرض «موجود عندك» بدل أن نسمح بتوأم.
 * ==========================================================================*/
import type { Product } from "@/types";
import { normalizeCode } from "./utils";

/**
 * هل هذا الرمز موجودٌ على منتجٍ بالمخزن؟ يفحص الرمزَ الأساسي والرموزَ الإضافية،
 * **بالتطبيع على الطرفين** — تطبيعُ طرفٍ واحد يفشل بصمتٍ ويبدو أنه يعمل.
 * `excludeId` لنموذج التعديل: المنتجُ لا يتعارض مع نفسه.
 */
export function findByCode(products: readonly Product[], code: string | null | undefined, excludeId?: string | null): Product | undefined {
  const c = normalizeCode(code);
  if (!c) return undefined;
  return products.find((p) =>
    p.id !== excludeId
    && (normalizeCode(p.barcode) === c || (p.alt_codes ?? []).some((a) => normalizeCode(a) === c)));
}

/**
 * هل يبدو الرمزُ رقمَ رفٍّ يدوياً لا باركودَ مصنع؟
 *
 * باركودُ المصنع (EAN/UPC) ثمانيةُ أرقامٍ فأكثر. وما دونها — `247`، `00`،
 * `w90` — كتبه إنسانٌ بيده، وسيُمسَح يوماً باركودُ المصنع فلا يُطابق. لا نمنعه:
 * لعيادةٍ ترقّم رفوفَها حقٌّ بذلك، وهو يُباع ويُبحث عنه بالاسم. لكن نقولها
 * بوضوح: «هذا رقمُ رفّ — امسح باركود العلبة أيضاً»، لأن السكوتَ هنا كلّف
 * عياداتٍ إعادةَ إدخالِ بضاعتها.
 */
export function looksLikeShelfCode(code: string | null | undefined): boolean {
  const c = normalizeCode(code);
  return c.length > 0 && c.length < 8;
}

/**
 * رمزٌ «قريب»: نفسُ رمزِ منتجٍ قائم بزيادة رقمٍ واحد بأوّله أو آخره، أو بنقصانه.
 *
 * مقيسٌ على الإنتاج: ٢٢ زوجاً بثلاث عيادات — `8711908384001` عند «مكافآت
 * قطط» ثم `18711908384001` عند إعادة إدخالها (رقمٌ علق بالخانة قبل المسح)،
 * و`8680542871133` ثم `868054287113` (الماسح بلع الرقم الأخير). النتيجة
 * واحدة: العلبة تُمسح فيقول النظام «لا يوجد» والمادة موجودة برمزٍ يفرق بخانة.
 * لا نمنع — قد يكون رمزاً حقيقياً مختلفاً — لكن نقولها قبل الحفظ.
 * يُطبَّق على باركودات المصنع فقط (٨ خانات فأكثر)؛ أرقامُ الرفوف القصيرة
 * (`1003` و`10030`) جيرانٌ بالطبيعة لا أخطاء.
 */
export function nearCodeTwin(products: readonly Product[], code: string | null | undefined, excludeId?: string | null): Product | undefined {
  const c = normalizeCode(code);
  if (c.length < 8) return undefined;
  const near = (o: string): boolean => {
    if (!o || o === c) return false;
    if (o.length === c.length + 1) return o.slice(1) === c || o.slice(0, -1) === c;
    if (o.length === c.length - 1 && o.length >= 8) return c.slice(1) === o || c.slice(0, -1) === o;
    return false;
  };
  return products.find((p) =>
    p.id !== excludeId
    && (near(normalizeCode(p.barcode)) || (p.alt_codes ?? []).some((a) => near(normalizeCode(a)))));
}

/**
 * توأمٌ محتمل: نفسُ الاسم (مطبَّعاً) لمنتجٍ آخر بنفس المخزن. للدمج لا للمنع —
 * أسماءٌ متطابقة برموزٍ مختلفة قد تكون نكهاتٍ حقيقية لصنفٍ واحد.
 */
export function twinsByName(products: readonly Product[], p: Product, normalizeName: (s: string) => string): Product[] {
  const key = normalizeName(p.name);
  if (!key) return [];
  return products.filter((o) => o.id !== p.id && normalizeName(o.name) === key);
}

/**
 * نفسُ الفكرة لكن على **اسمٍ يُكتب الآن** لا على منتجٍ قائم — فحصُ الإدخال.
 *
 * الرمزُ محميّ: `findByCode` يمنع رمزاً مكرّراً و`nearCodeTwin` يحذّر من رمزٍ
 * يفرق بخانة. لكن لا شيء كان ينظر إلى **الاسم**، وهذا هو الباب الذي دخلت منه
 * كلُّ التوائم المقيسة: يُدخَل المنتجُ برقم الرفّ وهو قائمٌ بباركود المصنع،
 * فيمرّ فحصُ الرمز بحقّ — الرمزُ جديدٌ فعلاً — ويصير للمادة الواحدة صفّان
 * ورصيدان، فيقول أحدُهما «رصيده صفر» عن بضاعةٍ على الرفّ.
 *
 * والتطبيع على الطرفين لازم: «خارجية» و«خارجيه» حجبتا توأماً حقيقياً عن
 * مطابقةٍ حرفية. الجوابُ الصحيح هنا ليس المنعَ بل العرض: هذا موجود، أتربط
 * رمزك به أم هو منتجٌ غيره؟
 */
export function hitsByName(
  products: readonly Product[],
  name: string | null | undefined,
  excludeId: string | null | undefined,
  normalizeName: (s: string) => string,
): Product[] {
  const key = normalizeName((name ?? "").trim());
  if (!key) return [];
  return products.filter((o) => o.id !== excludeId && normalizeName(o.name) === key);
}
