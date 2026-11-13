/* ============================================================================
 * الجرعةُ بيع (0269) — فحصُ السلوك على المرآة التجريبيّة (الحزمةُ تفحص الخادمَ نفسَه، وdose-parity الحسابَ بالقاعدة):
 *   ١) الحسابُ الصِّرف (dosePlan/doseCharge): المكتوبُ يغلب، والصغرى من العلبة ÷ العدد، والدولارُ والمادّةُ الغائبة لا تُستعمل.
 *   ٢) الطبلة: الخطّةُ تُختم «تُحسب»، والإعطاءُ معلَّق، وإلغاؤه يُلغيه، وما بيع بالكاشير لا يُحسب، وإعادةُ ختم المعطاة لا تكرّره.
 *   ٣) البيع: المعلَّقُ بمفتاح الزبون أو بحيوانه، والبيعةُ تختمه وتخصم المادّة، والإعادةُ بالمرجع نفسِه بلا خصمٍ ثانٍ، وجهازٌ ثانٍ يُرفض.
 *   ٤) البابُ: الصلاحيةُ والمادّةُ والوحدة؛ وشاشةُ البيع بنصّها (السطرُ يرسل معلَّقَه، والكميةُ ثابتة، والفشلُ لا يُصمت).
 *
 *   node scripts/dose-billing-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
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
const built = await esbuild.build({
  stdin: {
    contents: `export { repo } from "./src/lib/repo.ts"; export * as B from "./src/lib/doseBilling.ts"; export * as API from "./src/lib/doseApi.ts";
      export { demoDrugsApply, demoDrugsList } from "./src/lib/demoClinicDrugs.ts"; export { persistMedicalEntries } from "./src/lib/medSync.ts";`,
    resolveDir: process.cwd(), loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent", mainFields: ["module", "main"],
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const tdir = mkdtempSync(join(tmpdir(), "dose-bill-"));
const file = join(tdir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href).finally(() => { try { rmSync(tdir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, B, API, demoDrugsApply, demoDrugsList, persistMedicalEntries } = M;

const codeOf = async (p) => { try { await p; return "ok"; } catch (e) { return String(e?.message ?? e); } };

console.log("▸ ١) الحسابُ الصِّرف — مرآةُ _dose_plan والمحفّز");
{
  check("الصغرى من سعر العلبة ÷ العدد × الكمّية، والمخصومُ بالعلبة", JSON.stringify(B.dosePlan(null, 2, "sub", 20000, null, 10)) === '{"price":4000,"stockQty":0.2}');
  check("  والمكتوبُ يغلب ويبقى المخصوم، والكمّيةُ الغائبةُ واحد، والصغرى المسعَّرةُ بسعرها",
    B.dosePlan(5000, 2, "sub", 20000, null, 10).price === 5000 && B.dosePlan(null, null, "box", 1000, null, null).stockQty === 1 && B.dosePlan(null, 3, "sub", 20000, 750, 10).price === 2250);
  const drug = { dose_price: null, dose_qty: 1, dose_unit: "box", product_id: "p1" };
  check("مادّةُ دولار أو غائبة لا تُستعمل — وبلا سعرٍ مكتوب لا حساب", B.doseCharge(drug, { id: "p1", sell_price: 9, price_currency: "USD" }) === null && B.doseCharge(drug, null) === null);
  check("  وبسعرٍ مكتوب: السعرُ وحده بلا مخزن", JSON.stringify(B.doseCharge({ ...drug, dose_price: 700 }, null)) === '{"price":700,"productId":null,"stockQty":null}');
  check("  وصغرى لمادّةٍ فقدت عددَها لا تُستعمل", B.doseCharge({ ...drug, dose_unit: "sub" }, { id: "p1", sell_price: 1000, units_per_box: 0 }) === null);
  check("دواءٌ بلا سعرٍ ولا مادّة لا يُحسب (drugBills)", !B.drugBills({ dose_price: null, product_id: null }) && B.drugBills({ dose_price: 0, product_id: null }));
}

/* ── مخزنُ الديمو ── */
const DB_KEY = /export const DEMO_DB_KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoKey.ts", "utf8"))?.[1];
const P = (id, name, extra = {}) => ({ id, name, barcode: null, stock: 5, purchase_price: 10000, sell_price: 20000, category: "medicine", clinic_id: "c1", farm_id: null, ...extra });
mem.set(DB_KEY, JSON.stringify({
  products: [P("vial", "Meloxicam vial", { has_sub_unit: true, units_per_box: 10, sub_unit_name: "مل" }), P("usd", "usd vial", { price_currency: "USD" }), P("pill", "pill box", { sell_price: 1000 })],
  companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [], treatments: [],
  pets: [{ id: "b1", name: "بسبوس", species: "dog", owner_name: "علي", owner_phone: "07701234567" }, { id: "b2", name: "لولو", species: "cat", owner_name: "زينب", owner_phone: "07709999999" }],
  admissions: [], vaccinations: [],
}));
const db = () => JSON.parse(mem.get(DB_KEY));
const session = (rawRole) => mem.set("vp_session", JSON.stringify({ raw: { id: "u1", rawRole, roles: ["clinic"] }, active: "clinic" }));
session("admin");
demoDrugsApply("default", [
  { op: "put", id: "d1", name: "Meloxicam", family: "analgesics", mine: false },
  { op: "put", id: "d2", name: "Ceftriaxone", family: "antibiotics", mine: false },
  { op: "put", id: "d3", name: "Vitamin B", family: "vitamins", mine: false },
]);

const row = (id) => demoDrugsList().rows.find((r) => r.id === id);
const charges = () => db().doseCharges ?? [];
const of = (entry) => charges().filter((c) => c.entry_id === entry).map((c) => `${c.status}:${c.price}:${c.stock_qty ?? "-"}:${c.product_id ?? "-"}`).join(",") || "none";
const set = (id, price, productId, qty, unit) => codeOf(API.setDrugBilling(id, { price, productId, qty, unit }));

console.log("▸ ٢) البابُ — الصلاحيةُ والمادّةُ والوحدة");
{
  check("المديرُ يربط الدواءَ بمادّة (٢ مل من فيال)، وسعرٌ وحده لدواءٍ ثانٍ",
    (await set("d1", null, "vial", 2, "sub")) === "ok" && (await set("d2", 5000, null, null, null)) === "ok"
    && row("d1").product_id === "vial" && row("d1").dose_qty === 2 && row("d1").dose_unit === "sub" && row("d2").dose_price === 5000);
  check("  ومادّةُ دولار ووحدةٌ صغرى لمادّةٍ بلاها ومادّةٌ غائبة وكمّيةٌ صفر تُرفض بالرمز",
    [await set("d3", null, "usd", 1, "box"), await set("d3", null, "pill", 1, "sub"), await set("d3", null, "zz", 1, "box"), await set("d3", null, "pill", 0, "box")].join()
      === "dose_product_usd,dose_unit_bad,dose_product_gone,dose_qty_bad");
  session("receptionist");
  check("  والاستقبالُ يُرفض (dose_billing_denied)", (await set("d3", 100, null, null, null)) === "dose_billing_denied" && row("d3").dose_price == null);
  session("admin");
  check("  ورمزُ الرفض يُقرأ للشاشة (doseErrorCode)", API.doseErrorCode(new Error("dose_product_usd")) === "dose_product_usd" && API.doseErrorCode(new Error("x")) === null);
}

console.log("▸ ٣) الطبلة — الختمُ والمعلَّقُ وإلغاؤه، وما بيع بالكاشير لا يُحسب");
{
  const e1 = await repo.addTreatment({ pet_id: "b1", day: "2026-11-13", medication: "meloxicam", time: "08:00", amount: "2 ml" });
  check("خطّةٌ معلَّقة: لا حساب، وختمُها «تُحسب»", of(e1.id) === "none" && db().treatments.find((t) => t.id === e1.id).bill === true);
  await repo.setTreatmentGiven(e1.id, true, "د. علي");
  check("إعطاؤها ⇒ معلَّقٌ بلقطة الحساب (٤٠٠٠ و٠٫٢ علبة) — والاسمُ يطابق بالتطبيع", of(e1.id) === "pending:4000:0.2:vial", of(e1.id));
  await repo.setTreatmentGiven(e1.id, true, "د. علي", "2026-11-13T09:00:00.000Z");
  check("  وإعادةُ ختم الإعطاء لا تصنع ثانياً", of(e1.id) === "pending:4000:0.2:vial");
  await repo.setTreatmentGiven(e1.id, false);
  check("إلغاءُ الإعطاء يُلغي المعلَّق", of(e1.id) === "void:4000:0.2:vial");
  await repo.setTreatmentGiven(e1.id, true, "د. علي");
  check("  وإعادتُه معلَّقٌ جديد", of(e1.id) === "void:4000:0.2:vial,pending:4000:0.2:vial");
  await persistMedicalEntries("b1", "كاشير", [{ id: "m1", kind: "medication", family: "Analgesics", name: "Meloxicam", route: "injection", dosage: "2 ml", administered: true }], null, false);
  await persistMedicalEntries("b2", "د. علي", [{ id: "m2", kind: "medication", family: "Antibiotics", name: "Ceftriaxone", route: "injection", dosage: "1 g", administered: true }], null, true);
  const pos = db().treatments.find((t) => t.pet_id === "b1" && t.id !== e1.id);   // سطرُ البيع (الثاني لبسبوس)
  const rec = db().treatments.find((t) => t.pet_id === "b2");
  check("ما بيع بالكاشير (bill=false) لا يُحسب، والسجلُّ (bill=true) يُحسب سعراً بلا مخزن", of(pos.id) === "none" && pos.bill === false && of(rec.id) === "pending:5000:-:-", `${of(pos.id)} ${of(rec.id)}`);
  const legacy = await repo.addTreatment({ pet_id: "b1", day: "2026-11-13", medication: "Meloxicam", time: "10:00", amount: "1", administered_at: "2026-11-13T10:00:00.000Z" });
  check("  ومعطاةٌ عند الإدراج بلا زيارةٍ ولا كلمة (بيعٌ قديم) لا تُحسب، وبزيارة تُحسب",
    of(legacy.id) === "none" && of((await repo.addTreatment({ pet_id: "b1", day: "2026-11-13", medication: "Ceftriaxone", time: "11:00", amount: "1", administered_at: "2026-11-13T11:00:00.000Z", visit_id: "v1" })).id) === "pending:5000:-:-");
  const vit = await repo.addTreatment({ pet_id: "b1", day: "2026-11-13", medication: "Vitamin B", time: "12:00", amount: "1" });
  await repo.setTreatmentGiven(vit.id, true);
  check("دواءٌ بلا حساب لا يُحسب", of(vit.id) === "none");
}

console.log("▸ ٤) البيع — المعلَّقُ للزبون، والبيعةُ تختمه وتخصم، والإعادةُ والجهازُ الثاني");
{
  const pend = await API.pendingDoses("+964 770 123 4567", null, []);
  check("معلَّقاتُ الزبون بهاتفه بصيغةٍ أخرى (بسبوس: جرعتان)", pend.map((x) => `${x.pet_name}:${x.price}`).join() === "بسبوس:4000,بسبوس:5000", JSON.stringify(pend.map((x) => x.pet_name + x.price)));
  check("  وبحيوانٍ مسمّى، والاسمُ وحده لا يطابق صاحبَ هاتف",
    (await API.pendingDoses(null, null, ["b2"])).map((x) => x.pet_name).join() === "لولو" && (await API.pendingDoses(null, "علي", [])).length === 0);
  const line = (c, extra = {}) => ({ product_id: c.product_id, name: c.name, barcode: null, qty: 1, unit_price: c.price, unit_cost: 0, stock_qty: c.product_id ? c.stock_qty : 0, unit_label: null, service_id: null, dose_charge: c.id, ...extra });
  const meta = (ref) => ({ amount_paid: 9000, payment_method: "cash", client_ref: ref, customer_phone: "07701234567" });
  check("سطورٌ لا تطابق اللقطة تُرفض قبل أيّ كتابة، وبلا مرجعٍ تُرفض",
    (await codeOf(API.checkoutWithDoses([line(pend[0], { stock_qty: 0.5 }), line(pend[1])], meta("r-bad")))) === "dose_charge_lines"
    && (await codeOf(API.checkoutWithDoses([line(pend[0])], meta("")))) === "dose_charge_ref" && db().invoices.length === 0);
  const inv = await API.checkoutWithDoses(pend.map((c) => line(c)), meta("r-1"));
  const after = db();
  check("البيعةُ تختم الجرعتين بفاتورتها وتخصم ٠٫٢ من الفيال",
    charges().filter((c) => c.invoice_id === inv.id && c.status === "billed").length === 2 && Math.abs(Number(after.products.find((p) => p.id === "vial").stock) - 4.8) < 1e-9
      && after.invoiceItems.filter((i) => i.invoice_id === inv.id).length === 2, String(after.products.find((p) => p.id === "vial").stock));
  const again = await API.checkoutWithDoses(pend.map((c) => line(c)), meta("r-1"));
  check("  والإعادةُ بالمرجع نفسِه ترجع الفاتورةَ نفسَها بلا خصمٍ ثانٍ", again.id === inv.id && Math.abs(Number(db().products.find((p) => p.id === "vial").stock) - 4.8) < 1e-9);
  check("  وجرعةٌ فوتَرتها بيعةٌ أخرى بمرجعٍ جديد ⇒ dose_charge_gone ولا فاتورة", (await codeOf(API.checkoutWithDoses([line(pend[1])], meta("r-2")))) === "dose_charge_gone"
    && !db().invoices.some((i) => i.client_ref === "r-2") && API.isDoseStale(new Error("dose_charge_gone")));
  check("  والمعلَّقُ لا يبقى للزبون بعد بيعه", (await API.pendingDoses("07701234567", null, [])).length === 0);
}

console.log("▸ ٥) شاشةُ البيع بنصّها — السطرُ يرسل معلَّقَه، والكميةُ ثابتة، والفشلُ يُقال");
{
  const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  check("السطرُ يرسل مادّتَه ولقطةَ المخصوم ومعرّفَ معلَّقه، والبيعةُ تمرّ من checkoutWithDoses حين يوجد",
    /\.\.\.\(l\.dose \? \{ product_id: l\.dose\.productId, qty: 1, stock_qty: [^}]*dose_charge: l\.dose\.charge \}/.test(sb) && /items\.some\(\(i\) => i\.dose_charge\)\s*\n\s*\? loadDoseMod\(\)\.then\(\(m\) => m\.checkoutWithDoses\(items, meta\)\)/.test(sb));
  check("  والكميةُ ثابتة (setQty يرفض غيرَ ١ ويُسقط الصفرَ شيلاً لهذه البيعة)", /if \(id\.startsWith\("d:"\)\) \{\s*\n\s*if \(qty <= 0\) \{ doseDismissed\.current\.add/.test(sb));
  check("  والجلبُ يُقال إن فشل، والجملةُ والدفعُ بالطريق لا يجلبان", /toast\.warn\(m\.say\.doseFetchFail\(\)\)/.test(sb) && /if \(wholesale \|\| done \|\| paying\) return;/.test(sb));
  check("  والبيعُ يكتب جرعاتِه «لا تُحسب» والسجلُّ «تُحسب»", /persistMedicalEntries\(pid, user\?\.full_name, drafts, soldAt, false\)/.test(sb)
    && /persistMedicalEntries\(petId, doctorName, entries, null, true\)/.test(readFileSync("src/pages/PetPassport.tsx", "utf8")));
}

console.log(fails ? `\n✗ dose-billing-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ dose-billing-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
