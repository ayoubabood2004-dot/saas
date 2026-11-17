/* ============================================================================
 * مرآةُ `pos_product_sales` (0279) بالتجريبيّ: فواتيرُ الجهاز بآخر N يوماً (بين يومٍ و٣٦٦)، بوحدة المخزن (stock_qty وإلا qty)،
 * صافيةً بعد الراجع، بلا المرجَّعة كلِّها، وسطورُ المواد وحدها. كسولةٌ من باب repoDemo وحده (loadDemoPosSales).
 * ========================================================================= */
import { loadDB } from "./demoStore";

export function demoProductSales(days: number, now: number = Date.now()): Map<string, number> {
  const db = loadDB();
  const span = Math.min(Math.max(Math.trunc(days) || 30, 1), 366) * 86_400_000;
  const live = new Set((db.invoices ?? []).filter((i) => (i.status ?? "paid") !== "refunded" && Date.parse(i.created_at) >= now - span).map((i) => i.id));
  const out = new Map<string, number>();
  for (const it of db.invoiceItems ?? []) {
    if (!it.product_id || !live.has(it.invoice_id)) continue;
    const q = Number(it.stock_qty ?? it.qty) || 0;
    out.set(it.product_id, Math.round(((out.get(it.product_id) ?? 0) + q) * 1000) / 1000);
  }
  return out;
}
