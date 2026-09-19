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
/* ── ربطُ رمزٍ بمنتجٍ قائم (بابُ فاتورة الشراء للرمز المجهول) ───────────────
 * المستلمُ بيده العلبةُ وفاتورةُ المورّد: رمزٌ لا يعرفه المخزن إمّا لمادّةٍ عنده
 * برمزٍ ثانٍ — فيُربط فتلقاها المسحةُ الجاية — وإمّا لمادّةٍ جديدة. والربطُ رمزٌ
 * **إضافيّ**: الأساسيُّ لا يُمسّ، ورمزُ غيرِه يُرفض، ويُفكّ من نموذج التعديل. */
console.log("\n▸ attachProductCode — رمزٌ إضافيّ يُربط، ورمزُ غيرِه يُرفض");
{
  seed([P("a", "أموكسيسيلين", "247"), P("b", "علف", "8888")]);
  const upd = await repo.attachProductCode("a", "6970967772736");
  check("الرمزُ الجديد يدخل الرموزَ الإضافية", (upd.alt_codes ?? []).includes("6970967772736"));
  check("  والأساسيُّ لا يُمسّ", upd.barcode === "247");
  check("  والمسحةُ الجاية تلقاه", (await repo.getProductByBarcode("6970967772736"))?.id === "a");
  check("  ولا يُكرَّر بربطٍ ثانٍ", ((await repo.attachProductCode("a", "6970967772736")).alt_codes ?? []).filter((c) => c === "6970967772736").length === 1);
  check("ورمزٌ يملكه غيرُه يُرفض (لا سرقةَ رمز)", await repo.attachProductCode("b", "247").then(() => false, () => true));
  check("  ورمزٌ فارغٌ يُرفض", await repo.attachProductCode("a", "   ").then(() => false, () => true));
  check("  ومنتجٌ غيرُ موجودٍ يُرفض", await repo.attachProductCode("zz", "5550001").then(() => false, () => true));
}

/* ── طيُّ الشركات المكرَّرة (مرآةُ 0195) ────────────────────────────────────── */
console.log("\n▸ mergeCompanies — كلُّ شيءٍ ينتقل، والحوضُ يُجمع");
{
  mem.set(DB_KEY, JSON.stringify({
    products: [P("p1", "دواء", "1", { company_id: "co2", section_id: "s2" })],
    companies: [{ id: "co1", name: "مكتب الأمير", created_at: "2026-01-01" }, { id: "co2", name: "مكتب الامير", created_at: "2026-02-01" }],
    companySections: [
      { id: "s1", company_id: "co1", name: "أدوية", pooled_stock: 10 },
      { id: "s2", company_id: "co2", name: "ادويه", pooled_stock: 5 },
      { id: "s3", company_id: "co2", name: "مستلزمات", pooled_stock: 0 },
    ],
    purchases: [{ id: "u1", company_id: "co2" }], purchaseItems: [],
    invoices: [], invoiceItems: [], generatedBarcodes: [],
    productsTrash: [{ id: "t1", row: { id: "t1", company_id: "co2", section_id: "s2" } }],
  }));
  const r = await repo.mergeCompanies("co1", ["co2"]);
  const cos = await repo.listCompanies();
  const secs = await repo.listCompanySections();
  const prod = (await repo.listProducts()).find((p) => p.id === "p1");
  check("النسخةُ راحت وبقيت واحدة", cos.length === 1 && cos[0].id === "co1", JSON.stringify(cos.map((c) => c.id)));
  check("  والمنتجُ صار للباقية", prod?.company_id === "co1");
  check("  والصنفُ المتشابهُ اندمج (صنفان لا ثلاثة)", secs.length === 2, secs.map((s) => s.name).join("،"));
  check("  وحوضُه جُمع (١٠ + ٥)", secs.find((s) => s.id === "s1")?.pooled_stock === 15);
  check("  والمنتجُ تبع الصنفَ الباقي", prod?.section_id === "s1");
  check("  والصنفُ الذي لا نظيرَ له انتقل كما هو", secs.find((s) => s.id === "s3")?.company_id === "co1");
  check("  وصورةُ المحذوف صُحِّحت (وإلا ما انستعاد)", r.companies === 1
    && JSON.parse(mem.get(DB_KEY)).productsTrash[0].row.company_id === "co1"
    && JSON.parse(mem.get(DB_KEY)).productsTrash[0].row.section_id === "s1");
  check("وطيُّ شركةٍ بنفسها يُرفض", await repo.mergeCompanies("co1", ["co1"]).then(() => false, () => true));
  check("  وشركةٌ غيرُ موجودة تُرفض", await repo.mergeCompanies("nope", ["co1"]).then(() => false, () => true));
}

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
  const AUDIT_KEY = /const DEMO_AUDIT_KEY = "([^"]+)"/.exec(readFileSync("src/lib/repo.ts", "utf8"))?.[1];
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

console.log(`\n${fails ? "✗" : "✓"} repo-demo-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
