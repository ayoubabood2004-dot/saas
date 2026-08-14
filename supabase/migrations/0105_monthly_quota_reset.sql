-- ============================================================================
-- 0105 — الحصص تتجدد **شهرياً** (نموذج نتفلكس)
--
-- 0104 جعلت العدّ من بداية الاشتراك حتى نهايته: اشتراك سنة بحد ٢٥ حيواناً يعني
-- ٢٥ للسنة كلها. المطلوب غير ذلك: ٢٥ **كل شهر**، يتصفّر مع كل شهر جديد،
-- وغير المستهلَك يسقط ولا يتراكم.
--
-- ── الفكرة: نافذة تُحسب ولا تُخزَّن ─────────────────────────────────────────
-- ما نكتب شيئاً ولا نمسح شيئاً. quota_start يبقى تاريخ بدء الاشتراك كما هو،
-- ونحسب بداية **الشهر الجاري** بدفع quota_start أماماً بعدد الأشهر المنقضية:
--
--     الشهر الجاري = quota_start + (الأشهر الكاملة المنقضية)
--
-- فلو بدأ الاشتراك ١٠ آذار، النوافذ هي ١٠ آذار → ١٠ نيسان → ١٠ أيار… ويتصفّر
-- العدّاد لحظة دخول كل نافذة، تلقائياً وبلا مهمة مجدولة ولا كتابة.
--
-- ⚠️ لا شيء يُحذف: الحيوانات تبقى، والرسائل المرسلة تبقى بسجلها، والتاريخ كله
-- محفوظ. الذي «يتصفّر» هو العدّاد فقط — أي أننا نعدّ ما أُضيف داخل نافذة
-- الشهر الجاري لا ما أُضيف منذ الأزل.
--
-- وحساب الأشهر بـage() لا بقسمة الأيام: الأشهر تختلف أطوالها (٢٨…٣١)، وقسمة
-- الأيام تزحزح تاريخ التجديد شيئاً فشيئاً حتى يصير بيوم مختلف كلياً.
-- ============================================================================

/** بداية نافذة الشهر الجاري لعيادة بدأ اشتراكها في p_start. */
create or replace function quota_period_start(p_start timestamptz)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_start is null then '-infinity'::timestamptz
    when p_start > now() then p_start   -- اشتراك مستقبلي: النافذة ما بدأت بعد
    else p_start + make_interval(months => greatest(0,
      (extract(year from age(now(), p_start)) * 12 + extract(month from age(now(), p_start)))::int))
  end;
$$;

/** نهاية النافذة = بداية الشهر التالي — تعرضها الواجهة كـ«يتجدد بتاريخ …». */
create or replace function quota_period_end(p_start timestamptz)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_start is null then null
    else quota_period_start(p_start) + interval '1 month'
  end;
$$;

grant execute on function quota_period_start(timestamptz) to authenticated;
grant execute on function quota_period_end(timestamptz) to authenticated;

/* ------------------- استهلاك العيادة داخل الشهر الجاري ------------------- */
drop function if exists clinic_quota_usage();

create function clinic_quota_usage()
returns table (
  pet_limit int, pets_used int,
  wa_limit int, wa_used int,
  quota_start timestamptz,      -- بداية الاشتراك (ثابتة)
  period_start timestamptz,     -- بداية شهر الحصة الجاري
  period_end timestamptz        -- متى يتصفّر العدّاد
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select s.pet_limit,
         (select count(*)::int from pets p
           where p.clinic_id = auth_clinic()
             and p.created_at >= quota_period_start(s.quota_start)),
         s.wa_limit,
         (select count(*)::int from wa_messages w
           where w.clinic_id = auth_clinic()
             and w.sent_at >= quota_period_start(s.quota_start)),
         s.quota_start,
         quota_period_start(s.quota_start),
         quota_period_end(s.quota_start)
  from subscriptions s
  where s.clinic_id = auth_clinic();
$$;
revoke all on function clinic_quota_usage() from public, anon;
grant execute on function clinic_quota_usage() to authenticated;

/* ------------ الفرض بالقاعدة يتبع نفس النافذة الشهرية بالضبط ------------- */
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
  if v_limit is null then return new; end if;

  select count(*) into v_used from pets p
   where p.clinic_id = new.clinic_id
     and p.created_at >= quota_period_start(v_start);

  if v_used >= v_limit then
    raise exception 'pet_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

/* --------- لوحة المشغّل ترى استهلاك الشهر الجاري لا استهلاك الدهر --------- */
drop function if exists admin_list_subscriptions();

create function admin_list_subscriptions()
returns table (
  clinic_id uuid, clinic_name text, email text,
  plan text, period text, trial_ends_at timestamptz,
  current_period_end timestamptz, was_subscriber boolean, members int,
  cases int, cases_30 int, cases_7 int, patients int, invoices int,
  last_activity timestamptz,
  pet_limit int, pets_used int, wa_limit int, wa_used int,
  quota_period_end timestamptz
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
             and p.created_at >= quota_period_start(s.quota_start)),
         s.wa_limit,
         (select count(*)::int from wa_messages w
           where w.clinic_id = ids.clinic_id
             and w.sent_at >= quota_period_start(s.quota_start)),
         quota_period_end(s.quota_start)
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
