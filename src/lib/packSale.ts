/* ============================================================================
 * البيعُ بالكارتون والمغلّف من المسح (0267) — بابٌ كسول لشاشة البيع (import() كـnegStockApi وconsumption: قطعةُ البيع لا تستورد
 * وحدةً ثابتة جديدة، وrepo.ts بحزمة الإقلاع).
 *
 * بلاغُ المالك (١٢/١١): «باركود الكارتون ما ينمسح». المسحُ كان يمرّ من `findByCode` (العلبة وحدها) ثمّ يقول «مو موجود بمخزنك —
 * أضفه» عن كارتونٍ معرَّفٍ على مادّته — دعوةٌ لتوأمٍ يرفضه حارسُ المستويات. هنا: الرمزُ ⇒ المادّةُ ومستواها (`levelByCode`، مرآةُ
 * `product_level_codes`)، من القائمة أوّلاً ثمّ من الخادم للقائمة البائتة (`product_level_by_code`).
 *
 * والكارتونُ لا يُباع قبل أن يعرفه الخادم (`pack_sale_ready`): بلاه يُكلَّف سطرُه علبةً والربحُ يُنفخ بكلفة ما بقي من علبه.
 * ========================================================================= */
import type { Product, ProductPack } from "@/types";
import { supabase } from "./supabase";
import { levelByCode, packPrice, packsOf, type CodeHit } from "./packs";

/** رمزٌ لكارتونٍ أو مغلّفٍ بالقائمة (العلبةُ لـ`findByCode` كما كانت — لا تُرجع هنا). */
export function packHit(products: readonly Product[], code: string | null | undefined): CodeHit | undefined {
  const hit = levelByCode(products, code);
  return hit && hit.level !== "box" ? hit : undefined;
}

/** سعرُ الكارتون بالشاشة: المكتوبُ وإلا العلبةُ × العدد — بالجملة من سعرَي الشراء (كما تبيع شاشةُ الجملة العلبةَ بشرائها). */
export function packSalePrice(p: Pick<Product, "sell_price" | "purchase_price">, pack: ProductPack, wholesale: boolean): number {
  return packPrice(p, pack, wholesale ? "purchase" : "sell");
}

/** الكارتونُ كما هو الآن على صفّ المادّة (بمعرّفه)، أو undefined إن انشال. */
export function currentPack(p: Pick<Product, "packs" | "sub_codes"> | null | undefined, packId: string | null | undefined): ProductPack | undefined {
  return p && packId ? packsOf(p).find((k) => k.id === packId) : undefined;
}

/** هل جسمُ كلفة السطر الحيّ يعرف الكارتون؟ (0267). قبلها لا دالّة، وفشلٌ شبكيّ — كلاهما «لا»: كارتونٌ يُكلَّف علبةً أسوأُ من
 *  «بيعه بالعلبة». والتجريبيُّ يعرفه (مرآتُه بـconsumption). */
export async function packSaleReady(): Promise<boolean> {
  if (!supabase) return true;
  try {
    const r = await supabase.rpc("pack_sale_ready");
    return !r.error && r.data === true;
  } catch {
    return false;
  }
}

/** المادّةُ برمز كارتونها أو مغلّفها من الخادم — للقائمة البائتة. [] = لا شيء أو قاعدةٌ قبل 0267؛ والفشلُ يُرمى (لا «ما ينعرف» عن
 *  شبكةٍ ساقطة). */
export async function productsByLevelCode(code: string): Promise<Product[]> {
  if (!supabase) return [];
  const r = await supabase.rpc("product_level_by_code", { p_code: code });
  if (r.error) {
    const c = String((r.error as { code?: string }).code ?? "");
    if (c === "42883" || c === "PGRST202") return [];
    throw r.error;
  }
  return (r.data ?? []) as Product[];
}
