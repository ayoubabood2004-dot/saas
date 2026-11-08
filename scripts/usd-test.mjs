/* ============================================================================
 * الدولار (0264) بسلوكه على المرآة التجريبية — نفسُ أرقام مثال المالك بالحزمة (run.sh ▸ 0264)، فالتجريبيُّ والخادمُ
 * يقولان الرقمَ نفسَه، والحرّاسُ نفسُها (docs/usd-plan.md):
 *   أ) A: ٢٠ × ٥٠$ بسعر ١٤٦٠ دَيناً ⇒ ١٬٤٦٠٬٠٠٠، تُسدَّد كاملةً بسعر ١٤٨٠ ⇒ ١٬٤٨٠٬٠٠٠ للدرج = حصّةٌ + ٢٠٬٠٠٠ فرق.
 *   ب) B: ١٬٠٠٠$ بسعر ١٤٥٠، جزئيٌّ ٤٠٠$ بسعر ١٤٧٠ ثمّ ٦٠٠$ بسعر ١٤٤٠ — الإغلاقُ بالعملتين، والفرقُ موجبٌ وسالب.
 *   ج) C/D: رخيصٌ بالكمية بالدينار الكامل، والنقدُ تسديدٌ بفرق الخطوة، وإغلاقٌ بصفر، وجزئيٌّ صفرٌ يُرفض.
 *   د) الأبواب: مادّةُ الدولار بفاتورة دينار، وتسديدُ الدينار والإرجاعُ والحذفُ على فاتورة الدولار — كلُّها تُرفض.
 *   هـ) الصلاحيات والمفتاح والسياج و«القراءة فقط»، والإلغاءُ والحذف، والربحُ المحقَّق بتقرير القبض والأرباح والخسائر.
 *   و) البنية: البابُ كسول (لا يستورده الإقلاع)، والمرآةُ تحسب بـusdMath نفسِه (لا نسخة).
 * ========================================================================= */

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
const src = (f) => readFileSync(f, "utf8");
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const keyOf = (file, re) => {
  const k = re.exec(src(file))?.[1];
  if (!k) { console.error(`✗ usd-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);

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
      'export { usdApi } from "./src/lib/usdApi.ts";',
      'export { pnlApi } from "./src/lib/pnlApi.ts";',
      'export * as U from "./src/lib/usdMath.ts";',
      'export { registerConfigReadOnlyChecker } from "./src/lib/clinicSync.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "usd-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "usd-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, usdApi, pnlApi, registerConfigReadOnlyChecker, U } = mod;
if (!repo || !usdApi || !pnlApi || !registerConfigReadOnlyChecker || !U) { console.error("✗ usd-test: ما انحمّلت الوحدات"); process.exit(1); }
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code; } };
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: ["clinic"], clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: "clinic",
}));
const sumLegs = (inv) => (inv.payment_details ?? []).reduce((s, l) => s + l.amount, 0);
const legsTxt = (inv) => (inv.payment_details ?? []).map((l) => `${l.kind ?? "pay"}:${l.amount}`).join(",");
const invOf = async (id) => (await repo.listInvoicesByIds([id]))[0];

/* ── قراءةُ ما يُكتب ──────────────────────────────────────────────────────── */
console.log("▸ قراءةُ المبلغ والسعر كما يُكتبان");
check("أرقامٌ شرقية وفاصلُ آلافٍ عربيّ وفاصلةٌ عشرية عربية: «١٬٢٣٤٫٥» = 1234.50$، و«1,234.505» تُقرَّب لـ1234.51",
  U.centsOf("١٬٢٣٤٫٥") === 123450n && U.centsOf("1,234.505") === 123451n && U.centsOf(" 12 ") === 1200n);
check("  والفراغُ والنصُّ ليسا مبلغاً (null لا صفر)، و«سعر ١٠٠» بكسرٍ يُقرَّب بمنزلتين",
  U.centsOf("") === null && U.centsOf("abc") === null && U.centsOf(".") === null && U.rateOfPer100("١٤٦٠٠٠٫٠٠٥") === 14_600_001n);
check("  وفاصلةٌ ليست فاصلَ آلاف («12,5» أو «1,23») ليست مبلغاً — لا ١٢٥$ بصمت؛ و«146,000» و«١٤٦٬٠٠٠» سعرُ مئةٍ صحيح",
  U.centsOf("12,5") === null && U.centsOf("1,23") === null && U.centsOf(",500") === null && U.rateOfPer100("146,000") === 14_600_000n && U.rateOfPer100("١٤٦٬٠٠٠") === 14_600_000n);
check("  والعرضُ بالأرقام الغربية: $1,234.5 ⇒ «$1,234.50»، والصحيحُ بلا كسور، والسالبُ بإشارته",
  U.usdText(123450n) === "$1,234.50" && U.usdText(100000n) === "$1,000" && U.usdText(-250n) === "-$2.50");

/* ── أ) A ─────────────────────────────────────────────────────────────────── */
console.log("▸ مثالُ المالك A: دَينٌ بسعر ١٤٦٠ يُسدَّد بسعر ١٤٨٠");
as("m1", "admin");
const kit = await repo.createProduct({ name: "Kitcat USD", barcode: "USD-T-1", stock: 100, purchase_price: 0, sell_price: 0, min_stock: 0,
  price_currency: "USD", sell_price_usd: 50, purchase_price_usd: 45 });
const sand = await repo.createProduct({ name: "رمل بالدينار", barcode: "IQD-T-2", stock: 10, purchase_price: 500, sell_price: 1000, min_stock: 0 });
const noPrice = await repo.createProduct({ name: "بلا سعر دولار", barcode: "USD-T-3", stock: 5, purchase_price: 0, sell_price: 0, min_stock: 0, price_currency: "USD" });
check("المفتاحُ مطفأ: السعرُ والبيعُ يُرفضان", await errOf(() => usdApi.setRate("146000")) === "usd_disabled"
  && await errOf(() => usdApi.checkout([{ product_id: kit.id, qty: 1 }], { fx_rate_id: "x", paid_usd: "0", payment_method: "cash", client_ref: "u-x" })) === "usd_disabled");
as("r1", "reception");
check("  والاستقبالُ ما يفعّله (للمدير)", await errOf(() => usdApi.setPrefs(true)) === "usd_prefs_manager");
as("m1", "admin");
const st0 = await usdApi.setPrefs(true, 250);
check("  والمديرُ يفعّله بخطوة ٢٥٠، بلا سعرٍ بعد", st0.enabled === true && st0.step === 250 && st0.rate === null);
check("  وخطوةٌ خارج القائمة تُرفض", await errOf(() => usdApi.setPrefs(null, 333)) === "usd_step_bad");
as("r1", "reception");
check("الاستقبالُ ما يحدّد السعر (قرار ٣)", await errOf(() => usdApi.setRate("146000")) === "usd_rate_manager");
as("m1", "admin");
const r146 = await usdApi.setRate("146000");
check("  والمديرُ بـ«سعر ١٠٠ دولار» ⇒ ١٤٦٠٫٠٠٠٠ للدولار", r146.rate === "1460.0000" && r146.rate1e4 === 14_600_000n);
check("  و١٤٦٠ بخانة المئة يُرفض (سعرٌ مخلوط)", await errOf(() => usdApi.setRate("1460")) === "usd_rate_bad");
check("  وusd_state يرجع السعرَ نفسَه", (await usdApi.state()).rate?.id === r146.id);
const meta = (ref, o = {}) => ({ fx_rate_id: r146.id, paid_usd: "0", payment_method: "cash", client_ref: ref, ...o });
check("البيعُ يرفض معرّفَ سعرٍ قديم", await errOf(() => usdApi.checkout([{ product_id: kit.id, qty: 20 }], meta("u-old", { fx_rate_id: "old" }))) === "usd_rate_changed");
const A = await usdApi.checkout([{ product_id: kit.id, qty: 20, unit_price_usd: "50" }], meta("u-a", { customer_name: "أبو علي" }));
check("  A دَيناً ⇒ ١٬٤٦٠٬٠٠٠ دينار، مختومةٌ بالدولار، والكلفةُ ٤٥$ × ١٤٦٠ والربحُ ١٤٦٬٠٠٠",
  A.total === 1460000 && A.currency === "USD" && A.fx_rate === 1460 && A.total_usd === 1000 && A.paid_usd === 0 && A.amount_paid === 0 && A.cost_total === 1314000 && A.profit === 146000,
  JSON.stringify({ t: A.total, c: A.cost_total, p: A.profit, u: A.total_usd }));
const itA = (await repo.listInvoiceItems(A.id))[0];
check("  وسطرُها ٧٣٬٠٠٠ = ٥٠$ والكلفةُ ٦٥٬٧٠٠ = ٤٥$، والرصيدُ نزل ٢٠",
  itA.unit_price === 73000 && itA.unit_price_usd === 50 && itA.unit_cost === 65700 && itA.unit_cost_usd === 45 && (await repo.listProducts()).find((p) => p.id === kit.id).stock === 80);
check("  والإعادةُ بنفس المرجع فاتورةٌ واحدة", (await usdApi.checkout([{ product_id: kit.id, qty: 20 }], meta("u-a"))).id === A.id);
check("  وما يُرفض: خلطُ دينار، سطرٌ مكرّر، بلا سعر، جزئيٌّ ساعةَ البيع، كميةٌ كسرية",
  await errOf(() => usdApi.checkout([{ product_id: kit.id, qty: 1 }, { product_id: sand.id, qty: 1 }], meta("u-m"))) === "usd_mixed"
  && await errOf(() => usdApi.checkout([{ product_id: kit.id, qty: 1 }, { product_id: kit.id, qty: 2 }], meta("u-d"))) === "usd_duplicate_line"
  && await errOf(() => usdApi.checkout([{ product_id: noPrice.id, qty: 1 }], meta("u-n"))) === "usd_no_price"
  && await errOf(() => usdApi.checkout([{ product_id: kit.id, qty: 20 }], meta("u-p", { paid_usd: "10" }))) === "usd_partial_at_sale"
  && await errOf(() => usdApi.checkout([{ product_id: kit.id, qty: 1.5 }], meta("u-q"))) === "usd_qty");

/* ── د) الأبواب ─────────────────────────────────────────────────────────────── */
console.log("▸ البابان: لا دينارَ على الدولار ولا دولارَ بالدينار");
check("مادّةُ الدولار بفاتورة دينار تُرفض، والدينارُ العاديّ يمرّ",
  await errOf(() => repo.retailCheckout([{ product_id: kit.id, name: "Kitcat USD", qty: 1, unit_price: 1000, unit_cost: 0, service_id: null }], { client_ref: "iqd-u1" })) === "usd_product_in_iqd"
  && (await repo.retailCheckout([{ product_id: sand.id, name: "رمل", qty: 1, unit_price: 1000, unit_cost: 0, service_id: null }], { client_ref: "iqd-u2" })).total === 1000);
check("  وتسديدُ الدينار والإرجاعُ والحذفُ والتعديلُ العاديّ على فاتورة الدولار تُرفض",
  await errOf(() => repo.settleInvoice(A.id, 1000, "cash")) === "usd_door" && await errOf(() => repo.refundInvoice(A.id)) === "usd_door"
  && await errOf(() => repo.deleteInvoice(A.id)) === "usd_door" && await errOf(() => repo.editInvoiceLines(A.id, [])) === "usd_door");

/* ── التسديد ────────────────────────────────────────────────────────────── */
console.log("▸ التسديد بالدينار: الحصّةُ بنسبة الفاتورة، والفرقُ «فرق صرف»");
as("r1", "reception");
check("الاستقبالُ بسعرٍ غير سعر اليوم يُرفض (قرار ٤)", await errOf(() => usdApi.settle(A.id, "100", "140000", "cash", "1000")) === "usd_rate_override");
as("m1", "admin");
await usdApi.setRate("148000");
as("r1", "reception");
const sa = await usdApi.settle(A.id, "1000", "148000", "cash", "1000");
check("  A تُسدَّد ١٬٠٠٠$ بسعر اليوم ⇒ ١٬٤٨٠٬٠٠٠ = ١٬٤٦٠٬٠٠٠ حصّة + ٢٠٬٠٠٠ فرق",
  sa.settlement.received === 1480000 && sa.settlement.share === 1460000 && sa.settlement.fx === 20000);
const A2 = await invOf(A.id);
check("    مغلقةٌ بالعملتين وحالتُها paid، وسِيَقُها حصّةٌ وفرقٌ معلَّم",
  A2.total_usd - A2.paid_usd === 0 && A2.total - A2.amount_paid === 0 && A2.status === "paid" && legsTxt(A2) === "pay:1460000,fx:20000", legsTxt(A2));
as("m1", "admin");
const r145 = await usdApi.setRate("145000");
const B = await usdApi.checkout([{ product_id: kit.id, qty: 20 }], { ...meta("u-b"), fx_rate_id: r145.id, customer_name: "أم حسن" });
check("B: ١٬٠٠٠$ بسعر ١٤٥٠ ⇒ ١٬٤٥٠٬٠٠٠", B.total === 1450000 && B.fx_rate === 1450);
await usdApi.setRate("147000");
const sb1 = await usdApi.settle(B.id, "400", "147000", "cash", "1000", null, "set-b1");
check("  ٤٠٠$ بسعر ١٤٧٠ ⇒ ٥٨٨٬٠٠٠ = ٥٨٠٬٠٠٠ حصّة + ٨٬٠٠٠ فرق، والإعادةُ بنفس المرجع تسديدٌ واحد",
  sb1.settlement.received === 588000 && sb1.settlement.share === 580000 && sb1.settlement.fx === 8000
  && (await usdApi.settle(B.id, "400", "147000", "cash", "1000", null, "set-b1")).settlement.id === sb1.settlement.id
  && (await usdApi.settlements([B.id])).length === 1 && (await invOf(B.id)).paid_usd === 400 && (await invOf(B.id)).status === "partial");
check("  وما يُرفض: أكثرُ من الباقي، وباقٍ تغيّر من جهازٍ ثاني",
  await errOf(() => usdApi.settle(B.id, "700", "147000", "cash", "600")) === "usd_over" && await errOf(() => usdApi.settle(B.id, "100", "147000", "cash", "1000")) === "usd_due_changed");
await usdApi.setRate("144000");
const sb2 = await usdApi.settle(B.id, "600", "144000", "transfer", "600", null, "set-b2");
const B2 = await invOf(B.id);
check("  ثمّ ٦٠٠$ بسعر ١٤٤٠ ⇒ ٨٦٤٬٠٠٠ = ٨٧٠٬٠٠٠ باقي − ٦٬٠٠٠ خسارة، ومغلقةٌ بالعملتين، والدرجُ ١٬٤٥٢٬٠٠٠",
  sb2.settlement.fx === -6000 && B2.total_usd - B2.paid_usd === 0 && B2.total - B2.amount_paid === 0 && sumLegs(B2) === 1452000, String(sumLegs(B2)));
const day = { from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() };
const pnl = await pnlApi.report(day.from, day.to, "Asia/Baghdad");
check("الأرباح والخسائر: «فرق سعر الصرف» = ٢٠٬٠٠٠ + ٨٬٠٠٠ − ٦٬٠٠٠ = ٢٢٬٠٠٠، والصافي يحمله", pnl.total.fx === 22000 && pnl.total.net === pnl.total.gross + 22000 - pnl.total.expenses, String(pnl.total.fx));
const rec = await repo.reportReceiptsTotal(day);
check("  والقبضُ: ما دخل الدرجَ كلُّه (١٬٤٨٠٬٠٠٠ + ١٬٤٥٢٬٠٠٠ + ١٬٠٠٠ دينار)، والربحُ المحقَّق يحمل الفرق كاملاً",
  rec.gross === 1480000 + 1452000 + 1000 && Math.abs(rec.net - (146000 + 20000 + 145000 + 2000 + 500)) < 0.01, JSON.stringify(rec));

/* ── الإلغاء والحذف ─────────────────────────────────────────────────────── */
console.log("▸ الإلغاءُ والحذف");
as("r1", "reception");
check("إلغاءُ تسديدٍ للمدير وحده", await errOf(() => usdApi.voidSettlement(sb2.settlement.id, "غلط")) === "usd_void_manager");
as("m1", "admin");
check("  وبلا سبب يُرفض", await errOf(() => usdApi.voidSettlement(sb2.settlement.id, "  ")) === "usd_void_reason");
const v2 = await usdApi.voidSettlement(sb2.settlement.id, "غلط بالسعر");
check("  ويُعكس بساقين سالبتين، والمسدَّدُ يرجع ٤٠٠$ والباقي ٨٧٠٬٠٠٠، وإلغاءٌ ثانٍ يُرفض",
  v2.invoice.paid_usd === 400 && v2.invoice.total - v2.invoice.amount_paid === 870000 && v2.invoice.status === "partial"
  && legsTxt(v2.invoice).endsWith("pay:-870000,fx:6000") && await errOf(() => usdApi.voidSettlement(sb2.settlement.id, "ثانية")) === "usd_already_void", legsTxt(v2.invoice));
check("حذفُ فاتورة الدولار بتسديدٍ حيّ يُرفض", await errOf(() => usdApi.deleteInvoice(B.id)) === "usd_delete_settled");
await usdApi.voidSettlement(sb1.settlement.id, "غلط");
await usdApi.deleteInvoice(B.id);
check("  وبعد إلغاء تسديدها تنحذف ورصيدُها يرجع (١٠٠ − ٢٠ لـA)", (await repo.listInvoicesByIds([B.id])).length === 0 && (await repo.listProducts()).find((p) => p.id === kit.id).stock === 80);
check("  والإطفاءُ يُرفض ما دامت موادٌّ بالدولار", await errOf(() => usdApi.setPrefs(false)) === "usd_in_use");

/* ── ج) C/D ───────────────────────────────────────────────────────────────── */
console.log("▸ الرخيصُ بالكمية، والنقدُ بفرق الخطوة، والإغلاقُ بصفر");
const r146b = await usdApi.setRate("146000");
const treat = await repo.createProduct({ name: "Treat USD", barcode: "USD-T-4", stock: 1000, purchase_price: 0, sell_price: 0, min_stock: 0, price_currency: "USD", sell_price_usd: 0.4, purchase_price_usd: 0.25 });
const tiny = await repo.createProduct({ name: "Tiny USD", barcode: "USD-T-5", stock: 100, purchase_price: 0, sell_price: 0, min_stock: 0, price_currency: "USD", sell_price_usd: 0.08, purchase_price_usd: 0 });
const m2 = (ref, o = {}) => ({ fx_rate_id: r146b.id, paid_usd: "0", payment_method: "cash", client_ref: ref, ...o });
const C1 = await usdApi.checkout([{ product_id: treat.id, qty: 100 }], m2("u-c1", { customer_name: "أبو حسن" }));
check("C: ١٠٠ × ٠٫٤٠$ ⇒ ٥٨٬٤٠٠ بالضبط (الوحدة ٥٨٤ — لا ٥٠٠ بخطوة ٢٥٠)", C1.total === 58400 && (await repo.listInvoiceItems(C1.id))[0].unit_price === 584);
const C2 = await usdApi.checkout([{ product_id: treat.id, qty: 3 }], m2("u-c2", { paid_usd: "1.20", payment_method: "card" }));
const sc2 = await usdApi.settlements([C2.id]);
check("  نقداً ٣ × ٠٫٤٠$ = ١٬٧٥٢ قيمةً: الدرجُ ١٬٧٥٠ والفرقُ −٢، مدفوعةٌ بالعملتين بطريقة البطاقة",
  C2.total === 1752 && C2.amount_paid === 1752 && C2.paid_usd === 1.2 && C2.status === "paid" && C2.payment_method === "card"
  && sc2.length === 1 && sc2[0].received === 1750 && sc2[0].fx === -2 && sumLegs(C2) === 1750, JSON.stringify({ ...sc2[0] }));
const Dv = await usdApi.checkout([{ product_id: tiny.id, qty: 1 }], m2("u-d", { customer_name: "أم علي" }));
check("D: ٠٫٠٨$ ⇒ ١١٧؛ جزئيٌّ ٠٫٠٥$ يطلع صفراً فيُرفض", Dv.total === 117 && await errOf(() => usdApi.settle(Dv.id, "0.05", "146000", "cash", "0.08")) === "usd_too_small");
const sd = await usdApi.settle(Dv.id, "0.08", "146000", "cash", "0.08");
check("  والإغلاقُ يمرّ بصفرٍ للدرج: حصّةٌ ١١٧ وفرقٌ −١١٧، ومغلقةٌ بالعملتين", sd.settlement.received === 0 && sd.settlement.share === 117 && sd.settlement.fx === -117
  && sd.invoice.status === "paid" && sd.invoice.total - sd.invoice.amount_paid === 0);
check("  وخصمٌ كامل يأخذ الدينارَ كلَّه (لا ديناراً معلَّقاً على فاتورةٍ صفرٍ بالدولار)",
  (await usdApi.checkout([{ product_id: treat.id, qty: 7, unit_price_usd: "0.33" }], m2("u-fd", { discount_usd: "99999" }))).total === 0);

/* ── هـ) السياج و«القراءة فقط» ─────────────────────────────────────────────── */
console.log("▸ السياجُ و«القراءة فقط»");
as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" });
check("المصوّرُ لا يرى (مطفأ بلا سعر) ولا يكتب", (await usdApi.state()).enabled === false && await errOf(() => usdApi.setRate("146000")) === "photographer_forbidden"
  && (await usdApi.settlements([C2.id])).length === 0);
as("m1", "admin");
registerConfigReadOnlyChecker(() => true);
check("اشتراكٌ منتهٍ: الكتابةُ ReadOnlyError والقراءةُ تمرّ", await errOf(() => usdApi.setRate("146000")) === "READ_ONLY" && (await usdApi.state()).enabled === true);
registerConfigReadOnlyChecker(() => false);

/* ── و) البنية ─────────────────────────────────────────────────────────────── */
console.log("▸ البنية");
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
  const statics = walk("src").filter((f) => !f.endsWith("usdApi.ts") && !f.endsWith("demoUsd.ts") && /from\s+["'](@\/lib|\.)\/usdApi["']/.test(code(f)) && !/import\s+type\s/.test(code(f).match(/[^\n]*from\s+["'](?:@\/lib|\.)\/usdApi["'][^\n]*/)?.[0] ?? ""));
  check("البابُ كسول: لا استيرادَ ثابتاً لـusdApi (إلا «import type»)", statics.length === 0, statics.join("، "));
  const dm = code("src/lib/demoUsd.ts");
  check("والمرآةُ تحسب بـusdMath نفسِه (cartTotals/shareOf/iqdOf) لا بنسخة", /from "\.\/usdMath"/.test(dm) && /cartTotals\(/.test(dm) && /shareOf\(/.test(dm) && /iqdOf\(/.test(dm) && !/Math\.round/.test(dm));
  check("والتجريبيُّ يحمّلها من باب repoDemo وحده", /loadDemoUsd = \(\) => import\("\.\/demoUsd"\)/.test(code("src/lib/repoDemo.ts")));
}

console.log(fails ? `\n✗ usd-test: ${passes} نجح، ${fails} فشل` : `\n✓ usd-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
