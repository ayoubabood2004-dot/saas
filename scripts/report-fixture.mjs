/* ============================================================================
 * مولّد بيانات فحص التقارير — يكتب (١) فواتير SQL بكل الأشكال الي بالإنتاج،
 * و(٢) النتائج المتوقَّعة محسوبةً بدوالّ الواجهة **نفسها** (receiptsOf من
 * src/lib/debt.ts). ثم يقارن report-parity.mjs مخرجاتِ SQL بها فلساً بفلس.
 *
 *   TZ=Asia/Baghdad node scripts/report-fixture.mjs <dir>
 *
 * حتمي: بذرة ثابتة، تواريخ ثابتة (المرساة ٢٠٢٦-٠٩-٠٣)، فيعطي نفس الملفّين كل مرّة.
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";

const outDir = process.argv[2];
if (!outDir) { console.error("usage: report-fixture.mjs <dir>"); process.exit(2); }
if (process.env.TZ !== "Asia/Baghdad") { console.error("run with TZ=Asia/Baghdad — التجميع اليومي يعتمد المنطقة الزمنية"); process.exit(2); }

// ---- دوالّ الواجهة الحقيقية -------------------------------------------------
const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({ entryPoints: ["src/lib/debt.ts"], bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs] });
const { receiptsOf, dueOf } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

// ---- عشوائية حتمية ---------------------------------------------------------
let seed = 20260903;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
// عيادةٌ خاصة بهذا الفحص: بقيةُ الحزمة تكتب فواتيرَ بعيادة ١١١١ فتلوّث المجاميع.
const CLINIC = "22222222-2222-2222-2222-222222222222";
const ANCHOR = new Date("2026-09-03T12:00:00+03:00").getTime();
const DAY = 86400000;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);

// ---- البيانات ------------------------------------------------------------
const products = Array.from({ length: 40 }, (_, i) => ({ id: uuid("aaaaaaaa", i + 1), name: `منتج ${i + 1}`, price: int(5, 60) * 250 }));
const staff = [null, uuid("bbbbbbbb", 1), uuid("bbbbbbbb", 2), uuid("bbbbbbbb", 3), uuid("bbbbbbbb", 4)];
const customers = [
  { phone: "07701234567", name: "أبو علي" }, { phone: "٠٧٧٠٩٩٩٩٩٩٩", name: "أم حسن" }, { phone: "07801111111", name: "" },
  { phone: "", name: "زبون بالاسم" }, { phone: "", name: "" }, { phone: "0790 555 5555", name: "سارة" },
];

const invoices = []; const items = [];
let itemN = 0;
for (let n = 1; n <= 320; n++) {
  const created = new Date(ANCHOR - int(0, 140) * DAY - int(0, 23) * 3600000 - int(0, 59) * 60000);
  const lines = int(1, 4);
  let total = 0, cost = 0, units = 0;
  const invId = uuid("cccccccc", n);
  for (let k = 0; k < lines; k++) {
    const svc = rnd() < 0.2;
    const p = svc ? null : pick(products);
    const qty = int(1, 3);
    const price = svc ? int(4, 40) * 500 : p.price;
    const unitCost = svc ? 0 : Math.round(price * 0.6);
    const lineTotal = qty * price;
    total += lineTotal; cost += qty * unitCost; units += qty;
    items.push({ id: uuid("dddddddd", ++itemN), invoice_id: invId, product_id: p?.id ?? null, name: svc ? `فحص ${int(1, 5)}` : p.name, qty, unit_price: price, unit_cost: unitCost, line_total: lineTotal, created_at: created.toISOString() });
  }
  const profit = total - cost;
  const shape = rnd();
  let payment_details = null, amount_paid = total, status = "paid", refunded_at = null;
  if (shape < 0.30) {                       // دفعةٌ واحدة بلا تاريخ
    payment_details = [{ method: pick(["cash", "card", "transfer"]), amount: total }];
  } else if (shape < 0.40) {                // مقسّمة بلا تاريخ
    const a = Math.round(total * 0.4);
    payment_details = [{ method: "cash", amount: a }, { method: "card", amount: total - a }];
  } else if (shape < 0.65) {                // آجلة: دفعةٌ عند البيع، وتسديدٌ لاحق قد يقع داخل المدّة أو خارجها
    const first = Math.round(total * pick([0, 0.25, 0.5]));
    payment_details = first > 0 ? [{ method: "cash", amount: first }] : [];
    amount_paid = first;
    if (rnd() < 0.6) {
      const at = new Date(created.getTime() + int(1, 60) * DAY);
      const rest = rnd() < 0.5 ? total - first : Math.round((total - first) / 2);
      if (rest > 0 && at.getTime() <= ANCHOR + 40 * DAY) { payment_details.push({ method: pick(["cash", "transfer"]), amount: rest, at: at.toISOString() }); amount_paid += rest; }
    }
  } else if (shape < 0.80) {                // قديمة بلا أرجل
    payment_details = null;
    amount_paid = rnd() < 0.5 ? total : Math.round(total * 0.5);
  } else if (shape < 0.90) {                // مردودة
    payment_details = [{ method: "cash", amount: total }];
    status = "refunded"; refunded_at = new Date(created.getTime() + int(0, 10) * DAY).toISOString();
  } else {                                  // تصحيحُ تحصيل: ساقٌ سالبة بتاريخ
    const at = new Date(created.getTime() + int(1, 20) * DAY);
    payment_details = [{ method: "cash", amount: total }, { method: "cash", amount: -Math.round(total * 0.2), at: at.toISOString(), note: "تصحيح" }];
    amount_paid = total - Math.round(total * 0.2);
  }
  const cust = pick(customers);
  invoices.push({ id: invId, created_at: created.toISOString(), total, cost_total: cost, profit, amount_paid, payment_details, status, refunded_at, staff_id: pick(staff), customer_phone: cust.phone || null, customer_name: cust.name || null, item_count: units, payment_method: payment_details?.[0]?.method ?? "cash" });
}

// ---- SQL ----------------------------------------------------------------
const sql = [];
sql.push(`insert into products (id, clinic_id, name, barcode, stock) values\n${products.map((p) => `(${q(p.id)}, ${q(CLINIC)}, ${q(p.name)}, ${q("RPT" + p.id.slice(-4))}, 100)`).join(",\n")} on conflict do nothing;`);
sql.push(`insert into invoices (id, clinic_id, created_at, total, cost_total, profit, amount_paid, payment_details, status, refunded_at, staff_id, customer_phone, customer_name, item_count, payment_method) values\n${invoices.map((i) =>
  `(${q(i.id)}, ${q(CLINIC)}, ${q(i.created_at)}, ${i.total}, ${i.cost_total}, ${i.profit}, ${i.amount_paid}, ${i.payment_details == null ? "null" : q(JSON.stringify(i.payment_details)) + "::jsonb"}, ${q(i.status)}, ${q(i.refunded_at)}, ${q(i.staff_id)}, ${q(i.customer_phone)}, ${q(i.customer_name)}, ${i.item_count}, ${q(i.payment_method)})`).join(",\n")} on conflict do nothing;`);
sql.push(`insert into invoice_items (id, clinic_id, invoice_id, product_id, name, qty, unit_price, unit_cost, line_total, stock_qty, created_at) values\n${items.map((it) =>
  `(${q(it.id)}, ${q(CLINIC)}, ${q(it.invoice_id)}, ${q(it.product_id)}, ${q(it.name)}, ${it.qty}, ${it.unit_price}, ${it.unit_cost}, ${it.line_total}, ${it.product_id ? it.qty : 0}, ${q(it.created_at)})`).join(",\n")} on conflict do nothing;`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "fixture.sql"), sql.join("\n\n") + "\n");

// ---- المتوقَّع، بمنطق الواجهة (ReportsPanel + CustomerLedger + PetSalesWidget) ----
const localYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const RANGES = {
  month: { from: "2026-08-01T00:00:00+03:00", to: "2026-09-03T23:59:59.999+03:00" },
  week: { from: "2026-08-28T00:00:00+03:00", to: "2026-09-03T23:59:59.999+03:00" },
  all: { from: "2020-01-01T00:00:00+03:00", to: "2027-01-01T00:00:00+03:00" },
};
const isPaid = (i) => (i.status ?? "paid") !== "refunded";
const expected = {};
for (const [k, r] of Object.entries(RANGES)) {
  const lo = new Date(r.from).getTime(), hi = new Date(r.to).getTime();
  // المقبوضات باليوم (ReportsPanel: receiptsOf → bucket by local day)
  const daily = new Map(); const paidIds = new Set(); let gross = 0, net = 0;
  for (const inv of invoices) {
    const total = inv.total > 0 ? inv.total : 0;
    for (const rc of receiptsOf(inv)) {
      const tm = new Date(rc.at).getTime();
      if (tm < lo || tm > hi) continue;
      const day = localYMD(new Date(rc.at));
      const cur = daily.get(day) ?? { gross: 0, net: 0, ids: new Set() };
      const n = total > 0 ? inv.profit * (rc.amount / total) : 0;
      cur.gross += rc.amount; cur.net += n; cur.ids.add(inv.id); daily.set(day, cur);
      gross += rc.amount; net += n; paidIds.add(inv.id);
    }
  }
  // الأكثر مبيعاً والموظفون (ReportsPanel: فواتير غير مردودة أُنشئت بالمدّة)
  const okInv = invoices.filter((i) => isPaid(i) && new Date(i.created_at).getTime() >= lo && new Date(i.created_at).getTime() <= hi);
  const okIds = new Set(okInv.map((i) => i.id));
  const top = new Map();
  for (const it of items) { if (!okIds.has(it.invoice_id)) continue; const key = it.product_id || it.name; const cur = top.get(key) ?? { key, name: it.name, qty: 0, revenue: 0 }; cur.qty += it.qty; cur.revenue += it.line_total; top.set(key, cur); }
  const staffRows = new Map();
  for (const inv of okInv) { const key = inv.staff_id || "__none"; const cur = staffRows.get(key) ?? { staff_id: key, invoices: 0, revenue: 0, profit: 0 }; cur.invoices += 1; cur.revenue += inv.total; cur.profit += inv.profit ?? 0; staffRows.set(key, cur); }
  // الفواتير التي تطابق المدّة (report_invoices): أُنشئت فيها، أو رُدّت فيها، أو دفعةٌ فيها، أو دينٌ مفتوح
  const touching = invoices.filter((inv) => {
    const c = new Date(inv.created_at).getTime();
    if (c >= lo && c <= hi) return true;
    if (inv.refunded_at) { const rt = new Date(inv.refunded_at).getTime(); if (rt >= lo && rt <= hi) return true; }
    if (isPaid(inv) && dueOf(inv) > 0.01) return true;
    return (inv.payment_details ?? []).some((l) => l.at && new Date(l.at).getTime() >= lo && new Date(l.at).getTime() <= hi);
  });
  expected[k] = {
    daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, gross: r2(v.gross), net: r2(v.net), invoices: v.ids.size })),
    total: { gross: r2(gross), net: r2(net), invoices: paidIds.size },
    top: [...top.values()].sort((a, b) => b.revenue - a.revenue || (a.key < b.key ? -1 : 1)).slice(0, 5).map((p) => ({ key: p.key, qty: p.qty, revenue: r2(p.revenue) })),
    staff: [...staffRows.values()].map((s) => ({ staff_id: s.staff_id, invoices: s.invoices, revenue: r2(s.revenue), profit: r2(s.profit) })).sort((a, b) => a.staff_id.localeCompare(b.staff_id)),
    touching: touching.map((i) => i.id).sort(),
  };
}
// دفتر الزبون / مبيعات الحيوان: مفتاحُ الواجهة = الهاتف رقمياً وإلا الاسم
const digits = (s) => String(s ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/\D/g, "");
expected.customers = {
  byPhone: { phone: "07701234567", ids: invoices.filter((i) => digits(i.customer_phone) === "07701234567").map((i) => i.id).sort() },
  byEasternPhone: { phone: "٠٧٧٠٩٩٩٩٩٩٩", ids: invoices.filter((i) => digits(i.customer_phone) === "07709999999").map((i) => i.id).sort() },
  bySpacedPhone: { phone: "0790 555 5555", ids: invoices.filter((i) => digits(i.customer_phone) === "07905555555").map((i) => i.id).sort() },
  byName: { name: "زبون بالاسم", ids: invoices.filter((i) => !digits(i.customer_phone) && (i.customer_name ?? "").trim().toLowerCase() === "زبون بالاسم").map((i) => i.id).sort() },
};
expected.ranges = RANGES;
expected.counts = { invoices: invoices.length, items: items.length };
fs.writeFileSync(path.join(outDir, "expected.json"), JSON.stringify(expected, null, 1));
console.log(`fixture: ${invoices.length} invoices, ${items.length} items → ${outDir}`);
