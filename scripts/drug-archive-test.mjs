/* ============================================================================
 * أرشفةُ أدوية النظام (0280) بالواجهة — بسلوكها، ثمّ الأسلاك، ثمّ طفرات. الخادمُ (الجدولان، الدالّتان، السياسةُ والسياجُ والتدقيق)
 * يفحصه قسمُ 0280 بالحزمة على بوستغريس.
 *   أ) الصِّرف: قارئُ الحالة يرمي على شكلٍ مكسور؛ من يُخفى (المخزنُ أبداً لا، والاسمُ ولو له صفّ، وزرُّ القائمة ما لا صفَّ له ولا رصيد)؛
 *      خطّتا الأرشفة والترجيع؛ و«المؤرشفة» قائمةٌ واحدة بلا تكرار.
 *   ب) الفهرس (buildMedIndex): المؤرشفُ خارج كلّ بابٍ بالمنتقي (الكلّ، العائلة، أدويتي، الأخيرة، البحث، التصنيف)، والإعداداتُ تراه بعلامته.
 *   ج) المرآةُ التجريبية والمتجر: الأبوابُ بالرفض نفسِه والعدُّ نفسِه، والمتجرُ يقرأ الأرشفةَ مع القائمة، ودواءٌ مخفيٌّ يُنجَّم يُرجَع أوّلاً.
 *   د) الأسلاك. هـ) طفرات.
 *
 *   node scripts/drug-archive-test.mjs
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
  body: { appendChild() {}, classList: { add() {}, remove() {} } }, visibilityState: "visible",
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
async function load(muts = []) {
  const plug = {
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
      b.onLoad({ filter: /src[\\/]lib[\\/][A-Za-z]+\.ts$/ }, (a) => {
        const rel = path.relative(process.cwd(), a.path).split(path.sep).join("/");
        const mine = muts.filter((m) => m[0] === rel);
        if (!mine.length) return undefined;
        let s = readFileSync(a.path, "utf8");
        for (const [, from, to] of mine) {
          if (!s.includes(from)) throw new Error(`طفرةٌ ما لقت نصّها بـ${rel}: ${from}`);
          s = s.replace(from, to);
        }
        return { contents: s, loader: "ts" };
      });
    },
  };
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/lib/repo.ts";',
        'export * as A from "./src/lib/drugArchive.ts";',
        'export { buildMedIndex } from "./src/lib/medIndex.ts";',
        'export { MED_CATALOG } from "./src/lib/medCatalog.ts";',
        'export { loadDrugArchive, hideDrugNames, setDrugCatalogOff } from "./src/lib/drugArchiveApi.ts";',
        'export { loadClinicDrugs, getDrugsState, hideDrugs, setCatalogOff, unhideFirst, applyDrugOps } from "./src/lib/clinicDrugs.ts";',
      ].join("\n"),
      resolveDir: process.cwd(), sourcefile: "drug-archive-test-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [plug], logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"production"' }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(path.join(tmpdir(), "drug-archive-test-"));
  const file = path.join(dir, "bundle.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

const session = (role, id = "clinic-1", clinic = "clinic-1", staffRole) => {
  localStorage.setItem("vp_session", JSON.stringify({ raw: { id, clinic_id: clinic, rawRole: role, staff: { clinicId: clinic, role, ...(staffRole ? { staffRole } : {}) } } }));
};
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code; } };
const keysOf = (xs) => xs.map((x) => x.key).sort().join(",");

async function behaviour(M, say) {
  let ok = true;
  const c = (name, cond, detail) => { if (say) check(name, cond, detail); if (!cond) ok = false; };
  const { A, buildMedIndex, MED_CATALOG } = M;

  /* أ) الصِّرف */
  const bad = (cat, rows) => { try { A.readArchive(cat, rows); return "قُبل"; } catch (e) { return e.message; } };
  const st = A.readArchive([{ catalog_off: true }], [{ name_key: "meloxicam", name: "Meloxicam", hidden_at: "2026-11-18T01:00:00Z" }]);
  c("القارئ: الزرُّ والمخفيُّ بمفاتيحه، وبلا صفّ زرٍّ «ظاهرة»",
    st.ready && st.off && st.hidden.get("meloxicam")?.name === "Meloxicam" && A.readArchive([], []).off === false && A.readArchive([], []).ready);
  c("  وشكلٌ مكسور يرمي (زرٌّ بغير منطقيّ، صفٌّ بلا مفتاح، صفٌّ بلا لحظة) — لا «بلا مخفيّ» يُصدَّق",
    bad([{ catalog_off: "yes" }], []) === "drug_archive_shape" && bad([], [{ name: "X", hidden_at: "t" }]) === "drug_archive_shape"
    && bad([], [{ name_key: "x", name: "X" }]) === "drug_archive_shape");
  const arc = (hidden = [], off = false) => ({ ready: true, off, hidden: new Map(hidden.map((n) => [n.toLowerCase(), { name: n, at: "2026-11-18T00:00:00Z" }])) });
  const it = (o) => ({ key: "k", name: "K", base: "catalog", products: [], ...o });
  c("من يُخفى: المخزنُ أبداً لا؛ والاسمُ يُخفي ولو للدواء صفٌّ (نجمةٌ قديمة)",
    A.hiddenBy(it({ base: "stock", key: "meloxicam" }), arc(["Meloxicam"], true)) === null
    && A.hiddenBy(it({ key: "meloxicam", drugId: "r1" }), arc(["Meloxicam"])) === "name");
  c("  وزرُّ القائمة يُخفي من النظام (الكتالوج والدليل) ما لا صفَّ حيّاً له ولا رصيد — وما أضافته العيادةُ لا",
    A.hiddenBy(it({}), arc([], true)) === "catalog" && A.hiddenBy(it({ base: "formulary" }), arc([], true)) === "catalog"
    && A.hiddenBy(it({ drugId: "r1" }), arc([], true)) === null && A.hiddenBy(it({ products: [{}] }), arc([], true)) === null
    && A.hiddenBy(it({ base: "custom" }), arc([], true)) === null && A.hiddenBy(it({}), arc([], false)) === null && A.hiddenBy(it({}), null) === null);
  const plan = A.archivePlan([it({ name: "Meloxicam" }), it({ name: "Ibuprofen", base: "formulary" }), it({ name: "دوائي", base: "custom", drugId: "r9" }),
    it({ name: "علبة", base: "stock" }), it({ name: "قديم", base: "recent" }), it({ name: "بلا صفّ", base: "custom" })]);
  c("خطّةُ الأرشفة: النظامُ باسمه، وما أضافته العيادةُ بصفّه، والمخزنُ والأخيرةُ وما بلا صفٍّ لا",
    plan.hideNames.join(",") === "Meloxicam,Ibuprofen" && plan.archiveIds.join(",") === "r9");
  const rows = [
    { id: "r1", name: "دوائي", archived_at: "2026-11-10T00:00:00Z" }, { id: "r2", name: "دوائي", archived_at: "2026-11-12T00:00:00Z" },
    { id: "r3", name: "حيّ", archived_at: "2026-11-11T00:00:00Z" }, { id: "r4", name: "حيّ", archived_at: null },
    { id: "r5", name: "Meloxicam", archived_at: "2026-11-01T00:00:00Z" },
  ];
  const a2 = { ready: true, off: true, hidden: new Map([["meloxicam", { name: "Meloxicam", at: "2026-11-17T00:00:00Z" }], ["ketamine", { name: "Ketamine", at: "2026-11-18T00:00:00Z" }]]) };
  const ents = A.archivedEntries(a2, rows, [{ key: "ketamine", name: "Ketamine" }, { key: "xylazine", name: "Xylazine" }, { key: "atropine", name: "Atropine" }], (n) => n.toLowerCase());
  c("«المؤرشفة» قائمةٌ واحدة: المخفيُّ بالاسم أوّلاً (الأحدثُ فوق)، ثمّ صفُّ العيادة الأحدثُ مرّةً لكلّ اسم (وما له صفٌّ حيّ أو مخفيٌّ بالاسم لا)، ثمّ ما أخفاه الزرّ بالأبجدية",
    ents.map((e) => `${e.kind}:${e.name}${e.id ? "#" + e.id : ""}`).join(",") === "name:Ketamine,name:Meloxicam,row:دوائي#r2,catalog:Atropine,catalog:Xylazine",
    ents.map((e) => `${e.kind}:${e.name}${e.id ? "#" + e.id : ""}`).join(","));
  const rp = A.restorePlan(ents);
  c("خطّةُ الترجيع: الاسمُ يُرجع، والصفُّ يُسترجع، وما أخفاه الزرُّ يصير للعيادة (يبقى ظاهراً والقائمةُ مخفيّة)",
    rp.unhideNames.join(",") === "Ketamine,Meloxicam" && rp.restoreIds.join(",") === "r2" && rp.keepNames.join(",") === "Atropine,Xylazine");
  c("والدفعاتُ بحدّها (٥٠٠ للإخفاء)", A.HIDE_BATCH === 500 && A.chunks([1, 2, 3, 4, 5], 2).map((x) => x.length).join(",") === "2,2,1" && A.chunks([], 3).length === 0);

  /* ب) الفهرس */
  const cat = MED_CATALOG;
  const now = "2026-11-18T00:00:00Z";
  const drow = (id, name, o = {}) => ({ id, name, family: "other", in_mine: false, pos: null, archived_at: null, created_at: now, updated_at: now, ...o });
  const R = [drow("m1", "Meloxicam", { family: "analgesics", in_mine: true, pos: 1024 }), drow("m2", "Ketamine", { family: "anesthetics", in_mine: true, pos: 2048 }),
    drow("c1", "دوائي الخاص", { family: "other" })];
  const G = [{ id: "g1", name: "مسكّنات", pos: 1024, archived_at: null, created_at: now, updated_at: now, family: null }];
  const I = [{ group_id: "g1", drug_id: "m1", pos: 1024 }];
  const base = { catalog: cat, rows: R, groups: G, items: I, recent: ["Meloxicam", "Atropine"], stock: [{ id: "p1", name: "Atropine", stock: 3 }] };
  const ix0 = buildMedIndex(base);
  const ixH = buildMedIndex({ ...base, archive: arc(["Meloxicam", "Xylazine"]) });
  const has = (ix, k) => ix.all.some((x) => x.key === k);
  c("الفهرس: المخفيُّ بالاسم خارج الكلّ والعائلة وأدويتي والأخيرة والبحث والتصنيف — ولو كان بأدويتي",
    has(ix0, "meloxicam") && !has(ixH, "meloxicam") && !has(ixH, "xylazine") && !ixH.mine.some((x) => x.key === "meloxicam") && ixH.mine.some((x) => x.key === "ketamine")
    && !(ixH.byFamily.get("analgesics") ?? []).some((x) => x.key === "meloxicam") && !ixH.recent.some((x) => x.key === "meloxicam") && ixH.recent.some((x) => x.key === "atropine")
    && !ixH.search("melox").length && (ixH.byGroup.get("g1") ?? []).length === 0 && ixH.all.length === ix0.all.length - 2);
  const ixS = buildMedIndex({ ...base, archive: arc(["Meloxicam"]), showHidden: true });
  c("  والإعداداتُ (showHidden) تراه بعلامته، وغيرُ المخفيّ بلا علامة", ixS.byKey.get("meloxicam")?.hiddenBy === "name" && !ixS.byKey.get("ketamine")?.hiddenBy && ixS.all.length === ix0.all.length);
  const ixO = buildMedIndex({ ...base, archive: arc([], true), formulary: "all" });
  const sysLeft = ixO.all.filter((x) => x.base === "catalog" || x.base === "formulary").map((x) => x.key).sort().join(",");
  c("زرُّ القائمة: من النظام يبقى ما للعيادة صفُّه (أدويتي) وما بالمخزن، وما أضافته العيادةُ يبقى، والدليلُ فوق الكتالوج يختفي ويّاه",
    sysLeft === "atropine,ketamine,meloxicam" && has(ixO, searchableAr("دوائي الخاص", ix0)) && !ixO.all.some((x) => x.base === "formulary"), sysLeft);
  const ixOS = buildMedIndex({ ...base, archive: arc([], true), showHidden: true });
  c("  وبالإعدادات يُرى المخفيُّ بالزرّ بعلامته «catalog»", ixOS.byKey.get("xylazine")?.hiddenBy === "catalog" && !ixOS.byKey.get("atropine")?.hiddenBy);

  /* ج) المرآةُ التجريبية والمتجر */
  mem.clear();
  session("owner");
  const clinic = "default";   // مفتاحُ العيادة المحلّيّ بلا عيادةٍ نشطة — ختمُ القائمة التجريبية والأبواب معاً
  c("الأبواب (التجريبيّ): قبل أيّ شيء «ظاهرة» بلا مخفيّ", (await M.loadDrugArchive()).off === false && (await M.loadDrugArchive()).hidden.size === 0 && (await M.loadDrugArchive()).ready);
  const n1 = await M.hideDrugNames(clinic, ["  Meloxicam ", "MELOXICAM", "Ketamine"], true);
  const s1 = await M.loadDrugArchive();
  c("  الإخفاءُ يقصّ ويعدّ ما تغيّر، واسمان بمفتاحٍ واحد صفٌّ واحد (الأوّل)", n1 === 2 && s1.hidden.get("meloxicam")?.name === "Meloxicam" && s1.hidden.size === 2);
  c("  وثانيةً صفر، والترجيعُ بأيّ حالة يعدّ ما رجع",
    (await M.hideDrugNames(clinic, ["meloxicam"], true)) === 0 && (await M.hideDrugNames(clinic, ["KETAMINE", "Propofol"], false)) === 1);
  c("  والرفضُ برموز الخادم: اسمٌ فارغ، غيرُ نصّ، أكثرُ من ٥٠٠ بدفعة (الدفعاتُ ٥٠٠ فلا يصلها الخادمُ من الباب)، وعيادةٌ تبدّلت",
    await errOf(() => M.hideDrugNames(clinic, ["  "], true)) === "clinic_drugs_bad_name" && await errOf(() => M.hideDrugNames(clinic, [1], true)) === "bad_ops"
    && (await M.hideDrugNames(clinic, Array.from({ length: 501 }, (_, i) => `D${i}`), true)) === 501
    && await errOf(() => M.hideDrugNames("clinic-2", ["X"], true)) === "clinic_switched");
  await M.hideDrugNames(clinic, Array.from({ length: 501 }, (_, i) => `D${i}`), false);
  c("  وزرُّ القائمة: يتغيّر مرّةً ثمّ لا، ويرجع", (await M.setDrugCatalogOff(clinic, true)) === true && (await M.setDrugCatalogOff(clinic, true)) === false
    && (await M.loadDrugArchive()).off === true && (await M.setDrugCatalogOff(clinic, false)) === true);
  session("doctor", "u-pho", "clinic-1", "photographer");
  c("  والمصوّرُ تردّه البوّابة قبل كلّ شيء", await errOf(() => M.hideDrugNames(clinic, ["X"], true)) === "photographer_forbidden");
  session("doctor", "u-vet", "clinic-1");
  c("  والطبيبُ والاستقبالُ يكتبان (كلُّ الكادر — قرارُ المالك)", (await M.hideDrugNames(clinic, ["Xylazine"], true)) === 1
    && (session("reception", "u-rcp", "clinic-1"), (await M.setDrugCatalogOff(clinic, true)) === true));
  await M.setDrugCatalogOff(clinic, false);

  session("owner");
  await M.loadClinicDrugs(true);
  const S = M.getDrugsState();
  c("المتجر: الأرشفةُ تُقرأ مع القائمة (بلا قائمةٍ تُرسم قبل أن يُعرف المؤرشف)", S.status === "ready" && S.archive.ready && S.archive.hidden.has("xylazine"), S.status);
  await M.hideDrugs(["Atropine"], true);
  c("  وكتابةُ الإخفاء تُقرأ من الخادم بعدها (ما انحفظ فعلاً)", M.getDrugsState().archive.hidden.has("atropine"));
  await M.unhideFirst("ATROPINE");
  c("  ودواءٌ مخفيٌّ يُنجَّم أو يُضاف يُرجَع أوّلاً (unhideFirst)، وغيرُ المخفيّ لا يُكتب له شيء",
    !M.getDrugsState().archive.hidden.has("atropine") && M.getDrugsState().archive.hidden.has("xylazine") && (await M.unhideFirst("Propofol"), [...M.getDrugsState().archive.hidden.keys()].sort().join(",") === "meloxicam,xylazine"));
  await M.setCatalogOff(true);
  c("  وزرُّ القائمة من المتجر يُقرأ بعده", M.getDrugsState().archive.off === true);
  await M.setCatalogOff(false);
  return ok;
}
/** مفتاحُ searchable لاسمٍ من الفهرس نفسِه (لا نسخةَ من التطبيع هنا). */
function searchableAr(name, ix) { return ix.all.find((x) => x.name === name)?.key ?? "?"; }

const base = await load();
console.log("▸ السلوك (أ–ج)");
await behaviour(base, true);

/* ── د) الأسلاك ── */
console.log("▸ الأسلاك");
{
  const pd = code("src/components/meds/MedPickerData.ts");
  check("كلُّ فهرسٍ بالمنتقي يقرأ الأرشفةَ من المتجر نفسِه (المضيفُ لا يمرّرها فلا ينساها)، والإعداداتُ وحدها تطلب رؤيتها",
    /const archive = useDrugArchive\(\);/.test(pd) && /buildMedIndex\(\{[^}]*archive, showHidden \}/.test(pd) && /Omit<BuildInput, "catalog" \| "archive">/.test(pd));
  const sh = code("src/components/meds/MedPickerSheet.tsx");
  check("  وورقةُ المنتقي تراه بطلب مضيفها وحده (showHidden)، وبشارةٍ بنصّه", /showHidden: !!p\.showHidden/.test(sh) && /it\.hiddenBy && p\.showHidden \? \[p\.showHidden\.label\]/.test(sh));
  const se = code("src/pages/Settings.tsx");
  check("الإعدادات: «أضف من القائمة الكاملة» يرى المؤرشف (والنجمةُ تُرجعه)، والأرشيفُ قطعةٌ كسولةٌ بنطاقها darc بدل «المؤرشفة» القديمة",
    /showHidden=\{\{ label: t\("mmset\.archivedTitle", "المؤرشفة"\) \}\}/.test(se)
    && /page\(\(\) => import\("@\/components\/meds\/DrugArchive"\)\.then\(\(m\) => \(\{ default: m\.DrugArchivePanel \}\)\), \["darc"\]\)/.test(se)
    && /<DrugArchiveSlot \/>/.test(se) && !/data-mymeds-restore/.test(se));
  check("  ودواءٌ منجَّمٌ ثمّ مخفيٌّ لا يُرى «مختاراً» بالقائمة الكاملة (الضغطةُ تُرجعه لا تشيل نجمته)، والتصنيفاتُ ترى أعضاءها المؤرشفة لتُشال",
    /isSelected=\{\(m\) => drugs\.isMine\(m\.key\) && !drugs\.archiveState\.hidden\.has\(m\.key\)\}/.test(se)
    && /items: drugs\.items, showHidden: true \}\);\s*const \[newOpen/.test(se));
  const cd = code("src/lib/clinicDrugs.ts");
  check("المتجر: الأرشفةُ بـPromise.all مع القائمة، وبابُها كسول، والنجمةُ والإضافةُ والتصنيفُ تُرجع المخفيّ أوّلاً",
    /Promise\.all\(\[repo\.listClinicDrugs\(\), expectedServerClinic\(\), archiveApi\(\)\.then\(\(m\) => m\.loadDrugArchive\(\)\)\]\)/.test(cd)
    && /const archiveApi = \(\) => import\("\.\/drugArchiveApi"\);/.test(cd) && !/^\s*import\s+(?!type\b)[^;]*from\s*["']\.\/drugArchiveApi["']/m.test(cd)
    && (cd.match(/unhideFirst\((it|x)\.name\)\.then/g) ?? []).length === 3);
  const da = code("src/components/meds/DrugArchive.tsx");
  check("الأرشيف: الفهرسُ بالمخزن والدليل ويرى المخفيّ، والأرشفةُ بجملةٍ تسمّي وتعدّ قبلها (لا window.confirm)، والحسابُ من drugArchive.ts",
    /stockMode: "show", formulary: "all"/.test(da) && /showHidden: true/.test(da) && /data-darc-archiveask/.test(da) && /data-darc-catask/.test(da)
    && !/window\.confirm/.test(da) && /archivePlan\(picked\)/.test(da) && /restorePlan\(list\)/.test(da) && /archivedEntries\(a, drugs\.rows/.test(da));
}

/* ── هـ) طفرات ── */
console.log("▸ الطفرات (كلُّها تُمسك)");
const DA = "src/lib/drugArchive.ts", MI = "src/lib/medIndex.ts", DD = "src/lib/demoDrugArchive.ts", CD = "src/lib/clinicDrugs.ts";
const MUTS = [
  ["المخزنُ يُخفى", DA, 'if (!a || it.base === "stock") return null;', "if (!a) return null;"],
  ["الزرُّ يُخفي ما له صفّ", DA, '&& !it.drugId && it.products.length === 0) return "catalog";', '&& it.products.length === 0) return "catalog";'],
  ["الزرُّ يُخفي ما بالمخزن", DA, '&& !it.drugId && it.products.length === 0) return "catalog";', '&& !it.drugId) return "catalog";'],
  ["الزرُّ يُخفي ما أضافته العيادة", DA, '(it.base === "catalog" || it.base === "formulary")', '(it.base !== "stock")'],
  ["الاسمُ لا يُخفي ما له صفّ", DA, 'if (a.hidden.has(it.key)) return "name";', 'if (a.hidden.has(it.key) && !it.drugId) return "name";'],
  ["القارئُ يقبل المكسور", DA, 'typeof x.hidden_at !== "string") bad();', ') bad();'],
  ["الأرشفةُ تخفي ما أضافته العيادة باسمه", DA, 'else if (it.base === "custom" && it.drugId) archiveIds.push(it.drugId);', 'else if (it.base === "custom") hideNames.push(it.name);'],
  ["صفٌّ حيٌّ لا يمنع تكرارَه بالمؤرشفة", DA, "if (!key || seen.has(key) || live.has(key)) continue;", "if (!key || seen.has(key)) continue;"],
  ["الترجيعُ يُرجع المخفيَّ بالزرّ باسمه", DA, "else keepNames.push(e.name);", "else unhideNames.push(e.name);"],
  ["الفهرسُ لا يُخفي", MI, "if (!input.showHidden && hiddenKeys.size) all = all.filter((it) => !it.hiddenBy);", ""],
  ["الأخيرةُ ترجع المخفيّ", MI, "    if (!hit && (hiddenKeys.has(k) || (!input.showHidden && input.archive?.hidden.has(k)))) continue;   // ولا مؤرشفٌ (0280)", ""],
  ["الإعداداتُ لا ترى المخفيّ", MI, "if (!input.showHidden && hiddenKeys.size)", "if (hiddenKeys.size)"],
  ["المرآةُ تكرّر المفتاح", DD, "if (!s.hidden.some((h) => h.name_key === k))", "if (true)"],
  ["المرآةُ بلا ختم العيادة", DD, 'if (clinic !== active()) throw err("clinic_switched");', ""],
  ["المرآةُ بلا بوّابة", DD, "  demoApiGate();\n", ""],
  ["المرآةُ تقول «تغيّر» دائماً", DD, "const changed = s.off !== off;", "const changed = true;"],
  ["المتجرُ لا يُرجع قبل النجمة", CD, "if (state.archive.hidden.has(drugKey(name))) await hideDrugs([name], false);", ""],
  ["المتجرُ لا يقرأ بعد الكتابة", CD, "  finally { await refreshArchive().catch(() => { void loadClinicDrugs(true); }); }\n}\n/** قائمةُ النظام", "}\n/** قائمةُ النظام"],
];
for (const [name, file, from, to] of MUTS) {
  let caught = false, why = "";
  const loud = console.error; console.error = () => {};
  try { caught = !(await behaviour(await load([[file, from, to]]), false)); }
  catch (e) { why = e.message; caught = !/طفرةٌ ما لقت/.test(why); }
  finally { console.error = loud; }
  check(`طفرة «${name}» تُمسك`, caught, why);
}

console.log(`\n${fails ? "✗" : "✓"} drug-archive-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
