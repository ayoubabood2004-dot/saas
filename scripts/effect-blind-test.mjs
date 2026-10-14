#!/usr/bin/env node
/* effect-blind يُفحص بسلوكه: حارسٌ لا يُرى فاشلاً مرّةً لا يُعرف أنه يحرس.
 * نسخةٌ من الهجرات بلا 0211 (آخرُ تعريفٍ هو 0205 الأعمى) ⇒ يفشل ويسمّي الدالّتين؛
 * ونسخةٌ فيها تعريفٌ لاحقٌ بتعليقٍ يذكر الكشفَ ولا يكتبه ⇒ يفشل أيضاً؛ والشجرةُ الحقيقية ⇒ يمرّ. */
import { mkdtempSync, readdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildModel, analyze } from "./db-guard.mjs";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
let fail = 0;
const ok = (c, msg) => { if (c) console.log(`  ✓ ${msg}`); else { fail++; console.error(`  ✗ ${msg}`); } };
const blind = (dir) => analyze(buildModel(dir)).filter((f) => f.rule === "effect-blind").map((f) => f.where).sort().join(",");

const copy = (keep) => {
  const d = mkdtempSync(join(tmpdir(), "eb-"));
  for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && keep(f))) copyFileSync(join(MIG, f), join(d, f));
  return d;
};

ok(blind(MIG) === "", "الشجرةُ الحقيقية: آخرُ تعريفٍ للدالّتين يكتب الكشف");

const cut = copy((f) => f < "0211");
ok(blind(cut) === "record_purchase,update_purchase", "بلا 0211: الحارسُ يفشل ويسمّي الدالّتين");

writeFileSync(join(cut, "0999_blind.sql"), `
create or replace function public.record_purchase(p_lines jsonb, p_meta jsonb default '{}') returns purchases
language plpgsql security definer set search_path = public as $$
begin
  -- insert into purchase_effects — تعليقٌ لا يكتب
  update products set stock = stock + 1 where false;
  return null;
end $$;`);
ok(blind(cut).startsWith("record_purchase"), "تعريفٌ لاحقٌ يذكر الكشفَ بتعليقٍ فقط: يفشل");
rmSync(cut, { recursive: true, force: true });

/* norm-reindex (0229، 0233، 0239): فهارسُ «أدويتي» وتصنيفاتِ المتجر وتصنيفاتِ الأدوية الفريدة مبنيّةٌ
 * على search_norm(name). هجرةٌ لاحقة تعيد تعريفَ الدالّة بلا reindex تتركها بمفاتيحَ قديمة — يفشل الحارسُ
 * ويسمّي كلَّ فهرسٍ والملفّ، وبالـreindex لكلّها يمرّ (ولبعضها يسمّي الباقي). والشجرةُ الحقيقية لا تعيد
 * تعريفها بعد 0229. */
const reNorm = (dir) => analyze(buildModel(dir)).filter((f) => f.rule === "norm-reindex").map((f) => f.where).join(",");
ok(reNorm(MIG) === "", "الشجرةُ الحقيقية: لا تعريفَ لـsearch_norm بعد فهارس 0229 و0233 و0239");
const nr = copy(() => true);
const redefine = `
create or replace function search_norm(t text) returns text
language sql immutable set search_path = public as $$ select lower(coalesce(t, '')) $$;`;
writeFileSync(join(nr, "0999_norm.sql"), redefine);
ok(reNorm(nr) === "clinic_drugs_name_uq ← 0999_norm.sql,store_categories_name_uq ← 0999_norm.sql,clinic_drug_groups_name_uq ← 0999_norm.sql", "تعريفٌ لاحقٌ بلا reindex: يفشل ويسمّي الفهارسَ الثلاثة والملفّ");
writeFileSync(join(nr, "0999_norm.sql"), `${redefine}\nreindex index public.clinic_drugs_name_uq;`);
ok(reNorm(nr) === "store_categories_name_uq ← 0999_norm.sql,clinic_drug_groups_name_uq ← 0999_norm.sql", "  وبـreindex لفهرس «أدويتي» وحده: يسمّي فهرسَي التصنيفات (0233، 0239)");
writeFileSync(join(nr, "0999_norm.sql"), `${redefine}\nreindex index public.clinic_drugs_name_uq;\nreindex index public.store_categories_name_uq;\nreindex index public.clinic_drug_groups_name_uq;`);
ok(reNorm(nr) === "", "  وبـreindex index للثلاثة: يمرّ");
rmSync(nr, { recursive: true, force: true });

if (fail) { console.error(`effect-blind-test: ${fail} فشل`); process.exit(1); }
console.log("effect-blind-test: ٧ فحوص عبرت (effect-blind ×٣، norm-reindex ×٤)");
