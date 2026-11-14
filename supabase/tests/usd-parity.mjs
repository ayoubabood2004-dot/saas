/* ============================================================================
 * قالبُ تطابق الدولار (0264): حسابُ القاعدة مقابل src/lib/usdMath.ts — ديناراً بدينار وسنتاً بسنت.
 *
 * الجهازُ يعرض للكاشير «٥٠$ ≈ ٧٣٬٠٠٠» ويعاين التسديدَ «٤٠٠$ × ١٤٧٠ = ٥٨٨٬٠٠٠ — يبقى ٦٠٠$» قبل الحفظ؛ والخادمُ يكتب
 * الفاتورةَ والوصل. فرقُ دينارٍ بينهما وصلٌ يقول غيرَ ما قاله الشاشة. الطرفان من مصدرهما: الواجهةُ تُحزَم من usdMath.ts
 * نفسِه (esbuild)، والقاعدةُ بدوالّها الحيّة — والبيعُ والتسديدُ **بنداءاتٍ حقيقية** (usd_checkout، settle_invoice_usd،
 * fx_rate_set) لا بنسخةٍ من حسابها: نسخةٌ بالقالب تفحص النسخة.
 *
 * الحالات: جدولٌ صِرفٌ لكلّ دالّة (_usd_iqd بكلّ خطوة وحوافّ النصف، _usd_rate_of بكسورٍ تُقرَّب، _usd_share بفروعها الأربعة)،
 * وسيناريوهاتُ بيعٍ وتسديدٍ ببذرةٍ ثابتة: سلّةٌ بسطورٍ وخصمٍ (ومقصوص)، نقداً أو دَيناً، ثمّ تسديداتٌ جزئية بسعر اليوم أو بسعرٍ
 * متّفق، ومبالغُ أكبرُ من الباقي، وصغيرةٌ تطلع صفراً، والإغلاقُ. والثابت: الإغلاقُ بالعملتين، ومجموعُ الحصص = المدفوع.
 * ولكلّ دالّةٍ مرآةٌ مغلوطةٌ عمداً لازم تخالف القاعدة — وإلا فالقالبُ أعمى.
 *
 *   node supabase/tests/usd-parity.mjs gen <dir>    ← cases.json، seed.sql، run.sql
 *   psql -f <dir>/seed.sql ; psql -tA -f <dir>/run.sql > <dir>/actual.txt
 *   node supabase/tests/usd-parity.mjs check <dir>  ← أسطرُ ✓/✗ كالحزمة، ويخرج 1 عند أيّ فرق
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [mode, dir] = process.argv.slice(2);
if (!["gen", "check"].includes(mode) || !dir) { console.error("usage: usd-parity.mjs gen|check <dir>"); process.exit(2); }

const PCL = "a2640c00-0000-4000-8000-0000000000c1";
const pid = (n) => `a2640c00-0000-4000-8000-${(0x100000 + n).toString(16).padStart(12, "0")}`;
const STEPS = [1, 50, 100, 250, 500, 1000];
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
/** عددٌ مُقاس ← نصٌّ عشريّ بالضبط (D(15, 3) = "0.015"). */
const D = (n, s) => {
  const v = BigInt(n), neg = v < 0n, a = (neg ? -v : v).toString().padStart(s + 1, "0");
  return (neg ? "-" : "") + (s ? `${a.slice(0, a.length - s)}.${a.slice(a.length - s)}` : a);
};

if (mode === "gen") gen(); else await check();

/* ══ التوليد ══════════════════════════════════════════════════════════════ */
function gen() {
  fs.mkdirSync(dir, { recursive: true });
  let st = 20261108 >>> 0;   // بذرةٌ ثابتة: العيّنةُ نفسُها بكلّ تشغيل (mulberry32)
  const R = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const pick = (a) => a[Math.floor(R() * a.length)];

  // ── الجداول الصِّرفة ──
  // سعرٌ × ١٠٬٠٠٠: الحدّان (١٠٠ و١٠٠٬٠٠٠)، وسعرُ السوق، وكسورٌ بأربع منازل، و١٢٥٠ الذي يصنع نصفاً بالضبط بخطوة ٢٥٠.
  const RATES = ["100.0000", "1250.0000", "1460.0000", "1460.1250", "1459.9999", "1466.6667", "9999.9999", "100000.0000"];
  const USD = ["0.00", "0.01", "0.05", "0.08", "0.10", "0.40", "0.50", "0.99", "1.00", "12.34", "50.00", "999.99", "1000.00", "123456.78"];
  const iqd = [];
  for (const u of USD) for (const r of RATES) for (const s of STEPS) iqd.push({ u, r, s });
  for (let i = 0; i < 400; i++) iqd.push({ u: D(int(0, 50_000_000), 2), r: D(int(1_000_000, 1_000_000_000), 4), s: pick(STEPS) });
  // «سعر ١٠٠ دولار» كما يُكتب: صحيحٌ، وبكسورٍ تُقرَّب عند المنزلة الثالثة (نصفٌ بعيداً عن الصفر)، وبأكثرَ من أربع منازل.
  const rate = ["146000", "146000.5", "146000.004", "146000.005", "145999.995", "146000.0049", "146000.12345", "10000", "10000000",
    "133333.33", "99999.995", "1460", "0.004"].map((p) => ({ p }));
  for (let i = 0; i < 200; i++) rate.push({ p: D(int(1_000_000, 1_000_000_000_000), int(0, 5)) });
  // الحصّة: الإغلاقُ (usd ≥ due)، والمجموعُ الصفر، والنسبة، والقصُّ بالباقي (نسبةٌ تتجاوز باقي الدينار)، وباقٍ سالب.
  const share = [
    { u: "100.00", du: "100.00", di: "146000", tu: "100.00", ti: "146000" },
    { u: "150.00", du: "100.00", di: "146000", tu: "100.00", ti: "146000" },
    { u: "40.00", du: "100.00", di: "146000", tu: "100.00", ti: "146000" },
    { u: "40.00", du: "100.00", di: "146000", tu: "0.00", ti: "146000" },
    { u: "99.99", du: "100.00", di: "100", tu: "100.00", ti: "146000" },
    { u: "1.00", du: "3.00", di: "-5", tu: "3.00", ti: "1000" },
    { u: "1.00", du: "3.00", di: "1000", tu: "3.00", ti: "1000" },
    { u: "0.01", du: "3.00", di: "1000", tu: "3.00", ti: "1000" },
    { u: "0.01", du: "0.03", di: "1", tu: "0.03", ti: "1" },
    { u: "0.05", du: "0.10", di: "15", tu: "0.10", ti: "15" },
  ];
  for (let i = 0; i < 400; i++) {
    const tu = int(1, 10_000_000), du = int(1, tu), u = int(1, du + 5), ti = int(0, 15_000_000_000), di = int(-100, ti);
    share.push({ u: D(u, 2), du: D(du, 2), di: String(di), tu: D(tu, 2), ti: String(ti) });
  }

  // ── السيناريوهات الحقيقية ──
  const PRICES = [1, 8, 33, 40, 99, 101, 250, 333, 999, 1234, 4999, 5000, 12345, 99999, 250000];
  const products = [];
  for (let i = 0; i < 24; i++) {
    const price = i < PRICES.length ? PRICES[i] : int(1, 300_000);
    products.push({ id: pid(i), price: D(price, 2), cost: pick([null, "0", D(int(1, price), 2), D(int(1, price * 2), 2)]) });
  }
  const PER100 = ["146000", "145500", "147250", "148000", "150000.5", "133333.33", "99999.99", "1000000", "10000", "146123.45", "145999.995", "146000.004"];
  const scenarios = [];
  for (let i = 0; i < 160; i++) {
    const n = int(1, 4), used = new Set(), items = [];
    while (items.length < n) {
      const p = pick(products);
      if (used.has(p.id)) continue;
      used.add(p.id);
      const it = { product_id: p.id, qty: pick([1, 1, 2, 3, 5, 7, 12, 100]) };
      if (R() < 0.25) it.unit_price_usd = pick([D(int(1, 500_000), 2), D(int(1, 5_000_000), 3), "0.005", "0.004", "0"]);
      items.push(it);
    }
    const meta = { client_ref: `USDP-${i}` };
    const dk = R();
    if (dk < 0.25) meta.discount_usd = D(int(1, 50_000), 2);
    else if (dk < 0.32) meta.discount_usd = "99999999.99";   // يُقصّ بمجموع الدولار
    else if (dk < 0.38) meta.discount_usd = D(int(1, 50_000), 3);
    const paid = R() < 0.3;
    const settle = [];
    if (!paid) {
      const k = int(0, 4);
      for (let j = 0; j < k; j++) {
        const kind = R();
        settle.push({
          per100: pick(PER100), override: R() < 0.3,
          ...(kind < 0.12 ? { usd: "0.01" } : kind < 0.2 ? { over: true } : { frac: pick([0.1, 0.25, 0.37, 0.5, 0.9, 0.999]) }),
        });
      }
      if (R() < 0.8) settle.push({ per100: pick(PER100), override: R() < 0.3, close: true });
    }
    scenarios.push({ i, step: pick(STEPS), per100: pick(PER100), items, meta, paid, settle });
  }

  // مصنوعةٌ باليد: ١٠$ بسعر ١٤٦٠ (١٤٬٦ دينار للسنت)، تسديدان بـ٤ سنتات (٥٨٫٤ ⇒ ٥٨ كلٌّ منهما) ثمّ الإغلاق: النسبةُ وحدها
  // تقول ١٤٬٤٨٣ والباقي ١٤٬٤٨٤ — قاعدةُ «الإغلاقُ = باقي الدينار» هي التي تُغلقها. العيّنةُ العشوائية نادراً تجمع خطأين بجهةٍ واحدة.
  products.push({ id: pid(99), price: "10.00", cost: null });
  for (const step of [1, 50]) {
    scenarios.push({ i: scenarios.length, step, per100: "146000", items: [{ product_id: pid(99), qty: 1 }], meta: { client_ref: `USDP-${scenarios.length}` }, paid: false,
      settle: [{ per100: "146000", override: false, usd: "0.04" }, { per100: "146000", override: false, usd: "0.04" }, { per100: "146000", override: false, close: true }] });
  }

  // 0271: دينٌ قديمٌ بالدولار (old_debt_add) — دينارُه الكاملُ بسعر اليوم كسطرٍ واحدٍ بكميّة ١، وتسديداتُه بالباب نفسِه حرفاً.
  for (let k = 0; k < 24; k++) {
    const settle = [];
    for (let j = int(0, 3); j > 0; j--) settle.push({ per100: pick(PER100), override: R() < 0.3, frac: pick([0.1, 0.25, 0.5, 0.9]) });
    if (R() < 0.7) settle.push({ per100: pick(PER100), override: R() < 0.3, close: true });
    scenarios.push({ i: scenarios.length, step: pick(STEPS), per100: pick(PER100), items: [], meta: { client_ref: `USDP-${scenarios.length}` },
      paid: false, old: pick([D(int(1, 500_000), 2), D(int(1, 99), 2), "0.01", "100", "1000000"]), settle });
  }

  fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify({ iqd, rate, share, products, scenarios }));
  fs.writeFileSync(path.join(dir, "seed.sql"), [
    "begin;",
    `insert into auth.users(id) values ('${PCL}') on conflict do nothing;`,
    `insert into clinic_prefs(clinic_id, usd_enabled, usd_round_step) values ('${PCL}', true, 250)
       on conflict (clinic_id) do update set usd_enabled = true;`,
    `insert into products(id, clinic_id, name, barcode, price_currency, sell_price_usd, purchase_price_usd, stock, sell_price, purchase_price) values
       ${products.map((p, k) => `('${p.id}', '${PCL}', 'تطابق ${k}', 'USDP-${k}', 'USD', ${p.price}, ${p.cost ?? "null"}, 1000000, 0, 0)`).join(",\n       ")}
       on conflict (id) do nothing;`,
    "commit;",
  ].join("\n") + "\n");

  const J = (rows, cols) => `$j$${JSON.stringify(rows.map((x, i) => Object.fromEntries([["i", i], ...cols.map((c) => [c, x[c]])])))}$j$::jsonb`;
  fs.writeFileSync(path.join(dir, "run.sql"), [
    // صاحبُ العيادة (مديرُها) يبيع ويسدّد بنداءاتٍ حقيقية؛ والرفضُ يُسجَّل برمزه ولا يوقف السيناريو.
    `create or replace function _usdp_run(p jsonb) returns jsonb language plpgsql as $f$
     declare sc jsonb; st jsonb; v_inv invoices; v_rid text; v_out jsonb := '[]'::jsonb; v_steps jsonb; v_usd numeric; v_r jsonb; v_one jsonb;
     begin
       perform set_config('request.jwt.claim.sub', '${PCL}', true);
       for sc in select * from jsonb_array_elements(p) loop
         update clinic_prefs set usd_round_step = (sc->>'step')::int where clinic_id = '${PCL}';
         perform fx_rate_set((sc->>'per100')::numeric);
         select rate_id::text into v_rid from _usd_ctx('${PCL}');
         v_steps := '[]'::jsonb;
         begin
           -- النقدُ يُرسل مجموعَ الدولار كما يعرفه الجهاز؛ والخادمُ يرفض غيرَ مجموعه (usd_partial_at_sale) — فالفرقُ يظهر رفضاً.
           v_usd := 0;
           if (sc->>'paid')::boolean then
             select coalesce(sum((x->>'qty')::numeric * round(coalesce(nullif(x->>'unit_price_usd', '')::numeric, p.sell_price_usd), 2)), 0)
               into v_usd from jsonb_array_elements(sc->'items') x join products p on p.id = (x->>'product_id')::uuid;
             v_usd := v_usd - least(greatest(round(coalesce(nullif(sc->'meta'->>'discount_usd', '')::numeric, 0), 2), 0), v_usd);
           end if;
           if sc ? 'old' then
             v_inv := old_debt_add('تطابق', null, 'دين سابق', null, (sc->>'old')::numeric, 'USD', null, sc->'meta'->>'client_ref');
           else
             v_inv := usd_checkout(sc->'items', (sc->'meta') || jsonb_build_object('fx_rate_id', v_rid, 'paid_usd', v_usd));
           end if;
           v_one := jsonb_build_object('fx_rate', v_inv.fx_rate::text, 'total', v_inv.total::text, 'total_usd', v_inv.total_usd::text,
             'discount', v_inv.discount::text, 'discount_usd', v_inv.discount_usd::text, 'amount_paid', v_inv.amount_paid::text,
             'paid_usd', v_inv.paid_usd::text, 'status', v_inv.status, 'cost_total', v_inv.cost_total::text,
             'items', (select jsonb_object_agg(ii.product_id::text, jsonb_build_array(ii.unit_price::text, ii.unit_price_usd::text, ii.unit_cost::text))
                         from invoice_items ii where ii.invoice_id = v_inv.id),
             'cash', (select jsonb_build_array(s.received::text, s.share::text, s.fx::text) from usd_settlements s where s.invoice_id = v_inv.id));
           for st in select * from jsonb_array_elements(sc->'settle') loop
             select * into v_inv from invoices where id = v_inv.id;
             v_usd := case when (st->>'close')::boolean then v_inv.total_usd - v_inv.paid_usd
                           when (st->>'over')::boolean then v_inv.total_usd - v_inv.paid_usd + 0.01
                           when st ? 'usd' then (st->>'usd')::numeric
                           else greatest(round((v_inv.total_usd - v_inv.paid_usd) * (st->>'frac')::numeric, 2), 0.01) end;
             if not (st->>'override')::boolean then perform fx_rate_set((st->>'per100')::numeric); end if;
             begin
               v_r := settle_invoice_usd(v_inv.id, v_usd, (st->>'per100')::numeric, 'cash', null,
                                         case when (st->>'override')::boolean then 'تطابق' end, null);
               v_steps := v_steps || jsonb_build_object('usd', v_usd::text, 'rate', v_r->'settlement'->>'rate',
                 'received', v_r->'settlement'->>'received', 'share', v_r->'settlement'->>'share', 'fx', v_r->'settlement'->>'fx',
                 'amount_paid', v_r->'invoice'->>'amount_paid', 'paid_usd', v_r->'invoice'->>'paid_usd', 'status', v_r->'invoice'->>'status');
             exception when others then
               v_steps := v_steps || jsonb_build_object('usd', v_usd::text, 'rate', _usd_rate_of((st->>'per100')::numeric)::text, 'error', sqlerrm);
             end;
           end loop;
           select * into v_inv from invoices where id = v_inv.id;
           v_out := v_out || (v_one || jsonb_build_object('steps', v_steps,
             'legs', (select coalesce(sum((l->>'amount')::numeric), 0)::text from jsonb_array_elements(v_inv.payment_details) l),
             'shares', (select coalesce(sum(s.share), 0)::text from usd_settlements s where s.invoice_id = v_inv.id),
             'received', (select coalesce(sum(s.received), 0)::text from usd_settlements s where s.invoice_id = v_inv.id),
             'final_paid', v_inv.amount_paid::text, 'final_paid_usd', v_inv.paid_usd::text));
         exception when others then
           v_out := v_out || jsonb_build_object('error', sqlerrm);
         end;
       end loop;
       return v_out;
     end $f$;`,
    "select json_build_object(",
    `  'iqd', (select json_agg(_usd_iqd(x.u, x.r, x.s)::text order by x.i) from jsonb_to_recordset(${J(iqd, ["u", "r", "s"])}) as x(i int, u numeric, r numeric, s int)),`,
    `  'rate', (select json_agg(_usd_rate_of(x.p)::text order by x.i) from jsonb_to_recordset(${J(rate, ["p"])}) as x(i int, p numeric)),`,
    `  'share', (select json_agg(_usd_share(x.u, x.du, x.di, x.tu, x.ti)::text order by x.i)
               from jsonb_to_recordset(${J(share, ["u", "du", "di", "tu", "ti"])}) as x(i int, u numeric, du numeric, di numeric, tu numeric, ti numeric)),`,
    `  'flows', _usdp_run(${q(JSON.stringify(scenarios.map((s) => ({ step: s.step, per100: s.per100, items: s.items, meta: s.meta, paid: s.paid, settle: s.settle, ...(s.old ? { old: s.old } : {}) }))))}::jsonb)`,
    ")::text;",
  ].join("\n") + "\n");
  console.log(`usd-parity gen: ${iqd.length} iqd، ${rate.length} rate، ${share.length} share، ${scenarios.length} سيناريو على ${products.length} مادّة`);
}

/* ══ المقارنة ═════════════════════════════════════════════════════════════ */
async function check() {
  const { build } = await import("esbuild");
  const out = path.join(dir, "usd-mirror.mjs");
  await build({
    stdin: { contents: 'export * from "./src/lib/usdMath.ts";\n', resolveDir: ROOT, loader: "ts" },
    bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  });
  const M = await import(pathToFileURL(out).href);
  const cases = JSON.parse(fs.readFileSync(path.join(dir, "cases.json"), "utf8"));
  let fail = 0;
  const ok = (t) => console.log(`   ✓ ${t}`);
  const no = (t, details = []) => { fail = 1; console.log(`   ✗ ${t}`); for (const d of details.slice(0, 6)) console.log(`      ${d}`); };
  let act;
  try { act = JSON.parse(fs.readFileSync(path.join(dir, "actual.txt"), "utf8").trim()); }
  catch (e) { no(`القاعدةُ أرجعت جوابَ التطابق (run.sql) — لا JSON: ${String(e.message).slice(0, 80)}`); process.exit(1); }

  const C = (s) => M.decOf(s, 2);     // سنتات/فلوس
  const RT = (s) => M.decOf(s, 4);    // السعر × ١٠٬٠٠٠
  const I0 = (s) => M.decOf(s, 0);    // دينارٌ صحيح من نصّ القاعدة

  // ── المرآة (تُستبدل بمرايا مغلوطة أدناه) ──
  const mirror = {
    iqd: (x) => M.iqdOf(C(x.u), RT(x.r), x.s),
    rate: (x) => M.rateOfPer100(x.p),
    share: (x) => M.shareOf(C(x.u), C(x.du), BigInt(x.di), C(x.tu), BigInt(x.ti)),
    cart: (lines, disc, r) => M.cartTotals(lines, disc, r),
    cash: (tu, ti, r, s) => M.cashAtSale(tu, ti, r, s),
    settle: (a) => M.previewSettle(a),
  };

  // ── الجداول الصِّرفة ──
  const pure = (m) => {
    const bad = { iqd: [], rate: [], share: [] };
    cases.iqd.forEach((x, i) => { const got = m.iqd(x), want = I0(act.iqd[i]); if (got !== want) bad.iqd.push(`iqd ${x.u}$ × ${x.r} ÷ ${x.s}: القاعدة ${want}، المرآة ${got}`); });
    cases.rate.forEach((x, i) => {
      const got = m.rate(x), want = act.rate[i] == null ? null : RT(act.rate[i]);
      if (got !== want) bad.rate.push(`rate «${x.p}»: القاعدة ${act.rate[i]}، المرآة ${got}`);
    });
    cases.share.forEach((x, i) => { const got = m.share(x), want = I0(act.share[i]); if (got !== want) bad.share.push(`share ${JSON.stringify(x)}: القاعدة ${want}، المرآة ${got}`); });
    return bad;
  };

  // ── السيناريوهات: المرآةُ تمشي خطوةً خطوة على ما كتبته القاعدة ──
  const prodOf = Object.fromEntries(cases.products.map((p) => [p.id, p]));
  const flows = (m) => {
    const bad = [];
    const tags = new Set();
    cases.scenarios.forEach((sc, k) => {
      const a = act.flows[k];
      const at = `#${sc.i}`;
      if (!a || a.error) { bad.push(`${at}: البيعُ رجع خطأ ${a?.error}`); return; }
      const r = m.rate({ p: sc.per100 });
      if (r !== RT(a.fx_rate)) bad.push(`${at}: السعر القاعدة ${a.fx_rate}، المرآة ${r}`);
      // 0271: الدينُ القديم سطرٌ واحدٌ بكميّة ١ بمبلغه — دينارُه الكامل _usd_iqd(المبلغ، السعر، ١) كسطر usd_checkout.
      const lines = sc.old ? [{ qty: 1n, unitCents: C(sc.old) }]
        : sc.items.map((it) => ({ qty: BigInt(it.qty), unitCents: C(it.unit_price_usd ?? prodOf[it.product_id].price) }));
      if (sc.old) tags.add("old");
      const t = m.cart(lines, sc.meta.discount_usd == null ? 0n : C(sc.meta.discount_usd), r);
      const cmp = (what, want, got) => { if (want !== got) bad.push(`${at} ${what}: القاعدة ${want}، المرآة ${got}`); };
      if (t.discountUsdCents > 0n) tags.add(t.discountUsdCents >= t.subUsdCents ? "discount:full" : "discount:part");
      cmp("total", C(a.total), t.totalIqd * 100n);
      cmp("total_usd", C(a.total_usd), t.totalUsdCents);
      cmp("discount", C(a.discount ?? "0"), t.discountIqd * 100n);
      cmp("discount_usd", C(a.discount_usd ?? "0"), t.discountUsdCents);
      sc.items.forEach((it, j) => {
        const row = a.items[it.product_id];
        cmp(`unit_price[${j}]`, C(row[0]), t.unitIqd[j] * 100n);
        cmp(`unit_price_usd[${j}]`, C(row[1]), lines[j].unitCents);
        const cost = prodOf[it.product_id].cost;
        // كلفةُ دولارٍ فارغة: تبقى كلفةُ الخادم (stock_unit_cost) — ليست حسابَ الدولار فلا مرآةَ لها هنا (cost_total يُجمع منها أدناه).
        if (cost == null) tags.add("cost:server");
        else cmp(`unit_cost[${j}]`, C(row[2]), M.costFilsOf(C(cost), r));
      });
      if (sc.old && a.items != null) bad.push(`${at}: دينٌ قديمٌ بأسطر`);
      const costTotal = sc.items.reduce((s, it) => s + BigInt(it.qty) * C(a.items[it.product_id][2]), 0n);
      cmp("cost_total", C(a.cost_total), costTotal);
      let paidUsd = 0n, paidIqd = 0n;
      if (sc.paid) {
        const c = m.cash(t.totalUsdCents, t.totalIqd, r, sc.step);
        if (c == null) { tags.add("cash:zero"); cmp("cash(none)", a.cash, null); }
        else {
          tags.add(c.fx === 0n ? "cash:exact" : "cash:fx");
          if (!a.cash) bad.push(`${at}: نقداً بلا وصل`);
          else { cmp("cash.received", C(a.cash[0]), c.received * 100n); cmp("cash.share", C(a.cash[1]), c.share * 100n); cmp("cash.fx", C(a.cash[2]), c.fx * 100n); }
          paidUsd = t.totalUsdCents; paidIqd = c.share;
        }
        cmp("paid_usd(بعد البيع)", C(a.paid_usd), paidUsd);
        cmp("amount_paid(بعد البيع)", C(a.amount_paid), paidIqd * 100n);
      }
      sc.settle.forEach((stp, j) => {
        const b = a.steps[j];
        if (!b) { bad.push(`${at} تسديد ${j}: ما رجع`); return; }
        const usd = C(b.usd), sr = RT(b.rate), due = t.totalUsdCents - paidUsd;
        const p = m.settle({ usdCents: usd, rate1e4: sr, step: sc.step, totalUsdCents: t.totalUsdCents, paidUsdCents: paidUsd, totalIqd: t.totalIqd, paidIqd });
        const ref = M.settleRefusal(usd, due, p.received);
        if (ref || b.error) {
          tags.add(`refuse:${ref ?? "?"}`);
          if (!b.error || !ref || !b.error.includes(ref)) bad.push(`${at} تسديد ${j} (${b.usd}$): القاعدة «${b.error ?? "قبلت"}»، المرآة «${ref ?? "تقبل"}»`);
          return;
        }
        tags.add(usd >= due ? (p.received === 0n ? "settle:close-zero" : "settle:close") : "settle:partial");
        tags.add(p.fx > 0n ? "fx:+" : p.fx < 0n ? "fx:-" : "fx:0");
        cmp(`تسديد ${j}.received`, C(b.received), p.received * 100n);
        cmp(`تسديد ${j}.share`, C(b.share), p.share * 100n);
        cmp(`تسديد ${j}.fx`, C(b.fx), p.fx * 100n);
        paidUsd += usd; paidIqd += p.share;
        cmp(`تسديد ${j}.amount_paid`, C(b.amount_paid), paidIqd * 100n);
        cmp(`تسديد ${j}.paid_usd`, C(b.paid_usd), paidUsd);
        cmp(`تسديد ${j}.status`, b.status, "paid");   // حالةُ البيع لا تتبدّل بالتسديد (retail_checkout تكتب paid دائماً)
      });
      // الثوابت: الإغلاقُ بالعملتين معاً، ومجموعُ الحصص = المدفوع، وما دخل الدرجَ بالسِّيَق = مجموعُ ما استُلم.
      const closedUsd = C(a.final_paid_usd) === C(a.total_usd), closedIqd = C(a.final_paid) === C(a.total);
      if (closedUsd !== closedIqd) bad.push(`${at}: أُغلقت بعملةٍ دون الأخرى (${a.final_paid_usd}/${a.total_usd}$، ${a.final_paid}/${a.total})`);
      if (closedUsd && C(a.total_usd) > 0n) tags.add("closed");
      if (C(a.shares) !== C(a.final_paid)) bad.push(`${at}: مجموعُ الحصص ${a.shares} ≠ المدفوع ${a.final_paid}`);
      if (C(a.legs) !== C(a.received)) bad.push(`${at}: السِّيَق ${a.legs} ≠ ما استُلم ${a.received}`);
    });
    return { bad, tags };
  };

  const P0 = pure(mirror);
  const report = (t, list) => (list.length ? no(`${t} — ${list.length} فرق`, list) : ok(t));
  report(`_usd_iqd = iqdOf (${cases.iqd.length} حالة، كلُّ خطوةٍ وحوافُّ النصف)`, P0.iqd);
  report(`_usd_rate_of = rateOfPer100 (${cases.rate.length} حالة، كسورٌ تُقرَّب)`, P0.rate);
  report(`_usd_share = shareOf (${cases.share.length} حالة)`, P0.share);
  const F0 = flows(mirror);
  report(`usd_checkout + settle_invoice_usd = cartTotals/cashAtSale/previewSettle (${cases.scenarios.length} سيناريو بنداءاتٍ حقيقية)`, F0.bad);
  const need = ["discount:full", "discount:part", "cash:exact", "cash:fx", "settle:partial", "settle:close", "fx:+", "fx:-", "refuse:usd_over", "refuse:usd_too_small", "closed", "old"];
  const miss = need.filter((x) => !F0.tags.has(x));
  if (miss.length) no(`كلُّ فرعٍ له حالاتُه بالسيناريوهات — ناقص: ${miss.join("، ")}`);
  else ok(`كلُّ فرعٍ له حالاتُه بالسيناريوهات (${[...F0.tags].sort().join("، ")})`);

  // ── مرايا مغلوطةٌ عمداً: كلٌّ لازم تخالف القاعدةَ بحالاتها (لو طابقت لكان القالبُ أعمى عن خطئها) ──
  const floorDiv = (a, b) => a / b;
  const mutants = {
    "تقريبُ الدينار بالقطع لا بالنصف": { ...mirror, iqd: (x) => { const st = BigInt(x.s <= 1 ? 1 : x.s); return floorDiv(C(x.u) * RT(x.r), 1_000_000n * st) * st; } },
    "السعرُ بالقطع عند المنزلة الرابعة": { ...mirror, rate: (x) => { const v = M.decOf(String(x.p).replace(/(\.\d{2})\d+$/, "$1"), 2); return v; } },
    "الحصّةُ بالنسبة دائماً (بلا قاعدة الإغلاق)": { ...mirror, settle: (a) => {
      const due = a.totalIqd - a.paidIqd, rec = M.iqdOf(a.usdCents, a.rate1e4, a.step);
      let s = a.totalUsdCents > 0n ? (a.usdCents * a.totalIqd * 2n + a.totalUsdCents) / (2n * a.totalUsdCents) : 0n; if (s > due) s = due;
      return { received: rec, share: s, fx: rec - s, dueAfterCents: 0n };
    } },
    "الحصّةُ بسعر التسديد لا بنسبة الفاتورة": { ...mirror, settle: (a) => {
      const due = a.totalIqd - a.paidIqd, rec = M.iqdOf(a.usdCents, a.rate1e4, a.step);
      const s = a.usdCents >= a.totalUsdCents - a.paidUsdCents ? due : (rec < due ? rec : due);
      return { received: rec, share: s, fx: rec - s, dueAfterCents: 0n };
    } },
    "دينارُ الوحدة بخطوة التقريب (الخطأ الذي صُحّح)": { ...mirror, cart: (lines, disc, r) => {
      const step = 250n; const t = M.cartTotals(lines, disc, r);
      const unitIqd = lines.map((l) => M.iqdOf(l.unitCents, r, Number(step)));
      const sub = lines.reduce((s, l, j) => s + l.qty * unitIqd[j], 0n);
      return { ...t, unitIqd, subIqd: sub, totalIqd: sub - t.discountIqd > 0n ? sub - t.discountIqd : 0n };
    } },
    "الخصمُ بلا قصّ": { ...mirror, cart: (lines, disc, r) => {
      const t = M.cartTotals(lines, disc, r); const d = disc < 0n ? 0n : disc;
      return { ...t, discountUsdCents: d, totalUsdCents: t.subUsdCents - d };
    } },
    "الخصمُ الكامل يُقلب كغيره (يبقى دينارٌ على فاتورةٍ صفرٍ بالدولار)": { ...mirror, cart: (lines, disc, r) => {
      const t = M.cartTotals(lines, disc, r); if (t.discountUsdCents < t.subUsdCents) return t;
      const d0 = M.iqdOf(t.discountUsdCents, r, 1), d = d0 < t.subIqd ? d0 : t.subIqd;
      return { ...t, discountIqd: d, totalIqd: t.subIqd - d };
    } },
    "النقدُ بلا فرق صرف (الدرجُ يستلم القيمةَ كما هي)": { ...mirror, cash: (tu, ti) => (tu <= 0n ? null : { received: ti, share: ti, fx: 0n }) },
  };
  const blind = [];
  for (const [name, m] of Object.entries(mutants)) {
    const p = pure(m), f = flows(m);
    const caught = p.iqd.length + p.rate.length + p.share.length + f.bad.length;
    if (!caught) blind.push(name);
  }
  if (blind.length) no(`والمرآةُ المغلوطة تخالف القاعدة — أعمى عن: ${blind.join("، ")}`);
  else ok(`والمرآةُ المغلوطة تخالف القاعدة (${Object.keys(mutants).length} مرايا مغلوطة، كلٌّ أمسكتها حالاتُها)`);

  console.log(fail ? "✗ usd-parity: فشل" : `✓ usd-parity: ${cases.iqd.length + cases.rate.length + cases.share.length} حالة صِرفة و${cases.scenarios.length} سيناريو`);
  process.exit(fail);
}
