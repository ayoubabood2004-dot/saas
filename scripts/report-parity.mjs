/* ============================================================================
 * فحص التطابق: مخرجات دوالّ SQL (0149) مقابل ما حسبته دوالّ الواجهة على نفس
 * البيانات (report-fixture.mjs). فلسٌ واحد يفرق = فشل.
 *
 *   node scripts/report-parity.mjs <dir>
 * ينتظر بالمجلّد: expected.json، و<range>.<fn>.json لكل نتيجة SQL بصيغة json_agg.
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8"));
const load = (name) => { const p = path.join(dir, name); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8") || "[]") : null; };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const k of ["month", "week", "all"]) {
  const exp = expected[k];
  const daily = load(`${k}.daily.json`);
  const total = load(`${k}.total.json`)?.[0];
  const top = load(`${k}.top.json`);
  const staff = load(`${k}.staff.json`);
  const touching = load(`${k}.touching.json`);
  if (!daily || !total || !top || !staff || !touching) { check(`${k}: مخرجات SQL موجودة`, false, "ملف ناقص"); continue; }

  // المقبوضات باليوم
  let ok = daily.length === exp.daily.length;
  let why = ok ? "" : `أيام: SQL ${daily.length} ≠ واجهة ${exp.daily.length}`;
  if (ok) for (let i = 0; i < daily.length; i++) {
    const s = daily[i], e = exp.daily[i];
    if (s.day !== e.day || !near(s.gross, e.gross) || !near(s.net, e.net) || Number(s.invoices) !== e.invoices) {
      ok = false; why = `${e.day}: SQL ${s.day}/${s.gross}/${s.net}/${s.invoices} ≠ واجهة ${e.day}/${e.gross}/${e.net}/${e.invoices}`; break;
    }
  }
  check(`${k}: المقبوضات باليوم تتطابق (${exp.daily.length} يوم)`, ok, why);
  check(`${k}: مجموع المدّة يتطابق (مقبوض/ربح/فواتير)`,
    near(total.gross, exp.total.gross) && near(total.net, exp.total.net) && Number(total.invoices) === exp.total.invoices,
    `SQL ${total.gross}/${total.net}/${total.invoices} ≠ واجهة ${exp.total.gross}/${exp.total.net}/${exp.total.invoices}`);
  const topOk = top.length === exp.top.length && top.every((s, i) => s.key === exp.top[i].key && near(s.qty, exp.top[i].qty) && near(s.revenue, exp.top[i].revenue));
  check(`${k}: الأكثر مبيعاً (٥) بنفس الترتيب والأرقام`, topOk, `SQL ${JSON.stringify(top.map((t) => [t.key.slice(-4), t.revenue]))} ≠ واجهة ${JSON.stringify(exp.top.map((t) => [t.key.slice(-4), t.revenue]))}`);
  const staffNorm = staff.map((s) => ({ staff_id: s.staff_id ?? "__none", invoices: Number(s.invoices), revenue: Number(s.revenue), profit: Number(s.profit) })).sort((a, b) => a.staff_id.localeCompare(b.staff_id));
  const staffOk = staffNorm.length === exp.staff.length && staffNorm.every((s, i) => s.staff_id === exp.staff[i].staff_id && s.invoices === exp.staff[i].invoices && near(s.revenue, exp.staff[i].revenue) && near(s.profit, exp.staff[i].profit));
  check(`${k}: المبيعات حسب الموظف تتطابق (${exp.staff.length} صف)`, staffOk, `SQL ${JSON.stringify(staffNorm)} ≠ ${JSON.stringify(exp.staff)}`);
  const touchIds = touching.map((r) => r.id).sort();
  check(`${k}: الفواتير التي تطابق المدّة = ما تفلتره الواجهة بالضبط (${exp.touching.length})`, same(touchIds, exp.touching),
    `SQL ${touchIds.length} ≠ واجهة ${exp.touching.length}`);
}

// دفتر الزبون
for (const [name, c] of Object.entries(expected.customers)) {
  const got = load(`cust.${name}.json`);
  check(`دفتر الزبون ${name}: نفس فواتير الواجهة (${c.ids.length})`, !!got && same(got.map((r) => r.id).sort(), c.ids), got ? `SQL ${got.length}` : "ملف ناقص");
}

// (0150) الصفحات بالمؤشّر والبحث بالخادم
if (expected.pages) {
  const P = expected.pages;
  const ids = (name) => { const g = load(name); return g && g[0] ? g[0].ids : null; };
  const all = ids("pages.all.json");
  check(`الصفحات: الدورانُ بالمؤشّر (٥٠ بالمرّة) يعطي كل الفواتير بلا تكرارٍ ولا فقد (${P.all.length})`, !!all && same(all, P.all),
    all ? `SQL ${all.length} (${new Set(all).size} فريدة)` : "ملف ناقص");
  for (const [k, s] of Object.entries(P.searches)) {
    const got = ids(`search.${k}.json`);
    check(`بحث ${k} («${s.q ?? "—"}»، ${s.status}): نفس نتائج الواجهة وبنفس الترتيب (${s.ids.length})`, !!got && same(got, s.ids),
      got ? `SQL ${got.length}: ${JSON.stringify(got.slice(0, 3).map((x) => x.slice(-4)))} ≠ واجهة ${JSON.stringify(s.ids.slice(0, 3).map((x) => x.slice(-4)))}` : "ملف ناقص");
    const n = load(`count.${k}.json`)?.[0]?.n;
    check(`عدّاد ${k}: ${s.ids.length}`, n != null && Number(n) === s.ids.length, `SQL ${n}`);
  }
  const debts = load("open_debts.json");
  check(`الديون المفتوحة: نفس فواتير الواجهة (${P.openDebts.length})`, !!debts && same(debts.map((r) => r.id).sort(), P.openDebts), debts ? `SQL ${debts.length}` : "ملف ناقص");
}

console.log(`\n${fails ? "✗" : "✓"} report-parity: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
