/* ============================================================================
 * فاتورةُ الشراء: كيف انحسبت (كلُّها/جزء/دَين) والأجورُ الإضافية (0276) — بسلوكها لا بنصّها.
 *
 *  ١) newPurchasePaid: الجزءُ اختيارٌ ثالثٌ بمبلغٍ إلزاميّ — «عليها دَين» بخانةٍ فارغة كان يُرسل المجموعَ مدفوعاً (دَينٌ يضيع).
 *  ٢) normCharges مرآةُ _purchase_charges: الاسمُ والمبلغُ ولمن ورموزُ الرفض، ودينارُ الدولار بسعر الفاتورة.
 *  ٣) المرآةُ التجريبية بالأرقام نفسِها التي يفحصها قسمُ 0276 بـrun.sh على القاعدة: الأجورُ داخل total أو خارجه، وتُوزَّع على الكلفة
 *     أو مصروفٌ، والختمُ يبقى بالتعديل، والجهازُ القديم يُبقيها، والدولار — «حارسٌ لا يوجد بالتجريبيّ حارسٌ لم يُفحص» (CLAUDE.md §٤).
 *  ٤) الأرباحُ والخسائر بالمرآة، والطباعةُ تقول الأجور.
 *
 *   node scripts/purchase-charges-test.mjs
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
const src = (p) => readFileSync(p, "utf8");

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, location: { hostname: "doctorvet.vet", origin: "https://doctorvet.vet" },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
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
    contents: [
      'export * from "./src/lib/repo.ts";',
      'export { purchaseFx } from "./src/lib/purchaseFxApi.ts";',
      'export { purchaseChargesState, setPurchaseChargesMode } from "./src/lib/purchaseChargesApi.ts";',
      'export { demoUsdPrefs, demoUsdRateSet } from "./src/lib/demoUsd.ts";',
      'export { newPurchasePaid } from "./src/lib/purchaseFxMath.ts";',
      'export { normCharges, ChargeFault, chargesOf, purchaseGrossCur, draftSums, draftProblem, chargesToSend } from "./src/lib/purchaseCharges.ts";',
      'export { computePnl } from "./src/lib/pnl.ts";',
      'export { demoReportPnl } from "./src/lib/demoPnl.ts";',
      'export { buildPurchaseHTML } from "./src/lib/purchasePrint.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "purchase-charges-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(join(tmpdir(), "purchase-charges-"));
const file = join(dir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const repo = M.repo ?? M.demoRepo;
if (!repo || !M.purchaseFx || !M.normCharges) { console.error("✗ purchase-charges-test: ما انحمّلت الوحدة"); process.exit(1); }
const codeOf = async (p) => { try { await p; return "ok"; } catch (e) { return String(e?.message ?? e); } };
const codeSync = (f) => { try { f(); return "ok"; } catch (e) { return `${e?.message ?? e}${e?.line ? `@${e.line}` : ""}`; } };

/* ══ ١) كيف انحسبت ══ */
console.log("▸ ١) newPurchasePaid — ثلاثةُ اختياراتٍ صريحة، ولا فراغَ يعني «كلّه»");
const P = M.newPurchasePaid;
check("«كلّها» ⇒ المجموع، و«دَين» ⇒ صفر (ولو كُتب مبلغ)", P("full", "", 21000) === 21000 && P("debt", "5000", 21000) === 0);
check("«جزء» بمبلغ ⇒ المبلغ، وفوق المجموع ⇒ المجموع (مدفوعةٌ كلّها)", P("part", "5000", 21000) === 5000 && P("part", "99999", 21000) === 21000);
check("  و«جزء» فارغ أو صفر أو سالب أو حروف ⇒ null (الحفظُ يقف) — كان الفراغُ تحت «دَين» يُرسل المجموع",
  [" ", "", "0", "-5", "abc"].every((v) => P("part", v, 21000) === null));
check("  ولا اختيار ⇒ null", P(null, "5000", 21000) === null);
check("«كلّها» وأجورٌ «بعدين» ٣٬٠٠٠ ⇒ البضاعةُ مدفوعة والأجورُ تبقى دَيناً (١٨٬٠٠٠)، و«جزء» و«دَين» كما هما",
  P("full", "", 21000, 3000) === 18000 && P("part", "5000", 21000, 3000) === 5000 && P("debt", "", 21000, 3000) === 0 && P("full", "", 2000, 5000) === 0);

/* ══ ٢) مرآةُ _purchase_charges ══ */
console.log("▸ ٢) normCharges — مرآةُ _purchase_charges");
const N = M.normCharges;
const n1 = N([{ label: "  أجور \t  توصيل ", amount: 3000, payee: "company" }, { label: "سائق", amount: "1000.005", payee: "other" }, { label: "نقل", amount: 5 }], null);
check("الاسمُ بفراغاتٍ مضغوطة، والمبلغُ بمنزلتين (النصفُ بعيداً عن الصفر)، ولمن الغائبُ «على الشركة»",
  JSON.stringify(n1.list) === JSON.stringify([{ label: "أجور توصيل", amount: 3000, payee: "company" }, { label: "سائق", amount: 1000.01, payee: "other" }, { label: "نقل", amount: 5, payee: "company" }]),
  JSON.stringify(n1.list));
check("  والمجموعان: على الشركة ٣٠٠٥، ولغيرها ١٠٠٠٫٠١ (والدولارُ صفرٌ لفاتورة دينار)", n1.company === 3005 && n1.other === 1000.01 && n1.companyUsd === 0, JSON.stringify(n1));
check("  وusd يُهمل لفاتورة الدينار (يكتبه بابُ الدولار وحده)", !("usd" in N([{ label: "x", amount: 5, usd: 99 }], null).list[0]));
const n2 = N([{ label: "توصيل", amount: 5 }, { label: "سائق", amount: 1, payee: "other" }, { label: "x", amount: 7, usd: 0.335 }], 1460);
check("الدولار: ٥$ بسعر ١٤٦٠ ⇒ ٧٬٣٠٠، وusd يغلب amount (٠٫٣٣٥ ⇒ ٠٫٣٤$ ⇒ ٤٩٦٫٤٠)",
  n2.list[0].amount === 7300 && n2.list[0].usd === 5 && n2.list[2].usd === 0.34 && n2.list[2].amount === 496.4 && n2.companyUsd === 5.34 && n2.otherUsd === 1 && n2.other === 1460, JSON.stringify(n2));
check("الرفضُ برمز الخادم وسطره: اسمٌ فارغ، ومبلغٌ صفرٌ/سالبٌ/حروف، ولمن غريب، وواحدٌ وعشرون، وغيرُ قائمة، وسطرٌ غيرُ كائن",
  codeSync(() => N([{ label: "  ", amount: 5 }], null)) === "charge_label@1"
  && codeSync(() => N([{ label: "a", amount: 5 }, { label: "b", amount: 0 }], null)) === "charge_amount@2"
  && codeSync(() => N([{ label: "a", amount: -1 }], null)) === "charge_amount@1"
  && codeSync(() => N([{ label: "a", amount: "x" }], null)) === "charge_amount@1"
  && codeSync(() => N([{ label: "a", amount: 1, payee: "me" }], null)) === "bad_charges@1"
  && codeSync(() => N(Array.from({ length: 21 }, () => ({ label: "a", amount: 1 })), null)) === "bad_charges"
  && codeSync(() => N({ label: "a" }, null)) === "bad_charges"
  && codeSync(() => N([5], null)) === "bad_charges@1"
  && codeSync(() => N([{ label: "a", amount: 1e12 }], null)) === "charge_amount@1");
check("  والفارغُ (null أو []) بلا أجور", N(null, null).list.length === 0 && N([], 1460).company === 0);

console.log("▸ ٢ب) سطورُ النموذج — المرسَلُ ما كُتب، والناقصُ يُقال برقمه");
const rows = [{ label: "توصيل", amount: "3000", payee: "company" }, { label: "", amount: "", payee: "company" }, { label: "سائق", amount: "1000", payee: "other" }];
check("السطرُ الفارغ كلُّه يُترك، والمجموعان ٣٠٠٠ و١٠٠٠", JSON.stringify(M.chargesToSend(rows)) === JSON.stringify([{ label: "توصيل", amount: 3000, payee: "company" }, { label: "سائق", amount: 1000, payee: "other" }])
  && M.draftSums(rows).company === 3000 && M.draftSums(rows).other === 1000 && M.draftProblem(rows) === 0);
check("  واسمٌ بلا مبلغ ⇒ رقمُ سطره بالنموذج، ومبلغٌ بلا اسم كذلك",
  M.draftProblem([...rows, { label: "تخليص", amount: "", payee: "company" }]) === 4 && M.draftProblem([{ label: "", amount: "50", payee: "other" }]) === 1);
check("  ولا افتراض لـ«هسّه/بعدين»: سطرٌ كاملٌ بلا اختيار ناقص، ولا يدخل المجموعين",
  M.draftProblem([...rows, { label: "تحميل", amount: "200", payee: null }]) === 4 && M.draftSums([{ label: "x", amount: "200", payee: null }]).company === 0);

/* ══ ٣) المرآةُ التجريبية بأرقام قسم 0276 ══ */
const DB_KEY = /export const DEMO_DB_KEY = "([^"]+)"/.exec(src("src/lib/demoKey.ts"))?.[1];
if (!DB_KEY) { console.error("✗ purchase-charges-test: ما انقرأ مفتاحُ مخزن الديمو"); process.exit(1); }
const CO = "co-ch";
mem.set(DB_KEY, JSON.stringify({
  products: [
    { id: "a1", name: "أجور أ", barcode: "CH6-A1", stock: 0, sell_price: 2000, purchase_price: 900, category: null },
    { id: "a2", name: "أجور ب", barcode: "CH6-A2", stock: 0, sell_price: 4000, purchase_price: 1900, category: null },
    { id: "a3", name: "أجور ج", barcode: "CH6-A3", stock: 0, sell_price: 900, purchase_price: 450, category: null },
    { id: "a4", name: "أجور مجاني", barcode: "CH6-A4", stock: 0, sell_price: 100, purchase_price: 0, category: null },
    { id: "d1", name: "أجور دولارية", barcode: "CH6-D1", stock: 0, sell_price: 0, purchase_price: 14000, price_currency: "USD", sell_price_usd: 20, purchase_price_usd: 9, category: null },
  ],
  companies: [{ id: CO, name: "شركة الأجور" }], companySections: [], purchases: [], purchaseItems: [], purchasePayments: [], companyEntries: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
}));
const db = () => JSON.parse(mem.get(DB_KEY));
const as = (role) => (role === "manager" ? mem.delete("vp_session")
  : mem.set("vp_session", JSON.stringify({ raw: { id: "u-" + role, full_name: "موظف", rawRole: role } })));
const pur = (ref) => db().purchases.find((p) => p.reference === ref);
const avg = (id) => db().products.find((p) => p.id === id).avg_cost;
const head = (p) => `${p.total}:${p.charges_company}:${p.charges_other}:${p.charges_mode ?? "-"}:${p.status}`;
const L = (id, qty, price) => ({ product_id: id, name: id, qty, purchase_price: price, sell_price: 0 });
const LINES1 = [L("a1", 10, 1000), L("a2", 5, 2000)];
as("manager");

console.log("▸ ٣) المرآة: على الشركة داخل total، ولغيرها خارجه، و«على الكلفة» تُوزَّع");
check("الإعدادُ الافتراضيّ «على الكلفة»، والمرآةُ تعرف الأجور", JSON.stringify(await M.purchaseChargesState()) === '{"ready":true,"mode":"cost"}');
await repo.recordPurchase(LINES1, { company_id: CO, reference: "CH6-1", amount_paid: 0, discount: 2000,
  charges: [{ label: "  أجور   توصيل ", amount: 3000, payee: "company" }, { label: "سائق", amount: 1000, payee: "other" }] });
check("فاتورةٌ ٢٠٬٠٠٠ بخصم ٢٬٠٠٠ وأجرة شركة ٣٬٠٠٠ وسائق ١٬٠٠٠ ⇒ total ٢١٬٠٠٠، غيرُ مدفوعة", head(pur("CH6-1")) === "21000:3000:1000:cost:unpaid", head(pur("CH6-1")));
check("  والكلفةُ (١٨٬٠٠٠ + ٤٬٠٠٠) ÷ ٢٠٬٠٠٠: أ ١١٠٠، ب ٢٢٠٠ — وسعرُ الشراء كما بالورقة",
  avg("a1") === 1100 && avg("a2") === 2200 && db().products.find((p) => p.id === "a1").purchase_price === 1000, `${avg("a1")}|${avg("a2")}`);
check("  والقائمةُ كما يكتبها الخادم (الاسمُ مضغوط)", pur("CH6-1").charges.map((x) => `${x.label}:${x.amount}:${x.payee}`).join(",") === "أجور توصيل:3000:company,سائق:1000:other");
check("  وقارئُ الشاشات: المجموعُ قبل الخصم والأجور ٢٠٬٠٠٠", M.purchaseGrossCur(pur("CH6-1")) === 20000);

as("veterinarian");
check("الإعدادُ للمدير: الطبيبُ يُرفض", (await codeOf(M.setPurchaseChargesMode("expense"))) === "forbidden");
as("manager");
check("  والمديرُ يقلبه «مصروف»", (await M.setPurchaseChargesMode("expense")) === "expense" && (await M.purchaseChargesState()).mode === "expense");
await repo.recordPurchase([L("a3", 4, 500)], { company_id: CO, reference: "CH6-2", amount_paid: 0, charges: [{ label: "نقل", amount: 600, payee: "other" }] });
check("«مصروف»: ٢٬٠٠٠ وأجرة سائق ٦٠٠ ⇒ total ٢٬٠٠٠، والكلفةُ ٥٠٠ كما هي", head(pur("CH6-2")) === "2000:0:600:expense:unpaid" && avg("a3") === 500, `${head(pur("CH6-2"))}|${avg("a3")}`);

const U1 = (charges) => repo.updatePurchase(pur("CH6-1").id, LINES1, { amount_paid: 0, discount: 2000, ...(charges === undefined ? {} : { charges }) });
await U1([{ label: "توصيل", amount: 5000 }, { label: "سائق", amount: 1000, payee: "other" }]);
check("تعديلُ الأولى بعد قلب الإعداد: ختمُها «على الكلفة» يبقى، total ٢٣٬٠٠٠، أ ١٢٠٠ ب ٢٤٠٠ (القديمُ بما استلمه)",
  head(pur("CH6-1")) === "23000:5000:1000:cost:unpaid" && avg("a1") === 1200 && avg("a2") === 2400, `${head(pur("CH6-1"))}|${avg("a1")}|${avg("a2")}`);
await U1(undefined);
check("  وجهازٌ ما تحدّث (بلا charges) يُبقيها والكلفة", head(pur("CH6-1")) === "23000:5000:1000:cost:unpaid" && avg("a1") === 1200);
await U1([]);
check("  وشيلُها كلِّها: total ١٨٬٠٠٠، بلا ختم ولا قائمة، وأ ٩٠٠", head(pur("CH6-1")) === "18000:0:0:-:unpaid" && pur("CH6-1").charges === null && avg("a1") === 900,
  `${head(pur("CH6-1"))}|${avg("a1")}`);
await U1([{ label: "توصيل", amount: 5000 }]);
check("  وإرجاعُها يأخذ إعدادَ اليوم («مصروف»): الكلفةُ ٩٠٠ كما هي", head(pur("CH6-1")) === "23000:5000:0:expense:unpaid" && avg("a1") === 900);

console.log("▸ ٣ب) الرفضُ بجملة الخادم — قبل أيّ كتابة");
const before = JSON.stringify(db().products);
const bad = async (charges) => codeOf(repo.recordPurchase([L("a3", 1, 500)], { company_id: CO, reference: "CH6-x", amount_paid: 0, charges }));
check("اسمٌ فارغ، ومبلغٌ صفر، ولمن غريب، وواحدٌ وعشرون، وغيرُ قائمة",
  (await bad([{ label: "  ", amount: 5 }])) === "charge_label" && (await bad([{ label: "x", amount: 0 }])) === "charge_amount"
  && (await bad([{ label: "x", amount: 5, payee: "me" }])) === "bad_charges"
  && (await bad(Array.from({ length: 21 }, () => ({ label: "x", amount: 1 })))) === "bad_charges" && (await bad({ label: "x" })) === "bad_charges");
check("  ولا فاتورةَ ولا رصيدَ تغيّر", !pur("CH6-x") && JSON.stringify(db().products) === before);
await M.setPurchaseChargesMode("cost");
check("فاتورةٌ بلا قيمة لا تُوزَّع عليها أجورٌ «على الكلفة» (charges_no_value)",
  (await codeOf(repo.recordPurchase([L("a4", 3, 0)], { company_id: CO, reference: "CH6-z", amount_paid: 0, charges: [{ label: "توصيل", amount: 500 }] }))) === "charges_no_value");
await M.setPurchaseChargesMode("expense");
await repo.recordPurchase([L("a4", 3, 0)], { company_id: CO, reference: "CH6-z", amount_paid: 0, charges: [{ label: "توصيل", amount: 500 }] });
check("  و«مصروف» تمرّ: total أجرةُ الشركة وحدها", head(pur("CH6-z")) === "500:500:0:expense:unpaid", head(pur("CH6-z")));

console.log("▸ ٣ج) الدولار — الأجورُ بدولارها ودينارها، والتعديلُ يُبقيها، وتبديلُ العملة بلاها يُرفض");
await M.setPurchaseChargesMode("cost");
await M.demoUsdPrefs(true, 250);
await M.demoUsdRateSet("146000", null);
const DL = [{ product_id: "d1", name: "d1", qty: 2, purchase_price: 0, sell_price: 0, purchase_price_usd: 10 }];
await M.purchaseFx.record(DL, { currency: "USD", fx_rate: 1460, company_id: CO, amount_paid_usd: 0, reference: "CH6-U",
  charges: [{ label: "توصيل", amount: 5, payee: "company" }, { label: "سائق", amount: 1, payee: "other" }] });
const pu = pur("CH6-U");
check("٢٠$ + أجرة شركة ٥$ ⇒ total_usd ٢٥ ودينارُه ٣٦٬٥٠٠، والأجورُ ٧٬٣٠٠ و١٬٤٦٠ «على الكلفة»، غيرُ مدفوعة",
  pu.total_usd === 25 && head(pu) === "36500:7300:1460:cost:unpaid", `${pu.total_usd}|${head(pu)}`);
check("  والقائمةُ بدولارها ودينارها، ود ١٨٬٩٨٠ (الأجورُ الاثنتان موزَّعة)",
  pu.charges.map((x) => `${x.label}:${x.usd}:${x.amount}:${x.payee}`).join(",") === "توصيل:5:7300:company,سائق:1:1460:other" && avg("d1") === 18980,
  `${JSON.stringify(pu.charges)}|${avg("d1")}`);
check("  وقارئُ الشاشات بالدولار: أجرةُ الشركة ٥$ والمجموعُ قبلها ٢٠$", M.chargesOf(pu).company === 5 && M.chargesOf(pu).other === 1 && M.purchaseGrossCur(pu) === 20);
await M.purchaseFx.update(pu.id, DL, {});
check("التعديلُ بلا مفتاح charges يُبقيها (total_usd ٢٥)", pur("CH6-U").total_usd === 25 && pur("CH6-U").charges_company === 7300);
check("  وتبديلُ العملة بلا مفتاحها يُرفض (charges_currency)",
  (await codeOf(M.purchaseFx.update(pu.id, [{ product_id: "d1", name: "d1", qty: 2, purchase_price: 14600, sell_price: 0 }], { currency: "IQD" }))) === "charges_currency");
await M.purchaseFx.update(pu.id, DL, { fx_rate: 1500 });
check("  وبسعرٍ جديد ١٥٠٠ تُعاد الأجورُ من دولارها (٥$ ⇒ ٧٬٥٠٠)", pur("CH6-U").charges_company === 7500 && pur("CH6-U").total_usd === 25);

/* ══ ٤) الأرباحُ والخسائر والطباعة ══ */
console.log("▸ ٤) الأرباحُ والخسائر: «مصروف» وحدها بشهر الفاتورة — والطباعةُ تقول الأجور");
const now = new Date();
const rep = await M.demoReportPnl(new Date(now.getTime() - 2 * 86400000).toISOString(), new Date(now.getTime() + 86400000).toISOString(), "Asia/Baghdad");
check("أجورُ المشتريات «مصروفاً» ٦٬١٠٠ (٦٠٠ + ٥٬٠٠٠ + ٥٠٠)، و«على الكلفة» خارجها، والصافي يطرحها",
  rep.total.purchase_charges === 6100 && rep.total.net === rep.total.gross + rep.total.fx + rep.total.fx_purchases - rep.total.expenses - rep.total.purchase_charges,
  JSON.stringify(rep.total));
const html = M.buildPurchaseHTML({ ...pur("CH6-1"), charges: [{ label: "توصيل", amount: 5000, payee: "company" }, { label: "سائق", amount: 700, payee: "other" }], charges_company: 5000, charges_other: 700 },
  [], { lang: "ar", labels: { subtotal: "SUB", discount: "DISC", net: "NET", chargeOther: "OTHER" } });
check("الطباعة: المجموعُ قبلها ٢٠٬٠٠٠، وسطرُ أجرة الشركة +٥٬٠٠٠ قبل الصافي، وأجرةُ غيرها بعد المتبقّي بوسمها",
  html.includes("SUB") && html.includes("20,000") && /data-pcharge="company"[^]*?\+5,000/.test(html) && html.indexOf('data-pcharge="company"') < html.indexOf("NET")
  && /data-pcharge="other"[^]*?OTHER/.test(html) && html.indexOf('data-pcharge="other"') > html.indexOf("NET"));

console.log(`${fails ? "✗" : "✓"} purchase-charges-test: ${passes} فحصاً عبرت${fails ? `، و${fails} فشل` : ""}`);
process.exit(fails ? 1 : 0);
