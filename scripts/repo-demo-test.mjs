/* ============================================================================
 * فحصُ النسخة التجريبية من `repo.ts` — «حارسٌ لا يوجد هنا حارسٌ لم يُفحص».
 *
 * لماذا هذا الملفّ موجود: النسخةُ التجريبية (localStorage) ليست عرضاً تسويقياً،
 * هي **مرآةُ الخادم** التي تجري عليها فحوصُ المنطق. وحين تنحرف عن الخادم تصير
 * أسوأ من لا شيء: تُظهر سلوكاً لا يقع بالإنتاج، فتُخفي العطلَ بدل أن تكشفه.
 *
 * وثلاثةُ انحرافاتٍ قائمةٍ كشفتها دفعةُ تحصين الباركود:
 *   ١) `invNormCode` بقيت تشيل المسافاتِ والأرقامَ العربية وحدها بعد أن صار
 *      `inv_norm_code` بالقاعدة (0164) مرآةً حرفية لـ`matchCode` — فرمزٌ
 *      بعلامة اتجاهٍ خفية أو بحرفٍ كبير يُطابَق سحابياً ولا يُطابَق هنا.
 *   ٢) مطابقةُ الشراء بقيت تقرأ الرمزَ الأساسيَّ وحده بعد أن صار الخادم (0166)
 *      يقرأ `alt_codes` كذلك.
 *   ٣) `barcodeHealth` الجديدة (0168) — قسمةُ «توأم» و«مستعير» دقيقةٌ بحدّها،
 *      وأوّلُ صياغةٍ لها بالقاعدة جعلت أحدَ النوعين مستحيلاً.
 *
 *   node scripts/repo-demo-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- مخزنٌ بالذاكرة مكانَ localStorage، قبل تحميل الوحدة ------------------ */
const mem = new Map();
/* حصّةٌ تُملأ عند الطلب — الحصّةُ الحقيقيةُ ترمي `QuotaExceededError` من
 * `setItem`، فهذا هو المحاكى بالضبط. */
let quotaFull = false;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (quotaFull) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
    mem.set(k, String(v));
  },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
/* `dispatchEvent` و`CustomEvent` ما كانا موجودَين، فكان `saveDB` يبلع
 * الـ`ReferenceError` بقوسه الداخليّ — أي أنّ القالبَ ما كان يرى الحدثَ أصلاً. */
let quotaEvents = 0;
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? {
  localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {},
  dispatchEvent(e) { if (e?.type === "vp:demo-quota-full") quotaEvents++; return true; },
};
/* الوحدةُ تجرّ معها إعدادَ اللغة (يلمس `document`) — فمتصفّحٌ بالحدّ الأدنى. */
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};
// `navigator` موجودٌ بنود ٢٤ بقارئٍ فقط — لا نلمسه إن كان.

/* ---- الوحدةُ الحقيقية من المصدر، لا نسخةٌ منها ---------------------------- */
const EMPTY = new Set([
  "@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js",
  "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify",
]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      // `use().init()` يُنادى بسلسلةٍ عند تحميل i18n، فالبديلُ يرجع نفسَه.
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
// حزمةٌ بحجم ميغابايت: تُكتب ملفاً مؤقتاً وتُستورد منه. عنوانُ `data:` بهذا
// الطول يفشل استيرادُه، ورسالةُ الفشل تطبع الحزمةَ كلَّها فتخفي سببَها.
const built = await esbuild.build({
  entryPoints: ["src/lib/repo.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs], logLevel: "silent",
  // `import.meta.env` من فيت — لا وجودَ له بنود، فيُستبدل بكائنٍ فارغ.
  define: { "import.meta.env": "__VITE_ENV__" },
  banner: { js: "const __VITE_ENV__ = {};" },
});
const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const dir = mkdtempSync(join(tmpdir(), "repo-demo-"));
const file = join(dir, "repo.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const repo = mod.repo ?? mod.demoRepo;
if (!repo) { console.error("✗ repo-demo-test: ما انحمّلت الوحدة"); process.exit(1); }

/* ---- زرعُ مخزنٍ بالذاكرة بمفتاح الديمو نفسِه ------------------------------
 * المفتاحُ يُقرأ من `demoStore.ts` لا يُكتب هنا بيد: أوّلُ صياغةٍ خمّنته، فكتبت
 * بمفاتيحَ لا يقرأها أحد، فحمّل المخزنُ بذرتَه الافتراضية — وفحصُ «مخزنٌ نظيف
 * يرجع صفراً» **نجح وهو يقيس مخزناً غير الذي زرعته**. فحصٌ يمرّ على لا شيء
 * أسوأ من فحصٍ يفشل، فصار المفتاحُ مقروءاً والزرعُ مؤكَّداً بعد كلّ زرعة. */
const { readFileSync } = await import("node:fs");
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ repo-demo-test: ما انقرأ مفتاحُ مخزن الديمو من demoStore.ts"); process.exit(1); }
const seed = (products) => {
  mem.set(DB_KEY, JSON.stringify({
    products, companies: [], companySections: [], purchases: [], purchaseItems: [],
    invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  }));
};
/** يتأكّد أن ما زُرع هو ما يُقرأ — لا بذرةَ ديمو تسلّلت مكانَه. */
const seeded = async (n) => (await repo.listProducts()).length === n;

const P = (id, name, barcode, extra = {}) => ({ id, name, barcode, stock: 1, ...extra });
/** طبقةُ النجدة بالواجهة — تُحمَّل من مصدرها للمقارنة بها، لا تُحاكى:
 *  المرآةُ التجريبية تُقاس على ما تفعله الشاشةُ فعلاً، لا على نسخةٍ منه. */
const pcBuilt = await esbuild.build({
  entryPoints: ["src/lib/productCodes.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs], logLevel: "silent",
});
const { rescueScan } = await import("data:text/javascript;base64," + Buffer.from(pcBuilt.outputFiles[0].text).toString("base64"));
/** هل يحمل هذا المنتجُ الرمزَ (أساسيّاً أو إضافياً)؟ — للعدّ بالفحوص. */
const matchAll = (p, code) => p.barcode === code || (p.alt_codes ?? []).includes(code);

console.log("▸ barcodeHealth — مرآةُ verify_barcode_health (0168)");
{
  seed([
    P("t1", "توأم أ", "HB-100"),
    P("t2", "توأم ب", "hb-100"),                                  // طيُّ الحالة
    P("o1", "صاحبُ الرمز", "HB-OWN"),
    P("b1", "المستعير", "HB-BORROWER", { alt_codes: ["HB-OWN"] }),
    P("a1", "كيبورد عربي", "اففحس"),
    P("x1", "إكسل علمي", "1.23457E+12"),
    P("x2", "إكسل ذيل", "8681234567890.0"),
    P("e1", "رمز فارغ", "‎ "),
    P("g1", "سليم", "6970967772736"),
  ]);
  check("والزرعُ هو المقروء (لا بذرةَ ديمو تسلّلت)", await seeded(9));
  const rows = await repo.barcodeHealth();
  const of = (k) => rows.filter((r) => r.kind === k).map((r) => r.product_id).sort();
  check("التوأمُ المطبَّع يُكشف بالطرفين", JSON.stringify(of("twin")) === JSON.stringify(["t1", "t2"]), JSON.stringify(of("twin")));
  check("والمستعيرُ وحده يُعرض لا صاحبُ الرمز", JSON.stringify(of("alt_owned")) === JSON.stringify(["b1"]), JSON.stringify(of("alt_owned")));
  check("والحروفُ العربية", JSON.stringify(of("arabic")) === JSON.stringify(["a1"]));
  check("وشكلا إكسل", JSON.stringify(of("excel")) === JSON.stringify(["x1", "x2"]));
  check("والرمزُ الذي يفرغ بعد التطبيع", JSON.stringify(of("empty")) === JSON.stringify(["e1"]));
  check("والسليمُ لا يُشتكى منه", !rows.some((r) => r.product_id === "g1"));
}
{
  seed([P("s1", "أول", "111"), P("s2", "ثاني", "222"), P("s3", "بلا رمز", null)]);
  check("والزرعُ هو المقروء", await seeded(3));
  check("ومخزنٌ نظيف يرجع صفراً", (await repo.barcodeHealth()).length === 0);
}
{
  // منتجٌ كتب رمزَه الأساسيَّ بإضافيّاته أيضاً: ليس مستعيراً من نفسه.
  seed([P("m1", "نفسه", "SAME", { alt_codes: ["SAME"] })]);
  check("ورمزٌ مكرَّرٌ على المنتج نفسِه ليس عطلاً", (await repo.barcodeHealth()).length === 0);
}
{
  // رمزٌ إضافيٌّ عند اثنين ولا أحدَ يملكه أساسياً: توأمٌ لا استعارة.
  seed([P("p1", "أ", "A-1", { alt_codes: ["SHARED"] }), P("p2", "ب", "B-1", { alt_codes: ["SHARED"] })]);
  const rows = await repo.barcodeHealth();
  check("وإضافيٌّ مشترَكٌ بلا صاحبٍ أساسيّ = توأم", rows.length === 2 && rows.every((r) => r.kind === "twin"),
    JSON.stringify(rows.map((r) => r.kind)));
}

console.log("\n▸ recordPurchase — مرآةُ مطابقة 0166 (الأساسيّ والإضافيّ)");
{
  seed([
    P("r1", "رقمُ رفّ وباركودُ مصنع", "247", { alt_codes: ["6970967772736"], stock: 5 }),
  ]);
  await repo.recordPurchase([{ barcode: "6970967772736", name: "شيء", qty: 3, purchase_price: 1000, sell_price: 1500 }], {});
  const after = (await repo.listProducts()).find((p) => p.id === "r1");
  check("الشراءُ بالرمز الإضافيّ يُرصَّد على القائم لا على توأمٍ جديد", after?.stock === 8, `stock=${after?.stock}`);
  check("  ولا يُنشأ صفٌّ ثانٍ", (await repo.listProducts()).length === 1);
}
{
  // الأساسيُّ يغلب الإضافيَّ حين يتزاحمان على رمزٍ واحد.
  seed([
    P("own", "صاحبُ الرمز", "9990001", { stock: 1 }),
    P("brw", "المستعير", "OTHER", { alt_codes: ["9990001"], stock: 1 }),
  ]);
  await repo.recordPurchase([{ barcode: "9990001", name: "شيء", qty: 4, purchase_price: 1000, sell_price: 1500 }], {});
  const list = await repo.listProducts();
  check("والأساسيُّ يغلب الإضافيَّ عند التزاحم", list.find((p) => p.id === "own")?.stock === 5,
    JSON.stringify(list.map((p) => [p.id, p.stock])));
}

console.log("\n▸ updatePurchase — مرآةُ 0205 (التعديلُ لا يخترع بضاعة)");
{
  /* اشترِ ٥٠، بِع ٤٥ (الرصيد ٥)، ثمّ عدّل الفاتورة **بلا تغييرِ كمية**.
   * الحصرُ بصفرٍ بخطوة العكس كان يعطي ٥٠ — خمسٌ وأربعون قطعةً مخترعة.
   * ووقعت بالإنتاج فعلاً: 2026-09-16، «رمل جاك 20 لتر»، ١٤ ⇒ ١٥. */
  seed([P("fast", "رملٌ سريعُ الحركة", "FAST-50", { stock: 0 })]);
  const pur = await repo.recordPurchase(
    [{ product_id: "fast", barcode: "FAST-50", name: "رملٌ سريعُ الحركة", qty: 50, purchase_price: 1000, sell_price: 1500 }], {});
  check("الشراءُ رصّد خمسين", (await repo.listProducts()).find((p) => p.id === "fast")?.stock === 50);
  const d = JSON.parse(mem.get(DB_KEY));                     // بيعُ ٤٥ — ننقص الرصيد
  d.products.find((p) => p.id === "fast").stock = 5;         // كما يفعل البيع، فالمقصودُ
  mem.set(DB_KEY, JSON.stringify(d));                        // فحصُ التعديل وحده.
  await repo.updatePurchase(pur.id,
    [{ product_id: "fast", barcode: "FAST-50", name: "رملٌ سريعُ الحركة", qty: 50, purchase_price: 1000, sell_price: 1500 }], {});
  const same = (await repo.listProducts()).find((p) => p.id === "fast");
  check("تعديلٌ بلا تغييرِ كميةٍ لا يخترع بضاعة (يبقى ٥)", same?.stock === 5, `stock=${same?.stock}`);
  await repo.updatePurchase(pur.id,
    [{ product_id: "fast", barcode: "FAST-50", name: "رملٌ سريعُ الحركة", qty: 30, purchase_price: 1000, sell_price: 1500 }], {});
  const less = (await repo.listProducts()).find((p) => p.id === "fast");
  check("  وتخفيضُ الكمية يُطرح فعلاً ولا ينزل تحت صفر", less?.stock === 0, `stock=${less?.stock}`);
}

console.log("\n▸ الكشف — مرآةُ 0211 (نفسُ قالب الحزمة)");
{
  seed([
    P("e1", "سيفوتاكس الكشف", "EFF-1", { stock: 4, sell_price: 3000, purchase_price: 2000 }),
    P("e2", "شامبو الكشف", null, { stock: 2, sell_price: 5000, purchase_price: 4000 }),
    P("e3", "رفّ الكشف", "SHELF-EFF", { alt_codes: ["EFF-ALT-9"], stock: 1, sell_price: 1000, purchase_price: 800 }),
  ]);
  const pur = await repo.recordPurchase([
    { barcode: "EFF-1", name: "سيفوتاكس الكشف", qty: 50, purchase_price: 2000, sell_price: 2500 },
    { name: "شامبو الكشف", qty: 3, purchase_price: 4000, sell_price: 0 },
    { barcode: "EFF-ALT-9", name: "وصلت بالرمز الإضافي", qty: 2, purchase_price: 800, sell_price: 0 },
    { barcode: "EFF-NEW-1", name: "رمل الكشف", qty: 15, purchase_price: 100, sell_price: 150 },
  ], { company_name: "مورّد الكشف" });
  const ef = await repo.listPurchaseEffects(pur.id);
  const L = (n, op = "record") => ef.find((e) => e.line_no === n && e.op === op);
  check("سعرُ البيع تبدّل بالباركود — قبلُ ٣٠٠٠ وبعدُ ٢٥٠٠، وبـchanged بلا الرصيد",
    L(1)?.matched_by === "barcode" && L(1)?.before?.sell_price === 3000 && L(1)?.after?.sell_price === 2500
      && L(1)?.changed.includes("sell_price") && !L(1)?.changed.includes("stock"), JSON.stringify(L(1)));
  check("  والرصيدُ قبل/بعد ٤ ⇒ ٥٤", L(1)?.before?.stock === 4 && L(1)?.after?.stock === 54);
  check("  سطرٌ بلا باركود لُقي بالاسم", L(2)?.matched_by === "name" && L(2)?.changed.length === 0, JSON.stringify(L(2)));
  check("  ورمزٌ إضافيٌّ وحدَه ⇒ alt_code بلا تبديل باركود", L(3)?.matched_by === "alt_code" && L(3)?.product_id === "e3" && !L(3)?.changed.includes("barcode"));
  check("  ورمزٌ جديد ⇒ created بلا «قبل»", L(4)?.outcome === "created" && L(4)?.matched_by === null && L(4)?.before === null);
  const d = JSON.parse(mem.get(DB_KEY));
  d.products.find((p) => p.id === "e1").stock = 4;
  mem.set(DB_KEY, JSON.stringify(d));
  await repo.updatePurchase(pur.id, [
    { product_id: "e1", barcode: "EFF-1", name: "سيفوتاكس الكشف", qty: 40, purchase_price: 2000, sell_price: 2500 },
    { name: "شامبو الكشف", qty: 3, purchase_price: 4000, sell_price: 0 },
    { barcode: "EFF-ALT-9", name: "وصلت بالرمز الإضافي", qty: 2, purchase_price: 800, sell_price: 0 },
  ], { company_name: "مورّد الكشف" });
  const ef2 = await repo.listPurchaseEffects(pur.id);
  const U = (n) => ef2.find((e) => e.line_no === n && e.op === "update");
  check("التعديلُ يضيف op=update ولا يمسح record (٤/٤)",
    ef2.filter((e) => e.op === "record").length === 4 && ef2.filter((e) => e.op === "update").length === 4);
  check("  «كان» قبل التعديل (٤) و«صار» بعد الحصرة (صفر)", U(1)?.before?.stock === 4 && U(1)?.after?.stock === 0 && U(1)?.matched_by === "id",
    JSON.stringify([U(1)?.before?.stock, U(1)?.after?.stock]));
  const rm = ef2.find((e) => e.op === "update" && e.outcome === "removed");
  check("  والمشالُ يُقال: removed بـ-١٥ و١٥ ⇒ ٠", rm?.qty === -15 && rm?.before?.stock === 15 && rm?.after?.stock === 0, JSON.stringify(rm));
}
{
  /* ٢·٤: توأمان بنفس الاسم — الحالتان اللتان **تفرّقان** مراتبَ NULL الثلاث عن
   * «يطابق/لا يطابق» (المرآةُ القديمة تفشل بكلتيهما؛ حالةٌ لا تفشل قبل الإصلاح لا تحرس).
   * ونفسُ القالب بـrun.sh فأيُّ افتراقٍ يفشّل طرفاً. */
  seed([
    P("tw-null", "كالسيوم التوأم", null, { stock: 1, company_id: null, created_at: "2026-01-01T00:00:00Z" }),
    P("tw-other", "كالسيوم التوأم", null, { stock: 1, company_id: "CO-X", created_at: "2026-06-01T00:00:00Z" }),
  ]);
  const pur = await repo.recordPurchase([{ name: "كالسيوم التوأم", qty: 5, purchase_price: 100, sell_price: 0 }], { company_id: "CO-T" });
  const e = (await repo.listPurchaseEffects(pur.id))[0];
  check("توأمان بالاسم وفاتورةُ شركةٍ ثالثة: شركةٌ أخرى قبل «بلا شركة» (nulls last)", e?.product_id === "tw-other", JSON.stringify(e?.product_id));
  seed([
    P("tw-co", "كالسيوم التوأم", null, { stock: 1, company_id: "CO-X", created_at: "2026-01-01T00:00:00Z" }),
    P("tw-none", "كالسيوم التوأم", null, { stock: 1, company_id: null, created_at: "2026-06-01T00:00:00Z" }),
  ]);
  const pur2 = await repo.recordPurchase([{ name: "كالسيوم التوأم", qty: 1, purchase_price: 100, sell_price: 0 }], {});
  const e2 = (await repo.listPurchaseEffects(pur2.id))[0];
  check("  وفاتورةٌ بلا شركة: لا تمييزَ بالشركة ⇒ الأقدم", e2?.product_id === "tw-co", JSON.stringify(e2?.product_id));
}

console.log("\n▸ productMovements — مرآةُ 0207 (قصّةُ الإنتاج نفسُها)");
{
  /* «رمل جاك 20 لتر»، عيادةٌ حقيقية، ١٥–١٦ أيلول: وُلد بـ١٥، تعديلُ فاتورةٍ
   * لا يغيّر شيئاً، بيعُ واحدة، ثمّ تعديلُ فاتورةٍ رفع الرصيد ١٤ ⇐ ١٥ —
   * القطعةُ التي اخترعها الحصرُ قبل 0205. نفسُ قالب الحزمة حرفاً. */
  seed([P("sand", "رملُ الفحص", "S-1", { stock: 15 })]);
  const d = JSON.parse(mem.get(DB_KEY));
  d.purchases = [{ id: "PU1", clinic_id: "c1", created_at: "2026-09-15T09:55:34.000Z" }];
  d.purchaseItems = [{ id: "PI1", purchase_id: "PU1", product_id: "sand", qty: 15 }];
  d.invoices = [{ id: "IV1", clinic_id: "c1", created_at: "2026-09-15T17:34:20.000Z" }];
  d.invoiceItems = [{ id: "II1", invoice_id: "IV1", product_id: "sand", qty: 1 }];
  mem.set(DB_KEY, JSON.stringify(d));
  const au = [
    ["a1", "INSERT", "products", "sand", { stock: 15 }, "2026-09-15T09:55:34.000Z"],
    ["a2", "UPDATE", "products", "sand", { __changed: { stock: [15, 0] } }, "2026-09-15T13:36:06.000Z"],
    ["a3", "UPDATE", "products", "sand", { __changed: { stock: [0, 15] } }, "2026-09-15T13:36:06.000Z"],
    ["a4", "UPDATE", "purchases", "PU1", { __changed: { total: [1, 2] } }, "2026-09-15T13:36:06.000Z"],
    ["a5", "UPDATE", "products", "sand", { __changed: { stock: [15, 14] } }, "2026-09-15T17:34:20.000Z"],
    ["a6", "UPDATE", "products", "sand", { __changed: { stock: [14, 0] } }, "2026-09-16T09:22:25.000Z"],
    ["a7", "UPDATE", "products", "sand", { __changed: { stock: [0, 15] } }, "2026-09-16T09:22:25.000Z"],
    ["a8", "UPDATE", "purchases", "PU1", { __changed: { total: [2, 3] } }, "2026-09-16T09:22:25.000Z"],
    ["a9", "UPDATE", "products", "sand", { __changed: { stock: [15, 9] } }, "2026-09-18T11:00:00.000Z"],
  ].map(([id, action, entity, entity_id, details, created_at]) => ({ id, action, entity, entity_id, details, actor: null, created_at }));
  // مفتاحُ السجلّ من مصدره لا مكتوبٌ بيد — مفتاحٌ مخمَّنٌ يجعل الفحصَ يمرّ على بذرةٍ غيرِ بذرتنا.
  const AK = /const DEMO_AUDIT_KEY = "([^"]+)"/.exec((readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */)?.[1];
  check("مفتاحُ سجلّ الجهاز مقروءٌ من المصدر", !!AK);
  mem.set(AK, JSON.stringify(au.slice().reverse()));
  const mv = await repo.productMovements("sand");
  const at = (t) => mv.find((m) => m.at.startsWith(t));
  check("خمسُ خطواتٍ لا تسع (الخطوةُ الوسطى تُطوى)", mv.length === 5, `len=${mv.length}`);
  check("  والميلادُ «أوّل إدخال»", at("2026-09-15T09:55")?.kind === "open");
  check("  والبيعُ بيعٌ بفرقٍ سالب",
    at("2026-09-15T17:34")?.kind === "sale" && at("2026-09-15T17:34")?.delta === -1);
  check("  **وتعديلُ الفاتورة يُسمّى تعديلَ فاتورة**", at("2026-09-16T09:22")?.kind === "purchase_edit",
    at("2026-09-16T09:22")?.kind);
  check("  **ويكشف القطعةَ المخترَعة ١٤ ⇐ ١٥**",
    at("2026-09-16T09:22")?.from_qty === 14 && at("2026-09-16T09:22")?.to_qty === 15);
  check("  والصفرُ الوسطيُّ لا يُعرض", !mv.some((m) => m.to_qty === 0));
  check("  وما بلا فاتورةٍ يبقى «تعديل»", at("2026-09-18T11:00")?.kind === "adjust");
}

console.log("\n▸ restoreProduct — مرآةُ 0165/0167 (الاستعادةُ لا تسرق رمزاً)");
{
  // منتجٌ قائمٌ أخذ الرمزَ أثناء غياب المحذوف: أساسيّاً عنده، وإضافيّاً عند آخر.
  seed([
    P("live", "القائم", "TAKEN-1", { alt_codes: ["TAKEN-2"] }),
    P("free", "حرّ", "OTHER"),
  ]);
  const db = JSON.parse(mem.get(DB_KEY));
  db.productsTrash = [{
    id: "old", clinic_id: null, sold_qty: 0, stock: 0, reason: null, deleted_by: null,
    deleted_at: "2026-01-01T00:00:00.000Z", invoice_item_ids: [], purchase_item_ids: [],
    row: { id: "old", name: "المستعاد", barcode: "TAKEN-1", stock: 0, alt_codes: ["TAKEN-2", "MINE-9"] },
  }];
  mem.set(DB_KEY, JSON.stringify(db));
  const back = await repo.restoreProduct("old");
  check("الباركودُ المأخوذ لا يُعاد", back.barcode === null, JSON.stringify(back.barcode));
  check("والرمزُ الإضافيُّ الذي صار لغيره لا يُعاد", !(back.alt_codes ?? []).includes("TAKEN-2"));
  check("  ورمزُه الذي ما زال حرّاً يبقى", (back.alt_codes ?? []).includes("MINE-9"), JSON.stringify(back.alt_codes));
  check("ولا يُخلق توأمٌ بالمخزن", (await repo.listProducts()).filter((p) => matchAll(p, "TAKEN-1")).length === 1);
}
{
  // والمقارنةُ مطبَّعة: رمزٌ يفرق بحالةِ حرفٍ أو بعلامةِ اتجاهٍ رمزٌ واحد.
  seed([P("live", "القائم", "hb-500")]);
  const db = JSON.parse(mem.get(DB_KEY));
  db.productsTrash = [{
    id: "old", clinic_id: null, sold_qty: 0, stock: 0, reason: null, deleted_by: null,
    deleted_at: "2026-01-01T00:00:00.000Z", invoice_item_ids: [], purchase_item_ids: [],
    row: { id: "old", name: "المستعاد", barcode: "HB-500", stock: 0, alt_codes: [] },
  }];
  mem.set(DB_KEY, JSON.stringify(db));
  const back = await repo.restoreProduct("old");
  check("مقارنةٌ مطبَّعة لا خامّة (HB-500 ↔ hb-500)", back.barcode === null, JSON.stringify(back.barcode));
}

console.log("\n▸ getProductByBarcode — حتميةُ الاستدعاء (مرآةُ ترتيب 0165)");
{
  const owner = P("owner", "صاحبُ الرمز", "9990001", { created_at: "2026-05-01" });
  const borrower = P("borrower", "المستعير", "ZZZ", { alt_codes: ["9990001"], created_at: "2026-01-01" });
  seed([borrower, owner]);                       // المستعيرُ أوّلاً بالترتيب
  check("الأساسيُّ يغلب الإضافيَّ مهما كان ترتيبُ التحميل",
    (await repo.getProductByBarcode("9990001"))?.id === "owner");
  seed([owner, borrower]);
  check("  ومقلوباً كذلك", (await repo.getProductByBarcode("9990001"))?.id === "owner");
  const older = P("older", "الأقدم", "777", { created_at: "2026-01-01" });
  const newer = P("newer", "الأحدث", "777", { created_at: "2026-05-01" });
  seed([newer, older]);
  check("وعند التعادل: الأقدم", (await repo.getProductByBarcode("777"))?.id === "older");
}

/* ── مخزنُ الحقل لا يصل كاشيرَ العيادة — بأيّ طريق (ط٧) ─────────────────────
 * `products` جدولٌ بعرضَين منذ 0191: `farm_id` فارغٌ لمخزن العيادة، ومملوءٌ لمخزن
 * حقل. ومنتجُ حقلٍ يُمسح بكاشير العيادة كان **يُباع** بسعرٍ لم يُوضع للبيع، ويخصم
 * من رصيد دفعةٍ جارية. 0191 أصلحت الخادم (مقيسٌ حيّاً: ٣ شروطٍ بـproduct_by_code)،
 * لكن **لا فحصَ كان يحرس الواجهة** — والطرقُ إلى المنتج صارت أربعاً: القائمة،
 * والمسحُ بالرمز، وبالرمز الإضافيّ، والسؤالُ بالمعرّف (ط٢، طريقُ الكرت). */
console.log("\n▸ مخزنُ الحقل لا يصل كاشيرَ العيادة — بأيّ طريق (ط٧)");
{
  const clinic = P("c1", "علف عيادة", "5550001");
  const farm = P("f1", "علف حقل", "5550002", { farm_id: "farm-1", alt_codes: ["FARM-ALT"] });
  seed([clinic, farm]);
  const list = await repo.listProducts();
  check("قائمةُ الكاشير لا تحمل منتجَ الحقل", list.length === 1 && list[0].id === "c1", list.map((p) => p.id).join("، "));
  check("  ومسحُ باركوده لا يلقاه", (await repo.getProductByBarcode("5550002")) === undefined);
  check("  ولا رمزُه الإضافيّ", (await repo.getProductByBarcode("FARM-ALT")) === undefined);
  check("  والسؤالُ بالمعرّف (طريقُ الكرت) لا يُرجعه", (await repo.getProductById("f1")) === undefined);
  check("  ومنتجُ العيادة بمعرّفه يرجع", (await repo.getProductById("c1"))?.id === "c1");
  check("ووجهُ الحقل ما زال يراه (listFarmProducts)", (await repo.listFarmProducts("farm-1")).some((p) => p.id === "f1"));
  /* وصيغُ الماسح (GTIN-14 ← EAN-13 ← UPC-A) تستثنيه كالحرفيّ — مرآةُ 0191 التي
   * تستثنيه بالصيغ أيضاً. كانت الصيغُ تمشي على كلّ المنتجات، فصيغةٌ أسبقُ يحملها صفُّ
   * حقلٍ تُختار قبل صيغةٍ لاحقةٍ يحملها منتجُ العيادة: رفضٌ أو «رصيده صفر» عمّا يُباع. */
  seed([P("f2", "علف حقل", "0045496830434", { farm_id: "farm-1", stock: 40 }), P("c2", "علف عيادة", "045496830434", { stock: 12 })]);
  check("  وصيغُ الماسح تستثنيه: GTIN-14 يصل منتجَ العيادة لا الحقل",
    (await repo.getProductByBarcode("00045496830434"))?.id === "c2", (await repo.getProductByBarcode("00045496830434"))?.id);
}

/* ── حوضُ القسم طازجاً (سؤالُ «رصيده صفر» بعد التدقيق) ──────────────────────
 * رصيدُ الكاشير = الصفُّ + حوضُ قسمه، والخادمُ يبيع من الحوض. السؤالُ بلا الحوض كان
 * يقول «زيد رصيده» عمّا يُباع. */
console.log("\n▸ getSectionPool — حوضُ القسم لسؤال الكاشير");
{
  mem.set(DB_KEY, JSON.stringify({
    products: [P("a", "مجمَّع", "1", { section_id: "s1", stock: 0 })], companies: [],
    companySections: [{ id: "s1", name: "طفيليات", company_id: "co", pooled_stock: 50 }, { id: "s2", name: "بلا حوض", company_id: "co" }],
    purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  }));
  check("حوضُ القسم يُقرأ بمعرّفه", (await repo.getSectionPool("s1")) === 50);
  check("  وقسمٌ بلا حوضٍ صفر", (await repo.getSectionPool("s2")) === 0);
  check("  وقسمٌ غيرُ موجودٍ صفرٌ لا خطأ", (await repo.getSectionPool("nope")) === 0);
}

console.log("\n▸ tidyInventory — صورةٌ قبل الطيّ (مرآةُ محفّز 0146)");
{
  seed([
    P("keeper", "دواء", "K-1", { section_id: "sec1", stock: 5 }),
    P("dup", "دواء", null, { stock: 3 }),
  ]);
  const r = await repo.tidyInventory();
  check("التوأمُ يُطوى", r.merged === 1, JSON.stringify(r));
  check("  والرصيدُ يُجمع", (await repo.listProducts()).find((p) => p.id === "keeper")?.stock === 8);
  const trash = await repo.listDeletedProducts();
  check("والمطويُّ يدخل المحذوفات لا يختفي", trash.length === 1 && trash[0].id === "dup", JSON.stringify(trash.map((x) => x.id)));
  check("  ومعه مرجعُ الدمج ليُفكّ", trash[0]?.merged_into === "keeper");
}

console.log("\n▸ poolProduct — طيُّ الرصيد للحوض بعمليةٍ واحدة (مرآةُ 0171)");
{
  /* الكتابتان المنفصلتان كانتا تعدّان البضاعةَ مرّتين إذا نجحت الأولى وفشلت
   * الثانية: الحوضُ +٣٠ والمنتجُ ما زال ٣٠. الذرّيةُ تمنع الحالةَ الوسطى. */
  const db = {
    products: [{ id: "p1", clinic_id: "c", name: "منتج", barcode: "9990000000091", stock: 30, pooled: false, section_id: "sec1", alt_codes: [] }],
    companies: [], companySections: [{ id: "sec1", clinic_id: "c", company_id: "co1", name: "صنف", pooled_stock: 10 }],
    purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  };
  mem.set(DB_KEY, JSON.stringify(db));
  const out = await repo.poolProduct("p1", "sec1");
  const after = await repo.listProducts();
  const secs = await repo.listCompanySections();
  const prod = after.find((p) => p.id === "p1");
  const sec = secs.find((s) => s.id === "sec1");
  check("رصيدُ المنتج صار صفراً", prod?.stock === 0, String(prod?.stock));
  check("  وصار مجمَّعاً", prod?.pooled === true);
  check("والحوضُ استلمه: 10 + 30 = 40", sec?.pooled_stock === 40, String(sec?.pooled_stock));
  check("فالمجموعُ 40 لا 70 — لا ازدواجَ رصيد", (sec?.pooled_stock ?? 0) + (prod?.stock ?? 0) === 40);
  check("والدالّةُ ترجع المنتجَ بعد الطيّ", out?.id === "p1" && out?.stock === 0);
}
{
  // ولا حالةَ وسطى: منتجٌ غائب يرمي ولا يمسّ الحوض.
  const db = {
    products: [], companies: [], companySections: [{ id: "sec1", clinic_id: "c", company_id: "co1", name: "صنف", pooled_stock: 10 }],
    purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  };
  mem.set(DB_KEY, JSON.stringify(db));
  let threw = false;
  try { await repo.poolProduct("ghost", "sec1"); } catch { threw = true; }
  const secs = await repo.listCompanySections();
  check("منتجٌ غائب يرمي", threw);
  check("  والحوضُ لم يُمَسّ", secs.find((s) => s.id === "sec1")?.pooled_stock === 10);
}


console.log("\n▸ الطيُّ يورّث الرموز — مرآةُ 0169");
{
  /* الحالةُ التي كانت تكسر: الهدفُ **له باركودُه**، فلا يرث الأساسيَّ بـcoalesce
   * — وكانت رموزُ التوأم تُدفن معه، فأوّلُ مسحةٍ لباركود المصنع بعد «رتّب
   * المخزن» تقول «مو موجود» والمادّةُ بالمخزن، فيُعاد إدخالُها توأماً. */
  seed([
    P("target", "دراي فود", "1110000000015", { section_id: "sec1", stock: 5 }),
    P("twin", "دراي فود", "2220000000029", { stock: 7, alt_codes: ["3330000000033"] }),
  ]);
  const r = await repo.tidyInventory();
  check("التوأمُ يُطوى والرصيدُ يُجمع", r.merged === 1 && (await repo.listProducts()).find((p) => p.id === "target")?.stock === 12);
  const t = (await repo.listProducts()).find((p) => p.id === "target");
  check("والهدفُ يبقى بباركوده الأصليّ", t?.barcode === "1110000000015");
  check("ويرث باركودَ التوأم رمزاً إضافياً", (t?.alt_codes ?? []).includes("2220000000029"), JSON.stringify(t?.alt_codes));
  check("  ورموزَ التوأم الإضافية معه", (t?.alt_codes ?? []).includes("3330000000033"), JSON.stringify(t?.alt_codes));
  check("فمسحةُ رمز التوأم تلقى الهدف (جوابُ «موجود ويُمسح فلا يجيء»)",
    (await repo.getProductByBarcode("2220000000029"))?.id === "target");
  check("  ومسحةُ رمزه الإضافي كذلك", (await repo.getProductByBarcode("3330000000033"))?.id === "target");
}
{
  // ولا يُسرق رمزٌ صار لمنتجٍ ثالث — ولا يُكرَّر ما عند الهدف أصلاً.
  seed([
    P("target2", "شامبو", "5550000000056", { section_id: "sec1", stock: 1, alt_codes: ["6660000000060"] }),
    P("twin2", "شامبو", "7770000000074", { stock: 1, alt_codes: ["6660000000060", "8880000000088"] }),
    P("third", "غيره", "8880000000088", { section_id: "sec1", stock: 1 }),
  ]);
  await repo.tidyInventory();
  const t2 = (await repo.listProducts()).find((p) => p.id === "target2");
  check("رمزُ منتجٍ ثالث لا يُسرق بالطيّ", !(t2?.alt_codes ?? []).includes("8880000000088"), JSON.stringify(t2?.alt_codes));
  check("  والرمزُ المكرَّر لا يتضاعف", (t2?.alt_codes ?? []).filter((c) => c === "6660000000060").length === 1, JSON.stringify(t2?.alt_codes));
  check("  والثالثُ يبقى مالكاً رمزَه", (await repo.listProducts()).find((p) => p.id === "third")?.barcode === "8880000000088");
}


console.log("\n▸ فكُّ التوريث — مرآةُ keep_barcode (0167)");
{
  // أصلٌ مصنَّف بلا باركود، وتوأمٌ «بدون صنف» بباركود: «رتّبِ المخزن» يطويه
  // ويورّث الأصلَ باركودَه. الفكُّ يجب أن **يردّه لصاحبه**: الأصلُ ورثه ولم
  // يملكه (keep_barcode فارغٌ لحظةَ الطيّ) — كما تفعل السحابة حرفياً.
  seed([
    P("keeper", "دواء", null, { section_id: "sec1", stock: 5 }),
    P("dup", "دواء", "6970967772736", { stock: 3 }),
  ]);
  await repo.tidyInventory();
  check("الأصلُ ورث الباركود بالطيّ", (await repo.listProducts()).find((p) => p.id === "keeper")?.barcode === "6970967772736");
  const back = await repo.restoreProduct("dup");
  check("والفكُّ يردّه لصاحبه لا يتركه للوارث", back.barcode === "6970967772736", JSON.stringify(back.barcode));
  check("  والأصلُ يعود بلا باركود كما كان", (await repo.listProducts()).find((p) => p.id === "keeper")?.barcode == null);
}
{
  // والعكسُ هو الحدّ: أصلٌ **يملك** باركودَه لحظةَ الطيّ لا يخسره بالفكّ.
  seed([
    P("keeper", "دواء", "OWN-1", { section_id: "sec1", stock: 5 }),
    P("dup", "دواء", null, { stock: 3, alt_codes: ["EXTRA-9"] }),
  ]);
  await repo.tidyInventory();
  await repo.restoreProduct("dup");
  check("أصلٌ مالكٌ لباركوده لا يخسره بالفكّ", (await repo.listProducts()).find((p) => p.id === "keeper")?.barcode === "OWN-1");
}

console.log("▸ getProductByBarcode — مرآةُ صيغِ الماسح بالخادم (0172 / س٥)");
{
  /* الخادمُ صار يقشّر رأسَ AIM ويجرّب أصفارَ GTIN/UPC عند خيبة الحرفيّ (0172).
   * والنسخةُ التجريبية هي التي تجري عليها فحوصُ المنطق — فانحرافُها عن الخادم
   * أسوأ من لا شيء: تُظهر سلوكاً لا يقع بالإنتاج فتُخفي العطل بدل أن تكشفه. */
  seed([
    P("v1", "أساسيّ", "6221031492405", { created_at: "2026-01-01" }),
    P("v2", "مخزونٌ بصفر", "0045496830434", { created_at: "2026-01-02" }),
    P("v3", "صاحبُ إضافيّ", "RF-0172", { alt_codes: ["9781234567897"], created_at: "2026-01-03" }),
  ]);
  check("(زُرعت ثلاثة)", await seeded(3));
  const nameOf = async (code) => (await repo.getProductByBarcode(code))?.name ?? "(لا شيء)";

  check("الحرفيُّ كما كان", await nameOf("6221031492405") === "أساسيّ");
  check("و«]C1 + ١٣ رقماً» يلقى صاحبَه", await nameOf("]C16221031492405") === "أساسيّ");
  check("و«0 + EAN-13» (GTIN-14) كذلك", await nameOf("06221031492405") === "أساسيّ");
  check("وUPC-A بـ١٢ خانة على مخزونٍ بـ١٣", await nameOf("045496830434") === "مخزونٌ بصفر");
  check("والرمزُ الإضافيُّ يُنقذ مثلَ الأساسيّ", await nameOf("09781234567897") === "صاحبُ إضافيّ");
  check("وأرقامٌ شرقية مع رأس AIM", await nameOf("]C1٦٢٢١٠٣١٤٩٢٤٠٥") === "أساسيّ");
  check("ورمزٌ لا يخصّ أحداً يبقى لا شيء", await nameOf("1112223334445") === "(لا شيء)");
  check("وفارغٌ لا يرمي", await nameOf("") === "(لا شيء)");

  /* **الحرفيُّ يغلب التخمين.** لو خُلطت الصيغُ بالمطابقة الحرفية لصار رمزٌ يطابق
   * صاحبَه حرفياً ويطابق آخرَ بصيغةٍ ⇒ «رمزٌ ملتبس» على مسارٍ كان سليماً. */
  seed([
    P("w1", "اثنتا عشرة", "045496830434", { created_at: "2026-01-04" }),
    P("w2", "نفسُها بصفر", "0045496830434", { created_at: "2026-01-02" }),
  ]);
  check("الحرفيُّ يغلب التخمين — لا يُختار الأقدمُ بصيغة",
    (await repo.getProductByBarcode("045496830434"))?.id === "w1");
  check("  والعكسُ كذلك", (await repo.getProductByBarcode("0045496830434"))?.id === "w2");
}

console.log("▸ getProductByBarcode — الصيغةُ الأسبقُ تغلب (0173)");
{
  /* أمسكته المراجعةُ الخصميّة على 0172 نفسِها: القاعدةُ كانت تتّحد على الصيغ
   * كلِّها وترتّب بالأقدم، والواجهةُ (`rescueScan`) تمشي صيغةً صيغةً وتقف عند
   * أوّل مصيبة. فنفسُ المسحة تبيع منتجاً إن حسمتها القائمةُ المحمّلة وآخرَ إن
   * حسمها الخادم — نقضُ الثابت «نفسُ الرمز يرجع نفسَ المنتج».
   * والزوجُ أدناه هو الذي يصنعه الماسحُ نفسُه: UPC-A ونظيرُه EAN-13 بصفر،
   * والأعمارُ معكوسةٌ عمداً فيفترق الترتيبان. */
  seed([
    P("w1", "اثنتا عشرة", "045496830434", { created_at: "2026-01-04" }),
    P("w2", "نفسُها بصفر", "0045496830434", { created_at: "2026-01-02" }),
  ]);
  check("(زُرع الزوج)", await seeded(2));
  const got = await repo.getProductByBarcode("]c1045496830434");
  check("مسحةٌ برأس AIM تختار صاحبَ الصيغة الأسبق لا الأقدمَ إنشاءً", got?.id === "w1");
  check("  وهو نفسُ ما تختاره طبقةُ النجدة بالواجهة", got?.id === rescueScan([
    { id: "w1", name: "اثنتا عشرة", barcode: "045496830434", alt_codes: [] },
    { id: "w2", name: "نفسُها بصفر", barcode: "0045496830434", alt_codes: [] },
  ], "]c1045496830434")?.product.id);
  check("والحرفيُّ ما زال يغلب الصيغة", (await repo.getProductByBarcode("045496830434"))?.id === "w1");
  check("  والعكسُ كذلك", (await repo.getProductByBarcode("0045496830434"))?.id === "w2");

  /* وإصلاحُ التخطيط العربيّ **بالواجهة وحدها**: خريطتُه بياناتُ متصفّحٍ لا
   * تعرفها القاعدة. فالمرآةُ التجريبية لا تعرفه كي لا تُظهر ما لا يقع. */
  seed([P("m1", "منتج", "6221031492405", { created_at: "2026-01-01" })]);
  check("مسحةٌ ممسوخةُ التخطيط لا يحسمها الخادمُ — كما بالإنتاج",
    (await repo.getProductByBarcode("دc16221031492405")) === undefined);
  check("  وطبقةُ النجدة بالواجهة هي التي تحسمها",
    rescueScan([{ id: "m1", name: "منتج", barcode: "6221031492405", alt_codes: [] }], "دc16221031492405")?.product.id === "m1");
}

console.log("▸ assignBarcodeIfEmpty — لا يُكتب فوق رمزٍ رُبط من جهازٍ آخر (ح٣)");
{
  seed([
    P("g1", "بلا رمز", null),
    P("g2", "له رمزٌ سلفاً", "ALREADY-1"),
    P("g3", "صاحبُ رمزٍ آخر", "TAKEN-9"),
  ]);
  check("(زُرعت ثلاثة)", await seeded(3));

  const linked = await repo.assignBarcodeIfEmpty("g1", "NEW-100");
  check("منتجٌ بلا رمزٍ يُربط", linked?.barcode === "NEW-100");
  check("  ويُقرأ بعدها من المخزن", (await repo.listProducts()).find((p) => p.id === "g1")?.barcode === "NEW-100");

  /* الحالةُ المقصودة: جهازان يولّدان معاً. الثاني كان يدهس رمزَ الأوّل،
   * وملصقاتُ الأوّل المطبوعةُ تصير رموزاً لا تخصّ شيئاً. */
  let threw = false;
  try { await repo.assignBarcodeIfEmpty("g2", "NEW-200"); } catch { threw = true; }
  check("ومنتجٌ له رمزٌ سلفاً يُرفض لا يُدهَس", threw);
  check("  ورمزُه القديم كما هو", (await repo.listProducts()).find((p) => p.id === "g2")?.barcode === "ALREADY-1");

  let threw2 = false;
  try { await repo.assignBarcodeIfEmpty("g1", "TAKEN-9"); } catch { threw2 = true; }
  check("ورمزٌ مأخوذٌ لغيره يُرفض", threw2);
  check("  وصاحبُه لم يُمَسّ", (await repo.listProducts()).find((p) => p.id === "g3")?.barcode === "TAKEN-9");

  let threw3 = false;
  try { await repo.assignBarcodeIfEmpty("g1", "   "); } catch { threw3 = true; }
  check("ورمزٌ فارغ يُرفض", threw3);
  let threw4 = false;
  try { await repo.assignBarcodeIfEmpty("لا-وجود-له", "X-1"); } catch { threw4 = true; }
  check("ومنتجٌ غيرُ موجودٍ يُرفض", threw4);
}

/* ── الستور (0178): مرايا حرّاسٍ كانت بالإنتاج وحده — فما كانت مفحوصة ─────────
 * فحصُ التطابق (٠٩/٠٩) طلّع أربعة سلوكياتٍ يجيب فيها التجريبيُّ عكسَ الإنتاج:
 * قبولٌ مكرّر يولّد فاتورتين (الإنتاج يرجع الأولى بـclient_ref)، و«مقبول»
 * يرجع «جديد» بصمت (الإنتاج يرميه بمحفّز 0176)، وكسرٌ يُدوَّر (الإنتاج يرفض
 * bad_items)، وحدُّ الرقم ينخدع بـ+964 (والتتبّع يطابق بالذيل أصلاً). */
console.log("▸ الستور (0178) — القرار نهائي والمرجع واحد والحدّ يعرف ذيل الرقم");
{
  const SP = { slug: "demo-vet", enabled: true, delivery_fee: 0, min_order: 0, updated_at: "2026-01-01" };
  const seedStore = (products) => {
    seed(products);
    const db = JSON.parse(mem.get(DB_KEY));
    db.storeProfile = SP; db.storeOrders = []; db.deliveryOrders = [];
    mem.set(DB_KEY, JSON.stringify(db));
  };
  const SPROD = (id, price, stock) => P(id, `منتج ${id}`, null, { store_visible: true, sell_price: price, purchase_price: 0, stock });
  const dbNow = () => JSON.parse(mem.get(DB_KEY));

  seedStore([SPROD("s1", 12, 40)]);
  const frac = await repo.placeStoreOrder("demo-vet", { name: "زبون التجربة", phone: "07701234567" }, [{ product_id: "s1", qty: 5.5 }]);
  check("كميةٌ كسرية تُرفض bad_items كما بالخادم — لا تدويرَ صامت", frac.ok === false && frac.error === "bad_items");

  const placed = await repo.placeStoreOrder("demo-vet", { name: "زبون التجربة", phone: "0770 123 4567" }, [{ product_id: "s1", qty: 2 }]);
  check("طلبٌ سليم يمشي ويرجع رقماً", placed.ok === true && /^SO-/.test(placed.order_no ?? ""));

  /* حدُّ العشرة يقارن الذيل: تسعةٌ أخرى بنفس الرقم بصيغٍ شتّى ثم +964 */
  for (let i = 0; i < 9; i++) await repo.placeStoreOrder("demo-vet", { name: "زبون التجربة", phone: i % 2 ? "07701234567" : "0770-123-4567" }, [{ product_id: "s1", qty: 1 }]);
  const bypass = await repo.placeStoreOrder("demo-vet", { name: "زبون التجربة", phone: "+964 770 123 4567" }, [{ product_id: "s1", qty: 1 }]);
  check("العاشرةُ استوفت الحدَّ و+964 لنفس الذيل لا يصفّره", bypass.ok === false && bypass.error === "rate_limited");
  const other = await repo.placeStoreOrder("demo-vet", { name: "زبون ثاني", phone: "07809998877" }, [{ product_id: "s1", qty: 1 }]);
  check("  ورقمٌ غيرُه بذيلٍ غيره يمشي — الحدُّ للرقم لا للعيادة", other.ok === true);

  /* نهائية القرار: القبول يختم من الداخل، وأي قرارٍ ثانٍ يُرمى بصوت */
  const oid = dbNow().storeOrders.find((o) => o.order_no === placed.order_no).id;
  await repo.updateStoreOrder(oid, { status: "accepted", decided_at: "2000-01-01T00:00:00.000Z" });
  const acc = dbNow().storeOrders.find((o) => o.id === oid);
  check("القبول ختم decided_at من الدالّة لا من المستدعي", acc.status === "accepted" && !!acc.decided_at && !acc.decided_at.startsWith("2000-"));
  let back = "";
  try { await repo.updateStoreOrder(oid, { status: "new" }); } catch (e) { back = String(e?.message ?? e); }
  check("«مقبول» ما يرجع «جديد» — يُرمى بنصّ محفّز 0176", back.includes("قرار الطلب نهائي"));
  let twice = "";
  try { await repo.updateStoreOrder(oid, { status: "rejected" }); } catch (e) { twice = String(e?.message ?? e); }
  check("ولا يتقرّر مرتين", twice.includes("قرار الطلب نهائي"));
  check("  والطلبُ بقي مقبولاً بختمه", dbNow().storeOrders.find((o) => o.id === oid).status === "accepted");
  await repo.updateStoreOrder(oid, { invoice_id: "inv_x" });
  check("  وتحديثٌ بلا تغيير حالةٍ (invoice_id) يمرّ كما بالإنتاج", dbNow().storeOrders.find((o) => o.id === oid).invoice_id === "inv_x");

  /* client_ref: نفسُ المرجع = نفسُ الفاتورة — والمخزون يُسحب مرّة */
  seedStore([SPROD("s2", 10, 40)]);
  const item = { product_id: "s2", name: "منتج s2", qty: 2, unit_price: 10, unit_cost: 0 };
  const inv1 = await repo.retailCheckout([item], { client_ref: "store-so_1", amount_paid: 0 });
  const inv2 = await repo.retailCheckout([item], { client_ref: "store-so_1", amount_paid: 0 });
  check("قبولٌ أُعيد بنفس المرجع يرجع الفاتورةَ الأولى نفسَها", inv1.id === inv2.id && dbNow().invoices.length === 1);
  check("  والمخزون انسحب مرّةً واحدة (40−2=38)", dbNow().products.find((p) => p.id === "s2").stock === 38);
  const inv3 = await repo.retailCheckout([item], { client_ref: "store-so_2", amount_paid: 0 });
  check("  ومرجعٌ جديد بيعةٌ جديدة", inv3.id !== inv1.id && dbNow().products.find((p) => p.id === "s2").stock === 36);
}

/* ---- 0180: فاتورةٌ واحدة = طلبُ توصيلٍ واحد ------------------------------
 * مرآةُ الفهرس الفريد. حارسٌ ليس هنا حارسٌ لم يُفحص — وهذا هو ما يجعل زرَّ
 * «أعد المحاولة» بشاشة البيع مأموناً: الكتابةُ قد تكون وصلت وضاع جوابُها. */
{
  console.log("▸ 0180: طلبُ توصيلٍ واحدٌ لكلّ فاتورة");
  const dbNow = () => JSON.parse(mem.get(DB_KEY));
  const base = {
    clinic_id: "c1", invoice_id: "inv_dlv_1", branch_id: null, courier_id: null,
    customer_name: "زبون", customer_phone: "07701234567", zone: null, address: null,
    note: null, delivery_fee: 0, fee_to_clinic: false, cod_amount: 7000, prepaid: 0,
    status: "preparing", dispatched_at: null, delivered_at: null, returned_at: null,
  };
  const a = await repo.createDeliveryOrder(base);
  const b = await repo.createDeliveryOrder(base);
  check("إعادةُ المحاولة تُرجع نفسَ الصفّ لا صفّاً ثانياً", a.id === b.id);
  check("  والجدولُ فيه صفٌّ واحدٌ لهذه الفاتورة",
        (dbNow().deliveryOrders ?? []).filter((o) => o.invoice_id === "inv_dlv_1").length === 1);
  const c = await repo.createDeliveryOrder({ ...base, invoice_id: "inv_dlv_2", cod_amount: 9000 });
  check("  وفاتورةٌ أخرى تُنشئ صفّاً جديداً (القيدُ على التكرار لا على الإنشاء)",
        c.id !== a.id && c.cod_amount === 9000);

  // 0225: رقمُ الطلب بنفس تطبيع السحابة — المرآةُ لا تقريب.
  console.log("▸ 0225: رقمُ الطلب بالتجريبيّ");
  const r = await repo.createDeliveryOrder({ ...base, invoice_id: "inv_dlv_3", courier_ref: " bx-١٢٣ " });
  check("يُحفظ مطبَّعاً عند الإنشاء", r.courier_ref === "bx-123", r.courier_ref);
  const n = await repo.createDeliveryOrder({ ...base, invoice_id: "inv_dlv_4", courier_ref: "   " });
  check("  والفارغُ NULL لا ''", n.courier_ref === null, JSON.stringify(n.courier_ref));
  const u = await repo.updateDeliveryOrder(n.id, { courier_ref: "AW 55" });
  check("  ويُضاف بعد البيع بنفس التطبيع", u?.courier_ref === "AW55" && dbNow().deliveryOrders.find((o) => o.id === n.id).courier_ref === "AW55");
  const cl = await repo.updateDeliveryOrder(n.id, { courier_ref: "" });
  check("  ويُمسح إلى NULL", cl?.courier_ref === null);
  const twin = await repo.createDeliveryOrder({ ...base, courier_ref: "ZZ-9" });
  check("  وإعادةُ محاولةِ فاتورةٍ لها طلب ترجع القائمَ — رقمُ الإعادة لا يكتب فوقه", twin.id === a.id && !twin.courier_ref);
}

/* ══ الموجة ٥ · البند ١٥ — الكتابةُ تُسمَع بالوضع التجريبي ═══════════════════
 *
 * الجذر: `saveDB` كانت تُعلن حدثاً ثم **ترجع طبيعياً**. فالشاشةُ تكمل مسارَ
 * النجاح — رنّةٌ و«تمّ» وتُغلق النافذةَ وتُعيد التحميل من مخزنٍ لم يتغيّر —
 * ويجتمع تحذيرٌ ونجاحٌ بنفس اللحظة والصفُّ غائب. وأسوأُ منه أنّ التحذيرَ
 * كان يُعرض مرّةً واحدةً بكلّ تحميلِ صفحة، فالضياعُ الثاني صامتٌ تماماً.
 *
 * ولا يكفي أن ترمي: `loadDB` تنادي `saveDB` لتبذر أوّلَ مرّة، وهي مسارُ
 * **قراءة** بمئتَي موضع — فرميةٌ غيرُ محصَّنة كانت تُسقط كلَّ قراءةٍ بالتطبيق
 * على شاشةٍ بيضاء. فالفحصُ يقيس الاثنين معاً. */
{
  console.log("▸ البند ١٥ — كتابةٌ رفضتها الحصّةُ تُسمَع، وقراءةٌ تنجو");
  const before = mem.get(DB_KEY);
  quotaEvents = 0;
  quotaFull = true;
  let threw = null;
  try { await repo.createCompany({ name: "شركةُ الحصّة" }); } catch (e) { threw = e; }
  quotaFull = false;

  // **ولا تُحسب رميةٌ برمجية نجاحاً**: أوّلُ صياغةٍ نادت دالّةً لا وجودَ لها،
  // فرمى `TypeError` ومرّ الفحصُ لسببٍ غلط. النوعُ يُفحص لا الرميةُ وحدَها.
  check("كتابةٌ رفضتها الحصّةُ ترمي (لا ترجع كأنها نجحت)",
        threw !== null && !(threw instanceof TypeError),
        threw === null ? "رجعت بلا خطأ — الشاشةُ راح تقول «تمّ»"
                       : threw instanceof TypeError ? `رميةٌ برمجية لا رميةُ حصّة: ${threw.message}` : "");
  check("  والرميةُ باسمٍ ثابت تقرأه الشاشة لا بنصٍّ عربيّ",
        threw?.name === "DemoQuotaError" && threw?.message === "DEMO_QUOTA_FULL");
  check("  والحدثُ انطلق كذلك — الرميةُ تقطع، والتوستُ يقول السبب", quotaEvents === 1);
  check("  والمخزنُ ما تبدّل فعلاً (الكتابةُ ضاعت، لا أنها نجحت ورمت)",
        mem.get(DB_KEY) === before);

  // حارسُ الانحدار: يمرّ قبل الإصلاح، ويسقط لو رُميت بلا تحصينِ `loadDB`.
  mem.delete(DB_KEY);
  quotaFull = true;
  let readThrew = null;
  try { await repo.listCompanies(); } catch (e) { readThrew = e; }
  quotaFull = false;
  check("  وبذرةٌ أولى بحصّةٍ ممتلئة تشتغل بالذاكرة ولا تُسقط كلَّ قراءة",
        readThrew === null, readThrew ? "loadDB رمت — التطبيقُ كلُّه يسقط على ErrorBoundary" : "");
}

/* ══ الموجة ٥ · البند ١٥ (الباقي) — سجلُّ الجهاز لا يحمل صوراً ═════════════
 *
 * الجذر: `details` كانت تحمل الصفَّ كما هو، وصورةُ المنتج تجريبياً **عنوانٌ
 * مضمَّن** (`data:image/jpeg;base64,…`) بمئتَي كيلو أو أكثر. والسقفُ كان
 * **بالعدد** (٥٠٠ صفّاً) — فعشرةُ صفوفٍ مصوَّرة تملأ الحصّةَ والعدّادُ يظنّ
 * نفسَه بعيداً عن سقفه. والبايتاتُ لا تُقرأ أصلاً: `activityBrief` تقصّ عند
 * مئتَي حرف. */
{
  console.log("▸ البند ١٥ (الباقي) — سجلُّ الجهاز بلا صور، وسقفُه بالبايت");
  const AUDIT_KEY = /const DEMO_AUDIT_KEY = "([^"]+)"/.exec((readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */)?.[1];
  check("مفتاحُ السجلّ مقروءٌ من المصدر لا مكتوبٌ بيد", !!AUDIT_KEY, "ما انقرأ DEMO_AUDIT_KEY");

  const BIG = "data:image/jpeg;base64," + "A".repeat(300_000);
  mem.delete(AUDIT_KEY);
  const p1 = await repo.createProduct({ name: "منتجٌ مصوَّر", sell_price: 1000, purchase_price: 500, stock: 3 });
  await repo.updateProduct(p1.id, { image_path: BIG });

  const raw = mem.get(AUDIT_KEY) ?? "";
  check("ولا `data:` خامٌ بالسجلّ", !raw.includes("base64,AAAA"), `طول السجلّ ${raw.length}`);
  check("  والحقلُ يبقى موجوداً ببصمته (لا يُحذف فيكذب الفرق)", raw.includes("[data:"));
  check("  والسجلُّ تحت سقف البايت", raw.length <= 256 * 1024, `${raw.length} محرفاً`);

  // السقفُ بالبايت حقيقيّ: صفوفٌ كبيرةٌ متتالية تُقصّ قبل الخمسمئة بكثير.
  for (let i = 0; i < 12; i++) {
    await repo.updateProduct(p1.id, { store_desc: "ن".repeat(30_000) + i });
  }
  const raw2 = mem.get(AUDIT_KEY) ?? "";
  const rows = JSON.parse(raw2);
  check("  واثنا عشرَ صفّاً ضخماً يُقصّون بالحجم لا ينتظرون الخمسمئة",
        raw2.length <= 256 * 1024 && rows.length < 500, `${raw2.length} محرفاً، ${rows.length} صفّاً`);
  check("  والأحدثُ باقٍ دائماً (الأقدمُ يخرج أوّلاً)", rows.length >= 1);
}

/* ══ ت٢ · 0186 — النشرُ الجماعيّ بالمرآة التجريبية ═══════════════════════
 * «حارسٌ لا يوجد هنا حارسٌ لم يُفحص» (CLAUDE.md §٤): شرطُ السعر وعدُّ
 * `changed` وقصُّ العيادة كلُّها بالخادم — فلازم تكون هنا بنفسها. */
{
  console.log("▸ ت٢ — النشرُ الجماعيّ: نداءٌ واحد، ومنتجٌ بلا سعرٍ لا يُنشَر");
  const a = await repo.createProduct({ name: "جماعيّ ١", sell_price: 1000, purchase_price: 400, stock: 5 });
  const b = await repo.createProduct({ name: "جماعيّ ٢", sell_price: 2000, purchase_price: 900, stock: 5 });
  const z = await repo.createProduct({ name: "بلا سعر", sell_price: 0, purchase_price: 400, stock: 5 });

  const r1 = await repo.setStoreVisible([a.id, b.id, z.id], true);
  check("ينشر اثنين ويتخطّى الذي بلا سعر", r1.changed === 2, JSON.stringify(r1));
  check("  والمتخطَّى يُقال بعدده", r1.skipped_no_price === 1, JSON.stringify(r1));
  const after = await repo.listProducts();
  const byId = new Map(after.map((p) => [p.id, p]));
  check("  والاثنان معروضان فعلاً", !!byId.get(a.id)?.store_visible && !!byId.get(b.id)?.store_visible);
  check("  والذي بلا سعرٍ باقٍ مخفيّاً", !byId.get(z.id)?.store_visible);

  const r2 = await repo.setStoreVisible([a.id, b.id, z.id], true);
  check("نداءٌ مُعادٌ يرجع صفراً لا يدّعي عملاً لم يقع", r2.changed === 0, JSON.stringify(r2));

  const r3 = await repo.setStoreVisible([a.id, b.id], false);
  check("والإخفاءُ الجماعيُّ يرجع الاثنين", r3.changed === 2, JSON.stringify(r3));

  const r4 = await repo.setStoreVisible([], true);
  check("  ومصفوفةٌ فارغةٌ لا ترمي", r4.changed === 0 && r4.skipped_no_price === 0);

  let over = null;
  try { await repo.setStoreVisible(Array.from({ length: 501 }, (_, i) => `x${i}`), true); } catch (e) { over = e; }
  check("  ودفعةٌ فوق السقف تُردّ (مرآةُ سقف الخادم)", over !== null && !(over instanceof TypeError),
    over === null ? "مرّت بلا حدّ" : "");
}

/* ══ ت٣ · 0187 — «انشر أكثرَ ما تبيع» بالمرآة التجريبية ═════════════════
 * ثلاثةُ تعريفاتٍ منسوخةٌ من الخادم لا مخترَعة: ما يُعدّ بيعاً (المرتجَعُ
 * يُستثنى والكميّاتُ بإشارتها)، وما يُعدّ متوفّراً (المجمَّعُ يُحسب)، وما
 * يُعدّ صالحاً للنشر (سعرٌ > ٠). وانحرافُ المرآة عن أيّها يعني رقمين للشيء
 * الواحد بشاشتين. */
{
  console.log("▸ ت٣ — اقتراحُ رفِّ البداية");
  const top = await repo.createProduct({ name: "الأعلى", sell_price: 5000, purchase_price: 2000, stock: 50 });
  const low = await repo.createProduct({ name: "الأدنى", sell_price: 3000, purchase_price: 1000, stock: 50 });
  const out = await repo.createProduct({ name: "نافد", sell_price: 9000, purchase_price: 3000, stock: 0 });
  const free = await repo.createProduct({ name: "بلا سعر", sell_price: 0, purchase_price: 100, stock: 10 });
  const shown = await repo.createProduct({ name: "منشور", sell_price: 8000, purchase_price: 3000, stock: 50 });
  await repo.setStoreVisible([shown.id], true);

  await repo.retailCheckout([
    { product_id: top.id, name: "الأعلى", qty: 10, unit_price: 5000, unit_cost: 2000 },
    { product_id: low.id, name: "الأدنى", qty: 3, unit_price: 3000, unit_cost: 1000 },
    { product_id: out.id, name: "نافد", qty: 4, unit_price: 9000, unit_cost: 3000 },
    { product_id: free.id, name: "بلا سعر", qty: 4, unit_price: 9000, unit_cost: 3000 },
    { product_id: shown.id, name: "منشور", qty: 9, unit_price: 8000, unit_cost: 3000 },
  ], { client_ref: "sug-1" });

  const sug = await repo.suggestStoreProducts(40);
  const ids = sug.map((r) => r.id);
  check("الأعلى إيراداً يتصدّر", sug[0]?.id === top.id, sug.map((r) => r.name).join(", "));
  // وبيعُ كلِّ الرصيد يُخرج المنتجَ **بحقّ**: نافدٌ لا يُنشَر. (وقعتُ بها
  // أوّلَ صياغةٍ فظننتُها عطباً — والقالبُ كان الغلط لا الشِفرة.)
  check("  والأدنى بعده", ids.includes(low.id));
  check("  والنافدُ لا يُقترَح", !ids.includes(out.id));
  check("  والذي بلا سعرٍ لا يُقترَح", !ids.includes(free.id));
  check("  والمنشورُ أصلاً ليس اقتراحاً", !ids.includes(shown.id));
  check("  والإيرادُ محسوبٌ فعلاً", sug[0]?.revenue === 50000, String(sug[0]?.revenue));

  // **الحدُّ الصريح**: تقترح ولا تكتب.
  const beforeShown = (await repo.listProducts()).filter((p) => p.store_visible).length;
  await repo.suggestStoreProducts(40);
  const afterShown = (await repo.listProducts()).filter((p) => p.store_visible).length;
  check("**لا تكتب حرفاً** — عددُ المعروض ما تغيّر", beforeShown === afterShown);

  const r = await repo.setStoreVisible([top.id, low.id], true);
  check("والنشرُ من الاقتراح يمرّ من نفس بابِ ت٢", r.changed === 2, JSON.stringify(r));
  const again = await repo.suggestStoreProducts(40);
  check("  وما نُشر يخرج من الاقتراح", !again.map((x) => x.id).includes(top.id));
}

/* ══ ت١٠ · 0189 — الأجرةُ تُحسم عند القبول، بالمرآة التجريبية ═════════════
 * المقيس: ٥٢٣ صفَّ توصيلٍ من ٥٢٣ **بلا منطقة**، وإحدى عشرةَ قيمةَ أجرةٍ بين
 * صفرٍ و١٥ ألفاً — فرقمٌ ثابتٌ بالإعدادات لا يصف ما تفعله العيادة. */
{
  console.log("▸ ت١٠ — أجرةُ التوصيل بلحظة القبول");
  const mk = async (no, id) => {
    const db = JSON.parse(mem.get(DB_KEY));
    db.products = [...(db.products ?? []), { id: `fp-${id}`, clinic_id: null, name: "منتجُ الأجرة", sell_price: 10000, purchase_price: 4000, stock: 50, store_visible: true }];
    db.storeOrders = [...(db.storeOrders ?? []), {
      id, clinic_id: null, order_no: no, customer_name: "زبون", customer_phone: "07705551111",
      items: [{ product_id: `fp-${id}`, name: "منتجُ الأجرة", qty: 1, price: 10000, total: 10000 }],
      subtotal: 10000, delivery_fee: 2000, total: 12000, status: "new", created_at: new Date().toISOString(),
    }];
    mem.set(DB_KEY, JSON.stringify(db));
  };
  const invOf = (oid) => { const db = JSON.parse(mem.get(DB_KEY));
    const o = db.storeOrders.find((x) => x.id === oid);
    return { inv: db.invoices.find((i) => i.id === o.invoice_id),
             dlv: db.deliveryOrders.find((d) => d.invoice_id === o.invoice_id),
             items: db.invoiceItems.filter((i) => i.invoice_id === o.invoice_id) }; };

  await mk("SO-F1", "fo1"); await repo.acceptStoreOrder("fo1", null, 5000);
  const a = invOf("fo1");
  check("أجرةٌ عند القبول تغلب أجرةَ الطلب — بصفّ التوصيل", a.dlv?.delivery_fee === 5000, String(a.dlv?.delivery_fee));
  check("  وببند الفاتورة (رقمٌ واحدٌ لا رقمان)", a.items.find((i) => i.name === "أجرة توصيل")?.unit_price === 5000);
  check("  و**المجموعُ يتبعها** (١٠٠٠٠+٥٠٠٠ لا ١٢٠٠٠)", a.inv?.total === 15000, String(a.inv?.total));

  await mk("SO-F2", "fo2"); await repo.acceptStoreOrder("fo2", null, 0);
  const b = invOf("fo2");
  check("وصفرٌ صريحٌ يعني مجّاناً لا رجوعاً للافتراض", b.items.every((i) => i.name !== "أجرة توصيل") && b.inv?.total === 10000, String(b.inv?.total));

  await mk("SO-F3", "fo3"); await repo.acceptStoreOrder("fo3");
  const c = invOf("fo3");
  check("وبلا وسيطٍ تبقى أجرةُ الطلب (لا انحدار)", c.dlv?.delivery_fee === 2000 && c.inv?.total === 12000, `${c.dlv?.delivery_fee}/${c.inv?.total}`);
}


/** رمى فعلاً؟ — و`TypeError` **ليست** رميةً مقبولة: دالّةٌ غير موجودةٍ ترمي
 *  كذلك، فكان الفحصُ يمرّ وهو لا يفحص شيئاً (درسٌ مدفوعٌ بموجةٍ سابقة). */
const threw = async (fn) => {
  try { await fn(); return false; }
  catch (e) { return !(e instanceof TypeError); }
};

/* ── حقولُ الدواجن (0191/0192): التجريبيُّ مرآةُ الخادم ────────────────────
 * القيودُ التي تحمي أرقامَ الحقل تعيش بالقاعدة (فهرسان فريدان وقيدُ إغلاق).
 * وفحوصُ المنطق تجري على هذه النسخة — فحارسٌ لا يوجد هنا حارسٌ لم يُفحص. */
{
  console.log("▸ حقولُ الدواجن — القيودُ نفسُها بالنصفين");
  const farm = await repo.addPoultryFarm({ name: "حقلُ الفحص" });
  const house = await repo.addPoultryHouse({ farm_id: farm.id, label: "جملون ١", capacity: 25000, default_kind: "broiler", default_breed: "Ross 308", default_count: 20000 });
  const today = new Date().toISOString().slice(0, 10);
  const ago = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  const cyc = await repo.openPoultryCycle({ farm_id: farm.id, house_id: house.id, kind: "broiler", breed: "Ross 308", placed_on: ago(10), placed_count: 20000, chick_unit_cost: 500 });
  check("الدفعةُ تُفتح نشطةً بعددها", cyc.status === "active" && cyc.placed_count === 20000);
  check("  والعمرُ من تاريخ وضع الدجاج", (await repo.poultryCycleStats(cyc.id)).days === 10);

  // دفعتان نشطتان بنفس الجملون ⇒ كلُّ رقمٍ يوميٍّ بعدهما لا يُعرف لأيّهما.
  check("دفعةٌ نشطةٌ ثانيةٌ بنفس الجملون مرفوضة",
    await threw(() => repo.openPoultryCycle({ farm_id: farm.id, house_id: house.id, kind: "broiler", placed_on: today, placed_count: 5000 })));

  await repo.savePoultryDaily({ cycle_id: cyc.id, on_date: ago(9), dead: 30, culled: 5 });
  await repo.savePoultryDaily({ cycle_id: cyc.id, on_date: ago(8), dead: 12, culled: 0 });
  check("  والحيُّ = المُدخَل − النافق − المستبعَد", (await repo.poultryCycleStats(cyc.id)).alive === 19953);

  // يومٌ يُعاد ⇒ تصحيحٌ لا صفٌّ ثانٍ (مرآةُ upsert بالخادم).
  await repo.savePoultryDaily({ cycle_id: cyc.id, on_date: ago(9), dead: 40, culled: 5 });
  check("إعادةُ إدخال يومٍ تصحيحٌ لا تكرار",
    (await repo.listPoultryDaily(cyc.id)).length === 2 && (await repo.poultryCycleStats(cyc.id)).dead === 52);

  // الصرف: مادّةُ الحقل تُخصم بسعر الشراء، ومادّةُ العيادة تُرفض.
  const db0 = JSON.parse(mem.get(DB_KEY) ?? "{}");
  db0.products = [
    { id: "feed1", name: "علف بادئ", purchase_price: 900, sell_price: 0, stock: 1000, farm_id: farm.id },
    { id: "cat1", name: "معلب قطط", purchase_price: 3000, sell_price: 5000, stock: 20, farm_id: null },
  ];
  mem.set(DB_KEY, JSON.stringify(db0));

  const r1 = await repo.poultryConsume({ cycle_id: cyc.id, kind: "feed", product_id: "feed1", qty: 300 });
  check("الصرفُ يخصم ويقيّد بسعر الشراء لا البيع", r1.ok && r1.use.line_cost === 270000 && r1.stock_after === 700, JSON.stringify(r1.use?.line_cost));
  check("  والاسمُ يُؤخذ من المادّة حين لا يُكتب", r1.use.name === "علف بادئ");

  // الرصيدُ يُترك يسلب عمداً والنقصُ يُرجَّع — الدفترُ اليوميّ هو الحقيقة.
  const r2 = await repo.poultryConsume({ cycle_id: cyc.id, kind: "feed", product_id: "feed1", qty: 900 });
  check("صرفٌ فوق الرصيد يُسجَّل ويُرجّع النقص", r2.shortfall === 200 && r2.stock_after === -200, JSON.stringify([r2.shortfall, r2.stock_after]));

  check("مادّةُ مخزن العيادة مرفوضةٌ على دفعةِ دجاج",
    await threw(() => repo.poultryConsume({ cycle_id: cyc.id, kind: "feed", product_id: "cat1", qty: 1 })));

  await repo.poultryUnconsume(r2.use.id);
  const dbBack = JSON.parse(mem.get(DB_KEY));
  check("  وحذفُ الصرف يرجّع البضاعة", dbBack.products.find((p) => p.id === "feed1").stock === 700);

  check("وخدمةٌ بلا اسمٍ ولا مادّةٍ مرفوضة (سطرُ كلفةٍ لا يُقرأ بجرد)",
    await threw(() => repo.poultryConsume({ cycle_id: cyc.id, kind: "service", qty: 1 })));
  check("  وباسمٍ تُقبل",
    (await repo.poultryConsume({ cycle_id: cyc.id, kind: "service", name: "قنينة غاز", qty: 1 })).ok);

  const st = await repo.poultryCycleStats(cyc.id);
  check("مجاميعُ الدفعة: علفٌ بالكيلو وكلفٌ مفصولة", st.feed_kg === 300 && st.feed_cost === 270000 && st.med_cost === 0);
  check("  وكلفةُ الصيصان = السعرُ × العدد", st.chick_cost === 10000000);

  // إغلاقٌ بلا تاريخٍ = جردٌ بلا حصيلة.
  check("إغلاقٌ بلا تاريخٍ مرفوض", await threw(() => repo.closePoultryCycle(cyc.id, { closed_on: "" })));
  await repo.closePoultryCycle(cyc.id, { closed_on: today, sold_count: 19900, sold_weight_kg: 45000, sale_total: 90000000 });
  check("  وبتاريخٍ يُغلق", (await repo.listPoultryCycles(farm.id))[0].status === "closed");
  check("والصرفُ على دفعةٍ مغلقةٍ مرفوض",
    await threw(() => repo.poultryConsume({ cycle_id: cyc.id, kind: "feed", product_id: "feed1", qty: 10 })));
  check("  ودفعةٌ جديدةٌ بنفس الجملون صارت ممكنة (النشطةُ أُغلقت)",
    !(await threw(() => repo.openPoultryCycle({ farm_id: farm.id, house_id: house.id, kind: "broiler", placed_on: today, placed_count: 18000 }))));
}

/* ── الشركةُ الواحدة صفٌّ واحد — مرآةُ ensure_company (0196) ─────────────────
 * الجذرُ المقيس: ١٠٢ شركةٍ مكرّرة من ١٤٣ بستّ عيادات، لأن المقارنة كانت بطرفٍ
 * مطبَّعٍ وطرفٍ خام. وهذه الفحوصُ تجري على **النسخة التجريبية** لأنها ما تجري
 * عليه فحوصُ المنطق — حارسٌ لا يوجد هنا حارسٌ لم يُفحص. */
console.log("\n▸ الشركةُ الواحدة صفٌّ واحد — مرآةُ ensure_company (0196)");
{
  /* `seed()` هو ما يُفرغ مخزنَ الديمو فعلاً (بمفتاحه المقروء من المصدر):
     `localStorage.clear()` وحدَه يترك المخزنَ يُعيد بذرتَه الافتراضية،
     فكان الفحصُ يعدّ شركاتِ بذرةٍ لا شركاتِنا — «فحصٌ يمرّ على لا شيء». */
  seed([]);
  const a = await repo.ensureCompany("شركة تاج الخيل", "c1");
  const b = await repo.ensureCompany("شركة تاج الخيل", "c1");
  check("نداءان بنفس النصّ ⇒ صفٌّ واحد", a.id === b.id && (await repo.listCompanies()).length === 1);
  /* هذه بعينها الأسماءُ التي تكرّرت بالإنتاج — والمسافةُ وحدَها كانت تكسر
     المقارنة، فكلُّ اسمٍ فيه مسافةٌ يتكرّر وكلُّ اسمٍ بكلمةٍ واحدةٍ لا يتكرّر. */
  for (const v of ["شركه تاج الخيل", "شركة  تاج   الخيل", " شركة تاج الخيل "]) {
    check(`  و«${v}» نفسُ الصفّ`, (await repo.ensureCompany(v, "c1")).id === a.id);
  }
  check("  والعددُ ما زال واحداً", (await repo.listCompanies()).length === 1);
  check("  والاسمُ المحفوظ كما كُتب أوّلَ مرّة", (await repo.listCompanies())[0].name === "شركة تاج الخيل");
  const lat = await repo.ensureCompany("ROYAL CANIN", "c1");
  check("واسمٌ لاتينيٌّ بمسافة: «royal canin» نفسُ الصفّ",
    (await repo.ensureCompany("royal canin", "c1")).id === lat.id);
  check("  واسمٌ مختلفٌ فعلاً يُنشئ صفّاً",
    (await repo.ensureCompany("اليف هاوس", "c1")).id !== lat.id && (await repo.listCompanies()).length === 3);

  /* والمنعُ عند الإنشاء المباشر — مرآةُ محفّز القاعدة. */
  check("createCompany بتوأمٍ **ترمي**", await threw(() => repo.createCompany({ name: "شركه  تاج الخيل", note: null, clinic_id: "c1" })));
  check("  ورسالتُها ليست فارغة", await (async () => {
    try { await repo.createCompany({ name: "شركة تاج الخيل", note: null, clinic_id: "c1" }); return false; }
    catch (e) { return !!String(e?.message ?? "").trim(); }
  })());

  /* الصنفُ داخل الشركة — نفسُ العطب بطبقةٍ ثانية، ومنه بصمةُ «١ شركة : ١ صنف». */
  const s1 = await repo.ensureCompanySection(a.id, "دراي فود", "c1");
  const s2 = await repo.ensureCompanySection(a.id, "درايفود", "c1");
  check("الصنفُ كذلك: «دراي فود» = «درايفود»", s1.id === s2.id);
  check("  وصنفٌ بنفس الاسم داخل شركةٍ أخرى **يُسمح** (النطاقُ الشركة لا العيادة)",
    (await repo.ensureCompanySection(lat.id, "دراي فود", "c1")).id !== s1.id);
  check("  والعددُ صنفان لا ثلاثة", (await repo.listCompanySections()).length === 2);
}

console.log("\n▸ طيُّ الشركات — حافظاتُ merge_companies و restore_company (0197 ثم 0198)");
{
  /* القاعدةُ هنا **حافظات**، نفسُ منهج حزمة SQL: «س لازم يبقى يساوي ص بعد
     الطيّ». الأعدادُ تُلقط قبل وبعد، فالفحصُ يمسك الفقدَ حتى لو جاء من طريقٍ
     لم نتوقّعه — والمرآةُ التجريبية هي التي تجري عليها فحوصُ المنطق. */
  const sow = () => mem.set(DB_KEY, JSON.stringify({
    products: [
      { id: "pa", name: "علف-أ", company_id: "D", section_id: "sd", stock: 4 },
      { id: "pb", name: "علف-ب", company_id: "D", section_id: "so", stock: 6 },
      { id: "pc", name: "علف-ج", company_id: "K", section_id: "sk", stock: 5 },
    ],
    companies: [
      { id: "K", clinic_id: "c1", name: "اليف هاوس", note: "الوكيل الرسمي", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "D", clinic_id: "c1", name: "اليف  هاوس", note: "رقم المندوب 0770", created_at: "2026-02-01T00:00:00.000Z" },
    ],
    companySections: [
      { id: "sk", clinic_id: "c1", company_id: "K", name: "دراي فود", pooled_stock: 7.5, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "sd", clinic_id: "c1", company_id: "D", name: "درايفود", pooled_stock: 2.25, created_at: "2026-02-01T00:00:00.000Z" },
      { id: "so", clinic_id: "c1", company_id: "D", name: "مكمّلات", pooled_stock: 1, created_at: "2026-02-01T00:00:00.000Z" },
    ],
    purchases: [{ id: "qu", clinic_id: "c1", company_id: "D", company_name: "اليف  هاوس", total: 900000, amount_paid: 300000 }],
    purchasePayments: [{ id: "py", clinic_id: "c1", company_id: "D", amount: 120000 }],
    companyCharges: [
      { id: "ch1", clinic_id: "c1", company_id: "D", amount: 5000, charged_at: "2026-02-02", created_at: "2026-02-02T00:00:00.000Z" },
      { id: "ch2", clinic_id: "c1", company_id: "D", amount: 2500, charged_at: "2026-02-03", created_at: "2026-02-03T00:00:00.000Z" },
    ],
    purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  }));
  const db = () => JSON.parse(mem.get(DB_KEY));
  const pool = () => (db().companySections ?? []).reduce((a, x) => a + (x.pooled_stock || 0), 0);
  const sellable = () => pool() + (db().products ?? []).reduce((a, p) => a + (p.stock || 0), 0);
  const chargeSum = () => (db().companyCharges ?? []).reduce((a, c) => a + (c.amount || 0), 0);
  const owed = () => (db().purchases ?? []).reduce((a, x) => a + Math.max(0, (x.total || 0) - (x.amount_paid ?? x.total ?? 0)), 0);
  const orphans = () => (db().products ?? []).filter((p) => p.company_id == null || p.section_id == null).length;
  /* **الحافظةُ التي لم تُكتب** (0201): أصنفُ كلِّ منتجٍ لشركته هو؟ كلُّ ما
     عداها كان يمرّ أخضرَ بينما منتجٌ لم يتحرّك بالطيّ أصلاً هبط بصنفِ شركةٍ
     أخرى بعد الفكّ — حالةٌ لا تصنعها الشاشةُ ولا تصلحها. */
  const strayed = () => {
    const co = Object.fromEntries((db().companySections ?? []).map((s) => [s.id, s.company_id]));
    return (db().products ?? []).filter((p) => p.section_id && co[p.section_id] !== p.company_id).map((p) => p.id);
  };

  sow();
  const before = { pool: pool(), sell: sellable(), chg: chargeSum(), owed: owed(), orph: orphans(), prods: (db().products ?? []).length };

  const tw = await repo.companyTwins();
  check("تقريرُ التوائم يرى المجموعة ويُبقي الأقدم", tw.length === 1 && tw[0].keep_id === "K" && tw[0].rows === 2);
  check("  ويقول **ما ينتقل** لا ما بالمجموعة كلِّها (٢ من ٣)",
    tw[0].products === 3 && tw[0].moving_products === 2, `${tw[0].products}/${tw[0].moving_products}`);
  check("  ويقول حوضَ المطويّات (٢٫٢٥ + ١)", tw[0].pool_moving === 3.25, String(tw[0].pool_moving));
  /* ولكلّ صفٍّ عددُه (0200): بلا هذا كانت نافذةُ الطيّ تُبقي أرقامَ الأقدم
     حين تختار العيادةُ صفّاً آخر ليبقى — رقمٌ يُبنى عليه قرارٌ وهو كاذب. */
  const det = tw[0].rows_detail ?? [];
  const own = (id) => det.find((r) => r.id === id) ?? {};
  check("ولكلّ صفٍّ عددُه على حدة", det.length === 2 && own("K").products === 1 && own("D").products === 2,
    JSON.stringify(det.map((r) => [r.id, r.products])));
  check("  وحوضُ كلٍّ منهما", own("K").pool === 7.5 && own("D").pool === 3.25, `${own("K").pool}/${own("D").pool}`);
  check("  فالمنقولُ لو بقي الثاني = ١ منتج و١ صنف لا ٢",
    own("K").products === 1 && own("K").sections === 1);

  const kept = await repo.mergeCompanies("K", "D");
  check("الطيُّ يمرّ ويرجّع الباقي", kept.id === "K");
  check("  والمطويّةُ اختفت", !(db().companies ?? []).some((c) => c.id === "D"));
  check("  ولا منتجَ فقد شركتَه ولا صنفَه", orphans() === before.orph, String(orphans()));
  check("  **ومجموعُ الحوض لم يتغيّر**", pool() === before.pool, `${pool()} ≠ ${before.pool}`);
  check("  والحوضُ هبط بالصنف الصحيح (٧٫٥ + ٢٫٢٥)",
    (db().companySections ?? []).find((x) => x.id === "sk")?.pooled_stock === 9.75);
  check("  ولا منتجَ بصنفِ شركةٍ أخرى بعد الطيّ", strayed().length === 0, strayed().join("، "));
  check("  وصورةُ الصنف المطويّ بوجهتها وحوضها",
    (db().companySectionsTrash ?? []).some((x) => x.id === "sd" && x.folded_into === "sk" && x.pooled_moved === 2.25),
    JSON.stringify((db().companySectionsTrash ?? []).map((x) => [x.id, x.folded_into, x.pooled_moved])));
  check("  ومجموعُ الوحدات القابلة للبيع ثابت", sellable() === before.sell);
  check("  والمطالبتان انتقلتا بمبلغهما (cascade كان سيمحوهما)",
    chargeSum() === before.chg && (db().companyCharges ?? []).every((c) => c.company_id === "K"));
  check("  ودفعةُ المورّد انتقلت", (db().purchasePayments ?? []).every((x) => x.company_id === "K"));
  check("  والمطلوبُ للمورّدين لم يتغيّر فلساً", owed() === before.owed);
  check("  والفاتورةُ انتقلت واسمُها توحّد",
    (db().purchases ?? [])[0].company_id === "K" && (db().purchases ?? [])[0].company_name === "اليف هاوس");
  check("  والملاحظتان **اتّحدتا** ولم تُرمَ إحداهما", /الوكيل/.test(kept.note ?? "") && /المندوب/.test(kept.note ?? ""));

  const back = await repo.restoreCompany("D");
  check("الفكُّ يرجّعها **بنفس معرّفها**", back.id === "D");
  check("  وكلُّ حافظةٍ رجعت: الحوض والمطلوب والمطالبات",
    pool() === before.pool && owed() === before.owed && chargeSum() === before.chg);
  check("  وحوضُ الباقي رجع ٧٫٥ بالضبط (طرحُ ما أُضيف لا تخمين)",
    (db().companySections ?? []).find((x) => x.id === "sk")?.pooled_stock === 7.5);
  check("  والمنتجان رجعا للمطويّة", (db().products ?? []).filter((p) => p.company_id === "D").length === 2);
  check("  والمطالبتان رجعتا إليها", (db().companyCharges ?? []).every((c) => c.company_id === "D"));
  check("  و**لا منتجَ هبط بصنفِ شركةٍ أخرى**", strayed().length === 0, strayed().join("، "));
  check("  والملاحظةُ فُكَّ اتّحادُها (الباقيةُ رجعت لملاحظتها وحدها)",
    db().companies.find((c) => c.id === "K").note === "الوكيل الرسمي", db().companies.find((c) => c.id === "K").note);
  check("  وصورةُ الصنف المطويّ تحمل وجهتَه ومنتجاتِه هو لا منتجاتِ الباقي",
    (db().companySectionsTrash ?? []).length === 0 ||
    (db().companySectionsTrash ?? []).every((x) => (x.product_ids ?? []).every((id) => id !== "pc")));
  check("  والسلّةُ فُرّغت", (await repo.listDeletedCompanies()).length === 0);

  /* ــ والحذفُ الصريح: البابُ الذي كان يفقد الديونَ بصمت (0198) ــ */
  sow();
  const d0 = { chg: chargeSum(), pool: pool(), orph: orphans() };
  await repo.deleteCompany("D", "فحص");
  check("حذفٌ صريح ⇒ صورةٌ بالسلّة", (await repo.listDeletedCompanies()).some((t) => t.id === "D" && !t.merged_into));
  check("  ومطالباتُها مُحيت بالتتالي (cascade) — كما بالقاعدة", chargeSum() === 0);
  await repo.restoreCompany("D");
  check("  والاسترجاعُ يرجّع **الديونَ بمبلغها** (المعرّفُ وحدَه ما كان يعيدها)",
    chargeSum() === d0.chg, String(chargeSum()));
  check("  وأصنافَها بحوضها", pool() === d0.pool, String(pool()));
  check("  ولا منتجَ بقي بلا شركةٍ أو صنف", orphans() === d0.orph, String(orphans()));

  /* ــ الرفضُ يُسمع: لا نصفَ طيّ ــ */
  sow();
  check("طيُّ الشيء بنفسه **يرمي**", await threw(() => repo.mergeCompanies("K", "K")));
  check("  وشركةٌ غيرُ موجودة كذلك", await threw(() => repo.mergeCompanies("K", "لا-أحد")));
  check("  ولا صفَّ تحرّك برفضه", (db().companies ?? []).length === 2 && orphans() === d0.orph);

  /* ولا استرجاعَ يقول «تمّ» وهو رجع فارغاً (0203): حذفُ الباقية يجعل
     `company_id` NULL، فلا شرطَ «ما زالت حيث تركها الطيّ» يتحقّق. */
  sow();
  await repo.mergeCompanies("K", "D");
  await repo.deleteCompany("K", null);
  check("استرجاعُ مطويّةٍ وجهتُها محذوفة **يرمي**", await threw(() => repo.restoreCompany("D")));
  check("  ولا صفَّ أُنشئ برفضه", !(db().companies ?? []).some((c) => c.id === "D"));
  await repo.restoreCompany("K");
  await repo.restoreCompany("D");
  check("وبالترتيب الصحيح يرجع كلُّ شيء لصاحبه",
    (db().products ?? []).filter((p) => p.company_id === "D").map((p) => p.id).join() === "pa,pb" &&
    (db().products ?? []).filter((p) => p.company_id === "K").map((p) => p.id).join() === "pc" &&
    chargeSum() === before.chg && pool() === before.pool,
    JSON.stringify((db().products ?? []).map((p) => [p.id, p.company_id])));

  /* واسمٌ فارغٌ بعد التطبيع — أو محارفُ اتجاهٍ لا تُرى — يُرفض (0202). */
  sow();
  for (const bad of ["   ", "\u200b\u200f", "\u2066\u2069"]) {
    check(`اسمٌ «${JSON.stringify(bad)}» يُرفض`, await threw(() => repo.createCompany({ name: bad, note: null, clinic_id: "c1" })));
  }
  check("و«رويال كانين» بمحرفِ اتجاهٍ = نفسُ الصفّ",
    (await repo.ensureCompany("رويال كانين", "c1")).id === (await repo.ensureCompany("\u200fرويال\u200bكانين", "c1")).id);
}

console.log("▸ 0214 — الوجباتُ الخفيفة (مرآةُ الحزمة)");
{
  seed([P("lb", "سيفوتاكس الوجبات", "LB-1", { stock: 0, expiry_date: null })]);
  const a = await repo.recordPurchase([{ product_id: "lb", name: "سيفوتاكس الوجبات", qty: 10, purchase_price: 1, sell_price: 0, expiry_date: "2026-12-01" }], { company_name: "وجبة أ" });
  await repo.recordPurchase([{ product_id: "lb", name: "سيفوتاكس الوجبات", qty: 5, purchase_price: 1, sell_price: 0, expiry_date: "2027-06-01" }], { company_name: "وجبة ب" });
  const bs = await repo.productBatches("lb");
  check("كلُّ وجبةٍ تحفظ تاريخَها، الأحدثُ أوّلاً — والقديمةُ لا تُنسى", bs.map((b) => b.expiry_date).join() === "2027-06-01,2026-12-01", JSON.stringify(bs));
  await repo.updatePurchase(a.id, [{ product_id: "lb", name: "سيفوتاكس الوجبات", qty: 10, purchase_price: 1, sell_price: 0, batch_expiry: "2026-12-01" }], { company_name: "وجبة أ" });
  const items = await repo.listPurchaseItems(a.id);
  check("  وتعديلُ الفاتورة القديمة يُبقي تاريخَ وجبتها (batch_expiry)", items[0]?.expiry_date === "2026-12-01");
  // 0217 غيّرت القاعدة بقرار المالك: تاريخُ الرفّ = **أقربُ** دفعةٍ فيها رصيد (كانت «الأحدث»).
  check("  وتاريخُ الرفّ = أقربُ وجبةٍ فيها رصيد (0217)", (await repo.listProducts()).find((p) => p.id === "lb")?.expiry_date === "2026-12-01");
}

console.log("▸ 0217 — الدفعات (مرآةُ الحزمة)");
{
  seed([P("la", "دفعات أ", null, { stock: 10, purchase_price: 100, expiry_date: "2026-11-05" })]);
  mem.delete("vp_demo_lots"); mem.delete("vp_demo_counts");
  const lotsOf = async (id) => (await repo.listProductLots(id)).filter((l) => l.qty > 0).sort((x, y) => (x.expiry_date ?? "").localeCompare(y.expiry_date ?? ""));
  const first = await lotsOf("la");
  check("رصيدٌ قائم ⇒ دفعةٌ افتتاحية بكميته وتاريخه", first.length === 1 && first[0].source === "opening" && first[0].qty === 10 && first[0].expiry_date === "2026-11-05");
  await repo.recordPurchase([{ product_id: "la", name: "دفعات أ", qty: 20, purchase_price: 100, sell_price: 0, expiry_date: "2027-04-14" }], { company_name: "شركة الدفعات" });
  let ls = await lotsOf("la");
  check("الشراءُ يصنع دفعتَه بتاريخه وشركته", ls.length === 2 && ls[1].source === "purchase" && ls[1].qty === 20 && ls[1].company_name === "شركة الدفعات");
  const stockTo = (n) => { const d = JSON.parse(mem.get(DB_KEY)); d.products.find((x) => x.id === "la").stock = n; mem.set(DB_KEY, JSON.stringify(d)); };
  stockTo(18);
  ls = await lotsOf("la");
  check("البيعُ من الأقرب انتهاءً (الافتتاحيةُ تخلص والشراءُ ١٨)", ls.length === 1 && ls[0].source === "purchase" && ls[0].qty === 18, JSON.stringify(ls.map((l) => l.qty)));
  check("  وتاريخُ المادة صار تاريخَ الباقية", (await repo.listProducts()).find((p) => p.id === "la")?.expiry_date === "2027-04-14");
  mem.set("vp_session", JSON.stringify({ raw: { id: "u", full_name: "مدير", role: "admin" } }));
  await repo.addLot("la", 5, "2026-12-01", "وصلت من المندوب");
  ls = await lotsOf("la");
  check("إضافةُ دفعةٍ باليد تزيد الرصيد، والمادةُ تأخذ الأقرب", ls.length === 2 && (await repo.listProducts()).find((p) => p.id === "la")?.stock === 23 && (await repo.listProducts()).find((p) => p.id === "la")?.expiry_date === "2026-12-01");
  const dec = await repo.submitStockCount([{ product_id: "la", counted: 0, reason: "damaged", lots: ls.map((l) => ({ lot_id: l.id, counted: l.expiry_date === "2026-12-01" ? 4 : 18 })) }]);
  check("الجردُ بالدفعة: الأولى ٥ لقينا ٤ ⇒ المادة ٢٢ معلَّقة", dec.pending === 1 && (await repo.listStockCounts({ pending: true }))[0]?.counted_qty === 22);
  await repo.decideStockCounts((await repo.listStockCounts({ pending: true })).map((c) => c.id), true);
  ls = await lotsOf("la");
  check("  والموافقةُ تنقص الدفعةَ المعدودة بعينها", ls.map((l) => l.qty).join() === "4,18", ls.map((l) => l.qty).join());
  await repo.editLot(ls[1].id, "2026-10-20", 3);
  ls = await lotsOf("la");
  check("فصلُ ٣ بتاريخٍ أقرب لا يغيّر الرصيد، والمادةُ تأخذه", ls.map((l) => l.qty).join() === "3,4,15" && (await repo.listProducts()).find((p) => p.id === "la")?.expiry_date === "2026-10-20");
  mem.set("vp_session", JSON.stringify({ raw: { id: "r", full_name: "استقبال", role: "reception" } }));
  let refused = "";
  try { await repo.addLot("la", 1, null); } catch (e) { refused = e.message; }
  check("  والاستقبالُ لا يضيف دفعات", refused === "lot_forbidden");
  mem.delete("vp_session");
  // شراءٌ قبل أيّ قراءةٍ للدفعات: القديمُ يبقى افتتاحيةً بتاريخه (أمسكته قيادةُ المتصفّح)
  seed([P("lz", "قديم قبل الشراء", null, { stock: 4, purchase_price: 1, expiry_date: "2027-09-30" })]);
  mem.delete("vp_demo_lots");
  await repo.recordPurchase([{ product_id: "lz", name: "قديم قبل الشراء", qty: 6, purchase_price: 1, sell_price: 0, expiry_date: "2027-03-31" }], { company_name: "أوّلُ شراء" });
  const lz = (await repo.listProductLots("lz")).map((l) => `${l.source}:${l.qty}:${l.expiry_date}`).sort().join();
  check("شراءٌ قبل أيّ قراءة: القديمُ دفعتُه بتاريخه لا يذوب بالجديدة", lz === "opening:4:2027-09-30,purchase:6:2027-03-31", lz);
  // ما أمسكه التدقيقُ العدائيّ — مرآةً بمرآة
  seed([P("lx", "منتهٍ وجديد", null, { stock: 3, purchase_price: 1, expiry_date: "2020-01-01" })]);
  mem.delete("vp_demo_lots");
  await repo.listProductLots("lx");
  await repo.recordPurchase([{ product_id: "lx", name: "منتهٍ وجديد", qty: 5, purchase_price: 1, sell_price: 0 }], { company_name: "بلا تاريخ" });
  const lx = await repo.listProductLots("lx");
  check("شراءٌ بلا تاريخ لا يرث تاريخاً فات", lx.find((l) => l.source === "purchase")?.expiry_date === null, JSON.stringify(lx));
  await repo.recordPurchase([{ product_id: "lx", name: "منتهٍ وجديد", qty: 4, purchase_price: 1, sell_price: 0, expiry_date: "2027-03-01" }], { company_name: "مؤرّخة" });
  await repo.listProductLots("lx");
  check("  وتاريخُ المادة = الأقربُ الصالح لا المنتهي الباقي", (await repo.listProducts()).find((p) => p.id === "lx")?.expiry_date === "2027-03-01");
  const dated = (await repo.listProductLots("lx")).find((l) => l.company_name === "مؤرّخة");
  mem.set("vp_session", JSON.stringify({ raw: { id: "u", full_name: "مدير", role: "admin" } }));
  await repo.editLot(dated.id, "2027-05-01");
  const pur = JSON.parse(mem.get(DB_KEY)).purchases.find((x) => x.company_name === "مؤرّخة");
  await repo.updatePurchase(pur.id, [{ product_id: "lx", name: "منتهٍ وجديد", qty: 6, purchase_price: 1, sell_price: 0, expiry_date: "2027-03-01" }], { company_name: "مؤرّخة" });
  const after = (await repo.listProductLots("lx")).find((l) => l.company_name === "مؤرّخة");
  check("  وتاريخٌ صحّحته العيادةُ لا يمحوه تعديلُ الفاتورة", after?.expiry_date === "2027-05-01" && after?.received_qty === 6, JSON.stringify(after));
  { const d = JSON.parse(mem.get(DB_KEY)); const x = d.products.find((q) => q.id === "lx"); x.pooled = true; x.stock = 0; mem.set(DB_KEY, JSON.stringify(d)); }
  check("  ومادةٌ صارت مجمَّعة تفقد دفعاتها", (await repo.listProductLots("lx")).length === 0);
  mem.delete("vp_session");
}

console.log("▸ 0215 — معدّلُ البيع (مرآةُ الحزمة)");
{
  seed([P("sr", "مادةُ المعدّل", null, { stock: 3 })]);
  const d = JSON.parse(mem.get(DB_KEY));
  const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();
  d.invoices = [{ id: "i1", created_at: ago(3) }, { id: "i2", created_at: ago(2) }, { id: "i3", created_at: ago(60) }];
  d.invoiceItems = [{ id: "a", invoice_id: "i1", product_id: "sr", qty: 10 }, { id: "b", invoice_id: "i2", product_id: "sr", qty: -2 }, { id: "c", invoice_id: "i3", product_id: "sr", qty: 50 }];
  mem.set(DB_KEY, JSON.stringify(d));
  check("صافي آخر ٣٠ يوماً ١٠ − ٢ = ٨ (والأقدمُ خارج)", (await repo.productSalesRate(30)).get("sr") === 8);
  check("  وبـ٩٠ يوماً ٥٨، وبألف يوم مقصوصةً لـ١٨٠ (٥٨)", (await repo.productSalesRate(90)).get("sr") === 58 && (await repo.productSalesRate(1000)).get("sr") === 58);
}

console.log("▸ 0216 — الجردُ بموافقة وسحبُ المخزن (مرآةُ الحزمة)");
{
  seed([
    P("t1", "جرد تالف", null, { stock: 10, purchase_price: 2000 }), P("m1", "جرد مطابق", null, { stock: 5, purchase_price: 1000 }),
    P("e1", "جرد خطأ", null, { stock: 4, purchase_price: 500 }), P("f1", "جرد زيادة", null, { stock: 1, purchase_price: 700 }),
    P("np", "بلا سعر", null, { stock: 3, purchase_price: 0 }), P("pl", "مجمّع", null, { stock: 0, pooled: true }),
  ]);
  mem.delete("vp_demo_counts"); mem.delete("vp_demo_expenses");
  const as = (role) => mem.set("vp_session", JSON.stringify({ raw: { id: "u-" + role, full_name: "موظف " + role, role } }));
  const stockOf = (id) => JSON.parse(mem.get(DB_KEY)).products.find((p) => p.id === id).stock;
  const code = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e.message; } };
  as("reception");
  const r = await repo.submitStockCount([{ product_id: "t1", counted: 7, reason: "damaged" }, { product_id: "m1", counted: 5 }, { product_id: "np", counted: 1, reason: "damaged" }]);
  check("الاستقبالُ يعدّ: مطابقٌ واحد، ومعلَّقان", r.matched === 1 && r.pending === 2, JSON.stringify(r));
  check("  والرصيدُ ما تغيّر قبل الموافقة", stockOf("t1") === 10);
  check("فرقٌ بلا سبب يُرفض برمز الخادم", (await code(() => repo.submitStockCount([{ product_id: "e1", counted: 2 }]))) === "count_reason");
  check("  وزيادةٌ بسبب «تالف» تُرفض", (await code(() => repo.submitStockCount([{ product_id: "f1", counted: 3, reason: "damaged" }]))) === "count_reason");
  check("  والمجمَّعةُ تُرفض", (await code(() => repo.submitStockCount([{ product_id: "pl", counted: 1, reason: "found" }]))) === "count_pooled");
  await repo.submitStockCount([{ product_id: "e1", counted: 2, reason: "entry_error" }, { product_id: "f1", counted: 3, reason: "found" }]);
  const pend = await repo.listStockCounts({ pending: true });
  check("المعلَّقُ أربعة", pend.length === 4, String(pend.length));
  check("مادةٌ معلَّقة لا تُعدّ ثانيةً (عدٌّ «مطابق» كان يمحو النقص)", (await code(() => repo.submitStockCount([{ product_id: "t1", counted: 10 }]))) === "count_already_pending");
  check("  وعددٌ NaN يُرفض", (await code(() => repo.submitStockCount([{ product_id: "m1", counted: NaN, reason: "found" }]))) === "count_bad_qty");
  check("الاستقبالُ لا يوافق", (await code(() => repo.decideStockCounts(pend.map((c) => c.id), true))) === "count_needs_manager");
  // بيعٌ بين العدّ والموافقة: ١٠ ⇒ ٨
  { const d = JSON.parse(mem.get(DB_KEY)); d.products.find((p) => p.id === "t1").stock = 8; mem.set(DB_KEY, JSON.stringify(d)); }
  as("admin");
  const dec = await repo.decideStockCounts(pend.map((c) => c.id), true);
  check("المديرُ يوافق على الأربعة", dec.approved === 4, JSON.stringify(dec));
  check("  الفرقُ لا الرقم (٨ − ٣ = ٥)", stockOf("t1") === 5, String(stockOf("t1")));
  check("  وخطأُ الإدخال والزيادةُ يصحّحان", stockOf("e1") === 2 && stockOf("f1") === 3);
  const ex = await repo.listExpenses();
  check("  سحبٌ واحد «من المخزن» ٦٠٠٠ بموادّه", ex.length === 1 && ex[0].method === "stock" && ex[0].amount === 6000 && ex[0].description.endsWith("جرد تالف ×3"), JSON.stringify(ex));
  check("  وبلا سعرٍ بلا سحب، وخطأُ الإدخال والزيادةُ بلا سحب",
    (await repo.listProductCounts("np"))[0]?.expense_id === null && (await repo.listProductCounts("e1"))[0]?.expense_id === null);
  check("  وسحبُ المخزن لا يُحذف باليد (مرآةُ المحفّز)", (await code(() => repo.deleteExpense(ex[0].id))) === "stock_expense_locked" && (await repo.listExpenses()).length === 1);
  check("  ولا يُضاف باليد", (await code(() => repo.addExpense({ amount: 5, description: "x", method: "stock", spent_at: new Date().toISOString() }))) === "stock_expense_locked");
  check("  والموافقةُ لا تُطبَّق مرّتين", (await repo.decideStockCounts(pend.map((c) => c.id), true)).approved === 0 && stockOf("t1") === 5);
  const from = new Date(Date.now() - 86400000).toISOString(), to = new Date(Date.now() + 86400000).toISOString();
  const loss = (await repo.reportStockLosses(from, to)).sort((a, b) => a.reason.localeCompare(b.reason)).map((x) => `${x.reason}:${x.lines}:${x.value}`).join(",");
  check("تقريرُ الخسائر يطابق الحزمة فلساً بفلس", loss === "damaged:2:6000,entry_error:1:1000,found:1:-1400", loss);
  const st = await repo.stockCountState();
  check("حالةُ العدّ: التالفُ بفرق، والمطابقُ بلا فرق", !!st.get("t1")?.lastDiffAt && st.get("m1")?.lastDiffAt === null);
  mem.delete("vp_session");
}

console.log("▸ 0218 — قوالبُ الواتساب (مرآةُ الحزمة)");
{
  mem.delete("vp_demo_wa_templates");
  const code = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e.message; } };
  const a = await repo.saveWaTemplate({ title: " عرض الصيف ", body: "هلا {{اسم_المالك}}" });
  check("القالبُ يُحفظ مقصوصاً ويُقرأ", a.title === "عرض الصيف" && (await repo.listWaTemplates()).length === 1);
  await repo.saveWaTemplate({ id: a.id, title: a.title, body: "نص جديد" });
  check("  ويتحدّث بنفس المعرّف (لا قالبٌ ثانٍ)", (await repo.listWaTemplates()).map((x) => x.body).join() === "نص جديد");
  check("  وعنوانٌ فارغ يُرفض", (await code(() => repo.saveWaTemplate({ title: "  ", body: "x" }))) === "wa_templates_invalid");
  await repo.deleteWaTemplate(a.id);
  check("  ويُحذف، وحذفُ غير الموجود يرمي (لا «انحذف» كاذبة)", (await repo.listWaTemplates()).length === 0 && (await code(() => repo.deleteWaTemplate(a.id))) === "not_found");
  for (let i = 0; i < 100; i++) await repo.saveWaTemplate({ title: `ق${i}`, body: "x" });
  check("  وسقفُ ١٠٠", (await code(() => repo.saveWaTemplate({ title: "١٠١", body: "x" }))) === "wa_templates_full");
  mem.delete("vp_demo_wa_templates");
}

console.log("▸ تعديلُ موعد اللقاح (مرآةُ rescheduleVaccination)");
{
  const code = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e.message; } };
  { const db = JSON.parse(mem.get(DB_KEY) || "{}"); db.vaccinations = db.vaccinations ?? []; mem.set(DB_KEY, JSON.stringify(db)); }
  const v = await repo.addVaccination({ pet_id: "vx-pet", name: "Rabies", status: "overdue", due_date: "2026-09-01", dose_number: 1, doses_total: 1 });
  await repo.rescheduleVaccination(v.id, "2026-12-01", "scheduled");
  const after = (await repo.listVaccinations("vx-pet")).find((x) => x.id === v.id);
  check("المتأخرُ المؤجَّل يرجع مجدولاً بموعده الجديد", after?.status === "scheduled" && after?.due_date === "2026-12-01", JSON.stringify(after));
  await repo.updateVaccination(v.id, { status: "administered", administered_at: "2026-09-29T10:00:00Z" });
  check("  واللقاحُ المعطى لا يُؤجَّل — يرمي لا «انحفظ» كاذبة", (await code(() => repo.rescheduleVaccination(v.id, "2027-01-01", "scheduled"))) === "not_found");
  check("  والغائبُ يرمي", (await code(() => repo.rescheduleVaccination("nope", "2027-01-01", "scheduled"))) === "not_found");
}

console.log("▸ 0223 — سجلُّ لقاحاتٍ سابق (مرآةُ addVaccinations)");
{
  const before = (await repo.listVaccinations("vx-hist")).length;
  await repo.addVaccinations([
    { pet_id: "vx-hist", name: "DHPPi", status: "administered", administered_at: "2026-03-01", due_date: null, dose_number: 1, doses_total: null },
    { pet_id: "vx-hist", name: "DHPPi", status: "administered", administered_at: "2026-03-22", due_date: null, dose_number: 2, doses_total: null },
    { pet_id: "vx-hist", name: "DHPPi", status: "scheduled", administered_at: null, due_date: "2027-03-22", dose_number: 3, doses_total: null },
  ]);
  const rows = await repo.listVaccinations("vx-hist");
  check("الدفعةُ كلُّها تنكتب بأيّامها", rows.length === before + 3 && rows.filter((r) => r.status === "administered").map((r) => r.administered_at).sort().join(",") === "2026-03-01,2026-03-22", JSON.stringify(rows));
  check("  وكلُّ صفٍّ مختومٌ بيوم إدخاله (مرآةُ created_at بالخادم) — لا بيوم إعطائه", rows.every((r) => typeof r.created_at === "string" && r.created_at.slice(0, 10) > "2026-03-22"));
  check("  والمجموعُ المجهول يبقى فارغاً لا ١", rows.every((r) => r.doses_total === null));
  await repo.addVaccinations([]);
  check("  ودفعةٌ فارغة لا تكتب شيئاً", (await repo.listVaccinations("vx-hist")).length === before + 3);
  const one = await repo.addVaccination({ pet_id: "vx-hist", name: "Rabies", status: "administered", administered_at: "2026-10-01" });
  check("  واللقاحُ المفرد مختومٌ كذلك", typeof one.created_at === "string");
}

console.log("▸ معلوماتُ الدخول تنتقل لأوّل زيارة (مرآةُ linkNotesToVisit)");
{
  const a = await repo.addPetNote({ pet_id: "in-pet", note_text: "intake-a" });
  const b = await repo.addPetNote({ pet_id: "in-pet", note_text: "intake-b", visit_id: "v-old" });
  const n = await repo.linkNotesToVisit([a.id, b.id], "v-new");
  const after = await repo.listPetNotes("in-pet");
  check("تُربط غيرُ المربوطة وحدها، ويرجع عددُ ما رُبط", n === 1 && after.find((x) => x.id === a.id)?.visit_id === "v-new" && after.find((x) => x.id === b.id)?.visit_id === "v-old", JSON.stringify(after));
  check("  وإعادةُ الربط لا تسحبها لزيارةٍ أخرى", (await repo.linkNotesToVisit([a.id], "v-other")) === 0);
  check("  وقائمةٌ فارغة لا تكتب شيئاً", (await repo.linkNotesToVisit([], "v-x")) === 0);
}

console.log("▸ 0221 — أدويةُ الطبيب المفضّلة (مرآةُ الحزمة)");
{
  for (const k of [...mem.keys()]) if (k.startsWith("vp_demo_drug_favs_")) mem.delete(k);
  const code = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e.message; } };
  const a = await repo.addDrugFavorite("  Ceftriaxone  ");
  check("المفضّلةُ تُحفظ مقصوصةً وتُقرأ", a.name === "Ceftriaxone" && (await repo.listDrugFavorites()).length === 1);
  const b = await repo.addDrugFavorite("ceftriaxone");
  check("  ونفسُ الدواء بحالةٍ أخرى لا يتكرّر (يرجع القائم)", b.id === a.id && (await repo.listDrugFavorites()).length === 1);
  check("  واسمٌ فارغ يُرفض", (await code(() => repo.addDrugFavorite("  "))) === "drug_favorites_invalid");
  await repo.removeDrugFavorite(a.id);
  check("  وتُشال، وشيلُ غير الموجود يرمي (لا «انشال» كاذبة)", (await repo.listDrugFavorites()).length === 0 && (await code(() => repo.removeDrugFavorite(a.id))) === "not_found");
  for (let i = 0; i < 150; i++) await repo.addDrugFavorite(`دواء ${i}`);
  check("  وسقفُ ١٥٠", (await code(() => repo.addDrugFavorite("الـ١٥١"))) === "drug_favorites_full");
  for (const k of [...mem.keys()]) if (k.startsWith("vp_demo_drug_favs_")) mem.delete(k);
}

console.log("▸ 0212 — المتجرُ لا يبيع المنتهي");
{
  const SP = { slug: "demo-vet", enabled: true, delivery_fee: 0, min_order: 0, updated_at: "2026-01-01" };
  const seedStore = (products) => {
    seed(products);
    const db = JSON.parse(mem.get(DB_KEY));
    db.storeProfile = SP; db.storeOrders = []; db.deliveryOrders = [];
    mem.set(DB_KEY, JSON.stringify(db));
  };
  const SPROD = (id, price, stock) => P(id, `منتج ${id}`, null, { store_visible: true, sell_price: price, purchase_price: 0, stock });
  const dbNow = () => JSON.parse(mem.get(DB_KEY));
  /* 0212 مرآةً بمرآة: المتجرُ لا يبيع المنتهي — لا عرض، ولا طلب، ولا قبول. */
  const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  seedStore([
    { ...SPROD("ex", 10, 5), expiry_date: iso(-1) },
    { ...SPROD("last", 10, 5), expiry_date: iso(0) },
    SPROD("nod", 10, 5),
  ]);
  const cat = (await repo.storeCatalogPublic("demo-vet")).map((c) => c.id).sort().join();
  check("0212: الكتلوجُ يخفي المنتهي ويعرض آخرَ يومٍ وما بلا تاريخ", cat === "last,nod", cat);
  const bad = await repo.placeStoreOrder("demo-vet", { name: "زبون الانتهاء", phone: "07791110000" }, [{ product_id: "ex", qty: 1 }]);
  check("  وسلّةٌ فيها منتهٍ تُرفض bad_items", bad.ok === false && bad.error === "bad_items");
  const okLast = await repo.placeStoreOrder("demo-vet", { name: "زبون الانتهاء", phone: "07791110001" }, [{ product_id: "last", qty: 1 }]);
  check("  وآخرُ يومٍ صالح يُطلب", okLast.ok === true);
  const d2 = dbNow();
  d2.products.find((x) => x.id === "last").expiry_date = iso(-1);   // انتهت قبل القبول
  mem.set(DB_KEY, JSON.stringify(d2));
  const expOid = dbNow().storeOrders[0].id;
  let err = null;
  try { await repo.acceptStoreOrder(expOid); } catch (e) { err = e; }
  check("  والقبولُ يرفض طلباً انتهت مادّتُه — بالاسم، ولا يخرج شيء", err?.message === "store_item_expired" && err?.item === "منتج last" && !!err?.hint
    && dbNow().products.find((x) => x.id === "last").stock === 5 && dbNow().storeOrders[0].status === "new", String(err?.hint));
}

console.log("▸ رفعُ الأسعار بالتجريبيّ (0226) — نفسُ حساب القاعدة وحرّاسها");
{
  const dbNow = () => JSON.parse(mem.get(DB_KEY));
  const setPrice = (id, v) => { const d = dbNow(); d.products.find((x) => x.id === id).sell_price = v; mem.set(DB_KEY, JSON.stringify(d)); };
  seed([
    P("ra", "رويال A", null, { sell_price: 5000, purchase_price: 3500, category: "food", bulk_group: "GX" }),
    P("rb", "رويال B", null, { sell_price: 5000, purchase_price: 3500, category: "toys", bulk_group: "GX" }),
    P("rc", "معلبات", null, { sell_price: 1666, purchase_price: 1200, category: "food" }),
    P("rd", "حبوب", null, { sell_price: 4500, purchase_price: 3000, category: "food", has_sub_unit: true, sub_unit_price: 1500, units_per_box: 3 }),
    P("re", "رمل", null, { sell_price: 1000, purchase_price: 600, category: "food" }),
    P("rz", "صفر", null, { sell_price: 0, purchase_price: 0, category: "food" }),
  ]);
  const spec = { pct_bp: 2500, round: "smart", max_step: 250, products: true, services: false, p_categories: ["food"], p_companies: null,
    p_sections: null, p_ids: null, p_exclude: [], s_categories: null, s_ids: null, s_exclude: [], skip_recent: true };
  const pv = await repo.previewPriceChange(spec);
  const w = (id, f = "sell_price") => pv.lines.find((l) => l.id === id && l.f === f)?.w;
  check("المعاينة: ٥ منتجات (المجموعةُ GX كاملة رغم صنف rb) + مفرد، والصفرُ يُعدّ", pv.counts.products === 5 && pv.counts.sub_units === 1 && pv.skipped.zero_products === 1, JSON.stringify(pv.counts));
  check("  وأرقامُ القاعدة: 5000→6250، 1666→2100، 1000→1250، والمفرد 1950", w("ra") === 6250 && w("rc") === 2100 && w("re") === 1250 && w("rd", "sub_unit_price") === 1950);
  let e1 = null; try { await repo.previewPriceChange({ ...spec, p_ids: ["ra"] }); } catch (e) { e1 = e; }
  check("نطاقان معاً يُرفضان mixed_scope", e1?.message === "mixed_scope");
  let e2 = null; try { await repo.applyPriceChange(spec, "bad-hash", null, null); } catch (e) { e2 = e; }
  check("بصمةٌ غير بصمة المعاينة ⇒ stale_preview ولا يُكتب شيء", e2?.message === "stale_preview" && dbNow().products.find((x) => x.id === "ra").sell_price === 5000);
  const ap = await repo.applyPriceChange(spec, pv.plan_hash, "رفع", "ref-demo-1");
  const prices = () => Object.fromEntries(dbNow().products.map((x) => [x.id, x.sell_price]));
  check("الحفظ: الأسعارُ ما عرضته المعاينة، والصفرُ باقٍ", prices().ra === 6250 && prices().rb === 6250 && prices().rc === 2100 && prices().rz === 0
    && dbNow().products.find((x) => x.id === "rd").sub_unit_price === 1950 && ap.n_lines === 6, JSON.stringify(prices()));
  check("  وعدّادُ الأسعار صار ١", (await repo.priceEpoch()) === 1);
  const again = await repo.applyPriceChange(spec, pv.plan_hash, null, "ref-demo-1");
  check("إعادةُ النداء بمرجعه: نفسُ الرفع، لا رفعٌ ثانٍ", again.replayed === true && again.id === ap.id && (await repo.listPriceChanges()).length === 1);
  setPrice("re", 1300);
  const pv2 = await repo.previewPriceChange(spec);
  check("معاينةٌ ثانية: المرفوعُ حديثاً يُتخطّى كلُّه", pv2.counts.lines === 0 && pv2.counts.recent_skipped === 6, JSON.stringify(pv2.counts));
  const u1 = await repo.undoPriceChange(ap.id, ["rb"], "زبون", "ref-undo-1");
  check("إرجاعُ عضوٍ يُرجع مجموعتَه كاملة", u1.restored === 2 && prices().ra === 5000 && prices().rb === 5000 && u1.status === "partially_undone");
  const u1b = await repo.undoPriceChange(ap.id, ["rb"], "زبون", "ref-undo-1");
  check("  وإعادةُ نداء الإرجاع بمرجعه ترجع نفسَ الجواب", u1b.replayed === true && u1b.restored === 2);
  const u2 = await repo.undoPriceChange(ap.id, null, "كلّه", null);
  check("إرجاعُ الباقي: المعدَّلُ بيدٍ يبقى، والباقي لأصله", u2.restored === 3 && u2.kept_changed === 1 && prices().rc === 1666 && prices().re === 1300
    && dbNow().products.find((x) => x.id === "rd").sub_unit_price === 1500 && u2.status === "undone", JSON.stringify(u2));
  const det = await repo.priceChangeDetail(ap.id);
  const le = det.lines.find((l) => l.item === "re");
  let e3 = null; try { await repo.forcePriceLine(le.id, 1250, "الأصل"); } catch (e) { e3 = e; }
  check("«رجّعه للأصل» بسعرٍ غير الحاليّ يُرفض", e3?.message === "price_moved");
  await repo.forcePriceLine(le.id, 1300, "الأصل");
  check("  وبالحاليّ يرجع 1000", prices().re === 1000 && (await repo.priceEpoch()) === 4);
  // سلسلةٌ لمرتجع الكاشير: رفعان قائمان ⇒ «قبل» الأقدم.
  const s2 = { ...spec, p_categories: null, p_ids: ["rc"], skip_recent: false, pct_bp: 5000 };
  await repo.applyPriceChange(s2, (await repo.previewPriceChange(s2)).plan_hash, null, null);
  await repo.applyPriceChange(s2, (await repo.previewPriceChange(s2)).plan_hash, null, null);
  const prior = await repo.priceRaisePrior();
  check("السعرُ قبل الرفع: 1666→2500→3750 ⇒ «قبل» آخر رفع 2500 و«بعد» 3750", prior.rc?.o === 2500 && prior.rc?.w === 3750, JSON.stringify(prior.rc));
  // رفعٌ لاحق يحجز سطرَه ولا يُحسم «تغيّر».
  const fifty = (await repo.listPriceChanges()).filter((c) => c.title === "+50%").sort((a, b) => a.apply_seq - b.apply_seq);
  const first = fifty[0];
  let e4 = null; try { await repo.undoPriceChange(first.id, null, "x", null); } catch (e) { e4 = e; }
  check("إرجاعُ الأقدم ورفعٌ لاحقٌ قائمٌ على نفس المادة ⇒ later_batch (لا يضيع الأصل)", e4?.message === "later_batch" && prices().rc === 3750);
  // «رجّعه للأصل» على مجموعة: الأعضاءُ بنفس السعر يرجعون معاً، والمنشقُّ بسعرٍ آخر يبقى (كالخادم).
  const d0 = dbNow();
  d0.products.push(...["g1", "g2", "g3"].map((id) => P(id, `مجموعة ${id}`, null, { sell_price: 2000, purchase_price: 1000, category: "grp", bulk_group: "GY" })));
  mem.set(DB_KEY, JSON.stringify(d0));
  const sg = { ...spec, p_categories: null, p_ids: ["g1"], skip_recent: false };
  const ag = await repo.applyPriceChange(sg, (await repo.previewPriceChange(sg)).plan_hash, null, null);
  setPrice("g1", 2700); setPrice("g2", 2700); setPrice("g3", 2800);
  const ug = await repo.undoPriceChange(ag.id, null, "x", null);
  const gl = (await repo.priceChangeDetail(ag.id)).lines;
  const fg = await repo.forcePriceLine(gl.find((l) => l.item === "g1").id, 2700, "الأصل");
  check("فرضُ عضوٍ من مجموعة يرجّع الأعضاءَ بنفس السعر معاً ويترك المنشقّ", ug.kept_changed === 3 && fg.restored === 2
    && prices().g1 === 2000 && prices().g2 === 2000 && prices().g3 === 2800, JSON.stringify({ r: fg.restored, g: [prices().g1, prices().g2, prices().g3] }));
  // «زالت» سطرٌ قائم (كالخادم): 1000 → 1300 → 1750، تُحذف، يُرجَع اللاحق «جزئياً» والأقدمُ محجوز،
  // ثمّ تُسترجع فيُرجَعان بالترتيب ⇒ 1000 بالضبط.
  const push = (row) => { const d = dbNow(); d.products.push(row); mem.set(DB_KEY, JSON.stringify(d)); };
  push(P("k", "زالت", null, { sell_price: 1000, purchase_price: 500, category: "kk" }));
  const sk = { ...spec, p_categories: null, p_ids: ["k"], skip_recent: false, pct_bp: 3000 };
  const ka = await repo.applyPriceChange(sk, (await repo.previewPriceChange(sk)).plan_hash, null, null);
  const kb = await repo.applyPriceChange(sk, (await repo.previewPriceChange(sk)).plan_hash, null, null);
  const kept = dbNow().products.find((x) => x.id === "k");
  { const d = dbNow(); d.products = d.products.filter((x) => x.id !== "k"); mem.set(DB_KEY, JSON.stringify(d)); }
  const ukb = await repo.undoPriceChange(kb.id, null, "x", null);
  let ek = null; try { await repo.undoPriceChange(ka.id, null, "x", null); } catch (e) { ek = e; }
  check("«زالت»: إرجاعُ اللاحق والمادةُ محذوفة «جزئي»، والأقدمُ محجوزٌ به", kept.sell_price === 1750 && ukb.kept_missing === 1 && ukb.status === "partially_undone" && ek?.message === "later_batch", JSON.stringify({ k: kept.sell_price, ukb, e: ek?.message }));
  push(kept);
  await repo.undoPriceChange(kb.id, null, "x", null);
  const uka = await repo.undoPriceChange(ka.id, null, "x", null);
  check("  وبعد الاسترجاع: اللاحقُ ثمّ الأقدم ⇒ 1000 بالضبط", prices().k === 1000 && uka.status === "undone", JSON.stringify({ k: prices().k, s: uka.status }));
  // «قبل الرفع» من السلسلة المتّصلة الأخيرة: 1000 → 1300، يدويّ 2000، 2000 → 2500 ⇒ 2000.
  push(P("h", "سلسلة مقطوعة", null, { sell_price: 1000, purchase_price: 500, category: "hh" }));
  const sh = { ...spec, p_categories: null, p_ids: ["h"], skip_recent: false, pct_bp: 3000 };
  await repo.applyPriceChange(sh, (await repo.previewPriceChange(sh)).plan_hash, null, null);
  setPrice("h", 2000);
  const sh2 = { ...sh, pct_bp: 2500 };
  await repo.applyPriceChange(sh2, (await repo.previewPriceChange(sh2)).plan_hash, null, null);
  const ph = (await repo.priceRaisePrior()).h;
  check("السعرُ قبل الرفع بعد تعديلٍ يدويّ بين رفعين: 2000 لا 1000", ph?.o === 2000 && ph?.w === 2500, JSON.stringify(ph));
  // مفردٌ أُطفئ بعد الرفع: مادتُه قائمة ⇒ «تغيّر» لا «زالت» (كالخادم) — وإلا بقي الرفعُ «جزئياً»
  // للأبد، ويُعاد إرجاعُه، ويحجز ما قبله.
  push(P("so", "مفرد أُطفئ", null, { sell_price: 4500, purchase_price: 3000, category: "so", has_sub_unit: true, sub_unit_price: 1500, units_per_box: 3 }));
  const sso = { ...spec, p_categories: null, p_ids: ["so"], skip_recent: false };
  const aso = await repo.applyPriceChange(sso, (await repo.previewPriceChange(sso)).plan_hash, null, null);
  { const d = dbNow(); const x = d.products.find((q) => q.id === "so"); x.has_sub_unit = false; x.sub_unit_price = null; mem.set(DB_KEY, JSON.stringify(d)); }
  const uso = await repo.undoPriceChange(aso.id, null, "x", null);
  let eso = null; try { await repo.undoPriceChange(aso.id, null, "x", null); } catch (e) { eso = e; }
  check("مفردٌ أُطفئ ثمّ إرجاع: «تغيّر» لا «زالت»، والرفعُ «مرجوع»، وإرجاعٌ ثانٍ لا شيء له", uso.kept_changed === 1 && uso.kept_missing === 0 && uso.status === "undone" && eso?.message === "nothing_to_undo",
    JSON.stringify({ uso, e: eso?.message }));
  // حصّةٌ ممتلئة: الرفعُ كلُّه أو لا شيء — أسعارُ الخدمات لا تُكتب قبل حفظ سجلّه.
  const ssv = { ...spec, products: false, services: true, p_categories: null, s_categories: null, s_ids: null, skip_recent: false };
  const pv0 = await repo.previewPriceChange(ssv);
  const n0 = (await repo.listPriceChanges()).length;
  quotaFull = true;
  let eq = null; try { await repo.applyPriceChange(ssv, pv0.plan_hash, null, null); } catch (e) { eq = e; }
  quotaFull = false;
  const pv1 = await repo.previewPriceChange(ssv);
  const same = pv0.lines.length > 0 && pv0.lines.every((l) => pv1.lines.find((x) => x.id === l.id)?.o === l.o);
  check("حصّةٌ ممتلئة: الرفعُ يرمي، وأسعارُ الخدمات كما كانت، ولا سجلَّ نصفيّ", eq !== null && same && (await repo.listPriceChanges()).length === n0,
    JSON.stringify({ e: eq?.name, same, n0 }));
}

console.log("▸ 0227 — تصنيفاتُ السحوبات (مرآةُ expense_categories_guard)");
{
  mem.delete("vp_demo_expense_categories"); mem.delete("vp_demo_expenses"); mem.delete("vp_demo_audit");
  const code = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e.message; } };
  const hint = async (fn) => { try { await fn(); return "ok"; } catch (e) { return `${e.code}|${e.hint ?? ""}`; } };
  const audit = () => JSON.parse(mem.get("vp_demo_audit") || "[]").filter((a) => a.entity === "expense_categories");
  const qa = await repo.createExpenseCategory("  قاصة  ");
  check("التصنيفُ يُحفظ مطويَّ المسافات", qa.name === "قاصة" && qa.archived_at === null && (await repo.listExpenseCategories()).length === 1);
  check("  وتوأمُ التاء المربوطة يُرفض («قاصه»)", (await code(() => repo.createExpenseCategory("قاصه"))) === "expense_category_twin");
  check("  وبعلامة اتجاهٍ خفية كذلك", (await code(() => repo.createExpenseCategory("قا\u200fصة"))) === "expense_category_twin");
  check("  والرفضُ يحمل تلميحَ الخادم حرفاً (P0001 + hint)", (await hint(() => repo.createExpenseCategory("قاصه"))) === "P0001|أكو تصنيف بنفس الاسم (يمكن مؤرشف) — استعمله أو رجّعه من المؤرشفة");
  check("أسماءُ النظام محجوزة: مرتجع، Payroll ، «سحب  مخزن»، بدون تصنيف",
    (await code(() => repo.createExpenseCategory("مرتجع"))) === "expense_category_reserved"
    && (await code(() => repo.createExpenseCategory("Payroll "))) === "expense_category_reserved"
    && (await code(() => repo.createExpenseCategory("سحب  مخزن"))) === "expense_category_reserved"
    && (await code(() => repo.createExpenseCategory("بدون تصنيف"))) === "expense_category_reserved");
  check("  و«سحب» وحدَه ليس محجوزاً (تصنيفٌ بالإنتاج)", (await code(() => repo.createExpenseCategory("سحب"))) === "ok");
  check("اسمٌ فارغ أو أطولُ من ٤٠ يُرفض", (await code(() => repo.createExpenseCategory("   "))) === "expense_category_bad_name" && (await code(() => repo.createExpenseCategory("ب".repeat(41)))) === "expense_category_bad_name");
  const el = await repo.createExpenseCategory("كهرباء");
  await repo.setExpenseCategoryArchived(el.id, true);
  const elA = (await repo.listExpenseCategories()).find((c) => c.id === el.id);
  check("الأرشفةُ تختم، ومؤرشفٌ يبقى اسمُه محجوزاً", !!elA.archived_at && (await code(() => repo.createExpenseCategory("كهرباء"))) === "expense_category_twin");
  const again = await repo.setExpenseCategoryArchived(el.id, true);
  check("  وأرشفةٌ ثانية تبقي الختمَ الأوّل", again.archived_at === elA.archived_at);
  await repo.setExpenseCategoryArchived(el.id, false);
  check("  والاسترجاعُ يفرّغه", (await repo.listExpenseCategories()).find((c) => c.id === el.id).archived_at === null);
  check("التسميةُ إلى توأمٍ تُرفض، وإلى نفس المفتاح تمرّ", (await code(() => repo.renameExpenseCategory(el.id, "قاصه"))) === "expense_category_twin" && (await code(() => repo.renameExpenseCategory(qa.id, "قاصه"))) === "ok");
  check("  وتصنيفٌ غيرُ موجود يرمي (لا «انحفظ» على لا شيء)", (await code(() => repo.renameExpenseCategory("nope", "x"))) === "no_row_updated" && (await code(() => repo.setExpenseCategoryArchived("nope", true))) === "no_row_updated");
  const kinds = audit().map((a) => `${a.action}:${Object.keys(a.details.__changed ?? {}).join("+") || "-"}`).join(",");
  check("سطرُ تدقيقٍ كما يكتبه audit_all (الإنشاء، الأرشفة، الاسترجاع، التسمية)", kinds.split(",").filter((k) => k.startsWith("INSERT")).length === 3 && kinds.includes("UPDATE:archived_at") && kinds.includes("UPDATE:name"), kinds);
  check("  والأرشفةُ الثانية بلا سطر (لا شيءَ تغيّر)", audit().filter((a) => a.action === "UPDATE" && a.details.__changed?.archived_at).length === 2);
  const ex = await repo.addExpense({ amount: 1000, description: "قاصة اليوم", category: "قاصه", category_id: qa.id, method: "cash", spent_at: new Date().toISOString() });
  check("سحبٌ بتصنيفه يُحفظ بمعرّفه ونصّه", ex.category_id === qa.id && ex.category === "قاصه");
  check("  وسحبٌ يشير لتصنيفٍ غيرِ موجود يُرفض (مرآةُ المفتاح المركَّب)", (await code(() => repo.addExpense({ amount: 5, description: "x", category_id: "ghost", spent_at: new Date().toISOString() }))).includes("expenses_category_fk"));
  await repo.setExpenseCategoryArchived(el.id, true);
  check("  وبتصنيفٍ مؤرشف يمرّ (المفتاحُ لا يعرف الأرشفة — الواجهةُ لا تعرضه)", (await code(() => repo.addExpense({ amount: 5, description: "x", category_id: el.id, spent_at: new Date().toISOString() }))) === "ok");
  const active = async () => (await repo.listExpenseCategories()).filter((c) => !c.archived_at).length;
  for (let i = await active(); i < 60; i++) await repo.createExpenseCategory(`تصنيف ${i}`);
  check("سقفُ ٦٠ تصنيفاً فعّالاً (المؤرشفُ لا يُعدّ — «كهرباء» مؤرشف)", (await code(() => repo.createExpenseCategory("جديد"))) === "expense_categories_full" && (await active()) === 60);
  check("  والتسميةُ لا يحدّها السقف", (await code(() => repo.renameExpenseCategory(qa.id, "قاصة المحل"))) === "ok");
  check("  والاسترجاعُ فوق الستّين يُرفض بتلميح الخادم", (await hint(() => repo.setExpenseCategoryArchived(el.id, false))) === "P0001|وصلتوا ٦٠ تصنيفاً فعّالاً — أرشفوا ما لا تستعملونه");
  const someId = (await repo.listExpenseCategories()).find((c) => c.name === "تصنيف 5").id;
  await repo.setExpenseCategoryArchived(someId, true);
  check("  والأرشفةُ تُفرغ مكاناً كما يقول التلميح", (await code(() => repo.createExpenseCategory("جديد"))) === "ok");
  check("حذفُ سحبٍ غيرِ موجود يرمي (لا «انحذف» على لا شيء)", (await code(() => repo.deleteExpense("ghost-exp"))) === "no_row_updated");
  await repo.deleteExpense(ex.id);
  check("  والموجودُ ينحذف", !(await repo.listExpenses()).some((x) => x.id === ex.id));
  mem.delete("vp_demo_expense_categories"); mem.delete("vp_demo_expenses"); mem.delete("vp_demo_audit");
}

console.log("▸ 0228 — سعرُ المتجر بشرطه (مرآةُ store_set_price)");
{
  const db = JSON.parse(mem.get(DB_KEY) || "{}");
  db.products = db.products ?? [];
  db.products.push({ id: "sp-1", name: "سعر المتجر", barcode: "880228", stock: 3, purchase_price: 1000, sell_price: 12000, created_at: new Date().toISOString() },
    { id: "sp-farm", name: "علف حقل", barcode: "880229", stock: 3, purchase_price: 1000, sell_price: 5000, farm_id: "farm-x", created_at: new Date().toISOString() });
  mem.set(DB_KEY, JSON.stringify(db));
  const code = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e.message; } };
  const priceOf = (id) => JSON.parse(mem.get(DB_KEY)).products.find((p) => p.id === id).sell_price;
  check("بما رآه: 12000 ⇒ 13500", (await repo.setStorePrice("sp-1", 13500, 12000)) === 13500 && priceOf("sp-1") === 13500);
  check("  وسعرٌ تغيّر بعد الفتح لا يُكتب فوقه (price_moved)", (await code(() => repo.setStorePrice("sp-1", 9000, 12000))) === "price_moved" && priceOf("sp-1") === 13500);
  check("  ولا منتجَ حقل ولا مجهول، ولا سالبٌ ولا صفر", (await code(() => repo.setStorePrice("sp-farm", 1, 5000))) === "product_not_found"
    && (await code(() => repo.setStorePrice("nope", 1, 0))) === "product_not_found" && (await code(() => repo.setStorePrice("sp-1", -1, 13500))) === "bad_price"
    && (await code(() => repo.setStorePrice("sp-1", 0, 13500))) === "bad_price");
  const ph = (await repo.listPhotoProducts()).find((p) => p.id === "sp-1");
  check("photo_products بالتجريبيّ تعطي المجمَّعَ والانتهاء", ph && "pooled" in ph && "expiry_date" in ph);
}

console.log("▸ 0229 — أقسامُ المتجر والنشرُ بشروطه والصورةُ بوصفها (مرآةُ دوالّ الخادم)");
{
  const db0 = JSON.parse(mem.get(DB_KEY) || "{}");
  const now = new Date().toISOString();
  const mk = (id, extra) => ({ id, name: `منتج ${id}`, barcode: `9${id.replace(/\D/g, "")}`, stock: 3, purchase_price: 1000, sell_price: 5000, image_path: `c/${id}.jpg`, created_at: now, ...extra });
  db0.products = [mk("q1"), mk("q2"), mk("q3", { image_path: null }), mk("q4", { sell_price: 0 }), mk("q5", { expiry_date: "2020-01-01" }), mk("q6", { farm_id: "farm-x" }), mk("q7", { sell_price: 800 })];
  db0.storeSections = [];
  db0.storeProfile = { slug: "demo-sec", enabled: true, delivery_fee: 0, min_order: 0, updated_at: now };
  mem.set(DB_KEY, JSON.stringify(db0));
  const code = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e.message; } };
  const dbNow = () => JSON.parse(mem.get(DB_KEY));
  const prod = (id) => dbNow().products.find((p) => p.id === id);

  const s1 = await repo.saveStoreSection(null, "أكل قطط");
  const s2 = await repo.saveStoreSection(null, "  شامبو   ");
  check("قسمان: الاسمُ مطويُّ المسافات، والثاني آخرَ القائمة", s2.name === "شامبو" && s2.sort === s1.sort + 1);
  check("  والتوأمُ بعد التطبيع مرفوض، والفارغُ والطويلُ كذلك",
    (await code(() => repo.saveStoreSection(null, "اكل  قطط"))) === "section_twin"
    && (await code(() => repo.saveStoreSection(null, "  "))) === "section_bad_name"
    && (await code(() => repo.saveStoreSection(null, "ق".repeat(41)))) === "section_bad_name");
  await repo.reorderStoreSections([s2.id, s1.id]);
  check("ترتيبُ الأقسام بالقائمة الكاملة", (await repo.listStoreSections()).map((x) => x.id).join() === [s2.id, s1.id].join());
  check("  والقائمةُ الناقصة ترفض كلَّها (sections_stale)", (await code(() => repo.reorderStoreSections([s1.id]))) === "sections_stale");

  const a = await repo.assignStoreSection(["q1", "q2", "q6"], s1.id);
  check("الإدراج: منتجا العيادة يدخلان آخرَ القسم بترتيب القائمة، ومنتجُ الحقل لا", a.changed === 2
    && prod("q1").store_section_id === s1.id && prod("q1").store_sort === 1 && prod("q2").store_sort === 2 && !prod("q6").store_section_id);
  check("  وإعادةُ الإدراج بنفس القسم لا تلمس شيئاً", (await repo.assignStoreSection(["q1"], s1.id)).changed === 0);
  check("  ولا منتجَ مجهول ولا قسمَ مجهول", (await code(() => repo.assignStoreSection(["nope"], s1.id))) === "product_not_found"
    && (await code(() => repo.assignStoreSection(["q1"], "nope"))) === "section_not_found");
  await repo.reorderSectionProducts(s1.id, ["q2", "q1"]);
  check("ترتيبُ القسم يقلب الاثنين", prod("q2").store_sort === 1 && prod("q1").store_sort === 2);
  check("  وقائمةٌ فيها منتجٌ مو بالقسم ترفض كلَّها (order_stale)", (await code(() => repo.reorderSectionProducts(s1.id, ["q3", "q1"]))) === "order_stale");

  const pub = await repo.storePublish(["q1", "q2", "q3", "q4", "q5", "q6"], true);
  check("النشرُ بشروطه: صورة + سعر + غيرُ منتهٍ، والمتخطّى بسببه", pub.changed === 2 && pub.skipped_no_photo === 1 && pub.skipped_no_price === 1 && pub.skipped_expired === 1,
    JSON.stringify(pub));
  check("  ومنتجُ الحقل لا يُلمس ولا يُعدّ", !prod("q6").store_visible);
  check("  والمنشورُ أصلاً لا يُعدّ، والإخفاءُ بلا شرط", (await repo.storePublish(["q1"], true)).changed === 0 && (await repo.storePublish(["q1"], false)).changed === 1);
  await repo.storePublish(["q1", "q7"], true);

  const cat = await repo.storeCatalogPublic("demo-sec", 100, 0);
  check("كتلوجُ الزبون: قسمُه بترتيبه اليدويّ، و«بلا قسم» آخراً", cat.map((c) => c.id).join() === "q2,q1,q7" && cat[0].section_id === s1.id && cat[2].section_id === null,
    JSON.stringify(cat.map((c) => [c.id, c.section_id])));
  const front = await repo.storeFrontPublic("demo-sec");
  check("  والأقسامُ مع store_front: ما فيه معروضٌ وحده بعدده", JSON.stringify(front?.sections) === JSON.stringify([{ id: s1.id, name: "أكل قطط", n: 2 }]), JSON.stringify(front?.sections));
  await repo.archiveStoreSection(s1.id, true);
  const cat2 = await repo.storeCatalogPublic("demo-sec", 100, 0);
  check("أرشفةُ القسم: يختفي من الزبون، ومنتجاتُه تنزل لـ«بلا قسم» وتبقى مربوطة",
    (await repo.storeFrontPublic("demo-sec"))?.sections.length === 0 && cat2.every((c) => c.section_id === null) && prod("q1").store_section_id === s1.id);
  check("  وقسمٌ جديدٌ باسم المؤرشف يُرفض بتلميح «رجّعه»", (await code(() => repo.saveStoreSection(null, "أكل قطط"))) === "section_twin_archived");
  await repo.archiveStoreSection(s1.id, false);
  check("  والاسترجاعُ يعيده آخرَ القائمة", (await repo.listStoreSections()).filter((x) => !x.archived_at).map((x) => x.id).join() === [s2.id, s1.id].join());

  const meta = { v: 1, path: "c1/q1-abc123.jpg", thumb: "c1/q1-abc123.thumb.jpg", w: 1600, h: 1200, bytes: 300000, src: "camera" };
  await repo.setProductImage("q1", meta.path, meta);
  check("الصورةُ بوصفها بنداءٍ واحد", prod("q1").image_path === meta.path && prod("q1").image_meta?.thumb === meta.thumb);
  check("  ووصفٌ يصف صورةً أخرى يُرفض", (await code(() => repo.setProductImage("q1", "c1/other.jpg", meta))) === "bad_image_meta");
  check("  ومصغّرٌ ليس بقاعدة الخادم يُرفض", (await code(() => repo.setProductImage("q1", meta.path, { ...meta, thumb: "c1/other.thumb.jpg" }))) === "bad_image_meta");
  /* التجريبيُّ مسارُه الصورةُ مضمَّنة: قياسُ الوصف بها كان يرفض كلَّ صورةٍ تجريبياً بصمت
   * (السقفُ ١٠٢٤ بايت والصورةُ عشراتُ الكيلوبايتات) — أمسكه الفحصُ الحيّ لا هذا الملفّ. */
  const big = "data:image/jpeg;base64," + "A".repeat(60000), bigThumb = "data:image/jpeg;base64," + "B".repeat(9000);
  await repo.setProductImage("q1", big, { ...meta, path: big, thumb: bigThumb, src: "album" });
  check("  وصورةٌ تجريبيةٌ مضمَّنة (٦٠ كيلو) تُحفظ بوصفها ومصغّرها", prod("q1").image_path === big && prod("q1").image_meta?.thumb === bigThumb);
  check("  وسقفُ الوصف ما زال يمسك الحشوَ خارج المسار",
    (await code(() => repo.setProductImage("q1", big, { ...meta, path: big, thumb: bigThumb, edits: ["x".repeat(1100)] }))) === "bad_image_meta");
  await repo.setProductImage("q1", "library/x.jpg", null);
  check("  وصورةٌ بلا وصف (المكتبة) تمسح الوصفَ القديم — وصفٌ يتيمٌ يكذب", prod("q1").image_path === "library/x.jpg" && prod("q1").image_meta === null);
  const ph = (await repo.listPhotoProducts()).find((p) => p.id === "q7");
  check("photo_products بالتجريبيّ: القسمُ والترتيبُ والتوفّرُ و«تحت الكلفة» (800 < 1000)",
    ph && "store_section_id" in ph && "store_sort" in ph && ph.available === true && ph.below_cost === true);
}

console.log(`\n${fails ? "✗" : "✓"} repo-demo-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
