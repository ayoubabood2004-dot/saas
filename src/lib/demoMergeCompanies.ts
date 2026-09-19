/**
 * طيُّ الشركات المكرَّرة — الوجهُ التجريبيّ، بوحدةٍ على حدة.
 *
 * مرآةُ `merge_companies` (0195): الأصنافُ المتشابهةُ بالاسم تُطوى **وحوضُها يُجمع**،
 * وما لا نظيرَ له يُنقل، وكلُّ ما يشير للمطويّة يشير للباقية — بما فيه **صورُ
 * المحذوفات**، وإلا انكسر استرجاعُها بمفتاحٍ أجنبيّ لا يُكتشف إلا يومَ يُحتاج.
 *
 * ولماذا وحدةٌ على حدة: صفحةُ الزائر (المتجر) تحمل `repo`، وميزانيّةُ وزنها تُقاس
 * بايتاً ببايت — فما لا تحتاجه العيادةُ إلا بضغطةٍ نادرة يُحمَّل عند الضغطة.
 */
import { searchable } from "@/lib/utils";
import type { Company, CompanySection, Product } from "@/types";

type TrashRow = { row?: { company_id?: string | null; section_id?: string | null } | null };
export type MergeDb = {
  companies?: Company[];
  companySections?: CompanySection[];
  products?: Product[];
  purchases?: { company_id?: string | null }[];
  productsTrash?: TrashRow[];
};
export type MergeResult = { companies: number; products: number; sections_moved: number; sections_merged: number };

/** يطوي `dropIds` بـ`keepId` داخل قاعدة الديمو (تُحفظ خارجَه). */
export function mergeCompaniesInDb(db: MergeDb, keepId: string, dropIds: string[]): MergeResult {
  const keep = (db.companies ?? []).find((c) => c.id === keepId);
  if (!keep) throw new Error("company to keep not found");
  const drop = new Set((dropIds ?? []).filter((id) => id !== keepId && (db.companies ?? []).some((c) => c.id === id)));
  if (drop.size === 0) throw new Error("no companies to merge");
  const key = (s: string) => searchable(s ?? "");
  let moved = 0, merged = 0, prods = 0;
  for (const sec of (db.companySections ?? []).filter((s) => drop.has(s.company_id))) {
    const target = (db.companySections ?? []).find((t) => t.company_id === keepId && key(t.name) === key(sec.name));
    if (!target) { sec.company_id = keepId; moved++; continue; }
    for (const p of db.products ?? []) if (p.section_id === sec.id) p.section_id = target.id;
    for (const t of db.productsTrash ?? []) if (t.row?.section_id === sec.id) t.row.section_id = target.id;
    target.pooled_stock = (target.pooled_stock ?? 0) + (sec.pooled_stock ?? 0);
    db.companySections = (db.companySections ?? []).filter((s) => s.id !== sec.id);
    merged++;
  }
  for (const p of db.products ?? []) if (p.company_id && drop.has(p.company_id)) { p.company_id = keepId; prods++; }
  for (const u of db.purchases ?? []) if (u.company_id && drop.has(u.company_id)) u.company_id = keepId;
  for (const t of db.productsTrash ?? []) if (t.row?.company_id && drop.has(t.row.company_id)) t.row.company_id = keepId;
  db.companies = (db.companies ?? []).filter((c) => !drop.has(c.id));
  return { companies: drop.size, products: prods, sections_moved: moved, sections_merged: merged };
}
