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

/* الأرقام تصل بثلاث مجموعات محارف: غربية (0-9)، وعربية-هندية
 * (U+0660–U+0669)، وفارسية (U+06F0–U+06F9). وتُكتب هنا برموز يونيكود لا
 * بالحرف نفسه: هذا ملفُّ منطقٍ خالص، وحارس i18n يرفض العربية داخل الكود
 * بحقّ — والرمز أوضح على كل حال حين يكون المقصود «مدى محارف» لا «كلمة». */
const AR_ZERO = 0x0660; // ٠
const FA_ZERO = 0x06f0; // ۰
const DIGITS = "0-9\\u0660-\\u0669\\u06F0-\\u06F9";

/** أرقام عربية-هندية أو فارسية ← غربية، حتى يُقرأ الرقم بأي لوحة مفاتيح كُتب. */
const easternToWestern = (s: string): string =>
  s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= FA_ZERO ? c - FA_ZERO : c - AR_ZERO);
  });

/** سلسلة أرقام (مع فواصل شكلية) طولها الفعلي ≥ ٧ خانات. */
const LONG_RUN = new RegExp(`[+${DIGITS}][\\s\\-${DIGITS}]{5,}[${DIGITS}]`, "g");

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
  }).replace(/\s{2,}/g, " ").replace(/^[\s\-·,\u060C]+|[\s\-·,\u060C]+$/g, "").trim();
  return { name, phone };
}

/** للعرض فقط: اسمٌ بلا ذيله الرقمي. سطرٌ قديم ملوث يظهر نظيفاً دون تعديل مخزونه. */
export function displayCustomerName(raw: string | null | undefined): string {
  return splitCustomerField(raw).name;
}
