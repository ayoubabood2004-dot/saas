-- ============================================================================
-- 0104 — تسعير حيّ + اشتراك بالأيام + حصص (حيوانات ورسائل واتساب)
--
-- ثلاثة أشياء كانت مقفولة على المشغّل:
--   ١) الأسعار مكتوبة داخل الكود، فتغييرها يحتاج نشر نسخة جديدة
--   ٢) التفعيل بالأشهر فقط — ما تكدر تعطي ١٠ أيام ولا ٤٥
--   ٣) ما أكو أي سقف: عيادة تضيف ألف حيوان وترسل ألف رسالة بنفس السعر
--
-- ── ملاحظة على العدّ ────────────────────────────────────────────────────────
-- الحصتان تُحسبان **من بداية الاشتراك الحالي** لا من أول يوم بالعيادة، لأن
-- السؤال هو «كم يضيف خلال هذا الاشتراك». لذلك quota_start يُضبط مع كل تفعيل،
-- والتجديد يبدأ عدّاً جديداً — وإلا لصارت العيادة القديمة محرومة إلى الأبد.
--
-- null = بلا حد (وهو الافتراضي للجميع، فلا شيء ينكسر على العيادات القائمة).
-- ============================================================================

/* ---------------------------- ١) تسعير حيّ ------------------------------- */
create table if not exists plan_prices (
  plan        text primary key,
  monthly_usd numeric(10,2) not null,
  annual_usd  numeric(10,2) not null,
  updated_at  timestamptz not null default now()
);

-- القيم الحالية بالكود — تبقى هي المرجع حتى يغيّرها المشغّل.
insert into plan_prices (plan, monthly_usd, annual_usd) values
  ('basic',    30, 360),
  ('advanced', 55, 660),
  ('super',   100, 1000)
on conflict (plan) do nothing;

alter table plan_prices enable row level security;

-- الأسعار معلومة عامة (تظهر بصفحة الباقات) — القراءة للجميع، والكتابة عبر
-- الدالة المحروسة وحدها.
drop policy if exists plan_prices_select on plan_prices;
create policy plan_prices_select on plan_prices for select using (true);
grant select on plan_prices to anon, authenticated;

create or replace function admin_set_plan_price(p_plan text, p_monthly numeric, p_annual numeric)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_plan not in ('basic','advanced','super') then raise exception 'bad_plan'; end if;
  -- سعر صفري أو سالب يعني باقة مجانية بالغلط — نرفضه بالباب.
  if p_monthly is null or p_monthly <= 0 or p_annual is null or p_annual <= 0 then
    raise exception 'bad_price';
  end if;
  insert into plan_prices (plan, monthly_usd, annual_usd)
       values (p_plan, p_monthly, p_annual)
  on conflict (plan) do update
     set monthly_usd = excluded.monthly_usd,
         annual_usd  = excluded.annual_usd,
         updated_at  = now();
end $$;
revoke all on function admin_set_plan_price(text, numeric, numeric) from public, anon;
grant execute on function admin_set_plan_price(text, numeric, numeric) to authenticated;

/* ------------------------ ٢) الحصص على الاشتراك -------------------------- */
alter table subscriptions add column if not exists pet_limit   int;         -- null = بلا حد
alter table subscriptions add column if not exists wa_limit    int;         -- null = بلا حد
alter table subscriptions add column if not exists quota_start timestamptz; -- بداية عدّ الحصص

-- عدّ الحصص يمرّ على هذين الجدولين بنافذة زمنية — بلا فهرس يصير مسحاً كاملاً.
create index if not exists pets_clinic_created_idx on pets(clinic_id, created_at desc);
create index if not exists wa_messages_clinic_sent_idx on wa_messages(clinic_id, sent_at desc);

/* ------------------- ٣) تفعيل بالأيام مع حصص اختيارية -------------------- */
-- نفس منطق admin_activate_subscription: تجديد نفس الباقة يُراكم الأيام المتبقية،
-- وتبديل الباقة يبدأ من اليوم. الفرق أن الوحدة يوم لا شهر، ومعها الحصتان.
create or replace function admin_activate_days(
  p_email text, p_plan text, p_days int,
  p_pet_limit int default null, p_wa_limit int default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_clinic uuid; v_plan text; v_end timestamptz; v_base timestamptz;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_days is null or p_days < 1 then raise exception 'bad_days'; end if;
  if p_plan not in ('basic','advanced','super') then raise exception 'bad_plan'; end if;
  if p_pet_limit is not null and p_pet_limit < 0 then raise exception 'bad_pet_limit'; end if;
  if p_wa_limit  is not null and p_wa_limit  < 0 then raise exception 'bad_wa_limit'; end if;

  select id into v_clinic from auth.users where lower(email) = lower(p_email);
  if v_clinic is null then raise exception 'clinic_not_found'; end if;

  insert into subscriptions (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
  select plan, current_period_end into v_plan, v_end
    from subscriptions where clinic_id = v_clinic;

  if v_plan is not distinct from p_plan then
    v_base := greatest(coalesce(v_end, now()), now());
  else
    v_base := now();
  end if;

  update subscriptions
     set plan = p_plan,
         -- الوحدة يوم: نسمّي المدّة بأقرب توصيف بدل ما ندّعي شهرياً/سنوياً
         period = case when p_days >= 365 then 'annual' else 'monthly' end,
         current_period_end = v_base + make_interval(days => p_days),
         pet_limit = p_pet_limit,
         wa_limit  = p_wa_limit,
         quota_start = now(),   -- كل تفعيل يبدأ عدّاً جديداً
         was_subscriber = true,
         updated_at = now()
   where clinic_id = v_clinic;
end $$;
revoke all on function admin_activate_days(text, text, int, int, int) from public, anon;
grant execute on function admin_activate_days(text, text, int, int, int) to authenticated;

/** تعديل الحصص وحدها بلا لمس مدّة الاشتراك (رفع سقف لعيادة وصلت الحد). */
create or replace function admin_set_limits(p_email text, p_pet_limit int, p_wa_limit int)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_clinic uuid;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_pet_limit is not null and p_pet_limit < 0 then raise exception 'bad_pet_limit'; end if;
  if p_wa_limit  is not null and p_wa_limit  < 0 then raise exception 'bad_wa_limit'; end if;

  select id into v_clinic from auth.users where lower(email) = lower(p_email);
  if v_clinic is null then raise exception 'clinic_not_found'; end if;

  insert into subscriptions (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
  update subscriptions
     set pet_limit = p_pet_limit, wa_limit = p_wa_limit,
         quota_start = coalesce(quota_start, now()),
         updated_at = now()
   where clinic_id = v_clinic;
end $$;
revoke all on function admin_set_limits(text, int, int) from public, anon;
grant execute on function admin_set_limits(text, int, int) to authenticated;

/* --------------------- ٤) استهلاك الحصص للعيادة نفسها -------------------- */
-- تناديها العيادة عن نفسها (لا تأخذ معرّفاً) — تعرض العدّاد وتمنع التجاوز.
create or replace function clinic_quota_usage()
returns table (
  pet_limit int, pets_used int,
  wa_limit int, wa_used int,
  quota_start timestamptz
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select s.pet_limit,
         (select count(*)::int from pets p
           where p.clinic_id = auth_clinic()
             and p.created_at >= coalesce(s.quota_start, '-infinity'::timestamptz)),
         s.wa_limit,
         (select count(*)::int from wa_messages w
           where w.clinic_id = auth_clinic()
             and w.sent_at >= coalesce(s.quota_start, '-infinity'::timestamptz)),
         s.quota_start
  from subscriptions s
  where s.clinic_id = auth_clinic();
$$;
revoke all on function clinic_quota_usage() from public, anon;
grant execute on function clinic_quota_usage() to authenticated;

/* ----------------- ٥) فرض حدّ الحيوانات على مستوى القاعدة ------------------
 * الفحص بالواجهة وحده لا يكفي: من يصل الـAPI مباشرة يتجاوزه. الحدّ التجاري
 * لازم يُفرض حيث تُكتب البيانات فعلاً.
 *
 * (حدّ الواتساب لا يُفرض هنا بقصد: الإرسال يفتح wa.me بالمتصفح **قبل** أن
 *  يُسجَّل، فمنع السجل يوقف العدّاد لا الرسالة. مكان فرضه الوحيد المفيد هو
 *  الواجهة قبل فتح الرابط — وهذا ما نفعله هناك.)
 * ------------------------------------------------------------------------- */
create or replace function enforce_pet_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_limit int; v_start timestamptz; v_used int;
begin
  if new.clinic_id is null then return new; end if;
  select s.pet_limit, s.quota_start into v_limit, v_start
    from subscriptions s where s.clinic_id = new.clinic_id;
  if v_limit is null then return new; end if;  -- بلا حد

  select count(*) into v_used from pets p
   where p.clinic_id = new.clinic_id
     and p.created_at >= coalesce(v_start, '-infinity'::timestamptz);

  if v_used >= v_limit then
    -- رمز خاص تلتقطه الواجهة وتترجمه لرسالة عربية مفهومة.
    raise exception 'pet_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists pets_quota_guard on pets;
create trigger pets_quota_guard before insert on pets
  for each row execute function enforce_pet_limit();

/* ------------- ٦) لوحة المشغّل ترى الحصص مع بقية بيانات العيادة ---------- */
-- تبديل نوع الإرجاع يستوجب DROP قبل CREATE.
drop function if exists admin_list_subscriptions();

create function admin_list_subscriptions()
returns table (
  clinic_id uuid, clinic_name text, email text,
  plan text, period text, trial_ends_at timestamptz,
  current_period_end timestamptz, was_subscriber boolean, members int,
  cases int, cases_30 int, cases_7 int, patients int, invoices int,
  last_activity timestamptz,
  pet_limit int, pets_used int, wa_limit int, wa_used int
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  return query
  with ids as (
    select m.clinic_id  from memberships m
    union
    select s.clinic_id  from subscriptions s
    union
    select cp.clinic_id from clinic_prefs cp
  ),
  mc as (
    select m.clinic_id, count(*)::int as members from memberships m group by m.clinic_id
  ),
  vc as (
    select v.clinic_id,
           count(*)::int                                                          as cases,
           count(*) filter (where v.opened_at > now() - interval '30 days')::int  as cases_30,
           count(*) filter (where v.opened_at > now() - interval '7 days')::int   as cases_7,
           count(distinct v.pet_id)::int                                          as patients,
           max(v.opened_at)                                                       as last_case
    from clinic_visits v group by v.clinic_id
  ),
  ic as (
    select i.clinic_id, count(*)::int as invoices, max(i.created_at) as last_invoice
    from invoices i group by i.clinic_id
  )
  select ids.clinic_id,
         cp.clinic_name,
         u.email::text,
         s.plan, s.period, s.trial_ends_at, s.current_period_end,
         coalesce(s.was_subscriber, false),
         coalesce(mc.members, 0),
         coalesce(vc.cases, 0),
         coalesce(vc.cases_30, 0),
         coalesce(vc.cases_7, 0),
         coalesce(vc.patients, 0),
         coalesce(ic.invoices, 0),
         greatest(vc.last_case, ic.last_invoice),
         s.pet_limit,
         (select count(*)::int from pets p
           where p.clinic_id = ids.clinic_id
             and p.created_at >= coalesce(s.quota_start, '-infinity'::timestamptz)),
         s.wa_limit,
         (select count(*)::int from wa_messages w
           where w.clinic_id = ids.clinic_id
             and w.sent_at >= coalesce(s.quota_start, '-infinity'::timestamptz))
  from ids
  left join clinic_prefs   cp on cp.clinic_id = ids.clinic_id
  left join auth.users     u  on u.id         = ids.clinic_id
  left join subscriptions  s  on s.clinic_id  = ids.clinic_id
  left join mc                on mc.clinic_id = ids.clinic_id
  left join vc                on vc.clinic_id = ids.clinic_id
  left join ic                on ic.clinic_id = ids.clinic_id
  order by coalesce(vc.cases, 0) desc, cp.clinic_name nulls last;
end $$;

revoke all on function admin_list_subscriptions() from public, anon;
grant execute on function admin_list_subscriptions() to authenticated;
