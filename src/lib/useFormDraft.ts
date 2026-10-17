import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraftDone, draftDone, dropDraft, listDrafts, markDraftDone, newDraftId, saveDraft, scopePrefix, sweepDrafts, type DraftRecord, type DraftScope } from "./formDraft";
import { purgedAt } from "./draftPurge";

/**
 * مسودّةُ نموذجٍ بحياة المكوّن (formDraft.ts للقواعد).
 *  - تحفظ كلَّ تغييرٍ بعد ٣٠٠ms، وفوراً عند `pagehide` (التحميل والإغلاق) وعند خروج المكوّن.
 *  - `offer`: أحدثُ مسودّةٍ غير فارغة **لفتحةٍ أخرى** — تُعرض، ولا تُسترجع وحدها.
 *  - `take()` يتبنّاها (يكمل الحفظَ عليها)، و`dismiss()` يمسحها ويرجعها للتراجع.
 *  - `clear(also)` بعد الحفظ الناجح: تُمسح مسودّةُ هذه الفتحة **وما يصف الحالةَ نفسَها**
 *    من فتحاتٍ أخرى (كُتبت ثم رُجع للسجلّ وبُدئت من جديد) — وإلا بقيت «ما انحفظت» عن حالةٍ
 *    انحفظت، ومن يصدّقها يسجّل الحيوانَ مرّتين (تدقيقٌ عدائيّ).
 *  - **الفتحةُ مربوطةٌ بنطاقها**: عيادةٌ أو مستخدمٌ تبدّل والنموذجُ مفتوح (جلسةُ المشغّل انتهت،
 *    my_workspace فشل لحظةً، عضويةٌ أُزيلت) ⇒ يقف الحفظ؛ ما كُتب لعيادة لا يُكتب بنطاق أخرى
 *    فيُعرض فيها ويُسجَّل بأرضها (0153، ١٣/١٠). يرجع النطاقُ ⇒ يرجع الحفظ.
 *  - **وعبر التبويبات**: فتحةٌ مسحها حفظٌ بتبويبٍ آخر (`vp_draft_done:`) تقف ولا تعيدها، ونموذجٌ
 *    فُتح قبل خروجٍ من أيّ تبويب (`vp_draft_purged`) يقف — تبويبٌ آخر كان يعيد كتابةَ ما مُسح.
 * `scope` فارغ (لا مستخدم بعد) ⇒ لا حفظَ ولا عرض.
 */
export function useFormDraft<T>({ scope, value, isEmpty, lighten }: {
  scope: DraftScope | null;
  value: T;
  isEmpty: (v: T) => boolean;
  lighten?: (v: T) => T;
}) {
  const scopeKey = scope ? scopePrefix(scope) : "";
  const idRef = useRef<string>(newDraftId());
  /** النطاقُ الذي تكتب فيه هذه الفتحة — يُثبَّت بأوّل نطاقٍ معروف. */
  const slot = useRef<DraftScope | null>(scope);
  /** حُفظ النموذجُ هنا (clear) أو خرج المستخدم بعد فتحه — يقف للأبد. */
  const closed = useRef(false);
  /** ختمُ الخروج كما كان لحظةَ الفتح: تغيّرُه = خرج أحدٌ بعد الفتح (من أيّ تبويب). مقارنةٌ بالقيمة لا
   *  بالساعة — ساعةٌ رجعت للوراء كانت تُوقف كلَّ نموذجٍ لاحق بصمت (تدقيقٌ عدائيّ ثالث). */
  const purgeSeen = useRef(purgedAt());
  /** آخرُ قيمةٍ حُفظت فعلاً — علامةُ «انحفظت» من تبويبٍ آخر توقف الحفظَ ما دامت القيمةُ هي هي. */
  const lastSaved = useRef<T | undefined>(undefined);
  const latest = useRef({ scope, value, isEmpty, lighten });
  latest.current = { scope, value, isEmpty, lighten };
  /**
   * هل يقف الحفظ؟ خروجٌ أو حفظٌ هنا ⇒ للأبد. أمّا «انحفظت» من تبويبٍ آخر (مطابقةٌ بالمالك والحيوان،
   * وقد تخطئ: «ابو علي» آخر) ⇒ **ما دام لم يُكتب جديد**؛ كُتب ⇒ العلامةُ تُرفع والحفظُ يرجع — كانت
   * تُقفل نموذجاً حيّاً للأبد والعنوانُ يقول «تنحفظ تلقائياً» (تدقيقٌ عدائيّ ثالث، الكبيرة).
   */
  const stopped = useCallback((): boolean => {
    if (!closed.current && purgedAt() !== purgeSeen.current) closed.current = true;
    if (closed.current) return true;
    if (draftDone(idRef.current)) {
      if (latest.current.value === lastSaved.current) return true;
      clearDraftDone(idRef.current);
    }
    return false;
  }, []);

  const others = useCallback((): DraftRecord<T>[] => {
    const s = latest.current.scope;
    if (!s) return [];
    return listDrafts<T>(s).filter((d) => d.id !== idRef.current && !latest.current.isEmpty(d.data));
  }, []);

  const [offers, setOffers] = useState<DraftRecord<T>[]>(() => { sweepDrafts(); return others(); });
  /** آخرُ حفظ: كاملة، بلا صور، لم تُحفظ، أو موقوف (حُفظت بمكانٍ آخر، أو خروج) — يُقال بصدق. */
  const [saved, setSaved] = useState<"full" | "light" | "failed" | "stopped">("full");
  // عيادةٌ أو مستخدمٌ تبدّل والنموذجُ مفتوح: العرضُ يُقرأ للنطاق الجديد.
  const seenScope = useRef(scopeKey);
  useEffect(() => {
    if (seenScope.current === scopeKey) return;
    seenScope.current = scopeKey;
    setOffers(others());
  }, [scopeKey, others]);

  const flush = useCallback(() => {
    const { scope: s, value: v, isEmpty: empty, lighten: lt } = latest.current;
    if (!s) return;
    if (stopped()) { setSaved("stopped"); return; }
    slot.current ??= s; // المستخدمُ عُرف بعد الفتح
    if (scopePrefix(slot.current) !== scopePrefix(s)) return; // النطاقُ تبدّل تحت النموذج
    if (empty(v)) { dropDraft(s, idRef.current); return; }
    const r = saveDraft(s, idRef.current, v, { lighten: lt });
    if (r !== "failed") lastSaved.current = v;
    setSaved(r);
  }, [stopped]);

  useEffect(() => {
    const t = window.setTimeout(flush, 300);
    return () => window.clearTimeout(t);
  }, [value, scopeKey, flush]);

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    // تبويبٌ آخر حفظ أو حذف أو خرج: العرضُ والحالةُ يُقرآن من جديد — لا بطاقةَ قديمة ولا «تنحفظ» كاذبة.
    const onStorage = (e: StorageEvent) => {
      if (e.key && !e.key.startsWith("vp_draft")) return;
      setOffers(others());
      if (stopped()) setSaved("stopped");
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      flush(); // خروجُ المكوّن (تبديل صفحة، عطلٌ بالحدّ) لا يُسقط آخرَ حرف
    };
  }, [flush, others, stopped]);

  const offer = offers[0] ?? null;

  return {
    offer,
    /** مسودّاتٌ أخرى غيرُ المعروضة. */
    more: Math.max(0, offers.length - 1),
    /** آخرُ حفظ: كاملة، أو بلا صور، أو لم تُحفظ (التخزين ممتلئ أو ممنوع) — يُقال للمستخدم بصدق. */
    saved,
    /** تبنَّ المسودّةَ المعروضة: يرجع بياناتِها ليضعها النموذج، والحفظُ يكمل عليها. */
    take(): DraftRecord<T> | null {
      if (!offer || !scope) return null;
      // العرضُ لقطةٌ قديمة؟ حالةٌ انحفظت بتبويبٍ آخر بعدها لا تُسترجع «ما انحفظت» (تدقيقٌ عدائيّ رابع).
      if (draftDone(offer.id) || !listDrafts<T>(scope).some((d) => d.id === offer.id)) { setOffers(others()); return null; }
      flush(); // ما كُتب بهذه الفتحة قبل الاسترجاع يبقى مسودّةً تُعرض لاحقاً
      idRef.current = offer.id;
      lastSaved.current = undefined;
      slot.current = scope; // المسترجَعةُ من هذا النطاق — والحفظُ يكمل فيه
      setOffers(others());
      return offer;
    },
    /** احذف المسودّةَ المعروضة — وترجع للتراجع. */
    dismiss(): DraftRecord<T> | null {
      if (!offer || !scope) return null;
      dropDraft(scope, offer.id);
      setOffers(others());
      return offer;
    },
    /** تراجعٌ عن `dismiss`. */
    restoreDismissed(rec: DraftRecord<T>): void {
      if (!scope || purgedAt() !== purgeSeen.current) return;
      saveDraft(scope, rec.id, rec.data, { now: rec.savedAt });
      setOffers(others());
    },
    /** حُفظ النموذج: امسح مسودّتَه، وما يصف الحالةَ نفسَها (`also`)، وأوقف الحفظ. */
    clear(also?: (d: T) => boolean): void {
      closed.current = true;
      const s = slot.current ?? scope;
      if (!s) return;
      dropDraft(s, idRef.current);
      markDraftDone(idRef.current);
      if (also) for (const d of listDrafts<T>(s)) if (also(d.data)) { dropDraft(s, d.id); markDraftDone(d.id); }
    },
  };
}
