/* ============================================================================
 * بابُ أسعار التطعيمات (0279) — كسولٌ (الإعداداتُ ونموذجُ البيع يستوردانه بـimport()، لا يدخل الإقلاع).
 *  • القراءةُ لكلّ الكادر من `clinic_vaccine_prices`؛ والكتابةُ من `vaccine_price_set` وحدها (المدير أو صلاحيةُ الإعدادات).
 *  • جدولٌ غائب (واجهةٌ سبقت 0279) ⇒ `missing`: الميزةُ تختفي بصمت. وغيرُه من الفشل يُرمى — لا قائمةٌ فارغة تُقرأ «ماكو أسعار».
 * ========================================================================= */
import { supabase } from "./supabase";
import { vaxPriceMap, type VaxPriceRow } from "./vaccinePrices";

const demo = () => import("./repoDemo").then((m) => m.loadDemoVaccinePrices());
const MISSING = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);
export const vaxPricesMissing = (e: unknown): boolean => MISSING.has(String((e as { code?: string } | null)?.code ?? ""));
const fail = (e: { message: string; code?: string; hint?: string; details?: string }) =>
  Object.assign(new Error(e.message), { code: e.code, hint: e.hint, details: e.details });

export async function listVaxPrices(): Promise<Map<string, VaxPriceRow>> {
  if (!supabase) return vaxPriceMap((await demo()).demoVaxPrices());
  const { data, error } = await supabase.from("clinic_vaccine_prices").select("name,price").order("name").limit(1000);
  if (error) throw fail(error);
  return vaxPriceMap((data ?? []) as { name: unknown; price: unknown }[]);
}

/** null يمسح السعر. يرجع ما كتبه الخادم. */
export async function setVaxPrice(name: string, price: number | null): Promise<{ name: string; price: number | null }> {
  if (!supabase) return (await demo()).demoSetVaxPrice(name, price);
  const { data, error } = await supabase.rpc("vaccine_price_set", { p_name: name, p_price: price });
  if (error) throw fail(error);
  const r = data as { name?: string; price?: number | string | null } | null;
  if (!r || typeof r.name !== "string") throw new Error("vaccine_price_set: no row");
  return { name: r.name, price: r.price == null ? null : Number(r.price) };
}
