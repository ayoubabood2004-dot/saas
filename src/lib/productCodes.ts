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

/* ── مسحةٌ لا تُطابق حرفياً — قبل أن نقول «ما ينعرف» ───────────────────────
 * الماسحُ لوحةُ مفاتيح، وما يكتبه ليس دائماً ما طُبع على العلبة:
 *   · بادئةُ رمزِ النظام AIM (`]E0`، `]C1`) إن كانت مفعّلةً بإعداد الماسح؛
 *   · صفرٌ أوّلُ حين يُخرج الماسحُ EAN-13 بهيئة GTIN-14 (`0` + ١٣ رقماً)؛
 *   · UPC-A (١٢ رقماً) مخزونٌ عندنا بهيئة EAN-13 بصفرٍ أوّل، أو العكس.
 * فنجرّب هذه الصيغَ **بعد** فشلِ المطابقة الحرفية، وعلى مخزنِ العيادة المحمَّل
 * فقط، ولا نقبل إلا مطابقةً واحدةً — اثنتان = التباس، فنُبقي النافذة.
 * هذا ليس تطبيعاً على طرفٍ واحد (ذاك يفشل بصمت)؛ هو مسارُ نجدةٍ صريحٌ بعد
 * المسار الأصليّ، وكلُّ صيغةٍ فيه مفحوصةٌ باسمها.
 * ──────────────────────────────────────────────────────────────────────── */

/** الصيغُ البديلة المعقولة لرمزٍ ممسوح، بلا الرمزِ نفسه. */
export function scanVariants(code: string | null | undefined): string[] {
  const raw = normalizeCode(code);
  if (!raw) return [];
  const out = new Set<string>();
  // بادئةُ AIM: `]` + حرف + رقم — ثلاثةُ محارفٍ قبل الرمز الحقيقي.
  const noAim = raw.replace(/^\][A-Za-z]\d/, "");
  if (noAim !== raw) out.add(noAim);
  const d = noAim;
  if (/^\d+$/.test(d)) {
    if (d.length === 14 && d.startsWith("0")) out.add(d.slice(1));          // GTIN-14 → EAN-13
    if (d.length === 13 && d.startsWith("0")) out.add(d.slice(1));          // EAN-13 بصفر → UPC-A
    if (d.length === 12) out.add("0" + d);                                   // UPC-A → EAN-13 مخزون بصفر
    if (d.length === 8 && d.startsWith("0")) out.add(d.slice(1));           // EAN-8 بصفر
  }
  out.delete(raw);
  return [...out];
}

/**
 * نجدةُ المسحة: مطابقةٌ **واحدة** لصيغةٍ بديلة على مخزن العيادة، أو لا شيء.
 * تُرجع المنتجَ والصيغةَ التي أصابت — فتُقال بصوت لا بصمت.
 */
export function rescueScan(products: readonly Product[], code: string | null | undefined): { product: Product; via: string } | undefined {
  for (const v of scanVariants(code)) {
    const hits = products.filter((p) =>
      normalizeCode(p.barcode) === v || (p.alt_codes ?? []).some((a) => normalizeCode(a) === v));
    if (hits.length === 1) return { product: hits[0], via: v };
    if (hits.length > 1) return undefined; // التباس — النافذة أصدق من تخمين
  }
  return undefined;
}
