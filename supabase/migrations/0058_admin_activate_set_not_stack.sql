-- ============================================================================
-- Fix: admin manual activation stacked durations.
--
-- admin_activate_subscription extended current_period_end onto whatever window
-- was left, so activating العادية (365d) then المطورة (365d) showed "731 days".
-- For an OPERATOR setting a clinic's plan that's confusing — make it a clean
-- SET: the paid window becomes exactly p_months FROM NOW, and the plan is
-- whatever was chosen. (The Wayl webhook path keeps stacking so a paying
-- customer's early renewal never loses remaining days.)
--
-- Idempotent (CREATE OR REPLACE) — safe on an already-migrated DB.
-- ============================================================================
create or replace function admin_activate_subscription(p_email text, p_plan text, p_period text, p_months int)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_clinic uuid;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_months is null or p_months < 1 then raise exception 'bad_months'; end if;

  select id into v_clinic from auth.users where lower(email) = lower(p_email);
  if v_clinic is null then raise exception 'clinic_not_found'; end if;

  insert into subscriptions (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
  update subscriptions
     set plan = p_plan, period = p_period,
         current_period_end = now() + make_interval(months => p_months),
         was_subscriber = true, updated_at = now()
   where clinic_id = v_clinic;
end $$;
revoke all on function admin_activate_subscription(text, text, text, int) from public, anon;
grant execute on function admin_activate_subscription(text, text, text, int) to authenticated;
