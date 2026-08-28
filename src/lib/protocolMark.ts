import type { PetNote } from "@/types";

/* ============================================================================
 * protocolMark — «أيّ بروتوكولٍ يمشي على هذه الطبلة؟» بلا عمودٍ جديد.
 *
 * تطبيقُ بروتوكولٍ كان يترك أثره صفوفاً بالطبلة ويُخفي هويّته: لا اسمَ ولا
 * «اليوم كم من كم» ولا تحذير. والحلّ بلا أيّ هجرة: ملاحظةُ حيوانٍ تحمل
 * علامةً آلية (كما تحمل ملاحظاتُ اليوم علامتها ⟦D:…⟧) ونصُّها JSON يلتقط
 * **لقطةً** من البروتوكول لحظةَ تطبيقه — الاسم والاستطباب والتحذير وملاحظات
 * البنود. لقطةٌ لا مرجع: البروتوكول المخصَّص قد يُعدَّل أو يُحذف لاحقاً،
 * والسجلّ الطبي يحفظ ما طُبِّق فعلاً لا ما صار عليه القالب.
 *
 * كل شاشةٍ تعرض نصوص الملاحظات الخام عليها أن تتجاوز هذه العلامة
 * (isProtocolMark) — فهي بياناتُ آلةٍ لا كلامُ طبيب.
 * ==========================================================================*/

export const PROTO_MARK = "⟦P⟧"; // ⟦P⟧

export interface ProtocolMark {
  v: 1;
  /** معرّف البروتوكول بالمكتبة — للمطابقة فقط، والعرض من اللقطة أدناه. */
  id: string;
  name: string;
  indication: string;
  caution: string | null;
  /** أول يوم بالخطة (ISO) وعدد أيامها. */
  start: string;
  days: number;
  /** ملاحظة كل بندٍ باسمه: «ميترونيدازول» → «يُعطى ببطء…». */
  notes: Record<string, string>;
}

export const isProtocolMark = (text: string): boolean => text.startsWith(PROTO_MARK);

export function encodeProtocolMark(m: Omit<ProtocolMark, "v">): string {
  return `${PROTO_MARK}${JSON.stringify({ v: 1, ...m })}`;
}

export function parseProtocolMark(text: string): ProtocolMark | null {
  if (!isProtocolMark(text)) return null;
  try {
    const o = JSON.parse(text.slice(PROTO_MARK.length)) as ProtocolMark;
    if (!o || o.v !== 1 || !o.name || !o.start || !o.days) return null;
    return { ...o, notes: o.notes ?? {} };
  } catch { return null; }
}

/** بروتوكولات هذه الزيارة — الأحدث أولاً (قد يُطبَّق ثانٍ بعد تعديل الخطة). */
export function protocolMarksOf(notes: PetNote[], visitId: string | null): ProtocolMark[] {
  return notes
    .filter((n) => (visitId ? n.visit_id === visitId : true))
    .map((n) => parseProtocolMark(n.note_text))
    .filter((m): m is ProtocolMark => m != null)
    .reverse();
}
