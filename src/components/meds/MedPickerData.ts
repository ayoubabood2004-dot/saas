import { useMemo } from "react";
import { MED_CATALOG } from "@/lib/medCatalog";
import { buildMedIndex, type BuildInput, type MedIndex } from "@/lib/medIndex";
import { useDrugArchive } from "@/lib/clinicDrugs";

/* ============================================================================
 * فهرسُ الأدوية بالكتالوج — البابُ الوحيد الذي يقرأ MED_CATALOG لأجل منتقٍ أو قائمة.
 * ورقةُ المنتقي وإعداداتُ «أدويتي» تبنيان منه نفسَ الفهرس، فما يُرى بالمنتقي (العائلة،
 * «من الكتالوج أم أضافته العيادة») هو ما يُرى بالإعدادات. (med-entry-guard يمنع غيرَه.)
 * ==========================================================================*/
/* 0280: أرشفةُ أدوية النظام من متجر «أدويتي» نفسِه — كلُّ منتقٍ وقائمةٍ تخفي المؤرشفَ بلا أن يمرّره المضيف (مضيفٌ ينساه كان سيعرض
 * ما أرشفته العيادة). والإعداداتُ وحدها تطلب رؤيته (`showHidden`). */
export function useMedIndex(input: Omit<BuildInput, "catalog" | "archive">): MedIndex {
  const { rows, stock, recent, species, only, formulary, stockMode, groups, items, showHidden } = input;
  const archive = useDrugArchive();
  return useMemo(
    () => buildMedIndex({ catalog: MED_CATALOG, rows, stock, recent, species, only, formulary, stockMode, groups, items, archive, showHidden }),
    [rows, stock, recent, species, only, formulary, stockMode, groups, items, archive, showHidden],
  );
}
