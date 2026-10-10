/* ============================================================================
 * «أدويتي» — مرآةُ الكتابة: `applyOps` بالواجهة مقابل `clinic_drugs_apply` بالقاعدة.
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * الموضعُ يحسبه الخادم (0229) والواجهةُ تعرض النتيجةَ قبل وصوله ثم تستبدلها بلقطته.
 * فإن افترق الحسابان رأى الطبيبُ دواءً «ينطّ» من مكانه بعد ثانية، أو — أسوأ — رفضاً
 * بالنسخة التجريبية لا يقع بالإنتاج فيُخفي العطلَ بدل أن يكشفه. والسُّنّةُ هنا سُنّةُ
 * `group-key-parity`: المتوقَّعُ تحسبه دالّةُ الواجهة **نفسُها** (من المصدر بـesbuild)
 * لا نسخةٌ منها، ثم تقارنه الحزمةُ بما كتبته القاعدةُ صفّاً صفّاً.
 *
 * ── ما يُفحص ────────────────────────────────────────────────────────────
 * سيناريوهاتٌ بدفعات: الإدراجُ بآخر القائمة وأوّلها وبعد صفّ، النجمةُ على صفٍّ قائم،
 * الإخراجُ مرّتين، النقل، التسمية، الأرشفةُ والاسترجاع، التوائم، الرفضُ برمزه وبلا
 * أثرٍ لنصف الدفعة، وأربعون إدراجاً بفجوةٍ واحدة تفرض الترقيم، ومنتصفُ فجوةٍ فرديّةٍ
 * سالبة (floor لا trunc). وبلا مجلّد: يُشغَّل السيناريوهات بالواجهة وحدها ويتأكّد أن
 * كلَّ دفعةٍ تعطي ما كُتبت لتفحصه (فسيناريو «الترقيم» يرقّم فعلاً، و«الرفض» يرفض).
 *
 *   node scripts/clinic-drugs-parity.mjs [outDir]   ⇒ outDir/clinic-drugs.sql
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const built = await esbuild.build({
  entryPoints: ["src/lib/medIndex.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|react|react-i18next)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default { t: (k) => k, language: 'ar' }; export const t = (k) => k;", loader: "js" }));
    },
  }],
});
const dir = mkdtempSync(join(tmpdir(), "cd-parity-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const M = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/* ---- معرّفاتٌ ثابتة (uuid بحروفٍ صغيرة — ترتيبُها نصّاً = ترتيبُ بوستغريس) ---- */
const PC = "c22a0000-0000-4000-8000-0000000000c1";
let n = 0;
const ids = new Map();
const id = (label) => {
  if (!ids.has(label)) { n++; ids.set(label, `c22a0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`); }
  return ids.get(label);
};
const put = (label, name, mine, after, family = "other") => {
  const o = { op: "put", id: id(label), name, family, mine };
  if (after !== undefined) o.after = after === null ? null : id(after);
  return o;
};
const move = (label, after) => ({ op: "move", id: id(label), after: after === null ? null : id(after) });
const op = (kind, label, extra = {}) => ({ op: kind, id: id(label), ...extra });

/* كلُّ سيناريو: دفعاتٌ تبدأ من عيادةٍ فارغة، ولكلّ دفعةٍ ما كُتبت لتفحصه (`expect`). */
const SCENARIOS = [
  {
    name: "الأساس",
    batches: [
      { expect: "ok", ops: [put("A", "Ceftriaxone", true), put("B", "Meloxicam", true), put("C", "Tramadol", true)] },
      { expect: "ok", ops: [put("D", "Ketamine", true, null), put("E", "Propofol", true, "A")] },
      { expect: "ok", ops: [put("A2", "ceftriaxone ", true), put("F", "Furosemide", false, undefined, "cardiac")] },
      { expect: "ok", ops: [put("F2", "furosemide", true, "B")] },
      { expect: "ok", ops: [op("unmine", "C"), op("unmine", "C"), move("A", "E"), move("D", "B")] },
      { expect: "ok", ops: [op("edit", "F", { name: "  Furosemide 40mg ", family: "cardiac" }), op("archive", "B"), op("restore", "B")] },
      { expect: "ok", ops: [put("B2", "MELOXICAM", false)] },
      { expect: "drug_row_gone", ops: [move("A", "C")] },
      { expect: "drug_exists", ops: [op("edit", "E", { name: "ketamine" })] },
      { expect: "drug_row_gone", ops: [op("restore", "ZZ")] },
      { expect: "ok", ops: [op("archive", "E"), put("E2", "propofol", true, null)] },
      { expect: "drug_exists", ops: [op("restore", "E")] },
      // رفضٌ بمنتصف الدفعة: الإدراجُ الأوّل لا يبقى (معاملةٌ واحدة).
      { expect: "drug_row_gone", ops: [put("G", "Atropine", true), move("A", "C")] },
      { expect: "ok", ops: [put("H", "Lidocaine 2%", true, null, "anesthetics"), op("edit", "H", { family: "emergency" }), op("unmine", "H")] },
      { expect: "clinic_drugs_bad_name", ops: [put("I", "   ", true)] },
    ],
  },
  {
    name: "التوائم",
    batches: [
      { expect: "ok", ops: [put("T1", "أموكسيسيلين", true, undefined, "antibiotics"), put("T2", "اموكسيسيلين ", true), put("T3", "amoxicillin 250 mg", false, undefined, "antibiotics"), put("T4", "Amoxicillin 250mg", true), put("T5", "Amoxicillin  250mg", true, "T1")] },
      { expect: "drug_exists", ops: [put("T6", "سيرينيا ١٠", false), op("edit", "T6", { name: "أموكسيسيلين" })] },
      { expect: "ok", ops: [put("T7", "سيرينيا ١٠", false), put("T8", "سيرينيا 10", true)] },
    ],
  },
  {
    name: "أربعون إدراجاً بفجوةٍ واحدة (ترقيم)",
    batches: [
      { expect: "ok", ops: [put("R0", "Alpha", true), put("RZ", "Omega", true)] },
      { expect: "ok", ops: Array.from({ length: 40 }, (_, i) => put(`N${i}`, `Drug ${i}`, true, "R0")) },
      { expect: "ok", ops: [move("RZ", null), move("N5", "N39"), put("N40", "Drug 40", true, "N0")] },
    ],
    // N0 أُدرج بـ١٥٣٦ ولا عمليةَ تنقله بعدها — موضعٌ غيرُه = الترقيمُ جرى فعلاً.
    probe: (rows) => (rows.find((r) => r.id === id("N0"))?.pos !== 1536 ? null : "لم يحدث ترقيم"),
  },
  {
    name: "منتصفُ فجوةٍ فرديّةٍ سالبة (floor لا trunc)",
    batches: [
      { expect: "ok", ops: [put("Q1", "Q one", true), put("Q2", "Q two", true, null), put("Q3", "Q three", true, null)] },
      { expect: "ok", ops: [put("Q5", "Q five", true, "Q3")] },
      // تسعُ إدراجاتٍ بعد Q3 (−١٠٢٤): آخرُها S8 بـ−١٠٢٣ وقبله S7 بـ−١٠٢٢ وS6 بـ−١٠٢٠.
      { expect: "ok", ops: Array.from({ length: 9 }, (_, i) => put(`S${i}`, `S ${i}`, true, "Q3")) },
      // خروجُ S7 يترك فجوةً فرديّة (٣) بين −١٠٢٣ و−١٠٢٠.
      { expect: "ok", ops: [op("unmine", "S7")] },
      { expect: "ok", ops: [put("W", "W odd", true, "S8")] },
    ],
    // floor((−١٠٢٣ + −١٠٢٠) / ٢) = −١٠٢٢؛ والقسمةُ الصحيحة بالاقتطاع تعطي −١٠٢١.
    probe: (rows) => { const w = rows.find((r) => r.id === id("W")); return w?.pos === -1022 ? null : `W=${w?.pos}`; },
  },
];

/* ---- التشغيلُ بالواجهة: المتوقَّعُ دفعةً دفعة ---------------------------- */
const stateOf = (rows) => rows.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((r) => `${r.id}|${r.name}|${r.family}|${r.in_mine}|${r.pos ?? "-"}|${r.archived_at != null}`).join("\n");

console.log("▸ السيناريوهاتُ بالواجهة (applyOps من المصدر)");
const plan = [];
for (const sc of SCENARIOS) {
  let rows = [];
  const steps = [];
  let ok = true;
  for (const [i, b] of sc.batches.entries()) {
    let got = "ok";
    try { rows = M.applyOps(rows, b.ops, "2026-10-10T00:00:00.000Z"); }
    catch (e) { got = M.drugErrorCode(e) ?? String(e); }
    if (got !== b.expect) { ok = false; check(`${sc.name} / دفعة ${i + 1}`, false, `طلع ${got} والمكتوب ${b.expect}`); }
    steps.push({ ops: b.ops, got, state: stateOf(rows) });
  }
  const why = sc.probe ? sc.probe(rows) : null;
  check(`${sc.name}: ${sc.batches.length} دفعات كلٌّ بما كُتبت له${why ? "" : sc.probe ? " (والمسبارُ أصاب)" : ""}`, ok && !why, why ?? "");
  plan.push({ name: sc.name, steps });
}

/* ---- الملفُّ للحزمة ------------------------------------------------------- */
const outDir = process.argv[2];
if (outDir) {
  const lit = (s, tag) => `$${tag}$${s}$${tag}$`;
  let body = "";
  for (const sc of plan) {
    body += `  delete from clinic_drugs where clinic_id = '${PC}';\n`;
    for (const [i, s] of sc.steps.entries()) {
      const where = `${sc.name} / ${i + 1}`;
      body += `  got := _cdp_apply('${PC}', ${lit(JSON.stringify(s.ops), "j")}::jsonb);\n`;
      body += `  if got <> ${lit(s.got, "g")} then return ${lit(where, "w")} || ': ' || got || ' ≠ ' || ${lit(s.got, "g")}; end if;\n`;
      body += `  st := _cdp_state('${PC}');\n`;
      body += `  if st <> ${lit(s.state, "s")} then return ${lit(where, "w")} || ' state: ' || st; end if;\n`;
    }
  }
  const sql = `-- مولَّد من scripts/clinic-drugs-parity.mjs — لا يُحرَّر بيد.
-- يقارن clinic_drugs_apply (0229) بـapplyOps (medIndex.ts) دفعةً دفعة: الصفوفُ والمواضعُ والرفض.
create or replace function _cdp_apply(clinic uuid, ops jsonb) returns text language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', clinic::text, true);
  perform clinic_drugs_apply(clinic, ops);
  return 'ok';
exception when others then return sqlerrm;
end $fn$;
create or replace function _cdp_state(clinic uuid) returns text language sql as $fn$
  select coalesce(string_agg(id::text || '|' || name || '|' || family || '|' || in_mine::text || '|' || coalesce(pos::text, '-') || '|' || (archived_at is not null)::text, E'\\n' order by id), '')
    from clinic_drugs where clinic_id = clinic
$fn$;
create or replace function _cdp_run() returns text language plpgsql as $fn$
declare got text; st text;
begin
  insert into auth.users(id) values ('${PC}') on conflict do nothing;
${body}  delete from clinic_drugs where clinic_id = '${PC}';
  return 'ok';
end $fn$;
-- الحزمةُ تُنزل هذا الملفّ ثم تسأل: select _cdp_run() — جملةٌ واحدة يقارن chk ناتجَها.
`;
  writeFileSync(join(outDir, "clinic-drugs.sql"), sql);
  console.log(`   ✓ كُتب clinic-drugs.sql بـ${plan.reduce((s, p) => s + p.steps.length, 0)} دفعة`);
}

console.log(fails
  ? `\n✗ clinic-drugs-parity: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ clinic-drugs-parity: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
