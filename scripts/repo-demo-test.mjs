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
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {} };
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

console.log(`\n${fails ? "✗" : "✓"} repo-demo-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
