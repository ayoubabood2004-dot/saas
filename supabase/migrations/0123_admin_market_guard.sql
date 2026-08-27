-- ============================================================================
-- doctorVet — 0123: سدّ تسريبٍ عبر العيادات في دالّتَي رؤى السوق (0106)
--
-- ── الثغرة ────────────────────────────────────────────────────────────────
-- `admin_clinic_volumes` و`admin_market_monthly` أُنشئتا `security definer`
-- ومُنحتا لكل مستخدمٍ مسجَّل (`authenticated`)، **بلا حارس مدير المنصّة**.
-- والأولى تُرجع لكل عيادةٍ على حدة: اسمها، **إيميل صاحبها**، باقتها،
-- **إيرادها**، ونشاطها؛ والثانية تُرجع إيراد المنصّة كلّها شهراً بشهر. فأيُّ
-- مستخدمٍ — ولو بحسابِ تجربةٍ مجانية — كان يستطيع استدعاءهما مباشرةً بمفتاح
-- anon العلني وسحبَ قاعدة العملاء بإيميلاتهم وأرقام مبيعاتهم. تجاوزٌ كامل
-- لعزل العيادات (RLS bypass) من أخطر أصناف ثغرات `security definer`.
--
-- الجارُ الآمن في نفس العائلة (`landing_funnel`, 0114) يحمل `where
-- is_platform_admin()`، والحارس نفسه (0054) قائمٌ ويُطلق `not_admin`. هاتان
-- وحدهما نُسي فيهما الحارس.
--
-- ── الإصلاح ───────────────────────────────────────────────────────────────
-- تُعاد كتابتهما بلغة plpgsql بحارسٍ يسبق أيّ استعلام — نفس نمط 0054/0101 —
-- فمن ليس مدير منصّةٍ يُرفَض قبل أن يُقرأ صفٌّ واحد. الاستعلام نفسه لم يتغيّر
-- حرفاً، فالمخرجات للمدير تبقى كما كانت تماماً؛ ما تغيّر هو **من يُسمح له**.
--
-- إضافيّة وقابلة لإعادة التشغيل. تُطبَّق بعد 0106 و0114.
-- ============================================================================

create or replace function admin_clinic_volumes(p_days int default 30)
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
           where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)),
         (select count(*)::int from wa_messages w
           where w.clinic_id = ids.clinic_id and w.sent_at >= (select t0 from win)),
         (select coalesce(sum(i.total), 0) from invoices i
           where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)),
         (select count(distinct d)::int from (
            select date_trunc('day', p.created_at) d from pets p
              where p.clinic_id = ids.clinic_id and p.created_at >= (select t0 from win)
            union
            select date_trunc('day', v.opened_at) from clinic_visits v
              where v.clinic_id = ids.clinic_id and v.opened_at >= (select t0 from win)
            union
            select date_trunc('day', i.created_at) from invoices i
              where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)
          ) days),
         (select min(x) from (
            select min(p.created_at) x from pets p where p.clinic_id = ids.clinic_id
            union all
            select min(v.opened_at) from clinic_visits v where v.clinic_id = ids.clinic_id
            union all
            select min(i.created_at) from invoices i where i.clinic_id = ids.clinic_id
          ) f)
  from ids
  left join clinic_prefs  cp on cp.clinic_id = ids.clinic_id
  left join auth.users    u  on u.id         = ids.clinic_id
  left join subscriptions s  on s.clinic_id  = ids.clinic_id;
end $$;

create or replace function admin_market_monthly(p_months int default 6)
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
            union select i.clinic_id from invoices i where i.created_at >= b.m0 and i.created_at < b.m1
          ) act),
         (select count(*)::int from pets p where p.created_at >= b.m0 and p.created_at < b.m1),
         (select count(*)::int from clinic_visits v where v.opened_at >= b.m0 and v.opened_at < b.m1),
         (select count(*)::int from invoices i where i.created_at >= b.m0 and i.created_at < b.m1),
         (select count(*)::int from wa_messages w where w.sent_at >= b.m0 and w.sent_at < b.m1),
         (select coalesce(sum(i.total), 0) from invoices i where i.created_at >= b.m0 and i.created_at < b.m1)
  from b
  order by b.m0;
end $$;

revoke all on function admin_clinic_volumes(int) from public, anon;
revoke all on function admin_market_monthly(int) from public, anon;
grant execute on function admin_clinic_volumes(int) to authenticated;
grant execute on function admin_market_monthly(int) to authenticated;
