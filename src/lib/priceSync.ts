/* ============================================================================
 * «الأسعارُ تغيّرت» — كيف يعرف كلُّ جهازٍ أنّ رفعاً أو إرجاعاً صار (0226).
 *
 * البيعُ لا يقرأ الكتالوج (`retail_checkout` يأخذ سعرَ الجهاز)، فـ«من لحظة الرفع»
 * تساوي «من لحظةِ ما يعرف الجهاز». والجهازُ يعرف بعدّادٍ واحد بالقاعدة
 * (`price_changes.event_seq` — يزيد مع كلّ رفعٍ وكلّ إرجاع، تسلسلٌ لا ساعة):
 *   • الجهازُ الذي رفع: فوراً (`afterPriceChange`).
 *   • غيرُه: كلَّ دقيقةٍ والتابُ ظاهر، وعند العودة إليه (`watchPriceEpoch`) —
 *     والكاشيرُ يسأل قبل كلّ بيعة أيضاً (SaleBuilder).
 * وعند التغيّر: تُعلَّم لقطاتُ المخزن والكاشير قديمةً، وتُقرأ الخدماتُ من جديد
 * (قراءةٌ ترمي على الفشل — لا «تحدّثت» كاذبة)، ويُبثّ حدثٌ تسمعه الشاشات.
 *
 * **والقائمةُ تُختم بجيلها** (`priceGen`): رقمٌ محلّيّ يزيد كلّما عرف هذا التابُ بتغيّر.
 * مالكُ القائمة يحفظ الجيلَ لحظةَ **بدء** جلبها، وشاشةُ البيع تقارنه بالجيل الآن — قائمةٌ
 * جيلُها أقدم لا يُباع منها. كان الحكمُ «وصلت قائمةٌ غيرُ التي كانت» فيفتحه ترقيعُ صفٍّ
 * واحد، وشاشةُ بيعٍ رُكّبت بعد الحدث (تبويبٌ آخر وقتها) لا تعرف أنّ شيئاً حدث (تدقيقٌ عدائيّ).
 * ========================================================================= */
import { repo } from "./repo";
import { markStale } from "./swrCache";
import { retailKey } from "./prefetchData";
import { refreshServices } from "./services";
import { bumpPriceGen } from "./priceGen";

export { priceGen, noteListGen, listGenOf } from "./priceGen";

export const PRICES_EVENT = "dv:prices-changed";
export interface PricesChangedDetail { epoch: number; servicesOk: boolean }

let lastSeen: number | null = null;
let svcStale = false;
/** أوّلُ سؤالٍ فاته (تابٌ مخفيّ أو شبكةٌ تعثّرت) — فأوّلُ جوابٍ بعده لا يصلح أساساً صامتاً. */
let baselineMissed = false;

/** آخرُ عدّادٍ عرفه هذا التاب (null = لم يُسأل بعد). */
export function knownPriceEpoch(): number | null { return lastSeen; }
/** أسعارُ الخدمات بالذاكرة أقدمُ من آخر تغيّر (قراءتُها تعثّرت) — لا تُباع خدمةٌ حتى تُقرأ. */
export function servicesStaleNow(): boolean { return svcStale; }

function emit(epoch: number, servicesOk: boolean) {
  try {
    window.dispatchEvent(new CustomEvent<PricesChangedDetail>(PRICES_EVENT, { detail: { epoch, servicesOk } }));
  } catch { /* بيئةٌ بلا نافذة */ }
}

/** يعلّم اللقطاتِ قديمةً ويقرأ الخدماتِ ويبثّ الحدث. يرجع هل قُرئت الخدماتُ فعلاً. */
export async function afterPriceChange(clinicId: string | null | undefined, epoch?: number): Promise<boolean> {
  bumpPriceGen();
  // قديمةٌ لا مرميّة: تحديثٌ يتعثّر بعدها يقول «القائمة قديمة» بشريطها، لا شاشةَ فشلٍ تقتلع
  // البيعَ وإيصالَه (`cachedAt` فارغ = «لا لقطة بيدنا»).
  markStale(retailKey(clinicId));
  markStale(`inv_${clinicId ?? "self"}`);
  let servicesOk = true;
  try { await refreshServices(); } catch { servicesOk = false; }
  svcStale = !servicesOk;
  if (typeof epoch === "number") lastSeen = Math.max(lastSeen ?? 0, epoch);
  emit(epoch ?? lastSeen ?? 0, servicesOk);
  return servicesOk;
}

/**
 * يسأل القاعدةَ عن العدّاد. أوّلُ سؤالٍ يحفظه أساساً (لا تغيّرَ يُعلن) — إلا إن فاته سؤالٌ
 * قبله، فالبياناتُ المحمَّلة قد تسبق رفعاً لا نعرفه ⇒ يُعامل تغيّراً. وما بعده إن زاد يُطلق
 * `afterPriceChange`. يرجع العدّاد، أو null إن تعذّر السؤال (الشبكة) — والفشلُ لا يُعلن
 * تغيّراً: كاشيرٌ يقف عن البيع لأن السؤالَ تعثّر أسوأ من دقيقةٍ متأخّرة.
 */
export async function checkPriceEpoch(clinicId: string | null | undefined): Promise<{ epoch: number; changed: boolean } | null> {
  let e: number;
  try { e = await repo.priceEpoch(); } catch { if (lastSeen === null) baselineMissed = true; return null; }
  const prev = lastSeen;
  if (prev === null) {
    lastSeen = e;
    if (baselineMissed) { baselineMissed = false; await afterPriceChange(clinicId, e); return { epoch: e, changed: true }; }
    return { epoch: e, changed: false };
  }
  if (e > prev) { await afterPriceChange(clinicId, e); return { epoch: e, changed: true }; }
  // خدماتٌ تعثّرت قراءتُها بعد تغيّرٍ سابق: تُعاد بكلّ سؤالٍ حتى تصل، ويُبثّ وصولُها.
  if (svcStale) {
    try { await refreshServices(); svcStale = false; emit(e, true); } catch { /* تبقى قديمة ويبقى حارسُها */ }
  }
  return { epoch: e, changed: false };
}

/** مراقبةٌ خفيفة: كلَّ دقيقةٍ والتابُ ظاهر، وعند الرجوع إليه. يرجع دالّةَ الإيقاف. */
export function watchPriceEpoch(clinicId: string | null | undefined, everyMs = 60_000): () => void {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      if (lastSeen === null) baselineMissed = true;
      return;
    }
    void checkPriceEpoch(clinicId);
  };
  tick();
  const id = window.setInterval(tick, everyMs);
  const onVis = () => { if (document.visibilityState === "visible") tick(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("online", tick);
  return () => { stopped = true; window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", tick); };
}

/** تصفيرٌ عند تبديل العيادة أو الخروج — عدّادُ عيادةٍ لا يُقارَن بعدّاد أخرى. والجيلُ يزيد
 *  (لا يُصفَّر): قائمةُ العيادة السابقة لا تصير «طازجة» بالمقارنة. */
export function resetPriceEpoch(): void { lastSeen = null; baselineMissed = false; svcStale = false; bumpPriceGen(); }
