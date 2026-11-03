/* ============================================================================
 * تعديلُ اللقاح وحذفُه من «حالة اللقاحات» بملفّ الحيوان (القلم، للمدير) — بابٌ كسول خارج repo.ts.
 *
 * خارج repo.ts كباب المستهلكات والأرباح: repo بحزمة الإقلاع وفسحتُها بضعُ مئات بايت، والنافذةُ لا تُفتح إلا من القلم.
 *
 * العقد:
 *  • **الكتابةُ تُسمع**: خطأُ الخادم يُرمى بنصّه، وصفرُ صفوفٍ يُرمى `no_row_updated` — لا «انحفظ» على لا شيء.
 *  • **بشرط أنه كما فُتح** (`expect`): تعديلُ جرعةٍ مجدولة يشترط أنها ما زالت مجدولة — وإلا فطبيبٌ أعطاها من جهازٍ
 *    ثانٍ والنافذةُ مفتوحة يرجع قلمُ المدير يكتبها «مجدولة» بموعدٍ قديم، وتُمحى الجرعةُ المعطاة. والحذفُ كذلك.
 *  • الحذفُ للمدير **بالقاعدة** (0257، سياسةٌ مقيِّدة): لغيره يمرّ على صفرِ صفوف ⇒ `no_row_updated` هنا.
 *    والتعديلُ يمرّ من سياسة العيادة القائمة (الكادرُ يكتب اللقاحَ أصلاً)، فالقلمُ للمدير بالواجهة.
 *  • `vaccinations.administered_at` عمودُ date: اليومُ المحلّيّ (YYYY-MM-DD) لا `toISOString()`.
 * ========================================================================= */
import { supabase } from "./supabase";
import type { Vaccination } from "@/types";

/** ما يعدّله القلم. الفارغُ يُرسَل null (يُمسح) لا "" — حقلٌ «فاضي» بالشاشة فارغٌ بالقاعدة. */
export interface VaxPatch {
  name?: string;
  status?: Vaccination["status"];
  due_date?: string | null;
  administered_at?: string | null;
  lot_number?: string | null;
  notes?: string | null;
}
/** ما يجب أن يكون عليه الصفُّ لحظةَ الكتابة (كما فُتحت النافذة). */
export type VaxExpect = Partial<Pick<Vaccination, "status" | "name">>;

export interface VaxEditApi {
  /** يكتب `patch` على هذه الجرعات بشرط `expect` — يرجع عددَ ما تغيّر، ويرمي `no_row_updated` على الصفر. */
  edit(ids: string[], patch: VaxPatch, expect: VaxExpect): Promise<number>;
  /** يحذف هذه الجرعات بشرط `expect` — يرجع عددَ المحذوف، ويرمي `no_row_updated` على الصفر. */
  remove(ids: string[], expect: VaxExpect): Promise<number>;
}

export function noRowError(): Error {
  return Object.assign(new Error("no_row_updated"), { code: "no_row_updated" });
}
type PgErr = { message: string; code?: string; details?: string; hint?: string };
function serverError(e: PgErr): Error {
  return Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint });
}
function counted(res: { data: unknown; error: PgErr | null }): number {
  if (res.error) throw serverError(res.error);
  const n = Array.isArray(res.data) ? res.data.length : 0;
  if (n === 0) throw noRowError();
  return n;
}

const cloud: VaxEditApi = {
  async edit(ids, patch, expect) {
    if (ids.length === 0) throw noRowError();
    let q = supabase!.from("vaccinations").update(patch).in("id", ids);
    if (expect.status) q = q.eq("status", expect.status);
    if (expect.name !== undefined) q = q.eq("name", expect.name);
    return counted(await q.select("id"));
  },
  async remove(ids, expect) {
    if (ids.length === 0) throw noRowError();
    let q = supabase!.from("vaccinations").delete().in("id", ids);
    if (expect.status) q = q.eq("status", expect.status);
    if (expect.name !== undefined) q = q.eq("name", expect.name);
    return counted(await q.select("id"));
  },
};

/* النسخةُ التجريبية: نفسُ العقد على localStorage، كسولةٌ من باب repoDemo وحده (demoVaxEdit.ts) كمرآة المستهلكات. */
const local = () => import("./repoDemo").then((m) => m.loadDemoVaxEdit());
const demo: VaxEditApi = {
  edit: async (ids, patch, expect) => (await local()).demoVaxEdit(ids, patch, expect),
  remove: async (ids, expect) => (await local()).demoVaxRemove(ids, expect),
};

export const vaxEditApi: VaxEditApi = supabase ? cloud : demo;
