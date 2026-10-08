-- ============================================================================
-- ٠٢٢٨ — موظّفُ التصوير: المتجرُ كلُّه افتراضاً (بلا الطلبات)، والسعرُ بشرطه (طلبُ المالك، ٨/١٠)
--
-- ── الطلب ──────────────────────────────────────────────────────────────────
-- «يكون عنده تحكّم كامل بالمتجر الإلكتروني» — بلا طلبات الزبائن (قرارُ المالك يبقى كما
-- كان بـ0222: قبولُ الطلب فاتورةٌ ونقصُ مخزون وبياناتُ زبون)، **ومع تغيير السعر** (قرارُه
-- الجديد: سعرُ المتجر هو سعرُ الكاشير نفسُه، والمالكُ قَبِل ذلك صراحةً).
--
-- ── الجذر ──────────────────────────────────────────────────────────────────
-- المتجرُ كان بإذن manageStore، والإذنُ ليس بقالب المصوّر — يمنحه المديرُ يدوياً لكلّ
-- مصوّر. المقيسُ بالإنتاج (٨/١٠): مصوّران بعيادةٍ واحدة، و`staff.permissions` لكليهما `{}`
-- — فلا متجرَ لهما أصلاً. والسعرُ مقفولٌ مرّتين: الشاشةُ تعرضه بلا تعديل، والخادمُ يسيّج
-- `products` كتابةً عن المصوّر (تعديلُ المدير PATCH مباشر على الجدول).
--
-- ── القرار ──────────────────────────────────────────────────────────────────
-- • قالبُ المصوّر = الصور + المتجر. استثناءُ المدير بـstaff.permissions يبقى يغلب
--   (staff_can) — فمديرٌ يطفئ المتجرَ لمصوّرٍ بعينه يُحترم.
-- • السعرُ من `store_set_price` وحدها: definer تسأل manageStore والعيادةَ ونطاقَ
--   photo_products (بلا منتجات الحقول)، وتكتب **بشرط أنّ السعرَ ما زال ما رآه** (قفلُ
--   الصفّ ثم مقارنة — درسُ 0226: الكاتبُ القديم يدوس الرفع)، و`price_moved` بتلميحٍ إن
--   تغيّر. التدقيقُ يكتب «تعديل منتج» باسم المصوّر (auth.uid لا يتغيّر بـdefiner).
--   والجدولُ يبقى مسيَّجاً: لا PATCH مباشر — الدالّةُ البابُ الوحيد.
-- • الطلباتُ والاقتراحُ (مبنيٌّ على المبيعات والإيراد) خارج قائمة البوّابة كما كانا.
-- • photo_products تعطي المجمَّعَ والانتهاء لمن يدير المتجر (لوحةُ الجاهزية والتصفية).
--
-- تُطبَّق بعد 0227. إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع: أعد has_permission وphoto_products
-- وapi_gate من 0222، ثم احذف store_set_price (البوّابةُ أوّلاً — وإلا نادت قائمةً تسمّي دالّةً
-- غيرَ موجودة، وهذا لا يكسر شيئاً لكنه يترك اسماً بلا باب).
-- ============================================================================

-- ── ١) قالبُ المصوّر: الصور + المتجر (مرآتُه PERMISSIONS.photographer بـsrc/lib/staff.ts) ──
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
    when 'photographer' then cap in ('manageProductPhotos','manageStore')
    else false
  end;
$$;

-- ── ٢) المنتجاتُ بأعمدةٍ آمنة — والمجمَّعُ والانتهاءُ لمن يدير المتجر ──────────────
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

-- ── ٣) السعرُ من المتجر بشرطه ────────────────────────────────────────────────
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

-- ── ٤) البوّابة: store_set_price بقائمة المصوّر (الجسمُ نسخةُ 0222 حرفاً + سطرها) ───────
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

comment on function public.store_set_price(uuid, numeric, numeric) is
  'سعرُ البيع من المتجر (0228) لمن يملك manageStore — ومنه المصوّرُ افتراضاً. يكتب بشرط أنّ السعرَ ما زال ما رآه (price_moved).';
