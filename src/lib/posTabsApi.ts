/* ============================================================================
 * خاناتُ الطبيب (0258) — بابٌ واحد للسحابة وللتجريبيّ. خارج repo.ts (حزمةُ الإقلاع وفسحتُها بضعُ مئات بايت).
 *
 * العقد:
 *  • القراءةُ ترمي عند أيّ فشل — لا «ماكو خانات» عن خطأ (الطبيبُ يصنعها من جديد فتتكرّر).
 *  • الكتابةُ تُسمع وبشرط أنها كما فُتحت (`updated_at` يختمه الخادم): تعديلٌ من جهازٍ ثانٍ ⇒ `pos_tab_stale`، لا دوسٌ صامت؛
 *    وصفرُ صفوفٍ بالحذف كذلك.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError) فتعرضه الشاشاتُ كما تعرضه.
 *  • الخادمُ يقصر الصفوفَ على صاحبها (RLS: العيادةُ والمستخدم)، فلا مرشّحَ هنا يحسبه الجهاز.
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { cleanTabName, readTab, type PosTab, type PosTabDraft } from "./posTabs";

export interface PosTabsApi {
  list(): Promise<PosTab[]>;
  create(d: PosTabDraft): Promise<PosTab>;
  update(id: string, d: PosTabDraft, expectUpdatedAt: string): Promise<PosTab>;
  remove(id: string, expectUpdatedAt: string): Promise<void>;
}

const COLS = "id,name,tile_size,show_images,items,sort,updated_at";
type PgErr = { message: string; code?: string; details?: string; hint?: string };
const serverError = (e: PgErr) => Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint });
export const staleError = () => Object.assign(new Error("pos_tab_stale"), { code: "pos_tab_stale" });
function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}
const row = (d: PosTabDraft) => ({ name: cleanTabName(d.name), tile_size: d.tile_size, show_images: d.show_images, items: d.items, sort: d.sort });

const cloud: PosTabsApi = {
  async list() {
    const { data, error } = await supabase!.from("pos_custom_tabs").select(COLS).order("sort").order("created_at");
    if (error) throw serverError(error);
    return (data ?? []).map(readTab);
  },
  async create(d) {
    writable();
    const { data, error } = await supabase!.from("pos_custom_tabs").insert(row(d)).select(COLS).single();
    if (error) throw serverError(error);
    return readTab(data);
  },
  async update(id, d, expectUpdatedAt) {
    writable();
    const { data, error } = await supabase!.from("pos_custom_tabs").update(row(d)).eq("id", id).eq("updated_at", expectUpdatedAt).select(COLS);
    if (error) throw serverError(error);
    if (!data || data.length === 0) throw staleError();
    return readTab(data[0]);
  },
  async remove(id, expectUpdatedAt) {
    writable();
    const { data, error } = await supabase!.from("pos_custom_tabs").delete().eq("id", id).eq("updated_at", expectUpdatedAt).select("id");
    if (error) throw serverError(error);
    if (!data || data.length === 0) throw staleError();
  },
};

/* التجريبيّ: نفسُ العقد على localStorage، كسولٌ من باب repoDemo وحده (demoPosTabs.ts). */
const local = () => import("./repoDemo").then((m) => m.loadDemoPosTabs());
const demo: PosTabsApi = {
  list: async () => (await local()).demoPosTabsList(),
  create: async (d) => { writable(); return (await local()).demoPosTabsCreate(d); },
  update: async (id, d, e) => { writable(); return (await local()).demoPosTabsUpdate(id, d, e); },
  remove: async (id, e) => { writable(); return (await local()).demoPosTabsRemove(id, e); },
};

export const posTabsApi: PosTabsApi = supabase ? cloud : demo;
