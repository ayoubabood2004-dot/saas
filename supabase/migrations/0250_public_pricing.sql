-- ============================================================================
-- 0250 — أسعارُ الموقع: ما يُعرض للزائر هو ما يُقبض (٢٦/١٠)
--
-- الموقعُ الجديد (نسخةٌ لكلّ بلد) يعرض الأسعار بعملة البلد. ثلاثةُ أشياء كانت تمنع
-- أن يكون المعروضُ هو المقبوض:
--   ١) الزائرُ بلا جلسة لا يقرأ `app_config.usd_rate` (سياستُها للمشغّل)، فالصفحةُ
--      القديمة ضربت بـ1535 ثابتاً وقرّبت: ١٥٤٬٠٠٠ دينار معروضة و١٥٣٬٥٠٠ مقبوضة.
--   ٢) لا سعرَ محلّيّاً بعملة بلدٍ إلا بضرب سعر صرفٍ ثابتٍ بالشِفرة — فيه أخطاءٌ قاسها
--      بحثُ السوق (سوريا ×١٠٠ بعد حذف الصفرين، السودان، اليمن) وأرقامٌ غريبة (١١٣ ر.س).
--   ٣) ولا مكانَ يغيّر فيه المالكُ سعرَ بلدٍ بلا نشر.
--
-- • `plan_local_prices`: سعرٌ محلّيّ لكلّ (باقة، عملة) يحدّده المالك من لوحته. القراءةُ
--   للجميع (معلومةٌ عامّة كـplan_prices)، والكتابةُ من دالّة المشغّل وحدها.
-- • `public_pricing()`: كلُّ ما يحتاجه الموقع بنداءٍ واحد بالمفتاح العامّ — أسعارُ الدولار،
--   ودولارُ الدينار كما تقبض Wayl، والأسعارُ المحلّية.
-- • وصفُّ الدينار (IQD) إن وُجد تقبضه Wayl بعينه (wayl-create-link) — فيبقى المعروضُ =
--   المقبوضَ حين يختار المالكُ رقماً مستديراً بدل «دولار × سعر».
-- ============================================================================

create table if not exists plan_local_prices (
  plan       text not null check (plan in ('basic','advanced','super')),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  monthly    numeric not null check (monthly > 0),
  annual     numeric not null check (annual > 0),
  updated_at timestamptz not null default now(),
  primary key (plan, currency)
);

alter table plan_local_prices enable row level security;
drop policy if exists plan_local_prices_select on plan_local_prices;
create policy plan_local_prices_select on plan_local_prices for select using (true);
grant select on plan_local_prices to anon, authenticated;
-- المصوّرُ (0222) لا يحتاج أسعارَ المنصّة — سياجُه كبقية الجداول الجديدة.
select public.photographer_fence_table('plan_local_prices');

/* ── كتابةُ المشغّل: تثبيتُ سعرٍ محلّيّ أو مسحُه (null ⇒ يعود الموقعُ للمقترح) ── */
create or replace function admin_set_local_price(p_plan text, p_currency text, p_monthly numeric, p_annual numeric)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_plan not in ('basic','advanced','super') then raise exception 'bad_plan'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'bad_currency'; end if;
  if p_monthly is null and p_annual is null then
    delete from plan_local_prices where plan = p_plan and currency = p_currency;
    return;
  end if;
  -- سعرٌ صفريّ أو سالب = باقةٌ مجانيةٌ بالغلط — نرفضه بالباب (كما admin_set_plan_price).
  if p_monthly is null or p_monthly <= 0 or p_annual is null or p_annual <= 0 then raise exception 'bad_price'; end if;
  -- الدينارُ تقبضه Wayl عدداً صحيحاً لا يقلّ عن ألف (wayl-create-link: max(1000, round(x))): رقمٌ
  -- تحته أو بكسرٍ كان يُعرض كما هو ويُقبض غيرُه.
  if p_currency = 'IQD' and (p_monthly < 1000 or p_annual < 1000 or p_monthly <> round(p_monthly) or p_annual <> round(p_annual)) then
    raise exception 'bad_iqd_price' using hint = 'سعرُ الدينار عددٌ صحيحٌ لا يقلّ عن 1000.';
  end if;
  insert into plan_local_prices (plan, currency, monthly, annual)
       values (p_plan, p_currency, p_monthly, p_annual)
  on conflict (plan, currency) do update
     set monthly = excluded.monthly, annual = excluded.annual, updated_at = now();
end $$;
revoke all on function admin_set_local_price(text, text, numeric, numeric) from public, anon;
grant execute on function admin_set_local_price(text, text, numeric, numeric) to authenticated;

/* ── للزائر: نداءٌ واحد بلا جلسة ── */
create or replace function public_pricing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usd', coalesce((
      select jsonb_object_agg(plan, jsonb_build_object('monthly', monthly_usd, 'annual', annual_usd))
        from plan_prices where plan in ('basic','advanced','super')), '{}'::jsonb),
    -- نفسُ قراءة Wayl: القيمةُ نصّاً؛ وغيرُ الرقم يسقط للافتراضيّ.
    'usdRate', coalesce((
      select case when value ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then value::numeric end
        from app_config where key = 'usd_rate'), 1535),
    'local', coalesce((
      select jsonb_object_agg(currency, per) from (
        select currency, jsonb_object_agg(plan, jsonb_build_object('monthly', monthly, 'annual', annual)) per
          from plan_local_prices group by currency) x), '{}'::jsonb),
    'at', now()
  )
$$;
revoke all on function public_pricing() from public;
grant execute on function public_pricing() to anon, authenticated;
