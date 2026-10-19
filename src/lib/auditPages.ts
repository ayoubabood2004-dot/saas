import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryAuditRow } from "@/types";

/* ============================================================================
 * صفحاتُ فحص المخزن (0245) — قطعةٌ تُحمَّل عند النداء لا بالإقلاع.
 *
 * `repo.ts` على مسار الإقلاع (وصفحةِ الزائر)، وكلُّ سطرٍ فيه يدفعه كلُّ فتحٍ
 * بكلّ عيادة (`store-weight-guard`)؛ وهذا النداءُ تطلبه صفحةٌ واحدة للمدير.
 *
 * وأثقلُ عيادةٍ تتجاوز سقفَ الصفوف (ألف — مقيسٌ ~١٦٠٠ ملاحظة بعيادةٍ واحدة):
 * فالصفحاتُ بترتيبٍ ثابت (النوع ثم المادة — مفتاحٌ فريد بالدالّة) تتقدّم **بما
 * وصل** وتقف عند صفحةٍ **فارغة** لا ناقصة (قاعدةُ allPages)، وترمي على الخطأ:
 * «لا ملاحظة» عن فشلٍ تُصدَّق.
 * ========================================================================== */

type Res = { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null };

export async function auditPages(db: SupabaseClient, need: (r: Res) => unknown[], from: string, to: string): Promise<InventoryAuditRow[]> {
  const out: InventoryAuditRow[] = [];
  for (let at = 0; ; ) {
    const rows = need(await db.rpc("report_inventory_audit", { p_from: from, p_to: to })
      .order("kind", { ascending: true }).order("product_id", { ascending: true }).range(at, at + 999)) as InventoryAuditRow[];
    if (rows.length === 0) break;
    for (const r of rows) {
      out.push({ ...r, stock: Number(r.stock), value: Number(r.value), qty: r.qty == null ? null : Number(r.qty), days: r.days == null ? null : Number(r.days) });
    }
    at += rows.length;
  }
  return out;
}
