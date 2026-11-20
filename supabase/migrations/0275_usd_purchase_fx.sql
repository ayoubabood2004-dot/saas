-- ============================================================================
-- ٠٢٧٥ — تسديدُ دين الشراء بالدولار بسعر يومه، وفرقُ صرفه بالفاتورة ودفتر الشركة والأرباح والخسائر
--
-- طلبُ المالك (١٧/١١): «ويا كل فاتورة تسديد — اجا اليوم يريد يسدد، الدكتور يكتب اليوم اني سددت والدولار كان على هذا السعر، بالتالي
-- بالعراقي هيجي راح يصير — بحيث نعرف بشكد اشترى الدولار وبشكد باعه». وبسؤال: الفرقُ بالفاتورة ودفتر الشركة **والأرباح والخسائر**.
--
-- ── ما تغيّر عن 0274 ──────────────────────────────────────────────────────────────────────────────────
-- • كلُّ تسديدٍ لدَين الدولار يحمل سعرَ يومه — ولو سُلّم دولاراً (كان السعرُ يُحفظ حين يُسلَّم دينارٌ وحده). المكتوبُ بالشاشة، وإلا
--   سعرُ العيادة الأخير (جهازٌ ما تحدّث لا يُرفض).
-- • `purchase_payments.fx` فرقُ الصرف لكلّ دفعة: حصّتُها بدينار يوم الشراء (amount) ناقصَ ما كلّفت بالدينار يومَ التسديد — المسلَّمُ
--   ديناراً كما سُلّم، والدولارُ بسعر يومه. موجبٌ ربح (الدولارُ نزل)، وسالبٌ خسارة (صعد). وللدفعات القائمة يُحسب مرّةً إن عُرف سعرُها.
-- • `report_pnl`: سطرُ «فرق صرف المشتريات» بشهر التسديد، ويدخل الصافي (net = gross + fx + fx_purchases − expenses). المشترياتُ نفسُها
--   خارج التقرير كما كانت (0256) — الداخلُ ربحُ الصرف وخسارتُه وحدهما.
-- • الإلغاءُ (company_entry_void) يحذف الدفعةَ فيخرج فرقُها معها — كإلغاء أيّ تسديدٍ للشركة.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0274، وقبل الواجهة (القديمةُ تعمل عليها: السعرُ الغائب سعرُ العيادة، والحقلُ الجديد
-- بالتقرير يقرؤه قارئُه الجديد وحده). تراجع: أعد الدوالَّ الثلاث حرفاً من 0274 و0271؛ والعمودُ يبقى.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.purchase_pay_fx(uuid,numeric,text,numeric,text,text,numeric)') is null
     or to_regprocedure('public.company_pay_fx(uuid,text,numeric,text,numeric,text,date,text)') is null
     or to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0274' using hint = 'طبّق 0274 (الشراء بالعملتين) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.purchase_pay_fx(uuid,numeric,text,numeric,text,text,numeric)', '0052f0861d66d91e48df232139399abc', '-- +0275');
select public._drift_assert('public.company_pay_fx(uuid,text,numeric,text,numeric,text,date,text)', '6479376fa2b771f3682a6d707ec30b80', '-- +0275');
select public._drift_assert('public.report_pnl(timestamptz,timestamptz,text)', '94d9e9b5b0fce9dfc478e81b1adb8eca', '-- +0275');

-- ── ١) العمود، والدفعاتُ القائمة ─────────────────────────────────────────────────────────────────────────
alter table public.purchase_payments add column if not exists fx numeric(14,2);

-- دفعةُ دينٍ بالدولار عُرف سعرُها (بها أو بتسديدها على الحساب): سعرُها على صفّها، وفرقُها. وما لا سعرَ له يبقى بلا فرق (مجهولٌ لا صفر).
-- ببابها (0274) وبمعاملةٍ واحدة: الإعدادُ المحلّيّ يعيش للمعاملة وحدها.
do $$
begin
  perform set_config('doctorvet.usd_purchase_door', 'on', true);
  update public.purchase_payments pp
     set fx_rate = coalesce(pp.fx_rate, e.fx_rate)
    from public.company_entries e
   where e.id = pp.entry_id and pp.fx_rate is null and e.fx_rate is not null and pp.usd is not null;
  update public.purchase_payments pp
     set fx = pp.amount - (case when pp.pay_currency = 'IQD' and pp.entry_id is null and pp.handed is not null then pp.handed
                                else round(pp.usd * pp.fx_rate, 0) end)
   where pp.fx is null and pp.usd is not null and pp.fx_rate is not null
     and exists (select 1 from public.purchases p where p.id = pp.purchase_id and p.currency = 'USD');
  perform set_config('doctorvet.usd_purchase_door', 'off', true);
end $$;

-- ── ٢) تسديدُ فاتورة: سعرُ اليوم لكلّ دفعة دولار، وفرقُها (نصُّ 0274 وفوقه أسطرٌ معلَّمة) ─────────────────────
create or replace function public.purchase_pay_fx(p_purchase uuid, p_handed numeric, p_pay_currency text, p_rate numeric,
                                                   p_method text default 'cash', p_note text default null, p_expect_due numeric default null)
returns purchases
language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := auth_role();
  v_pay     text := upper(coalesce(nullif(p_pay_currency, ''), 'IQD'));
  v_handed  numeric := round(coalesce(p_handed, 0), 2);
  v_rate    numeric := round(p_rate, 4);
  v_p       purchases;
  v_due     numeric;
  v_due_usd numeric;
  v_red     numeric;
  v_share   numeric;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if v_pay not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'التسديد دينار أو دولار.'; end if;
  if v_handed <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_method is not null and p_method not in ('cash', 'card', 'transfer') then raise exception 'bad_method'; end if;
  select * into v_p from purchases where id = p_purchase and clinic_id = v_clinic for update;
  if not found then raise exception 'purchase not found'; end if;
  if v_p.currency <> v_pay and (v_rate is null or v_rate < 100 or v_rate > 100000) then
    raise exception 'bad_rate' using hint = 'اكتب سعر الدولار (بين 100 و100000 دينار).';
  end if;
  -- دَينُ الدولار: كلُّ تسديدٍ بسعر يومه (ولو سُلّم دولاراً) — منه دينارُه وفرقُ صرفه. غائبٌ = سعرُ العيادة الأخير.   -- +0275
  if v_p.currency = 'USD' then   -- +0275
    v_rate := coalesce(v_rate, (select c.rate from _usd_ctx(v_clinic) c));   -- +0275
    if v_rate is null or v_rate < 100 or v_rate > 100000 then   -- +0275
      raise exception 'bad_rate' using hint = 'اكتب سعر الدولار يوم التسديد (بين 100 و100000 دينار).';   -- +0275
    end if;   -- +0275
  end if;   -- +0275

  if v_p.currency = 'IQD' then
    v_due := greatest(0, v_p.total - coalesce(v_p.amount_paid, v_p.total));
    if p_expect_due is not null and abs(p_expect_due - v_due) > 0.005 then
      raise exception 'due_changed' using hint = 'تغيّر الباقي على الفاتورة — راجعه وأعد.';
    end if;
    v_red := case when v_pay = 'IQD' then v_handed else round(v_handed * v_rate, 0) end;
    if v_red > v_due then
      if v_pay = 'USD' and v_red - v_due <= ceil(v_rate * 0.01) then v_red := v_due;
      else raise exception 'over_pay' using hint = format('المبلغُ أكبر من الباقي (%s د.ع).', to_char(v_due, 'FM999G999G999G990D99'));
      end if;
    end if;
    if v_red <= 0 then raise exception 'nothing to settle'; end if;
    insert into purchase_payments (clinic_id, purchase_id, company_id, amount, method, note, staff_id, pay_currency, handed, fx_rate)
    values (v_clinic, v_p.id, v_p.company_id, v_red, nullif(p_method, ''), nullif(btrim(p_note), ''), auth.uid(),
            v_pay, v_handed, case when v_pay = 'USD' then v_rate end);
    update purchases set
      amount_paid = coalesce(amount_paid, total) + v_red,
      status = case when coalesce(amount_paid, total) + v_red >= total then 'paid'
                    when coalesce(amount_paid, total) + v_red <= 0 then 'unpaid' else 'partial' end
     where id = v_p.id and clinic_id = v_clinic
    returning * into v_p;
  else
    v_due_usd := greatest(0, v_p.total_usd - v_p.paid_usd);
    v_due := greatest(0, v_p.total - v_p.amount_paid);
    if p_expect_due is not null and abs(p_expect_due - v_due_usd) > 0.005 then
      raise exception 'due_changed' using hint = 'تغيّر الباقي على الفاتورة — راجعه وأعد.';
    end if;
    v_red := case when v_pay = 'USD' then v_handed else round(v_handed / v_rate, 2) end;
    if v_red > v_due_usd then
      if v_red - v_due_usd <= 0.01 then v_red := v_due_usd;
      else raise exception 'over_pay' using hint = format('المبلغُ أكبر من الباقي ($%s).', to_char(v_due_usd, 'FM999G999G990D00'));
      end if;
    end if;
    if v_red <= 0 then raise exception 'nothing to settle'; end if;
    v_share := _usd_share(v_red, v_due_usd, v_due, v_p.total_usd, v_p.total);
    perform set_config('doctorvet.usd_purchase_door', 'on', true);
-- -0275     insert into purchase_payments (clinic_id, purchase_id, company_id, amount, usd, method, note, staff_id, pay_currency, handed, fx_rate)
    insert into purchase_payments (clinic_id, purchase_id, company_id, amount, usd, method, note, staff_id, pay_currency, handed, fx_rate, fx)   -- +0275
    values (v_clinic, v_p.id, v_p.company_id, v_share, v_red, nullif(p_method, ''), nullif(btrim(p_note), ''), auth.uid(),
-- -0275             v_pay, v_handed, case when v_pay = 'IQD' then v_rate end);
            v_pay, v_handed, v_rate,   -- +0275
            -- فرقُ الصرف: حصّتُه بدينار يوم الشراء ناقصَ ما كلّفنا بالدينار يومَ التسديد (المسلَّمُ دينارُه، أو الدولارُ بسعر يومه).   -- +0275
            v_share - (case when v_pay = 'IQD' then v_handed else round(v_red * v_rate, 0) end));   -- +0275
    update purchases set
      amount_paid = amount_paid + v_share,
      paid_usd = paid_usd + v_red,
      status = _usd_purchase_status(total_usd, paid_usd + v_red)
     where id = v_p.id and clinic_id = v_clinic
    returning * into v_p;
    perform set_config('doctorvet.usd_purchase_door', 'off', true);
  end if;
  return v_p;
end $$;
revoke all on function public.purchase_pay_fx(uuid, numeric, text, numeric, text, text, numeric) from public, anon;
grant execute on function public.purchase_pay_fx(uuid, numeric, text, numeric, text, text, numeric) to authenticated;

-- ── ٣) التسديدُ على الحساب: الشيءُ نفسُه لكلّ جزءٍ يذهب لفاتورة دولار ──────────────────────────────────
create or replace function public.company_pay_fx(p_company uuid, p_currency text, p_handed numeric, p_pay_currency text, p_rate numeric,
                                                  p_method text, p_date date, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic    uuid;
  v_cur       text := upper(coalesce(nullif(p_currency, ''), 'IQD'));
  v_pay       text := upper(coalesce(nullif(p_pay_currency, ''), 'IQD'));
  v_handed    numeric := round(coalesce(p_handed, 0), 2);
  v_rate      numeric := round(p_rate, 4);
  v_day       date := coalesce(p_date, (now() at time zone 'Asia/Baghdad')::date);
  v_at        timestamptz;
  v_pool      numeric;
  v_inv       numeric;
  v_red       numeric;
  v_res       jsonb;
  v_entry     company_entries;
  v_p         purchases;
  v_left      numeric;
  v_part      numeric;
  v_share     numeric;
  v_n         int := 0;
  v_pool_part numeric;
begin
  v_clinic := company_entry_guard(p_company, p_date, false);
  if v_cur not in ('IQD', 'USD') or v_pay not in ('IQD', 'USD') then
    raise exception 'bad_currency' using hint = 'العملة دينار أو دولار.';
  end if;
  if v_handed <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_method is not null and p_method not in ('cash', 'card', 'transfer') then raise exception 'bad_method'; end if;
  if v_cur <> v_pay and (v_rate is null or v_rate < 100 or v_rate > 100000) then
    raise exception 'bad_rate' using hint = 'اكتب سعر الدولار (بين 100 و100000 دينار).';
  end if;

  if v_cur = 'IQD' then
    v_red := case when v_pay = 'IQD' then v_handed else round(v_handed * v_rate, 0) end;
    if v_pay = 'USD' then
      v_pool := greatest(0, company_pool_due(p_company, v_clinic));
      select coalesce(sum(greatest(0, total - coalesce(amount_paid, total))), 0) into v_inv
        from purchases where company_id = p_company and clinic_id = v_clinic and currency = 'IQD';
      if v_red > v_pool + v_inv and v_red - (v_pool + v_inv) <= ceil(v_rate * 0.01) then v_red := v_pool + v_inv; end if;
    end if;
    v_res := company_pay(p_company, v_red, p_method, p_date, p_note);
    update company_entries set pay_currency = v_pay, handed = v_handed, fx_rate = case when v_pay = 'USD' then v_rate end
     where id = (v_res->'entry'->>'id')::uuid and clinic_id = v_clinic
    returning * into v_entry;
    return v_res || jsonb_build_object('entry', to_jsonb(v_entry));
  end if;

  -- دَينُ الدولار: التسديدُ بسعر يومه (ولو سُلّم دولاراً) — منه دينارُ كلّ جزءٍ وفرقُ صرفه. غائبٌ = سعرُ العيادة الأخير.   -- +0275
  v_rate := coalesce(v_rate, (select c.rate from _usd_ctx(v_clinic) c));   -- +0275
  if v_rate is null or v_rate < 100 or v_rate > 100000 then   -- +0275
    raise exception 'bad_rate' using hint = 'اكتب سعر الدولار يوم التسديد (بين 100 و100000 دينار).';   -- +0275
  end if;   -- +0275
  v_pool := greatest(0, company_pool_due_usd(p_company, v_clinic));
  select coalesce(sum(greatest(0, total_usd - paid_usd)), 0) into v_inv
    from purchases where company_id = p_company and clinic_id = v_clinic and currency = 'USD';
  v_red := case when v_pay = 'USD' then v_handed else round(v_handed / v_rate, 2) end;
  if v_red > v_pool + v_inv then
    if v_red - (v_pool + v_inv) <= 0.01 then v_red := v_pool + v_inv;
    else raise exception 'over_pay' using hint = format('المبلغُ أكبر من دين الشركة بالدولار ($%s).', to_char(v_pool + v_inv, 'FM999G999G990D00'));
    end if;
  end if;
  if v_red <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;

  insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, method, note, currency, pay_currency, handed, fx_rate)
  values (v_clinic, p_company, 'payment', 'debit', v_red, v_day, p_method, nullif(btrim(p_note), ''), 'USD',
-- -0275           v_pay, v_handed, case when v_pay = 'IQD' then v_rate end)
          v_pay, v_handed, v_rate)   -- +0275
  returning * into v_entry;

  v_at := case when v_day = (now() at time zone 'Asia/Baghdad')::date then now()
               else (v_day + time '12:00') at time zone 'Asia/Baghdad' end;
  v_pool_part := least(v_pool, v_red);
  v_left := v_red - v_pool_part;
  perform set_config('doctorvet.usd_purchase_door', 'on', true);
  for v_p in
    select * from purchases
     where company_id = p_company and clinic_id = v_clinic and currency = 'USD' and total_usd - paid_usd > 0
     order by purchased_at, created_at, id
     for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, v_p.total_usd - v_p.paid_usd);
    v_share := _usd_share(v_part, v_p.total_usd - v_p.paid_usd, v_p.total - v_p.amount_paid, v_p.total_usd, v_p.total);
-- -0275     insert into purchase_payments (clinic_id, purchase_id, company_id, amount, usd, method, note, paid_at, staff_id, entry_id)
    insert into purchase_payments (clinic_id, purchase_id, company_id, amount, usd, method, note, paid_at, staff_id, entry_id, fx_rate, fx)   -- +0275
-- -0275     values (v_clinic, v_p.id, p_company, v_share, v_part, p_method, nullif(btrim(p_note), ''), v_at, auth.uid(), v_entry.id);
    values (v_clinic, v_p.id, p_company, v_share, v_part, p_method, nullif(btrim(p_note), ''), v_at, auth.uid(), v_entry.id,   -- +0275
            v_rate, v_share - round(v_part * v_rate, 0));   -- +0275
    update purchases set
      amount_paid = amount_paid + v_share,
      paid_usd = paid_usd + v_part,
      status = _usd_purchase_status(total_usd, paid_usd + v_part)
     where id = v_p.id and clinic_id = v_clinic;
    v_left := v_left - v_part;
    v_n := v_n + 1;
  end loop;
  perform set_config('doctorvet.usd_purchase_door', 'off', true);

  return jsonb_build_object('entry', to_jsonb(v_entry), 'to_opening', v_pool_part,
                            'to_invoices', v_red - v_pool_part, 'invoices', v_n);
end $$;
revoke all on function public.company_pay_fx(uuid, text, numeric, text, numeric, text, date, text) from public, anon;
grant execute on function public.company_pay_fx(uuid, text, numeric, text, numeric, text, date, text) to authenticated;

-- ── ٤) الأرباحُ والخسائر: «فرق صرف المشتريات» بشهر التسديد (نصُّ 0271 وفوقه أسطرٌ معلَّمة) ───────────────
create or replace function public.report_pnl(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
-- +0264
declare
  v_clinic uuid := auth_clinic();
  v_ph     boolean := false;
  v_can    boolean := false;
  v_tz     text;
  v_out    jsonb;
begin
  if v_clinic is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- كلاهما من 0222 ويُسألان بـexecute (كـservice_recipe_set، 0252): تراجعُ 0222 يحذفهما، ونداءٌ ثابتٌ يرمي «لا توجد»
  -- بدل الجواب. وبلا staff_can لا قالبَ أذونات بالقاعدة — فالمديرُ وحده، كما كان قبل 0222.
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v_can using 'viewProfits';
  else
    v_can := coalesce(auth_role(), '') = 'manager';
  end if;
  if coalesce(v_ph, false) or not coalesce(v_can, false) then
    raise exception 'pnl_forbidden' using errcode = '42501',
      hint = 'تقرير الأرباح والخسائر لمن يشوف الأرباح — اطلبه من المدير';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'pnl_range' using hint = 'اختر مدّة صحيحة — البداية قبل النهاية';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'pnl_range_long' using hint = 'المدّة أطول من سنة وشهر — قسّمها لفترتين';
  end if;
  -- اسمُ التوقيت المعتمد كما يكتبه pg_timezone_names (بلا حساسية حروف)، وإلا بغداد — كـpnlTz بالمرآة.
  select z.name into v_tz from pg_timezone_names z where lower(z.name) = lower(btrim(coalesce(p_tz, ''))) limit 1;
  v_tz := coalesce(v_tz, 'Asia/Baghdad');

  with inv as (
    select i.id, coalesce(i.total, 0) as total, coalesce(i.profit, 0) as profit, coalesce(i.cost_total, 0) as cost_total,
           to_char(i.created_at at time zone v_tz, 'YYYY-MM') as m
      from invoices i
     where i.clinic_id = v_clinic and coalesce(i.status, 'paid') <> 'refunded'
       and i.created_at >= p_from and i.created_at <= p_to
       and i.sale_kind <> 'opening'   -- +0271
  ),
  inv_m as (
    select m, count(*)::int as n, sum(total) as revenue, sum(cost_total) as cogs, sum(profit) as gross
      from inv group by m
  ),
  prod_m as (
    select v.m, sum(round(coalesce(ii.qty, 0) * coalesce(ii.unit_cost, 0), 2)) as c
      from inv v
      join invoice_items ii on ii.invoice_id = v.id and ii.clinic_id = v_clinic
     where ii.product_id is not null
     group by v.m
  ),
  mat_m as (
    select v.m, sum(c.value) as c
      from inv v
      join invoice_consumption c on c.invoice_id = v.id and c.clinic_id = v_clinic
     group by v.m
  ),
  fx_m as (   -- +0264 فرقُ الصرف: سِيَقُ kind='fx' بشهر يومها (لا بشهر الفاتورة) — على فواتير الدولار وحدها
    select to_char(coalesce(safe_ts(l->>'at'), i.created_at) at time zone v_tz, 'YYYY-MM') as m,
           round(sum(safe_num(l->>'amount')), 2) as fx
      from invoices i
      cross join lateral jsonb_array_elements(case when jsonb_typeof(i.payment_details) = 'array'
                                                   then i.payment_details else '[]'::jsonb end) l
     where i.clinic_id = v_clinic and i.currency = 'USD' and coalesce(i.status, 'paid') <> 'refunded'
       and l->>'kind' = 'fx'
       and coalesce(safe_ts(l->>'at'), i.created_at) >= p_from and coalesce(safe_ts(l->>'at'), i.created_at) <= p_to
     group by 1
  ),
  pfx_m as (   -- فرقُ صرف المشتريات: دفعاتُ دين الدولار بشهر تسديدها (حصّتُها بدينار يوم الشراء ناقصَ ما كلّفت يومَ التسديد)   -- +0275
    select to_char(pp.paid_at at time zone v_tz, 'YYYY-MM') as m, round(sum(pp.fx), 2) as pfx   -- +0275
      from purchase_payments pp   -- +0275
     where pp.clinic_id = v_clinic and pp.fx is not null and pp.paid_at >= p_from and pp.paid_at <= p_to   -- +0275
     group by 1   -- +0275
  ),   -- +0275
  ex as (
    select to_char(e.spent_at at time zone v_tz, 'YYYY-MM') as m,
           case when e.category_id is not null then 'cat'
                when e.method = 'stock' then 'stock'
                when inv_norm_group(e.category) = inv_norm_group('مرتجع') then 'returns'
                when inv_norm_group(e.category) = inv_norm_group('payroll') then 'payroll'
                when inv_norm_group(e.category) = inv_norm_group('payroll_loan') then 'payroll_loan'
                when inv_norm_group(e.category) = inv_norm_group('سحب مخزن') then 'stock'
                else 'none' end as b,
           e.category_id as cid, e.amount
      from expenses e
     where e.clinic_id = v_clinic and e.spent_at >= p_from and e.spent_at <= p_to
  ),
  ex_m as (   -- كلُّ جدولٍ بشهره مقرَّبٌ لفلس
    select m, b, cid, round(sum(amount), 2) as a from ex group by m, b, cid
  ),
  months as (
-- -0275     select m from inv_m union select m from ex_m union select m from fx_m
    select m from inv_m union select m from ex_m union select m from fx_m union select m from pfx_m   -- +0275
  ),
  cat_ord as (   -- ترتيبُ groupWithdrawals: بإنشاء التصنيف ثمّ بمعرّفه، والمجهولُ بعدها
    select x.cid, c.name, c.created_at
      from (select distinct cid from ex_m where b = 'cat') x
      left join expense_categories c on c.id = x.cid and c.clinic_id = v_clinic
  ),
  rows as (
    select ms.m,
           coalesce(i.n, 0) as n, coalesce(i.revenue, 0) as revenue, coalesce(i.cogs, 0) as cogs,
           coalesce(i.gross, 0) as gross, coalesce(p.c, 0) as cp, coalesce(t.c, 0) as cm, coalesce(f.fx, 0) as fx,
           coalesce(pf.pfx, 0) as pfx,   -- +0275
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'stock'), 0)        as stock,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'returns'), 0)      as returns,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll'), 0)      as payroll,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll_loan'), 0) as loan,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'none'), 0)         as none,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m), 0)                          as ex_total
      from months ms
      left join inv_m  i on i.m = ms.m
      left join prod_m p on p.m = ms.m
      left join mat_m  t on t.m = ms.m
      left join fx_m   f on f.m = ms.m
      left join pfx_m pf on pf.m = ms.m   -- +0275
  )
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month', r.m, 'invoices', r.n, 'revenue', r.revenue, 'cogs', r.cogs,
               'cogs_products', r.cp, 'cogs_materials', r.cm, 'cogs_other', r.cogs - r.cp - r.cm,
               'gross', r.gross, 'adjust', r.gross - (r.revenue - r.cogs),
               'stock_loss', r.stock, 'returns', r.returns, 'payroll', r.payroll, 'payroll_loan', r.loan,
               'uncategorized', r.none,
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', x.a)
                                   order by o.created_at nulls last, o.cid)
                    from ex_m x join cat_ord o on o.cid = x.cid
                   where x.m = r.m and x.b = 'cat'), '[]'::jsonb),
-- -0275                'fx', r.fx, 'expenses', r.ex_total, 'net', r.gross + r.fx - r.ex_total)
               'fx', r.fx, 'fx_purchases', r.pfx, 'expenses', r.ex_total, 'net', r.gross + r.fx + r.pfx - r.ex_total)   -- +0275
             order by r.m)
        from rows r), '[]'::jsonb),
    'total', (
      select jsonb_build_object(
               'invoices', coalesce(sum(r.n), 0), 'revenue', coalesce(sum(r.revenue), 0), 'cogs', coalesce(sum(r.cogs), 0),
               'cogs_products', coalesce(sum(r.cp), 0), 'cogs_materials', coalesce(sum(r.cm), 0),
               'cogs_other', coalesce(sum(r.cogs - r.cp - r.cm), 0),
               'gross', coalesce(sum(r.gross), 0), 'adjust', coalesce(sum(r.gross - (r.revenue - r.cogs)), 0),
               'stock_loss', coalesce(sum(r.stock), 0), 'returns', coalesce(sum(r.returns), 0),
               'payroll', coalesce(sum(r.payroll), 0), 'payroll_loan', coalesce(sum(r.loan), 0),
               'uncategorized', coalesce(sum(r.none), 0),
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', s.a)
                                   order by o.created_at nulls last, o.cid)
                    from (select cid, sum(a) as a from ex_m where b = 'cat' group by cid) s
                    join cat_ord o on o.cid = s.cid), '[]'::jsonb),
-- -0275                'fx', coalesce(sum(r.fx), 0), 'expenses', coalesce(sum(r.ex_total), 0),
               'fx', coalesce(sum(r.fx), 0), 'fx_purchases', coalesce(sum(r.pfx), 0), 'expenses', coalesce(sum(r.ex_total), 0),   -- +0275
-- -0275                'net', coalesce(sum(r.gross + r.fx - r.ex_total), 0))
               'net', coalesce(sum(r.gross + r.fx + r.pfx - r.ex_total), 0))   -- +0275
        from rows r))
    into v_out;
  return v_out;
end $$;
revoke all on function public.report_pnl(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.report_pnl(timestamptz, timestamptz, text) to authenticated;

reset lock_timeout;
