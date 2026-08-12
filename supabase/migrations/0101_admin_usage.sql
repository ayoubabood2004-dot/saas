-- ============================================================================
-- 0101 — استعمال كل عيادة بلوحة المنصّة (كم حالة فتحت فعلاً؟)
--
-- لوحة المشغّل كانت تعرض الاشتراك وعدد الكادر فقط — وهذا لا يقول شيئاً عن
-- الشيء الوحيد المهم: هل العيادة **تستعمل** النظام أصلاً؟ عيادة مشتركة بلا
-- حالة واحدة منذ شهر هي عيادة على وشك الانسحاب، وعيادة تفتح ٤٠ حالة بالأسبوع
-- هي حالة نجاح تُدرَس ويُبنى عليها.
--
-- admin_list_subscriptions() صار يرجّع معها أرقام الاستعمال:
--   cases         — كل الحالات (clinic_visits) منذ اليوم الأول
--   cases_30/7    — المفتوحة بآخر ٣٠ و٧ أيام (إشارة الحياة، لا الأرشيف)
--   patients      — المرضى الفعليون: pet_id مميّز داخل حالات العيادة
--                   (جدول pets ملك المالك ومشترَك بين العيادات، فلا clinic_id
--                    فيه — العدّ الصحيح يمرّ من الحالات)
--   invoices      — عدد فواتير البيع
--   last_activity — آخر نبض: أحدث حالة أو أحدث فاتورة
--
-- تغيير نوع الإرجاع يستوجب DROP قبل CREATE (بوستكرس لا يسمح بتبديل أعمدة
-- RETURNS TABLE عبر CREATE OR REPLACE). الهجرة تبقى قابلة لإعادة التشغيل.
-- ============================================================================

-- عدّ الحالات بنافذة زمنية لكل عيادة: فهرس مركّب حتى ما تصير مسحاً كاملاً
-- للجدول كل ما فتح المشغّل اللوحة.
create index if not exists clinic_visits_clinic_opened_idx
  on clinic_visits(clinic_id, opened_at desc);
create index if not exists invoices_clinic_created_idx
  on invoices(clinic_id, created_at desc);

drop function if exists admin_list_subscriptions();

create function admin_list_subscriptions()
returns table (
  clinic_id uuid, clinic_name text, email text,
  plan text, period text, trial_ends_at timestamptz,
  current_period_end timestamptz, was_subscriber boolean, members int,
  cases int, cases_30 int, cases_7 int, patients int, invoices int,
  last_activity timestamptz
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
           count(*)::int                                                              as cases,
           count(*) filter (where v.opened_at > now() - interval '30 days')::int      as cases_30,
           count(*) filter (where v.opened_at > now() - interval '7 days')::int       as cases_7,
           count(distinct v.pet_id)::int                                              as patients,
           max(v.opened_at)                                                           as last_case
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
         greatest(vc.last_case, ic.last_invoice)
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
