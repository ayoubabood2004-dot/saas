-- ============================================================================
-- ٠١٧٨ — قراءة الستور بلا حدود، وحدُّ الطلبات يعرف ذيل الهاتف
--
-- الجذر (بقرار المالك بعد فحص التطابق):
--
-- ١) حاجز 0096 (٣٠٠ قراءة/دقيقة/IP) كان يحمي وهماً ويؤذي حقيقةً. شبكات
--    الموبايل العراقية خلف CGNAT: آلاف الزبائن الشرعيين يتشاركون IP واحداً،
--    فلحظةَ ازدحامٍ يشوف زبونٌ كتلوجاً فارغاً و«لا يوجد طلب» **بصمت** —
--    بالضبط مصيدة «قائمةٌ ناقصة أخطرُ من خطأ ظاهر». أما الحماية فوهم:
--    النداءُ المرفوض يصل القاعدةَ ويُنفَّذ ويكتب صفاً بـstore_read_hits —
--    يعني الحاجزُ نفسه أغلى من القراءة المحدودة المفهرسة التي «يمنعها».
--    فالقراءتان العامتان (الكتلوج والتتبّع) تصيران قراءتين خالصتين بلا
--    عدّاد — وحدودُ **الكتابة** (١٠ طلبات/رقم و٣٠٠/عيادة باليوم) باقية،
--    هي الحارس الحقيقي. جدول store_read_hits يبقى: بوابةُ المالك (0158)
--    ما زالت تستعمله.
--
-- ٢) حدُّ «١٠ طلبات لكل رقم» كان يقارن الهاتف بكامل أرقامه، فكتابةُ
--    0770… ثم +964770… تصفّر العدّاد. التتبّع (0176) تعلّمها قبله:
--    المطابقة على آخر عشر خانات — نفسُ القاعدة هنا، والطرف التجريبي
--    يتغيّر معها بنفس الدفعة (تطبيعُ طرفٍ واحد أسوأ من لا تطبيع).
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0177.
-- ============================================================================

-- ── ١) الكتلوج: قراءة خالصة — نفس شكل 0177 بلا حاجز ─────────────────────────
create or replace function public.store_catalog(p_slug text, p_limit int default 60, p_offset int default 0)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean, image_path text, featured boolean)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.category::text, p.subcategory, p.sell_price, p.store_desc,
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available,
         p.image_path,
         coalesce(p.store_featured, false)
  from store_profiles sp
  join products p on p.clinic_id = sp.clinic_id and p.store_visible
  left join company_sections cs on cs.id = p.section_id
  where sp.slug = lower(trim(p_slug)) and sp.enabled
  order by p.category nulls last, p.name
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.store_catalog(text, int, int) from public, anon;
grant execute on function public.store_catalog(text, int, int) to anon, authenticated;

-- ── ٢) التتبّع: قراءة خالصة — نفس مطابقة 0176 بلا حاجز ──────────────────────
create or replace function public.store_order_track(p_slug text, p_order_no text, p_phone text)
returns table (order_no text, status text, total numeric, created_at timestamptz, decided_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select o.order_no, o.status, o.total, o.created_at, o.decided_at
  from store_orders o
  join store_profiles sp on sp.clinic_id = o.clinic_id
  where length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 8
    and length(trim(coalesce(p_order_no, ''))) >= 4
    and sp.slug = lower(trim(p_slug))
    and upper(trim(o.order_no)) = upper(trim(p_order_no))
    -- آخر عشر خانات بالطرفين (0176): 0770… و+964770… نفس الذيل.
    and right(regexp_replace(o.customer_phone, '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
  limit 1;
$$;

revoke all on function public.store_order_track(text, text, text) from public, anon;
grant execute on function public.store_order_track(text, text, text) to anon, authenticated;

-- ── ٣) إرسال الطلب: نفس 0095 حرفياً إلا سطرَ حدِّ الرقم — آخر عشر خانات ─────
create or replace function public.store_place_order(
  p_slug text, p_name text, p_phone text, p_address text, p_note text, p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sp store_profiles%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_digits text;
  v_items jsonb := '[]'::jsonb;
  v_line jsonb;
  v_pid uuid; v_qty int;
  v_prod record;
  v_subtotal numeric := 0;
  v_total numeric;
  v_no text;
  v_id uuid;
begin
  select * into sp from store_profiles where slug = lower(trim(p_slug)) and enabled;
  if not found then return jsonb_build_object('ok', false, 'error', 'closed'); end if;

  -- سقوف الأطوال — ولا حقل يوصل بلا حد.
  if length(v_name) < 2 or length(v_name) > 80 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if length(v_digits) < 8 or length(v_digits) > 15 then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  if length(coalesce(p_address, '')) > 300 or length(coalesce(p_note, '')) > 500 then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    return jsonb_build_object('ok', false, 'error', 'bad_items');
  end if;

  -- مضاد الإغراق: نفس الرقم ≤ 10 طلبات/يوم — والرقمُ ذيلُه لا صيغتُه (0178):
  -- المقارنة بكامل الأرقام كانت تنخدع بـ+964، والتتبّع يطابق بالذيل أصلاً.
  if (select count(*) from store_orders
      where clinic_id = sp.clinic_id
        and right(regexp_replace(customer_phone, '\D', '', 'g'), 10) = right(v_digits, 10)
        and created_at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if (select count(*) from store_orders
      where clinic_id = sp.clinic_id and created_at > now() - interval '24 hours') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- بناء البنود: المنتج لازم يكون منشوراً بمتجر هذي العيادة تحديداً،
  -- والسعر يُقرأ من القاعدة الآن ويتجمّد داخل الطلب.
  for v_line in select * from jsonb_array_elements(p_items) loop
    begin
      v_pid := (v_line->>'product_id')::uuid;
      v_qty := (v_line->>'qty')::int;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'bad_items');
    end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then return jsonb_build_object('ok', false, 'error', 'bad_items'); end if;
    select id, name, sell_price into v_prod
    from products where id = v_pid and clinic_id = sp.clinic_id and store_visible;
    if not found then return jsonb_build_object('ok', false, 'error', 'bad_items'); end if;
    v_items := v_items || jsonb_build_object(
      'product_id', v_prod.id, 'name', v_prod.name, 'qty', v_qty,
      'price', v_prod.sell_price, 'total', round(v_prod.sell_price * v_qty, 2));
    v_subtotal := v_subtotal + v_prod.sell_price * v_qty;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  if sp.min_order > 0 and v_subtotal < sp.min_order then
    return jsonb_build_object('ok', false, 'error', 'min_order', 'min_order', sp.min_order);
  end if;
  v_total := round(v_subtotal + sp.delivery_fee, 2);

  -- رقم طلب قصير للتخاطب («طلبك SO-3F9A2C») — فريد عملياً، والـ id هو المرجع الحقيقي.
  v_no := 'SO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into store_orders (clinic_id, order_no, customer_name, customer_phone, address, note,
                            items, subtotal, delivery_fee, total, status)
  values (sp.clinic_id, v_no, v_name, v_phone,
          nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_note, '')), ''),
          v_items, v_subtotal, sp.delivery_fee, v_total, 'new')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'order_no', v_no, 'total', v_total);
end;
$$;

revoke all on function public.store_place_order(text, text, text, text, text, jsonb) from public;
grant execute on function public.store_place_order(text, text, text, text, text, jsonb) to anon, authenticated;
