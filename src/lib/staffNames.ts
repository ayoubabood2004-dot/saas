// ============================================================================
// أسماء الكادر — كاش مشترك خفيف فوق listStaff().
//
// أكثر من مكان يحتاج يحوّل staff_id ← اسم (سجل الفواتير، الطباعة، تقارير
// المبيعات) أو يطابق المستخدم المسجّل مع صف الكادر ماله (تعيين البائع
// الافتراضي بالكاشير). بدل ما كل مكوّن يجيب القائمة لحاله، هذا الكاش
// يجيبها مرة ويشاركها — وأي فشل شبكة يرجّع آخر نسخة ناجحة بدل ما يكسر.
// ============================================================================
import { listStaff, type StaffMember } from "./staff";

let cache: { at: number; list: StaffMember[] } | null = null;
let inflight: Promise<StaffMember[]> | null = null;
const TTL = 60_000; // دقيقة — القائمة ما تتغير بنص جلسة بيع

/** قائمة الكادر (مكاشة). فشل الجلب يرجّع آخر نسخة معروفة أو []. */
export async function staffRoster(): Promise<StaffMember[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.list;
  if (inflight) return inflight;
  inflight = listStaff()
    .then((list) => { cache = { at: Date.now(), list }; return list; })
    .catch(() => cache?.list ?? [])
    .finally(() => { inflight = null; });
  return inflight;
}

/** خريطة id ← اسم لكل الكادر (النشط وغيره — الفواتير القديمة تحتاج الأسماء حتى لو الموظف راح). */
export async function staffNameMap(): Promise<Map<string, string>> {
  const list = await staffRoster();
  return new Map(list.map((s) => [s.id, s.name]));
}

/** اسم موظف من معرّفه، أو null إذا مو موجود. */
export async function resolveStaffName(id?: string | null): Promise<string | null> {
  if (!id) return null;
  return (await staffNameMap()).get(id) ?? null;
}

const normEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();

/** صف الكادر العائد للمستخدم المسجّل حالياً: مطابقة بمعرّف الحساب أولاً
 *  (يُثبَّت عند قبول الدعوة) وإلا بالإيميل. null = ما إله صف بالكادر. */
export async function matchStaffToUser(userId?: string | null, email?: string | null): Promise<StaffMember | null> {
  const list = await staffRoster();
  if (userId) {
    const byId = list.find((s) => s.userId === userId && s.status !== "suspended");
    if (byId) return byId;
  }
  const e = normEmail(email);
  if (e) {
    const byEmail = list.find((s) => normEmail(s.email) === e && s.status !== "suspended");
    if (byEmail) return byEmail;
  }
  return null;
}
