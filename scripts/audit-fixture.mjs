/* ============================================================================
 * قالبُ فحص المخزن (0245) — بياناتٌ بكلّ الأشكال، والمتوقَّعُ تحسبه المرآةُ نفسُها.
 *
 * نفسُ منهج customer-fixture: يكتب `fixture.sql` (عيادتان: مواد، شركات، أقسام، فواتير
 * وسطور، مولّد الباركود، حقل دواجن) و`calls.sql` (نداءاتُ report_inventory_audit بأربع
 * نوافذ بهويّة العيادة الأولى، ورموزٌ ملغومة لـinv_code_kind/inv_gtin_ok)، و`expected.json`
 * الذي تحسبه `inventoryAudit` و`codeKind` و`gtinOk` **من المصدر** (esbuild) على صفوف
 * العيادة الأولى وحدها. ثم `audit-parity.mjs` يقارن ناتجَ القاعدة به صفّاً بصفّ.
 *
 * والقالبُ يُقاس على ما تُنتجه القاعدةُ فعلاً (CLAUDE.md §٣):
 *   • كلُّ نوعٍ وكلُّ سببٍ فرعيّ، والحدود: عمرُ ٣٠ يوماً بالضبط، بيعٌ قبل ٣٠ يوماً بالضبط،
 *     صافٍ سالب بسطر إرجاع، فاتورةٌ مردودة، حوضُ قسم، مادةُ حقل، بيعٌ بعد p_to؛
 *   • الحقيبةُ (١٠٬٠٠٠) والويسكاس (١٧٢٨ = ١٤٤×١٢) كما قاسها الجرد، وشبيهاهما السليمان؛
 *   • عيادةٌ ثانية تحمل ما **لو تسرّب** لغيّر الناتج: نفسُ البادئة بشركةٍ أخرى، نفسُ الاسم،
 *     الرمزُ الداخليّ بمولّدها، وفاتورتُها تبيع مادةَ الأولى — والمتوقَّعُ بلاها؛
 *   • ورموزٌ ملغومة: عربيّ، إكسل، أرقامٌ شرقية، محارفُ خفية، رموزٌ خارج BMP (طولُ المحارف
 *     لا وحداتُ UTF-16).
 *
 *   node scripts/audit-fixture.mjs <outDir>
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2];
if (!out) { console.error("الاستعمال: node scripts/audit-fixture.mjs <outDir>"); process.exit(2); }

const built = await esbuild.build({
  entryPoints: ["src/lib/inventoryAudit.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|react|.*\/i18n.*)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default {}; export const t = (k) => k;", loader: "js" }));
    },
  }],
});
const tmp = mkdtempSync(join(tmpdir(), "auditfix-"));
const mf = join(tmp, "m.mjs");
writeFileSync(mf, built.outputFiles[0].text);
const A = await import(pathToFileURL(mf).href).finally(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

/* ---- مولّدٌ حتميّ ---------------------------------------------------------- */
let seed = 20261019;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const DAY = 86400000;
const BASE = Date.parse("2026-10-01T09:00:00Z");
const at = (days, hours = 0) => new Date(BASE - days * DAY - hours * 3600000).toISOString();
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a == null ? "'{}'" : `array[${a.map(q).join(",")}]::text[]`);

const AU1 = "a2450000-0000-4000-8000-0000000000a1";
const AU2 = "a2450000-0000-4000-8000-0000000000a2";
let idn = 0;
const id = (tag) => `a2450000-${tag}-4000-8000-${String(++idn).padStart(12, "0")}`;

/** رقمُ تحققٍ لـ«أرقامٍ بلا آخرها» — لبناء رموزٍ سليمة. */
const withCheck = (body) => { for (let d = 0; d <= 9; d++) if (A.gtinOk(body + d)) return body + d; throw new Error(body); };
const badCheck = (code) => code.slice(0, -1) + ((Number(code.at(-1)) + 1) % 10);

/* ---- الشركات والأقسام ------------------------------------------------------- */
const CO_A = id("c0a0"), CO_B = id("c0b0"), CO_X = id("c0c0");   // X لعيادة ٢
const companies = [
  { id: CO_A, clinic: AU1, name: "شركة ألف" },
  { id: CO_B, clinic: AU1, name: "شركة باء" },
  { id: CO_X, clinic: AU2, name: "شركة العيادة الثانية" },
];
const SEC_P = id("5ec0"), SEC_N = id("5ec1");
const sections = [
  { id: SEC_P, clinic: AU1, company_id: CO_A, name: "قسم مجمّع", pooled_stock: 5 },
  { id: SEC_N, clinic: AU1, company_id: CO_B, name: "قسم عادي", pooled_stock: 0 },
];
const FARM = id("fa50");

/* ---- المواد ----------------------------------------------------------------- */
const products = [];
const P = (o) => {
  const p = {
    // العيادةُ الثانية بوسمٍ آخر: فحصُ العزل بالحزمة يسأل «أترى إحداهما معرّفاتِ الأخرى؟».
    id: id(o.clinic === AU2 ? "b002" : "b000"), clinic: AU1, name: "مادة", barcode: null, alt_codes: [], company_id: null, section_id: null, farm_id: null,
    pooled: false, stock: 0, purchase_price: 1000, created_at: at(200), has_sub_unit: false, units_per_box: null, ...o,
  };
  products.push(p);
  return p;
};
const sales = [];   // { product, days, qty, stock_qty?, status?, clinic? }
const S = (p, days, qty, extra = {}) => sales.push({ p, days, qty, ...extra });

const E8 = withCheck("6281234");                 // EAN-8 سليم…
const E13_OF_E8 = withCheck(E8 + "5678");         // …وهو أوّلُ ثمانيةٍ من EAN-13 سليم
const GOOD = (body12) => withCheck(body12);
const P1 = "6281111", P2 = "6282222", P3 = "6283333";
/** رمزُ مصنعٍ سليم بلا تكرار ستّةٍ ولا تسلسل سبعة — كي لا يصير «نمطاً» بلا قصد. */
const F = (n) => GOOD(`62991${String(n).padStart(3, "0")}4567`);
/** نفسُ الرمز بأرقامٍ شرقية — التطبيعُ يعيده كما هو. */
const east = (c) => c.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));

// ١) الرموز
const pNoCode = P({ name: "بلا رمز", stock: 5 });
P({ name: "رقم رف", barcode: "247", stock: 3 });
P({ name: "طول غريب", barcode: "4468823015", stock: 3 });
P({ name: "تحقق خطأ", barcode: badCheck(GOOD("629111122223")), stock: 3 });
P({ name: "تسلسل", barcode: "6901234567892", stock: 3 });
const pInternal = P({ name: "داخلي غريب", barcode: "2209212578682", stock: 3 });
P({ name: "داخلي مولّد", barcode: "2000000000008", stock: 3 });
P({ name: "ثمانية بادئة", barcode: E8, stock: 3 });
P({ name: "مصنع الثمانية", barcode: E13_OF_E8, stock: 3, company_id: CO_A });
P({ name: "ثمانية مستقلة", barcode: withCheck("4800123"), stock: 3 });
P({ name: "رمز حروف", barcode: "ABC-12345", stock: 3 });
P({ name: "كيبورد عربي", barcode: "اففحس", stock: 3 });
P({ name: "شكل إكسل", barcode: "1.23457E+12", stock: 3 });
P({ name: "فارغ بالتطبيع", barcode: "‎ ", stock: 3 });
P({ name: "رف بإضافي مصنع", barcode: "248", alt_codes: [GOOD("629333344445")], stock: 3 });
P({ name: "إضافيّ وحده", barcode: "", alt_codes: ["249"], stock: 3 });
P({ name: "رف منقول للإضافي", barcode: null, alt_codes: ["  ", "250"], stock: 3 });          // مسحُ رقم الرفّ من النموذج ينقله هنا
P({ name: "مصنع بالإضافي وحده", barcode: " ", alt_codes: ["", GOOD("629123450003")], stock: 3 });
P({ name: "إضافي مشوّه وحده", barcode: "", alt_codes: ["اففحس"], stock: 3 });                 // لا رمزَ يُمسح ⇒ بلا باركود
P({ name: "مشوّه ثم رقم رف", barcode: null, alt_codes: ["1.23457E+12", "248"], stock: 3 });     // يُحكم «248» لا المشوَّه
P({ name: "أرقام شرقية", barcode: east(GOOD("628444455556")), stock: 3 });

// ٢) المكرّر
P({ name: "سناك قطط تونة", barcode: null, stock: 4 });
P({ name: "سناك قطط تونة", barcode: GOOD("629555566667"), stock: 4 });
P({ name: "سناك قطط  تونه", barcode: "XYZ-99999", stock: 4 });
P({ name: "صحن", barcode: "123457", stock: 7 });
P({ name: "صحن", barcode: "123458", stock: 232 });
P({ name: "معلب دجاج", barcode: GOOD("629666677778"), stock: 6 });
P({ name: "معلب  دجاج", barcode: GOOD("629666677779"), stock: 6 });
P({ name: "أ", barcode: GOOD("629777788881"), stock: 1 });
P({ name: "إ", barcode: GOOD("629777788882"), stock: 1 });

// ٣) المستحيل
P({ name: "حقيبة نقل", barcode: GOOD("629888899991"), stock: 10000, purchase_price: 10000, created_at: at(10) });
const pWhiskas = P({ name: "مغلفات ويسكاس", barcode: GOOD("629888899992"), stock: 1726.582, purchase_price: 9500, has_sub_unit: true, units_per_box: 12, created_at: at(19) });
S(pWhiskas, 1, 1, { stock_qty: 1 }); S(pWhiskas, 1, 5, { stock_qty: 0.418 });
const pSubOk = P({ name: "فرعيّة تنباع", barcode: GOOD("629888899993"), stock: 15, purchase_price: 2000, has_sub_unit: true, units_per_box: 10 });
S(pSubOk, 5, 85);
const pBigFast = P({ name: "قيمة كبيرة سريعة", barcode: GOOD("629888899994"), stock: 1000, purchase_price: 5000 });
S(pBigFast, 3, 900);
const pHugeSlow = P({ name: "رصيد خيالي بلا سعر", barcode: GOOD("629888899996"), stock: 99999999, purchase_price: 0 });
S(pHugeSlow, 2, 1, { stock_qty: 0.001 });
const pHugeImp = P({ name: "رصيد خيالي بسعر", barcode: GOOD("629888899997"), stock: 99999999, purchase_price: 1 });
S(pHugeImp, 3, 1, { stock_qty: 0.001 });
const pBigSlow = P({ name: "قيمة كبيرة بطيئة", barcode: GOOD("629888899995"), stock: 400, purchase_price: 5000 });
S(pBigSlow, 20, 10);

// ٤) الراكد والصفر
P({ name: "ما انباعت", barcode: F(11), stock: 4 });
P({ name: "جديدة ما انباعت", barcode: F(12), stock: 4, created_at: at(10) });
P({ name: "عمر ثلاثين بالضبط", barcode: F(13), stock: 4, created_at: at(30) });
const pStopped = P({ name: "وقفت", barcode: F(14), stock: 6 });
S(pStopped, 60, 2);
const pSlow = P({ name: "بطيئة", barcode: F(15), stock: 100 });
S(pSlow, 10, 10);
const pFast = P({ name: "سريعة", barcode: F(16), stock: 10 });
S(pFast, 3, 50);
const pZero = P({ name: "صفر وتنباع", barcode: F(17), stock: 0 });
S(pZero, 2, 7); S(pZero, 40, 3);
const pPooled = P({ name: "مجمّعة", barcode: F(18), stock: 0, pooled: true, section_id: SEC_P, company_id: CO_A });
S(pPooled, 2, 3);
const pOld = P({ name: "بيع قديم جداً", barcode: F(19), stock: 3 });
S(pOld, 200, 1);
const pRefunded = P({ name: "بيعتها مردودة", barcode: F(20), stock: 5 });
S(pRefunded, 3, 2, { status: "refunded" });
const pNet = P({ name: "صافي سالب", barcode: F(21), stock: 50 });
S(pNet, 5, 2); S(pNet, 4, -3);
const pEdge30 = P({ name: "بيع قبل ثلاثين بالضبط", barcode: F(22), stock: 100 });
S(pEdge30, 30, 1);
const pAfter = P({ name: "بيع بعد النافذة القديمة", barcode: F(23), stock: 2 });
S(pAfter, 5, 10);
P({ name: "مادة حقل", barcode: F(24), stock: 9, farm_id: FARM });
const pZeroNoRecent = P({ name: "صفر بلا بيع قريب", barcode: F(25), stock: 0, section_id: SEC_N, company_id: CO_B });
S(pZeroNoRecent, 50, 4);

// ٥) الشركات والبادئات
P({ name: "بادئة ١ أ", barcode: GOOD(P1 + "00001"), stock: 2, company_id: CO_A });
P({ name: "بادئة ١ ب", barcode: GOOD(P1 + "00002"), stock: 2, company_id: CO_A });
P({ name: "بادئة ١ بلا شركة", barcode: GOOD(P1 + "00003"), stock: 2 });
P({ name: "بادئة ٢ أ", barcode: GOOD(P2 + "00001"), stock: 2, company_id: CO_A });
P({ name: "بادئة ٢ ب", barcode: GOOD(P2 + "00002"), stock: 2, company_id: CO_B });
P({ name: "بادئة ٢ بلا شركة", barcode: GOOD(P2 + "00003"), stock: 2 });
P({ name: "بادئة ٣ بلا شركة أ", barcode: GOOD(P3 + "00001"), stock: 2 });
P({ name: "بادئة ٣ بلا شركة ب", barcode: GOOD(P3 + "00002"), stock: 2 });

// ٦) حشوةٌ عشوائيّة حتميّة — وسيطٌ واقعيّ، ومبيعٌ بكلّ الأعمار
for (let i = 1; i <= 48; i++) {
  const p = P({
    name: `مادة رقم ${i}`, barcode: GOOD(`62${String(70000000 + i * 7919).slice(0, 8)}${String(i % 100).padStart(2, "0")}`),
    stock: int(0, 30), purchase_price: int(5, 60) * 250, company_id: i % 3 === 0 ? null : i % 3 === 1 ? CO_A : CO_B,
    created_at: at(int(5, 260), int(0, 23)),
  });
  const n = int(0, 4);
  for (let k = 0; k < n; k++) S(p, int(0, 120), int(1, 6), { hours: int(0, 23) });
}

// العيادةُ الثانية: ما لو تسرّب لغيّر ناتج الأولى
const x1 = P({ clinic: AU2, name: "صحن", barcode: "123459", stock: 9, company_id: CO_X });
P({ clinic: AU2, name: "بادئة ١ بالعيادة الثانية", barcode: GOOD(P1 + "00009"), stock: 2, company_id: CO_X });
S(x1, 2, 1, { clinic: AU2 });
S(products.find((p) => p.name === "ما انباعت"), 2, 1, { clinic: AU2 });   // فاتورةُ الثانية تبيع مادةَ الأولى
const generated = [
  { clinic: AU1, barcode: "2000000000008" },
  { clinic: AU2, barcode: pInternal.barcode },
];

/* ---- الفواتير ---------------------------------------------------------------- */
const invoices = [], items = [];
for (const s of sales) {
  const inv = { id: id("1a00"), clinic: s.clinic ?? AU1, created_at: at(s.days, s.hours ?? 0), status: s.status ?? "paid" };
  invoices.push(inv);
  const qty = s.qty, stockQty = s.stock_qty ?? null;
  items.push({ id: id("1b00"), invoice_id: inv.id, clinic: inv.clinic, product_id: s.p.id, name: s.p.name, qty, stock_qty: stockQty, created_at: inv.created_at });
}

/* ---- النداءات --------------------------------------------------------------- */
const calls = {
  w90: { from: at(90), to: at(0) },
  w30: { from: at(30), to: at(0) },
  w180: { from: at(180), to: at(0) },
  asof: { from: at(110), to: at(20) },     // p_to قبل «الآن»: بيعُ ما بعده لا يُحسب
};
const mine = (c) => c === AU1;
const input = (call) => ({
  products: products.filter((p) => mine(p.clinic)),
  sections: sections.filter((s) => mine(s.clinic)),
  invoices: invoices.filter((i) => mine(i.clinic)),
  items: items.filter((it) => mine(it.clinic)),
  generated: generated.filter((g) => mine(g.clinic)).map((g) => g.barcode),
  companies: companies.filter((c) => mine(c.clinic)),
  from: call.from, to: call.to,
});
const expected = {
  calls: {}, codes: [], gtin: [],
  counts: { products: products.filter((p) => mine(p.clinic)).length, invoices: invoices.filter((i) => mine(i.clinic)).length },
};
for (const [k, c] of Object.entries(calls)) expected.calls[k] = { ...c, rows: A.inventoryAudit(input(c)) };
let rangeErr = null;
try { A.inventoryAudit({ ...input(calls.w90), from: at(6) }); } catch (e) { rangeErr = String(e.message); }
expected.rangeError = rangeErr;

/* ---- رموزٌ ملغومة لـinv_code_kind/inv_gtin_ok ---------------------------------- */
const CODES = [
  "", " ", "‎", "247", "w90", "W90", "00", "1234567", "12345678", "1234567890", "12345678901",
  "123456789012", "1234567890123", "12345678901234", "123456789012345",
  GOOD("629111122223"), badCheck(GOOD("629111122223")), "6901234567892", "6923456789098", "8851234567898",
  "6029876543217", "8699876543210", "0000000000000", "1111111111116", "2000000000008", "2000000000015", "2209212578682",
  badCheck("2000000000008"), E8, badCheck(E8), "15666666", withCheck("4800123"), "ABC-12345", "abc-12345", "AB12",
  "اففحس", "٦٢٨١٢٣٤٥٦٧٨٩٧", "۶۲۸۱۲۳۴۵۶۷۸۹۷", "٦٢٨١أ٢٣٤٥", "1.23457E+12", "1.2e12", "8681234567890.0", "86812.0",
  " 1.2E+12", "6281234567897‏", "‪6281234567897", "62 81 23 45 67 89 7", "6281234567897\t",
  "😀😀😀😀", "😀😀😀😀😀", "😀😀😀😀😀😀😀😀", "۱۲۳", "ک۱۲۳۴۵۶۷۸", "İ12345678", "x".repeat(40),
  "6261000000016", "049000000443", "0049000000443", withCheck("100000000006"), withCheck("100000000000"),
  withCheck("000009876541"), withCheck("000000987654"), withCheck("871000000000"),
  GOOD("062811112222"), GOOD("00062811112"), GOOD("1062811112222"), "0".repeat(8), "9".repeat(14),
  "0123456789012", "7654321000001", "9876543210", "12345670", withCheck("1234567"), withCheck("9999999"),
];
for (const raw of CODES) expected.codes.push({ raw, kind: A.codeKind(raw) });
for (const raw of CODES) { const n = String(raw); expected.gtin.push({ v: n, ok: A.gtinOk(n) }); }

/* ---- SQL ---------------------------------------------------------------------- */
const sql = [];
sql.push(`insert into auth.users(id) values (${q(AU1)}), (${q(AU2)}) on conflict do nothing;`);
sql.push(`insert into poultry_farms(id, clinic_id, name) values (${q(FARM)}, ${q(AU1)}, 'حقل الفحص') on conflict do nothing;`);
sql.push(`insert into companies(id, clinic_id, name) values\n${companies.map((c) => `(${q(c.id)}, ${q(c.clinic)}, ${q(c.name)})`).join(",\n")} on conflict do nothing;`);
sql.push(`insert into company_sections(id, clinic_id, company_id, name, pooled_stock) values\n${sections.map((s) => `(${q(s.id)}, ${q(s.clinic)}, ${q(s.company_id)}, ${q(s.name)}, ${s.pooled_stock})`).join(",\n")} on conflict do nothing;`);
sql.push(`insert into products(id, clinic_id, name, barcode, alt_codes, company_id, section_id, farm_id, pooled, stock, purchase_price, sell_price, created_at, has_sub_unit, units_per_box) values\n${products.map((p) =>
  `(${q(p.id)}, ${q(p.clinic)}, ${q(p.name)}, ${q(p.barcode)}, ${arr(p.alt_codes)}, ${q(p.company_id)}, ${q(p.section_id)}, ${q(p.farm_id)}, ${p.pooled}, ${p.stock}, ${p.purchase_price}, ${p.purchase_price * 2}, ${q(p.created_at)}, ${p.has_sub_unit}, ${p.units_per_box ?? "null"})`).join(",\n")} on conflict do nothing;`);
sql.push(`insert into generated_barcodes(clinic_id, barcode) values\n${generated.map((g) => `(${q(g.clinic)}, ${q(g.barcode)})`).join(",\n")};`);
sql.push(`insert into invoices(id, clinic_id, created_at, status) values\n${invoices.map((i) => `(${q(i.id)}, ${q(i.clinic)}, ${q(i.created_at)}, ${q(i.status)})`).join(",\n")} on conflict do nothing;`);
sql.push(`insert into invoice_items(id, clinic_id, invoice_id, product_id, name, qty, unit_price, unit_cost, line_total, stock_qty, created_at) values\n${items.map((it) =>
  `(${q(it.id)}, ${q(it.clinic)}, ${q(it.invoice_id)}, ${q(it.product_id)}, ${q(it.name)}, ${it.qty}, 100, 50, ${it.qty * 100}, ${it.stock_qty ?? "null"}, ${q(it.created_at)})`).join(",\n")} on conflict do nothing;`);
sql.push(`create table if not exists _audit_codes(raw text, expected text);\ntruncate _audit_codes;\ninsert into _audit_codes values\n${expected.codes.map((c) => `(${q(c.raw)}, ${q(c.kind)})`).join(",\n")};`);
sql.push(`create table if not exists _audit_gtin(v text, ok boolean);\ntruncate _audit_gtin;\ninsert into _audit_gtin values\n${expected.gtin.map((c) => `(${q(c.v)}, ${c.ok})`).join(",\n")};`);

const callSql = [
  `create table if not exists _audit_out(id text primary key, res json);`,
  `truncate _audit_out;`,
  `create or replace function _audit_call(who uuid, f timestamptz, t timestamptz) returns json language plpgsql as $fn$
     declare r json; begin
       perform set_config('request.jwt.claim.sub', who::text, true);
       r := report_inventory_audit_json(f, t)::json;   -- ما تناديه الواجهة نفسُه
       return r;
     exception when others then return json_build_object('error', sqlerrm); end $fn$;`,
  ...Object.entries(calls).map(([k, c]) => `insert into _audit_out values (${q(k)}, _audit_call(${q(AU1)}, ${q(c.from)}, ${q(c.to)}));`),
  `insert into _audit_out values ('range6', _audit_call(${q(AU1)}, ${q(at(6))}, ${q(at(0))}));`,
];

writeFileSync(join(out, "fixture.sql"), sql.join("\n\n") + "\n");
writeFileSync(join(out, "calls.sql"), callSql.join("\n") + "\n");
writeFileSync(join(out, "expected.json"), JSON.stringify(expected));
const counts = Object.fromEntries(Object.entries(expected.calls).map(([k, c]) => [k, c.rows.length]));
console.log(`audit-fixture: ${products.length} مادة، ${invoices.length} فاتورة، ${CODES.length} رمزاً — ${JSON.stringify(counts)}`);
