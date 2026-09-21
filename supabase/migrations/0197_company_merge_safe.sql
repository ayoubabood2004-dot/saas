-- ============================================================================
-- ٠١٩٧ — لا تُفلت شركة: الطيُّ لا يفقد شيئاً، والحذفُ صار قابلاً للرجوع
--
-- ── لماذا هذه الهجرة، مقيساً ────────────────────────────────────────────
-- 0196 أعطت طيّاً سليماً — لكنها **دوالُّ فقط**، فبقي بابان مفتوحان:
--
-- ١) **الحذفُ الخامّ ما زال الطريقَ الوحيد الذي تصله العيادة.** لا محفّزَ قبل
--    الحذف على `companies` ولا سلّة، و`repo.deleteCompany` تحذف مباشرةً بزرٍّ
--    مؤكَّدٍ بـ`window.confirm`. وسجلُّ التدقيق يقول إنّ هذا **يحصل الآن**:
--    سبعةٌ وعشرون حذفَ شركةٍ منذ ١٨ أيلول، ومعها **عشرةُ منتجاتٍ** صار
--    `company_id` فيها NULL **بنفس الطابع الزمنيّ ونفس المعرّف** — رِجلُ
--    `on delete set null` تعمل. وسبعةٌ وعشرون صنفاً مُحيت بالتتالي بلا سلّة.
--    وهذا بعينه ما تقول ترويسةُ 0196 إنها جاءت لتمنعه.
--
-- ٢) **وطيُّ صنفٍ يمحو حوضه.** `company_sections.pooled_stock` وحداتٌ تُباع
--    فعلاً (`deduct_stock_pooled`, 0066). وحلقةُ 0196 تنقل الصفَّ حين لا مقابلَ
--    له (فيُحفظ الحوض) وتحذفه حين يتطابق الاسم (فيتبخّر) — تناقضُ فرعَين
--    بحلقةٍ واحدة، وهو برهانُ أنه سهوٌ لا قرار. اليوم خسارتُه صفرٌ مقيس، لكنّ
--    الدالّةَ دائمةٌ وممنوحةٌ لكلّ مدير.
--
-- ── القاعدةُ الحاكمة ────────────────────────────────────────────────────
-- **الحمايةُ على الجدول الذي يُفقد، لا على أحد طرقه** — درسُ 0146 حرفياً.
-- محفّزٌ قبل الحذف يصوّر أيَّ شركةٍ أو صنفٍ يخرج بأيّ طريق: طيٌّ، أو زرٌّ
-- بنسخةٍ قديمة، أو `DELETE` مباشرٌ من PostgREST، أو لوحةُ Supabase.
--
-- ── ولماذا `merge_companies` تصير بصلاحية المُعرِّف ─────────────────────
-- صارت تكتب بجداولَ سياستُها **قراءةٌ فقط** (`companies_trash`،
-- `company_merges`، `products_trash`). وبصلاحية المُستدعي تكون النتيجةُ
-- **صفرَ صفوفٍ بلا خطأ** — «الكتابةُ تُسمَع» بـCLAUDE.md حرفياً، والحزمةُ لا
-- تمسكها لأنها superuser. فصارت definer، ومعها **فحصُ العيادة والدور بنفسها**
-- (درس 0145)، و**كلُّ `where` مقيَّدةٌ بـ`clinic_id` نصّاً** لأن definer يتجاوز
-- سياسةَ الصفوف فالشرطُ الضمنيُّ سقط.
--
-- تراجع: بترويسة كلّ قسم أدناه.
-- تُطبَّق بعد 0196.
-- ============================================================================

-- ── ١) السلّة: صورةُ ما يخرج ───────────────────────────────────────────────
-- بلا مفتاحٍ أجنبيٍّ إلى `companies` — الصفُّ محذوف. نفسُ منطق `products_trash.id`.
create table if not exists companies_trash (
  id           uuid primary key,
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  row          jsonb not null,
  merged_into  uuid,                                   -- null = حذفٌ صريح، وإلا طيّ
  product_ids  uuid[] not null default '{}',
  purchase_ids uuid[] not null default '{}',
  payment_ids  uuid[] not null default '{}',
  charge_ids   uuid[] not null default '{}',
  -- لكلّ صنف: {id, name, pooled_moved, folded_into, product_ids}
  -- و`pooled_moved` هو ما أُضيف فعلاً لحوض الباقي، ليطرحه الفكُّ بالضبط.
  sections     jsonb not null default '[]'::jsonb,
  reason       text,
  deleted_by   uuid default auth.uid(),
  deleted_at   timestamptz not null default now()
);
create index if not exists companies_trash_clinic_idx on companies_trash(clinic_id, deleted_at desc);
alter table companies_trash enable row level security;
drop policy if exists companies_trash_read on companies_trash;
create policy companies_trash_read on companies_trash for select
  using (clinic_id = (select auth_clinic()));
comment on table companies_trash is
  'صورةُ شركةٍ خرجت بأي طريق (0197): طيّ، أو حذفٌ مباشر. تُقرأ بالعيادة، ولا تُكتب إلا بصلاحية المُعرِّف.';

create table if not exists company_sections_trash (
  id           uuid primary key,
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  company_id   uuid,
  row          jsonb not null,
  folded_into  uuid,
  pooled_moved numeric not null default 0,
  product_ids  uuid[] not null default '{}',
  deleted_by   uuid default auth.uid(),
  deleted_at   timestamptz not null default now()
);
create index if not exists company_sections_trash_clinic_idx on company_sections_trash(clinic_id, deleted_at desc);
alter table company_sections_trash enable row level security;
drop policy if exists company_sections_trash_read on company_sections_trash;
create policy company_sections_trash_read on company_sections_trash for select
  using (clinic_id = (select auth_clinic()));

-- ── ٢) دفترُ الطيّ: من طُويت بمن ───────────────────────────────────────────
-- بلا هذا يستحيل ثلاثةُ أشياء: التراجع، وإعادةُ توجيه طابور الصادر بعد رجوع
-- الشبكة، وشرحُ «لماذا اختفت شركتي».
create table if not exists company_merges (
  from_id   uuid primary key,
  to_id     uuid not null,
  clinic_id uuid not null,
  from_name text,
  merged_by uuid default auth.uid(),
  merged_at timestamptz not null default now()
);
create index if not exists company_merges_clinic_idx on company_merges(clinic_id, merged_at desc);
alter table company_merges enable row level security;
drop policy if exists company_merges_read on company_merges;
create policy company_merges_read on company_merges for select
  using (clinic_id = (select auth_clinic()));

-- معرّفٌ مات ⇒ أين ذهب. يتبع السلسلة بحدِّ عمقٍ كي لا يدور لو تشابكت.
create or replace function public.company_redirect(p_id uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare v_id uuid := p_id; v_next uuid; i int := 0;
begin
  while i < 16 loop
    if exists (select 1 from companies where id = v_id) then return v_id; end if;
    select to_id into v_next from company_merges where from_id = v_id;
    if v_next is null then return null; end if;
    v_id := v_next; i := i + 1;
  end loop;
  return null;
end $$;
revoke all on function public.company_redirect(uuid) from public, anon;
grant execute on function public.company_redirect(uuid) to authenticated;

-- ── ٣) الحارسان: أيُّ صفٍّ يخرج يُصوَّر قبل أن يخرج ────────────────────────
-- (نسخةُ `products_trash_capture` بـ0146 شكلاً وشرطاً.)
create or replace function public.companies_trash_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- الطيُّ سجّل الصفَّ بتفاصيله قبلنا — أوّلُ صورةٍ هي الصورة (درس 0157).
  if exists (select 1 from companies_trash where id = old.id) then return old; end if;
  -- حذفُ الحساب نفسه (تتالٍ من auth.users): لا صاحبَ للسلّة والمفتاحُ يرفض.
  if old.clinic_id is null or not exists (select 1 from auth.users where id = old.clinic_id) then return old; end if;

  insert into companies_trash (id, clinic_id, row, product_ids, purchase_ids, payment_ids, charge_ids, sections)
  select old.id, old.clinic_id, to_jsonb(old),
         coalesce((select array_agg(id) from products          where company_id = old.id), '{}'),
         coalesce((select array_agg(id) from purchases         where company_id = old.id), '{}'),
         coalesce((select array_agg(id) from purchase_payments where company_id = old.id), '{}'),
         coalesce((select array_agg(id) from company_charges   where company_id = old.id), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object(
                    'id', s.id, 'name', s.name, 'pooled_moved', 0, 'folded_into', null,
                    'product_ids', coalesce((select array_agg(p.id) from products p where p.section_id = s.id), '{}')))
                   from company_sections s where s.company_id = old.id), '[]'::jsonb)
  on conflict (id) do nothing;
  return old;
end $$;

drop trigger if exists companies_trash_guard on companies;
create trigger companies_trash_guard
  before delete on companies
  for each row execute function companies_trash_capture();

create or replace function public.company_sections_trash_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from company_sections_trash where id = old.id) then return old; end if;
  if old.clinic_id is null or not exists (select 1 from auth.users where id = old.clinic_id) then return old; end if;
  insert into company_sections_trash (id, clinic_id, company_id, row, pooled_moved, product_ids)
  select old.id, old.clinic_id, old.company_id, to_jsonb(old), 0,
         coalesce((select array_agg(p.id) from products p where p.section_id = old.id), '{}')
  on conflict (id) do nothing;
  return old;
end $$;

drop trigger if exists company_sections_trash_guard on company_sections;
create trigger company_sections_trash_guard
  before delete on company_sections
  for each row execute function company_sections_trash_capture();

-- ── ٤) الطيُّ من جديد: definer، ولا يفقد عدداً ولا نصّاً ──────────────────
create or replace function public.merge_companies(p_keep uuid, p_drop uuid)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_keep   companies;
  v_drop   companies;
  v_sec    company_sections;
  v_match  uuid;
  v_secs   jsonb := '[]'::jsonb;
  v_moved  numeric;
begin
  -- definer يتجاوز سياسةَ الصفوف، فالفحصُ صريحٌ بنفسها (درس 0145) —
  -- و**كلُّ `where` أدناه مقيَّدةٌ بـ`clinic_id` نصّاً** لأن الشرطَ الضمنيّ سقط.
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'طيُّ الشركات للمدير والطبيب.';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'bad_merge' using hint = 'اختر شركتين مختلفتين.';
  end if;

  -- القفلُ يصطدم بـ`FOR KEY SHARE` الذي يأخذه أيُّ إدراجِ منتجٍ متزامنٍ بهذه
  -- الشركة، فيتسلسلان: إمّا يسبق الإدراجُ فيُنقل، أو يتأخّر فيرمي 23503 بصوت.
  select * into v_keep from companies where id = p_keep and clinic_id = v_clinic for update;
  if not found then raise exception 'no_keep' using hint = 'الشركةُ الباقيةُ غيرُ موجودة بعيادتك.'; end if;
  select * into v_drop from companies where id = p_drop and clinic_id = v_clinic for update;
  if not found then raise exception 'no_drop' using hint = 'الشركةُ المطويّةُ غيرُ موجودة بعيادتك.'; end if;

  -- اللقطةُ **قبل** أيّ تعديلٍ يمحو الحالةَ القديمة.
  insert into companies_trash (id, clinic_id, row, merged_into, product_ids, purchase_ids, payment_ids, charge_ids, sections)
  select p_drop, v_clinic, to_jsonb(v_drop), p_keep,
         coalesce((select array_agg(id) from products          where company_id = p_drop and clinic_id = v_clinic), '{}'),
         coalesce((select array_agg(id) from purchases         where company_id = p_drop and clinic_id = v_clinic), '{}'),
         coalesce((select array_agg(id) from purchase_payments where company_id = p_drop and clinic_id = v_clinic), '{}'),
         coalesce((select array_agg(id) from company_charges   where company_id = p_drop and clinic_id = v_clinic), '{}'),
         '[]'::jsonb
  on conflict (id) do nothing;

  insert into company_merges (from_id, to_id, clinic_id, from_name)
  values (p_drop, p_keep, v_clinic, v_drop.name)
  on conflict (from_id) do nothing;

  update products          set company_id = p_keep where company_id = p_drop and clinic_id = v_clinic;
  update purchases         set company_id = p_keep, company_name = v_keep.name
                         where company_id = p_drop and clinic_id = v_clinic;
  update purchase_payments set company_id = p_keep where company_id = p_drop and clinic_id = v_clinic;
  update company_charges   set company_id = p_keep where company_id = p_drop and clinic_id = v_clinic;

  -- لقطاتُ السلّة: منتجٌ محذوفٌ صورتُه تحمل شركةً طُويت كان يصير **غيرَ قابلٍ
  -- للاسترجاع للأبد** (الإدراجُ يخرق المفتاحَ الأجنبيّ فيرمي 23503).
  update products_trash
     set row = jsonb_set(row, '{company_id}', to_jsonb(p_keep::text))
   where clinic_id = v_clinic and (row->>'company_id')::uuid = p_drop;

  for v_sec in select * from company_sections where company_id = p_drop and clinic_id = v_clinic loop
    select id into v_match from company_sections
     where company_id = p_keep and clinic_id = v_clinic
       and inv_norm_group(name) = inv_norm_group(v_sec.name)
     order by created_at limit 1;
    if v_match is not null then
      -- **الحوضُ يُجمع قبل الحذف.** وحداتٌ تُباع فعلاً؛ كانت تتبخّر بهذا الفرع
      -- وحدَه بينما الفرعُ الآخر يحفظها — تناقضٌ كان سهواً لا قراراً.
      v_moved := round(coalesce(v_sec.pooled_stock, 0), 3);
      update company_sections set pooled_stock = round(coalesce(pooled_stock, 0) + v_moved, 3)
       where id = v_match and clinic_id = v_clinic;
      update products set section_id = v_match where section_id = v_sec.id and clinic_id = v_clinic;
      update products_trash set row = jsonb_set(row, '{section_id}', to_jsonb(v_match::text))
       where clinic_id = v_clinic and (row->>'section_id')::uuid = v_sec.id;
      v_secs := v_secs || jsonb_build_object(
        'id', v_sec.id, 'name', v_sec.name, 'pooled_moved', v_moved, 'folded_into', v_match,
        'product_ids', coalesce((select array_agg(p.id) from products p where p.section_id = v_match and p.clinic_id = v_clinic), '{}'));
      delete from company_sections where id = v_sec.id and clinic_id = v_clinic;
    else
      update company_sections set company_id = p_keep where id = v_sec.id and clinic_id = v_clinic;
      v_secs := v_secs || jsonb_build_object(
        'id', v_sec.id, 'name', v_sec.name, 'pooled_moved', 0, 'folded_into', null, 'product_ids', '{}'::uuid[]);
    end if;
  end loop;

  update companies_trash set sections = v_secs where id = p_drop;

  -- **الملاحظةُ اتّحادٌ لا `coalesce`**: حقلٌ تكتبه العيادة («الوكيل الرسمي،
  -- رقم المندوب…») — لو حمل الطرفان نصّاً ضاع أحدُهما. وشرطُ التساوي يمنع
  -- تكديسَ نفس النصّ عند طيٍّ متكرّر.
  update companies
     set note = nullif(btrim(case
           when btrim(coalesce(v_keep.note, '')) = btrim(coalesce(v_drop.note, ''))
             then coalesce(v_keep.note, v_drop.note)
           else concat_ws(E'\n', nullif(btrim(v_keep.note), ''), nullif(btrim(v_drop.note), ''))
         end), '')
   where id = p_keep and clinic_id = v_clinic
  returning * into v_keep;

  delete from companies where id = p_drop and clinic_id = v_clinic;
  return v_keep;
end $$;

revoke all on function public.merge_companies(uuid, uuid) from public, anon;
grant execute on function public.merge_companies(uuid, uuid) to authenticated;

comment on function public.merge_companies(uuid, uuid) is
  'طيُّ شركةٍ توأمٍ بأختها (0197): يصوّر ثم ينقل كلَّ ما يشير إليها — منتجاتٍ وفواتيرَ ودفعاتٍ ومطالباتٍ وأصنافاً بحوضها — ثم يحذف. ويُفَكّ بـunmerge_company.';

-- وطيُّ الصنف: يجمع الحوضَ، ويشترط أنهما لشركةٍ واحدة — وإلّا هبطت منتجاتُ
-- شركةٍ بصنفِ شركةٍ أخرى بينما `products.company_id` باقٍ على الأولى.
create or replace function public.merge_company_sections(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_keep   company_sections;
  v_drop   company_sections;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'طيُّ الأصناف للمدير والطبيب.';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'bad_merge' using hint = 'اختر صنفين مختلفين.';
  end if;
  select * into v_keep from company_sections where id = p_keep and clinic_id = v_clinic for update;
  if not found then raise exception 'bad_section' using hint = 'الصنفُ الباقي غيرُ موجود بعيادتك.'; end if;
  select * into v_drop from company_sections where id = p_drop and clinic_id = v_clinic for update;
  if not found then raise exception 'bad_section' using hint = 'الصنفُ المطويّ غيرُ موجود بعيادتك.'; end if;
  if v_keep.company_id is distinct from v_drop.company_id then
    raise exception 'cross_company' using hint = 'الصنفان لازم يكونان بنفس الشركة.';
  end if;

  insert into company_sections_trash (id, clinic_id, company_id, row, folded_into, pooled_moved, product_ids)
  select p_drop, v_clinic, v_drop.company_id, to_jsonb(v_drop), p_keep,
         round(coalesce(v_drop.pooled_stock, 0), 3),
         coalesce((select array_agg(p.id) from products p where p.section_id = p_drop and p.clinic_id = v_clinic), '{}')
  on conflict (id) do nothing;

  update company_sections
     set pooled_stock = round(coalesce(pooled_stock, 0) + round(coalesce(v_drop.pooled_stock, 0), 3), 3)
   where id = p_keep and clinic_id = v_clinic;
  update products set section_id = p_keep where section_id = p_drop and clinic_id = v_clinic;
  update products_trash set row = jsonb_set(row, '{section_id}', to_jsonb(p_keep::text))
   where clinic_id = v_clinic and (row->>'section_id')::uuid = p_drop;
  delete from company_sections where id = p_drop and clinic_id = v_clinic;
end $$;

revoke all on function public.merge_company_sections(uuid, uuid) from public, anon;
grant execute on function public.merge_company_sections(uuid, uuid) to authenticated;

-- ── ٥) الفكُّ والاسترجاع — بنفس المعرّف، وبطرحِ ما أُضيف بالضبط ───────────
-- سُنّةُ 0145: يرجع **بنفس معرّفه** فتعود كلُّ إشارةٍ إليه صحيحة.
create or replace function public.restore_company(p_id uuid)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_t      companies_trash;
  v_row    companies;
  v_sec    jsonb;
  v_moved  numeric;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'الاسترجاعُ للمدير والطبيب.';
  end if;
  select * into v_t from companies_trash where id = p_id and clinic_id = v_clinic;
  if not found then raise exception 'not_in_trash' using hint = 'ما لكينا صورةً لهذه الشركة.'; end if;
  if exists (select 1 from companies where id = p_id) then
    raise exception 'already_there' using hint = 'الشركةُ موجودةٌ أصلاً.';
  end if;

  insert into companies select * from jsonb_populate_record(null::companies, v_t.row);
  select * into v_row from companies where id = p_id;

  -- **بشرط أنها ما زالت حيث تركها الطيّ**: صفٌّ نُقل يدوياً بعده لا يُخطَف.
  if v_t.merged_into is not null then
    update products set company_id = p_id
     where id = any (v_t.product_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update purchases set company_id = p_id, company_name = coalesce(v_t.row->>'name', company_name)
     where id = any (v_t.purchase_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update purchase_payments set company_id = p_id
     where id = any (v_t.payment_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update company_charges set company_id = p_id
     where id = any (v_t.charge_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update products_trash set row = jsonb_set(row, '{company_id}', to_jsonb(p_id::text))
     where clinic_id = v_clinic and (row->>'company_id')::uuid = v_t.merged_into
       and (row->>'id')::uuid = any (v_t.product_ids);
  else
    update products          set company_id = p_id where id = any (v_t.product_ids)  and clinic_id = v_clinic and company_id is null;
    update purchases         set company_id = p_id where id = any (v_t.purchase_ids) and clinic_id = v_clinic and company_id is null;
    update purchase_payments set company_id = p_id where id = any (v_t.payment_ids)  and clinic_id = v_clinic and company_id is null;
  end if;

  for v_sec in select * from jsonb_array_elements(coalesce(v_t.sections, '[]'::jsonb)) loop
    v_moved := coalesce((v_sec->>'pooled_moved')::numeric, 0);
    if (v_sec->>'folded_into') is not null then
      -- الصنفُ طُوي بصنفٍ قائم: يُستعاد من سلّة الأصناف إن وُجدت صورتُه،
      -- ويُطرح من حوض الباقي **ما أُضيف بالضبط** لا تخميناً.
      if not exists (select 1 from company_sections where id = (v_sec->>'id')::uuid) then
        insert into company_sections
        select * from jsonb_populate_record(null::company_sections,
          (select row from company_sections_trash where id = (v_sec->>'id')::uuid and clinic_id = v_clinic))
        on conflict (id) do nothing;
      end if;
      if v_moved <> 0 then
        update company_sections set pooled_stock = round(greatest(0, coalesce(pooled_stock, 0) - v_moved), 3)
         where id = (v_sec->>'folded_into')::uuid and clinic_id = v_clinic;
        update company_sections set pooled_stock = v_moved
         where id = (v_sec->>'id')::uuid and clinic_id = v_clinic;
      end if;
      update products set section_id = (v_sec->>'id')::uuid
       where clinic_id = v_clinic and section_id = (v_sec->>'folded_into')::uuid
         and id = any (coalesce((select array_agg((x)::uuid) from jsonb_array_elements_text(v_sec->'product_ids') x), '{}'));
    else
      update company_sections set company_id = p_id
       where id = (v_sec->>'id')::uuid and clinic_id = v_clinic and company_id = v_t.merged_into;
    end if;
  end loop;

  delete from company_merges where from_id = p_id and clinic_id = v_clinic;
  delete from companies_trash where id = p_id and clinic_id = v_clinic;
  return v_row;
end $$;

revoke all on function public.restore_company(uuid) from public, anon;
grant execute on function public.restore_company(uuid) to authenticated;

comment on function public.restore_company(uuid) is
  'يعيد شركةً من السلّة بنفس معرّفها (0197)، ويردّ ما انتقل عنها **بشرط أنه ما زال حيث تركه الطيّ** — فلا يخطف صفّاً نُقل بعده يدوياً.';

create or replace function public.restore_company_section(p_id uuid)
returns company_sections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_t      company_sections_trash;
  v_row    company_sections;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'الاسترجاعُ للمدير والطبيب.';
  end if;
  select * into v_t from company_sections_trash where id = p_id and clinic_id = v_clinic;
  if not found then raise exception 'not_in_trash' using hint = 'ما لكينا صورةً لهذا الصنف.'; end if;
  if exists (select 1 from company_sections where id = p_id) then
    raise exception 'already_there' using hint = 'الصنفُ موجودٌ أصلاً.';
  end if;
  -- شركتُه لازم تكون قائمة — وإلا فالمفتاحُ الأجنبيُّ يرمي بلا رسالةٍ مفهومة.
  if v_t.company_id is not null and not exists (select 1 from companies where id = v_t.company_id and clinic_id = v_clinic) then
    raise exception 'no_company' using hint = 'شركةُ هذا الصنف محذوفة — استرجعها أوّلاً.';
  end if;
  insert into company_sections select * from jsonb_populate_record(null::company_sections, v_t.row);
  select * into v_row from company_sections where id = p_id;
  if v_t.folded_into is not null and v_t.pooled_moved <> 0 then
    update company_sections set pooled_stock = round(greatest(0, coalesce(pooled_stock, 0) - v_t.pooled_moved), 3)
     where id = v_t.folded_into and clinic_id = v_clinic;
  end if;
  update products set section_id = p_id
   where id = any (v_t.product_ids) and clinic_id = v_clinic
     and (v_t.folded_into is null or section_id = v_t.folded_into);
  delete from company_sections_trash where id = p_id and clinic_id = v_clinic;
  return v_row;
end $$;

revoke all on function public.restore_company_section(uuid) from public, anon;
grant execute on function public.restore_company_section(uuid) to authenticated;

-- ── ٦) تقريرُ التوائم: **ما ينتقل** لا ما بالمجموعة كلِّها ────────────────
-- الأعمدةُ القديمة تبقى بدلالتها (فحصُ الحزمة يعتمدها)، وتُضاف أعمدةُ المنقول:
-- الشاشةُ لازم تقول «١٢ منتجاً سينتقل» لا «٢٩١ منتجاً بالمجموعة».
-- **لا `create or replace` هنا**: بوستغريس يرفض تغييرَ نوعِ الرجوع، و0197
-- تزيد أعمدةً على تعريف 0196. والحذفُ قبل الإنشاء يجعل الهجرتين تُعادان بأيّ
-- ترتيب (نفسُ فخّ 0096 و0191 — كلّفنا بناءً أحمرَ مرّتين من قبل).
drop function if exists public.company_twins();
create function public.company_twins()
returns table (
  norm text, keep_id uuid, keep_name text, rows integer,
  ids uuid[], products integer, purchases integer,
  sections integer, charges integer, payments integer,
  moving_products integer, moving_purchases integer, moving_sections integer,
  moving_charges integer, moving_payments integer, pool_moving numeric)
language sql
security invoker
set search_path = public
as $$
  with mine as (
    select id, name, created_at, inv_norm_group(name) k
      from companies where clinic_id = auth_clinic()
  ), g as (
    select k, count(*)::int n, array_agg(id order by created_at) ids,
           (array_agg(id order by created_at))[1] keep_id,
           (array_agg(name order by created_at))[1] keep_name
      from mine group by k having count(*) > 1
  ), m as (
    select g.*, (select array_agg(x) from unnest(g.ids) x where x <> g.keep_id) drop_ids from g
  )
  select m.k, m.keep_id, m.keep_name, m.n, m.ids,
         (select count(*)::int from products p where p.company_id = any (m.ids)),
         (select count(*)::int from purchases p where p.company_id = any (m.ids)),
         (select count(*)::int from company_sections s where s.company_id = any (m.ids)),
         (select count(*)::int from company_charges c where c.company_id = any (m.ids)),
         (select count(*)::int from purchase_payments y where y.company_id = any (m.ids)),
         (select count(*)::int from products p where p.company_id = any (m.drop_ids)),
         (select count(*)::int from purchases p where p.company_id = any (m.drop_ids)),
         (select count(*)::int from company_sections s where s.company_id = any (m.drop_ids)),
         (select count(*)::int from company_charges c where c.company_id = any (m.drop_ids)),
         (select count(*)::int from purchase_payments y where y.company_id = any (m.drop_ids)),
         (select coalesce(sum(s.pooled_stock), 0) from company_sections s where s.company_id = any (m.drop_ids))
    from m order by m.n desc, m.k;
$$;

revoke all on function public.company_twins() from public, anon;
grant execute on function public.company_twins() to authenticated;

-- ── ٧) استعادةُ منتجٍ لقطتُه أيتمَها طيٌّ أو حذف ──────────────────────────
-- `create or replace` للنسخة الحيّة (0167:165) بسطرَي حراسةٍ مضافَين؛ الباقي
-- كما هو حرفاً بحرف. التراجع: أعِد تنزيل 0167.
create or replace function public.restore_product(p_id uuid)
returns products
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_t      products_trash;
  v_p      products;
  v_keep   products;
  v_code   text;
  c        text;
  v_alts   jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then raise exception 'forbidden: inventory role required'; end if;
  select * into v_t from products_trash where id = p_id and clinic_id = v_clinic for update;
  if v_t.id is null then raise exception 'not in trash'; end if;
  if exists (select 1 from products where id = p_id) then raise exception 'product already exists'; end if;
  v_code := v_t.row->>'barcode';

  if v_t.merged_into is not null then
    select * into v_keep from products where id = v_t.merged_into and clinic_id = v_clinic for update;
    if v_keep.id is not null then
      update products
         set stock = greatest(0, coalesce(stock, 0) - coalesce(v_t.stock, 0)),
             alt_codes = array_remove(coalesce(alt_codes, '{}'), v_code),
             barcode = case when v_t.keep_barcode is null and v_code is not null and barcode = v_code then null else barcode end
       where id = v_keep.id;
      for c in select jsonb_array_elements_text(coalesce(v_t.row->'alt_codes', '[]'::jsonb)) loop
        update products set alt_codes = array_remove(coalesce(alt_codes, '{}'), c) where id = v_keep.id;
      end loop;
    end if;
  end if;

  if jsonb_typeof(v_t.row->'alt_codes') = 'array' then
    select coalesce(jsonb_agg(a.code), '[]'::jsonb) into v_alts
      from jsonb_array_elements_text(v_t.row->'alt_codes') as a(code)
     where not exists (
       select 1 from products o
        where o.clinic_id = v_t.clinic_id
          and o.id <> p_id
          and (inv_norm_code(o.barcode) = inv_norm_code(a.code)
               or exists (select 1 from unnest(coalesce(o.alt_codes, '{}')) x
                           where inv_norm_code(x) = inv_norm_code(a.code))));
    v_t.row := jsonb_set(v_t.row, '{alt_codes}', v_alts);
  end if;

  -- الحارسُ يقرأ الطرفين (0167): رمزٌ صار **إضافياً** لغيره يمنع الإدراج مثلما
  -- يمنعه أساسيُّ غيره. وبلا هذا يرفض المحفّزُ الإدراجَ فتستحيل الاستعادةُ رأساً.
  if v_code is not null and exists (
       select 1 from products o
        where o.clinic_id = v_t.clinic_id
          and ( inv_norm_code(o.barcode) = inv_norm_code(v_code)
                or exists (select 1 from unnest(coalesce(o.alt_codes, '{}')) x
                            where inv_norm_code(x) = inv_norm_code(v_code)) )) then
    v_t.row := v_t.row - 'barcode';
  end if;

  /* **لقطةٌ أيتمَها طيٌّ أو حذف** (0197): الصورةُ قد تحمل شركةً أو صنفاً لم
     يعد موجوداً — دمجُ شركاتٍ، أو حذفُ صنفٍ، أو حذفٌ من نسخةٍ قديمة. والإدراجُ
     عندها يخرق المفتاحَ الأجنبيّ (23503) فتصير الاستعادةُ **مستحيلةً للأبد**
     والعيادةُ ترى المنتجَ بتبويب المحذوفات وتضغط «استرجاع» فيرجع خطأٌ خام.
     `merge_companies` تعيد توجيهَ اللقطة بنفسها؛ وهذا شبكةُ الأمان الأخيرة
     لكلّ طريقٍ آخر — المنتجُ يرجع بلا شركةٍ أفضلَ من ألّا يرجع أبداً. */
  if (v_t.row->>'company_id') is not null
     and not exists (select 1 from companies where id = (v_t.row->>'company_id')::uuid
                                             and clinic_id = v_t.clinic_id) then
    v_t.row := jsonb_set(v_t.row, '{company_id}', 'null'::jsonb);
  end if;
  if (v_t.row->>'section_id') is not null
     and not exists (select 1 from company_sections where id = (v_t.row->>'section_id')::uuid
                                                    and clinic_id = v_t.clinic_id) then
    v_t.row := jsonb_set(v_t.row, '{section_id}', 'null'::jsonb);
  end if;

  insert into products select * from jsonb_populate_record(null::products, v_t.row) returning * into v_p;
  update invoice_items      set product_id = p_id where id = any(v_t.invoice_item_ids)  and (product_id is null or product_id = v_t.merged_into);
  update purchase_items     set product_id = p_id where id = any(v_t.purchase_item_ids) and (product_id is null or product_id = v_t.merged_into);
  update generated_barcodes set product_id = p_id where id = any(v_t.barcode_ids)       and (product_id is null or product_id = v_t.merged_into);
  delete from products_trash where id = p_id;
  return v_p;
end $function$;

