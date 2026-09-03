-- ============================================================================
-- ٠١٤٩ — التقارير تسأل القاعدة بدل أن تنزّل التاريخ كله
--
-- ── المقيس ───────────────────────────────────────────────────────────────
-- سبعةُ مواضع بالواجهة كانت تجيب كلَّ الفواتير وكلَّ سطورها ثم تفلتر بالمتصفّح
-- على المدّة المختارة. أكبرُ عيادة تنزّل ~٢ ميغابايت كل فتحة، وعند ١٠٠ ألف سطر
-- تصير ~٤٥ ميغابايت — الآيباد يعلّق والهاتف يطيح. سقفُ الألف القديم كان يخفي
-- المشكلة (ويكذب بالأرقام)؛ لمّا صُلّح صارت الحقيقةُ كلُّها تنزل.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- القاعدةُ تجمع، والمتصفّحُ يعرض. المجاميعُ من `group by` (٣٠ صفاً لا ٣٠ ألفاً)،
-- والسطورُ بمدّةٍ وبحدّ. ولا جدولَ ملخّصٍ يُحفظ ويتقادم: كلُّ دالّةٍ هنا تقرأ
-- الفواتير كما هي. بصلاحية المُستدعي — سياساتُ الصفوف هي الحكم.
--
-- ── التطابق ──────────────────────────────────────────────────────────────
-- `receipt_legs()` مرآةُ `receiptsOf` بالواجهة حرفياً (الأرجل بتاريخ وصولها،
-- الأرجلُ الفارغة = دفعةٌ واحدة بتاريخ الفاتورة، المردودُ لا شيء، الساقُ السالبة
-- تصحيحٌ يُحسب). فحصُ الحزمة يولّد ٣٠٠ فاتورةً بكل الأشكال ويقارن SQL بالواجهة
-- فلساً بفلس.
-- ============================================================================

-- ── ٠) أدوات ─────────────────────────────────────────────────────────────
/** أرقامُ الهاتف كما تراها الواجهة (phoneDigits): أرقامٌ شرقية → لاتينية، وبلا فواصل. */
create or replace function phone_digits(t text) returns text
language sql immutable strict set search_path = public as $$
  select regexp_replace(translate(t, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\D', '', 'g')
$$;

/** تاريخٌ من نصٍّ قد يكون ناقصاً — بلا أن يُسقط الاستعلام كله. */
create or replace function safe_ts(t text) returns timestamptz
language plpgsql immutable set search_path = public as $$
begin
  if t is null or t = '' then return null; end if;
  return t::timestamptz;
exception when others then return null;
end $$;

create or replace function safe_num(t text) returns numeric
language plpgsql immutable set search_path = public as $$
begin
  if t is null or t = '' then return null; end if;
  return t::numeric;
exception when others then return null;
end $$;

-- ── ١) فهارس: الهاتفُ مطبَّعاً، والدينُ المفتوح ────────────────────────────
-- فهرسا (clinic_id, created_at) للفواتير والسطور موجودان أصلاً (0101 و0133)،
-- وهما يغنيان عن فهرسَي العيادة وحدها (بادئتهما) — فيُسقَط القديمان: كلفةُ
-- كتابةٍ بلا مكسبِ قراءة.
drop index if exists invoices_clinic_idx;
drop index if exists invoice_items_clinic_idx;
create index if not exists invoices_clinic_phone_idx        on invoices(clinic_id, phone_digits(customer_phone));
create index if not exists invoices_open_debt_idx           on invoices(clinic_id)
  where coalesce(status, 'paid') <> 'refunded' and coalesce(amount_paid, total) < total - 0.01;

-- ── ٢) الفواتير التي يمكن أن تطابق مدّة ───────────────────────────────────
-- الواجهة تفلتر بنفسها على (created_at) و(تاريخ الأرجل) و(الدين المفتوح عبر
-- كل الوقت). فنرسل الاتحادَ الأدنى الذي يجعل كل تلك الفلاتر صادقة — لا أقلّ.
create or replace function report_invoices(p_from timestamptz, p_to timestamptz)
returns setof invoices
language sql stable security invoker set search_path = public as $$
  select i.*
    from invoices i
   where i.clinic_id = auth_clinic()
     and (
       (i.created_at >= p_from and i.created_at <= p_to)
       or (i.refunded_at is not null and i.refunded_at >= p_from and i.refunded_at <= p_to)
       or (coalesce(i.status, 'paid') <> 'refunded' and coalesce(i.amount_paid, i.total) < i.total - 0.01)
       or exists (
         select 1
           from jsonb_array_elements(case when jsonb_typeof(i.payment_details) = 'array' then i.payment_details else '[]'::jsonb end) l
          where safe_ts(l->>'at') >= p_from and safe_ts(l->>'at') <= p_to)
     )
   order by i.created_at desc
$$;
revoke all on function report_invoices(timestamptz, timestamptz) from public, anon;
grant execute on function report_invoices(timestamptz, timestamptz) to authenticated;

-- ── ٣) فواتير زبون — بنفس مفتاح الواجهة (الهاتف رقمياً، وإلا الاسم) ──────────
create or replace function customer_invoices(p_phone text, p_name text default null)
returns setof invoices
language sql stable security invoker set search_path = public as $$
  select i.*
    from invoices i
   where i.clinic_id = auth_clinic()
     and (
       (coalesce(phone_digits(p_phone), '') <> '' and phone_digits(i.customer_phone) = phone_digits(p_phone))
       or (coalesce(phone_digits(p_phone), '') = ''
           and coalesce(btrim(p_name), '') <> ''
           and coalesce(phone_digits(i.customer_phone), '') = ''
           and lower(btrim(coalesce(i.customer_name, ''))) = lower(btrim(p_name)))
     )
   order by i.created_at desc
$$;
revoke all on function customer_invoices(text, text) from public, anon;
grant execute on function customer_invoices(text, text) to authenticated;

-- ── ٤) المقبوضات بتاريخ وصولها — مرآة receiptsOf ───────────────────────────
create or replace function receipt_legs()
returns table (invoice_id uuid, total numeric, profit numeric, amount numeric, at timestamptz)
language sql stable security invoker set search_path = public as $$
  with inv as (
    select id, total, profit, created_at, amount_paid, payment_details
      from invoices
     where clinic_id = auth_clinic() and coalesce(status, 'paid') <> 'refunded'
  )
  -- أرجلُ الدفع: كلُّ ساقٍ مقدارُها فوق فلس، بتاريخها إن وُجد وإلا تاريخُ الفاتورة.
  select i.id, i.total, i.profit, safe_num(l->>'amount'), coalesce(safe_ts(l->>'at'), i.created_at)
    from inv i
    cross join lateral jsonb_array_elements(i.payment_details) l
   where jsonb_typeof(i.payment_details) = 'array' and jsonb_array_length(i.payment_details) > 0
     and abs(coalesce(safe_num(l->>'amount'), 0)) > 0.01
  union all
  -- بلا أرجل (قديمة): دفعةٌ واحدة بما دُفع، بتاريخ الفاتورة.
  select i.id, i.total, i.profit, coalesce(i.amount_paid, i.total), i.created_at
    from inv i
   where (i.payment_details is null or jsonb_typeof(i.payment_details) <> 'array' or jsonb_array_length(i.payment_details) = 0)
     and coalesce(i.amount_paid, i.total) > 0.01
$$;
revoke all on function receipt_legs() from public, anon;
grant execute on function receipt_legs() to authenticated;

create or replace function report_receipts_daily(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns table (day date, gross numeric, net numeric, invoices int)
language sql stable security invoker set search_path = public as $$
  select (r.at at time zone p_tz)::date as day,
         round(sum(r.amount), 2) as gross,
         round(sum(case when r.total > 0 then r.profit * r.amount / r.total else 0 end), 2) as net,
         count(distinct r.invoice_id)::int as invoices
    from receipt_legs() r
   where r.at >= p_from and r.at <= p_to
   group by 1
   order by 1
$$;
revoke all on function report_receipts_daily(timestamptz, timestamptz, text) from public, anon;
grant execute on function report_receipts_daily(timestamptz, timestamptz, text) to authenticated;

create or replace function report_receipts_total(p_from timestamptz, p_to timestamptz)
returns table (gross numeric, net numeric, invoices int)
language sql stable security invoker set search_path = public as $$
  select coalesce(round(sum(r.amount), 2), 0),
         coalesce(round(sum(case when r.total > 0 then r.profit * r.amount / r.total else 0 end), 2), 0),
         count(distinct r.invoice_id)::int
    from receipt_legs() r
   where r.at >= p_from and r.at <= p_to
$$;
revoke all on function report_receipts_total(timestamptz, timestamptz) from public, anon;
grant execute on function report_receipts_total(timestamptz, timestamptz) to authenticated;

-- ── ٥) الأكثر مبيعاً والموظفون — على فواتير المدّة غير المردودة ───────────
create or replace function report_top_products(p_from timestamptz, p_to timestamptz, p_limit int default 5)
returns table (key text, name text, qty numeric, revenue numeric)
language sql stable security invoker set search_path = public as $$
  select coalesce(it.product_id::text, it.name) as key,
         min(it.name) as name,
         sum(it.qty) as qty,
         round(sum(it.line_total), 2) as revenue
    from invoice_items it
    join invoices i on i.id = it.invoice_id
   where i.clinic_id = auth_clinic()
     and coalesce(i.status, 'paid') <> 'refunded'
     and i.created_at >= p_from and i.created_at <= p_to
   group by 1
   order by 4 desc, 1
   limit greatest(1, coalesce(p_limit, 5))
$$;
revoke all on function report_top_products(timestamptz, timestamptz, int) from public, anon;
grant execute on function report_top_products(timestamptz, timestamptz, int) to authenticated;

create or replace function report_staff(p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, invoices int, revenue numeric, profit numeric)
language sql stable security invoker set search_path = public as $$
  select i.staff_id, count(*)::int, round(sum(i.total), 2), round(sum(coalesce(i.profit, 0)), 2)
    from invoices i
   where i.clinic_id = auth_clinic()
     and coalesce(i.status, 'paid') <> 'refunded'
     and i.created_at >= p_from and i.created_at <= p_to
   group by 1
   order by 3 desc
$$;
revoke all on function report_staff(timestamptz, timestamptz) from public, anon;
grant execute on function report_staff(timestamptz, timestamptz) to authenticated;
