/* ============================================================================
 * بابُ أرشفة أدوية النظام (0280) — كسولٌ (متجرُ «أدويتي» يستورده بـimport()، لا يدخل الإقلاع).
 *  • القراءةُ من الجدولين مباشرةً (السياسةُ شرطُ العيادة). جدولٌ غائب (واجهةٌ سبقت 0280) ⇒ `NO_ARCHIVE`: الميزةُ مخفيّة والقائمةُ
 *    كما كانت. وغيرُه من الفشل يُرمى — المتجرُ يقول «ما وصلنا» ولا يرسم قائمةً بلا مخفيّ.
 *  • الكتابةُ من دالّتي 0280 بختم العيادة كأيّ كتابةٍ لـ«أدويتي»، ودفعاتُ ٥٠٠ اسم؛ ويرجع عددُ ما تغيّر فعلاً.
 * ========================================================================= */
import { supabase } from "./supabase";
import { chunks, HIDE_BATCH, NO_ARCHIVE, readArchive, type DrugArchive } from "./drugArchive";

const demo = () => import("./repoDemo").then((m) => m.loadDemoDrugArchive());
const MISSING = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);
export const drugArchiveMissing = (e: unknown): boolean => MISSING.has(String((e as { code?: string } | null)?.code ?? ""));
const fail = (e: { message: string; code?: string; hint?: string; details?: string }) =>
  Object.assign(new Error(e.message), { code: e.code, hint: e.hint, details: e.details });

export async function loadDrugArchive(): Promise<DrugArchive> {
  if (!supabase) { const m = await demo(); return readArchive(m.demoArchiveCatalog(), m.demoArchiveHidden()); }
  const [c, h] = await Promise.all([
    supabase.from("clinic_drug_catalog").select("catalog_off").limit(1),
    supabase.from("clinic_drug_hidden").select("name_key,name,hidden_at").order("hidden_at", { ascending: false }).limit(5000),
  ]);
  if (c.error && drugArchiveMissing(c.error)) return NO_ARCHIVE;
  if (h.error && drugArchiveMissing(h.error)) return NO_ARCHIVE;
  if (c.error) throw fail(c.error);
  if (h.error) throw fail(h.error);
  return readArchive((c.data ?? []) as unknown[], (h.data ?? []) as unknown[]);
}

/** يخفي (أو يُرجع) أسماءً من قائمة النظام. يرجع عددَ ما تغيّر فعلاً. */
export async function hideDrugNames(clinic: string, names: readonly string[], hide: boolean): Promise<number> {
  let n = 0;
  for (const part of chunks(names, HIDE_BATCH)) {
    if (!supabase) { n += await (await demo()).demoDrugHide(clinic, part, hide); continue; }
    const { data, error } = await supabase.rpc("clinic_drug_hide", { p_clinic: clinic, p_names: part, p_hide: hide });
    if (error) throw fail(error);
    const c = Number((data as { changed?: unknown } | null)?.changed);
    if (!Number.isFinite(c)) throw new Error("clinic_drug_hide: no result");
    n += c;
  }
  return n;
}

/** قائمةُ النظام كلُّها: مخفيّة (true) أو ظاهرة. يرجع هل تغيّرت. */
export async function setDrugCatalogOff(clinic: string, off: boolean): Promise<boolean> {
  if (!supabase) return (await demo()).demoDrugCatalogSet(clinic, off);
  const { data, error } = await supabase.rpc("clinic_drug_catalog_set", { p_clinic: clinic, p_off: off });
  if (error) throw fail(error);
  const r = data as { changed?: unknown } | null;
  if (!r || typeof r.changed !== "boolean") throw new Error("clinic_drug_catalog_set: no result");
  return r.changed;
}
