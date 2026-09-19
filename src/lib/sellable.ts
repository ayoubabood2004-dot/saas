/**
 * رصيدُ الكاشير لمنتج = رصيدُ صفّه + حوضُ قسمه (المخزون المجمَّع).
 *
 * الخادمُ يبيع من الحوض فعلاً (`deduct_stock_pooled`، 0066: الصفُّ أوّلاً ثم حوضُ
 * القسم، لأيّ منتجٍ بالقسم) — فهذا ما يُعرض بالكاشير وما يُسقَّف به السطر. والمعادلةُ
 * هنا **مرّةً واحدة**: القائمةُ (`loadRetailSnap`، جملةُ المخزن) وسؤالُ الخادم عن
 * صفٍّ «صفرٍ بالقائمة» (`freshSale.ts`) يمرّان منها. نسختان منها كانتا تقولان
 * للعيادة «رصيده صفر — زيد رصيده» عمّا يبيعه الخادمُ من الحوض.
 *
 * ملفٌّ بلا استيراد: يُحمَّل مع المسخّن الخلفيّ، فلا يجرّ وراءه شيئاً.
 */

/** حوضُ كلّ قسمٍ بمعرّفه. */
export function poolMapOf(sections: readonly { id: string; pooled_stock?: number | null }[]): Map<string, number> {
  return new Map(sections.map((s) => [s.id, s.pooled_stock ?? 0]));
}

/** رصيدُ الكاشير لصفٍّ واحد بحوض قسمه. */
export function sellableRow<T extends { stock: number; section_id?: string | null }>(p: T, pool: number): T {
  return pool > 0 ? { ...p, stock: (p.stock || 0) + pool } : p;
}

/** قائمةُ الكاشير من قائمة المخزن وأقسامها. */
export function sellableRows<T extends { stock: number; section_id?: string | null }>(
  products: readonly T[], sections: readonly { id: string; pooled_stock?: number | null }[],
): T[] {
  const pool = poolMapOf(sections);
  return products.map((p) => sellableRow(p, p.section_id ? (pool.get(p.section_id) ?? 0) : 0));
}
