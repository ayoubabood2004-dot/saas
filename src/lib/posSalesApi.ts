/* ============================================================================
 * كم بِيع من كلّ مادّة بآخر ٣٠ يوماً (0279) — بابٌ كسولٌ لترتيب شاشة البيع (لا يدخل حزمةَ الإقلاع).
 *  • السحابيّ: `pos_product_sales(30)` — بوحدة المخزن وصافياً بعد الراجع، بلا المرجَّعة، للعيادة وحدها.
 *  • التجريبيّ: المرآةُ نفسُها على فواتير الجهاز.
 *  • خبيئةٌ بالذاكرة عشرَ دقائق للعيادة نفسِها: فتحُ الشاشة وإغلاقُها لا يسأل كلَّ مرّة. والفشلُ يُرمى (الشاشةُ ترتّب بالاسم وتقولها) —
 *    لا خريطةٌ فارغة تُقرأ «ما بِيع شيء».
 * ========================================================================= */
import { supabase } from "./supabase";
import { getActiveClinicId } from "./clinics";
import { confirmedClinic } from "./serverClinic";

const TTL = 10 * 60_000;
let cache: { key: string; at: number; map: Map<string, number> } | null = null;

/** مفتاحُ الخبيئة: الحسابُ والعيادةُ التي أكّدها الخادم (`my_workspace`) — لا مفتاحُ العيادة المحلّيّ ("default" للمالك، أو مفتاحُ
 *  عيادة زبونٍ باقٍ بعد خروج المشغّل، CLAUDE.md ١٣/١٠). بلا تأكيدٍ لا خبيئة: يُسأل الخادمُ كلَّ مرّة. */
async function cacheKey(): Promise<string | null> {
  if (!supabase) return `demo:${getActiveClinicId() || "default"}`;
  const uid = (await supabase.auth.getSession()).data.session?.user.id;
  const c = uid ? confirmedClinic(uid) : null;
  return uid && c ? `${uid}:${c}` : null;
}

export async function productSales30(now: () => number = Date.now): Promise<Map<string, number>> {
  const key = await cacheKey();
  if (key && cache && cache.key === key && now() - cache.at < TTL) return cache.map;
  let map: Map<string, number>;
  if (!supabase) {
    map = (await import("./repoDemo").then((m) => m.loadDemoPosSales())).demoProductSales(30);
  } else {
    const { data, error } = await supabase.rpc("pos_product_sales", { p_days: 30 });
    if (error) throw Object.assign(new Error(error.message), { code: error.code, hint: error.hint });
    map = new Map((data as { product_id: string; qty: number | string }[] ?? []).map((r) => [r.product_id, Number(r.qty) || 0]));
  }
  cache = key ? { key, at: now(), map } : null;
  return map;
}

/** بعد بيعةٍ: الأرقامُ تغيّرت — الجلبُ التالي من جديد. */
export function forgetProductSales(): void { cache = null; }
