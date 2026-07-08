-- ============================================================================
-- admin_list_subscriptions() — two fixes:
--
-- 1. "column reference \"clinic_id\" is ambiguous": the members subquery
--    selected an unqualified clinic_id, colliding with the RETURNS TABLE output
--    column of the same name. Every clinic_id is now table-qualified.
--
-- 2. Missing clinics: the list was built from `memberships` alone, so a clinic
--    with no staff rows (a solo owner, or a trial clinic we seeded with only a
--    subscriptions row) never appeared. Build the clinic universe from the UNION
--    of memberships ∪ subscriptions ∪ clinic_prefs so EVERY clinic shows,
--    regardless of which table it lives in. members falls back to 0.
--
-- Idempotent (CREATE OR REPLACE) — safe to run against an already-migrated DB.
-- ============================================================================
create or replace function admin_list_subscriptions()
returns table (
  clinic_id uuid, clinic_name text, email text,
  plan text, period text, trial_ends_at timestamptz,
  current_period_end timestamptz, was_subscriber boolean, members int
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
  )
  select ids.clinic_id,
         cp.clinic_name,
         u.email::text,
         s.plan, s.period, s.trial_ends_at, s.current_period_end,
         coalesce(s.was_subscriber, false),
         coalesce(mc.members, 0)
  from ids
  left join clinic_prefs   cp on cp.clinic_id = ids.clinic_id
  left join auth.users     u  on u.id         = ids.clinic_id
  left join subscriptions  s  on s.clinic_id  = ids.clinic_id
  left join mc                on mc.clinic_id = ids.clinic_id
  order by cp.clinic_name nulls last;
end $$;

revoke all on function admin_list_subscriptions() from public, anon;
grant execute on function admin_list_subscriptions() to authenticated;
