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

/** يرجع true إن رمَت الدالّة (لا إن رجعت قائمةً — ولو فارغة).
 *
 *  و`TypeError` **لا تُحسب**: اسمُ دالّةٍ غلط يرمي «is not a function» فيمرّ
 *  الفحصُ لسببٍ غلط. وقعتُ بها مرّتين بهذه الموجة — مرّةً بـ`addCompany` التي
 *  لا وجودَ لها ومرّةً بـ`claimPetBySerial`. فالحارسُ هنا لا بالذاكرة. */
const throws = async (fn) => {
  try { await fn(); return false; }
  catch (e) {
    if (e instanceof TypeError) { console.error(`     (رميةٌ برمجية لا رميةُ خادم: ${e.message})`); return false; }
    return true;
  }
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
check("listImageLibrary — «ما بيها صور» كانت تُقال عن فشل (البند ٢٠)",
  await throws(() => repo.listImageLibrary()));

/* ── الموجة ٥ · البند ٢٣: المواضعُ الخمسةُ الصامتة ─────────────────────────
 * `maybe()` تخلط جوابين: تطبع الخطأ بالكونسول وترجع «لا صفّ». فصفرُ صفوفٍ
 * (سياسةٌ ردّت) وفشلُ الشبكة يصلان المستدعيَ **بنفس الشكل** — والمستدعي يقول
 * «تمّ» بعدهما. والكتابةُ تُسمَع: كلُّها ترمي الآن. */
console.log("▸ البند ٢٣ — المواضعُ الخمسةُ الصامتة صارت تُسمَع");
check("updatePet — اثنا عشرَ موضعَ نداءٍ يقولون «تمّ» بعدها",
  await throws(() => repo.updatePet("pet-1", { name: "خ" })));
check("updateAppointment — نفسُ الشكل",
  await throws(() => repo.updateAppointment("apt-1", { status: "done" })));
check("claimPet — القراءةُ تفشل فتُرمى، لا تُقرأ «ما لكيت الحيوان»",
  await throws(() => repo.claimPet("12345", { owner_id: "o1" })));
check("createPet — فشلُ الإنشاء يُرمى (والحلقةُ الداخلية تمسك 23505 وحدَه)",
  await throws(() => repo.createPet({ name: "ح", species: "dog" })));

/* `addWeight` تحتاج عميلاً **أذكى**: العميلُ الفاشلُ بالكامل يُسقط الإدراجَ
 * أوّلاً فلا يصل الفحصُ للكتابة الثانية أصلاً — أي أنه يقيس `need()` لا
 * الإصلاح. (أوّلُ صياغةٍ لي فعلت ذلك بالضبط ومرّت خضراء.) فهنا إدراجٌ ينجح
 * وتحديثٌ يفشل — وهو حالُ الإنتاج: سياسةٌ تسمح بالسجلّ وتردّ بطاقةَ الحيوان. */
{
  const SPLIT_SUPABASE = `
    const ERR = { message: "boom: policy refused the pets row", code: "42501" };
    const chain = (res) => {
      const o = new Proxy(function () {}, {
        get(_t, k) {
          if (k === "then") return (r) => { r(res); };
          if (k === "catch" || k === "finally") return () => o;
          return () => o;
        },
        apply() { return o; },
      });
      return o;
    };
    export const supabase = {
      // insert into weight_logs succeeds; update on pets is refused.
      from: (t) => chain(t === "pets" ? { data: null, error: ERR } : { data: { id: "w1", weight_kg: 12.5 }, error: null }),
      rpc: () => chain({ data: null, error: ERR }),
      schema: () => ({ from: () => chain({ data: null, error: ERR }) }),
      storage: { from: () => chain({ data: null, error: ERR }) },
      auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
    };
  `;
  const splitStubs = {
    name: "split",
    setup(b) {
      const m = {
        i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
        "./supabase": SPLIT_SUPABASE,
        "./globalToast": "export const emitGlobalToast = () => {};",
      };
      b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
      b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: m[a.path] ?? "export default {};", loader: "js" }));
    },
  };
  const sb = await esbuild.build({
    entryPoints: ["src/lib/repo.ts"], bundle: true, format: "esm", write: false,
    platform: "neutral", plugins: [splitStubs], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const d2 = mkdtempSync(join(tmpdir(), "split-"));
  const f2 = join(d2, "repo.mjs");
  writeFileSync(f2, sb.outputFiles[0].text);
  const m2 = await import(pathToFileURL(f2).href).finally(() => { try { rmSync(d2, { recursive: true, force: true }); } catch { /* ignore */ } });
  check("addWeight — الوزنُ يُسجَّل ثم تُردّ كتابتُه ببطاقة الحيوان ⇒ يُرمى",
    await throws(() => m2.repo.addWeight("pet-1", 12.5)),
    "السجلُّ انكتب والبطاقةُ لا — والشاشةُ راح تعرض وزناً قديماً يُحسب عليه دواء");
}

console.log("▸ وقوائمُ المخزن الأساسية ترمي أصلاً (allPages) — لا تراجُع");
check("listProducts", await throws(() => repo.listProducts()));
check("listCompanies", await throws(() => repo.listCompanies()));

/* ── ع٩: صفٌّ لا يُعدّ مرّتين تحت إدراجٍ متزامن ───────────────────────────
 * الترقيمُ بالإزاحة والترتيبُ بـ`id`. إدراجٌ متزامنٌ بمعرّفٍ يسبق مؤشّرَنا
 * يزحزح ما بعده صفحةً واحدة، فيعود آخرُ صفٍّ قرأناه بأوّل الصفحة التالية.
 * والحلقةُ تُصدر دائماً طلبَ تأكيدٍ بعد صفحةٍ ممتلئة — فالنافذةُ مفتوحةٌ بأيّ
 * حجمِ جدول، لا عند الألف وحدها. نحاكيها بجدولٍ ينمو بين الصفحتين. */
console.log("▸ ع٩/ط٤ — allPages تحت إدراجٍ وحذفٍ متزامنَين بين الطلبتين");
{
  /* خادمٌ مزيّفٌ **يحترم** ما يحترمه الحقيقيّ: الترتيبَ بتسلسله (`order` تُلحَق)،
   * والمؤشّرَ (`gt` على id)، والحدَّ (`limit`)، والإزاحةَ (`range`)، وسقفاً لكلّ
   * طلبة (`__cap`) كسقف PostgREST. فالفحصُ نفسُه يجري على الشيفرة القديمة
   * (إزاحة) والجديدة (مؤشّر) ويقول الفرق — لا فحصٌ مفصَّلٌ على مقاس الجديدة.
   * و`__afterPage` يعدّل الجدولَ **بعد** أن تُحسب الصفحة: أي بين الطلبتين. */
  const PAGING_SUPABASE = `
    const cmp = (a, b) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);
    const q = () => {
      const st = { gt: undefined, limit: undefined, orders: [] };
      const run = (slice) => {
        let rows = [...globalThis.__t];
        rows.sort((x, y) => { for (const [c, asc] of st.orders) { const r = cmp(x[c], y[c]); if (r) return asc ? r : -r; } return 0; });
        if (st.gt !== undefined && !globalThis.__ignoreCursor) rows = rows.filter((r) => r.id > st.gt);
        rows = slice(rows).slice(0, globalThis.__cap ?? 1000);
        globalThis.__pages++;
        // حلقةٌ هاربة تُوقَف هنا بخطأ **يُميَّز** (عددُ الطلبات يفضحها) — لا تعلّقُ الفحص.
        if (globalThis.__pages > 100) return { data: null, error: { message: "harness: runaway pagination" } };
        const out = { data: rows, error: null };
        if (globalThis.__afterPage) globalThis.__afterPage(globalThis.__pages);
        return out;
      };
      const o = {
        select: () => o,
        order: (c, opt) => { st.orders.push([c, !opt || opt.ascending !== false]); return o; },
        eq: () => o, neq: () => o, or: () => o, in: () => o, is: () => o, gte: () => o, lte: () => o, lt: () => o,
        gt: (c, v) => { if (c === "id") st.gt = v; return o; },
        limit: (n) => { st.limit = n; return o; },
        /* الردُّ **لاحقاً** (مهمّةٌ كبرى) كالشبكة الحقيقية. بوعدٍ محلولٍ فوراً كانت
         * حلقةٌ هاربة تجوّع طابورَ الأحداث فلا تنطلق حتى مهلةُ الفحص — فعلّق الفحصُ
         * بدل أن يفشل (أمسكه فحصُ الطفرات M2). */
        range: (a, b) => { const out = run((rows) => rows.slice(a, b + 1)); return new Promise((r) => setTimeout(() => r(out), 0)); },
        then: (res, rej) => { const out = run((rows) => (st.limit != null ? rows.slice(0, st.limit) : rows)); return new Promise((r) => setTimeout(() => r(out), 0)).then(res, rej); },
      };
      return o;
    };
    export const supabase = {
      from: () => q(), rpc: () => q(),
      schema: () => ({ from: () => q() }),
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
  /* الجدول: ١٠٠٥ منتجات — الرقمُ المقيسُ لأكبر عيادةٍ بالإنتاج (١٩ أيلول)، وهو
   * ما عبر العتبة. معرّفاتٌ مرتّبةٌ بالنصّ، وأسماءٌ بترتيبٍ **مختلف** عن المعرّف
   * (مقلوبة) حتى يُرى أن فرزَ العرض لا يعتمد على ترتيب الجلب. */
  const N = 1005;
  const mkTable = () => Array.from({ length: N }, (_, i) => ({
    id: `p${String(i).padStart(5, "0")}`, name: `n${String(N - i).padStart(5, "0")}`,
  }));
  const run = async (opts = {}) => {
    globalThis.__t = mkTable();
    globalThis.__pages = 0;
    globalThis.__cap = opts.cap ?? 1000;
    globalThis.__ignoreCursor = !!opts.ignoreCursor;
    globalThis.__afterPage = opts.afterPage ?? null;
    const before = new Set(globalThis.__t.map((r) => r.id));
    // مهلةٌ: حلقةٌ لا تنتهي تُحسب فشلاً لا تعليقاً للفحص.
    const res = await Promise.race([
      m2.repo.listProducts().then((rows) => ({ rows }), (e) => ({ err: e })),
      new Promise((r) => setTimeout(() => r({ hung: true }), 4000)),
    ]);
    globalThis.__afterPage = null; globalThis.__ignoreCursor = false;
    return { ...res, before, after: new Set(globalThis.__t.map((r) => r.id)), pages: globalThis.__pages };
  };
  const dupesOf = (rows) => { const ids = rows.map((r) => r.id); return ids.filter((x, i) => ids.indexOf(x) !== i); };
  /** صفوفٌ كانت موجودةً قبل الجلب **وبقيت بعده** ولم تصل = سقوطٌ صامت. */
  const droppedOf = (r) => [...r.before].filter((id) => r.after.has(id) && !r.rows.some((x) => x.id === id));

  // أ) إدراجٌ بمعرّفٍ يسبق كلَّ شيء بعد الطلبة الأولى — كان يكرّر صفّاً (ع٩).
  const a = await run({ afterPage: (n) => { if (n === 1) globalThis.__t = [{ id: "p!!new", name: "n!!" }, ...globalThis.__t]; } });
  check("إدراجٌ بين الطلبتين: الطلبُ أُعيد بعد صفحةٍ ممتلئة — النافذةُ حقيقية", !a.err && !a.hung && a.pages >= 2, `${a.pages} طلباً ${a.err ?? ""}`);
  check("  ولا صفَّ مكرّر", !a.err && dupesOf(a.rows).length === 0, a.rows ? dupesOf(a.rows).slice(0, 3).join("، ") : "");
  check("  ولا صفَّ قائمٌ سقط", !a.err && droppedOf(a).length === 0, a.rows ? droppedOf(a).slice(0, 3).join("، ") : "");

  // ب) حذفُ صفٍّ **قرأناه** بعد الطلبة الأولى (حذفٌ أو دمجٌ بجهازٍ ثانٍ): الإزاحةُ
  //    تُصعد كلَّ ما بعده خانةً فيسقط أوّلُ صفٍّ كان بالطلبة الثانية — صامتاً.
  const b = await run({ afterPage: (n) => { if (n === 1) globalThis.__t = globalThis.__t.filter((r) => r.id !== "p00050"); } });
  check("حذفٌ بين الطلبتين: ولا صفَّ قائمٌ سقط (مادّةٌ بالرفّ تغيب عن القائمة)", !b.err && !b.hung && droppedOf(b).length === 0,
    b.rows ? `سقط: ${droppedOf(b).slice(0, 3).join("، ")}` : String(b.err ?? "علّقت"));
  check("  ولا صفَّ مكرّر", !b.err && !b.hung && dupesOf(b.rows).length === 0);

  // ج) سقفُ الخادم أقلُّ من المطلوب (٧٠٠): التقدّمُ بما وصل لا بما طُلب.
  const c = await run({ cap: 700 });
  check("سقفُ خادمٍ ٧٠٠ لكلّ طلبة: وصلت الـ١٠٠٥ كلُّها", !c.err && !c.hung && c.rows.length === N, `${c.rows?.length} صفّاً`);

  // د) ترتيبُ العرض بالاسم مهما كان ترتيبُ الجلب — ثابتٌ يُحفظ لا خللٌ يُصلَح.
  const d = await run();
  const byName = !d.err && d.rows.every((r, i, arr) => i === 0 || arr[i - 1].name <= r.name);
  check("القائمةُ تصل مفروزةً بالاسم كما كانت (الفرزُ نزل للواجهة ولم يضع)", byName);

  // هـ) خادمٌ يتجاهل المؤشّر (يعيد نفسَ الصفحة): المؤشّرُ بلا حارسٍ يدور للأبد.
  //    يُرمى خطأٌ صريح، لا تعليقٌ ولا قائمةٌ مكرّرة. (ثابتٌ للآلية الجديدة —
  //    أُثبت فشلُه بإزالة الحارس، لا بالشيفرة القديمة التي لم يكن لها مؤشّر.)
  const e = await run({ ignoreCursor: true });
  // «خطأٌ» وحده لا يكفي: حلقةٌ هاربة ترمي أيضاً حين يوقفها الخادمُ المزيّف بعد مئة طلبة.
  // الحارسُ الحقيقيّ يقف بالطلبة **الثانية** — أوّلُ صفحةٍ لا جديدَ فيها.
  check("خادمٌ يتجاهل المؤشّر ⇒ خطأٌ صريح بالطلبة الثانية، لا حلقةٌ تطرق الخادم",
    !!e.err && !e.hung && e.pages <= 3, e.hung ? "علّقت" : !e.err ? "رجعت قائمة" : `${e.pages} طلبة قبل التوقّف`);
}


console.log(`\n${fails ? "✗" : "✓"} fetch-throw-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
