// يومُ الصندوق — القاعدةُ النقيّة (src/lib/cashDay.ts) ومواضعُ ندائها بـCashReconcile.tsx.
// ما يحرسه: الصندوقُ يطابق اليومَ المحلّيّ لا يومَ غرينتش. فاتورةُ ٠١:٣٠ ببغداد يرجعها الخادمُ
// "…T22:30:00+00:00" (أمس بغرينتش)، فالقطعُ `slice(0, 10)` كان يُسقطها من صندوق يومها، والطلبُ
// «من منتصف الليل المحلّيّ» يخرجها من صندوق أمس — فلا يراها أيُّ صندوق (مقيس: ١٢٢ فاتورة بـ٦٠ يوماً).
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "cash-day-"));
const out = join(dir, "m.mjs");
await build({
  entryPoints: ["src/lib/cashDay.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { "@": join(process.cwd(), "src") },
});
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${got ?? ""}`); } };

const T = "2026-10-17";
// كما يرجعها PostgREST: timestamptz بغرينتش وبـ"+00:00".
const inv = (id, created_at, extra = {}) => ({ id, created_at, status: "paid", total: 1000, ...extra });
const exp = (id, spent_at, extra = {}) => ({ id, spent_at, created_at: spent_at, amount: 500, method: "cash", ...extra });
const ids = (rows) => rows.map((r) => r.id).join(",");

const AT_0130 = inv("i0130", "2026-10-16T22:30:00+00:00");   // ٠١:٣٠ بغداد اليوم
const AT_0000 = inv("i0000", "2026-10-16T21:00:00+00:00");   // منتصف الليل المحلّيّ تماماً — اليوم
const AT_2359 = inv("i2359", "2026-10-17T20:59:59.999999+00:00"); // ٢٣:٥٩:٥٩ بغداد — اليوم
const NEXT_00 = inv("inext", "2026-10-17T21:00:00+00:00");   // منتصف الليل التالي — غداً
const PREV_23 = inv("iprev", "2026-10-16T20:30:00+00:00");   // ٢٣:٣٠ بغداد أمس
const NOON = inv("inoon", "2026-10-17T09:00:00+00:00");      // ١٢:٠٠ بغداد اليوم
const REFUND = inv("iref", "2026-10-16T23:00:00+00:00", { status: "refunded" });
const rows = [AT_0130, AT_0000, AT_2359, NEXT_00, PREV_23, NOON, REFUND];

console.log("▸ cash-day: العيبُ كما كان (المرجع)");
const oldFilter = (r) => r.filter((i) => i.created_at.slice(0, 10) === T && i.status !== "refunded");
check("التصفيةُ القديمة تُسقط فاتورةَ ٠١:٣٠ المحلّيّة (هذا ما يُصلَح)", !oldFilter(rows).some((i) => i.id === "i0130"), ids(oldFilter(rows)));

console.log("▸ cash-day: فواتيرُ الصندوق باليوم المحلّيّ");
const got = m.drawerInvoices(rows, T);
check("فاتورةُ ٠١:٣٠ ببغداد (٢٢:٣٠ غرينتش أمس) بصندوق اليوم", got.some((i) => i.id === "i0130"), ids(got));
check("  ومنتصفُ الليل المحلّيّ تماماً لليوم", got.some((i) => i.id === "i0000"), ids(got));
check("  و٢٣:٥٩:٥٩ المحلّيّة لليوم (وغرينتش يقول اليومَ نفسَه)", got.some((i) => i.id === "i2359"), ids(got));
check("  والظهرُ لليوم", got.some((i) => i.id === "inoon"), ids(got));
check("  ومنتصفُ الليل التالي ليس لليوم", !got.some((i) => i.id === "inext"), ids(got));
check("  و٢٣:٣٠ أمس ليست لليوم", !got.some((i) => i.id === "iprev"), ids(got));
check("  والمرتجعةُ خارج الصندوق", !got.some((i) => i.id === "iref"), ids(got));
check("  بالضبط: ٠١:٣٠ + ٠٠:٠٠ + ٢٣:٥٩ + الظهر", ids(got) === "i0130,i0000,i2359,inoon", ids(got));

console.log("▸ cash-day: مصروفاتُ الصندوق (spent_at عمودُ timestamptz — نفسُ الشكل)");
const ex = [
  exp("e0130", "2026-10-16T22:30:00+00:00"),        // سحبُ نظامٍ (مرتجع/رواتب) بـnow() الساعة ٠١:٣٠
  exp("enoon", new Date(`${T}T12:00:00`).toISOString()), // سحبٌ يدويّ: النموذجُ يكتب ظهرَ اليوم المحلّيّ
  exp("eprev", "2026-10-16T20:30:00+00:00"),
  exp("enull", null, { created_at: "2026-10-16T23:15:00+00:00" }), // صفٌّ تجريبيّ بلا spent_at
];
const gotEx = m.drawerExpenses(ex, T);
check("سحبُ ٠١:٣٠ ببغداد بصندوق اليوم", gotEx.some((e) => e.id === "e0130"), ids(gotEx));
check("  والسحبُ اليدويّ (ظهرُ اليوم) بصندوق اليوم", gotEx.some((e) => e.id === "enoon"), ids(gotEx));
check("  وسحبُ أمس ليس لليوم", !gotEx.some((e) => e.id === "eprev"), ids(gotEx));
check("  وبلا spent_at يُقرأ created_at بيومه المحلّيّ", gotEx.some((e) => e.id === "enull"), ids(gotEx));

console.log("▸ cash-day: مدّةُ الطلب من منتصف الليل المحلّيّ (0149)");
const r = m.localDayRange(T);
check("from = منتصفُ ليل بغداد (٢١:٠٠ غرينتش أمس)", r.from === "2026-10-16T21:00:00.000Z", r.from);
check("to = منتصفُ الليل التالي", r.to === "2026-10-17T21:00:00.000Z", r.to);
// الطلبُ (gte/lte كما inRange) ثم التصفية: لا صفَّ لليوم يضيع بينهما.
const ms = (s) => Date.parse(s);
const served = rows.filter((i) => ms(i.created_at) >= ms(r.from) && ms(i.created_at) <= ms(r.to));
const whole = m.drawerInvoices(served, T);
check("الطلبُ ثم التصفية = كلُّ فواتير اليوم المحلّيّ", ids(whole) === ids(got), ids(whole));
check("  وأوّلُ الشهر (١/١١) مدّتُه سليمة", m.localDayRange("2026-11-01").from === "2026-10-31T21:00:00.000Z" && m.localDayRange("2026-10-31").to === "2026-10-31T21:00:00.000Z");
// المدّةُ صيغةُ toISOString — والنسخةُ التجريبيّة تقارن بالنصّ (within)، فاليومُ يطابق نصّاً أيضاً.
const demoRow = new Date(`${T}T01:30:00`).toISOString();
check("  وبمقارنة النصّ (النسخة التجريبيّة) فاتورةُ ٠١:٣٠ داخل المدّة", demoRow >= r.from && demoRow <= r.to, demoRow);

/* ── المالُ بيوم وصوله ─────────────────────────────────────────────────────
 * الخادمُ يؤرّخ كلَّ ساقٍ بـ`at`ها: settle_invoice تختم now()، وreceipt_legs (0149) تقرأ
 * coalesce(at, created_at)، وreceiptsOf تقول «التسديدُ يُحسب يومَ قُبض». والصندوقُ كان يجلب
 * فواتيرَ أُنشئت اليوم ويرمي كلَّ ساقٍ بدوام إنشاء فاتورتها: تسديدُ دينٍ قديم اليوم لا يصل
 * درجَ أحد، فالمفروضُ ناقص والعدُّ المؤكَّد يُحفظ «زيادة» وهمية باسم الكاشير. */
console.log("▸ cash-day: كلُّ ساقٍ بيوم وصولها ودوامه — لا بيوم فاتورتها");
// ساقُ التسديد كما تكتبها settle_invoice: to_char(now() at time zone 'utc', …MS"Z"). ساقُ الكاشير بلا `at`.
const leg = (method, amount, at) => (at ? { method, amount, at } : { method, amount });
const PM_FROM = 16 * 60; // المسائيّ من ٤:٠٠ العصر
const fig = (s) => JSON.stringify(s);

// ١) فاتورةُ أمس سُدِّد دينُها اليوم («تسديد دين») — المالُ بدرج اليوم.
const OLD_DEBT = inv("idebt", "2026-10-16T09:00:00+00:00", { total: 50000, amount_paid: 50000,
  payment_details: [leg("cash", 10000), leg("cash", 40000, "2026-10-17T08:00:00.000Z")] }); // ١١:٠٠ بغداد اليوم
let [d] = m.drawerShifts([OLD_DEBT], [], T, null);
check("فاتورةُ أمس سُدِّد دينُها اليوم: التسديدُ بنقد اليوم، والمقدَّمُ (أمس) خارجه", d.cash === 40000, fig(d));
check("  والمفروضُ بالدرج ٤٠٬٠٠٠ — لا صفر فـ«زيادة» وهمية عند العدّ", d.expected === 40000, fig(d));
check("  ومبيعاتُ اليوم وعددُ فواتيره لا تحسبها (أُنشئت أمس)", d.salesTotal === 0 && d.invoiceCount === 0, fig(d));
// تحصيلُ مندوبٍ اليوم لطلبِ توصيلٍ قبل يومين (courier_settle → settle_invoice)، وتسديدٌ بحوالة.
const COD = inv("icod", "2026-10-15T12:00:00+00:00", { total: 25000, amount_paid: 25000,
  payment_details: [leg("cash", 25000, "2026-10-17T10:15:00.000Z")] });
const XFER = inv("ixfer", "2026-10-14T12:00:00+00:00", { total: 8000, amount_paid: 8000,
  payment_details: [leg("transfer", 8000, "2026-10-17T11:00:00.000Z")] });
[d] = m.drawerShifts([OLD_DEBT, COD, XFER], [], T, null);
check("  وتحصيلُ المندوب اليوم لطلبٍ قبل يومين بنقد اليوم", d.cash === 65000, fig(d));
check("  والتسديدُ بحوالةٍ اليوم بالحوالة لا بالدرج", d.transfer === 8000 && d.cash === 65000, fig(d));

// ٢) فاتورةُ اليوم سُدِّد باقيها غداً — التسديدُ لدرج غدٍ.
const TMRW = inv("itmrw", "2026-10-17T07:00:00+00:00", { total: 30000, amount_paid: 30000,
  payment_details: [leg("cash", 5000), leg("cash", 25000, "2026-10-18T06:00:00.000Z")] }); // ٠٩:٠٠ بغداد غداً
[d] = m.drawerShifts([TMRW], [], T, null);
check("فاتورةُ اليوم سُدِّد باقيها غداً: نقدُ اليوم مقدَّمُها وحده", d.cash === 5000 && d.expected === 5000, fig(d));
check("  وهي من مبيعات اليوم بقيمتها كاملة", d.salesTotal === 30000 && d.invoiceCount === 1, fig(d));
// تسديدُ ٠٠:٣٠ بعد منتصف الليل: غرينتش يقول «اليوم» (٢١:٣٠Z) — والمالكُ قال: لليوم الجديد.
const MIDN = inv("imidn", "2026-10-17T07:00:00+00:00", { total: 12000, amount_paid: 12000,
  payment_details: [leg("cash", 2000), leg("cash", 10000, "2026-10-17T21:30:00.000Z")] });
[d] = m.drawerShifts([MIDN], [], T, null);
check("  وتسديدُ ٠٠:٣٠ بعد منتصف الليل لليوم الجديد لا لهذا (بقرار المالك)", d.cash === 2000, fig(d));

// ٣) عيادةٌ بدوامين: بيعٌ صباحيّ بلا مقدَّم سُدِّد مساءً.
const AMPM = inv("iampm", "2026-10-17T06:00:00+00:00", { total: 20000, amount_paid: 20000, // ٠٩:٠٠ بغداد
  payment_details: [leg("cash", 20000, "2026-10-17T14:30:00.000Z")] });                        // ١٧:٣٠ بغداد
let [am, pm] = m.drawerShifts([AMPM], [], T, PM_FROM);
check("بيعٌ صباحيّ سُدِّد مساءً: النقدُ بالدوام المسائيّ", pm?.cash === 20000 && pm?.expected === 20000, `${fig(am)} ${fig(pm)}`);
check("  والصباحيُّ لا يراه نقداً", am?.cash === 0 && am?.expected === 0, fig(am));
check("  والبيعُ نفسُه (المبيعات والعدد) بدوام إنشائه", am?.salesTotal === 20000 && am?.invoiceCount === 1 && pm?.salesTotal === 0 && pm?.invoiceCount === 0, `${fig(am)} ${fig(pm)}`);
// والمصروفُ النقديّ بدوام خروجه (كما كان).
[am, pm] = m.drawerShifts([AMPM], [exp("epm", "2026-10-17T14:45:00+00:00", { amount: 3000 })], T, PM_FROM);
check("  ومصروفُ ١٧:٤٥ يُنقص المسائيّ", pm?.cashOut === 3000 && pm?.expected === 17000 && am?.cashOut === 0, `${fig(am)} ${fig(pm)}`);

// ٤) «تاريخ المبيع» (0242): السِّيَقُ بلا `at` فتُؤرَّخ بيوم البيع — لا يتضخّم بها درجُ يوم الإدخال.
const BACK = inv("iback", "2026-10-15T09:00:00+00:00", { recorded_at: "2026-10-17T08:00:00.000Z",
  total: 15000, amount_paid: 15000, payment_details: [leg("cash", 15000)] });
const BACK_SETTLED = inv("ibset", "2026-10-16T09:00:00+00:00", { recorded_at: "2026-10-17T08:05:00.000Z",
  total: 9000, amount_paid: 9000, payment_details: [leg("cash", 3000), leg("cash", 6000, "2026-10-17T12:00:00.000Z")] });
[d] = m.drawerShifts([BACK, BACK_SETTLED], [], T, null);
check("فاتورةٌ بيومٍ سابق (0242) بيوم بيعها لا بدرج يوم إدخالها", d.salesTotal === 0 && d.invoiceCount === 0, fig(d));
check("  ونقدُها ليس لليوم — إلا تسديداً قُبض اليوم", d.cash === 6000, fig(d));

// ٥) بلا أرجل (قديمة): دفعةٌ واحدة بيوم الفاتورة وطريقتها؛ والمرتجعةُ لا مقبوضات.
const LEGACY = inv("ilegacy", "2026-10-17T08:00:00+00:00", { total: 7000, payment_method: "card" });
const LEGACY_OLD = inv("ilold", "2026-10-10T08:00:00+00:00", { total: 7000, amount_paid: 2000 }); // دينٌ مفتوح يرجعه الجلب
const REF_TODAY = inv("ireft", "2026-10-17T08:30:00+00:00", { status: "refunded", total: 4000, amount_paid: 4000,
  payment_details: [leg("cash", 4000)] });
[d] = m.drawerShifts([LEGACY, LEGACY_OLD, REF_TODAY], [], T, null);
check("فاتورةٌ بلا أرجل: دفعةٌ واحدة بيومها وطريقتها، ودينٌ قديمٌ بلا تسديدٍ اليوم لا شيء", d.card === 7000 && d.cash === 0, fig(d));
check("  والمرتجعةُ خارج المبيعات والنقد", d.salesTotal === 7000 && d.invoiceCount === 1, fig(d));

// ٦) مرآةٌ مستقلّة لـreceipt_legs (0149) بحرفها: مجموعُ الدرج = مقبوضاتُ اليوم كما يجمعها الخادم.
const ALL = [AT_0130, AT_0000, AT_2359, NEXT_00, PREV_23, NOON, REFUND, OLD_DEBT, COD, XFER, TMRW, MIDN, AMPM, BACK, BACK_SETTLED, LEGACY, LEGACY_OLD, REF_TODAY];
const serverLegs = ALL.filter((i) => (i.status ?? "paid") !== "refunded").flatMap((i) => (i.payment_details?.length
  ? i.payment_details.filter((l) => Math.abs(l.amount ?? 0) > 0.01).map((l) => ({ amount: l.amount, at: l.at ?? i.created_at }))
  : ((i.amount_paid ?? i.total) > 0.01 ? [{ amount: i.amount_paid ?? i.total, at: i.created_at }] : [])));
const bag = (at) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date(at));
const serverToday = serverLegs.filter((l) => bag(l.at) === T).reduce((s, l) => s + l.amount, 0);
const shifts2 = m.drawerShifts(ALL, [], T, PM_FROM);
const drawerToday = shifts2.reduce((s, x) => s + x.cash + x.card + x.transfer, 0);
check("مجموعُ الدرج بدوامَيه = مقبوضاتُ اليوم بمرآة receipt_legs (يومُ بغداد)", drawerToday === serverToday, `${drawerToday} ≠ ${serverToday}`);

/* ── الفشلُ لا يُرسم درجاً ────────────────────────────────────────────────
 * `.catch(() => [] as Invoice[])` كان يجعل خطأَ الشبكة «يومٌ بلا فواتير»: المفروضُ صفر،
 * وزرُّ التأكيد يحفظ العدَّ كلَّه «زيادة» باسم الكاشير (CLAUDE.md §٣). */
console.log("▸ cash-day: الجلبُ يقرأ ما لمس اليوم، ولا يبتلع فشلاً");
const calls = [];
const api = (fail) => ({
  listInvoices: async (...a) => { calls.push(["listInvoices", a]); return []; },
  listInvoicesTouching: async (range) => { calls.push(["touching", range]); if (fail === "inv") throw new Error("net"); return [OLD_DEBT]; },
  listExpenses: async (c, range) => { calls.push(["expenses", range]); if (fail === "exp") throw new Error("net"); return []; },
});
const okLoad = typeof m.loadDrawer === "function" ? await m.loadDrawer(api(null), T).catch((e) => e) : null;
check("الفواتيرُ تُجلب بـlistInvoicesTouching بمدّة اليوم المحلّيّ (تسديدُ دينٍ قديم يصل)",
  calls.some(([k, r]) => k === "touching" && r?.from === "2026-10-16T21:00:00.000Z" && r?.to === "2026-10-17T21:00:00.000Z") && !calls.some(([k]) => k === "listInvoices"),
  JSON.stringify(calls));
check("  ويرجع ما جُلب كما هو", okLoad?.invoices?.[0]?.id === "idebt" && Array.isArray(okLoad?.expenses), String(okLoad));
for (const which of ["inv", "exp"]) {
  const r = typeof m.loadDrawer === "function" ? await m.loadDrawer(api(which), T).then(() => "resolved", () => "rejected") : "missing";
  check(`  وفشلُ ${which === "inv" ? "الفواتير" : "المصروفات"} يُرمى — لا قائمةٌ فارغة تُرسم صفراً`, r === "rejected", r);
}

console.log("▸ cash-day: الشاشةُ تمرّ من القاعدة");
const src = readFileSync("src/components/retail/CashReconcile.tsx", "utf8");
check("لا قطعَ لليوم بـslice(0, 10) بالمطابقة", !/\.slice\(0,\s*10\)/.test(src));
check("  الأرقامُ من drawerShifts والجلبُ من loadDrawer (لا نسخةَ ثانية بالشاشة)", /drawerShifts\(/.test(src) && /loadDrawer\(repo/.test(src) && !/created_at\)/.test(src));
check("  ولا ابتلاعَ فشلٍ بقائمةٍ فارغة", !/\.catch\(\s*\(\s*\)\s*=>\s*\[\s*\]/.test(src));
check("  والفشلُ بطاقةُ «أعد المحاولة» بدل الأرقام", /status === "failed"/.test(src) && /data-cashfailed/.test(src) && /common\.retry/.test(src));
// التأكيدُ محجوبٌ إلا بدرجٍ جاهز: الزرُّ بفرع الجاهز وحده، والدالّةُ ترفض قبله.
const confirmFn = /const confirmShift = [^\n]*\n\s*if \(load\.status !== "ready"\) return;/.test(src);
const readyIdx = src.search(/load\.status === "loading"[\s\S]*?load\.status === "failed"/);
check("  والتأكيدُ محجوبٌ بلا درجٍ جاهز (الدالّةُ ترفض، والزرُّ بعد فرعَي التحميل والفشل)",
  confirmFn && readyIdx >= 0 && src.indexOf("data-confirmshift") > readyIdx, `confirmFn=${confirmFn} readyIdx=${readyIdx}`);

console.log(`\ncash-day: ${pass} ✓  ${fail} ✗`);
if (fail) process.exit(1);
