/* ============================================================================
 * فحصُ تطابق رفع الأسعار: القاعدةُ (0226) مقابل priceRaise.ts — فلساً بفلس.
 *
 *   node scripts/price-parity.mjs <dir>
 * ينتظر: round.json + round-actual.json، و plan.json + plan-actual.jsonl.
 * المقارنةُ **تامّة**: تسامحٌ بفلسٍ يخفي بالضبط ما جئنا له.
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
let pass = 0, fail = 0;
const bad = (msg) => { fail++; if (fail <= 25) console.error(`   ✗ ${msg}`); };

/* ── الحساب ── */
const exp = JSON.parse(read("round.json"));
const act = JSON.parse(read("round-actual.json").trim() || "{}");
if (!act.round?.length || act.round.length !== exp.round.length) bad(`round: ${act.round?.length ?? 0} صفّاً من القاعدة والمتوقّع ${exp.round.length}`);
const byI = new Map((act.round ?? []).map((r) => [r[0], r]));
for (const e of exp.round) {
  const a = byI.get(e.i);
  if (!a) { bad(`round[${e.i}] ما رجع`); continue; }
  if (Number(a[1]) !== e.step || Number(a[2]) !== e.w) bad(`round[${e.i}] ${e.o} بـ${e.bp}bp ${e.r}/${e.m}${e.f ? " frac" : ""}: قاعدة ${a[2]} (خطوة ${a[1]}) ≠ واجهة ${e.w} (خطوة ${e.step})`);
  else pass++;
}
const alI = new Map((act.align ?? []).map((r) => [r[0], r[1]]));
for (const e of exp.align) {
  const a = alI.has(e.i) ? alI.get(e.i) : undefined;
  const av = a == null ? null : Number(a);
  if (a === undefined) bad(`align[${e.i}] ما رجع`);
  else if (av !== e.want) bad(`align[${e.i}] علبة ${e.box}→${e.nb} مفرد ${e.sub}→${e.ns}×${e.n}: قاعدة ${a} ≠ واجهة ${e.want}`);
  else pass++;
}
for (const { c, f } of exp.fracCodes) {
  if (act.frac?.[c] !== f) bad(`_price_frac(${c}) = ${act.frac?.[c]} والواجهة ${f}`);
  else pass++;
}

/* ── المعاينة كاملة ── */
const plans = JSON.parse(read("plan.json"));
const docs = new Map(read("plan-actual.jsonl").split("\n").filter((l) => l.trim()).map((l) => { const j = JSON.parse(l); return [j.i, j.doc]; }));
/** مقارنةٌ بلا ترتيب مفاتيح: jsonb يرتّبها بطولها لا كما كُتبت. */
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
for (const e of plans) {
  const d = docs.get(e.i);
  if (!d) { bad(`plan[${e.i}] ${e.why}: ما رجعت معاينة`); continue; }
  const errs = [];
  if (d.plan_hash !== e.plan_hash) errs.push(`البصمة ${d.plan_hash} ≠ ${e.plan_hash}`);
  for (const k of Object.keys(e.counts)) if (Number(d.counts?.[k]) !== e.counts[k]) errs.push(`counts.${k}: ${d.counts?.[k]} ≠ ${e.counts[k]}`);
  for (const k of Object.keys(e.skipped)) if (Number(d.skipped?.[k]) !== e.skipped[k]) errs.push(`skipped.${k}: ${d.skipped?.[k]} ≠ ${e.skipped[k]}`);
  if (!same(d.missing, e.missing)) errs.push(`missing: ${JSON.stringify(d.missing)} ≠ ${JSON.stringify(e.missing)}`);
  const al = d.lines ?? [];
  if (al.length !== e.lines.length) errs.push(`عددُ السطور ${al.length} ≠ ${e.lines.length}`);
  e.lines.forEach((x, j) => {
    const y = al[j];
    if (!y) return;
    const norm = (l) => ({ k: l.k, id: l.id, f: l.f, n: l.n, o: Number(l.o), w: Number(l.w), s: Number(l.s), g: l.g ?? null, fl: l.fl });
    if (!same(norm(y), norm(x))) errs.push(`سطر ${j}: قاعدة ${JSON.stringify(norm(y))} ≠ واجهة ${JSON.stringify(norm(x))}`);
  });
  if (errs.length) bad(`plan[${e.i}] ${e.why}\n       ${errs.slice(0, 6).join("\n       ")}`);
  else pass++;
}
if (exp.round.length === 0 || plans.length === 0) { console.error("   ✗ price-parity: قالبٌ فارغ — الفحصُ يقيس لا شيء"); process.exit(1); }
console.log(fail ? `   ✗ price-parity: ${pass} تطابقت، ${fail} انحرفت` : `   ✓ price-parity: ${pass} حالة (حساب + مفرد/علبة + عملات + ${plans.length} معاينة كاملة) تطابق النصفان فيها فلساً بفلس`);
process.exit(fail ? 1 : 0);
