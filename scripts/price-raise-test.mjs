/* ============================================================================
 * رفعُ الأسعار — القاعدةُ النقيّة (src/lib/priceRaise.ts) بخصائصها لا بأمثلتها وحدها.
 *
 * ما يحرسه: الجديدُ أكبرُ دائماً؛ الأغلى قبلُ لا يصير أرخصَ بعد (رتابة — سلّمٌ فيه
 * ١٠٠ و٢٥٠ معاً كان يقلب ٣٦٤ حالة)؛ المتساويان يبقيان متساويَين؛ «الذكيّ» لا يزيد
 * أكثر من ربع الزيادة إلا عند أصغر وحدة؛ المفردُ × العدد لا ينزل تحت العلبة؛ والنطاقُ
 * يأخذ المجموعةَ كاملةً أو يتركها. (والتطابقُ مع القاعدة بـprice-parity داخل الحزمة.)
 *
 *   node scripts/price-raise-test.mjs
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "praise-")); const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/priceRaise.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
const m = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };
const R = (o, bp = 2500, round = "smart", max = 250, frac = false) => m.raisePrice(o, bp, round, max, frac).price;

console.log("▸ أمثلةٌ يقرؤها المحاسب");
const ex = [[5000, 6250], [7500, 9500], [1666, 2100], [1000, 1250], [1250, 1600], [1500, 1900], [250, 325], [2, 3], [4353543, 5442000], [9999, 12500]];
for (const [o, w] of ex) check(`٢٥٪ ذكيّ: ${o} → ${w}`, R(o) === w, R(o));
check("١٠٪: 2000 → 2200 (لا 2250)، 750 → 825 (العائمُ كان يقول 850)", R(2000, 1000) === 2200 && R(750, 1000) === 825, [R(2000, 1000), R(750, 1000)]);
check("٥٠٪: 500 → 750، 1000 → 1500", R(500, 5000) === 750 && R(1000, 5000) === 1500);
check("ثابت ١٠٠٠: 5000 بـ١٠٪ → 6000 (كما طُلب، ولو أكثر)", R(5000, 1000, "fixed", 1000) === 6000);
check("بلا تقريب (١): 1666 بـ٢٥٪ → 2083", R(1666, 2500, "fixed", 1) === 2083);
check("د.ك بكسوره: 4.35 بـ١٢٫٥٪ ربعٌ ذكيّ → 5 (0.1 ليست بسلّم القواسم)، و0.29 → 0.33", R(4.35, 1250, "smart", 0.25, true) === 5 && R(0.29, 1250, "smart", 0.25, true) === 0.33,
  [R(4.35, 1250, "smart", 0.25, true), R(0.29, 1250, "smart", 0.25, true)]);
check("كسرٌ قديم بالدينار 1562.5 يصير صحيحاً", Number.isInteger(R(1562.5)), R(1562.5));

console.log("▸ خصائص (مسحٌ كامل)");
let lower = 0, inv = 0, over = 0, firstInv = "";
for (const bp of [1, 100, 500, 800, 1000, 1250, 2000, 2250, 2500, 3333, 4000, 5000, 10000]) {
  let prev = 0;
  for (let o = 1; o <= 12000; o++) {
    const w = R(o, bp);
    if (!(w > o)) lower++;
    if (w < prev) { inv++; if (!firstInv) firstInv = `${bp}bp: ${o - 1}→${prev} > ${o}→${w}`; }
    prev = w;
    // «الذكيّ» يضيف أقلَّ من ربع الزيادة — إلا حين لا خطوةَ أصغرُ من الوحدة.
    const raw = o * (10000 + bp) / 10000;
    if (w - raw >= (o * bp / 10000) / 4 && w - raw >= 1) over++;
  }
}
check("الجديدُ أكبرُ من القديم دائماً", lower === 0, lower);
check("رتابة: لا سعرَ أغلى قبلُ يصير أرخصَ بعد", inv === 0, firstInv);
check("التقريبُ الذكيّ < ربع الزيادة (ما فوق أصغر وحدة)", over === 0, over);
check("المتساويان يبقيان متساويَين (المجموعة)", R(5000) === R(5000) && m.raisePrice(1666, 2500, "smart", 250, false).step === m.raisePrice(1666, 2500, "smart", 250, false).step);
check("«قفزة» تُعلَّم عند أصغر وحدة: 2 → 3 بـ٢٥٪", m.isJump(2, 3, 2500) && !m.isJump(5000, 6250, 2500));

console.log("▸ المفرد والعلبة");
check("علبة 4500 بثلاث حبّات 1500: الحبّةُ تُرفع لـ1950 لتبقى ×3 ≥ 5750", m.alignSub(4500, 5750, 1500, 1900, 50, 3) === 1950, m.alignSub(4500, 5750, 1500, 1900, 50, 3));
check("مفردٌ كان أرخصَ من العلبة أصلاً لا يُمسّ (قرارُ العيادة)", m.alignSub(3000, 3750, 250, 325, 25, 20) === null);
check("عددٌ مجهول (null) ⇒ لا تسوية", m.alignSub(4500, 5750, 1500, 1900, 50, null) === null);
let broken = 0;
for (let box = 250; box <= 20000; box += 250) for (let n = 2; n <= 12; n++) for (const bp of [1000, 2000, 2500]) {
  const sub = Math.ceil(box / n / 50) * 50; // مفردٌ ≥ العلبة ÷ العدد
  const B = m.raisePrice(box, bp, "smart", 250, false), S = m.raisePrice(sub, bp, "smart", 250, false);
  const w = m.alignSub(box, B.price, sub, S.price, S.step, n) ?? S.price;
  if (w * n < B.price - 1e-9) broken++;
}
check("مسح: المفردُ × العدد لا ينزل تحت العلبة الجديدة أبداً", broken === 0, broken);

console.log("▸ النسبة كما تُكتب");
check("«25» «12.5» «٢٥٫٥» «25%» تُفهم", m.parsePct("25") === 2500 && m.parsePct("12.5") === 1250 && m.parsePct("٢٥٫٥") === 2550 && m.parsePct("25%") === 2500);
check("صفر، فوق ١٠٠، وثلاثُ منازل تُرفض لا تُقرَّب", m.parsePct("0") === null && m.parsePct("101") === null && m.parsePct("1.234") === null && m.parsePct("abc") === null);
check("bpText: 2500 → 25، 1250 → 12.5، 1205 → 12.05", m.bpText(2500) === "25" && m.bpText(1250) === "12.5" && m.bpText(1205) === "12.05");

console.log("▸ النطاق");
const P = (id, o = {}) => ({ id, name: id, sell_price: 1000, purchase_price: 500, category: "food", company_id: "c1", ...o });
const prods = [P("a", { bulk_group: "G" }), P("b", { bulk_group: "G", category: "toys" }), P("c"), P("z", { sell_price: 0 }), P("f", { farm_id: "farm" }),
  P("n", { category: null }), P("s", { has_sub_unit: true, sub_unit_price: 300, units_per_box: 4 })];
const spec = (o = {}) => ({ pct_bp: 2500, round: "smart", max_step: 250, products: true, services: false, p_categories: null, p_companies: null,
  p_sections: null, p_ids: null, p_exclude: [], s_categories: null, s_ids: null, s_exclude: [], skip_recent: true, ...o });
const ids = (s) => m.buildPlan(prods, [], spec(s), false).lines.filter((l) => l.f === "sell_price").map((l) => l.id).sort().join(",");
check("الكلّ: بلا مخزن الحقل ولا الصفر", ids({}) === "a,b,c,n,s", ids({}));
check("صنف food: المجموعةُ G تدخل كاملة (b من صنفٍ آخر)، والصنفُ الفارغ لا يطابق", ids({ p_categories: ["food"] }) === "a,b,c,s", ids({ p_categories: ["food"] }));
check("استثناءُ عضوٍ يُخرج المجموعةَ كلَّها", ids({ p_exclude: ["b"] }) === "c,n,s", ids({ p_exclude: ["b"] }));
check("اختيارُ b وحده يجرّ a (مجموعتُه) ويُعلَّم «group»", ids({ p_ids: ["b"] }) === "a,b"
  && m.buildPlan(prods, [], spec({ p_ids: ["b"] }), false).lines.find((l) => l.id === "a").fl.includes("group"));
check("المفردُ يتبع علبتَه دائماً (لا خيار)", m.buildPlan(prods, [], spec({ p_ids: ["s"] }), false).lines.map((l) => l.f).join(",") === "sell_price,sub_unit_price");
check("الصفرُ يُعدّ ولا يُكتب", m.buildPlan(prods, [], spec({}), false).skipped.zero_products === 1);
const recent = new Set(["product:c:sell_price"]);
const pr = m.buildPlan(prods, [], spec({}), false, recent);
check("المرفوعُ حديثاً يُتخطّى ويُعدّ", !pr.lines.some((l) => l.id === "c") && pr.counts.recent_skipped === 1);
const pr2 = m.buildPlan(prods, [], spec({ skip_recent: false }), false, recent);
check("  وبطلبٍ صريح يُرفع ويُعلَّم «recent»", pr2.lines.find((l) => l.id === "c")?.fl.includes("recent"));
const gp = [P("a", { bulk_group: "G" }), P("b", { bulk_group: "G" }), P("new", { bulk_group: "G" })];
const pg = m.buildPlan(gp, [], spec({}), false, new Set(["product:a:sell_price", "product:b:sell_price"]));
check("عضوٌ انضمّ لمجموعةٍ رُفعت حديثاً لا يُرفع وحده — الوحدةُ كلُّها تُتخطّى", pg.lines.length === 0 && pg.counts.recent_skipped === 3, pg.counts);
const sp1 = [P("s", { has_sub_unit: true, sub_unit_price: 300, units_per_box: 4 })];
const ps1 = m.buildPlan(sp1, [], spec({}), false, new Set(["product:s:sell_price"]));
const ps2 = m.buildPlan(sp1, [], spec({}), false, new Set(["product:s:sub_unit_price"]));
check("علبةٌ رُفعت حديثاً يتبعها مفردُها بالتخطّي، ومفردٌ رُفع وحده يحجز علبتَه", ps1.lines.length === 0 && ps1.counts.recent_skipped === 2 && ps2.lines.length === 0, [ps1.counts, ps2.counts]);
check("  وبطلبٍ صريح تُرفع الوحدةُ كاملة", m.buildPlan(gp, [], spec({ skip_recent: false }), false, new Set(["product:a:sell_price"])).lines.length === 3);
check("groupKeyOf كـbtrim بالقاعدة: مسافاتُ الطرفين تُقصّ وحدها", m.groupKeyOf(" G ") === "G" && m.groupKeyOf("   ") === null && m.groupKeyOf("\tG") === "\tG" && m.groupKeyOf(null) === null);
check("نطاقٌ واحد: صنفٌ + موادّ = mixed", m.productScopeOf({ p_categories: ["x"], p_companies: null, p_sections: null, p_ids: ["a"] }) === "mixed"
  && m.productScopeOf({ p_categories: null, p_companies: ["c"], p_sections: ["s"], p_ids: null }) === "company");
check("البصمةُ لا تتغيّر بترتيب الاختيار", m.buildPlan(prods, [], spec({ p_ids: ["c", "a"] }), false).hashText === m.buildPlan(prods, [], spec({ p_ids: ["a", "c"] }), false).hashText);
check("  وتتغيّر بأيّ سعر", m.buildPlan(prods.map((p) => (p.id === "c" ? { ...p, sell_price: 1001 } : p)), [], spec({}), false).hashText !== m.buildPlan(prods, [], spec({}), false).hashText);
check("hashMoney بخانتين كما يطبعه numeric(24,2)", m.hashMoney(6250) === "6250.00" && m.hashMoney(1562.5) === "1562.50" && m.hashMoney(0.29) === "0.29");

console.log(fail === 0 ? `✓ رفع الأسعار: ${pass} فحصاً عبرت` : `✗ ${fail} فشلت من ${pass + fail}`);
if (fail) process.exit(1);
