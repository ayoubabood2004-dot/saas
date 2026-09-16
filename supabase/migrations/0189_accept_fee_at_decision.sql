-- ============================================================================
-- ٠١٨٩ — أجرةُ التوصيل تُحسم عند القبول لا بالإعدادات
--
-- المقيسُ على `delivery_orders` بالإنتاج: **٥٢٣ صفّاً من ٥٢٣ بلا `zone`** —
-- لا مناطقَ مسعَّرةً إطلاقاً، والتسعيرُ بالمكالمة. وإحدى عشرةَ قيمةَ أجرةٍ
-- مختلفة بين صفرٍ وخمسةَ عشرَ ألفاً. أي أنّ رقماً ثابتاً واحداً بإعدادات
-- المتجر **لا يصف ما تفعله العيادةُ فعلاً** — وهي تفعله منذ ٥٢٣ طلباً.
--
-- فالأجرةُ تصير قابلةً للكتابة **بلحظة القبول**، ويُبنى منها بندُ الفاتورة
-- وصفُّ التوصيل معاً — من رقمٍ واحدٍ لا رقمين ينحرفان.
--
-- و`final_total` يتبعها: كان `o.total` المحسوبَ بأجرةِ لحظةِ الطلب، فلو
-- عدّلها الدكتورُ عند القبول لبقيت الفاتورةُ على القديم والصفُّ على الجديد.
--
-- البدنُ نسخةٌ حرفيّة من 0183 عدا ما ذُكر. تُعاد بلا أثرٍ ثانٍ. بعد 0188.
-- ============================================================================

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
  -- فحصُ العيادة والدور بنفسها: definer يتجاوز RLS، فحارسُ الوصول هنا لا هناك
  -- (درسُ 0145 — أوّلُ حذفٍ كان سيُرفض بـRLS لأن الدالّة نزلت بصلاحية المُستدعي).
  -- الحارسُ **عضويّةُ العيادة** لا قائمةُ أدوار — مطابقاً لسياسة
  -- `store_orders_clinic_update` التي كانت تحكم هذا الفعل قبل الدالّة.
  --
  -- وأوّلُ صياغةٍ لهذا السطر كتبت `in ('manager','receptionist','doctor')`،
  -- وقياسُ الإنتاج نسفها: مفرداتُ `memberships.role` هي manager و
  -- **veterinarian** و receptionist و groomer — و«doctor» ليست منها إطلاقاً.
  -- أي أن القائمةَ كانت ستمنع الطبيبَين الحيَّين من قبول أيّ طلب. وشدُّ
  -- الصلاحية أضيقَ ممّا كانت عليه قرارُ منتجٍ لم يطلبه أحد، ولا يُهرَّب داخل
  -- هجرةٍ تقنية: إن أُريد لاحقاً فبقياسٍ وبكلمة المالك.
  if v_clinic is null then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية تقبل طلبات المتجر.';
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

  /* أجرةُ التوصيل **تُحسم عند القبول** لا عند نشر المتجر.
   *
   * المقيسُ على `delivery_orders`: **٥٢٣ صفّاً من ٥٢٣ بلا `zone`** — لا مناطقَ
   * مسعَّرةً إطلاقاً، التسعيرُ بالمكالمة. وإحدى عشرةَ قيمةَ أجرةٍ مختلفة بين
   * صفرٍ وخمسةَ عشرَ ألفاً. أي أنّ رقماً ثابتاً بالإعدادات لا يصف ما يفعلنه.
   *
   * فالوسيطُ يغلب حين يُمرَّر (ولو كان صفراً — «مجّاناً لهذا الطلب» قرارٌ)،
   * وإلّا فأجرةُ الطلب كما وقعت. والقبولُ المعاد بلا وسيطٍ لا يغيّر شيئاً:
   * `retail_checkout` ترجع نفسَ الفاتورة بالمرجع الثابت. */
  v_fee := round(greatest(coalesce(p_fee, o.delivery_fee, 0), 0), 2);
  if v_fee > 0 then
    v_items := v_items || jsonb_build_object(
      'product_id', null, 'name', 'أجرة توصيل', 'barcode', null,
      'qty', 1, 'unit_price', v_fee, 'unit_cost', 0, 'stock_qty', 0);
  end if;

  -- الفاتورة: مرجعٌ ثابتٌ من الطلب (0135) — فالقبولُ المعاد يرجع نفسَها.
  select * into v_inv from retail_checkout(v_items, jsonb_build_object(
    'customer_name',  o.customer_name,
    'customer_phone', o.customer_phone,
    -- المجموعُ يتبع الأجرةَ المحسومة: `o.total` محسوبٌ بأجرةِ لحظةِ الطلب،
    -- فلو عدّلها الدكتورُ عند القبول لبقيت الفاتورةُ على القديم.
    'final_total',    round(o.subtotal + v_fee, 2),
    'amount_paid',    0,
    'notes',          'طلب متجر ' || o.order_no || coalesce(' — ' || o.note, ''),
    'client_ref',     'store-' || o.id::text));

  v_due := round(greatest(v_inv.total - coalesce(v_inv.amount_paid, 0), 0), 2);

  -- صفُّ التوصيل — والفريدُ بـ0180 يجعل الإعادةَ بلا أثرٍ ثانٍ.
  insert into delivery_orders (clinic_id, invoice_id, courier_id, customer_name, customer_phone,
                               address, note, delivery_fee, cod_amount, prepaid, status, dispatched_at)
  values (v_clinic, v_inv.id, p_courier, o.customer_name, o.customer_phone,
          o.address, o.note, v_fee, v_due, 0,
          case when p_courier is null then 'preparing' else 'out' end,
          case when p_courier is null then null else now() end)
  on conflict (invoice_id) do nothing;

  -- الختم: `decided_at` يكتبه حارسُ 0176 من ساعة الخادم.
  update store_orders set status = 'accepted', invoice_id = v_inv.id where id = o.id;

  return jsonb_build_object('ok', true, 'already', false, 'invoice_id', v_inv.id, 'order_no', o.order_no);
end $$;

-- التوقيعُ القديم يُسقَط صراحةً: `create or replace` لا يستبدل توقيعاً مختلفاً
-- بل يضيف حِملاً ثانياً، فيصير نداءٌ بوسيطين غامضاً (درسُ 0096 بوجهٍ آخر).
drop function if exists public.store_accept_order(uuid, uuid);
revoke all on function public.store_accept_order(uuid, uuid, numeric) from public, anon;
grant execute on function public.store_accept_order(uuid, uuid, numeric) to authenticated;
