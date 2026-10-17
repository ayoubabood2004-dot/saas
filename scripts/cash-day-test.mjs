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

console.log("▸ cash-day: الشاشةُ تمرّ من القاعدة");
const src = readFileSync("src/components/retail/CashReconcile.tsx", "utf8");
check("لا قطعَ لليوم بـslice(0, 10) بالمطابقة", !/\.slice\(0,\s*10\)/.test(src));
check("  الفواتيرُ والمصروفاتُ تُصفّى بـdrawerInvoices/drawerExpenses", /drawerInvoices\(/.test(src) && /drawerExpenses\(/.test(src));
check("  والطلبان بمدّة اليوم المحلّيّ (المصروفاتُ لم تعد بلا مدّة)", /listInvoices\([^)]*range\)/.test(src) && /listExpenses\([^)]*range\)/.test(src) && /localDayRange\(/.test(src));

console.log(`\ncash-day: ${pass} ✓  ${fail} ✗`);
if (fail) process.exit(1);
