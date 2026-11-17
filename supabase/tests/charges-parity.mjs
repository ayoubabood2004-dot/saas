/* ============================================================================
 * تطابقُ الأجور الإضافية (0276): `_purchase_charges` بالقاعدة مقابل `normCharges` (src/lib/purchaseCharges.ts) حالةً بحالة —
 * القائمةُ المطبَّعة (الاسم، المبلغ بالدينار، الدولار، لمن) ومجاميعُها، ورمزُ الرفض وسطرُه. المرآةُ تحكم ما تعرضه الشاشةُ قبل الحفظ
 * وما يكتبه التجريبيّ؛ فرقُ فلسٍ أو اسمٌ يُقرأ بغير ما يحفظه الخادم كذبةٌ صغيرة.
 *
 *   node supabase/tests/charges-parity.mjs gen <dir>     ⇒ cases.json + run.sql
 *   (psql -tA -f run.sql > actual.txt)
 *   node supabase/tests/charges-parity.mjs check <dir>
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [mode, dir] = process.argv.slice(2);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
if (!dir || (mode !== "gen" && mode !== "check")) { console.error("usage: charges-parity.mjs gen|check <dir>"); process.exit(2); }

if (mode === "gen") gen(); else await check();

function gen() {
  fs.mkdirSync(dir, { recursive: true });
  let st = 20261117 >>> 0;
  const R = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(R() * a.length)];
  const LABELS = ["أجور توصيل", "  أجور   توصيل ", "\tنقل\n", "", "   ", "x", "a".repeat(70), "ب".repeat(59) + " ج", "أجور شحن", "x  y", 5, null, true];
  const AMOUNTS = [3000, "3000", "1000.005", "0.004", "0.005", "-0.005", 0, -1, "abc", "", null, "1e3", " 12 ", 999999999999.99, 1e12, "12.345", 0.1 + 0.2, true];
  const USDS = [undefined, 5, "0.335", 0, -1, "x", null, 0.005];
  const PAYEES = [undefined, "company", "other", "", "me", null, 1];
  const RATES = [null, null, 1460, 1460.5, 1475.1234, 100, 100000];
  const cases = [];
  // ثوابتُ الحواف
  const edge = [
    [null, null], [[], null], [{ label: "x" }, null], ["x", null], [[5], null], [[[]], null],
    [Array.from({ length: 20 }, () => ({ label: "x", amount: 1 })), null],
    [Array.from({ length: 21 }, () => ({ label: "x", amount: 1 })), null],
    [[{ label: "توصيل", amount: 5 }, { label: "سائق", amount: 1, payee: "other" }], 1460],
    [[{ label: "x", amount: 7, usd: 0.335 }], 1460],
  ];
  for (const [p, rate] of edge) cases.push({ p, rate });
  for (let i = 0; i < 600; i++) {
    const n = pick([0, 1, 1, 2, 3, 5]);
    const p = Array.from({ length: n }, () => {
      const o = {};
      if (R() < 0.95) o.label = pick(LABELS);
      if (R() < 0.95) o.amount = pick(AMOUNTS);
      const u = pick(USDS); if (u !== undefined) o.usd = u;
      const w = pick(PAYEES); if (w !== undefined) o.payee = w;
      return o;
    });
    cases.push({ p, rate: pick(RATES) });
  }
  cases.forEach((c, i) => { c.i = i; });
  fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify(cases));
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  fs.writeFileSync(path.join(dir, "run.sql"), [
    `create or replace function _ch_case(p jsonb, r numeric) returns jsonb language plpgsql as $f$
     begin
       return _purchase_charges(p, r);
     exception when others then
       return jsonb_build_object('error', sqlerrm, 'hint', coalesce((regexp_match(sqlerrm, '.*'))[1], ''));
     end $f$;`,
    `select jsonb_object_agg(x.i, _ch_case(x.p, x.r))::text from (values ${cases.map((c) => `(${c.i}, ${c.p === null ? "null" : `${q(JSON.stringify(c.p))}::jsonb`}, ${c.rate ?? "null"})`).join(", ")}) as x(i, p, r);`,
  ].join("\n") + "\n");
  console.log(`charges-parity gen: ${cases.length} حالة`);
}

async function check() {
  const { build } = await import("esbuild");
  const out = path.join(dir, "mirror.mjs");
  await build({
    stdin: { contents: 'export * from "./src/lib/purchaseCharges.ts";\n', resolveDir: ROOT, loader: "ts" },
    bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
    plugins: [{ name: "at", setup(b) { b.onResolve({ filter: /^@\// }, (a) => b.resolve("./" + a.path.slice(2), { kind: a.kind, resolveDir: path.join(ROOT, "src") })); } }],
  });
  const M = await import(pathToFileURL(out).href);
  const cases = JSON.parse(fs.readFileSync(path.join(dir, "cases.json"), "utf8"));
  let act;
  try { act = JSON.parse(fs.readFileSync(path.join(dir, "actual.txt"), "utf8").trim()); }
  catch (e) { console.log(`   ✗ القاعدةُ أرجعت جوابَ التطابق — لا JSON: ${String(e.message).slice(0, 80)}`); process.exit(1); }
  const c2 = (x) => (x == null ? null : Math.round(Number(x) * 100));
  const mirror = (c, f = M.normCharges) => {
    try {
      const r = f(c.p, c.rate);
      return { list: r.list.map((x) => ({ label: x.label, amount: c2(x.amount), payee: x.payee, usd: x.usd === undefined ? null : c2(x.usd) })),
        company: c2(r.company), other: c2(r.other), company_usd: c2(r.companyUsd), other_usd: c2(r.otherUsd) };
    } catch (e) { return { error: e?.code ?? String(e?.message ?? e) }; }
  };
  const server = (j) => {
    if (!j) return { error: "none" };
    if (j.error) return { error: String(j.error).split(":")[0].trim() };
    return { list: j.list.map((x) => ({ label: x.label, amount: c2(x.amount), payee: x.payee, usd: x.usd === undefined ? null : c2(x.usd) })),
      company: c2(j.company), other: c2(j.other), company_usd: c2(j.company_usd), other_usd: c2(j.other_usd) };
  };
  let fail = 0;
  const diffs = [];
  const tally = {};
  for (const c of cases) {
    const a = server(act[c.i]), b = mirror(c);
    tally[a.error ?? "ok"] = (tally[a.error ?? "ok"] ?? 0) + 1;
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`#${c.i} ${JSON.stringify(c).slice(0, 160)} ⇒ القاعدة ${JSON.stringify(a).slice(0, 160)} والمرآة ${JSON.stringify(b).slice(0, 160)}`);
  }
  if (diffs.length) { fail = 1; console.log(`   ✗ _purchase_charges = normCharges — ${diffs.length} فرق`); for (const d of diffs.slice(0, 6)) console.log(`      ${d}`); }
  else console.log(`   ✓ _purchase_charges = normCharges: ${cases.length} حالة (${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(" ")})`);
  const NEED = { ok: 100, charge_label: 30, charge_amount: 30, bad_charges: 20 };
  const thin = Object.entries(NEED).filter(([k, v]) => (tally[k] ?? 0) < v);
  if (thin.length) { fail = 1; console.log(`   ✗ والقالبُ يقيس كلَّ فرع — ${thin.map(([k, v]) => `${k} ${tally[k] ?? 0} < ${v}`).join("، ")}`); }
  // مرايا مغلوطةٌ عمداً: كلٌّ يخالف القاعدةَ بحالةٍ على الأقلّ — وإلا فالقالبُ أعمى عن فرعها.
  const wrap = (fn) => (p, rate) => fn(p, rate);
  const mutants = [
    ["تقطع المبلغ ولا تقرّبه", wrap((p, rate) => M.normCharges(Array.isArray(p) ? p.map((x) => (x && typeof x === "object" && Number.isFinite(Number(x.amount)) && x.amount !== "" && x.amount !== null && typeof x.amount !== "boolean"
      ? { ...x, amount: Math.trunc(Number(x.amount) * 100) / 100 } : x)) : p, rate))],
    ["تضغط الفراغاتِ اليونيكودية أيضاً (\\s)", wrap((p, rate) => M.normCharges(Array.isArray(p) ? p.map((x) => (x && typeof x === "object" && typeof x.label === "string" ? { ...x, label: x.label.replace(/\s+/g, " ") } : x)) : p, rate))],
    ["تأخذ amount قبل usd", wrap((p, rate) => M.normCharges(Array.isArray(p) && rate !== null ? p.map((x) => (x && typeof x === "object" && x.amount != null && x.amount !== "" ? { ...x, usd: undefined } : x)) : p, rate))],
    ["لا تحدّ الاسم بستّين", wrap((p, rate) => { const r = M.normCharges(Array.isArray(p) ? p.map((x) => (x && typeof x === "object" && typeof x.label === "string" ? { ...x, label: x.label.slice(0, 50) } : x)) : p, rate); return r; })],
  ];
  for (const [name, f] of mutants) {
    const hit = cases.filter((c) => JSON.stringify(server(act[c.i])) !== JSON.stringify(mirror(c, f))).length;
    if (hit) console.log(`   ✓ المرآةُ المغلوطة «${name}» تخالف القاعدة (${hit} حالة)`);
    else { fail = 1; console.log(`   ✗ المرآةُ المغلوطة «${name}» تطابق القاعدة — القالبُ أعمى عن فرعها`); }
  }
  console.log(`${fail ? "✗" : "✓"} charges-parity: ${cases.length} حالة، ${mutants.length} مرآة مغلوطة`);
  process.exit(fail);
}
