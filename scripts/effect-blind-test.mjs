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

if (fail) { console.error(`effect-blind-test: ${fail} فشل`); process.exit(1); }
console.log("effect-blind-test: ٣ فحوص عبرت");
