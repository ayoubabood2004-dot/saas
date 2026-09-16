-- ============================================================================
-- ٠١٨٣ — القبولُ ذرّيّ، وأعمدةُ الطلب مجمَّدة، والحدودُ تُحسب على ما ينتظر
--
-- الجذر: قبولُ طلبِ المتجر كان ثلاثَ رحلاتٍ من المتصفّح — فاتورةٌ ثم صفُّ
-- توصيلٍ ثم ختمُ الطلب. وكلُّ حدٍّ بينها نقطةُ انكسار:
--   • نجحت الفاتورةُ وفشل الختم ⇒ الطلبُ يبقى «جديداً» والبضاعةُ خرجت. يُقبل
--     ثانيةً فيرجع 0135 نفسَ الفاتورة (سليم) — لكنّ 0180 وحدَها هي ما منع
--     صفَّ التوصيل الثاني. أي أننا عالجنا العَرَض، والسببُ هنا.
--   • نجح الختمُ وفشل التوصيل ⇒ طلبٌ «مقبول» بلا صفِّ توصيل، لا يراه أحد.
-- والعلاجُ معاملةٌ واحدة بالخادم: الثلاثةُ تقع أو لا يقع شيء.
--
-- ولا تُعاد كتابةُ محرّك المال: `retail_checkout` دالّةُ خادمٍ أصلاً (0156)،
-- فتُنادى من هنا بنفس مرجعها الثابت `store-<id>` — فالقبولُ المعاد يرجع نفسَ
-- الفاتورة بلا خصمِ مخزونٍ ثانٍ.
--
-- **فخُّ ترتيب المحفّزات**: محفّزاتُ BEFORE تُطلَق **أبجدياً**. وحارسُ 0176
-- اسمُه `store_orders_before_update_status` ويكتب `decided_at`. فمحفّزُ تجميدٍ
-- باسمٍ يقع **بعده** أبجدياً يرى `decided_at` وقد تغيّر ويرفض كلَّ قبول —
-- مُجرَّب. فاسمُ التجميد هنا `store_orders_before_update_freeze` (freeze < status
-- أبجدياً) ليجري **قبله**، ويسمح بالأعمدة التي يكتبها القبولُ والرفض.
--
-- والمحفّزُ invoker عمداً بنمط 0162: يحرس حين `current_user = 'authenticated'`
-- وحده. دالّةُ القبول definer فتجري بصلاحية المالك و`current_user` يصير المالكَ
-- فتمرّ بلا شدّ — وهذا هو المقصود: الحارسُ على التحديث المباشر من المتصفّح.
--
-- وحدُّ الطلبات كان يعدّ **كلَّ** الحالات: عيادةٌ بتّت ثلاثمئةِ طلبٍ بيومٍ
-- ناجح تُقفل بابَها بيدها. صار العدُّ على `status='new'` وحدَه — أي على ما
-- ينتظر فعلاً — ومعه سقفٌ بالساعة يمسك الإغراقَ الذي لا يمسكه سقفُ اليوم.
--
-- وفحصُ الاشتراك (البند ١٨): المتجرُ كان يستقبل طلباتٍ بعد انتهاء الاشتراك
-- بينما شاشةُ القبول محجوبة — فالزبونُ يطلب ولا أحدَ يردّ. صار `store_front`
-- يقول «مغلق» و`store_place_order` يرفض بسببٍ صريح.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0182.
-- ============================================================================

-- ── ١) اشتراكٌ فعّال: تجربةٌ سارية أو مدّةٌ مدفوعة ─────────────────────────
create or replace function public.store_clinic_active(p_clinic uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select greatest(coalesce(s.trial_ends_at, 'epoch'::timestamptz),
                     coalesce(s.current_period_end, 'epoch'::timestamptz)) > now()
       from subscriptions s where s.clinic_id = p_clinic),
    false);
$$;
revoke all on function public.store_clinic_active(uuid) from public, anon, authenticated;

-- ── ٢) محفّزُ تجميد أعمدة الطلب ────────────────────────────────────────────
-- الطلبُ شهادةُ ما طلبه الزبون. بنودُه ومجاميعُه وهاتفُه لا تُعدَّل من المتصفّح
-- بعد وقوعه — والقرارُ وحدَه يتغيّر.
create or replace function store_orders_guard_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.clinic_id      is distinct from old.clinic_id
  or new.order_no       is distinct from old.order_no
  or new.customer_name  is distinct from old.customer_name
  or new.customer_phone is distinct from old.customer_phone
  or new.items          is distinct from old.items
  or new.subtotal       is distinct from old.subtotal
  or new.delivery_fee   is distinct from old.delivery_fee
  or new.total          is distinct from old.total
  or new.created_at     is distinct from old.created_at then
    raise exception 'store_order_frozen'
      using hint = 'بنودُ طلب المتجر ومجاميعُه وبياناتُ الزبون ما تتعدّل بعد وقوعه — هي شهادةُ ما طلبه. الي يتغيّر هو القرار وحده.';
  end if;
  return new;
end $$;

-- الاسمُ يسبق `store_orders_before_update_status` أبجدياً عمداً (انظر الترويسة).
drop trigger if exists store_orders_before_update_freeze on store_orders;
create trigger store_orders_before_update_freeze
  before update on store_orders
  for each row execute function store_orders_guard_freeze();

-- ── ٣) القبولُ الذرّيّ ─────────────────────────────────────────────────────
create or replace function public.store_accept_order(p_order uuid, p_courier uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := coalesce(auth_role(), '');
  o         store_orders;
  v_line    jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_prod    record;
  v_inv     invoices;
  v_due     numeric(14,2);
begin
  -- فحصُ العيادة والدور بنفسها: definer يتجاوز RLS، فحارسُ الوصول هنا لا هناك
  -- (درسُ 0145 — أوّلُ حذفٍ كان سيُرفض بـRLS لأن الدالّة نزلت بصلاحية المُستدعي).
  if v_clinic is null then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية تقبل طلبات المتجر.';
  end if;
  if v_role not in ('manager', 'receptionist', 'doctor') then
    raise exception 'not_authorized' using hint = 'قبولُ الطلبات لكادر العيادة.';
  end if;

  select * into o from store_orders where id = p_order and clinic_id = v_clinic;
  if not found then
    raise exception 'order_not_found' using hint = 'ما لكينا هذا الطلب بهذي العيادة.';
  end if;

  -- مقبولٌ سلفاً: نُرجع نتيجتَه بدل أن نرمي — إعادةُ المحاولة مأمونة.
  if o.status = 'accepted' then
    return jsonb_build_object('ok', true, 'already', true, 'invoice_id', o.invoice_id, 'order_no', o.order_no);
  end if;
  if o.status <> 'new' then
    raise exception 'store_order_status_locked'
      using hint = 'قرار الطلب نهائي: طلبٌ مرفوضٌ أو ملغى ما يرجع «جديد».';
  end if;

  -- بنودُ الفاتورة من بنود الطلب. منتجٌ حُذف بعد الطلب يصير بندَ خدمةٍ بلا
  -- سحبِ مخزون — بدل أن يفشل المفتاحُ الأجنبيّ ويسقط القبولُ كلُّه.
  for v_line in select * from jsonb_array_elements(o.items) loop
    select id, barcode, purchase_price into v_prod
      from products where id = (v_line->>'product_id')::uuid and clinic_id = v_clinic;
    v_items := v_items || jsonb_build_object(
      'product_id', v_prod.id,
      'name',       v_line->>'name',
      'barcode',    v_prod.barcode,
      'qty',        (v_line->>'qty')::numeric,
      'unit_price', (v_line->>'price')::numeric,
      'unit_cost',  coalesce(v_prod.purchase_price, 0),
      'stock_qty',  case when v_prod.id is null then 0 else (v_line->>'qty')::numeric end);
  end loop;

  -- أجرةُ التوصيل بندَ خدمةٍ حقيقيّ على الفاتورة، فتدخل التقاريرَ بلا حالةٍ خاصّة.
  if coalesce(o.delivery_fee, 0) > 0 then
    v_items := v_items || jsonb_build_object(
      'product_id', null, 'name', 'أجرة توصيل', 'barcode', null,
      'qty', 1, 'unit_price', o.delivery_fee, 'unit_cost', 0, 'stock_qty', 0);
  end if;

  -- الفاتورة: مرجعٌ ثابتٌ من الطلب (0135) — فالقبولُ المعاد يرجع نفسَها.
  select * into v_inv from retail_checkout(v_items, jsonb_build_object(
    'customer_name',  o.customer_name,
    'customer_phone', o.customer_phone,
    'final_total',    o.total,
    'amount_paid',    0,
    'notes',          'طلب متجر ' || o.order_no || coalesce(' — ' || o.note, ''),
    'client_ref',     'store-' || o.id::text));

  v_due := round(greatest(v_inv.total - coalesce(v_inv.amount_paid, 0), 0), 2);

  -- صفُّ التوصيل — والفريدُ بـ0180 يجعل الإعادةَ بلا أثرٍ ثانٍ.
  insert into delivery_orders (clinic_id, invoice_id, courier_id, customer_name, customer_phone,
                               address, note, delivery_fee, cod_amount, prepaid, status, dispatched_at)
  values (v_clinic, v_inv.id, p_courier, o.customer_name, o.customer_phone,
          o.address, o.note, coalesce(o.delivery_fee, 0), v_due, 0,
          case when p_courier is null then 'preparing' else 'out' end,
          case when p_courier is null then null else now() end)
  on conflict (invoice_id) do nothing;

  -- الختم: `decided_at` يكتبه حارسُ 0176 من ساعة الخادم.
  update store_orders set status = 'accepted', invoice_id = v_inv.id where id = o.id;

  return jsonb_build_object('ok', true, 'already', false, 'invoice_id', v_inv.id, 'order_no', o.order_no);
end $$;

revoke all on function public.store_accept_order(uuid, uuid) from public, anon;
grant execute on function public.store_accept_order(uuid, uuid) to authenticated;

-- ── ٤) رفضٌ جماعيّ ─────────────────────────────────────────────────────────
-- بدل «سياسة DELETE على المرفوض» التي اقترحها التقرير: الحذفُ عندنا طيٌّ لا
-- محو، ولا سلّةَ لـ`store_orders`. والرفضُ الجماعيّ أرخصُ ويفي بالغرض نفسِه —
-- عيادةٌ رجعت من عطلةٍ تجد عشراتِ الطلبات القديمة فتبتّها بضغطة.
create or replace function public.store_reject_stale(p_older_than_hours int default 24)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_n      int;
begin
  if v_clinic is null or coalesce(auth_role(), '') not in ('manager', 'receptionist', 'doctor') then
    raise exception 'not_authorized' using hint = 'رفضُ الطلبات لكادر العيادة.';
  end if;
  update store_orders
     set status = 'rejected'
   where clinic_id = v_clinic
     and status = 'new'
     and created_at < now() - make_interval(hours => greatest(coalesce(p_older_than_hours, 24), 1));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.store_reject_stale(int) from public, anon;
grant execute on function public.store_reject_stale(int) to authenticated;

-- ── ٥) واجهةُ المتجر: اشتراكٌ منتهٍ = مغلق ────────────────────────────────
-- بدنُ 0095 حرفياً (آخرُ تعريفٍ لها هناك لا بـ0178) + سطرُ الاشتراك.
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

-- ── ٦) الطلب: الحدودُ على ما ينتظر، وسقفٌ بالساعة، واشتراكٌ فعّال ─────────
-- نسخةٌ حرفية من 0178 عدا كتلة الحدود وسطرِ الاشتراك.
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
