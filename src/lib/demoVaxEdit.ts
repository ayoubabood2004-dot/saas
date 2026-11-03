/* ============================================================================
 * مرآةُ تعديل اللقاح وحذفه (vaxEditApi) للنسخة التجريبية — الحرّاسُ نفسُها:
 *  • السياجُ: المصوّرُ بالدور الأساس لا يرى اللقاحَ ولا يكتبه (photographer_fence، 0222) ⇒ صفرُ صفوف.
 *  • الحذفُ: `auth_role() = 'manager'` (0257) — مرآتُه `demoBaseRole() === "manager" || demoPinLive()`، وغيرُه صفرُ صفوف.
 *  • `expect`: الصفُّ كما فُتح وإلا لا يُلمس. وصفرُ صفوفٍ يُرمى `no_row_updated` كالسحابة.
 * كسولةٌ من باب repoDemo وحده (loadDemoVaxEdit)، والأثرُ بسجلّ الحركات التجريبيّ كمحفّز audit_all.
 * ========================================================================= */
import { loadDB, saveDB } from "./demoStore";
import { demoAuditPush, demoBaseRole, demoPinLive } from "./repoDemo";
import { noRowError, type VaxExpect, type VaxPatch } from "./vaxEditApi";
import type { Vaccination } from "@/types";

const fenced = () => demoBaseRole() === "photographer";
const matches = (v: Vaccination, ids: Set<string>, expect: VaxExpect) =>
  ids.has(v.id) && (!expect.status || v.status === expect.status) && (expect.name === undefined || v.name === expect.name);

export async function demoVaxEdit(ids: string[], patch: VaxPatch, expect: VaxExpect): Promise<number> {
  if (fenced()) throw noRowError();
  const db = loadDB();
  const want = new Set(ids);
  const hit = (db.vaccinations ?? []).filter((v) => matches(v, want, expect));
  if (hit.length === 0) throw noRowError();
  for (const v of hit) {
    Object.assign(v, patch);
    demoAuditPush({ action: "UPDATE", entity: "vaccinations", entity_id: v.id, details: v as unknown as Record<string, unknown> });
  }
  saveDB(db);
  return hit.length;
}

export async function demoVaxRemove(ids: string[], expect: VaxExpect): Promise<number> {
  if (fenced() || !(demoBaseRole() === "manager" || demoPinLive())) throw noRowError();
  const db = loadDB();
  const want = new Set(ids);
  const gone = (db.vaccinations ?? []).filter((v) => matches(v, want, expect));
  if (gone.length === 0) throw noRowError();
  const goneIds = new Set(gone.map((v) => v.id));
  db.vaccinations = db.vaccinations.filter((v) => !goneIds.has(v.id));
  for (const v of gone) demoAuditPush({ action: "DELETE", entity: "vaccinations", entity_id: v.id, details: v as unknown as Record<string, unknown> });
  saveDB(db);
  return gone.length;
}
