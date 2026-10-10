import { useMemo } from "react";
import { MED_CATALOG } from "@/lib/medCatalog";
import { buildMedIndex, type BuildInput, type MedIndex } from "@/lib/medIndex";

/* ============================================================================
 * فهرسُ الأدوية بالكتالوج — البابُ الوحيد الذي يقرأ MED_CATALOG لأجل منتقٍ أو قائمة.
 * ورقةُ المنتقي وإعداداتُ «أدويتي» تبنيان منه نفسَ الفهرس، فما يُرى بالمنتقي (العائلة،
 * «من الكتالوج أم أضافته العيادة») هو ما يُرى بالإعدادات. (med-entry-guard يمنع غيرَه.)
 * ==========================================================================*/
export function useMedIndex(input: Omit<BuildInput, "catalog">): MedIndex {
  const { rows, stock, recent, species, only, stockMode } = input;
  return useMemo(
    () => buildMedIndex({ catalog: MED_CATALOG, rows, stock, recent, species, only, stockMode }),
    [rows, stock, recent, species, only, stockMode],
  );
}
