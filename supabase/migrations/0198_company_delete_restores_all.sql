-- ============================================================================
-- ٠١٩٨ — الحذفُ الصريح يرجع كاملاً: المطالباتُ والأصنافُ وحوضُها
--
-- ── ما قاسته الحزمة ─────────────────────────────────────────────────────
-- 0197 جعلت الحذفَ قابلاً للرجوع — **للمنتجات**. وحافظاتُ الطيّ تمرّ خضراء.
-- لكنّ أربعَ حافظاتٍ على مسار **الحذف الصريح** تفشل:
--   ✗ مطالباتُها رجعت بمبلغها      ✗ أصنافُها رجعت بعددها
--   ✗ وبحوضها فلساً بفلس           ✗ ومنتجاتُها رجعت لأصنافها
--
-- والسببُ واحد: `company_charges.company_id` و`company_sections.company_id`
-- مفتاحُهما **`on delete cascade`** لا `set null`. فالطيُّ ينقلهما قبل الحذف
-- فينجو، أمّا الحذفُ الصريح فيمحو **الصفَّ نفسَه**. ولقطةُ 0197 تحفظ
-- **معرّفاتٍ** لا صفوفاً — والمعرّفُ لا يعيد صفّاً غيرَ موجود.
--
-- وهذا بعينه ما سأل عنه المالك: «ما يروح ولا تفاصيل أخرى مثلاً الديونُ الي
-- على الشركات». الديونُ كانت تروح — بصمتٍ، ومن الزرّ الذي تصله العيادة.
--
-- ── العلاج ──────────────────────────────────────────────────────────────
-- ١) اللقطةُ تحفظ **صفوفَ المطالبات كاملةً** لا معرّفاتِها (`charges jsonb`).
--    المعرّفاتُ تبقى بدلالتها للطيّ (حيث الصفوفُ حيّةٌ ومنقولة).
-- ٢) والأصنافُ صورتُها موجودةٌ أصلاً بـ`company_sections_trash` — محفّزُها
--    يعمل أثناء التتالي — فالاسترجاعُ يقرؤها ويعيد الصفَّ وحوضَه ومنتجاتِه.
--
-- تراجع: أعِد تنزيل 0197 (يُسقط العمودَ الجديدَ بيدك إن أردت).
-- تُطبَّق بعد 0197.
-- ============================================================================

alter table companies_trash add column if not exists charges jsonb not null default '[]'::jsonb;
comment on column companies_trash.charges is
  'صفوفُ `company_charges` كاملةً لحظةَ حذفٍ صريح (0198) — مفتاحُها cascade فالصفُّ يُمحى، والمعرّفُ وحدَه لا يعيده. يبقى فارغاً بالطيّ لأن الصفوفَ تُنقل حيّةً.';

-- ── ١) الحارس: يصوّر الصفوف لا المعرّفاتِ وحدَها ───────────────────────────
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

  insert into companies_trash (id, clinic_id, row, product_ids, purchase_ids, payment_ids, charge_ids, sections, charges)
  select old.id, old.clinic_id, to_jsonb(old),
         coalesce((select array_agg(id) from products          where company_id = old.id), '{}'),
         coalesce((select array_agg(id) from purchases         where company_id = old.id), '{}'),
         coalesce((select array_agg(id) from purchase_payments where company_id = old.id), '{}'),
         coalesce((select array_agg(id) from company_charges   where company_id = old.id), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object(
                    'id', s.id, 'name', s.name, 'pooled_moved', 0, 'folded_into', null,
                    'product_ids', coalesce((select array_agg(p.id) from products p where p.section_id = s.id), '{}')))
                   from company_sections s where s.company_id = old.id), '[]'::jsonb),
         -- **الصفوفُ كاملةً**: cascade سيمحوها بعد سطرين، ولا يعيدها معرّف.
         coalesce((select jsonb_agg(to_jsonb(c)) from company_charges c where c.company_id = old.id), '[]'::jsonb)
  on conflict (id) do nothing;
  return old;
end $$;

-- ── ٢) الاسترجاع: فرعُ الحذف الصريح يعيد ما محاه التتالي ──────────────────
-- الفرعُ الأوّل (`merged_into is not null`) كما هو حرفاً بحرف — الطيُّ ينقل
-- الصفوفَ حيّةً فلا شيءَ يُعاد إنشاؤه. المضافُ كلُّه بالفرع الثاني.
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
  v_sid    uuid;
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
    -- **المطالباتُ صفوفٌ مُحيت** (cascade)، فتُعاد من الصورة بنفس معرّفاتها.
    -- `company_id` يُكتب صريحاً: صورةٌ قديمةٌ قد تحمل شركةً أخرى لو نُقلت.
    insert into company_charges
    select (jsonb_populate_record(null::company_charges, c || jsonb_build_object('company_id', p_id::text))).*
      from jsonb_array_elements(coalesce(v_t.charges, '[]'::jsonb)) c
     where (c->>'clinic_id')::uuid = v_clinic
    on conflict (id) do nothing;
  end if;

  for v_sec in select * from jsonb_array_elements(coalesce(v_t.sections, '[]'::jsonb)) loop
    v_moved := coalesce((v_sec->>'pooled_moved')::numeric, 0);
    v_sid   := (v_sec->>'id')::uuid;
    if (v_sec->>'folded_into') is not null then
      -- الصنفُ طُوي بصنفٍ قائم: يُستعاد من سلّة الأصناف إن وُجدت صورتُه،
      -- ويُطرح من حوض الباقي **ما أُضيف بالضبط** لا تخميناً.
      if not exists (select 1 from company_sections where id = v_sid) then
        insert into company_sections
        select * from jsonb_populate_record(null::company_sections,
          (select row from company_sections_trash where id = v_sid and clinic_id = v_clinic))
        on conflict (id) do nothing;
      end if;
      if v_moved <> 0 then
        update company_sections set pooled_stock = round(greatest(0, coalesce(pooled_stock, 0) - v_moved), 3)
         where id = (v_sec->>'folded_into')::uuid and clinic_id = v_clinic;
        update company_sections set pooled_stock = v_moved
         where id = v_sid and clinic_id = v_clinic;
      end if;
      update products set section_id = v_sid
       where clinic_id = v_clinic and section_id = (v_sec->>'folded_into')::uuid
         and id = any (coalesce((select array_agg((x)::uuid) from jsonb_array_elements_text(v_sec->'product_ids') x), '{}'));
      -- الصورةُ استُهلكت: بقاؤها بالسلّة يعني صنفاً «محذوفاً» وهو قائمٌ بالقائمة،
      -- ومحاولةُ استرجاعه بعدها ترمي `already_there`.
      delete from company_sections_trash
       where id = v_sid and clinic_id = v_clinic
         and exists (select 1 from company_sections where id = v_sid);
    elsif v_t.merged_into is not null then
      update company_sections set company_id = p_id
       where id = v_sid and clinic_id = v_clinic and company_id = v_t.merged_into;
    else
      -- **حذفٌ صريح**: الصفُّ مُحي بالتتالي، وصورتُه بسلّة الأصناف (محفّزُها
      -- يعمل أثناء التتالي). يعود بنفس معرّفه فتصحّ كلُّ إشارةٍ إليه، ومعه
      -- حوضُه — وحداتٌ تُباع — ومنتجاتُه التي أفرغها `set null`.
      if not exists (select 1 from company_sections where id = v_sid) then
        insert into company_sections
        select * from jsonb_populate_record(null::company_sections,
          (select row from company_sections_trash where id = v_sid and clinic_id = v_clinic))
        on conflict (id) do nothing;
      end if;
      update products set section_id = v_sid
       where clinic_id = v_clinic and section_id is null
         and id = any (coalesce((select array_agg((x)::uuid) from jsonb_array_elements_text(v_sec->'product_ids') x), '{}'));
      -- الصورةُ استُهلكت: تبقى بالسلّة تعني صنفاً محذوفاً وهو قائم.
      delete from company_sections_trash where id = v_sid and clinic_id = v_clinic;
    end if;
  end loop;

  delete from company_merges where from_id = p_id and clinic_id = v_clinic;
  delete from companies_trash where id = p_id and clinic_id = v_clinic;
  return v_row;
end $$;

revoke all on function public.restore_company(uuid) from public, anon;
grant execute on function public.restore_company(uuid) to authenticated;

comment on function public.restore_company(uuid) is
  'يعيد شركةً من السلّة بنفس معرّفها (0197، ووسّعها 0198): ما انتقل يعود بشرط أنه ما زال حيث تركه الطيّ، وما محاه التتالي (المطالباتُ والأصنافُ بحوضها) يُعاد إنشاؤه من الصورة.';

-- ── ٣) الحذفُ بسببه — لا كتابةٌ صامتةٌ بالسلّة ────────────────────────────
-- سياسةُ `companies_trash` **قراءةٌ فقط**، فكتابةُ «لماذا حُذفت» من المتصفّح
-- تكون صفرَ صفوفٍ بلا خطأ — «الكتابةُ تُسمَع» بـCLAUDE.md حرفياً. فالسببُ
-- يُكتب من هنا، والدالّةُ تفحص العيادةَ والدورَ بنفسها (درس 0145) لأن
-- definer يتجاوز سياسةَ الصفوف. نظيرةُ `delete_product` بـ0145 شكلاً وشرطاً.
create or replace function public.delete_company(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'حذفُ الشركات للمدير والطبيب.';
  end if;
  if not exists (select 1 from companies where id = p_id and clinic_id = v_clinic) then
    raise exception 'no_company' using hint = 'الشركةُ غيرُ موجودة بعيادتك.';
  end if;
  delete from companies where id = p_id and clinic_id = v_clinic;
  update companies_trash set reason = nullif(btrim(p_reason), '')
   where id = p_id and clinic_id = v_clinic;
end $$;

revoke all on function public.delete_company(uuid, text) from public, anon;
grant execute on function public.delete_company(uuid, text) to authenticated;

comment on function public.delete_company(uuid, text) is
  'حذفُ شركةٍ بسببه (0198): المحفّزُ يصوّرها بالسلّة، والسببُ يُكتب من هنا لأن سياسةَ السلّة قراءةٌ فقط — فالكتابةُ من المتصفّح تكون صفرَ صفوفٍ بلا خطأ.';
