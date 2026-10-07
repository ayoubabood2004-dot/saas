/* ============================================================================
 * جيلُ الأسعار بهذا التاب (0226) — بلا استيراد، فيقرؤه كلُّ مالكِ قائمة بلا دوائر.
 *
 * يزيد كلّما عرف التابُ أنّ رفعاً أو إرجاعاً صار (`afterPriceChange`). ومالكُ القائمة
 * (الكاشير، الجملة، التسخينُ بالخلفية) يختم لقطتَه بالجيل لحظةَ **بدء** جلبها؛ وشاشةُ
 * البيع لا تبيع من لقطةٍ جيلُها أقدم. «-1» = لقطةٌ لا نعرف جيلَها ⇒ قديمة.
 * ========================================================================= */
let gen = 0;
const lists = new Map<string, number>();

export function priceGen(): number { return gen; }
export function bumpPriceGen(): void { gen++; }
export function noteListGen(key: string, g: number): void { lists.set(key, g); }
export function listGenOf(key: string): number { return lists.get(key) ?? -1; }
