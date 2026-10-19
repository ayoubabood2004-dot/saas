// بحثُ جمهور صفحة الحملات: الاسمُ (حيوانٌ أو صاحبُه) بـsearchable على الطرفين، والهاتفُ بـ
// phoneMatches (صفرٌ أوّل، مفتاحُ الدولة، مسافات، أرقامٌ شرقية) لسؤالٍ بلا أحرفٍ وحده — كـdeliverySearch.
// كان `phoneDigits("bobby")` نصّاً فارغاً، و"" تطابق كلَّ هاتف: فاسمُ الحيوان الآتي من التذكير يعرض
// العيادةَ كلَّها، و«تحديد الكل» يضيفها للطابور. وكان «0770111» لا يلقى «+964 770 111…».
import { phoneMatches } from "./phone";
import { searchable } from "./utils";

export interface AudienceRow {
  name: string;
  owner_name?: string | null;
  owner_phone?: string | null;
}

/** مُطابِقٌ للسؤال، أو null = سؤالٌ فارغ (الكلُّ يطابق). */
export function audienceMatcher(query: string, dialCode: string): ((p: AudienceRow) => boolean) | null {
  const raw = query.trim();
  if (!raw) return null;
  const qs = searchable(raw);
  const phoneish = !/\p{L}/u.test(raw);
  return (p) =>
    (qs !== "" && (searchable(p.name).includes(qs) || searchable(p.owner_name).includes(qs)))
    || (phoneish && !!p.owner_phone && phoneMatches(p.owner_phone, raw, dialCode));
}
