/* ============================================================================
 * فحصُ الجلب — «قائمةٌ ناقصة أخطرُ من خطأ ظاهر» (CLAUDE.md §٣)، سلوكياً لا نصّياً.
 *
 * `fetch-guard` حارسٌ **ساكن**: يقرأ النصَّ فيمنع رجوعَ `listOf` لقوائم القرار.
 * وهذا الفحصُ يقيس **السلوك**: يبني `repo.ts` الحقيقيَّ بـesbuild ويبدّل
 * `./supabase` بعميلٍ مزيّفٍ كلُّ طلبٍ عليه يرجع `{ data: null, error }` — وهو
 * بالضبط ما يفعله `postgrest-js` عند فشل الشبكة (لا يرمي أبداً، ولا
 * `throwOnError` بالمستودع). ثم يطلب من كلِّ قائمةِ قرارٍ أن **ترمي**.
 *
 * قبل الإصلاح كانت كلُّها ترجع `[]` — فتقول الشاشةُ «ماكو» عن موجود: مرتجعٌ
 * يُرفض، وإيصالٌ يُطبع بلا سطور، وسلّةُ محذوفاتٍ تبدو فارغة.
 *
 *   node scripts/fetch-throw-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- متصفّحٌ بالحدّ الأدنى (نفسُ ترتيب repo-demo-test) -------------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {} };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

/* ---- عميلٌ مزيّف: سلسلةٌ لا نهائية تنتهي دائماً بـ{data:null,error} ------- */
const FAKE_SUPABASE = `
  const ERR = { message: "boom: simulated network/RLS failure", code: "XX000" };
  const RES = { data: null, error: ERR };
  const make = () => new Proxy(function () {}, {
    get(_t, k) {
      // \`await\` على السلسلة يقرأ .then فيحلّها بالنتيجة الفاشلة
      if (k === "then") return (res) => { res(RES); };
      if (k === "catch" || k === "finally") return () => make();
      return () => make();
    },
    apply() { return make(); },
  });
  export const supabase = {
    from: () => make(), rpc: () => make(), schema: () => ({ from: () => make() }),
    storage: { from: () => make() },
    auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
  };
`;

const EMPTY = new Set([
  "@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js",
  "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify",
]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": FAKE_SUPABASE,
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  entryPoints: ["src/lib/repo.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" },
  banner: { js: "const __VITE_ENV__ = {};" },
});
const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const dir = mkdtempSync(join(tmpdir(), "fetch-throw-"));
const file = join(dir, "repo.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const repo = mod.repo;
if (!repo) { console.error("✗ fetch-throw-test: ما انحمّلت الوحدة"); process.exit(1); }

/** يرجع true إن رمَت الدالّة (لا إن رجعت قائمةً — ولو فارغة). */
const throws = async (fn) => {
  try { await fn(); return false; } catch { return true; }
};

console.log("▸ قوائمُ القرار ترمي على فشل الخادم — لا ترجع «ماكو» كاذبة");
check("listInvoiceItems — سطورُ فاتورةٍ تُطبع وتُرتجع بها",
  await throws(() => repo.listInvoiceItems("inv-1")));
check("listPurchaseItems — سطورُ كشفِ مورّد",
  await throws(() => repo.listPurchaseItems("pur-1")));
check("searchInvoices — «ماكو نتائج» كانت تُقال عن فشل",
  await throws(() => repo.searchInvoices({ q: "x" })));
check("listDeletedProducts — سلّةُ الاسترجاع نفسُها",
  await throws(() => repo.listDeletedProducts()));
check("listStoreOrders — صندوقُ طلبات المتجر",
  await throws(() => repo.listStoreOrders()));
check("addGeneratedBarcodes — ملصقاتٌ لا تُطبع قبل أن تُسجَّل",
  await throws(() => repo.addGeneratedBarcodes([{ barcode: "2000000000015", label: null, product_id: null, created_by: null }])));

console.log("▸ وقوائمُ المخزن الأساسية ترمي أصلاً (allPages) — لا تراجُع");
check("listProducts", await throws(() => repo.listProducts()));
check("listCompanies", await throws(() => repo.listCompanies()));

/* ── ع٩: صفٌّ لا يُعدّ مرّتين تحت إدراجٍ متزامن ───────────────────────────
 * الترقيمُ بالإزاحة والترتيبُ بـ`id`. إدراجٌ متزامنٌ بمعرّفٍ يسبق مؤشّرَنا
 * يزحزح ما بعده صفحةً واحدة، فيعود آخرُ صفٍّ قرأناه بأوّل الصفحة التالية.
 * والحلقةُ تُصدر دائماً طلبَ تأكيدٍ بعد صفحةٍ ممتلئة — فالنافذةُ مفتوحةٌ بأيّ
 * حجمِ جدول، لا عند الألف وحدها. نحاكيها بجدولٍ ينمو بين الصفحتين. */
console.log("▸ ع٩ — allPages تحت إدراجٍ متزامن");
{
  const PAGE = 1000;
  // جدولٌ ممتلئُ الصفحة الأولى بالضبط، ثم يُدرَج صفٌّ بمقدّمته بين الطلبين.
  const mk = (n, pad) => Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(pad, "0")}` }));
  let table = mk(PAGE, 5);
  let calls = 0;
  const PAGING_SUPABASE = `
    let table = globalThis.__t;
    const q = () => {
      const o = {
        order: () => o,
        eq: () => o, neq: () => o, or: () => o, in: () => o, is: () => o,
        gte: () => o, lte: () => o, gt: () => o, lt: () => o, limit: () => o,
        range: (a, b) => { const page = globalThis.__t.slice(a, b + 1); globalThis.__onRange(); return Promise.resolve({ data: page, error: null }); },
        then: (res) => res({ data: globalThis.__t, error: null }),
      };
      return o;
    };
    export const supabase = {
      from: () => ({ select: () => q() }), rpc: () => q(),
      schema: () => ({ from: () => ({ select: () => q() }) }),
      storage: { from: () => q() },
      auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
    };
  `;
  const pagingStubs = {
    name: "paging",
    setup(b) {
      const map2 = {
        i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
        "./supabase": PAGING_SUPABASE,
        "./globalToast": "export const emitGlobalToast = () => {};",
      };
      b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
      b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map2[a.path] ?? "export default {};", loader: "js" }));
    },
  };
  globalThis.__t = table;
  globalThis.__onRange = () => {
    calls++;
    // بعد الصفحة الأولى تماماً: إدراجٌ بمعرّفٍ يسبق كلَّ شيء ⇒ إزاحةُ الكلّ.
    if (calls === 1) globalThis.__t = [{ id: "p!!new" }, ...globalThis.__t];
  };
  const b2 = await esbuild.build({
    entryPoints: ["src/lib/repo.ts"], bundle: true, format: "esm", write: false,
    platform: "neutral", plugins: [pagingStubs], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" },
    banner: { js: "const __VITE_ENV__ = {};" },
  });
  const d2 = mkdtempSync(join(tmpdir(), "allpages-"));
  const f2 = join(d2, "repo.mjs");
  writeFileSync(f2, b2.outputFiles[0].text);
  const m2 = await import(pathToFileURL(f2).href).finally(() => { try { rmSync(d2, { recursive: true, force: true }); } catch { /* ignore */ } });
  const rows = await m2.repo.listProducts();
  const ids = rows.map((r) => r.id);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  check("الطلبُ أُعيد بعد صفحةٍ ممتلئة — فالنافذةُ حقيقية", calls >= 2, `${calls} طلباً`);
  check("ولا صفَّ مكرّراً رغم الإدراج المتزامن", dupes.length === 0, `مكرّر: ${[...new Set(dupes)].slice(0, 3).join("، ")}`);
  check("  والصفوفُ كلُّها وصلت", ids.length >= PAGE, `${ids.length} صفّاً`);
}


console.log(`\n${fails ? "✗" : "✓"} fetch-throw-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
