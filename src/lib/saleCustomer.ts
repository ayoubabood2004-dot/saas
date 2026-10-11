/**
 * «امسح الزبون وخلّي السلّة» — أيُّ سطرٍ يتبع الزبونَ ولا يجوز أن يُباع لغيره.
 *
 * الشكوى: الطبيبُ يفتح البيعَ من سجلّ حيوان، ثم يغيّر رأيَه فلا يريد البيعَ لهذا
 * الزبون — والسلّةُ فيها أشياءُ كثيرة يريد بيعَها لغيره. زرُّ التصفير الوحيد يمسح
 * **السلّةَ معه**.
 *
 * والفخُّ الذي يجعل «امسح الاسم وحده» خطأً صامتاً: سطورُ السلّة تحمل الحيوانَ الذي
 * أُضيفت له **لحظةَ إضافتها** (`petId`)، وعند الإتمام تُكتب بسجلّه: لقاحٌ وعلاجٌ
 * (`med`)، وطلبُ تحليلٍ (خدمةٌ بمريض)، وعمليةٌ تفتح طبلةً وزيارة. فلو بقيت بالسلّة
 * وبيعت لزبونٍ آخر، نزلت **بسجلّ الحيوان الأوّل**: لقاحٌ لم يُعطَ لصاحبه.
 * ولو فُكّ ربطُها بصمت، بيعت وطُبعت ولم تُكتب بسجلّ أحد — وهو الصمتُ الذي يُصدَّق.
 *
 * فالقاعدة هنا: **تُرفع من السلّة ويُقال اسمُها**. ما عداها (المنتجاتُ والخدماتُ بلا
 * مريض) يبقى كما هو — وهو جسمُ السلّة الكبيرة التي يريد الطبيبُ بيعَها.
 */

/** ما يلزم من سطر السلّة للحكم — بنيةٌ لا صنف، فأيُّ سطرٍ يوافقها. */
export type SaleLineLike = {
  id: string;
  kind: string;
  petId?: string | null;
  petName?: string | null;
  name: string;
  med?: unknown;
  /** مسودّاتٌ لُصقت بعد الأولى بسطر منتج (حيوانٌ ثانٍ) — كلٌّ بحيوانه. */
  medMore?: readonly { petId: string | null }[];
};

/** سطرٌ يتبع المريضَ: يُكتب بسجلّه عند الإتمام (لقاحٌ/علاجٌ، خدمةٌ بمريض، بندُ تحليل).
 *
 *  **الربطُ بالمريض لا بنوع السطر**: دواءٌ بلا مريض (زبونٌ عابرٌ باسمٍ فقط) لا يُكتب
 *  بسجلّ أحد — الإتمامُ يتخطّاه (`!l.petId`) — فهو كأيّ منتجٍ بالسلّة ويبقى. كان
 *  النوعُ وحدَه يرفعه، والنافذةُ تقول عنه «ينكتب بسجلّ حيوانه» وهو لا يُكتب بمكان. */
export function isCustomerBound(l: SaleLineLike): boolean {
  // ومسودّةٌ لُصقت بعد الأولى لحيوانٍ معروف تربطه كذلك — وإلا بقي السطرُ بعد المسح ونزل بسجلّه.
  return l.petId != null || l.id.startsWith("s:lab:") || !!l.medMore?.some((m) => m.petId != null);
}

/** السطورُ التي يجب أن تُقال قبل مسح الزبون. */
export function customerBoundLines<T extends SaleLineLike>(cart: readonly T[]): T[] {
  return cart.filter(isCustomerBound);
}

/** السلّةُ بعد مسح الزبون: يبقى كلُّ ما لا يتبع مريضاً. مُتساوقةٌ مع نفسها (idempotent). */
export function cartAfterClearCustomer<T extends SaleLineLike>(cart: readonly T[]): T[] {
  return cart.filter((l) => !isCustomerBound(l));
}

/* ============================================================================
 * بحثُ الزبون بخانتَي الاسم والهاتف (0232) — ثلاثُ قواعد صِرفة، مفحوصةٌ بـsale-customer-test.
 * ==========================================================================*/

/**
 * **تبديلُ الزبون من القائمة لا يُنزل لقاحاً بسجلّ حيوانٍ لغيره.** سطورُ السلّة تحمل
 * الحيوانَ لحظةَ إضافتها؛ فاختيارُ زبونٍ آخر والحيوانُ المربوط ليس من حيواناته يجعل
 * البيعةَ تُكتب بسجلّ حيوانٍ لم يشترِ صاحبُه. فيُسأل قبل التبديل، ويُسمّى ما يُرفع —
 * والتأكيدُ يمرّ من «امسح الزبون» نفسِه (حارسُ الدفعة المعلَّقة وما يُرفع معه).
 * زبونٌ بلا حيوانٍ مربوط، أو حيواناتُه هي المربوطة = لا سؤال. ولا حيوانَ يُلصق تلقائياً.
 */
export function planCustomerSwitch<T extends SaleLineLike>(
  pets: readonly { id: string | null; name: string }[],
  cart: readonly T[],
  hitPetIds: readonly string[],
): { ask: boolean; pets: string[]; lines: T[] } {
  const own = new Set(hitPetIds);
  const ownLine = (l: T) => l.petId != null && own.has(l.petId) && (l.medMore ?? []).every((m) => m.petId == null || own.has(m.petId));
  const bound = customerBoundLines(cart);
  const foreign = pets.some((p) => !p.id || !own.has(p.id)) || bound.some((l) => !ownLine(l));
  return foreign ? { ask: true, pets: pets.map((p) => p.name), lines: bound } : { ask: false, pets: [], lines: [] };
}

/**
 * **مسحةٌ هبطت بخانة الزبون.** الماسحُ يكتب بالحقل المركَّز (لا يمنع إلا Enter)، فرقمُ
 * الباركود كان يصير اسمَ الزبون أو رقمَه ويبدأ بحثاً. يُشال الرمزُ من آخر الحقل إن كان
 * هناك (ما كتبه الطبيبُ قبله يبقى)، وإلا يرجع الحقلُ لما كان لحظةَ التركيز.
 */
export function stripScanTail(value: string, code: string, atFocus: string): string {
  const v = toAsciiDigits(value), c = toAsciiDigits(code);
  return c && v.endsWith(c) ? value.slice(0, value.length - code.length) : atFocus;
}
/* الأرقامُ الشرقية لاتينية بطولٍ ثابت (محرفٌ بمحرف) — الحقلُ مطبَّعٌ عند الكتابة والرمزُ قد لا يكون. */
function toAsciiDigits(s: string): string {
  return s.replace(/[\u{660}-\u{669}\u{6f0}-\u{6f9}]/gu, (d) => String((d.codePointAt(0) as number) % 16));
}

/** طلباتٌ متتابعة: جوابُ الأقدم يُرمى إن سبقه أحدث أو أُلغي — «الأحدثُ وحده يكتب». */
export function latestOnly() {
  let seq = 0;
  return {
    next: (): number => ++seq,
    isLatest: (n: number): boolean => n === seq,
    cancel: (): void => { seq++; },
  };
}
