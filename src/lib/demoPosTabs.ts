/* ============================================================================
 * مرآةُ خانات الطبيب (0258) للتجريبيّ — الحرّاسُ نفسُها:
 *  • الصفُّ لصاحبه وحده: المفتاحُ بالعيادة والمستخدم (demoClinicId/demoUserId — مرآةُ auth_clinic()/auth.uid()).
 *  • المصوّرُ مسيَّج: لا يرى ولا يكتب (photographer_fence_table) — القراءةُ فارغة والكتابةُ 42501.
 *  • قيدُ الشكل (_pos_tab_items_ok والاسمُ والحجم) يرفض ما يرفضه الخادم (23514).
 *  • `updated_at` يُختم بكلّ كتابة، والتعديلُ والحذفُ بشرطه ⇒ pos_tab_stale.
 * كسولةٌ من باب repoDemo وحده (loadDemoPosTabs).
 * ========================================================================= */
import { demoBaseRole, demoClinicId, demoUserId } from "./repoDemo";
import { cleanTabName, draftProblem, type PosTab, type PosTabDraft } from "./posTabs";
import { staleError } from "./posTabsApi";
import { uid } from "./utils";

const key = () => `vp_pos_tabs_${demoClinicId() ?? "default"}_${demoUserId() ?? "owner"}`;
const fenced = () => demoBaseRole() === "photographer";
const fenceErr = () => Object.assign(new Error("permission denied for table pos_custom_tabs"), { code: "42501" });
const checkErr = () => Object.assign(new Error("new row violates check constraint"), { code: "23514" });

function load(): PosTab[] {
  try { const v = JSON.parse(localStorage.getItem(key()) || "[]"); return Array.isArray(v) ? (v as PosTab[]) : []; } catch { return []; }
}
function save(list: PosTab[]) { localStorage.setItem(key(), JSON.stringify(list)); }
/** ختمٌ يكبر دائماً (لا يتكرّر بنفس الملّي ثانية فيصير شرطُ «كما فُتحت» بلا معنى). */
function stamp(prev?: string): string {
  const now = Date.now();
  const p = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(now, p + 1)).toISOString();
}
const byOrder = (a: PosTab, b: PosTab) => a.sort - b.sort;

export async function demoPosTabsList(): Promise<PosTab[]> {
  if (fenced()) return [];
  return load().sort(byOrder);
}
export async function demoPosTabsCreate(d: PosTabDraft): Promise<PosTab> {
  if (fenced()) throw fenceErr();
  if (draftProblem(d)) throw checkErr();
  const t: PosTab = { ...d, name: cleanTabName(d.name), id: uid("tab"), updated_at: stamp() };
  save([...load(), t]);
  return t;
}
export async function demoPosTabsUpdate(id: string, d: PosTabDraft, expect: string): Promise<PosTab> {
  if (fenced()) throw fenceErr();
  if (draftProblem(d)) throw checkErr();
  const list = load();
  const i = list.findIndex((x) => x.id === id && x.updated_at === expect);
  if (i < 0) throw staleError();
  const t: PosTab = { ...list[i], ...d, name: cleanTabName(d.name), updated_at: stamp(list[i].updated_at) };
  list[i] = t;
  save(list);
  return t;
}
export async function demoPosTabsRemove(id: string, expect: string): Promise<void> {
  if (fenced()) throw fenceErr();
  const list = load();
  if (!list.some((x) => x.id === id && x.updated_at === expect)) throw staleError();
  save(list.filter((x) => x.id !== id));
}
