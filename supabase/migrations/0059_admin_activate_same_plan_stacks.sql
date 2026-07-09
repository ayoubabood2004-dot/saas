-- ============================================================================
-- Refine admin manual activation:
--   • SAME plan  → EXTEND (add months onto the remaining window) — a renewal of
--     the same tier accumulates its days.
--   • DIFFERENT plan (or expired) → SET from NOW — switching العادية → المطورة
--     reads a clean "365 days" instead of stacking two tiers.
--
-- Supersedes the "always SET" step in 0058. Idempotent (CREATE OR REPLACE).
-- ============================================================================
create or replace function admin_activate_subscription(p_email text, p_plan text, p_period text, p_months int)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_clinic uuid; v_plan text; v_end timestamptz; v_base timestamptz;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_months is null or p_months < 1 then raise exception 'bad_months'; end if;

  select id into v_clinic from auth.users where lower(email) = lower(p_email);
  if v_clinic is null then raise exception 'clinic_not_found'; end if;

  insert into subscriptions (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
  select plan, current_period_end into v_plan, v_end
    from subscriptions where clinic_id = v_clinic;

  -- Same plan → build on the remaining window (renewal); else start fresh today.
  if v_plan is not distinct from p_plan then
    v_base := greatest(coalesce(v_end, now()), now());
  else
    v_base := now();
  end if;

  update subscriptions
     set plan = p_plan, period = p_period,
         current_period_end = v_base + make_interval(months => p_months),
         was_subscriber = true, updated_at = now()
   where clinic_id = v_clinic;
end $$;
revoke all on function admin_activate_subscription(text, text, text, int) from public, anon;
grant execute on function admin_activate_subscription(text, text, text, int) to authenticated;
