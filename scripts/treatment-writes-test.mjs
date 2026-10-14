/* ============================================================================
 * كتاباتُ الطبلة تُسمَع ولا تُكرَّر ولا تكتب فوق التاريخ.
 *
 * ── الجذرُ المقيس ─────────────────────────────────────────────────────────
 *  ١) `setTreatmentGiven/Result/Missed` على صفٍّ انحذف من جهازٍ ثانٍ («احذف هذا الدواء» يحذف الكورسَ
 *     الباقي بجملة) ⇒ صفرُ صفوفٍ **بلا خطأ** و`ok()` يمرّرها: الخانةُ تخضرّ «أُعطيت» والجرعةُ المعطاةُ
 *     فعلاً لا مكانَ لها بالقاعدة ولا بسجلّ التدقيق.
 *  ٢) القلمُ على صفّ يومٍ فات: «من اليوم لنهاية الخطة» كان يبدأ من يوم الصفّ ويكتب فوق «ما انطت».
 *  ٣) «إضافة دواء» بعد جوابٍ ضاع: الضغطةُ الثانية تُدخل الدفعةَ ثانيةً (جرعتان «أُعطيت» بنفس الدقيقة).
 *  ٤) حفظُ المعالج على زيارةٍ لها طبلة: يعيد كتابةَ «أُعطيت» لكلّ جرعةٍ من قائمةٍ قديمة.
 *
 * يقود `repo.ts` السحابيَّ بعميلٍ مزيّفٍ يسجّل الطلبات، و`repoDemo.ts` و`treatmentDrop.ts` الحقيقيّين.
 *
 *   node scripts/treatment-writes-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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

/* عميلٌ مزيّف يسجّل كلَّ سلسلة (`from(t).update(..).eq(..).select(..)`) ويحلّها بما يقرّره الفحص. */
const RECORDING = `
  const calls = (globalThis.__calls = []);
  const chain = (head) => {
    const rec = { head, ops: [] };
    calls.push(rec);
    const p = new Proxy(function () {}, {
      get(_t, k) {
        if (k === "then") return (res, rej) => Promise.resolve((globalThis.__answer ?? (() => ({ data: [], error: null })))(rec)).then(res, rej);
        return (...args) => { rec.ops.push([String(k), args]); return p; };
      },
    });
    return p;
  };
  export const supabase = {
    from: (t) => chain("from:" + t), rpc: (fn, a) => chain("rpc:" + fn), schema: () => ({ from: (t) => chain("from:" + t) }),
    storage: { from: () => chain("storage") },
    auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
  };
`;
const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubsWith = (supa) => ({
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": supa,
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
});
const load = async (contents, supa = "export const supabase = null;") => {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubsWith(supa)], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(join(tmpdir(), "treatment-writes-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};
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
const err = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

await section("▸ ١) السحابيّ: حالُ الجرعة على صفٍّ غائب يُرمى، والتعديلُ والإضافةُ بشروطهما", async () => {
  const { repo } = await load(`export { repo } from "./src/lib/repo.ts";`, RECORDING);
  const last = () => globalThis.__calls.at(-1);
  globalThis.__answer = () => ({ data: [], error: null });   // صفرُ صفوفٍ بلا خطأ — صفٌّ انحذف من جهازٍ ثانٍ
  for (const [name, call] of [
    ["setTreatmentGiven", () => repo.setTreatmentGiven("gone", true, "د. علي", "2026-10-14T14:00:00Z")],
    ["setTreatmentGiven (تراجع)", () => repo.setTreatmentGiven("gone", false)],
    ["setTreatmentResult", () => repo.setTreatmentResult("gone", "38.5", "د. علي")],
    ["setTreatmentMissed", () => repo.setTreatmentMissed("gone", "past:not_given")],
  ]) {
    const e = await err(call);
    check(`${name} على صفرِ صفوف ⇒ no_row_updated (كان «تمّ»)`, e?.code === "no_row_updated", String(e?.message ?? "لا رمية"));
    check(`  ويطلب الصفَّ المعدَّل (select)`, last()?.ops.some(([k]) => k === "select"), JSON.stringify(last()?.ops.map(([k]) => k)));
  }
  globalThis.__answer = () => ({ data: [{ id: "t1" }], error: null });
  check("وصفٌّ واحدٌ معدَّل ⇒ يمرّ", (await err(() => repo.setTreatmentGiven("t1", true, "د. علي"))) === null);

  globalThis.__answer = () => ({ data: [{ id: "a" }], error: null });
  await repo.updatePendingTreatments(["a", "b"], { amount: "2 مل" }, { today: "2026-10-14" });
  const up = last();
  const has = (k, pred) => up.ops.some(([op, a]) => op === k && pred(a));
  check("updatePendingTreatments: من اليوم فصاعداً (gte day today)", has("gte", (a) => a[0] === "day" && a[1] === "2026-10-14"), JSON.stringify(up.ops));
  check("  ولا الفائتُ المحسوم («ما انطت»)", has("or", (a) => /missed_reason\.is\.null/.test(a[0]) && /past:not_given/.test(a[0])), JSON.stringify(up.ops));
  check("  وشرطا «ما انعطى» و«دواء» باقيان", has("is", (a) => a[0] === "administered_at" && a[1] === null) && has("eq", (a) => a[0] === "task_type" && a[1] === "drug"));

  globalThis.__answer = () => ({ data: null, error: null });
  await repo.addTreatments([{ id: "11111111-1111-4111-8111-111111111111", pet_id: "p", visit_id: "v", day: "2026-10-14", medication: "Meloxicam", amount: "0.1 مل", time: "" }]);
  const ins = last();
  check("addTreatments بمعرّفاتٍ من المُرسِل ⇒ upsert(onConflict id, ignoreDuplicates) لا insert", ins.ops.some(([k, a]) => k === "upsert" && a[1]?.onConflict === "id" && a[1]?.ignoreDuplicates === true) && !ins.ops.some(([k]) => k === "insert"), JSON.stringify(ins.ops.map(([k, a]) => [k, a[1]])));
  await repo.addTreatments([{ pet_id: "p", visit_id: "v", day: "2026-10-14", medication: "Meloxicam", amount: "0.1 مل", time: "" }]);
  check("  وبلا معرّفات ⇒ insert كما كان (الخطةُ والتمديدُ والورقة)", last().ops.some(([k]) => k === "insert"));
  const repoTxt = readFileSync("src/lib/repo.ts", "utf8");
  const dropTxt = readFileSync("src/lib/treatmentDrop.ts", "utf8");
  check("علامةُ «ما انطت» بالسحابيّ = treatmentDrop = backdate حرفاً",
    /const SETTLED_MISS = "past:not_given"/.test(repoTxt) && /export const SETTLED_MISS = "past:not_given"/.test(dropTxt) && /PAST_MISS_REASON = "past:not_given"/.test(readFileSync("src/lib/backdate.ts", "utf8")));
});

await section("▸ ٢) النسخةُ التجريبية مرآةُ الخادم", async () => {
  const { demoRepo } = await load(`export { demoRepo } from "./src/lib/repoDemo.ts";`);
  const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
  const T = "2026-10-14";
  const row = (id, day, extra = {}) => ({ id, pet_id: "p1", visit_id: "v1", day, time: "08:00", medication: "Amoxicillin", amount: "1 مل", task_type: "drug", administered_at: null, missed_reason: null, result: null, created_at: "", ...extra });
  mem.set(DB_KEY, JSON.stringify({ treatments: [row("m3", "2026-10-11", { missed_reason: "past:not_given" }), row("u2", "2026-10-12"), row("t0", T), row("f1", "2026-10-15")] }));
  for (const [name, call] of [
    ["setTreatmentGiven", () => demoRepo.setTreatmentGiven("gone", true, "د. علي")],
    ["setTreatmentResult", () => demoRepo.setTreatmentResult("gone", "38.5")],
    ["setTreatmentMissed", () => demoRepo.setTreatmentMissed("gone", "x")],
  ]) {
    const e = await err(call);
    check(`${name} على صفٍّ غائب ⇒ no_row_updated (كان يرجع بصمت)`, e?.code === "no_row_updated", String(e?.message ?? "لا رمية"));
  }
  const n = await demoRepo.updatePendingTreatments(["m3", "u2", "t0", "f1"], { amount: "2 مل" }, { today: T });
  const after = await demoRepo.listVisitTreatments("v1");
  const amt = (id) => after.find((x) => x.id === id)?.amount;
  check("updatePendingTreatments: اليومُ والقادمُ وحدهما (2)، و«ما انطت» والفائتُ باقيان «1 مل»", n === 2 && amt("m3") === "1 مل" && amt("u2") === "1 مل" && amt("t0") === "2 مل" && amt("f1") === "2 مل", `${n} ${["m3", "u2", "t0", "f1"].map(amt).join("|")}`);
  const ids = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"];
  const add = ids.map((id, i) => ({ id, pet_id: "p1", visit_id: "v1", day: i ? "2026-10-15" : T, medication: "Meloxicam", amount: "0.1 مل", time: "", administered_at: i ? undefined : `${T}T10:00:00Z` }));
  await demoRepo.addTreatments(add);
  await demoRepo.addTreatments(add);   // إعادةُ إرسالٍ بعد جوابٍ ضاع
  const mel = (await demoRepo.listVisitTreatments("v1")).filter((x) => x.medication === "Meloxicam");
  check("addTreatments مرّتين بنفس المعرّفات ⇒ صفّان لا أربعة (ولا «أُعطيت» ثانية)", mel.length === 2 && mel.filter((x) => x.administered_at).length === 1, String(mel.length));
});

await section("▸ ٣) معرّفاتُ المحاولة: نفسُ ما كُتب ⇒ نفسُ المعرّفات", async () => {
  const M = await load(`export * from "./src/lib/treatmentDrop.ts";`);
  let k = 0; const mk = () => `id${++k}`;
  const a = M.addAttemptIds(null, "S", 3, mk);
  check("أوّلُ محاولة: معرّفاتٌ جديدة ولا سؤال", a.ids.join(",") === "id1,id2,id3" && a.check.length === 0);
  const b = M.addAttemptIds({ sig: "S", ids: a.ids }, "S", 3, mk);
  check("إعادةُ الإرسال بنفس ما كُتب ⇒ نفسُ المعرّفات", b.ids.join(",") === "id1,id2,id3" && b.check.length === 0);
  const c = M.addAttemptIds({ sig: "S", ids: a.ids }, "S2", 2, mk);
  check("ما تغيّر بعد الفشل ⇒ معرّفاتٌ جديدة، والسابقةُ تُسأل عنها القاعدة", c.ids.join(",") === "id4,id5" && c.check.join(",") === "id1,id2,id3");
});

await section("▸ ٤) الشاشات", async () => {
  const visit = src("src/pages/VisitPage.tsx");
  const plan = bodyOf(visit, "const savePlan = async (");
  check("savePlan لا يعيد كتابةَ «أُعطيت» من قائمة الصفحة", !/setTreatmentGiven/.test(plan), plan.match(/[^\n]*setTreatmentGiven[^\n]*/)?.[0]);
  check("  ولا يقول «جُدولت» حين بقيت الطبلةُ كما هي", /vbk\.planChartKept/.test(plan));
  for (const fn of ["const giveDose = async (", "const giveQuick = async (", "const undoDose = async ("]) {
    const b = bodyOf(visit, fn);
    check(`${fn.replace(/const | = async \(/g, "")}: الكتابةُ داخل try والفشلُ يُقال`, /try \{\s*await repo\.setTreatmentGiven/.test(b) && /doseWriteFailed\(e\)/.test(b));
  }
  check("giveMany: كلُّها بـallSettled والفشلُ يُقال", /Promise\.allSettled\(list\.map/.test(bodyOf(visit, "const giveMany = async (")) && /doseWriteFailed\(/.test(bodyOf(visit, "const giveMany = async (")));
  const fail = bodyOf(visit, "const doseWriteFailed = async (");
  check("  والرسالةُ بسببها، والقائمةُ تُعاد", /describeDbError\(e, t\)/.test(fail) && /reload\(\)/.test(fail));
  const edit = bodyOf(visit, "const editDrug = async (");
  check("editDrug: النطاقُ من dropTargets (لا فائتٌ محسوم ولا يومٌ فات)، واليومُ للخادم", /dropTargets\(treatments,/.test(edit) && /updatePendingTreatments\([\s\S]*?, \{ today \}\)/.test(edit) && !/x\.day >= orig\.day/.test(edit));
  const modal = bodyOf(visit, "function EditDrugModal(");
  check("نافذةُ القلم: العددُ من dropTargets، و«هذا اليوم» على يومٍ فات مقفول", /plans\.day\.targets\.length/.test(modal) && /disabled=\{plans\.day\.pastDayBlocked\}/.test(modal) && !/const counts = useMemo/.test(modal));
  check("  و«من اليوم» يقول مداه، والحفظُ بلا جرعةٍ بالمدى مقفول", /vbk\.dropRestN/.test(modal) && /nEdit === 0/.test(modal));
  const add = bodyOf(visit, "const addDrug = async (");
  check("addDrug: المعرّفاتُ من المحاولة (addAttemptIds) وتُرسل مع الصفوف", /addAttemptIds\(addTry\.current/.test(add) && /id: ids\[i\]/.test(add));
  check("  وما تغيّر بعد الفشل يسأل القاعدةَ عن السابقة قبل الكتابة", /listVisitTreatments\(visit\.id\)/.test(add) && /vbk\.addLanded/.test(add));
  check("  وفتحُ النافذة محاولةٌ جديدة", /addTry\.current = null/.test(bodyOf(visit, "const openAddDrug = (")));
  const pet = src("src/pages/PetPassport.tsx");
  const marks = [...pet.matchAll(/const markGiven = async \(id: string, given: boolean\) => \{[\s\S]*?\n  \};/g)].map((m) => m[0]);
  check("سجلُّ الحيوان: «انعطت» داخل try والفشلُ يُقال (الموضعان)", marks.length === 2 && marks.every((b) => /try \{\s*await repo\.setTreatmentGiven/.test(b) && /describeDbError\(e, t\)/.test(b)), String(marks.length));
});

console.log(`\n${fails ? "✗" : "✓"} treatment-writes-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
