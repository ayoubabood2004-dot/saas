/* ============================================================================
 * فحصُ تطابق حساب الجرعة (0269): `_dose_plan` بالقاعدة مقابل dosePlan (src/lib/doseBilling.ts، المصدرُ نفسُه محزوماً) — حالةً بحالة.
 *
 *   node scripts/dose-parity.mjs gen <dir>     ⇒ <dir>/plan.sql و<dir>/expected.json
 *   node scripts/dose-parity.mjs check <dir>   ⇐ <dir>/actual.txt (ناتجُ psql -tA -f plan.sql)
 * شبكةُ الحوافّ كلّها (سعرٌ مكتوب/فارغ/صفر، كمّيةٌ كسريّة، علبة/صغرى/بلا، سعرُ صغرى مكتوب أو مشتقّ، عددٌ صفرٌ أو كسريّ) + عيّنةٌ ببذرةٍ
 * ثابتة. المقارنةُ تامّة: دينارٌ واحدٌ فرقاً بالسعر أو منزلةٌ بالمخصوم عيب. وتُجرَّب على مرآتين مغلوطتين أوّلاً — فحصٌ لا يُمسك
 * الخطأَ المزروع ليس فحصاً.
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mode, dir] = process.argv.slice(2);
if (!mode || !dir) { console.error("usage: dose-parity.mjs gen|check <dir>"); process.exit(2); }

async function loadPlan() {
  const out = path.join(dir, "doseBilling.mjs");
  await esbuild.build({ entryPoints: [path.join(ROOT, "src/lib/doseBilling.ts")], bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "silent" });
  return (await import(pathToFileURL(out).href)).dosePlan;
}

function cases() {
  const P = [null, 0, 5000, 1234.5], Q = [null, 0.5, 1, 2, 3, 7.25], U = [null, "box", "sub"];
  const S = [0, 1000, 20000, 33333, 1250.75], SB = [null, 750, 333.33], UB = [null, 0, 3, 10, 7, 12.5];
  const out = [];
  for (const p of P) for (const q of Q) for (const u of U) for (const s of S) for (const sb of SB) for (const ub of UB) out.push([p, q, u, s, sb, ub]);
  let seed = 269;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 2000; i++) {
    out.push([rnd() < 0.3 ? Math.round(rnd() * 100000) / 4 : null, rnd() < 0.2 ? null : Math.round(rnd() * 4000) / 1000 || 1,
      rnd() < 0.5 ? "sub" : "box", Math.round(rnd() * 5000000) / 100, rnd() < 0.5 ? null : Math.round(rnd() * 100000) / 100, Math.round(rnd() * 600) / 10 || null]);
  }
  return out;
}
const lit = (v, ty) => (v == null ? `null::${ty}` : ty === "text" ? `'${v}'::text` : `${v}::${ty}`);

if (mode === "gen") {
  fs.mkdirSync(dir, { recursive: true });
  const dosePlan = await loadPlan();
  const cs = cases();
  const rows = cs.map((c, i) => `(${i},${lit(c[0], "numeric")},${lit(c[1], "numeric")},${lit(c[2], "text")},${lit(c[3], "numeric")},${lit(c[4], "numeric")},${lit(c[5], "numeric")})`);
  fs.writeFileSync(path.join(dir, "plan.sql"),
    `select v.i || '|' || coalesce(d.price::text, 'null') || '|' || coalesce(d.stock_qty::text, 'null')\n  from (values ${rows.join(",\n")}) v(i, p, q, u, s, sb, ub),\n  lateral public._dose_plan(v.p, v.q, v.u, v.s, v.sb, v.ub) d order by v.i;\n`);
  fs.writeFileSync(path.join(dir, "expected.json"), JSON.stringify({ cases: cs, plan: cs.map((c) => dosePlan(...c)) }));
  console.log(`dose-parity: ${cs.length} حالةً`);
} else {
  const { cases: cs, plan } = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8"));
  const act = new Map(fs.readFileSync(path.join(dir, "actual.txt"), "utf8").trim().split("\n").filter(Boolean).map((l) => { const [i, p, s] = l.split("|"); return [Number(i), { p, s }]; }));
  const num = (x) => (x === "null" ? null : Number(x));
  const compare = (mirror) => {
    let bad = 0; const shown = [];
    cs.forEach((c, i) => {
      const a = act.get(i); const e = mirror(c, i);
      if (!a || num(a.p) !== e.price || num(a.s) !== e.stockQty) { bad++; if (shown.length < 8) shown.push(`#${i} ${JSON.stringify(c)}: قاعدة ${a?.p}|${a?.s} ≠ واجهة ${e.price}|${e.stockQty}`); }
    });
    return { bad, shown };
  };
  const dosePlan = await loadPlan();
  // مرآتان مغلوطتان: الكمّيةُ الغائبةُ صفرٌ لا واحد، والصغرى من سعر العلبة ولو كُتب سعرُها.
  const m1 = compare((c) => dosePlan(c[0], c[1] ?? 0, c[2], c[3], c[4], c[5]));
  const m2 = compare((c) => dosePlan(c[0], c[1], c[2], c[3], null, c[5]));
  if (!m1.bad || !m2.bad) { console.error(`✗ dose-parity: مرآةٌ مغلوطة مرّت (${m1.bad}، ${m2.bad}) — الفحصُ أعمى`); process.exit(1); }
  const r = compare((_c, i) => plan[i]);
  if (r.bad || act.size !== cs.length) { console.error(`✗ dose-parity: ${r.bad} حالةً تختلف من ${cs.length} (رجع ${act.size})\n   ${r.shown.join("\n   ")}`); process.exit(1); }
  console.log(`   ✓ dose-parity: ${cs.length} حالةً تطابقت فلساً بفلس، ومرآتان مغلوطتان أُمسكتا (${m1.bad} و${m2.bad})`);
}
