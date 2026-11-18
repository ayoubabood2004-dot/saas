-- ============================================================================
-- ٠٢٨٠ — أرشفةُ أدوية النظام: العيادةُ تخفي من القائمة الجاهزة ما لا تريده، أو تخفيها كلَّها وتبني قائمتها
--
-- طلبُ المالك (١٨/١١): «اكو عيادة تريد تأرشف الأدوية الموجودة وترتّب أدويتها بنفسها — سويلي النظام متطوّر»، وجوابُه بسؤال:
--   • **الاثنين**: زرٌّ يخفي قائمةَ النظام كلَّها مرّةً واحدة (العيادةُ تبني قائمتها وتضيف منها ما تريد)، وأرشفةُ أيّ دواءٍ
--     وحده أو بالتحديد الجماعيّ، والترجيعُ من «المؤرشفة».
--   • **كلُّ الكادر** (عدا موظّف التصوير) كباقي «أدويتي» (0229، جوابُ المالك ١).
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- قائمةُ المنتقي = كتالوجُ النظام (~١٢٠ دواء، بالشِفرة) + صفوفُ العيادة (`clinic_drugs`). الأرشفةُ (0229) تخصّ **الصفّ**:
-- دواءٌ أضافته العيادةُ يُؤرشف فيختفي، أمّا دواءُ النظام فلا صفَّ له يُؤرشف — وصفٌّ مؤرشفٌ باسمه لا يخفيه (الكتالوجُ يرسمه
-- بلا صفّ). فما كان لعيادةٍ أن تخفي دواءً جاهزاً واحداً، ولا القائمةَ كلَّها، إلا العائلةَ كاملةً (0268).
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • `clinic_drug_hidden`: اسمٌ أخفته العيادة من قائمة النظام — صفٌّ لكلّ اسم بمفتاح `search_norm` (مرآةُ `searchable()`،
--   الطرفان من نفس الدالّة؛ المحفّزُ يحسبه فلا يكتبه أحدٌ بيده). **خيارُ عرضٍ لا يمسّ صفّاً**: صفُّ الدواء (النجمة،
--   الموضع، التصنيف، سعرُ الجرعة 0269) يبقى كما هو، فالترجيعُ يعيده بمكانه. والسجلّاتُ القديمة لا تُمسّ أبداً.
-- • `clinic_drug_catalog.catalog_off`: «قائمةُ النظام مخفيّة» — يبقى ما للعيادة صفٌّ حيٌّ له (أدويتي، ما أضافته، ما نجّمته
--   أو صنّفته أو سعّرته) وما بالمخزن؛ ويختفي باقي الجاهز. عمودٌ لا صفوفُ أرشفة: دواءٌ يُضاف للكتالوج بنسخةٍ لاحقة لا يظهر
--   لعيادةٍ اختارت قائمتها.
-- • الكتابةُ من دالّتين (invoker — السياسةُ شرطُ العيادة لكلّ الكادر، وسياجُ المصوّر 0222):
--     `clinic_drug_hide(p_clinic, p_names, p_hide)` — دفعةٌ حتى ٥٠٠ اسم، تخفي أو تُرجع، وترجع عددَ ما تغيّر فعلاً؛
--     `clinic_drug_catalog_set(p_clinic, p_off)`.
--   وكلتاهما تسأل `p_clinic = auth_clinic()` كـ`clinic_drugs_apply` (المشغّلُ لحظةَ دخوله، أو جلسةٌ لم تستقرّ — 0153).
-- • التدقيقُ على الصفّين (إخفاءٌ وترجيعٌ بالاسم، وتبديلُ الزرّ) — «الدواء اختفى» يُحسم من سجلّ الحركات لا بالتخمين.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق قبل الواجهة — والواجهةُ قبلها (جدولٌ غائب) تُخفي أزرارَ الأرشفة وتعرض القائمةَ كما كانت.
-- ⚠ إعادةُ تعريف `search_norm` ⇒ المفاتيحُ المخزَّنة هنا تُعاد حسابُها: `update clinic_drug_hidden set name = name` (المحفّزُ يعيدها).
-- تراجع: drop function clinic_drug_hide(uuid, jsonb, boolean); drop function clinic_drug_catalog_set(uuid, boolean);
--   drop table clinic_drug_hidden; drop table clinic_drug_catalog; drop function clinic_drug_hidden_key();
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) الجدولان ──────────────────────────────────────────────────────────────
create table if not exists public.clinic_drug_hidden (
  id         uuid not null default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  name_key   text not null,
  name       text not null check (char_length(name) between 1 and 120),
  hidden_at  timestamptz not null default now(),
  hidden_by  uuid default auth.uid(),
  primary key (clinic_id, name_key)
);
comment on table public.clinic_drug_hidden is
  'أدويةُ النظام التي أخفتها العيادة (0280): خيارُ عرضٍ بالاسم — لا يمسّ صفَّ الدواء ولا السجلّات. الكتابة عبر clinic_drug_hide.';

create table if not exists public.clinic_drug_catalog (
  clinic_id   uuid primary key default auth_clinic() references auth.users(id) on delete cascade,
  catalog_off boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
comment on table public.clinic_drug_catalog is
  'قائمةُ النظام للعيادة (0280): catalog_off = تعرض العيادةُ قائمتَها وحدها (وما بالمخزن). الكتابة عبر clinic_drug_catalog_set.';

-- المفتاحُ يحسبه الخادم دائماً (searchable() بالواجهة ↔ search_norm هنا): كتابةٌ مباشرة لا تقدر تضع مفتاحاً غيرَ اسمه.
create or replace function public.clinic_drug_hidden_key()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.name := btrim(coalesce(new.name, ''), E' \t\r\n');
  new.name_key := search_norm(new.name);
  if new.name_key = '' or char_length(new.name) > 120 then
    raise exception 'clinic_drugs_bad_name' using hint = 'اسم الدواء لازم يكون بين حرف و١٢٠ حرفاً.';
  end if;
  if tg_op = 'UPDATE' and current_user = 'authenticated'
     and (new.clinic_id is distinct from old.clinic_id or new.id is distinct from old.id) then
    raise exception 'clinic_drugs_frozen' using hint = 'هوية الدواء وعيادته ما تتغيّر';
  end if;
  return new;
end $$;
drop trigger if exists clinic_drug_hidden_key on public.clinic_drug_hidden;
create trigger clinic_drug_hidden_key before insert or update on public.clinic_drug_hidden
  for each row execute function public.clinic_drug_hidden_key();

-- ── ٢) السياسات: ملكيّةٌ وحدها، ملفوفةٌ للتخطيط (0159/0162) ─────────────────────────
alter table public.clinic_drug_hidden enable row level security;
drop policy if exists clinic_drug_hidden_select on public.clinic_drug_hidden;
create policy clinic_drug_hidden_select on public.clinic_drug_hidden
  for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_hidden_insert on public.clinic_drug_hidden;
create policy clinic_drug_hidden_insert on public.clinic_drug_hidden
  for insert to authenticated with check (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_hidden_delete on public.clinic_drug_hidden;
create policy clinic_drug_hidden_delete on public.clinic_drug_hidden
  for delete to authenticated using (clinic_id = (select auth_clinic()));
revoke all on table public.clinic_drug_hidden from public, anon, authenticated;
grant select, insert, delete on table public.clinic_drug_hidden to authenticated;

alter table public.clinic_drug_catalog enable row level security;
drop policy if exists clinic_drug_catalog_select on public.clinic_drug_catalog;
create policy clinic_drug_catalog_select on public.clinic_drug_catalog
  for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_catalog_insert on public.clinic_drug_catalog;
create policy clinic_drug_catalog_insert on public.clinic_drug_catalog
  for insert to authenticated with check (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_catalog_update on public.clinic_drug_catalog;
create policy clinic_drug_catalog_update on public.clinic_drug_catalog
  for update to authenticated using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()));
revoke all on table public.clinic_drug_catalog from public, anon, authenticated;
grant select, insert, update on table public.clinic_drug_catalog to authenticated;

select public.photographer_fence_table('clinic_drug_hidden'), public.photographer_fence_table('clinic_drug_catalog');

-- ── ٣) التدقيق: الإخفاءُ والترجيعُ بالاسم، وتبديلُ الزرّ ─────────────────────────────
drop trigger if exists audit_all on public.clinic_drug_hidden;
create trigger audit_all after insert or delete on public.clinic_drug_hidden
  for each row execute function audit_change();
drop trigger if exists audit_all on public.clinic_drug_catalog;
create trigger audit_all after insert or update of catalog_off on public.clinic_drug_catalog
  for each row execute function audit_change();

-- ── ٤) الإخفاءُ والترجيع: دفعةٌ بالأسماء ──────────────────────────────────────────────
-- p_names: مصفوفةُ أسماء (نصوص) حتى ٥٠٠. p_hide = true يخفي (الموجودُ لا يُكتب ثانيةً)، false يُرجع (الغائبُ لا شيء).
-- يرجع { changed } = ما تغيّر فعلاً — الشاشةُ تقوله ولا تقول «تمّ» عن صفر.
create or replace function public.clinic_drug_hide(p_clinic uuid, p_names jsonb, p_hide boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_names  text[];
  v_n      int := 0;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'clinic_switched' using hint = 'تبدّلت العيادة على هذا الجهاز — حدّث الصفحة. ما انحفظ شي.';
  end if;
  if p_names is null or jsonb_typeof(p_names) <> 'array' or p_hide is null
     or exists (select 1 from jsonb_array_elements(p_names) e where jsonb_typeof(e) <> 'string') then
    raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
  end if;
  if jsonb_array_length(p_names) > 500 then
    raise exception 'too_many_ops' using hint = 'تعديلات كثيرة بطلب واحد — حدّث الصفحة وجرّب أقل.';
  end if;
  select coalesce(array_agg(btrim(e, E' \t\r\n')), '{}') into v_names from jsonb_array_elements_text(p_names) e;
  if exists (select 1 from unnest(v_names) n where search_norm(n) = '' or char_length(n) > 120) then
    raise exception 'clinic_drugs_bad_name' using hint = 'اسم الدواء لازم يكون بين حرف و١٢٠ حرفاً.';
  end if;

  if p_hide then
    -- اسمان بمفتاحٍ واحد بنفس الدفعة ⇒ الأوّل (distinct on).
    insert into clinic_drug_hidden (clinic_id, name)
    select distinct on (search_norm(n)) v_clinic, n from unnest(v_names) with ordinality as x(n, i) order by search_norm(n), i
    on conflict (clinic_id, name_key) do nothing;
    get diagnostics v_n = row_count;
  else
    delete from clinic_drug_hidden h
     where h.clinic_id = v_clinic and h.name_key in (select search_norm(n) from unnest(v_names) n);
    get diagnostics v_n = row_count;
  end if;
  return jsonb_build_object('changed', v_n);
end $$;
revoke all on function public.clinic_drug_hide(uuid, jsonb, boolean) from public, anon;
grant execute on function public.clinic_drug_hide(uuid, jsonb, boolean) to authenticated;

-- ── ٥) قائمةُ النظام: ظاهرةٌ أو مخفيّة ─────────────────────────────────────────────
create or replace function public.clinic_drug_catalog_set(p_clinic uuid, p_off boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_was    boolean;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'clinic_switched' using hint = 'تبدّلت العيادة على هذا الجهاز — حدّث الصفحة. ما انحفظ شي.';
  end if;
  if p_off is null then
    raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
  end if;
  select c.catalog_off into v_was from clinic_drug_catalog c where c.clinic_id = v_clinic;
  insert into clinic_drug_catalog (clinic_id, catalog_off, updated_at, updated_by)
  values (v_clinic, p_off, now(), auth.uid())
  on conflict (clinic_id) do update set catalog_off = excluded.catalog_off, updated_at = now(), updated_by = auth.uid()
   where clinic_drug_catalog.catalog_off is distinct from excluded.catalog_off;
  return jsonb_build_object('off', p_off, 'changed', coalesce(v_was, false) is distinct from p_off);
end $$;
revoke all on function public.clinic_drug_catalog_set(uuid, boolean) from public, anon;
grant execute on function public.clinic_drug_catalog_set(uuid, boolean) to authenticated;
