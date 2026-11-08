#!/usr/bin/env node
/* effect-blind يُفحص بسلوكه: حارسٌ لا يُرى فاشلاً مرّةً لا يُعرف أنه يحرس.
 * نسخةٌ من الهجرات بلا 0211 (آخرُ تعريفٍ هو 0205 الأعمى) ⇒ يفشل ويسمّي الدالّتين؛
 * ونسخةٌ فيها تعريفٌ لاحقٌ بتعليقٍ يذكر الكشفَ ولا يكتبه ⇒ يفشل أيضاً؛ والشجرةُ الحقيقية ⇒ يمرّ. */
import { mkdtempSync, readdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildModel, analyze, invoiceWriters, wiringChecks, atUsInline } from "./db-guard.mjs";

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

/* invoice-writers وconsumption-wiring (0252): كاتبٌ جديدٌ لسطور الفواتير بلا سببٍ مسمّى يفشل ويُسمّى (وتعليقٌ
 * يذكر الكتابةَ لا يُعدّ)، وبيعةٌ لاحقةٌ بلا تخطيطٍ ولا صرف تُسمّى، ومحفّزُ عكسٍ يُسقط أو يُعطَّل يُسمّى — وحذفُ
 * الكاتب وإعادةُ المحفّز وتفعيلُه يُرى. والغلافُ الذي تنشئه كتلةُ do (0241) هو آخرُ جسمٍ لا نصُّ 0110. */
const rule = (dir, r) => analyze(buildModel(dir)).filter((f) => f.rule === r).map((f) => f.where).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify([...b].sort());
const real = buildModel(MIG);
// ١٣ = عشرةُ 0252–0259 + كتّابُ الدولار الثلاثة (0264: usd_checkout وsettle_invoice_usd وvoid_usd_settlement) — كاتبٌ جديد يُقرأ ويُعدّ هنا.
ok(rule(MIG, "invoice-writers").length === 0 && invoiceWriters(real).length === 13, "الشجرةُ الحقيقية: ثلاثةَ عشرَ كاتباً للفواتير، كلٌّ بسببه بالقائمة");
ok(rule(MIG, "consumption-wiring").length === 0 && wiringChecks(real).length >= 15, "  والربطُ كامل: البيعةُ والتعديلُ والمرتجعُ والحذفُ والمحفّزات (١٥ رابطاً فأكثر)");
ok(real.fnBodies.get("edit_invoice_lines/3")?.file.startsWith("0241"), "  وغلافُ edit_invoice_lines آخرُه كتلةُ 0241 (do/execute) لا جسمُ 0110 الكاتب");
const iw = copy(() => true);
writeFileSync(join(iw, "0998_writer.sql"), `
create or replace function public.sneaky_fix(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.invoice_items set qty = 1 where id = p;
end $$;
create or replace function public.only_says(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- delete from invoice_items — تعليقٌ لا يكتب
  perform 1;
end $$;
create or replace function public.retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb) returns invoices
language plpgsql security definer set search_path = public as $$
begin
  insert into invoice_items (invoice_id) values (null);
  return null;
end $$;
drop trigger if exists invoice_items_consumption_del on public.invoice_items;
alter table public.products disable trigger products_waste_guard;`);
ok(same(rule(iw, "invoice-writers"), ["sneaky_fix (invoice_items)"]), "كاتبٌ جديدٌ لسطور الفواتير بلا سبب: يفشل ويسمّيه (والتعليقُ وحده لا يُعدّ)");
ok(same(rule(iw, "consumption-wiring"), [
  "retail_checkout/2 ⇐ _consumption_plan( — بلا _consumption_plan(",
  "retail_checkout/2 ⇐ _consumption_apply( — بلا _consumption_apply(",
  "محفّز invoice_items_consumption_del@invoice_items — غائب",
  "محفّز products_waste_guard@products — معطَّل",
]), "  وبيعةٌ لاحقةٌ بلا تخطيطٍ ولا صرف، ومحفّزٌ أُسقط وآخرُ عُطّل: تُسمّى كلُّها");
writeFileSync(join(iw, "0999_undo.sql"), `
drop function if exists public.sneaky_fix(uuid);
create trigger invoice_items_consumption_del after delete on public.invoice_items
  for each row execute function public.invoice_items_consumption_del();
alter table public.products enable trigger products_waste_guard;`);
ok(rule(iw, "invoice-writers").length === 0, "  وحذفُ الكاتب يُرى: لا كاتبَ بلا سبب");
ok(same(rule(iw, "consumption-wiring"), [
  "retail_checkout/2 ⇐ _consumption_plan( — بلا _consumption_plan(",
  "retail_checkout/2 ⇐ _consumption_apply( — بلا _consumption_apply(",
]), "  وإعادةُ المحفّز وتفعيلُه تُرى: تبقى البيعةُ وحدها");
rmSync(iw, { recursive: true, force: true });
const pre = copy((f) => f < "0252");
const preModel = buildModel(pre);
ok(wiringChecks(preModel).length === 0 && invoiceWriters(preModel).length === 10 && rule(pre, "invoice-writers").length === 0,
  "وقبل 0252 لا ربطَ يُطلب، والكتّابُ العشرة بأجسامهم الأقدم بالقائمة");
ok(atUsInline(preModel).length === 0 && rule(pre, "at-us-expr").length === 0, "  ولا مصدرَ واحدَ لـat_us يُطلب قبل 0252");
rmSync(pre, { recursive: true, force: true });

/* at-us-expr (0252 §6): at_us = _cons_at_us(created_at) دفعةُ الفعل، والواجهةُ تقارن دفعاتِ سند الهدر بأحداث الدفتر
 * بالتساوي — فقارئُ دفعاتٍ أحدث يحسب الميكروثانيةَ بنفسه (أو بـdate_part العائم) يُسمّى بالقاعدتين، وجسمٌ ينادي
 * _cons_at_us( يمرّ، والشجرةُ الحقيقية نظيفة. */
ok(rule(MIG, "at-us-expr").length === 0 && wiringChecks(real).some((c) => c.what.startsWith("invoice_consumption_get/1") && c.ok),
  "at_us: الشجرةُ الحقيقية لا تحسبه إلا بـ_cons_at_us، وآخرُ invoice_consumption_get ينادي _cons_at_us(");
const us = copy(() => true);
writeFileSync(join(us, "0999_us.sql"), `
create or replace function public.invoice_consumption_get(p_invoice_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  -- _cons_at_us( — تعليقٌ لا ينادي
  return (select jsonb_agg((extract(epoch from c.created_at) * 1000000)::bigint) from invoice_consumption c);
end $$;
create or replace function public.stock_waste_submit(p_lines jsonb, p_apply boolean default false, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from invoice_consumption c where 1e6 * date_part('epoch', c.created_at) = 0;
  return null;
end $$;`);
ok(same(rule(us, "at-us-expr"), [
  "invoice_consumption_get/1: ميكروثانيةٌ من الحقبة خارج _cons_at_us(",
  "stock_waste_submit/3: ميكروثانيةٌ من الحقبة خارج _cons_at_us(",
]) && same(rule(us, "consumption-wiring"), ["invoice_consumption_get/1 ⇐ _cons_at_us( — بلا _cons_at_us("]),
  "  وقارئٌ أحدث يحسب الميكروثانيةَ بنفسه، وكاتبٌ يقارن بـdate_part العائم: يُسمّيان (والتعليقُ لا ينادي)");
writeFileSync(join(us, "0999_us.sql"), `
create or replace function public.invoice_consumption_get(p_invoice_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  return (select jsonb_agg(public._cons_at_us(c.created_at)) from invoice_consumption c);
end $$;`);
ok(rule(us, "at-us-expr").length === 0 && rule(us, "consumption-wiring").length === 0, "  وبـ_cons_at_us( يمرّ");
/* والمليونُ بأيّ كتابةٍ له تعبيرٌ ثانٍ مثلُه: نمطٌ يعرف 1000000 و1e6 وحدهما كان يمرّر 10^6 و1000 * 1000 و1_000_000
 * (وpower(10, 6) و1e+6 و'epoch' بين علامتين) — كاتبٌ يقارن الدفعات بأيٍّ منها يُسمّى، كلٌّ وحده. */
for (const [spell, expr] of [
  ["10^6", "extract(epoch from c.created_at) * 10^6"],
  ["1000 * 1000", "extract(epoch from c.created_at) * 1000 * 1000"],
  ["1_000_000", "extract(epoch from c.created_at) * 1_000_000"],
  ["power(10, 6)", "power(10, 6) * extract(epoch from c.created_at)"],
  ["1e+6", "date_part('epoch', c.created_at) * 1e+6"],
  ["extract('epoch') * 1000000.0", "extract('epoch' from c.created_at) * 1000000.0"],
]) {
  writeFileSync(join(us, "0999_us.sql"), `
create or replace function public.stock_waste_submit(p_lines jsonb, p_apply boolean default false, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from invoice_consumption c where (${expr})::bigint = 0;
  return null;
end $$;`);
  ok(same(rule(us, "at-us-expr"), ["stock_waste_submit/3: ميكروثانيةٌ من الحقبة خارج _cons_at_us("]), `  والمليونُ بكتابة ${spell}: يُسمّى`);
}
rmSync(us, { recursive: true, force: true });

if (fail) { console.error(`effect-blind-test: ${fail} فشل`); process.exit(1); }
console.log("effect-blind-test: ٢٥ فحصاً عبرت (effect-blind ×٣، norm-reindex ×٤، invoice-writers/consumption-wiring ×٨، at-us ×١٠)");
