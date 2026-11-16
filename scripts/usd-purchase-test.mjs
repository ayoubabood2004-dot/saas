/* ============================================================================
 * الشراءُ بالعملتين ودفترُ الشركة بالعملتين (0274) — المرآةُ التجريبية بسلوكها، بالحالات والأرقام نفسِها التي تفحصها الحزمةُ على
 * القاعدة (قسمُ 0274 بـrun.sh): «حارسٌ لا يوجد بالتجريبيّ حارسٌ لم يُفحص» (CLAUDE.md §٤). ثمّ دفترُ الشركة رصيدين لا يختلطان،
 * وثابتُه بكلّ عملة: الرصيدُ الأخير = دينُ الفواتير + السابقُ القائم (+ المطالبات بالدينار).
 *
 *   node scripts/usd-purchase-test.mjs
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
      'export { demoUsdPrefs, demoUsdRateSet } from "./src/lib/demoUsd.ts";',
      'export { buildCompanyLedger, previewPay, payableOf, poolDueOf } from "./src/lib/companyLedger.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "usd-purchase-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(join(tmpdir(), "usd-purchase-"));
const file = join(dir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const repo = M.repo ?? M.demoRepo;
const fx = M.purchaseFx;
if (!repo || !fx) { console.error("✗ usd-purchase-test: ما انحمّلت الوحدة"); process.exit(1); }

const DB_KEY = /export const DEMO_DB_KEY = "([^"]+)"/.exec(src("src/lib/demoKey.ts"))?.[1];
if (!DB_KEY) { console.error("✗ usd-purchase-test: ما انقرأ مفتاحُ مخزن الديمو"); process.exit(1); }
const CO = "co-fx";
mem.set(DB_KEY, JSON.stringify({
  products: [
    { id: "a1", name: "دينارية", barcode: "FX-A1", stock: 10, sell_price: 15000, purchase_price: 10000, price_currency: "IQD", category: null },
    { id: "a2", name: "دولارية", barcode: "FX-A2", stock: 5, sell_price: 0, purchase_price: 14600, price_currency: "USD", sell_price_usd: 20, purchase_price_usd: 10, category: null },
  ],
  companies: [{ id: CO, name: "شركة الدولار" }], companySections: [], purchases: [], purchaseItems: [], purchasePayments: [], companyEntries: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
}));
const db = () => JSON.parse(mem.get(DB_KEY));
const as = (role) => (role === "manager" ? mem.delete("vp_session")
  : mem.set("vp_session", JSON.stringify({ raw: { id: "u-" + role, full_name: "موظف", rawRole: role } })));
const codeOf = async (p) => { try { await p; return "ok"; } catch (e) { return String(e?.message ?? e); } };
const pur = (ref) => db().purchases.find((p) => p.reference === ref);
const prod = (pred) => db().products.find(pred);

as("manager");
await M.demoUsdPrefs(true, 250);
await M.demoUsdRateSet("146000", null);

/* ══ ١) فاتورةُ الدولار — نفسُ أرقام قسم الحزمة ══ */
console.log("▸ ١) record_purchase_fx بالتجريبيّ — كلفةُ الدينار بسعر الفاتورة، والدولارُ حقيقةُ الدَّين");
const L1 = [
  { product_id: "a1", name: "دينارية", qty: 2, purchase_price: 0, sell_price: 0, purchase_price_usd: 5 },
  { product_id: "a2", name: "دولارية", qty: 3, purchase_price: 0, sell_price: 0, purchase_price_usd: 12, sell_price_usd: 25 },
  { name: "علف جديد", barcode: "FX-N1", qty: 4, purchase_price: 0, sell_price: 0, purchase_price_usd: 2.5, sell_currency: "USD", sell_price_usd: 4 },
  { name: "ملح", barcode: "FX-N2", qty: 1, purchase_price: 0, sell_price: 3000, purchase_price_usd: 1, sell_currency: "IQD" },
];
const M1 = { currency: "USD", fx_rate: 1470, company_id: CO, company_name: "شركة الدولار", discount_usd: 2, amount_paid_usd: 10, reference: "FX-1" };
as("reception");
check("الاستقبالُ يُرفض", (await codeOf(fx.record(L1, M1))).startsWith("forbidden"));
as("manager");
check("  والمديرُ يكتب فاتورةَ الدولار", (await codeOf(fx.record(L1, M1))) === "ok");
const p1 = pur("FX-1");
check("  الرأس: ٥٥$ (٥٧ − ٢)، ودينارُه ٨٠٬٨٥٠ (٨٣٬٧٩٠ − ٢٬٩٤٠)، والمدفوعُ ١٤٬٧٠٠ حصّةُ ١٠$، جزئية",
  p1.currency === "USD" && p1.fx_rate === 1470 && p1.total_usd === 55 && p1.paid_usd === 10 && p1.discount_usd === 2
  && p1.total === 80850 && p1.discount === 2940 && p1.amount_paid === 14700 && p1.status === "partial", JSON.stringify(p1));
const a1 = prod((p) => p.id === "a1"), a2 = prod((p) => p.id === "a2");
check("  مادّةُ الدينار: رصيدٌ ١٢، وآخرُ سعر شراء ٧٣٥٠، وسعرُ بيعها كما هو، والمتوسّطُ من دينارها بعد الخصم",
  a1.stock === 12 && a1.purchase_price === 7350 && a1.sell_price === 15000 && a1.price_currency === "IQD" && a1.purchase_price_usd == null
  && a1.avg_cost > 9000 && a1.avg_cost < 9600, JSON.stringify(a1));
check("  مادّةُ الدولار: رصيدٌ ٨، وشراؤها ١٢$ وبيعُها ٢٥$ ودينارُ بيعها لا يُمسّ",
  a2.stock === 8 && a2.purchase_price_usd === 12 && a2.sell_price_usd === 25 && a2.sell_price === 0 && a2.purchase_price === 17640, JSON.stringify(a2));
const n1 = prod((p) => p.barcode === "FX-N1"), n2 = prod((p) => p.barcode === "FX-N2");
check("  «علف جديد» مادّةُ دولار بسعرَيها، و«ملح» دينارٌ بسعر بيعه",
  n1?.price_currency === "USD" && n1.sell_price_usd === 4 && n1.purchase_price_usd === 2.5 && n1.sell_price === 0 && n1.purchase_price === 3675 && n1.stock === 4
  && (n2?.price_currency ?? "IQD") === "IQD" && n2.sell_price === 3000 && n2.purchase_price === 1470 && n2.purchase_price_usd == null,
  JSON.stringify([n1, n2]));
const items = db().purchaseItems.filter((x) => x.purchase_id === p1.id).sort((a, b) => a.purchase_price_usd - b.purchase_price_usd)
  .map((x) => `${x.name}:${x.purchase_price_usd}:${x.sell_currency ?? "-"}:${x.sell_price_usd ?? "-"}`).join(",");
check("  والسطور: كلفةُ كلٍّ بالدولار، وعملةُ بيعه وسعرُه", items === "ملح:1:IQD:-,علف جديد:2.5:USD:4,دينارية:5:IQD:-,دولارية:12:USD:25", items);

console.log("▸ ٢) البابان — القديمُ يُرفض على فاتورة الدولار");
check("التسديدُ القديم والتعديلُ القديم يُرفضان usd_purchase_door",
  (await codeOf(repo.settlePurchase(p1.id, 1000, "cash"))) === "usd_purchase_door"
  && (await codeOf(repo.updatePurchase(p1.id, [{ product_id: "a1", name: "دينارية", qty: 1, purchase_price: 7350, sell_price: 0 }], {}))) === "usd_purchase_door");
check("  (ولا شيءَ تغيّر)", pur("FX-1").paid_usd === 10 && prod((p) => p.id === "a1").stock === 12 && !db().purchasePayments.some((x) => x.purchase_id === p1.id));

console.log("▸ ٣) purchase_pay_fx — الدَّينُ بعملته والمسلَّمُ بعملته");
check("٢٠$ بالدولار (الباقي المرئيّ ٤٥) ⇒ جزئية", (await fx.pay(p1.id, 20, "USD", null, "cash", null, 45)).status === "partial");
check("  ١٥$ بـ٢٢٬٥٠٠ ديناراً بسعر ١٥٠٠ ⇒ حصّتُه ٢٢٬٠٥٠", (await fx.pay(p1.id, 22500, "IQD", 1500, "cash", "بالدينار", 25)).amount_paid === 66150);
const pays = db().purchasePayments.filter((x) => x.purchase_id === p1.id).sort((a, b) => b.usd - a.usd)
  .map((x) => `${x.usd}:${x.amount}:${x.pay_currency}:${x.handed}:${x.fx_rate ?? "-"}`).join(",");
check("  الدفعتان", pays === "20:29400:USD:20:-,15:22050:IQD:22500:1500", pays);
const refus = [await codeOf(fx.pay(p1.id, 1, "USD", null, "cash", null, 99)), await codeOf(fx.pay(p1.id, 11, "USD", null, "cash", null, null)),
  await codeOf(fx.pay(p1.id, 1000, "IQD", null, "cash", null, null))].join("|");
check("  الرفض: الباقي تغيّر، وفوقَ الباقي، وبلا سعر", refus === "due_changed|over_pay|bad_rate", refus);
check("  والإغلاقُ بـ١٥٬٠١٠ بسعر ١٥٠٠ (سنتٌ فوق الباقي) ⇒ مدفوعةٌ بالعملتين بالضبط",
  (await fx.pay(p1.id, 15010, "IQD", 1500, "cash", null, 10)).status === "paid" && pur("FX-1").paid_usd === 55 && pur("FX-1").amount_paid === 80850);

check("فاتورةُ دينار تُسدَّد بالدولار: ١٠$ بسعر ١٤٦٠ تُغلق ١٤٬٦٠٠",
  (await codeOf(fx.record([{ product_id: "a1", name: "دينارية", qty: 1, purchase_price: 14600, sell_price: 0 }], { currency: "IQD", company_id: CO, amount_paid: 0, reference: "FX-2" }))) === "ok"
  && (await fx.pay(pur("FX-2").id, 10, "USD", 1460, "cash", null, 14600)).status === "paid");
const pp2 = db().purchasePayments.find((x) => x.purchase_id === pur("FX-2").id);
check("  الدفعة: ١٤٬٦٠٠ ديناراً، سُلّمت ١٠$ بسعر ١٤٦٠، والفاتورةُ دينار", pp2.amount === 14600 && pp2.usd == null && pp2.pay_currency === "USD" && pp2.handed === 10 && pp2.fx_rate === 1460 && pur("FX-2").currency !== "USD");

console.log("▸ ٤) دفترُ الشركة بالعملتين");
await fx.record([{ product_id: "a2", name: "دولارية", qty: 5, purchase_price: 0, sell_price: 0, purchase_price_usd: 10 }], { currency: "USD", fx_rate: 1460, company_id: CO, amount_paid_usd: 0, reference: "FX-3" });
check("فاتورةُ دولارٍ ثالثة ٥٠$ = ٧٣٬٠٠٠ غيرُ مدفوعة", pur("FX-3").total === 73000 && pur("FX-3").total_usd === 50 && pur("FX-3").status === "unpaid");
check("  رصيدٌ سابقٌ بالدولار ١٠٠ وبالدينار ٥٠٬٠٠٠ معاً، والثاني بالدولار opening_exists",
  (await codeOf(fx.opening(CO, "USD", 100, null, "قبل النظام"))) === "ok" && (await codeOf(fx.opening(CO, "IQD", 50000, null, null))) === "ok"
  && (await codeOf(fx.opening(CO, "USD", 5, null, null))) === "opening_exists");
check("  وcompanyPay القديمة بالدينار لا ترى دَينَ الدولار: ٦٠٬٠٠٠ فوق ٥٠٬٠٠٠ ⇒ over_pay", (await codeOf(repo.companyPay(CO, 60000, "cash", null))) === "over_pay");
const r120 = await fx.companyPay(CO, "USD", 120, "USD", null, "cash", null, "دفعة");
check("التسديدُ على الحساب بالدولار ١٢٠: السابقُ ١٠٠ ثمّ ٢٠ لفاتورة", r120.to_opening === 100 && r120.to_invoices === 20 && r120.invoices === 1, JSON.stringify(r120));
const r10 = await fx.companyPay(CO, "USD", 14600, "IQD", 1460, "cash", null, null);
const rIqd = await fx.companyPay(CO, "IQD", 10, "USD", 1500, "cash", null, null);
check("  ثمّ ١٤٬٦٠٠ ديناراً على دين الدولار (١٠$)، و١٠$ بسعر ١٥٠٠ على دين الدينار (١٥٬٠٠٠)", r10.to_invoices === 10 && rIqd.to_opening === 15000, JSON.stringify([r10, rIqd]));
check("  الفاتورة: ٣٠$ ودينارُها ٤٣٬٨٠٠، والسابقان ٠$ و٣٥٬٠٠٠",
  pur("FX-3").paid_usd === 30 && pur("FX-3").amount_paid === 43800 && pur("FX-3").status === "partial"
  && M.poolDueOf(db().companyEntries, db().purchasePayments, "USD") === 0 && M.poolDueOf(db().companyEntries, db().purchasePayments, "IQD") === 35000);
const rows = db().companyEntries.map((e) => `${e.kind}:${e.currency ?? "IQD"}:${e.amount}:${e.pay_currency ?? "-"}:${e.handed ?? "-"}:${e.fx_rate ?? "-"}`).join(",");
check("  والصفوف: كلٌّ بعملته ومبلغِه بها وما سُلّم", rows === "opening:USD:100:-:-:-,opening:IQD:50000:-:-:-,payment:USD:120:USD:120:-,payment:USD:10:IQD:14600:1460,payment:IQD:15000:USD:10:1500", rows);
check("  فوق دين الدولار ⇒ over_pay، وبلا سعر ⇒ bad_rate",
  (await codeOf(fx.companyPay(CO, "USD", 21, "USD", null, "cash", null, null))) === "over_pay" && (await codeOf(fx.companyPay(CO, "USD", 1000, "IQD", null, "cash", null, null))) === "bad_rate");

/* الدفترُ رصيدان: كلٌّ بثابته (الرصيدُ الأخير = الفواتير + السابق [+ المطالبات]) ولا يدخل أحدُهما الآخر. */
const input = () => ({ purchases: db().purchases, payments: db().purchasePayments, entries: db().companyEntries, charges: [] });
const LI = M.buildCompanyLedger(input(), "IQD"), LU = M.buildCompanyLedger(input(), "USD");
check("دفترُ الدينار: FX-2 مدفوعة والسابقُ ٣٥٬٠٠٠ ⇒ الرصيد ٣٥٬٠٠٠، بلا سطرٍ من فواتير الدولار",
  LI.totals.balance === 35000 && LI.totals.invoiceDue === 0 && LI.totals.poolDue === 35000
  && !LI.rows.some((r) => r.purchaseId && [pur("FX-1").id, pur("FX-3").id].includes(r.purchaseId)), JSON.stringify(LI.totals));
check("  دفترُ الدولار: فاتورتان (٥٥ مدفوعة و٥٠ عليها ٢٠) والسابقُ صفر ⇒ الرصيد ٢٠$، والثابتُ نفسُه",
  LU.totals.balance === 20 && LU.totals.invoiceDue === 20 && LU.totals.poolDue === 0 && LU.totals.balance === LU.totals.invoiceDue + LU.totals.poolDue
  && LU.rows.find((r) => r.kind === "purchase" && r.purchaseId === pur("FX-1").id)?.credit === 55, JSON.stringify(LU.totals));
const acc = LU.rows.find((r) => r.kind === "accountPay" && r.amount === 120);
check("  وسطرُ التسديد ١٢٠$ بتوزيعه: ١٠٠ للسابق و٢٠ للفاتورة بالدولار (لا بدينارها)", acc?.toOpening === 100 && acc.alloc?.[0]?.amount === 20, JSON.stringify(acc));
check("  ومعاينةُ التسديد بالدولار تقول ما يقوله الخادم (الأقدمُ أوّلاً)",
  JSON.stringify(M.previewPay(25, 0, db().purchases.filter((p) => p.currency === "USD")).alloc.map((a) => a.amount)) === "[20]"
  && M.previewPay(25, 0, db().purchases.filter((p) => p.currency === "USD")).left === 5);

console.log("▸ ٥) الإلغاء والتعديل وتغييرُ العملة");
const pay120 = db().companyEntries.find((e) => e.kind === "payment" && e.amount === 120);
const openUsd = db().companyEntries.find((e) => e.kind === "opening" && e.currency === "USD");
check("السابقُ بالدولار انسدّ منه ⇒ has_payments؛ وإلغاءُ ١٢٠$ يردّ ٢٠$ للفاتورة و١٠٠ للسابق",
  (await codeOf(repo.voidCompanyEntry(openUsd.id, "غلط"))) === "has_payments" && (await codeOf(repo.voidCompanyEntry(pay120.id, "غلط"))) === "ok"
  && pur("FX-3").paid_usd === 10 && pur("FX-3").amount_paid === 14600 && M.poolDueOf(db().companyEntries, db().purchasePayments, "USD") === 100
  && db().companyEntries.find((e) => e.id === pay120.id).void_detail?.[0]?.usd === 20);
check("  والسابقُ بالدولار يُلغى الآن", (await codeOf(repo.voidCompanyEntry(openUsd.id, "غلط"))) === "ok" && M.poolDueOf(db().companyEntries, db().purchasePayments, "USD") === 0);
const u3 = await fx.update(pur("FX-3").id, [{ product_id: "a2", name: "دولارية", qty: 4, purchase_price: 0, sell_price: 0, purchase_price_usd: 10 }], {});
check("التعديل: ٥ ← ٤ ⇒ ٤٠$ و٥٨٬٤٠٠، والمدفوعُ ١٠$ يبقى ودينارُه حصّتُه، والرصيدُ ينزل قطعة",
  u3.total_usd === 40 && u3.total === 58400 && u3.paid_usd === 10 && u3.amount_paid === 14600 && prod((p) => p.id === "a2").stock === 12, JSON.stringify(u3));
check("  وتغييرُ العملة وعليها دفعة ⇒ currency_has_payments",
  (await codeOf(fx.update(pur("FX-3").id, [{ product_id: "a2", name: "دولارية", qty: 4, purchase_price: 14600, sell_price: 0 }], { currency: "IQD" }))) === "currency_has_payments");
await fx.record([{ product_id: "a1", name: "دينارية", qty: 1, purchase_price: 0, sell_price: 0, purchase_price_usd: 7 }], { currency: "USD", company_id: CO, amount_paid_usd: 0, reference: "FX-4" });
check("  وفاتورةُ دولارٍ بلا سعرٍ مكتوب تأخذ سعرَ العيادة ١٤٦٠ (٧$ = ١٠٬٢٢٠)", pur("FX-4").fx_rate === 1460 && pur("FX-4").total === 10220);
const u4 = await fx.update(pur("FX-4").id, [{ product_id: "a1", name: "دينارية", qty: 1, purchase_price: 10000, sell_price: 0 }], { currency: "IQD", amount_paid: 0 });
check("  وبلا دفعة تصير ديناراً بلا أعمدةٍ دولارية", u4.currency === "IQD" && u4.total === 10000 && u4.total_usd == null && u4.fx_rate == null
  && db().purchaseItems.filter((x) => x.purchase_id === u4.id).every((x) => x.purchase_price_usd == null), JSON.stringify(u4));

/* ══ ٦) الوصل: البابُ كسولٌ خارج حزمة الإقلاع، والمرآةُ من repoDemo وحده ══ */
console.log("▸ ٦) الوصل");
const repoTs = src("src/lib/repo.ts");
check("repo.ts لا يستورد بابَ الشراء بالعملتين (حزمةُ الإقلاع)", !/purchaseFxApi|demoPurchaseFx/.test(repoTs));
check("  والمرآةُ تُحمَّل من repoDemo وحده", /export const loadDemoPurchaseFx = \(\) => import\("\.\/demoPurchaseFx"\)/.test(src("src/lib/repoDemo.ts")));
check("  وقسمُ الحزمة على القاعدة موجود بالأرقام نفسِها", /▸ 0274: الشراءُ بالعملتين/.test(src("supabase/tests/run.sh")) && /USD\|1470\.0000\|55\.00\|10\.00\|2\.00\|80850\.00\|2940\.00\|14700\.00\|partial/.test(src("supabase/tests/run.sh")));

console.log(fails ? `✗ usd-purchase-test: ${fails} فشل من ${passes + fails}` : `✓ usd-purchase-test: ${passes} فحصاً عبرت`);
process.exit(fails ? 1 : 0);
