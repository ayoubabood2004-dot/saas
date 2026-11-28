/* ============================================================================
 * فحصُ «وحدةُ المادّة يغيّرها الخادمُ وحده ومعها كلُّ رقمٍ بوحدتها» (0294، G11–G14، ٢٨/١١).
 *
 *   ١) unitChange.ts بسلوكه: الوحدةُ الفعليّة (مرآةُ `_unit_key`: الوزنُ أوّلاً، والمفردُ بلا عدد «بالعدد»)، ونوعُ التغيير، والنسبةُ من
 *      جواب الطبيب، والتقريبُ بالكسر التامّ نصفُه بعيداً عن الصفر (round بوستغريس — العائمُ يقرّب ٢٫٠٠٥ لـ٢٫٠٠).
 *   ٢) المرآةُ التجريبيّة (demoUnitChange) بأرقام قسم 0294 بالحزمة نفسِها: كيسٌ ⇒ كيلو، والمفردُ «بالقطعة»، وإطفاؤه، وتغييرُ عدده —
 *      الرصيدُ والمتوسّطُ وstock_qty سطر البيع والجرعاتُ وربطُها والوصفاتُ والدفعات، والرفضُ قبل أيّ كتابة، والدمجُ بين وحدتين،
 *      والكتابةُ المباشرة (products_unit_guard)، وعدّادُ الأسعار.
 *   ٣) التلميحُ حرفاً: كلُّ رفضٍ بالمرآة نصُّه نصُّ الهجرة (تلميحٌ ينحرف بطرفٍ يُقال للعيادة غيرَ ما يقوله الآخر).
 *
 *   node scripts/unit-change-test.mjs
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
const J = JSON.stringify;
const src = (f) => readFileSync(f, "utf8");
const DB_KEY = /DEMO_DB_KEY = "([^"]+)"/.exec(src("src/lib/demoKey.ts"))?.[1];
if (!DB_KEY) { console.error("✗ unit-change-test: ما انقرأ مفتاحُ المخزن التجريبيّ"); process.exit(1); }

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

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null; export const isSupabaseConfigured = false;",
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: [
      'export * from "./src/lib/repo.ts";',
      'export * as U from "./src/lib/unitChange.ts";',
      'export { changeProductUnit } from "./src/lib/unitChangeApi.ts";',
      'export { loadLots, saveLots } from "./src/lib/demoLots.ts";',
      'export { saveCounts } from "./src/lib/demoCounts.ts";',
      'export { demoDrugsList } from "./src/lib/demoClinicDrugs.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "unit-change-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "unit-change-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, U, changeProductUnit, loadLots, saveLots, saveCounts } = mod;
if (!repo || !U || !changeProductUnit) { console.error("✗ unit-change-test: ما انحمّلت الوحدات"); process.exit(1); }
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code ?? e.name; } };

/* ── ١) unitChange.ts ─────────────────────────────────────────────────────── */
console.log("▸ ١) الوحدةُ الفعليّة، ونوعُ التغيير، والنسبة، والتقريب");
{
  const u = U.unitOf;
  check("unitOf: بالوزن يغلب المفرد (صفٌّ متناقض)، والمفردُ بلا عددٍ «بالعدد»، والعددُ بثلاث منازل",
    J(u({ sold_by_weight: true, has_sub_unit: true, units_per_box: 10 })) === J({ weight: true, per: null })
    && J(u({ has_sub_unit: true, units_per_box: null })) === J({ weight: false, per: null })
    && J(u({ has_sub_unit: true, units_per_box: "12.5" })) === J({ weight: false, per: 12.5 })
    && J(u({})) === J({ weight: false, per: null }));
  check("unitKey مرآةُ _unit_key: w / n:10 / b", U.unitKey(u({ sold_by_weight: true })) === "w" && U.unitKey(u({ has_sub_unit: true, units_per_box: 10 })) === "n:10" && U.unitKey(u({})) === "b");
  const B = u({}), W = u({ sold_by_weight: true }), S10 = u({ has_sub_unit: true, units_per_box: 10 }), S20 = u({ has_sub_unit: true, units_per_box: 20 });
  check("unitKind: الوزنُ قبل كلّ شيء، ثمّ تشغيلُ المفرد وإطفاؤه وتغييرُ عدده، والباقي none",
    U.unitKind(B, W) === "weight" && U.unitKind(S10, W) === "weight" && U.unitKind(W, S10) === "weight" && U.unitKind(B, S10) === "sub_on"
    && U.unitKind(S10, B) === "sub_off" && U.unitKind(S10, S20) === "per" && U.unitKind(S10, S10) === "none" && U.unitKind(B, B) === "none");
  check("needsAnswer: الوزنُ وتشغيلُ المفرد وحدهما", U.needsAnswer("weight") && U.needsAnswer("sub_on") && !U.needsAnswer("sub_off") && !U.needsAnswer("per") && !U.needsAnswer("none"));
  const f = U.factorFor;
  check("factorFor: «١٥ كيلو بالكيس» ⇒ ١٥/١ إلى الوزن و١/١٥ منه؛ وجوابٌ ناقص أو صفر أو فوق مليون ⇒ null",
    J(f("weight", W, { size: 15 })) === J({ mul: 15, div: 1 }) && J(f("weight", B, { size: 15 })) === J({ mul: 1, div: 15 })
    && f("weight", W, { size: null }) === null && f("weight", W, { size: 0 }) === null && f("weight", W, { size: 2e6 }) === null && f("weight", W, { size: NaN }) === null);
  check("factorFor: تشغيلُ المفرد «علب» ⇒ ١/١ و«قطع» ⇒ ١/العدد وبلا جواب null؛ وإطفاؤه وتغييرُ عدده ١/١ بلا سؤال؛ ولا تغيير ⇒ null",
    J(f("sub_on", S10, { stockIn: "box" })) === J({ mul: 1, div: 1 }) && J(f("sub_on", S10, { stockIn: "sub" })) === J({ mul: 1, div: 10 })
    && f("sub_on", S10, {}) === null && J(f("sub_off", B, {})) === J({ mul: 1, div: 1 }) && J(f("per", S20, {})) === J({ mul: 1, div: 1 }) && f("none", B, {}) === null);
  const r = U.scaleRound;
  check("التقريب: نصفٌ تامّ بعيداً عن الصفر بالموجب والسالب (٢٫٠٠٥ ⇒ ٢٫٠١ لا ٢٫٠٠ العائم، −٢٫٠٠٥ ⇒ −٢٫٠١)",
    r(2.005, 1, 1, 2) === 2.01 && r(-2.005, 1, 1, 2) === -2.01 && r(0.0005, 1, 1, 3) === 0.001 && r(-0.0005, 1, 1, 3) === -0.001,
    J([r(2.005, 1, 1, 2), r(-2.005, 1, 1, 2), r(0.0005, 1, 1, 3), r(-0.0005, 1, 1, 3)]));
  check("  والكسرُ قبل التقريب: ٧ كيلو ÷ ١٥ = ٠٫٤٦٧، و١٠٠٠ ÷ ١٥ = ٦٦٫٦٧، و١٥٠ × ١٠ = ١٥٠٠",
    r(7, 1, 15, 3) === 0.467 && U.scalePrice(1000, { mul: 15, div: 1 }) === 66.67 && U.scaleCost(150, { mul: 1, div: 10 }) === 1500);
  check("scaleMin: يُرفع للأعلى وموجبٌ يبقى موجباً (٥ قطع ⇒ علبةٌ واحدة لا صفر)، والصفرُ صفر",
    U.scaleMin(2, { mul: 15, div: 1 }) === 30 && U.scaleMin(5, { mul: 1, div: 10 }) === 1 && U.scaleMin(30, { mul: 1, div: 15 }) === 2 && U.scaleMin(0, { mul: 15, div: 1 }) === 0);
}

/* ── ٢) المرآةُ التجريبيّة بأرقام قسم 0294 ───────────────────────────────────── */
console.log("▸ ٢) المرآة: نفسُ أرقام قسم 0294 بالحزمة");
const base = { barcode: null, company_id: null, section_id: null, category: null, subcategory: null, expiry_date: null, pooled: false,
  sub_unit_name: null, sub_unit_price: null, sold_by_weight: false, has_sub_unit: false, units_per_box: null, alt_codes: [], bulk_group: null,
  clinic_id: "default", created_at: "2026-11-01T00:00:00Z", min_stock: 0, avg_cost: null };
const P = (id, name, stock, sell, buy, extra = {}) => ({ ...base, id, name, stock, sell_price: sell, purchase_price: buy, ...extra });
const seed = () => {
  mem.clear();
  const products = [
    P("u01", "Royal Canin", 3, 75000, 60000, { avg_cost: 60000, min_stock: 2, barcode: "K294RC" }),
    P("u02", "Metacam", 4.6, 3000, 2000, { avg_cost: 2000, has_sub_unit: true, units_per_box: 10, sub_unit_name: "حبة", sub_unit_price: 300 }),
    P("u03", "قفازات", 120, 250, 150, { avg_cost: 150, min_stock: 1 }),
    P("u04", "Mini", 6.5, 5000, 4000, { sold_by_weight: true }), P("u05", "Mini", 3, 75000, 60000, { barcode: "K294MINI" }),
    P("u06", "Amoxi", 4.6, 3000, 2000, { has_sub_unit: true, units_per_box: 10, sub_unit_name: "كبسولة", sub_unit_price: 300 }),
    P("u07", "Amoxi", 3.25, 5000, 4000, { has_sub_unit: true, units_per_box: 20, sub_unit_name: "كبسولة", sub_unit_price: 250, barcode: "K294AMX" }),
    P("u08", "ضماد", 2, 1000, 500), P("u09", "ضماد", 3, 1000, 500, { barcode: "K294BAN" }),
    P("u11", "مربوط أ", 2, 1000, 500, { bulk_group: "grp_294" }), P("u12", "مربوط ب", 2, 1000, 500, { bulk_group: "grp_294" }),
    P("u14", "بجرد", 5, 1000, 500), P("u15", "مستهلك", 5, 1000, 500),
  ];
  mem.set(DB_KEY, J({
    products, companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [{ id: "i1", total: 75000, created_at: "2026-11-02T00:00:00Z" }],
    invoiceItems: [{ id: "l1", invoice_id: "i1", product_id: "u01", name: "Royal Canin", qty: 1, unit_price: 75000, unit_cost: 60000, line_total: 75000, stock_qty: 1, pooled_qty: 0 }],
    generatedBarcodes: [], productsTrash: [],
    doseCharges: [
      { id: "c1", entry_id: "e1", pet_id: "pt", drug_id: "b2", product_id: "u02", name: "Meloxicam", price: 300, stock_qty: 0.1, dose_qty: 1, dose_unit: "sub", given_at: "2026-11-02T00:00:00Z", status: "pending", invoice_id: null, billed_at: null, voided_at: null, created_at: "2026-11-02T00:00:00Z" },
      { id: "c2", entry_id: "e2", pet_id: "pt", drug_id: "b3", product_id: "u03", name: "Glove", price: 250, stock_qty: 1, dose_qty: 1, dose_unit: "box", given_at: "2026-11-02T00:00:00Z", status: "pending", invoice_id: null, billed_at: null, voided_at: null, created_at: "2026-11-02T00:00:00Z" },
      { id: "c3", entry_id: "e3", pet_id: "pt", drug_id: null, product_id: "u06", name: "Amoxi", price: 300, stock_qty: 0.1, dose_qty: 1, dose_unit: "sub", given_at: "2026-11-02T00:00:00Z", status: "pending", invoice_id: null, billed_at: null, voided_at: null, created_at: "2026-11-02T00:00:00Z" },
    ],
    serviceRecipes: [
      { id: "d3", service_id: "s1", product_id: "u01", product_name: "Royal Canin", qty_m: "500", unit: "stock", position: 0, updated_at: "2026-11-01T00:00:00Z", updated_by: null },
      { id: "d4", service_id: "s1", product_id: "u02", product_name: "Metacam", qty_m: "2000", unit: "sub", position: 1, updated_at: "2026-11-01T00:00:00Z", updated_by: null },
      { id: "d5", service_id: "s1", product_id: "u03", product_name: "قفازات", qty_m: "2000", unit: "stock", position: 2, updated_at: "2026-11-01T00:00:00Z", updated_by: null },
    ],
    consumption: [{ id: "f2", product_id: "u15" }],
    priceSeq: 7,
  }));
  saveLots([{ id: "a3", product_id: "u01", qty: 3, received_qty: 3, expiry_date: null, received_at: "2026-11-01T00:00:00Z", source: "purchase", purchase_id: null, company_name: null, note: null }]);
  saveCounts([{ id: "f1", product_id: "u14", product_name: "بجرد", system_qty: 5, counted_qty: 4, unit_cost: 500, reason: "shortage", status: "pending" }]);
  mem.set("vp_demo_clinic_drugs_default", J([
    { id: "b1", name: "Royal Feed", family: "other", in_mine: false, pos: null, archived_at: null, dose_price: null, dose_qty: 0.2, dose_unit: "box", product_id: "u01" },
    { id: "b2", name: "Meloxicam", family: "other", in_mine: false, pos: null, archived_at: null, dose_price: null, dose_qty: 1, dose_unit: "sub", product_id: "u02" },
    { id: "b3", name: "Glove", family: "other", in_mine: false, pos: null, archived_at: null, dose_price: null, dose_qty: 1, dose_unit: "box", product_id: "u03" },
  ]));
};
const db = () => JSON.parse(mem.get(DB_KEY));
const row = (id) => db().products.find((p) => p.id === id);
const drug = (id) => JSON.parse(mem.get("vp_demo_clinic_drugs_default")).find((d) => d.id === id);
const charge = (id) => db().doseCharges.find((c) => c.id === id);
const recipe = (id) => db().serviceRecipes.find((r) => r.id === id);
const seenOf = (p) => ({ sold_by_weight: !!p.sold_by_weight, has_sub_unit: !!p.has_sub_unit, units_per_box: p.units_per_box ?? null,
  sell_price: p.sell_price, purchase_price: p.purchase_price, sub_unit_price: p.sub_unit_price ?? null });
const to = (w, s, n, sell, buy, min, sub = null, name = null) => ({ sold_by_weight: w, has_sub_unit: s, units_per_box: n, sub_unit_name: name, sub_unit_price: sub, sell_price: sell, purchase_price: buy, min_stock: min });
const conv = (id, t, mul, div, seen) => changeProductUnit(id, seen ?? seenOf(row(id)), t, mul, div);

seed();
{
  const r = await conv("u01", to(true, false, null, 5000, 4000, 30), 15, 1);
  const p = row("u01");
  check("الوزن: ٣ أكياس ⇒ ٤٥ كيلو، والمتوسّطُ ٤٬٠٠٠، والأسعارُ والحدُّ كما كُتبت", r.stock === 45 && p.sold_by_weight === true && p.stock === 45
    && p.avg_cost === 4000 && p.sell_price === 5000 && p.purchase_price === 4000 && p.min_stock === 30, J(p));
  check("  وstock_qty سطر البيع القديم ١ ⇒ ١٥ (الكميةُ والمالُ كما هما)، والدفعةُ ٤٥",
    J(db().invoiceItems[0]) === J({ id: "l1", invoice_id: "i1", product_id: "u01", name: "Royal Canin", qty: 1, unit_price: 75000, unit_cost: 60000, line_total: 75000, stock_qty: 15, pooled_qty: 0 })
    && loadLots().find((l) => l.id === "a3")?.qty === 45 && loadLots().find((l) => l.id === "a3")?.received_qty === 45, J([db().invoiceItems[0], loadLots()]));
  check("  وربطُ الجرعة ٠٫٢ كيس ⇒ ٣ كيلو، والوصفةُ ٠٫٥ ⇒ ٧٫٥، وعدّادُ الأسعار زاد",
    drug("b1").dose_unit === "box" && drug("b1").dose_qty === 3 && recipe("d3").unit === "stock" && recipe("d3").qty_m === "7500" && db().priceSeq === 8,
    J([drug("b1"), recipe("d3"), db().priceSeq]));
}
{
  const p0 = row("u01");
  check("الرفض: الوحدةُ نفسُها ⇒ unit_no_change، ووحدةٌ رآها غيرَها ⇒ unit_seen_changed، وسعرٌ رآه غيرَه ⇒ price_moved",
    await errOf(() => conv("u01", to(true, false, null, 5000, 4000, 30), 1, 1)) === "unit_no_change"
    && await errOf(() => conv("u01", to(false, false, null, 75000, 60000, 2), 1, 15, { ...seenOf(p0), sold_by_weight: false })) === "unit_seen_changed"
    && await errOf(() => conv("u01", to(false, false, null, 75000, 60000, 2), 1, 15, { ...seenOf(p0), sell_price: 75000 })) === "price_moved");
  check("  ونسبةٌ صفر ⇒ unit_factor_bad، وتشغيلُ المفرد بنسبةٍ غيرِ ١/١ ولا ١/العدد كذلك",
    await errOf(() => conv("u01", to(false, false, null, 75000, 60000, 2), 0, 15)) === "unit_factor_bad"
    && await errOf(() => conv("u03", to(false, true, 10, 2500, 1500, 1, 250), 1, 3)) === "unit_factor_bad");
  check("  والمربوطةُ والجردُ المعلَّق ودفترُ المستهلكات ⇒ يُرفض التحويلُ بالنسبة بسببه",
    await errOf(() => conv("u11", to(true, false, null, 100, 50, 0), 10, 1)) === "unit_grouped"
    && await errOf(() => conv("u14", to(true, false, null, 100, 50, 0), 10, 1)) === "unit_count_pending"
    && await errOf(() => conv("u15", to(true, false, null, 100, 50, 0), 10, 1)) === "unit_consumption");
  check("  ولا شيءَ كُتب بالرفض (الرصيدُ ٤٥ والوحدةُ بالوزن والعدّادُ ٨)", row("u01").stock === 45 && row("u01").sold_by_weight === true && db().priceSeq === 8);
  check("  والمربوطةُ بنسبة ١ (المفردُ والرصيدُ علب) تمرّ", (await conv("u11", to(false, true, 6, 1000, 500, 0, 200, "قطعة"), 1, 1)).stock === 2);
}
{
  await conv("u03", to(false, true, 10, 2500, 1500, 1, 250, "قفاز"), 1, 10);
  const p = row("u03");
  check("تشغيلُ المفرد «بالقطعة»: ١٢٠ ⇒ ١٢ علبة، والمتوسّطُ ١٥٠ ⇒ ١٬٥٠٠، والسعران كما كُتبا",
    p.stock === 12 && p.has_sub_unit === true && p.units_per_box === 10 && p.avg_cost === 1500 && p.sell_price === 2500 && p.sub_unit_price === 250, J(p));
  check("  وربطُ «قطعة» صار مفرداً بالكمية نفسِها، والمعلَّقةُ ١ ⇒ ٠٫١ علبة بالمفرد، والوصفةُ «٢» صارت مفرداً",
    drug("b3").dose_unit === "sub" && drug("b3").dose_qty === 1 && charge("c2").dose_unit === "sub" && charge("c2").stock_qty === 0.1 && charge("c2").dose_qty === 1
    && recipe("d5").unit === "sub" && recipe("d5").qty_m === "2000", J([drug("b3"), charge("c2"), recipe("d5")]));
}
{
  await conv("u02", to(false, false, null, 3000, 2000, 0), 1, 1);
  const p = row("u02");
  check("إطفاءُ المفرد: الرصيدُ ٤٫٦ كما هو، والمادّةُ بلا مفردٍ ولا سعرِه", p.stock === 4.6 && p.has_sub_unit === false && p.units_per_box === null && p.sub_unit_price === null, J(p));
  check("  والربطُ «١ حبّة» ⇒ «٠٫١ علبة»، والمعلَّقةُ مثلُه (مخصومُها ٠٫١ كما هو)، والوصفةُ «٢ حبّة» ⇒ ٠٫٢ علبة",
    drug("b2").dose_unit === "box" && drug("b2").dose_qty === 0.1 && charge("c1").dose_unit === "box" && charge("c1").dose_qty === 0.1 && charge("c1").stock_qty === 0.1
    && recipe("d4").unit === "stock" && recipe("d4").qty_m === "200", J([drug("b2"), charge("c1"), recipe("d4")]));
}
{
  const m1 = await errOf(() => repo.mergeProducts("u05", "u04"));
  const m2 = await errOf(() => repo.mergeProducts("u07", "u06"));
  check("الدمج: بالكيلو على بالعدد، وعلبةُ ١٠ على علبة ٢٠ ⇒ merge_unit_mismatch، والأربعُ حيّة", m1 === "merge_unit_mismatch" && m2 === "merge_unit_mismatch"
    && ["u04", "u05", "u06", "u07"].every((id) => !!row(id)), J([m1, m2]));
  let hint = "";
  try { await repo.mergeProducts("u05", "u04"); } catch (e) { hint = e.hint ?? ""; }
  check("  والتلميحُ يسمّي الوحدتين (بالكيلو، بالعدد)", hint.includes("بالكيلو") && hint.includes("بالعدد"), hint);
  check("  والوحدةُ نفسُها تندمج كما كانت (٢ + ٣ = ٥)", (await repo.mergeProducts("u09", "u08")).stock === 5);
  await conv("u06", to(false, true, 20, 3000, 2000, 0, 300, "كبسولة"), 1, 1);
  check("  وتغييرُ عدد المفرد (١٠ ⇒ ٢٠): المعلَّقةُ بالحبّة مخصومُها ١/٢٠ = ٠٫٠٥، ثمّ يمرّ الدمج (٤٫٦ + ٣٫٢٥ = ٧٫٨٥)",
    charge("c3").stock_qty === 0.05 && (await repo.mergeProducts("u07", "u06")).stock === 7.85, J(charge("c3")));
}
{
  check("الكتابةُ المباشرة: «بالوزن» ⇒ unit_server_only، والقيمُ نفسُها تمرّ، وتغييرُ عدد المفرد مباشرةً ⇒ unit_server_only",
    await errOf(() => repo.updateProduct("u09", { sold_by_weight: true })) === "unit_server_only"
    && await errOf(() => repo.updateProduct("u09", { sold_by_weight: false, has_sub_unit: false, units_per_box: null, name: "ضماد" })) === "قُبل"
    && await errOf(() => repo.updateProduct("u07", { units_per_box: 10 })) === "unit_server_only");
}

/* ── ٢ب) ما أمسكته المراجعةُ العدائيّة — بأرقام قسم ٧ب بالحزمة ─────────────────────────── */
console.log("▸ ٢ب) فاتورةُ الشراء القديمة، وفكُّ الدمج، وطلبُ المتجر، والجرعةُ بثلاث منازل، والوزنُ القديم، وترتيبُ رفض الدمج");
{
  const d = db();
  const pk = (id, per) => ({ id, name: `كارتون ${per}`, codes: [], per, purchase_price: null, sell_price: null });
  d.products.push(
    P("u30", "علف", 2, 75000, 60000, { avg_cost: 60000 }),
    P("u31", "كيس", 3, 1000, 500), P("u32", "كيس", 2, 1000, 500),
    P("u33", "توأم", 3, 1000, 500), P("u34", "توأم", 1, 1000, 500),
    P("u35", "متجر", 4, 1000, 500),
    P("u36", "ثلاثي", 2, 15000, 10000, { has_sub_unit: true, units_per_box: 3, sub_unit_name: "حبة", sub_unit_price: 5000 }),
    P("u37", "موزون قديم", 5, 5000, 4000, { sold_by_weight: true, has_sub_unit: true, units_per_box: 10, sub_unit_name: "حبة", sub_unit_price: 500 }),
    P("u38", "كراتين", 9, 1000, 500, { has_sub_unit: true, units_per_box: 10, sub_unit_name: "حبة", sub_unit_price: 100, packs: [pk("k2", 2), pk("k3", 3), pk("k4", 4)] }),
    P("u39", "كراتين", 9, 1000, 500, { has_sub_unit: true, units_per_box: 20, sub_unit_name: "حبة", sub_unit_price: 50, packs: [pk("k5", 5), pk("k6", 6)] }),
  );
  const pur = (id, total) => ({ id, clinic_id: "default", company_id: null, company_name: null, reference: null, total, item_count: 0, amount_paid: null,
    payment_method: null, status: "paid", notes: null, purchased_at: "2026-11-03T00:00:00Z", staff_id: null, created_at: "2026-11-03T00:00:00Z", discount: 0 });
  const item = (id, purchase_id, qty, price, sell) => ({ id, purchase_id, clinic_id: "default", product_id: "u30", barcode: null, name: "علف", category: null,
    qty, purchase_price: price, sell_price: sell, created_at: "2026-11-03T00:00:00Z" });
  d.purchases = [pur("g1", 120000)];
  d.purchaseItems = [item("g2", "g1", 2, 60000, 75000)];
  d.storeOrders = [{ id: "h1", order_no: "S294", customer_name: "زبون", customer_phone: "07700000294", items: [{ product_id: "u35", name: "متجر", qty: 1, price: 1000, total: 1000 }],
    subtotal: 1000, delivery_fee: 0, total: 1000, status: "new", invoice_id: null, decided_at: null, created_at: "2026-11-03T00:00:00Z" }];
  mem.set(DB_KEY, J(d));
  const drugs = JSON.parse(mem.get("vp_demo_clinic_drugs_default"));
  drugs.push({ id: "b4", name: "Tri", family: "other", in_mine: false, pos: null, archived_at: null, dose_price: null, dose_qty: 1, dose_unit: "sub", product_id: "u36" });
  mem.set("vp_demo_clinic_drugs_default", J(drugs));

  const line = (qty, price, sell) => [{ product_id: "u30", barcode: null, name: "علف", qty, purchase_price: price, sell_price: sell }];
  check("فاتورةُ الشراء القديمة: التحويلُ (كيسان ⇒ ٣٠ كيلو) يعلّم سطرَها",
    (await conv("u30", to(true, false, null, 5000, 4000, 0), 15, 1)).stock === 30 && (db().purchaseUnitMarks ?? []).includes("g2"), J(db().purchaseUnitMarks));
  let ph = "";
  const pe = await errOf(async () => { try { await repo.updatePurchase("g1", line(2, 60000, 75000), {}); } catch (e) { ph = e.hint ?? ""; throw e; } });
  check("  وتعديلُها ⇒ purchase_unit_changed يسمّي المادّة، ولا شيءَ تحرّك (الرصيدُ ٣٠ والسطرُ باقٍ)",
    pe === "purchase_unit_changed" && ph.includes("علف") && row("u30").stock === 30 && db().purchaseItems.some((x) => x.id === "g2"), J([pe, ph, row("u30").stock]));
  const d2 = db();
  d2.purchases.push(pur("g3", 60000));
  d2.purchaseItems.push(item("g4", "g3", 15, 4000, 5000));
  d2.products.find((x) => x.id === "u30").stock = 45;
  mem.set(DB_KEY, J(d2));
  check("  وفاتورةٌ بعد التحويل (بالكيلو) تتعدّل كما كانت، والرصيدُ ٤٥ كما هو",
    await errOf(() => repo.updatePurchase("g3", line(15, 4000, 5000), {})) === "قُبل" && row("u30").stock === 45, J(row("u30")));

  check("فكُّ الدمج: «كيس» يندمج بأخيه (٥) ثمّ يتحوّل الأصلُ (٧٥ كيلو)",
    (await repo.mergeProducts("u31", "u32")).stock === 5 && (await conv("u31", to(true, false, null, 100, 50, 0), 15, 1)).stock === 75);
  let rh = "";
  const re = await errOf(async () => { try { await repo.restoreProduct("u32"); } catch (e) { rh = e.hint ?? ""; throw e; } });
  check("  وفكُّه ⇒ restore_unit_changed يسمّي الاثنين، ولا شيءَ تحرّك (الأصلُ ٧٥ والتوأمُ بالسلّة)",
    re === "restore_unit_changed" && rh.includes("كيس") && row("u31").stock === 75 && !row("u32") && db().productsTrash.some((t) => t.id === "u32"), J([re, rh]));
  check("  وفكُّ دمجٍ بلا تحويل يمرّ كما كان (٣ + ١ ثمّ يرجع ١)",
    (await repo.mergeProducts("u33", "u34")).stock === 4 && (await repo.restoreProduct("u34")).stock === 1 && row("u33").stock === 3);

  check("طلبُ متجرٍ ينتظر بالمادّة ⇒ unit_store_pending", await errOf(() => conv("u35", to(true, false, null, 100, 50, 0), 15, 1)) === "unit_store_pending");
  const d3 = db(); d3.storeOrders[0].status = "rejected"; mem.set(DB_KEY, J(d3));
  check("  وبعد ما يُبتّ بيه يمرّ (٤ ⇒ ٦٠)", (await conv("u35", to(true, false, null, 100, 50, 0), 15, 1)).stock === 60);

  await conv("u36", to(false, false, null, 15000, 10000, 0), 1, 1);
  check("الجرعة: إطفاءُ مفردٍ بثلاثة ⇒ الحبّةُ ٠٫٣٣٣ علبة بثلاث منازل (لا ٠٫٣٣٣٣٣٣)", drug("b4").dose_unit === "box" && drug("b4").dose_qty === 0.333, J(drug("b4")));
  check("صفٌّ قديمٌ بالوزن عليه مفردٌ من قبل: يبقى بالوزن ⇒ unit_no_change (لا «إطفاءُ مفرد»)",
    await errOf(() => conv("u37", to(true, false, null, 5000, 4000, 0), 1, 1)) === "unit_no_change");
  check("ترتيبُ رفض الدمج كالخادم: وحدتان مختلفتان وكراتينُ فوق الأربعة ⇒ merge_unit_mismatch قبل merge_packs_overflow",
    await errOf(() => repo.mergeProducts("u38", "u39")) === "merge_unit_mismatch");
}

/* ── ٣) التلميحُ حرفاً ───────────────────────────────────────────────────────── */
console.log("▸ ٣) نصُّ كلّ رفضٍ بالمرآة نصُّ الهجرة");
{
  const sql = src("supabase/migrations/0294_unit_changes.sql");
  const demo = src("src/lib/demoUnitChange.ts");
  const sqlHint = (code) => new RegExp(`raise exception '${code}'[^;]*?hint = '([^']*)'`).exec(sql)?.[1] ?? null;
  const demoHintOf = (code) => new RegExp(`demoHint\\("${code}", "([^"]*)"\\)`).exec(demo)?.[1] ?? null;
  const codes = ["unit_forbidden", "unit_bad_request", "unit_product_gone", "unit_seen_changed", "price_moved", "unit_both", "unit_per_bad", "unit_price_bad",
    "unit_no_change", "unit_factor_bad", "unit_usd", "unit_farm", "unit_packs_weight", "unit_sub_codes", "unit_pooled", "unit_dual", "unit_packs", "unit_grouped",
    "unit_count_pending", "unit_consumption", "unit_old_debt", "unit_store_pending", "unit_server_only"];
  const bad = codes.filter((c) => !sqlHint(c) || sqlHint(c) !== demoHintOf(c)).map((c) => `${c}: «${sqlHint(c)}» ≠ «${demoHintOf(c)}»`);
  check(`كلُّ رمزٍ من ${codes.length} بتلميحه نفسِه بالطرفين`, bad.length === 0, bad.join(" | "));
  const mergeSql = /raise exception 'merge_unit_mismatch'[\s\S]*?format\('([^']*)'/.exec(sql)?.[1];
  const mergeDemo = /demoHint\("merge_unit_mismatch", `([^`]*)`\)/.exec(demo)?.[1]?.replace(/\$\{[^}]+\}/g, "%s").replace(/«%s» %s/g, "«%s» %s");
  check("  وتلميحُ الدمج بقالبه نفسِه (format بالخادم، وقالبُ نصٍّ بالمرآة)", !!mergeSql && mergeSql === mergeDemo, `${mergeSql} ≠ ${mergeDemo}`);
  const tplSql = (code) => new RegExp(`raise exception '${code}'[\\s\\S]*?format\\('([^']*)'`).exec(sql)?.[1] ?? null;
  const tplDemo = (code) => new RegExp(`demoHint\\("${code}", \`([^\`]*)\`\\)`).exec(demo)?.[1]?.replace(/\$\{ISO\([^}]*\)\}/g, "%s") ?? null;
  for (const code of ["purchase_unit_changed", "restore_unit_changed"]) {
    check(`  و${code} بقالبه نفسِه`, !!tplSql(code) && tplSql(code) === tplDemo(code), `${tplSql(code)} ≠ ${tplDemo(code)}`);
  }
}

console.log(fails ? `✗ unit-change-test: ${fails} فشل من ${fails + passes}` : `✓ unit-change-test: ${passes} فحصاً`);
process.exit(fails ? 1 : 0);
