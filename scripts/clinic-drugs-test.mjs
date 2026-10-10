/* ============================================================================
 * «أدويتي» والمنتقي الموحَّد — القلبُ (`src/lib/medIndex.ts`) بسلوكه.
 *
 * ── الشكوى وما تحتها ─────────────────────────────────────────────────────
 * منتقي الأدوية كان يقصّ قائمتَه على ١٢٠ بلا كلمة والكتالوجُ وحده ١٢٣: ثلاثةُ أدويةٍ
 * لا تظهر بباب «الكل» بكلّ عيادة (٦٩ بأكبرها) والشارةُ تقول العددَ كاملاً. وأسماءُ
 * الأصناف إنكليزيةٌ بالعربية، و«٢٥٠» لا تجد «Amoxicillin 250mg» (البحثُ بلا أرقام
 * شرقية)، و«أدويتي» آخرُ عشرةٍ بالجهاز. «قائمةٌ ناقصة أخطرُ من خطأ ظاهر» — فهنا:
 *  ١) لا شيءَ مخفيّ — كلُّ مفتاحٍ مرّةً واحدة والأعدادُ تجمع الكلّ.
 *  ٢) العائلاتُ بترتيبٍ ثابت و«أخرى» آخرُها، بالقاموسين، ومطابقةٌ لقيد 0229 ولطيّ 0230.
 *  ٣) البحثُ بـsearchable على الطرفين (أرقامٌ شرقية، همزة، اسمٌ تجاريّ).
 *  ٤) التوائمُ صفٌّ واحد، والمخزنُ بنفس الاسم شارةٌ لا بلاطةٌ ثانية.
 *  ٥) داخل العائلة: «أدويتي» أوّلاً بموضعها ثم ترتيبُ اليوم.
 *  ٦) applyOps: الموضعُ والرفضُ — وتلميحاتُه حرفاً كتلميحات 0229.
 *  ٧) planDrop: إفلاتٌ واحد = عمليةٌ واحدة، ولا `put` ثانٍ لما بـ«أدويتي».
 *  ٨) Escape أثناء السحب يمرّ (يلغيه dnd-kit) ثم البحثُ ثم الورقة.
 *  ٩) القراءاتُ مسموحةٌ بالاشتراك المنتهي والكتابةُ لا.
 * ١٠) وضعُ «الموثَّق جرعتُه»: كلُّ الدليل (٥٨) يُوصَل إليه ولا شيءَ بلا دليل.
 * ١١) familyType الإنكليزيّ كما هو — ملاحظاتُ نموذج الدواء لا تتغيّر.
 *
 *   node scripts/clinic-drugs-test.mjs
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

/* ---- متصفّحٌ بالحدّ الأدنى ------------------------------------------------ */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const load = async (contents, extraStubs = {}) => {
  const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
  const map = {
    i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
    "./supabase": "export const supabase = null;",
    "./globalToast": "export const emitGlobalToast = () => {};",
    ...extraStubs,
  };
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
        const names = Object.keys(map).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
        b.onResolve({ filter: new RegExp(`^(${names})$`) }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "cd-test-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  return import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};

const M = await load(`export * from "./src/lib/medIndex.ts"; export { MED_CATALOG } from "./src/lib/meds.ts"; export { FORMULARY } from "./src/lib/vetFormulary.ts"; export { searchable } from "./src/lib/utils.ts";`);
const { MED_CATALOG, FORMULARY } = M;

const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const en = JSON.parse(readFileSync("src/i18n/en.json", "utf8"));
const sql229 = readFileSync("supabase/migrations/0229_clinic_drugs.sql", "utf8");
const sql230 = readFileSync("supabase/migrations/0230_clinic_drugs_fold.sql", "utf8");

const NOW = "2026-10-10T00:00:00.000Z";
let seq = 0;
const row = (name, o = {}) => ({ id: `r${String(++seq).padStart(4, "0")}`, name, family: "other", in_mine: false, pos: null, archived_at: null, created_at: NOW, updated_at: NOW, ...o });
const catalogCount = MED_CATALOG.filter((g) => g.type !== "Vaccines").reduce((n, g) => n + g.items.length, 0);

/* ── ١) لا شيءَ مخفيّ ─────────────────────────────────────────────────────── */
console.log("▸ ١) لا شيءَ مخفيّ — ١٢٣ كتالوج + ٦٦ مخزن + ١١ للعيادة، بلا سقف");
{
  const stock = Array.from({ length: 66 }, (_, i) => ({ id: `p${i}`, name: `منتج دواء ${i + 1}`, stock: i + 1 }));
  const rows = Array.from({ length: 11 }, (_, i) => row(`دواء العيادة ${i + 1}`, { family: i % 2 ? "gi" : "other" }));
  const ix = M.buildMedIndex({ catalog: MED_CATALOG, rows, stock, species: "dog" });
  const keys = [...ix.byFamily.values()].flat().concat(ix.stockLens).map((x) => x.key);
  check(`الكتالوجُ بلا لقاحات ${catalogCount} اسماً`, catalogCount === 123, String(catalogCount));
  check("كلُّ مفتاحٍ مرّةً واحدة عبر العائلات وعدسة المخزن", keys.length === new Set(keys).size && keys.length === ix.all.length, `${keys.length}/${new Set(keys).size}/${ix.all.length}`);
  check("المجموعُ ٢٠٠ — لا قصَّ عند ١٢٠ ولا عند غيره", ix.all.length === 200, String(ix.all.length));
  check("أعدادُ العائلات + عدسةُ المخزن = الكلّ", ix.families.reduce((n, f) => n + f.count, 0) + ix.stockLens.length === ix.all.length);
  check("بحثٌ فارغ يرجع الكلّ", ix.search("").length === ix.all.length && ix.search("   ").length === ix.all.length);
  check("وعدسةُ المخزن تحمل الستّةَ والستّين كلَّها", ix.stockLens.length === 66, String(ix.stockLens.length));
}

/* ── ٢) العائلات ───────────────────────────────────────────────────────────── */
console.log("▸ ٢) العائلات: ترتيبٌ ثابت، «أخرى» آخراً، بالقاموسين، ومطابقةٌ للقاعدة");
{
  const ORDER = ["antibiotics", "analgesics", "anesthetics", "antiparasitics", "antifungals", "steroids", "gi", "cardiac", "endocrine", "derm", "fluids", "emergency", "vitamins", "other"];
  check("الترتيبُ كما بالمواصفة و«أخرى» آخرُه", JSON.stringify([...M.FAMILIES]) === JSON.stringify(ORDER));
  const rows = Array.from({ length: 66 }, (_, i) => row(`مخصّص ${i}`));
  const ix = M.buildMedIndex({ catalog: MED_CATALOG, rows });
  const fams = ix.families.map((f) => f.key);
  check("«أخرى» آخراً حتى وهي الأكبر (٦٦)", fams[fams.length - 1] === "other" && ix.families.at(-1).count === 66 && ix.families.every((f, i, a) => i === 0 || ORDER.indexOf(a[i - 1].key) < ORDER.indexOf(f.key)));
  check("لا عائلةَ فارغة على الرفّ", ix.families.every((f) => f.count > 0));
  const missing = ORDER.filter((k) => !ar.mymeds?.fam?.[k] || !en.mymeds?.fam?.[k]);
  check("mymeds.fam.* بالعربية والإنكليزية لكلّ عائلة", missing.length === 0, missing.join(","));
  check("«حساسية وجلدية» ليست «أخرى» (كان مفتاحُها يسقط لـtypeOther)", ar.mymeds?.fam?.derm && ar.mymeds.fam.derm !== ar.mymeds.fam.other);
  const checkList = /family\s+in\s*\(([^)]*)\)/.exec(sql229)?.[1].split(",").map((s) => s.trim().replace(/'/g, "")) ?? [];
  check("قائمةُ العائلات = قيدُ CHECK بـ0229 حرفاً", JSON.stringify(checkList) === JSON.stringify(ORDER), checkList.join(","));
  const types = MED_CATALOG.filter((g) => g.type !== "Vaccines").map((g) => g.type);
  const unmapped = types.filter((tp) => M.familyOfCatalogType(tp) === "other");
  check("كلُّ صنفٍ بالكتالوج (بلا لقاحات) له عائلةٌ غيرُ «أخرى»", unmapped.length === 0, unmapped.join(","));
  const pairs = [...sql230.matchAll(/when\s+'([^']+)'\s+then\s+'([a-z]+)'/g)].map((m) => [m[1], m[2]]);
  const off = pairs.filter(([tp, fam]) => M.familyOfCatalogType(tp) !== fam);
  check(`طيُّ 0230 (${pairs.length} صنفاً) = familyOfCatalogType بالواجهة`, pairs.length >= 14 && off.length === 0, off.map((p) => p.join("→")).join(","));
  check("  والمجهولُ «أخرى» بالطرفين", M.familyOfCatalogType("Something New") === "other" && /else 'other'/.test(sql230));
}

/* ── ٣) البحث ──────────────────────────────────────────────────────────────── */
console.log("▸ ٣) البحثُ بـsearchable على الطرفين");
{
  const ix = M.buildMedIndex({ catalog: MED_CATALOG, rows: [row("سيرينيا ١٠")] });
  const names = (q) => ix.search(q).map((x) => x.name);
  check("«٢٥٠» تجد Amoxicillin 250mg (أرقامٌ شرقية)", names("٢٥٠").includes("Amoxicillin 250mg"), names("٢٥٠").join(","));
  check("«اموكسي» تجدها (عربيّ الدليل بلا همزة)", names("اموكسي").includes("Amoxicillin 250mg"), names("اموكسي").slice(0, 5).join(","));
  check("«Cerenia» تجد Maropitant (الاسمُ التجاريّ)", names("Cerenia").some((n) => /Maropitant/.test(n)), names("Cerenia").join(","));
  check("«سيرينيا 10» تجد «سيرينيا ١٠» المخصّص", names("سيرينيا 10").includes("سيرينيا ١٠"));
}

/* ── ٤) التوائم ────────────────────────────────────────────────────────────── */
console.log("▸ ٤) التوائمُ صفٌّ واحد، والمخزنُ بنفس الاسم شارة");
{
  const ix = M.buildMedIndex({
    catalog: MED_CATALOG,
    rows: [row("أموكسيسيلين", { in_mine: true, pos: 1024 })],
    stock: [{ id: "s1", name: "اموكسيسيلين ", stock: 4 }, { id: "s2", name: "Amoxicillin 250mg", stock: 9 }, { id: "s3", name: "amoxicillin  250 mg", stock: 1 }],
  });
  const amoxAr = ix.all.filter((x) => x.key === M.searchable("أموكسيسيلين"));
  check("همزةٌ ومسافةٌ ⇒ بلاطةٌ واحدة تحمل المخزن", amoxAr.length === 1 && amoxAr[0].stock === 4 && amoxAr[0].base === "custom");
  const cat = ix.byKey.get(M.searchable("Amoxicillin 250mg"));
  check("منتجٌ باسم الكتالوج ⇒ شارةٌ على بلاطة الكتالوج لا بلاطةٌ ثانية", cat?.base === "catalog" && cat.stock === 10 && cat.products.length === 2 && !ix.stockLens.some((x) => x.key === cat.key));
  check("  ومنتجان بنفس المفتاح ⇒ لا productId (الكاشيرُ يختار — جوابُ المالك ٢)", M.pickedFrom(cat).productId === undefined);
  check("  ومنتجٌ واحد ⇒ productId", M.pickedFrom(amoxAr[0]).productId === "s1");
}

/* ── ٥) الترتيبُ داخل العائلة ──────────────────────────────────────────────── */
console.log("▸ ٥) داخل العائلة: «أدويتي» أوّلاً بموضعها، ثم ترتيبُ اليوم");
{
  const ix = M.buildMedIndex({
    catalog: MED_CATALOG, species: "cat",
    rows: [row("Ceftriaxone", { in_mine: true, pos: 2048 }), row("Metronidazole", { in_mine: true, pos: 1024 }), row("Carprofen 75mg", { in_mine: true, pos: 512 })],
    stock: [{ id: "s1", name: "Cephalexin", stock: 3 }],
  });
  const ab = ix.byFamily.get("antibiotics").map((x) => x.name);
  check("المضادّات: Metronidazole ثم Ceftriaxone (بالموضع) ثم المتوفّر", ab[0] === "Metronidazole" && ab[1] === "Ceftriaxone" && ab[2] === "Cephalexin", ab.slice(0, 4).join(","));
  const an = ix.byFamily.get("analgesics");
  const firstBanned = an.findIndex((x) => x.banned && !x.inMine);
  check("المسكّنات للقطّ: «أدويتي» أوّلاً ولو ممنوعاً، والممنوعُ الآخرُ آخراً", an[0].name === "Carprofen 75mg" && firstBanned > 0 && an.slice(firstBanned).every((x) => x.banned));
  check("«أدويتي» بترتيبها عبر العائلات", ix.mine.map((x) => x.name).join(",") === "Carprofen 75mg,Metronidazole,Ceftriaxone");
}

/* ── ٦) applyOps ───────────────────────────────────────────────────────────── */
console.log("▸ ٦) applyOps — الموضعُ والرفض، كالخادم");
{
  const code = (fn) => { try { fn(); return "ok"; } catch (e) { return M.drugErrorCode(e); } };
  const P = (id, name, mine, after) => ({ op: "put", id, name, family: "other", mine, ...(after !== undefined ? { after } : {}) });
  let r = M.applyOps([], [P("a", "A", true), P("b", "B", true), P("c", "C", true, null), P("d", "D", true, "a")]);
  const order = (rows) => M.mineOrder(rows).map((x) => `${x.id}:${x.pos}`).join(",");
  check("آخرُ القائمة ١٠٢٤ ×، أوّلُها − ١٠٢٤، وبعد صفٍّ منتصفُ الفجوة", order(r) === "c:0,a:1024,d:1536,b:2048", order(r));
  const r2 = M.applyOps(r, [P("x", " a ", true)]);
  check("إضافةٌ ثانيةٌ لنفس المفتاح لا شيء", r2.length === r.length && order(r2) === order(r));
  r = M.applyOps(r, [{ op: "move", id: "c", after: "b" }]);
  check("نقلٌ لآخرها", order(r) === "a:1024,d:1536,b:2048,c:3072", order(r));
  r = M.applyOps(r, [P("e", "E", false)]);
  check("نقلٌ بعد صفٍّ خارجها ⇒ drug_row_gone", code(() => M.applyOps(r, [{ op: "move", id: "a", after: "e" }])) === "drug_row_gone");
  const u = M.applyOps(r, [{ op: "unmine", id: "d" }, { op: "unmine", id: "d" }]);
  check("إخراجٌ مرّتين: الثاني لا شيء", u.find((x) => x.id === "d").in_mine === false && u.find((x) => x.id === "d").pos === null);
  const a = M.applyOps(r, [{ op: "archive", id: "b" }]);
  check("الأرشفةُ تُخرج من «أدويتي»", a.find((x) => x.id === "b").archived_at && !a.find((x) => x.id === "b").in_mine);
  const tw = M.applyOps(a, [P("b2", "b", false)]);
  check("استرجاعُ التوأم ⇒ drug_exists ويسمّيه", (() => { try { M.applyOps(tw, [{ op: "restore", id: "b" }]); return false; } catch (e) { return M.drugErrorCode(e) === "drug_exists" && e.hint.includes("«b»") && e.code === "P0001"; } })());
  const full = Array.from({ length: 400 }, (_, i) => row(`F${i}`));
  check("الدواءُ ٤٠١ ⇒ clinic_drugs_full", code(() => M.applyOps(full, [P("z", "Z", false)])) === "clinic_drugs_full");
  check("  والمؤرشفُ لا يُعدّ (أرشفةٌ تُفرغ مكاناً)", code(() => M.applyOps(full.map((x, i) => (i === 0 ? { ...x, archived_at: NOW } : x)), [P("z", "Z", false)])) === "ok");
  let g = M.applyOps([], [P("g0", "G0", true), P("gz", "GZ", true)]);
  g = M.applyOps(g, Array.from({ length: 40 }, (_, i) => P(`n${i}`, `N${i}`, true, "g0")));
  const pos = M.mineOrder(g).map((x) => x.pos);
  check("أربعون إدراجاً بفجوةٍ واحدة: ترقيمٌ ولا موضعَ مكرّر", new Set(pos).size === pos.length && g.find((x) => x.id === "n0").pos !== 1536 && M.mineOrder(g)[0].id === "g0" && M.mineOrder(g).at(-1).id === "gz");
  check("اسمٌ فارغ ⇒ clinic_drugs_bad_name", code(() => M.applyOps([], [P("q", "  ", true)])) === "clinic_drugs_bad_name");
  check("رفضٌ بمنتصف الدفعة لا يترك نصفَها", (() => { const before = JSON.stringify(r); try { M.applyOps(r, [P("w", "W", true), { op: "move", id: "a", after: "e" }]); } catch { /* المتوقَّع */ } return JSON.stringify(r) === before; })());
  // التلميحات = نصُّ 0229 حرفاً (والدالّةُ تُكرّر بعضها بأكثر من موضع — كلُّها نفسُ النصّ).
  const sqlHints = new Map();
  let bad = [];
  for (const m of sql229.matchAll(/raise exception '([a-z_]+)' using hint = (?:format\()?'([^']+)'/g)) {
    if (sqlHints.has(m[1]) && sqlHints.get(m[1]) !== m[2]) bad.push(`${m[1]} مختلفٌ بموضعين`);
    sqlHints.set(m[1], m[2]);
  }
  for (const [k, v] of sqlHints) if (M.DRUG_HINTS[k] !== v) bad.push(k);
  const missingHint = Object.keys(M.DRUG_HINTS).filter((k) => !sqlHints.has(k));
  check(`تلميحاتُ المرآة = تلميحاتُ 0229 حرفاً (${sqlHints.size} رمزاً)`, bad.length === 0 && missingHint.length === 0 && sqlHints.size === 9, [...bad, ...missingHint].join(","));
}

/* ── ٧) planDrop ───────────────────────────────────────────────────────────── */
console.log("▸ ٧) planDrop — إفلاتٌ واحد = عمليةٌ واحدة");
{
  const mine = ["a", "b", "c"];
  const out = { id: "x", name: "X", family: "gi", inMine: false };
  const inn = (id) => ({ id, name: id, family: "other", inMine: true });
  check("دواءٌ خارجها على الرفّ ⇒ put بآخرها (بلا after)", JSON.stringify(M.planDrop(mine, out, null)) === JSON.stringify({ op: "put", id: "x", name: "X", family: "gi", mine: true }));
  check("  وبين صفّين ⇒ put بعد الأوّل", M.planDrop(mine, out, 2)?.after === "b" && M.planDrop(mine, out, 2)?.op === "put");
  check("  وبأوّلها ⇒ after: null", M.planDrop(mine, out, 0)?.after === null);
  check("دواءٌ فيها ⇒ move لا put (أبداً)", [0, 1, 2, 3, null].every((t) => { const o = M.planDrop(mine, inn("b"), t); return o === null || o.op === "move"; }));
  check("  ونفسُ المكان ⇒ لا شيء", M.planDrop(mine, inn("b"), 1) === null && M.planDrop(mine, inn("b"), 2) === null && M.planDrop(mine, inn("c"), null) === null);
  check("  وللأوّل ⇒ after: null، وبعد c ⇒ after: c", M.planDrop(mine, inn("c"), 0)?.after === null && M.planDrop(mine, inn("a"), 3)?.after === "c");
}

/* ── ٨) Escape ─────────────────────────────────────────────────────────────── */
console.log("▸ ٨) pickerKeyAction");
check("أثناء السحب يمرّ (يلغيه dnd-kit بمستمع المستند)", M.pickerKeyAction({ key: "Escape", dragging: true, searchOn: true }) === "pass");
check("ثم البحثُ أوّلاً، ثم الورقة", M.pickerKeyAction({ key: "Escape", dragging: false, searchOn: true }) === "closeSearch" && M.pickerKeyAction({ key: "Escape", dragging: false, searchOn: false }) === "close");
check("ومفتاحٌ غيرُه يمرّ", M.pickerKeyAction({ key: "Enter", dragging: false, searchOn: false }) === "pass");

/* ── ٩) الاشتراكُ المنتهي ─────────────────────────────────────────────────── */
console.log("▸ ٩) الاشتراكُ المنتهي: القراءاتُ مسموحة والكتابةُ لا");
{
  const R = await load(`export { isReadAllowed } from "./src/lib/repo.ts";`);
  const reads = ["listClinicDrugs", "recentMedNames", "listMedicineStock", "suggestClinicDrugs"];
  check("listClinicDrugs، recentMedNames، listMedicineStock، suggestClinicDrugs مسموحة", reads.every((n) => R.isReadAllowed(n)));
  check("applyClinicDrugs ممنوعة", R.isReadAllowed("applyClinicDrugs") === false);
}

/* ── ١٠) الموثَّق جرعتُه ───────────────────────────────────────────────────── */
console.log("▸ ١٠) وضعُ «الموثَّق جرعتُه» (محرّرُ البروتوكول)");
{
  const ix = M.buildMedIndex({ catalog: MED_CATALOG, rows: [row("دواء بلا دليل")], only: "dosable", stockMode: "hide" });
  const reached = new Set(ix.all.map((x) => x.monographId));
  const lost = FORMULARY.filter((m) => !reached.has(m.id)).map((m) => m.en);
  check(`كلُّ الدليل (${FORMULARY.length}) يُوصَل إليه`, FORMULARY.length === 58 && lost.length === 0, lost.join(","));
  check("  وIbuprofen وAspirin وPermethrin بينها", ["Ibuprofen", "Aspirin", "Permethrin"].every((n) => ix.all.some((x) => x.name === n)));
  check("  ولا شيءَ بلا دليل", ix.all.every((x) => !!x.monographId) && !ix.all.some((x) => x.name === "دواء بلا دليل"));
}

/* ── ١١) familyType ────────────────────────────────────────────────────────── */
console.log("▸ ١١) familyType الإنكليزيّ كما هو");
{
  const ix = M.buildMedIndex({ catalog: MED_CATALOG, rows: [row("سيرينيا", { family: "gi" })] });
  const p = M.pickedFrom(ix.byKey.get(M.searchable("Amoxicillin 250mg")));
  check("اختيارُ الكتالوج ⇒ النصُّ نفسُه والصنفُ «Antibiotics» حرفاً", p.name === "Amoxicillin 250mg" && p.familyType === "Antibiotics" && p.source === "catalog");
  const c = M.pickedFrom(ix.byKey.get(M.searchable("سيرينيا")));
  check("  والمخصّصُ بصنف عائلته («Gastrointestinal»)", c.familyType === "Gastrointestinal" && c.source === "custom" && !!c.drugId);
  check("  و«هالمرة بس» لا صفَّ له", M.freePicked("  دواء جديد ", "other").source === "free" && M.freePicked("  دواء جديد ", "other").name === "دواء جديد");
}

console.log(fails ? `\n✗ clinic-drugs-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ clinic-drugs-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
