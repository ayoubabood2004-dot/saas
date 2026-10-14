/* ============================================================================
 * حذفُ الدواء من الخطة — مرآةُ الشرط: `dropTargets` بالواجهة مقابل `drop_treatment_drug` (0238).
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * نافذةُ الحذف تقول «احذف ٥ جرعات» وتسمّيها قبل الضغط، والنسخةُ التجريبية تحذف بنفس الدالّة.
 * فإن افترق شرطُها عن شرط الخادم قال الزرُّ رقماً وحذف الخادمُ غيرَه — أو حذفت التجريبيةُ ما
 * يرفضه الخادم فأخفت العطلَ بدل أن تكشفه. والسُّنّةُ سُنّةُ `clinic-drugs-parity`: المتوقَّعُ
 * تحسبه دالّةُ الواجهة **نفسُها** (من المصدر بـesbuild)، ثم تقارنه الحزمةُ بما حذفته القاعدةُ
 * بدور authenticated صفّاً صفّاً، وبالعددين اللذين يُقالان (المعطاة، والفائتة) وبرمز الرفض.
 *
 *   node scripts/treatment-drop-parity.mjs [outDir]   ⇒ outDir/treatment-drop.sql
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
  entryPoints: ["src/lib/treatmentDrop.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
});
const dir = mkdtempSync(join(tmpdir(), "td-parity-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const M = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/* ---- أيامٌ نسبية: الواجهةُ على تاريخٍ ثابت، والقاعدةُ على يومها (Asia/Baghdad) ---- */
const BASE = "2026-03-15";
const dayAt = (off) => { const d = new Date(`${BASE}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };

/* ---- معرّفاتٌ ثابتة ---- */
const PET = "c2380000-0000-4000-8000-00000000a0e1";
let n = 0;
const ids = new Map();
const id = (label) => {
  if (!ids.has(label)) { n++; ids.set(label, `c2380000-0000-4000-8000-${(0x500 + n).toString(16).padStart(12, "0")}`); }
  return ids.get(label);
};

/** صفٌّ بأيامٍ نسبية: {l: الاسمُ المرجعيّ، v: الزيارة، m: الدواء، d: إزاحةُ اليوم، ...} */
const row = (l, v, m, d, extra = {}) => ({ l, v, m, d, time: extra.time ?? "08:00", task: extra.task ?? "drug", given: !!extra.given, miss: extra.miss ?? null, result: extra.result ?? null });

/** الأساس: سيفترياكسون بأيامٍ فاتت (معطاة، منتظرة، فائتةٌ محسومة)، واليومُ (معطاة صباحاً،
 *  منتظرة مساءً)، وأربعةُ أيامٍ قادمة — ودواءٌ آخر وسائلٌ بنفس الاسم وصفٌّ بنتيجة. */
const base = (v) => [
  row("g2", v, "Ceftriaxone", -2, { given: true }),
  row("p1", v, "Ceftriaxone", -1),
  row("m1", v, "Ceftriaxone", -1, { miss: "past:not_given" }),
  row("g0", v, "Ceftriaxone", 0, { given: true }),
  row("t0", v, "Ceftriaxone", 0, { time: "20:00" }),
  row("f1", v, "Ceftriaxone", 1),
  row("f2", v, "Ceftriaxone", 2),
  row("f3", v, "Ceftriaxone", 3),
  row("r2", v, "Ceftriaxone", 2, { time: "14:00", result: "x" }),
  row("mel", v, "Meloxicam", 1),
  row("flu", v, "Ceftriaxone", 1, { task: "fluid", time: "10:00" }),
];

/* كلُّ سيناريو: زيارةٌ جديدة (مفتوحة أو مسكّرة)، صفوفُها، ونداءٌ واحد. `sent`: معرّفاتُ النداء —
 * "scope" = كلُّ صفوف النطاق (حتى المعطاة: الخادمُ يحكم)، "targets" = ما تقول الواجهةُ إنه ينحذف،
 * أو قائمةُ أسماءٍ مرجعية. */
const SCENARIOS = [
  { name: "«وطالع» من يومٍ فات: المعطاةُ والفائتةُ تبقى، والحذفُ من اليوم", status: "open", rows: base, call: { m: "Ceftriaxone", d: -2, scope: "rest", sent: "scope" } },
  { name: "«بس» اليوم: المنتظرةُ وحدها", status: "open", rows: base, call: { m: "Ceftriaxone", d: 0, scope: "day", sent: "targets" } },
  { name: "«بس» على يومٍ فات ⇒ drop_past_day", status: "open", rows: base, call: { m: "Ceftriaxone", d: -1, scope: "day", sent: "scope" } },
  { name: "«وطالع» من يومٍ قادم: ما له نتيجةٌ يبقى", status: "open", rows: base, call: { m: "Ceftriaxone", d: 2, scope: "rest", sent: "scope" } },
  { name: "معرّفاتٌ جزئية: يُحذف المُرسَلُ وحده", status: "open", rows: base, call: { m: "Ceftriaxone", d: 0, scope: "rest", sent: ["f2"] } },
  { name: "معرّفاتُ دواءٍ آخر وسائلٍ بنفس الاسم ⇒ drop_nothing", status: "open", rows: base, call: { m: "Ceftriaxone", d: 1, scope: "rest", sent: ["mel", "flu"] } },
  { name: "الاسمُ حرفياً: ceftriaxone ليس Ceftriaxone ⇒ drop_nothing", status: "open", rows: base, call: { m: "ceftriaxone", d: 0, scope: "rest", sent: ["t0", "f1"] } },
  { name: "زيارةٌ مسكّرة ⇒ visit_ended", status: "ended", rows: base, call: { m: "Ceftriaxone", d: 1, scope: "rest", sent: "scope" } },
  { name: "«بس» على يومٍ كلُّه معطى ⇒ drop_nothing", status: "open", rows: (v) => [row("a", v, "Ketamine", 0, { given: true }), row("b", v, "Ketamine", 0, { given: true, time: "20:00" })], call: { m: "Ketamine", d: 0, scope: "day", sent: "scope" } },
];

/* ---- التشغيلُ بالواجهة: المتوقَّعُ لكلّ سيناريو ---------------------------- */
const asEntry = (r, visit) => ({
  id: id(`${visit}:${r.l}`), pet_id: PET, visit_id: id(`visit:${visit}`), day: dayAt(r.d), time: r.time, medication: r.m,
  amount: "1 ml", task_type: r.task, administered_at: r.given ? "2026-03-15T08:00:00Z" : null,
  missed_reason: r.miss, result: r.result, created_at: "2026-03-15T00:00:00Z",
});
console.log("▸ السيناريوهاتُ بالواجهة (dropTargets من المصدر)");
const plan = [];
for (const [si, sc] of SCENARIOS.entries()) {
  const vk = `s${si}`;
  const rows = sc.rows(vk);
  const entries = rows.map((r) => asEntry(r, vk));
  const c = sc.call;
  const o = { visitId: id(`visit:${vk}`), medication: c.m, day: dayAt(c.d), scope: c.scope, today: BASE };
  const p = M.dropTargets(entries, o);
  const scopeIds = entries.filter((e) => e.medication === c.m && e.task_type === "drug" && (c.scope === "day" ? e.day === o.day : e.day >= o.day)).map((e) => e.id);
  const sent = c.sent === "scope" ? scopeIds : c.sent === "targets" ? p.targets.map((x) => x.id) : c.sent.map((l) => id(`${vk}:${l}`));
  let got;
  let gone = new Set();
  if (sc.status === "ended") got = "visit_ended";
  else if (p.pastDayBlocked) got = "drop_past_day";
  else {
    gone = new Set(p.targets.filter((x) => sent.includes(x.id)).map((x) => x.id));
    got = gone.size ? `ok:${gone.size}:${p.keptGiven}:${p.keptPast}` : "drop_nothing";
  }
  const left = entries.filter((e) => !gone.has(e.id)).map((e) => e.id).sort().join(",");
  check(`${sc.name} ⇒ ${got}`, true);
  plan.push({ name: sc.name, visit: id(`visit:${vk}`), status: sc.status, rows, entries, call: c, sent, got, left });
}
/* حارسٌ على السيناريوهات نفسها: الأوّلُ يحذف المساءَ والقادمَ ويُبقي المعطاة والفائتة. */
check("المسبار: الأوّلُ ok:4:2:2 (t0 وf1–f3؛ r2 بنتيجته يبقى)", plan[0].got === "ok:4:2:2", plan[0].got);
check("المسبار: «بس» على يومٍ فات مقفول", plan[2].got === "drop_past_day", plan[2].got);

/* ---- الملفُّ للحزمة ------------------------------------------------------- */
const outDir = process.argv[2];
if (outDir) {
  const lit = (s, tag) => `$${tag}$${s}$${tag}$`;
  const TODAY = "((now() at time zone 'Asia/Baghdad')::date)";
  let body = "";
  for (const sc of plan) {
    const where = lit(sc.name, "w");
    body += `  delete from treatment_entries where visit_id = '${sc.visit}';\n`;
    body += `  insert into clinic_visits(id, pet_id, clinic_id, status) values ('${sc.visit}', '${PET}', c1, '${sc.status}') on conflict (id) do update set status = excluded.status;\n`;
    for (const [i, r] of sc.rows.entries()) {
      const e = sc.entries[i];
      body += `  insert into treatment_entries(id, pet_id, clinic_id, visit_id, day, time, medication, amount, task_type, administered_at, missed_reason, result) values ('${e.id}', '${PET}', c1, '${sc.visit}', ${TODAY} + ${r.d}, '${r.time}', ${lit(r.m, "m")}, '1 ml', '${r.task}', ${r.given ? "now()" : "null"}, ${r.miss ? `'${r.miss}'` : "null"}, ${r.result ? `'${r.result}'` : "null"});\n`;
    }
    const arr = sc.sent.length ? `array[${sc.sent.map((x) => `'${x}'`).join(",")}]::uuid[]` : "array[]::uuid[]";
    body += `  got := _dtd(c1, '${sc.visit}', ${lit(sc.call.m, "m")}, ${TODAY} + ${sc.call.d}, '${sc.call.scope}', ${arr});\n`;
    body += `  if got like 'guarded:%' then got := split_part(got, ':', 3); end if;\n`;
    body += `  if got <> ${lit(sc.got, "g")} then return ${where} || ': ' || got || ' ≠ ' || ${lit(sc.got, "g")}; end if;\n`;
    body += `  st := (select coalesce(string_agg(id::text, ',' order by id::text), '') from treatment_entries where visit_id = '${sc.visit}');\n`;
    body += `  if st <> ${lit(sc.left, "s")} then return ${where} || ' left: ' || st; end if;\n`;
    body += `  update treatment_entries set administered_at = null where visit_id = '${sc.visit}';\n`;
    body += `  delete from treatment_entries where visit_id = '${sc.visit}';\n`;
  }
  const sql = `-- مولَّد من scripts/treatment-drop-parity.mjs — لا يُحرَّر بيد.
-- يقارن drop_treatment_drug (0238) بـdropTargets (treatmentDrop.ts): الرفضُ، والعددان، وما بقي صفّاً صفّاً.
-- يحتاج من الحزمة: _dtd (النداءُ بدور authenticated)، وclinic_visits، والعيادة c1.
create or replace function _tdp_run(c1 uuid) returns text language plpgsql as $fn$
declare got text; st text;
begin
  insert into pets(id, name, clinic_id) values ('${PET}', 'parity 0238', c1) on conflict (id) do nothing;
${body}  delete from clinic_visits where pet_id = '${PET}';
  return 'ok';
end $fn$;
-- الحزمةُ تُنزل هذا الملفّ ثم تسأل: select _tdp_run('<C1>') — جملةٌ واحدة يقارن chk ناتجَها.
`;
  writeFileSync(join(outDir, "treatment-drop.sql"), sql);
  console.log(`   ✓ كُتب treatment-drop.sql بـ${plan.length} سيناريو`);
}

console.log(fails
  ? `\n✗ treatment-drop-parity: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ treatment-drop-parity: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
