/* ============================================================================
 * قالبُ تطابق الكلفة (0255): كلفةُ سطر المادّة والمتوسّطُ المتحرّك — القاعدةُ مقابل الواجهة، فلساً بفلس.
 *
 * الجهازُ يقول كلفةَ سطر المادّة قبل البيعة (معاينةُ الكاشير، وunit_cost الذي يرسله) بـproductLineCostCents
 * (src/lib/consumption.ts)، والخادمُ يكتبها بـ_product_line_cost. والشاشاتُ تحسب المتوسّطَ بـsrc/lib/avgCost.ts،
 * والخادمُ بـ_avg_base/_avg_receive/_avg_variance/_avg_adjust/_avg_merge، ونصيبَ سطر الشراء من خصم الشركة بـ
 * _purchase_unit_cost (0260). فرقُ فلسٍ بينهما ربحٌ يقوله الجهاز
 * غيرَ الذي يكتبه الخادم. الطرفان من مصدرهما: الواجهةُ تُحزَم من ملفّي src/lib نفسيهما (esbuild — لا نسخة:
 * فحصٌ على نسخةٍ يفحص النسخة)، والقاعدةُ بدوالّها الحيّة بعد الموجة.
 *
 * الحالات: جدولٌ بكلّ حافّة — رصيدٌ سالبٌ وصفر، متوسّطٌ مجهولٌ وصفرٌ صريحٌ وسالب، كميةٌ وكلفةٌ صفرٌ وسالبة،
 * قسمةٌ لا تنتهي (٣، ٧، ٢١)، وحدةٌ صغيرة بعددٍ كسريّ أو صفر أو بلا عدد، سطرٌ صغيرٌ stock_qty فيه ≠ qty،
 * مرجَّعٌ بالسلّة، حقل، مادّةٌ مجهولة ومادّةُ عيادةٍ أخرى — وعيّنةٌ عشوائية ببذرةٍ ثابتة (تُعاد كما هي).
 * المقارنةُ تامّة بمقياس العمود (BigInt): تسامحٌ بفلسٍ يخفي ما جئنا له. ولكلّ دالّةٍ مرآةٌ مغلوطةٌ عمداً
 * تخالف القاعدةَ بالحالات نفسِها، وكلُّ فرعٍ له حالاتُه بالعدد — وإلا فالقالبُ أعمى.
 *
 *   node supabase/tests/cost-parity.mjs gen <dir>    ← cases.json، seed.sql (موادُّ عيادة التطابق)، run.sql (نداءٌ واحد)
 *   psql -f <dir>/seed.sql ; psql -tA -f <dir>/run.sql > <dir>/actual.txt
 *   node supabase/tests/cost-parity.mjs check <dir>  ← أسطرُ ✓/✗ كالحزمة، ويخرج 1 عند أيّ فرق
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [mode, dir] = process.argv.slice(2);
if (!["gen", "check"].includes(mode) || !dir) { console.error("usage: cost-parity.mjs gen|check <dir>"); process.exit(2); }

// عيادةُ التطابق وحدها (صاحبُها مديرُها)، وأخرى لمادّةٍ «ليست من هنا»، وحقلٌ للأولى.
const PCL = "a2550c00-0000-4000-8000-0000000000c1";
const POTHER = "a2550c00-0000-4000-8000-0000000000c2";
const FARM = "a2550c00-0000-4000-8000-0000000000f1";
const pid = (n) => `a2550c00-0000-4000-8000-${(0x100000 + n).toString(16).padStart(12, "0")}`;
const UNKNOWN = ["a2550c00-0000-4000-8000-00000000dead", "a2550c00-0000-4000-8000-00000000beef"];

/** عددٌ مُقاس ← نصٌّ عشريّ بالضبط (D(15, 3) = "0.015"). */
const D = (n, s) => {
  const v = BigInt(n), neg = v < 0n, a = (neg ? -v : v).toString().padStart(s + 1, "0");
  return (neg ? "-" : "") + (s ? `${a.slice(0, a.length - s)}.${a.slice(a.length - s)}` : a);
};

if (mode === "gen") gen(); else await check();

/* ══ التوليد ══════════════════════════════════════════════════════════════ */
function gen() {
  fs.mkdirSync(dir, { recursive: true });
  // بذرةٌ ثابتة: العيّنةُ نفسُها بكلّ تشغيل (mulberry32).
  let st = 20261101 >>> 0;
  const R = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const pick = (a) => a[Math.floor(R() * a.length)];
  // رصيدٌ/كمية (٣ منازل) وكلفة (٦ منازل): أعدادٌ صغيرةٌ وكبيرة، وحوافُّ الصفر، وقواسمُ لا تنتهي.
  const q3 = () => pick([() => D(int(-6000, 6000), 3), () => D(int(-50, 50) * 1000, 3), () => D(int(1, 3) * 7 * 1000, 3),
    () => D(int(-9, 9), 3), () => "0", () => D(int(1, 100_000_000), 3)])();
  const c6 = () => pick([() => null, () => "0", () => D(-int(1, 5_000_000), 6), () => D(int(1, 999), 6),
    () => D(int(1, 3_000_000_000), 6), () => D(int(1, 400) * 1_000_000, 6), () => "1171.428572", () => "1147.619048"])();
  const c6nn = () => c6() ?? D(int(1, 2_000_000_000), 6);
  const v9 = () => pick([() => "0", () => D(BigInt(int(1, 50_000)) * 1_000_000_000n, 9), () => D(BigInt(int(1, 2_000_000_000)) * 1000n + BigInt(int(0, 999)), 9)])();

  // ── الجدول ──
  const S = ["-5", "-1", "-0.001", "0", "0.001", "1", "3", "10", "21", "1000.5"];
  const A = [null, "-1", "0", "0.000001", "1", "999.999999", "1000", "1147.619048", "25000"];
  const Q = ["-1", "0", "0.001", "1", "5", "10"];
  const C = ["-1", "0", "0.000001", "0.5", "700", "1000", "1300"];
  const base = [], receive = [], adjust = [], merge = [], unit = [];
  for (const a of [null, "-10", "-0.000001", "0", "0.000001", "1000", "1171.428572"])
    for (const pp of [null, "-10", "0", "0.01", "1000"]) base.push({ a, pp });
  for (const s of S) for (const a of A) for (const q of Q) for (const c of C) receive.push({ s, a, q, c });
  for (const s0 of ["-5", "0", "3", "21"]) for (const a0 of [null, "0", "1000", "1147.619048"])
    for (const vo of ["0", "12000", "2000.000000001"]) for (const vn of ["0", "12500", "20000"])
      for (const s1 of ["-1", "0", "13", "21"]) for (const cl of [null, "1000", "1250.5"]) adjust.push({ s0, a0, vo, vn, s1, cl });
  const SM = ["-5", "-1", "0", "0.001", "1", "5", "10", "30"], AM = [null, "-1", "0", "0.000001", "1000", "1100", "2000"];
  for (const s1 of SM) for (const a1 of AM) for (const s2 of SM) for (const a2 of AM) merge.push({ s1, a1, s2, a2 });
  // نصيبُ السطر (0260): كلفةٌ بستّ منازل، وصافٍ ومجموعٌ بالفلوس — بلا خصم، وبخصمٍ يأكل كلَّ شيء، وبصافٍ سالبٍ أو غائب.
  const UC = [null, "-1", "0", "0.000001", "0.01", "1", "333.33", "1000", "1171.428572", "99999999.99"];
  const UN = [null, "-100", "0", "0.01", "1", "999.99", "18000", "19999.99", "20000", "25000"];
  const UG = [null, "-5", "0", "0.01", "1", "3", "1000", "20000", "99999999999.99"];
  for (const c of UC) for (const net of UN) for (const gross of UG) unit.push({ c, net, gross });
  // ── العيّنة ──
  for (let i = 0; i < 500; i++) base.push({ a: c6(), pp: pick([null, D(int(-100_000, 100_000_000), 2), "0"]) });
  for (let i = 0; i < 2500; i++) receive.push({ s: q3(), a: c6(), q: q3(), c: c6nn() });
  for (let i = 0; i < 2500; i++) adjust.push({ s0: q3(), a0: c6(), vo: v9(), vn: v9(), s1: q3(), cl: c6() });
  for (let i = 0; i < 2500; i++) merge.push({ s1: q3(), a1: c6(), s2: q3(), a2: c6() });
  for (let i = 0; i < 2500; i++) {
    const g = int(1, 2_000_000_000), d = pick([0, int(0, g), int(0, Math.min(g, 500)), g, g + int(1, 1000)]);
    unit.push({ c: c6(), net: D(g - d, 2), gross: D(g, 2) });
  }

  // ── كلفةُ سطر المادّة: موادُّ بكلّ شكل، ولكلٍّ سطورٌ بكلّ شكل ──
  const products = [];
  const addP = (pp, avg, sub, upb, farm) => { const id = pid(products.length); products.push({ id, pp, avg, sub, upb, farm }); return id; };
  const COSTS = [...["-50", "0", "0.01", "999.99", "1250", "25000"].map((pp) => [pp, null]),
    ...["0", "0.000001", "0.004999", "0.005", "1.005", "128.17", "390.476190", "1171.428572", "25000", "99999999.999999"].map((a) => ["1250", a])];
  const SUBS = [[false, null], [false, "12"], [true, null], [true, "0"], [true, "0.001"], [true, "0.5"], [true, "1"],
    [true, "2.5"], [true, "3"], [true, "7"], [true, "100"], [true, "20000"]];
  const LINES = [["1", "1"], ["3", "0.03"], ["1", "0.333"], ["-1", "-1"], ["-3", "-0.03"], ["2", "2"], ["1", null],
    ["0.5", "0.5"], ["1", "0.001"], ["100", "1"], ["0.001", "0.001"], ["-1", "1"]];
  const DEV = ["0", "7", "123.45", "999.99"];
  const plc = [];
  for (const [pp, avg] of COSTS) for (const [sub, upb] of SUBS) for (const farm of [false, true]) {
    const id = addP(pp, avg, sub, upb, farm);
    LINES.forEach(([q, sq], k) => plc.push({ cl: PCL, p: id, q, sq, d: DEV[(plc.length + k) % DEV.length] }));
  }
  for (let i = 0; i < 600; i++) {
    const sub = R() < 0.7;
    const id = addP(pick(["0", "-1", D(int(1, 100_000_000), 2), D(int(1, 99), 2)]), R() < 0.4 ? null : pick(["0", D(int(1, 99_999_999_999_999), 6), D(int(1, 9_999), 6)]),
      sub, R() < 0.1 ? null : pick(["0", D(int(1, 9), 3), D(int(1, 999_999), 3), "3", "7", "2.5"]), R() < 0.05);
    for (let k = 0; k < 5; k++) {
      const n = int(1, 400), upbM = Number(products[products.length - 1].upb ?? "0") * 1000;
      const q = (R() < 0.15 ? -1 : 1) * n;
      // الشاشةُ تكتب stock_qty للوحدة الصغيرة كميةً ÷ العدد بثلاث منازل، وللعلبة الكميةَ نفسَها — وأحياناً لا تكتبه.
      const sq = R() < 0.1 ? null : sub && upbM > 0 && R() < 0.6 ? D(Math.round((q * 1000 * 1000) / upbM), 3) : D(q * 1000, 3);
      plc.push({ cl: PCL, p: id, q: D(q * 1000, 3), sq, d: pick(DEV) });
    }
  }
  // مادّةٌ مجهولة، ومادّةُ عيادةٍ أخرى (موجودةٌ هناك)، وسطرٌ بلا مادّة: كلُّها بكلفة الجهاز.
  const foreign = pid(products.length); products.push({ id: foreign, pp: "4000", avg: "4100", sub: true, upb: "10", farm: false, clinic: POTHER });
  for (const p of [...UNKNOWN, foreign, null]) LINES.forEach(([q, sq], k) => plc.push({ cl: PCL, p, q, sq, d: DEV[k % DEV.length] }));
  [base, receive, adjust, merge, plc, unit].forEach((t) => t.forEach((x, i) => { x.i = i; }));

  fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify({ base, receive, adjust, merge, plc, unit }));

  const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
  const rows = products.map((p) => `(${q(p.id)}, ${q(p.clinic ?? PCL)}, ${q(`تطابق الكلفة ${p.id.slice(-5)}`)}, 1, ${p.pp}, ${p.avg ?? "null"}, `
    + `${p.sub}, ${p.sub ? "'حبّة'" : "null"}, ${p.upb ?? "null"}, ${p.farm ? q(FARM) : "null"})`);
  fs.writeFileSync(path.join(dir, "seed.sql"), [
    `insert into auth.users(id) values (${q(PCL)}), (${q(POTHER)}) on conflict do nothing;`,
    `insert into poultry_farms(id, clinic_id, name) values (${q(FARM)}, ${q(PCL)}, 'حقل التطابق') on conflict (id) do nothing;`,
    `insert into products (id, clinic_id, name, stock, purchase_price, avg_cost, has_sub_unit, sub_unit_name, units_per_box, farm_id) values`,
    rows.join(",\n") + "\non conflict (id) do nothing;",
  ].join("\n") + "\n");

  // نداءٌ واحد بجوابٍ واحد (نصّ): القيمُ نصوصٌ لا أعداد — فلا عائمَ بالطريق؛ وصفوفُ الموادّ كما تصل الجهازَ (أعداد JSON).
  const J = (t, cols) => `$j$${JSON.stringify(t.map((x) => Object.fromEntries(["i", ...cols].map((k) => [k, x[k]]))))}$j$::jsonb`;
  fs.writeFileSync(path.join(dir, "run.sql"), [
    "select json_build_object(",
    `  'base', (select json_agg(json_build_array(x.i, _avg_base(x.a, x.pp)::text) order by x.i)`,
    `           from jsonb_to_recordset(${J(base, ["a", "pp"])}) as x(i int, a numeric, pp numeric)),`,
    `  'receive', (select json_agg(json_build_array(x.i, _avg_receive(x.s, x.a, x.q, x.c)::text, _avg_variance(x.s, x.a, x.q, x.c)::text) order by x.i)`,
    `           from jsonb_to_recordset(${J(receive, ["s", "a", "q", "c"])}) as x(i int, s numeric, a numeric, q numeric, c numeric)),`,
    `  'adjust', (select json_agg(json_build_array(x.i, _avg_adjust(x.s0, x.a0, x.vo, x.vn, x.s1, x.cl)::text) order by x.i)`,
    `           from jsonb_to_recordset(${J(adjust, ["s0", "a0", "vo", "vn", "s1", "cl"])}) as x(i int, s0 numeric, a0 numeric, vo numeric, vn numeric, s1 numeric, cl numeric)),`,
    `  'merge', (select json_agg(json_build_array(x.i, _avg_merge(x.s1, x.a1, x.s2, x.a2)::text) order by x.i)`,
    `           from jsonb_to_recordset(${J(merge, ["s1", "a1", "s2", "a2"])}) as x(i int, s1 numeric, a1 numeric, s2 numeric, a2 numeric)),`,
    `  'plc', (select json_agg(json_build_array(x.i, _product_line_cost(x.cl, x.p, x.q, x.sq, x.d)::text) order by x.i)`,
    `           from jsonb_to_recordset(${J(plc, ["cl", "p", "q", "sq", "d"])}) as x(i int, cl uuid, p uuid, q numeric, sq numeric, d numeric)),`,
    `  'unit', (select json_agg(json_build_array(x.i, _purchase_unit_cost(x.c, x.net, x.gross)::text) order by x.i)`,
    `           from jsonb_to_recordset(${J(unit, ["c", "net", "gross"])}) as x(i int, c numeric, net numeric, gross numeric)),`,
    `  'rows', (select json_object_agg(p.id, json_build_object('purchase_price', p.purchase_price, 'avg_cost', p.avg_cost, 'has_sub_unit', p.has_sub_unit,`,
    `                                  'units_per_box', p.units_per_box, 'pooled', p.pooled, 'farm_id', p.farm_id))`,
    `             from products p where p.clinic_id = ${q(PCL)})`,
    ")::text;",
  ].join("\n") + "\n");
  console.log(`cost-parity gen: ${base.length} base، ${receive.length} receive، ${adjust.length} adjust، ${merge.length} merge، ${unit.length} unit، ${plc.length} سطر مادّة على ${products.length} مادّة`);
}

/* ══ المقارنة ═════════════════════════════════════════════════════════════ */
async function check() {
  const { build } = await import("esbuild");
  const out = path.join(dir, "cost-mirror.mjs");
  await build({
    stdin: { contents: 'export * from "./src/lib/consumption.ts";\nexport * from "./src/lib/avgCost.ts";\n', resolveDir: ROOT, loader: "ts" },
    bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  });
  const M = await import(pathToFileURL(out).href);
  const cases = JSON.parse(fs.readFileSync(path.join(dir, "cases.json"), "utf8"));
  let fail = 0;
  const ok = (t) => console.log(`   ✓ ${t}`);
  const no = (t, got, want, details = []) => {
    fail = 1;
    console.log(`   ✗ ${t} — طلع «${got}» والمتوقّع «${want}»`);
    for (const d of details.slice(0, 5)) console.log(`      ${d}`);
  };
  let act;
  try { act = JSON.parse(fs.readFileSync(path.join(dir, "actual.txt"), "utf8").trim()); }
  catch (e) { no("القاعدةُ أرجعت جوابَ التطابق (run.sql)", `لا JSON: ${String(e.message).slice(0, 80)}`, "JSON"); process.exit(1); }

  const mi = (x) => (x == null ? null : M.toMilli(x));
  const mu = (x) => (x == null ? null : M.toMicro(x));
  const ce = (x) => (x == null ? null : M.toCents(x));
  const eq = (a, b) => (a === null || b === null ? a === b : a === b);
  // الدالّةُ (المرآة) لكلّ جدول، وتحويلُ جواب القاعدة لمقياسها.
  const rowsById = act.rows ?? {};
  const mirror = {
    base: (x) => M.avgBase({ avg_cost: x.a, purchase_price: x.pp }),
    receive: (x) => M.avgReceive(mi(x.s), mu(x.a), mi(x.q), mu(x.c)),
    variance: (x) => M.receiveVarianceCents(mi(x.s), mu(x.a), mi(x.q), mu(x.c)),
    adjust: (x) => M.avgAdjust(mi(x.s0), mu(x.a0), M.toNano(x.vo), M.toNano(x.vn), mi(x.s1), mu(x.cl)),
    merge: (x) => M.avgMerge(mi(x.s1), mu(x.a1), mi(x.s2), mu(x.a2)),
    plc: (x) => M.productLineCostCents(x.p == null ? null : rowsById[x.p], mi(x.q), mi(x.sq), ce(x.d)),
    unit: (x) => M.purchaseUnitCostU(mu(x.c), ce(x.net), ce(x.gross)),
  };
  const server = { base: (r) => mu(r[1]), receive: (r) => mu(r[1]), variance: (r) => ce(r[2]), adjust: (r) => mu(r[1]), merge: (r) => mu(r[1]), plc: (r) => ce(r[1]), unit: (r) => mu(r[1]) };
  const table = { base: "base", receive: "receive", variance: "receive", adjust: "adjust", merge: "merge", plc: "plc", unit: "unit" };
  const got = {};
  for (const k of Object.keys(table)) {
    const rs = act[table[k]];
    got[k] = Array.isArray(rs) && rs.length === cases[table[k]].length ? new Map(rs.map((r) => [r[0], server[k](r)])) : null;
  }
  const show = (v) => (v === null ? "null" : String(v));
  const compare = (k, f, title) => {
    const cs = cases[table[k]];
    if (!got[k]) { no(title, `${(act[table[k]] ?? []).length} صفّاً من القاعدة`, `${cs.length}`); return; }
    const bad = [];
    for (const x of cs) {
      const want = f(x), have = got[k].get(x.i);
      if (have === undefined || !eq(want, have)) bad.push(`${JSON.stringify(x)} قاعدة ${show(have)} واجهة ${show(want)}`);
    }
    if (bad.length) no(title, `${bad.length} حالةً انحرفت`, `0 من ${cs.length}`, bad);
    else ok(`${title}: ${cs.length} حالة`);
  };
  compare("base", mirror.base, "_avg_base = avgBase (أساسُ الاستلام والدمج)");
  compare("receive", mirror.receive, "_avg_receive = avgReceive (الاستلام)");
  compare("variance", mirror.variance, "_avg_variance = receiveVarianceCents (فرقُ الكلفة بالفلس، والفارغُ فارغ)");
  compare("adjust", mirror.adjust, "_avg_adjust = avgAdjust (تعديلُ فاتورة الشراء)");
  compare("merge", mirror.merge, "_avg_merge = avgMerge (الدمج)");
  compare("plc", mirror.plc, "_product_line_cost = productLineCostCents (سطرُ المادّة بالكاشير)");
  compare("unit", mirror.unit, "_purchase_unit_cost = purchaseUnitCostU (نصيبُ سطر الشراء من خصم الشركة)");

  // ── القالبُ يقيس كلَّ فرع: عددُ الحالات بكلّ فرعٍ من فروع النصّ (الشروطُ نفسُها مكتوبةً بالإدخال) ──
  const n = (x) => (x == null ? null : Number(x));
  const pos = (x) => x != null && Number(x) > 0;
  const tally = {}; const tag = (k) => { tally[k] = (tally[k] ?? 0) + 1; };
  for (const x of cases.base) tag(mirror.base(x) === null ? "base:null" : "base:value");
  for (const x of cases.receive) {
    if (!(n(x.q) > 0) || !(n(x.c) > 0)) tag("receive:keep_a"); else if (!pos(x.a)) tag("receive:unknown_a"); else if (!(n(x.s) > 0)) tag("receive:s_le_0"); else tag("receive:weighted");
    tag(mirror.variance(x) === null ? "variance:null" : "variance:value");
  }
  for (const x of cases.adjust) {
    if (!(n(x.s1) > 0)) tag("adjust:s1_le_0");
    else if (x.a0 != null && M.toMilli(x.s0) * M.toMicro(x.a0) - M.toNano(x.vo) + M.toNano(x.vn) > 0n) tag("adjust:divide"); else tag("adjust:c_last");
  }
  for (const x of cases.merge) {
    if (pos(x.a1) && pos(x.a2)) tag(Math.max(n(x.s1), 0) + Math.max(n(x.s2), 0) > 0 ? "merge:weighted" : "merge:no_weight"); else if (pos(x.a2)) tag("merge:a2"); else tag("merge:a1");
  }
  for (const x of cases.plc) {
    const p = x.p == null ? undefined : rowsById[x.p];
    if (!p) tag("plc:device_unknown"); else if (p.farm_id) tag("plc:device_farm");
    else if (p.has_sub_unit && Number(p.units_per_box) > 0 && x.sq != null && Math.abs(Number(x.sq)) !== Math.abs(Number(x.q))) tag("plc:sub"); else tag("plc:box");
  }
  for (const x of cases.unit) {
    if (!pos(x.c) || !pos(x.gross) || x.net == null || !(n(x.net) < n(x.gross))) tag("unit:as_is");
    else tag(n(x.net) <= 0 ? "unit:all_off" : "unit:share");
  }
  const NEED = { "base:null": 10, "base:value": 10, "receive:keep_a": 200, "receive:unknown_a": 200, "receive:s_le_0": 200, "receive:weighted": 200,
    "variance:null": 200, "variance:value": 200, "adjust:s1_le_0": 100, "adjust:divide": 100, "adjust:c_last": 100,
    "merge:weighted": 100, "merge:no_weight": 50, "merge:a2": 100, "merge:a1": 100,
    "plc:device_unknown": 40, "plc:device_farm": 100, "plc:sub": 300, "plc:box": 300,
    "unit:as_is": 200, "unit:share": 500, "unit:all_off": 30 };
  const thin = Object.entries(NEED).filter(([k, v]) => (tally[k] ?? 0) < v).map(([k, v]) => `${k} ${tally[k] ?? 0} < ${v}`);
  if (thin.length) no("والقالبُ يقيس كلَّ فرع (حالاتٌ كافية بكلّ فرعٍ من النصّ)", thin.join("، "), "كلُّ فرعٍ فوق حدّه");
  else ok(`والقالبُ يقيس كلَّ فرع: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(" ")}`);

  // ── مرآةٌ مغلوطةٌ عمداً لكلّ دالّة تخالف القاعدةَ بالحالات نفسِها (لو طابقت لكان القالبُ أعمى عن خطئها) ──
  const nonNeg = (s) => (s > 0n ? s : 0n);
  const kn = (a) => a !== null && a > 0n;
  const mutants = {
    "المجّانيُّ يخفّض (c ≤ 0 يدخل الوزن)": ["receive", (x) => { const s = mi(x.s), a = mu(x.a), q = mi(x.q), c = mu(x.c);
      if (q <= 0n) return a; if (!kn(a)) return c; if (s <= 0n) return c; return M.roundDiv(s * a + q * c, s + q); }],
    "فرقُ الكلفة بإشارةٍ مقلوبة": ["variance", (x) => { const v = mirror.variance(x); return v === null ? null : -v; }],
    // C-2: فرقٌ يُقرَّب صفراً لم يقع — فارغٌ بالطرفين (nullif بـ_avg_variance، وv === 0n بـreceiveVarianceCents).
    "فرقٌ لم يقع يُكتب صفراً لا فارغاً": ["variance", (x) => { const s = mi(x.s), a = mu(x.a), q = mi(x.q), c = mu(x.c);
      if (q <= 0n || c <= 0n || !kn(a) || s >= 0n) return null; return M.roundDiv(-s * (c - a), 10_000_000n); }],
    "التعديلُ يقسم صفراً (V ≥ 0)": ["adjust", (x) => { const s1 = mi(x.s1), a0 = mu(x.a0);
      if (s1 <= 0n) return a0; if (a0 !== null) { const v = mi(x.s0) * a0 - M.toNano(x.vo) + M.toNano(x.vn); if (v >= 0n) return M.roundDiv(v, s1); } return mu(x.cl) ?? a0; }],
    "الدمجُ يزن الرصيدَ السالب": ["merge", (x) => { const s1 = mi(x.s1), a1 = mu(x.a1), s2 = mi(x.s2), a2 = mu(x.a2);
      if (kn(a1) && kn(a2)) return s1 + s2 === 0n ? a1 : M.roundDiv(s1 * a1 + s2 * a2, s1 + s2); if (kn(a2) && !kn(a1)) return a2; return a1; }],
    "الصفرُ أساسٌ معروف": ["base", (x) => { const v = x.a != null ? M.roundScaled(x.a, 6) : x.pp != null ? M.roundScaled(x.pp, 2) * 10_000n : null; return v === null || v < 0n ? null : v; }],
    "الوحدةُ الصغيرة تُقطع ولا تُقرَّب": ["plc", (x) => { const p = x.p == null ? null : rowsById[x.p]; if (!p || p.farm_id) return ce(x.d);
      const k = M.stockUnitCost(p), u = M.subUnitMilli(p), q = mi(x.q), sq = mi(x.sq);
      if (u !== null && sq !== null && (sq < 0n ? -sq : sq) !== (q < 0n ? -q : q)) return k / (u * 10n); return M.roundDiv(k, 10_000n); }],
    "مادّةُ الحقل بكلفة الخادم": ["plc", (x) => { const p = x.p == null ? null : rowsById[x.p]; return !p ? ce(x.d) : M.productLineCostCents({ ...p, farm_id: null }, mi(x.q), mi(x.sq), ce(x.d)); }],
    "النصيبُ يُقطع ولا يُقرَّب": ["unit", (x) => { const c = mu(x.c), net = ce(x.net), g = ce(x.gross);
      if (c === null || c <= 0n || g === null || g <= 0n || (net ?? g) >= g) return c; return (c * (net > 0n ? net : 0n)) / g; }],
    "الصافي السالب لا يُقصّ": ["unit", (x) => { const c = mu(x.c), net = ce(x.net), g = ce(x.gross);
      if (c === null || c <= 0n || g === null || g <= 0n || (net ?? g) >= g) return c; return M.roundDiv(c * net, g); }],
    "الخصمُ يُحسب على المجموع (c × الخصم ÷ المجموع)": ["unit", (x) => { const c = mu(x.c), net = ce(x.net), g = ce(x.gross);
      if (c === null || c <= 0n || g === null || g <= 0n || (net ?? g) >= g) return c; return M.roundDiv(c * (g - (net > 0n ? net : 0n)), g); }],
    "الوحدةُ الصغيرة تُقارن بالإشارة": ["plc", (x) => { const p = x.p == null ? null : rowsById[x.p]; if (!p || p.farm_id) return ce(x.d);
      const k = M.stockUnitCost(p), u = M.subUnitMilli(p), q = mi(x.q), sq = mi(x.sq);
      if (u !== null && sq !== null && sq !== q) return M.roundDiv(k, u * 10n); return M.roundDiv(k, 10_000n); }],
  };
  const blind = [];
  for (const [name, [k, f]] of Object.entries(mutants)) {
    if (!got[k]) { blind.push(`${name}: لا جواب`); continue; }
    let hit = 0;
    for (const x of cases[table[k]]) if (!eq(f(x), got[k].get(x.i))) hit++;
    if (hit === 0) blind.push(`${name}: طابقت`);
  }
  if (blind.length) no("والمرآةُ المغلوطة تخالف القاعدةَ بكلّ دالّة (لو طابقت لكان القالبُ أعمى)", blind.join("، "), "كلُّها تخالف");
  else ok(`والمرآةُ المغلوطة تخالف القاعدةَ بكلّ دالّة (${Object.keys(mutants).length} مرايا مغلوطة، كلٌّ أمسكته حالاتُه)`);
  process.exit(fail);
}
