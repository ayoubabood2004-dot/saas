/* ============================================================================
 * 0279 بالواجهة — ترتيبُ شاشة البيع وصورُها، وأسعارُ التطعيمات، وتصديرُ الجرد PDF. بسلوكها، ثمّ الأسلاك، ثمّ طفرات.
 * الخادمُ (مبيعُ ٣٠ يوماً، والإعدادان، وبابُ السعر وصلاحيّاته) يفحصه قسمُ 0279 بالحزمة على بوستغريس.
 *   أ) الترتيب: لا يُخفي ولا يضيف ولا يكرّر، والأكثرُ/الأقلّ بالأرقام والمتعادلان بترتيب وصولهما، وبلا أرقامٍ بالاسم كما وصلت.
 *   ب) سعرُ التطعيم: يتعبّى حين الخانةُ فارغةٌ أو ممّا عبّأناه، وما كتبه الطبيبُ لا يُداس، وسعرُ تطعيمٍ لا يبقى على غيره ولا على دواء.
 *      والقارئ يرمي على صفٍّ مكسور، وخانةُ المدير تقرأ العربيةَ والفواصل وتقول ما لا يُقرأ.
 *   ج) صفحاتُ PDF: كلُّ سطرٍ بصفحةٍ واحدة بالضبط وبترتيبه، ولا صفحةَ تفيض، ورأسُ الجدول يُعاد حين يكمل ولا يبقى وحده آخرَ صفحة.
 *   د) المرايا التجريبية: مبيعُ ٣٠ يوماً بوحدة المخزن صافياً بلا المرجَّعة ولا الأقدم ولا عيادةٍ أخرى؛ وبابُ السعر بصلاحيّاته
 *      (الطبيبُ يُرفض، والمدير ومفتاحُه يكتبان، والمصوّرُ تردّه البوّابة) وnull يمسح والاسمُ بحالةٍ أخرى صفٌّ واحد.
 *   هـ) الأسلاك: الترتيبُ قبل التصفية والسقف، والصورُ كسولة، والأبوابُ والمكتبتان بـimport() وحده.
 *   و) طفراتٌ على المنطق تُمسك كلُّها.
 *
 *   node scripts/pos-sort-test.mjs
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
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify", "jspdf", "html2canvas"]);
const FILES = {
  sort: "src/lib/posSort.ts", vax: "src/lib/vaccinePrices.ts", pdf: "src/lib/stockReportPdf.ts",
  sales: "src/lib/demoPosSales.ts", dvax: "src/lib/demoVaccinePrices.ts",
};
/** يحزم الوحدات، و`muts` [ملف، من، إلى] تُطبَّق على نصّ الملف قبل الحزم (الطفرات). */
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
        'export * as S from "./src/lib/posSort.ts";',
        'export * as V from "./src/lib/vaccinePrices.ts";',
        'export { paginate } from "./src/lib/stockReportPdf.ts";',
        'export { listVaxPrices, setVaxPrice } from "./src/lib/vaccinePricesApi.ts";',
        'export { productSales30, forgetProductSales } from "./src/lib/posSalesApi.ts";',
        'export { loadDB, saveDB } from "./src/lib/demoStore.ts";',
        'export { getPosSort, setPosSort, getPosImages, setPosImages } from "./src/lib/settings.ts";',
      ].join("\n"),
      resolveDir: process.cwd(), sourcefile: "pos-sort-test-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [plug], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(path.join(tmpdir(), "pos-sort-test-"));
  const file = path.join(dir, "bundle.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

const session = (role, id = "u-1", clinic = "clinic-1") =>
  localStorage.setItem("vp_session", JSON.stringify({ raw: { id, clinic_id: clinic, rawRole: role, staff: { clinicId: clinic, role } } }));
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code; } };

/* ── السلوكُ كلُّه — يجري على الأصل، ثمّ على كلّ طفرة (يجب أن يفشل شيءٌ فيه) ────────────────────────────── */
async function behaviour(M, say) {
  let ok = true;
  const c = (name, cond, detail) => { if (say) check(name, cond, detail); if (!cond) ok = false; };
  const { S, V, paginate } = M;

  /* أ) الترتيب */
  const P = [{ id: "a", name: "ألف" }, { id: "b", name: "باء" }, { id: "c", name: "جيم" }, { id: "d", name: "دال" }, { id: "e", name: "هاء" }];
  const sales = new Map([["b", 5], ["d", 12], ["e", 5], ["zz", 99]]);
  const ids = (xs) => xs.map((x) => x.id).join("");
  const top = S.sortForPos(P, "top", sales), low = S.sortForPos(P, "low", sales);
  c("«الأكثر مبيعاً»: د (١٢) ثمّ ب وهـ (٥، بترتيب وصولهما) ثمّ ما لم يُبع (أ وج بترتيبهما)", ids(top) === "dbeac", ids(top));
  c("«الأقل مبيعاً»: ما لم يُبع أوّلاً (صفرٌ لا غائب) ثمّ ب وهـ ثمّ د", ids(low) === "acbed", ids(low));
  c("لا يُخفي ولا يضيف ولا يكرّر: الطولُ والعناصرُ نفسُها (ومعرّفٌ بالأرقام بلا مادّة لا يظهر)",
    [top, low].every((x) => x.length === P.length && new Set(x).size === P.length && x.every((p) => P.includes(p))));
  c("«بالاسم» وبلا أرقام: كما وصلت القائمة، ونسخةٌ لا القائمةُ نفسُها (الفرزُ لا يقلب قائمةَ الشاشة)",
    ids(S.sortForPos(P, "name", sales)) === "abcde" && ids(S.sortForPos(P, "top", null)) === "abcde" && S.sortForPos(P, "name", sales) !== P && ids(P) === "abcde");
  c("ونوعُ الترتيب يُعرف (isPosSort)", S.isPosSort("top") && S.isPosSort("low") && S.isPosSort("name") && !S.isPosSort("x") && !S.isPosSort(null));

  /* ب) سعرُ التطعيم */
  const F = V.vaxPriceFill;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  c("خانةٌ فارغة وتطعيمٌ له سعر ⇒ يتعبّى (ويُعلَّم أنه منّا)", eq(F("", null, 15000, true), { price: "15000", auto: "15000" }));
  c("ما كتبه الطبيبُ بيده لا يُداس ولو اختار تطعيماً له سعر", F("17000", null, 15000, true) === null && F("17000", "15000", 25000, true) === null);
  c("تطعيمٌ آخر وما بالخانة منّا ⇒ سعرُه الجديد", eq(F("15000", "15000", 25000, true), { price: "25000", auto: "25000" }));
  c("تطعيمٌ بلا سعر وما بالخانة منّا ⇒ تُفرغ (سعرُ تطعيمٍ لا يبقى على غيره)، وما كتبه الطبيبُ يبقى",
    eq(F("15000", "15000", undefined, true), { price: "", auto: null }) && F("9000", "15000", undefined, true) === null);
  c("الخروجُ إلى الدواء يُفرغ ما عبّأناه وحده", eq(F("15000", "15000", 15000, false), { price: "", auto: null }) && F("9000", null, 15000, false) === null);
  c("وسعرٌ صفر سعرٌ (لا «بلا سعر»)، ولا تغييرَ إن كان كما هو", eq(F("", null, 0, true), { price: "0", auto: "0" }) && F("15000", "15000", 15000, true) === null);
  c("مفتاحُ الاسم مرآةُ lower(btrim): المسافةُ وحدها تُقصّ", V.vaxKey("  Rabies ") === "rabies" && V.vaxKey("\tRabies") === "\trabies");
  const m = V.vaxPriceMap([{ name: "Rabies", price: "15000.00" }, { name: "FVRCP", price: 0 }]);
  c("القارئ: الأرقامُ النصّية تُقرأ والصفرُ سعر", m.get("rabies")?.price === 15000 && m.get("fvrcp")?.price === 0 && m.size === 2);
  const bad = (rows) => { try { V.vaxPriceMap(rows); return "قُبل"; } catch (e) { return e.message; } };
  c("  وصفٌّ مكسور يرمي (بلا اسم، سعرٌ نصٌّ فارغ، سالب) — لا سعرٌ يُخترع",
    bad([{ name: "", price: 1 }]) === "vaccine_prices_shape" && bad([{ name: "X", price: "" }]) === "vaccine_prices_shape" && bad([{ name: "X", price: -1 }]) === "vaccine_prices_shape");
  const R = V.readVaxPrice;
  c("خانةُ المدير: «١٥٬٠٠٠» و«15,000» و«12٫5» تُقرأ، والفارغُ يمسح، وغيرُ المقروء NaN",
    R("١٥٬٠٠٠") === 15000 && R("15,000") === 15000 && R("12٫5") === 12.5 && R("") === null && R("  ") === null
    && Number.isNaN(R("15.000.000")) && Number.isNaN(R("abc")) && Number.isNaN(R("-5")) && Number.isNaN(R("1.234")) && Number.isNaN(R("10000000000")));

  /* ج) صفحاتُ PDF */
  const units = [
    { kind: "block", h: 120 },
    { kind: "group", headH: 50, rows: Array.from({ length: 40 }, (_, i) => 20 + (i % 3) * 7) },
    { kind: "group", headH: 50, rows: [30, 30] },
    { kind: "group", headH: 50, rows: [] },
    { kind: "block", h: 200 },
  ];
  const H = 600;
  const pages = paginate(units, H);
  const heightOf = (pg) => pg.reduce((s, x) => s + (x.kind === "block" ? units[x.unit].h : units[x.unit].headH + units[x.unit].rows.slice(x.from, x.to).reduce((a, b) => a + b, 0)), 0);
  const seen = [];
  for (const pg of pages) for (const x of pg) if (x.kind === "group") for (let i = x.from; i < x.to; i++) seen.push(`${x.unit}:${i}`);
  const want = units.flatMap((u, k) => (u.kind === "group" ? u.rows.map((_, i) => `${k}:${i}`) : []));
  c("كلُّ سطرٍ بصفحةٍ واحدة بالضبط وبترتيبه (لا سطرٌ يضيع ولا يتكرّر)", seen.join(",") === want.join(","), `${seen.length}/${want.length}`);
  c("ولا صفحةَ تفيض عن ارتفاعها", pages.every((pg) => heightOf(pg) <= H), pages.map(heightOf).join(","));
  c("والكتلُ كلُّها مرّةً واحدة، والجدولُ الفارغ رأسُه وحده",
    pages.flat().filter((x) => x.kind === "block").map((x) => x.unit).join(",") === "0,4" && pages.flat().some((x) => x.unit === 3 && x.from === 0 && x.to === 0));
  const conts = pages.flat().filter((x) => x.kind === "group" && x.unit === 1);
  c("جدولٌ يكمل بصفحةٍ جديدة يعيد رأسَه (cont) — وأوّلُه بلا علامة", conts.length > 1 && !conts[0].cont && conts.slice(1).every((x) => x.cont && x.from > 0));
  c("ورأسُ الجدول لا يبقى وحده آخرَ صفحة: كلُّ قطعةٍ فيها سطرٌ على الأقلّ", pages.flat().filter((x) => x.kind === "group" && units[x.unit].rows.length).every((x) => x.to > x.from));
  const tight = paginate([{ kind: "block", h: 590 }, { kind: "group", headH: 50, rows: [20] }], 600);
  c("رأسٌ وسطرٌ لا يسعان بقيّةَ الصفحة ⇒ ينزلان معاً لصفحةٍ جديدة", tight.length === 2 && tight[1][0].kind === "group" && tight[1][0].from === 0);
  const tight2 = paginate([{ kind: "block", h: 540 }, { kind: "group", headH: 50, rows: [20, 20] }], 600);
  c("  ورأسٌ يسع وحده وسطرُه لا يسع ⇒ لا يبقى الرأسُ وحده (ينزلان معاً)", tight2.length === 2 && tight2[0].length === 1 && tight2[1][0].from === 0 && tight2[1][0].to === 2);
  const blocks = paginate([{ kind: "block", h: 500 }, { kind: "block", h: 200 }], 600);
  c("  وكتلةٌ لا تسع بقيّةَ الصفحة تنزل لصفحةٍ جديدة (المجاميعُ والتواقيع لا تُقصّ)", blocks.length === 2 && blocks[1][0].unit === 1);
  c("وورقةٌ فارغة صفحةٌ واحدة", paginate([], 600).length === 1);

  /* د) المرايا التجريبية */
  mem.clear();
  session("owner", "clinic-1", "clinic-1");
  const db = M.loadDB();
  const now = Date.now(), day = 86_400_000;
  const iso = (ago) => new Date(now - ago * day).toISOString();
  db.invoices = [
    { id: "i1", status: "paid", created_at: iso(2) }, { id: "i2", status: "refunded", created_at: iso(3) },
    { id: "i3", status: "paid", created_at: iso(45) }, { id: "i4", status: "partial", created_at: iso(10) },
  ];
  db.invoiceItems = [
    { invoice_id: "i1", product_id: "pa", qty: 3 }, { invoice_id: "i1", product_id: "pa", qty: -1 },
    { invoice_id: "i1", product_id: "pb", qty: 1, stock_qty: 12 }, { invoice_id: "i1", product_id: null, qty: 4 },
    { invoice_id: "i2", product_id: "pa", qty: 50 }, { invoice_id: "i3", product_id: "pc", qty: 7 }, { invoice_id: "i4", product_id: "pc", qty: 0.5 },
  ];
  M.saveDB(db);
  M.forgetProductSales();
  const s30 = await M.productSales30();
  c("مبيعُ ٣٠ يوماً (التجريبيّ عبر الباب): أ ٢ صافياً، ب ١٢ بوحدة المخزن، ج ٠٫٥ (القديمُ والمرجَّعةُ خارجه، وسطرُ الخدمة لا يُعدّ)",
    s30.get("pa") === 2 && s30.get("pb") === 12 && s30.get("pc") === 0.5 && s30.size === 3, JSON.stringify([...s30]));
  db.invoiceItems.push({ invoice_id: "i1", product_id: "pa", qty: 100 });
  M.saveDB(db);
  const again = await M.productSales30();
  M.forgetProductSales();
  const fresh = await M.productSales30();
  c("  والخبيئةُ تُعيد الجوابَ نفسَه حتى تُنسى (لا سؤالَ بكلّ فتح)، وبعد النسيان يُسأل من جديد", again.get("pa") === 2 && fresh.get("pa") === 102);

  mem.clear();
  session("doctor", "u-vet", "clinic-1");
  c("سعرُ التطعيم بالتجريبيّ: الطبيبُ بلا صلاحية الإعدادات يُرفض", await errOf(() => M.setVaxPrice("Rabies", 15000)) === "forbidden");
  session("photographer", "u-pho", "clinic-1");
  localStorage.setItem("vp_session", JSON.stringify({ raw: { id: "u-pho", clinic_id: "clinic-1", rawRole: "doctor", staff: { clinicId: "clinic-1", role: "doctor", staffRole: "photographer" } } }));
  c("  والمصوّرُ تردّه البوّابة قبل كلّ شيء", await errOf(() => M.setVaxPrice("Rabies", 15000)) === "photographer_forbidden");
  session("owner", "clinic-1", "clinic-1");
  const w1 = await M.setVaxPrice("  Rabies ", 15000.004), w2 = await M.setVaxPrice("FVRCP", 25000.5);
  c("  والمديرُ يكتب (الاسمُ مقصوص، والسعرُ بمنزلتين)", w1.name === "Rabies" && w1.price === 15000 && w2.price === 25000.5);
  await M.setVaxPrice("RABIES", 16000);
  let list = await M.listVaxPrices();
  c("  والاسمُ نفسُه بحالةٍ أخرى صفٌّ واحد بسعره الجديد", list.size === 2 && list.get("rabies")?.price === 16000 && list.get("rabies")?.name === "RABIES");
  await M.setVaxPrice("fvrcp", null);
  list = await M.listVaxPrices();
  c("  وnull يمسح، وسالبٌ واسمٌ فارغ يُرفضان", list.size === 1 && await errOf(() => M.setVaxPrice("X", -1)) === "bad_price" && await errOf(() => M.setVaxPrice("   ", 1)) === "bad_name");
  session("doctor", "u-vet", "clinic-1");
  localStorage.setItem("vp_override_until_default", String(Date.now() + 60_000));   // مفتاحُ العيادة المحلّيّ "default" بلا عيادةٍ نشطة
  c("  ومفتاحُ المدير الحيّ يفتحها للطبيب (auth_role() = 'manager')", (await M.setVaxPrice("Rabies", 17000)).price === 17000);

  /* الإعدادان: للعيادة، والغريبُ بالاسم، والصورُ مفعّلةٌ افتراضاً */
  mem.clear();
  c("الإعدادان افتراضاً: بالاسم والصورُ ظاهرة", M.getPosSort() === "name" && M.getPosImages() === true);
  M.setPosSort("low"); M.setPosImages(false);
  c("  ويثبتان بعد الكتابة", M.getPosSort() === "low" && M.getPosImages() === false);
  return ok;
}

const base = await load();
console.log("▸ السلوك (أ–د)");
await behaviour(base, true);

/* ── هـ) الأسلاك ────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك");
{
  const sb = code("src/components/retail/SaleBuilder.tsx");
  check("شاشةُ البيع ترتّب قبل التصفية والسقف: `ordered` من sortForPos، والتصفيةُ والسقفُ عليه",
    /const ordered = useMemo\(\(\) => sortForPos\(products, posSort, sales\.state === "ready" \? sales\.map : null\)/.test(sb)
    && /ordered\.filter\(/.test(sb) && /: ordered;\s*\n[\s\S]{0,200}?shown: base\.slice\(0, POS_MAX\)/.test(sb));
  check("  والمبيعُ ببابٍ كسول (import())، ولا استيرادَ ثابتاً للباب ولا لقطعة الشريط",
    /import\("@\/lib\/posSalesApi"\)/.test(sb) && !/^\s*import\s+(?!type\b)[^;]*from\s*["']@\/lib\/posSalesApi["']/m.test(sb)
    && /page\(\(\) => import\("@\/components\/retail\/PosCustomTabs"\)\.then\(\(m\) => \(\{ default: m\.PosGridBar \}\)\), \["ptab"\]\)/.test(sb));
  check("  والاختيارُ يُكتب لتفضيلات العيادة (setPosSort/setPosImages) ويُقرأ منها عند الفتح",
    /useState<PosSort>\(getPosSort\)/.test(sb) && /useState\(getPosImages\)/.test(sb) && /setPosSort\(v\)/.test(sb) && /setPosImages\(on\)/.test(sb));
  check("  والصورةُ كسولةُ التحميل والفكّ، وتسقط للأصل ثمّ للأيقونة، وتُرسم حين الصورُ مفعّلة وللمادّة صورة",
    /loading="lazy" decoding="async"/.test(sb) && /onError=\{\(\) => setStep\(\(s\) => s \+ 1\)\}/.test(sb) && (sb.match(/posImages && p\.image_path/g) ?? []).length === 2);
  const st = code("src/lib/settings.ts");
  check("الإعدادان من الخادم أوّلاً (hydrate) ويُكتبان بـpatchPrefs",
    /pos_sort: d\.pos_sort \?\? local\.pos_sort/.test(st) && /pos_images: typeof d\.pos_images === "boolean" \? d\.pos_images : local\.pos_images/.test(st)
    && /patchPrefs\(\{ pos_sort: v \}/.test(st) && /patchPrefs\(\{ pos_images: on \}/.test(st));
  const mf = code("src/components/retail/MedSaleForm.tsx");
  check("نموذجُ البيع: السعرُ بـvaxPriceFill حين يتبدّل التطعيمُ أو الأسعارُ أو التبويب (لا بكلّ حرف)",
    /vaxPriceFill\(priceNowRef\.current, autoPriceRef\.current, want, mode === "vaccination"\)/.test(mf) && /\}, \[pickedVax, vaxPrices, mode\]\);/.test(mf)
    && /onVaccineChange=\{setPickedVax\}/.test(mf));
  check("  والبابُ والسطرُ كسولان (import() وpage(…, [\"vxp\"])) ولا استيرادَ ثابتاً لهما",
    /import\("@\/lib\/vaccinePricesApi"\)/.test(mf) && /page\(\(\) => import\("@\/components\/vaccines\/VaccinePrices"\)[^;]*\["vxp"\]\)/.test(mf)
    && !/^\s*import\s+(?!type\b)[^;]*from\s*["']@\/(lib\/vaccinePricesApi|components\/vaccines\/VaccinePrices)["']/m.test(mf));
  const me = code("src/components/MedicalEntry.tsx");
  check("  ونموذجُ التطعيم يُسمع اختيارَه بأثرٍ على القيمة (كلُّ طريقٍ يغيّرها)", /useEffect\(\(\) => \{ vaxChangeRef\.current\?\.\(vaccine\); \}, \[vaccine\]\);/.test(me));
  const se = code("src/pages/Settings.tsx");
  check("الإعدادات: بطاقةُ الأسعار كسولةٌ بنطاقها، وبأسماء قائمة البيع نفسِها (المدمجةُ وما أضافته العيادة)",
    /page\(\(\) => import\("@\/components\/vaccines\/VaccinePrices"\)\.then\(\(m\) => \(\{ default: m\.VaxPriceCard \}\)\), \["vxp"\]\)/.test(se)
    && /Array\.from\(new Set\(\[\.\.\.BUILTIN_VACCINES, \.\.\.clinic\.map\(\(v\) => v\.name\)\]\)\)/.test(se) && /<VaxPricesSlot names=\{priceNames\} \/>/.test(se));
  const vp = code("src/components/vaccines/VaccinePrices.tsx");
  check("  والتطعيمُ يُختار من القائمة (select) لا يُكتب باليد، والقائمةُ تُقرأ بعد كلّ كتابة، وجدولٌ غائب يُخفيها",
    /<select className="input py-2" value=\{pick\}/.test(vp) && /setTick\(\(n\) => n \+ 1\);\s*\} catch/.test(vp) && /if \(state === "missing"\) return null;/.test(vp));
  const ia = code("src/pages/InventoryAudit.tsx"), pdf = code("src/lib/stockReportPdf.ts");
  check("PDF الجرد: الورقةُ المطبوعة نفسُها (buildStockReportHTML) ببابٍ كسول، والمكتبتان بـimport() وحده",
    /import\("@\/lib\/stockReportPdf"\)/.test(ia) && /exportStockReportPdf\(buildStockReportHTML\(p, c, s, m\)/.test(ia)
    && !/^\s*import\s+(?!type\b)[^;]*from\s*["'](@\/lib\/stockReportPdf|jspdf|html2canvas)["']/m.test(ia + "\n" + pdf)
    && /import\("jspdf"\)/.test(pdf) && /import\("html2canvas"\)/.test(pdf));
  check("  والتقسيمُ بـpaginate بارتفاعٍ يحجز سطرَ رقم الصفحة، والإطارُ يُشال بكلّ خروج",
    /paginate\(units, H - FOOT\)/.test(pdf) && /finally \{\s*frame\.remove\(\);\s*\}/.test(pdf));
  check("  واتّجاهُ كلّ خليّةٍ من نصّها (dir=auto — لا قرارَ كلمةً كلمة)، وارتفاعُ السطر صريح (ذيلُ الحرف لا تغطّيه الخليّةُ التالية)",
    /el\.setAttribute\("dir", "auto"\)/.test(pdf) && /body\{line-height:1\.5\}/.test(pdf) && !/ctx\.direction|fillText/.test(pdf));
  check("  وعروضُ الأعمدة مثبَّتةٌ بما قيس بالجدول كاملاً (لا يلتفّ سطرٌ بصفحته فيُقصّ)، والكتلةُ الأطولُ من صفحة تُصغَّر لا تُقصّ",
    /tb\.style\.tableLayout = "fixed"/.test(pdf) && /col\.style\.width = `\$\{w\}px`/.test(pdf) && /min-height:\$\{H\}px/.test(pdf) && !/overflow:hidden/.test(pdf) && /const k = Math\.min\(1, H \/ sh\)/.test(pdf));
  const ps = code("src/lib/posSalesApi.ts");
  check("خبيئةُ المبيع بالحساب والعيادة التي أكّدها الخادم (confirmedClinic) — لا بمفتاح العيادة المحلّيّ",
    /confirmedClinic\(uid\)/.test(ps) && /cache = key \? \{ key, at: now\(\), map \} : null;/.test(ps));
  const vc = src("vite.config.ts");
  check("  ومكتباتُ PDF خارج التثبيت المسبق (لا تُنزَّل لكلّ جهازٍ بكلّ نشر)، وcanvg باسمٍ يُعرف",
    ["**/jspdf.es.min-*.js", "**/html2canvas.esm-*.js", "**/purify.es-*.js", "**/pdf-canvg-*.js"].every((g) => vc.includes(`"${g}"`)) && /return "pdf-canvg";/.test(vc));
}

/* ── و) طفرات ───────────────────────────────────────────────────────────── */
console.log("▸ الطفرات (كلُّها تُمسك)");
const MUTS = [
  ["الأكثرُ والأقلّ بالاتّجاه نفسِه", FILES.sort, 'const dir = sort === "top" ? -1 : 1;', "const dir = 1;"],
  ["الغائبُ ليس صفراً (يُسقط من الترتيب)", FILES.sort, "sales.get(p.id) ?? 0", "sales.get(p.id) ?? Infinity"],
  ["بلا أرقام يُرتَّب بأيّ شيء", FILES.sort, 'if (sort === "name" || !sales) return rows.slice();', 'if (sort === "name") return rows.slice();'],
  ["ما كتبه الطبيبُ يُداس", FILES.vax, 'if (cur !== "" && !ours) return null;', ""],
  ["سعرُ تطعيمٍ يبقى على غيره", FILES.vax, 'if (!active || want == null) return ours ? { price: "", auto: null } : null;', "if (!active || want == null) return null;"],
  ["الخروجُ للدواء لا يُفرغ", FILES.vax, "if (!active || want == null)", "if (want == null)"],
  ["سعرٌ صفر «بلا سعر»", FILES.vax, "if (!active || want == null)", "if (!active || !want)"],
  ["btrim يقصّ كلَّ فراغ", FILES.vax, 'export const vaxKey = (name: string): string => name.replace(/^ +| +$/g, "").toLowerCase();', "export const vaxKey = (name: string): string => name.trim().toLowerCase();"],
  ["صفٌّ مكسور يُقبل", FILES.vax, 'if (!vaxKey(name) || !Number.isFinite(price) || price < 0) throw new Error("vaccine_prices_shape");', "if (!vaxKey(name)) continue;"],
  ["الفاصلُ يُقرأ عشريّاً", FILES.vax, "replace(/[٬,،\\s]/g, \"\")", "replace(/[٬،\\s]/g, \"\").replace(/,/g, \".\")"],
  ["سطرٌ يفيض عن صفحته", FILES.pdf, "} while (i < u.rows.length && y + u.rows[i] <= pageH);", "} while (i < u.rows.length && y <= pageH);"],
  ["رأسٌ وحده آخرَ صفحة", FILES.pdf, "if (y > 0 && y + u.headH + u.rows[i] > pageH) fresh();", "if (y > 0 && y + u.headH > pageH) fresh();"],
  ["الكتلةُ لا تنزل لصفحةٍ جديدة", FILES.pdf, "if (y > 0 && y + u.h > pageH) fresh();", ""],
  ["المكمِّلُ بلا علامة", FILES.pdf, "cont: from > 0", "cont: false"],
  ["المرجَّعةُ تُعدّ", FILES.sales, '(i.status ?? "paid") !== "refunded" && ', ""],
  ["القديمُ يُعدّ", FILES.sales, " && Date.parse(i.created_at) >= now - span", ""],
  ["بوحدة البيع لا المخزن", FILES.sales, "Number(it.stock_qty ?? it.qty)", "Number(it.qty)"],
  ["الطبيبُ يكتب السعر", FILES.dvax, 'if (!manager && !(await staffCan("manageSettings"))) {', "if (false) {"],
  ["الاسمُ بحالته صفٌّ ثانٍ", FILES.dvax, "all[vaxKey(name)] = { name, price };", "all[name] = { name, price };"],
  ["null لا يمسح", FILES.dvax, "delete all[vaxKey(name)];", ""],
];
for (const [name, file, from, to] of MUTS) {
  let caught = false, why = "";
  try {
    const M = await load([[file, from, to]]);
    caught = !(await behaviour(M, false));
  } catch (e) { why = e.message; caught = /طفرةٌ ما لقت/.test(why) ? false : true; }
  check(`طفرة «${name}» تُمسك`, caught, why);
}

console.log(`\n${fails ? "✗" : "✓"} pos-sort-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
