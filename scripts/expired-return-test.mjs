/* ============================================================================
 * الراجعُ الإكسباير (0289) — المرآةُ التجريبية بسلوكها، والوصلُ بالنصّ.
 *
 * «حارسٌ لا يوجد بالتجريبيّ حارسٌ لم يُفحص» (CLAUDE.md §٤): فحسابُ return_expired (الفاتورةُ بمفتاح الزبون وما عليها دَينٌ أوّلاً، سطرُ
 * الأثر فلا يتغيّر الربح، الدَّينُ ثمّ أقدمُ دَينه ثمّ النقد، الدفعةُ بكلفة ما رجع) وretail_checkout_lots (كلفةُ الدفعة والإعادةُ بلا نقصٍ ثانٍ)
 * يُفحصان هنا على demoExpired.ts وrepoDemo.ts الحقيقيّتين بالحالات نفسِها التي يفحصها قسمُ 0289 بـrun.sh على القاعدة. ثمّ الوصل: القطعةُ
 * كسولةٌ بنطاقها، والبابُ خارج الإقلاع، ودفعةُ الراجع آخرَ ما يأخذه البيعُ العاديّ، ولا فصلَ لها بنافذة الدفعات. وطفراتٌ على المرآة.
 *
 *   node scripts/expired-return-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const src = (p) => readFileSync(p, "utf8");

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
const DEMO_EXP = resolve("src/lib/demoExpired.ts");
const DEMO_COUNTS = resolve("src/lib/demoCounts.ts");
async function load(mutate, target = DEMO_EXP) {
  const stubs = {
    name: "stubs",
    setup(b) {
      const map = {
        i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', exists: () => false, use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
        "./supabase": "export const supabase = null;",
        "./globalToast": "export const emitGlobalToast = () => {};",
      };
      b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
      b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
      if (mutate) b.onLoad({ filter: /\.ts$/ }, (a) => (resolve(a.path) === target ? { contents: mutate(src(target)), loader: "ts" } : undefined));
    },
  };
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/lib/repo.ts";',
        'export { returnExpired, checkoutLots, listReturnLots, listReturnLotsOf, returnLotsReady, expiredErrorCode } from "./src/lib/expiredApi.ts";',
        'export { reconcileAll, loadLots } from "./src/lib/demoLots.ts";',
        'export { consumptionApi } from "./src/lib/consumptionApi.ts";',
      ].join("\n"),
      resolveDir: process.cwd(), sourcefile: "xret-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(join(tmpdir(), "xret-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

const DB_KEY = /export const DEMO_DB_KEY = "([^"]+)"/.exec(src("src/lib/demoKey.ts"))?.[1];
if (!DB_KEY) { console.error("✗ expired-return-test: ما انقرأ مفتاحُ مخزن الديمو"); process.exit(1); }

/* ---- السيناريو: نفسُ قسم 0289 بـrun.sh — الأرقامُ نفسُها ---------------------------------------------------- */
async function scenario(M) {
  mem.clear();
  const A = "pA", B = "pB";
  const prod = (id, name, extra) => ({ id, name, barcode: id, price_currency: "IQD", sell_price: 20000, purchase_price: 14000, avg_cost: 14000, stock: 20,
    has_sub_unit: false, sub_unit_name: null, units_per_box: null, packs: null, pooled: false, created_at: "2026-01-01T00:00:00.000Z", expiry_date: null, ...extra });
  mem.set(DB_KEY, JSON.stringify({
    products: [
      prod(A, "دواء إكسباير", { has_sub_unit: true, sub_unit_name: "شريط", units_per_box: 10, packs: [{ id: "k1", name: "كارتون", per: 5, codes: ["EXP-K1"] }] }),
      prod(B, "دينار ثاني", { sell_price: 15000, purchase_price: 10000, avg_cost: 10000, stock: 10 }),
      prod("pU", "بالدولار", { price_currency: "USD" }),
      prod("p5", "تحت الصفر", { stock: 2 }),
      prod("p6", "شرائط ثلاثية", { sell_price: 3000, purchase_price: 1500, avg_cost: 1500, stock: 10, has_sub_unit: true, sub_unit_name: "شريط", units_per_box: 3, sub_unit_price: 1000 }),
      prod("pP", "مجمَّعة", { pooled: true, stock: 0 }),
    ],
    companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [], deliveryOrders: [],
  }));
  const repo = M.repo ?? M.demoRepo;
  const db = () => JSON.parse(mem.get(DB_KEY));
  const inv = (ref) => db().invoices.find((i) => i.client_ref === ref);
  const lines = (ref) => db().invoiceItems.filter((l) => l.invoice_id === inv(ref)?.id);
  const lots = (pid) => M.reconcileAll().filter((l) => l.product_id === pid);
  const sale = (ref, pid, qty, price, paid, name = null, phone = null) => repo.retailCheckout(
    [{ product_id: pid, name: "z", qty, unit_price: price, unit_cost: 0, stock_qty: qty, unit_label: null, service_id: null }],
    { client_ref: ref, payment_method: "cash", amount_paid: paid, final_total: qty * price, customer_name: name, customer_phone: phone });
  const ret = (ref, items, name = null, phone = null) => M.returnExpired(items, { client_ref: ref, customer_name: name, customer_phone: phone, method: "cash", note: null });
  const it = (pid, unit, qty, pct, date, extra = {}) => ({ product_id: pid, unit, qty, pct, expiry_date: date, unit_price: 20000, ...extra });
  const code = async (p) => { try { await p; return "ok"; } catch (e) { return M.expiredErrorCode(e) ?? String(e?.message); } };
  const out = {};
  M.reconcileAll();

  await sale("s1", A, 2, 20000, 0, "أبو علي", "07701234567");
  const r1 = await ret("r1", [it(A, "box", 1, 50, "2026-10-01")], "أبو علي", "07701234567");
  out.r1 = `${r1.debt}/${r1.cash}`;
  const i1 = inv("s1");
  out.s1 = `${i1.total}/${i1.cost_total}/${i1.profit}/${i1.amount_paid}`;
  out.s1lines = lines("s1").map((l) => `${l.qty}:${l.unit_price}:${l.unit_cost}:${l.product_id == null}`).sort().join(",");
  const lot1 = lots(A).find((l) => l.source === "return");
  out.lot1 = lot1 ? `${lot1.qty}/${lot1.unit_cost}/${lot1.return_pct}/${lot1.return_from}/${lot1.expiry_date}/${lot1.return_invoice === i1.id}` : "none";
  out.stock1 = `${db().products.find((p) => p.id === A).stock}=${lots(A).reduce((s, l) => s + l.qty, 0)}`;
  const r1b = await ret("r1", [it(A, "box", 1, 50, "2026-10-01")], "أبو علي", "07701234567");
  out.replay = `${r1b.debt}/${r1b.cash}|${lots(A).filter((l) => l.source === "return").length}|${db().products.find((p) => p.id === A).stock}`;

  await sale("s2", A, 1, 20000, 20000);
  out.normal = lots(A).map((l) => `${l.source}:${l.qty}`).join(",");

  const lotId = lots(A).find((l) => l.source === "return").id;
  const lotItem = { product_id: A, name: "z", qty: 1, unit_price: 12000, unit_cost: 0, stock_qty: 1, unit_label: null, service_id: null, lot_id: lotId };
  const meta3 = { client_ref: "s3", payment_method: "cash", amount_paid: 12000, final_total: 12000 };
  const s3 = await M.checkoutLots([lotItem], meta3, null, null);
  out.lotSale = `${s3.iqd.cost_total}/${s3.iqd.profit}|${lines("s3").map((l) => l.unit_cost).join(",")}`;
  out.afterLot = lots(A).map((l) => `${l.source}:${l.qty}`).join(",") + `|${db().products.find((p) => p.id === A).stock}`;
  const s3b = await M.checkoutLots([lotItem], meta3, null, null);
  out.lotReplay = `${s3b.iqd.cost_total}|${db().invoices.filter((i) => i.client_ref === "s3").length}|` + lots(A).map((l) => `${l.source}:${l.qty}`).join(",");

  const r2 = await ret("r2", [it(A, "sub", 5, 100, "2026-09-15")], "أبو علي", "07701234567");
  out.r2 = `${r2.debt}/${r2.cash}|${inv("s1").total}/${inv("s1").profit}/${lines("s1").length}`;

  await sale("s5", A, 6, 20000, 120000, "أم سارة", "07709999999");
  const r3 = await ret("r3", [it(A, "pack", 1, 50, "2026-08-01", { pack_id: "k1" })], "أم سارة", "07709999999");
  const i5 = inv("s5");
  out.r3 = `${r3.debt}/${r3.cash}|${i5.total}/${i5.profit}/${i5.amount_paid}|${(i5.payment_details ?? []).filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0)}`;
  const lotK = lots(A).find((l) => l.source === "return" && l.return_from === "أم سارة");
  out.lotK = lotK ? `${lotK.qty}/${lotK.unit_cost}` : "none";

  await sale("s6", A, 1, 20000, 20000, "أبو علي", "07701234567");
  const r4 = await ret("r4", [it(A, "box", 1, 100, "2026-07-01")], "أبو علي", "07701234567");
  out.r4 = `${r4.debt}/${r4.cash}|${inv("s6").total}/${inv("s6").amount_paid}/${lines("s6").length}|${inv("s1").total - inv("s1").amount_paid}`;

  const r5 = await ret("r5", [it(B, "box", 1, 50, "2026-06-01", { unit_price: 15000 })]);
  const exps = JSON.parse(mem.get([...mem.keys()].find((k) => /expense/i.test(k)) ?? "x") ?? "[]");
  out.r5 = `${r5.debt}/${r5.cash}|${exps[0]?.amount}/${exps[0]?.category}|${lots(B).find((l) => l.source === "return")?.unit_cost}`;

  await sale("s7", B, 1, 15000, 0, "زبون الدين", "07705555555");
  const r6 = await ret("r6", [it(A, "box", 1, 100, "2026-06-01")], "زبون الدين", "07705555555");
  out.r6 = `${r6.debt}/${r6.cash}|${inv("s7").total - inv("s7").amount_paid}`;

  await sale("h1", B, 1, 15000, 0, "أبو حسن", "07702222222");
  await sale("h2", B, 1, 15000, 15000, "أبو حسن", "07702222222");
  { // الدَّينُ أقدم بيوم — بنفس الملّي ثانية كان الترتيبُ بالمعرّف العشوائيّ يختارها مرّةً ويتركها مرّة (طفرةٌ تمرّ بالصدفة).
    const d = db(); d.invoices.find((i) => i.client_ref === "h1").created_at = "2026-11-01T08:00:00.000Z"; mem.set(DB_KEY, JSON.stringify(d)); }
  const r7 = await ret("r7", [it(B, "box", 1, 100, "2026-06-01", { unit_price: 15000 })], "أبو حسن", "07702222222");
  out.r7 = `${r7.debt}/${r7.cash}|${inv("h1").total}|${inv("h2").total}`;

  // ── تصليحاتُ المراجعة: بالأرقام نفسِها التي يفحصها قسمُ 0289 على القاعدة ──
  await sale("k0", B, 1, 15000, 0, "أبو كرار", "07703333333");
  await repo.retailCheckout([{ product_id: A, name: "z", qty: 1, unit_price: 20000, unit_cost: 0, stock_qty: 1, unit_label: null, service_id: null }],
    { client_ref: "k1", payment_method: "card", amount_paid: 20000, final_total: 20000, payment_details: [{ method: "card", amount: 20000 }],
      customer_name: "أبو كرار", customer_phone: "07703333333" });
  { const d = db(); d.invoices.find((i) => i.client_ref === "k0").created_at = "2026-11-01T08:00:00.000Z"; mem.set(DB_KEY, JSON.stringify(d)); }
  const rk = await ret("k2", [it(A, "box", 1, 100, "2026-05-01")], "أبو كرار", "07703333333");
  out.method = `${rk.debt}/${rk.cash}|` + (inv("k1").payment_details ?? []).filter((x) => x.amount < 0).map((x) => `${x.method}:${x.amount}`).join(",")
    + "|" + (inv("k0").payment_details ?? []).filter((x) => x.amount > 0).map((x) => `${x.method}:${x.amount}`).join(",");
  await sale("n1", "p5", 4, 20000, 0, "أم زهراء", "07704444444");
  const rn = await ret("n2", [it("p5", "box", 3, 50, "2026-05-01")], "أم زهراء", "07704444444");
  const l5 = lots("p5").filter((l) => l.source === "return");
  out.neg = `${rn.debt}/${rn.cash}|${db().products.find((p) => p.id === "p5").stock}|${l5.map((l) => `${l.qty}@${l.unit_cost}`).join(",") || "-"}|${inv("n1").profit}`;
  await repo.retailCheckout([{ product_id: "p6", name: "z", qty: 7, unit_price: 1000, unit_cost: 0, stock_qty: 2.333, unit_label: "شريط", service_id: null }],
    { client_ref: "u1", payment_method: "cash", amount_paid: 0, final_total: 7000, customer_name: "أبو مهدي", customer_phone: "07706666666" });
  const ru = await ret("u2", [it("p6", "sub", 1, 100, "2026-05-01")], "أبو مهدي", "07706666666");
  out.unit = `${ru.debt}/${ru.cash}|${lines("u1").map((l) => `${l.qty}:${l.line_total}`).join(",")}|${inv("u1").total}/${inv("u1").item_count}`;
  out.traceDate = String(db().invoiceItems.filter((l) => l.product_id == null && Number(l.stock_qty) === 0)
    .every((l) => l.created_at === db().invoices.find((i) => i.id === l.invoice_id)?.created_at));
  await sale("d1", B, 1, 15000, 0, "زبون التوصيل", "07707777777");
  { const d = db(); d.deliveryOrders.push({ id: "do1", invoice_id: inv("d1").id, status: "out", cod_amount: 15000, created_at: new Date().toISOString() }); mem.set(DB_KEY, JSON.stringify(d)); }
  const rd = await ret("d2", [it(B, "box", 1, 100, "2026-05-01", { unit_price: 15000 })], "زبون التوصيل", "07707777777");
  out.delivery = `${rd.debt}/${rd.cash}|${inv("d1").total}/${inv("d1").amount_paid}`;

  out.stockEq = [A, B].map((pid) => `${db().products.find((p) => p.id === pid).stock}=${lots(pid).reduce((s, l) => s + l.qty, 0)}`).join("|");

  out.refuse = [
    await code(ret("x1", [it("pU", "box", 1, 50, "2026-01-01")])),
    await code(ret("x2", [it("pP", "box", 1, 50, "2026-01-01")])),
    await code(ret("x3", [it(B, "sub", 1, 50, "2026-01-01")])),
    await code(ret("x4", [it(B, "box", 1, 50, "")])),
    await code(ret("x5", [it(B, "box", 1, 0, "2026-01-01")])),
    await code(ret("x6", [it(B, "box", 0, 50, "2026-01-01")])),
    await code(ret("x7", [])),
  ].join("|");
  const l4 = lots(A).find((l) => l.source === "return" && l.qty === 1 && l.return_pct === 100 && l.return_from === "أبو علي");
  out.lotRefuse = [
    await code(M.checkoutLots([{ ...lotItem, qty: 2, stock_qty: 2, unit_price: 1000, lot_id: l4?.id }], { client_ref: "x8", payment_method: "cash", amount_paid: 2000, final_total: 2000 }, null, null)),
    await code(M.checkoutLots([{ ...lotItem, unit_price: 1000, lot_id: "nope" }], { client_ref: "x9", payment_method: "cash", amount_paid: 1000, final_total: 1000 }, null, null)),
  ].join("|") + `|${db().invoices.filter((i) => ["x8", "x9"].includes(i.client_ref)).length}`;
  return out;
}

const EXPECT = {
  r1: "10000/0", s1: "30000/18000/12000/0", s1lines: "1:10000:4000:true,1:20000:14000:false",
  lot1: "1/10000/50/أبو علي/2026-10-01/true", stock1: "19=19", replay: "10000/0|1|19",
  normal: "opening:17,return:1",
  lotSale: "10000/2000|10000", afterLot: "opening:17,return:0|17", lotReplay: "10000|1|opening:17,return:0",
  r2: "10000/0|20000/9000/2", r3: "0/50000|70000/36000/70000|-50000", lotK: "5/10000",
  r4: "20000/0|0/0/1|0", r5: "0/7500|7500/مرتجع|7500", r6: "15000/5000|0", r7: "15000/0|0|15000",
  method: "15000/5000|cash:-20000|cash:15000", neg: "30000/0|1|1@10000|4000", unit: "1000/0|6:6000|6000/6", traceDate: "true", delivery: "0/15000|15000/0",
  stockEq: "17.5=17.5|8=8",
  refuse: "expired_usd|expired_pooled|expired_unit|expired_date|expired_pct|expired_qty|expired_empty",
  lotRefuse: "lot_short|lot_gone|0",
};

/* ---- 0290: التلفُ والجردُ يكلّفان ما أخذاه من دفعة الراجع بكلفتها — أرقامُ قسم 0290 بـrun.sh نفسُها ---------------------- */
async function wasteScenario(M) {
  mem.clear();
  const A = "wA", B = "wB", D = "wD", E = "wE";
  const prod = (id, name, extra) => ({ id, name, barcode: id, price_currency: "IQD", sell_price: 20000, purchase_price: 14000, avg_cost: 14000, stock: 20,
    has_sub_unit: false, sub_unit_name: null, units_per_box: null, packs: null, pooled: false, created_at: "2026-01-01T00:00:00.000Z", expiry_date: null, ...extra });
  mem.set(DB_KEY, JSON.stringify({
    products: [prod(A, "إكسباير ٢٩٠"), prod(B, "بلا راجع ٢٩٠", { sell_price: 5000, purchase_price: 3000, avg_cost: 3000, stock: 10 }),
      prod(D, "جرد ٢٩٠", { stock: 1 }), prod(E, "منحرفة ٢٩٠", { stock: 5 })],
    companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [], deliveryOrders: [],
  }));
  const repo = M.repo ?? M.demoRepo;
  const db = () => JSON.parse(mem.get(DB_KEY));
  const lotsOf = (pid) => M.reconcileAll().filter((l) => l.product_id === pid && l.source === "return");
  const retLeft = (pid) => String(lotsOf(pid).reduce((s, l) => s + l.qty, 0));
  const sale = (ref, pid, qty, name, phone) => repo.retailCheckout(
    [{ product_id: pid, name: "z", qty, unit_price: 20000, unit_cost: 0, stock_qty: qty, unit_label: null, service_id: null }],
    { client_ref: ref, payment_method: "cash", amount_paid: 0, final_total: qty * 20000, customer_name: name, customer_phone: phone });
  const ret = async (ref, pid, pct, name, phone) => {
    const r = await M.returnExpired([{ product_id: pid, unit: "box", qty: 1, pct, expiry_date: "2026-10-01", unit_price: 20000 }],
      { client_ref: ref, customer_name: name, customer_phone: phone, method: "cash", note: null });
    return `${r.debt}/${r.cash}`;
  };
  const waste = async (pid, qty, reason, apply = true) => {
    const r = await M.consumptionApi.submitWaste([{ product_id: pid, qty, unit: "stock", reason, note: "x" }], apply, `w-${pid}-${Math.random()}`);
    return apply ? String(r.decided?.withdrawals?.[0]?.amount ?? "-") : String(r.pending);
  };
  const counts = () => JSON.parse(mem.get("vp_demo_counts") ?? "[]");
  // المخزنُ الأحدثُ أوّلاً (unshift) — كـorder by counted_at desc.
  const last = (pid) => { const c = counts().find((x) => x.product_id === pid); return c ? `${Number(c.unit_cost)}:${c.status}` : "-"; };
  const out = {};
  M.reconcileAll();
  await sale("s1", A, 3, "أبو علي", "07701234567");
  out.r1 = await ret("r1", A, 50, "أبو علي", "07701234567");
  out.w1 = `${await waste(A, 1, "expired")}|${last(A)}|${retLeft(A)}`;
  out.r2 = await ret("r2", A, 50, "أبو علي", "07701234567");
  out.w2 = `${await waste(A, 2, "expired")}|${last(A)}|${retLeft(A)}`;
  out.r3 = await ret("r3", A, 50, "أبو علي", "07701234567");
  out.w3 = `${await waste(A, 1, "damaged")}|${last(A)}|${retLeft(A)}`;
  out.pend = `${await waste(A, 1, "expired", false)}|${last(A)}|${retLeft(A)}`;
  const ids = counts().filter((x) => x.product_id === A && x.status === "pending").map((x) => x.id);
  const dec = await repo.decideStockCounts(ids, true);
  out.pendOk = `${dec.withdrawals?.[0]?.amount ?? "-"}|${last(A)}|${retLeft(A)}`;
  out.noLot = await waste(B, 1, "expired");
  await sale("s2", D, 1, "أم سارة", "07709876543");
  out.r4 = await ret("r4", D, 25, "أم سارة", "07709876543");
  { const d = db(); d.products.find((p) => p.id === D).stock = 2; mem.set(DB_KEY, JSON.stringify(d)); }
  M.reconcileAll();
  const cnt = await repo.submitStockCount([{ product_id: D, counted: 0, reason: "shortage", note: null }]);
  const cids = counts().filter((x) => x.product_id === D && x.status === "pending").map((x) => x.id);
  const dec2 = await repo.decideStockCounts(cids, true);
  out.count = `${cnt ? "ok" : "-"}|${dec2.withdrawals?.[0]?.amount ?? "-"}|${last(D)}|${retLeft(D)}`;
  await sale("s3", E, 1, "أبو حيدر", "07708888888");
  out.r5 = await ret("r5", E, 50, "أبو حيدر", "07708888888");
  { const all = M.loadLots(); all.find((l) => l.product_id === E && l.source === "return").qty = 3; localStorage.setItem([...mem.keys()].find((k) => /lots/i.test(k)), JSON.stringify(all)); }
  out.over = await waste(E, 1, "expired");
  return out;
}
const WEXPECT = {
  r1: "10000/0", w1: "10000|10000:approved|0", r2: "10000/0", w2: "24000|12000:approved|0", r3: "10000/0", w3: "14000|14000:approved|1",
  pend: "1|14000:pending|1", pendOk: "10000|10000:approved|0", noLot: "3000", r4: "5000/0", count: "ok|19000|9500:approved|0", r5: "10000/0", over: "10000",
};

console.log("▸ ١) المرآةُ بالحالات نفسِها التي تفحصها الحزمة على القاعدة (قسمُ 0289)");
const M = await load();
const got = await scenario(M);
for (const [k, v] of Object.entries(EXPECT)) check(`${k}: ${v}`, got[k] === v, `طلع «${got[k]}»`);
console.log("▸ ١ب) التلفُ والجردُ بكلفة دفعة الراجع (قسمُ 0290)");
const wgot = await wasteScenario(M);
for (const [k, v] of Object.entries(WEXPECT)) check(`${k}: ${v}`, wgot[k] === v, `طلع «${wgot[k]}»`);

console.log("▸ ٢) طفراتٌ على المرآة — كلٌّ تُمسك");
const MUTANTS = [
  ["الدفعةُ بكلفة المتوسّط لا بما رجع", (s) => s.replace("T = Math.min(V, r2(oldc - newc));", "T = r2(oldc - newc);")],
  ["سطرُ الأثر بكلفته كاملة (الربحُ ينقص)", (s) => s.replace("restC = r2(oldc - newc - Tl)", "restC = r2(oldc - newc)")],
  ["بلا «ما عليها دَينٌ أوّلاً»", (s) => s.replace("Number(due(b) > 0.005) - Number(due(a) > 0.005) || ", "")],
  ["ما زاد لا يسدّد أقدمَ دَينه", (s) => s.replace("if (cash > 0 && key) {", "if (false) {")],
  ["البيعُ من الدفعة بلا كلفتها", (s) => s.replace("    li.unit_cost = uc;\n", "\n")],
  ["البيعُ من الدفعة لا ينقصها", (s) => s.replace("    l.qty = q3(l.qty - sq);\n", "\n")],
  ["الإعادةُ تنقص الدفعةَ ثانيةً", (s) => s.replace('const done = refsLoad().some((x) => x.fn === "lot_sale" && x.ref === ref);', "const done = false;")],
  ["فاتورةٌ بلا أسطر (لا أثرَ بصفر)", (s) => s.replace("|| !(db.invoiceItems ?? []).some((l) => l.invoice_id === anchor.id)", "")],
  ["الساقُ بطريقة الفاتورة لا الشاشة", (s) => s.replace("legs.push({ method, amount: -back,", "legs.push({ method: (inv.payment_method ?? method) as PaymentMethod, amount: -back,")],
  ["الدفعةُ تأخذ ما سدّ العجز", (s) => s.replace("    const lotq = (Number(p.stock) || 0) >= 0 ? rs : Math.max(q3((Number(p.stock) || 0) + rs), 0);\n    if (!anchor)", "    const lotq = rs;\n    if (!anchor)").replace("      const lotq = (Number(p.stock) || 0) >= 0 ? rs : Math.max(q3((Number(p.stock) || 0) + rs), 0);\n      Tl", "      const lotq = rs;\n      Tl")],
  ["الراجعُ عبر وحدة المخزن لا وحدة السطر", (s) => s.replace("const rl = Math.min(q3(qty * uret / uline), lq);", "const rl = Math.min(q3(lq * rs / Number(li.stock_qty ?? li.qty)), lq);")],
  ["طلبُ التوصيل بالطريق فاتورةُ الراجع", (s) => s.replace("&& keyOf(i) === key && !inFlight(db, i.id) &&", "&& keyOf(i) === key &&").replace("&& keyOf(i) === key && !inFlight(db2, i.id))", "&& keyOf(i) === key)")],
  ["سطرُ الأثر بيوم الراجع", (s) => s.replace("          created_at: anchor.created_at,   // يومُ فاتورته (كالخادم)\n", "")],
];
for (const [name, mut] of MUTANTS) {
  let applied = true;
  const Mm = await load((s) => { const out = mut(s); if (out === s) applied = false; return out; });
  if (!applied) { check(`طفرة «${name}» تنطبق على النصّ`, false, "النصُّ تغيّر — حدّث الطفرة"); continue; }
  let g;
  try { g = await scenario(Mm); } catch (e) { g = { crash: String(e?.message) }; }
  const caught = Object.entries(EXPECT).some(([k, v]) => g[k] !== v);
  check(`طفرة «${name}» يمسكها الفحص`, caught);
}

const WMUTANTS = [
  ["التلفُ بلقطة المتوسّط (بلا دفعة الراجع)", (s) => s.replace("if (loss > 0n && tq > 0n) {", "if (false) {")],
  ["أخذٌ فوق الخسارة بالصيغة نفسِها", (s) => s.replace("tq >= loss ? roundDiv(tc, tq) : ", "")],
  ["الدفعاتُ تُقاس بعد المطابقة", (s) => s.replace("    const ret0 = retLots(p.id);\n", "").replace("const ret1 = retLots(p.id);", "const ret1 = retLots(p.id), ret0 = ret1;")],
];
for (const [name, mut] of WMUTANTS) {
  let applied = true;
  const Mm = await load((s) => { const out = mut(s); if (out === s) applied = false; return out; }, DEMO_COUNTS);
  if (!applied) { check(`طفرة «${name}» تنطبق على النصّ`, false, "النصُّ تغيّر — حدّث الطفرة"); continue; }
  let g;
  try { g = await wasteScenario(Mm); } catch (e) { g = { crash: String(e?.message) }; }
  check(`طفرة «${name}» يمسكها الفحص`, Object.entries(WEXPECT).some(([k, v]) => g[k] !== v));
}

console.log("▸ ٣) الوصل بالنصّ");
const sb = src("src/components/retail/SaleBuilder.tsx");
const hot = JSON.parse(src("src/i18n/hot-paths.json"));
check("شاشةُ البيع لا تستورد الراجعَ الإكسباير ثابتاً — بابُه وقطعتُه بـimport() مع نطاقه xret",
  !/^import [^\n]*(ExpiredReturn|expiredApi)/m.test(sb) && /import\("@\/lib\/expiredApi"\), import\("@\/components\/retail\/ExpiredReturn"\), import\("@\/i18n"\)\.then\(\(i\) => i\.ensureOwned\("xret"\)\)/.test(sb));
check("  ونطاقُه مملوكٌ لـExpiredReturn.tsx", hot.owned?.xret === "src/components/retail/ExpiredReturn.tsx");
check("  والبابُ ومرآتُه خارج حزمة الإقلاع (repo/main/App لا تستوردهما)",
  !/expiredApi|demoExpired/.test(src("src/lib/repo.ts")) && !/expiredApi|demoExpired/.test(src("src/main.tsx")) && !/expiredApi|demoExpired/.test(src("src/App.tsx")));
check("السلّةُ التي فيها راجعٌ إكسباير لا تُخلط: الإرجاعُ الخالص يسأل وكلُّ سطرٍ إكسباير، والإتمامُ يرفض",
  /if \(cart\.some\(\(l\) => !l\.ret \|\| !l\.xret\)\) \{ playWarning\(\); toast\.error\(m\.ui\.say\.mixed\(\)\); return; \}/.test(sb)
  && /if \(cart\.some\(\(l\) => l\.xret\)\) \{ playWarning\(\); toast\.error\(xretMod \? xretMod\.ui\.say\.mixed\(\)/.test(sb));
check("سطرُ البيع من الدفعة يرسل lot_id، والسقفُ باقي الدفعة",
  /\.\.\.\(l\.lot && !l\.ret \? \{ lot_id: l\.lot\.id \} : \{\}\)/.test(sb) && /Math\.min\(lineLifted\(l, now\) \? Infinity : Math\.min\(shareCap\(l\), newCapOf\(l\)\), lotCapOf\(l\)\)/.test(sb));
check("السؤالُ «من الإكسباير لو من الجديد» داخل sellOrExplain (كلُّ إضافةٍ تمرّ منها) وأوّلَ سطرٍ للمادّة وحده",
  /if \(!ret && !opt\?\.lotAsked && xretOn && xretMod\) \{[\s\S]{0,400}?!cartRef\.current\.some\(\(l\) => l\.kind === "product" && !l\.ret && l\.product_id === product\.id\)/.test(sb));
check("  وسطرُ «الجديد» بلا ما بدفعات الراجع، و«$» مرفوضٌ على سطر الدفعة، والمسحُ مطفأٌ والسؤالُ مفتوح، والسؤالُ الثاني يُلغي الأوّلَ بجوابه",
  /held > 0 \? shareCapAt\(l, Math\.round\(\(l\.stock - held\) \* 1000\) \/ 1000\) : Infinity/.test(sb)
  && /if \(l\.lot\) \{ playWarning\(\); toast\.error\(xretMod \? xretMod\.ui\.say\.lotUsd\(l\.name\)/.test(sb)
  && /\|\| !!lotAsk \|\| !!xretFor \|\| !!consFor \|\| medPickerOpen \}\);/.test(sb) && /lotAskRef\.current\?\.resolve\(undefined\);/.test(sb));
check("  وزرُّ «إكسباير» مقفولٌ ما دام إرجاعٌ بالطريق (المرجعُ محفوظ) — التبديلُ يُعيده بطريقٍ آخر",
  /if \(saleRefSaved\) \{ playWarning\(\); toast\.error\(xretMod \? xretMod\.ui\.say\.pending\(\)/.test(sb));
check("0290: «بيش تبيعها؟» — السؤالُ يحمل وحدةَ السطر بقاعدة startSub نفسِها، والجوابُ سعرٌ لوحدته يمرّ لـaddProduct",
  /const sub = hasSubU && \(opt\?\.unit === "sub" \|\| \(Math\.floor\(product\.stock\) < 1 && !liftFor\(product, null\)\) \|\| l\.qty < 1\);/.test(sb)
  && /const startSub = hasSub && \(opt\?\.unit === "sub" \|\| \(Math\.floor\(p\.stock\) < 1 && !liftFor\(p, null\)\) \|\| \(!!opt\?\.lot && opt\.lot\.qty < 1\)\);/.test(sb)
  && /\.\.\.\(pick \? \{ lot: pick\.lot, lotPrice: pick\.price \} : \{\}\)/.test(sb)
  && /unit_price: lotUnit \?\? listNow,/.test(sb));
check("  والسعرُ المختار يتبع تبديلَ الوحدة (بنسبته) ولا يُكتب على سعر القائمة (رفعُ الأسعار يقارن به)",
  /const unit_price = l\.lot\?\.px \? lotUnitPrice\(l\.lot\.px, toSub, listU, l\.unitsPerBox \?\? null\) : listU;/.test(sb)
  && /boxPrice: listPrice\(p\), subPrice: wholesale \? listSubPrice\(p\) : \(p\.sub_unit_price \?\? null\)/.test(sb));
const er = src("src/components/retail/ExpiredReturn.tsx");
check("  ونافذتُه: تحت كلفة الدفعة يُقال «خسارة» (بالفلس)، ويومُ الراجع محلّيٌّ لا slice(0, 10)",
  /const below = okPrice && costU != null && Math\.round\(price \* 100\) < Math\.round\(costU \* 100\);/.test(er) && !/returned_at\.slice\(0, 10\)/.test(er));
const pm = src("src/components/inventory/ProductMovements.tsx");
check("«حركات المادة»: سطرُ return_expired «راجع إكسباير» بتفاصيل دفعته — بالكاتب لا بالنوع (قبل 0290 نوعُه other)، وقطعتُه كسولةٌ بنطاقها",
  /const xret = r\.source === "return_expired";/.test(pm) && /import\("@\/components\/retail\/ExpiredReturn"\)\.then\(\(m\) => \(\{ default: m\.XretLedgerNote \}\)\), \["xret"\]/.test(pm)
  && !/^import [^\n]*ExpiredReturn/m.test(pm));
check("  والمطابقةُ باللحظة (returned_at = لحظةُ حركة الدفتر) وبالكمية بين المتعادلين",
  /Date\.parse\(l\.returned_at\) === t0/.test(er) && /Math\.abs\(Number\(l\.received_qty\) - delta\) < 0\.0005/.test(er));
const rp = src("src/components/retail/ReturnsPanel.tsx");
check("«المرتجع»: أثرُ الراجع الإكسباير لا يُرجَع ولا يدخل «إرجاع الكل»",
  /items\.filter\(\(it\) => !isXretTrace\(it\)\)\.map\(\(it\) => \[it\.id, it\.qty\]\)/.test(rp) && /\{!isXretTrace\(it\) && <div className="flex items-center gap-1">/.test(rp));
const lotsTsx = src("src/components/inventory/ProductLots.tsx");
check("نافذةُ الدفعات: لا فصلَ لدفعة الراجع (يكتب مصدرَها بلا أعمدتها)، و«تنباع أول» لغيرها",
  /canEdit && l\.qty > 0 && l\.source !== "return"/.test(lotsTsx) && /live\.find\(\(l\) => l\.source !== "return"\)/.test(lotsTsx));
const demoLots = src("src/lib/demoLots.ts");
check("المرآةُ كالخادم: دفعةُ الراجع آخرَ النقص، والزيادةُ لا تُضاف لها",
  /retLast\(a\) - retLast\(b\)/.test(demoLots) && /l\.source !== "return"\)\.sort\(byExpiry\)\[0\]/.test(demoLots));

console.log(`${fails ? "✗" : "✓"} expired-return-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
