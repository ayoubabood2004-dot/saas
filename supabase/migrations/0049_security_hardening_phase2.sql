-- ============================================================================
-- doctorVet — 0049: Security hardening — Phase 2 (RLS write-scope fixes).
--
-- Closes four issues found in the full security review. All are WRITE-side RLS
-- gaps where a WITH CHECK constrained the row but not the columns / a foreign
-- id, letting an authenticated caller (with the public anon key) escalate or
-- pollute another tenant. Additive, idempotent, and behaviour-preserving for
-- the app (which only ever writes the allowed columns / uses the definer RPCs).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) profiles: a user could self-UPDATE their own `role` to 'admin'/'doctor'
--    (the `for all ... with check (id = auth.uid())` policy pinned the row but
--    not the columns). That flipped is_clinic_staff() → true and unlocked the
--    cross-clinic shared-pet read. Split the blanket policy so name/phone/city
--    stay editable but role / roles / clinic_id / email are frozen to their
--    current values on any self-update.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_self on profiles;

create policy profiles_self_select on profiles
  for select using (id = auth.uid());

create policy profiles_self_insert on profiles
  for insert with check (id = auth.uid());

create policy profiles_self_delete on profiles
  for delete using (id = auth.uid());

create policy profiles_self_update on profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role      is not distinct from (select p.role      from profiles p where p.id = auth.uid())
    and roles     is not distinct from (select p.roles     from profiles p where p.id = auth.uid())
    and clinic_id is not distinct from (select p.clinic_id from profiles p where p.id = auth.uid())
    and email     is not distinct from (select p.email     from profiles p where p.id = auth.uid())
  );

-- Extra depth: derive "is staff" from a real membership, not the self-set
-- profiles.role, so a frozen-but-legacy bad value can't grant staff reads.
-- (A legacy clinic account was backfilled a manager membership in 0016; pet
--  owners have none — so this matches today's intended behaviour.)
create or replace function is_clinic_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.status = 'active'
  ) or exists (
    -- Preserve access for brand-new clinic accounts that signed up as a clinic
    -- but have not been given a membership row yet (auth_role_base() = manager
    -- only via the legacy fallback ⇒ they own their own clinic).
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('doctor','reception','admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2) memberships: the manager policy's WITH CHECK pinned clinic_id + role but
--    NOT user_id, so any user (a manager of their own clinic by default) could
--    INSERT a row for an ARBITRARY user_id — pulling a victim into their clinic
--    and hijacking the victim's auth_clinic(). Legitimate joins never insert
--    directly from the client; they go through the SECURITY DEFINER
--    accept_invite() RPC (which bypasses RLS). So drop client INSERT entirely
--    and keep only manager UPDATE / DELETE within the own clinic.
-- ---------------------------------------------------------------------------
drop policy if exists memberships_manager_all on memberships;

create policy memberships_manager_update on memberships
  for update
  using      (clinic_id = auth_clinic() and auth_role() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role() = 'manager');

create policy memberships_manager_delete on memberships
  for delete
  using (clinic_id = auth_clinic() and auth_role() = 'manager');

-- ---------------------------------------------------------------------------
-- 3) login_events: INSERT check pinned only user_id, so a caller could stamp a
--    row with ANOTHER clinic's clinic_id and pollute that clinic's sign-in
--    trail. Pin the clinic to the caller's own.
-- ---------------------------------------------------------------------------
drop policy if exists login_events_insert on login_events;
create policy login_events_insert on login_events
  for insert to authenticated
  with check (user_id = auth.uid() and clinic_id = auth_clinic());

-- ---------------------------------------------------------------------------
-- 4) clinics: the table never had RLS enabled — world-readable to anon +
--    authenticated. It is vestigial (the app keys tenancy off profiles /
--    memberships and never queries it), but lock it down regardless.
-- ---------------------------------------------------------------------------
alter table clinics enable row level security;
drop policy if exists clinics_self on clinics;
create policy clinics_self on clinics
  for select using (id = auth_clinic());

-- ---------------------------------------------------------------------------
-- 5) Manager-Override PIN (0048): the lockout reset failed_count to 0 after
--    every 5-try lock, so an attacker got 5 guesses / 5 min forever. Make the
--    lockout ESCALATE (5 → 10 → 20 … min, capped 24h) and only reset the
--    counter on a correct PIN, so sustained guessing becomes impractical.
-- ---------------------------------------------------------------------------
create or replace function elevate_with_pin(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c uuid := auth_clinic();
  r clinic_pins%rowtype;
  u timestamptz;
  new_fail int;
  lock_mins int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;

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
    -- Counter grows monotonically; every 5th miss triggers an escalating lock.
    new_fail := coalesce(r.failed_count, 0) + 1;
    lock_mins := 5 * (2 ^ least(9, new_fail / 5 - 1))::int; -- 5,10,20,… capped
    update clinic_pins set
      failed_count = new_fail,
      locked_until = case when new_fail % 5 = 0
                          then now() + make_interval(mins => least(1440, lock_mins))
                          else locked_until end
    where clinic_id = c;
    begin
      insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
      values (c, auth.uid(), 'CLIENT', 'client', null, jsonb_build_object('event', 'override.fail'));
    exception when others then null;
    end;
    return jsonb_build_object('ok', false, 'reason', 'wrong',
                              'remaining', greatest(0, 4 - (new_fail % 5)));
  end if;
end $$;
