/* ============================================================================
 * المنتجاتُ المربوطة (0277) — بابٌ كسولٌ خارج repo.ts (حزمةُ الإقلاع وفسحتُها محدودة)، يستورده تبويبُ «المربوطة» ونموذجُ المادّة
 * وفاتورةُ الشراء بـimport(). كلُّ كتابةٍ نداءٌ واحدٌ ذرّيّ بالخادم؛ والتجريبيُّ مرآتُه (demoProductGroups).
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import type { GroupSeen } from "./productGroups";

export interface LinkResult { group: string; n: number; added: number; dissolved: number }
export interface UnlinkResult { group: string; unlinked: number; left: number; dissolved: boolean }
export interface SetPriceResult { group: string; n: number; changed: number }
export interface FollowResult { group: string | null; n: number; updated: number; skipped: number }

const ro = () => { if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" }); };
// التجريبيُّ من باب repoDemo وحده (demo-role-test: demoRole لا يُبلغ من main إلا عبره).
const demo = () => import("./repoDemo").then((m) => m.loadDemoProductGroups());

/** فحصُ قدرةٍ لا قائمةُ قرار: قاعدةٌ قبل 0277 (لا دالّة) أو فشلٌ شبكيّ = «لا» — الأبوابُ تُخفى ولا يُنادى ما لا وجودَ له. */
export async function productGroupsReady(): Promise<boolean> {
  if (!supabase) return true;
  try {
    const r = await supabase.rpc("product_groups_ready");
    return !r.error && r.data === true;
  } catch {
    return false;
  }
}

/** يربط ids بمجموعة group (null = مجموعةٌ جديدة) بسعرٍ واحد للكلّ؛ `seen` = أعضاءُ المجموعة بعد الربط كما رآهم الجهاز. */
export async function linkProducts(ids: string[], group: string | null, sell: number, buy: number | null, seen: GroupSeen): Promise<LinkResult> {
  ro();
  if (!supabase) return (await demo()).demoGroupLink(ids, group, sell, buy, seen);
  return rpcJson<LinkResult>("product_group_link", { p_ids: ids, p_group: group, p_sell: sell, p_purchase: buy, p_seen: seen });
}

/** يفكّ ids من group — والمادّةُ تبقى بمخزنها وسعرها؛ والباقي واحدٌ ⇒ تنفكّ المجموعة. */
export async function unlinkProducts(group: string, ids: string[]): Promise<UnlinkResult> {
  ro();
  if (!supabase) return (await demo()).demoGroupUnlink(group, ids);
  return rpcJson<UnlinkResult>("product_group_unlink", { p_group: group, p_ids: ids });
}

/** سعرُ المجموعة لكلّ أعضائها أو لا شيء (null = لا يُمسّ). */
export async function setGroupPrice(group: string, sell: number | null, buy: number | null, seen: GroupSeen): Promise<SetPriceResult> {
  ro();
  if (!supabase) return (await demo()).demoGroupSetPrice(group, sell, buy, seen);
  return rpcJson<SetPriceResult>("product_group_set_price", { p_group: group, p_sell: sell, p_purchase: buy, p_seen: seen });
}

/** بعد فاتورة الشراء: سعرُ المادّة كما كتبته الفاتورة ← لأعضاء مجموعتها. */
export async function followGroup(productId: string, sell: boolean, buy: boolean): Promise<FollowResult> {
  ro();
  if (!supabase) return (await demo()).demoGroupFollow(productId, sell, buy);
  return rpcJson<FollowResult>("product_group_follow", { p_product: productId, p_sell: sell, p_purchase: buy });
}

/** رفضُ «ما رآه الجهاز» (المجموعةُ أو سعرٌ تغيّر) — الشاشةُ تجلب القائمةَ من جديد. */
export const isGroupStale = (e: unknown): boolean => {
  const m = String((e as { message?: unknown } | null)?.message ?? "");
  return /\b(price_moved|group_changed|group_missing|product_missing)\b/.test(m);
};
