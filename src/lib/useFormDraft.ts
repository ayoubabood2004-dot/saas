import { useCallback, useEffect, useRef, useState } from "react";
import { dropDraft, listDrafts, newDraftId, saveDraft, type DraftRecord, type DraftScope } from "./formDraft";

/**
 * مسودّةُ نموذجٍ بحياة المكوّن (formDraft.ts للقواعد).
 *  - تحفظ كلَّ تغييرٍ بعد ٣٠٠ms، وفوراً عند `pagehide` (التحميل والإغلاق) وعند خروج المكوّن.
 *  - `offer`: أحدثُ مسودّةٍ غير فارغة **لفتحةٍ أخرى** — تُعرض، ولا تُسترجع وحدها.
 *  - `take()` يتبنّاها (يكمل الحفظَ عليها)، و`dismiss()` يمسحها ويرجعها للتراجع.
 *  - `clear()` بعد الحفظ الناجح: تُمسح مسودّةُ هذه الفتحة ويقف الحفظ.
 * `scope` فارغ (لا مستخدم بعد) ⇒ لا حفظَ ولا عرض.
 */
export function useFormDraft<T>({ scope, value, isEmpty, lighten }: {
  scope: DraftScope | null;
  value: T;
  isEmpty: (v: T) => boolean;
  lighten?: (v: T) => T;
}) {
  const scopeKey = scope ? `${scope.form}|${scope.clinic ?? ""}|${scope.user ?? ""}` : "";
  const idRef = useRef<string>(newDraftId());
  const closed = useRef(false);
  const latest = useRef({ scope, value, isEmpty, lighten });
  latest.current = { scope, value, isEmpty, lighten };

  const others = useCallback((): DraftRecord<T>[] => {
    const s = latest.current.scope;
    if (!s) return [];
    return listDrafts<T>(s).filter((d) => d.id !== idRef.current && !latest.current.isEmpty(d.data));
  }, []);

  const [offers, setOffers] = useState<DraftRecord<T>[]>(() => others());
  const [saved, setSaved] = useState<"full" | "light" | "failed">("full");
  // عيادةٌ أو مستخدمٌ تبدّل والنموذجُ مفتوح: العرضُ يُقرأ للنطاق الجديد.
  const seenScope = useRef(scopeKey);
  useEffect(() => {
    if (seenScope.current === scopeKey) return;
    seenScope.current = scopeKey;
    setOffers(others());
  }, [scopeKey, others]);

  const flush = useCallback(() => {
    const { scope: s, value: v, isEmpty: empty, lighten: lt } = latest.current;
    if (closed.current || !s) return;
    if (empty(v)) { dropDraft(s, idRef.current); return; }
    setSaved(saveDraft(s, idRef.current, v, { lighten: lt }));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(flush, 300);
    return () => window.clearTimeout(t);
  }, [value, scopeKey, flush]);

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      flush(); // خروجُ المكوّن (تبديل صفحة، عطلٌ بالحدّ) لا يُسقط آخرَ حرف
    };
  }, [flush]);

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
      flush(); // ما كُتب بهذه الفتحة قبل الاسترجاع يبقى مسودّةً تُعرض لاحقاً
      idRef.current = offer.id;
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
      if (!scope) return;
      saveDraft(scope, rec.id, rec.data, { now: rec.savedAt });
      setOffers(others());
    },
    /** حُفظ النموذج: امسح مسودّتَه وأوقف الحفظ. */
    clear(): void {
      closed.current = true;
      if (scope) dropDraft(scope, idRef.current);
    },
  };
}
