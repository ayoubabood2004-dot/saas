/* خصمُ الشركة على فاتورة الشراء (0260) — بابٌ خارج repo: repo.ts بحزمة الإقلاع وفسحتُها بضعُ عشرات بايت، وهذا لا يُسأل
 * إلا من فاتورة الشراء الكسولة (كـconsumptionApi). فلا يستورده شيءٌ بحزمة الإقلاع. */
import { supabase } from "./supabase";

/** هل جسما الشراء الحيّان (record_purchase وupdate_purchase) يعرفان الخصم؟ العمودُ وحده ليس الجواب — إعادةُ 0255 وحدها فوق 0260
 *  تُبقيه وتُرجع الجسمَين بلا خصم، فخصمٌ يُرسَل يُبلع بصمت. فالسؤالُ للخادم عن نصّهما (purchase_discount_ready). قبل 0260 لا
 *  دالّة، وفشلٌ شبكيّ — كلاهما «لا»: خصمٌ يُكتب ولا يُحفظ أسوأُ من خانةٍ غائبة. والتجريبيُّ يعرفه بمرآته (repoDemo). */
export async function purchaseDiscountReady(): Promise<boolean> {
  if (!supabase) return true;
  try {
    const r = await supabase.rpc("purchase_discount_ready");
    return !r.error && r.data === true;
  } catch {
    return false;
  }
}
