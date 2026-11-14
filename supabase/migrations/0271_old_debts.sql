-- ============================================================================
-- ٠٢٧١ — الديونُ القديمة: دينٌ صار قبل النظام يُكتب بدقيقة، ولا يصير مبيعاتٍ ولا ربحاً بأيّ تقرير
--
-- طلبُ المالك (١٤/١١): «من داخل الديون أكدر أضيف ديون قديمة على ناس أني أطلبهم، وأكتب شنو أطلبهم وليش وشكد وشوكت،
-- وبالدولار لو بالعراقي». وقراراتُه: ليس مبيعاتٍ ولا ربحاً، وتسديدُه يدخل الدرجَ بيوم التسديد؛ الإضافةُ والحذفُ للمدير وحده
-- (بالقاعدة)، والتسديدُ لكلّ الكادر. الخطّة: docs/old-debts-plan.md (ولماذا فاتورةٌ لا جدول: docs/customer-file-plan.md §م٢).
--
-- ── الشكل: فاتورةٌ معلَّمة `sale_kind = 'opening'` ───────────────────────────────────────────────────────
-- بلا أسطر (سطرٌ بلا مادّة يظهر «الأكثر مبيعاً»)، total = المبلغ، cost_total = profit = item_count = 0، amount_paid = 0 لا null
-- (null يقصّ settle_invoice إلى null)، payment_details = []، و**payment_method = null أبداً** (فاتورةٌ بلا سِيَقٍ وطريقتُها نقد
-- يقرؤها تبويبُ المال مقبوضةً كلَّها — paymentsOf). created_at يومُ الدين (ظهراً ببغداد كي لا يقلبه يومُ غرينتش) وrecorded_at
-- لحظةُ الكتابة (0242)؛ واليومُ نفسُه created_at = الآن. و«شنو» و«ليش» عمودان. والدولار: currency/total_usd/fx_rate بسعر العيادة
-- اليوم (0264) عبر بابه — فيُسدَّد بـsettle_invoice_usd وفرقُ صرفه بالأرباح والخسائر كأيّ دينٍ بالدولار.
-- فالدينُ القديم يأخذ مجّاناً ما هو مفحوصٌ أصلاً: سجلُّ الديون، التسديدُ بيومه بالدرج والقبض (receipt_legs يقرأ `at`)،
-- التسديدُ بالدولار، الخصمُ (0241)، دفترُ الزبون وملفُّه (0270).
--
-- ── البابُ الواحد: old_debt_add (definer) للمدير ────────────────────────────────────────────────────────
-- الإدراجُ بـ`opening` يُرفض ما لم تفتحه الدالّة (`doctorvet.opening_door`، محلّيٌّ للمعاملة — كباب الدولار 0264): البيعةُ
-- (retail_checkout يكتب retail/wholesale وحدهما) والإدراجُ المباشر لا يصنعان ديناً قديماً. والمرجعُ (client_ref) يُرجع الصفَّ
-- نفسَه لضغطتين أو ردٍّ ضائع.
--
-- ── حرّاسُ الشكل (invoker، لكلّ كاتبٍ — دوالُّ المالك أيضاً) ───────────────────────────────────────────
-- refund_invoice بلا فحص دور، وreturn_invoice_items على فاتورةٍ بلا أسطر «إرجاعٌ كامل» يقلبها مرجَعة، وedit_invoice_lines يكتب
-- أسطرَ منتجٍ ويعيد حسابَ المجموع — فالحرّاسُ على الصفّ لا على الدوالّ:
--   • لا سطرَ يُضاف لدينٍ قديم (ولا يُنقل إليه).  • حالتُه لا تتبدّل (لا ترجيع).  • total + forgiven ثابت (الخصمُ وإلغاؤه وحدهما
--     يحرّكانه)، وsubtotal/discount و«شنو»/«ليش» والدولارُ ثابتة.  • الربحُ والكلفةُ وعددُ القطع صفرٌ دائماً — الخصمُ يُنقص الربحَ
--     وإلغاؤه يعيده (0241)، والدينُ القديم بلا ربحٍ يُنقص: المحفّزُ يثبّته صفراً.  • النوعُ لا يتبدّل (بيعٌ لا يصير ديناً قديماً
--     فيختفي من المبيعات، ولا العكس).  • الحذفُ (للمدير أصلاً: delete_invoice وسياسةُ الحذف) **بلا سِيَق** — حذفُ ما عليه تسديدٌ
--     يمحو قبضاً ظهر بأيّامٍ مضت؛ يُخصم الباقي بدله.
-- والخصمُ (forgive_invoice_debt) على دينٍ قديم بلا سقف الربح: ربحُه صفرٌ فالسقفُ كان يطلب صاحبَ العيادة و«بيعٌ بخسارة» عن
-- غير بيع — المديرُ يكفي (افتراضٌ معروضٌ على المالك).
--
-- ── ليس بيعاً: الاستثناءُ بالقارئات (آخرُ تعريفٍ لكلٍّ، بحارس الانجراف وأسطرٍ معلَّمة `-- +0271`) ─────────────────
-- report_staff (المبيعات حسب الموظف)، report_pnl (الإيرادُ والكلفة؛ وفرقُ صرف الدولار يبقى — كديون الدولار الحاليّة)، عدُّ
-- «فواتير» القبض بـreport_receipts_daily/total (المبالغُ تبقى: قبضٌ حقيقيّ، وصافيها صفرٌ بربحٍ صفر)، وإحصاءاتُ المنصّة
-- (platform_pulse مبيعُ اليوم والأسبوع، admin_clinic_volumes، admin_market_monthly). وadmin_list_subscriptions لا تُمسّ عمداً:
-- عددُ فواتيرها «استعمالٌ» بلا مال، وكتابةُ دينٍ قديم استعمالٌ حقيقيّ. ولا تُمسّ: report_invoices وopen_debts وcustomer_invoices
-- وcustomer_key_invoices — يجب أن تُرجع الدينَ القديم. وreport_top_products بلا أسطرٍ لا يراه.
-- وسجلُّ الحركات: audit_change يحمل علامتَه و«شنو» بسطر الإدراج، وaudit_kind يسمّيه «دين سابق» (debt_old) وحذفَه
-- (debt_old_delete) — مرآتُه activityKinds.ts.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع: أعد الدوالَّ المعلَّمة من مصادرها حرفاً (0149، 0264، 0242، 0261، 0241، 0151، 0123)؛
--   drop function old_debt_add(text, text, text, text, numeric, text, date, text)؛ drop trigger invoices_opening_guard on invoices؛
--   drop trigger invoice_items_opening_guard on invoice_items؛ وبعد حذف الديون القديمة: القيدُ والعمودان كما كانا.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public.cust_key(text,text,text)') is null
     or to_regprocedure('public._usd_ctx(uuid)') is null
     or to_regprocedure('public.forgive_invoice_debt(uuid,numeric,text,text,numeric,numeric,text,boolean)') is null then
    raise exception 'needs_0264' using hint = 'طبّق 0241 (الخصم) و0252 (حارس الانحراف) و0231 (مفتاح الزبون) و0264 (الدولار) قبل هالهجرة';
  end if;
end $$;

-- ── ٠) الحارس: الدوالُّ التي تُعاد هنا بجسمها الحاليّ (بصمةُ الشِفرة بلا تعليق ولا مسافة — 0252) ──────────────
select public._drift_assert('public.report_receipts_daily(timestamptz,timestamptz,text)', 'c604d10096df44c2059b6f6799aea58e', '-- +0271');
select public._drift_assert('public.report_receipts_total(timestamptz,timestamptz)', '30019fb3d905bdb7441362f71801efa3', '-- +0271');
select public._drift_assert('public.report_staff(timestamptz,timestamptz)', '26d44655ac5c07bd404fc20da223fe6e', '-- +0271');
select public._drift_assert('public.report_pnl(timestamptz,timestamptz,text)', 'd595b8b629b2a58a2f12fb1d48fac5c2', '-- +0271');
select public._drift_assert('public.audit_change()', 'ff58401e47aedad62be34dfc1583a495', '-- +0271');
select public._drift_assert('public.audit_kind(text,text,jsonb)', 'bae548bbd69efc3d4b88769902a25968', '-- +0271');
select public._drift_assert('public.forgive_invoice_debt(uuid,numeric,text,text,numeric,numeric,text,boolean)', 'e6477ca00ec9137229bba4d28f30b157', '-- +0271');
select public._drift_assert('public.platform_pulse()', '43a61d58d82528478c55d25bff5fa2e4', '-- +0271');
select public._drift_assert('public.admin_clinic_volumes(integer)', '5f3ef41a75cf84d829f284775350d049', '-- +0271');
select public._drift_assert('public.admin_market_monthly(integer)', '137c75d8aa599acf5a92e89cb557b2fc', '-- +0271');

-- ── ١) النوعُ والعمودان ────────────────────────────────────────────────────────────────────────────────
-- القيدُ يُعاد مرّةً وحدة (فحصُه يمرّ على الجدول كلِّه — لا مع كلّ إعادة).
do $$
begin
  if not exists (select 1 from pg_constraint c where c.conname = 'invoices_sale_kind_chk' and c.conrelid = 'public.invoices'::regclass
                    and pg_get_constraintdef(c.oid) like '%opening%') then
    alter table public.invoices drop constraint if exists invoices_sale_kind_chk;
    alter table public.invoices add constraint invoices_sale_kind_chk check (sale_kind in ('retail', 'wholesale', 'opening'));
  end if;
end $$;
alter table public.invoices add column if not exists opening_what text;
alter table public.invoices add column if not exists opening_why text;
alter table public.invoices drop constraint if exists invoices_opening_text;
alter table public.invoices add constraint invoices_opening_text check (
  case when sale_kind = 'opening'
       then nullif(btrim(coalesce(opening_what, '')), '') is not null
            and char_length(opening_what) <= 200 and char_length(coalesce(opening_why, '')) <= 500
       else opening_what is null and opening_why is null end);
comment on column public.invoices.opening_what is 'الدينُ القديم (0271): «شنو» — المادّةُ أو الخدمةُ التي عليها الدين. لغير opening فارغ.';
comment on column public.invoices.opening_why is 'الدينُ القديم (0271): «ليش» — سببُه أو ملاحظتُه. لغير opening فارغ.';

-- ── ٢) الحرّاس ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.invoices_opening_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.sale_kind = 'opening' then
      if coalesce(current_setting('doctorvet.opening_door', true), '') <> 'on' then
        raise exception 'opening_door' using errcode = 'P0001', hint = 'الدينُ القديم ينسجل من «دين قديم» بسجلّ الديون وحده (للمدير).';
      end if;
      new.cost_total := 0;
      new.profit := 0;
      new.item_count := 0;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.sale_kind = 'opening' and (coalesce(old.amount_paid, 0) > 0.005
       or (jsonb_typeof(old.payment_details) = 'array' and jsonb_array_length(old.payment_details) > 0)) then
      raise exception 'opening_delete_settled' using errcode = 'P0001',
        hint = 'على هذا الدين تسديد — حذفُه يمحو قبضاً انحسب بيومه. اخصم الباقي («خصم على الدين») بدل الحذف.';
    end if;
    return old;
  end if;
  if (new.sale_kind = 'opening') is distinct from (old.sale_kind = 'opening') then
    raise exception 'opening_kind_frozen' using errcode = 'P0001', hint = 'الدينُ القديم يبقى ديناً قديماً، والبيعُ يبقى بيعاً.';
  end if;
  if old.sale_kind <> 'opening' then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'opening_no_refund' using errcode = 'P0001',
      hint = 'الدينُ القديم ما يترجّع — ما بيه بضاعة. للغلط: احذفه (إذا ما عليه تسديد) أو اخصم الباقي.';
  end if;
  if round(coalesce(new.total, 0) + coalesce(new.forgiven, 0), 2) is distinct from round(coalesce(old.total, 0) + coalesce(old.forgiven, 0), 2)
     or (new.subtotal, new.discount, new.discount_type, new.opening_what, new.opening_why, new.currency, new.fx_rate, new.total_usd)
        is distinct from (old.subtotal, old.discount, old.discount_type, old.opening_what, old.opening_why, old.currency, old.fx_rate, old.total_usd) then
    raise exception 'opening_amount_frozen' using errcode = 'P0001',
      hint = 'مبلغُ الدين القديم وما هو ما يتعدّلان — احذفه وسجّله من جديد (إذا ما عليه تسديد)، أو اخصم الفرق.';
  end if;
  new.cost_total := 0;
  new.profit := 0;
  new.item_count := 0;
  return new;
end $$;
revoke all on function public.invoices_opening_guard() from public, anon, authenticated;
drop trigger if exists invoices_opening_guard on public.invoices;
create trigger invoices_opening_guard before insert or update or delete on public.invoices
  for each row execute function public.invoices_opening_guard();

create or replace function public.invoice_items_opening_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.invoice_id is not distinct from old.invoice_id then
    return new;
  end if;
  if exists (select 1 from invoices i where i.id = new.invoice_id and i.sale_kind = 'opening') then
    raise exception 'opening_no_lines' using errcode = 'P0001',
      hint = 'الدينُ القديم بلا موادّ — ما ينضاف له سطر، ولا يتعدّل بالبنود، ولا يترجّع.';
  end if;
  return new;
end $$;
revoke all on function public.invoice_items_opening_guard() from public, anon, authenticated;
drop trigger if exists invoice_items_opening_guard on public.invoice_items;
create trigger invoice_items_opening_guard before insert or update of invoice_id on public.invoice_items
  for each row execute function public.invoice_items_opening_guard();

-- ── ٣) الباب: old_debt_add ─────────────────────────────────────────────────────────────────────────────
-- p_date: يومُ الدين (اليومُ المحلّيّ). غائبٌ أو اليومُ (أو غداً بفرق توقيت عيادةٍ شرقَ بغداد) ⇒ الآن؛ وما قبله ظهراً ببغداد
-- وrecorded_at الآن. والمستقبلُ أبعد من يوم يُرفض، وما قبل ٢٠٠٠ غلطُ كتابة.
create or replace function public.old_debt_add(
  p_name text, p_phone text, p_what text, p_why text, p_amount numeric,
  p_currency text default 'IQD', p_date date default null, p_client_ref text default null)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_ref    text := nullif(btrim(coalesce(p_client_ref, '')), '');
  v_name   text := nullif(btrim(regexp_replace(coalesce(p_name, ''), E'[ \t\r\n]+', ' ', 'g')), '');
  v_phone  text := nullif(btrim(coalesce(p_phone, '')), '');
  v_what   text := nullif(btrim(regexp_replace(coalesce(p_what, ''), E'[ \t\r\n]+', ' ', 'g')), '');
  v_why    text := nullif(btrim(coalesce(p_why, '')), '');
  v_cur    text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'IQD'));
  v_today  date := (now() at time zone 'Asia/Baghdad')::date;
  v_dial   text;
  v_ctx    record;
  v_rate   numeric;
  v_usd    numeric;
  v_total  numeric;
  v_at     timestamptz;
  v_rec    timestamptz;
  v_inv    invoices;
begin
  if v_clinic is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce(auth_role(), '') <> 'manager' then
    raise exception 'old_debt_manager' using errcode = '42501', hint = 'إضافةُ دينٍ قديم للمدير — افتح وضعَ المدير برمزه.';
  end if;
  -- المشغّلُ داخل العيادة لا يكتب مالاً باسمها (0151: لا أثرَ له عندها) — كالخصم على الدين.
  if platform_acting_clinic() is not null then
    raise exception 'operator_not_allowed' using errcode = '42501',
      hint = 'مشغّلُ المنصّة لا يكتب ديوناً قديمة للعيادة — الدينُ سطرُ مالٍ يكتبه مديرُها.';
  end if;
  -- إعادةٌ آمنة: ضغطتان أو ردٌّ ضائع = دينٌ واحد — قبل أيّ فحص (يومٌ تبدّل بين المحاولتين لا يرفض ما ثبت).
  if v_ref is not null then
    select * into v_inv from invoices where clinic_id = v_clinic and client_ref = v_ref;
    if found then
      if v_inv.sale_kind is distinct from 'opening' then
        raise exception 'old_debt_ref' using hint = 'مرجعُ هالمحاولة لفاتورةٍ ثانية — أعد فتح النافذة.';
      end if;
      return v_inv;
    end if;
  end if;
  select cp.dial_code into v_dial from clinic_prefs cp where cp.clinic_id = v_clinic;
  if cust_key(v_phone, v_name, v_dial) is null then
    raise exception 'old_debt_customer' using hint = 'اكتب اسم الزبون أو رقمه — الدينُ على شخص.';
  end if;
  if v_what is null then
    raise exception 'old_debt_what' using hint = 'اكتب شنو عليه الدين (مادّة، خدمة، علاج…).';
  end if;
  if char_length(v_what) > 200 or char_length(coalesce(v_why, '')) > 500
     or char_length(coalesce(v_name, '')) > 80 or char_length(coalesce(v_phone, '')) > 40 then
    raise exception 'old_debt_long' using hint = '«شنو» لحدّ ٢٠٠ حرف، و«ليش» لحدّ ٥٠٠.';
  end if;
  if v_cur not in ('IQD', 'USD') then
    raise exception 'old_debt_currency' using hint = 'العملة: دينار أو دولار.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'old_debt_amount' using hint = 'اكتب مبلغ الدين — أكبر من صفر.';
  end if;
  if p_date is not null and (p_date > v_today + 1 or p_date < date '2000-01-01') then
    raise exception 'old_debt_date' using hint = 'تاريخ الدين لازم يكون اليوم أو قبله.';
  end if;
  if p_date is null or p_date >= v_today then
    v_at := now();
    v_rec := null;
  else
    v_at := (p_date::timestamp + time '12:00') at time zone 'Asia/Baghdad';
    v_rec := now();
  end if;

  if v_cur = 'USD' then
    select * into v_ctx from _usd_ctx(v_clinic);
    if not coalesce(v_ctx.enabled, false) then
      raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — من الإعدادات.';
    end if;
    if v_ctx.rate_id is null then
      raise exception 'usd_no_rate' using hint = 'حدّد سعرَ الدولار اليوم أوّلاً (الإعدادات › الدولار).';
    end if;
    v_rate := v_ctx.rate;
    v_usd := round(p_amount, 2);
    -- الدينارُ الكامل بسعر اليوم (كسطر usd_checkout): الخطوةُ للنقد الذي يُستلم عند التسديد، والفرقُ «فرق صرف».
    v_total := _usd_iqd(v_usd, v_rate, 1);
  else
    v_total := round(p_amount, 2);
  end if;
  if v_total <= 0 or v_total >= 10000000000 or coalesce(v_usd, 0) >= 1000000000000 then
    raise exception 'old_debt_amount' using hint = 'مبلغ الدين غلط — راجع الأصفار.';
  end if;

  perform set_config('doctorvet.opening_door', 'on', true);
  if v_cur = 'USD' then
    perform set_config('doctorvet.usd_door', 'on', true);
  end if;
  begin
    insert into invoices (clinic_id, subtotal, discount, discount_type, total, amount_paid, cost_total, profit, item_count,
                          customer_name, customer_phone, payment_method, payment_details, status, client_ref, sale_kind,
                          created_at, recorded_at, opening_what, opening_why, currency, fx_rate, total_usd, paid_usd)
    values (v_clinic, v_total, 0, null, v_total, 0, 0, 0, 0,
            v_name, v_phone, null, '[]'::jsonb, 'paid', v_ref, 'opening',
            v_at, v_rec, v_what, v_why, v_cur,
            v_rate, v_usd, case when v_cur = 'USD' then 0 end)
    returning * into v_inv;
  exception when unique_violation then
    -- نسخةٌ متزامنة بالمرجع نفسِه سبقتنا: تُرجع هي، ولا دينَ ثانٍ.
    if v_ref is null then raise; end if;
    select * into v_inv from invoices where clinic_id = v_clinic and client_ref = v_ref;
    if not found then raise; end if;
  end;
  perform set_config('doctorvet.opening_door', 'off', true);
  perform set_config('doctorvet.usd_door', 'off', true);
  return v_inv;
end $$;
revoke all on function public.old_debt_add(text, text, text, text, numeric, text, date, text) from public, anon;
grant execute on function public.old_debt_add(text, text, text, text, numeric, text, date, text) to authenticated;
comment on function public.old_debt_add(text, text, text, text, numeric, text, date, text) is
  'دينٌ قديم (0271): فاتورةُ opening بلا أسطر — للمدير، بمرجع إعادة. ليس مبيعاً بأيّ تقرير؛ تسديدُه بيومه.';

-- ── ٤) القارئات: الدينُ القديم ليس بيعاً ──────────────────────────────────────────────────────────────

-- المقبوضاتُ باليوم وبالمدّة: المبالغُ كما هي (تسديدُ الدين القديم قبضٌ حقيقيّ بيومه) — وعدُّ «الفواتير» يُقرأ «مبيعات»
-- بتقارير شاشة البيع، فالدينُ القديم خارج العدّ وحده.
create or replace function public.report_receipts_daily(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns table (day date, gross numeric, net numeric, invoices int)
language sql stable security invoker set search_path = public as $$
  -- +0264
  select (r.at at time zone p_tz)::date as day,
         round(sum(r.amount), 2) as gross,
         round(sum(case when r.total <> 0 then r.profit * r.amount / r.total else 0 end), 2) as net,
-- -0271          count(distinct r.invoice_id)::int as invoices
         count(distinct r.invoice_id) filter (where r.invoice_id not in (select o.id from invoices o where o.clinic_id = auth_clinic() and o.sale_kind = 'opening'))::int as invoices   -- +0271
    from receipt_legs() r
   where r.at >= p_from and r.at <= p_to
   group by 1
   order by 1
$$;
revoke all on function public.report_receipts_daily(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.report_receipts_daily(timestamptz, timestamptz, text) to authenticated;

create or replace function public.report_receipts_total(p_from timestamptz, p_to timestamptz)
returns table (gross numeric, net numeric, invoices int)
language sql stable security invoker set search_path = public as $$
  -- +0264
  select coalesce(round(sum(r.amount), 2), 0),
         coalesce(round(sum(case when r.total <> 0 then r.profit * r.amount / r.total else 0 end), 2), 0),
-- -0271          count(distinct r.invoice_id)::int
         count(distinct r.invoice_id) filter (where r.invoice_id not in (select o.id from invoices o where o.clinic_id = auth_clinic() and o.sale_kind = 'opening'))::int   -- +0271
    from receipt_legs() r
   where r.at >= p_from and r.at <= p_to
$$;
revoke all on function public.report_receipts_total(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_receipts_total(timestamptz, timestamptz) to authenticated;

-- المبيعاتُ حسب الموظف (عددٌ وإيرادٌ وربح بيوم الفاتورة).
create or replace function public.report_staff(p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, invoices int, revenue numeric, profit numeric)
language sql stable security invoker set search_path = public as $$
  select i.staff_id, count(*)::int, round(sum(i.total), 2), round(sum(coalesce(i.profit, 0)), 2)
    from invoices i
   where i.clinic_id = auth_clinic()
     and coalesce(i.status, 'paid') <> 'refunded'
     and i.created_at >= p_from and i.created_at <= p_to
     and i.sale_kind <> 'opening'   -- +0271
   group by 1
   order by 3 desc
$$;
revoke all on function public.report_staff(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_staff(timestamptz, timestamptz) to authenticated;

-- الأرباحُ والخسائر: الإيرادُ والكلفةُ وعددُ الفواتير بلا دينٍ قديم. وfx_m لا يُمسّ: فرقُ صرف تسديد دينٍ قديمٍ بالدولار
-- ربحٌ أو خسارةٌ حقيقيّان كفرق ديون الدولار الحاليّة (افتراضٌ معروضٌ على المالك).
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
    select m from inv_m union select m from ex_m union select m from fx_m
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
               'fx', r.fx, 'expenses', r.ex_total, 'net', r.gross + r.fx - r.ex_total)
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
               'fx', coalesce(sum(r.fx), 0), 'expenses', coalesce(sum(r.ex_total), 0),
               'net', coalesce(sum(r.gross + r.fx - r.ex_total), 0))
        from rows r))
    into v_out;
  return v_out;
end $$;
revoke all on function public.report_pnl(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.report_pnl(timestamptz, timestamptz, text) to authenticated;

-- ── ٥) سجلُّ الحركات: «دين سابق» باسمه ───────────────────────────────────────────────────────────────
-- المحفّزُ يحفظ لإدراجٍ قائمةَ keep وحدها (لا sale_kind فيها) — فسطرُ الإدراج يحمل علامتَه وما هو بفرعٍ كفرع 0242.
create or replace function public.audit_change() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_raw jsonb; v_old_raw jsonb; v_new jsonb; v_old jsonb; v_src jsonb; v_out jsonb; v_chg jsonb;
  keep constant text[] := array[
    'name','pet_name','pet_id','kind','outcome','status','medication','amount',
    'administered_at','vaccine','doctor_name','doctor','weight_kg','total',
    'customer_name','stock','qty','line_total','title','text','owner_name',
    'reminder_type','label','staff_id',
    -- 0152: ما يسمّي أحداثَ الجداول الجديدة — قليلٌ عمداً: سطرُ التعديل يبقى
    -- أصغرَ من اللقطة بأربع مرّات (فحصُ 0139)، والفرقُ `__changed` يحمل الباقي.
    'test','test_name','reason','category','company_name','courier_name',
    'event','ref','format','role','species',
    -- 0242: ختمُ إدخال الفاتورة المؤرَّخة (لا يوجد بغير الفواتير، وفارغُه يُسقَط).
    'recorded_at'
  ];
begin
  begin
    v_new_raw := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
    v_old_raw := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
    if v_new_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_new from jsonb_each(v_new_raw) as e(key, value);
    end if;
    if v_old_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_old from jsonb_each(v_old_raw) as e(key, value);
    end if;
    v_src := coalesce(v_new, v_old);
    if TG_OP = 'DELETE' then
      v_out := v_old;
    else
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_out
        from jsonb_each(v_src) as e(key, value)
       where e.key = any (keep) and e.value <> 'null'::jsonb;
    end if;
    -- 0242: بيعةٌ بيومٍ سابق تحمل يومَها — لحظةُ السطر لحظةُ الإدخال لا البيع.
    if TG_OP = 'INSERT' and TG_TABLE_NAME = 'invoices' and nullif(v_src->>'recorded_at', '') is not null then
      v_out := v_out || jsonb_build_object('sold_at', v_src->'created_at');
    end if;
    -- الدينُ القديم (0271) يحمل علامتَه وما هو: بلاها يُسمّى «بيع» أو «بيع بيوم سابق» بسجلّ الحركات.   -- +0271
    if TG_OP = 'INSERT' and TG_TABLE_NAME = 'invoices' and v_src->>'sale_kind' = 'opening' then   -- +0271
      v_out := v_out || jsonb_build_object('sale_kind', 'opening', 'opening_what', v_src->'opening_what');   -- +0271
    end if;   -- +0271
    if TG_OP = 'UPDATE' then
      select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k)) into v_chg
        from jsonb_object_keys(v_new_raw) as k
       where (v_new_raw -> k) is distinct from (v_old_raw -> k);
      if v_chg is not null then v_out := v_out || jsonb_build_object('__changed', v_chg); end if;
      -- 0226: رفعُ الأسعار يكتب سطرَه الواحد بـprice_changes — لا ألفَ «تعديل منتج».
      if v_chg is not null and TG_TABLE_NAME in ('products', 'clinic_services')
         and not exists (select 1 from jsonb_object_keys(v_chg) k where k not in ('sell_price', 'sub_unit_price', 'price'))
         and public._price_change_live() then
        return NEW;
      end if;
    end if;
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (coalesce(nullif(v_src->>'clinic_id','')::uuid, auth_clinic()), auth.uid(), TG_OP, TG_TABLE_NAME, (v_src->>'id'), v_out);
  exception when others then
    null; -- التدقيق لا يجوز أن يمنع العملية الأصلية أبداً
  end;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $function$;
revoke all on function public.audit_change() from public, anon, authenticated;

create or replace function public.audit_kind(p_entity text, p_action text, p_details jsonb) returns text
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
      -- 0242: بيعةٌ بيومٍ سابق تُسمّى باسمها — لحظةُ الإدخال بسطر التدقيق، ويومُ البيع بالفاتورة.
      when p_action = 'INSERT' and p_details->>'sale_kind' = 'opening' then 'debt_old'   -- +0271
      when p_action = 'DELETE' and p_details->>'sale_kind' = 'opening' then 'debt_old_delete'   -- +0271
      when p_action = 'INSERT' and nullif(p_details->>'recorded_at', '') is not null then 'sale_backdated'
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_entity = 'invoice_forgiveness' then case
      when p_action = 'UPDATE' then 'debt_forgive_void'
      -- الاستهلاكُ أثرُ مرتجعٍ أو تعديلٍ (وقد يكتبه الاستقبال) — ليس خصماً أعطاه أحد.
      when coalesce(p_details->>'kind', '') = 'consumed' then 'sale_edit'
      else 'debt_forgive' end
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
    when p_entity = 'pet_prescriptions' then 'medical'   -- +0261
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles','store_categories','store_category_items') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;
revoke all on function public.audit_kind(text, text, jsonb) from public, anon;
grant execute on function public.audit_kind(text, text, jsonb) to authenticated, service_role;

-- ── ٦) الخصمُ على دينٍ قديم: بلا سقف الربح ───────────────────────────────────────────────────────────
-- سقفُ 0241 نسبةٌ من ربح البيعة، وربحُ الدين القديم صفر — فكان كلُّ خصمٍ «فوق المسموح» يطلب صاحبَ العيادة وإقراراً بـ«بيعٍ
-- بخسارة» عن غير بيع. المديرُ يكفي، والملاحظةُ والسببُ كما هما.
create or replace function public.forgive_invoice_debt(
  p_invoice      uuid,
  p_amount       numeric,
  p_reason       text,
  p_note         text    default null,
  p_expect_due   numeric default null,
  p_pay          numeric default 0,
  p_method       text    default 'cash',
  p_confirm_loss boolean default false)
returns invoices
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := coalesce(auth_role(), '');
  v_base    text := coalesce(auth_role_base(), '');
  v_pin     boolean := pin_elevation_live();
  v_inv     invoices;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note    text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_pay     numeric := round(coalesce(p_pay, 0), 2);
  v_method  text := coalesce(nullif(p_method, ''), 'cash');
  v_due     numeric;
  v_details jsonb;
  v_total_b numeric;
  v_paid_b  numeric;
  v_pct     int;
  v_dial    text;
  v_basepr  numeric;
  v_allowed numeric;
  v_loss    numeric;
  v_above   boolean := false;
begin
  if v_clinic is null or auth.uid() is null then
    raise exception 'not_allowed' using hint = 'سجّل الدخول أوّلاً.';
  end if;
  if platform_acting_clinic() is not null then
    raise exception 'operator_not_allowed'
      using hint = 'مشغّلُ المنصّة لا يخصم من ديون العيادة — الخصمُ سطرُ مالٍ يسمّي شخصاً من كادرها.';
  end if;
  if v_role <> 'manager' then
    raise exception 'not_allowed' using hint = 'الخصمُ على الدين للمدير — أو افتح وضعَ المدير برمزه.';
  end if;

  -- قفلُ الصفّ: تسديدٌ أو خصمٌ أو تعديلٌ من جهازٍ آخر ينتظر حتى ننتهي.
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then
    raise exception 'invoice_not_found' using hint = 'الفاتورةُ غيرُ موجودة بعيادتك.';
  end if;
  if v_inv.status = 'refunded' then
    raise exception 'invoice_refunded' using hint = 'الفاتورةُ مُرجَعة — لا دينَ عليها يُخصم.';
  end if;
  if coalesce(nullif(btrim(v_inv.customer_name), ''), nullif(btrim(v_inv.customer_phone), '')) is null then
    raise exception 'customer_required'
      using hint = 'الخصمُ على دين زبونٍ معروف — اكتب اسمَه أو رقمَه بالفاتورة أوّلاً.';
  end if;
  -- قاعدةُ دفتر الديون حرفاً (DebtsPanel): يجهَّز/بالطريق، أو وصل ولم يُحصَّل ⇒ المَدينُ ليس الزبون.
  if exists (select 1 from delivery_orders d
              where d.invoice_id = v_inv.id and d.clinic_id = v_clinic
                and (d.status in ('preparing', 'out')
                     or (d.status = 'delivered' and d.collected_at is null))) then
    raise exception 'invoice_has_open_delivery'
      using hint = 'لهذه الفاتورة طلبُ توصيلٍ مفتوح — المبلغُ بذمّة السائق أو الشركة لا الزبون. حصّله من «التوصيل» أوّلاً.';
  end if;

  v_due := greatest(round(coalesce(v_inv.total, 0) - coalesce(v_inv.amount_paid, v_inv.total, 0), 2), 0);
  if p_expect_due is not null and abs(round(p_expect_due, 2) - v_due) > 0.005 then
    raise exception 'due_changed'
      using hint = format('تغيّر المتبقّي على هذه الفاتورة (صار %s) — جهازٌ آخر سدّد أو عدّل. افتحها من جديد.',
                          rtrim(to_char(v_due, 'FM999,999,999,990.99'), '.'));
  end if;

  if v_reason is null or v_reason not in ('negotiation', 'loyal', 'hardship', 'dispute', 'other') then
    raise exception 'reason_required'
      using hint = 'اختر سببَ الخصم: اتفاق تسوية، زبون دائم، ظرف الزبون، خلاف على المبلغ، أو غير ذلك.';
  end if;
  if v_reason = 'other' and v_note is null then
    raise exception 'note_required' using hint = '«غير ذلك» يحتاج ملاحظةً تشرح السبب.';
  end if;
  if v_amt <= 0 or v_pay < 0 then
    raise exception 'amount_invalid' using hint = 'مبلغُ الخصم لازم يكون أكبر من صفر.';
  end if;

  -- «تسوية»: الدفعةُ أوّلاً، بشكل ساق 0061 حرفاً، ومقصوصةً على المتبقّي.
  v_pay := least(v_pay, v_due);
  if v_pay > 0 then
    v_details := case when jsonb_typeof(v_inv.payment_details) = 'array' then v_inv.payment_details else '[]'::jsonb end;
    -- بيعةٌ بلا سِيَق: المدفوعُ ضمنيٌّ تشتقّه التقارير — نثبّته صراحةً بتاريخ الفاتورة قبل أن
    -- تُسقطه الساقُ الجديدة (درسُ 0113). وما فيه سِيَقٌ لا يُمسّ.
    if jsonb_array_length(v_details) = 0 and coalesce(v_inv.amount_paid, 0) > 0.005 then
      v_details := v_details || jsonb_build_object(
        'method', coalesce(v_inv.payment_method, v_method),
        'amount', v_inv.amount_paid,
        'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    v_details := v_details || jsonb_build_object(
      'method', v_method,
      'amount', v_pay,
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    update invoices
       set amount_paid     = coalesce(v_inv.amount_paid, 0) + v_pay,
           payment_details = v_details,
           payment_method  = (select e->>'method' from jsonb_array_elements(v_details) e
                              order by (e->>'amount')::numeric desc limit 1)
     where id = v_inv.id and clinic_id = v_clinic
     returning * into v_inv;
    v_due := greatest(round(coalesce(v_inv.total, 0) - coalesce(v_inv.amount_paid, 0), 2), 0);
  end if;

  if v_amt > v_due + 0.005 then
    raise exception 'above_due'
      using hint = format('الخصمُ أكبر من المتبقّي على الفاتورة (%s).', rtrim(to_char(v_due, 'FM999,999,999,990.99'), '.'));
  end if;
  v_amt := least(v_amt, v_due);

  -- السقف: النسبةُ من ربح البيعة قبل أيّ خصمٍ على الدين، ناقصَ ما خُصم قبل.
  select cp.forgive_profit_pct, cp.dial_code into v_pct, v_dial from clinic_prefs cp where cp.clinic_id = v_clinic;
  v_pct     := coalesce(v_pct, 100);
  v_basepr  := coalesce(v_inv.profit, 0) + coalesce(v_inv.forgiven, 0);
  v_allowed := greatest(0, least(v_due, round(v_pct * v_basepr / 100.0, 2) - coalesce(v_inv.forgiven, 0)));
  if v_inv.sale_kind = 'opening' then v_allowed := v_due; end if;   -- +0271
  if v_amt > v_allowed + 0.005 then
    v_loss := greatest(0, round(v_amt - coalesce(v_inv.profit, 0), 2));
    if v_pin or v_base <> 'manager' then
      raise exception 'above_profit_needs_owner'
        using hint = case when v_pin
          then format('الخصمُ أكبر من المسموح من ربح الفاتورة (%s) — يحتاج صاحبَ العيادة من حسابه هو بلا مفتاح المدير؛ ومفتاحُ المدير مفتوحٌ على حسابك الآن (على جهازٍ ما). أقفله أو انتظر انتهاءه ثم أعد المحاولة.',
                      rtrim(to_char(v_allowed, 'FM999,999,999,990.99'), '.'))
          else format('الخصمُ أكبر من المسموح من ربح الفاتورة (%s) — يحتاج صاحبَ العيادة من حسابه.',
                      rtrim(to_char(v_allowed, 'FM999,999,999,990.99'), '.')) end;
    end if;
    if v_note is null or char_length(v_note) < 8 then
      raise exception 'note_required'
        using hint = 'الخصمُ فوق المسموح من الربح يحتاج ملاحظةً مكتوبة تشرح السبب (٨ أحرف فأكثر).';
    end if;
    if not coalesce(p_confirm_loss, false) then
      raise exception 'confirm_loss_required'
        using hint = case when v_loss > 0
          then format('هذا الخصمُ بيعٌ بخسارة %s — أكّد أنّك تفهم هذا قبل الحفظ.', rtrim(to_char(v_loss, 'FM999,999,999,990.99'), '.'))
          else format('هذا الخصمُ فوق المسموح من الربح (%s) — أكّد قبل الحفظ.', rtrim(to_char(v_allowed, 'FM999,999,999,990.99'), '.')) end;
    end if;
    v_above := true;
  end if;

  v_total_b := v_inv.total;
  v_paid_b  := coalesce(v_inv.amount_paid, v_inv.total);

  update invoices
     set forgiven = round(coalesce(forgiven, 0) + v_amt, 2),
         total    = round(total - v_amt, 2),
         profit   = round(coalesce(profit, 0) - v_amt, 2)
   where id = v_inv.id and clinic_id = v_clinic
   returning * into v_inv;

  insert into invoice_forgiveness (
    clinic_id, invoice_id, kind, amount, reason_code, note, pay_amount, pay_method,
    total_before, paid_before, due_before, profit_base, cost_total, pct, above_cap, via_pin, cust_key)
  values (
    v_clinic, v_inv.id, 'forgive', v_amt, v_reason, v_note, v_pay, case when v_pay > 0 then v_method end,
    v_total_b, v_paid_b, v_due, v_basepr, v_inv.cost_total, v_pct, v_above, v_pin,
    cust_key(v_inv.customer_phone, v_inv.customer_name, v_dial));  -- نفسُ نداء 0232 حرفاً: المفتاحان يتّفقان

  return v_inv;
end $$;
revoke all on function public.forgive_invoice_debt(uuid, numeric, text, text, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.forgive_invoice_debt(uuid, numeric, text, text, numeric, numeric, text, boolean) to authenticated;

-- ── ٧) المنصّة: مبيعُ اليوم والأسبوع، وحجمُ العيادات، والسوقُ شهراً بشهر — بلا دينٍ قديم ────────────────────────
-- (ديونُ النبض المفتوحة تبقى — الدينُ القديم دَين.) وحجمُ العيادة: يومُ النشاط وأوّلُ ظهورٍ بلا يومٍ مؤرَّخٍ قبل النظام.
create or replace function public.platform_pulse()
returns table (
  clinic_id uuid, clinic_name text, email text,
  plan text, period_end timestamptz, trial_end timestamptz,
  members int, online_now int,
  invoices_today int, sales_today numeric, invoices_7d int, sales_7d numeric,
  open_debt_count int, open_debt_total numeric,
  products int, zero_stock int, pending_deliveries int,
  audit_24h int, last_login timestamptz, last_invoice timestamptz, last_activity timestamptz
)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  return query
  with ids as (
    select m.clinic_id from memberships m
    union select cp.clinic_id from clinic_prefs cp
    union select s.clinic_id from subscriptions s
    -- عيادةٌ باعت ولم تُسجَّل بغيرها (حساباتٌ قديمة) — لا تسقط من النبض.
    union select distinct i.clinic_id from invoices i where i.clinic_id is not null
  ),
  mc as (select m.clinic_id, count(*) filter (where m.status = 'active')::int as members from memberships m group by m.clinic_id),
  pr as (select p.clinic_id, count(*)::int as online_now from staff_presence p where p.last_seen > now() - interval '3 minutes' group by p.clinic_id),
  ic as (
    select i.clinic_id,
-- -0271            count(*) filter (where (i.created_at at time zone 'Asia/Baghdad')::date = v_today and coalesce(i.status,'paid') <> 'refunded')::int as invoices_today,
           count(*) filter (where (i.created_at at time zone 'Asia/Baghdad')::date = v_today and coalesce(i.status,'paid') <> 'refunded' and i.sale_kind <> 'opening')::int as invoices_today,   -- +0271
-- -0271            coalesce(sum(i.total) filter (where (i.created_at at time zone 'Asia/Baghdad')::date = v_today and coalesce(i.status,'paid') <> 'refunded'), 0) as sales_today,
           coalesce(sum(i.total) filter (where (i.created_at at time zone 'Asia/Baghdad')::date = v_today and coalesce(i.status,'paid') <> 'refunded' and i.sale_kind <> 'opening'), 0) as sales_today,   -- +0271
-- -0271            count(*) filter (where i.created_at > now() - interval '7 days' and coalesce(i.status,'paid') <> 'refunded')::int as invoices_7d,
           count(*) filter (where i.created_at > now() - interval '7 days' and coalesce(i.status,'paid') <> 'refunded' and i.sale_kind <> 'opening')::int as invoices_7d,   -- +0271
-- -0271            coalesce(sum(i.total) filter (where i.created_at > now() - interval '7 days' and coalesce(i.status,'paid') <> 'refunded'), 0) as sales_7d,
           coalesce(sum(i.total) filter (where i.created_at > now() - interval '7 days' and coalesce(i.status,'paid') <> 'refunded' and i.sale_kind <> 'opening'), 0) as sales_7d,   -- +0271
           count(*) filter (where coalesce(i.status,'paid') <> 'refunded' and coalesce(i.amount_paid, i.total) < i.total - 0.01)::int as open_debt_count,
           coalesce(sum(i.total - coalesce(i.amount_paid, i.total)) filter (where coalesce(i.status,'paid') <> 'refunded' and coalesce(i.amount_paid, i.total) < i.total - 0.01), 0) as open_debt_total,
           max(i.created_at) as last_invoice
    from invoices i group by i.clinic_id
  ),
  pc as (select p.clinic_id, count(*)::int as products, count(*) filter (where coalesce(p.stock, 0) <= 0)::int as zero_stock
         from products p group by p.clinic_id),
  dc as (select d.clinic_id, count(*)::int as pending from delivery_orders d where d.status in ('preparing','out') group by d.clinic_id),
  ac as (select a.clinic_id, count(*)::int as audit_24h from audit_log a where a.created_at > now() - interval '24 hours' group by a.clinic_id),
  lc as (select l.clinic_id, max(l.created_at) as last_login from login_events l group by l.clinic_id)
  select ids.clinic_id, cp.clinic_name, u.email::text,
         s.plan, s.current_period_end, s.trial_ends_at,
         coalesce(mc.members, 0), coalesce(pr.online_now, 0),
         coalesce(ic.invoices_today, 0), coalesce(ic.sales_today, 0), coalesce(ic.invoices_7d, 0), coalesce(ic.sales_7d, 0),
         coalesce(ic.open_debt_count, 0), coalesce(ic.open_debt_total, 0),
         coalesce(pc.products, 0), coalesce(pc.zero_stock, 0), coalesce(dc.pending, 0),
         coalesce(ac.audit_24h, 0), lc.last_login, ic.last_invoice,
         greatest(lc.last_login, ic.last_invoice)
  from ids
  left join clinic_prefs  cp on cp.clinic_id = ids.clinic_id
  left join auth.users    u  on u.id = ids.clinic_id
  left join subscriptions s  on s.clinic_id = ids.clinic_id
  left join mc on mc.clinic_id = ids.clinic_id
  left join pr on pr.clinic_id = ids.clinic_id
  left join ic on ic.clinic_id = ids.clinic_id
  left join pc on pc.clinic_id = ids.clinic_id
  left join dc on dc.clinic_id = ids.clinic_id
  left join ac on ac.clinic_id = ids.clinic_id
  left join lc on lc.clinic_id = ids.clinic_id
  order by greatest(lc.last_login, ic.last_invoice) desc nulls last, cp.clinic_name nulls last;
end $$;
revoke all on function public.platform_pulse() from public, anon;
grant execute on function public.platform_pulse() to authenticated;

create or replace function public.admin_clinic_volumes(p_days int default 30)
returns table (
  clinic_id uuid,
  clinic_name text,
  email text,
  plan text,
  pets int,
  cases int,
  invoices int,
  wa int,
  revenue numeric,
  active_days int,
  first_seen timestamptz
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  -- الحارس أولاً: لا يُقرأ صفٌّ واحد قبل التحقق من أنه مدير المنصّة.
  if not is_platform_admin() then raise exception 'not_admin'; end if;

  return query
  with win as (select now() - make_interval(days => greatest(1, coalesce(p_days, 30))) as t0),
  ids as (
    select cp.clinic_id from clinic_prefs cp
    union select s.clinic_id from subscriptions s
    union select m.clinic_id from memberships m
  )
  select ids.clinic_id,
         cp.clinic_name,
         u.email::text,
         s.plan,
         (select count(*)::int from pets p
           where p.clinic_id = ids.clinic_id and p.created_at >= (select t0 from win)),
         (select count(*)::int from clinic_visits v
           where v.clinic_id = ids.clinic_id and v.opened_at >= (select t0 from win)),
         (select count(*)::int from invoices i
-- -0271            where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)),
           where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win) and i.sale_kind <> 'opening'),   -- +0271
         (select count(*)::int from wa_messages w
           where w.clinic_id = ids.clinic_id and w.sent_at >= (select t0 from win)),
         (select coalesce(sum(i.total), 0) from invoices i
-- -0271            where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)),
           where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win) and i.sale_kind <> 'opening'),   -- +0271
         (select count(distinct d)::int from (
            select date_trunc('day', p.created_at) d from pets p
              where p.clinic_id = ids.clinic_id and p.created_at >= (select t0 from win)
            union
            select date_trunc('day', v.opened_at) from clinic_visits v
              where v.clinic_id = ids.clinic_id and v.opened_at >= (select t0 from win)
            union
            select date_trunc('day', i.created_at) from invoices i
-- -0271               where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)
              where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win) and i.sale_kind <> 'opening'   -- +0271
          ) days),
         (select min(x) from (
            select min(p.created_at) x from pets p where p.clinic_id = ids.clinic_id
            union all
            select min(v.opened_at) from clinic_visits v where v.clinic_id = ids.clinic_id
            union all
-- -0271             select min(i.created_at) from invoices i where i.clinic_id = ids.clinic_id
            select min(i.created_at) from invoices i where i.clinic_id = ids.clinic_id and i.sale_kind <> 'opening'   -- +0271
          ) f)
  from ids
  left join clinic_prefs  cp on cp.clinic_id = ids.clinic_id
  left join auth.users    u  on u.id         = ids.clinic_id
  left join subscriptions s  on s.clinic_id  = ids.clinic_id;
end $$;
revoke all on function public.admin_clinic_volumes(int) from public, anon;
grant execute on function public.admin_clinic_volumes(int) to authenticated;

create or replace function public.admin_market_monthly(p_months int default 6)
returns table (
  month date,
  clinics_active int,
  pets int,
  cases int,
  invoices int,
  wa int,
  revenue numeric
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;

  return query
  with months as (
    select date_trunc('month', now())::date - make_interval(months => g)::interval as m
    from generate_series(0, greatest(1, least(coalesce(p_months, 6), 36)) - 1) g
  ),
  b as (select m::date as m0, (m + interval '1 month')::date as m1 from months)
  select b.m0,
         (select count(distinct c)::int from (
            select p.clinic_id c from pets p where p.created_at >= b.m0 and p.created_at < b.m1
            union select v.clinic_id from clinic_visits v where v.opened_at >= b.m0 and v.opened_at < b.m1
-- -0271             union select i.clinic_id from invoices i where i.created_at >= b.m0 and i.created_at < b.m1
            union select i.clinic_id from invoices i where i.created_at >= b.m0 and i.created_at < b.m1 and i.sale_kind <> 'opening'   -- +0271
          ) act),
         (select count(*)::int from pets p where p.created_at >= b.m0 and p.created_at < b.m1),
         (select count(*)::int from clinic_visits v where v.opened_at >= b.m0 and v.opened_at < b.m1),
-- -0271          (select count(*)::int from invoices i where i.created_at >= b.m0 and i.created_at < b.m1),
         (select count(*)::int from invoices i where i.created_at >= b.m0 and i.created_at < b.m1 and i.sale_kind <> 'opening'),   -- +0271
         (select count(*)::int from wa_messages w where w.sent_at >= b.m0 and w.sent_at < b.m1),
-- -0271          (select coalesce(sum(i.total), 0) from invoices i where i.created_at >= b.m0 and i.created_at < b.m1)
         (select coalesce(sum(i.total), 0) from invoices i where i.created_at >= b.m0 and i.created_at < b.m1 and i.sale_kind <> 'opening')   -- +0271
  from b
  order by b.m0;
end $$;
revoke all on function public.admin_market_monthly(int) from public, anon;
grant execute on function public.admin_market_monthly(int) to authenticated;

reset lock_timeout;
