-- ============================================================================
-- doctorVet — 0048: Manager Override (وضع المدير برمز سري)
--
-- One 4-digit clinic PIN, verified SERVER-SIDE, temporarily elevates the
-- signed-in staff account to manager for 10 minutes:
--   · clinic_pins        — the bcrypt-hashed PIN + brute-force lockout state.
--                          NO client access at all (RLS with zero policies);
--                          only the SECURITY DEFINER RPCs below touch it.
--   · staff_elevations   — who is elevated and until when.
--   · auth_role()        — now returns 'manager' while a fresh elevation row
--                          exists, so every RLS policy and has_permission()
--                          check honours the elevation automatically.
--   · set_override_pin   — managers only (REAL role, elevation doesn't count).
--   · elevate_with_pin   — verifies the PIN; 5 wrong tries → 5-minute lockout;
--                          every success/failure lands in the activity log.
--   · end_elevation      — instant re-lock.
--
-- The feature is opt-in per clinic: clinic_prefs.override_enabled (default
-- false) merely SHOWS the unlock icon — all enforcement lives in the RPCs.
-- Additive + idempotent; safe on any existing database.
-- ============================================================================

create extension if not exists pgcrypto;

-- Opt-in flag, hydrated with the other clinic prefs.
alter table clinic_prefs
  add column if not exists override_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- The PIN itself. RLS enabled with NO policies = invisible to every client;
-- only the definer functions (owned by postgres) can read or write it.
-- ---------------------------------------------------------------------------
create table if not exists clinic_pins (
  clinic_id    uuid primary key default auth_clinic(),
  pin_hash     text not null,
  failed_count int  not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table clinic_pins enable row level security;

-- ---------------------------------------------------------------------------
-- Active elevations. Also client-invisible; the RPC returns the expiry.
-- ---------------------------------------------------------------------------
create table if not exists staff_elevations (
  user_id   uuid primary key,
  clinic_id uuid not null,
  until     timestamptz not null
);
alter table staff_elevations enable row level security;

-- ---------------------------------------------------------------------------
-- Role plumbing: auth_role_base() = the real membership role (0016 logic);
-- auth_role() = elevation-aware. Every existing policy calls auth_role(), so
-- elevation "just works" everywhere (activity log, reports RLS, …).
-- ---------------------------------------------------------------------------
create or replace function auth_role_base() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from memberships
       where user_id = auth.uid() and status = 'active'
       order by created_at limit 1),
    'manager'  -- legacy single-account clinics behave as full-access managers
  );
$$;

create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from staff_elevations
                 where user_id = auth.uid() and until > now()) then 'manager'
    else auth_role_base()
  end;
$$;

grant execute on function auth_role_base(), auth_role() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Set / change the clinic PIN — REAL managers only. A temporarily elevated
-- receptionist must never be able to change the key that elevated them.
-- ---------------------------------------------------------------------------
create or replace function set_override_pin(p_pin text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if auth_role_base() <> 'manager' then raise exception 'managers only'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN must be exactly 4 digits'; end if;
  insert into clinic_pins (clinic_id, pin_hash, failed_count, locked_until, updated_at)
  values (auth_clinic(), crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (clinic_id) do update
    set pin_hash = excluded.pin_hash, failed_count = 0, locked_until = null, updated_at = now();
end $$;

-- Does the clinic have a PIN yet? (drives the Settings UI copy)
create or replace function has_override_pin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clinic_pins where clinic_id = auth_clinic());
$$;

-- ---------------------------------------------------------------------------
-- Verify the PIN and elevate for 10 minutes.
-- Returns jsonb: {ok:true, until} | {ok:false, reason:'wrong'|'locked'|'no_pin', ...}
-- ---------------------------------------------------------------------------
create or replace function elevate_with_pin(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c uuid := auth_clinic();
  r clinic_pins%rowtype;
  u timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;

  -- housekeeping: drop long-expired elevation rows
  delete from staff_elevations where until < now() - interval '1 day';

  select * into r from clinic_pins where clinic_id = c;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;

  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', r.locked_until);
  end if;

  if r.pin_hash = crypt(p_pin, r.pin_hash) then
    update clinic_pins set failed_count = 0, locked_until = null where clinic_id = c;
    u := now() + interval '10 minutes';
    insert into staff_elevations (user_id, clinic_id, until) values (auth.uid(), c, u)
      on conflict (user_id) do update set until = excluded.until, clinic_id = excluded.clinic_id;
    begin
      insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
      values (c, auth.uid(), 'CLIENT', 'client', null, jsonb_build_object('event', 'override.unlock'));
    exception when others then null;
    end;
    return jsonb_build_object('ok', true, 'until', u);
  else
    update clinic_pins set
      failed_count = case when failed_count + 1 >= 5 then 0 else failed_count + 1 end,
      locked_until = case when failed_count + 1 >= 5 then now() + interval '5 minutes' else locked_until end
    where clinic_id = c;
    begin
      insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
      values (c, auth.uid(), 'CLIENT', 'client', null, jsonb_build_object('event', 'override.fail'));
    exception when others then null;
    end;
    return jsonb_build_object('ok', false, 'reason', 'wrong',
                              'remaining', greatest(0, 4 - r.failed_count));
  end if;
end $$;

-- Instant manual re-lock.
create or replace function end_elevation() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from staff_elevations where user_id = auth.uid();
  begin
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (auth_clinic(), auth.uid(), 'CLIENT', 'client', null, jsonb_build_object('event', 'override.lock'));
  exception when others then null;
  end;
end $$;

grant execute on function set_override_pin(text), has_override_pin(),
  elevate_with_pin(text), end_elevation() to authenticated;
