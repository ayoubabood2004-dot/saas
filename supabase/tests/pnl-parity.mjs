/* ============================================================================
 * قالبُ تطابق الأرباح والخسائر (0256): report_pnl بالقاعدة مقابل computePnl بالواجهة — فلساً بفلس.
 *
 * التجريبيُّ يعرض التقريرَ بـcomputePnl (src/lib/pnl.ts) والسحابةُ بـreport_pnl. فرقُ فلسٍ بينهما صافٍ يقوله
 * التجريبيُّ غيرَ الذي تقوله العيادة — وفحوصُ المنطق تجري على التجريبيّ. الطرفان من مصدرهما: الواجهةُ تُحزَم من
 * src/lib/pnl.ts نفسه (esbuild — لا نسخة)، والقاعدةُ بدالّتها الحيّة بعد الموجة.
 *
 * والحالات:
 *   • شهرٌ ذهبيّ مكتوبٌ باليد، ومتوقَّعُه محسوبٌ باليد لا بأيٍّ من الطرفين — فخطأٌ مشتركٌ بالتعريف (يقع بالاثنين
 *     فيتطابقان عليه) يُمسك هنا: فاتورةٌ مرجّعة، وأخرى بربحٍ قديمٍ لا يساوي سعرَها ناقصَ كلفتها، وسطرا مادّةٍ نصفُ
 *     فلسهما يُقرَّب سطراً سطراً (٣٣٣٣٫٣٢٥ و٠٫٠٠٥)، ودفترُ مستهلكات، وفاتورةٌ وسحبٌ على طرفي المدّة بالضبط، وفاتورةٌ
 *     بعد منتصف الليل ببغداد وقبله بغرينتش، وكلُّ جداول السحب: تصنيفاتٌ (ومؤرشفٌ منها) ونصفُ فلسٍ بجدولٍ واحد
 *     (١٠٠٫٠٠٥ + ٠٫٠٠٥)، و«سحب مخزن» بطريقته وبنصّه بمسافات، و«مُرتجع» بحركة، و«PAYROLL_LOAN» بحروفٍ كبيرة،
 *     وبلا تصنيف بنصٍّ وبلا نصّ.
 *   • عيّنةٌ عشوائية ببذرةٍ ثابتة لستة أشهر، بحوافّ الأشهر ببغداد وبرلين (والصيفيُّ يتبدّل فيها).
 *   • توقيتٌ مجهول (⇒ بغداد)، وبحروفٍ صغيرة، ومدّةٌ فارغة، ومدّةٌ مقلوبة، وأطولُ من الحدّ.
 * ولكلّ فرعٍ مرآةٌ مغلوطةٌ عمداً (بغرينتش، تعدّ المرجّعة، تفتح الطرفين، تنسى المعرّف، تنسى الدفتر) تخالف الحالاتِ
 * نفسَها — وإلا فالقالبُ أعمى عن ذلك الفرع.
 *
 *   node supabase/tests/pnl-parity.mjs gen <dir>     ← cases.json، seed.sql، run.sql
 *   psql -f <dir>/seed.sql ; psql -tA -f <dir>/run.sql > <dir>/actual.txt
 *   node supabase/tests/pnl-parity.mjs check <dir>   ← أسطرُ ✓/✗ كالحزمة، ويخرج 1 عند أيّ فرق
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [mode, dir] = process.argv.slice(2);
if (!["gen", "check"].includes(mode) || !dir) { console.error("usage: pnl-parity.mjs gen|check <dir>"); process.exit(2); }

// عيادةُ التطابق وحدها (صاحبُها مديرُها). المعرّفاتُ بمسافاتٍ لا تتداخل.
const PCL = "a2560c00-0000-4000-8000-0000000000c1";
const uid = (kind, n) => `a2560c00-0000-4000-${kind}-${n.toString(16).padStart(12, "0")}`;
const CAT_OLD = uid("8c00", 1), CAT_RENT = uid("8c00", 2), CAT_ELEC = uid("8c00", 3), CAT_RAND = [uid("8c00", 4), uid("8c00", 5)];
const P = (n) => uid("8a00", n);

/* الشهرُ الذهبيّ: فبراير ٢٠٢٦ ببغداد — من منتصف ليل ١/٢ إلى آخر ثانيةٍ من ٢٨/٢ بتوقيتها (UTC+3). */
const G_FROM = "2026-01-31T21:00:00.000Z";
const G_TO = "2026-02-28T20:59:59.999Z";
const GOLDEN = {
  // باليد (انظر الرأس): المبيعاتُ G1+G3+G4+G6، والمرجّعةُ G2 وما بعد الطرف G5 خارجها، والدينُ القديم (0271) ليس بيعاً؛
  // وفرقُ الصرف ١٬٢٥٠ (0264) + ٣٠٠ من تسديد دينٍ قديمٍ بالدولار.
  baghdad: {
    months: [{
      month: "2026-02", invoices: 4, revenue: "36500", cogs: "7915", cogs_products: "6433.34", cogs_materials: "815",
      cogs_other: "666.66", gross: "29085", adjust: "500", stock_loss: "1235", returns: "15000", payroll: "300000",
      payroll_loan: "50000", uncategorized: "1250.25",
      categories: [[CAT_OLD, "75"], [CAT_RENT, "500001"], [CAT_ELEC, "100.01"]],
      fx: "1550", expenses: "867661.26", net: "-837026.26",
    }],
  },
  // نفسُ اللحظتين بغرينتش: G4 (٢١:٣٠Z ليلة ٣١/١) وسحبُ الطرف E12 يقعان بيناير.
  utc: {
    months: [
      { month: "2026-01", invoices: 1, revenue: "1000", cogs: "0", cogs_products: "0", cogs_materials: "0", cogs_other: "0",
        gross: "1000", adjust: "0", stock_loss: "0", returns: "0", payroll: "0", payroll_loan: "0", uncategorized: "0",
        categories: [[CAT_RENT, "1"]], fx: "0", expenses: "1", net: "999" },
      { month: "2026-02", invoices: 3, revenue: "35500", cogs: "7915", cogs_products: "6433.34", cogs_materials: "815",
        cogs_other: "666.66", gross: "28085", adjust: "500", stock_loss: "1235", returns: "15000", payroll: "300000",
        payroll_loan: "50000", uncategorized: "1250.25",
        categories: [[CAT_OLD, "75"], [CAT_RENT, "500000"], [CAT_ELEC, "100.01"]],
        fx: "1550", expenses: "867660.26", net: "-838025.26" },
    ],
  },
};

if (mode === "gen") gen(); else await check();

/* ══ التوليد ══════════════════════════════════════════════════════════════ */
function gen() {
  fs.mkdirSync(dir, { recursive: true });
  let st = 20261102 >>> 0;   // بذرةٌ ثابتة (mulberry32): العيّنةُ نفسُها بكلّ تشغيل
  const R = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const D = (n, s) => { const v = BigInt(n), neg = v < 0n, a = (neg ? -v : v).toString().padStart(s + 1, "0"); return (neg ? "-" : "") + (s ? `${a.slice(0, a.length - s)}.${a.slice(a.length - s)}` : a); };

  const categories = [
    { id: CAT_OLD, name: "قديم مؤرشف", created_at: "2025-12-01T09:00:00.000Z", archived_at: "2026-01-20T09:00:00.000Z" },
    { id: CAT_RENT, name: "إيجار", created_at: "2026-01-01T09:00:00.000Z", archived_at: null },
    { id: CAT_ELEC, name: "كهرباء", created_at: "2026-01-15T09:00:00.000Z", archived_at: null },
    { id: CAT_RAND[0], name: "مولّدة", created_at: "2026-01-15T09:00:00.000Z", archived_at: null },   // نفسُ لحظة كهرباء: يحسمها المعرّف
    { id: CAT_RAND[1], name: "تنظيف", created_at: "2026-03-02T09:00:00.000Z", archived_at: null },
  ];
  const products = Array.from({ length: 6 }, (_, i) => ({ id: P(i + 1), name: `مادة التطابق ${i + 1}` }));
  const invoices = [], items = [], consumption = [], expenses = [];
  let nInv = 0, nItem = 0, nCons = 0, nExp = 0;
  const addInv = (o) => { const id = uid("8b00", ++nInv); invoices.push({ id, status: "paid", ...o }); return id; };
  const inFebL = (d) => `2026-02-${String(d).padStart(2, "0")}T12:00:00.000Z`;
  const addItem = (invoice_id, product_id, qty, unit_cost) => items.push({ id: uid("8d00", ++nItem), invoice_id, product_id, qty, unit_cost });
  const addCons = (invoice_id, value) => consumption.push({ id: uid("8e00", ++nCons), invoice_id, value });
  const addExp = (o) => expenses.push({ id: uid("8f00", ++nExp), method: "cash", category: null, category_id: null, ...o });

  // ── الشهرُ الذهبيّ (الرأس) ──
  const G1 = addInv({ created_at: "2026-02-10T09:00:00.000Z", total: "25000", cost_total: "3815", profit: "21185" });
  addItem(G1, P(1), "1", "3000"); addItem(G1, null, "1", "815");
  for (const v of ["75", "240", "250", "250"]) addCons(G1, v);
  const G2 = addInv({ created_at: "2026-02-11T09:00:00.000Z", status: "refunded", total: "9999", cost_total: "1", profit: "9998" });
  addItem(G2, P(1), "2", "500"); addCons(G2, "100"); addCons(G2, "-100");
  const G3 = addInv({ created_at: "2026-02-12T09:00:00.000Z", total: "10000", cost_total: "4000", profit: "6500" });   // ربحٌ قديم ≠ سعر − كلفة
  addItem(G3, P(2), "2.5", "1333.33"); addItem(G3, P(2), "0.5", "0.01"); addItem(G3, null, "1", "666.67");
  const G4 = addInv({ created_at: "2026-01-31T21:30:00.000Z", total: "1000", cost_total: "0", profit: "1000" });
  addItem(G4, null, "1", "0");
  const G5 = addInv({ created_at: "2026-02-28T21:30:00.000Z", total: "2000", cost_total: "500", profit: "1500" });
  addItem(G5, P(1), "1", "500");
  const G6 = addInv({ created_at: G_TO, total: "500", cost_total: "100", profit: "400" });
  // 0264 فرقُ الصرف: فاتورةُ دولارٍ من كانون الثاني (خارج المدّة) تسديداتُها بشباط — ساقا فرقٍ +٢٬٠٠٠ و−٧٥٠ = ١٬٢٥٠ بشباط،
  // وساقُ حصّةٍ عادية لا تُحسب. وساقُ fx على فاتورة دينار، وعلى فاتورة دولارٍ مرجّعة، لا تُحسبان.
  const USD = (o) => ({ currency: "USD", fx_rate: "1460", total_usd: "100", paid_usd: "0", ...o });
  // 0271: دينٌ قديم بشباط — ليس بيعاً: لا إيرادَ ولا فاتورة (المتوقَّعُ باليد أعلاه بلاه). ودينٌ قديمٌ بالدولار من كانون الثاني
  // تسديدُه بشباط بفرق صرف ٣٠٠ — الفرقُ يبقى كفرق ديون الدولار (فالمتوقَّعُ بشباط ١٬٢٥٠ + ٣٠٠).
  addInv({ created_at: "2026-02-15T09:00:00.000Z", total: "70000", cost_total: "0", profit: "0", sale_kind: "opening" });
  addInv(USD({ created_at: "2026-01-20T09:00:00.000Z", total: "146000", cost_total: "0", profit: "0", sale_kind: "opening",
    payment_details: [{ method: "cash", amount: 58400, at: inFebL(23) }, { method: "cash", amount: 300, at: inFebL(23), kind: "fx" }] }));
  addInv(USD({ created_at: "2026-01-15T09:00:00.000Z", total: "146000", cost_total: "0", profit: "146000",
    payment_details: [{ method: "cash", amount: 146000, at: inFebL(20) }, { method: "cash", amount: 2000, at: inFebL(20), kind: "fx" },
      { method: "cash", amount: -750, at: inFebL(22), kind: "fx" }] }));
  addInv({ created_at: "2026-01-16T09:00:00.000Z", total: "1000", cost_total: "0", profit: "1000",
    payment_details: [{ method: "cash", amount: 9999, at: inFebL(21), kind: "fx" }] });
  addInv(USD({ created_at: "2026-01-17T09:00:00.000Z", status: "refunded", total: "1000", cost_total: "0", profit: "1000",
    payment_details: [{ method: "cash", amount: 8888, at: inFebL(21), kind: "fx" }] }));
  addItem(G6, P(1), "1", "100");
  const inFeb = inFebL;
  addExp({ spent_at: inFeb(10), amount: "500000", category: "إيجار", category_id: CAT_RENT });
  addExp({ spent_at: inFeb(11), amount: "100.005", category: "كهرباء", category_id: CAT_ELEC });
  addExp({ spent_at: inFeb(12), amount: "0.005", category: "كهرباء", category_id: CAT_ELEC });
  addExp({ spent_at: inFeb(13), amount: "1234.5", category: "سحب مخزن", method: "stock" });
  addExp({ spent_at: inFeb(13), amount: "0.5", category: "  سحب   مخزن " });
  addExp({ spent_at: inFeb(14), amount: "15000", category: "مُرتجع" });
  addExp({ spent_at: inFeb(15), amount: "300000", category: "payroll", method: "bank" });
  addExp({ spent_at: inFeb(16), amount: "50000", category: "PAYROLL_LOAN" });
  addExp({ spent_at: inFeb(17), amount: "1000", category: "شي ثاني" });
  addExp({ spent_at: inFeb(18), amount: "250.25", category: null });
  addExp({ spent_at: inFeb(19), amount: "75", category: "قديم مؤرشف", category_id: CAT_OLD });
  addExp({ spent_at: G_FROM, amount: "1", category: "إيجار", category_id: CAT_RENT });
  addExp({ spent_at: "2026-02-28T21:00:00.000Z", amount: "999", category: "إيجار", category_id: CAT_RENT });   // آذار ببغداد

  // ── العيّنة: آذار–حزيران ٢٠٢٦، ولحظاتٌ قرب منتصف الليل ببغداد وبرلين — **خارج نافذة الشهر الذهبيّ** (متوقَّعُه
  //    باليد، فصفٌّ عشوائيٌّ يقع فيه يكذّبه): أوّلُ السنة (حافّةُ half_year) ثمّ نيسان فما بعده؛ وحافّةُ آذار ببغداد
  //    تلاصق طرفَه الأخير فتُترك. وتبديلُ برلين الصيفيّ (٢٩/٣) داخل berlin_dst.
  const t0 = Date.parse("2026-03-02T00:00:00.000Z"), t1 = Date.parse("2026-06-30T00:00:00.000Z");
  const edges = [];
  for (const m of [0, 3, 4, 5, 6]) {
    const bag = Date.UTC(2026, m, 1) - 3 * 3600_000;     // منتصفُ ليل أوّل الشهر ببغداد
    const ber = Date.UTC(2026, m, 1) - (m >= 3 && m <= 9 ? 2 : 1) * 3600_000;   // ببرلين (صيفيٌّ من آخر آذار)
    edges.push(bag, ber);
  }
  const instant = () => new Date(pick([
    () => int(t0, t1),
    () => pick(edges) + int(-90, 90) * 60_000,
    () => pick(edges) + pick([-1, 0, 1]),
  ])()).toISOString();
  for (let i = 0; i < 160; i++) {
    const total = int(0, 4_000_000);
    const cost = int(0, total);
    const legacy = R() < 0.06 ? int(-5000, 5000) : 0;
    // 0271: عُشرُها دينٌ قديم — بلا ربحٍ ولا كلفةٍ ولا سطورٍ ولا مستهلكات (شكلُ old_debt_add)، وحالتُه مدفوعة أبداً.
    if (R() < 0.1) {
      const usd = R() < 0.5;
      addInv({
        created_at: instant(), total: D(int(1, 4_000_000), 2), cost_total: "0", profit: "0", sale_kind: "opening",
        ...(usd ? { currency: "USD", fx_rate: "1460", total_usd: "100", paid_usd: "0",
          payment_details: [{ method: "cash", amount: Number(D(int(1, 90_000), 2)), at: instant() },
            { method: "cash", amount: Number(D(int(-5_000, 5_000), 2)), at: instant(), kind: "fx" }] } : {}),
      });
      continue;
    }
    const id = addInv({
      created_at: instant(), status: pick(["paid", "paid", "paid", "paid", "paid", "refunded"]),   // status NOT NULL بالقاعدة (افتراضُه paid)
      total: D(total, 2), cost_total: D(cost, 2), profit: D(total - cost + legacy, 2),
      ...(R() < 0.3 ? {
        currency: R() < 0.8 ? "USD" : undefined, fx_rate: "1460", total_usd: "100", paid_usd: "0",
        payment_details: Array.from({ length: int(1, 3) }, () => ({ method: "cash", amount: Number(D(int(-50_000, 90_000), 2)),
          ...(R() < 0.85 ? { at: instant() } : {}), ...(R() < 0.8 ? { kind: "fx" } : {}) })),
      } : {}),
    });
    for (let k = int(0, 4); k > 0; k--) {
      const prod = R() < 0.6;
      const qty = D(pick([int(1, 9000), int(1, 20) * 1000, -int(1, 3000), int(1, 9)]), 3);
      addItem(id, prod ? pick(products).id : null, qty === "0.000" ? "1" : qty, D(pick([int(0, 99_999), int(0, 9_999_999), 1]), 2));
    }
    if (R() < 0.4) for (let k = int(1, 5); k > 0; k--) addCons(id, D(pick([int(1, 500_000), -int(1, 50_000)]), 2));
  }
  const texts = [
    () => ({ category: "مرتجع" }), () => ({ category: "مُرتجع" }), () => ({ category: "payroll" }), () => ({ category: "Payroll", method: "bank" }),
    () => ({ category: "payroll_loan" }), () => ({ category: "سحب مخزن", method: "stock" }), () => ({ category: "سحب مخزن" }),
    () => ({ category: "  سحب ـمخزن" }), () => ({ category: null }), () => ({ category: "" }), () => ({ category: "قرطاسية" }),
    () => ({ category: "مولّدة", category_id: CAT_RAND[0] }), () => ({ category: "تنظيف", category_id: CAT_RAND[1], method: "card" }),
    () => ({ category: "إيجار", category_id: CAT_RENT }), () => ({ category: "مرتجع", category_id: CAT_ELEC }),   // المعرّفُ يغلب النصّ
  ];
  for (let i = 0; i < 140; i++) {
    const amount = pick([D(int(1, 99_999_999), 2), D(int(1, 9_999_999), 4), D(int(1, 9), 3), String(int(1, 900_000))]);
    addExp({ spent_at: instant(), amount, ...pick(texts)() });
  }

  const some = (a) => a[Math.floor(a.length / 2)];
  const cases = [
    { id: "golden_baghdad", from: G_FROM, to: G_TO, tz: "Asia/Baghdad" },
    { id: "golden_utc", from: G_FROM, to: G_TO, tz: "UTC" },
    { id: "half_year", from: "2025-12-31T21:00:00.000Z", to: "2026-06-30T20:59:59.999Z", tz: "Asia/Baghdad" },
    { id: "berlin_dst", from: "2026-02-28T23:00:00.000Z", to: "2026-05-31T21:59:59.999Z", tz: "Europe/Berlin" },
    { id: "unknown_tz", from: "2026-01-15T00:00:00.000Z", to: "2026-04-15T00:00:00.000Z", tz: "Mars/Olympus" },
    { id: "lower_tz", from: "2026-01-15T00:00:00.000Z", to: "2026-04-15T00:00:00.000Z", tz: "asia/baghdad" },
    { id: "exact_bounds", from: some(invoices).created_at < some(expenses).spent_at ? some(invoices).created_at : some(expenses).spent_at,
      to: some(invoices).created_at < some(expenses).spent_at ? some(expenses).spent_at : some(invoices).created_at, tz: "Asia/Baghdad" },
    { id: "empty", from: "2027-01-01T00:00:00.000Z", to: "2027-01-02T00:00:00.000Z", tz: "Asia/Baghdad" },
    { id: "inverted", from: "2026-03-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z", tz: "Asia/Baghdad", error: "pnl_range" },
    { id: "too_long", from: "2025-01-01T00:00:00.000Z", to: "2026-02-06T00:00:00.001Z", tz: "Asia/Baghdad", error: "pnl_range_long" },
    { id: "max_len", from: "2025-01-01T00:00:00.000Z", to: "2026-02-05T00:00:00.000Z", tz: "Asia/Baghdad" },
  ];
  fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify({ categories, products, invoices, items, consumption, expenses, cases }, null, 1));

  const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
  const sql = [
    "begin;",
    `insert into auth.users(id) values ('${PCL}') on conflict do nothing;`,
    `insert into expense_categories(id, clinic_id, name, created_at, archived_at) values ${categories.map((c) => `('${c.id}', '${PCL}', ${q(c.name)}, ${q(c.created_at)}, ${q(c.archived_at)})`).join(", ")};`,
    `insert into products(id, clinic_id, name) values ${products.map((p) => `('${p.id}', '${PCL}', ${q(p.name)})`).join(", ")};`,
    // فواتيرُ الدولار تُكتب من باب usd_checkout وحده (محفّزُ invoices_usd_door) — القالبُ يفتح البابَ لمعاملته.
    `select set_config('doctorvet.usd_door', 'on', true);`,
    // والدينُ القديم من بابه (0271) — والقالبُ يفتحه لمعاملته كذلك.
    `select set_config('doctorvet.opening_door', 'on', true);`,
    `insert into invoices(id, clinic_id, total, cost_total, profit, status, created_at, currency, fx_rate, total_usd, paid_usd, payment_details, sale_kind, opening_what) values ${invoices.map((i) => `('${i.id}', '${PCL}', ${i.total}, ${i.cost_total}, ${i.profit}, ${q(i.status)}, ${q(i.created_at)}, ${q(i.currency ?? "IQD")}, ${i.fx_rate ?? "null"}, ${i.total_usd ?? "null"}, ${i.paid_usd ?? "null"}, ${i.payment_details ? `${q(JSON.stringify(i.payment_details))}::jsonb` : "null"}, ${q(i.sale_kind ?? "retail")}, ${i.sale_kind === "opening" ? "'دين سابق'" : "null"})`).join(",\n  ")};`,
    `insert into invoice_items(id, invoice_id, clinic_id, product_id, name, qty, unit_price, unit_cost, line_total, stock_qty) values ${items.map((it) => `('${it.id}', '${it.invoice_id}', '${PCL}', ${q(it.product_id)}, 'سطر', ${it.qty}, 0, ${it.unit_cost}, 0, ${it.product_id ? it.qty : "null"})`).join(",\n  ")};`,
    // دفترُ 0252 بشكله: الصرفُ موجبٌ والإرجاعُ سالب، والكميةُ بإشارة القيمة.
    `insert into invoice_consumption(id, clinic_id, invoice_id, item_id, spec_id, product_id, product_name, unit, per_qty, per_div, unit_cost, per_value, line_qty, qty, posted, value, kind, source) values ${consumption.map((c) => {
      const neg = c.value.startsWith("-");
      return `('${c.id}', '${PCL}', '${c.invoice_id}', '${c.id}', '${c.id}', '${P(1)}', 'مادة', 'stock', 1, 1, 0, 0, 1, ${neg ? "-1" : "1"}, 0, ${c.value}, '${neg ? "restore" : "use"}', 'recipe')`;
    }).join(",\n  ")};`,
    `insert into expenses(id, clinic_id, amount, description, category, category_id, method, spent_at) values ${expenses.map((e) => `('${e.id}', '${PCL}', ${e.amount}, 'تطابق', ${q(e.category)}, ${q(e.category_id)}, '${e.method}', ${q(e.spent_at)})`).join(",\n  ")};`,
    "commit;",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "seed.sql"), sql + "\n");

  fs.writeFileSync(path.join(dir, "run.sql"), [
    // صاحبُ العيادة يسأل (definer يقرأ بعيادة auth_clinic())، والرفضُ يرجع رمزَه نصّاً لا يوقف النداء.
    `create or replace function _pnl_case(p_from timestamptz, p_to timestamptz, p_tz text) returns jsonb language plpgsql as $f$
     begin
       perform set_config('request.jwt.claim.sub', '${PCL}', true);
       return report_pnl(p_from, p_to, p_tz);
     exception when others then
       return jsonb_build_object('error', sqlerrm);
     end $f$;`,
    `select jsonb_build_object(${cases.map((c) => `'${c.id}', _pnl_case('${c.from}', '${c.to}', '${c.tz}')`).join(", ")})::text;`,
  ].join("\n") + "\n");
  console.log(`cases: ${cases.length}، فواتير: ${invoices.length}، سطور: ${items.length}، دفتر: ${consumption.length}، سحوبات: ${expenses.length}`);
}

/* ══ المقارنة ═════════════════════════════════════════════════════════════ */
async function check() {
  const { build } = await import("esbuild");
  const out = path.join(dir, "pnl-mirror.mjs");
  await build({
    stdin: { contents: 'export * from "./src/lib/pnl.ts";\nexport { toCents } from "./src/lib/consumption.ts";\n', resolveDir: ROOT, loader: "ts" },
    bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
    plugins: [{ name: "at", setup(b) { b.onResolve({ filter: /^@\// }, (a) => b.resolve("./" + a.path.slice(2), { kind: a.kind, resolveDir: path.join(ROOT, "src") })); } }],
  });
  const M = await import(pathToFileURL(out).href);
  const data = JSON.parse(fs.readFileSync(path.join(dir, "cases.json"), "utf8"));
  let fail = 0;
  const ok = (t) => console.log(`   ✓ ${t}`);
  const no = (t, details = []) => { fail = 1; console.log(`   ✗ ${t}`); for (const d of details.slice(0, 6)) console.log(`      ${d}`); };
  let act;
  try { act = JSON.parse(fs.readFileSync(path.join(dir, "actual.txt"), "utf8").trim()); }
  catch (e) { no(`القاعدةُ أرجعت جوابَ التطابق (run.sql) — لا JSON: ${String(e.message).slice(0, 80)}`); process.exit(1); }

  const input = (d) => ({
    invoices: d.invoices, items: d.items, expenses: d.expenses, categories: d.categories,
    consumption: d.consumption.map((c) => ({ invoice_id: c.invoice_id, cents: M.toCents(c.value) })),
  });
  const run = (inp, c) => { try { return M.computePnl(inp, c.from, c.to, c.tz); } catch (e) { return { error: e.message }; } };

  // مقارنةٌ تامّة: الأرقامُ بالفلس (BigInt)، والعددُ والنصوصُ كما هي — والفرقُ الأوّل يُقال بمكانه.
  const cents = (x) => (typeof x === "number" || typeof x === "string" ? M.toCents(x) : null);
  const NUM = ["revenue", "cogs", "cogs_products", "cogs_materials", "cogs_other", "gross", "adjust", "stock_loss", "returns",
    "payroll", "payroll_loan", "uncategorized", "fx", "expenses", "net"];
  const diffTotals = (where, a, b) => {
    const d = [];
    if (!a || !b) return [`${where}: ${a ? "" : "القاعدة"}${!a && !b ? " و" : ""}${b ? "" : "المرآة"} بلا قيمة`];
    if (Number(a.invoices) !== Number(b.invoices)) d.push(`${where}.invoices: ${a.invoices} ≠ ${b.invoices}`);
    for (const k of NUM) { const x = cents(a[k]), y = cents(b[k]); if (x === null || y === null || x !== y) d.push(`${where}.${k}: ${a[k]} ≠ ${b[k]}`); }
    const ca = a.categories ?? [], cb = b.categories ?? [];
    if (ca.length !== cb.length) d.push(`${where}.categories: ${ca.length} ≠ ${cb.length}`);
    else ca.forEach((c, i) => {
      const o = cb[i];
      if (c.id !== o.id || (c.name ?? null) !== (o.name ?? null) || cents(c.amount) !== cents(o.amount)) d.push(`${where}.categories[${i}]: ${JSON.stringify(c)} ≠ ${JSON.stringify(o)}`);
    });
    return d;
  };
  const diffReport = (a, b) => {
    if (a?.error || b?.error) return (a?.error ?? "") === (b?.error ?? "") ? [] : [`error: ${a?.error ?? "-"} ≠ ${b?.error ?? "-"}`];
    const d = [];
    const ma = a.months ?? [], mb = b.months ?? [];
    if (ma.map((m) => m.month).join(",") !== mb.map((m) => m.month).join(",")) d.push(`الأشهر: ${ma.map((m) => m.month)} ≠ ${mb.map((m) => m.month)}`);
    else ma.forEach((m, i) => d.push(...diffTotals(m.month, m, mb[i])));
    d.push(...diffTotals("total", a.total, b.total));
    return d;
  };

  const inp = input(data);
  const js = Object.fromEntries(data.cases.map((c) => [c.id, run(inp, c)]));
  for (const c of data.cases) {
    const d = diffReport(act[c.id], js[c.id]);
    if (d.length) no(`${c.id}: القاعدةُ = المرآة`, d);
    else ok(`${c.id}: القاعدةُ = المرآة${c.error ? ` (رفضُ ${c.error} بالطرفين)` : ` (${(js[c.id].months ?? []).length} شهر)`}`);
    if (c.error && js[c.id]?.error !== c.error) no(`${c.id}: المرآةُ ترفض ${c.error}`, [`طلع ${js[c.id]?.error ?? "تقرير"}`]);
  }

  // الذهبيّ باليد — للطرفين كليهما.
  const golden = (g) => ({
    months: g.months.map((m) => ({ ...m, categories: m.categories.map(([id, amount]) => ({ id, name: data.categories.find((c) => c.id === id)?.name ?? null, amount })) })),
    total: null,
  });
  for (const [cid, g] of [["golden_baghdad", GOLDEN.baghdad], ["golden_utc", GOLDEN.utc]]) {
    const want = golden(g);
    for (const [who, rep] of [["القاعدة", act[cid]], ["المرآة", js[cid]]]) {
      const d = [];
      const ms = rep?.months ?? [];
      if (ms.map((m) => m.month).join(",") !== want.months.map((m) => m.month).join(",")) d.push(`الأشهر: ${ms.map((m) => m.month)}`);
      else want.months.forEach((m, i) => d.push(...diffTotals(m.month, ms[i], m)));
      if (d.length) no(`${cid}: ${who} = المحسوبُ باليد`, d); else ok(`${cid}: ${who} = المحسوبُ باليد`);
    }
  }
  // والمجموعُ لا يتبع التوقيت حين تتطابق اللحظتان.
  { const d = diffTotals("total", act.golden_baghdad?.total, act.golden_utc?.total); if (d.length) no("مجموعُ المدّة نفسُه ببغداد وبغرينتش", d); else ok("مجموعُ المدّة نفسُه ببغداد وبغرينتش"); }

  // مرايا مغلوطةٌ عمداً: كلٌّ يخالف القاعدةَ بحالةٍ واحدةٍ على الأقلّ — وإلا فالقالبُ أعمى عن فرعها.
  const plain = data.cases.filter((c) => !c.error);
  const mutants = [
    ["تجمع الأشهرَ بغرينتش", (c) => run(inp, { ...c, tz: "UTC" })],
    ["تعدّ الفواتيرَ المرجّعة", (c) => run(input({ ...data, invoices: data.invoices.map((i) => ({ ...i, status: "paid" })) }), c)],
    ["تفتح طرفي المدّة", (c) => run(inp, { ...c, from: new Date(Date.parse(c.from) + 1).toISOString(), to: new Date(Date.parse(c.to) - 1).toISOString() })],
    ["تنسى معرّفَ التصنيف (تصنّف بالنصّ)", (c) => run(input({ ...data, expenses: data.expenses.map((e) => ({ ...e, category_id: null })) }), c)],
    ["تنسى دفترَ المستهلكات", (c) => run(input({ ...data, consumption: [] }), c)],
    ["تنسى فرقَ الصرف", (c) => run(input({ ...data, invoices: data.invoices.map((i) => ({ ...i, payment_details: null })) }), c)],
    ["تعدّ ساقَ fx على فاتورة الدينار", (c) => run(input({ ...data, invoices: data.invoices.map((i) => ({ ...i, currency: "USD" })) }), c)],
    ["تعدّ الدينَ القديم بيعاً", (c) => run(input({ ...data, invoices: data.invoices.map((i) => ({ ...i, sale_kind: null })) }), c)],
    ["تنسى طريقةَ «stock»", (c) => run(input({ ...data, expenses: data.expenses.map((e) => ({ ...e, method: e.method === "stock" ? "cash" : e.method, category: e.method === "stock" ? "x" : e.category })) }), c)],
  ];
  for (const [name, f] of mutants) {
    const hit = plain.filter((c) => diffReport(act[c.id], f(c)).length > 0).map((c) => c.id);
    if (hit.length) ok(`المرآةُ المغلوطة «${name}» تخالف القاعدة (${hit.join("، ")})`);
    else no(`المرآةُ المغلوطة «${name}» تخالف القاعدة — القالبُ أعمى عن هذا الفرع`);
  }
  console.log(`${fail ? "✗" : "✓"} pnl-parity: ${data.cases.length} حالة، ${mutants.length} مرآة مغلوطة`);
  process.exit(fail);
}
