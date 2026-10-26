/* ============================================================================
 * مستهلكاتُ الخدمات — الحسابُ النقيّ (src/lib/consumption.ts و src/lib/avgCost.ts) بأرقامه وخواصّه.
 *
 * ما يحرسه: القسمةُ الواحدة (_cons_round_div) نصفُها بعيداً عن الصفر بالموجب والسالب؛ القرّاءُ ترفض
 * المنزلةَ الزائدة ولا تقرّبها؛ أرقامُ التصميم والحزمة يدوياً (CBC: ٧٥ + ٢٤٠ + ٢٥٠ + ٢٥٠ = ٨١٥، وبيعتان
 * من مكعّب الـDiluent تكتبان ٠٫٠٠١ ثم ٠ = ٢٠ مل بالضبط؛ سندُ التلف ٥٠٠ و٦٢٥٠ و٧٥)؛ الترحيلُ عبر المرحَّل
 * وثابتُه بعد كلّ خطوة؛ والمالُ بإسناد numeric(14,2) (١٫٥ × ٨١٥٫٠١ = ١٢٢٢٫٥٢ لا ١٢٢٢٫٥١)؛ وسلسلةُ المتوسّط
 * (١١٠٠ ← ١١٤٧٫٦١٩٠٤٨ ← ١١٧١٫٤٢٨٥٧٢؛ أساسٌ مجهول ← ١٢٠٠؛ أساسٌ سالب ← ١٣٠٠ وفرقٌ ٦٠٠). والعشوائيُّ ببذرةٍ
 * ثابتة (mulberry32): الإرجاعُ ثم الإعادة صفرٌ صافٍ، والمكتوبُ يتبع المجموعَ التراكميّ وحده، و Σ V = Q·C.
 * (والتطابقُ مع بوستغريس نفسِه بـconsumption-math داخل الحزمة.) وآخرُها نصُّ القاعدة: كلُّ شاشةٍ ترفض كميةً
 * بـparseRecipeLine تقول حدّيها كليهما (مليون، ومراتب «عشرية») بالقاموسين وبافتراضيّ الشِفرة.
 *
 *   node scripts/consumption-math-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
};
let m, av;
try {
  m = await load("src/lib/consumption.ts");
  av = await load("src/lib/avgCost.ts");
} catch (e) {
  console.log(`   ✗ الوحدتان ما تنبنيان — ${String(e.message).split("\n")[0]}`);
  process.exit(1);
}

let pass = 0, fail = 0;
const show = (v) => { try { return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? `${x}n` : x)); } catch { return String(v); } };
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${show(got) ?? ""}`); } };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(String(e.message)) : true; } };

/* مولّدٌ ببذرة: نفسُ البذرة = نفسُ الحالات، فالفشلُ يُعاد كما هو. */
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261031);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
/** عددٌ صحيح عشوائيّ حتى `digits` منزلة، بإشارةٍ عشوائية إن طُلبت. */
const rbig = (digits, signed = true) => {
  const n = int(1, digits);
  let s = String(int(1, 9));
  for (let i = 1; i < n; i++) s += String(int(0, 9));
  const v = BigInt(s);
  return signed && rnd() < 0.5 ? -v : v;
};

/* مراجعُ مستقلّة عن الوحدة (صيغةٌ أخرى للحساب نفسِه): */
/** n/d النصفُ بعيداً عن الصفر — بالباقي لا بالضعف. */
function refRound(n, d) {
  let q = n / d; const r = n - q * d;
  if (2n * (r < 0n ? -r : r) >= (d < 0n ? -d : d)) q += (n < 0n) !== (d < 0n) ? -1n : 1n;
  return q;
}
/** floor(n/d) لـd > 0 — بالباقي غير السالب. */
const refFloor = (n, d) => { const r = ((n % d) + d) % d; return (n - r) / d; };

const { roundDiv, toMilli, toCents, toMicro, toNano, roundScaled, fromScaled, targetNano, perValueCents, valueCents, stockNano,
  specValues, lineUnitCostCents, consumptionMove, shortfallMilli, stockPost, EMPTY_CARRY, carryInvariant, carryResidual,
  stockUnitCost, addLineCents, lineCents, productLineCostCents, validateRecipeLines, overrideRefusal, sameConsumables,
  entrySkip, perDivMilli, subUnitMilli } = m;

/* ── ٠) النقاء: بلا استيراد إلا الأخت، وبلا عائم ─────────────────────────── */
console.log("▸ الوحدتان نقيّتان");
{
  const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const c = code("src/lib/consumption.ts"), a = code("src/lib/avgCost.ts");
  const imports = (s) => [...s.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((x) => x[1] ?? x[2]);
  check("consumption.ts لا يستورد شيئاً، و avgCost.ts أختَه وحدها", imports(c).length === 0 && imports(a).every((x) => x === "./consumption") && imports(a).length === 1,
    [imports(c), imports(a)]);
  const floaty = /\bMath\.|parseFloat|toFixed|toPrecision/;
  check("لا Math.* ولا parseFloat ولا toFixed — الحسابُ كلُّه بأعدادٍ صحيحة", !floaty.test(c) && !floaty.test(a));
  check("لا عربيةَ خارج التعليقات (رموزٌ لا نصوص)", !/[؀-ۿ]/.test(c) && !/[؀-ۿ]/.test(a));
}

/* ── ١) القسمةُ الواحدة ────────────────────────────────────────────────── */
console.log("▸ roundDiv = _cons_round_div بأعدادٍ مُقاسة (النصفُ بعيداً عن الصفر)");
check("أنصاف: ½→1، 3/2→2، 5/10→1، 4/10→0، 15/10→2", roundDiv(1n, 2n) === 1n && roundDiv(3n, 2n) === 2n && roundDiv(5n, 10n) === 1n && roundDiv(4n, 10n) === 0n && roundDiv(15n, 10n) === 2n);
check("سوالب: −½→−1، −3/2→−2، 1/−2→−1، −1/−2→1، −5/10→−1، −4/10→0", roundDiv(-1n, 2n) === -1n && roundDiv(-3n, 2n) === -2n && roundDiv(1n, -2n) === -1n
  && roundDiv(-1n, -2n) === 1n && roundDiv(-5n, 10n) === -1n && roundDiv(-4n, 10n) === 0n);
check("صفرٌ بسطاً ← 0 بأيّ مقام", roundDiv(0n, 7n) === 0n && roundDiv(0n, -7n) === 0n);
check("مقامٌ صفر يرمي (كـdiv بوستغريس)", throws(() => roundDiv(1n, 0n)));
{
  let n = 0, bad = null;
  for (let a = -60n; a <= 60n; a++) for (let d = -13n; d <= 13n; d++) {
    if (d === 0n) continue;
    n++; if (roundDiv(a, d) !== refRound(a, d) && !bad) bad = [a, d, roundDiv(a, d), refRound(a, d)];
  }
  for (let i = 0; i < 20000; i++) {
    const a = rbig(30), d = rbig(15) || 1n;
    n++; if (roundDiv(a, d) !== refRound(a, d) && !bad) bad = [a, d];
    const h = d * (2n * rbig(12) + 1n);                  // نصفٌ بالضبط: (2k+1)·d / 2d
    n++; if (roundDiv(h, 2n * d) !== refRound(h, 2n * d) && !bad) bad = ["half", h, d];
  }
  check(`مسحٌ: ${n} حالة (منها ٢٠٠٠٠ نصفٍ بالضبط) تطابق القسمةَ المرجعية`, bad === null, bad);
}

/* ── ٢) القرّاء ────────────────────────────────────────────────────────── */
console.log("▸ القرّاءُ الدقيقة — ترفض المنزلةَ الزائدة ولا تقرّبها");
check("toMilli: 1، 0.001، «2.5»، « 10.000 »، «1.2300»، −3، «+.5»، «5.»", toMilli(1) === 1000n && toMilli(0.001) === 1n && toMilli("2.5") === 2500n
  && toMilli(" 10.000 ") === 10000n && toMilli("1.2300") === 1230n && toMilli(-3) === -3000n && toMilli("+.5") === 500n && toMilli("5.") === 5000n);
check("الأُسّيّ: 1e21، «2.5E+3»، 1.5e-7 بالمليار، 1e-6 بالمليون", toMilli(1e21) === 10n ** 24n && toMilli("2.5E+3") === 2500000n && toNano(1.5e-7) === 150n && toMicro(1e-6) === 1n);
check("toCents(815.01)، toMicro(1147.619048)، toNano(±0.0005)", toCents(815.01) === 81501n && toMicro(1147.619048) === 1147619048n
  && toNano(0.0005) === 500000n && toNano(-0.0005) === -500000n && toNano("-0.000") === 0n);
check("منزلةٌ زائدة ترمي: 0.0001، «1.0005»، 1.5e-7 بالألف، 0.1+0.2 بالفلوس", throws(() => toMilli(0.0001), /decimals/) && throws(() => toMilli("1.0005"))
  && throws(() => toMilli(1.5e-7)) && throws(() => toCents(0.1 + 0.2)));
check("ما ليس رقماً يرمي: NaN، Infinity، «»، «.»، «1.2.3»، «abc»، «1e»، «0x10»، أرقامٌ شرقية، null، undefined",
  [NaN, Infinity, "", ".", "1.2.3", "abc", "1e", "0x10", "١٢", null, undefined].every((x) => throws(() => toMilli(x))));
check("المسافاتُ كما يقبلها numeric_in: الستُّ اللاتينية تُشال، والمسافةُ غيرُ المنكسرة و BOM و U+2003 ترمي (الخادمُ يرفضها)",
  toMilli("\t\n 7 \r\v\f") === 7000n && [" 5", "5 ", "﻿5", " 5"].every((x) => throws(() => toMilli(x)))
  && m.parseRecipeLine({ product_id: "p", qty: " 5" }) === null && m.parseRecipeLine({ product_id: "p", qty: " 5\t" })?.qty_m === 5000n);
check("أُسٌّ فلكيّ لا يعلّق: «1e999999999» يرمي، و«1e-999999999» يرمي دقيقاً ويصير صفراً مقرَّباً",
  throws(() => toMilli("1e999999999"), /range/) && throws(() => toMilli("1e-999999999")) && roundScaled("1e-999999999", 2) === 0n);
check("roundScaled كـround(x, s): 2.345→2.35، −2.345→−2.35، 1.005→1.01 (العائمُ يقول 1.00)، −0.005→−0.01، 0.004→0",
  roundScaled("2.345", 2) === 235n && roundScaled("-2.345", 2) === -235n && roundScaled(1.005, 2) === 101n && roundScaled("-0.005", 2) === -1n && roundScaled("0.004", 2) === 0n);
check("  وبالصفر منزلة: ½→1، −½→−1؛ و1000.555 بعمود (24,2) → 1000.56", roundScaled("0.5", 0) === 1n && roundScaled("-0.5", 0) === -1n && roundScaled(1000.555, 2) === 100056n);
check("fromScaled: 1/10³=0.001، −5/10³=−0.005، 0، 123456789.012، 815.01، 10²⁴/10³=1e21",
  fromScaled(1n, 3) === 0.001 && fromScaled(-5n, 3) === -0.005 && Object.is(fromScaled(0n, 9), 0) && fromScaled(123456789012n, 3) === 123456789.012
  && fromScaled(81501n, 2) === 815.01 && fromScaled(10n ** 24n, 3) === 1e21);
check("  وفوق 2⁵³ أقربُ عائمٍ للنصّ العشريّ لا قسمةٌ عائمة مرّتين: 9007199254756831/10³ ← …756.83 (القسمةُ تقول …756.832)",
  fromScaled(9007199254756831n, 3) === 9007199254756.83 && Number(9007199254756831n) / 1000 !== 9007199254756.83);
{
  let bad = null, n = 0;
  for (let i = 0; i < 4000; i++) {
    const v = rbig(15);
    for (const [s, to] of [[2, toCents], [3, toMilli], [6, toMicro], [9, toNano]]) {
      n++; const back = to(fromScaled(v, s));
      if (back !== v && !bad) bad = [v, s, fromScaled(v, s), back];
    }
  }
  check(`ذهابٌ وإياب: ${n} قيمة (≤ ١٥ رقماً) ترجع كما هي من الرقم المعروض`, bad === null, bad);
}

/* ── ٣) CBC بأرقام التصميم ─────────────────────────────────────────────── */
console.log("▸ CBC بأرقام التصميم (§3.3) والحزمة (K1–K3)");
const SUB = (price, upb) => ({ purchase_price: price, has_sub_unit: true, units_per_box: upb });
const CBC = [
  { n: "Diluent ١٠ مل من ٢٠٠٠٠ بـ١٥٠٠٠٠", p: SUB(150000, 20000), q: "10", w: 7500n, T1: 500000n },
  { n: "Lyse ٢ مل من ٥٠٠ بـ٦٠٠٠٠", p: SUB(60000, 500), q: "2", w: 24000n, T1: 4000000n },
  { n: "سرنجة ١ من ١٠٠ بـ٢٥٠٠٠", p: SUB(25000, 100), q: "1", w: 25000n, T1: 10000000n },
  { n: "قفازات ١ من ٥٠ بـ١٢٥٠٠", p: SUB(12500, 50), q: "1", w: 25000n, T1: 20000000n },
];
const specs = CBC.map((e) => specValues(e.p, toMilli(e.q), "sub"));
for (const [i, e] of CBC.entries()) {
  const s = specs[i];
  check(`${e.n}: w ${fromScaled(e.w, 2)}، T(1) ${fromScaled(e.T1, 9)}`, s.per_value_c === e.w && targetNano(1000n, s.per_qty_m, s.per_div_m) === e.T1 && stockNano(s.per_qty_m, s.per_div_m) === e.T1,
    [s, targetNano(1000n, s.per_qty_m, s.per_div_m)]);
}
check("  وقيمُ Diluent المجمَّدة: per_qty ١٠، per_div ٢٠٠٠٠، unit_cost ١٥٠٠٠٠", specs[0].per_qty_m === 10000n && specs[0].per_div_m === 20000000n && specs[0].unit_cost_u === 150000000000n);
const C = specs.reduce((a, s) => a + s.per_value_c, 0n);
check("C = ٧٥ + ٢٤٠ + ٢٥٠ + ٢٥٠ = ٨١٥٫٠٠، و unit_cost السطر = round(flat) + C", C === 81500n && lineUnitCostCents(null, specs.map((s) => s.per_value_c)) === 81500n
  && lineUnitCostCents(3000, [C]) === 381500n && lineUnitCostCents("1000.005", [1n]) === 100002n);
{
  // K1: CBC ×1 — المالُ والرصيد.
  const subtotal = addLineCents(0n, 1000n, 2500000n), cost = addLineCents(0n, 1000n, C);
  check("K1: cost_total ٨١٥٫٠٠ و profit ٢٤١٨٥٫٠٠", cost === 81500n && subtotal - cost === 2418500n);
  const stock = [1000n, 2000n, 1000n, 40n], carry = specs.map(() => EMPTY_CARRY);
  const sale = (Qm) => specs.map((s, i) => {
    const mv = consumptionMove(s, { qty_n: 0n, value_c: 0n }, Qm);
    const r = stockPost(carry[i], mv.qty_n);
    const before = stock[i];
    stock[i] -= r.posted; carry[i] = r.state;
    return { posted: r.posted, short: shortfallMilli(r.posted, before), mv };
  });
  const k1 = sale(1000n);
  check("K1: R01 0.999 (كُتب 0.001، المرحَّل −0.0005)، R02 1.996، R03 0.990، R04 0.020",
    stock.join() === "999,1996,990,20" && carry[0].carry_n === -500000n && k1[0].posted === 1n, [stock, carry[0]]);
  sale(1000n);
  check("K2: CBC ثانية — R01 يبقى 0.999 ومرحَّلُه يرجع صفراً (٢٠ مل بالضبط على بيعتين)", stock[0] === 999n && carry[0].carry_n === 0n && stock[3] === 0n, [stock, carry[0]]);
  const k3 = sale(3000n);
  check("K3: CBC ×3 — القفازات من 0.000 إلى −0.060 بعجز 0.060، والسعرُ لكلّ وحدة يبقى ٨١٥٫٠٠", stock[3] === -60n && k3[3].short === 60n && k3[3].mv.value_c === 75000n
    && addLineCents(0n, 3000n, C) === 244500n, [stock[3], k3[3]]);
  check("  و Diluent ×3 = 0.0015: يُكتب 0.002 والمرحَّل −0.0005", k3[0].posted === 2n && carry[0].carry_n === -500000n, carry[0]);
}

/* ── ٤) الحركةُ إلى هدف ─────────────────────────────────────────────────── */
console.log("▸ _consumption_move: كلُّ حركةٍ إلى هدف، والتكرارُ لا شيء");
{
  const lyse = specs[1], z = { qty_n: 0n, value_c: 0n };
  const a = consumptionMove(lyse, z, 3000n);
  check("Lyse ×3 من لا شيء: use بمقدار 0.012 وقيمة ٧٢٠٫٠٠", a.kind === "use" && a.qty_n === 12000000n && a.value_c === 72000n, a);
  const live = { qty_n: a.qty_n, value_c: a.value_c };
  check("  ونفسُ الهدف ثانيةً لا شيء (null)", consumptionMove(lyse, live, 3000n) === null);
  const b = consumptionMove(lyse, live, 1000n);
  check("  ومرتجعٌ جزئيّ 3 → 1: restore بـ−0.008 و−٤٨٠٫٠٠ (يبقى T(1) حيّاً)", b.kind === "restore" && b.qty_n === -8000000n && b.value_c === -48000n, b);
  const c = consumptionMove(lyse, live, 0n), d = consumptionMove(lyse, live, -2000n);
  check("  والإرجاعُ الكامل يردّ كلَّ شيء، والهدفُ السالب كالصفر", c.qty_n === -12000000n && c.value_c === -72000n && d.qty_n === c.qty_n && d.value_c === c.value_c);
  const half = consumptionMove(specs[0], z, 500n);
  check("كميةٌ كسرية 0.5 من Diluent: T 0.00025 و V ٣٧٫٥٠", half.qty_n === 250000n && half.value_c === 3750n, half);
  // مدخلٌ T(1) = 0 بقيمة (تعديلُ حالةٍ لا يُرفض بـrecipe_too_small): حركةُ قيمةٍ وحدها.
  const tiny = { per_qty_m: 1n, per_div_m: 3000000000n, per_value_c: perValueCents(1n, 30000000000000n, 3000000000n) };
  const u = consumptionMove(tiny, z, 1000n), r = consumptionMove(tiny, { qty_n: 0n, value_c: 1n }, 0n);
  check("مدخلٌ مقدارُه صفر وقيمتُه فلس: use بقيمةٍ وحدها، وإرجاعُه restore بقيمةٍ وحدها", tiny.per_value_c === 1n && u.kind === "use" && u.qty_n === 0n && u.value_c === 1n
    && r.kind === "restore" && r.qty_n === 0n && r.value_c === -1n, [u, r]);
  check("أنصافُ T: 1 من 2٬000٬000 = ٠٫٥ نانو ← 1، والسالبُ ← −1", targetNano(1000n, 1n, 2000000000n) === 1n && targetNano(-1000n, 1n, 2000000000n) === -1n);
  check("العجز: max(0, المكتوب − max(قبله, 0))", shortfallMilli(60n, 0n) === 60n && shortfallMilli(60n, -20n) === 60n && shortfallMilli(60n, 40n) === 20n && shortfallMilli(60n, 100n) === 0n && shortfallMilli(-5n, 0n) === 0n);
  // عشوائيّ: كلُّ تسلسل أهدافٍ يترك الحيَّ = (T(هدف)، V(هدف))، وكلُّ حدثٍ بشكل قيد الجدول.
  let bad = null, n = 0;
  for (let i = 0; i < 1500; i++) {
    const unit = rnd() < 0.5 ? "sub" : "stock";
    const p = unit === "sub" ? SUB(int(0, 2000000) / 100, int(1, 200000) / (rnd() < 0.3 ? 1000 : 1)) : { purchase_price: int(0, 9999999) / 100 };
    const s = specValues(p, BigInt(int(1, 3000000)), unit);
    let lv = { qty_n: 0n, value_c: 0n };
    for (let j = 0; j < 8; j++) {
      const t = BigInt(int(-2000, 6000));
      const mv = consumptionMove(s, lv, t);
      const q = t > 0n ? t : 0n;
      if (mv) {
        n++;
        const okShape = mv.kind === "use" ? mv.qty_n >= 0n && mv.value_c >= 0n && (mv.qty_n > 0n || mv.value_c > 0n)
          : mv.qty_n <= 0n && mv.value_c <= 0n && (mv.qty_n < 0n || mv.value_c < 0n);
        if (!okShape && !bad) bad = ["shape", s, lv, t, mv];
        lv = { qty_n: lv.qty_n + mv.qty_n, value_c: lv.value_c + mv.value_c };
      }
      if ((lv.qty_n !== targetNano(q, s.per_qty_m, s.per_div_m) || lv.value_c !== valueCents(q, s.per_value_c)) && !bad) bad = ["live", s, t, lv];
    }
  }
  check(`عشوائيّ: ${n} حركة — الحيُّ دائماً T و V الهدف، وكلُّ حدثٍ يرضي invoice_consumption_shape`, bad === null, bad);
}

/* ── ٥) الترحيل ────────────────────────────────────────────────────────── */
console.log("▸ _stock_post: المرحَّل، والنصفُ للأعلى، وأنماطُه الثلاثة");
const post = (c, x, mode) => stockPost({ ...EMPTY_CARRY, carry_n: c }, x, mode);
const pc = (r) => [r.posted, r.state.carry_n];
check("0.0005 → يُكتب 0.001 والمرحَّل −0.0005", show(pc(post(0n, 500000n))) === show([1n, -500000n]));
check("−0.0005 → يُكتب 0 (النصفُ للأعلى لا بعيداً عن الصفر)", show(pc(post(0n, -500000n))) === show([0n, -500000n]));
check("−0.000500001 → −0.001 والمرحَّل 0.000499999 (floor حقيقيّ للسالب)", show(pc(post(0n, -500001n))) === show([-1n, 499999n]));
check("±0.0015 → 0.002 و −0.001، والمرحَّل −0.0005 بالحالتين", show(pc(post(0n, 1500000n))) === show([2n, -500000n]) && show(pc(post(0n, -1500000n))) === show([-1n, -500000n]));
check("مرحَّلٌ 0.000499999 + 1 نانو يعبر النصف فيُكتب 0.001", show(pc(post(499999n, 1n))) === show([1n, -500000n]) && show(pc(post(0n, 499999n))) === show([0n, 499999n]));
{
  const l = stockPost(EMPTY_CARRY, 500000n), e = stockPost(EMPTY_CARRY, 500000n, "external"), f = stockPost(EMPTY_CARRY, 500000n, "fold");
  check("ledger لا يلمس ext؛ external يزيد ext_in بالمقدار و ext_out بالمكتوب؛ fold يزيد ext_out وحده",
    l.state.ext_in_n === 0n && l.state.ext_out_m === 0n && e.state.ext_in_n === 500000n && e.state.ext_out_m === 1n && f.state.ext_in_n === 0n && f.state.ext_out_m === 1n);
  check("نمطٌ غريب يرمي stock_post_mode", throws(() => stockPost(EMPTY_CARRY, 1n, "x"), /stock_post_mode/));
  check("والحالةُ الداخلة لا تُمسّ (EMPTY_CARRY مجمَّد)", EMPTY_CARRY.carry_n === 0n && Object.isFrozen(EMPTY_CARRY));
}
console.log("▸ سندُ التلف بأرقام الحزمة (W2–W4)");
{
  const dW2 = stockNano(2000n, 100000n);   // سرنجتان من ١٠٠
  const r2 = stockPost(EMPTY_CARRY, dW2, "external");
  check("W2: سرنجتان = 0.02؛ رصيدٌ −0.010 بعد خمس بيعات ← −0.030؛ والخسارة ٥٠٠٫٠٠", dW2 === 20000000n && -10n - r2.posted === -30n && roundDiv(dW2 * 25000000000n, 10n ** 13n) === 50000n);
  const dW3 = stockNano(500n, 1000n), r3 = stockPost(EMPTY_CARRY, dW3, "external");
  check("W3: نصفُ علبة قفازات على −0.060 ← −0.560 وخسارة ٦٢٥٠٫٠٠", -60n - r3.posted === -560n && roundDiv(dW3 * 12500000000n, 10n ** 13n) === 625000n);
  const dW4 = stockNano(10000n, 20000000n), r4 = stockPost(EMPTY_CARRY, dW4, "external");
  check("W4: ١٠ مل Diluent = 0.0005 عبر المرحَّل: ext_in +0.0005، يُكتب 0.001، الخسارة ٧٥٫٠٠، والثابتُ يصحّ",
    dW4 === 500000n && r4.posted === 1n && r4.state.ext_in_n === 500000n && r4.state.ext_out_m === 1n && carryInvariant([], r4.state) && roundDiv(dW4 * 150000000000n, 10n ** 13n) === 7500n, r4);
}
console.log("▸ الترحيل عشوائياً — خواصُّ لا أمثلة");
{
  let bad = null, n = 0;
  for (let i = 0; i < 3000; i++) {
    let st = EMPTY_CARRY;
    for (let j = int(0, 5); j > 0; j--) st = stockPost(st, rbig(9)).state;     // تاريخٌ عشوائيّ
    const x = rbig(13), a = stockPost(st, x), b = stockPost(a.state, -x);
    n++; if ((a.posted + b.posted !== 0n || b.state.carry_n !== st.carry_n) && !bad) bad = ["+x−x", st, x];
    const c = stockPost(st, -x), d = stockPost(c.state, x);
    n++; if ((c.posted + d.posted !== 0n || d.state.carry_n !== st.carry_n) && !bad) bad = ["−x+x", st, x];
  }
  check(`${n} زوج: أخذُ x ثم ردُّه (وبالعكس) يرجع الرصيدَ والمرحَّلَ كما كانا — التعديلُ بلا تغيير صفرٌ صافٍ`, bad === null, bad);
  bad = null; n = 0;
  for (let i = 0; i < 3000; i++) {
    let st = EMPTY_CARRY, sumX = 0n, sumP = 0n;
    for (let j = int(1, 30); j > 0; j--) {
      const x = rbig(int(1, 11)); sumX += x;
      const r = stockPost(st, x); sumP += r.posted; st = r.state; n++;
      if ((st.carry_n < -500000n || st.carry_n >= 500000n) && !bad) bad = ["bounds", st];
    }
    if ((sumP !== refFloor(sumX + 500000n, 1000000n) || st.carry_n !== sumX - sumP * 1000000n) && !bad) bad = ["cumulative", sumX, sumP, st];
  }
  check(`${n} ترحيلاً: المكتوبُ = floor(Σx·1000 + ½)/1000 من المجموع وحده، والمرحَّلُ داخل [−0.0005, 0.0005) دائماً`, bad === null, bad);
  // الثابتُ مع أحداث الدفتر وسندات التلف وطيّ التوأم بالدمج، وحفظُ الرصيد الكلّيّ.
  bad = null; n = 0;
  for (let i = 0; i < 800; i++) {
    const side = () => ({ st: EMPTY_CARRY, ev: [], stock: rbig(7), stock0: 0n, exact: 0n });
    const K = side(), T = side(); K.stock0 = K.stock; T.stock0 = T.stock;
    const step = (P) => {
      const x = rbig(int(1, 10)), mode = rnd() < 0.3 ? "external" : "ledger";
      const r = stockPost(P.st, x, mode);
      if (mode === "ledger") P.ev.push({ qty_n: x, posted_m: r.posted });
      P.st = r.state; P.stock -= r.posted; P.exact += x;
    };
    for (let j = int(0, 12); j > 0; j--) step(K);
    for (let j = int(0, 12); j > 0; j--) step(T);
    n += 2;
    if ((!carryInvariant(K.ev, K.st) || !carryInvariant(T.ev, T.st)) && !bad) bad = ["before", K.st, T.st];
    // الدمج: رصيدُ التوأم يُضاف للباقي، ومرحَّلُه يُطوى بـ'fold'، و ext يُجمع، وأحداثُه تُنقل.
    K.stock += T.stock;
    const f = stockPost(K.st, T.st.carry_n, "fold");
    K.stock -= f.posted;
    K.st = { carry_n: f.state.carry_n, ext_in_n: f.state.ext_in_n + T.st.ext_in_n, ext_out_m: f.state.ext_out_m + T.st.ext_out_m };
    K.ev.push(...T.ev);
    n++;
    if (!carryInvariant(K.ev, K.st) && !bad) bad = ["fold", carryResidual(K.ev, K.st)];
    for (let j = int(0, 6); j > 0; j--) step(K);
    n++;
    if (!carryInvariant(K.ev, K.st) && !bad) bad = ["after", carryResidual(K.ev, K.st)];
    // ما خرج من الرفّين = كلُّ المقادير الدقيقة ناقصَ المرحَّل الباقي.
    if ((K.stock0 + T.stock0 - K.stock) * 1000000n !== K.exact + T.exact - K.st.carry_n && !bad) bad = ["conservation", K, T];
  }
  check(`${n} فحصاً للثابت Σqty − Σposted + ext_in − ext_out = carry (دفتر + تلف + طيُّ توأم)، والرصيدُ الكلّيّ محفوظ`, bad === null, bad);
  check("  والثابتُ يمسك الخلل: حدثٌ ناقصٌ نانو واحداً يُرى", carryResidual([{ qty_n: 500000n, posted_m: 1n }], { carry_n: -500001n, ext_in_n: 0n, ext_out_m: 0n }) === 1n);
}

/* ── ٦) Σ V = Q·C ─────────────────────────────────────────────────────── */
console.log("▸ القيمة: لكميةٍ صحيحة Σ V = Q·C بالضبط، وللكسرية فرقٌ ≤ ٠٫٠٠٥ لكلّ مدخل");
{
  let bad = null, badF = null, n = 0;
  for (let i = 0; i < 2000; i++) {
    const ws = Array.from({ length: int(1, 6) }, () => {
      const unit = rnd() < 0.6 ? "sub" : "stock";
      const p = unit === "sub" ? SUB(int(0, 99999999) / 100, int(1, 50000)) : { purchase_price: int(0, 99999999) / 100, avg_cost: rnd() < 0.3 ? int(0, 999999999) / 1e6 : null };
      return specValues(p, BigInt(int(1, 1000000)), unit).per_value_c;
    });
    const Cw = ws.reduce((a, w) => a + w, 0n);
    const Q = BigInt(int(1, 999));
    n++;
    if (ws.reduce((a, w) => a + valueCents(Q * 1000n, w), 0n) !== Q * Cw && !bad) bad = [Q, ws];
    const Qm = BigInt(int(1, 999999));
    const sumV = ws.reduce((a, w) => a + valueCents(Qm, w), 0n);
    const diff = sumV * 1000n - Qm * Cw;
    if ((diff < 0n ? -diff : diff) > 500n * BigInt(ws.length) && !badF) badF = [Qm, ws, sumV];
  }
  check(`${n} سطراً بكمياتٍ صحيحة: Σ V = Q·C فلساً بفلس`, bad === null, bad);
  check(`  وبكمياتٍ كسرية: |Σ V − Q·C| ≤ ٠٫٠٠٥ × عدد المدخلات`, badF === null, badF);
}

/* ── ٧) المال بإسناد numeric(14,2) ─────────────────────────────────────── */
console.log("▸ المال: إسنادُ numeric(14,2) سطراً سطراً");
check("١٫٥ × ٨١٥٫٠١ = ١٢٢٢٫٥٢ (العائمُ ١٢٢٢٫٥١)، وسالبُه −١٢٢٢٫٥٢", addLineCents(0n, 1500n, 81501n) === 122252n && lineCents(1500n, 81501n) === 122252n
  && lineCents(-1500n, 81501n) === -122252n && Math.round(1.5 * 815.01 * 100) === 122251);
check("التقريبُ عند كلّ إسناد: سطران ٠٫٥ × ٠٫٠١ = ٠٫٠٢ (لا ٠٫٠١ الجمعِ الدقيق) — كما يفعل v_cost", addLineCents(addLineCents(0n, 500n, 1n), 500n, 1n) === 2n);
{
  let bad = null, n = 0;
  for (let i = 0; i < 20000; i++) {
    const S = rbig(12), q = rbig(9), p = rbig(9);
    n++;
    if ((addLineCents(S, q, p) !== refRound(S * 1000n + q * p, 1000n) || lineCents(q, p) !== refRound(q * p, 1000n)) && !bad) bad = [S, q, p];
  }
  check(`${n} حالة: addLineCents و lineCents = round(S + q·p, 2) و round(q·p, 2) بالمرجع`, bad === null, bad);
}

/* ── ٨) كلفةُ وحدة المخزون وسطرِ المادّة ───────────────────────────────── */
console.log("▸ stock_unit_cost و _product_line_cost (الملخّص §A3–A4)");
check("coalesce(avg_cost, purchase_price, 0): سعرٌ وحده، متوسّطٌ يغلب، وغيابُهما صفر",
  stockUnitCost({ purchase_price: 150000 }) === 150000000000n && stockUnitCost({ avg_cost: 1147.619048, purchase_price: 1300 }) === 1147619048n
  && stockUnitCost({ avg_cost: null, purchase_price: null }) === 0n && stockUnitCost({}) === 0n);
check("  ومتوسّطٌ 0 كلفةٌ لا «مجهول» (coalesce لا nullif)، والسالبُ صفر (greatest)", stockUnitCost({ avg_cost: 0, purchase_price: 500 }) === 0n && stockUnitCost({ purchase_price: -5 }) === 0n && stockUnitCost({ avg_cost: -1 }) === 0n);
check("  وكلُّ حقلٍ كما يخزّنه عمودُه: 0.1+0.2 ← 0.30، «1000.555» ← 1000.56، avg «1.0000005» ← 1.000001",
  stockUnitCost({ purchase_price: 0.1 + 0.2 }) === 300000n && stockUnitCost({ purchase_price: "1000.555" }) === 1000560000n && stockUnitCost({ avg_cost: "1.0000005" }) === 1000001n);
{
  const box = { purchase_price: 25000 }, syr = SUB(25000, 100);
  check("علبة: round(k, 2) — ٢ × ٢٥٠٠٠", productLineCostCents(box, 2000n, 2000n, 0n) === 2500000n);
  check("وحدةٌ صغيرة: _cons_round_div(k, upb, 2) — سرنجة ٢٥٠٫٠٠، ١٠٠٠÷٣ = ٣٣٣٫٣٣، ١٠٠٠٫٠٥÷٢ = ٥٠٠٫٠٣ (النصفُ للخارج)",
    productLineCostCents(syr, 3000n, 30n, 0n) === 25000n && productLineCostCents(SUB(1000, 3), 1000n, 333n, 0n) === 33333n && productLineCostCents(SUB(1000.05, 2), 1000n, 500n, 0n) === 50003n);
  check("مادّةٌ بوحدةٍ صغيرة تُباع بالعلبة (|stock_qty| = |qty|) ← كلفةُ العلبة، وبالسالب أيضاً", productLineCostCents(syr, 2000n, 2000n, 0n) === 2500000n
    && productLineCostCents(syr, -2000n, -2000n, 0n) === 2500000n && productLineCostCents(syr, -3000n, -30n, 0n) === 25000n);
  check("  والمقارنةُ بالقيمة المطلقة: qty −2 و stock_qty +2 علبةٌ لا وحدةٌ صغيرة", productLineCostCents(syr, -2000n, 2000n, 0n) === 2500000n);
  check("stock_qty غائبة ← علبة؛ units_per_box صفر ← علبة", productLineCostCents(syr, 3000n, null, 0n) === 2500000n && productLineCostCents(SUB(25000, 0), 3000n, 30n, 0n) === 2500000n);
  check("حقلٌ أو مادّةٌ ليست بالعيادة ← كلفةُ الجهاز كما هي", productLineCostCents({ ...box, farm_id: "f" }, 1000n, 1000n, 777n) === 777n && productLineCostCents(null, 1000n, 1000n, 777n) === 777n && productLineCostCents(undefined, 1000n, null, 5n) === 5n);
  check("V1b: ١١٧١٫٤٢٨٥٧٢ بالعلبة ← ١١٧١٫٤٣", productLineCostCents({ avg_cost: "1171.428572", purchase_price: 1250 }, 1000n, 1000n, 0n) === 117143n);
}
check("subUnitMilli / perDivMilli: 'stock' ← ١ دائماً، و'sub' ← units_per_box أو null", perDivMilli("stock", {}) === 1000n && perDivMilli("sub", SUB(1, 12.5)) === 12500n
  && perDivMilli("sub", { has_sub_unit: false, units_per_box: 10 }) === null && subUnitMilli({ has_sub_unit: true, units_per_box: null }) === null && subUnitMilli({ has_sub_unit: true, units_per_box: -1 }) === null);
check("entrySkip بترتيب §5.2: حقلٌ ثم حوضٌ ثم 'sub' بلا وحدةٍ صغيرة", entrySkip({ farm_id: "f", pooled: true }, "stock") === "farm_stock" && entrySkip({ pooled: true }, "stock") === "pooled"
  && entrySkip({ has_sub_unit: false }, "sub") === "no_sub_unit" && entrySkip({ has_sub_unit: false }, "stock") === null && entrySkip(SUB(1, 10), "sub") === null);
check("specValues لـ'sub' بلا وحدةٍ صغيرة ← null", specValues({ purchase_price: 5 }, 1000n, "sub") === null);

/* ── ٩) الوصفة: رموزُ رفض service_recipe_set ──────────────────────────── */
console.log("▸ validateRecipeLines — رموزُ الخادم بترتيبها");
{
  const U = (n) => `a2520000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  const PR = {
    [U(1)]: SUB(150000, 20000), [U(2)]: SUB(60000, 500), [U(3)]: SUB(25000, 100), [U(4)]: SUB(12500, 50), [U(5)]: SUB(24000, 12),
    [U(6)]: { purchase_price: 1000, pooled: true }, [U(7)]: { purchase_price: 1000, farm_id: "farm-1" },
    [U(9)]: { purchase_price: 1000, has_sub_unit: false, units_per_box: 10 }, [U(10)]: SUB(1000, 3000000),
    [U(11)]: { purchase_price: 1000, pooled: true, farm_id: "farm-1" },
  };
  const L = (id, qty, unit) => ({ product_id: U(id), qty, unit });
  const v = (lines, prods = PR) => validateRecipeLines(lines, prods);
  const cbc = v([L(1, 10, "sub"), L(2, 2, "sub"), L(3, 1, "sub"), L(4, 1, "sub")]);
  check("وصفة CBC سليمة: لا رفض، وأربعةُ سطورٍ بلا مشكلة", cbc.first === null && cbc.lines.join() === ",,,", cbc);
  check("وصفةٌ فارغة سليمة (حذفُ الوصفة)، والوحدةُ الغائبة 'stock'", v([]).first === null && v([{ product_id: U(5), qty: 1 }]).first === null);
  const bads = [L(1, 0, "sub"), L(1, -1, "sub"), L(1, "0.0001", "sub"), L(1, 1000001, "stock"), L(1, "abc", "sub"), L(1, null, "sub"), L(1, true, "sub"), L(1, 1, "box"),
    { product_id: "", qty: 1 }, { product_id: 5, qty: 1 }, null, "x", { qty: 1 }];
  check(`recipe_bad_line لكلّ شكلٍ غلط (${bads.length}): صفر، سالب، ٠٫٠٠٠١، فوق المليون، نصّ، null، وحدةٌ غريبة، معرّفٌ فارغ…`,
    bads.every((l) => v([l]).first?.code === "recipe_bad_line" && v([l]).first.index === 0));
  check("  والحدود: 0.001 و 1000000 بالضبط مقبولتان", v([L(9, "0.001", "stock")]).first === null && v([L(9, 1000000, "stock")]).first === null);
  const dup = v([L(1, 10, "sub"), L(1, 1, "stock")]);
  check("recipe_duplicate: نفسُ المادّة بأيّ وحدة، والسطرُ الأوّل سليم", dup.lines[0] === null && dup.lines[1] === "recipe_duplicate" && dup.first.index === 1, dup);
  check("  ونفسُ المعرّف بحروفٍ كبيرة تكرار (uuid لا يفرّق)", v([L(1, 10, "sub"), { product_id: U(1).toUpperCase(), qty: 1, unit: "sub" }]).lines[1] === "recipe_duplicate");
  check("recipe_product_missing: مادّةُ عيادةٍ أخرى أو محذوفة", v([L(99, 1, "stock")]).first?.code === "recipe_product_missing");
  check("recipe_pooled / recipe_farm / recipe_no_sub_unit", v([L(6, 1, "stock")]).first?.code === "recipe_pooled" && v([L(7, 1, "stock")]).first?.code === "recipe_farm"
    && v([L(9, 1, "sub")]).first?.code === "recipe_no_sub_unit" && v([L(9, 1, "stock")]).first === null);
  check("  وبترتيب §11.2: مادّةٌ بحوضٍ وحقلٍ معاً ← recipe_pooled (والبيعةُ تتخطّاها farm_stock بترتيب §5.2)",
    v([L(11, 1, "stock")]).first?.code === "recipe_pooled" && entrySkip(PR[U(11)], "stock") === "farm_stock");
  check("recipe_too_small: 0.001 من صندوق ٣٬٠٠٠٬٠٠٠ ← T(1) = 0؛ و 0.002 ← نانو واحد فمقبول", v([L(10, "0.001", "sub")]).first?.code === "recipe_too_small" && v([L(10, "0.002", "sub")]).first === null);
  check("الترتيب: أوّلُ سطرٍ فيه مشكلة، وكلُّ سطرٍ يعلَّم بمشكلته", v([L(6, 1, "stock"), L(1, 0, "sub")]).first?.code === "recipe_pooled"
    && v([L(1, 0, "sub"), L(6, 1, "stock")]).first?.code === "recipe_bad_line" && v([L(1, 0, "sub"), L(6, 1, "stock")]).lines[1] === "recipe_pooled");
  const many = Array.from({ length: 41 }, () => L(1, 1, "sub"));
  check("٤١ سطراً ← recipe_too_many قبل أيّ سطر (index null)", v(many).first?.code === "recipe_too_many" && v(many).first.index === null);
  const forty = new Map(Array.from({ length: 40 }, (_, i) => [`p${i}`, { purchase_price: i }]));
  check("وأربعون مادّةً مختلفة مقبولة، و Map تُقرأ كالكائن", validateRecipeLines([...forty.keys()].map((id) => ({ product_id: id, qty: 1 })), forty).first === null);
  check("معرّفٌ باسم خاصّيةٍ موروثة (constructor، __proto__) مادّةٌ غائبة لا انهيار", v([{ product_id: "constructor", qty: 1 }]).first?.code === "recipe_product_missing"
    && v([{ product_id: "__proto__", qty: 1 }]).first?.code === "recipe_product_missing");

  console.log("▸ تعديلُ الحالة بالبيعة (§5.2)");
  check("غائبٌ/null ← الوصفة؛ [] وقائمةٌ سليمة ← تعديلٌ مقبول", overrideRefusal(undefined) === null && overrideRefusal(null) === null && overrideRefusal([]) === null
    && overrideRefusal([L(1, 10, "sub"), L(4, 2, "sub")]) === null);
  check("consumables_bad: ٤١ مدخلاً، مادّةٌ مرّتين، كميةٌ غلط، وما ليس مصفوفة", overrideRefusal(Array.from({ length: 41 }, (_, i) => ({ product_id: `p${i}`, qty: 1 }))) === "consumables_bad"
    && overrideRefusal([L(1, 1), L(1, 2)]) === "consumables_bad" && overrideRefusal([L(1, "0.0001")]) === "consumables_bad" && overrideRefusal({}) === "consumables_bad" && overrideRefusal("x") === "consumables_bad");
  check("  وأربعون مدخلاً بالضبط مقبولة (الحدُّ ٤٠ كالخادم لا ٣٩)", overrideRefusal(Array.from({ length: 40 }, (_, i) => ({ product_id: `p${i}`, qty: 1 }))) === null);
  const R = [{ product_id: U(1), qty: "10.000", unit: "sub" }, { product_id: U(2), qty: "2.000", unit: "sub" }];
  check("تعديلٌ يساوي الوصفة كمجموعة: الترتيبُ ونصُّ الرقم لا يهمّان («10.000» = 10)", sameConsumables([L(2, 2, "sub"), L(1, 10, "sub")], R));
  check("  وكميةٌ أو وحدةٌ أو عددٌ مختلف ليس مساوياً؛ والوحدةُ الغائبة 'stock'", !sameConsumables([L(2, 2, "sub"), L(1, 11, "sub")], R) && !sameConsumables([L(2, 2, "stock"), L(1, 10, "sub")], R)
    && !sameConsumables([L(1, 10, "sub")], R) && sameConsumables([{ product_id: U(5), qty: 1 }], [{ product_id: U(5), qty: 1, unit: "stock" }])
    && !sameConsumables([L(1, 1, "sub"), L(1, 1, "sub")], [L(1, 1, "sub"), L(2, 1, "sub")]) && !sameConsumables([{ qty: 1 }], [{ qty: 1 }]));
}

/* ── ١٠) متوسّطُ الكلفة (0255) ─────────────────────────────────────────── */
console.log("▸ سلسلةُ المتوسّط بأرقام التصميم (§10)");
const D = (x) => toMicro(x);               // كلفة ← بالمليون
const Q3 = (x) => toMilli(x);              // كمية ← بالألف
{
  const { avgBase, avgReceive, receiveVarianceCents, avgAdjust, avgMerge, lineValueNano } = av;
  const a0 = avgBase({ avg_cost: null, purchase_price: 1000 });
  const a1 = avgReceive(Q3(10), a0, Q3(10), D(1200));
  check("١٠ بـ١٠٠٠ (متوسّطٌ فارغ) + شراء ١٠ بـ١٢٠٠ ← ١١٠٠", a0 === D(1000) && a1 === D(1100), a1);
  check("  صرفُ ٤ بالمتوسّط ← كلفة ٤٤٠٠٫٠٠ (سطرَ مادّةٍ أو مدخلَ وصفة)", lineCents(Q3(4), productLineCostCents({ avg_cost: 1100 }, Q3(4), Q3(4), 0n)) === 440000n
    && perValueCents(Q3(4), a1, 1000n) === 440000n);
  const a2 = avgReceive(Q3(16), a1, Q3(5), D(1300));
  check("  شراء ٥ بـ١٣٠٠ على ١٦ ← 24100/21 = ١١٤٧٫٦١٩٠٤٨", a2 === D("1147.619048"), a2);
  const a3 = avgAdjust(Q3(21), a2, lineValueNano(Q3(10), D(1200)), lineValueNano(Q3(10), D(1250)), Q3(21), D(1250));
  check("  تعديلُ فاتورة الـ١٢٠٠ إلى ١٢٥٠ ← 24600.000008/21 = ١١٧١٫٤٢٨٥٧٢", a3 === D("1171.428572"), a3);
  check("  صرفُ ١ بالعلبة ← ١١٧١٫٤٣ (والإرجاعُ لا يمسّ المتوسّط — لا دالّةَ متوسّطٍ بطريقه)", productLineCostCents({ avg_cost: fromScaled(a3, 6) }, 1000n, 1000n, 0n) === 117143n);
  const unk = avgBase({ avg_cost: null, purchase_price: 0 });
  check("أساسٌ مجهول: ١٠ بكلفة ٠ + شراء ١٠ بـ١٢٠٠ ← ١٢٠٠ (لا ٦٠٠)", unk === null && avgReceive(Q3(10), unk, Q3(10), D(1200)) === D(1200));
  check("أساسٌ سالب: −٢ بـ١٠٠٠ + شراء ١٠ بـ١٣٠٠ ← ١٣٠٠، والفرقُ ٦٠٠٫٠٠", avgReceive(Q3(-2), D(1000), Q3(10), D(1300)) === D(1300)
    && receiveVarianceCents(Q3(-2), D(1000), Q3(10), D(1300)) === 60000n);
  console.log("▸ قواعدُ الاستلام والتعديل والدمج");
  check("كميةٌ ≤ 0 أو كلفةٌ ≤ 0 ← المتوسّطُ كما هو (المجّانيُّ لا يخفّضه)", avgReceive(Q3(10), D(1100), 0n, D(1200)) === D(1100) && avgReceive(Q3(10), D(1100), Q3(-1), D(1200)) === D(1100)
    && avgReceive(Q3(10), D(1100), Q3(5), 0n) === D(1100) && avgReceive(Q3(10), null, Q3(5), 0n) === null);
  check("متوسّطٌ ≤ 0 مجهول ← كلفةُ الاستلام؛ ورصيدٌ صفر ← كلفتُه بلا فرق", avgReceive(Q3(10), 0n, Q3(5), D(1200)) === D(1200) && avgReceive(0n, D(1000), Q3(5), D(1200)) === D(1200)
    && receiveVarianceCents(0n, D(1000), Q3(5), D(1200)) === null);
  check("الفرق: لا يقع لأساسٍ مجهول، وسالبٌ حين تنزل الكلفة، ونصفُه بعيداً عن الصفر", receiveVarianceCents(Q3(-2), null, Q3(10), D(1300)) === null
    && receiveVarianceCents(Q3(-2), D(1300), Q3(10), D(1000)) === -60000n && receiveVarianceCents(-1n, D(1), Q3(1), D(6)) === 1n && receiveVarianceCents(-1n, D(6), Q3(1), D(1)) === -1n);
  // C-2 (0255 _avg_variance بـnullif): فرقٌ يُقرَّب صفراً لم يقع — فارغٌ لا ٠٫٠٠، كالرصيد غير السالب.
  check("  و−٢ بـ١٠٠٠ ثمّ ١٠ بـ١٠٠٠ ⇒ لا فرق (null لا ٠٫٠٠)، وفرقٌ دون نصف فلسٍ كذلك (−٠٫٠٠١ بـ١٠٠٠ ثمّ ١٠ بـ١٠٠١)",
    receiveVarianceCents(Q3(-2), D(1000), Q3(10), D(1000)) === null && receiveVarianceCents(Q3("-0.001"), D(1000), Q3(10), D(1001)) === null
    && receiveVarianceCents(Q3("-0.005"), D(1000), Q3(10), D(1001)) === 1n);
  check("التعديل: V ≤ 0 ← coalesce(c_last, a0)؛ a0 مجهول ← c_last؛ s1 ≤ 0 ← a0",
    avgAdjust(Q3(10), D(1000), lineValueNano(Q3(15), D(1000)), 0n, Q3(10), D(900)) === D(900) && avgAdjust(Q3(10), D(1000), lineValueNano(Q3(15), D(1000)), 0n, Q3(10), null) === D(1000)
    && avgAdjust(Q3(10), null, 0n, lineValueNano(Q3(10), D(1250)), Q3(10), D(1250)) === D(1250) && avgAdjust(Q3(10), null, 0n, 1n, Q3(10), null) === null
    && avgAdjust(Q3(10), D(1000), 0n, 0n, 0n, D(900)) === D(1000) && avgAdjust(Q3(10), D(1000), 0n, 0n, Q3(-1), D(900)) === D(1000));
  check("  ورصيدٌ أوّلُ سالب بإشارته (0255): (−٢·١٠٠٠ + ١٠·١٣٠٠)/٨ ← ١٣٧٥ لا ١٦٢٥", avgAdjust(Q3(-2), D(1000), 0n, lineValueNano(Q3(10), D(1300)), Q3(8), D(1300)) === D(1375));
  check("  وتصحيحُ كميةٍ ٢ ← ٢٠ بنفس الكلفة على رصيد −٥ يُبقي المتوسّطَ ١٠٠٠ (رأسُ 0255)",
    avgAdjust(Q3(-5), D(1000), lineValueNano(Q3(2), D(1000)), lineValueNano(Q3(20), D(1000)), Q3(13), D(1000)) === D(1000));
  check("الأساس: سعرُ شراءٍ سالب أو صفر مجهول (nullif(greatest(…, 0), 0))، والمتوسّطُ يسبق السعر",
    avgBase({ avg_cost: null, purchase_price: -5 }) === null && avgBase({ avg_cost: null, purchase_price: "0.00" }) === null
    && avgBase({ avg_cost: null, purchase_price: null }) === null && avgBase({ avg_cost: "1171.428572", purchase_price: 900 }) === D("1171.428572")
    && avgBase({ avg_cost: null, purchase_price: "12.5" }) === D("12.5"));
  check("الدمج: (١٠، ١٠٠٠) + (٣٠، ٢٠٠٠) ← ١٧٥٠؛ وتوأمٌ سالبُ الرصيد لا وزنَ له", avgMerge(Q3(10), D(1000), Q3(30), D(2000)) === D(1750) && avgMerge(Q3(10), D(1000), Q3(-5), D(2000)) === D(1000));
  check("  المعروفُ وحده: توأمٌ كلفتُه ٠ يُهمل، وباقٍ مجهول يأخذ كلفةَ التوأم؛ لا معروف ← a1", avgMerge(Q3(10), D(1000), Q3(5), 0n) === D(1000)
    && avgMerge(Q3(10), null, Q3(5), D(1200)) === D(1200) && avgMerge(Q3(10), null, Q3(5), null) === null && avgMerge(1n, 0n, 1n, null) === 0n);
  check("  معروفان بلا وزن ← a1 (لا قسمة على صفر)، والنصفُ بعيداً عن الصفر بست منازل", avgMerge(Q3(-1), D(1000), 0n, D(2000)) === D(1000) && avgMerge(1n, 1n, 1n, 2n) === 2n);

  // الشبكة التي سيقارنها avg-parity بالقاعدة (§10): القواعدُ مكتوبةً ثانيةً بالمرجع المستقلّ.
  const S = ["-5", "0", "0.5", "7", "1000.125"].map(Q3), A = [null, 0n, D("0.01"), D("1234.567891")], QQ = ["0.001", "1", "3", "1000000"].map(Q3), CC = ["0", "0.01", "250", "999999.99"].map(D);
  let bad = null, n = 0;
  for (const s of S) for (const a of A) for (const q of QQ) for (const c of CC) {
    const want = q <= 0n || c <= 0n ? a : a === null || a <= 0n ? c : s <= 0n ? c : refRound(s * a + q * c, s + q);
    const varRaw = q > 0n && c > 0n && a !== null && a > 0n && s < 0n ? refRound(-s * (c - a), 10n ** 7n) : null;
    const varWant = varRaw === 0n ? null : varRaw;          // فرقٌ يُقرَّب صفراً لم يقع (nullif بـ0255)
    n++; if ((avgReceive(s, a, q, c) !== want || receiveVarianceCents(s, a, q, c) !== varWant) && !bad) bad = ["receive", s, a, q, c];
  }
  for (const s1 of S) for (const a1 of A) for (const s2 of S) for (const a2 of A) {
    const k1 = a1 !== null && a1 > 0n, k2 = a2 !== null && a2 > 0n, w1 = s1 > 0n ? s1 : 0n, w2 = s2 > 0n ? s2 : 0n;
    const want = k1 && k2 ? (w1 + w2 === 0n ? a1 : refRound(w1 * a1 + w2 * a2, w1 + w2)) : k1 ? a1 : k2 ? a2 : a1;
    n++; if (avgMerge(s1, a1, s2, a2) !== want && !bad) bad = ["merge", s1, a1, s2, a2];
  }
  for (const s0 of S) for (const a0 of A) for (const q of QQ) for (const c of CC) for (const s1 of S) {
    const vo = lineValueNano(q, CC[1]), vn = lineValueNano(q, c), cl = c > 0n ? c : null;
    const V = a0 === null ? null : s0 * a0 - vo + vn;
    const want = s1 > 0n && V !== null && V > 0n ? refRound(V, s1) : s1 > 0n ? cl ?? a0 : a0;
    n++; if (avgAdjust(s0, a0, vo, vn, s1, cl) !== want && !bad) bad = ["adjust", s0, a0, q, c, s1];
  }
  check(`شبكةُ §10 (رصيد × متوسّط × كمية × كلفة): ${n} حالة تطابق القواعدَ مكتوبةً بالمرجع`, bad === null, bad);
  bad = null; n = 0;
  for (let i = 0; i < 5000; i++) {
    const s = rbig(10, false), a = rbig(12, false), q = rbig(10, false), c = rbig(12, false);
    const r = avgReceive(s, a, q, c), N = s * a + q * c, d = s + q;
    const lo = a < c ? a : c, hi = a < c ? c : a, e = r * d - N;
    n++; if ((r < lo || r > hi || 2n * (e < 0n ? -e : e) > d) && !bad) bad = [s, a, q, c, r];
  }
  check(`${n} استلاماً عشوائياً: المتوسّطُ بين الكلفتين وهو أقربُ قسمةٍ بست منازل`, bad === null, bad);
}

/* ── ١١) نصُّ القاعدة: «الكمية غلط» تقول حدّيها ───────────────────────────
 * القاعدةُ هنا (parseRecipeLine: أكبر من صفر، لحد مليون، وثلاث مراتب عشرية أقصى)، ونصُّها بالقاموس. «(3 مراتب
 * بالأكثر)» بلا «عشرية» تُقرأ «ثلاثة أرقام» (والقاعدةُ تقبل ١٠٠٠ ومليوناً)، ولا تذكر سقفَ المليون — فكميةٌ ١٠٠٠٠٠١
 * أو باركودٌ هبط بحقل الكمية يُقال له «اكتب أكبر من صفر» عمّا ليس سببَ رفضه. فكلُّ شاشةٍ ترفض بهذه القاعدة —
 * ورقةُ الحالة (data-cons-badqty) ومحرّرُ الوصفة (data-rcp-badqty) — تقول الحدّين بالعربية والإنكليزية (الأساس)،
 * وافتراضيُّها بالشِفرة هو نصُّ القاموس نفسُه: هو ما يُعرض حتى يصل النطاقُ البارد. والمفتاحُ يُقرأ من الشاشة
 * نفسها، فتبديلُه بلا نصٍّ صحيح يُمسك — وكلُّ موضعٍ للرسالة يُفحص لا أوّلُه وحده. */
console.log("▸ رسالةُ «الكمية غلط» بكلّ شاشةٍ ترفض بالقاعدة تقول حدّيها: مليون ومراتب عشرية");
{
  const ok = (q) => m.parseRecipeLine({ product_id: "p", qty: q }) !== null;
  check("القاعدة: ٠٫٠٠١ و٩٩٩٫٩٩٩ و١٠٠٠ ومليون مقبولة، و٠ و٠٫٠٠٠٥ و١٠٠٠٠٠٠٫٠٠١ مرفوضة — سقفُها مليون ومراتبُها العشرية ثلاث",
    m.MAX_LINE_QTY_M === 1_000_000_000n && ok("0.001") && ok("999.999") && ok(1000) && ok(1000000) && !ok(0) && !ok("0.0005") && !ok("1000000.001"));
  const dict = { ar: JSON.parse(readFileSync("src/i18n/ar.json", "utf8")), en: JSON.parse(readFileSync("src/i18n/en.json", "utf8")) };
  const at = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
  const str = (lit) => { try { return lit ? JSON.parse(lit) : null; } catch { return null; } };
  for (const [file, attr] of [["src/components/retail/ConsumablesSheet.tsx", "data-cons-badqty"], ["src/components/settings/RecipeEditor.tsx", "data-rcp-badqty"]]) {
    const src = readFileSync(file, "utf8");
    const sites = [];
    for (let i = src.indexOf(attr); i >= 0; i = src.indexOf(attr, i + attr.length)) {
      const end = src.indexOf("</p>", i);
      const seg = src.slice(i, end < 0 ? undefined : end);           // من الوسم إلى نهاية عنصره
      const key = /\bt\(\s*"([^"]+)"/.exec(seg)?.[1] ?? null;
      const dv = str(/\bt\(\s*"[^"]+"\s*,\s*("(?:[^"\\]|\\.)*")/.exec(seg)?.[1] ?? /defaultValue:\s*("(?:[^"\\]|\\.)*")/.exec(seg)?.[1]);
      sites.push({ key, ar: key && at(dict.ar, key), en: key && at(dict.en, key), dv });
    }
    const good = (s) => typeof s.ar === "string" && /مليون/.test(s.ar) && /عشري/.test(s.ar)
      && typeof s.en === "string" && /\bmillion\b/i.test(s.en) && /\bdecimals?\b/i.test(s.en) && s.dv === s.ar;
    check(`${file.split("/").pop()} [${attr}] ×${sites.length}: العربيةُ «مليون» و«عشرية»، والإنكليزيةُ million و decimals، وافتراضيُّ الشِفرة = القاموس`,
      sites.length > 0 && sites.every(good), sites.filter((s) => !good(s)));
  }
}

console.log(`\n${fail ? "✗" : "✓"} حسابُ المستهلكات والمتوسّط: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
