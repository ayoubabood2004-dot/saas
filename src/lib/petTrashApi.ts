/* ============================================================================
 * بابُ محذوفات الحيوانات (0290) — كسولٌ: نافذةُ الحذف وقائمةُ «الحيوانات المحذوفة» تستوردانه، لا الإقلاع.
 *  • الحذفُ نفسُه `repo.deletePet` (مرآةُ سجلّ الحركات التجريبيّ تلفّ دوالَّ repo) — وهنا ما حوله:
 *  • المعاينةُ (pet_delete_preview) تعدّ ما سيُرفع جدولاً جدولاً — النافذةُ تقوله بالاسم قبل التأكيد.
 *  • القائمةُ ترمي ولا ترجع فارغة: «ماكو محذوفات» عن فشلٍ يُصدَّق فيُعاد إدخالُ الحيوان توأماً بلا تاريخه.
 *    وتتقدّم بما وصل وتقف عند صفحةٍ فارغة (سقفُ الألف — درسُ allPages).
 *  • قاعدةٌ قبل 0290 (دالّةٌ أو جدولٌ غائب) ⇒ `petTrashMissing`: النافذةُ تقول «تحتاج تحديث» ولا حذفَ بالطريق القديم.
 * ========================================================================= */
import { supabase } from "./supabase";
import type { DeletedPet, PetDeletePreview } from "@/types";

const demo = () => import("./repoDemo").then((m) => m.loadDemoPetTrash());
const MISSING = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);
export const petTrashMissing = (e: unknown): boolean => MISSING.has(String((e as { code?: string } | null)?.code ?? ""));
type PgErr = { message: string; code?: string; hint?: string; details?: string };
const fail = (e: PgErr): Error => Object.assign(new Error(e.message), { code: e.code, hint: e.hint, details: e.details });

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const counts = (v: unknown): Record<string, number> =>
  v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, num(n)])) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export async function petDeletePreview(id: string): Promise<PetDeletePreview> {
  if (!supabase) return (await demo()).demoPetDeletePreview(id);
  const { data, error } = await supabase.rpc("pet_delete_preview", { p_id: id });
  if (error) throw fail(error);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(d.id ?? id), name: str(d.name), owner_name: str(d.owner_name), species: str(d.species), serial: str(d.serial),
    counts: counts(d.counts), pending_charges: num(d.pending_charges), active_admission: d.active_admission === true,
    allowed: d.allowed === true,
  };
}

const COLS = "id,pet_name,owner_name,owner_phone,species,serial,counts,reason,deleted_by,deleted_by_name,deleted_at";
const PAGE = 1000;

export async function listPetTrash(): Promise<DeletedPet[]> {
  if (!supabase) return (await demo()).demoListPetTrash();
  const out: DeletedPet[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from("pets_trash").select(COLS)
      .order("deleted_at", { ascending: false }).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw fail(error);
    const rows = (data ?? []) as unknown as DeletedPet[];
    if (rows.length === 0) break;
    for (const r of rows) out.push({ ...r, counts: counts(r.counts) });
    from += rows.length;
  }
  return out;
}

export async function restorePet(id: string): Promise<void> {
  if (!supabase) return (await demo()).demoRestorePet(id);
  const { error } = await supabase.rpc("restore_pet", { p_id: id });
  if (error) throw fail(error);
}
