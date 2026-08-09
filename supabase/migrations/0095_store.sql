-- ============================================================================
-- doctorVet — 0095: المتجر الإلكتروني للعيادة (الستور العام).
--
-- الفكرة: كل عيادة تكدر تفعّل «متجر» برابط عام قصير (/s/اسم-المتجر) تحطه
-- ببايو الانستغرام؛ الزبون يتصفح المنتجات المنشورة ويرسل طلب COD باسمه
-- ورقمه وعنوانه — بلا أي تسجيل. الطلب يوصل صندوق «طلبات المتجر» داخل
-- السستم، والدكتور يقبله يدوياً — وعند القبول فقط تنولد الفاتورة وينسحب
-- المخزون (عبر retail_checkout الموجود) ويدخل الطلب خط التوصيل المجرب.
--
-- الأمان — القواعد الذهبية لهذا الملف:
--   • ولا جدول ينفتح للعموم. كل وصول الزوار يمر حصراً عبر ثلاث دوال
--     SECURITY DEFINER تُرجع أعمدة آمنة منتقاة بالاسم (اسم/سعر/وصف فقط —
--     أبداً: سعر الشراء، الكميات، الباركود، أي شيء داخلي).
--   • الأسعار تُقرأ من القاعدة لحظة الطلب (snapshot) — الزبون ما يرسل سعر.
--   • مضاد إغراق: حد أقصى للطلبات لكل رقم/عيادة يومياً + سقوف أطوال صارمة.
--   • المخزون لا يُمس هنا إطلاقاً — القبول اليدوي بالسستم هو الي يسحب.
--
-- Additive & idempotent. Apply AFTER 0094.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) هوية المتجر لكل عيادة: الرابط (slug) والإعدادات.
-- ---------------------------------------------------------------------------
create table if not exists store_profiles (
  clinic_id    uuid primary key references auth.users(id) default auth_clinic(),
  slug         text not null,
  enabled      boolean not null default false,
  bio          text,
  delivery_fee numeric(14,2) not null default 0,
  min_order    numeric(14,2) not null default 0,
  whatsapp     text,
  updated_at   timestamptz not null default now(),
  -- حروف إنكليزية صغيرة وأرقام وشرطات، 3–30، ما يبدي/ينتهي بشرطة.
  constraint store_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$')
);

create unique index if not exists store_profiles_slug_unique on store_profiles(slug);

alter table store_profiles enable row level security;
drop policy if exists store_profiles_clinic_all on store_profiles;
create policy store_profiles_clinic_all on store_profiles for all
  using      (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

drop trigger if exists audit_all on store_profiles;
create trigger audit_all after insert or update or delete on store_profiles
  for each row execute function audit_change();

-- ---------------------------------------------------------------------------
-- 2) المنتجات: علم «معروض بالمتجر» + وصف تسويقي اختياري.
-- ---------------------------------------------------------------------------
alter table products add column if not exists store_visible boolean not null default false;
alter table products add column if not exists store_desc    text;

-- ---------------------------------------------------------------------------
-- 3) طلبات المتجر: صندوق وارد بلقطة أسعار مجمّدة لحظة الطلب.
--    البنود jsonb (وليس جدول بنود) عمداً: الطلب وثيقة تاريخية مجمّدة —
--    تعديل المنتج/سعره لاحقاً لا يغيّر طلباً قديماً أبداً.
-- ---------------------------------------------------------------------------
create table if not exists store_orders (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references auth.users(id),
  order_no       text not null,
  customer_name  text not null,
  customer_phone text not null,
  address        text,
  note           text,
  -- [{product_id, name, qty, price, total}] — أسعار القاعدة لا المتصفح.
  items          jsonb not null,
  subtotal       numeric(14,2) not null,
  delivery_fee   numeric(14,2) not null default 0,
  total          numeric(14,2) not null,
  status         text not null default 'new'
                 check (status in ('new','accepted','rejected','cancelled')),
  -- تنعبي عند القبول — الفاتورة الي ولدها القبول (سحب المخزون صار عبرها).
  invoice_id     uuid references invoices(id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists store_orders_clinic_idx on store_orders(clinic_id, status, created_at desc);
create index if not exists store_orders_phone_idx  on store_orders(clinic_id, customer_phone, created_at desc);

alter table store_orders enable row level security;
drop policy if exists store_orders_clinic_read   on store_orders;
drop policy if exists store_orders_clinic_update on store_orders;
create policy store_orders_clinic_read on store_orders
  for select using (clinic_id = auth_clinic());
-- العيادة تقرر (قبول/رفض) — الإدراج حصراً عبر دالة الطلب العامة أدناه؛
-- لا سياسة insert إطلاقاً حتى ما يقدر أحد يزرع طلبات مباشرة بالجدول.
create policy store_orders_clinic_update on store_orders
  for update
  using      (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

drop trigger if exists audit_all on store_orders;
create trigger audit_all after insert or update or delete on store_orders
  for each row execute function audit_change();

-- ---------------------------------------------------------------------------
-- 4) الواجهة العامة — ثلاث دوال DEFINER هي كل ما يراه الزائر المجهول.
-- ---------------------------------------------------------------------------

-- 4a) بطاقة المتجر: هوية العيادة الآمنة للعرض + إعدادات التوصيل.
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

-- 4b) الكاتلوج: المنتجات المنشورة فقط، بأعمدة العرض فقط.
--     «متوفر» boolean فقط — الكمية الفعلية سر تجاري ما يطلع أبداً.
create or replace function public.store_catalog(p_slug text)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.category::text, p.subcategory, p.sell_price, p.store_desc,
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available
  from store_profiles sp
  join products p on p.clinic_id = sp.clinic_id and p.store_visible
  left join company_sections cs on cs.id = p.section_id
  where sp.slug = lower(trim(p_slug)) and sp.enabled
  order by p.category nulls last, p.name
  limit 500;
$$;

revoke all on function public.store_catalog(text) from public;
grant execute on function public.store_catalog(text) to anon, authenticated;

-- 4c) إرسال طلب ضيف: تحقق صارم + أسعار من القاعدة + مضاد إغراق.
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

  -- مضاد الإغراق: نفس الرقم ≤ 10 طلبات/يوم، والعيادة كلها ≤ 300 طلب/يوم.
  if (select count(*) from store_orders
      where clinic_id = sp.clinic_id
        and regexp_replace(customer_phone, '\D', '', 'g') = v_digits
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

-- 4d) فحص توفر الرابط (لشاشة إعدادات العيادة — مسجّلين فقط).
create or replace function public.store_slug_available(p_slug text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from store_profiles
    where slug = lower(trim(p_slug)) and clinic_id <> auth_clinic()
  );
$$;

revoke all on function public.store_slug_available(text) from public;
grant execute on function public.store_slug_available(text) to authenticated;
