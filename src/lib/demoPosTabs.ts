/* ============================================================================
 * مرآةُ خانات شاشة البيع (0258 ← 0278) للتجريبيّ — الحرّاسُ نفسُها:
 *  • الخاناتُ للعيادة كلّها (0278، قرارُ المالك ١٧/١١): المفتاحُ بالعيادة وحدها (demoClinicId — مرآةُ auth_clinic()). وما صُنع قبلها
 *    بمفتاح «العيادة_المستخدم» (0258) يُجمع بمفتاح العيادة أوّلَ قراءة — كالخادم: الصفوفُ نفسُها تظهر للعيادة كلّها بلا ترحيل.
 *  • المصوّرُ مسيَّج: لا يرى ولا يكتب (photographer_fence_table) — القراءةُ فارغة والكتابةُ 42501.
 *  • قيدُ الشكل (_pos_tab_items_ok والاسمُ والحجم) يرفض ما يرفضه الخادم (23514).
 *  • `updated_at` يُختم بكلّ كتابة، والتعديلُ والحذفُ بشرطه ⇒ pos_tab_stale.
 * كسولةٌ من باب repoDemo وحده (loadDemoPosTabs).
 * ========================================================================= */
import { demoBaseRole, demoClinicId } from "./repoDemo";
import { cleanTabName, draftProblem, type PosTab, type PosTabDraft } from "./posTabs";
import { staleError } from "./posTabsApi";
import { uid } from "./utils";

const clinicKey = () => demoClinicId() ?? "default";
const key = () => `vp_pos_tabs_${clinicKey()}`;
const fenced = () => demoBaseRole() === "photographer";
const fenceErr = () => Object.assign(new Error("permission denied for table pos_custom_tabs"), { code: "42501" });
const checkErr = () => Object.assign(new Error("new row violates check constraint"), { code: "23514" });

const parse = (raw: string | null): PosTab[] => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? (v as PosTab[]) : []; } catch { return []; } };
function load(): PosTab[] {
  const raw = localStorage.getItem(key());
  if (raw != null) return parse(raw);
  // أوّلُ قراءةٍ بعد 0278: خاناتُ كلّ مستخدمٍ بهذه العيادة (مفاتيحُ 0258) صارت للعيادة — تُجمع مرّةً، والأقدمُ يبقى بمكانه.
  const prefix = `vp_pos_tabs_${clinicKey()}_`;
  const seen = new Set<string>();
  const all: PosTab[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    for (const t of parse(localStorage.getItem(k))) if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
  }
  if (all.length) save(all);
  return all;
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
