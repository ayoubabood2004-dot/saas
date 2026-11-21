// ============================================================================
// مكتبتا الصور (0285): العامّة (يرتّبها المشغّل ويراها الكلّ) ومكتبةُ العيادة الخاصّة (تكتبها بصلاحية صور
// المنتجات وتراها وحدها). القائمةُ من الخادم واحدة — السياسةُ ترجع العامّةَ ومكتبةَ هذه العيادة وحدها — والفصلُ
// بالعمود: `clinic_id` فارغ = العامّة. صِرفةٌ بلا React ليفحصها library-import-test بسلوكها.
// ============================================================================
import { under, type LibPath } from "./libraryLevels";
import type { LibraryImage } from "@/types";

export type LibScope = "public" | "mine";

/** العامّةُ صفٌّ بلا عيادة — وقاعدةٌ قبل 0285 (بلا العمود أصلاً) كلُّ صفوفها عامّة. */
export const isPublicRow = (r: Pick<LibraryImage, "clinic_id">): boolean => !r.clinic_id;

export function rowsOf<T extends Pick<LibraryImage, "clinic_id">>(rows: readonly T[], scope: LibScope): T[] {
  return rows.filter((r) => (scope === "public" ? isPublicRow(r) : !isPublicRow(r)));
}

/**
 * القاعدةُ تعرف مكتبةَ العيادة؟ بمفتاح العمود بالصفّ — `select *` يرجعه ولو فارغاً منذ 0285 (كعمود `edits`
 * بـ0281). مكتبةٌ فارغةٌ كلُّها لا تقول شيئاً: يُفترض «نعم»، وقاعدةٌ قديمة ترفض أوّلَ كتابةٍ بعمودٍ لا تعرفه
 * فيُقال ذلك بجملة (`isLibraryColumnMissing`).
 */
export function clinicLibraryReady(rows: readonly object[]): boolean {
  return rows.length === 0 || rows.some((r) => "clinic_id" in r);
}

/** رفضُ قاعدةٍ لا تعرف عموداً أرسلناه (الصنف والوكالة 0284، أو العيادة 0285): PGRST204 أو 42703. */
export function isLibraryColumnMissing(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === "PGRST204" || x?.code === "42703" || /column .*(kind|agency|clinic_id)/i.test(x?.message ?? "");
}

/** معرّفاتُ الصور تحت المسار — نقلُ مجموعةٍ بمستواها (إعادةُ تسمية وكالةٍ أو دمجُ قسمين) يكتبها كلَّها. */
export function idsUnder(rows: readonly LibraryImage[], path: LibPath): string[] {
  return under([...rows], path).map((r) => r.id);
}

/** الحقولُ التي تغيّرت وحدها — التعديلُ لا يرسل ما لم يُمسّ (قاعدةٌ قبل 0284 ترفض الصنفَ والوكالة ولو فارغين). */
export type LibraryPatch = Partial<Record<"name" | "company" | "kind" | "agency" | "section" | "barcode", string | null>>;
export function libraryPatch(before: LibraryImage, after: Record<keyof LibraryPatch, string>): LibraryPatch {
  const out: LibraryPatch = {};
  for (const k of ["name", "company", "kind", "agency", "section", "barcode"] as const) {
    const was = (before[k] ?? "").trim();
    const now = (after[k] ?? "").trim();
    if (was !== now) out[k] = now || null;
  }
  return out;
}
