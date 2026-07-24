-- ============================================================================
-- doctorVet — 0072: staff integrity + live presence (إدارة الكادر).
--
-- Fixes three field-reported problems and one latent RBAC hole:
--
--  (1) STUCK ACCOUNTS ("علك" بين الدخول والمغادرة): the client used to derive
--      "am I staff of another clinic?" from its OWN query, which can disagree
--      with what auth_clinic() (the RLS truth) resolves — leaving an account
--      that LOOKS inside a clinic while its writes go elsewhere, or vice versa.
--      → new my_workspace() RPC exposes the server's own resolution so the app
--        always mirrors exactly what RLS enforces.
--
--  (2) REMOVING A STAFF MEMBER didn't remove access: deleting the roster (staff)
--      row left the memberships row ACTIVE — the "removed" employee kept full
--      access to the clinic forever.
--      → new remove_staff_member() RPC atomically revokes the membership, burns
--        the invite code, and deletes the roster row.
--
--  (3) leave_clinic() removed the membership but left the roster row — the
--      departed employee stayed listed in إدارة الكادر.
--      → leave_clinic() now cleans both.
--
--  (4) LATENT RBAC HOLE: auth_role_base() picked the OLDEST active membership
--      across ALL clinics. A doctor who owns his own clinic (self-membership,
--      role 'manager') and later joins another clinic as 'veterinarian' was
--      treated as MANAGER inside the joined clinic. Role now comes from the
--      membership of the ACTIVE workspace (auth_clinic()) only.
--
--  (+) staff_presence: a tiny heartbeat table so إدارة الكادر can show who has
--      the system open RIGHT NOW (متصل الآن / آخر ظهور).
--
-- Additive + idempotent — safe on any existing database.
-- ============================================================================

-- (4) Role follows the ACTIVE workspace's membership -------------------------
create or replace function auth_role_base() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from memberships
       where user_id = auth.uid() and status = 'active' and clinic_id = auth_clinic()
       limit 1),
    'manager'  -- legacy single-account clinics behave as full-access managers
  );
$$;

-- (1) The server's own workspace resolution — the client mirrors THIS ---------
create or replace function my_workspace() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'clinic_id', auth_clinic(),
    'role',      auth_role_base(),
    'is_staff',  auth_clinic() is distinct from auth.uid()
  );
$$;
grant execute on function my_workspace() to authenticated;

-- (2) Atomic staff removal: membership + invite + roster, in one call ---------
create or replace function remove_staff_member(p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row      staff;
  v_removed  int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if auth_role_base() <> 'manager' then
    return jsonb_build_object('ok', false, 'error', 'not_manager');
  end if;
  select * into v_row from staff where id = p_staff and clinic_id = auth_clinic();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- The clinic owner's own roster row is untouchable — the clinic IS this user.
  if v_row.user_id is not null and v_row.user_id = auth_clinic() then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;
  -- Revoke ACCESS first (the part the old client-side delete forgot).
  if v_row.user_id is not null then
    delete from memberships
     where user_id = v_row.user_id and clinic_id = auth_clinic();
    get diagnostics v_removed = row_count;
  end if;
  -- Burn the invite so the same code can't be used to walk back in.
  if v_row.invite_code is not null then
    update invites set status = 'revoked'
     where clinic_id = auth_clinic() and code = v_row.invite_code and status <> 'revoked';
  end if;
  delete from staff where id = p_staff;
  return jsonb_build_object('ok', true, 'memberships_removed', v_removed);
end $$;
grant execute on function remove_staff_member(uuid) to authenticated;

-- (3) Leaving a clinic clears the roster row too ------------------------------
create or replace function leave_clinic(p_clinic uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  delete from staff
   where user_id = auth.uid()
     and clinic_id <> auth.uid()
     and (p_clinic is null or clinic_id = p_clinic);
  delete from memberships
   where user_id = auth.uid()
     and clinic_id <> auth.uid()
     and (p_clinic is null or clinic_id = p_clinic);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function leave_clinic(uuid) to authenticated;

-- (+) Live presence (منو فاتح السستم الآن) ------------------------------------
create table if not exists staff_presence (
  clinic_id  uuid not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text,
  role       text,
  last_seen  timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

create index if not exists staff_presence_clinic_idx on staff_presence(clinic_id, last_seen desc);

alter table staff_presence enable row level security;
drop policy if exists staff_presence_select on staff_presence;
create policy staff_presence_select on staff_presence
  for select using (clinic_id = auth_clinic());
-- Writes ONLY via the definer heartbeat below — a client cannot forge another
-- user's presence.

create or replace function presence_beat(p_name text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into staff_presence (clinic_id, user_id, name, role, last_seen)
  values (auth_clinic(), auth.uid(), p_name, auth_role_base(), now())
  on conflict (clinic_id, user_id) do update
    set last_seen = now(),
        name = coalesce(excluded.name, staff_presence.name),
        role = excluded.role;
end $$;
grant execute on function presence_beat(text) to authenticated;
