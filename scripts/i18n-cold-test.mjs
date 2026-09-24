/* ============================================================================
 * فحصُ النصف البارد — «الصفحةُ لا تُرسم قبل نصوصها، والقسمةُ لا تُضيّع ورقة».
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * `ar.json` كلُّه كان بحزمة الإقلاع، فكلُّ نصٍّ لشاشةٍ عميقةٍ يُدفع من مسار
 * الإقلاع. فقُسم عند البناء (`scripts/i18n-split.mjs`): حارٌّ مع القشرة، وباردٌ
 * يصل بـ`ensureDictionary()` وتنتظره كلُّ صفحةٍ (`page()`). والخطرُ الذي يقيسه
 * هذا الفحص ليس «هل خفّ الإقلاع» (ذاك لـ`store-weight-guard`) بل ما يدفعه
 * المستخدمُ إن انكسرت القسمة: مفتاحٌ خامٌ بشاشة عيادة، أو إنكليزيةٌ على شاشةٍ
 * عربية، أو قائمةُ صياغاتِ واتساب فارغةٌ تُرسل رسالةً فارغةً لزبون، أو تفضيلُ
 * لغةٍ محفوظٌ واتجاهٌ مقلوبٌ بلا نصوصه.
 *
 * ثلاثةُ أجزاء، كلُّها على الشِفرة الحقيقية لا نسخةٍ منها — `index.ts`
 * و`lazyPage.ts` و`waTemplates.ts` وi18next وreact-i18next وreact-dom/server
 * الحقيقيّة — بنفس دالّة القسمة التي يستعملها البناء:
 *   A  سلامةُ القسمة: النصفان معاً = ar.json حرفاً بحرف، لا ورقةَ بالاثنين،
 *      المصفوفةُ كاملةٌ بنصفٍ واحد، والباردُ ٥٠ نطاقاً فأكثر (قسمةٌ لا تقسم شيئاً
 *      تمرّ كلَّ فحصٍ آخر). و`splitAr` ترمي على المسار الخاطئ لا تتجاهله.
 *   B  التشغيل: الإقلاعُ العربيّ لا يحمل الباردَ، والتحميلُ مرّةً واحدة، والفشلُ
 *      يُرمى ويُعاد، والإنكليزيةُ لا تنزّله، والسورانيةُ تنزّله، و`setLang` لا
 *      يحفظ شيئاً قبل وصوله، و`changeLanguage("ar")` المباشر يطلبه.
 *   C  الرسم: صفحةُ الهبوط الحقيقية عبر `lazy()` عارٍ تُظهر مفاتيحَ خاماً (شاهدٌ
 *      سلبيّ: الفحصُ يرى العطبَ الذي يحرسه)، وعبر `page()` لا تُظهر واحداً؛ ثم
 *      ورقةٌ بلا نصٍّ افتراضيّ من **كلّ** نطاقٍ بارد تُرسم بعربيتها.
 *
 * الملفّاتُ المؤقّتة بـ`os.tmpdir()`، ونسخةٌ جديدةٌ من الحزمة لكلّ إقلاع — فلا
 * يرث سيناريو حالةَ آخر (i18next مفردٌ بالوحدة).
 *
 *   node scripts/i18n-cold-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { splitFromTree, splitAr, readAr, readHotPaths, readStoreKeys, leafPaths, esbuildI18nSplit, coldModuleSource } from "./i18n-split.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const t0 = Date.now();
let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const TMP = [];
const finish = () => {
  for (const d of TMP) rmSync(d, { recursive: true, force: true });
  console.log(`\n${fails ? "✗" : "✓"} i18n-cold-test: ${passes} نجحت، ${fails} فشلت (${Date.now() - t0}ms)`);
  process.exit(fails ? 1 : 0);
};

const isObj = (v) => v !== null && typeof v === "object";
const at = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ar = readAr(ROOT);
const ckb = JSON.parse(readFileSync(path.join(ROOT, "src/i18n/ckb.json"), "utf8"));

/* ── A) سلامةُ القسمة ─────────────────────────────────────────────────────── */
console.log("▸ A) سلامةُ القسمة");
let split = null;
try { split = splitFromTree(ROOT); }
catch (e) { check("القسمةُ تُبنى من hot-paths.json وar.json", false, e.message); }
if (split) {
  const merge = (a, b) => {
    const out = Array.isArray(a) ? [...a] : { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out && isObj(out[k]) && isObj(v) && !Array.isArray(v) ? merge(out[k], v) : v;
    return out;
  };
  // المقارنةُ بترتيب ar.json المكتوب — القسمةُ تمشيه بترتيبه، فالدمجُ يُرتَّب عليه.
  const reorder = (shape, o) => (isObj(shape) && !Array.isArray(shape) ? Object.fromEntries(Object.keys(shape).filter((k) => k in o).map((k) => [k, reorder(shape[k], o[k])])) : o);
  check("النصفان معاً = ar.json حرفاً بحرف", deepEqual(reorder(ar, merge(split.hot, split.cold)), ar));
  const hl = new Set(leafPaths(split.hot)), cl = leafPaths(split.cold);
  const both = cl.filter((l) => hl.has(l));
  check("لا ورقةَ بالنصفين (دمجٌ عميقٌ لا يطمس شيئاً)", both.length === 0, both.slice(0, 5).join("، "));
  check("مجموعُ الأوراق = أوراقُ ar.json", hl.size + cl.length === leafPaths(ar).length, `${hl.size} + ${cl.length} ≠ ${leafPaths(ar).length}`);
  const arrays = [];
  (function walk(o, p) { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (Array.isArray(v)) arrays.push(q); else if (isObj(v)) walk(v, q); } })(ar, "");
  const broken = arrays.filter((a) => {
    const h = at(split.hot, a), c = at(split.cold, a);
    return !((deepEqual(h, at(ar, a)) && c === undefined) || (deepEqual(c, at(ar, a)) && h === undefined));
  });
  check(`المصفوفاتُ (${arrays.length}) كاملةٌ بنصفٍ واحد`, arrays.length > 0 && broken.length === 0, broken.join("، "));
  const coldNs = Object.keys(split.cold).length;
  check(`النصفُ البارد ${coldNs} نطاقاً (٥٠ فأكثر — وإلا فالقسمةُ لا تقسم)`, coldNs >= 50);
  const hot = readHotPaths(ROOT), store = readStoreKeys(ROOT);
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };
  check("splitAr ترمي على مسارٍ لا وجودَ له", throws(() => splitAr(ar, [...hot, "noSuchNs.x"], store)));
  const arr0 = arrays[0];
  check(`splitAr ترمي على مسارٍ داخل مصفوفة (${arr0}.0)`, !!arr0 && throws(() => splitAr(ar, [...hot, `${arr0}.0`], store)));
  check("splitAr ترمي على نطاقٍ من store.ar.json غيرِ حارّ", throws(() => splitAr(ar, hot.filter((h) => h !== store[0]), store)));
  const inner = hot.find((h) => isObj(ar[h]) && Object.keys(ar[h]).length);
  check("splitAr ترمي على مسارين متداخلين", !!inner && throws(() => splitAr(ar, [...hot, `${inner}.${Object.keys(ar[inner])[0]}`], store)));
}
if (!split) { console.error("   ✗ B وC يحتاجان القسمة — لم يُشغَّلا"); fails++; finish(); }

/* المفاتيحُ المختارة للفحص — من القسمة نفسِها لا بيد. */
const plain = (v) => typeof v === "string" && v.trim() && !/\{\{|\$t\(|[<>&"']/.test(v);
const hotKey = leafPaths(split.hot).find((l) => plain(at(ar, l)));
const coldKey = leafPaths(split.cold).find((l) => plain(at(ar, l)) && /[؀-ۿ]/.test(at(ar, l)) && at(ckb, l) === undefined);

/* ── حُزمٌ حقيقية بـesbuild ─────────────────────────────────────────────── */
const COLD_SRC = coldModuleSource(split.cold);
const ENV = JSON.stringify({ DEV: false, PROD: true, MODE: "production", BASE_URL: "/" });
async function bundle(entry, extraPlugins = []) {
  const r = await esbuild.build({
    stdin: { contents: entry, resolveDir: path.join(ROOT, "src"), loader: "tsx", sourcefile: "cold-test-entry.tsx" },
    bundle: true, format: "esm", platform: "node", write: false, jsx: "automatic", absWorkingDir: ROOT,
    alias: { "@": path.join(ROOT, "src") },
    define: { "import.meta.env": ENV, "process.env.NODE_ENV": '"production"', __BUILD_AT__: '"cold-test"' },
    loader: { ".json": "json", ".svg": "dataurl", ".png": "dataurl", ".jpg": "dataurl", ".webp": "dataurl", ".css": "empty" },
    plugins: [esbuildI18nSplit({ root: ROOT, coldExternal: "./arCold.mjs", split }), ...extraPlugins],
    banner: { js: 'import { createRequire as __cr } from "module"; const require = __cr(import.meta.url);' },
    logLevel: "silent",
  });
  return r.outputFiles[0].text;
}

/** متصفّحٌ بالحدّ الأدنى — يكفي `index.ts` و`appUpdate.ts` وصفحةَ الهبوط. */
function browser({ lang = null, online = true } = {}) {
  const store = () => {
    const m = new Map();
    return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  };
  const ls = store(), ss = store();
  if (lang) ls.m.set("vp_lang", lang);
  const el = { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null };
  const reloads = { n: 0 };
  globalThis.localStorage = ls;
  globalThis.sessionStorage = ss;
  globalThis.document = {
    documentElement: el, head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } },
    addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), visibilityState: "visible",
  };
  globalThis.window = {
    localStorage: ls, sessionStorage: ss, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    location: { hostname: "localhost", host: "localhost", search: "", hash: "", pathname: "/", origin: "http://localhost", href: "http://localhost/", reload() { reloads.n++; } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    setTimeout, clearTimeout, requestAnimationFrame: (f) => setTimeout(f, 0),
  };
  Object.defineProperty(globalThis, "navigator", { value: { onLine: online, language: "ar", userAgent: "node", serviceWorker: { getRegistrations: async () => [] } }, configurable: true, writable: true });
  globalThis.caches = { keys: async () => [], delete: async () => true };
  globalThis.__arColdEvals = 0;
  return { ls, el, reloads };
}

/** يكتب الحزمةَ بمجلّدٍ جديد (ومعها النصفُ البارد إن طُلب) ويحمّلها — إقلاعٌ جديد. */
async function boot(code, { cold = true } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "vp-cold-"));
  TMP.push(dir);
  writeFileSync(path.join(dir, "bundle.mjs"), code);
  const coldFile = path.join(dir, "arCold.mjs");
  if (cold) writeFileSync(coldFile, COLD_SRC);
  const mod = await import(pathToFileURL(path.join(dir, "bundle.mjs")).href);
  return { mod, putCold: () => writeFileSync(coldFile, COLD_SRC), dropCold: () => rmSync(coldFile, { force: true }) };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const unhandled = [];
process.on("unhandledRejection", (r) => { unhandled.push(r); });

/* ── B) التشغيل ─────────────────────────────────────────────────────────── */
console.log("▸ B) التشغيل");
let codeB = null;
try {
  codeB = await bundle(`export * as I18N from "@/i18n";\nexport * as WA from "@/lib/waTemplates";\n`);
} catch (e) { check("حزمةُ index.ts وwaTemplates.ts تُبنى", false, e.message.split("\n")[0]); }

if (codeB) {
  const ensureOf = (mod) => (typeof mod.I18N.ensureDictionary === "function" ? mod.I18N.ensureDictionary : null);

  { // B1 + B2 + B3 + B4: إقلاعٌ عربيّ
    browser();
    const { mod } = await boot(codeB);
    const i18n = mod.I18N.default;
    check(`B1 إقلاعٌ عربيّ: المفتاحُ الحارّ عربيّ (${hotKey})`, i18n.t(hotKey) === at(ar, hotKey), `طلع «${i18n.t(hotKey)}»`);
    check(`B1   والمفتاحُ البارد لم يصل بعد (${coldKey}) — الإقلاعُ لا يحمل النصفَ البارد`, i18n.t(coldKey) === coldKey, `طلع «${i18n.t(coldKey)}» — القاموسُ كلُّه بالإقلاع`);
    check("B1   ولم تُقيَّم وحدةُ النصف البارد عند الإقلاع", globalThis.__arColdEvals === 0, `قُيّمت ${globalThis.__arColdEvals}`);
    let threw = false, got;
    try { got = mod.WA.waVariants("rem.vaccine"); } catch { threw = true; }
    check("B2 waVariants ترمي قبل وصول النصف البارد (لا قائمةَ فارغة تصوغ رسالةً فارغة)", threw, `أرجعت ${JSON.stringify(got)?.slice(0, 40)}`);
    const ensure = ensureOf(mod);
    check("ensureDictionary مُصدَّرة من @/i18n", !!ensure);
    if (ensure) {
      const ps = [ensure(), ensure(), ensure()];
      await Promise.all(ps);
      check("B4 ثلاثةُ نداءاتٍ متزامنة ⇐ تقييمٌ واحدٌ للنصف البارد", globalThis.__arColdEvals === 1, `قُيّم ${globalThis.__arColdEvals}`);
      const bad = [];
      let n = 0;
      (function walk(o, p) {
        for (const [k, v] of Object.entries(o)) {
          const q = p ? `${p}.${k}` : k;
          if (Array.isArray(v)) { n++; if (!deepEqual(i18n.t(q, { returnObjects: true, nsSeparator: false }), v)) bad.push(q); }
          else if (isObj(v)) walk(v, q);
          else { n++; if (i18n.t(q, { skipInterpolation: true, nsSeparator: false }) !== v) bad.push(q); }
        }
      })(ar, "");
      check(`B3 بعد ensureDictionary: كلُّ الأوراق (${n}، والمصفوفاتُ بـreturnObjects) = ar.json`, bad.length === 0, `${bad.length} مختلفة، مثل ${bad.slice(0, 4).join("، ")}`);
      let arr;
      try { arr = mod.WA.waVariants("rem.vaccine"); } catch { arr = null; }
      check("B2   وبعد وصوله تُرجع صياغاتِها كاملة", deepEqual(arr, at(ar, "waMsgs.rem.vaccine")));
    }
  }

  { // B3b: نطاقٌ مقسومٌ بين النصفين (ورقةٌ منه حارّة) — الدمجُ السطحيّ كان سيمحو الحارّة
    const ns = Object.keys(split.cold).find((n) => isObj(ar[n]) && Object.keys(ar[n]).length > 1);
    const leaf = `${ns}.${Object.keys(ar[ns])[0]}`;
    const partial = splitAr(ar, [...readHotPaths(ROOT), leaf], readStoreKeys(ROOT));
    let code = null;
    try {
      const r = await esbuild.build({
        stdin: { contents: `export * as I18N from "@/i18n";\n`, resolveDir: path.join(ROOT, "src"), loader: "ts" },
        bundle: true, format: "esm", platform: "node", write: false, absWorkingDir: ROOT, alias: { "@": path.join(ROOT, "src") },
        define: { "import.meta.env": ENV }, loader: { ".json": "json" }, logLevel: "silent",
        plugins: [esbuildI18nSplit({ root: ROOT, coldExternal: "./arCold.mjs", split: partial })],
        banner: { js: 'import { createRequire as __cr } from "module"; const require = __cr(import.meta.url);' },
      });
      code = r.outputFiles[0].text;
    } catch (e) { check("حزمةُ القسمة الجزئية تُبنى", false, e.message.split("\n")[0]); }
    if (code) {
      browser();
      const dir = mkdtempSync(path.join(os.tmpdir(), "vp-cold-"));
      TMP.push(dir);
      writeFileSync(path.join(dir, "bundle.mjs"), code);
      writeFileSync(path.join(dir, "arCold.mjs"), coldModuleSource(partial.cold));
      const mod = await import(pathToFileURL(path.join(dir, "bundle.mjs")).href);
      const ensure = typeof mod.I18N.ensureDictionary === "function" ? mod.I18N.ensureDictionary : null;
      if (ensure) await ensure();
      const i18n = mod.I18N.default;
      const lost = leafPaths(ar[ns], ns).filter((l) => typeof at(ar, l) === "string" && i18n.t(l, { skipInterpolation: true }) !== at(ar, l));
      check(`B3b نطاقٌ مقسومٌ (${leaf} حارّة والباقي بارد): بعد الدمج كلُّ أوراق ${ns} حاضرة`, !!ensure && lost.length === 0, `${lost.length} ضائعة، مثل ${lost.slice(0, 3).join("، ")}`);
    }
  }

  { // B5: الإنكليزية لا تنزّل النصفَ البارد
    browser({ lang: "en" });
    const { mod } = await boot(codeB);
    await mod.I18N.i18nReady;
    const ensure = ensureOf(mod);
    if (ensure) await ensure();
    await tick(20);
    check("B5 vp_lang=en: النصفُ البارد لا يُقيَّم أبداً", !!ensure && globalThis.__arColdEvals === 0 && mod.I18N.default.language === "en",
      ensure ? `قُيّم ${globalThis.__arColdEvals}، واللغة ${mod.I18N.default.language}` : "ensureDictionary غير موجودة");
  }

  { // B6: السورانية تسقط للعربية فتنزّله
    browser({ lang: "ckb" });
    const { mod } = await boot(codeB);
    await mod.I18N.i18nReady;
    const ensure = ensureOf(mod);
    if (ensure) await ensure();
    const i18n = mod.I18N.default;
    check(`B6 vp_lang=ckb: النصفُ البارد يُقيَّم مرّة، و${coldKey} (غائبٌ عن ckb) يسقط لعربيته`,
      !!ensure && globalThis.__arColdEvals === 1 && i18n.language === "ckb" && i18n.t(coldKey) === at(ar, coldKey),
      `قُيّم ${globalThis.__arColdEvals}، اللغة ${i18n.language}، طلع «${i18n.t(coldKey)}»`);
  }

  { // B7: الفشلُ يُرمى، ويُعاد، والتعافي مرّةً واحدة
    const env = browser({ online: false });
    const { mod, putCold } = await boot(codeB, { cold: false });
    const ensure = ensureOf(mod);
    let rejected = false;
    if (ensure) { try { await ensure(); } catch { rejected = true; } }
    check("B7 النصفُ البارد فشل ⇐ ensureDictionary ترفض (لا تبلع)", !!ensure && rejected);
    check("B7   وبلا إنترنت لا تعافي (مسحُ المخبأ بلا شبكةٍ ضرر)", env.reloads.n === 0, `أُعيد التحميل ${env.reloads.n}`);
    putCold();
    let ok = false;
    if (ensure) { try { await ensure(); ok = true; } catch { ok = false; } }
    check("B7   والنداءُ التالي يعيد المحاولة وينجح (الوعدُ المرفوض لا يُحفظ)", ok && mod.I18N.default.t(coldKey) === at(ar, coldKey));
  }
  {
    const env = browser({ online: true });
    const { mod } = await boot(codeB, { cold: false });
    const ensure = ensureOf(mod);
    if (ensure) {
      ensure().catch(() => {});
      ensure().catch(() => {});
      for (let i = 0; i < 50 && env.reloads.n === 0; i++) await tick(10);
      await tick(30);
    }
    check("B7   وبإنترنت: قشرةٌ قديمة ⇐ تعافٍ بإعادة تحميلٍ واحدة بالضبط", !!ensure && env.reloads.n === 1, `أُعيد التحميل ${env.reloads.n}`);
  }

  { // B8: setLang لا يحفظ ولا يقلب قبل وصول الحزمة
    const env = browser({ lang: "en", online: false });
    const { mod } = await boot(codeB, { cold: false });
    await mod.I18N.i18nReady;
    const before = unhandled.length;
    mod.I18N.setLang("ar");
    for (let i = 0; i < 50 && unhandled.length === before; i++) await tick(10);
    check("B8 setLang('ar') والنصفُ البارد فاشل: vp_lang باقٍ en", env.ls.getItem("vp_lang") === "en", `صار ${env.ls.getItem("vp_lang")}`);
    check("B8   والاتجاهُ باقٍ ltr", env.el.dir === "ltr", `صار ${env.el.dir}`);
    check("B8   واللغةُ باقيةٌ en", mod.I18N.default.language === "en", `صارت ${mod.I18N.default.language}`);
    check("B8   والفشلُ رفضٌ غيرُ ملتقَط (يقوله توستُ errors.async القائم)", unhandled.length === before + 1, `${unhandled.length - before} رفض`);
  }

  { // B9: changeLanguage("ar") المباشر (portal.ts) يطلب النصفَ البارد
    browser({ lang: "en" });
    const { mod } = await boot(codeB);
    await mod.I18N.i18nReady;
    await mod.I18N.default.changeLanguage("ar");
    for (let i = 0; i < 50 && globalThis.__arColdEvals === 0; i++) await tick(10);
    await tick(10);
    check("B9 changeLanguage('ar') مباشرةً من الإنكليزية ⇐ النصفُ البارد يُحمَّل (المستمع)",
      globalThis.__arColdEvals === 1 && mod.I18N.default.t(coldKey) === at(ar, coldKey), `قُيّم ${globalThis.__arColdEvals}`);
  }
}

/* ── C) الرسم ───────────────────────────────────────────────────────────── */
console.log("▸ C) الرسم (react-dom/server)");
const hasArabic = (s) => /[؀-ۿ]/.test(s);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
// من كلّ نطاقٍ بارد: أوّلُ ورقةٍ نصّيةٍ عربية (والمصفوفةُ تُفكّ إلى عناصرها).
const coldNamespaces = Object.keys(split.cold);
const FIX = [];
for (const ns of coldNamespaces) {
  const leaf = leafPaths(split.cold[ns], ns).find((l) => { const v = at(ar, l); return typeof v === "string" && v.trim() && hasArabic(v); });
  if (leaf) FIX.push(leaf);
}
const DEF_KEY = FIX.find((k) => k !== FIX[0]) ?? FIX[0];
const fixture = {
  name: "cold-fixture",
  setup(b) {
    b.onResolve({ filter: /^virtual:cold-fixture$/ }, () => ({ path: "cold-fixture", namespace: "cold-fixture" }));
    b.onLoad({ filter: /.*/, namespace: "cold-fixture" }, () => ({
      resolveDir: path.join(ROOT, "src"), loader: "tsx",
      contents: `import { useTranslation } from "react-i18next";
const KEYS = ${JSON.stringify(FIX)};
export default function ColdFixture() {
  const { t } = useTranslation();
  return (<div>{KEYS.map((k, i) => <p key={i}>{t(k, { skipInterpolation: true })}</p>)}<b>{t(${JSON.stringify(DEF_KEY)}, "INLINE-DEFAULT")}</b></div>);
}`,
    }));
  },
};
const ENTRY_C = `
import React, { lazy, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { page } from "@/lib/lazyPage";
function render(el) {
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({ write(c, _e, cb) { html += c.toString(); cb(); } });
    const s = renderToPipeableStream(
      React.createElement(I18nextProvider, { i18n }, React.createElement(Suspense, { fallback: React.createElement("i", null, "LOADING") }, el)),
      { onAllReady() { s.pipe(sink); sink.on("finish", () => resolve(html)); }, onShellError: reject, onError(e) { html += "[[ERROR " + (e && e.message) + "]]"; } });
  });
}
const landing = () => import("@/pages/Landing").then((m) => ({ default: m.Landing }));
export const renderUngatedLanding = () => render(React.createElement(lazy(landing)));
export const renderGatedLanding = () => render(React.createElement(page(landing)));
export const renderGatedFixture = () => render(React.createElement(page(() => import("virtual:cold-fixture"))));
`;
let codeC = null;
try { codeC = await bundle(ENTRY_C, [fixture]); }
catch (e) { check("حزمةُ الرسم (lazyPage.ts وصفحةُ الهبوط) تُبنى", false, e.message.split("\n").slice(0, 2).join(" ")); }

if (codeC) {
  const quiet = async (fn) => {
    const e = console.error, w = console.warn;
    console.error = () => {}; console.warn = () => {};
    try { return await fn(); } finally { console.error = e; console.warn = w; }
  };
  const landingLeaves = leafPaths(ar.landing, "landing").map((l) => at(ar, l)).filter((v) => typeof v === "string" && v.length > 6 && !/[{<&"'$]/.test(v));
  const rawLanding = (html) => [...new Set(html.match(/\blanding\.[A-Za-z][\w.]*/g) || [])];

  { // C1 + C2: صفحةُ الهبوط الحقيقية
    browser();
    const { mod } = await boot(codeC);
    const a = await quiet(() => mod.renderUngatedLanding());
    const rawA = rawLanding(a);
    check(`C1 شاهدٌ سلبيّ: lazy() عارٍ يُظهر مفاتيحَ landing خاماً (${rawA.length}، المطلوب ٢٠ فأكثر — وإلا فالفحصُ أعمى)`, rawA.length >= 20, rawA.slice(0, 3).join("، "));
    const b = await quiet(() => mod.renderGatedLanding());
    const rawB = rawLanding(b);
    const found = landingLeaves.filter((v) => b.includes(esc(v))).length;
    check("C2 page(Landing): صفرُ مفاتيحَ خام", rawB.length === 0 && !/\[\[ERROR/.test(b), rawB.slice(0, 5).join("، ") || (b.match(/\[\[ERROR[^\]]*\]\]/) || [""])[0]);
    check(`C2   ونصوصُ الهبوط العربية مرسومة (${found} من ${landingLeaves.length}، المطلوب ٦٠ فأكثر)`, found >= 60);
  }

  { // C3: ورقةٌ من كلّ نطاقٍ بارد، بإقلاعٍ جديد — البوّابةُ هي التي تحمّل
    browser();
    const { mod } = await boot(codeC);
    const h = await quiet(() => mod.renderGatedFixture());
    const missing = FIX.filter((k) => !h.includes(esc(at(ar, k))));
    const raw = FIX.filter((k) => h.includes(k));
    check(`C3 page(fixture): ورقةٌ بلا نصٍّ افتراضيّ من كلّ نطاقٍ بارد (${FIX.length} من ${coldNamespaces.length}) مرسومةٌ بعربيتها`,
      FIX.length >= 50 && missing.length === 0 && raw.length === 0 && !/\[\[ERROR/.test(h),
      `ناقصة ${missing.length} (${missing.slice(0, 3).join("، ")})، خام ${raw.length}${/\[\[ERROR/.test(h) ? "، " + h.match(/\[\[ERROR[^\]]*\]\]/)[0] : ""}`);
    check(`C3   ونداءٌ بنصٍّ افتراضيّ (${DEF_KEY}) يُرسم بعربيته لا بـINLINE-DEFAULT`, !h.includes("INLINE-DEFAULT") && h.includes(esc(at(ar, DEF_KEY))));
  }
}

if (!existsSync(path.join(ROOT, "src/lib/lazyPage.ts"))) check("src/lib/lazyPage.ts موجود (page() التي تنتظر النصفَ البارد)", false);
finish();
