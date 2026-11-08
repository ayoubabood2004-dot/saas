/* ============================================================================
 * الأرباح والخسائر (0256) — بالواجهة: الحسابُ الذي لا تراه القاعدة، والبابُ، والمرآةُ التجريبية بسلوكها، والأسلاك.
 *
 * تطابقُ computePnl مع report_pnl فلساً بفلس يفحصه pnl-parity بالحزمة على بوستغريس. وهنا ما لا تصله الحزمة:
 *   أ) الحسابُ على ما لا تكتبه القاعدة: فاتورةٌ بلا status (التجريبيّ) تُعدّ مدفوعة، وتصنيفٌ لا تعرفه القائمة
 *      يأتي بعد المعروف باسمٍ فارغ، والتوقيتُ المجهولُ بغداد والمكتوبُ بحروفٍ صغيرة باسمه المعتمد، والسطورُ تُجمع.
 *   ب) قارئُ الجواب (readPnl): رقمٌ مفقودٌ أو شهرٌ بغير شكله يرمي pnl_shape — لا صفرٌ يُرسم عن جوابٍ مكسور.
 *   ج) المرآةُ التجريبية من أوّلها لآخرها بالمستودع الحقيقيّ: بيعةٌ وسحبٌ بتصنيف ثمّ التقريرُ يزيد بهما بالضبط؛
 *      والصلاحيةُ كالخادم: صاحبُ العيادة نعم، والطبيبُ والمصوّرُ pnl_forbidden بتلميح الخادم، ومفتاحُ المدير يفتحه،
 *      وإذنُ viewProfits الصريح بصفّ الكادر يفتحه.
 *   د) الأسلاك: التبويبُ خلف بوّابة تقارير الأرباح، والنطاقُ مملوكٌ ويُحمَّل مع الصفحة، واللوحةُ لا تجلب فاتورةً
 *      ولا تستورد البابَ استيراداً ثابتاً، والقاعدةُ تصنّف السحوبات بترتيب bucketOf.
 *
 *   node scripts/pnl-test.mjs
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
const src = (f) => readFileSync(f, "utf8");
/* المفاتيحُ تُقرأ من مصادرها لا تُكتب بيد: مفتاحٌ مخمَّن يفحص مخزناً غيرَ الذي يقرؤه التطبيق. */
const keyOf = (file, re) => {
  const k = re.exec(src(file))?.[1];
  if (!k) { console.error(`✗ pnl-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);
const ACTIVE = keyOf("src/lib/clinics.ts", /const ACTIVE_KEY = "([^"]+)"/);
const UNTIL = keyOf("src/lib/managerOverride.ts", /const untilKey = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/);
const STAFF_KEY = keyOf("src/lib/staff.ts", /const keyName = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/);

/* ---- مخزنٌ بالذاكرة مكانَ localStorage، قبل تحميل أيّ وحدة ---------------- */
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

/* ---- المستودعُ الحقيقيّ (نصفُه التجريبيّ) ومعه بابُ الأرباح وحسابُها — حزمةٌ واحدة، نسخةٌ واحدة من كلّ وحدة ---- */
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
      'export * as P from "./src/lib/pnl.ts";',
      'export { pnlApi, readPnl } from "./src/lib/pnlApi.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "pnl-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "pnl-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, P, pnlApi, readPnl } = mod;
if (!repo || !P || !pnlApi || !readPnl) { console.error("✗ pnl-test: ما انحمّلت الوحدات"); process.exit(1); }

/* ── أ) الحساب على ما لا تكتبه القاعدة ─────────────────────────────────────── */
console.log("▸ الحساب: ما لا يصله قالبُ القاعدة");
{
  const inv = (id, created_at, total, cost, profit, status) => ({ id, created_at, total, cost_total: cost, profit, ...(status !== undefined ? { status } : {}) });
  const input = {
    invoices: [inv("a", "2026-03-10T10:00:00.000Z", 1000, 400, 600), inv("b", "2026-03-11T10:00:00.000Z", 500, 0, 500, null),
      inv("c", "2026-03-12T10:00:00.000Z", 9999, 1, 9998, "refunded")],
    items: [{ invoice_id: "a", product_id: "p", qty: 1, unit_cost: 400 }, { invoice_id: "c", product_id: "p", qty: 1, unit_cost: 1 }],
    consumption: [],
    expenses: [
      { spent_at: "2026-03-13T10:00:00.000Z", amount: 10, category: "x", category_id: "zz-unknown", method: "cash" },
      { spent_at: "2026-03-13T10:00:00.000Z", amount: 20, category: "y", category_id: "k1", method: "cash" },
    ],
    categories: [{ id: "k1", name: "إيجار", created_at: "2026-01-01T00:00:00.000Z" }],
  };
  const r = P.computePnl(input, "2026-03-01T00:00:00.000Z", "2026-03-31T00:00:00.000Z", "Asia/Baghdad");
  check("فاتورةٌ بلا status (التجريبيّ) تُعدّ مدفوعة، والمرجّعةُ خارجها", r.total.invoices === 2 && r.total.revenue === 1500 && r.total.gross === 1100,
    JSON.stringify(r.total));
  check("  وكلفةُ المواد المباعة من سطور الفواتير الداخلة وحدها (المرجّعةُ لا)", r.total.cogs_products === 400 && r.total.cogs_other === 0);
  check("تصنيفٌ لا تعرفه القائمة بعد المعروف، واسمُه فارغ (الواجهةُ تقول «تصنيف محذوف»)",
    JSON.stringify(r.total.categories) === JSON.stringify([{ id: "k1", name: "إيجار", amount: 20 }, { id: "zz-unknown", name: null, amount: 10 }]),
    JSON.stringify(r.total.categories));
  check("والسطورُ تُجمع: الصافي = ربحُ المبيعات − المصاريف", r.total.expenses === 30 && r.total.net === 1070);
  check("توقيتٌ مجهولٌ بغداد، والمكتوبُ بحروفٍ صغيرة باسمه المعتمد", P.pnlTz("Mars/Olympus") === "Asia/Baghdad" && P.pnlTz("asia/baghdad") === "Asia/Baghdad" && P.pnlTz("") === "Asia/Baghdad",
    `${P.pnlTz("Mars/Olympus")}|${P.pnlTz("asia/baghdad")}`);
  check("الشهرُ بتوقيته: ٢١:٣٠Z ليلة ٣١/١ فبرايرٌ ببغداد ويناير بغرينتش",
    P.pnlMonthOf(Date.parse("2026-01-31T21:30:00Z"), "Asia/Baghdad") === "2026-02" && P.pnlMonthOf(Date.parse("2026-01-31T21:30:00Z"), "UTC") === "2026-01");
  let e1 = null, e2 = null;
  try { P.computePnl(input, "2026-03-31T00:00:00.000Z", "2026-03-01T00:00:00.000Z", "UTC"); } catch (e) { e1 = e.message; }
  try { P.computePnl(input, "2025-01-01T00:00:00.000Z", "2026-02-06T00:00:00.001Z", "UTC"); } catch (e) { e2 = e.message; }
  check("المدّةُ المقلوبة pnl_range، والأطولُ من ٤٠٠ يوم pnl_range_long (كالخادم)", e1 === "pnl_range" && e2 === "pnl_range_long", `${e1}|${e2}`);
  const empty = P.computePnl({ invoices: [], items: [], consumption: [], expenses: [], categories: [] }, "2026-03-01T00:00:00.000Z", "2026-03-02T00:00:00.000Z", "UTC");
  check("مدّةٌ فارغة: لا شهر، ومجموعٌ أصفار (لا undefined)", empty.months.length === 0 && empty.total.net === 0 && Array.isArray(empty.total.categories));
}

/* ── ب) قارئُ الجواب ──────────────────────────────────────────────────────── */
console.log("▸ قارئُ جواب report_pnl");
{
  const row = { invoices: 1, revenue: "100.50", cogs: 0, cogs_products: 0, cogs_materials: 0, cogs_other: 0, gross: 100.5, adjust: 0,
    stock_loss: 0, returns: 0, payroll: 0, payroll_loan: 0, uncategorized: 0, categories: [{ id: "k", name: null, amount: "5" }], expenses: 5, net: 95.5 };
  const ok = readPnl({ months: [{ month: "2026-03", ...row }], total: row });
  check("الأرقامُ نصّاً أو رقماً تُقرأ أرقاماً، والتصنيفُ باسمٍ فارغ يبقى", ok.months[0].revenue === 100.5 && ok.total.categories[0].amount === 5 && ok.total.categories[0].name === null);
  const bad = (raw) => { try { readPnl(raw); return "قُبل"; } catch (e) { return e.message; } };
  check("رقمٌ مفقود يرمي pnl_shape (لا صفرٌ يُرسم)", bad({ months: [], total: { ...row, net: undefined } }) === "pnl_shape");
  check("  ورقمٌ غيرُ رقميّ كذلك", bad({ months: [], total: { ...row, revenue: "abc" } }) === "pnl_shape");
  check("  وشهرٌ بغير شكله", bad({ months: [{ ...row, month: "March" }], total: row }) === "pnl_shape");
  check("  وتصنيفٌ بلا مبلغ", bad({ months: [], total: { ...row, categories: [{ id: "k", name: "x" }] } }) === "pnl_shape");
  check("  وجوابٌ بلا months", bad({ total: row }) === "pnl_shape" && bad(null) === "pnl_shape");
  // 0264: fx غائبٌ بخادمٍ قبلها صفرٌ حقّاً (لا دولار) — وموجودٌ غيرُ رقميّ يرمي كغيره.
  check("فرقُ الصرف: غائبٌ (خادمٌ قبل 0264) صفر، ونصّاً رقم، وغيرُ رقميّ يرمي",
    ok.total.fx === 0 && readPnl({ months: [], total: { ...row, fx: "-750.5" } }).total.fx === -750.5
      && bad({ months: [], total: { ...row, fx: "x" } }) === "pnl_shape");
}

/* ── ج) المرآةُ التجريبية بسلوكها ─────────────────────────────────────────── */
console.log("▸ المرآةُ التجريبية: بيعةٌ وسحبٌ حقيقيّان، والصلاحيةُ كالخادم");
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: [rawRole === "owner" ? "owner" : "clinic"],
    clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: rawRole === "owner" ? "owner" : "clinic",
}));
const clinic = () => mem.get(ACTIVE) || "default";
const pinOff = () => mem.delete(`${UNTIL}${clinic()}`);
const OWNER = () => { pinOff(); mem.delete(SESSION); };
const VET = () => { pinOff(); as("v1", "doctor"); };
const PHO = () => { pinOff(); as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" }); };
const now = Date.now();
const FROM = new Date(now - 86_400_000).toISOString(), TO = new Date(now + 86_400_000).toISOString();
const report = () => pnlApi.report(FROM, TO, "Asia/Baghdad");
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return `${e.code ?? ""}:${e.message}:${e.hint ?? ""}`; } };
{
  OWNER();
  const before = await report();
  const cat = await repo.createExpenseCategory("إيجار الفحص");
  await repo.retailCheckout([{ product_id: null, name: "خدمة الفحص", barcode: null, qty: 2, unit_price: 15000, unit_cost: 1000, stock_qty: 0, unit_label: null, service_id: null }],
    { payment_method: "cash" });
  await repo.addExpense({ amount: 5000, description: "إيجار", category: "إيجار الفحص", category_id: cat.id, method: "cash", spent_at: new Date().toISOString() });
  const after = await report();
  const d = (k) => Math.round((after.total[k] - before.total[k]) * 100) / 100;
  check("صاحبُ العيادة: البيعةُ تزيد المبيعاتِ ٣٠٬٠٠٠ والربحَ ٢٨٬٠٠٠ وفاتورةً واحدة", d("revenue") === 30000 && d("gross") === 28000 && d("invoices") === 1,
    `${d("revenue")}|${d("gross")}|${d("invoices")}`);
  check("  والسحبُ بتصنيفه سطرُه ٥٬٠٠٠ والصافي يزيد ٢٣٬٠٠٠", after.total.categories.some((c) => c.id === cat.id && c.amount === 5000) && d("expenses") === 5000 && d("net") === 23000,
    JSON.stringify(after.total.categories));
  const hint = /const HINT = \{\s*forbidden: "([^"]+)"/.exec(src("src/lib/demoPnl.ts"))?.[1];
  const sqlHint = /pnl_forbidden' using errcode = '42501',\s*hint = '([^']+)'/.exec(src("supabase/migrations/0256_report_pnl.sql"))?.[1];
  check("تلميحُ الرفض بالمرآة = تلميحُ الخادم حرفاً", !!hint && !!sqlHint && JSON.parse(`"${hint}"`) === sqlHint, `${hint ? JSON.parse(`"${hint}"`) : "-"} ≠ ${sqlHint}`);
  VET();
  check("الطبيبُ بلا إذن: pnl_forbidden برمز 42501 وتلميح الخادم", (await errOf(report)) === `42501:pnl_forbidden:${sqlHint}`, await errOf(report));
  PHO();
  check("  والمصوّرُ كذلك", (await errOf(report)).startsWith("42501:pnl_forbidden"));
  VET(); mem.set(`${UNTIL}${clinic()}`, String(Date.now() + 10 * 60 * 1000));
  check("  ومفتاحُ المدير الحيّ يفتحه للطبيب", (await errOf(report)) === "قُبل");
  VET();
  mem.set(`${STAFF_KEY}${clinic()}`, JSON.stringify([{ id: "s-v1", name: "طبيب", role: "veterinarian", userId: "v1", permissions: { viewProfits: true }, active: true }]));
  check("  وإذنُ viewProfits الصريح بصفّ الكادر يفتحه (مرآةُ staff_can)", (await errOf(report)) === "قُبل", await errOf(report));
  mem.delete(`${STAFF_KEY}${clinic()}`);
  OWNER();
}

/* ── د) الأسلاك ───────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك");
const hub = src("src/pages/AnalyticsHub.tsx"), app = src("src/App.tsx"), panel = src("src/components/reports/PnlPanel.tsx"),
  api = src("src/lib/pnlApi.ts"), sql = src("supabase/migrations/0256_report_pnl.sql"), pnl = src("src/lib/pnl.ts"),
  hot = JSON.parse(src("src/i18n/hot-paths.json"));
check("التبويبُ خلف بوّابة تقارير الأرباح (الإذن، وقفلُ الجهاز بلا مفتاح المدير)",
  /const canPnl = !capLockedFrom\(ovr\.deviceLocked, ovr\.active, canProfit\);/.test(hub) && /\.\.\.\(canPnl \? \[\{ id: "pnl"/.test(hub));
check("  واللوحةُ تُرسم بالبوّابة وحدها، وتبويبٌ أُغلقت بوّابتُه يرجع للنظرة العامة",
  /tab === "pnl" && canPnl \? <PnlPanel/.test(hub) && /if \(tab === "pnl" && !canPnl\) setTab\("overview"\)/.test(hub));
check("  وفلترُ ساعات الدوام يصل اللوحةَ فتقول إنه لا ينطبق (لا «هو نفس صافي الربح» عن رقمين مختلفين)",
  /<PnlPanel [^>]*shiftActive=\{timeActive\}/.test(hub) && /shiftActive && <li[^>]*data-pnl-note-shift/.test(panel));
check("النطاقُ pnl مملوكٌ للتقارير ورفيقُه اللوحة، ويُحمَّل مع الصفحة",
  hot.owned?.pnl?.owner === "src/pages/AnalyticsHub.tsx" && (hot.owned?.pnl?.with ?? []).includes("src/components/reports/PnlPanel.tsx")
  && /import\("@\/pages\/AnalyticsHub"\)[^\n]*\["wdr", "scust", "fgr", "pnl"\]/.test(app));
check("اللوحةُ لا تجلب فاتورةً ولا سحباً (القاعدةُ تجمع) ولا تستورد البابَ استيراداً ثابتاً",
  !/listInvoices\(|listAllInvoiceItems\(|listExpenses\(|\brepo\./.test(panel) && !/^import \{[^}]*\} from "@\/lib\/pnlApi"/m.test(panel)
  && /import\("@\/lib\/pnlApi"\)/.test(panel) && /withTimeout\(/.test(panel) && /saleTz\(\)/.test(panel));
check("البابُ ينادي report_pnl بـrpcJson ويقرأ جوابَه بـreadPnl، والتجريبيُّ من باب repoDemo",
  /readPnl\(await rpcJson<unknown>\("report_pnl"/.test(api) && /loadDemoPnl\(\)/.test(api));
check("المرآةُ تصنّف السحوبات بـbucketOf نفسِها (لا نسخة)", /import \{ bucketOf \} from "\.\/expenseCategoryRules"/.test(pnl) && /bucketOf\(e\)/.test(pnl));
{
  const order = ["e.category_id is not null", "e.method = 'stock'", "inv_norm_group('مرتجع')", "inv_norm_group('payroll')",
    "inv_norm_group('payroll_loan')", "inv_norm_group('سحب مخزن')"].map((s) => sql.indexOf(s));
  check("والقاعدةُ بترتيب bucketOf: المعرّفُ ثمّ طريقةُ stock ثمّ نصوصُ النظام", order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), order.join(","));
}

console.log(`\n${fails ? "✗" : "✓"} pnl-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
