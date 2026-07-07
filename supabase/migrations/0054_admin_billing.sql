-- ============================================================================
-- doctorVet — 0054: platform-admin billing controls.
--
-- The platform operator (you) needs to: activate a clinic that paid in CASH,
-- and adjust the USD→IQD rate as the market moves. Both are privileged
-- cross-tenant actions, so they are SECURITY DEFINER RPCs gated by
-- is_platform_admin() — a caller is an admin only if their signed-in email is
-- in the allow-list below. Edit that list to add/rotate operators.
--
-- app_config holds the live USD rate so the Wayl create-link function can read
-- it (no re-deploy needed when the rate changes).
--
-- Additive & idempotent. Apply AFTER 0053.
-- ============================================================================

-- --- who is a platform admin -------------------------------------------------
create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  -- Allow-list of operator emails. EDIT THIS to your own account(s).
  select coalesce(lower(auth.jwt() ->> 'email') in (
    'ayoubabood2004@gmail.com'
  ), false);
$$;
revoke all on function is_platform_admin() from anon;
grant execute on function is_platform_admin() to authenticated;

-- --- live app config (USD rate…) --------------------------------------------
create table if not exists app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into app_config (key, value) values ('usd_rate', '1535')
  on conflict (key) do nothing;

alter table app_config enable row level security;
-- Any signed-in user may READ config (the rate is shown on the pricing page).
drop policy if exists app_config_select on app_config;
create policy app_config_select on app_config
  for select using (auth.uid() is not null);
-- No client writes — only set_usd_rate() (admin-gated) mutates it.

create or replace function set_usd_rate(p_rate numeric)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_rate is null or p_rate < 100 then raise exception 'bad_rate'; end if;
  insert into app_config (key, value, updated_at) values ('usd_rate', p_rate::text, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
revoke all on function set_usd_rate(numeric) from anon;
grant execute on function set_usd_rate(numeric) to authenticated;

-- --- manual (cash) activation ------------------------------------------------
-- Activate a clinic that paid outside Wayl. Resolves the clinic by owner email,
-- then extends its paid window exactly like the webhook path does. Admin-only.
create or replace function admin_activate_subscription(p_email text, p_plan text, p_period text, p_months int)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_clinic uuid; base timestamptz;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_months is null or p_months < 1 then raise exception 'bad_months'; end if;

  select id into v_clinic from auth.users where lower(email) = lower(p_email);
  if v_clinic is null then raise exception 'clinic_not_found'; end if;

  insert into subscriptions (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
  select greatest(coalesce(current_period_end, now()), now()) into base
    from subscriptions where clinic_id = v_clinic;
  update subscriptions
     set plan = p_plan, period = p_period,
         current_period_end = base + make_interval(months => p_months),
         was_subscriber = true, updated_at = now()
   where clinic_id = v_clinic;
end $$;
revoke all on function admin_activate_subscription(text, text, text, int) from anon;
grant execute on function admin_activate_subscription(text, text, text, int) to authenticated;
