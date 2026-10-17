/* مسودّاتُ النماذج (formDraft.ts) عند الخروج: فيها هاتفُ المالك وصورُ الحيوان والتشخيص —
 * والخروجُ يمسح صورَ المرضى من المخبأ حتى لا يقرأها التالي على جهازٍ مشترك (AuthContext).
 * فتُمسح معها، و**يُوقف الحفظ أوّلاً**: النموذجُ المفتوح يحفظ عند خروجه من الشاشة
 * (`setRaw(null)` يزيحه) وعند `pagehide` — بلا الإيقاف كان يكتبها ثانيةً بعد المسح.
 * والإيقافُ بتبويبٍ واحد لا يكفي: تبويبٌ آخر فيه «حالة جديدة» يسمع الخروجَ (SIGNED_OUT) فيزيح
 * نموذجَه ويحفظه — فيُختم الخروجُ بالتخزين (`vp_draft_purged`)، وكلُّ نموذجٍ فُتح قبله يقف
 * (useFormDraft). الخروجُ الإجباريّ (جلسةٌ انتهت) لا يمرّ من هنا: المسودّةُ تبقى لصاحبها. */
export const DRAFT_PREFIX = "vp_draft:";
/** «انحفظت — لا تكتبها ثانيةً» لكلّ فتحةٍ مُسحت بعد حفظ (تبويبٌ آخر ما زال يكتبها). */
export const DONE_PREFIX = "vp_draft_done:";
export const PURGED_KEY = "vp_draft_purged";

let suspended = false;
export const draftsSuspended = (): boolean => suspended;

/** متى خرج المستخدمُ آخرَ مرّة بهذا الجهاز (0 = لم يخرج) — من أيّ تبويب. */
export function purgedAt(store: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): number {
  try { return Number(store?.getItem(PURGED_KEY) || 0); } catch { return 0; }
}

export function purgeDrafts(store: Pick<Storage, "length" | "key" | "removeItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  suspended = true;
  if (!store) return;
  try {
    store.setItem(PURGED_KEY, String(Date.now()));
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k?.startsWith(DRAFT_PREFIX) || k?.startsWith(DONE_PREFIX)) keys.push(k); }
    keys.forEach((k) => store.removeItem(k));
  } catch { /* تخزينٌ ممنوع — لا شيء يُمسح */ }
}
