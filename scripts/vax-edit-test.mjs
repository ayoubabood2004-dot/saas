/* ============================================================================
 * قلمُ «حالة اللقاحات» (0257) و«ملف حيواناته» بدفتر الديون — بالواجهة: القاعدةُ النقيّة، والمرآةُ التجريبية بسلوكها،
 * والأسلاك. حذفُ المدير بالقاعدة نفسها (سياسةٌ مقيِّدة) يفحصه قسمُ 0257 بالحزمة على بوستغريس.
 *   أ) النقيّ: الجرعاتُ مجموعةً كما تجمعها البطاقة، وما يُرسَل من التعديل ما تغيّر وحده (حقلٌ لم يُلمس لا يدوس
 *      كتابةً أحدث)، والحالةُ تتبع الموعد، وتاريخُ الإعطاء لا بالمستقبل. وحيواناتُ المدين بمفتاحه حرفاً لا بأوّل نتيجة.
 *   ب) المرآةُ التجريبية بالمستودع الحقيقيّ: الحذفُ للمدير ومفتاحِه وحدهما (غيرُهما صفرُ صفوفٍ يُرمى)، والتعديلُ
 *      للكادر، والمصوّرُ لا هذا ولا ذاك، والكتابةُ بشرط أنها كما فُتحت.
 *   ج) الأسلاك: القلمُ للمدير وحده وليس بنسخة المالك، والبطاقةُ بلا زرٍّ داخل زرّ، والنافذتان كسولتان بنطاقيهما،
 *      ولا window.confirm.
 *
 *   node scripts/vax-edit-test.mjs
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
  if (!k) { console.error(`✗ vax-edit-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);
const ACTIVE = keyOf("src/lib/clinics.ts", /const ACTIVE_KEY = "([^"]+)"/);
const AUDIT = keyOf("src/lib/repoDemo.ts", /const DEMO_AUDIT_KEY = "([^"]+)"/);
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
      'export { vaxEditApi } from "./src/lib/vaxEditApi.ts";',
      'export * as V from "./src/lib/vaxEdit.ts";',
      'export * as K from "./src/lib/customerKey.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "vax-edit-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "vax-edit-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, vaxEditApi, V, K } = mod;
if (!repo || !vaxEditApi || !V || !K) { console.error("✗ vax-edit-test: ما انحمّلت الوحدات"); process.exit(1); }

/* ── أ) النقيّ ──────────────────────────────────────────────────────────── */
console.log("▸ القاعدةُ النقيّة: التجميع، وما يُرسَل، والتواريخ، وحيواناتُ المدين");
{
  const vx = (id, name, status, dose_number, day, extra = {}) => ({ id, pet_id: "p", name, status, dose_number,
    ...(status === "administered" ? { administered_at: day, due_date: null } : { due_date: day, administered_at: null }), ...extra });
  const groups = V.groupVaccines([
    vx("r2", "Rabies", "scheduled", 2, "2026-12-01"), vx("d1", "DHPP", "administered", 1, "2026-01-01"),
    vx("r1", "rabies ", "administered", 1, "2026-06-01"), vx("rx", "Rabies", "administered", undefined, "2026-02-01"),
  ]);
  check("الجرعاتُ تُجمع بالاسم مطويّاً كما تجمعها البطاقة («rabies » = «Rabies»)، واللقاحاتُ بالاسم",
    groups.map((g) => `${g.key}:${g.doses.map((d) => d.id).join(",")}`).join("|") === "dhpp:d1|rabies:r1,r2,rx",
    groups.map((g) => `${g.key}:${g.doses.map((d) => d.id).join(",")}`).join("|"));

  const T = "2026-11-03";
  const given = vx("g", "Rabies", "administered", 1, "2026-10-01", { lot_number: "L1", notes: "ok" });
  const due = vx("s", "Rabies", "scheduled", 2, "2026-12-01");
  const D = (v, over) => ({ ...V.draftOf(v), ...over });
  check("ما لم يُلمس لا يُرسَل (لا يدوس كتابةً أحدث)", JSON.stringify(V.dosePatch(given, V.draftOf(given), T)) === "{}" && JSON.stringify(V.dosePatch(due, V.draftOf(due), T)) === "{}");
  check("  المعطاةُ: تاريخُ إعطائها وحده حين تغيّر", JSON.stringify(V.dosePatch(given, D(given, { date: "2026-09-30" }), T)) === '{"administered_at":"2026-09-30"}');
  check("  والتشغيلةُ الممسوحة null لا \"\"، والملاحظةُ كذلك", JSON.stringify(V.dosePatch(given, D(given, { lot: "  ", notes: "" }), T)) === '{"lot_number":null,"notes":null}');
  check("  ومسافاتٌ حول نفس النصّ ليست تغييراً", JSON.stringify(V.dosePatch(given, D(given, { notes: " ok " }), T)) === "{}");
  check("  والمجدولةُ: الموعدُ ومعه حالتُه — فات ⇒ متأخرة، قادم ⇒ مجدولة (statusForDue)",
    JSON.stringify(V.dosePatch(due, D(due, { date: "2026-11-01" }), T)) === '{"due_date":"2026-11-01","status":"overdue"}'
    && JSON.stringify(V.dosePatch(due, D(due, { date: "2026-11-20" }), T)) === '{"due_date":"2026-11-20","status":"scheduled"}');
  check("  والمجدولةُ لا تُرسل تشغيلةً (حقلُ المعطاة وحدها)", JSON.stringify(V.dosePatch(due, D(due, { lot: "X" }), T)) === "{}");
  check("تاريخُ الإعطاء: اليومُ نعم، والغدُ لا، وقبل ٢٠٠٠ لا، و٣٠/٢ لا",
    V.validGiven(T, T) && !V.validGiven("2026-11-04", T) && !V.validGiven("1999-12-31", T) && !V.validGiven("2026-02-30", T) && !V.validGiven("", T));

  const rows = [{ key: "n:احمد", pets: [{ id: "x" }] }, { key: "p:7701234567", pets: [{ id: "a" }, { id: "b" }] }];
  const key = K.custKey("+964 770 123 4567", "أحمد", "964");
  check("حيواناتُ المدين بمفتاحه حرفاً: «+964 770…» = «0770…» بمفتاح الدولة", key === K.custKey("07701234567", null, "964") && K.petsOfKey(rows, key).map((p) => p.id).join(",") === "a,b",
    `${key}`);
  check("  وبلا مجموعةٍ بمفتاحه لا حيوان — لا أوّلُ نتيجةٍ من اسمٍ مشابه", K.petsOfKey(rows, "n:احمد علي").length === 0 && K.petsOfKey(rows, null).length === 0);
  check("  والسؤالُ بالهاتف إن وُجد، وإلا بالاسم", K.debtorQuery(" 0770 ", "أحمد") === "0770" && K.debtorQuery(null, " أحمد ") === "أحمد" && K.debtorQuery("", null) === "");
}

/* ── ب) المرآةُ التجريبية ────────────────────────────────────────────────── */
console.log("▸ المرآةُ التجريبية: الحذفُ للمدير، والتعديلُ للكادر، وبشرط أنها كما فُتحت");
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
const one = async (id) => (await repo.listVaccinations("pvx")).find((v) => v.id === id) ?? null;
{
  OWNER();
  const a = await repo.addVaccination({ pet_id: "pvx", name: "Rabies", status: "scheduled", due_date: "2026-12-01", dose_number: 2 });
  const b = await repo.addVaccination({ pet_id: "pvx", name: "Rabies", status: "administered", administered_at: "2026-06-01", dose_number: 1 });
  const c = await repo.addVaccination({ pet_id: "pvx", name: "DHPP", status: "scheduled", due_date: "2026-12-20", dose_number: 1 });

  VET();
  check("الطبيبُ يعدّل الموعد (الكادرُ يكتب اللقاح أصلاً)", await vaxEditApi.edit([a.id], { due_date: "2026-12-05" }, { status: "scheduled", name: "Rabies" }) === 1
    && (await one(a.id))?.due_date === "2026-12-05");
  check("  ويحذف؟ لا: no_row_updated، واللقاحُ باقٍ", await errOf(() => vaxEditApi.remove([a.id], { status: "scheduled" })) === "no_row_updated" && !!(await one(a.id)));
  RCP();
  check("  والاستقبالُ لا يحذف", await errOf(() => vaxEditApi.remove([c.id], {})) === "no_row_updated" && !!(await one(c.id)));
  PHO();
  check("  والمصوّرُ لا يعدّل ولا يحذف (سياجُه)", await errOf(() => vaxEditApi.edit([a.id], { notes: "x" }, {})) === "no_row_updated"
    && await errOf(() => vaxEditApi.remove([a.id], {})) === "no_row_updated" && !(await one(a.id))?.notes);

  OWNER();
  check("بشرط أنها كما فُتحت: جرعةٌ فُتحت مجدولةً وانعطت بعدها لا يكتبها القلمُ مجدولة",
    await errOf(() => vaxEditApi.edit([b.id], { due_date: "2027-01-01", status: "scheduled" }, { status: "scheduled", name: "Rabies" })) === "no_row_updated"
    && (await one(b.id))?.status === "administered" && !(await one(b.id))?.due_date);
  check("  ولا يحذفها حذفَ المجدولة", await errOf(() => vaxEditApi.remove([b.id], { status: "scheduled" })) === "no_row_updated" && !!(await one(b.id)));
  check("  ولا اسمٌ تغيّر من جهازٍ ثانٍ", await errOf(() => vaxEditApi.remove([c.id], { name: "Parvo" })) === "no_row_updated" && !!(await one(c.id)));
  check("المديرُ يغيّر اسمَ اللقاح بكلّ جرعاته", await vaxEditApi.edit([a.id, b.id], { name: "Rabies (Nobivac)" }, {}) === 2
    && (await one(a.id))?.name === "Rabies (Nobivac)" && (await one(b.id))?.name === "Rabies (Nobivac)");
  check("  ويحذف جرعةً بحالتها", await vaxEditApi.remove([a.id], { status: "scheduled", name: "Rabies (Nobivac)" }) === 1 && !(await one(a.id)) && !!(await one(b.id)));
  VET(); mem.set(`${UNTIL}${clinic()}`, String(Date.now() + 10 * 60 * 1000));
  check("  ومفتاحُ المدير الحيّ (PIN) يفتح الحذفَ للطبيب", await vaxEditApi.remove([c.id], {}) === 1 && !(await one(c.id)));
  mem.set(`${UNTIL}${clinic()}`, String(Date.now() - 1000));
  check("  والمنتهي لا", await errOf(() => vaxEditApi.remove([b.id], {})) === "no_row_updated" && !!(await one(b.id)));
  OWNER();
  check("  والمحذوفُ قبلاً صفرٌ يُرمى (لا «انحذف» على لا شيء)", await errOf(() => vaxEditApi.remove([a.id], {})) === "no_row_updated");
  check("  وقائمةٌ فارغة لا تُرسَل", await errOf(() => vaxEditApi.edit([], { notes: "x" }, {})) === "no_row_updated");
  const audit = JSON.parse(mem.get(AUDIT) ?? "[]").filter((e) => e.entity === "vaccinations");
  check("  والحذفُ والتعديلُ بسجلّ الحركات التجريبيّ (كمحفّز audit_all)", audit.some((e) => e.action === "DELETE" && e.entity_id === c.id) && audit.some((e) => e.action === "UPDATE"),
    audit.map((e) => e.action).join(","));
}

/* ── ج) الأسلاك ──────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك: القلمُ للمدير، والنافذتان كسولتان، ولا تأكيدَ بنافذة المتصفّح");
{
  const pp = src("src/pages/PetPassport.tsx");
  check("القلمُ للمدير وحده (ومفتاحُه) وليس لنسخة المالك", /const canEditVax = !isOwner && staffRole === "manager";/.test(pp)
    && /onEdit=\{canEditVax \?/.test(pp) && /<VaccineStatusCard vaccines=\{vaccines\} display=\{vaccineScientific\} onOpen=\{[^}]*\}[^/]*\/>/.test(pp)
    && !/display=\{vaccineScientific\}[^\n]*onEdit/.test(pp));
  const card = pp.slice(pp.indexOf("function VaccineStatusCard"), pp.indexOf("function EditPen")).replace(/\/\*[\s\S]*?\*\//g, "");
  check("  والبطاقةُ عنصرٌ بدور زرّ لا <button> (قلمٌ داخل زرٍّ HTML غيرُ صالح)، ومفتاحُها Enter/مسافة", card.includes('role="button"') && !/<button[\s>]/.test(card) && card.includes('e.key === "Enter"'));
  check("  وضغطةُ القلم لا تفتح تبويبَ التطعيمات", /function EditPen[\s\S]*?e\.stopPropagation\(\); onClick\(\);/.test(pp));
  check("  والنافذةُ كسولةٌ بنطاقها vxed (لا استيرادٌ ثابت)", /page\(\(\) => import\("@\/components\/vaccines\/VaccineEditSheet"\)[^;]*\["vxed"\]\)/.test(pp)
    && !/^import[^;]*VaccineEditSheet/m.test(pp));
  const sheet = src("src/components/vaccines/VaccineEditSheet.tsx");
  check("  ولا window.confirm: التأكيدُ داخل النافذة ويقول ماذا يُحذف", !/\bconfirm\(/.test(sheet.replace(/setConfirm\(/g, "")) && sheet.includes('t("vxed.confirmDose"') && sheet.includes('t("vxed.confirmAll"'));
  check("  والحذفُ والتعديلُ بشرط الحالة والاسم كما فُتحت", sheet.includes("vaxEditApi.remove([v.id], { status: v.status, name: v.name })") && sheet.includes("vaxEditApi.edit([v.id], patch, { status: v.status, name: v.name })")
    && sheet.includes("vaxEditApi.remove(ids, {})"));
  const api = src("src/lib/vaxEditApi.ts");
  check("  والبابُ يعدّ الصفوف (select) ويرمي على الصفر", (api.match(/counted\(await q\.select\("id"\)\)/g) ?? []).length === 2 && api.includes("if (n === 0) throw noRowError();"));
  const dp = src("src/components/retail/DebtsPanel.tsx");
  check("«ملف حيواناته» كسولٌ بنطاقه dpets من دفتر الزبون", /page\(\(\) => import\("@\/components\/retail\/DebtorPets"\)[^;]*\["dpets"\]\)/.test(dp) && !/^import[^;]*DebtorPets/m.test(dp));
  const dpets = src("src/components/retail/DebtorPets.tsx");
  check("  ويأخذ المجموعةَ بمفتاح الدفتر (petsOfKey) لا أوّلَ نتيجة، وفشلُه يُقال", dpets.includes("petsOfKey(rows, key)") && !/rows\[0\]/.test(dpets) && dpets.includes('t("dpets.failed")'));
  check("وهجرةُ 0257 بموجة الحزمة", /WAVE="[^"]*\$MIG\/0257_vaccination_delete_manager\.sql/.test(src("supabase/tests/run.sh")));
}

console.log(fails ? `\n✗ vax-edit-test: ${passes} نجح، ${fails} فشل` : `\n✓ vax-edit-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
