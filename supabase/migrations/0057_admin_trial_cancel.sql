-- ============================================================================
-- doctorVet — 0057: two more platform-admin billing controls.
--
--   • admin_grant_trial(email, days)      → give / reset a free trial (full
--                                            access, no payment). Default 14d.
--   • admin_cancel_subscription(email)    → end the paid window NOW. A clinic
--                                            that paid before keeps READ-ONLY
--                                            access (was_subscriber stays true →
--                                            "expired"); one that never paid
--                                            falls back to its trial/lock state.
--
-- Both are SECURITY DEFINER and gated by is_platform_admin(), like the rest of
-- 0054. Additive & idempotent. Apply AFTER 0054.
-- ============================================================================

-- --- grant / reset a free trial ---------------------------------------------
create or replace function admin_grant_trial(p_email text, p_days int default 14)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_clinic uuid;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_days is null or p_days < 1 then raise exception 'bad_days'; end if;

  select id into v_clinic from auth.users where lower(email) = lower(p_email);
  if v_clinic is null then raise exception 'clinic_not_found'; end if;

  insert into subscriptions (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
  update subscriptions
     set plan = null, period = null,
         trial_ends_at = now() + make_interval(days => p_days),
         current_period_end = null,
         was_subscriber = false,
         updated_at = now()
   where clinic_id = v_clinic;
end $$;
revoke all on function admin_grant_trial(text, int) from public, anon;
grant execute on function admin_grant_trial(text, int) to authenticated;

-- --- cancel a subscription ---------------------------------------------------
create or replace function admin_cancel_subscription(p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_clinic uuid;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;

  select id into v_clinic from auth.users where lower(email) = lower(p_email);
  if v_clinic is null then raise exception 'clinic_not_found'; end if;

  update subscriptions
     set current_period_end = now(), updated_at = now()
   where clinic_id = v_clinic;
end $$;
revoke all on function admin_cancel_subscription(text) from public, anon;
grant execute on function admin_cancel_subscription(text) to authenticated;
