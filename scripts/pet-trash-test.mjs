/* ============================================================================
 * حذفُ الحيوان و«الحيوانات المحذوفة» (0291) — بالواجهة. القاعدةُ نفسُها (الحارسان، الصورة، الاسترجاعُ بنفس المعرّفات،
 * السياج) يفحصها قسمُ 0291 بالحزمة على بوستغريس؛ وهنا:
 *   أ) المرآةُ التجريبية بالمستودع الحقيقيّ: الاستقبالُ والطبيبُ بلا منحٍ يُرفضان 42501 والحيوانُ باقٍ، والمصوّرُ تردّه
 *      البوّابة، والمديرُ (ومفتاحُه الحيّ، ومنحُ «حذف الحيوانات» الصريح) يحذف؛ والحذفُ يرفع ما يتسلسل ويُفرغ رسالةَ
 *      الواتساب، والاسترجاعُ يعيد كلَّ صفٍّ بمعرّفه ويربط الرسالة، والمعاينةُ تعدّ بأسماء جداول الخادم.
 *   ب) الأسلاك: السحابةُ تنادي delete_pet ولا تحذف من pets ولا تمحو ملفّاتِ الدلو؛ الزرُّ لمن عنده deletePets
 *      وبجهازٍ مقفولٍ بمفتاح المدير؛ والنافذةُ كسولةٌ بنطاقها ولا تحذف قبل المعاينة ولا بـwindow.confirm.
 *   ج) التطابق: كلُّ جدولٍ يعدّه الخادم (_pets_trash_spec) له اسمٌ بالنافذة بالعربية والإنكليزية، والمرآةُ لا تعدّ
 *      جدولاً لا يعرفه الخادم.
 *
 *   node scripts/pet-trash-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const src = (f) => readFileSync(f, "utf8");
const keyOf = (file, re) => {
  const k = re.exec(src(file))?.[1];
  if (!k) { console.error(`✗ pet-trash-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);
const ACTIVE = keyOf("src/lib/clinics.ts", /const ACTIVE_KEY = "([^"]+)"/);
const UNTIL = keyOf("src/lib/managerOverride.ts", /const untilKey = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/);

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? {
  localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
};
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null;",
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: [
      'export * from "./src/lib/repo.ts";',
      'export * as T from "./src/lib/petTrashApi.ts";',
      'export { listStaff, saveStaff } from "./src/lib/staff.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "pet-trash-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "pet-trash-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, T, listStaff, saveStaff } = mod;
if (!repo || !T || !listStaff || !saveStaff) { console.error("✗ pet-trash-test: ما انحمّلت الوحدات"); process.exit(1); }

/* ── أ) المرآةُ التجريبية ────────────────────────────────────────────────── */
console.log("▸ المرآةُ التجريبية: الحذفُ لمن عنده «حذف الحيوانات»، والصورةُ ترجع بمعرّفاتها");
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: [rawRole === "owner" ? "owner" : "clinic"],
    clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: rawRole === "owner" ? "owner" : "clinic",
}));
const clinic = () => mem.get(ACTIVE) || "default";
const pinOff = () => mem.delete(`${UNTIL}${clinic()}`);
const OWNER = () => { pinOff(); mem.delete(SESSION); };
const VET = () => { pinOff(); as("v1", "doctor"); };
const RCP = () => { pinOff(); as("r1", "reception"); };
const PHO = () => { pinOff(); as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" }); };
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.code ?? e.message; } };

OWNER();
const pet = await repo.createPet({ name: "بوبي", species: "dog", owner_name: "علي", owner_phone: "07700000000", sex: "male" });
const keep = await repo.createPet({ name: "جاره", species: "cat", owner_name: "علي", owner_phone: "07700000000", sex: "female" });
const v1 = await repo.addVaccination({ pet_id: pet.id, name: "Rabies", status: "scheduled", due_date: "2026-12-01", dose_number: 1 });
const v2 = await repo.addVaccination({ pet_id: pet.id, name: "DHPP", status: "administered", administered_at: "2026-06-01", dose_number: 1 });
const vk = await repo.addVaccination({ pet_id: keep.id, name: "Rabies", status: "scheduled", due_date: "2026-12-01", dose_number: 1 });
const w1 = await repo.addWeight(pet.id, 4.5, "2026-11-01");
const n1 = await repo.addPetNote({ pet_id: pet.id, note_text: "ملاحظة" });
await repo.logWhatsApp({ pet_id: pet.id, owner_name: "علي", owner_phone: "07700000000", reminder_type: "vaccine" });
const waId = (await repo.listWhatsAppLog()).find((m) => m.pet_id === pet.id)?.id;
const snap = async (id) => JSON.stringify({
  pet: (await repo.getPet(id))?.serial ?? null,
  vax: (await repo.listVaccinations(id)).map((v) => v.id).sort(),
  w: (await repo.listWeights(id)).map((x) => x.id),
  notes: (await repo.listPetNotes(id)).map((x) => x.id),
  wa: (await repo.listWhatsAppLog()).find((m) => m.id === waId)?.pet_id ?? null,
});
const before = await snap(pet.id);
check("القالب: الحيوانُ بلقاحين ووزنٍ وملاحظةٍ ورسالة", before === JSON.stringify({ pet: pet.serial, vax: [v1.id, v2.id].sort(), w: [w1.id], notes: [n1.id], wa: pet.id }), before);

RCP();
const pr = await T.petDeletePreview(pet.id);
check("المعاينةُ للاستقبال: تعدّ بأسماء جداول الخادم وتقول «ما تقدر»",
  pr.allowed === false && JSON.stringify(pr.counts) === JSON.stringify({ weight_logs: 1, vaccinations: 2, pet_notes: 1 }), JSON.stringify(pr));
check("  والاستقبالُ يحذف؟ 42501", await errOf(() => repo.deletePet(pet.id)) === "42501");
check("    والحيوانُ باقٍ بكلّ صفوفه", await snap(pet.id) === before);
check("  ولا يسترجع", await errOf(() => T.restorePet(pet.id)) === "42501");
VET();
check("الطبيبُ بلا منحٍ يُرفض كذلك", await errOf(() => repo.deletePet(pet.id)) === "42501" && await snap(pet.id) === before);
PHO();
check("والمصوّرُ تردّه البوّابةُ قبل كلّ شيء", await errOf(() => repo.deletePet(pet.id)) === "42501" && await snap(pet.id) === before);

OWNER();
check("المعاينةُ للمدير: يقدر", (await T.petDeletePreview(pet.id)).allowed === true);
await repo.deletePet(pet.id, "  انسجّل مرتين  ");
check("المديرُ يحذف: الحيوانُ ولقاحاتُه ووزنُه وملاحظتُه راحت، والرسالةُ فرغت (set null)",
  await snap(pet.id) === JSON.stringify({ pet: null, vax: [], w: [], notes: [], wa: null }), await snap(pet.id));
check("  والجارُ باقٍ بلقاحه", (await repo.getPet(keep.id))?.id === keep.id && (await repo.listVaccinations(keep.id)).map((v) => v.id).join() === vk.id);
const trash = await T.listPetTrash();
check("  والمحذوفاتُ تحمله بسببه المقصوص وعدِّه، بلا الصورة الكاملة",
  trash.length === 1 && trash[0].id === pet.id && trash[0].reason === "انسجّل مرتين" && trash[0].pet_name === "بوبي"
  && JSON.stringify(trash[0].counts) === JSON.stringify({ weight_logs: 1, vaccinations: 2, pet_notes: 1 }) && !("row" in trash[0]) && !("children" in trash[0]),
  JSON.stringify(trash));
check("  وحذفُه مرّةً ثانية: «مو موجود» (P0002)", await errOf(() => repo.deletePet(pet.id)) === "P0002");
await T.restorePet(pet.id);
check("الاسترجاعُ يعيد كلَّ صفٍّ بمعرّفه، والرقمَ، ويربط الرسالة", await snap(pet.id) === before, await snap(pet.id));
check("  والمحذوفاتُ فرغت، والاسترجاعُ الثاني «مو بالمحذوفات» (P0002)",
  (await T.listPetTrash()).length === 0 && await errOf(() => T.restorePet(pet.id)) === "P0002");

VET(); mem.set(`${UNTIL}${clinic()}`, String(Date.now() + 10 * 60 * 1000));
check("مفتاحُ المدير الحيّ (PIN) يفتحها للطبيب", await errOf(() => repo.deletePet(pet.id)) === "قُبل" && await errOf(() => T.restorePet(pet.id)) === "قُبل");
mem.set(`${UNTIL}${clinic()}`, String(Date.now() - 1000));
check("  والمنتهي لا", await errOf(() => repo.deletePet(pet.id)) === "42501");
OWNER();
const staff = await listStaff();
await saveStaff({ ...staff[0], id: "vet-row", userId: "v1", email: "v1@demo.vet", role: "veterinarian", permissions: { deletePets: true } });
VET();
check("ومنحُ المدير «حذف الحيوانات» صراحةً يفتحها للطبيب (staff_can)", await errOf(() => repo.deletePet(pet.id)) === "قُبل" && await errOf(() => T.restorePet(pet.id)) === "قُبل");
check("  ورجع كما كان", await snap(pet.id) === before);
OWNER();

/* ── ب) الأسلاك ─────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك: السحابةُ بالدالّة، والزرُّ بالصلاحية، والنافذةُ بالمعاينة");
const repoSrc = src("src/lib/repo.ts");
const cloudDelete = /async deletePet\(petId, reason\) \{[\s\S]*?\n  \},/.exec(repoSrc)?.[0] ?? "";
check("السحابةُ تنادي delete_pet بالسبب", /rpc\("delete_pet", \{ p_id: petId, p_reason: reason \?\? null \}\)/.test(cloudDelete), cloudDelete.slice(0, 200));
check("  ولا تحذف من pets مباشرةً ولا تمحو ملفّاتِ الدلو (يرجع الحيوانُ بصوره)",
  cloudDelete.length > 0 && !/from\("pets"\)\.delete|storage\.from|\.remove\(/.test(cloudDelete));
check("  ولا مسارَ حذفٍ مباشرٍ للحيوان بالواجهة كلّها",
  !/from\("pets"\)\s*\.delete\(/.test(repoSrc) && !/from\("pets"\)\s*\.delete\(/.test(src("src/components/records/PetTrash.tsx")));

const rec = src("src/pages/ClinicRecords.tsx");
check("سجلُّ المرضى: الصلاحيةُ deletePets وجهازُ الاستقبال المقفول بمفتاح المدير",
  /const canDeletePets = !capLockedFrom\(ov\.deviceLocked, ov\.active, can\("deletePets"\)\);/.test(rec));
check("  وزرُّ الحذف لا يُرسم إلا بها (onDelete فارغٌ لغيره)",
  (rec.match(/onDelete=\{canDeletePets \? /g) ?? []).length === 2 && !/onDelete=\{\(\) =>/.test(rec) && /\{onDelete && <button/.test(rec));
check("  و«الحيوانات المحذوفة» بها أيضاً", /\{canDeletePets && \(\s*<LoadBoundary scope="pet-trash"/.test(rec));
check("  والنافذةُ والمحذوفاتُ كسولتان بنطاقهما ptr (لا وحدةَ ثابتة)",
  /page\(\(\) => import\("@\/components\/records\/PetTrash"\)\.then\(\(m\) => \(\{ default: m\.PetDeleteDialog \}\)\), \["ptr"\]\)/.test(rec)
  && /page\(\(\) => import\("@\/components\/records\/PetTrash"\)\.then\(\(m\) => \(\{ default: m\.PetTrashEntry \}\)\), \["ptr"\]\)/.test(rec)
  && !/from "@\/components\/records\/PetTrash"/.test(rec));
// أمسكه المشيُ بالمتصفّح (scripts/live/pet-trash.mjs): المعرّفُ المخفيُّ بعد الحذف بقي مخفيّاً بعد «رجّعه» فلم يظهر الحيوان.
check("  و«رجّعه» يُظهر الحيوانَ من جديد (يُشال من المخفيّ بعد الحذف)",
  /onRestored=\{\(id: string\) => \{ setDeletedIds\(\(s\) => \{ const n = new Set\(s\); n\.delete\(id\); return n; \}\); onChanged\(\); \}\}/.test(rec)
  && /onRestored\(row\.id\);/.test(src("src/components/records/PetTrash.tsx")));
check("  ولا repo.deletePet ولا window.confirm بالصفحة", !/repo\.deletePet/.test(rec) && !/window\.confirm|[^.\w]confirm\(/.test(rec));

const ui = src("src/components/records/PetTrash.tsx");
check("النافذة: الحذفُ لا يُضغط قبل المعاينة ولا لمن ردّه الخادم",
  /const canDelete = load\.s === "ready" && load\.p\.allowed && !busy;/.test(ui) && /disabled=\{!canDelete\}/.test(ui) && /if \(!canDelete\) return;/.test(ui));
check("  وتسمّي ما يُرفع جدولاً جدولاً بالعدد", /t\(`ptr\.t\.\$\{k\}`, k\)/.test(ui) && /lines\(load\.p\.counts\)/.test(ui));
check("  وتقول الجرعاتِ غيرَ المبيعة والإقامةَ الجارية", /pending_charges > 0/.test(ui) && /active_admission/.test(ui));
check("  وقاعدةٌ قبل 0291 «تحتاج تحديث» لا حذفٌ قديم", /petTrashMissing\(e\) \? \{ s: "missing" \}/.test(ui));
check("  ولا window.confirm", !/window\.confirm|[^.\w]confirm\(/.test(ui));
check("  والاسترجاعُ (خارج وكيل repo) مقفولٌ لاشتراكٍ منتهٍ", /const readOnly = useSubscription\(\)\.access === "readonly";/.test(ui)
  && /if \(busyId \|\| readOnly\) return;/.test(ui) && /disabled=\{readOnly \|\|/.test(ui));
check("  والقائمةُ الفاشلة «أعد المحاولة» لا «ماكو»", /s: "failed"/.test(ui) && /ptr\.listFailed/.test(ui) && /ptr\.empty/.test(ui));

const staffSrc = src("src/lib/staff.ts");
const perms = /export const PERMISSIONS[\s\S]*?\n\};/.exec(staffSrc)?.[0] ?? "";
check("الصلاحية: deletePets بالقائمة وحسّاسة، ولا قالبَ دورٍ يشملها (المديرُ وحده افتراضاً)",
  /\{ id: "deletePets",/.test(staffSrc) && /"viewPayroll", "deletePets",\s*\]\);/.test(staffSrc) && perms.length > 0 && !perms.includes("deletePets"));

/* ── ج) التطابق ─────────────────────────────────────────────────────────── */
console.log("▸ التطابق: ما يعدّه الخادم له اسمٌ بالنافذة، والمرآةُ تعدّ بأسمائه");
const mig = src("supabase/migrations/0291_pets_trash.sql");
const spec = [...(/create or replace function public\._pets_trash_spec\(\)[\s\S]*?\$\$;/.exec(mig)?.[0] ?? "").matchAll(/\(\s*\d+,\s*'([a-z_]+)',/g)].map((m) => m[1]);
check("قائمةُ الخادم مقروءة (١٨ جدولاً)", spec.length === 18, spec.join(","));
const en = JSON.parse(src("src/i18n/en.json")).ptr?.t ?? {};
const ar = JSON.parse(src("src/i18n/ar.json")).ptr?.t ?? {};
const missing = spec.filter((t) => !en[t] || !ar[t]);
check("  كلُّ جدولٍ له اسمٌ بالعربية والإنكليزية", missing.length === 0, missing.join(","));
const demoTables = [...src("src/lib/demoPetTrash.ts").matchAll(/\["([a-z_]+)", "[A-Za-z]+"\]/g)].map((m) => m[1]).concat(["journey_events", "pet_notes"]);
const extra = demoTables.filter((t) => !spec.includes(t));
check("  والمرآةُ لا تعدّ جدولاً لا يعرفه الخادم", demoTables.length >= 10 && extra.length === 0, extra.join(","));
check("  والسببُ والمعاينةُ والاسترجاعُ تسأل staff_can('deletePets') من دالّةٍ وسيطة (تراجعُ 0222 يحذفها)",
  /execute 'select public\.staff_can\(\$1\)' into v using 'deletePets';/.test(mig) && (mig.match(/public\.pet_delete_allowed\(\)/g) ?? []).length >= 4);

console.log(fails ? `✗ pet-trash-test: ${passes} نجح، ${fails} فشل` : `✓ pet-trash-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
