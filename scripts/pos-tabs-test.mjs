/* ============================================================================
 * خاناتُ الطبيب بشاشة البيع (0258) — بالواجهة: القاعدةُ النقيّة، والمرآةُ التجريبية بسلوكها، والأسلاك.
 * صاحبُ الصفّ وحده وقيدُ الشكل بالقاعدة نفسها يفحصهما قسمُ 0258 بالحزمة على بوستغريس.
 *   أ) النقيّ: قارئُ الصفّ يرمي على شكلٍ مكسور (لا خانةٌ فاضية عن جوابٍ مكسور)، والمسودّةُ تُرفض بما يرفضه القيد، والعناصرُ
 *      بأصحابها وما لا صاحبَ له «missing» لا يُسقط، والإضافةُ لا تكرّر ولا تتجاوز السقف، والترتيبُ والشكلُ نسخٌ جديدة.
 *   ب) المرآةُ بالمستودع الحقيقيّ: الخانةُ لصاحبها (طبيبٌ لا يرى خانةَ الاستقبال)، والتعديلُ والحذفُ بشرط «كما فُتحت»
 *      (pos_tab_stale)، والمصوّرُ مسيَّج، و«القراءة فقط» يمنع الكتابة بخطأ repo نفسِه.
 *   ج) الأسلاك: شاشةُ البيع لا تستورد القطعةَ ولا البابَ ثابتاً، والضغطُ يمرّ من tapProduct/addService (طريقُ البيع نفسُه)،
 *      وسقوفُ الواجهة سقوفُ القيد بالهجرة، ولا window.confirm، والجدولُ الغائب يُخفي الميزةَ لا «تعذّر» دائم.
 *
 *   node scripts/pos-tabs-test.mjs
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
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const keyOf = (file, re) => {
  const k = re.exec(src(file))?.[1];
  if (!k) { console.error(`✗ pos-tabs-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
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
      'export { posTabsApi } from "./src/lib/posTabsApi.ts";',
      'export * as T from "./src/lib/posTabs.ts";',
      'export { registerConfigReadOnlyChecker } from "./src/lib/clinicSync.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "pos-tabs-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "pos-tabs-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { posTabsApi, T, registerConfigReadOnlyChecker } = mod;
if (!posTabsApi || !T || !registerConfigReadOnlyChecker) { console.error("✗ pos-tabs-test: ما انحمّلت الوحدات"); process.exit(1); }
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.code ?? e.name ?? e.message; } };

/* ── أ) النقيّ ──────────────────────────────────────────────────────────── */
console.log("▸ القاعدةُ النقيّة: القارئ، والمسودّة، والعناصر");
{
  const row = { id: "t1", name: "خانتي", tile_size: "md", show_images: true, items: [{ k: "p", id: "a", shape: "sq" }, { k: "s", id: "b" }], sort: 0, updated_at: "2026-11-04T00:00:00Z" };
  const r = T.readTab(row);
  check("صفُّ الخادم يُقرأ، والشكلُ الغائبُ مربّع (افتراضُ القيد)", r.items[1].shape === "sq" && r.items.length === 2);
  const bad = (x) => { try { T.readTab(x); return "قُبل"; } catch (e) { return e.message; } };
  check("وصفٌّ مكسور يرمي pos_tabs_shape: نوعُ عنصرٍ مجهول، حجمٌ مجهول، عناصرُ ليست مصفوفة",
    bad({ ...row, items: [{ k: "z", id: "a" }] }) === "pos_tabs_shape" && bad({ ...row, tile_size: "xl" }) === "pos_tabs_shape" && bad({ ...row, items: {} }) === "pos_tabs_shape");
  const d = { name: "  الأكثر   مبيعاً ", tile_size: "md", show_images: true, items: [], sort: 0 };
  check("الاسمُ يُنظَّف، والمسودّةُ تُرفض بما يرفضه القيد (اسمٌ فارغ، أطول من ٤٠، ١٢١ عنصراً، حجمٌ مجهول)",
    T.cleanTabName(d.name) === "الأكثر مبيعاً" && T.draftProblem(d) === null && T.draftProblem({ ...d, name: "   " }) === "name"
    && T.draftProblem({ ...d, name: "x".repeat(41) }) === "name" && T.draftProblem({ ...d, tile_size: "xl" }) === "size"
    && T.draftProblem({ ...d, items: Array.from({ length: 121 }, (_, i) => ({ k: "p", id: String(i), shape: "sq" })) }) === "items"
    && T.draftProblem({ ...d, items: Array.from({ length: 120 }, (_, i) => ({ k: "p", id: String(i), shape: "sq" })) }) === null);
  const P = [{ id: "a", name: "A" }], S = [{ id: "b", name: "B", price: 5 }];
  const res = T.resolveItems([{ k: "p", id: "a", shape: "sq" }, { k: "p", id: "gone", shape: "wide" }, { k: "s", id: "b", shape: "sq" }, { k: "s", id: "a", shape: "sq" }], P, S);
  check("العناصرُ بأصحابها بترتيبها، وما لا صاحبَ له missing لا يُسقط (ومنتجٌ لا يُطابَق خدمةً بمعرّفه)",
    res.map((x) => x.kind).join(",") === "product,missing,service,missing");
  let items = T.addItem([], "p", "a");
  items = T.addItem(items, "p", "a"); items = T.addItem(items, "s", "a", "wide");
  check("الإضافةُ لا تكرّر (والنوعُ جزءٌ من الهويّة)", items.length === 2 && items[1].shape === "wide");
  const full = Array.from({ length: 120 }, (_, i) => ({ k: "p", id: String(i), shape: "sq" }));
  check("  ولا تتجاوز السقف (١٢٠)", T.addItem(full, "p", "new").length === 120);
  const m = T.moveItem(items, 0, 1);
  check("التقديمُ والتأخيرُ نسخةٌ جديدة، وبطرف القائمة لا شيء", m[0].k === "s" && items[0].k === "p" && T.moveItem(items, 0, -1)[0].k === "p" && T.moveItem(items, 1, 1)[1].k === "s");
  check("والشكلُ عنصراً عنصراً أو للكلّ", T.setShapeAt(items, 0, "wide")[0].shape === "wide" && T.setAllShapes(items, "sq").every((x) => x.shape === "sq"));
  check("مسودّتان سواء بعد تنظيف الاسم، ويختلفان بشكل عنصر", T.sameDraft({ ...d, items }, { ...d, name: "الأكثر مبيعاً", items: [...items] })
    && !T.sameDraft({ ...d, items }, { ...d, items: T.setShapeAt(items, 0, "wide") }));
  check("ترتيبُ الجديدة بعد آخرها", T.nextSort([{ sort: 3 }, { sort: 1 }]) === 4 && T.nextSort([]) === 0);
}

/* ── ب) المرآة ──────────────────────────────────────────────────────────── */
console.log("▸ المرآةُ التجريبية: لصاحبها، وبشرط «كما فُتحت»، والسياجُ و«القراءة فقط»");
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: ["clinic"], clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: "clinic",
}));
{
  const draft = (name, items = []) => ({ name, tile_size: "md", show_images: true, items, sort: 0 });
  as("v1", "doctor");
  const a = await posTabsApi.create(draft("  خانة   الطبيب ", [{ k: "p", id: "p1", shape: "sq" }]));
  check("الطبيبُ يصنع خانته (والاسمُ منظَّف)", a.name === "خانة الطبيب" && (await posTabsApi.list()).length === 1);
  as("r1", "reception");
  check("  ولا يراها الاستقبال (لكلّ مستخدمٍ خاناتُه)", (await posTabsApi.list()).length === 0);
  await posTabsApi.create(draft("خانة الاستقبال"));
  as("v1", "doctor");
  check("  وخانةُ الاستقبال لا تظهر للطبيب", (await posTabsApi.list()).map((x) => x.name).join(",") === "خانة الطبيب");
  const b = await posTabsApi.update(a.id, { ...draft("خانة ٢"), items: [{ k: "s", id: "s1", shape: "wide" }] }, a.updated_at);
  check("التعديلُ بشرط «كما فُتحت»: يمرّ ويختم من جديد", b.name === "خانة ٢" && b.updated_at !== a.updated_at && b.items[0].shape === "wide");
  check("  وبنسخةٍ قديمة pos_tab_stale (لا دوسٌ صامت)", await errOf(() => posTabsApi.update(a.id, draft("قديمة"), a.updated_at)) === "pos_tab_stale"
    && (await posTabsApi.list())[0].name === "خانة ٢");
  check("  والحذفُ بنسخةٍ قديمة كذلك، وبالحاليّة يحذف", await errOf(() => posTabsApi.remove(a.id, a.updated_at)) === "pos_tab_stale"
    && (await errOf(() => posTabsApi.remove(b.id, b.updated_at))) === "قُبل" && (await posTabsApi.list()).length === 0);
  check("والقيدُ يرفض اسماً فارغاً (23514) كالخادم", await errOf(() => posTabsApi.create(draft("   "))) === "23514");
  as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" });
  check("والمصوّرُ مسيَّج: لا يرى ولا يصنع (42501)", (await posTabsApi.list()).length === 0 && await errOf(() => posTabsApi.create(draft("x"))) === "42501");
  as("v1", "doctor");
  registerConfigReadOnlyChecker(() => true);
  check("و«القراءة فقط» يمنع الصنعَ بخطأ repo نفسِه (ReadOnlyError)", await errOf(() => posTabsApi.create(draft("x"))) === "ReadOnlyError");
  registerConfigReadOnlyChecker(() => false);
}

/* ── ج) الأسلاك ──────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك: القطعةُ كسولة، والضغطُ بطريق البيع نفسِه، والسقوفُ سقوفُ القيد");
{
  const sb = code("src/components/retail/SaleBuilder.tsx");
  check("شاشةُ البيع لا تستورد القطعةَ ولا البابَ ثابتاً (import() وحده)",
    !/^\s*import\s+(?!type\b)[^;]*from\s*["']@\/(components\/retail\/PosCustomTabs|lib\/posTabsApi)["']/m.test(sb)
    && /import\("@\/lib\/posTabsApi"\)/.test(sb) && (sb.match(/page\(\(\) => import\("@\/components\/retail\/PosCustomTabs"\)[^;]*\["ptab"\]\)/g) ?? []).length === 3);
  check("  والضغطُ يمرّ من tapProduct وaddService (لا طريقَ بيعٍ ثانٍ)", /onProduct=\{tapProduct\}/.test(sb) && /onService=\{\(sv: Service\) => \{ addService\(sv\); \}\}/.test(sb));
  check("  والجدولُ الغائب (واجهةٌ قبل 0258) يُخفي الميزة، وغيرُه «تعذّر» بإعادة", /tabsTableMissing\(e\)\) setPosTabsOff\(true\); else setPosTabsFailed\(true\)/.test(sb));
  const ui = code("src/components/retail/PosCustomTabs.tsx");
  check("  ولا window.confirm: التأكيدُ داخل النافذة يسمّي الخانةَ وعددَ عناصرها", !/\bconfirm\(/.test(ui.replace(/setConfirmDel\(|confirmDel/g, "")) && /t\("ptab\.delConfirm", \{ name: tab\.name, n:/.test(ui));
  check("  والحفظُ بشرط «كما فُتحت»", /posTabsApi\.update\(tab\.id, d, tab\.updated_at\)/.test(ui) && /posTabsApi\.remove\(tab\.id, tab\.updated_at\)/.test(ui));
  const sql = src("supabase/migrations/0258_pos_custom_tabs.sql"), lib = src("src/lib/posTabs.ts");
  check("سقوفُ الواجهة سقوفُ القيد بالهجرة (١٢٠ عنصراً، ٤٠ حرفاً، ٦٤ للمعرّف، الأحجامُ الثلاثة)",
    /jsonb_array_length\(p\) <= 120/.test(sql) && /between 1 and 40/.test(sql) && /between 1 and 64/.test(sql) && /tile_size in \('sm', 'md', 'lg'\)/.test(sql)
    && /items: 120, name: 40/.test(lib) && /o\.id\.length > 64/.test(lib));
  check("والسياسةُ لصاحب الصفّ وحده وبلا سؤالٍ لكلّ صفّ", /using \(clinic_id = \(select auth_clinic\(\)\) and user_id = \(select auth\.uid\(\)\)\)/.test(sql));
  check("وهجرةُ 0258 بموجة الحزمة", /WAVE="[^"]*\$MIG\/0258_pos_custom_tabs\.sql/.test(src("supabase/tests/run.sh")));
}

console.log(fails ? `\n✗ pos-tabs-test: ${passes} نجح، ${fails} فشل` : `\n✓ pos-tabs-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
