/* ============================================================================
 * نموذجُ المنتج لا يكتب إلا ما غيّره المستخدم، وبشرط ما رآه (§7.1، ثغرة M7).
 *
 * الجذر: نموذجُ المنتج وتعديلُ المجموعة كانا يرسلان `stock` و`purchase_price` بكلّ حفظ.
 * فتعديلُ اسمٍ بنموذجٍ فُتح قبل بيعةٍ يُرجع رصيدَ الفتح (بضاعةٌ وهمية)، وقبل شراءٍ يُرجع الكلفةَ
 * القديمة فوق الجديدة، وحارسُ «≥ ٠» يكتب الرصيدَ السالبَ صفراً بلا أن يلمسه أحد — والمستهلكاتُ
 * تجعل السالبَ يومياً. والشارةُ ما كانت تحمّر السالب، وقيمةُ المخزون كانت تطرحه من رأس المال.
 *
 * ما يُفحص بالسلوك لا بالنصّ:
 *   أ) `stockCostPatch` بشكل النموذج المفرد: الاسمُ وحده لا يرسل أيّاً منهما، والرصيدُ المعدَّل
 *      بشرط `expect.stock`، وسعرُ الشراء المعدَّل بشرط `expect.purchase_price`.
 *   ب) نفسُ الثلاثة بتعديل المجموعة — والرصيدُ يُقاس بما فُتح عليه السطر لا بالقائمة الحيّة.
 *   ج) `updateAsSeen`: رفضُ الشرط يُقال بما تحرّك (سعرٌ ⇒ price_moved، رصيدٌ وحده ⇒ no_row_updated).
 *   د) `updateProduct` الحقيقيّ بوجهيه — السحابيّ بعميلٍ يحاكي PostgREST، والتجريبيّ بمخزنه —
 *      يشترط على المفتاحين ويقارن بالرقم، والوجهان يخرجان بنفس النتيجة حالةً بحالة.
 *   هـ) الشارةُ حمراءُ عند السالب، و) قيمةُ المخزون لا تعدّ السالب — من نصّ Inventory.tsx نفسِه.
 *   ز) Inventory.tsx يمرّ من هذا كلِّه بمساري الحفظ، ولا كاتبَ أعمى بقي.
 *   ح) والنموذجُ الحقيقيّ مرسوماً (react-mini) على الريبو بوجهيه: يُكتب بحقوله ويُضغط «حفظ»، فيُرى ما
 *      يصل القاعدةَ فعلاً — بالنموذج المفرد وتعديل المجموعة (وقائمةٌ تتحدّث والنافذةُ مفتوحة)، والطيُّ
 *      إلى الحوض، ورفضُ الشرط برسالته، وشارةُ الصفّ.
 *   ط) علمُ «مجمّع» والطيُّ إلى الحوض (ui3)، بالنموذج المفرد وتعديل المجموعة — قاعدةٌ واحدة (`poolingPatch`):
 *      - قلبُ المفتاح إلى «مجمّع» يطوي بـ`pool_product` بأيّ رصيد (منذ 0253 تنقل رصيدَ الصفّ كلَّه ولو سالباً، والصفرُ
 *        لا ينقل شيئاً): نداءٌ واحد بالصنف المختار بهذا الحفظ، بعد كتابةٍ بلا رصيدٍ ولا علم. شرطُ «رصيدٌ موجب» كان يقلب
 *        العلمَ بكتابةٍ مباشرة: مادّةٌ عند −٢ على حوضٍ ٥ تبقى −٢ والحوضُ ٥ — وحدتان تُباعان ولا وجودَ لهما (مقيسٌ على 0253).
 *      - والعلمُ نفسُه يُرسل كالرصيد: حين يقلبه المستخدم أو يكتب رصيداً (عدٌّ ⇒ «معدود») وحدهما. علمُ لحظة الفتح كان يُرسل
 *        بكلّ حفظ: شراءٌ من جهازٍ آخر (يجعل المادّةَ معدودةً بكميتها، 0255:451) يرجع مجمَّعاً بتعديل اسمٍ وكميتُه مخفيّة؛
 *        وبالمجموعة يأخذ كلُّ عضوٍ علمَ العضو الذي فُتحت منه — عضوٌ اشتُري يُطوى بتعديل اسمٍ ويذهب عدُّه للحوض.
 *      - فشلُ الطيّ بعد الكتابة يُقال ولا «انحفظ»، وإعادةُ الضغط تطوي (مفرداً، وبالمجموعة الفاشلَ وحده)؛ ولا وعدَ يُرمى بلا ممسك؛
 *        وصنفٌ أُنشئ بنفس الحفظ لا يُحذف بعد أن كُتبت المادّةُ تحته (كان التراجعُ يُخرجها من صنفها القديم والجديد معاً).
 *      ودالّةُ الطيّ هنا مسجِّلةٌ (تفشل حين يُطلب) لا تجريبيّةُ الريبو.
 *   ط٢) والطيُّ نفسُه بمرآة التجريبيّ الحقيقيّة (poolProduct من repoDemo بعد التسجيل): −٢ بحوضٍ ٥ ⇒ الحوضُ ٣ والصفُّ صفرٌ مجمَّع،
 *      والمجموعةُ (−٢ و٣ بحوضٍ ٣ ⇒ ٤)، والمختلطةُ يُحفظ اسمُ عضوها فيبقى كلُّ عضوٍ على علمه والحوضُ كما هو.
 *   ي) على الشِّفرة القديمة: INVENTORY_SRC=<نسخةٌ من Inventory.tsx> يقرأ ويحزم منها بدل الأصل (والملفُّ لا يُمسّ)،
 *      ويشترط أن يسقط كلُّ سجلٍّ لكلّ فحصٍ جديدٍ عليها (NEW_KEYS[INVENTORY_BASE]) وأن يمرّ كلُّ ما عداه — فحصٌ جديد
 *      يمرّ على القديم لا يحرس. والقديمُ قديمان: «pre» (الافتراض) ما قبل ui3، و«ui3a» أوّلُ تصليحٍ بـui3.
 *   ك) الحارسُ يجرّب نفسه (`--mutants`): طفراتٌ مسمّاة على نصّ Inventory.tsx بالذاكرة، كلٌّ يجب أن تُسقط فحصاً من «ط»؛
 *      وطفرةٌ لا يقع نصُّها مرّةً واحدة بالمصدر، أو لا تنبني، تُسقط الحارس (لا طفرةَ صامتة تمرّ «خضراء»).
 *
 *   node scripts/inventory-cas-test.mjs [--mutants]
 *   INVENTORY_SRC=<قديم.tsx> [INVENTORY_BASE=pre|ui3a] node scripts/inventory-cas-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { createHash } from "node:crypto";

let fails = 0, passes = 0;
/** كلُّ فحصٍ يُسجَّل بمفتاحه (إن كان له) — «ي» تقرأ منها ما سقط على الشِّفرة القديمة. */
const RESULTS = [];
const check = (name, cond, detail = "", key = null) => {
  RESULTS.push({ name, ok: !!cond, key });
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const J = (x) => JSON.stringify(x);
/** وعدٌ رُمي بلا من يمسكه (طيٌّ بلا await، طفرةُ `void`) يُعدّ هنا ولا يُسقط العملية بلا تقرير: «ط» تشترط صفراً
 *  بجولتها، والخاتمةُ تشترطه بالجولة كلّها (ما خلا الطفرات). */
const UNHANDLED = [];
process.on("unhandledRejection", (e) => { UNHANDLED.push(e); });

/* ---- متصفّحٌ بالحدّ الأدنى قبل تحميل الوحدات (نفسُ ترتيب repo-demo-test) -------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? {
  localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
};
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

/* ---- عميلٌ يحاكي PostgREST على جدول products بالذاكرة ------------------------
 * المرشّحُ على عمودٍ رقميّ يُقارَن **بالرقم** كما يفعل بوستغريس (`stock=eq.5` يطابق 5.000)،
 * والتحديثُ الذي لا يطابق صفّاً يرجع `{data:null, error:null}` — صفرُ صفوفٍ بلا خطأ، وهو
 * بالضبط ما تقرؤه `updateProduct` رفضاً للشرط. و`numericAsText` يرجع الأرقامَ نصّاً
 * (numeric قد يصل هكذا) ليُفحص أن المقارنةَ بالرقم لا بالنصّ. */
const FAKE_SUPABASE = `
  const NUMERIC = new Set(["stock", "purchase_price", "sell_price", "sub_unit_price"]);
  const st = () => globalThis.__cas;
  class Q {
    constructor(table) { this.table = table; this.op = "select"; this.cols = "*"; this.filters = []; this.patch = null; }
    select(cols) { if (this.op !== "update") this.cols = cols ?? "*"; return this; }
    update(patch) { this.op = "update"; this.patch = patch; return this; }
    eq(c, v) { this.filters.push(["eq", c, v]); return this; }
    is(c, v) { this.filters.push(["is", c, v]); return this; }
    maybeSingle() { return this; }
    then(ok, ko) { let r; try { r = this.run(); } catch (e) { return Promise.reject(e).then(ok, ko); } return Promise.resolve(r).then(ok, ko); }
    run() {
      const s = st();
      s.log.push({ op: this.op, filters: this.filters.map(([o, c, v]) => o + ":" + c + ":" + v), patch: this.patch });
      if (s.fail && s.fail[this.op]) return { data: null, error: s.fail[this.op] };
      const hit = (s.tables[this.table] ?? []).filter((row) => this.filters.every(([o, c, v]) =>
        o === "is" ? (row[c] ?? null) === v
        : NUMERIC.has(c) ? row[c] != null && Number(row[c]) === Number(v)
        : String(row[c]) === String(v)));
      if (hit.length > 1) return { data: null, error: { message: "JSON object requested, multiple rows returned", code: "PGRST116" } };
      const row = hit[0];
      if (!row) return { data: null, error: null };
      // products_guard_avg (0255 الجولة الثالثة) على الصفّ الذي طابق الشرطَ وحده: التجميعُ بكتابةٍ مباشرة ⇒ pool_direct بتلميحه — كالمرآة
      if (this.op === "update" && this.patch && this.patch.pooled === true && row.pooled !== true && globalThis.__casPoolDirect)
        return { data: null, error: { message: "pool_direct", code: "P0001", hint: globalThis.__casPoolDirect } };
      if (this.op === "update") Object.assign(row, this.patch);
      const out = this.cols === "*" || this.op === "update" ? { ...row } : Object.fromEntries(this.cols.split(",").map((c) => [c, row[c]]));
      if (s.numericAsText) for (const k of NUMERIC) if (typeof out[k] === "number") out[k] = out[k].toFixed(3);
      return { data: out, error: null };
    }
  }
  export const supabase = {
    from: (t) => new Q(t), rpc: () => new Q("rpc"), schema: () => ({ from: (t) => new Q(t) }),
    storage: { from: () => ({}) },
    auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
  };
`;

const EMPTY = new Set([
  "@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js",
  "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify",
]);
const stubs = (supabaseSrc) => ({
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": supabaseSrc,
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
});
/** الوحداتُ الحقيقية من المصدر بحزمةٍ واحدة: الريبو (بوجهه السحابيّ أو التجريبيّ) + القاعدة + مترجمُ الأخطاء. */
async function load(supabaseSrc, tag) {
  const built = await esbuild.build({
    stdin: {
      contents: 'export { repo } from "./src/lib/repo.ts"; export * from "./src/lib/productPatch.ts"; export { describeDbError } from "./src/lib/errors.ts";',
      resolveDir: process.cwd(), sourcefile: `inventory-cas-${tag}.ts`, loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs(supabaseSrc)], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" },
    banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(join(tmpdir(), `inventory-cas-${tag}-`));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

globalThis.__cas = { tables: { products: [] }, log: [], fail: null, numericAsText: false };
/* حارسُ التجميع المباشر بالخادم (products_guard_avg، 0255 الجولة الثالثة): العميلُ المحاكي يرفضه كما يرفضه الخادمُ والمرآةُ التجريبية،
 * بتلميح الهجرة نفسِه — فالوجهان يتّفقان على الشِّفرة القديمة («ي») التي كانت تقلب pooled مباشرةً. */
globalThis.__casPoolDirect = /raise exception 'pool_direct'\s*using hint = '([^']*)'/.exec(readFileSync("supabase/migrations/0255_moving_average.sql", "utf8"))?.[1] ?? null;
if (!globalThis.__casPoolDirect) { console.error("✗ inventory-cas-test: ما انقرأ تلميحُ pool_direct من 0255"); process.exit(1); }
const cloud = await load(FAKE_SUPABASE, "cloud");
const demo = await load("export const supabase = null;", "demo");
const { stockCostPatch, stockEdited, casMoved, updateAsSeen, describeDbError } = cloud;
if (typeof stockCostPatch !== "function" || typeof updateAsSeen !== "function" || !cloud.repo || !demo.repo) {
  console.error("✗ inventory-cas-test: ما انحمّلت الوحدات");
  process.exit(1);
}
/** الرسالةُ التي تراها العيادة: مفتاحُ الترجمة الذي تختاره describeDbError. */
const said = (e) => describeDbError(e, (k) => k);
const codeOf = async (p) => { try { await p; return "ok"; } catch (e) { return e?.code ?? e?.message ?? String(e); } };

/* ── نفسُ ما يمرّره مسارا الحفظ بـInventory.tsx (والقسم «ز» يقرأ أن النصَّ هناك هو هذا) ──
 * الحقولُ كما يقرؤها النموذج (نصوصٌ)، والمنتجُ كما فُتح عليه. */
const guarded = (s) => Math.max(0, Math.round((Number(s) || 0) * 1000) / 1000);
const single = (product, f, { pooled = false, expect = {} } = {}) => stockCostPatch(
  { name: f.name ?? product.name, purchase_price: Number(f.purchase_price ?? product.purchase_price) || 0,
    stock: pooled ? 0 : guarded(f.stock ?? product.stock) },
  { stockTyped: pooled ? null : Number(f.stock ?? product.stock) || 0, stockWas: product.stock,
    costShown: product.purchase_price, costWas: product.purchase_price },
  expect);
/** سطرُ مجموعة: `opened` المنتجُ الذي فُتح منه النموذج (حقلُ الكلفة المشترك منه)، `before` العضوُ
 *  كما بالقائمة الحيّة، و`r` السطرُ كما بُني عند فتح المجموعة (`stockWas` لقطتُه). */
const rowOf = (p) => ({ name: p.name, stock: String(p.stock ?? 0), productId: p.id, stockWas: p.stock ?? 0 });
const groupRow = (opened, before, r, shared, { pooled = false, expect = {} } = {}) => stockCostPatch(
  { ...shared, name: r.name, stock: pooled ? 0 : guarded(r.stock) },
  { stockTyped: pooled ? null : Number(r.stock) || 0, stockWas: r.stockWas ?? 0,
    costShown: opened?.purchase_price ?? null, costWas: before?.purchase_price ?? null },
  expect);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ── أ) النموذجُ المفرد ──────────────────────────────────────────────────── */
console.log("▸ أ) النموذجُ المفرد — يُرسل ما غيّره المستخدم وحده، وبشرط ما رآه");
{
  const P = { id: "p1", name: "قديم", stock: 5, purchase_price: 1000, sell_price: 1500 };
  const nameOnly = single(P, { name: "جديد" });
  check("تعديلُ الاسم وحده لا يرسل الرصيدَ ولا سعرَ الشراء", !has(nameOnly.patch, "stock") && !has(nameOnly.patch, "purchase_price") && nameOnly.patch.name === "جديد", J(nameOnly));
  check("  ولا يشترط عليهما (لا رفضَ لأن بيعةً صارت والنموذجُ مفتوح)", J(nameOnly.expect) === "{}", J(nameOnly.expect));

  const neg = single({ ...P, stock: -2 }, { name: "جديد", stock: "-2" });
  check("رصيدٌ سالبٌ لم يُلمس لا يُكتب صفراً (الحمولةُ كانت تحمل ٠ بحارس ≥ ٠)", !has(neg.patch, "stock") && !has(neg.expect, "stock"), J(neg));

  const st = single(P, { stock: "7" });
  check("الرصيدُ المعدَّل يُرسل بشرط ما فُتح عليه (expect.stock)", st.patch.stock === 7 && st.expect.stock === 5 && !has(st.patch, "purchase_price"), J(st));
  const typedNeg = single(P, { stock: "-3" });
  check("  والمكتوبُ يبقى تحت حارس ≥ ٠", typedNeg.patch.stock === 0 && typedNeg.expect.stock === 5, J(typedNeg));
  const fromNeg = single({ ...P, stock: -2 }, { stock: "3" });
  check("  وتعديلُ رصيدٍ سالب يُشترط على السالب نفسِه لا على صفرٍ محروس", fromNeg.patch.stock === 3 && fromNeg.expect.stock === -2, J(fromNeg));
  const near = single({ ...P, stock: 2 }, { stock: "2.0004" }), far = single({ ...P, stock: 2 }, { stock: "2.0006" });
  check("  والتغيّرُ يُقاس بثلاث مراتب العمود (2.0004 = 2، و2.0006 = 2.001)", !has(near.patch, "stock") && far.patch.stock === 2.001 && far.expect.stock === 2, J({ near, far }));
  const kg = single({ ...P, stock: 1.25 }, { stock: "1.25" });
  check("  وكيلوٌ بكسرٍ لم يُلمس لا يُرسل", !has(kg.patch, "stock"), J(kg));
  check("  وstockEdited نفسُها: السالبُ مقابلَ نفسِه ليس تعديلاً", !stockEdited(-2, -2) && stockEdited(0, -2) && !stockEdited(0, null));

  const cost = single(P, { purchase_price: "1200" });
  check("سعرُ الشراء المعدَّل يُرسل بشرط ما فُتح عليه (expect.purchase_price)", cost.patch.purchase_price === 1200 && cost.expect.purchase_price === 1000 && !has(cost.patch, "stock"), J(cost));
  const both = single(P, { purchase_price: "1200" }, { expect: { sell_price: 1500 } });
  check("  وشرطُ سعر البيع القائم (0226) يبقى معه", both.expect.sell_price === 1500 && both.expect.purchase_price === 1000, J(both.expect));

  const pooled = single({ ...P, stock: -3 }, { stock: "-3" }, { pooled: true });
  check("المجمَّعُ رصيدُه ليس بيد النموذج: لا يُرسل ولو حملت الحمولةُ صفراً", !has(pooled.patch, "stock") && !has(pooled.expect, "stock"), J(pooled));
}

/* ── ب) تعديلُ المجموعة ───────────────────────────────────────────────────── */
console.log("▸ ب) تعديلُ المجموعة — نفسُ الثلاثة سطراً سطراً، والسطرُ الجديد كما كان");
{
  const A = { id: "a", name: "أ", stock: 5, purchase_price: 1000, sell_price: 1500 };
  const B = { id: "b", name: "ب", stock: 3, purchase_price: 1200, sell_price: 1500 };   // اشتُري بسعرٍ آخر
  const shared = { purchase_price: A.purchase_price, category: null };                    // الحقلُ المشترك يُملأ من المفتوح
  const ra = rowOf(A), rb = rowOf(B);
  const nameA = groupRow(A, A, { ...ra, name: "أ٢" }, shared), nameB = groupRow(A, B, rb, shared);
  check("حفظُ اسمٍ بالمجموعة لا يرسل رصيداً ولا كلفةً لأيّ عضو", [nameA, nameB].every((x) => !has(x.patch, "stock") && !has(x.patch, "purchase_price") && J(x.expect) === "{}"), J({ nameA, nameB }));
  check("  وكلفةُ العضو الذي اشتُري بسعرٍ آخر لا تُكتب بكلفة المفتوح", !has(nameB.patch, "purchase_price"), J(nameB));

  const stB = groupRow(A, B, { ...rb, stock: "9" }, shared);
  check("رصيدُ سطرٍ معدَّل يُرسل له وحده بشرط لقطته (expect.stock)", stB.patch.stock === 9 && stB.expect.stock === 3, J(stB));

  const raised = { ...shared, purchase_price: 1100 };
  const cA = groupRow(A, A, ra, raised), cB = groupRow(A, B, rb, raised);
  check("كلفةُ المجموعة المعدَّلة تُرسل لكلّ عضو بشرط كلفته هو", cA.patch.purchase_price === 1100 && cA.expect.purchase_price === 1000
    && cB.patch.purchase_price === 1100 && cB.expect.purchase_price === 1200, J({ cA, cB }));

  /* القائمةُ تُقرأ من جديد والنافذةُ مفتوحة: العضوُ بِيع منه (٣ ⇒ ٢) والسطرُ ما زال يحمل ٣. القياسُ
   * بالحيّ كان يرى «٣ ≠ ٢» تعديلاً فيكتب ٣ فوق البيعة — والشرطُ على الحيّ يمرّ. */
  const live = { ...B, stock: 2 };
  const stale = groupRow(A, live, rb, shared), typed = groupRow(A, live, { ...rb, stock: "8" }, shared);
  check("سطرٌ لم يُلمس بعد تحديث القائمة لا يُرسل (يُقاس بلقطته لا بالحيّ)", !has(stale.patch, "stock"), J(stale));
  check("  والمعدَّلُ يُشترط على ما رآه المستخدم (٣) لا على الحيّ (٢)", typed.patch.stock === 8 && typed.expect.stock === 3, J(typed));
  const poolG = groupRow(A, B, { ...rb, stock: "4" }, shared, { pooled: true });
  check("ومجموعةٌ مجمَّعة لا ترسل رصيداً", !has(poolG.patch, "stock"), J(poolG));
}

/* ── ج) رفضُ الشرط يُقال بما تحرّك ────────────────────────────────────────── */
console.log("▸ ج) casMoved وupdateAsSeen — السعرُ يبقى price_moved، والرصيدُ وحده no_row_updated");
{
  check("الرصيدُ وحده تحرّك ⇒ stock", casMoved({ stock: 5 }, { stock: 4 }) === "stock");
  check("سعرُ شراءٍ أو بيعٍ أو مفردٍ تحرّك ⇒ price (ولو تحرّك الرصيدُ معه)",
    casMoved({ stock: 5, purchase_price: 1000 }, { stock: 4, purchase_price: 1300 }) === "price"
    && casMoved({ sell_price: 1500 }, { sell_price: 1600 }) === "price" && casMoved({ sub_unit_price: 250 }, { sub_unit_price: 300 }) === "price");
  check("  والسعرُ الذي لم يُرسل لا يُحسب (الرفضُ سببُه ما شُرط عليه)", casMoved({ stock: 5 }, { stock: 4, sell_price: 9999 }) === "stock");
  check("  والرقمُ نصّاً يُقارَن بالرقم (\"1000.000\" = 1000)", casMoved({ purchase_price: 1000, stock: 5 }, { purchase_price: "1000.000", stock: "5.000" }) === null);
  check("  والصفُّ الغائب ⇒ null", casMoved({ stock: 5 }, undefined) === null);

  const priceErr = Object.assign(new Error("price_moved"), { code: "price_moved" });
  const io = (fresh, { fail, reread } = {}) => ({
    update: async () => { if (fail) throw fail; return "row"; },
    reread: reread ?? (async () => fresh),
  });
  check("نجاحُ الكتابة يرجع ما رجّعه الريبو", (await updateAsSeen(io(null), "x", {}, {})) === "row");
  let got = null;
  try { await updateAsSeen(io({ stock: 5, purchase_price: 1300 }, { fail: priceErr }), "x", {}, { purchase_price: 1000 }); } catch (e) { got = e; }
  check("سعرٌ تحرّك ⇒ نفسُ رمية price_moved (رسالتُها «سكّر وافتحها وتأكد من السعر»)", got === priceErr && said(got) === "errors.priceMoved", String(got?.code));
  got = null;
  try { await updateAsSeen(io({ stock: 4 }, { fail: priceErr }), "x", {}, { stock: 5 }); } catch (e) { got = e; }
  check("الرصيدُ وحده تحرّك ⇒ no_row_updated (لا «السعر تغيّر» الكاذبة)", got?.code === "no_row_updated" && got?.message === "no_row_updated" && said(got) === "errors.noRowUpdated", String(got?.code));
  check("  والقراءةُ الثانية فاشلة ⇒ no_row_updated (الصادقةُ بكلّ الأحوال)",
    (await codeOf(updateAsSeen(io(null, { fail: priceErr, reread: async () => { throw new Error("Failed to fetch"); } }), "x", {}, { stock: 5 }))) === "no_row_updated");
  check("  والصفُّ انحذف بينهما ⇒ no_row_updated", (await codeOf(updateAsSeen(io(undefined, { fail: priceErr }), "x", {}, { stock: 5 }))) === "no_row_updated");
  check("  وprice_moved بالرسالة وحدها (رمزٌ سقط بعبور JSON) يُفهم كذلك",
    (await codeOf(updateAsSeen(io({ stock: 4 }, { fail: new Error("price_moved") }), "x", {}, { stock: 5 }))) === "no_row_updated");
  const other = Object.assign(new Error("permission denied"), { code: "42501" });
  got = null;
  try { await updateAsSeen(io(null, { fail: other }), "x", {}, { stock: 5 }); } catch (e) { got = e; }
  check("وأيُّ فشلٍ آخر يُرمى كما جاء", got === other);
}

/* ── د) updateProduct الحقيقيّ بوجهيه — نفسُ الحالات ونفسُ النتائج ──────────── */
const DB_KEY = /export const DEMO_DB_KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoKey.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ inventory-cas-test: ما انقرأ مفتاحُ مخزن الديمو من demoKey.ts"); process.exit(1); }
const backends = {
  cloud: {
    repo: cloud.repo,
    seed: (rows) => { globalThis.__cas = { tables: { products: rows.map((r) => ({ farm_id: null, ...r })) }, log: [], fail: null, numericAsText: false }; },
    elsewhere: (id, patch) => Object.assign(globalThis.__cas.tables.products.find((r) => r.id === id), patch),
    row: (id) => ({ ...globalThis.__cas.tables.products.find((r) => r.id === id) }),
  },
  demo: {
    repo: demo.repo,
    seed: (rows, sections) => mem.set(DB_KEY, J({ products: rows, companies: [], companySections: sections ?? [], purchases: [], purchaseItems: [],
      invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [] })),
    elsewhere: (id, patch) => { const db = JSON.parse(mem.get(DB_KEY)); Object.assign(db.products.find((r) => r.id === id), patch); mem.set(DB_KEY, J(db)); },
    row: (id) => JSON.parse(mem.get(DB_KEY)).products.find((r) => r.id === id),
  },
};
const OPEN = { id: "p1", name: "قديم", stock: 5, purchase_price: 1000, sell_price: 1500, sub_unit_price: null };
const results = {};
for (const [side, be] of Object.entries(backends)) {
  console.log(`▸ د) updateProduct ${side === "cloud" ? "السحابيّ (عميلٌ يحاكي PostgREST)" : "التجريبيّ (مخزنُ الجهاز)"} — يشترط على المفتاحين ويقارن بالرقم`);
  const io = { update: (id, p, x) => be.repo.updateProduct(id, p, x), reread: (id) => be.repo.getProductById(id) };
  const save = async (open, f) => { const e = single(open, f); return codeOf(updateAsSeen(io, open.id, e.patch, e.expect)); };
  const r = {};
  be.seed([{ ...OPEN }]); be.elsewhere("p1", { stock: 4 });               // بيعةٌ من جهازٍ آخر والنموذجُ مفتوح على ٥
  r.nameAfterSale = [await save(OPEN, { name: "جديد" }), be.row("p1").stock, be.row("p1").name];
  check("تعديلُ اسمٍ بعد بيعةٍ لا يُرجع رصيدَ الفتح (يبقى ٤)", J(r.nameAfterSale) === J(["ok", 4, "جديد"]), J(r.nameAfterSale));
  be.seed([{ ...OPEN }]);
  r.stockHit = [await save(OPEN, { stock: "7" }), be.row("p1").stock];
  check("الرصيدُ المعدَّل يُكتب حين لم يتحرّك", J(r.stockHit) === J(["ok", 7]), J(r.stockHit));
  if (side === "cloud") {
    const upd = globalThis.__cas.log.filter((l) => l.op === "update").at(-1);
    check("  والشرطُ مرشّحٌ على العمود نفسِه (stock=eq.5)", !!upd && upd.filters.includes("eq:stock:5"), J(upd));
  }
  be.seed([{ ...OPEN }]); be.elsewhere("p1", { stock: 4 });
  let err = null;
  try { const e = single(OPEN, { stock: "7" }); await updateAsSeen(io, "p1", e.patch, e.expect); } catch (e) { err = e; }
  r.stockMoved = [err?.code ?? "ok", be.row("p1").stock];
  check("الرصيدُ تحرّك ⇒ لا يُكتب، ويُقال no_row_updated", J(r.stockMoved) === J(["no_row_updated", 4]) && said(err) === "errors.noRowUpdated", J(r.stockMoved));
  be.seed([{ ...OPEN }]);
  r.costHit = [await save(OPEN, { purchase_price: "1200" }), be.row("p1").purchase_price];
  check("سعرُ الشراء المعدَّل يُكتب حين لم يتحرّك", J(r.costHit) === J(["ok", 1200]), J(r.costHit));
  if (side === "cloud") {
    const upd = globalThis.__cas.log.filter((l) => l.op === "update").at(-1);
    check("  والشرطُ مرشّحٌ عليه (purchase_price=eq.1000)", !!upd && upd.filters.includes("eq:purchase_price:1000") && !upd.filters.some((x) => x.startsWith("eq:stock")), J(upd));
  }
  be.seed([{ ...OPEN }]); be.elsewhere("p1", { purchase_price: 1300 });   // شراءٌ من جهازٍ آخر
  err = null;
  try { const e = single(OPEN, { purchase_price: "1200" }); await updateAsSeen(io, "p1", e.patch, e.expect); } catch (e) { err = e; }
  r.costMoved = [err?.code ?? "ok", be.row("p1").purchase_price];
  check("كلفةٌ تحرّكت ⇒ لا تُكتب فوقها، ويبقى price_moved", J(r.costMoved) === J(["price_moved", 1300]) && said(err) === "errors.priceMoved", J(r.costMoved));
  be.seed([{ ...OPEN, stock: -2 }]);
  r.negative = [await save({ ...OPEN, stock: -2 }, { name: "جديد", stock: "-2" }), be.row("p1").stock];
  check("رصيدٌ سالبٌ يبقى سالباً بعد حفظ الاسم", J(r.negative) === J(["ok", -2]), J(r.negative));
  be.seed([{ ...OPEN, stock: -2 }]);
  r.fromNegative = [await save({ ...OPEN, stock: -2 }, { stock: "3" }), be.row("p1").stock];
  check("  وعدُّه من جديد (٣) يُكتب — الشرطُ على −٢ كما هو بالقاعدة", J(r.fromNegative) === J(["ok", 3]), J(r.fromNegative));
  // المجموعة: عضوان بكلفتين، وحفظُ اسمٍ لا يوحّدهما.
  const A = { ...OPEN, id: "a", name: "أ" }, B = { ...OPEN, id: "b", name: "ب", stock: 3, purchase_price: 1200 };
  be.seed([{ ...A }, { ...B }]);
  for (const [p, nm] of [[A, "أ٢"], [B, "ب"]]) {
    const e = groupRow(A, p, { ...rowOf(p), name: nm }, { purchase_price: A.purchase_price, bulk_group: "g1" });
    await updateAsSeen(io, p.id, e.patch, e.expect);
  }
  r.group = [be.row("a").name, be.row("a").purchase_price, be.row("b").purchase_price, be.row("b").stock];
  check("حفظُ اسمٍ بالمجموعة يُبقي كلفةَ كلّ عضوٍ ورصيدَه", J(r.group) === J(["أ٢", 1000, 1200, 3]), J(r.group));
  if (side === "cloud") {
    be.seed([{ ...OPEN }]); be.elsewhere("p1", { stock: 4 });
    globalThis.__cas.numericAsText = true;
    err = null;
    try { const e = single(OPEN, { stock: "7" }); await updateAsSeen(io, "p1", e.patch, e.expect); } catch (e) { err = e; }
    check("والقراءةُ الثانية بأرقامٍ نصّية تُقارَن بالرقم (السحابةُ وcasMoved معاً)", err?.code === "no_row_updated" && be.row("p1").stock === 4, String(err?.code));
    globalThis.__cas.numericAsText = false;
  }
  results[side] = r;
}
check("الوجهان (السحابيّ والتجريبيّ) يخرجان بنفس النتيجة حالةً بحالة", J(results.cloud) === J(results.demo), `${J(results.cloud)} ≠ ${J(results.demo)}`);

/* ── هـ/و) الشارةُ والقيمة — من نصّ Inventory.tsx نفسِه، مُقيَّماً لا مقروءاً ── */
const INV = readFileSync(process.env.INVENTORY_SRC || "src/pages/Inventory.tsx", "utf8").replace(/\r\n/g, "\n");
if (process.env.INVENTORY_SRC) console.log(`   (Inventory.tsx من ${process.env.INVENTORY_SRC})`);
console.log("▸ هـ) شارةُ الرصيد حمراءُ عند السالب لا عند الصفر وحده");
{
  const m = /<Badge tone=\{(p\.stock[^}]*)\}>/.exec(INV);
  check("تعبيرُ الشارة موجود", !!m);
  if (m) {
    const tone = vm.runInNewContext(`(p, lowThreshold) => (${m[1]})`);
    const low = () => 5;
    const at = (stock) => tone({ stock }, low);
    check("سالبٌ ⇒ danger (كان warn)", at(-2) === "danger" && at(-0.001) === "danger", `${at(-2)} / ${at(-0.001)}`);
    check("  وصفرٌ ⇒ danger، ومنخفضٌ ⇒ warn، وغيرُه ⇒ neutral", at(0) === "danger" && at(3) === "warn" && at(5) === "warn" && at(6) === "neutral");
  }
  check("  ولا بقيّةَ لشرط «=== 0»", !INV.includes('p.stock === 0 ? "danger"'));
  check("  وتطابق شرطَ «نفد» الذي ترشّح به الشريحة", INV.includes("const isOut = (p: Product) => !p.pooled && p.stock <= 0;"));
}
console.log("▸ و) قيمةُ المخزون تعدّ الموجودَ وحده");
{
  const at = INV.indexOf("function computeInventoryValue(");
  let fn = null;
  if (at >= 0) {
    let depth = 0, end = -1;
    for (let i = INV.indexOf("{", INV.indexOf(")", at)); i < INV.length; i++) {
      if (INV[i] === "{") depth++;
      else if (INV[i] === "}" && --depth === 0) { end = i + 1; break; }
    }
    const js = (await esbuild.transform(INV.slice(at, end), { loader: "ts" })).code;
    fn = vm.runInNewContext(`${js}\ncomputeInventoryValue`);
  }
  check("الدالّةُ موجودة وتُقيَّم", typeof fn === "function");
  if (fn) {
    const v = fn([
      { id: "n", stock: -3, purchase_price: 100, sell_price: 150, section_id: null },
      { id: "q", stock: 2, purchase_price: 10, sell_price: 20, section_id: null },
    ], []);
    check("السالبُ لا يُطرح من رأس المال ولا من قيمة البيع", v.cost === 20 && v.retail === 40 && v.profit === 20, J(v));
    const w = fn([{ id: "s", stock: -1, purchase_price: 5, sell_price: 7, section_id: "sec" }], [{ id: "sec", pooled_stock: 4 }]);
    check("  والمجمَّعُ بالقسم يُعدّ كما كان (حوضٌ × متوسّط القسم)", w.pooledCost === 20 && w.cost === 20 && w.retail === 28, J(w));
  }
}

/* ── ز) Inventory.tsx يمرّ من القاعدة بمساري الحفظ — ولا كاتبَ أعمى بقي ─────── */
console.log("▸ ز) الشاشةُ موصولة: النموذجُ والمجموعة يمرّان من stockCostPatch وupdateAsSeen");
{
  const slice = (from, to) => { const a = INV.indexOf(from); return a < 0 ? "" : INV.slice(a, INV.indexOf(to, a + from.length)); };
  const save = slice("const save = async () => {", "const saveBulk = async () => {");
  const bulk = slice("const saveBulk = async () => {", "// Shared toggle-switch classes");
  check("الاستيرادُ من الوحدة الصِّرفة", INV.includes('import { stockCostPatch, updateAsSeen, type CasExpect } from "@/lib/productPatch";'));
  check("الريبو يصلها بوجهيه (الكتابةُ بشرطها والقراءةُ الثانية بالمعرّف)",
    INV.includes("update: (id: string, patch: Partial<Product>, expect: CasExpect) => repo.updateProduct(id, patch, expect),")
    && INV.includes("reread: (id: string) => repo.getProductById(id),"));
  for (const needle of [
    "const cas = stockCostPatch(sent, {",
    "stockTyped: pooled ? null : Number(f.stock) || 0,",
    "stockWas: product.stock,",
    "costShown: product.purchase_price,",
    "costWas: product.purchase_price,",
  ]) check(`النموذجُ المفرد: ${needle}`, save.includes(needle));
  check("  والعلمُ والطيُّ بقاعدةٍ واحدة (poolingPatch): الطيُّ بقلب المفتاح وبأيّ رصيد بدالّته الذرّية، والعلمُ حين يُغيَّر وحده",
    INV.includes("function poolingPatch(patch: Partial<Product>, toggled: boolean, wasPooled: boolean | null | undefined): { patch: Partial<Product>; fold: boolean } {")
    && INV.includes("if (toggled && pooled && !wasPooled) return { patch: folded, fold: true };")
    && INV.includes("if (!pooled && (toggled || patch.stock !== undefined)) return { patch, fold: false };")
    && save.includes("const pooling = poolingPatch(cas.patch, pooled !== !!product.pooled || section_id == null, product.pooled);")
    && save.includes("await updateAsSeen(productIO, product.id, pooling.patch, cas.expect);")
    && save.includes("if (pooling.fold) await repo.poolProduct(product.id, section_id as string);")
    && save.includes("await updateAsSeen(productIO, product.id, pooling.patch, cas.expect);\n        createdCompany = null; createdSection = null;")
    && !INV.includes("foldingToPool"), "", "ui3.text");
  check("  والمنتجُ الجديد يُنشأ بحمولته المحروسة كما كان (والقسمُ أ يبني الحمولةَ بنفس التعبير)",
    save.includes("stock: pooled ? 0 : Math.max(0, Math.round((Number(f.stock) || 0) * 1000) / 1000),")
    && save.includes("await repo.createProduct({ ...payload, clinic_id: clinicId ?? null });"));
  for (const needle of [
    "const cas = stockCostPatch(keep ? { ...rowSent, alt_codes: keep.alt_codes } : rowSent, {",
    "stockTyped: pooled ? null : Number(r.stock) || 0,",
    "stockWas: r.stockWas ?? 0,",
    "costShown: product?.purchase_price ?? null,",
    "costWas: before?.purchase_price ?? null,",
    "}, groupSellChanged && before ? { sell_price: before.sell_price } : {});",
  ]) check(`المجموعة: ${needle}`, bulk.includes(needle));
  check("  وتعديلُ المجموعة بالقاعدة نفسِها عضواً عضواً — والمفتاحُ المشترك «مقلوب» بما فُتح عليه النموذج لا بعلم كلّ عضو",
    bulk.includes("const poolToggled = pooled !== !!product?.pooled || section_id == null;")
    && bulk.includes("const pooling = poolingPatch(cas.patch, poolToggled, before?.pooled);")
    && bulk.includes("await updateAsSeen(productIO, r.productId, pooling.patch, cas.expect);")
    && bulk.includes("if (pooling.fold) await repo.poolProduct(r.productId, section_id as string);")
    && bulk.includes("if (done === 0 && !wrote) await rollbackGrouping(createdCompany, createdSection);"), "", "ui3.groupText");
  check("  ولقطةُ الرصيد تُؤخذ عند فتح المجموعة", INV.includes("productId: p.id, stockWas: p.stock ?? 0 })"));
  check("  والسطرُ الجديد يُنشأ كما كان", bulk.includes("else await repo.createProduct(rowPayload);")
    && bulk.includes("stock: pooled ? 0 : Math.max(0, Math.round((Number(r.stock) || 0) * 1000) / 1000),"));
  check("  ورفضُ السعر وحده يوقف إنشاءَ الجديد (رصيدٌ تحرّك لا يوقفه)", bulk.includes("catch (e) { if (isPriceMoved(e)) groupMoved = true; throw e; }"));
  check("والرصيدُ المتحرّك يُعيد قراءةَ القائمة كالسعر (وإلا فإعادةُ الفتح تحمل البائت)",
    save.includes("if (isSeenStale(e)) onChanged?.();") && bulk.includes("if (isSeenStale(lastErr)) onChanged?.();"));
  /* الكاتبُ الأعمى: نداءٌ يمرّر حمولةَ النموذج (وفيها الرصيدُ وسعرُ الشراء) بلا القاعدة. */
  const blind = INV.split("\n").filter((l) => /repo\.updateProduct\([^,]+,\s*(?:keep \? \{ \.\.\.rowSent|foldingToPool \? rest|sent\b|rest\b|rowSent\b|rowDated\b|dated\b|withOld\b|payload\b|rowPayload\b)/.test(l));
  check("ولا نداءَ لـupdateProduct بقي يمرّر حمولةَ النموذج مباشرةً", blind.length === 0, blind.join(" | "));
  const literal = INV.split("\n").filter((l) => l.includes("repo.updateProduct(") && /\b(stock|purchase_price)\s*:/.test(l));
  check("  ولا نداءَ يكتب الرصيدَ أو سعرَ الشراء بيده", literal.length === 0, literal.join(" | "));
}

/* ── ح) النموذجُ الحقيقيّ مرسوماً (react-mini): يُكتب بحقوله ويُضغط «حفظ» ──────────────
 * «ز» تقرأ أن الأسطرَ هناك؛ وفحصُ النصّ يمرّ ولو كُسرت القاعدةُ داخل المكوّن (رأسُ react-mini-host).
 * فهنا يُرسم `ProductModal` و`ProductRow` نفساهما، ويصل ما يرسلانه **الريبو الحقيقيّ بوجهيه** من «د»
 * (السحابيُّ بعميله المحاكي، والتجريبيُّ بمخزنه) — فيُرى ما يُكتب فعلاً بالقاعدة لا شكلُ السطر.
 * كلُّ استيرادٍ آخر لـInventory.tsx بديلٌ يُولَّد من سطور استيراده (فاستيرادٌ جديد يأخذ بديلاً بلا تعديلٍ
 * هنا)، إلا القواعدَ الصِّرفة. والترجمةُ ترجع المفتاح: الأزرارُ والرسائلُ تُطابَق بمفاتيحها. */
// والتعبئةُ (0259، `@/lib/packs`) قاعدةٌ صِرفة كذلك: بديلُها المولَّد يرجع undefined فيسقط رسمُ الصفّ.
// 0264: usdProduct (مسودّةُ السعر بالدولار) صِرفةٌ يستوردها النموذج — بديلٌ مولَّدٌ لها undefined يُسقط رسمَه كلَّه.
const REAL_UI = new Set(["react", "@/lib/productPatch", "@/lib/productCodes", "@/lib/utils", "@/lib/errors", "@/lib/packs", "@/lib/usdProduct"]);
const UI_STUB = {
  "react-i18next": "export const useTranslation = () => ({ t: (k) => k, i18n: { language: 'ar' } });",
  i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, variants, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/lib/repo": "export const repo = new Proxy({}, { get: (_t, k) => globalThis.__invRepo[k] });",
  "@/components/ui": `import { createElement, forwardRef } from "react";
    export const Button = forwardRef(({ children, leftIcon, loading, variant, size, ...p }, _ref) => createElement("x-Button", p, children));
    export const Badge = ({ children, ...p }) => createElement("x-Badge", p, children);
    export const Skeleton = () => null;
    export const useToast = () => new Proxy({}, { get: (_t, k) => globalThis.__invToast[k] });`,
  "@/components/Modal": "export const Modal = ({ open, children }) => (open ? children : null);",
  "@/components/LoadBoundary": "export const LoadBoundary = ({ children }) => children;",
  // قطعٌ كسولة بالنموذج (0264: حقولُ الدولار) لا تُرسم هنا: مكوّنٌ لا يرسم شيئاً ⇒ الميزةُ «مطفأة» ولا يُرسل منها شيء.
  "@/lib/lazyPage": "export const page = () => () => null;",
  "@/lib/managerOverride": "export const useOverride = () => ({ stockLocked: false, restricted: false });",
  "@/hooks/usePermissions": "export const usePermissions = () => ({ can: () => true, role: 'manager', baseRole: 'manager' });",
  "@/contexts/AuthContext": "export const useAuth = () => ({ user: null });",
  "@/lib/catalog": "export const catalogLookup = async () => null;",
  "@/lib/promotions": "export const subcategoriesOf = () => [];",
  "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n;",
  "react-router-dom": "export const Link = ({ children }) => children; export const useSearchParams = () => [new URLSearchParams(), () => {}];",
  "@/components/photo/PhotoEditor": "export default () => null;",
  "@/pages/InventoryAudit": "export const StockReportButtons = () => null;",
};
const invImports = new Map();
for (const m of INV.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
  if (m[1]) continue;
  const names = invImports.get(m[3]) ?? new Set();
  for (const part of (/\{([\s\S]*)\}/.exec(m[2])?.[1] ?? "").split(",")) {
    const s = part.trim();
    if (s && !s.startsWith("type ")) names.add(s.split(/\s+as\s+/)[0].trim());
  }
  if (!m[2].trim().startsWith("{") && /^\s*\w+\s*(,|$)/.test(m[2])) names.add("default");
  invImports.set(m[3], names);
}
/** البديلُ المولَّد: مكوّنٌ يرسم أولادَه، وخطّافٌ يرجع كائناً، وثابتٌ صفر، ودالّةٌ لا تفعل شيئاً. */
const uiStubOf = (spec) => {
  if (UI_STUB[spec] != null) return UI_STUB[spec];
  const names = [...(invImports.get(spec) ?? [])];
  if (spec === "lucide-react") return names.map((k) => `export const ${k} = () => null;`).join("\n");
  return ['import { createElement } from "react";', ...names.map((k) => {
    const v = /^use[A-Z]/.test(k) ? "() => ({})" : /^[A-Z][a-z]/.test(k) ? `(p) => createElement("x-${k}", p, p?.children)`
      : /^[A-Z_0-9]+$/.test(k) ? "0" : "() => undefined";
    return k === "default" ? `export default ${v};` : `export const ${k} = ${v};`;
  })].join("\n");
};
const fromInventory = (importer) => /[\\/]src[\\/]pages[\\/]Inventory\.tsx$/.test(importer ?? "");
/** يحزم Inventory.tsx من نصٍّ — الأصل، أو INVENTORY_SRC («ي»)، أو طفرةٌ بالذاكرة («ك») — ويحمّل المكوّنين مع مضيف react-mini. */
async function buildUI(src) {
  const built = await esbuild.build({
    stdin: { contents: 'export { ProductModal, ProductRow } from "./src/pages/Inventory.tsx";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";', resolveDir: process.cwd(), sourcefile: "inventory-cas-ui.tsx", loader: "tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "inventory-ui",
      setup(b) {
        // المكوّنان غيرُ مُصدَّرَين: يُصدَّران هنا عند التحميل، والملفُّ نفسُه لا يُمسّ.
        b.onLoad({ filter: /[\\/]src[\\/]pages[\\/]Inventory\.tsx$/ }, () => ({ contents: `${src}\nexport { ProductModal, ProductRow };`, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => {
          if (a.path === "i18next" || a.path === "react-i18next") return { path: a.path, namespace: "inv-ui" };
          if (fromInventory(a.importer) && !REAL_UI.has(a.path) && !a.path.startsWith("react/")) return { path: a.path, namespace: "inv-ui" };
          return undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "inv-ui" }, (a) => ({ contents: uiStubOf(a.path), loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "inventory-cas-ui-"));
  const file = join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

const base = { barcode: null, company_id: null, section_id: null, category: null, subcategory: null, purchase_price: 1000, sell_price: 1500,
  stock: 5, min_stock: 0, expiry_date: null, pooled: false, has_sub_unit: false, sub_unit_name: null, units_per_box: null,
  sub_unit_price: null, sold_by_weight: false, alt_codes: [], bulk_group: null, clinic_id: "c1", created_at: "2026-10-01T00:00:00Z" };
const P = { ...base, id: "p1", name: "قديم" };
const CO = [{ id: "co1", name: "شركة", created_at: "2026-01-01T00:00:00Z" }], SEC = [{ id: "s1", company_id: "co1", name: "صنف", pooled_stock: 3 }];
const GA = { ...base, id: "a", name: "أ", bulk_group: "g1" };
const GB = { ...base, id: "b", name: "ب", bulk_group: "g1", stock: 3, purchase_price: 1200, created_at: "2026-10-02T00:00:00Z" };
const nameField = (p) => p.placeholder === "pos.namePh";

/** جلساتُ النموذج على حزمةٍ واحدة (الأصل أو طفرة). `poolProduct` مسجِّلٌ لا ينادي الريبو: ما يُفحص هو ما يطلبه
 *  النموذج، لا مرآةُ الطيّ التجريبيّة (يصحّحها مسارٌ آخر). و`seq` ترتيبُ الكتابة والطيّ وحذفِ صنفٍ/شركةٍ (تراجعُ الفشل) كما
 *  وصلت، و`pool` (اختياريّ) يقرّر جوابَ الطيّ: Error ⇒ يُرمى (الشبكةُ سقطت بعد الكتابة)، و`repo` بدائلُ نداءاتٍ بعينها. */
function harness(UI) {
  const { React, mount, ProductModal } = UI;
  window.setTimeout ??= setTimeout; window.clearTimeout ??= clearTimeout;
  /** جلسةُ نموذجٍ واحدة على وجهٍ من «د»: `moved` ما غيّره جهازٌ آخر بعد الفتح، و`poll` تحديثُ القائمة والنافذةُ مفتوحة. */
  const session = async (be, { product, all, companies = [], sections = [], moved = null, pool = null, repo: over = {}, real = false }) => {
    // `real` («ط٢»): الطيُّ يمرّ بعد التسجيل إلى poolProduct الحقيقيّة على مخزن الوجه، والأصنافُ بأحواضها مزروعةٌ فيه
    be.seed(all.map((p) => ({ ...p })), real ? sections.map((s) => ({ ...s })) : undefined);
    const log = { writes: [], pooled: [], seq: [], errors: [], saved: 0, changed: 0 };
    globalThis.__invToast = { toast() {}, success() {}, warn() {}, error: (title, desc) => { log.errors.push([title, desc ?? null]); } };
    const call = (k) => over[k] ?? be.repo[k];
    globalThis.__invRepo = new Proxy({}, { get: (_t, k) =>
      k === "updateProduct" ? (id, patch, expect) => { log.writes.push({ id, patch, expect: expect ?? {} }); log.seq.push(`update:${id}`); return be.repo.updateProduct(id, patch, expect); }
      : k === "poolProduct" ? async (id, sec) => { log.pooled.push([id, sec]); log.seq.push(`pool:${id}`); const r = pool?.(id, sec); if (r instanceof Error) throw r; if (real) await be.repo.poolProduct(id, sec); }
      : k === "deleteCompanySection" || k === "deleteCompany" ? async (id, ...a) => { log.seq.push(`${k}:${id}`); return call(k)(id, ...a); }
      : call(k) });
    let setList = null;
    const Host = () => {
      const [list, set] = React.useState(all);
      setList = set;
      return React.createElement(ProductModal, { open: true, product, companies, sections, subcategories: [], allProducts: list,
        onClose() {}, onSaved() { log.saved++; }, onChanged() { log.changed++; } });
    };
    const ui = mount(React.createElement(Host));
    /* الجذرُ legacy فالحالُ يتغيّر بنفس النداء، والحفظُ سلسلةُ وعودٍ بلا مؤقّت، والأثرُ المؤجَّل يجدوله React
     * على Node بـsetImmediate — فيكفي تفريغُ الطابور به. و`settle()` (setTimeout) احتياطٌ إن لم يمتلئ النموذج
     * بعدُ: مؤقّتُ ويندوز (١٥ms) كان يجعله ثماني ثوانٍ لهذا القسم وحده. */
    const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((res) => setImmediate(res)); };
    const field = (pred) => ui.all().find((n) => n.type === "input" && pred(n.props));
    await flush();
    if (field((p) => p.placeholder === "pos.namePh")?.props.value !== product.name) await ui.settle();   // ملءُ النموذج أثرٌ مؤجَّل (open/product)
    if (moved) for (const [id, patch] of Object.entries(moved)) be.elsewhere(id, patch);
    const type = async (pred, value) => { const n = field(pred); if (!n) throw new Error("ما لكيتُ الحقل"); n.props.onChange({ target: { value } }); await flush(); };
    const press = async (pred) => { ui.click(ui.all().find((n) => (n.type === "x-Button" || n.type === "button") && pred(ui.text(n), n))); await flush(); };
    const toggle = async (label) => press((_, n) => n.props.role === "switch" && !!n.parent && ui.text(n.parent).includes(label));
    /** اختيارٌ من قائمة (الشركة/الصنف) بمفتاح نصّها المؤقّت — كما يختار المستخدمُ اسماً قائماً. */
    const pick = async (placeholder, value) => {
      const n = ui.all().find((x) => x.type === "x-Combobox" && x.props.placeholder === placeholder);
      if (!n) throw new Error(`ما لكيتُ ${placeholder}`);
      n.props.onChange(value); await flush();
    };
    const poll = async (list) => { setList(list); await flush(); };
    const by = (id) => log.writes.filter((w) => w.id === id);
    return { ui, log, type, press, toggle, pick, poll, by, row: be.row, done: () => ui.unmount() };
  };
  const save = (s) => s.press((t) => t === "common.save");
  const openGroup = async (be, opts = {}) => { const s = await session(be, { product: GA, all: [GA, GB], ...opts }); await s.press((t) => t.includes("pos.groupEditBtn")); return s; };
  const saveGroup = (s) => s.press((t) => t.startsWith("pos.bulkSaveEdit"));
  return { session, save, openGroup, saveGroup };
}

/** ط) علمُ «مجمّع» والطيُّ إلى الحوض (ui3) على حزمة — الأصلُ بالتشغيل، وكلُّ طفرةٍ بـ«ك». يرجع سجلّاتٍ ولا يطبع؛
 *  المفتاحُ للحالة على الوجهين معاً (fold-2 سجلّان)، و«ي» تشترط أن يسقط كلُّ سجلٍّ لمفتاحٍ جديدٍ على قديمه. */
const FOLD_RECORDS = 64;   // ٣١ حالةً × وجهين + تطابقُ الوجهين + الوعودُ الممسوكة
async function foldSuite(UI) {
  const { session, save, openGroup, saveGroup } = harness(UI);
  const out = [];
  const ok = (key, label, cond, detail = "") => out.push({ key, label, ok: !!cond, detail });
  const sides = {};
  const unhandledAt = UNHANDLED.length;
  const inS1 = (p, extra = {}) => ({ ...p, company_id: "co1", section_id: "s1", ...extra });
  const F = inS1(P);                                   // معدودةٌ بصنف
  const Q = inS1(P, { pooled: true, stock: 0 });       // مجمَّعةٌ بصنف
  const SEC2 = [...SEC, { id: "s2", company_id: "co1", name: "صنف٢", pooled_stock: 5 }];
  const GS = [inS1(GA, { stock: -2 }), inS1(GB, { stock: 3 })];                               // مجموعةٌ معدودة
  const GP = [inS1(GA, { pooled: true, stock: -1 }), inS1(GB, { pooled: true, stock: 0 })];   // مجمَّعة: عضوٌ فرغ حوضُه فنزل صفُّه، وعضوٌ صفر
  /* مختلطة — نتيجةُ شراءٍ عاديّة: الشراءُ يجعل العضوَ المشترى وحده معدوداً بكميته (record_purchase، 0255:451). */
  const GM = [inS1(GA, { pooled: true, stock: 0 }), inS1(GB, { stock: 10 })];
  const netFail = () => new Error("Failed to fetch");
  for (const [side, be] of Object.entries(backends)) {
    const r = {}, tag = side === "cloud" ? "السحابيّ" : "التجريبيّ";
    const run = async (key, open, act, read) => {
      try { const s = await open(); await act(s); r[key] = read(s); s.done(); } catch (e) { r[key] = { threw: String(e?.message ?? e) }; }
      return r[key];
    };
    const one = (s) => ({ w: s.log.writes, pooled: s.log.pooled, seq: s.log.seq, stock: s.row("p1").stock, rowPooled: !!s.row("p1").pooled,
      saved: s.log.saved, errors: s.log.errors });
    const rename = async (s) => { await s.type(nameField, "جديد"); await save(s); };
    /* الطيُّ كما يطلبه الخادم: كتابةٌ واحدة بلا رصيدٍ ولا pooled ولا شرطٍ على الرصيد، ثمّ poolProduct مرّةً واحدة بالمادّة والصنف،
     * والكتابةُ أوّلاً (فشلُ الطيّ بعدها لا يضيّع شيئاً). والصفُّ بعد الكتابة كما فُتح: رصيدُه وعلمُه لا يقلبهما إلا الدالّة. */
    const folded = (x, stock, sec = "s1") => x.w?.length === 1 && !has(x.w[0].patch, "stock") && !has(x.w[0].patch, "pooled") && !has(x.w[0].expect, "stock")
      && J(x.pooled) === J([["p1", sec]]) && J(x.seq) === J(["update:p1", "pool:p1"]) && x.stock === stock && x.rowPooled === false
      && x.saved === 1 && x.errors?.length === 0;
    for (const stock of [-2, 0, 3]) {
      const x = await run(`fold${stock}`, () => session(be, { product: { ...F, stock }, all: [{ ...F, stock }], companies: CO, sections: SEC }),
        async (s) => { await s.toggle("pos.pooledToggle"); await save(s); }, one);
      ok(`fold${stock}`, `${tag}: مادّةٌ عند ${stock} تُجمَّع ⇒ poolProduct مرّةً واحدة، بعد كتابةٍ بلا رصيدٍ ولا pooled`, folded(x, stock), J(x));
    }
    let x = await run("foldTyped", () => session(be, { product: { ...F, stock: 3 }, all: [{ ...F, stock: 3 }], companies: CO, sections: SEC }),
      async (s) => { await s.type((p) => p.value === "3", "7"); await s.toggle("pos.pooledToggle"); await save(s); }, one);
    ok("foldTyped", `${tag}:   ورصيدٌ كُتب بالحقل قبل التجميع (٧) لا يُرسل — الدالّةُ تنقل ما بالصفّ (٣)`, folded(x, 3), J(x));
    x = await run("sectionMove", () => session(be, { product: { ...F, stock: -2 }, all: [{ ...F, stock: -2 }], companies: CO, sections: SEC2 }),
      async (s) => { await s.pick("pos.sectionPh", "صنف٢"); await s.toggle("pos.pooledToggle"); await save(s); }, one);
    ok("sectionMove", `${tag}:   والصنفُ يتبدّل (s1 ⇒ s2) بنفس الحفظ الذي يجمّع — الطيُّ لحوض الصنف المختار لا القديم`,
      folded(x, -2, "s2") && x.w[0].patch.section_id === "s2", J(x));
    x = await run("sectionNew", () => session(be, { product: { ...P, stock: -2 }, all: [{ ...P, stock: -2 }], companies: CO, sections: SEC }),
      async (s) => { await s.pick("pos.companyPh", "شركة"); await s.pick("pos.sectionPh", "صنف"); await s.toggle("pos.pooledToggle"); await save(s); }, one);
    ok("sectionNew", `${tag}:   ومادّةٌ بلا صنفٍ يُختار لها صنفٌ وتُجمَّع بنفس الحفظ — الطيُّ للمختار`,
      folded(x, -2, "s1") && x.w[0].patch.section_id === "s1" && x.w[0].patch.company_id === "co1", J(x));
    const ctl = { fail: true };
    x = await run("poolFails", () => session(be, { product: { ...F, stock: -2 }, all: [{ ...F, stock: -2 }], companies: CO, sections: SEC,
      pool: () => (ctl.fail ? netFail() : undefined) }),
    async (s) => {
      await s.toggle("pos.pooledToggle"); await save(s);
      s.first = { writes: s.log.writes.length, pooled: s.log.pooled.length, saved: s.log.saved, errors: s.log.errors.map((e) => e[0]), stock: s.row("p1").stock, rowPooled: !!s.row("p1").pooled };
      ctl.fail = false; await save(s);
    }, (s) => ({ first: s.first, seq: s.log.seq, saved: s.log.saved, errors: s.log.errors.map((e) => e[0]) }));
    ok("poolFails", `${tag}: الطيُّ يفشل بعد الكتابة (الشبكة) ⇒ errors.network ولا «انحفظ» والصفُّ كما كان، وإعادةُ الضغط تطوي`,
      x.first?.saved === 0 && J(x.first.errors) === J(["errors.network"]) && x.first.writes === 1 && x.first.pooled === 1
      && x.first.stock === -2 && x.first.rowPooled === false
      && J(x.seq) === J(["update:p1", "pool:p1", "update:p1", "pool:p1"]) && x.saved === 1 && x.errors?.length === 1, J(x));
    /* وصنفٌ يُنشأ بنفس الحفظ: الكتابةُ وضعت المادّةَ تحته، ففشلُ الطيّ بعدها لا يحذفه (تراجعُ «لا يتيم» للكتابة التي فشلت
     * وحدها) — كان الحذفُ يُخرج المادّةَ من صنفها القديم والجديد معاً (مقيسٌ على المرآة: section_id ⇒ null، والصنفُ بالمحذوفات). */
    const fresh = (made) => ({
      ensureCompanySection: async (company_id, name) => { made.push(name); return { id: "s9", company_id, name, pooled_stock: 0, clinic_id: "c1", created_at: new Date().toISOString() }; },
      deleteCompanySection: async () => {},
    });
    const made1 = [], ctl1 = { fail: true };
    x = await run("poolFailsNewSection", () => session(be, { product: { ...F, stock: -2 }, all: [{ ...F, stock: -2 }], companies: CO, sections: SEC,
      pool: () => (ctl1.fail ? netFail() : undefined), repo: fresh(made1) }),
    async (s) => {
      await s.pick("pos.sectionPh", "صنف جديد"); await s.toggle("pos.pooledToggle"); await save(s);
      s.first = { seq: [...s.log.seq], saved: s.log.saved, errors: s.log.errors.map((e) => e[0]), section: s.row("p1").section_id };
      ctl1.fail = false; await save(s);
    }, (s) => ({ first: s.first, retry: s.log.seq.slice(s.first?.seq.length ?? 0), made: made1, saved: s.log.saved, section: s.row("p1").section_id }));
    ok("poolFailsNewSection", `${tag}:   وصنفٌ أُنشئ بنفس الحفظ لا يُحذف حين يفشل الطيّ بعد الكتابة — المادّةُ تبقى تحته، وإعادةُ الضغط تطوي إليه`,
      J(x.first?.seq) === J(["update:p1", "pool:p1"]) && x.first.saved === 0 && J(x.first.errors) === J(["errors.network"]) && x.first.section === "s9"
      && J(x.retry) === J(["update:p1", "pool:p1"]) && J(x.made) === J(["صنف جديد"]) && x.saved === 1 && x.section === "s9", J(x));
    x = await run("pooledSave", () => session(be, { product: { ...Q, stock: -1 }, all: [{ ...Q, stock: -1 }], companies: CO, sections: SEC }), rename, one);
    ok("pooledSave", `${tag}: المجمَّعُ يُحفظ بلا رصيد — عجزُه لا يُصفَّر، ولا يُطوى ثانيةً`,
      x.w?.length === 1 && !has(x.w[0].patch, "stock") && x.stock === -1 && x.pooled?.length === 0 && x.saved === 1, J(x));
    ok("pooledFlag", `${tag}:   ولا يُرسل علمَه: المفتاحُ لم يُقلب (والصفُّ يبقى مجمَّعاً)`,
      x.w?.length === 1 && !has(x.w[0].patch, "pooled") && x.rowPooled === true, J(x));
    x = await run("sectionNoToggle", () => session(be, { product: { ...F, stock: 3 }, all: [{ ...F, stock: 3 }], companies: CO, sections: SEC }), rename, one);
    ok("sectionNoToggle", `${tag}: مادّةٌ بصنفٍ تُحفظ بلا مفتاح التجميع — لا طيَّ ولا علم`,
      x.w?.length === 1 && x.w[0].patch.pooled !== true && !has(x.w[0].patch, "stock") && x.pooled?.length === 0 && x.stock === 3
      && x.rowPooled === false && x.saved === 1, J(x));
    /* جهازٌ آخر غيّر العلمَ والنموذجُ مفتوح: شراءٌ يجعل المادّةَ معدودةً بكميتها، أو طيٌّ بدالّته. حفظٌ لا يلمس المفتاح لا يُرجع العلمَ
     * لما فُتح عليه النموذج — والرصيدُ المكتوب عدٌّ: يُرسل معه «معدود»، بشرط ما ظهر بالحقل. */
    x = await run("racePurchase", () => session(be, { product: Q, all: [Q], companies: CO, sections: SEC, moved: { p1: { pooled: false, stock: 10 } } }), rename, one);
    ok("racePurchase", `${tag}: شراءٌ من جهازٍ آخر جعلها معدودةً بـ١٠ والنموذجُ مفتوح على «مجمّع» — تعديلُ الاسم لا يرجعها مجمَّعة`,
      x.w?.length === 1 && !has(x.w[0].patch, "pooled") && !has(x.w[0].patch, "stock") && x.pooled?.length === 0
      && x.stock === 10 && x.rowPooled === false && x.saved === 1, J(x));
    x = await run("racePooled", () => session(be, { product: { ...F, stock: 3 }, all: [{ ...F, stock: 3 }], companies: CO, sections: SEC, moved: { p1: { pooled: true, stock: 0 } } }), rename, one);
    ok("racePooled", `${tag}:   وطيٌّ من جهازٍ آخر والنموذجُ مفتوح على «معدود» — تعديلُ الاسم لا يفكّه`,
      x.w?.length === 1 && !has(x.w[0].patch, "pooled") && x.pooled?.length === 0 && x.stock === 0 && x.rowPooled === true && x.saved === 1, J(x));
    x = await run("raceCounted", () => session(be, { product: { ...F, stock: 0 }, all: [{ ...F, stock: 0 }], companies: CO, sections: SEC, moved: { p1: { pooled: true, stock: 0 } } }),
      async (s) => { await s.type((p) => p.value === "0", "5"); await save(s); }, one);
    ok("raceCounted", `${tag}:   والرصيدُ المكتوب (٥) عدٌّ: يُرسل معه «معدود» بشرط ما ظهر بالحقل`,
      x.w?.length === 1 && x.w[0].patch.pooled === false && x.w[0].patch.stock === 5 && x.w[0].expect.stock === 0
      && x.pooled?.length === 0 && x.stock === 5 && x.rowPooled === false && x.saved === 1, J(x));
    x = await run("unpool", () => session(be, { product: Q, all: [Q], companies: CO, sections: SEC }),
      async (s) => { await s.toggle("pos.pooledToggle"); await save(s); }, one);
    ok("unpool", `${tag}: إطفاءُ المفتاح يفكّ التجميعَ بكتابته (pooled:false)، بلا طيّ`,
      x.w?.length === 1 && x.w[0].patch.pooled === false && x.pooled?.length === 0 && x.rowPooled === false && x.saved === 1, J(x));
    /* وبلا صنفٍ لا تجميع («مجمّع» يعني حوضَ صنفه): كتابةٌ تُخرج المادّةَ من صنفها تُرسل «معدود» معها — ولو طواها جهازٌ آخر
     * والنموذجُ مفتوح على «معدود»، وإلا بقي الصفُّ مجمَّعاً بلا صنف (لا حوضَ يُباع منه، ولا عدّ). */
    x = await run("sectionCleared", () => session(be, { product: { ...F, stock: 3 }, all: [{ ...F, stock: 3 }], companies: CO, sections: SEC, moved: { p1: { pooled: true, stock: 0 } } }),
      async (s) => { await s.pick("pos.sectionPh", ""); await save(s); }, one);
    ok("sectionCleared", `${tag}:   والصنفُ يُفرَغ بالحفظ (وجهازٌ آخر طواها والنموذجُ مفتوح) — الكتابةُ تحمل «معدود»، فلا مجمَّعَ بلا صنف`,
      x.w?.length === 1 && x.w[0].patch.section_id === null && x.w[0].patch.pooled === false && x.pooled?.length === 0
      && x.rowPooled === false && x.saved === 1, J(x));

    // المجموعة
    const grp = (s) => ({ a: s.by("a"), b: s.by("b"), pooled: s.log.pooled, seq: s.log.seq,
      rows: ["a", "b"].map((id) => [s.row(id).stock, !!s.row(id).pooled]), saved: s.log.saved, errors: s.log.errors });
    const noFlag = (w) => w?.length === 1 && !has(w[0].patch, "pooled");
    const foldedAll = (x, sec = "s1") => J(x.pooled) === J([["a", sec], ["b", sec]]) && J(x.seq) === J(["update:a", "pool:a", "update:b", "pool:b"])
      && [x.a, x.b].every((w) => w?.length === 1 && !has(w[0].patch, "stock") && !has(w[0].patch, "pooled") && !has(w[0].expect, "stock"))
      && x.saved === 1 && x.errors?.length === 0;
    const toggleSave = async (s) => { await s.toggle("pos.pooledToggle"); await saveGroup(s); };
    x = await run("groupFold", () => openGroup(be, { product: GS[0], all: GS, companies: CO, sections: SEC }), toggleSave, grp);
    ok("groupFold", `${tag}: تجميعُ المجموعة يطوي كلَّ عضوٍ بـpoolProduct مرّةً، بعد كتابته بلا رصيدٍ ولا pooled (−٢ و٣)`,
      foldedAll(x) && J(x.rows) === J([[-2, false], [3, false]]), J(x));
    x = await run("groupSection", () => openGroup(be, { product: GS[0], all: GS, companies: CO, sections: SEC2 }),
      async (s) => { await s.pick("pos.sectionPh", "صنف٢"); await toggleSave(s); }, grp);
    ok("groupSection", `${tag}:   والصنفُ المشترك يتبدّل (s1 ⇒ s2) بنفس الحفظ — كلُّ عضوٍ يُطوى لحوض المختار لا القديم`,
      foldedAll(x, "s2") && [x.a, x.b].every((w) => w[0].patch.section_id === "s2"), J(x));
    x = await run("groupVanished", () => openGroup(be, { product: GS[0], all: GS, companies: CO, sections: SEC }),
      async (s) => { await s.poll([GS[1]]); await toggleSave(s); }, grp);
    ok("groupVanished", `${tag}:   وعضوٌ غاب عن القائمة والنافذةُ مفتوحة يُطوى كغيره (الدالّةُ تنقل ما بالصفّ أيّاً كان)`, foldedAll(x), J(x));
    const gctl = { failA: true };
    x = await run("groupPoolFails", () => openGroup(be, { product: GS[0], all: GS, companies: CO, sections: SEC,
      pool: (id) => (id === "a" && gctl.failA ? netFail() : undefined) }),
    async (s) => {
      await toggleSave(s);
      s.first = { seq: [...s.log.seq], saved: s.log.saved, errors: s.log.errors.map((e) => e[0]) };
      gctl.failA = false; await saveGroup(s);
    }, (s) => ({ first: s.first, retry: s.log.seq.slice(s.first?.seq.length ?? 0), saved: s.log.saved, errors: s.log.errors.map((e) => e[0]) }));
    ok("groupPoolFails", `${tag}: طيُّ عضوٍ يفشل بعد كتابته ⇒ «أُضيف وفشل» ولا «انحفظ»، وإعادةُ الضغط تطوي الفاشلَ وحده`,
      J(x.first?.seq) === J(["update:a", "pool:a", "update:b", "pool:b"]) && x.first.saved === 0 && J(x.first.errors) === J(["pos.bulkPartial"])
      && J(x.retry) === J(["update:a", "pool:a"]) && x.saved === 1 && x.errors?.length === 1, J(x));
    const made2 = [], gctl2 = { fail: true };
    x = await run("groupPoolFailsNewSection", () => openGroup(be, { product: GS[0], all: GS, companies: CO, sections: SEC,
      pool: () => (gctl2.fail ? netFail() : undefined), repo: fresh(made2) }),
    async (s) => {
      await s.pick("pos.sectionPh", "صنف جديد"); await toggleSave(s);
      s.first = { seq: [...s.log.seq], saved: s.log.saved, errors: s.log.errors.map((e) => e[0]) };
      gctl2.fail = false; await saveGroup(s);
    }, (s) => ({ first: s.first, retry: s.log.seq.slice(s.first?.seq.length ?? 0), made: made2, saved: s.log.saved, sections: ["a", "b"].map((id) => s.row(id).section_id) }));
    ok("groupPoolFailsNewSection", `${tag}:   وطيُّ كلّ الأعضاء يفشل بعد كتابتهم تحت صنفٍ أُنشئ بنفس الحفظ — الصنفُ لا يُحذف، وإعادةُ الضغط تطوي إليه`,
      J(x.first?.seq) === J(["update:a", "pool:a", "update:b", "pool:b"]) && x.first.saved === 0 && J(x.first.errors) === J(["errors.network"])
      && J(x.retry) === J(["update:a", "pool:a", "update:b", "pool:b"]) && J(x.made) === J(["صنف جديد"]) && x.saved === 1 && J(x.sections) === J(["s9", "s9"]), J(x));
    x = await run("groupPooledSave", () => openGroup(be, { product: GP[0], all: GP, companies: CO, sections: SEC }),
      async (s) => { await s.type((p) => p.id === "bulk-name-1", "ب٢"); await saveGroup(s); }, grp);
    ok("groupPooledSave", `${tag}: حفظُ مجموعةٍ مجمَّعة لا يطوي أعضاءها ثانيةً ولا يمسّ رصيدَهم`,
      x.pooled?.length === 0 && [x.a, x.b].every((w) => w?.length === 1 && !has(w[0].patch, "stock"))
      && J(x.rows) === J([[-1, true], [0, true]]) && x.saved === 1, J(x));
    ok("groupPooledFlag", `${tag}:   ولا يُرسل علمَ أيّ عضو (المفتاحُ لم يُقلب)`, noFlag(x.a) && noFlag(x.b), J(x));
    /* المختلطة: المفتاحُ المشترك يُملأ من العضو الذي فُتحت منه، فحفظٌ لا يقلبه يُبقي كلَّ عضوٍ على علمه — كان «b» المعدودُ بـ١٠ يُطوى
     * بتعديل اسمه (١٠ ⇒ حوض القسم، مقيسٌ على المرآة التجريبيّة: الحوضُ ٥ ⇒ ١٥)، والمفتاحُ يُخفي عمودَ رصيده فلا يُرى ما ينتقل. */
    x = await run("mixedPooled", () => openGroup(be, { product: GM[0], all: GM, companies: CO, sections: SEC }),
      async (s) => { await s.type((p) => p.id === "bulk-name-1", "ب٢"); await saveGroup(s); }, grp);
    ok("mixedPooled", `${tag}: مختلطةٌ فُتحت من المجمَّع (المفتاحُ مضاء) وتعديلُ اسم «b» المعدود بـ١٠ — لا طيَّ ولا علم، و«b» يبقى ١٠`,
      x.pooled?.length === 0 && noFlag(x.a) && noFlag(x.b) && !has(x.b[0].patch, "stock") && J(x.rows) === J([[0, true], [10, false]]) && x.saved === 1, J(x));
    x = await run("mixedTracked", () => openGroup(be, { product: GM[1], all: GM, companies: CO, sections: SEC }),
      async (s) => { await s.type((p) => p.id === "bulk-name-0", "أ٢"); await saveGroup(s); }, grp);
    ok("mixedTracked", `${tag}:   وفُتحت من المعدود (المفتاحُ مطفأ) وتعديلُ اسم «a» المجمَّع — لا يُفكّ تجميعُه`,
      x.pooled?.length === 0 && noFlag(x.a) && noFlag(x.b) && J(x.rows) === J([[0, true], [10, false]]) && x.saved === 1, J(x));
    x = await run("mixedCounted", () => openGroup(be, { product: GM[1], all: GM, companies: CO, sections: SEC }),
      async (s) => { await s.type((p) => p.id === "bulk-stock-0", "6"); await saveGroup(s); }, grp);
    ok("mixedCounted", `${tag}:   والمفتاحُ مطفأ ورصيدُ «a» المجمَّع مكتوب (٦): عُدّ — يُرسل معه «معدود» بشرط ما ظهر`,
      x.pooled?.length === 0 && x.a?.length === 1 && x.a[0].patch.pooled === false && x.a[0].patch.stock === 6 && x.a[0].expect.stock === 0
      && x.b?.length === 1 && x.b[0].patch.pooled !== true && J(x.rows) === J([[6, false], [10, false]]) && x.saved === 1, J(x));
    x = await run("mixedToggleOn", () => openGroup(be, { product: GM[1], all: GM, companies: CO, sections: SEC, moved: { a: { pooled: false, stock: 4 } } }),
      toggleSave, grp);
    ok("mixedToggleOn", `${tag}: المفتاحُ يُضاء بمختلطة: المعدودُ يُطوى بدالّته، والمجمَّعُ (كما تعرفه القائمة) لا يُكتب له true — شراءٌ عدّه بـ٤ يبقى ٤`,
      J(x.pooled) === J([["b", "s1"]]) && J(x.seq) === J(["update:a", "update:b", "pool:b"]) && noFlag(x.a) && noFlag(x.b) && !has(x.b[0].patch, "stock")
      && J(x.rows) === J([[4, false], [10, false]]) && x.saved === 1 && x.errors?.length === 0, J(x));
    x = await run("groupSectionCleared", () => openGroup(be, { product: GM[1], all: GM, companies: CO, sections: SEC }),
      async (s) => { await s.pick("pos.sectionPh", ""); await saveGroup(s); },
      (s) => ({ ...grp(s), sections: ["a", "b"].map((id) => s.row(id).section_id) }));
    ok("groupSectionCleared", `${tag}:   والصنفُ المشترك يُفرَغ بمختلطةٍ فُتحت من المعدود — «a» المجمَّعُ يُفكّ معه، فلا مجمَّعَ بلا صنف`,
      x.pooled?.length === 0 && x.a?.length === 1 && x.a[0].patch.pooled === false && x.a[0].patch.section_id === null
      && J(x.sections) === J([null, null]) && J(x.rows) === J([[0, false], [10, false]]) && x.saved === 1, J(x));
    x = await run("groupUnpool", () => openGroup(be, { product: GP[0], all: GP, companies: CO, sections: SEC }), toggleSave, grp);
    ok("groupUnpool", `${tag}: إطفاءُ المفتاح المشترك يفكّ تجميعَ كلّ عضوٍ بكتابته (pooled:false)، بلا طيّ`,
      x.pooled?.length === 0 && [x.a, x.b].every((w) => w?.length === 1 && w[0].patch.pooled === false && !has(w[0].patch, "stock"))
      && J(x.rows) === J([[-1, false], [0, false]]) && x.saved === 1, J(x));
    /* والقائمةُ بائتة (جهازٌ آخر اشترى والمجموعةُ مفتوحة؛ القائمةُ تُسأل كلَّ خمس دقائق)، ثمّ وقد تحدّثت والنافذةُ مفتوحة. */
    x = await run("groupRace", () => openGroup(be, { product: GP[0], all: GP, companies: CO, sections: SEC, moved: { b: { pooled: false, stock: 4 } } }),
      async (s) => { await s.type((p) => p.id === "bulk-name-1", "ب٢"); await saveGroup(s); }, grp);
    ok("groupRace", `${tag}: شراءٌ جعل «b» معدوداً بـ٤ والمجموعةُ مفتوحة (القائمةُ بائتة) — تعديلُ اسمه لا يرجعه مجمَّعاً`,
      x.pooled?.length === 0 && noFlag(x.a) && noFlag(x.b) && J(x.rows) === J([[-1, true], [4, false]]) && x.saved === 1, J(x));
    x = await run("groupRacePolled", () => openGroup(be, { product: GP[0], all: GP, companies: CO, sections: SEC, moved: { b: { pooled: false, stock: 10 } } }),
      async (s) => { await s.poll([GP[0], { ...GP[1], pooled: false, stock: 10 }]); await s.type((p) => p.id === "bulk-name-0", "أ٢"); await saveGroup(s); }, grp);
    ok("groupRacePolled", `${tag}:   والقائمةُ تحدّثت والنافذةُ مفتوحة (b معدودٌ بـ١٠) وتعديلُ اسم «a» — «b» لا يُطوى ولا يُقلب`,
      x.pooled?.length === 0 && noFlag(x.a) && noFlag(x.b) && J(x.rows) === J([[-1, true], [10, false]]) && x.saved === 1, J(x));
    sides[side] = r;
  }
  ok("fold.sides", "الوجهان يخرجان من «ط» بنفس النتيجة حالةً بحالة", J(sides.cloud) === J(sides.demo), `${J(sides.cloud)} ≠ ${J(sides.demo)}`);
  ok("noUnhandled", "ولا وعدَ طيٍّ رُمي بلا من يمسكه (طيٌّ بلا await)", UNHANDLED.length === unhandledAt, `${UNHANDLED.length - unhandledAt} وعداً`);
  return out;
}

/** ط٢) الطيُّ بمرآة التجريبيّ الحقيقيّة: «ط» تسجّل ما يطلبه النموذج ودالّةُ الطيّ فيها مسجِّلة؛ وهنا تمرّ بعد التسجيل إلى poolProduct
 *  الحقيقيّة على مخزن التجريبيّ (0253 بمرآتها: الرصيدُ الموقَّع كلُّه للحوض) — فيُرى ما يصير بالرفّ والحوض فعلاً: −٢ تُطوى بحوضٍ ٥ ⇒
 *  الحوضُ ٣ والصفُّ صفرٌ مجمَّع (الحصرُ القديم أعطى ٥: +٢ لم تكن)، والمجموعةُ (−٢ و٣ بحوضٍ ٣ ⇒ ٤)، والمختلطةُ يُحفظ اسمُ عضوها فيبقى
 *  كلُّ عضوٍ على علمه والحوضُ كما هو. والوجهُ التجريبيّ وحده: السحابيُّ تحرسه «ط» بما يُطلب منه. وعلى الشِّفرة القديمة («ي») يسقط ما كان
 *  النموذجُ القديم يكتبه pooled: true مباشرةً — حارسُ 0255 (pool_direct) يردّه بالمرآة كما بالخادم. */
async function realPoolSuite(UI) {
  const { session, save, openGroup, saveGroup } = harness(UI);
  const be = backends.demo, out = [];
  const ok = (key, label, cond, detail = "") => out.push({ key, label, ok: !!cond, detail });
  const poolOf = (id) => JSON.parse(mem.get(DB_KEY)).companySections.find((s) => s.id === id)?.pooled_stock ?? null;
  const run = async (open, act, read) => { try { const s = await open(); await act(s); const r = read(s); s.done(); return r; } catch (e) { return { threw: String(e?.message ?? e) }; } };
  const rows = (s, ids) => ids.map((id) => [s.row(id).stock, !!s.row(id).pooled]);
  const F = { ...P, company_id: "co1", section_id: "s1", stock: -2 };
  let x = await run(() => session(be, { product: F, all: [F], companies: CO, sections: [{ ...SEC[0], pooled_stock: 5 }], real: true }),
    async (s) => { await s.toggle("pos.pooledToggle"); await save(s); },
    (s) => ({ seq: s.log.seq, rows: rows(s, ["p1"]), pool: poolOf("s1"), saved: s.log.saved, errors: s.log.errors }));
  ok("realFold-2", "التجريبيّ: مادّةٌ عند −٢ تُجمَّع بحوضٍ ٥ ⇒ poolProduct الحقيقيّة: الحوضُ ٣ والصفُّ صفرٌ مجمَّع (المجموعُ ٣ قبل الطيّ وبعده)",
    J(x.seq) === J(["update:p1", "pool:p1"]) && J(x.rows) === J([[0, true]]) && x.pool === 3 && x.saved === 1 && x.errors?.length === 0, J(x));
  const GS3 = [{ ...GA, company_id: "co1", section_id: "s1", stock: -2 }, { ...GB, company_id: "co1", section_id: "s1", stock: 3 }];
  x = await run(() => openGroup(be, { product: GS3[0], all: GS3, companies: CO, sections: SEC, real: true }),
    async (s) => { await s.toggle("pos.pooledToggle"); await saveGroup(s); },
    (s) => ({ seq: s.log.seq, rows: rows(s, ["a", "b"]), pool: poolOf("s1"), saved: s.log.saved, errors: s.log.errors }));
  ok("realGroupFold", "  وتجميعُ المجموعة (−٢ و٣) بحوضٍ ٣ يطوي كلَّ عضوٍ بالحقيقيّة: الحوضُ ٣ − ٢ + ٣ = ٤، والصفّان صفرٌ مجمَّع",
    J(x.seq) === J(["update:a", "pool:a", "update:b", "pool:b"]) && J(x.rows) === J([[0, true], [0, true]]) && x.pool === 4 && x.saved === 1 && x.errors?.length === 0, J(x));
  const GM3 = [{ ...GA, company_id: "co1", section_id: "s1", pooled: true, stock: 0 }, { ...GB, company_id: "co1", section_id: "s1", stock: 10 }];
  x = await run(() => openGroup(be, { product: GM3[0], all: GM3, companies: CO, sections: SEC, real: true }),
    async (s) => { await s.type((p) => p.id === "bulk-name-1", "ب٢"); await saveGroup(s); },
    (s) => ({ seq: s.log.seq, rows: rows(s, ["a", "b"]), name: s.row("b").name, pool: poolOf("s1"), saved: s.log.saved, errors: s.log.errors }));
  ok("realMixed", "  ومختلطةٌ (مجمَّعٌ بصفر، ومعدودٌ بـ١٠) فُتحت من المجمَّع ويُحفظ اسمُ «b» — كلُّ عضوٍ على علمه، و«b» ١٠، والحوضُ ٣ كما هو",
    J(x.seq) === J(["update:a", "update:b"]) && J(x.rows) === J([[0, true], [10, false]]) && x.name === "ب٢" && x.pool === 3 && x.saved === 1 && x.errors?.length === 0, J(x));
  return out;
}

let UI = null, uiErr = null;
try { UI = await buildUI(INV); } catch (e) { uiErr = e; }
console.log("▸ ح) النموذجُ الحقيقيّ مرسوماً — ما يصل الريبو بعد الكتابة بالحقول وضغط «حفظ»");
check("Inventory.tsx يُحزم ويُرسم ProductModal وProductRow", typeof UI?.ProductModal === "function" && typeof UI?.ProductRow === "object",
  uiErr ? String(uiErr.message).split("\n").slice(0, 3).join(" ") : "");
if (UI) {
  const { React, mount, ProductRow } = UI;
  const { session, save, openGroup, saveGroup } = harness(UI);
  const uiResults = {};
  for (const [side, be] of Object.entries(backends)) {
    const r = {}, tag = side === "cloud" ? "السحابيّ" : "التجريبيّ";
    const run = async (key, opts, act, read) => {
      try { const s = await opts(); await act(s); r[key] = read(s); s.done(); } catch (e) { r[key] = { threw: String(e?.message ?? e) }; }
      return r[key];
    };
    let x = await run("nameAfterSale", () => session(be, { product: P, all: [P], moved: { p1: { stock: 4 } } }),
      async (s) => { await s.type(nameField, "جديد"); await save(s); },
      (s) => ({ w: s.log.writes, stock: s.row("p1").stock, name: s.row("p1").name, saved: s.log.saved }));
    check(`${tag}: تعديلُ الاسم بعد بيعة — كتابةٌ واحدة بلا رصيدٍ ولا كلفةٍ ولا شرط، والبيعةُ باقية`,
      x.w?.length === 1 && !has(x.w[0].patch, "stock") && !has(x.w[0].patch, "purchase_price") && J(x.w[0].expect) === "{}" && x.stock === 4 && x.name === "جديد" && x.saved === 1, J(x));
    x = await run("negative", () => session(be, { product: { ...P, stock: -2 }, all: [{ ...P, stock: -2 }] }),
      async (s) => { await s.type(nameField, "جديد"); await save(s); }, (s) => ({ w: s.log.writes, stock: s.row("p1").stock }));
    check(`${tag}:   ورصيدٌ سالبٌ لم يُلمس يبقى سالباً`, x.w?.length === 1 && !has(x.w[0].patch, "stock") && x.stock === -2, J(x));
    x = await run("stockEdit", () => session(be, { product: P, all: [P] }),
      async (s) => { await s.type((p) => p.value === "5", "7"); await save(s); }, (s) => ({ w: s.log.writes, stock: s.row("p1").stock }));
    check(`${tag}: الرصيدُ المكتوب يُرسل وحده بشرط ما ظهر بالحقل`, x.w?.[0]?.patch.stock === 7 && J(x.w[0].expect) === J({ stock: 5 }) && !has(x.w[0].patch, "purchase_price") && x.stock === 7, J(x));
    x = await run("typedNegative", () => session(be, { product: P, all: [P] }),
      async (s) => { await s.type((p) => p.value === "5", "-3"); await save(s); }, (s) => ({ w: s.log.writes, stock: s.row("p1").stock }));
    check(`${tag}:   والمكتوبُ السالب تحت حارس ≥ ٠`, x.w?.[0]?.patch.stock === 0 && x.w[0].expect.stock === 5 && x.stock === 0, J(x));
    x = await run("costEdit", () => session(be, { product: P, all: [P] }),
      async (s) => { await s.type((p) => p.value === "1000", "1200"); await save(s); }, (s) => ({ w: s.log.writes, cost: s.row("p1").purchase_price }));
    check(`${tag}: سعرُ الشراء المكتوب يُرسل بشرط ما ظهر`, x.w?.[0]?.patch.purchase_price === 1200 && J(x.w[0].expect) === J({ purchase_price: 1000 }) && !has(x.w[0].patch, "stock") && x.cost === 1200, J(x));
    x = await run("stockMoved", () => session(be, { product: P, all: [P], moved: { p1: { stock: 4 } } }),
      async (s) => { await s.type((p) => p.value === "5", "7"); await save(s); },
      (s) => ({ stock: s.row("p1").stock, errors: s.log.errors, saved: s.log.saved, changed: s.log.changed }));
    check(`${tag}: الرصيدُ تحرّك ⇒ لا يُكتب، والرسالةُ errors.noRowUpdated، والقائمةُ تُقرأ من جديد`,
      x.stock === 4 && x.saved === 0 && x.changed === 1 && x.errors?.[0]?.[0] === "errors.noRowUpdated", J(x));
    x = await run("costMoved", () => session(be, { product: P, all: [P], moved: { p1: { purchase_price: 1300 } } }),
      async (s) => { await s.type((p) => p.value === "1000", "1200"); await save(s); },
      (s) => ({ cost: s.row("p1").purchase_price, errors: s.log.errors, saved: s.log.saved, changed: s.log.changed }));
    check(`${tag}: الكلفةُ تحرّكت ⇒ لا تُكتب فوقها، والرسالةُ errors.priceMoved`,
      x.cost === 1300 && x.saved === 0 && x.changed === 1 && x.errors?.[0]?.[0] === "errors.priceMoved", J(x));
    // المجمَّعُ والطيُّ إلى الحوض بـ«ط» (foldSuite): نفسُ الجلسات، وتجري على الطفرات أيضاً.
    // المجموعة
    x = await run("groupName", () => openGroup(be), async (s) => { await s.type((p) => p.id === "bulk-name-1", "ب٢"); await saveGroup(s); },
      (s) => { const b = s.row("b"); return { w: s.log.writes, b: { name: b.name, purchase_price: b.purchase_price, stock: b.stock }, saved: s.log.saved }; });
    check(`${tag}: حفظُ اسمٍ بالمجموعة — لا رصيدَ ولا كلفةَ لأيّ عضو، ولا شرط`, x.w?.length === 2 && x.w.every((w) => !has(w.patch, "stock") && !has(w.patch, "purchase_price") && J(w.expect) === "{}")
      && x.b.name === "ب٢" && x.b.purchase_price === 1200 && x.b.stock === 3 && x.saved === 1, J(x));
    x = await run("groupStock", () => openGroup(be), async (s) => { await s.type((p) => p.id === "bulk-stock-1", "9"); await saveGroup(s); },
      (s) => ({ a: s.by("a"), b: s.by("b"), stock: s.row("b").stock }));
    check(`${tag}: رصيدُ سطرٍ مكتوب يُرسل له وحده بشرط ما أظهره`, x.b?.[0]?.patch.stock === 9 && J(x.b[0].expect) === J({ stock: 3 }) && !has(x.a?.[0]?.patch, "stock") && x.stock === 9, J(x));
    x = await run("groupCost", () => openGroup(be), async (s) => { await s.type((p) => p.value === "1000", "1100"); await saveGroup(s); },
      (s) => ({ a: s.by("a"), b: s.by("b"), costs: [s.row("a").purchase_price, s.row("b").purchase_price] }));
    check(`${tag}: كلفةُ المجموعة المكتوبة لكلّ عضو، بشرط كلفته هو`, x.a?.[0]?.patch.purchase_price === 1100 && x.a[0].expect.purchase_price === 1000
      && x.b?.[0]?.patch.purchase_price === 1100 && x.b[0].expect.purchase_price === 1200 && J(x.costs) === J([1100, 1100]), J(x));
    x = await run("groupPolled", () => openGroup(be, { moved: { b: { stock: 2 } } }),
      async (s) => { await s.poll([GA, { ...GB, stock: 2 }]); await s.type((p) => p.id === "bulk-name-1", "ب٢"); await saveGroup(s); },
      (s) => ({ b: s.by("b"), stock: s.row("b").stock }));
    check(`${tag}: القائمةُ تحدّثت والنافذةُ مفتوحة — سطرٌ لم يُلمس لا يكتب رصيدَ الفتح فوق البيعة`, x.b?.length === 1 && !has(x.b[0].patch, "stock") && x.stock === 2, J(x));
    x = await run("groupPolledTyped", () => openGroup(be, { moved: { b: { stock: 2 } } }),
      async (s) => { await s.poll([GA, { ...GB, stock: 2 }]); await s.type((p) => p.id === "bulk-stock-1", "8"); await saveGroup(s); },
      (s) => ({ b: s.by("b"), stock: s.row("b").stock, errors: s.log.errors, changed: s.log.changed }));
    check(`${tag}:   والمكتوبُ يُشترط على ما أظهره السطر (٣) فيُرفض، ويُقال no_row_updated`, x.b?.[0]?.expect.stock === 3 && x.stock === 2
      && x.changed === 1 && x.errors?.[0]?.[1] === "errors.noRowUpdated", J(x));
    uiResults[side] = r;
  }
  check("الوجهان يخرجان من النموذج المرسوم بنفس النتيجة حالةً بحالة", J(uiResults.cloud) === J(uiResults.demo), `${J(uiResults.cloud)} ≠ ${J(uiResults.demo)}`);
  for (const [stock, tone] of [[-2, "danger"], [-0.001, "danger"], [0, "danger"], [3, "warn"], [9, "neutral"]]) {
    const ui = mount(React.createElement(ProductRow, { p: { ...P, stock }, onEdit() {}, onRemove() {} }));   // الشارةُ من الرسم نفسِه
    const tones = ui.all().filter((n) => n.type === "x-Badge" && ui.text(n).includes("pos.qtyStock")).map((n) => n.props.tone);
    check(`شارةُ الصفّ المرسوم عند ${stock}: ${tone}`, tones.length === 1 && tones[0] === tone, J({ tones, errors: ui.errors.map(String) }));
    ui.unmount();
  }
  console.log("▸ ط) علمُ «مجمّع» والطيُّ إلى الحوض (ui3) — الطيُّ بقلب المفتاح وبأيّ رصيد، والعلمُ حين يُغيَّر وحده، مفرداً ومجموعة");
  const folds = await foldSuite(UI);
  for (const r of folds) check(r.label, r.ok, r.detail, r.key);
  check(`  «ط» قالت ما فحصت: ${folds.length} سجلّاً (٣١ حالةً × وجهين + تطابقُهما + الوعودُ الممسوكة)`, folds.length === FOLD_RECORDS, String(folds.length));
  console.log("▸ ط٢) الطيُّ بمرآة التجريبيّ الحقيقيّة (poolProduct من repoDemo) — ما يصير بالرفّ والحوض فعلاً");
  const reals = await realPoolSuite(UI);
  for (const r of reals) check(r.label, r.ok, r.detail, r.key);
  check(`  «ط٢» قالت ما فحصت: ${reals.length} سجلّات`, reals.length === 3, String(reals.length));
}

/* ── ي) على الشِّفرة القديمة (INVENTORY_SRC): كلُّ سجلٍّ لفحصٍ جديد يسقط، وكلُّ ما عداه يمرّ ─────────────────
 * القديمُ قديمان (INVENTORY_BASE):
 *   pre  — ما قبل ui3: الطيُّ بشرط «رصيدٌ موجب»، والمجموعةُ تقلب العلمَ لكلّ عضوٍ بكتابةٍ مباشرة، والعلمُ يُرسل بكلّ حفظ.
 *   ui3a — أوّلُ تصليحٍ بـui3: الطيُّ بأيّ رصيد، لكن المجموعةُ تطوي كلَّ عضوٍ غيرِ مجمَّعٍ ما دام المفتاحُ مضاءً (لُمس أو لم
 *          يُلمس)، والنموذجان يرسلان علمَ لحظة الفتح بكلّ حفظ.
 * وما لا يسقط على قديمه حارسُ رجوع: القديمُ صحيحٌ فيه، وطفراتُ «ك» تُثبت أنه يحرس. */
const NEW_KEYS = {
  pre: ["ui3.text", "ui3.groupText", "fold-2", "fold0", "sectionMove", "sectionNew", "poolFails", "pooledFlag", "racePurchase", "racePooled",
    "groupFold", "groupSection", "groupVanished", "groupPoolFails", "groupPooledFlag", "mixedPooled", "mixedTracked", "mixedToggleOn",
    "groupRace", "groupRacePolled", "poolFailsNewSection", "groupPoolFailsNewSection",
    // «ط٢» (الجولة 3): القديمُ يقلب pooled مباشرةً (السالبُ، والمجموعةُ لكلّ عضو) فيردّه pool_direct، والمختلطةُ تُقلب كلُّها
    "realFold-2", "realGroupFold", "realMixed"],
  ui3a: ["ui3.text", "ui3.groupText", "pooledFlag", "racePurchase", "racePooled", "groupPooledFlag", "mixedPooled", "mixedTracked",
    "mixedToggleOn", "groupRace", "groupRacePolled", "poolFailsNewSection", "groupPoolFailsNewSection",
    // «ط٢»: أوّلُ تصليحٍ يطوي كلَّ عضوٍ معدودٍ والمفتاحُ مضاء — المعدودُ بـ١٠ يذهب للحوض (٣ ⇒ ١٣)
    "realMixed"],
};
if (process.env.INVENTORY_SRC) {
  const base = process.env.INVENTORY_BASE || "pre";
  const NEW = NEW_KEYS[base];
  if (!NEW) { console.error(`✗ inventory-cas-test: INVENTORY_BASE=${base} غيرُ معروف (${Object.keys(NEW_KEYS).join(" | ")})`); process.exit(1); }
  const md5 = createHash("md5").update(readFileSync(process.env.INVENTORY_SRC)).digest("hex");
  console.log(`▸ ي) الفحوصُ الجديدة على «${base}» (md5 ${md5}) — كلُّ سجلٍّ لها يجب أن يسقط`);
  let missed = 0;
  for (const k of NEW) {
    const rs = RESULTS.filter((r) => r.key === k);
    const caught = rs.length > 0 && rs.every((r) => !r.ok);
    if (!caught) missed++;
    console.log(`   ${caught ? "✓" : "✗"} ${k}: ${caught ? `يسقط على القديم (${rs.length})` : rs.length ? "يمرّ على القديم — لا يحرس التغيير" : "غائب — لم يُفحص"}`);
  }
  const others = RESULTS.filter((r) => !NEW.includes(r.key));
  const oldBad = others.filter((r) => !r.ok);
  console.log(`   الفحوصُ الأخرى على القديم: ${others.length - oldBad.length}/${others.length} تمرّ${oldBad.length ? ` — سقطت: ${oldBad.map((r) => r.name).join(" | ")}` : ""}`);
  console.log(missed || oldBad.length
    ? `\n✗ inventory-cas-test (قديم «${base}»): ${missed} فحصاً جديداً يمرّ، و${oldBad.length} غيرُه يسقط`
    : `\n✓ inventory-cas-test (قديم «${base}»): كلُّ الفحوص الجديدة (${NEW.length}) تسقط، وكلُّ غيرها (${others.length}) يمرّ`);
  process.exit(missed || oldBad.length ? 1 : 0);
}

/* ── ك) الطفرات (`--mutants`): نصٌّ يُستبدل بالذاكرة على Inventory.tsx — كلٌّ يجب أن تُسقط فحصاً من «ط» ────────────── */
const SINGLE_CALL = "const pooling = poolingPatch(cas.patch, pooled !== !!product.pooled || section_id == null, product.pooled);";
const SINGLE_WRITE = "await updateAsSeen(productIO, product.id, pooling.patch, cas.expect);";
const SINGLE_POOL = "if (pooling.fold) await repo.poolProduct(product.id, section_id as string);";
const SINGLE_KEEP = "createdCompany = null; createdSection = null;";
const FOLD_LINE = "if (toggled && pooled && !wasPooled) return { patch: folded, fold: true };";
const FLAG_LINE = "if (!pooled && (toggled || patch.stock !== undefined)) return { patch, fold: false };";
const GROUP_CALL = "const pooling = poolingPatch(cas.patch, poolToggled, before?.pooled);";
const GROUP_WRITE = "await updateAsSeen(productIO, r.productId, pooling.patch, cas.expect);";
const GROUP_POOL = "if (pooling.fold) await repo.poolProduct(r.productId, section_id as string);";
const GROUP_TRY = `            try {\n              ${GROUP_WRITE}\n            } catch (e) { if (isPriceMoved(e)) groupMoved = true; throw e; }\n            wrote = true;`;
const GROUP_KEEP = "if (done === 0 && !wrote) await rollbackGrouping(createdCompany, createdSection);";
const MUTANTS = [
  // القاعدة (poolingPatch) — للمسارين معاً
  ["كلُّ مجمَّعٍ يُطوى (ثانيةً، وبلا قلب المفتاح)", FOLD_LINE, "if (pooled) return { patch: folded, fold: true };"],
  ["التجميعُ بلا قلب المفتاح (أوّلُ تصليحٍ بـui3: المختلطةُ تُطوى بتعديل اسم)", FOLD_LINE, "if (pooled && !wasPooled) return { patch: folded, fold: true };"],
  ["كتابةُ الطيّ تقلب pooled بنفسها", "return { patch: folded, fold: true };", "return { patch: { ...folded, pooled }, fold: true };"],
  ["علمُ لحظة الفتح يُرسل بكلّ حفظ (أوّلُ تصليحٍ بـui3)", "return { patch: kept, fold: false };", "return { patch, fold: false };"],
  ["إطفاءُ المفتاح لا يُرسل «معدود»", FLAG_LINE, "if (!pooled && patch.stock !== undefined) return { patch, fold: false };"],
  ["الرصيدُ المكتوب لا يُرسل «معدود»", FLAG_LINE, "if (!pooled && toggled) return { patch, fold: false };"],
  ["المفتاحُ المضاء يكتب true لمجمَّعٍ قائم", FLAG_LINE, "if (toggled || patch.stock !== undefined) return { patch, fold: false };"],
  // النموذجُ المفرد
  ["الطيُّ بشرط «رصيدٌ موجب» (ما قبل ui3)", SINGLE_CALL,
    "const pooling = poolingPatch(cas.patch, (pooled !== !!product.pooled || section_id == null) && (product.stock || 0) > 0, product.pooled);"],
  ["كتابةُ الطيّ ترسل الرصيدَ المكتوب", SINGLE_WRITE,
    "await updateAsSeen(productIO, product.id, pooling.fold ? { ...pooling.patch, stock: Number(f.stock) || 0 } : pooling.patch, cas.expect);"],
  ["الطيُّ قبل الكتابة", `${SINGLE_WRITE}\n        ${SINGLE_KEEP}\n        ${SINGLE_POOL}`, `${SINGLE_POOL}\n        ${SINGLE_WRITE}\n        ${SINGLE_KEEP}`],
  ["الطيُّ لحوض الصنف القديم", SINGLE_POOL, "if (pooling.fold) await repo.poolProduct(product.id, product.section_id as string);"],
  ["فشلُ الطيّ يُبلع فيُقال «انحفظ»", SINGLE_POOL, "if (pooling.fold) await repo.poolProduct(product.id, section_id as string).catch(() => null);"],
  ["بلا صنفٍ تبقى المادّةُ مجمَّعة", SINGLE_CALL, "const pooling = poolingPatch(cas.patch, pooled !== !!product.pooled, product.pooled);"],
  ["الطيُّ بلا انتظار", SINGLE_POOL, "if (pooling.fold) void repo.poolProduct(product.id, section_id as string);"],
  ["فشلُ الطيّ يحذف الصنفَ الذي كُتبت تحته المادّة", SINGLE_KEEP, ""],
  // تعديلُ المجموعة
  ["المفتاحُ المشترك «مقلوب» بعلمه لا بما فُتح عليه", "const poolToggled = pooled !== !!product?.pooled || section_id == null;", "const poolToggled = pooled;"],
  ["بلا صنفٍ مشترك يبقى العضوُ المجمَّعُ مجمَّعاً", "const poolToggled = pooled !== !!product?.pooled || section_id == null;", "const poolToggled = pooled !== !!product?.pooled;"],
  ["المجموعةُ ترسل حمولتَها كما هي (ما قبل ui3: تقلب العلمَ مباشرةً)", GROUP_CALL, "const pooling = { patch: cas.patch, fold: false };"],
  ["عضوٌ مجمَّعٌ يُطوى ثانيةً", GROUP_CALL, "const pooling = poolingPatch(cas.patch, poolToggled, false);"],
  ["عضوٌ غاب عن القائمة لا يُطوى", GROUP_CALL, "const pooling = poolingPatch(cas.patch, poolToggled, before ? before.pooled : true);"],
  ["عضوٌ سالبٌ لا يُطوى", GROUP_CALL, "const pooling = poolingPatch(cas.patch, poolToggled && (before?.stock || 0) > 0, before?.pooled);"],
  ["كتابةُ عضوٍ يُطوى تقلب pooled بنفسها", GROUP_WRITE, "await updateAsSeen(productIO, r.productId, pooling.fold ? cas.patch : pooling.patch, cas.expect);"],
  ["المجموعةُ تطوي قبل الكتابة", `${GROUP_TRY}\n            ${GROUP_POOL}`, `            ${GROUP_POOL}\n${GROUP_TRY}`],
  ["المجموعةُ تطوي لحوض الصنف القديم", GROUP_POOL, "if (pooling.fold) await repo.poolProduct(r.productId, before?.section_id as string);"],
  ["فشلُ طيِّ عضوٍ يُبلع", GROUP_POOL, "if (pooling.fold) await repo.poolProduct(r.productId, section_id as string).catch(() => null);"],
  ["طيُّ عضوٍ بلا انتظار", GROUP_POOL, "if (pooling.fold) void repo.poolProduct(r.productId, section_id as string);"],
  ["فشلُ طيِّ كلّ الأعضاء يحذف الصنفَ الذي كُتبوا تحته", GROUP_KEEP, "if (done === 0) await rollbackGrouping(createdCompany, createdSection);"],
];
const mutate = process.argv.includes("--mutants");
let mutantUnhandled = 0;
if (mutate) {
  console.log(`▸ ك) ${MUTANTS.length} طفرة على Inventory.tsx بالذاكرة (والملفُّ لا يُمسّ) — كلٌّ لازم تُسقط فحصاً من «ط»`);
  const loud = console.error;
  for (const [name, from, to] of MUTANTS) {
    const at = INV.split(from).length - 1;
    if (at !== 1) { check(`طفرة «${name}»: نصُّها يقع مرّةً واحدة بالمصدر`, false, `${at} مرّة — حدّث الطفرة`); continue; }
    let res;
    const u0 = UNHANDLED.length;
    console.error = () => {};   // React يكتب أخطاءَ الطفرة الممسوكة بالكونسول — العدُّ وحده يُقرأ هنا
    try { res = await foldSuite(await buildUI(INV.replace(from, to))); } catch (e) { res = e; } finally { console.error = loud; }
    mutantUnhandled += UNHANDLED.length - u0;
    // طفرةٌ لا تنبني (أو جولةٌ رمت خارج حالاتها) لم يُفحص فيها شيء: «أمسكها» عنها خواء — تُفشل كطفرةٍ نجت.
    if (!Array.isArray(res)) { check(`طفرة «${name}»: تنبني وتجري`, false, String(res?.message ?? res).split("\n")[0]); continue; }
    const caught = res.filter((r) => !r.ok);
    check(`طفرة «${name}» — أمسكها ${[...new Set(caught.map((r) => r.key))].join("، ") || "∅"}`, caught.length > 0, `مرّت كلُّ الفحوص (${res.length})`);
  }
}

check("ولا وعدَ رُمي بلا من يمسكه بالجولة كلّها (ما خلا الطفرات)", UNHANDLED.length - mutantUnhandled === 0,
  UNHANDLED.slice(0, 3).map((e) => String(e?.message ?? e)).join(" | "));
console.log(fails ? `\n✗ inventory-cas-test: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ inventory-cas-test: ${passes} نجحت، 0 فشلت${mutate ? ` (منها ${MUTANTS.length} طفرةً أمسكتها «ط»)` : ""}`);
process.exit(fails ? 1 : 0);
