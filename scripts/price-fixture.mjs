/* ============================================================================
 * قالبُ تطابق رفع الأسعار (0226) — الحسابُ نفسُه بالواجهة وبالقاعدة، فلساً بفلس.
 *
 * يحمّل `src/lib/priceRaise.ts` **من المصدر** (esbuild — لا نسخةَ منه: فحصٌ على نسخةٍ
 * يفحص النسخة) ويكتب:
 *   round.json      حالاتُ الحساب (سعر × نسبة × تقريب × عملة) والمتوقَّعُ منها
 *   round.sql       نداءٌ واحد يُرجع ناتجَ `_price_step`/`_price_raise`/`_price_align_sub`
 *   plan.json       متوقَّعُ المعاينة كاملةً (السطور + البصمة + العدّ) لكلّ نطاق
 *   plan-seed.sql   منتجاتُ وخدماتُ عيادتَي التطابق
 *   plan.sql        نداءُ `price_change_preview` لكلّ نطاق بهويّة العيادة
 *
 *   node scripts/price-fixture.mjs <dir>
 * ==========================================================================*/
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
if (!dir) { console.error("usage: price-fixture.mjs <dir>"); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, "priceRaise.mjs");
await build({ entryPoints: ["src/lib/priceRaise.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { "@": path.join(process.cwd(), "src") } });
const m = await import(pathToFileURL(out).href);
const cur = await (async () => {
  const o2 = path.join(dir, "currency.mjs");
  await build({ entryPoints: ["src/lib/currency.ts"], bundle: true, format: "esm", platform: "node", outfile: o2, logLevel: "silent",
    alias: { "@": path.join(process.cwd(), "src") } });
  return import(pathToFileURL(o2).href);
})();

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/* ── أ) الحساب ── قيمٌ من الإنتاج (1666، 2000.01، 4353543…) وحوافّ التدقيق (6204 بـ٨٪
 *   كانت تنقلب، 4.35 يرمي BigInt لو حُوِّل بلا تقريب، 1562.5 كسرٌ قديم). */
const OLDS = [0.01, 0.29, 1, 1.15, 2, 4.35, 4.5, 10, 12, 30, 32, 50, 60, 240, 250, 500, 625, 750, 999, 1000, 1001, 1100, 1249, 1250,
  1500, 1562.5, 1666, 1999, 2000, 2000.01, 2222, 2223, 2500, 3000, 3500, 4500, 5000, 5000.01, 6204, 6250, 7500, 9999, 14999,
  50006, 584748, 4353543];
const BPS = [1, 50, 100, 500, 800, 1000, 1250, 1500, 2000, 2250, 2500, 3333, 4000, 5000, 9999, 10000];
const MODES = [
  { frac: false, round: "smart", max: 250 }, { frac: false, round: "smart", max: 1000 }, { frac: false, round: "smart", max: 5 },
  { frac: false, round: "fixed", max: 1 }, { frac: false, round: "fixed", max: 250 }, { frac: false, round: "fixed", max: 1000 },
  { frac: true, round: "smart", max: 0.25 }, { frac: true, round: "fixed", max: 0.01 }, { frac: true, round: "fixed", max: 0.05 },
];
const round = [];
for (const o of OLDS) for (const bp of BPS) for (const md of MODES) {
  const r = m.raisePrice(o, bp, md.round, md.max, md.frac);
  round.push({ i: round.length, o, bp, r: md.round, m: md.max, f: md.frac, step: r.step, w: r.price });
}
// المفرد مقابل العلبة: حالاتُ التدقيق (4500/3×1500، 2500/2×1250، 3000/6×500) وعددٌ كسريّ.
const ALIGN = [
  [4500, 3, 1500, 2500], [2500, 2, 1250, 2500], [3000, 6, 500, 2000], [2500, 5, 500, 1000], [10000, 2.5, 4000, 2500],
  [5000, 10, 600, 2500], [1000, 20, 40, 2500], [7500, 3, 2400, 2500], [5000, 4, 1250, 1000],
];
const align = [];
for (const [box, n, sub, bp] of ALIGN) {
  const B = m.raisePrice(box, bp, "smart", 250, false);
  const S = m.raisePrice(sub, bp, "smart", 250, false);
  align.push({ i: align.length, box, nb: B.price, sub, ns: S.price, st: S.step, n, want: m.alignSub(box, B.price, sub, S.price, S.step, n) });
}
const fracCodes = Object.keys(cur.CURRENCIES).map((c) => ({ c, f: !!cur.CURRENCIES[c].frac }));
fs.writeFileSync(path.join(dir, "round.json"), JSON.stringify({ round, align, fracCodes }));
const rj = JSON.stringify(round.map(({ i, o, bp, r, m: mx, f }) => ({ i, o, bp, r, m: mx, f })));
const aj = JSON.stringify(align.map(({ i, box, nb, sub, ns, st, n }) => ({ i, box, nb, sub, ns, st, n })));
fs.writeFileSync(path.join(dir, "round.sql"), [
  `select json_build_object(`,
  `  'round', (select json_agg(json_build_array(x.i, _price_step(x.o, x.bp, x.r, x.m, x.f), _price_raise(x.o, x.bp, _price_step(x.o, x.bp, x.r, x.m, x.f))) order by x.i)`,
  `            from jsonb_to_recordset($rj$${rj}$rj$::jsonb) as x(i int, o numeric, bp int, r text, m numeric, f boolean)),`,
  `  'align', (select json_agg(json_build_array(x.i, _price_align_sub(x.box, x.nb, x.sub, x.ns, x.st, x.n)) order by x.i)`,
  `            from jsonb_to_recordset($aj$${aj}$aj$::jsonb) as x(i int, box numeric, nb numeric, sub numeric, ns numeric, st numeric, n numeric)),`,
  `  'frac', (select json_object_agg(c, _price_frac(c)) from unnest(array[${fracCodes.map((x) => q(x.c)).join(",")}]) c)`,
  `);`,
].join("\n") + "\n");

/* ── ب) المعاينة كاملة ── عيادتان (دينار، ودينارٌ كويتيّ بكسوره) بمنتجاتٍ تغطّي كلَّ فرعٍ
 *   بالنطاق: مجموعاتٌ تدخل كاملةً وتخرج كاملة، مفردٌ يتبع علبته، حقلٌ (farm) لا يُمسّ،
 *   صفرٌ يُعدّ ولا يُكتب، صنفٌ فارغ لا يطابق، شركةٌ وقسمٌ اتّحاداً. */
const PCL = "a2260000-0000-4000-8000-0000000000c1";
const PCK = "a2260000-0000-4000-8000-0000000000c2";
const FARM = "a2260000-0000-4000-8000-0000000000f1";
const CO1 = "a2260000-0000-4000-8000-000000000a01", CO2 = "a2260000-0000-4000-8000-000000000a02";
const SE1 = "a2260000-0000-4000-8000-000000000b01";
const SC1 = "a2260000-0000-4000-8000-000000000d01", SC2 = "a2260000-0000-4000-8000-000000000d02";
const pid = (n) => `a2260000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const products = [
  { id: pid(101), name: "رويال 2كغ", sell_price: 5000, purchase_price: 3500, category: "food", company_id: CO1, bulk_group: "G-A" },
  { id: pid(102), name: "رويال 2كغ دجاج", sell_price: 5000, purchase_price: 3500, category: "food", company_id: CO1, bulk_group: "G-A" },
  { id: pid(103), name: "رويال 2كغ سمك", sell_price: 5000, purchase_price: 3500, category: "accessories", company_id: CO2, bulk_group: "G-A" },
  { id: pid(104), name: "معلبات", sell_price: 1666, purchase_price: 1200, category: "food", company_id: CO2, section_id: SE1 },
  { id: pid(105), name: "رمل", sell_price: 1000, purchase_price: 1100, category: null, company_id: null },
  { id: pid(106), name: "حبوب ديدان", sell_price: 4500, purchase_price: 3000, category: "medicine", company_id: CO2,
    has_sub_unit: true, sub_unit_price: 1500, units_per_box: 3 },
  { id: pid(107), name: "شريط", sell_price: 2500, purchase_price: 1500, category: "medicine", company_id: CO2,
    has_sub_unit: true, sub_unit_price: 1250, units_per_box: 2, bulk_group: "G-B" },
  { id: pid(108), name: "شريط ٢", sell_price: 2500, purchase_price: 1500, category: "medicine", company_id: CO1, bulk_group: "G-B" },
  { id: pid(109), name: "صفر", sell_price: 0, purchase_price: 0, category: "food", company_id: CO1 },
  { id: pid(110), name: "علف الحقل", sell_price: 7000, purchase_price: 6000, category: "food", company_id: CO1, farm_id: FARM },
  { id: pid(111), name: "كسر قديم", sell_price: 1562.5, purchase_price: 900, category: "toys", company_id: CO1 },
  { id: pid(112), name: "مفرد بلا عدد", sell_price: 3000, purchase_price: 2000, category: "medicine", has_sub_unit: true, sub_unit_price: 400, units_per_box: null },
  { id: pid(113), name: "غالي", sell_price: 4353543, purchase_price: 100, category: "toys", company_id: CO1 },
  { id: pid(114), name: "مفرد أرخص", sell_price: 3000, purchase_price: 2000, category: "medicine", company_id: CO1,
    has_sub_unit: true, sub_unit_price: 400, units_per_box: 10 },
];
const services = [
  { id: pid(201), name: "فحص عام", price: 15000, category_id: SC1, cost: null },
  { id: pid(202), name: "مراجعة", price: 10000, category_id: SC1, cost: 11000 },
  { id: pid(203), name: "قص أظافر", price: 0, category_id: SC2, cost: null },
  { id: pid(204), name: "أشعة", price: 30000, category_id: SC2, cost: 5000 },
];
const base = { pct_bp: 2500, round: "smart", max_step: 250, products: true, services: true, p_categories: null, p_companies: null,
  p_sections: null, p_ids: null, p_exclude: [], s_categories: null, s_ids: null, s_exclude: [], skip_recent: true };
const SPECS = [
  { why: "الكلّ بـ٢٥٪ ذكيّ لـ٢٥٠", clinic: PCL, frac: false, spec: { ...base } },
  { why: "منتجاتٌ وحدها بصنف food — المجموعةُ G-A تدخل كاملة (103 من صنفٍ آخر)", clinic: PCL, frac: false,
    spec: { ...base, services: false, p_categories: ["food"] } },
  { why: "موادّ معيّنة: 108 وحده يجرّ 107 (مجموعة G-B) بمفرده", clinic: PCL, frac: false, spec: { ...base, services: false, p_ids: [pid(108)] } },
  { why: "استثناءُ 102 يُخرج G-A كلَّها", clinic: PCL, frac: false, spec: { ...base, services: false, p_exclude: [pid(102)] } },
  { why: "شركةٌ CO1 أو قسمٌ SE1 — اتّحاد", clinic: PCL, frac: false, spec: { ...base, services: false, p_companies: [CO1], p_sections: [SE1] } },
  { why: "خدماتٌ وحدها بتصنيف SC2، و١٠٪ ثابتٌ لـ٥٠٠", clinic: PCL, frac: false,
    spec: { ...base, products: false, s_categories: [SC2], pct_bp: 1000, round: "fixed", max_step: 500 } },
  { why: "خدمةٌ معيّنة مستثناة من الكلّ، و٥٠٪ بلا تقريب", clinic: PCL, frac: false,
    spec: { ...base, products: false, s_exclude: [pid(201)], pct_bp: 5000, round: "fixed", max_step: 1 } },
  { why: "معرّفٌ زال من القائمة يُقال لا يُفشل", clinic: PCL, frac: false,
    spec: { ...base, services: false, p_exclude: [pid(999)], pct_bp: 800 } },
  { why: "عملةٌ بكسور (د.ك) — ربعٌ ذكيّ", clinic: PCK, frac: true, spec: { ...base, pct_bp: 1250, max_step: 0.25 } },
];
const kwProducts = [
  { id: pid(301), name: "KW1", sell_price: 4.35, purchase_price: 2, category: "food" },
  { id: pid(302), name: "KW2", sell_price: 12, purchase_price: 8, category: "food", has_sub_unit: true, sub_unit_price: 1.15, units_per_box: 10 },
  { id: pid(303), name: "KW3", sell_price: 0.29, purchase_price: 0.1, category: "food" },
];
const kwServices = [{ id: pid(401), name: "KS1", price: 7.5, category_id: SC1, cost: null }];

const plans = SPECS.map((c, i) => {
  const ps = c.clinic === PCK ? kwProducts : products;
  const ss = c.clinic === PCK ? kwServices : services;
  const p = m.buildPlan(ps, ss, c.spec, c.frac);
  return {
    i, why: c.why, clinic: c.clinic,
    plan_hash: crypto.createHash("md5").update(p.hashText).digest("hex"),
    counts: p.counts, skipped: p.skipped, missing: m.missingIds(ps, ss, m.normalizeSpec(c.spec)), lines: p.lines,
  };
});
fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(plans, null, 1));

const prodRow = (cl) => (p) => `(${q(p.id)},${q(cl)},${q(p.name)},${p.sell_price},${p.purchase_price},${p.category ? q(p.category) : "null"},`
  + `${p.company_id ? q(p.company_id) : "null"},${p.section_id ? q(p.section_id) : "null"},${p.bulk_group ? q(p.bulk_group) : "null"},`
  + `${p.farm_id ? q(p.farm_id) : "null"},${p.has_sub_unit ? "true" : "false"},${p.sub_unit_price ?? "null"},${p.units_per_box ?? "null"},5)`;
fs.writeFileSync(path.join(dir, "plan-seed.sql"), [
  `insert into auth.users(id) values (${q(PCL)}), (${q(PCK)}) on conflict do nothing;`,
  `insert into clinic_prefs(clinic_id, currency) values (${q(PCL)}, null), (${q(PCK)}, 'KWD') on conflict (clinic_id) do update set currency = excluded.currency;`,
  `insert into poultry_farms(id, clinic_id, name) values (${q(FARM)}, ${q(PCL)}, 'حقل التطابق') on conflict do nothing;`,
  `insert into companies(id, clinic_id, name) values (${q(CO1)}, ${q(PCL)}, 'شركة تطابق ١'), (${q(CO2)}, ${q(PCL)}, 'شركة تطابق ٢') on conflict do nothing;`,
  `insert into company_sections(id, clinic_id, company_id, name) values (${q(SE1)}, ${q(PCL)}, ${q(CO2)}, 'قسم تطابق') on conflict do nothing;`,
  `insert into clinic_service_categories(id, clinic_id, name) values (${q(SC1)}, ${q(PCL)}, 'فحوص'), (${q(SC2)}, ${q(PCL)}, 'عناية') on conflict do nothing;`,
  `insert into products(id, clinic_id, name, sell_price, purchase_price, category, company_id, section_id, bulk_group, farm_id, has_sub_unit, sub_unit_price, units_per_box, stock) values`,
  products.map(prodRow(PCL)).concat(kwProducts.map(prodRow(PCK))).join(",\n") + " on conflict do nothing;",
  `insert into clinic_services(id, clinic_id, category_id, name, price, cost) values`,
  services.map((s) => `(${q(s.id)},${q(PCL)},${q(s.category_id)},${q(s.name)},${s.price},${s.cost ?? "null"})`)
    .concat(kwServices.map((s) => `(${q(s.id)},${q(PCK)},${q(SC1)},${q(s.name)},${s.price},null)`)).join(",\n") + " on conflict do nothing;",
].join("\n") + "\n");
fs.writeFileSync(path.join(dir, "plan.sql"), SPECS.map((c, i) =>
  `select json_build_object('i', ${i}, 'doc', _pf(${q(c.clinic)}, $q$select price_change_preview(${q(JSON.stringify(c.spec))}::jsonb)::text$q$)::json);`,
).join("\n") + "\n");
console.log(`price-fixture: ${round.length} حالة حساب، ${align.length} مفرد/علبة، ${plans.length} معاينة`);
