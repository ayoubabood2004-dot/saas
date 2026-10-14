/* ============================================================================
 * حذفُ دواءٍ من الخطة، والجرعةُ المعطاة لا تُحذف — قرارُ المالك D1/D2 (١٤/١٠).
 *
 * ── الجذرُ المقيس ─────────────────────────────────────────────────────────
 *  ١) سلّةُ سجلّ الحيوان تظهر على الجرعة المعطاة كما على المنتظرة، و`deleteTreatment`
 *     يحذف بلا سؤال — جرعةٌ انعطت تختفي من التاريخ. والنسخةُ التجريبية تحذفها كذلك.
 *  ٢) لا طريقَ لإيقاف دواءٍ من منتصف الخطة: الطبيبُ يحذف جرعةً جرعة أو يتركها «متأخّرة».
 *  ٣) تعديلُ الدواء طلبٌ لكلّ صفٍّ بلا شرطٍ ولا try: جرعةٌ انعطت من جهازٍ ثانٍ بعد فتح
 *     النافذة تُكتب فوقها، والفشلُ يُقال «تعدّلت».
 *
 * يقود `treatmentDrop.ts` و`repoDemo.ts` الحقيقيّين (لا نسخةً منهما)، ويقرأ نصَّ الشاشات.
 *
 *   node scripts/treatment-drop-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const section = async (title, fn) => {
  console.log(title);
  try { await fn(); } catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
};

/* ---- متصفّحٌ بالحدّ الأدنى للنسخة التجريبية ---- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } },
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
const load = async (contents) => {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(join(tmpdir(), "treatment-drop-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};

/** نصُّ المصدر بلا تعليقات. */
const src = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const bodyOf = (text, head) => {
  const i = text.indexOf(head);
  if (i < 0) return "";
  const m = /\)\s*(?:=>\s*)?\{/.exec(text.slice(i));
  if (!m) return "";
  let depth = 0, started = false;
  for (let j = i + m.index + m[0].length - 1; j < text.length; j++) {
    const c = text[j];
    if (c === "{") { depth++; started = true; } else if (c === "}") { depth--; if (started && depth === 0) return text.slice(i, j + 1); }
  }
  return text.slice(i);
};

/* ---- نصُّ تلميحات 0238 كما بالهجرة (`raise '<code>' … hint = '<text>'`) ---- */
const MIG = "supabase/migrations/0238_treatment_drop.sql";
const sql = existsSync(MIG) ? readFileSync(MIG, "utf8").replace(/\r\n/g, "\n") : "";
const sqlHints = new Map();
for (const m of sql.matchAll(/raise exception '(\w+)'(?:\s+using)?[^;]*?hint\s*=\s*'([^']+)'/g)) sqlHints.set(m[1], m[2]);

const TODAY = "2026-03-15";
const day = (off) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
/** مرآةُ قالب 0238 بالحزمة: سيفترياكسون بأيامٍ فاتت واليومِ والقادمة، ودواءٌ آخر وسائلٌ بنفس الاسم. */
const R = (id, off, extra = {}) => ({ id, pet_id: "p1", visit_id: "v1", day: day(off), time: extra.time ?? "08:00", medication: extra.m ?? "Ceftriaxone",
  amount: "1 مل", task_type: extra.task ?? "drug", administered_at: extra.given ? "2026-03-10T08:00:00Z" : null, missed_reason: extra.miss ?? null, result: extra.result ?? null, created_at: "2026-03-10T00:00:00Z" });
const FIX = [
  R("g2", -2, { given: true }), R("p1", -1), R("m1", -1, { time: "20:00", miss: "past:not_given" }),
  R("g0", 0, { given: true }), R("t0", 0, { time: "20:00" }),
  R("f1", 1), R("f2", 2), R("f3", 3), R("f4", 4),
  R("mel", 1, { m: "Meloxicam" }), R("flu", 1, { task: "fluid", time: "10:00" }),
  { ...R("x", 1), visit_id: "v2" },
];

await section("▸ ١) dropTargets: نفسُ شرط 0238 على قالب الحزمة", async () => {
  const M = await load(`export * from "./src/lib/treatmentDrop.ts";`);
  const p = (d, scope) => M.dropTargets(FIX, { visitId: "v1", medication: "Ceftriaxone", day: day(d), scope, today: TODAY });
  const ids = (pl) => pl.targets.map((x) => x.id).join(",");
  const rest = p(-2, "rest");
  check("«وطالع» من يومٍ فات: اليومُ مساءً والقادمة (٥)، بترتيب اليوم", ids(rest) === "t0,f1,f2,f3,f4", ids(rest));
  check("  والباقي: معطاتان وفائتتان", rest.keptGiven === 2 && rest.keptPast === 2, `${rest.keptGiven}/${rest.keptPast}`);
  check("  ومداه من اليوم لآخر يوم", rest.from === TODAY && rest.to === day(4), `${rest.from}→${rest.to}`);
  check("«بس» على يومٍ فات مقفول ولا هدف", p(-1, "day").pastDayBlocked && p(-1, "day").targets.length === 0);
  const today = p(0, "day");
  check("«بس» اليوم: المنتظرةُ وحدها، والمعطاة باقية", ids(today) === "t0" && today.keptGiven === 1 && today.keptPast === 0, `${ids(today)} ${today.keptGiven}`);
  check("الدواءُ الآخر والسائلُ بنفس الاسم والزيارةُ الأخرى خارج النطاق", !ids(p(1, "rest")).match(/mel|flu|x/), ids(p(1, "rest")));
  const withResult = M.dropTargets([...FIX, R("r3", 3, { time: "14:00", result: "تمام" })], { visitId: "v1", medication: "Ceftriaxone", day: day(3), scope: "rest", today: TODAY });
  check("ما له نتيجةٌ يبقى", ids(withResult) === "f3,f4", ids(withResult));
  check("الاسمُ حرفياً بالطرفين (ceftriaxone ليس Ceftriaxone)", M.dropTargets(FIX, { visitId: "v1", medication: "ceftriaxone", day: TODAY, scope: "rest", today: TODAY }).targets.length === 0);
  const missedToday = M.dropTargets([R("mt", 0, { miss: "past:not_given" })], { visitId: "v1", medication: "Ceftriaxone", day: TODAY, scope: "day", today: TODAY });
  check("الفائتُ المحسوم («ما انطت») لا ينحذف ولو بيومه", missedToday.targets.length === 0);
});

await section("▸ ٢) التلميحات = نصُّ 0238 حرفاً", async () => {
  const M = await load(`export * from "./src/lib/treatmentDrop.ts";`);
  check("الهجرةُ تحمل سبعةَ رموزٍ بتلميحاتها", sqlHints.size === 7, [...sqlHints.keys()].join(","));
  const bad = [...sqlHints].filter(([k, v]) => M.DROP_HINTS[k] !== v).map(([k]) => k);
  check("كلُّ تلميحٍ بالمرآة = نصّ الخادم", bad.length === 0, bad.join(","));
  const extra = Object.keys(M.DROP_HINTS).filter((k) => !sqlHints.has(k));
  check("ولا تلميحَ بالمرآة لا يقوله الخادم", extra.length === 0, extra.join(","));
  const e = new M.TreatmentDropError("visit_gone");
  check("visit_gone ⇒ P0002 والباقي P0001 (كالخادم)", e.code === "P0002" && new M.TreatmentDropError("drop_nothing").code === "P0001" && e.message === "visit_gone");
});

await section("▸ ٣) النسخةُ التجريبية مرآةُ الخادم", async () => {
  const { demoRepo } = await load(`export { demoRepo } from "./src/lib/repoDemo.ts";`);
  const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
  const localToday = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
  const shift = (iso, off) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + off); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const rows = FIX.map((r) => ({ ...r, day: shift(localToday, Math.round((Date.parse(r.day) - Date.parse(TODAY)) / 86400000)) }));
  const seedDb = (visitStatus = "open") => mem.set(DB_KEY, JSON.stringify({
    treatments: rows.map((r) => ({ ...r })),
    clinicVisits: [{ id: "v1", pet_id: "p1", status: visitStatus, opened_at: `${localToday}T08:00:00Z` }, { id: "v2", pet_id: "p1", status: "open", opened_at: `${localToday}T08:00:00Z` }],
  }));
  const err = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const left = async () => (await demoRepo.listVisitTreatments("v1")).map((x) => x.id).sort().join(",");

  seedDb();
  const eg = await err(() => demoRepo.deleteTreatment("g2"));
  check("حذفُ جرعةٍ معطاة يُرفض بتلميح المحفّز (كان يحذفها)", eg?.message === "dose_given_keep" && eg?.code === "P0001" && eg?.hint === sqlHints.get("dose_given_keep"), String(eg?.message));
  check("  والجرعةُ باقية", (await left()).includes("g2"));
  check("حذفُ منتظرةٍ يمرّ", (await err(() => demoRepo.deleteTreatment("f4"))) === null && !(await left()).includes("f4"));
  const eGone = await err(() => demoRepo.deleteTreatment("nope"));
  check("وصفٌّ غائب يُقال (no_row_updated) لا «تمّ»", eGone?.code === "no_row_updated", String(eGone?.message));

  seedDb();
  const ePast = await err(() => demoRepo.dropTreatmentDrug({ visitId: "v1", medication: "Ceftriaxone", day: shift(localToday, -2), scope: "day", ids: ["g2"] }));
  check("«بس» على يومٍ فات ⇒ drop_past_day بتلميحه", ePast?.message === "drop_past_day" && ePast?.hint === sqlHints.get("drop_past_day"), String(ePast?.message));
  const all = rows.filter((r) => r.visit_id === "v1" && r.medication === "Ceftriaxone" && r.task_type === "drug").map((r) => r.id);
  const res = await demoRepo.dropTreatmentDrug({ visitId: "v1", medication: "Ceftriaxone", day: shift(localToday, -2), scope: "rest", ids: all });
  check("«وطالع» بكلّ المعرّفات ⇒ ٥ تنحذف، ٢ معطاة و٢ فائتة تبقى (كالحزمة ok:5:2:2)", res.deleted === 5 && res.kept_given === 2 && res.kept_past === 2, JSON.stringify(res));
  check("  والباقي: المعطاة والفائتة والدواءُ الآخر والسائل", (await left()) === "flu,g0,g2,m1,mel,p1", await left());
  const again = await err(() => demoRepo.dropTreatmentDrug({ visitId: "v1", medication: "Ceftriaxone", day: localToday, scope: "rest", ids: all }));
  check("إعادتُها ⇒ drop_nothing بتلميحه", again?.message === "drop_nothing" && again?.hint === sqlHints.get("drop_nothing"));
  seedDb();
  const part = await demoRepo.dropTreatmentDrug({ visitId: "v1", medication: "Ceftriaxone", day: localToday, scope: "rest", ids: ["f2", "g0", "mel", "x"] });
  check("يُحذف ما يقع بالشرط ومعرّفُه مُرسَل وحده (المعطى والدواءُ الآخر والزيارةُ الأخرى تُتجاهل)", part.deleted === 1 && !(await left()).includes("f2") && (await left()).includes("g0"), JSON.stringify(part));
  seedDb("ended");
  const eEnd = await err(() => demoRepo.dropTreatmentDrug({ visitId: "v1", medication: "Ceftriaxone", day: localToday, scope: "rest", ids: ["t0"] }));
  check("زيارةٌ مسكّرة ⇒ visit_ended", eEnd?.message === "visit_ended" && eEnd?.hint === sqlHints.get("visit_ended"));
  const eV = await err(() => demoRepo.dropTreatmentDrug({ visitId: "zz", medication: "Ceftriaxone", day: localToday, scope: "rest", ids: ["t0"] }));
  check("زيارةٌ غائبة ⇒ visit_gone (P0002)", eV?.message === "visit_gone" && eV?.code === "P0002");

  seedDb();
  const n = await demoRepo.updatePendingTreatments(["t0", "g0", "flu", "f1"], { amount: "2 مل" });
  const after = await demoRepo.listVisitTreatments("v1");
  check("updatePendingTreatments: المنتظرُ من الأدوية وحده، ويرجع كم تعدّل", n === 2 && after.find((x) => x.id === "g0").amount === "1 مل" && after.find((x) => x.id === "flu").amount === "1 مل" && after.find((x) => x.id === "f1").amount === "2 مل", String(n));
});

await section("▸ ٤) السحابيّ: الحذفُ يُسمَع، والتعديلُ بشرطه بالخادم، والحذفُ بالدالّة", async () => {
  const repo = src("src/lib/repo.ts");
  const del = bodyOf(repo, "async deleteTreatment(");
  check("deleteTreatment يطلب الصفوفَ ويرمي على صفرها (updatedRows + select)", /updatedRows\(/.test(del) && /\.select\("id"\)/.test(del), del.slice(0, 160));
  const upd = bodyOf(repo, "async updatePendingTreatments(");
  check("updatePendingTreatments: شرطُ «ما انعطى» و«دواء» بالطلب نفسه، ويرمي", /\.is\("administered_at", null\)/.test(upd) && /\.eq\("task_type", "drug"\)/.test(upd) && /listOrThrow</.test(upd), upd.slice(0, 200));
  check("dropTreatmentDrug ينادي drop_treatment_drug بـneed", /rpc\("drop_treatment_drug"/.test(bodyOf(repo, "async dropTreatmentDrug(")) && /need</.test(bodyOf(repo, "async dropTreatmentDrug(")));
  check("repo.ts لا يستورد treatmentDrop (وزنُ الإقلاع)", !/from "\.\/treatmentDrop"|@\/lib\/treatmentDrop/.test(readFileSync("src/lib/repo.ts", "utf8")));
  const demo = readFileSync("src/lib/repoDemo.ts", "utf8");
  check("سجلُّ الحركات التجريبيّ يعرف الكاتبَين الجديدين", /dropTreatmentDrug: \{ entity: "treatment_entries", action: "DELETE" \}/.test(demo) && /updatePendingTreatments: \{ entity: "treatment_entries", action: "UPDATE" \}/.test(demo));
});

await section("▸ ٥) الشاشات", async () => {
  const visit = src("src/pages/VisitPage.tsx");
  const edit = bodyOf(visit, "const editDrug = async (");
  check("editDrug يعدّل بـupdatePendingTreatments (لا updateTreatment لكلّ صفّ)", /repo\.updatePendingTreatments\(/.test(edit) && !/repo\.updateTreatment\(/.test(edit));
  check("  ويقول «تعدّلت n من m» حين لا يتعدّل الكلّ، والفشلُ بسببه", /vbk\.editPartial/.test(edit) && /try \{/.test(edit) && /describeDbError\(e, t\)/.test(edit));
  const add = bodyOf(visit, "const addDrug = async (");
  check("addDrug: الكتابةُ داخل try والفشلُ يُقال", /try \{\s*await repo\.addTreatments\(rows\)/.test(add) && /describeDbError\(e, t\)/.test(add));
  const modal = bodyOf(visit, "function EditDrugModal(");
  check("نافذةُ التعديل تحمل «احذف هذا الدواء» بوجهٍ ثانٍ", /data-dropdrug/.test(modal) && /mode === "drop"/.test(modal));
  check("  بمديين بلا اختيارٍ مسبق، وقائمةٍ بأسمائها، وما يبقى", /data-drop-scope=\{sc\}/.test(modal) && /useState<DropScope \| null>\(null\)/.test(modal) && /data-drop-list/.test(modal) && /vbk\.dropKeptGiven/.test(modal) && /vbk\.dropKeptPast/.test(modal));
  check("  والعددُ من dropTargets (شرطُ الخادم)، و«بس» على يومٍ فات مقفول", /dropTargets\(treatments/.test(modal) && /pastDayBlocked/.test(modal) && /vbk\.dropPastDay/.test(modal));
  check("  والزرُّ بصيغة العدد، ورجوعٌ للتعديل", /vbk\.dropGo\$\{dayForm\(nGo\)\}/.test(modal) && /data-drop-back/.test(modal));
  check("لا window.confirm بنافذة التعديل ولا بحذف الدواء", !/window\.confirm|\bconfirm\(/.test(modal) && !/window\.confirm/.test(bodyOf(visit, "const dropDrug = async (")));
  const drop = bodyOf(visit, "const dropDrug = async (");
  check("dropDrug: الدالّةُ، و«انحذفت n من m»، والفشلُ بسببه والنافذةُ تبقى", /repo\.dropTreatmentDrug\(/.test(drop) && /vbk\.dropDone/.test(drop) && /describeDbError\(e, t\)/.test(drop));

  const pet = src("src/pages/PetPassport.tsx");
  const doseRow = bodyOf(pet, "function TreatmentDoseRow(");
  check("سجلُّ الحيوان: لا سلّةَ على الجرعة المعطاة (و«تراجع» باقٍ)", /\{!given && \(\s*<button[\s\S]{0,300}?onRemove\(tx\.id\)/.test(doseRow) && /treatment\.undo/.test(doseRow), doseRow.match(/onRemove[^\n]*/)?.[0]);
  const remove = bodyOf(pet, "const remove = async (");
  const removeTx = bodyOf(pet, "const removeTx = async (");
  check("remove وremoveTx داخل try، والرفضُ يُقال بتلميح الخادم", /try \{\s*await repo\.deleteTreatment/.test(remove) && /describeDbError\(e, t\)/.test(remove)
    && /try \{\s*await repo\.deleteTreatment/.test(removeTx) && /describeDbError\(e, t\)/.test(removeTx));
});

console.log(`\n${fails ? "✗" : "✓"} treatment-drop-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
