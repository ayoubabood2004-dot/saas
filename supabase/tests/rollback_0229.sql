-- ============================================================================
-- تراجعُ 0229 (أقسامُ المتجر ولوحةُ المصوّر) — يُجرَّب بالحزمة (run.sh): تطبيقٌ ثمّ تراجعٌ ثمّ
-- تطبيق، لا يُكتب ورقاً. الأجسامُ القديمةُ منسوخةٌ **آلياً** من هجراتها (فوق كلٍّ منها مصدرُه) —
-- نسخةٌ يدويّةٌ تنحرف، والحزمةُ تقارن كلَّ جسمٍ بأصله (scripts/rollback-copy-check.mjs).
--
-- الترتيبُ ليس اختيارياً:
--   ٠) **الواجهةُ أوّلاً**: أرجع الواجهةَ لما قبل 0229 — الجديدةُ تنادي store_publish وأخواتها.
--   ١) الدوالُّ القديمةُ تُعاد **قبل** إسقاط أيّ شيء: store_front (0229) تقرأ store_sections،
--      وplpgsql لا يسجّل اعتمادَه — فإسقاطُ الجدول قبلها كان سيمرّ بلا خطأ ثمّ تسقط واجهةُ كلّ
--      العيادات وقتَ أوّل زائر. والبوّابةُ قبل الدوالّ التي تذكرها.
--   ٢) الدوالُّ الجديدة.
--   ٣) المحفّزان قبل عموديهما: `products_store_section_guard` يعتمد على store_section_id
--      فيمنع drop column («cannot drop column … trigger depends on it»).
--   ٤) القيودُ والفهرسُ والأعمدة، ثمّ الجدول.
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) القديمُ كما كان ───────────────────────────────────────────────────────

-- api_gate من 0228 (حرفاً)
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
  -- الجداولُ يحرسها السياج؛ البوّابةُ للدوالّ وحدها. هذا الفحصُ لا يرمي، فهو خارج كتلة
  -- الاستثناء — فلا معاملةَ فرعيةً لكلّ طلب GET عاديّ.
  v_path := coalesce(current_setting('request.path', true), '');
  if position('/rpc/' in v_path) = 0 then return; end if;
  -- المقطعُ الأخير كاملاً (لا بادئة)؛ وما لا يُقرأ يمضي لسؤال «مصوّر؟» — فيُرفض له وحده.
  v_fn := substring(v_path from '/rpc/([^/?]+)/?$');
  if v_fn = any(array[
    -- الإقلاع والجلسة (لا elevate_with_pin ولا has_override_pin: الرفعُ ليس للمصوّر)
    'my_workspace','presence_beat','get_or_init_subscription','end_elevation','log_client_event',
    'platform_context','leave_clinic','accept_invite','add_my_role','staff_can','is_photographer',
    -- الصور
    'photo_products','set_product_image','image_library_usage','image_path_in_use',
    -- المتجر (كلُّ واحدةٍ تسأل manageStore بنفسها)
    'store_set_visible','store_set_featured','store_set_desc','store_slug_available','store_front',
    'store_set_price'
  ]) then
    return;
  end if;
  begin
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
grant execute on function public.api_gate() to anon, authenticated, service_role;

-- photo_products من 0228 (حرفاً)
create or replace function public.photo_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_store  boolean;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  -- الإذنُ من staff_can وحدها (المديرُ نعم، وقالبُ الطبيب يشمل الإذنين): إطفاءُ المدير
  -- لإذنِ طبيبٍ يُحترم بالخادم لا بالواجهة وحدها.
  v_store := staff_can('manageStore');
  if not (v_store or staff_can('manageProductPhotos')) then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على صور المنتجات.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'barcode', p.barcode, 'category', p.category,
             'subcategory', p.subcategory, 'company_id', p.company_id, 'company_name', c.name,
             'image_path', p.image_path, 'store_visible', coalesce(p.store_visible, false),
             'store_featured', coalesce(p.store_featured, false), 'store_desc', p.store_desc,
             -- السعرُ والرصيدُ لمن يدير المتجر؛ المصوّرُ وحده لا يحتاجهما.
             'sell_price', case when v_store then p.sell_price end,
             'stock', case when v_store then p.stock end,
             -- 0228: المجمَّعُ (رصيدُه بحوض قسمه) والانتهاءُ — وإلا قالت التشكيلةُ «نافد» عن مجمَّعٍ
             -- يُباع، ولوحةُ الجاهزية «صفر منتهٍ» عن منتهٍ يخفيه الخادمُ عن الزبون (0212).
             'pooled', case when v_store then coalesce(p.pooled, false) end,
             'expiry_date', case when v_store then p.expiry_date end)
           order by p.name)
      from products p left join companies c on c.id = p.company_id
     where p.clinic_id = v_clinic and p.farm_id is null), '[]'::jsonb);
end $$;
revoke all on function public.photo_products() from public, anon;
grant execute on function public.photo_products() to authenticated;

-- store_set_price من 0228 (حرفاً)
create or replace function public.store_set_price(p_product uuid, p_price numeric, p_expected numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_now    numeric;
  v_new    numeric;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على المتجر.';
  end if;
  -- سعرُ البيع لم يكتبه قبلها إلا المديرُ والطبيب (products_write، 0051)؛ والقرارُ وسّعه للمصوّر
  -- وحده — لا لاستقبالٍ أو عنايةٍ منحهما المديرُ إذنَ المتجر (تدقيقٌ عدائيّ: كان يمرّ لهما).
  if not (auth_role() in ('manager', 'veterinarian') or is_photographer()) then
    raise exception 'not_authorized' using errcode = '42501', hint = 'تعديل السعر للمدير والطبيب وموظف التصوير.';
  end if;
  -- صفرٌ ليس سعرَ متجر (store_catalog يخفيه) — وهو ما يكتبه حقلٌ مُسح ثم تُرك. وNaN بالـnumeric
  -- أكبرُ من كلّ رقم، فالسقفُ يمسكه.
  if p_price is null or p_price <= 0 or p_price > 1000000000000 then
    raise exception 'bad_price' using hint = 'السعر لازم أكبر من صفر.';
  end if;
  v_new := round(p_price, 2);
  -- نطاقُ photo_products نفسُه: منتجاتُ العيادة بلا منتجات الحقول. والقفلُ ثم المقارنة:
  -- رفعُ أسعارٍ أو جهازٌ آخر غيّر السعرَ بعد فتح القائمة ⇒ لا يُكتب فوقه بصمت.
  select p.sell_price into v_now from products p
   where p.id = p_product and p.clinic_id = v_clinic and p.farm_id is null
   for update;
  if not found then
    raise exception 'product_not_found' using hint = 'المنتج مو موجود بعيادتك — حدّث القائمة.';
  end if;
  if v_now is distinct from p_expected then
    raise exception 'price_moved'
      using hint = 'السعر تغيّر من جهاز ثاني أو برفع أسعار — حدّث القائمة وشوف السعر الجديد قبل لا تعدّله.';
  end if;
  if v_now is not distinct from v_new then
    return v_new;
  end if;
  update products set sell_price = v_new where id = p_product and clinic_id = v_clinic;
  return v_new;
end $$;
revoke all on function public.store_set_price(uuid, numeric, numeric) from public, anon;
grant execute on function public.store_set_price(uuid, numeric, numeric) to authenticated;

-- store_set_featured من 0222 (حرفاً)
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

-- store_set_desc من 0222 (حرفاً)
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

-- image_path_in_use من 0222 (حرفاً)
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

-- audit_kind من 0227 (حرفاً)
create or replace function audit_kind(p_entity text, p_action text, p_details jsonb) returns text
language sql immutable set search_path = public as $$
  with c as (
    select coalesce((select array_agg(k) from jsonb_object_keys(coalesce(p_details->'__changed','{}'::jsonb)) k
                      where k not in ('updated_at','created_at','id','clinic_id')), '{}'::text[]) as ch
  )
  select case
    when p_entity = 'login' then 'login'
    when p_entity = 'client' then case
      when coalesce(p_details->>'event','') like 'override.%' then 'override'
      when coalesce(p_details->>'event','') like 'report.%' then 'export'
      when coalesce(p_details->>'event','') = 'sale.expired' then 'sale_expired'
      else 'print' end
    when p_entity = 'invoices' then case
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_action = 'UPDATE' and p_entity in ('products','purchases','purchase_payments','company_sections')
         and cardinality(c.ch) > 0 and c.ch <@ array['company_id','company_name','section_id']::text[] then 'relink'
    when p_entity = 'products' then case
      when p_action = 'INSERT' then 'product_add'
      when p_action = 'DELETE' then 'product_delete'
      when 'stock' = any(c.ch) then 'stock'
      else 'product_edit' end
    when p_entity = 'price_changes' then 'price_change'
    when p_entity in ('purchases','purchase_items') then 'purchase'
    when p_entity = 'purchase_payments' then 'supplier_pay'
    when p_entity in ('companies','company_sections','generated_barcodes') then 'inventory'
    when p_entity in ('expenses','expense_categories') then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;

-- store_front من 0183 (حرفاً)
create or replace function public.store_front(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  sp store_profiles%rowtype;
  v_name text; v_logo text; v_phone text; v_fb text; v_ig text;
begin
  select * into sp from store_profiles where slug = lower(trim(p_slug)) and enabled;
  if not found then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  -- اشتراكٌ منتهٍ: شاشةُ القبول محجوبةٌ عند العيادة، فاستقبالُ طلبٍ هنا وعدٌ
  -- لا يفي به أحد. «مغلق» أصدقُ من رفٍّ يبيع ولا أحدَ خلفه.
  if not store_clinic_active(sp.clinic_id) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  select coalesce(nullif(cp.clinic_name, ''), pr.full_name), cp.logo_url,
         pr.phone, nullif(cp.social_facebook, ''), nullif(cp.social_instagram, '')
    into v_name, v_logo, v_phone, v_fb, v_ig
  from profiles pr
  left join clinic_prefs cp on cp.clinic_id = pr.id
  where pr.id = sp.clinic_id;

  return jsonb_build_object(
    'ok', true,
    'name', coalesce(v_name, 'عيادة بيطرية'),
    'logo_url', v_logo,
    'phone', v_phone,
    'whatsapp', coalesce(nullif(sp.whatsapp, ''), v_phone),
    'facebook', v_fb,
    'instagram', v_ig,
    'bio', sp.bio,
    'delivery_fee', sp.delivery_fee,
    'min_order', sp.min_order
  );
end;
$$;

revoke all on function public.store_front(text) from public;
grant execute on function public.store_front(text) to anon, authenticated;

-- ── ٢) الدوالُّ الجديدة ──────────────────────────────────────────────────────
drop function if exists public.store_catalog_ids(text, uuid[]);
drop function if exists public.store_catalog2(text, int, int);
drop function if exists public.store_price_review();
drop function if exists public.store_set_image(uuid, text, jsonb);
drop function if exists public.store_publish(uuid[], boolean);
drop function if exists public.store_reorder_products(uuid, uuid[]);
drop function if exists public.store_assign_section(uuid[], uuid);
drop function if exists public.store_sections_reorder(uuid[]);
drop function if exists public.store_section_archive(uuid, boolean);
drop function if exists public.store_section_save(uuid, text);
drop function if exists public.store_sections_list();

-- ── ٣) المحفّزان ثمّ دالّتاهما ─────────────────────────────────────────────────
drop trigger if exists store_profiles_manager_guard on public.store_profiles;
drop function if exists public.store_profiles_manager_guard();
drop trigger if exists products_store_section_guard on public.products;
drop function if exists public.products_store_section_guard();

-- ── ٤) القيودُ والأعمدةُ والجدول ───────────────────────────────────────────────
alter table public.products drop constraint if exists products_image_thumb_safe;
alter table public.products drop constraint if exists products_image_path_safe;
alter table public.products drop constraint if exists products_store_section_fk;
drop index if exists public.products_store_section_idx;
alter table public.products drop column if exists store_section_id;
alter table public.products drop column if exists store_sort;
alter table public.products drop column if exists image_meta;
drop table if exists public.store_sections;
