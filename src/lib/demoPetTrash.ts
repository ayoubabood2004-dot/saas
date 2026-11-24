/* ============================================================================
 * مرآةُ حذف الحيوان ومحذوفاته (0290) للنسخة التجريبية — الحرّاسُ نفسُها بترتيبها:
 *  • البوّابة (المصوّرُ أبداً)، ثمّ `staff_can('deletePets')` بمرآتها (staffCan، demoConsumption.ts — لا نسخةَ ثانية):
 *    المديرُ أو مفتاحُه الحيّ، وإلا منحُ الكادر الصريح. والرفضُ 42501 بتلميحه.
 *  • الحذفُ يصوّر الحيوانَ وكلَّ ما يتسلسل منه (القائمةُ بأسماء جداول الخادم، فالعدُّ والنصوصُ واحدة)، ورسائلُ
 *    الواتساب تفرغ ويُحفظ معرّفُها (on delete set null). ومعلَّقُ الجرعة وسجلُّ الحركات يبقيان (بلا مفتاح).
 *  • الاسترجاعُ يعيد الصفوفَ بنفس المعرّفات ويربط الرسائل، و«موجود أصلاً»/«مو بالمحذوفات» بصوت.
 * كسولةٌ من باب repoDemo وحده (deletePet، وloadDemoPetTrash لـpetTrashApi).
 * ========================================================================= */
import { loadDB, saveDB } from "./demoStore";
import { demoApiGate, demoUserId, demoNotesLoad, demoNotesSave, loadDemoConsumption } from "./repoDemo";
import type { DeletedPet, DemoDB, DemoPetTrash, PetDeletePreview } from "@/types";

/* تلميحاتُ الخادم حرفاً (بياناتٌ بمهارب يونيكود لا نصُّ واجهة — describeDbError يعرض التلميحَ العربيّ). */
const HINT = {
  forbidden: "\u062D\u0630\u0641 \u0627\u0644\u062D\u064A\u0648\u0627\u0646 \u0644\u0644\u0645\u062F\u064A\u0631\u060C \u0623\u0648 \u0644\u0645\u0646 \u0639\u0646\u062F\u0647 \u0635\u0644\u0627\u062D\u064A\u0629 \u00AB\u062D\u0630\u0641 \u0627\u0644\u062D\u064A\u0648\u0627\u0646\u0627\u062A\u00BB.",
  restoreForbidden: "\u0627\u0633\u062A\u0631\u062C\u0627\u0639 \u0627\u0644\u062D\u064A\u0648\u0627\u0646 \u0644\u0644\u0645\u062F\u064A\u0631\u060C \u0623\u0648 \u0644\u0645\u0646 \u0639\u0646\u062F\u0647 \u0635\u0644\u0627\u062D\u064A\u0629 \u00AB\u062D\u0630\u0641 \u0627\u0644\u062D\u064A\u0648\u0627\u0646\u0627\u062A\u00BB.",
  notFound: "\u0627\u0644\u062D\u064A\u0648\u0627\u0646 \u0645\u0648 \u0645\u0648\u062C\u0648\u062F \u0628\u0639\u064A\u0627\u062F\u062A\u0643 \u2014 \u0631\u0628\u0645\u0627 \u0627\u0646\u062D\u0630\u0641 \u0645\u0646 \u062C\u0647\u0627\u0632 \u062B\u0627\u0646\u064A. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629.",
  notInTrash: "\u0627\u0644\u062D\u064A\u0648\u0627\u0646 \u0645\u0648 \u0628\u0627\u0644\u0645\u062D\u0630\u0648\u0641\u0627\u062A \u2014 \u0631\u0628\u0645\u0627 \u0631\u062C\u0651\u0639\u0647 \u0623\u062D\u062F \u0645\u0646 \u062C\u0647\u0627\u0632 \u062B\u0627\u0646\u064A. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629.",
  exists: "\u0627\u0644\u062D\u064A\u0648\u0627\u0646 \u0645\u0648\u062C\u0648\u062F \u0623\u0635\u0644\u0627\u064B \u2014 \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629.",
};
const fail = (message: string, code: string, hint: string): Error => Object.assign(new Error(message), { code, hint });

/** ما يتسلسل من الحيوان بالتجريبيّ: اسمُ جدول الخادم ← مصفوفتُه بالمخزن، بترتيب الاسترجاع (_pets_trash_spec). */
const SPEC: readonly (readonly [string, keyof DemoDB])[] = [
  ["clinic_visits", "clinicVisits"], ["medical_visits", "visits"], ["admissions", "admissions"],
  ["appointments", "appointments"], ["reminders", "reminders"], ["weight_logs", "weightLogs"],
  ["vaccinations", "vaccinations"], ["media_items", "media"], ["treatment_entries", "treatments"],
  ["surgeries", "surgeries"], ["lab_results", "labResults"], ["pet_problems", "petProblems"],
  ["care_entries", "careEntries"], ["journeys", "journeys"],
];
type Row = { id: string; pet_id?: string | null; journey_id?: string | null };
const arr = (db: DemoDB, k: keyof DemoDB): Row[] => ((db as unknown as Record<string, Row[] | undefined>)[k as string] ?? []);
const setArr = (db: DemoDB, k: keyof DemoDB, v: Row[]) => { (db as unknown as Record<string, Row[]>)[k as string] = v; };

async function allowed(): Promise<boolean> {
  demoApiGate();
  return (await loadDemoConsumption()).staffCan("deletePets");
}

/** ما يُرفع مع الحيوان: الصفوفُ بأسماء جداول الخادم (والملاحظاتُ وأحداثُ الرحلة معها). */
function collect(db: DemoDB, petId: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const [tbl, key] of SPEC) {
    const rows = arr(db, key).filter((r) => r.pet_id === petId);
    if (rows.length) out[tbl] = rows;
  }
  const journeys = new Set((out.journeys ?? []).map((j) => j.id));
  const events = (db.journeyEvents ?? []).filter((e) => journeys.has(e.journey_id)) as unknown as Row[];
  if (events.length) out.journey_events = events;
  const notes = demoNotesLoad().filter((n) => n.pet_id === petId) as unknown as Row[];
  if (notes.length) out.pet_notes = notes;
  return out;
}
const countsOf = (c: Record<string, unknown[]>): Record<string, number> =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length]));

export async function demoPetDeletePreview(petId: string): Promise<PetDeletePreview> {
  const db = loadDB();
  const pet = db.pets.find((p) => p.id === petId);
  if (!pet) throw fail("pet_not_found", "P0002", HINT.notFound);
  return {
    id: pet.id, name: pet.name ?? null, owner_name: pet.owner_name ?? null, species: pet.species ?? null,
    serial: pet.serial ?? null, counts: countsOf(collect(db, petId)),
    pending_charges: (db.doseCharges ?? []).filter((c) => c.pet_id === petId && c.status === "pending").length,
    active_admission: (db.admissions ?? []).some((a) => a.pet_id === petId && a.status === "active"),
    allowed: await allowed().catch(() => false),
  };
}

export async function demoDeletePet(petId: string, reason?: string | null): Promise<void> {
  if (!(await allowed())) throw fail("pet_delete_forbidden", "42501", HINT.forbidden);
  const db = loadDB();
  const pet = db.pets.find((p) => p.id === petId);
  if (!pet) throw fail("pet_not_found", "P0002", HINT.notFound);
  const children = collect(db, petId);
  const wa = (db.waMessages ?? []).filter((m) => m.pet_id === petId);
  const entry: DemoPetTrash = {
    id: pet.id, pet_name: pet.name ?? null, owner_name: pet.owner_name ?? null, owner_phone: pet.owner_phone ?? null,
    species: pet.species ?? null, serial: pet.serial ?? null, counts: countsOf(children),
    reason: (reason ?? "").trim().slice(0, 300) || null, deleted_by: demoUserId(), deleted_by_name: null,
    deleted_at: new Date().toISOString(), row: { ...pet }, children, wa_ids: wa.map((m) => m.id),
  };
  db.pets = db.pets.filter((p) => p.id !== petId);
  for (const [tbl, key] of SPEC) if (children[tbl]) setArr(db, key, arr(db, key).filter((r) => r.pet_id !== petId));
  if (children.journey_events) {
    const gone = new Set(children.journey_events.map((e) => e.id));
    db.journeyEvents = (db.journeyEvents ?? []).filter((e) => !gone.has(e.id));
  }
  for (const m of wa) m.pet_id = null;
  db.petsTrash = [entry, ...(db.petsTrash ?? []).filter((t) => t.id !== petId)];
  saveDB(db);
  if (children.pet_notes) demoNotesSave(demoNotesLoad().filter((n) => n.pet_id !== petId));
}

export async function demoListPetTrash(): Promise<DeletedPet[]> {
  return (loadDB().petsTrash ?? [])
    .map(({ row: _row, children: _c, wa_ids: _w, ...summary }) => summary)
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}

export async function demoRestorePet(petId: string): Promise<void> {
  if (!(await allowed())) throw fail("pet_restore_forbidden", "42501", HINT.restoreForbidden);
  const db = loadDB();
  const t = (db.petsTrash ?? []).find((x) => x.id === petId);
  if (!t) throw fail("pet_not_in_trash", "P0002", HINT.notInTrash);
  if (db.pets.some((p) => p.id === petId)) throw fail("pet_exists", "P0001", HINT.exists);
  db.pets.push({ ...t.row });
  for (const [tbl, key] of SPEC) {
    const rows = t.children[tbl] as Row[] | undefined;
    if (rows?.length) setArr(db, key, [...arr(db, key), ...rows]);
  }
  if (t.children.journey_events?.length) db.journeyEvents = [...(db.journeyEvents ?? []), ...(t.children.journey_events as NonNullable<DemoDB["journeyEvents"]>)];
  const wa = new Set(t.wa_ids);
  for (const m of db.waMessages ?? []) if (wa.has(m.id) && m.pet_id == null) m.pet_id = petId;
  db.petsTrash = (db.petsTrash ?? []).filter((x) => x.id !== petId);
  saveDB(db);
  const notes = t.children.pet_notes as ReturnType<typeof demoNotesLoad> | undefined;
  if (notes?.length) demoNotesSave([...notes, ...demoNotesLoad()]);
}
