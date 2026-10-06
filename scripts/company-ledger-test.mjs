// دفترُ الشركة — القاعدةُ النقيّة (src/lib/companyLedger.ts).
// ما يحرسه: الرصيدُ الجاري سطراً سطراً، والمدفوعُ عند الشراء مشتقّاً لا مرحَّلاً، والتسديدُ على
// الحساب مرّةً واحدة بتوزيعه (لا مرّتين: صفُّه ودفعاتُ فواتيره)، والملغى مشطوباً بلا أثر —
// والثابتُ: الرصيدُ الأخير = دينُ الفواتير + الرصيدُ السابق + المطالبات، أيْ رقمُ قائمة الشركات.
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ledger-")); const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/companyLedger.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
const m = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };
const at = (d, hm = "10:00") => new Date(`${d}T${hm}:00`).toISOString();

// نفسُ بذرة الحزمة (run.sh ‹0224›): فاتورتان، رصيدٌ سابق ٩٠، ثم تسديدُ ١٢٠ (٩٠ للرصيد و٣٠ للأقدم).
const purchases = [
  { id: "P1", total: 100, amount_paid: 70, status: "partial", reference: "A-7", purchased_at: at("2026-01-10"), created_at: at("2026-01-10"), item_count: 1, payment_method: "cash" },
  { id: "P2", total: 50, amount_paid: 0, status: "unpaid", reference: null, purchased_at: at("2026-02-01"), created_at: at("2026-02-01"), item_count: 1 },
  // قديمةٌ بلا amount_paid: مدفوعةٌ كاملة (مثل 0076) — سطرُ «دُفع عند الشراء» يساوي إجماليها.
  { id: "P0", total: 20, purchased_at: at("2025-11-01"), created_at: at("2025-11-01"), item_count: 1 },
];
const entries = [
  { id: "E1", company_id: "C", kind: "opening", direction: "credit", amount: 90, entry_date: "2025-12-31", created_at: at("2026-10-01") },
  { id: "E2", company_id: "C", kind: "payment", direction: "debit", amount: 120, entry_date: "2026-03-01", method: "cash", created_at: at("2026-10-01", "11:00") },
];
const payments = [
  { id: "pp1", purchase_id: "P1", amount: 30, paid_at: at("2026-03-01", "12:00"), entry_id: "E2", created_at: at("2026-10-01", "11:00") },
];
const L = m.buildCompanyLedger({ purchases, payments, entries, charges: [] });
const kinds = L.rows.map((r) => r.kind).join(",");

console.log("▸ الترتيب والأنواع");
check("بالزمن: القديمةُ ثم الرصيدُ السابق ثم الفاتورتان ثم التسديد", kinds === "purchase,upfront,opening,purchase,upfront,purchase,accountPay", kinds);
check("الأرقامُ متتالية من ١", L.rows.map((r) => r.no).join(",") === "1,2,3,4,5,6,7", L.rows.map((r) => r.no));
check("القديمةُ بلا amount_paid: دُفعت كلُّها عند الشراء", L.rows[1].debit === 20 && L.rows[1].purchaseId === "P0", L.rows[1]);
check("المدفوعُ عند الشراء = amount_paid ناقصَ الدفعات المسجّلة (٧٠ − ٣٠ = ٤٠)", L.rows[4].kind === "upfront" && L.rows[4].debit === 40, L.rows[4]);
check("فاتورةٌ بلا دفعٍ عند الشراء بلا سطر مدفوع", !L.rows.some((r) => r.kind === "upfront" && r.purchaseId === "P2"));

console.log("▸ التسديدُ على الحساب");
const pay = L.rows.find((r) => r.kind === "accountPay");
check("سطرٌ واحد بمبلغه كاملاً — ودفعتُه على الفاتورة لا تُعاد سطراً ثانياً", pay.debit === 120 && !L.rows.some((r) => r.kind === "payment"), L.rows);
check("  وتوزيعُه: ٩٠ للرصيد السابق و٣٠ لـA-7", pay.toOpening === 90 && pay.alloc.length === 1 && pay.alloc[0].amount === 30 && pay.alloc[0].ref === "A-7", pay);

console.log("▸ الرصيد");
check("الرصيدُ الجاري سطراً سطراً", L.rows.map((r) => r.balance).join(",") === "20,0,90,190,150,200,80", L.rows.map((r) => r.balance));
check("الرصيدُ السابق القائم صفر (مرآةُ company_pool_due)", L.totals.poolDue === 0, L.totals);
check("دينُ الفواتير ٣٠ + ٥٠", L.totals.invoiceDue === 80, L.totals);
check("**الثابت**: الرصيدُ الأخير = الفواتير + السابق + المطالبات", L.totals.balance === L.totals.invoiceDue + L.totals.poolDue + L.totals.chargesDue, L.totals);
check("وما بقي على كلّ فاتورة", L.dueByPurchase.get("P1") === 30 && L.dueByPurchase.get("P2") === 50 && L.dueByPurchase.get("P0") === 0);
check("يقبل التسديدُ ٨٠ (لا رصيدَ سابقاً باقياً)", m.payableOf(L.totals.invoiceDue, L.totals.poolDue) === 80);

console.log("▸ الإلغاء");
// إلغاءُ التسديد بالقاعدة: الدفعةُ تُحذف والفاتورةُ ترجع ٤٠، والصفُّ يبقى مختوماً.
const V = m.buildCompanyLedger({
  purchases: purchases.map((p) => (p.id === "P1" ? { ...p, amount_paid: 40 } : p)),
  payments: [],
  entries: entries.map((e) => (e.id === "E2" ? { ...e, voided_at: at("2026-10-02"), void_reason: "انكتب مرتين" } : e)),
  charges: [],
});
const vrow = V.rows.find((r) => r.entryId === "E2");
check("الملغى يبقى بالجدول بمبلغه وسببه، ولا يحرّك الرصيد", vrow.voided?.reason === "انكتب مرتين" && vrow.amount === 120 && vrow.debit === 0, vrow);
check("  والرصيدُ السابق رجع ٩٠، والثابتُ ما زال صادقاً", V.totals.poolDue === 90 && V.totals.balance === V.totals.invoiceDue + V.totals.poolDue, V.totals);
check("  و«دُفع عند الشراء» لم يتغيّر (٤٠)", V.rows.find((r) => r.kind === "upfront" && r.purchaseId === "P1").debit === 40);

console.log("▸ التسوية والمطالبات");
const A = m.buildCompanyLedger({
  purchases: [], payments: [],
  entries: [
    { id: "O", company_id: "C", kind: "opening", direction: "credit", amount: 50, entry_date: "2026-01-01", created_at: at("2026-01-01") },
    { id: "D", company_id: "C", kind: "adjust", direction: "debit", amount: 10, entry_date: "2026-01-05", note: "خصم", created_at: at("2026-01-05") },
    { id: "U", company_id: "C", kind: "adjust", direction: "credit", amount: 4, entry_date: "2026-01-06", note: "نقل", created_at: at("2026-01-06") },
  ],
  charges: [
    { id: "ch1", company_id: "C", amount: 7, reason: "أجرة", charged_at: "2026-01-02", created_at: at("2026-01-02") },
    { id: "ch2", company_id: "C", amount: 3, charged_at: "2026-01-03", settled_at: at("2026-01-08"), created_at: at("2026-01-03") },
  ],
});
check("خصمٌ مدين وفرقٌ دائن بنوعيهما", A.rows.map((r) => r.kind).join(",") === "opening,charge,charge,adjustDebit,adjustCredit,chargeSettled", A.rows.map((r) => r.kind));
check("السابقُ = ٥٠ − ١٠ + ٤، والمطالبةُ القائمة ٧ وحدها", A.totals.poolDue === 44 && A.totals.chargesDue === 7, A.totals);
check("والثابت", A.totals.balance === 51 && A.totals.balance === A.totals.invoiceDue + A.totals.poolDue + A.totals.chargesDue, A.totals);
check("hasOpening يعرف الرصيدَ الحيّ", A.hasOpening);

console.log("▸ حدود");
const E = m.buildCompanyLedger({ purchases: [], payments: [], entries: [], charges: [] });
check("شركةٌ بلا شيء: جدولٌ فارغ ورصيدٌ صفر", E.rows.length === 0 && E.totals.balance === 0 && !E.hasOpening);
// دفعةُ فاتورةٍ ليست لهذه الشركة لا تدخل دفترها (القائمةُ قد تحمل غيرها).
const X = m.buildCompanyLedger({ purchases: [purchases[1]], payments: [{ id: "x", purchase_id: "OTHER", amount: 5, paid_at: at("2026-02-02"), created_at: at("2026-02-02") }], entries: [], charges: [] });
check("دفعةُ فاتورةِ شركةٍ أخرى لا تدخل الدفتر", X.rows.length === 1 && X.totals.balance === 50, X.rows);
const neg = m.poolDueOf([{ id: "d", kind: "adjust", direction: "debit", amount: 5, entry_date: "2026-01-01", created_at: "" }], []);
check("خصمٌ بلا رصيدٍ سابق يجعله سالباً، والتسديدُ لا يحسبه", neg === -5 && m.payableOf(10, neg) === 10, neg);

console.log("▸ معاينةُ التوزيع (نفسُ ترتيب company_pay)");
const pv = m.previewPay(100, 30, [
  { id: "N", total: 40, amount_paid: 0, purchased_at: at("2026-03-01"), created_at: at("2026-03-01") },
  { id: "O", total: 50, amount_paid: 10, reference: "Q-1", purchased_at: at("2026-01-01"), created_at: at("2026-01-01") },
  { id: "Z", total: 9, amount_paid: 9, purchased_at: at("2025-01-01"), created_at: at("2025-01-01") },
]);
check("الرصيدُ السابق أوّلاً ثم الأقدم، والمسدَّدةُ تُتخطّى", pv.toOpening === 30 && pv.alloc.map((a) => `${a.purchaseId}:${a.amount}`).join(",") === "O:40,N:30" && pv.left === 0, pv);
check("  ومبلغٌ أكبرُ من الدين يقول الزائد", m.previewPay(200, 0, [{ id: "N", total: 40, amount_paid: 0, purchased_at: at("2026-03-01") }]).left === 160);

console.log(fail === 0 ? `✓ دفتر الشركة: ${pass} فحصاً عبرت` : `✗ ${fail} فشلت من ${pass + fail}`);
if (fail) process.exit(1);
