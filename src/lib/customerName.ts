/* ============================================================================
 * اسم الزبون النظيف — علاج «علي هيثم8906139001180».
 *
 * الحالة الواقعية: بلحظة البيع يُلصق بخانة الاسم رقمٌ طويل (هاتف أو رقم
 * بطاقة) مع الاسم أو بدله، فيُحفظ الاثنان معاً ويظهر بالفواتير والديون
 * اسمٌ بذيلٍ رقمي طويل.
 *
 * المعالجة من طرفين:
 *  - عند الحفظ (splitCustomerField): يُفصل الرقم الطويل عن الاسم — النص
 *    للاسم، والرقم لخانة الهاتف إن كانت فارغة. فلا تتلوث بياناتٌ جديدة.
 *  - عند العرض (displayCustomerName): الصفوف القديمة الملوثة أصلاً تُعرض
 *    نظيفة بلا لمس المخزون — البيانات التاريخية لا تُعدَّل بصمت.
 *
 * «رقم طويل» = ٧ خانات فأكثر (بأرقام غربية أو عربية-هندية، وقد تتخللها
 * فراغات أو شُرط). أقل من ذلك يُترك — «محل 24» اسمٌ مشروع.
 * ==========================================================================*/

/** أرقام عربية-هندية ← غربية، حتى يُكتشف الرقم بأي لوحة مفاتيح كُتب. */
const easternToWestern = (s: string): string =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
   .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** سلسلة أرقام (مع فواصل شكلية) طولها الفعلي ≥ ٧ خانات. */
const LONG_RUN = /[+٠-٩۰-۹\d][\s\-٠-٩۰-۹\d]{5,}[٠-٩۰-۹\d]/g;

const runDigits = (run: string): string => easternToWestern(run).replace(/\D/g, "");

/**
 * يفصل خانةً كتب فيها المستخدم اسماً ورقماً معاً.
 * يرجع الاسم بلا الرقم الطويل، والرقم الأول المفصول (إن وُجد).
 */
export function splitCustomerField(raw: string | null | undefined): { name: string; phone: string | null } {
  const s = (raw ?? "").trim();
  if (!s) return { name: "", phone: null };
  let phone: string | null = null;
  const name = s.replace(LONG_RUN, (run) => {
    const digits = runDigits(run);
    if (digits.length < 7) return run;      // «محل 24-26» يبقى كما هو
    if (!phone) phone = digits;             // أول رقم طويل يُعتمد هاتفاً
    return " ";
  }).replace(/\s{2,}/g, " ").replace(/^[\s\-·,،]+|[\s\-·,،]+$/g, "").trim();
  return { name, phone };
}

/** للعرض فقط: اسمٌ بلا ذيله الرقمي. سطرٌ قديم ملوث يظهر نظيفاً دون تعديل مخزونه. */
export function displayCustomerName(raw: string | null | undefined): string {
  return splitCustomerField(raw).name;
}
