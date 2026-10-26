/* ============================================================================
 * الأسعارُ الحيّة — `public_pricing()` بالمفتاح العامّ بعد التحميل.
 *
 * كلُّ رقمِ سعرٍ بالموقع يُرسم ثابتاً ساعةَ البناء ثم يُسأل هنا: تعديلُ المالك لسعرٍ من لوحته يصل
 * للزائر بلا نشر، فلا يبقى رقمٌ معروضٌ يخالف ما تقبضه Wayl. فشلٌ أو دالّةٌ لم تُنشر بعد ⇒ null،
 * وتبقى أسعارُ البناء (لا رقمَ ناقصاً ولا فارغاً).
 * ==========================================================================*/
import type { PricingData } from "./types";

export async function livePricing(): Promise<PricingData | null> {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/rpc/public_pricing`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as PricingData | null;
  return j && j.usd && j.usd.basic ? j : null;
}
