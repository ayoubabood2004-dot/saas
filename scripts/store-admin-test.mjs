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

console.log(fails ? `\n✗ store-admin-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ store-admin-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
