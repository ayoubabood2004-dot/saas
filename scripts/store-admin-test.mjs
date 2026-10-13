/* ============================================================================
 * ألواحُ «المتجر الإلكتروني» (متجر v1) مرسومةً — بـReact الحقيقيّ ومتجرِ التصنيفات الحقيقيّ.
 *
 * ما تراه العينُ ولا تمسكه فحوصُ الدوالّ: «٠ مادة» عن منتجاتٍ لم تصل، و«ما اكو تصنيفات» عن
 * قراءةٍ فشلت، وأسهمٌ تختفي أثناء الحفظ فيقع الإصبعُ على زرٍّ آخر، وعربيةٌ بجملةٍ إنكليزية.
 * فالألواحُ تُرسم هنا بـrenderToStaticMarkup (بلا متصفّح): `storeCats` نفسُه بخادمٍ مزيّف يطبّق
 * المرآة (storeCatIndex)، والقاموسان الحقيقيّان (ar.json/en.json)، وMemoryRouter. والمكوّناتُ
 * الثقيلةُ وحدها مستبدَلة (النافذة، الأزرار، الأصوات) — بشكلٍ يُبقي نصَّها وسماتِها.
 *
 * وما لا يُرسم (أثرٌ بعد ضغطة، رجوعُ الهاتف) يُفحص بدوالّه الخالصة التي تمرّ منها الألواح.
 *
 *   node scripts/store-admin-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const AR = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const EN = JSON.parse(readFileSync("src/i18n/en.json", "utf8"));
const root = process.cwd();

/* بدائلُ الرسم: t يقرأ القاموسَ المختار (globalThis.__dict) بقيمته الافتراضية وتعويضه كـi18next. */
const stubs = {
  name: "ssr-stubs",
  setup(b) {
    const map = {
      "react-i18next": `
        const get = (o, k) => k.split(".").reduce((a, s) => (a && typeof a === "object" ? a[s] : undefined), o);
        const fill = (s, v) => String(s).replace(/\\{\\{\\s*(\\w+)\\s*\\}\\}/g, (_, k) => (v && v[k] != null ? String(v[k]) : ""));
        export const t = (key, a, b) => {
          const opts = typeof a === "object" && a ? a : (b || {});
          const def = typeof a === "string" ? a : (opts.defaultValue ?? key);
          const hit = get(globalThis.__dict || {}, key);
          return fill(typeof hit === "string" ? hit : def, opts);
        };
        export const useTranslation = () => ({ t, i18n: { language: globalThis.__lang || "ar", dir: () => "rtl" } });
      `,
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "@/components/ui": `
        import { createElement as h } from "react";
        export const Button = ({ children, loading, leftIcon, variant, size, ...p }) => h("button", p, leftIcon, children);
        export const Skeleton = (p) => h("div", { "data-skeleton": "", className: p.className });
        export const useToast = () => ({ success() {}, error() {}, toast() {} });
      `,
      "@/components/Modal": `
        import { createElement as h } from "react";
        export const Modal = ({ open, title, children }) => (open ? h("div", { "data-modal": title }, children) : null);
      `,
      "@/lib/sounds": "export const playTap = () => {}; export const playSuccess = () => {}; export const playWarning = () => {};",
      "./repo": "export const repo = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__srv[k](...a) });",
      "./clinics": "export const getActiveClinicId = () => globalThis.__clinic;",
      "./clinicSync": "export const registerReset = (fn) => { globalThis.__reset = fn; };",
      // جلسةُ Supabase: معرّفُ الحساب الداخل (globalThis.__uid) — منها يُترجم «default» للمالك.
      "./supabase": "export const supabase = { auth: { getSession: async () => ({ data: { session: globalThis.__uid ? { user: { id: globalThis.__uid } } : null } }) } };",
    };
    const keys = Object.keys(map).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
    b.onResolve({ filter: new RegExp(`^(${keys})$`) }, (a) => ({ path: a.path, namespace: "ssr" }));
    b.onLoad({ filter: /.*/, namespace: "ssr" }, (a) => ({ contents: map[a.path], loader: "js", resolveDir: root }));
  },
};
async function load(contents, tag) {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: root, loader: "tsx", sourcefile: `${tag}.tsx` },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    plugins: [stubs], define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" }, tsconfig: "tsconfig.json",
  });
  const dir = mkdtempSync(join(tmpdir(), `${tag}-`));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

let M;
try {
  M = await load(`
    export { renderToStaticMarkup } from "react-dom/server.browser";
    export { createElement } from "react";
    export { MemoryRouter } from "react-router-dom";
    export { CategoriesTab } from "./src/components/store/admin/CategoriesTab.tsx";
    export { CategoryChecklist } from "./src/components/store/admin/CategoryChecklist.tsx";
    export { ProductDetailsSheet } from "./src/components/store/admin/ProductDetailsSheet.tsx";
    export { SortList } from "./src/components/store/admin/SortList.tsx";
    export * as S from "./src/lib/storeCats.ts";
    export * as X from "./src/lib/storeCatIndex.ts";
  `, "store-admin");
} catch (e) {
  console.error(`✗ store-admin-test: ما انبنت الألواح — ${String(e?.message ?? e).split("\n").slice(0, 3).join(" ")}`);
  process.exit(1);
}
const h = M.createElement;
const html = (el, lang = "ar") => {
  globalThis.__dict = lang === "en" ? EN : AR;
  globalThis.__lang = lang;
  return M.renderToStaticMarkup(h(M.MemoryRouter, null, el));
};
const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/* ── خادمٌ مزيّف يطبّق المرآة، ومنتجاتٌ بأصنافها ─────────────────────────── */
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = (id, name, category, extra = {}) => ({ id, name, category, subcategory: null, image_path: null, store_visible: true, sell_price: 1000, stock: 3, pooled: false, expiry_date: null, farm_id: null, ...extra });
const PRODUCTS = [P("m1", "درونتال", "medicine"), P("m2", "فرونتلاين", "medicine"), P("f1", "رويال كانين", "food"), P("a1", "طوق", "accessories", { store_visible: false })];
globalThis.__clinic = "C1";
const srv = { state: { seeded: true, cats: [], items: [] }, failList: null };
const NOW = "2026-10-13T00:00:00.000Z";
srv.state = M.X.applyOps(srv.state, [
  { op: "create", id: U(1), name: "أدوية", icon: "pill" }, { op: "create", id: U(2), name: "أغذية", icon: "food" },
  { op: "add", cat: U(1), ids: ["m2", "m1"] },
], { canEdit: true, now: NOW, isId: (x) => x.length > 0 });
srv.state = { ...srv.state, cats: srv.state.cats.map((c) => (c.id === U(1) ? { ...c, seed_key: "medicine" } : c)) };
globalThis.__srv = {
  storeCategoriesList: async () => { if (srv.failList) { const e = srv.failList; srv.failList = null; throw e; } return M.X.snapshotOf(srv.state, "C1", true, () => ({ listed: true })); },
  storeCategoriesApply: async (_c, ops) => { srv.state = M.X.applyOps(srv.state, ops, { canEdit: true, now: NOW, isId: (x) => x.length > 0 }); return M.X.snapshotOf(srv.state, "C1", true, () => ({ listed: true })); },
};
const ready = async () => { globalThis.__reset?.(); await M.S.loadStoreCats(true); };
const failedReread = async () => { await ready(); srv.failList = new TypeError("Failed to fetch"); await M.S.loadStoreCats(true); };
const cat1 = () => M.S.getStoreCatsState().view.cats.find((c) => c.id === U(1));
const guard = () => ({ current: null });

/* ── قراءةٌ ثانيةٌ فشلت: لا قولٌ كاذب، ولا رمزٌ خام ───────────────────────────── */
console.log("▸ «آخر تحديث فشل» يُقال ويُعاد — لا «ما اكو تصنيفات» ولا not_ready خام");
try {
  await failedReread();
  check("(الحالُ error ويبقى ما وصل)", M.S.getStoreCatsState().status === "error" && !!cat1());
  const list = html(h(M.CategoryChecklist, { cat: cat1(), products: PRODUCTS, canEdit: true, guard: guard(), onBack() {} }));
  check("قائمةُ التأشير تقول «آخر تحديث فشل» بزرّ إعادة", /data-catstale/.test(list) && text(list).includes(AR.cat.staleWarn) && text(list).includes(AR.common.retry));
  const sheet = (catsState) => text(html(h(M.ProductDetailsSheet, {
    p: PRODUCTS[0], onClose() {}, live: M.S.viewOf(M.S.getStoreCatsState().view).live, catsOf: () => [U(1)], catsState, onRetryCats() {},
    canPrice: true, onPhoto() {}, onLib() {}, onToggle() {}, onFeatured() {}, onPrice() {}, onSave: async () => {}, busy: false,
  })));
  check("ورقةُ التفاصيل بقراءةٍ فاشلةٍ بلا لقطة: «ما وصلنا للتصنيفات» بزرّ إعادة — لا «ما اكو تصنيفات بعد»",
    !sheet("error").includes(AR.cat.sheetNoCats) && sheet("error").includes(AR.cat.catsFailed) && sheet("error").includes(AR.common.retry), sheet("error").slice(0, 160));
  check("  وما زالت تتحمّل: لا «ما اكو تصنيفات بعد»", !sheet("loading").includes(AR.cat.sheetNoCats));
  check("  وعيادةٌ لم تبدأ تصنيفاتِها فعلاً: «ما اكو تصنيفات بعد» (القولُ الصادق باقٍ)", sheet("unseeded").includes(AR.cat.sheetNoCats));
  check("  وبلقطةٍ بيدها: الرقائقُ تُؤشَّر", /data-sheetcats/.test(html(h(M.ProductDetailsSheet, {
    p: PRODUCTS[0], onClose() {}, live: M.S.viewOf(M.S.getStoreCatsState().view).live, catsOf: () => [U(1)], catsState: "ready", onRetryCats() {},
    canPrice: true, onPhoto() {}, onLib() {}, onToggle() {}, onFeatured() {}, onPrice() {}, onSave: async () => {}, busy: false,
  }))));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
try {
  const C = await load('export { catError } from "./src/components/store/admin/catErrors.ts"; export { t } from "react-i18next";', "cat-errors");
  globalThis.__dict = AR;
  const said = C.catError(Object.assign(new Error("not_ready"), { code: "not_ready" }), C.t);
  const sw = C.catError(Object.assign(new Error("clinic_switched"), { code: "not_ready" }), C.t);
  check("رفضُ «not_ready» قبل الشبكة يُقال بالعربية", said === AR.cat.notReady && !/not_ready/.test(said), said);
  check("  و«clinic_switched» = «تبدّلت العيادة — حدّث الصفحة»", sw === AR.cat.switched, sw);
  check("  وما عداهما رسالةُ القاعدة (describeDbError)", C.catError({ code: "P0001", message: "x", hint: "تلميحٌ عربيّ" }, C.t) === "تلميحٌ عربيّ");
  const users = ["src/pages/ClinicStore.tsx", "src/components/store/admin/CategoriesTab.tsx", "src/components/store/admin/CategoryChecklist.tsx"]
    .filter((f) => /cats?\.apply\(/.test(readFileSync(f, "utf8")) && !/catError\(e, t\)/.test(readFileSync(f, "utf8")));
  check("  وكلُّ شاشةٍ تكتب بمتجر التصنيفات تقول رفضَه بـcatError", users.length === 0, users.join("، "));
} catch (e) { fails++; console.error(`   ✗ catError — ${String(e?.message ?? e).split("\n")[0]}`); }

/* ── ورقةُ التفاصيل: التأشيرُ نيّةٌ على الحيّ، لا صورةٌ لما رُئي لحظةَ الفتح ─────────────── */
console.log("▸ ورقةُ التفاصيل: تصنيفاتٌ وصلت بعد فتحها لا تُشال بحفظ الوصف");
try {
  await ready();
  const live = M.S.viewOf(M.S.getStoreCatsState().view).live;
  const sheetHtml = (member) => html(h(M.ProductDetailsSheet, {
    p: PRODUCTS[0], onClose() {}, live, catsOf: () => member, catsState: "ready", onRetryCats() {},
    canPrice: true, onPhoto() {}, onLib() {}, onToggle() {}, onFeatured() {}, onPrice() {}, onSave: async () => {}, busy: false,
  }));
  /* الرسمُ الأوّل قبل أيّ أثر = ما تراه الورقةُ حين تصل اللقطةُ بعد فتحها: كانت تُزرع مرّةً بأثرٍ على
   * [pid] من catsOf الفارغة، فتبقى الرقائقُ فارغةً و«احفظ» مفعّلاً — وحفظُ الوصف يشيل المادةَ من رفوفها. */
  const s = sheetHtml([U(1)]);
  const chip = (id) => new RegExp(`<label[^>]*>(?:(?!</label>).)*<input[^>]*type="checkbox"[^>]*>(?:(?!</label>).)*${live.find((c) => c.id === id).name}`).exec(s)?.[0] ?? "";
  check("عضويةُ المادة الحيّة مؤشَّرةٌ بالرسم نفسِه (لا تنتظر زرعاً)", /checked=""/.test(chip(U(1))) && !/checked=""/.test(chip(U(2))), chip(U(1)).slice(0, 120));
  check("  و«احفظ» معطَّلٌ ما دام لا شيءَ تغيّر", /<button[^>]*disabled=""[^>]*data-sheetsave/.test(s) || /data-sheetsave[^>]*disabled=""/.test(s));
  const src = readFileSync("src/components/store/admin/ProductDetailsSheet.tsx", "utf8");
  check("  ولا تُزرع التصنيفاتُ من catsOf بأثر (الحيُّ يُقرأ كلَّ رسم، والتأشيرُ فرقٌ عليه)", !/set\w*\(new Set\(catsOf\(/.test(src));
  const cs = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  check("  والحفظُ يبني عملياته من toggleOps على الحيّ لحظةَ الحفظ", /toggleOps\(p\.id, new Set\(cats\.catsOf\(p\.id\)\), change\.cats\)/.test(cs));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

/* ── منتجاتٌ لم تصل (أو فشلت) ليست «صفرَ منتجات» ───────────────────────────── */
console.log("▸ «التصنيفات» قبل وصول المنتجات: لا «٠ مادة»، ولا قائمةُ تأشيرٍ فارغة، ولا ترتيبٌ مجمَّدٌ على لا شيء");
try {
  await ready();
  const zero = (s) => text(s).includes(AR.cat.counts.replace("{{n}}", "0").replace("{{m}}", "0"));
  const tab = html(h(M.CategoriesTab, { products: null, productsFailed: false, onRetryProducts() {}, guard: guard() }));
  check("الأعدادُ لا تقول «٠ مادة · ٠ يشوفها الزبون» والمنتجاتُ تتحمّل", !zero(tab) && /data-catrow/.test(tab), text(tab).slice(0, 200));
  check("  ومكانُها مؤشّرُ تحميل", /data-countsloading/.test(tab));
  const tabFail = html(h(M.CategoriesTab, { products: null, productsFailed: true, onRetryProducts() {}, guard: guard() }));
  check("  وفشلُ تحميلها يُقال بشريطٍ وإعادة (لا أصفارٌ تحت شريطٍ عن الطلبات)", !zero(tabFail) && text(tabFail).includes(AR.cat.itemsFailed) && text(tabFail).includes(AR.common.retry));
  check("  وبالمنتجات: الأعدادُ الحقيقية (٢ مادة)", text(html(h(M.CategoriesTab, { products: PRODUCTS, productsFailed: false, onRetryProducts() {}, guard: guard() })))
    .includes(AR.cat.counts.replace("{{n}}", "2").replace("{{m}}", "2")));
  const chk = html(h(M.CategoryChecklist, { cat: cat1(), products: null, productsFailed: false, onRetryProducts() {}, canEdit: true, guard: guard(), onBack() {} }));
  check("قائمةُ التأشير والمنتجاتُ تتحمّل: لا «ما اكو مواد مطابقة» ولا «٠ مؤشّرة من ٠» — هيكلُ تحميل",
    !text(chk).includes(AR.cat.checkEmpty) && !text(chk).includes(AR.cat.checkCount.replace("{{n}}", "0").replace("{{m}}", "0")) && /data-skeleton/.test(chk), text(chk).slice(0, 200));
  const chkFail = html(h(M.CategoryChecklist, { cat: cat1(), products: null, productsFailed: true, onRetryProducts() {}, canEdit: true, guard: guard(), onBack() {} }));
  check("  وفشلُها يُقال بإعادة", text(chkFail).includes(AR.cat.itemsFailed) && text(chkFail).includes(AR.common.retry));
  const full = html(h(M.CategoryChecklist, { cat: cat1(), products: PRODUCTS, productsFailed: false, onRetryProducts() {}, canEdit: true, guard: guard(), onBack() {} }));
  const rowsOrder = [...full.matchAll(/data-checkrow[\s\S]*?dir="auto">([^<]+)</g)].map((m) => m[1]);
  check("  وبالمنتجات: الأعضاءُ أوّلاً بترتيب العيادة مؤشَّرين، ثم الباقي بالاسم (O3)",
    JSON.stringify(rowsOrder.slice(0, 2)) === JSON.stringify(["فرونتلاين", "درونتال"]) && rowsOrder.length === 4, rowsOrder.join("، "));
  const O = M.S.checklistOpen;
  check("checklistOpen: الأعضاءُ بترتيبهم ثم الباقي بالاسم، ولافتةُ البذرة صنفُها وليست فيه",
    typeof O === "function" && JSON.stringify(O(["m2", "m1"], PRODUCTS, "medicine")) === JSON.stringify({ order: ["m2", "m1", "رويال كانين", "طوق"].map((x) => PRODUCTS.find((p) => p.name === x)?.id ?? x), seedPool: [] })
    && JSON.stringify(O(["m2"], PRODUCTS, "medicine").seedPool) === '["m1"]');
  const src = readFileSync("src/components/store/admin/CategoryChecklist.tsx", "utf8");
  check("  والتجميدُ لحظةَ وصول المنتجات لا لحظةَ الفتح (مصفوفةٌ فارغةٌ عن «لم تصل» لا تُجمَّد)", /if \(!opened\.current && products\) opened\.current = checklistOpen\(/.test(src));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

/* ── الأسهمُ لا تختفي أثناء الحفظ: ما تحت الإصبع لا يتبدّل ──────────────────── */
console.log("▸ الترتيبُ بالأسهم (الهاتف): الحفظُ الجاري لا يُخفي الأسهم فيقع الإصبعُ على «تعديل»");
try {
  const row = (id, { handle, arrows }) => h("div", { "data-row": id }, handle, arrows, h("button", { "data-catmenu": "" }, "…"));
  const ed = html(h(M.SortList, { ids: ["a", "b", "c"], readOnly: false, onMove() {}, row }));
  const ro = html(h(M.SortList, { ids: ["a", "b", "c"], readOnly: true, onMove() {}, row }));
  check("للمحرّر: أسهمٌ ومقبضٌ لكلّ صفّ", (ed.match(/data-sortarrows/g) ?? []).length === 3 && (ed.match(/data-sorthandle/g) ?? []).length === 3);
  check("  وبلا حقّ الترتيب (المصوّر): لا أسهم ولا مقبض", !/data-sortarrows|data-sorthandle/.test(ro));
  const bz = html(h(M.SortList, { ids: ["a", "b", "c"], readOnly: false, busy: true, onMove() {}, row }));
  const arrowsOf = (s) => [...s.matchAll(/data-sortarrows[\s\S]*?<\/span>/g)].map((m) => m[0]);
  check("  والحفظُ بالطريق: الأسهمُ **بمكانها** (٣ صفوف) ومعطَّلةٌ كلُّها — لا تختفي فيقفز «…» تحت الإصبع",
    arrowsOf(bz).length === 3 && arrowsOf(bz).every((a) => (a.match(/<button/g) ?? []).length === 3 && (a.match(/disabled=""/g) ?? []).length === 3), arrowsOf(bz)[1]?.slice(0, 160));
  const tab = readFileSync("src/components/store/admin/CategoriesTab.tsx", "utf8");
  check("  و«التصنيفات» يُخفيها بالحقّ وحده، والحفظُ يعطّلها بمكانها (كان `disabled={!canEdit || busy}` ⇒ تختفي بين ضغطتين)",
    /<SortList ids=\{ids\} readOnly=\{!cats\.canEdit\} busy=\{busy\}/.test(tab));
  check("  ولا بابَ في SortList يُخفيها بغير الحقّ", !/\bdisabled\s*\?\s*null/.test(readFileSync("src/components/store/admin/SortList.tsx", "utf8")));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

/* ── الإنكليزية: أصنافُ المخزون بأسمائها المترجمة لا بعربية واجهة الزبون ─────────────── */
console.log("▸ قائمةُ التأشير بالإنكليزية: «Tick all items of kind: Medicine» لا «… أدوية»");
try {
  await ready();
  const food = { ...M.S.getStoreCatsState().view.cats.find((c) => c.id === U(2)), seed_key: "food" };
  const props = { products: PRODUCTS, productsFailed: false, onRetryProducts() {}, canEdit: true, guard: guard(), onBack() {} };
  const en = html(h(M.CategoryChecklist, { ...props, cat: food }), "en");
  const opts = [...en.matchAll(/<option value="(medicine|food|accessories)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  const fill = (s, v) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k]));
  check("اختيارُ الصنف السريع: كلُّ خيارٍ باسم الصنف المترجم (pos.cat.*)",
    opts.length === 3 && opts.every(([k, label]) => label === fill(EN.cat.quickPick, { name: EN.pos.cat[k], n: PRODUCTS.filter((p) => p.category === k).length })), opts.map((o) => o[1]).join(" | "));
  const banner = /data-seedbanner[\s\S]*?<\/span>/.exec(en)?.[0] ?? "";
  check("  ولافتةُ البذرة كذلك («Items of kind Food …»)", text(banner).includes(fill(EN.cat.seedBanner, { name: EN.pos.cat.food, n: 1 })), text(banner).slice(0, 120));
  check("  ولا عربيةَ في الخيارات واللافتة (بيانُ العيادة وحده عربيّ: الأسماء)", !/[؀-ۿ]/.test(opts.map((o) => o[1]).join("") + text(banner)));
  const ar = html(h(M.CategoryChecklist, { ...props, cat: food }));
  check("  وبالعربية اسمُ الصنف كما بالمخزون (pos.cat)", ar.includes(fill(AR.cat.quickPick, { name: AR.pos.cat.medicine, n: 2 })));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

/* ── زرُّ رجوع الهاتف بقائمة التأشير: يُغلقها، ولا يُسقط تأشيراً بلا سؤال ─────────────── */
console.log("▸ رجوعُ الهاتف بقائمة التأشير: مدخلٌ بالسجلّ، والتأشيرُ المعلّق يسأل");
try {
  const H = await load('export * from "./src/lib/checkHistory.ts";', "check-history");
  /* سجلٌّ مزيّف بنفس العنوان (/store) ونموذجُ الربط كما بالألواح: الفتحُ يدفع العلامة، وتبدّلُها يُقرَّر
   * بـonCatcheckChange، والإغلاقُ من الشاشة navigate(-1) ما دامت العلامةُ علامتَها. ‎idx = -1 خارج المتجر. */
  const sim = () => {
    const s = { entries: [{ usr: "قبل" }], idx: 0, openId: null, seen: false, dirty: false, asked: 0 };
    const cur = () => (s.idx < 0 ? null : s.entries[s.idx]);
    const marker = () => H.readCatcheck(cur());
    const onLocation = () => {
      if (!s.openId) return;
      if (marker() === s.openId) { s.seen = true; return; }
      const d = H.onCatcheckChange(marker(), s.openId, s.seen, s.dirty);
      if (d === "close") { s.openId = null; s.seen = false; }
      else if (d === "hold") { s.entries = [...s.entries.slice(0, s.idx + 1), H.withCatcheck(cur(), s.openId)]; s.idx++; s.asked++; onLocation(); }
    };
    s.open = (id) => { s.openId = id; s.entries = [...s.entries.slice(0, s.idx + 1), H.withCatcheck(cur(), id)]; s.idx++; onLocation(); };
    s.back = () => { s.idx--; onLocation(); };                       // زرُّ الهاتف/المتصفّح
    s.close = () => { if (marker() === s.openId) s.back(); else s.openId = null; };   // السهمُ بالشاشة
    s.marker = marker;
    return s;
  };
  {
    const s = sim();
    s.open("X");
    check("فتحُ تصنيفٍ يدفع مدخلاً بعلامته (والحالةُ الأخرى تبقى)", s.idx === 1 && s.marker() === "X" && s.entries[1].usr === "قبل");
    s.dirty = true; s.back();
    check("رجوعٌ والتأشيرُ لم يُحفظ ⇒ القائمةُ باقيةٌ بعلامتها والورقةُ تسأل (لا خروج)", s.openId === "X" && s.asked === 1 && s.marker() === "X" && s.idx === 1);
    s.dirty = false; s.close();   // «اترك التغييرات»: تراجعٌ ثم الإغلاقُ نفسُه
    check("  «اترك التغييرات» ⇒ تُغلق ويُسحب مدخلُها", s.openId === null && s.idx === 0 && s.marker() === null);
    s.back();
    check("  ورجوعٌ بعدها يُخرج من المتجر — لا ضغطةٌ ميتة", s.idx === -1);
  }
  {
    const s = sim();
    s.open("X"); s.back();
    check("بلا تأشيرٍ معلّق: رجوعٌ واحدٌ يُغلقها ويبقى بالمتجر", s.openId === null && s.idx === 0 && s.asked === 0);
    s.open("Y"); s.close();
    check("  والسهمُ بالشاشة = رجوعٌ واحد (لا مدخلٌ يبقى)", s.openId === null && s.idx === 0);
  }
  check("فُتحت بلا علامة (لم ترَها): غيابُها ليس رجوعاً", H.onCatcheckChange(null, "X", false, true) === "none");
  check("withCatcheck/readCatcheck: علامةٌ تُضاف وتُشال، وغريبٌ = لا علامة",
    H.readCatcheck(H.withCatcheck({ a: 1 }, "X")) === "X" && H.withCatcheck({ a: 1, catcheck: "X" }, null).catcheck === undefined && H.withCatcheck({ a: 1 }, "X").a === 1
    && H.readCatcheck(null) === null && H.readCatcheck({ catcheck: 3 }) === null);
  const tab = readFileSync("src/components/store/admin/CategoriesTab.tsx", "utf8");
  const chk = readFileSync("src/components/store/admin/CategoryChecklist.tsx", "utf8");
  const cs = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  check("الربط: «التصنيفات» يفتح بدفع العلامة، ويفتح ما تقوله العلامةُ (رجوعٌ للأمام/إعادةُ تحميل)",
    /navigate\(loc\.pathname \+ loc\.search, \{ state: withCatcheck\(loc\.state, id\) \}\)/.test(tab) && /useState<string \| null>\(\(\) => readCatcheck\(loc\.state\)\)/.test(tab));
  check("  وقائمةُ التأشير تقرّر بـonCatcheckChange وتدفع العلامةَ ثانيةً وتسأل، وتُغلق بـnavigate(-1)",
    /onCatcheckChange\(marker, cat\.id, seen\.current, dirty\)/.test(chk) && /state: withCatcheck\(loc\.state, cat\.id\)/.test(chk) && /navigate\(-1\)/.test(chk));
  check("  وتبويبٌ آخر يسحب مدخلَها (لا ضغطةٌ ميتة بعدها)", /guard\.current = \(proceed\)/.test(chk) && /dropEntry\(\)/.test(chk));
  check("  والمتجرُ يُفتح على «التصنيفات» إن كانت العلامةُ بالمدخل", /readCatcheck\(loc\.state\) \? "cats"/.test(cs));
  check("  وبلا pushState خامّ (الموجّهُ وحده يملك السجلّ)", !/history\.(pushState|replaceState)/.test(tab + chk + cs));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

console.log("▸ صاحبُ العيادة يفتح «التصنيفات»: لا «تبدّلت العيادة» (١٣/١٠)");
try {
  /* مقيسٌ بالإنتاج: المالكون التسعة كلُّهم بلا مفتاحٍ محلّيّ (profiles.clinic_id فارغ) فمفتاحُهم
   * «default»؛ والمقارنةُ بالمفتاح الخامّ رسمت «تبدّلت العيادة — حدّث الصفحة» لكلّ صاحب عيادة. */
  const open = async (clinic, uid) => {
    globalThis.__clinic = clinic; globalThis.__uid = uid;
    globalThis.__reset?.(); await M.S.loadStoreCats(true);
    return M.S.getStoreCatsState();
  };
  const owner = await open("default", "C1");
  check("مالكٌ بعيادته (default + جلستُه C1 = ختمُ الخادم) ⇒ ready بتصنيفاته", owner.status === "ready" && owner.clinic === "C1" && !!cat1(), owner.status);
  const tab = text(html(h(M.CategoriesTab, { products: PRODUCTS })));
  check("  واللوحةُ لا تقول «تبدّلت العيادة»", !tab.includes(AR.cat.switched), tab.slice(0, 120));
  check("قبل أن يستقرّ المفتاح (default + جلستُه حسابُه، والخادمُ عيادةٌ أخرى — مشغّلٌ قبل إعادة التحميل) ⇒ switched", (await open("default", "OP")).status === "switched");
  check("  واللوحةُ تقولها (الرسالةُ نفسُها التي رآها المالكون)", text(html(h(M.CategoriesTab, { products: PRODUCTS }))).includes(AR.cat.switched));
  check("بلا جلسة ⇒ switched لا ready", (await open("default", null)).status === "switched");
  check("موظّفٌ بمفتاح عيادته ⇒ ready ولو اختلف معرّفُ حسابه", (await open("C1", "S7")).status === "ready");
  check("مفتاحُ عيادةٍ أخرى ⇒ switched (الحارسُ باقٍ)", (await open("C2", "C2")).status === "switched");
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
globalThis.__clinic = "C1"; globalThis.__uid = undefined;

console.log(fails ? `\n✗ store-admin-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ store-admin-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
