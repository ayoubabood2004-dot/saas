/* ============================================================================
 * فحصُ تطابق البيع: `retail_checkout` بالقاعدة مقابل `createInvoiceLocal`
 * بالواجهة، على **نفس** العربات. فلسٌ واحد يفرق = فشل.
 *
 *   node scripts/checkout-parity.mjs <dir>
 * ينتظر بالمجلّد: expected.json (الواجهة) و actual.json (القاعدة).
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const exp = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8"));
const actP = path.join(dir, "actual.json");
if (!fs.existsSync(actP)) { console.error("   ✗ checkout-parity: ما وصلت مخرجاتُ القاعدة (actual.json)"); process.exit(1); }
const act = JSON.parse(fs.readFileSync(actP, "utf8") || "[]");

let fails = 0, passes = 0;
const byI = new Map(act.map((r) => [Number(r.i), r]));

/* المالُ `numeric(…,2)` على الطرفين — فالمقارنةُ **تامّة** لا تقريبية.
 * تسامحٌ هنا يخفي بالضبط العطبَ الذي جئنا له (نصفُ دينار). */
const MONEY = ["subtotal", "discount", "total", "amount_paid", "cost_total", "profit"];
let worst = 0, worstWhy = "";
for (const e of exp) {
  const a = byI.get(e.i);
  if (!a) { fails++; console.error(`   ✗ [${e.i}] ${e.why} — ما رجعت القاعدةُ صفّاً`); continue; }
  const bad = [];
  for (const k of MONEY) {
    const d = Math.abs(Number(a[k]) - Number(e[k]));
    if (d > worst) { worst = d; worstWhy = `${e.why} · ${k}`; }
    if (Number(a[k]) !== Number(e[k])) bad.push(`${k}: قاعدة ${a[k]} ≠ واجهة ${e[k]}`);
  }
  if (Number(a.item_count) !== Number(e.item_count)) bad.push(`item_count: قاعدة ${a.item_count} ≠ واجهة ${e.item_count}`);
  if ((a.discount_type ?? null) !== (e.discount_type ?? null)) bad.push(`discount_type: قاعدة ${a.discount_type ?? "null"} ≠ واجهة ${e.discount_type ?? "null"}`);
  if (bad.length) { fails++; console.error(`   ✗ [${e.i}] ${e.why}\n       ${bad.join("\n       ")}`); }
  else passes++;
}
if (exp.length === 0 || act.length === 0) {
  console.error("   ✗ checkout-parity: قالبٌ فارغ — الفحصُ يقيس لا شيء");
  process.exit(1);
}
console.log(fails
  ? `   ✗ checkout-parity: ${passes} عربةً تطابقت، ${fails} انحرفت (أكبرُ فرق ${worst} — ${worstWhy})`
  : `   ✓ checkout-parity: ${passes} عربةً تطابق النصفان فيها فلساً بفلس`);
process.exit(fails ? 1 : 0);
