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
import { matchCode } from "./utils";
import { layoutFix as _layoutFix } from "./arabicLayout";

/**
 * هل هذا الرمز موجودٌ على منتجٍ بالمخزن؟ يفحص الرمزَ الأساسي والرموزَ الإضافية،
 * **بالتطبيع على الطرفين** — تطبيعُ طرفٍ واحد يفشل بصمتٍ ويبدو أنه يعمل.
 * `excludeId` لنموذج التعديل: المنتجُ لا يتعارض مع نفسه.
 */
export function findByCode(products: readonly Product[], code: string | null | undefined, excludeId?: string | null): Product | undefined {
  const c = matchCode(code);
  if (!c) return undefined;
  return products.find((p) =>
    p.id !== excludeId
    && (matchCode(p.barcode) === c || (p.alt_codes ?? []).some((a) => matchCode(a) === c)));
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
  const c = matchCode(code);
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
  const c = matchCode(code);
  if (c.length < 8) return undefined;
  const near = (o: string): boolean => {
    if (!o || o === c) return false;
    if (o.length === c.length + 1) return o.slice(1) === c || o.slice(0, -1) === c;
    if (o.length === c.length - 1 && o.length >= 8) return c.slice(1) === o || c.slice(0, -1) === o;
    return false;
  };
  return products.find((p) =>
    p.id !== excludeId
    && (near(matchCode(p.barcode)) || (p.alt_codes ?? []).some((a) => near(matchCode(a)))));
}

/**
 * فهرسُ «رمزٌ → منتج» لمخزن العيادة — **الأساسيّ والإضافيّ معاً**.
 *
 * الشاشاتُ التي تبني فهرسَها بيدها كانت تفهرس `barcode` وحده، فمسحُ باركود
 * المصنع على بضاعةٍ داخلة لا يلقى المادّةَ (رمزُها الأساسيّ رقمُ رفّ) فيُنشئ
 * توأماً برصيدٍ مقسوم — نفسُ دورةِ «المنتج اختفى» التي أُغلقت عند البيع وبقيت
 * مفتوحةً عند الشراء.
 *
 * وقاعدةُ الأولوية صريحةٌ لأنها تقرّر أين تُرصَّد البضاعة:
 *  ١) الرمزُ الأساسيّ يغلب الإضافيّ — رمزٌ هو باركودُ منتجٍ وإضافيٌّ لآخر
 *     يخصّ صاحبَه الأصليّ.
 *  ٢) وعند التساوي: المصنَّفُ يغلب «بدون صنف»، ثم الأقدم.
 */
export function codeIndex(products: readonly Product[]): Map<string, Product> {
  const m = new Map<string, Product>();
  const fromAlt = new Set<string>();
  const put = (raw: string | null | undefined, p: Product, alt: boolean): void => {
    const k = matchCode(raw);
    if (!k) return;
    const cur = m.get(k);
    if (!cur) { m.set(k, p); if (alt) fromAlt.add(k); return; }
    if (!alt && fromAlt.has(k)) { m.set(k, p); fromAlt.delete(k); return; }
    if (alt && !fromAlt.has(k)) return;
    const better = (!!p.section_id && !cur.section_id)
      || (!!p.section_id === !!cur.section_id && (p.created_at ?? "") < (cur.created_at ?? ""));
    if (better) m.set(k, p);
  };
  for (const p of products) put(p.barcode, p, false);
  for (const p of products) for (const c of p.alt_codes ?? []) put(c, p, true);
  return m;
}

/**
 * مرشِّحُ البحث بالرمز: يُبنى مرّةً لكلّ استعلام، ويُسأل عن كلّ منتج.
 *
 * الفرقُ عن `findByCode` أن هذا **جزئيّ** — الطبيبُ يكتب أربع خاناتٍ من ثلاثَ
 * عشرة ويتوقّع أن تظهر المادّة قبل أن يُتمّها. ولذلك هو `includes` لا `===`.
 *
 * وسببُ وجوده أنه كان مكتوباً بيده بستّ شاشات، ولا اثنتان منها تتّفقان: شاشةُ
 * البيع تفحص الأساسيَّ والإضافيّ مطبَّعَين، وتبويبُ المنتجات مثلها لكن بلا طيّ
 * الحالة (`W90` لا تلقى `w90`)، وصفحةُ الشركة وصفحةُ الصنف ونافذةُ الدمج
 * تفحص **الأساسيَّ وحده** (فرمزُ الرفّ الإضافيّ لا يلقى شيئاً)، ونافذةُ إسناد
 * المنتجات للشركة تقارن الخامَ بالخام (فرقمٌ عربيّ أو مسافةٌ يُسقطان المطابقة).
 *
 * وشاشتان تبحثان بطريقتين تصنعان نفسَ الكذبة المقيسة: الطبيبُ يبحث بالبيع فلا
 * يجد، فيتأكّد من صفحة الشركة فلا يجد، فيستنتج أن المادّة غير مُدخَلة ويعيد
 * إدخالها — توأمٌ برصيدٍ مقسوم. فصار للبحث بالرمز **مصدرٌ واحد**.
 *
 * والتطبيعُ من `matchCode` (طيُّ الحالة داخلٌ فيه) على **الطرفين**: الاستعلامُ
 * مرّةً، وكلُّ رمزٍ عند فحصه. واستعلامٌ فارغٌ بعد التطبيع لا يطابق شيئاً — لا
 * كلَّ شيء؛ لأن `"".includes("")` صحيحةٌ دائماً وكانت ستُظهر المخزنَ كلَّه
 * كأنّه نتائجُ بحث.
 */
export function codeMatcher(query: string | null | undefined): (p: Product) => boolean {
  const c = matchCode(query);
  if (!c) return () => false;
  return (p) => matchCode(p.barcode).includes(c) || (p.alt_codes ?? []).some((a) => matchCode(a).includes(c));
}

/**
 * مسحةٌ بلا رأسها: الرمزُ الواصل ذيلُ رمزٍ قائم ينقصه رقمٌ أو رقمان من أوّله.
 *
 * مقيسٌ على الإنتاج (ابن الهيثم، ٥ أيلول ٢٠٢٦): كلُّ مسحةٍ فاشلة باليوم ١١ أو
 * ١٢ رقماً وكلُّ ناجحة ١٣، ونفسُ العلبة تنجح بعد ثوانٍ. السببُ بالمتصفّح
 * (`scanBuffer.ts`)، لكن الدفاعَ لا يثق بطبقةٍ واحدة: لو وصل ذيلٌ فقط، ووُجد
 * بالمخزن منتجٌ **واحدٌ لا غير** ينتهي رمزُه به، فهو المقصود. عشرةُ أرقامٍ
 * فأكثر: ذيلٌ بهذا الطول لا يتكرّر بين رمزَين مختلفَين إلا نادراً، وعند التعدّد
 * لا نخمّن — نُرجع لا شيء ويُعرض الاختيارُ على الإنسان.
 */
export function matchTruncatedCode(products: readonly Product[], code: string | null | undefined): Product | undefined {
  const c = matchCode(code);
  if (!/^[0-9]{10,}$/.test(c)) return undefined;
  const tailOf = (o: string | null | undefined): boolean => {
    const n = matchCode(o);
    return n.length > c.length && n.length - c.length <= 2 && n.endsWith(c);
  };
  const hits = products.filter((p) => tailOf(p.barcode) || (p.alt_codes ?? []).some(tailOf));
  return hits.length === 1 ? hits[0] : undefined;
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

/* مسخُ تخطيط الكيبورد العربي (G7): الخريطةُ **بياناتٌ لا نصٌّ معروض** فتسكن
 * ملفَّها وحدها (src/lib/arabicLayout.ts) — وتُعاد تصديرُها هنا فلا يتغيّر
 * نداؤها. انظر ذلك الملفّ للحالة المقيسة بالإنتاج. */
export { layoutFix, hasArabicLetters, looksLayoutMangled } from "./arabicLayout";

/* ── أشكالُ إكسل: الرقمُ الطويل يُفسَد لحظةَ اللصق ─────────────────────────
 * إكسل يعامل الباركودَ رقماً، فيحوّل ثلاثةَ عشرَ رقماً إلى `1.23457E+12` أو
 * يذيّلها `.0`. واللصقُ يخزّن الفاسدَ، فلا تطابقه مسحةٌ حقيقية أبداً — «ضياعُ»
 * الرمز لحظةَ الإدخال. والأصلُ **لا يُسترجع** من الصيغة العلمية (الأرقامُ
 * الوسطى ذهبت)، فلا نُصلح — نرفض ونقول للطبيب ماذا يفعل بإكسل.
 * ولا نلمس `normalizeCode`: قدسيةُ البيانات، والكشفُ شأنُ نقاط الإدخال. */
export type ExcelArtifact = "sci" | "trailing-zero";

/** نوعُ عطبِ إكسل بالرمز، أو null إن كان سليماً. */
export function excelArtifact(code: string | null | undefined): ExcelArtifact | null {
  const s = String(code ?? "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?[Ee][+-]?\d+$/.test(s)) return "sci";
  if (/^\d{6,}\.0+$/.test(s)) return "trailing-zero";
  return null;
}

const DIGITS_ONLY = /^\d+$/;

const AIM_HEAD = /^\][A-Za-z]\d/;

/**
 * يقشّر بادئةَ رمز النظام AIM إن أخرجها الماسح: `]` + حرف + رقم — `]C1`
 * لـEAN/UPC، و`]E0` لـEAN-13، و`]d2` لـDataMatrix… ثلاثةُ محارفٍ قبل الرمز
 * الحقيقي. تُصدَّر لأن شاشةَ الشراء تحتاجها **قبل** أن تحكم «رمزٌ أم اسم»:
 * `]` ليست من محارف الباركود، فرمزٌ برأس AIM كان يسقط إلى فرع الاسم فيُنشأ
 * منتجٌ اسمُه «]C16221…» بمخزن العيادة. رمزٌ لا يصير اسماً أبداً.
 */
export function stripAim(v: string | null | undefined): string {
  const s = String(v ?? "");
  return AIM_HEAD.test(s) ? s.slice(3) : s;
}
/** الصيغُ البديلة المعقولة لرمزٍ ممسوح، بلا الرمزِ نفسه. */
export function scanVariants(code: string | null | undefined, withLayoutFix = true): string[] {
  const raw = matchCode(code);
  if (!raw) return [];
  const out = new Set<string>();
  const seen = new Set<string>([raw]);
  const queue: string[] = [raw];

  /** خطوةٌ واحدة على صيغة: قشرُ رأس AIM، ثم صيغُ الأصفار القياسية. */
  const step = (v: string): string[] => {
    const res: string[] = [];
    // بادئةُ AIM: `]` + حرف + رقم — ثلاثةُ محارفٍ قبل الرمز الحقيقي.
    const d = stripAim(v);
    if (d !== v) res.push(d);
    if (DIGITS_ONLY.test(d)) {
      if (d.length === 14 && d.startsWith("0")) res.push(d.slice(1));         // GTIN-14 → EAN-13
      if (d.length === 13 && d.startsWith("0")) res.push(d.slice(1));         // EAN-13 بصفر → UPC-A
      if (d.length === 12) res.push("0" + d);                                  // UPC-A → EAN-13 مخزون بصفر
      if (d.length === 8 && d.startsWith("0")) res.push(d.slice(1));          // EAN-8 بصفر
    }
    return res;
  };

  /* خطُّ أنابيبٍ لا قائمةَ فروعٍ متوازية: كلُّ صيغةٍ جديدة تعود للفرعين حتى
   * الثبات. السبب أن الفروع كانت تُحسب من الخام وحده، فبادئةُ AIM إن وصلت
   * **ممسوخةً** بالتخطيط العربي تبقى ملتصقةً بالرمز بعد إصلاح التخطيط فلا
   * تطابق شيئاً.
   * والسقفُ ليس زينة: فرعُ AIM يقصّ **ثلاثة** محارف لا واحداً، فرأسٌ مكرَّر
   * (`]a1]a1…`) يولّد صيغةً بكل تكرار. مقيسٌ: ثلاثون رأساً + أربعةَ عشرَ صفراً
   * تبلغ السقفَ تماماً. لا يقع بماسحٍ سليم، ويقع بحقلٍ لُصق فيه شيء. */
  const CAP = 24;
  const drain = () => {
    while (queue.length && out.size < CAP) {
      const cur = queue.shift() as string;
      for (const v of step(cur)) {
        if (!v || seen.has(v)) continue;
        seen.add(v); out.add(v); queue.push(v);
      }
    }
  };

  drain();                                  // فروعُ الرمز كما وصل — أولى بالثقة
  /* ثم قراءتُه بعكس تخطيطٍ عربيّ (G7)، وفروعُ تلك القراءة بعدها. ويمرّ الكلُّ
   * من قناة النجدة نفسها: مطابقةٌ واحدةٌ أو لا شيء — ولا تخمينَ عند التعدّد.
   * وهذا الفرعُ **بالواجهة وحدها**: خريطةُ التخطيط بياناتُ متصفّحٍ
   * (`arabicLayout.ts`)، ونسخُها بالقاعدة نسختان تفترقان. فمن يريد مطابقةَ ما
   * يفعله الخادمُ بالضبط (0172) يمرّرُ `withLayoutFix = false`. */
  if (withLayoutFix) {
    const fixed = matchCode(_layoutFix(raw));
    if (fixed && !seen.has(fixed)) {
      seen.add(fixed); out.add(fixed); queue.push(fixed);
      drain();
    }
  }
  out.delete(raw);
  out.delete("");
  return [...out];
}

/**
 * طبقةُ نجدةٍ **لحقول البحث** لا للمسح: حين تخيب المطابقةُ الحرفية واستعلامُ
 * المستخدم شكلُه رمزٌ (ثماني خاناتٍ فأكثر بعد التطبيع)، تُجرَّب صيغُ الماسح
 * قبل أن تُعلن الشاشةُ «لا نتائج».
 *
 * السبب: `codeMatcher` مطابقةُ احتواءٍ مطبَّعة — ورمزُ ١٤ خانة (GTIN-14) لا
 * يكون جزءاً من ١٣ مخزونة، ورأسُ AIM يزيده بعداً. وشاشةُ المخزون هي حيث
 * يُتَّخذ قرارُ «هذي المادّة غير مُدخَلة ⇒ أُدخلها من جديد» — فخيبةٌ كاذبة
 * هنا تصنع التوأمَ الذي يقسم الرصيد.
 *
 * ولا ذيلَ مقطوعاً هنا عمداً: `matchTruncatedCode` تطلب أن ينتهي المخزونُ
 * بالمكتوب، وذلك **احتواءٌ** — فـ`codeMatcher` تلقاه قبل أن تُنادى هذه أصلاً.
 * فرعٌ لا يُبلَغ أسوأُ من لا فرع: يُقاس عليه فحصٌ يمرّ عن مسارٍ لا تسلكه شاشة.
 *
 * تُرجع ما وجدته (صفراً أو واحداً) ليُضاف لما وجدته الشاشة، لا ليحلَّ محلَّه.
 */
export function codeRescue(products: readonly Product[], query: string | null | undefined): Product[] {
  const code = matchCode(query);
  if (code.length < 8) return [];        // كلمةٌ أو رقمُ رفٍّ قصير — لا تُخمَّن
  const r = rescueScan(products, code);
  return r ? [r.product] : [];
}

/** هل يحمل هذا المنتجُ هذا الرمزَ حرفياً (أساسيّاً أو إضافياً، بعد التطبيع)؟ */
export function carriesCode(p: Product, code: string | null | undefined): boolean {
  const c = matchCode(code);
  if (!c) return false;
  return matchCode(p.barcode) === c || (p.alt_codes ?? []).some((a) => matchCode(a) === c);
}

/**
 * نجدةُ المسحة: مطابقةٌ **واحدة** لصيغةٍ بديلة على مخزن العيادة، أو لا شيء.
 * تُرجع المنتجَ والصيغةَ التي أصابت — فتُقال بصوت لا بصمت.
 */
export function rescueScan(products: readonly Product[], code: string | null | undefined): { product: Product; via: string } | undefined {
  for (const v of scanVariants(code)) {
    const hits = products.filter((p) =>
      matchCode(p.barcode) === v || (p.alt_codes ?? []).some((a) => matchCode(a) === v));
    if (hits.length === 1) return { product: hits[0], via: v };
    if (hits.length > 1) return undefined; // التباس — النافذة أصدق من تخمين
  }
  return undefined;
}
