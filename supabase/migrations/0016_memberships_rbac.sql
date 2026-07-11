-- ============================================================================
-- doctorVet — 0016: memberships + server-side RBAC foundation.
--
-- The world-class multi-tenant pattern: separate the CLINIC (organization) from
-- the USER, linked by a membership that carries the role. This is the base for
-- real per-staff logins + server-enforced permissions + audit.
--
-- 100% BACKWARD-COMPATIBLE & SAFE:
--   • Adds a new table + helper functions only — touches NO existing data.
--   • auth_clinic() keeps returning the SAME value for today's clinic accounts,
--     thanks to a coalesce() fallback + a backfill that makes each existing
--     clinic a 'manager' of its own clinic (clinic_id = its own auth id).
--   • If memberships is empty for a user, everything behaves exactly as before.
--
-- Idempotent. Apply AFTER 0001–0015 (Supabase → SQL Editor → Run).
-- ============================================================================

-- 1) MEMBERSHIPS — who belongs to which clinic, and with what role.
create table if not exists memberships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  clinic_id  uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'receptionist'
             check (role in ('manager','veterinarian','receptionist','groomer')),
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  primary key (user_id, clinic_id)
);
create index if not exists memberships_clinic_idx on memberships(clinic_id);

-- 2) TENANCY + ROLE HELPERS (security definer → they bypass RLS internally, so
--    reading memberships here never recurses into the policies below).
create or replace function auth_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select clinic_id from memberships
       where user_id = auth.uid() and status = 'active'
       order by created_at limit 1),
    auth.uid()  -- legacy single-account clinics keep working unchanged
  );
$$;

create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from memberships
       where user_id = auth.uid() and status = 'active'
       order by created_at limit 1),
    'manager'  -- legacy single-account clinics behave as full-access managers
  );
$$;

-- Server-enforced capability check — the single source of truth for RBAC.
create or replace function has_permission(cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select case auth_role()
    when 'manager'      then true
    when 'veterinarian' then cap in ('viewCalendar','addPets','editMedical','processSales','manageInventory')
    when 'receptionist' then cap in ('viewCalendar','addPets','processSales')
    when 'groomer'      then cap in ('viewCalendar','addPets')
    else false
  end;
$$;

grant execute on function auth_clinic(), auth_role(), has_permission(text) to authenticated, anon;

-- 3) BACKFILL — every existing CLINIC account becomes a manager of its own clinic
--    (clinic_id = its own auth id) so auth_clinic() returns the SAME value as today.
insert into memberships (user_id, clinic_id, role)
select p.id, p.id, 'manager'
from profiles p
where p.role in ('admin','doctor','reception')
   or 'clinic' = any (coalesce(p.roles, '{}'))
on conflict (user_id, clinic_id) do nothing;

-- 4) RLS for memberships.
alter table memberships enable row level security;
drop policy if exists memberships_self_read on memberships;
create policy memberships_self_read on memberships for select
  using (user_id = auth.uid());
drop policy if exists memberships_manager_all on memberships;
create policy memberships_manager_all on memberships for all
  using (clinic_id = auth_clinic() and auth_role() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role() = 'manager');

-- ============================================================================
-- VERIFY (after applying): your clinic id must be UNCHANGED, role = manager.
--   select auth_clinic() as my_clinic, auth_role() as my_role;
--   select * from memberships where user_id = auth.uid();
-- Existing data visibility is identical to before this migration.
-- ============================================================================
