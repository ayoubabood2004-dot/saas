/* ============================================================================
 * تحويلُ وحدة المادّة (0294) — بابٌ كسولٌ خارج repo.ts (حزمةُ الإقلاع وفسحتُها محدودة)، يستورده نموذجُ المادّة بـimport().
 * نداءٌ واحدٌ ذرّيّ بالخادم (product_unit_change)؛ والتجريبيُّ مرآتُه (demoUnitChange).
 * ========================================================================= */
import type { Product } from "@/types";
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";

/** ما فُتح عليه النموذج — شرطُ الكتابة: الوحدةُ (النسبةُ نسبةٌ إليها) ثمّ الأسعار. */
export interface UnitSeen {
  sold_by_weight: boolean; has_sub_unit: boolean; units_per_box: number | null;
  sell_price: number; purchase_price: number; sub_unit_price: number | null;
}
/** الوحدةُ الجديدة وأسعارُها كما كتبها الطبيب. */
export interface UnitTo {
  sold_by_weight: boolean; has_sub_unit: boolean; units_per_box: number | null;
  sub_unit_name: string | null; sub_unit_price: number | null;
  sell_price: number; purchase_price: number; min_stock: number;
}

const ro = () => { if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" }); };
// التجريبيُّ من باب repoDemo وحده (demo-role-test: demoRole لا يُبلغ من main إلا عبره).
const demo = () => import("./repoDemo").then((m) => m.loadDemoUnitChange());

/** الكميةُ بالوحدة الجديدة = القديمة × mul ÷ div؛ يرجع صفَّ المادّة بعد التحويل. */
export async function changeProductUnit(id: string, seen: UnitSeen, to: UnitTo, mul: number, div: number): Promise<Product> {
  ro();
  if (!supabase) return (await demo()).demoUnitChange(id, seen, to, mul, div);
  return rpcJson<Product>("product_unit_change", { p_id: id, p_seen: seen, p_to: to, p_mul: mul, p_div: div });
}

/** رفضُ «ما رآه النموذج» (الوحدةُ أو سعرٌ تغيّر، أو المادّةُ غابت) — الشاشةُ تجلب القائمةَ من جديد. */
export const isUnitStale = (e: unknown): boolean =>
  /\b(unit_seen_changed|price_moved|unit_product_gone)\b/.test(String((e as { message?: unknown } | null)?.message ?? ""));
