/* مسودّاتُ النماذج (formDraft.ts) عند الخروج: فيها هاتفُ المالك وصورُ الحيوان والتشخيص —
 * والخروجُ يمسح صورَ المرضى من المخبأ حتى لا يقرأها التالي على جهازٍ مشترك (AuthContext).
 * فتُمسح معها، و**يُوقف الحفظ أوّلاً**: النموذجُ المفتوح يحفظ عند خروجه من الشاشة
 * (`setRaw(null)` يزيحه) وعند `pagehide` — بلا الإيقاف كان يكتبها ثانيةً بعد المسح.
 * الخروجُ الإجباريّ (جلسةٌ انتهت) لا يمرّ من هنا: المسودّةُ تبقى لصاحبها. */
export const DRAFT_PREFIX = "vp_draft:";

let suspended = false;
export const draftsSuspended = (): boolean => suspended;

export function purgeDrafts(store: Pick<Storage, "length" | "key" | "removeItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  suspended = true;
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k?.startsWith(DRAFT_PREFIX)) keys.push(k); }
    keys.forEach((k) => store.removeItem(k));
  } catch { /* تخزينٌ ممنوع — لا شيء يُمسح */ }
}
