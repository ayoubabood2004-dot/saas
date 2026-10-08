-- ============================================================================
-- تراجعُ 0222 (موظّفُ التصوير) — يُجرَّب بآخر حزمة run.sh، لا يُكتب ورقاً.
--
-- الترتيبُ مهمّ:
--   ٠) **الواجهةُ أوّلاً**: أرجع الواجهةَ لما قبل 0222 قبل هذا الملف — الواجهةُ الجديدة
--      تنادي set_product_image وstore_set_featured/desc وimage_path_in_use.
--   ١) الخطّافُ يُصفَّر ويُبلَّغ PostgREST **قبل** أيّ حذف: حذفُ api_gate والخطّافُ
--      ما زال مضبوطاً يُسقط كلَّ طلبٍ لكلّ عيادة.
--   ٢) سياساتُ السياج.
--   ٣) المصوّرون يُعلَّقون (لا يُحذفون) بدورٍ قديم — قبل إعادة القيود، وإلا فشلت.
--   ٤) القيودُ والدوالُّ القديمة كما كانت (has_permission 0016، store_set_visible 0186).
-- ============================================================================

-- ١) الخطّاف
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator reset pgrst.db_pre_request';
    perform pg_notify('pgrst', 'reload config');
  end if;
end $$;

-- ٢) السياج
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where policyname like 'photographer_fence%' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ٣) المصوّرون: معلَّقون بدور «أخصائي عناية» — لا يدخلون، ولا يضيع صفُّهم.
update memberships set role = 'groomer', status = 'suspended' where role = 'photographer';
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'staff' and column_name = 'status') then
    execute 'update staff set role = ''groomer'', status = ''suspended'' where role = ''photographer''';
  else
    execute 'update staff set role = ''groomer'' where role = ''photographer''';
  end if;
  if to_regclass('public.invites') is not null then
    execute 'update invites set role = ''groomer'', status = ''revoked'' where role = ''photographer''';
  end if;
end $$;

-- ٤) القيود
do $$
declare t text;
begin
  foreach t in array array['staff', 'memberships', 'invites'] loop
    if exists (select 1 from pg_constraint where conname = t || '_role_check' and conrelid = to_regclass('public.' || t)) then
      execute format('alter table public.%I drop constraint %I', t, t || '_role_check');
      execute format('alter table public.%I add constraint %I check (role in (''manager'',''veterinarian'',''receptionist'',''groomer''))',
                     t, t || '_role_check');
    end if;
  end loop;
end $$;

create or replace function public.has_permission(cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case auth_role()
    when 'manager'      then true
    when 'veterinarian' then cap in ('viewCalendar','addPets','editMedical','processSales','manageInventory')
    when 'receptionist' then cap in ('viewCalendar','addPets','processSales')
    when 'groomer'      then cap in ('viewCalendar','addPets')
    else false
  end;
$$;

create or replace function public.store_set_visible(p_ids uuid[], p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := auth_role();
  v_n       int;
  v_changed int := 0;
  v_skipped int := 0;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية تنشر منتجات بالمتجر.';
  end if;
  if p_on is null then
    raise exception 'bad_input' using hint = 'لازم تحدّد: نشر أو إخفاء.';
  end if;

  v_n := coalesce(array_length(p_ids, 1), 0);
  if v_n = 0 then
    return jsonb_build_object('ok', true, 'changed', 0, 'skipped_no_price', 0);
  end if;
  if v_n > 500 then
    raise exception 'too_many' using hint = 'انشر ٥٠٠ منتجٍ بالمرّة كحدٍّ أقصى.';
  end if;

  if p_on then
    select count(*) into v_skipped
      from products
     where id = any(p_ids) and clinic_id = v_clinic
       and coalesce(sell_price, 0) <= 0 and not coalesce(store_visible, false);

    update products set store_visible = true
     where id = any(p_ids) and clinic_id = v_clinic
       and coalesce(sell_price, 0) > 0 and not coalesce(store_visible, false);
    get diagnostics v_changed = row_count;
  else
    update products set store_visible = false
     where id = any(p_ids) and clinic_id = v_clinic
       and coalesce(store_visible, false);
    get diagnostics v_changed = row_count;
  end if;

  return jsonb_build_object('ok', true, 'changed', v_changed, 'skipped_no_price', v_skipped);
end $$;

-- الدوالُّ الجديدة — بعد تصفير الخطّاف أعلاه.
drop function if exists public.api_gate();
drop function if exists public.photo_products();
drop function if exists public.set_product_image(uuid, text);
drop function if exists public.image_path_in_use(text);
drop function if exists public.store_set_featured(uuid, boolean);
drop function if exists public.store_set_price(uuid, numeric, numeric);  -- 0228: بابُ السعر يسأل _store_manager_ok
drop function if exists public.store_set_desc(uuid, text);
drop function if exists public._store_manager_ok();
drop function if exists public.verify_photographer_fence();
drop function if exists public.photographer_fence_table(text);
drop function if exists public._photographer_fence_targets();
drop function if exists public._photographer_fence_exempt(text);
drop function if exists public._photographer_read_ok();
drop function if exists public.is_photographer();
drop function if exists public.staff_can(text);
