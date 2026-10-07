/* ============================================================================
 * «الأسعارُ تغيّرت» — كيف يعرف كلُّ جهازٍ أنّ رفعاً أو إرجاعاً صار (0226).
 *
 * البيعُ لا يقرأ الكتالوج (`retail_checkout` يأخذ سعرَ الجهاز)، فـ«من لحظة الرفع»
 * تساوي «من لحظةِ ما يعرف الجهاز». والجهازُ يعرف بعدّادٍ واحد بالقاعدة
 * (`price_changes.event_seq` — يزيد مع كلّ رفعٍ وكلّ إرجاع، تسلسلٌ لا ساعة):
 *   • الجهازُ الذي رفع: فوراً (`afterPriceChange`).
 *   • غيرُه: كلَّ دقيقةٍ والتابُ ظاهر، وعند العودة إليه (`watchPriceEpoch`) —
 *     والكاشيرُ يسأل قبل كلّ بيعة أيضاً (SaleBuilder).
 * وعند التغيّر: تُرمى لقطاتُ المخزن والكاشير المخزَّنة، وتُقرأ الخدماتُ من جديد
 * (قراءةٌ ترمي على الفشل — لا «تحدّثت» كاذبة)، ويُبثّ حدثٌ تسمعه الشاشات.
 * ========================================================================= */
import { repo } from "./repo";
import { invalidate } from "./swrCache";
import { retailKey } from "./prefetchData";
import { refreshServices } from "./services";

export const PRICES_EVENT = "dv:prices-changed";
export interface PricesChangedDetail { epoch: number; servicesOk: boolean }

let lastSeen: number | null = null;
/** آخرُ عدّادٍ عرفه هذا التاب (null = لم يُسأل بعد). */
export function knownPriceEpoch(): number | null { return lastSeen; }

/** يرمي اللقطاتِ ويقرأ الخدماتِ ويبثّ الحدث. يرجع هل قُرئت الخدماتُ فعلاً. */
export async function afterPriceChange(clinicId: string | null | undefined, epoch?: number): Promise<boolean> {
  invalidate(retailKey(clinicId));
  invalidate(`inv_${clinicId ?? "self"}`);
  let servicesOk = true;
  try { await refreshServices(); } catch { servicesOk = false; }
  if (typeof epoch === "number") lastSeen = Math.max(lastSeen ?? 0, epoch);
  try {
    window.dispatchEvent(new CustomEvent<PricesChangedDetail>(PRICES_EVENT, { detail: { epoch: epoch ?? lastSeen ?? 0, servicesOk } }));
  } catch { /* بيئةٌ بلا نافذة */ }
  return servicesOk;
}

/**
 * يسأل القاعدةَ عن العدّاد. أوّلُ سؤالٍ يحفظه أساساً (لا تغيّرَ يُعلن)، وما بعده إن
 * زاد يُطلق `afterPriceChange`. يرجع العدّاد، أو null إن تعذّر السؤال (الشبكة) —
 * والفشلُ لا يُعلن تغيّراً: كاشيرٌ يقف عن البيع لأن السؤالَ تعثّر أسوأ من دقيقةٍ متأخّرة.
 */
export async function checkPriceEpoch(clinicId: string | null | undefined): Promise<{ epoch: number; changed: boolean } | null> {
  let e: number;
  try { e = await repo.priceEpoch(); } catch { return null; }
  const prev = lastSeen;
  if (prev === null) { lastSeen = e; return { epoch: e, changed: false }; }
  if (e > prev) { await afterPriceChange(clinicId, e); return { epoch: e, changed: true }; }
  return { epoch: e, changed: false };
}

/** مراقبةٌ خفيفة: كلَّ دقيقةٍ والتابُ ظاهر، وعند الرجوع إليه. يرجع دالّةَ الإيقاف. */
export function watchPriceEpoch(clinicId: string | null | undefined, everyMs = 60_000): () => void {
  let stopped = false;
  const tick = () => {
    if (stopped || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    void checkPriceEpoch(clinicId);
  };
  tick();
  const id = window.setInterval(tick, everyMs);
  const onVis = () => { if (document.visibilityState === "visible") tick(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("online", tick);
  return () => { stopped = true; window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", tick); };
}

/** تصفيرٌ عند تبديل العيادة أو الخروج — عدّادُ عيادةٍ لا يُقارَن بعدّاد أخرى. */
export function resetPriceEpoch(): void { lastSeen = null; }
