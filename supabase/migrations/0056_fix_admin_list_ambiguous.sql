-- ============================================================================
-- Fix: admin_list_subscriptions() raised
--   "column reference \"clinic_id\" is ambiguous"
-- The members subquery selected an unqualified `clinic_id`, which collided with
-- the function's RETURNS TABLE output column of the same name. Qualify it with
-- the `memberships` alias so Postgres reads it as the column, not the OUT var.
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
  select c.clinic_id,
         cp.clinic_name,
         u.email::text,
         s.plan, s.period, s.trial_ends_at, s.current_period_end,
         coalesce(s.was_subscriber, false),
         c.members
  from (select m.clinic_id, count(*)::int as members from memberships m group by m.clinic_id) c
  left join clinic_prefs   cp on cp.clinic_id = c.clinic_id
  left join auth.users     u  on u.id         = c.clinic_id
  left join subscriptions  s  on s.clinic_id  = c.clinic_id
  order by cp.clinic_name nulls last;
end $$;

revoke all on function admin_list_subscriptions() from public, anon;
grant execute on function admin_list_subscriptions() to authenticated;
