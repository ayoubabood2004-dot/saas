/* ============================================================================
 * تصنيفاتُ المتجر — مرآةُ الكتابة: `applyOps` بالواجهة مقابل `store_categories_apply` بالقاعدة.
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * الموضعُ والرفضُ يحسبهما الخادم (0233)، والشاشةُ تعرض النتيجةَ قبل وصوله ثم تستبدلها
 * بلقطته، والنسخةُ التجريبيةُ تكتب بالمرآة نفسِها. فإن افترق الحسابان رأى المديرُ تصنيفاً
 * «ينطّ» بعد ثانية، أو — أسوأ — رفضاً تجريبياً لا يقع بالإنتاج فيُخفي العطلَ بدل أن يكشفه.
 * والسُّنّةُ سُنّةُ clinic-drugs-parity: المتوقَّعُ تحسبه دالّةُ الواجهة **نفسُها** (من المصدر
 * بـesbuild) لا نسخةٌ منها، ثم تقارنه الحزمةُ بما كتبته القاعدةُ صفّاً صفّاً.
 *
 * ── ما يُفحص ────────────────────────────────────────────────────────────
 * الإنشاءُ بآخر القائمة وأوّلها وبعد صفّ، التسميةُ والأيقونةُ والإخفاء، الأرشفةُ والاسترجاع،
 * التوائم، الإعادةُ الآمنة، الرفضُ برمزه وبلا أثرٍ لنصف الدفعة؛ والعضويةُ: الإلحاقُ والكتلةُ
 * بعد عضو، الموجودُ يُتجاهل، النقلُ، الشيلُ مرّتين، مادّةُ عيادةٍ أخرى ومادّةُ حقل؛ واثنا
 * عشرَ إدراجاً بفجوةٍ واحدة تفرض الترقيم (للتصنيفات وللمواد)، ومنتصفُ فجوةٍ فرديّةٍ سالبة.
 * وبلا مجلّد: يُشغَّل السيناريوهات بالواجهة وحدها ويتأكّد أن كلَّ دفعةٍ تعطي ما كُتبت لتفحصه.
 *
 *   node scripts/store-cats-parity.mjs [outDir]   ⇒ outDir/store-cats.sql
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
  entryPoints: ["src/lib/storeCatIndex.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|react|react-i18next)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default { t: (k) => k, language: 'ar' }; export const t = (k) => k;", loader: "js" }));
    },
  }],
});
const dir = mkdtempSync(join(tmpdir(), "sc-parity-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const M = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/* ---- معرّفاتٌ ثابتة (uuid بحروفٍ صغيرة — ترتيبُها نصّاً = ترتيبُ بوستغريس) ---- */
const PC = "c233a000-0000-4000-8000-0000000000c1";     // عيادةُ الفحص
const PO = "c233a000-0000-4000-8000-0000000000c2";     // عيادةٌ أخرى
const FARM = "c233a000-0000-4000-8000-0000000000f1";
let n = 0;
const ids = new Map();
const id = (label) => {
  if (!ids.has(label)) { n++; ids.set(label, `c233a000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`); }
  return ids.get(label);
};
/* المنتجات: P* و Q* لعيادة الفحص، وOTHER لعيادةٍ أخرى، وFARMP لحقلٍ بعيادة الفحص. */
const MINE = [...Array.from({ length: 10 }, (_, i) => `P${i}`), ...Array.from({ length: 16 }, (_, i) => `Q${i}`), "QZ"];
for (const p of MINE) id(p);
id("OTHER"); id("FARMP");
const valid = new Set(MINE.map(id));

const create = (label, name, extra = {}) => {
  const o = { op: "create", id: id(label), name };
  if (extra.icon !== undefined) o.icon = extra.icon;
  if (extra.after !== undefined) o.after = extra.after === null ? null : id(extra.after);
  return o;
};
const move = (label, after) => ({ op: "move", id: id(label), after: after === null ? null : id(after) });
const op = (kind, label, extra = {}) => ({ op: kind, id: id(label), ...extra });
const add = (cat, pids, after) => {
  const o = { op: "add", cat: id(cat), ids: pids.map(id) };
  if (after !== undefined) o.after = after === null ? null : id(after);
  return o;
};
const remove = (cat, pids) => ({ op: "remove", cat: id(cat), ids: pids.map(id) });
const moveItem = (cat, pid, after) => ({ op: "move_item", cat: id(cat), id: id(pid), after: after === null ? null : id(after) });

/* كلُّ سيناريو: دفعاتٌ تبدأ من عيادةٍ مبذورةٍ فارغة، ولكلّ دفعةٍ ما كُتبت لتفحصه (`expect`). */
const SCENARIOS = [
  {
    name: "البنية",
    batches: [
      { expect: "ok", ops: [create("A", "أغذية"), create("B", "ألعاب", { icon: "toy" }), create("C", "عروض", { icon: "star", after: null })] },
      { expect: "ok", ops: [create("D", "  حلويات   القطط ", { after: "A" })] },
      { expect: "ok", ops: [op("edit", "B", { name: "ألعاب القطط", icon: "cat" }), op("hide", "C", { hidden: true }), op("hide", "C", { hidden: false }), op("hide", "B", { hidden: true })] },
      { expect: "ok", ops: [op("archive", "D"), op("archive", "D"), op("restore", "D")] },
      { expect: "store_cat_exists", ops: [create("E", "اغذيه ")] },
      { expect: "ok", ops: [op("archive", "A"), create("E", "أغذية")] },
      { expect: "store_cat_exists", ops: [op("restore", "A")] },
      { expect: "ok", ops: [move("B", null), move("E", "C")] },
      { expect: "store_cat_gone", ops: [move("A", null)] },
      { expect: "store_cat_bad_name", ops: [create("F", "   ")] },
      { expect: "store_cat_bad_icon", ops: [create("F", "فراء", { icon: "unicorn" })] },
      { expect: "store_cat_gone", ops: [create("G", "جديد"), move("G", "G")] },
      // رفضٌ بمنتصف الدفعة: الإنشاءُ الأوّل لا يبقى (معاملةٌ واحدة).
      { expect: "store_cat_gone", ops: [create("H", "هدايا"), move("ZZ", null)] },
      // إعادةٌ آمنة: نفسُ المعرّف باسمٍ آخر ⇒ لا شيء.
      { expect: "ok", ops: [create("B", "شيء آخر تماماً")] },
      { expect: "store_cat_exists", ops: [op("edit", "C", { name: "ألعاب  القطط" })] },
      { expect: "ok", ops: [op("edit", "C", { name: "عروضُ الأسبوع" }), op("edit", "C", { icon: "gift" })] },
      { expect: "bad_ops", ops: [{ op: "hide", id: id("C") }] },
      { expect: "bad_ops", ops: [{ op: "move", id: id("C") }] },
      { expect: "bad_ops", ops: [{ op: "create", id: "not-a-uuid", name: "x" }] },
      { expect: "bad_ops", ops: [{ op: "explode", id: id("C") }] },
    ],
  },
  {
    name: "العضوية",
    batches: [
      { expect: "ok", ops: [create("X", "أطواق"), add("X", ["P1", "P2", "P3"])] },
      { expect: "ok", ops: [add("X", ["P4", "P5"], "P1")] },
      { expect: "ok", ops: [add("X", ["P2", "P6", "P6"], null)] },
      { expect: "ok", ops: [moveItem("X", "P3", null), moveItem("X", "P1", "P5")] },
      { expect: "ok", ops: [remove("X", ["P4", "P4", "P9"]), remove("X", ["P4"])] },
      { expect: "store_item_gone", ops: [add("X", ["P7", "OTHER"])] },
      { expect: "store_item_gone", ops: [add("X", ["FARMP"])] },
      { expect: "store_item_gone", ops: [moveItem("X", "P9", null)] },
      { expect: "store_item_gone", ops: [moveItem("X", "P1", "P9")] },
      { expect: "store_item_gone", ops: [add("X", ["P8"], "P9")] },
      { expect: "ok", ops: [create("W", "مخزن"), add("W", ["P1"]), op("archive", "W")] },
      { expect: "store_cat_gone", ops: [add("W", ["P2"])] },
      { expect: "store_cat_gone", ops: [remove("W", ["P1"])] },
      { expect: "ok", ops: [op("restore", "W"), add("W", ["P2"], null)] },
      { expect: "bad_ops", ops: [{ op: "add", cat: id("X"), ids: [id("P7"), "x"] }] },
      { expect: "bad_ops", ops: [{ op: "add", cat: id("X"), ids: id("P7") }] },
    ],
  },
  {
    name: "اثنا عشرَ إدراجاً بفجوةٍ واحدة (ترقيمُ المواد)",
    batches: [
      { expect: "ok", ops: [create("Y", "رفّ"), add("Y", ["Q0", "QZ"])] },
      { expect: "ok", ops: Array.from({ length: 12 }, (_, i) => add("Y", [`Q${i + 1}`], "Q0")) },
      { expect: "ok", ops: [moveItem("Y", "QZ", null), moveItem("Y", "Q5", "Q12")] },
    ],
    // QZ أُدرج بـ٢٠٤٨ والنقلُ وضعه أوّلاً — وQ1 (آخرُ مَن أُدرج بعد Q0 أوّلَ مرّة) يعيش فقط إن رُقّم.
    probe: (st) => (st.items.some((m) => m.product_id === id("Q1") && m.pos % 1024 === 0) ? null : "لم يحدث ترقيم"),
  },
  {
    name: "اثنا عشرَ تصنيفاً بفجوةٍ واحدة (ترقيمُ التصنيفات)",
    batches: [
      { expect: "ok", ops: [create("R0", "أوّل"), create("RZ", "آخر")] },
      { expect: "ok", ops: Array.from({ length: 12 }, (_, i) => create(`N${i}`, `رفّ ${i}`, { after: "R0" })) },
      { expect: "ok", ops: [move("RZ", null), move("N5", "N11")] },
    ],
    probe: (st) => (st.cats.find((c) => c.id === id("N0"))?.pos !== 1536 ? null : "لم يحدث ترقيم"),
  },
  {
    name: "منتصفُ فجوةٍ فرديّةٍ سالبة (floor لا trunc)",
    batches: [
      { expect: "ok", ops: [create("S1", "س واحد"), create("S2", "س اثنين", { after: null }), create("S3", "س ثلاثة", { after: null })] },
      { expect: "ok", ops: [create("S5", "س خمسة", { after: "S3" })] },
      // تسعةٌ بعد S3 (−١٠٢٤): آخرُها T8 بـ−١٠٢٣ وقبله T7 بـ−١٠٢٢ وT6 بـ−١٠٢٠.
      { expect: "ok", ops: Array.from({ length: 9 }, (_, i) => create(`T${i}`, `ت ${i}`, { after: "S3" })) },
      // أرشفةُ T7 تترك فجوةً فرديّة (٣) بين −١٠٢٣ و−١٠٢٠.
      { expect: "ok", ops: [op("archive", "T7")] },
      { expect: "ok", ops: [create("V", "فردي", { after: "T8" })] },
    ],
    probe: (st) => { const v = st.cats.find((c) => c.id === id("V")); return v?.pos === -1022 ? null : `V=${v?.pos}`; },
  },
];

/* ---- التشغيلُ بالواجهة: المتوقَّعُ دفعةً دفعة ---------------------------- */
const stateOf = (st) => [
  ...st.cats.slice().sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => `c|${c.id}|${c.name}|${c.icon}|${c.hidden}|${c.pos ?? "-"}|${c.archived_at != null}`),
  ...st.items.slice().sort((a, b) => (a.category_id + a.product_id < b.category_id + b.product_id ? -1 : 1))
    .map((m) => `i|${m.category_id}|${m.product_id}|${m.pos}`),
].join("\n");

console.log("▸ السيناريوهاتُ بالواجهة (applyOps من المصدر)");
const plan = [];
const ctx = { canEdit: true, isProduct: (pid) => valid.has(pid), now: "2026-10-12T00:00:00.000Z" };
for (const sc of SCENARIOS) {
  let st = { seeded: true, cats: [], items: [] };
  const steps = [];
  let ok = true;
  for (const [i, b] of sc.batches.entries()) {
    let got = "ok";
    try { st = M.applyOps(st, b.ops, ctx); }
    catch (e) { got = M.storeCatErrorCode(e) ?? String(e); }
    if (got !== b.expect) { ok = false; check(`${sc.name} / دفعة ${i + 1}`, false, `طلع ${got} والمكتوب ${b.expect}`); }
    steps.push({ ops: b.ops, got, state: stateOf(st) });
  }
  const why = sc.probe ? sc.probe(st) : null;
  check(`${sc.name}: ${sc.batches.length} دفعات كلٌّ بما كُتبت له${why ? "" : sc.probe ? " (والمسبارُ أصاب)" : ""}`, ok && !why, why ?? "");
  plan.push({ name: sc.name, steps });
}

/* ---- الملفُّ للحزمة ------------------------------------------------------- */
const outDir = process.argv[2];
if (outDir) {
  const lit = (s, tag) => `$${tag}$${s}$${tag}$`;
  let body = "";
  for (const sc of plan) {
    body += `  delete from store_category_items where clinic_id = '${PC}';\n  delete from store_categories where clinic_id = '${PC}';\n`;
    for (const [i, s] of sc.steps.entries()) {
      const where = `${sc.name} / ${i + 1}`;
      body += `  got := _scp_apply('${PC}', ${lit(JSON.stringify(s.ops), "j")}::jsonb);\n`;
      body += `  if got <> ${lit(s.got, "g")} then return ${lit(where, "w")} || ': ' || got || ' ≠ ' || ${lit(s.got, "g")}; end if;\n`;
      body += `  st := _scp_state('${PC}');\n`;
      body += `  if st <> ${lit(s.state, "s")} then return ${lit(where, "w")} || ' state: ' || st; end if;\n`;
    }
  }
  const products = MINE.map((p) => `('${id(p)}','${PC}','${p}',1000,500,1)`).join(",\n         ");
  const sql = `-- مولَّد من scripts/store-cats-parity.mjs — لا يُحرَّر بيد.
-- يقارن store_categories_apply (0233) بـapplyOps (storeCatIndex.ts) دفعةً دفعة: الصفوفُ والمواضعُ والرفض.
create or replace function _scp_apply(clinic uuid, ops jsonb) returns text language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', clinic::text, true);
  perform store_categories_apply(clinic, ops);
  return 'ok';
exception when others then return sqlerrm;
end $fn$;
create or replace function _scp_state(clinic uuid) returns text language sql as $fn$
  select coalesce(string_agg(x, E'\\n' order by k collate "C"), '') from (
    select 'c|' || id::text as k, 'c|' || id::text || '|' || name || '|' || icon || '|' || hidden::text || '|' || coalesce(pos::text, '-') || '|' || (archived_at is not null)::text as x
      from store_categories where clinic_id = clinic
    union all
    select 'i|' || category_id::text || product_id::text, 'i|' || category_id::text || '|' || product_id::text || '|' || pos::text
      from store_category_items where clinic_id = clinic) q
$fn$;
create or replace function _scp_run() returns text language plpgsql as $fn$
declare got text; st text;
begin
  insert into auth.users(id) values ('${PC}'), ('${PO}') on conflict do nothing;
  insert into store_categories_seeded (clinic_id) values ('${PC}') on conflict do nothing;
  insert into poultry_farms (id, clinic_id, name) values ('${FARM}', '${PC}', 'حقل المرآة') on conflict (id) do nothing;
  insert into products (id, clinic_id, name, sell_price, purchase_price, stock) values
         ${products}
    on conflict (id) do nothing;
  insert into products (id, clinic_id, name, sell_price, purchase_price, stock) values ('${id("OTHER")}', '${PO}', 'OTHER', 1000, 500, 1) on conflict (id) do nothing;
  insert into products (id, clinic_id, name, sell_price, purchase_price, stock, farm_id) values ('${id("FARMP")}', '${PC}', 'FARMP', 1000, 500, 1, '${FARM}') on conflict (id) do nothing;
${body}  delete from store_category_items where clinic_id = '${PC}';
  delete from store_categories where clinic_id = '${PC}';
  return 'ok';
end $fn$;
-- الحزمةُ تُنزل هذا الملفّ ثم تسأل: select _scp_run() — جملةٌ واحدة يقارن chk ناتجَها.
`;
  writeFileSync(join(outDir, "store-cats.sql"), sql);
  console.log(`   ✓ كُتب store-cats.sql بـ${plan.reduce((s, p) => s + p.steps.length, 0)} دفعة`);
}

console.log(fails
  ? `\n✗ store-cats-parity: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ store-cats-parity: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
