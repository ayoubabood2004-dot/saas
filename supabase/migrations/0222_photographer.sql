-- ============================================================================
-- ٠٢٢٢ — موظّفُ التصوير: صورُ المنتجات، وبكلمة العيادة المتجرُ (طلبُ المالك، ٣٠/٩)
--
-- ── الطلب ──────────────────────────────────────────────────────────────────
-- دورٌ جديد يصوّر المنتجات ويضع صورها، وتقدر العيادةُ تعطيه تحكّماً كاملاً بالمتجر
-- (المنتجات والواجهة — **بلا طلبات الزبائن** بقرار المالك). و**قفلٌ من الخادم**
-- بقرار المالك: لا يصل الفواتيرَ ولا الزبائنَ ولا الملفاتِ الطبية ولا الفلوس ولو حاول.
--
-- ── الجذر الذي يفرض الشكل ─────────────────────────────────────────────────
-- «أخصائيُّ العناية» اليوم مخفيّةٌ عنه الشاشاتُ بالواجهة وحدها: سياساتُ أكثرِ الجداول
-- شرطُ عيادةٍ فقط، و١٤٢ دالّةً بصلاحية المالك (security definer) يقدر أيُّ داخلٍ
-- أن يناديها وأغلبُها لا يسأل عن الدور. فالقفلُ طبقتان:
--   ١) **سياجُ RLS**: سياسةٌ «مقيِّدة» (restrictive) على كلّ جدولٍ بسياسات، تُسقط
--      المصوّرَ وحده وتترك غيرَه كما كان حرفاً (المقيِّدةُ تُضاف بـAND فوق الموجود).
--      المسموحُ له: إعداداتُ العيادة قراءةً، وصفُّه هو بالكادر والملفّ والعضوية،
--      وملفُّ المتجر (كتابةً بإذن manageStore). والمنتجاتُ **مسيَّجةٌ** أيضاً: قراءتُها
--      من `photo_products()` بأعمدةٍ آمنة — لا سعرَ شراءٍ ولا تكلفة.
--   ٢) **بوّابةُ الطلبات** (`pgrst.db_pre_request`): قبل كلّ نداء RPC، إن كان المنادي
--      مصوّراً والدالّةُ خارج قائمته — رفض. لأن دالّةَ المالك تتجاوز RLS فالسياجُ لا
--      يراها. والبوّابةُ **لا ترفض غيرَ المصوّر أبداً**: أيُّ خطأٍ داخلها يمرّر الطلب.
--   وكلُّ جدولٍ جديد بعد اليوم يُسأل عنه: `verify_photographer_fence()` تُرجع ما لا
--   سياجَ له، والحزمةُ تفشل عليه.
--
-- ── الإذن ──────────────────────────────────────────────────────────────────
-- `staff_can(cap)`: المديرُ نعم؛ وإلا استثناءُ صفّ الكادر (`staff.permissions`، يكتبه
-- المديرُ وحده) ثم قالبُ الدور (`has_permission`). مرآةُ `effectiveCan` بالواجهة.
--
-- تراجع: `alter role authenticator reset pgrst.db_pre_request` + حذفُ سياسات
-- photographer_fence* + إعادةُ قيود الأدوار. تُطبَّق بعد 0221. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

-- ── ١) الدور بالقيود ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['staff', 'memberships', 'invites'] loop
    if exists (select 1 from pg_constraint where conname = t || '_role_check' and conrelid = to_regclass('public.' || t)) then
      execute format('alter table public.%I drop constraint %I', t, t || '_role_check');
      execute format('alter table public.%I add constraint %I check (role in (''manager'',''veterinarian'',''receptionist'',''groomer'',''photographer''))',
                     t, t || '_role_check');
    end if;
  end loop;
end $$;

-- ── ٢) قوالبُ الأدوار (مرآةُ PERMISSIONS بـsrc/lib/staff.ts) ─────────────────
create or replace function public.has_permission(cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case auth_role()
    when 'manager'      then true
    when 'veterinarian' then cap in ('viewCalendar','addPets','editMedical','processSales','manageInventory','manageProductPhotos','manageStore')
    when 'receptionist' then cap in ('viewCalendar','addPets','processSales')
    when 'groomer'      then cap in ('viewCalendar','addPets')
    when 'photographer' then cap in ('manageProductPhotos')
    else false
  end;
$$;

-- الإذنُ الفعليّ: استثناءُ الكادر يغلب القالب (مرآةُ effectiveCan).
create or replace function public.staff_can(cap text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if auth.uid() is null then return false; end if;
  if auth_role() = 'manager' then return true; end if;
  select s.permissions into v
    from staff s
   where s.user_id = auth.uid() and s.clinic_id = auth_clinic()
   limit 1;
  if v is not null and jsonb_typeof(v -> cap) = 'boolean' then
    return (v ->> cap)::boolean;
  end if;
  return has_permission(cap);
end $$;
revoke all on function public.staff_can(text) from public, anon;
grant execute on function public.staff_can(text) to authenticated;

-- هل المنادي مصوّرٌ الآن؟ أرخصُ سؤالٍ أوّلاً (مفتاحُ memberships يبدأ بـuser_id)، فغيرُ
-- المصوّر — أيْ الكلّ تقريباً — يخرج بقراءة فهرسٍ واحدة. والمصوّرُ المرفوعُ بـPIN المدير
-- (auth_role = manager) ليس مصوّراً ما دام الرفع — كغيره من الكادر.
create or replace function public.is_photographer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from memberships m
                  where m.user_id = auth.uid() and m.role = 'photographer' and m.status = 'active') then
    return false;
  end if;
  return auth_role() = 'photographer';
end $$;
revoke all on function public.is_photographer() from public, anon;
grant execute on function public.is_photographer() to authenticated;

-- ── ٣) سياجُ RLS ─────────────────────────────────────────────────────────────
-- قراءةٌ مسموحة (إعدادُ العيادة الذي يقرؤه الإقلاع)، والكتابةُ مسيَّجة.
create or replace function public._photographer_read_ok()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['clinic_prefs','clinic_areas','clinic_breeds','clinic_meds','clinic_promos',
               'clinic_service_categories','clinic_services','clinic_vaccines','clinic_vital_ranges',
               'branches','subscriptions','image_library','app_config','plan_prices']
$$;

-- الجداولُ التي لا يلمسها إلا مشغّلُ المنصّة (كلُّ سياساتها is_platform_admin) — المصوّرُ
-- ليس مشغّلاً، فسياجُها قائمٌ بطبيعتها ولا يُزاد عليها شيء.
create or replace function public._photographer_fence_exempt(p_table text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- بلا clinic_id (ليس بيانَ عيادة)، وكلُّ سياسةٍ تسمح به شرطُها مشغّلُ المنصّة وحده.
  -- «العيادة أو المشغّل» ليست استثناءً — فيها شرطُ عيادة.
  select not exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = p_table and c.column_name = 'clinic_id')
     and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = p_table and p.permissive = 'PERMISSIVE')
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = p_table and p.permissive = 'PERMISSIVE'
                        and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%is_platform_admin%')
$$;
revoke all on function public._photographer_fence_exempt(text) from public, anon, authenticated;

-- السياجُ يطابق أوامرَ السياسات القائمة **أمراً أمراً**: جدولٌ بلا سياسة كتابة يأخذ سياجَ
-- قراءةٍ وحده — فلا تظهر «سياسةُ كتابة» حيث الكتابةُ كلُّها من دالّة (ثوابتُ الحزمة).
do $$
declare
  r     record;
  c     text;
  own   text;
  cond  text;
  cmds  text[];
begin
  for r in
    select c2.relname
      from pg_class c2 join pg_namespace n on n.oid = c2.relnamespace
     where n.nspname = 'public' and c2.relkind = 'r'
       and ((c2.relrowsecurity and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c2.relname))
            or c2.relname = any(public._photographer_read_ok()))
  loop
    execute format('drop policy if exists photographer_fence on public.%I', r.relname);
    execute format('drop policy if exists photographer_fence_sel on public.%I', r.relname);
    execute format('drop policy if exists photographer_fence_ins on public.%I', r.relname);
    execute format('drop policy if exists photographer_fence_upd on public.%I', r.relname);
    execute format('drop policy if exists photographer_fence_del on public.%I', r.relname);
    continue when public._photographer_fence_exempt(r.relname);

    select array_agg(distinct p.cmd) into cmds
      from pg_policies p
     where p.schemaname = 'public' and p.tablename = r.relname and p.permissive = 'PERMISSIVE';
    cmds := coalesce(cmds, '{}');
    continue when cardinality(cmds) = 0 and not (r.relname = any(public._photographer_read_ok()));
    if 'ALL' = any(cmds) then cmds := array['SELECT','INSERT','UPDATE','DELETE']; end if;
    -- إعدادُ العيادة يُسيَّج للكتابة **دائماً**: سياسةُ كتابةٍ تُضاف له لاحقاً لا تفتح بابه.
    if r.relname = any(public._photographer_read_ok()) then
      cmds := array(select distinct x from unnest(cmds || array['INSERT','UPDATE','DELETE']) x);
    end if;

    own := case r.relname
      when 'profiles'       then 'id = (select auth.uid())'
      when 'memberships'    then 'user_id = (select auth.uid())'
      when 'staff'          then 'user_id = (select auth.uid())'
      when 'drug_favorites' then 'true'
      else null end;

    foreach c in array cmds loop
      cond := case
        -- إعدادُ العيادة: قراءةٌ مفتوحة، وكلُّ كتابةٍ مسيَّجة.
        when r.relname = any(public._photographer_read_ok()) and c = 'SELECT' then null
        -- سطرُ دخوله هو بسجلّ الدخول — يراه المدير (القراءةُ للمدير وحده بسياستها).
        when r.relname = 'login_events' and c = 'INSERT' then null
        -- واجهةُ المتجر: تُقرأ، وتُكتب بإذن «تحكّم كامل بالمتجر»، ولا تُحذف.
        when r.relname = 'store_profiles' and c = 'SELECT' then null
        when r.relname = 'store_profiles' and c in ('INSERT','UPDATE') then 'not (select public.is_photographer()) or (select public.staff_can(''manageStore''))'
        when own is not null then format('not (select public.is_photographer()) or (%s)', own)
        else 'not (select public.is_photographer())'
      end;
      continue when cond is null;
      if c = 'INSERT' then
        execute format('create policy photographer_fence_ins on public.%I as restrictive for insert to authenticated with check (%s)', r.relname, cond);
      elsif c = 'SELECT' then
        execute format('create policy photographer_fence_sel on public.%I as restrictive for select to authenticated using (%s)', r.relname, cond);
      elsif c = 'UPDATE' then
        execute format('create policy photographer_fence_upd on public.%I as restrictive for update to authenticated using (%s) with check (%s)', r.relname, cond, cond);
      elsif c = 'DELETE' then
        execute format('create policy photographer_fence_del on public.%I as restrictive for delete to authenticated using (%s)', r.relname, cond);
      end if;
    end loop;
  end loop;
end $$;

-- ما لا سياجَ له — يجب أن يرجع فارغاً. أمرٌ مسموحٌ بسياسةٍ ولا سياجَ على أمره (أو على
-- ALL) = ثغرة؛ إلا قراءةَ إعدادٍ مسموحة، وجداولَ المشغّل. جدولٌ جديد يُفشل الحزمة حتى يُقرَّر.
create or replace function public.verify_photographer_fence()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.tablename || ':' || x.cmd
    from pg_policies p
    cross join lateral unnest(case when p.cmd = 'ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[p.cmd] end) x(cmd)
   where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
     and not public._photographer_fence_exempt(p.tablename)
     and not (x.cmd = 'SELECT' and (p.tablename = any(public._photographer_read_ok()) or p.tablename = 'store_profiles'))
     and not (x.cmd = 'INSERT' and p.tablename = 'login_events')
     and not exists (select 1 from pg_policies f
                      where f.schemaname = 'public' and f.tablename = p.tablename and f.permissive = 'RESTRICTIVE'
                        and f.policyname like 'photographer_fence%' and (f.cmd = x.cmd or f.cmd = 'ALL'))
   order by 1
$$;
revoke all on function public.verify_photographer_fence() from public, anon, authenticated;

-- الملفّاتُ: المصوّرُ بدلو صور المنتجات وحده (الوسائطُ الطبية خاصّةٌ ومسيَّجة).
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists photographer_fence on storage.objects;
    create policy photographer_fence on storage.objects as restrictive for all to authenticated
      using (not (select public.is_photographer()) or bucket_id = 'product-images')
      with check (not (select public.is_photographer()) or bucket_id = 'product-images');
  end if;
end $$;

-- ── ٤) بوّابةُ الطلبات: دوالُّ المالك خارج قائمة المصوّر ترفضه ──────────────
create or replace function public.api_gate()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_path  text;
  v_fn    text;
  v_block boolean := false;
begin
  begin
    v_path := coalesce(current_setting('request.path', true), '');
    if position('/rpc/' in v_path) = 0 then return; end if;
    v_fn := substring(v_path from '/rpc/([A-Za-z0-9_]+)');
    if v_fn is null or v_fn = any(array[
      -- الإقلاع والجلسة
      'my_workspace','presence_beat','get_or_init_subscription','has_override_pin','elevate_with_pin',
      'end_elevation','log_client_event','platform_context','leave_clinic','accept_invite','add_my_role',
      'clinic_quota_usage','staff_can','is_photographer',
      -- الصور
      'photo_products','set_product_image','image_library_usage','image_path_in_use',
      -- المتجر (كلُّ واحدةٍ تسأل manageStore بنفسها)
      'store_set_visible','store_set_featured','store_set_desc','store_slug_available','store_front'
    ]) then
      return;
    end if;
    v_block := public.is_photographer();
  exception when others then
    return;   -- البوّابةُ لا تُسقط طلبَ أحدٍ بخطئها هي
  end;
  if v_block then
    raise exception 'photographer_forbidden'
      using errcode = '42501', hint = 'هذي العملية مو من صلاحية موظف التصوير.';
  end if;
end $$;
revoke all on function public.api_gate() from public;
grant execute on function public.api_gate() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.api_gate''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end $$;

-- ── ٥) الصور ─────────────────────────────────────────────────────────────────
-- المنتجاتُ بأعمدةٍ آمنة لمن يصوّر أو يدير المتجر: لا سعرَ شراء ولا تكلفة. مصفوفةٌ
-- واحدة لا صفوف — سقفُ الألف صفٍّ لكلّ طلبٍ لا يقصّها (CLAUDE.md §٣).
create or replace function public.photo_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not (auth_role() in ('manager','veterinarian') or staff_can('manageProductPhotos') or staff_can('manageStore')) then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على صور المنتجات.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'barcode', p.barcode, 'category', p.category,
             'subcategory', p.subcategory, 'company_id', p.company_id, 'company_name', c.name,
             'image_path', p.image_path, 'store_visible', coalesce(p.store_visible, false),
             'store_featured', coalesce(p.store_featured, false), 'store_desc', p.store_desc,
             'sell_price', p.sell_price, 'stock', p.stock)
           order by p.name)
      from products p left join companies c on c.id = p.company_id
     where p.clinic_id = v_clinic and p.farm_id is null), '[]'::jsonb);
end $$;
revoke all on function public.photo_products() from public, anon;
grant execute on function public.photo_products() to authenticated;

-- صورةُ المنتج وحدَها — لا عمودَ آخر. المسارُ ملفٌّ بمجلّد العيادة، أو صورةُ مكتبة
-- المنصّة، أو لا شيء. وصفرُ صفوفٍ خطأٌ مسموع (CLAUDE.md: «الكتابةُ تُسمَع»).
create or replace function public.set_product_image(p_product uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_path   text := nullif(btrim(coalesce(p_path, '')), '');
  n        int;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not (auth_role() in ('manager','veterinarian') or staff_can('manageProductPhotos') or staff_can('manageStore')) then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية تغيّر صور المنتجات.';
  end if;
  if v_path is not null and not (v_path like v_clinic::text || '/%' or v_path like 'library/%') then
    raise exception 'bad_image_path' using hint = 'مسار الصورة مو من ملفات العيادة.';
  end if;
  update products set image_path = v_path where id = p_product and clinic_id = v_clinic;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'product_not_found' using hint = 'المنتج ما موجود — يمكن انحذف. حدّث الصفحة.';
  end if;
end $$;
revoke all on function public.set_product_image(uuid, text) from public, anon;
grant execute on function public.set_product_image(uuid, text) to authenticated;

-- هل ما زال منتجٌ بعيادتي يشير لهذا الملف؟ قبل حذف ملفٍّ استُبدل. كانت الواجهةُ تسأل
-- جدولَ المنتجات مباشرةً — والمصوّرُ مسيَّجٌ عنه فيرى «صفرَ مراجع» فيحذف ملفاً ما زال
-- توأمٌ مطويٌّ يشير إليه («اختفى كأنه ما كان»). الجوابُ من الخادم لا من قراءةٍ مسيَّجة.
create or replace function public.image_path_in_use(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from products where image_path = p_path and clinic_id = auth_clinic())
$$;
revoke all on function public.image_path_in_use(text) from public, anon;
grant execute on function public.image_path_in_use(text) to authenticated;

-- ── ٦) المتجر بإذن manageStore (بلا الطلبات وبلا السعر) ──────────────────────
create or replace function public._store_manager_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role(), '') in ('manager','veterinarian') or staff_can('manageStore')
$$;
revoke all on function public._store_manager_ok() from public, anon, authenticated;

create or replace function public.store_set_featured(p_product uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_clinic uuid := auth_clinic(); n int;
begin
  if v_clinic is null then raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.'; end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على المتجر.';
  end if;
  update products set store_featured = coalesce(p_on, false) where id = p_product and clinic_id = v_clinic;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'product_not_found' using hint = 'المنتج ما موجود — حدّث الصفحة.'; end if;
end $$;
revoke all on function public.store_set_featured(uuid, boolean) from public, anon;
grant execute on function public.store_set_featured(uuid, boolean) to authenticated;

create or replace function public.store_set_desc(p_product uuid, p_desc text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_clinic uuid := auth_clinic(); n int;
begin
  if v_clinic is null then raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.'; end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على المتجر.';
  end if;
  if char_length(coalesce(p_desc, '')) > 2000 then
    raise exception 'desc_too_long' using hint = 'الوصف أطول من ٢٠٠٠ حرف.';
  end if;
  update products set store_desc = nullif(btrim(coalesce(p_desc, '')), '') where id = p_product and clinic_id = v_clinic;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'product_not_found' using hint = 'المنتج ما موجود — حدّث الصفحة.'; end if;
end $$;
revoke all on function public.store_set_desc(uuid, text) from public, anon;
grant execute on function public.store_set_desc(uuid, text) to authenticated;

-- نفسُ جسم 0186 حرفاً، إلا أنّ الإذن صار `_store_manager_ok()`.
create or replace function public.store_set_visible(p_ids uuid[], p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_n       int;
  v_changed int := 0;
  v_skipped int := 0;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
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

comment on function public.api_gate() is
  'بوّابة الطلبات (0222): المصوّر لا ينادي دالّةً خارج قائمته. لا ترفض غير المصوّر أبداً.';
comment on function public.staff_can(text) is
  'الإذن الفعليّ للكادر (0222): المدير نعم؛ ثم استثناء staff.permissions؛ ثم قالب الدور.';
