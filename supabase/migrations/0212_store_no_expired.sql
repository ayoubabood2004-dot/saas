-- ============================================================================
-- ٠٢١٢ — المتجرُ الإلكترونيّ لا يبيع المنتهي (قرارُ المالك ٢٥/٩)
--
-- م١ جعلت شاشةَ البيع تسأل بالاسم قبل بيع مادّةٍ منتهية. وبقي بابٌ بلا سؤال:
-- المتجرُ الإلكترونيّ — الزبونُ يطلب، والدكتورُ يقبل بضغطة، و`retail_checkout`
-- تُخرجها من الرفّ. فالقرار: **لا ربطَ بين المتجر والمنتهي**، من ثلاث جهات:
--   ١) `store_catalog`: المنتهي لا يُعرض (كالسعر الصفريّ بـ0188).
--   ٢) `store_place_order`: سلّةٌ قديمة فيها منتهٍ تُرفض بـ`bad_items` — ردٌّ يعرفه
--      المتجرُ أصلاً: «صار تغيير بالمنتجات — حدّث الصفحة».
--   ٣) `store_accept_order`: طلبٌ وقع قبل الانتهاء وقُبل بعده يُرفض **بالاسم**.
--
-- «منتهية» = `expiry_date < اليوم ببغداد` — نفسُ قاعدة `expiry.ts` (آخرُ يومٍ صالح).
-- والاختفاءُ لا يكون صامتاً: لوحةُ «جاهزية متجرك» تعدّ المنتهي المخفيّ.
--
-- الأجسامُ نسخٌ حرفيّة عدا شرط الانتهاء: الكتلوجُ والطلبُ من 0188/0183 (مطابقان للمنشور
-- بالبصمة ٢٥/٩)، والقبولُ **من المنشور** لأنه افترق عن 0189 (انظر فوقه).
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0211.
-- ============================================================================

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
    -- سعرٌ ≤ ٠ لا يُعرض: الطلبُ يسعّر من القاعدة فيُقبل مجّاناً (مرآةُ 0186).
    and coalesce(p.sell_price, 0) > 0
    -- 0212: المنتهي لا يُعرض (قرارُ المالك). `expiry_date` آخرُ يومٍ صالح، واليومُ ببغداد.
    and (p.expiry_date is null or p.expiry_date >= (now() at time zone 'Asia/Baghdad')::date)
  order by coalesce(p.store_featured, false) desc, p.category nulls last, p.name, p.id
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

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
  -- اشتراكٌ منتهٍ: الطلبُ يقع ولا أحدَ يقدر يقبله (شاشةُ القبول محجوبة).
  if not store_clinic_active(sp.clinic_id) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

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
  -- سقفُ العيادة يُحسب على ما **ينتظر** لا على كلّ الحالات: عيادةٌ بتّت
  -- ثلاثمئةِ طلبٍ بيومٍ ناجح كانت تُقفل بابَها بيدها. والمعلَّقُ وحده هو ما
  -- يُغرِق شاشةَ القبول فعلاً.
  if (select count(*) from store_orders
      where clinic_id = sp.clinic_id and status = 'new'
        and created_at > now() - interval '24 hours') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- وسقفٌ بالساعة: إغراقٌ بثلاثِ دقائق لا يمسكه سقفُ اليوم إلا بعد فوات الأوان.
  if (select count(*) from store_orders
      where clinic_id = sp.clinic_id and created_at > now() - interval '1 hour') >= 60 then
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
    from products where id = v_pid and clinic_id = sp.clinic_id and store_visible
      -- 0212: سلّةٌ فُتحت قبل منتصف الليل وأُرسلت بعده — المنتهي يُرفض بنفس ردّ
      -- «صار تغيير بالمنتجات — حدّث الصفحة» والكتلوجُ المحدَّث ما عاد يعرضه.
      and (expiry_date is null or expiry_date >= (now() at time zone 'Asia/Baghdad')::date);
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

-- **النصُّ من الإنتاج لا من 0189** (مقيسٌ ٢٥/٩): المنشورُ يختلف عن 0189 بثلاثة —
-- `for update` على صفّ الطلب (قبولان متزامنان لا يمرّان معاً)، و`if o.id is null`،
-- ورمزُ `decision_locked` بتلميحٍ آخر. تصحيحٌ حيٌّ نزل بلا هجرةٍ بالمستودع؛ ونسخُ
-- 0189 كان سيُسقطه بصمت. فالمنشورُ هو الأصل هنا، ويُسجَّل أخيراً بالمستودع.
create or replace function public.store_accept_order(p_order uuid, p_courier uuid default null, p_fee numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  o         store_orders;
  v_line    jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_prod    record;
  v_inv     invoices;
  v_due     numeric(14,2);
  v_fee     numeric(14,2);
begin
  -- فحصُ العيادة بنفسها: definer يتجاوز RLS (درسُ 0145).
  if v_clinic is null then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية تقبل طلبات المتجر.';
  end if;
  select * into o from store_orders where id = p_order and clinic_id = v_clinic for update;
  if o.id is null then
    raise exception 'order_not_found' using hint = 'ما لكينا هذا الطلب ضمن عيادتك.';
  end if;
  if o.status = 'accepted' then
    return jsonb_build_object('ok', true, 'already', true, 'invoice_id', o.invoice_id, 'order_no', o.order_no);
  end if;
  if o.status <> 'new' then
    raise exception 'decision_locked' using hint = 'الطلب انبتّ من قبل — ما تكدر تغيّر قراره.';
  end if;
  for v_line in select * from jsonb_array_elements(o.items) loop
    select id, barcode, purchase_price, expiry_date into v_prod
    from products where id = (v_line->>'product_id')::uuid and clinic_id = v_clinic;
    -- 0212: طلبٌ وقع والمادّةُ صالحة، ثمّ انتهت قبل القبول — لا يخرج من الرفّ.
    -- يُرمى بالاسم ولا يُحذف السطرُ بصمت: الفاتورةُ الناقصة تكذب على الزبون بالمبلغ.
    if v_prod.id is not null and v_prod.expiry_date < (now() at time zone 'Asia/Baghdad')::date then
      raise exception 'store_item_expired'
        using hint = format('بالطلب مادة منتهية الصلاحية: %s — ما نطلعها من المتجر. ارفض الطلب أو اتصل بالزبون.', v_line->>'name');
    end if;
    v_items := v_items || jsonb_build_object(
      'product_id', v_prod.id,
      'name',       v_line->>'name',
      'barcode',    v_prod.barcode,
      'qty',        (v_line->>'qty')::numeric,
      'unit_price', (v_line->>'price')::numeric,
      'unit_cost',  coalesce(v_prod.purchase_price, 0),
      'stock_qty',  case when v_prod.id is null then 0 else (v_line->>'qty')::numeric end);
  end loop;
  -- الأجرةُ تُحسم عند القبول (0189).
  v_fee := round(greatest(coalesce(p_fee, o.delivery_fee, 0), 0), 2);
  if v_fee > 0 then
    v_items := v_items || jsonb_build_object(
      'product_id', null, 'name', 'أجرة توصيل', 'barcode', null,
      'qty', 1, 'unit_price', v_fee, 'unit_cost', 0, 'stock_qty', 0);
  end if;
  select * into v_inv from retail_checkout(v_items, jsonb_build_object(
    'customer_name',  o.customer_name,
    'customer_phone', o.customer_phone,
    'final_total',    round(o.subtotal + v_fee, 2),
    'amount_paid',    0,
    'notes',          'طلب متجر ' || o.order_no || coalesce(' — ' || o.note, ''),
    'client_ref',     'store-' || o.id::text));
  v_due := round(greatest(v_inv.total - coalesce(v_inv.amount_paid, 0), 0), 2);
  insert into delivery_orders (clinic_id, invoice_id, courier_id, customer_name, customer_phone,
                               address, note, delivery_fee, cod_amount, prepaid, status, dispatched_at)
  values (v_clinic, v_inv.id, p_courier, o.customer_name, o.customer_phone,
          o.address, o.note, v_fee, v_due, 0,
          case when p_courier is null then 'preparing' else 'out' end,
          case when p_courier is null then null else now() end)
  on conflict (invoice_id) do nothing;
  update store_orders set status = 'accepted', invoice_id = v_inv.id where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'invoice_id', v_inv.id, 'order_no', o.order_no);
end $$;
revoke all on function public.store_accept_order(uuid, uuid, numeric) from public, anon;
grant execute on function public.store_accept_order(uuid, uuid, numeric) to authenticated;
