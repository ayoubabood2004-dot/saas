/* ============================================================================
 * الديونُ القديمة (0271) — المرآةُ التجريبية بسلوكها، وكلُّ مكانٍ يستثنيها من المبيعات بالنصّ.
 *
 * «حارسٌ لا يوجد بالتجريبيّ حارسٌ لم يُفحص» (CLAUDE.md §٤): فحرّاسُ old_debt_add ومحفّزاتُ الشكل (لا ترجيع، لا أسطر،
 * الحذفُ بلا تسديد، الربحُ صفرٌ بالخصم) تُفحص هنا على demoOldDebt.ts وrepoDemo.ts الحقيقيّتين — والحزمةُ تفحصها على القاعدة
 * (قسمُ 0271 بـrun.sh) بالحالات نفسِها. ثمّ الوصل: كلُّ قارئٍ مسمّى بالخطّة يستثني opening، والقطعةُ كسولةٌ بنطاقها، والبابُ
 * خارج حزمة الإقلاع، والزرُّ للمدير.
 *
 *   node scripts/old-debt-test.mjs
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

/* ---- مخزنٌ بالذاكرة مكانَ localStorage ---------------------------------------- */
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
      'export { addOldDebt } from "./src/lib/oldDebtApi.ts";',
      'export { demoUsdPrefs, demoUsdRateSet, demoUsdSettle } from "./src/lib/demoUsd.ts";',
      'export { forgiveCaps, forgivePreview, validateForgive } from "./src/lib/debtForgive.ts";',
      'export { computePnl } from "./src/lib/pnl.ts";',
      'export { receiptsOf, isOpening } from "./src/lib/debt.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "old-debt-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(join(tmpdir(), "old-debt-"));
const file = join(dir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const repo = M.repo ?? M.demoRepo;
if (!repo || !M.addOldDebt) { console.error("✗ old-debt-test: ما انحمّلت الوحدة"); process.exit(1); }

const DB_KEY = /export const DEMO_DB_KEY = "([^"]+)"/.exec(src("src/lib/demoKey.ts"))?.[1];
if (!DB_KEY) { console.error("✗ old-debt-test: ما انقرأ مفتاحُ مخزن الديمو"); process.exit(1); }
mem.set(DB_KEY, JSON.stringify({ products: [], companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [] }));
const db = () => JSON.parse(mem.get(DB_KEY));
const as = (role) => (role === "manager" ? mem.delete("vp_session")
  : mem.set("vp_session", JSON.stringify({ raw: { id: "u-" + role, full_name: "موظف", rawRole: role } })));
const codeOf = async (p) => { try { await p; return "ok"; } catch (e) { return String(e?.message ?? e); } };
const baghdadToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const daysAgo = (n) => { const d = new Date(`${baghdadToday()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const add = (o) => M.addOldDebt({ name: "ابو علي", phone: "07701110000", what: "علاج كلب", why: "قبل النظام", amount: "50000", currency: "IQD", date: daysAgo(30), clientRef: "od-1", ...o });

/* ══ ١) الباب: المديرُ وحده، والشكل، والمرجع، والرفض بجمله ══ */
console.log("▸ ١) old_debt_add بالتجريبيّ — حرّاسُ الخادم بترتيبها");
as("reception");
check("الاستقبالُ يُرفض (old_debt_manager)", (await codeOf(add({ clientRef: "od-r" }))) === "old_debt_manager");
as("manager");
const d1 = await add({ what: " علاج  كلب " });
check("المديرُ يكتب: opening بلا ربحٍ ولا كلفةٍ ولا قطع، مدفوعُه صفر، بلا طريقة دفعٍ ولا سِيَق، و«شنو» مطويّ",
  d1.sale_kind === "opening" && d1.total === 50000 && d1.profit === 0 && d1.cost_total === 0 && d1.item_count === 0 && d1.amount_paid === 0
  && d1.payment_method === null && Array.isArray(d1.payment_details) && d1.payment_details.length === 0 && d1.opening_what === "علاج كلب" && d1.opening_why === "قبل النظام",
  JSON.stringify(d1));
check("  يومُه ظهراً ببغداد وختمُ الإدخال الآن", d1.created_at === new Date(`${daysAgo(30)}T12:00:00+03:00`).toISOString() && !!d1.recorded_at && Math.abs(Date.parse(d1.recorded_at) - Date.now()) < 60000);
const again = await add({ what: "غيره", amount: "99" });
check("  المرجعُ نفسُه يُرجع الدينَ نفسَه، ودينٌ واحد بالمخزن", again.id === d1.id && db().invoices.filter((i) => i.sale_kind === "opening").length === 1);
const d2 = await add({ name: "ام حسن", phone: null, what: "لقاح", why: null, amount: "30000", date: null, clientRef: "od-2" });
check("  اليوم ⇒ الآن بلا ختم إدخال", Math.abs(Date.parse(d2.created_at) - Date.now()) < 60000 && d2.recorded_at === null);
const tomorrow2 = (() => { const d = new Date(`${baghdadToday()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })();
const refusals = [
  ["date", { date: tomorrow2 }], ["date", { date: "1999-12-31" }], ["what", { what: "  " }], ["customer", { name: " ", phone: " " }],
  ["amount", { amount: "0" }], ["amount", { amount: "abc" }], ["currency", { currency: "EUR" }], ["long", { what: "x".repeat(201) }],
];
for (const [c, o] of refusals) check(`  يُرفض old_debt_${c} (${JSON.stringify(o).slice(0, 40)})`, (await codeOf(add({ clientRef: null, ...o }))) === `old_debt_${c}`);

/* ══ ٢) حرّاسُ الشكل بعد الإدراج — كمحفّزات القاعدة ══ */
console.log("▸ ٢) لا ترجيع، لا أسطر، الحذفُ بلا تسديد، والربحُ صفرٌ بالخصم");
as("reception");
check("الترجيعُ (بلا فحص دور كالخادم) يُرفض opening_no_refund", (await codeOf(repo.refundInvoice(d1.id))) === "opening_no_refund");
as("manager");
check("  والمرتجعُ الكامل كذلك", (await codeOf(repo.returnInvoiceItems(d1.id, [{ item_id: "x", qty: 1 }]))) === "opening_no_refund");
check("  وتعديلُ البنود يُرفض opening_no_lines", (await codeOf(repo.editInvoiceLines(d1.id, [{ name: "x", qty: 1, unit_price: 100, unit_cost: 0 }]))) === "opening_no_lines");
check("  (والدينُ كما هو: مدفوعٌ صفر وحالتُه مدفوعة)", (() => { const i = db().invoices.find((x) => x.id === d1.id); return i.status === "paid" && i.total === 50000; })());
as("reception");
await repo.settleInvoice(d1.id, 20000, "cash");
const s1 = db().invoices.find((x) => x.id === d1.id);
check("التسديد: الاستقبالُ يسدّد ٢٠٬٠٠٠ بيومه (ساقٌ مختومةٌ الآن)، والباقي ٣٠٬٠٠٠",
  s1.amount_paid === 20000 && s1.payment_details.length === 1 && Math.abs(Date.parse(s1.payment_details[0].at) - Date.now()) < 60000 && s1.total - s1.amount_paid === 30000);
check("  والقبضُ يقرؤه بيومه لا بيوم الدين (receiptsOf)", (() => { const r = M.receiptsOf(s1); return r.length === 1 && r[0].amount === 20000 && r[0].at === s1.payment_details[0].at; })());
as("manager");
check("الحذف: عليه تسديد ⇒ opening_delete_settled", (await codeOf(repo.deleteInvoice(d1.id))) === "opening_delete_settled");
as("reception");
check("  والاستقبالُ لا يحذف أصلاً", (await codeOf(repo.deleteInvoice(d2.id))).startsWith("forbidden"));
as("manager");
check("  وبلا تسديد يُحذف", (await codeOf(repo.deleteInvoice(d2.id))) === "ok" && !db().invoices.some((x) => x.id === d2.id));

/* الخصم: بلا سقف الربح (المديرُ يكفي)، والربحُ صفرٌ بعده وبعد إلغائه. */
const caps = M.forgiveCaps(s1, 100, 0);
check("المرآة: سقفُ الخصم لدينٍ قديم = المتبقّي كلُّه، وبلا «خسارة»", caps.opening && caps.allowedWithin === 30000 && M.forgivePreview(caps, 30000).loss === 0 && !M.forgivePreview(caps, 30000).aboveCap);
const pinActor = { signedIn: true, operator: false, role: "manager", base: "receptionist", pin: true };
check("  والمفتاحُ الحيّ (استقبالٌ بمفتاح المدير) يكفي — لا «يحتاج صاحبَ العيادة»",
  M.validateForgive({ actor: pinActor, inv: s1, openDelivery: false, pct: 50, amount: 10000, reason: "hardship", note: null, expectDue: 30000, pay: 0, confirmLoss: false }).ok === true);
check("  وبيعةٌ عاديّةٌ بلا ربحٍ تبقى تحتاجه (السقفُ لم يُرخَ لغيرها)",
  M.validateForgive({ actor: pinActor, inv: { ...s1, sale_kind: "retail" }, openDelivery: false, pct: 50, amount: 10000, reason: "hardship", note: null, expectDue: 30000, pay: 0, confirmLoss: false }).code === "above_profit_needs_owner");
const f1 = await repo.forgiveInvoiceDebt(d1.id, { amount: 10000, reason: "hardship", note: null, expectDue: 30000, pay: 0, method: "cash", confirmLoss: false });
check("  الخصم ١٠٬٠٠٠: الإجماليُّ ٤٠٬٠٠٠ والمخصومُ ١٠٬٠٠٠ والربحُ صفر (لا سالب)", f1.total === 40000 && f1.forgiven === 10000 && f1.profit === 0, JSON.stringify({ t: f1.total, f: f1.forgiven, p: f1.profit }));
const entry = db().invoiceForgiveness.find((r) => r.invoice_id === d1.id);
const v1 = await repo.voidInvoiceForgiveness(entry.id, "غلط");
check("  وإلغاؤه يرجع ٥٠٬٠٠٠ والربحُ صفر", v1.total === 50000 && v1.forgiven === 0 && v1.profit === 0);

/* ══ ٣) الدولار ══ */
console.log("▸ ٣) الدينُ القديم بالدولار — دينارُه الكامل بسعر اليوم، والمطفأُ يُرفض");
check("الدولار مطفأ ⇒ usd_disabled", (await codeOf(add({ currency: "USD", amount: "100", clientRef: "odu-0" }))) === "usd_disabled");
await M.demoUsdPrefs(true, 250);
await M.demoUsdRateSet("146000", null);
const u1 = await add({ currency: "USD", amount: "100", what: "علف", clientRef: "odu-1" });
check("١٠٠$ بسعر ١٤٦٠ ⇒ ١٤٦٬٠٠٠ دينار، USD وباقيه ١٠٠$", u1.currency === "USD" && u1.total === 146000 && u1.total_usd === 100 && u1.paid_usd === 0 && u1.fx_rate === 1460, JSON.stringify(u1));
const us = await M.demoUsdSettle(u1.id, "40", "146000", "cash", "100", null, "odu-s1");
check("  تسديد ٤٠$: الحصّةُ ٥٨٬٤٠٠ والفرقُ ١٠٠ (الدرجُ ٥٨٬٥٠٠ بخطوة ٢٥٠)", us.settlement.share === 58400 && us.settlement.fx === 100 && us.invoice.amount_paid === 58400, JSON.stringify(us.settlement));

/* ══ ٤) التقارير بالتجريبيّ: ليس بيعاً، وتسديدُه قبضٌ ══ */
console.log("▸ ٤) القارئات التجريبية تستثنيه — والقبضُ يبقى");
const RNG = { from: new Date(Date.now() - 399 * 86400000).toISOString(), to: new Date(Date.now() + 86400000).toISOString() };
check("المبيعاتُ حسب الموظف: لا شيء (لا بيع)", (await repo.reportStaff(RNG)).length === 0);
check("  وعددُ الفواتير صفر", (await repo.countInvoices()) === 0);
const today = { from: new Date(Date.now() - 3600000).toISOString(), to: new Date(Date.now() + 3600000).toISOString() };
const tot = await repo.reportReceiptsTotal(today);
check("  والقبضُ اليوم ٢٠٬٠٠٠ + ٥٨٬٤٠٠ + فرق ١٠٠، صافيه الفرقُ وحده، وعدُّ «المبيعات» صفر", tot.gross === 78500 && tot.net === 100 && tot.invoices === 0, JSON.stringify(tot));
const pnl = M.computePnl({ invoices: db().invoices, items: [], consumption: [], expenses: [], categories: [] }, RNG.from, RNG.to, "Asia/Baghdad");
check("  والأرباحُ والخسائر: لا فاتورةَ ولا إيراد، وفرقُ صرف تسديده ١٠٠", pnl.total.invoices === 0 && Number(pnl.total.revenue) === 0 && Number(pnl.total.fx) === 100, JSON.stringify(pnl.total));

/* ══ ٥) الوصل بالنصّ ══ */
console.log("▸ ٥) كلُّ قارئٍ مسمّى يستثنيه، والقطعةُ كسولة، والبابُ خارج الإقلاع، والزرُّ للمدير");
const hub = src("src/pages/AnalyticsHub.tsx");
check("التحليلات: invInRange (نقطةُ المبيعات الواحدة) تُسقط opening", /const invInRange = useMemo\(\(\) => invInRangeAll\.filter\(\(i\) => !isOpening\(i\)\)/.test(hub));
check("  ومقارنةُ الأمس تُسقطه", /=== "refunded" \|\| isOpening\(i\)\) continue;/.test(hub));
const coll = hub.slice(hub.indexOf("const collectionsInRange = useMemo("), hub.indexOf("}, [invoices, lo, hi, tsOk]);", hub.indexOf("const collectionsInRange = useMemo(")));
check("  وcollectionsInRange لا تُسقطه (التسديدُ قبضٌ حقيقيّ)", coll.length > 200 && !/isOpening|opening/.test(coll));
const led = src("src/components/reports/CustomerLedger.tsx");
check("سجل العملاء: الإنفاقُ بلا الدين القديم، والدفترُ: الشراءُ بلاه والمتبقّي معه، ولا قلمَ تعديلٍ عليه",
  /for \(const inv of inRange\) \{\s*if \(isOpening\(inv\)\) continue;/.test(led) && /const sales = live\.filter\(\(i\) => !isOpening\(i\)\);/.test(led)
  && /due: live\.reduce/.test(led) && /!refunded && canEdit && !isOpening\(inv\)/.test(led));
const dash = src("src/pages/Dashboard.tsx");
check("اللوحة: زياراتُ اليوم ورسمُ الأسبوع بلاه", (dash.match(/sale_kind !== "opening"/g) ?? []).length === 2);
check("مبيعاتُ الحيوان بلاه", /sale_kind !== "opening"\)/.test(src("src/components/PetSalesWidget.tsx")));
check("عدّادُ الفواتير (السحابة) بلاه", /select\("id", \{ count: "exact", head: true \}\)\.neq\("sale_kind", "opening"\)/.test(src("src/lib/repo.ts")));
const demo = src("src/lib/repoDemo.ts");
check("المرآة التجريبية: الموظفون والأكثرُ مبيعاً والعدّاد وعدُّ فواتير القبض", ["reportStaff", "reportTopProducts", "countInvoices", "reportReceiptsTotal"].every((f) => new RegExp(`async ${f}\\([\\s\\S]{0,900}isOpeningInv`).test(demo))
  && /if \(!isOpeningInv\(inv\)\) cur\.ids\.add\(inv\.id\)/.test(demo));
check("الأرباح والخسائر (computePnl) يُسقطه من الإيراد ولا يُسقط فرقَ صرفه", /=== "refunded" \|\| inv\.sale_kind === "opening"\) continue;/.test(src("src/lib/pnl.ts")));
const ret = src("src/components/retail/ReturnsPanel.tsx");
check("المرتجع: ليس مرشّحاً (محلّيّاً ومن الخادم)", /i\.sale_kind !== "opening"\);/.test(ret) && /remote\.filter\(\(i\) => i\.sale_kind !== "opening"\)/.test(ret));
const ip = src("src/components/retail/InvoicesPanel.tsx");
check("قائمة الفواتير: لا «إرجاع»، والحذفُ قبل التسديد وحده، والمطبوعُ كشفُ دينٍ بسطرٍ واحد",
  /\{!refunded && !opening && \(/.test(ip) && /\{canDelete && !openingSettled && \(/.test(ip) && (ip.match(/items: opening \? openingLines :/g) ?? []).length === 2);
const owners = ["src/components/retail/DebtsPanel.tsx", "src/components/retail/InvoicesPanel.tsx", "src/pages/CustomerFile.tsx", "src/components/reports/CustomerLedger.tsx"];
for (const f of owners) {
  const t = src(f);
  check(`${f.split("/").pop()}: OldDebt بـpage(…, ["odebt"]) ولا استيرادَ ثابتاً`, /page\(\(\) => import\("@\/components\/retail\/OldDebt"\)[^\n]*\["odebt"\]\)/.test(t) && !/from "@\/components\/retail\/OldDebt"/.test(t));
}
const hot = JSON.parse(src("src/i18n/hot-paths.json"));
check("نطاقُ odebt مملوكٌ لـOldDebt.tsx", hot.owned?.odebt === "src/components/retail/OldDebt.tsx");
const importers = ["src/lib/repo.ts", "src/main.tsx", "src/App.tsx", "src/lib/repoDemo.ts"]
  .filter((f) => /(?:from\s*|import\(\s*)["'][^"']*(oldDebtApi|demoOldDebt)["']/.test(src(f)));
check("البابُ (oldDebtApi) ومرآتُه خارج حزمة الإقلاع — لا يستوردهما repo/main/App/repoDemo", importers.length === 0, importers.join("، "));
const od = src("src/components/retail/OldDebt.tsx");
check("الزرُّ للمدير (أو مفتاحِه الحيّ) وجهازٍ غيرِ مقفول — حكمُ أزرار الحذف", /capLockedFrom\(ov\.deviceLocked, ov\.active, role === "manager"\)/.test(od) && /if \(!can\) return null;/.test(od));
check("  ومرجعُ الإعادة: يُحرَّر برفضٍ حاسم وحده، والمجهولُ يقفل النافذةَ على الإعادة", /shouldReleaseRef\(fresh, e\)/.test(od) && /setPinned\(true\)/.test(od) && /<fieldset disabled=\{pinned \|\| busy\}/.test(od));

check("  والمحاولةُ المجهولة تعيش بالجلسة: إغلاقُ النافذة وفتحُها يرجع بالمرجع نفسِه مقفولاً (لا دينَ ثانٍ)",
  /const \[pend\] = useState\(readPending\)/.test(od) && /const ref = useRef\(pend\?\.ref \?\? uid\("odebt"\)\)/.test(od) && /writePending\(\{ ref: ref\.current/.test(od) && (od.match(/writePending\(null\)/g) ?? []).length === 2);
check("  ورفضُ المشغّل يُقال بجملته", /operator_not_allowed/.test(od));
check("مطبوعُ دين الدولار بسعر الدولار (usdPrintItem يطبع unit_price_usd)، وزرُّ حذفه مخفيٌّ بعد أيّ تسديد",
  /unit_price_usd: usdInv \? Number\(invoice\.total_usd \?\? 0\) : null/.test(ip) && /canDelete=\{canDelete && !openingSettled\}/.test(ip));
check("التحليلات: ديونُ المدّة تبقى فيها الديونُ القديمة (ليست بيعاً لكنّها دَين)", /const receivables = useMemo\(\(\) => invInRangeAll\.filter/.test(hub));

console.log(`\n${fails ? "✗" : "✓"} old-debt-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
